// Restaurant-facing list of tax receipts. Tapping one opens the public
// receipt URL — same page the email link points to — which is print-ready.
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking, ActivityIndicator,
} from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Card from '../../components/ui/Card';
import useAuthStore from '../../store/authStore';
import {
  listReceiptsForRestaurant, receiptUrl,
} from '../../services/taxReceipts';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TaxReceiptsScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Restaurant accounts may have their restaurant_id linked on the
        // user doc, OR we fall back to user.id (older accounts).
        const restId = user?.restaurant_id || user?.id;
        const list = await listReceiptsForRestaurant(restId);
        if (alive) setReceipts(list);
      } catch (e) { /* show empty */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  const totalLbs = receipts.reduce((s, r) => s + (r.weight_lbs || 0), 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>{'\u2039 Back'}</Text>
        </TouchableOpacity>
        <BrushText variant="screenTitle" style={styles.title}>
          Tax Receipts
        </BrushText>
        <Text style={styles.subtitle}>
          IRS-style receipts for every completed pickup. Tap one to view, print, or save as PDF.
        </Text>
      </View>

      <View style={styles.totalsRow}>
        <Card style={styles.totalCard}>
          <Text style={styles.totalLabel}>Receipts</Text>
          <Text style={styles.totalNum}>{receipts.length}</Text>
        </Card>
        <Card style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total lbs donated</Text>
          <Text style={styles.totalNum}>{Math.round(totalLbs).toLocaleString('en-US')}</Text>
        </Card>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={Colors.green} />
      ) : receipts.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>🧾</Text>
          <Text style={styles.emptyText}>No receipts yet</Text>
          <Text style={styles.emptySub}>
            A receipt is generated automatically every time a BetterNature
            volunteer completes a pickup from your restaurant.
          </Text>
        </Card>
      ) : (
        receipts.map((r) => (
          <TouchableOpacity
            key={r.id}
            activeOpacity={0.85}
            style={styles.row}
            onPress={() => Linking.openURL(receiptUrl(r.id))}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Receipt #{r.receipt_no}</Text>
              <Text style={styles.rowSub}>
                {fmtDate(r.picked_up_at)} · {r.weight_lbs} lbs · ~{r.meals_equivalent} meals
              </Text>
            </View>
            <Text style={styles.openLink}>Open</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { paddingBottom: 40 },
  header: { padding: 24, paddingTop: 60, backgroundColor: Colors.greenLight },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green, fontSize: 32 },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 6, lineHeight: 22 },
  totalsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginTop: 18,
    gap: 10,
  },
  totalCard: { flex: 1, alignItems: 'center', padding: 18 },
  totalLabel: { ...Type.caption, color: Colors.gray },
  totalNum: { fontSize: 26, fontWeight: '800', color: Colors.green, marginTop: 4 },
  emptyCard: { marginHorizontal: 24, marginTop: 24, alignItems: 'center', padding: 32 },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: Colors.dark },
  emptySub: { ...Type.caption, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: 24,
    marginTop: 12,
    padding: 16,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.soft,
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  rowSub: { ...Type.caption, marginTop: 2 },
  openLink: { fontSize: 14, fontWeight: '600', color: Colors.pink },
});
