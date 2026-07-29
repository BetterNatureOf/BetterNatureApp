// Workspace context chip — persistent header element that names the
// scope the current screen is viewing and the role authorizing actions
// inside that scope. Sits at the top of every dashboard.
//
// Blueprint §16.1 calls this out: "Users should switch workspaces, not
// accounts. The app header should show the current context and the
// role authorizing actions."
//
// This slice is read-only. The interactive Switch affordance ships with
// the OrgUnit + Membership tables in Phase 1 Slice 2 — for now the chip
// derives context from user.chapter_id + the user's highest-authority
// role in that chapter. Tapping it opens the workspace picker later;
// today it opens the chapter's page so the tap goes somewhere useful
// instead of a dead sheet.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../config/theme';
import Icon from './Icon';
import { hasRole } from '../../services/roles';

// Ordered from highest to lowest so we surface the most consequential
// role the user holds inside the current workspace. Everyone gets
// 'Member' as the fallback label when they have no leadership role in
// that scope — matches the blueprint's Community/Member/Leader tiers.
const ROLE_PRIORITY = [
  { key: 'executive',         label: 'Executive' },
  { key: 'admin',             label: 'Admin' },
  { key: 'super_admin',       label: 'Super admin' },
  { key: 'chapter_president', label: 'Chapter President' },
  { key: 'chapter_pres',      label: 'Chapter President' },
  { key: 'chapter_vp',        label: 'Vice President' },
  { key: 'chapter_treas',     label: 'Treasurer' },
  { key: 'chapter_vol_coord', label: 'Volunteer Coord.' },
  { key: 'chapter_sec',       label: 'Secretary' },
  { key: 'partner',           label: 'Partner' },
  { key: 'restaurant',        label: 'Partner' },
  { key: 'member',            label: 'Member' },
];

function currentRoleLabel(user) {
  for (const r of ROLE_PRIORITY) {
    if (hasRole(user, r.key)) return r.label;
  }
  return 'Member';
}

/**
 * @param {object} props
 * @param {object} props.user           — the signed-in user from authStore
 * @param {string} [props.workspaceName]— override the chapter name (e.g. "National" for exec view)
 * @param {string} [props.scope]        — 'chapter' | 'national' | 'partner'
 * @param {() => void} [props.onPress]  — future Switch handler; falls back to noop
 */
export default function WorkspaceChip({ user, workspaceName, scope, onPress }) {
  const chapterName = workspaceName
    || user?.chapter?.name
    || user?.chapter_name
    || (scope === 'national' ? 'BetterNature National' : 'No chapter yet');
  const roleLabel = scope === 'national'
    ? currentRoleLabel(user)
    : currentRoleLabel(user);

  const disabled = typeof onPress !== 'function';

  return (
    <TouchableOpacity
      style={styles.chip}
      onPress={onPress}
      activeOpacity={disabled ? 1 : 0.82}
      disabled={disabled}
      accessibilityLabel={`Viewing ${chapterName} as ${roleLabel}`}
    >
      <View style={styles.chipInner}>
        <Text style={styles.viewing} numberOfLines={1}>
          Viewing <Text style={styles.strong}>{chapterName}</Text>
          {' as '}
          <Text style={styles.strong}>{roleLabel}</Text>
        </Text>
      </View>
      {!disabled ? (
        <View style={styles.switch}>
          <Text style={styles.switchText}>Switch</Text>
          <Icon name="chevron" size={12} color={Colors.cream} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.green,
    marginBottom: 12,
  },
  chipInner: {
    flexShrink: 1,
    minWidth: 0,
  },
  viewing: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12.5,
    fontWeight: '500',
    letterSpacing: 0.05,
  },
  strong: {
    color: Colors.cream,
    fontWeight: '700',
  },
  switch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  switchText: {
    color: Colors.cream,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.06,
  },
});
