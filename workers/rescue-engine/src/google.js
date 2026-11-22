// Google APIs from a Cloudflare Worker without SDKs (all free-tier):
//   accessToken      service-account OAuth token (cached per isolate)
//   verifyIdToken    checks a Firebase Auth ID token (RS256, Google JWKs)
//   authClient       admin.auth()-like getUserByEmail via Identity Toolkit
//   storageClient    admin.storage()-like bucket().file().exists/getSignedUrl
// The service account JSON comes from the GOOGLE_SERVICE_ACCOUNT secret.

const enc = new TextEncoder();
const b64url = (buf) => {
  let b = ''; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
  return btoa(b).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};
const b64urlJson = (o) => b64url(enc.encode(JSON.stringify(o)));
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
function pemToBuf(pem) {
  const bin = atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}
async function signingKey(sa) {
  return crypto.subtle.importKey('pkcs8', pemToBuf(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

let tokenCache = { value: null, until: 0, email: null };
async function accessToken(sa, { fetchImpl = fetch } = {}) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.value && tokenCache.email === sa.client_email && tokenCache.until > now + 120) return tokenCache.value;
  const unsigned = `${b64urlJson({ alg: 'RS256', typ: 'JWT' })}.${b64urlJson({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await signingKey(sa), enc.encode(unsigned));
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${unsigned}.${b64url(sig)}`,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`Service account token failed (${res.status})`);
  tokenCache = { value: json.access_token, until: now + (json.expires_in || 3600), email: sa.client_email };
  return json.access_token;
}

// ── Firebase ID tokens ───────────────────────────────────────────────────
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwksCache = { keys: null, until: 0 };
async function jwks(fetchImpl) {
  if (jwksCache.keys && jwksCache.until > Date.now()) return jwksCache.keys;
  const res = await fetchImpl(JWKS_URL);
  const json = await res.json();
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] || 3600);
  jwksCache = { keys: json.keys || [], until: Date.now() + maxAge * 1000 };
  return jwksCache.keys;
}
class AuthError extends Error {}
async function verifyIdToken(token, projectId, { fetchImpl = fetch, now = Date.now(), emulatorHost = null } = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new AuthError('Malformed token');
  const header = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
  const t = Math.floor(now / 1000);
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) throw new AuthError('Wrong project');
  if (!claims.sub || typeof claims.sub !== 'string' || claims.sub.length > 128) throw new AuthError('No subject');
  if (!(claims.exp > t) || !(claims.iat <= t + 300) || (claims.auth_time && claims.auth_time > t + 300)) throw new AuthError('Expired');
  // The Auth emulator issues unsigned tokens; accept them only when an
  // emulator host is configured (local testing).
  if (emulatorHost && header.alg === 'none') return { uid: claims.sub, token: claims };
  if (header.alg !== 'RS256') throw new AuthError('Bad algorithm');
  const jwk = (await jwks(fetchImpl)).find((k) => k.kid === header.kid);
  if (!jwk) throw new AuthError('Unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64url(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new AuthError('Bad signature');
  return { uid: claims.sub, token: claims };
}

// ── admin.auth() subset ──────────────────────────────────────────────────
function authClient({ projectId, getToken, baseUrl = 'https://identitytoolkit.googleapis.com', fetchImpl = fetch }) {
  return {
    async getUserByEmail(email) {
      const res = await fetchImpl(`${baseUrl}/v1/projects/${projectId}/accounts:lookup`, {
        method: 'POST', headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: [email] }),
      });
      const json = await res.json();
      if (!res.ok) throw Object.assign(new Error(json.error?.message || 'Auth lookup failed'), { code: 'auth/internal-error' });
      const u = json.users?.[0];
      if (!u) throw Object.assign(new Error('No user record'), { code: 'auth/user-not-found' });
      return { uid: u.localId, email: u.email, emailVerified: !!u.emailVerified, disabled: !!u.disabled, displayName: u.displayName || null };
    },
  };
}

// ── admin.storage() subset (exists + V4 signed read URL) ─────────────────
function storageClient({ sa, bucket: defaultBucket, getToken, fetchImpl = fetch }) {
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
  return {
    bucket(name = defaultBucket) {
      return {
        file(path) {
          return {
            async exists() {
              const res = await fetchImpl(`https://storage.googleapis.com/storage/v1/b/${name}/o/${encodeURIComponent(path)}`,
                { headers: { Authorization: `Bearer ${await getToken()}` } });
              if (res.status === 404) return [false];
              if (!res.ok) throw new Error(`Storage lookup failed (${res.status})`);
              return [true];
            },
            async getSignedUrl({ expires }) {
              const now = new Date();
              const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
              const day = stamp.slice(0, 8);
              const scope = `${day}/auto/storage/goog4_request`;
              const ttl = Math.max(1, Math.min(604800, Math.round((Number(expires) - now.getTime()) / 1000)));
              const q = new URLSearchParams({ 'X-Goog-Algorithm': 'GOOG4-RSA-SHA256', 'X-Goog-Credential': `${sa.client_email}/${scope}`,
                'X-Goog-Date': stamp, 'X-Goog-Expires': String(ttl), 'X-Goog-SignedHeaders': 'host' });
              const canonicalQuery = [...q.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
              const resource = `/${name}/${encPath(path)}`;
              const canonical = ['GET', resource, canonicalQuery, 'host:storage.googleapis.com\n', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
              const toSign = ['GOOG4-RSA-SHA256', stamp, scope, hex(await crypto.subtle.digest('SHA-256', enc.encode(canonical)))].join('\n');
              const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await signingKey(sa), enc.encode(toSign));
              return [`https://storage.googleapis.com${resource}?${canonicalQuery}&X-Goog-Signature=${hex(sig)}`];
            },
          };
        },
      };
    },
  };
}

module.exports = { accessToken, verifyIdToken, authClient, storageClient, AuthError };
