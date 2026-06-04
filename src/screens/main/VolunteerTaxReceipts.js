// Volunteer-side tax receipts. Restaurants get a separate
// TaxReceiptsScreen for donated food; this one is for cash gifts
// the member made directly (Zeffy and any future card processor).
//
// Each row shows date, amount, and project. Tap to copy the
// receipt-quality summary BetterNature emails for IRS records
// (EIN 99-4028399).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import { fetchDonationHistory } from '../../services/database';
import useAuthStore from '../../store/authStore';

const EIN = '99-4028399';

function fmtMoney(n) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(t) {
  if (!t) return '—';
  const d = t.toDate ? t.toDate() : new Date(t);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function VolunteerTaxReceipts({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      const list = await fetchDonationHistory(user.id);
      setDonations(list || []);
    } catch {}
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const total = donations.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const thisYear = new Date().getFullYear();
  const ytd = donations
    .filter((d) => {
      const dt = d.created_at?.toDate ? d.created_at.toDate() : new Date(d.created_at);
      return dt.getFullYear() === thisYear;
    })
    .reduce((s, d) => s + (Number(d.amount) || 0), 0);

  function emailReceiptCopy(d) {
    const subject = encodeURIComponent(`BetterNature donation receipt — ${fmtDate(d.created_at)}`);
    const body = encodeURIComponent(
      `Hi,\n\nCould I get a written receipt for the following donation?\n\n` +
      `Date: ${fmtDate(d.created_at)}\n` +
      `Amount: ${fmtMoney(d.amount)}\n` +
      `Project: ${d.project || 'General fund'}\n` +
      `Reference: ${d.id}\n\n` +
      `Thanks!\n${user?.name || ''}`
    );
    Linking.openURL(`mailto:info@betternatureofficial.org?subject=${subject}&body=${body}`);
  }

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={780}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <BrushText variant="screenTitle" style={styles.title}>Tax receipts</BrushText>
        <Text style={styles.subtitle}>
          BetterNature is a registered 501(c)(3) nonprofit. EIN {EIN}. Every donation
          you make is tax-deductible.
        </Text>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>This year</Text>
            <Text style={styles.summaryValue}>{fmtMoney(ytd)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>All-time</Text>
            <Text style={styles.summaryValue}>{fmtMoney(total)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Donations</Text>
            <Text style={styles.summaryValue}>{donations.length}</Text>
          </View>
        </View>

        {loading ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : donations.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No donations yet</Text>
            <Text style={styles.emptyBody}>When you donate through the app, your receipts will appear here.</Text>
          </View>
        ) : (
          donations.map((d) => (
            <TouchableOpacity key={d.id} style={styles.row} onPress={() => emailReceiptCopy(d)} activeOpacity={0.85}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowAmount}>{fmtMoney(d.amount)}</Text>
                <Text style={styles.rowMeta}>{fmtDate(d.created_at)} · {d.project || 'General fund'}</Text>
                <Text style={styles.rowRef}>Ref {d.id?.slice(0, 8)}</Text>
              </View>
              <Text style={styles.rowCta}>Email me a copy →</Text>
            </TouchableOpacity>
          ))
        )}

        <Text style={styles.footer}>
          For an official year-end statement, email info@betternatureofficial.org. We send the consolidated 1098-equivalent by January 31.
        </Text>
      </ResponsiveContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream, ...(Platform.OS === 'web' ? { height: '100vh' } : null) },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green, marginBottom: 6 },
  subtitle: { ...Type.body, color: Colors.gray, marginBottom: 18 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  summaryCard: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.glassBorder },
  summaryLabel: { ...Type.caption, fontWeight: '700' },
  summaryValue: { fontSize: 20, fontWeight: '800', color: Colors.green, marginTop: 4 },
  empty: { ...Type.body, color: Colors.gray, textAlign: 'center', paddingVertical: 24 },
  emptyCard: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: Colors.glassBorder },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: Colors.green },
  emptyBody: { ...Type.body, color: Colors.gray, marginTop: 4, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.glassBorder, ...Shadows.card,
  },
  rowAmount: { fontSize: 18, fontWeight: '800', color: Colors.green },
  rowMeta: { ...Type.caption, marginTop: 2 },
  rowRef: { fontSize: 10, color: Colors.grayMid, marginTop: 4, fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier' },
  rowCta: { fontSize: 12, color: Colors.pink, fontWeight: '700' },
  footer: { ...Type.caption, marginTop: 22, textAlign: 'center' },
});
