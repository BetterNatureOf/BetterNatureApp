// Agreement Center — replaces MyContracts as the user-side agreements
// surface. Consolidates every legal artifact the user has (or should
// have) attached to their identity into one screen, grouped by state.
//
// Blueprint §16.3 requires:
//   - All current agreements and addenda
//   - Plain-language summaries beside binding versions
//   - Acceptance date, version, scope, and expiration
//   - Required renewals and outstanding training
//   - Downloadable copies
//   - Parent/guardian consent records where applicable
//   - Role obligations and performance standards
//   - Exit and handoff requirements
//
// This slice covers the first four groupings. Training, guardian
// consent, obligations, and exit requirements ship with Phase 2 —
// they need entities the Foundation slice hasn't landed yet
// (Training, TransitionRecord, Guardian). Adding a stub row for each
// so the shape of the screen is future-proof.
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import useResponsiveLayout from '../../hooks/useResponsiveLayout';
import Icon from '../../components/ui/Icon';
import BrushText from '../../components/ui/BrushText';
import useAuthStore from '../../store/authStore';
import { CONTRACTS, roleForKind } from '../../services/contracts';
import { hasRole } from '../../services/roles';

const SERIF = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif',
});

// Plain-language summaries. These are the "what does this actually
// mean for me" cards blueprint §16.3 requires beside the binding text.
// Deliberately short — the binding text lives on ContractView; this
// is the reader's-digest version so a 17-year-old can decide with
// their eyes open. TODO: legal-team review pass on wording.
const PLAIN_LANGUAGE = {
  volunteer:
    "You agree to show up when you say you will, follow chapter rules on safety and communication, and let BetterNature use your first name plus impact numbers in public reporting. You can quit any time. Under-18? A parent or guardian also signs.",
  restaurant:
    "You confirm your organization can donate the surplus food you post, that it was safe to eat when handed off, and that you understand BetterNature issues tax receipts based on the weight you (or the volunteer) enter. You can pause or leave the program any time.",
  executive:
    "You accept the fiduciary duties of a BetterNature leader — loyalty, care, confidentiality, and separation of duties. You commit to term dates, agree to be replaced under the succession policy, and understand that leadership access ends when your role ends even if your membership continues.",
  president:
    "Same terms as the Executive Leadership Agreement, applied to your chapter. You lead a chapter's members, sign off on chapter expenses jointly with your treasurer, and hand off cleanly at the end of your term.",
};

// Which agreements does this user need based on the roles they hold?
// Reads through the multi-role helper so an exec who's also a
// chapter pres sees both.
function requiredKindsFor(user) {
  const required = new Set(['volunteer']); // baseline for every account
  if (hasRole(user, ['restaurant', 'partner'])) required.add('restaurant');
  if (hasRole(user, ['chapter_president', 'chapter_pres'])) required.add('president');
  if (hasRole(user, ['executive', 'admin', 'super_admin'])) required.add('executive');
  // Executive covers president legally; if user holds both, keep the
  // stronger one only so the row doesn't duplicate.
  if (required.has('executive')) required.delete('president');
  return [...required];
}

function fmtDate(ts) {
  if (!ts) return '';
  const ms = ts?.toMillis?.() || new Date(ts).getTime();
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Given the user + a kind, classify the state.
//   'signed_current' — signed AND version matches CONTRACTS[kind].version
//   'signed_outdated'— signed but a newer version has shipped since (needs renewal)
//   'unsigned'       — required by role, not signed
function classify(user, kind) {
  const block = user?.[`contract_${kind}`] || {};
  const signedBool = !!user?.[`contract_${kind}_signed`];
  const executiveCoversPresident = kind === 'president'
    && user?.contract_executive?.signed;
  if (!signedBool && !executiveCoversPresident) return 'unsigned';
  const signedVersion = executiveCoversPresident
    ? (user?.contract_executive?.version || 0)
    : (block.version || 0);
  const currentVersion = CONTRACTS[kind]?.version || 1;
  return signedVersion >= currentVersion ? 'signed_current' : 'signed_outdated';
}

export default function AgreementCenter({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const { contentStyle } = useResponsiveLayout();

  const rows = useMemo(() => {
    const required = requiredKindsFor(user);
    // Also include any kinds the user signed voluntarily even if not
    // strictly required by current role (e.g. a former president who
    // stepped down still has their signed president agreement).
    const alsoSigned = ['volunteer', 'restaurant', 'executive', 'president']
      .filter((k) => user?.[`contract_${k}_signed`] && !required.includes(k));
    return [...required, ...alsoSigned].map((k) => ({
      kind: k,
      spec: CONTRACTS[k],
      state: classify(user, k),
      block: user?.[`contract_${k}`] || {},
    }));
  }, [user]);

  const outstanding = rows.filter((r) => r.state !== 'signed_current');
  const current = rows.filter((r) => r.state === 'signed_current');

  return (
    <Screen contentStyle={contentStyle}>
      <ResponsiveContainer maxWidth={760}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} activeOpacity={0.85}>
          <Icon name="back" size={16} color={Colors.green} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>Agreement Center</Text>
        <Text style={styles.title}>Every promise you've made with BetterNature.</Text>
        <Text style={styles.lead}>
          Plain-language beside the binding text, so you know what you signed and when it needs renewing.
        </Text>

        {outstanding.length > 0 && (
          <>
            <SectionHeader
              label="Needs your attention"
              count={outstanding.length}
              tone="warn"
            />
            {outstanding.map((r) => (
              <AgreementRow
                key={r.kind}
                row={r}
                userName={user?.name}
                onView={() => navigation.navigate('ContractView', { kind: r.kind })}
                onSign={() => navigation.navigate('SignContract', { kind: r.kind })}
              />
            ))}
          </>
        )}

        {current.length > 0 && (
          <>
            <SectionHeader
              label="Current"
              count={current.length}
              tone="calm"
              hint={outstanding.length === 0 ? "You're all caught up." : null}
            />
            {current.map((r) => (
              <AgreementRow
                key={r.kind}
                row={r}
                userName={user?.name}
                onView={() => navigation.navigate('ContractView', { kind: r.kind })}
              />
            ))}
          </>
        )}

        {/* Phase-2 future rows — stubs so the shape of the screen is
            visible before the underlying entities exist. */}
        <SectionHeader label="Coming next release" tone="calm" />
        <FutureRow
          icon="user"
          title="Guardian consent"
          body="Under-18 accounts will surface parent/guardian acceptance here."
        />
        <FutureRow
          icon="check"
          title="Training completions"
          body="Youth-protection, food-safety, and role-specific courses tied to your agreements."
        />
        <FutureRow
          icon="clock"
          title="Renewal reminders"
          body="Automatic renewal windows before an agreement expires, so no one ever finds out mid-run."
        />

        <Text style={styles.footnote}>
          Need a copy for your records? Every signed agreement is downloadable from its detail page.
          Questions about an agreement's terms — email info@betternatureofficial.org.
        </Text>
      </ResponsiveContainer>
    </Screen>
  );
}

function SectionHeader({ label, count, tone = 'calm', hint }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={[styles.sectionLabel, tone === 'warn' && styles.sectionLabelWarn]}>
        {label}
      </Text>
      {typeof count === 'number' && count > 0 ? (
        <View style={[styles.countPill, tone === 'warn' && styles.countPillWarn]}>
          <Text style={[styles.countPillText, tone === 'warn' && styles.countPillTextWarn]}>{count}</Text>
        </View>
      ) : null}
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

function AgreementRow({ row, userName, onView, onSign }) {
  const { kind, spec, state, block } = row;
  const plain = PLAIN_LANGUAGE[kind] || '';
  const roleLabel = roleForKind(kind, { name: userName });
  const isSigned = state !== 'unsigned';
  const isOutdated = state === 'signed_outdated';

  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <View style={[styles.rowIcon, isSigned && !isOutdated ? styles.rowIconOk : null,
                       isOutdated ? styles.rowIconWarn : null,
                       !isSigned ? styles.rowIconAttn : null]}>
          <Icon
            name={isSigned && !isOutdated ? 'check' : isOutdated ? 'clock' : 'alert'}
            size={16}
            color={isSigned && !isOutdated ? Colors.green
                 : isOutdated ? '#7A5400'
                 : '#8E1B1B'}
            strokeWidth={2}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowTitle} numberOfLines={2}>{spec?.title || kind}</Text>
          <Text style={styles.rowRole}>{roleLabel} · v{spec?.version || 1}</Text>
        </View>
        <StateBadge state={state} />
      </View>

      {plain ? (
        <View style={styles.plainBox}>
          <Text style={styles.plainEyebrow}>In plain language</Text>
          <Text style={styles.plainBody}>{plain}</Text>
        </View>
      ) : null}

      {isSigned ? (
        <Text style={styles.rowMeta}>
          Signed as <Text style={styles.rowMetaStrong}>{block.signed_name || userName || '—'}</Text>
          {block.signed_at ? ` on ${fmtDate(block.signed_at)}` : ''}
          {isOutdated ? ' · a newer version needs your signature' : ''}
        </Text>
      ) : (
        <Text style={styles.rowMeta}>Required by your role — sign to keep access.</Text>
      )}

      <View style={styles.rowActions}>
        <TouchableOpacity style={styles.btnGhost} onPress={onView} activeOpacity={0.88}>
          <Text style={styles.btnGhostText}>Read agreement</Text>
        </TouchableOpacity>
        {(!isSigned || isOutdated) && typeof onSign === 'function' ? (
          <TouchableOpacity style={styles.btnPrimary} onPress={onSign} activeOpacity={0.88}>
            <Text style={styles.btnPrimaryText}>
              {isOutdated ? 'Re-sign v' + (spec?.version || 1) : 'Sign now'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function StateBadge({ state }) {
  if (state === 'signed_current') {
    return (
      <View style={[styles.badge, styles.badgeOk]}>
        <Text style={[styles.badgeText, styles.badgeTextOk]}>Signed</Text>
      </View>
    );
  }
  if (state === 'signed_outdated') {
    return (
      <View style={[styles.badge, styles.badgeWarn]}>
        <Text style={[styles.badgeText, styles.badgeTextWarn]}>Renewal</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, styles.badgeAttn]}>
      <Text style={[styles.badgeText, styles.badgeTextAttn]}>Not signed</Text>
    </View>
  );
}

function FutureRow({ icon, title, body }) {
  return (
    <View style={[styles.row, styles.futureRow]}>
      <View style={[styles.rowIcon, styles.rowIconFuture]}>
        <Icon name={icon} size={16} color={Colors.grayMid} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowTitle, styles.futureRowTitle]} numberOfLines={2}>{title}</Text>
        <Text style={styles.rowMeta}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, alignSelf: 'flex-start' },
  backText: { fontSize: 14, color: Colors.green, fontWeight: '600' },

  eyebrow: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase',
    color: Colors.green, marginTop: 10,
  },
  title: {
    fontFamily: SERIF, fontSize: 26, lineHeight: 32,
    fontWeight: '500', letterSpacing: -0.2,
    color: Colors.dark, marginTop: 4,
  },
  lead: { fontSize: 14.5, color: Colors.gray, marginTop: 6, marginBottom: 20, lineHeight: 21 },

  sectionHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    marginTop: 22, marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 12, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase',
    color: Colors.green,
  },
  sectionLabelWarn: { color: '#8E1B1B' },
  countPill: {
    minWidth: 20, height: 20, borderRadius: 10,
    paddingHorizontal: 7,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  countPillText: { fontSize: 11, fontWeight: '800', color: Colors.green },
  countPillWarn: { backgroundColor: '#FCE3E3' },
  countPillTextWarn: { color: '#8E1B1B' },
  sectionHint: { flexBasis: '100%', fontSize: 12.5, color: Colors.gray, marginTop: 2 },

  row: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1, borderColor: Colors.glassBorder,
    marginBottom: 10,
    gap: 12,
  },
  rowHead: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  rowIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: Colors.paper,
    alignItems: 'center', justifyContent: 'center',
  },
  rowIconOk: { backgroundColor: Colors.greenLight },
  rowIconWarn: { backgroundColor: '#FFF6E6' },
  rowIconAttn: { backgroundColor: '#FCE3E3' },
  rowIconFuture: { backgroundColor: Colors.grayFaint },
  rowTitle: { fontSize: 15, fontWeight: '700', color: Colors.dark, letterSpacing: -0.1 },
  rowRole: { ...Type.caption, color: Colors.green, marginTop: 3, fontWeight: '700', letterSpacing: 0.3 },
  rowMeta: { ...Type.caption, lineHeight: 19 },
  rowMetaStrong: { color: Colors.dark, fontWeight: '600' },

  plainBox: {
    backgroundColor: Colors.greenLight,
    borderRadius: 12,
    padding: 12,
  },
  plainEyebrow: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase',
    color: Colors.green,
  },
  plainBody: {
    fontSize: 13.5, color: '#1B5E3F', marginTop: 4, lineHeight: 19,
    fontStyle: 'italic',
  },

  rowActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btnPrimary: {
    backgroundColor: Colors.green,
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 12,
    flexGrow: 1,
    alignItems: 'center',
  },
  btnPrimaryText: { color: Colors.cream, fontSize: 13.5, fontWeight: '700' },
  btnGhost: {
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1, borderColor: Colors.green + '33',
    alignItems: 'center',
  },
  btnGhostText: { color: Colors.green, fontSize: 13, fontWeight: '700' },

  badge: {
    alignSelf: 'flex-start',
    paddingVertical: 3, paddingHorizontal: 10,
    borderRadius: 999,
  },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  badgeOk: { backgroundColor: Colors.greenLight },
  badgeTextOk: { color: Colors.green },
  badgeWarn: { backgroundColor: '#FFF6E6' },
  badgeTextWarn: { color: '#7A5400' },
  badgeAttn: { backgroundColor: '#FCE3E3' },
  badgeTextAttn: { color: '#8E1B1B' },

  futureRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    opacity: 0.7,
    borderStyle: Platform.OS === 'web' ? 'dashed' : 'solid',
  },
  futureRowTitle: { color: Colors.gray },

  footnote: {
    fontSize: 12, color: Colors.gray, marginTop: 24, lineHeight: 18,
    fontStyle: 'italic',
  },
});
