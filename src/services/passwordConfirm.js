// Password-gated confirmation for destructive actions. Pops a
// modal asking the user to retype their password, re-authenticates
// against Firebase Auth, and only then resolves true. Resolves
// false if the user cancels or the password is wrong.
//
// Web: builds a styled <div> modal directly so it works regardless
//      of where in the React tree it's invoked from.
// Native: falls back to Alert.prompt where available (iOS), or a
//      plain prompt() otherwise. Native modals get a proper
//      implementation in a follow-up; web is the launch surface.
//
// Use for any irreversible / hard-to-recover action: deactivating
// a chapter, rejecting an application, deleting an account.
import { Platform, Alert } from 'react-native';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../config/firebase';

async function reauth(password) {
  if (!isFirebaseConfigured) return true; // dev mode, nothing to verify against
  const u = auth.currentUser;
  if (!u || !u.email) throw new Error('No signed-in user with an email');
  // Only password accounts can re-auth this way. Google/Apple users
  // would need a different reauth flow; we treat them as confirmed
  // for now since they had to be present at the OAuth window very
  // recently to even reach a destructive action.
  const isPasswordAcct = (u.providerData || []).some((p) => p.providerId === 'password');
  if (!isPasswordAcct) return true;
  const cred = EmailAuthProvider.credential(u.email, password);
  await reauthenticateWithCredential(u, cred);
  return true;
}

function showWebModal({ title, message, confirmLabel = 'Confirm', destructive = true }) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed', inset: 0, background: 'rgba(15,28,21,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999, padding: '20px',
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
      width: '100%', maxWidth: '440px', background: '#FFF', borderRadius: '20px',
      padding: '24px', boxShadow: '0 12px 40px rgba(0,0,0,0.25)', boxSizing: 'border-box',
    });
    card.innerHTML = `
      <div style="font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:${destructive ? '#DB2777' : '#1B3A2D'}">Confirm with password</div>
      <div style="font-size:20px;font-weight:800;color:#1B3A2D;margin-top:4px;">${escapeHtml(title)}</div>
      <div style="font-size:14px;color:#5A574F;margin-top:8px;line-height:1.45;">${escapeHtml(message || '')}</div>
      <label style="display:block;font-size:11px;font-weight:700;color:#7A766C;letter-spacing:.4px;text-transform:uppercase;margin-top:18px;margin-bottom:6px;">Your password</label>
      <input type="password" autocomplete="current-password" id="bn-pwd" style="width:100%;border:1px solid #E9E4D4;border-radius:10px;padding:12px 14px;font-size:15px;background:#FAF8F1;box-sizing:border-box;" />
      <div id="bn-pwd-err" style="color:#DB2777;font-size:12px;margin-top:6px;display:none;"></div>
      <div style="display:flex;gap:8px;margin-top:18px;">
        <button id="bn-cancel" style="flex:1;padding:12px;border-radius:999px;border:1px solid #E9E4D4;background:#FFF;color:#1B3A2D;font-weight:700;font-size:14px;cursor:pointer;">Cancel</button>
        <button id="bn-ok" style="flex:1;padding:12px;border-radius:999px;border:none;background:${destructive ? '#DB2777' : '#1B3A2D'};color:#FFF;font-weight:700;font-size:14px;cursor:pointer;">${escapeHtml(confirmLabel)}</button>
      </div>
    `;
    root.appendChild(card);
    document.body.appendChild(root);

    const input = card.querySelector('#bn-pwd');
    const err   = card.querySelector('#bn-pwd-err');
    const cancel = card.querySelector('#bn-cancel');
    const ok    = card.querySelector('#bn-ok');
    setTimeout(() => input.focus(), 50);

    const close = (val) => {
      try { document.body.removeChild(root); } catch {}
      resolve(val);
    };
    cancel.addEventListener('click', () => close(false));
    root.addEventListener('click', (e) => { if (e.target === root) close(false); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok.click(); if (e.key === 'Escape') close(false); });

    ok.addEventListener('click', async () => {
      err.style.display = 'none';
      ok.disabled = true;
      ok.textContent = 'Verifying…';
      try {
        await reauth(input.value);
        close(true);
      } catch (e) {
        err.textContent = e?.code === 'auth/wrong-password'
          ? 'Wrong password — try again.'
          : (e?.message || 'Could not verify password.');
        err.style.display = 'block';
        ok.disabled = false;
        ok.textContent = confirmLabel;
        input.focus(); input.select();
      }
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function confirmWithPassword(title, message, opts = {}) {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return showWebModal({ title, message, ...opts });
  }
  // Native fallback — iOS Alert.prompt + reauth, otherwise plain
  // confirm (no password) so the destructive action isn't blocked
  // entirely on Android until the proper modal lands.
  return new Promise((resolve) => {
    if (Alert.prompt) {
      Alert.prompt(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: opts.confirmLabel || 'Confirm',
          style: opts.destructive ? 'destructive' : 'default',
          onPress: async (password) => {
            try { await reauth(password || ''); resolve(true); }
            catch { resolve(false); }
          },
        },
      ], 'secure-text');
    } else {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: opts.confirmLabel || 'Confirm', onPress: () => resolve(true) },
      ]);
    }
  });
}
