// Donate.
//
// The donation form is now Zeffy's own iframe (embedded inline on web,
// external on native). That hands card / ACH / Apple Pay handling to
// Zeffy — we don't need a separate "Credit / Debit Card" button or our
// own PSP integration for ordinary card donations.
//
// We still show a Stripe-driven Apple Pay / Google Pay row at the top
// (via <DonationCTA />) when Stripe is configured, because those one-tap
// flows are dramatically faster than Zeffy's form for repeat donors.
// Until Stripe is configured, DonationCTA collapses to the Zeffy CTA
// and the embed below is the entire path.
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Toggle from '../../components/ui/Toggle';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import DonationCTA from '../../components/donate/DonationCTA';
import ZeffyEmbed from '../../components/donate/ZeffyEmbed';

const AMOUNTS = [5, 15, 25, 50];

export default function DonateScreen() {
  const [selectedAmount, setSelectedAmount] = useState(25);
  const [customAmount, setCustomAmount] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [isCustom, setIsCustom] = useState(false);

  function getAmount() {
    if (isCustom) {
      const n = Number(customAmount);
      return isNaN(n) || n <= 0 ? 0 : n;
    }
    return selectedAmount;
  }

  const amount = getAmount();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ResponsiveContainer maxWidth={720}>
        <BrushText variant="screenTitle" style={styles.title}>
          Make a donation
        </BrushText>
        <Text style={styles.subtitle}>
          100% of your gift goes to BetterNature programs. Tax-deductible.
        </Text>

        {/* Quick-pick amount chips */}
        <View style={styles.amountsRow}>
          {AMOUNTS.map((amt) => {
            const active = selectedAmount === amt && !isCustom;
            return (
              <TouchableOpacity
                key={amt}
                onPress={() => { setSelectedAmount(amt); setIsCustom(false); }}
                style={[styles.amountBtn, active && styles.amountSelected]}
              >
                {active ? (
                  <LinearGradient
                    colors={Colors.gradient.green}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.amountGradient}
                  >
                    <Text style={styles.amountTextSelected}>${amt}</Text>
                  </LinearGradient>
                ) : (
                  <Text style={styles.amountText}>${amt}</Text>
                )}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={() => setIsCustom(true)}
            style={[styles.amountBtn, isCustom && styles.amountSelected]}
          >
            {isCustom ? (
              <LinearGradient
                colors={Colors.gradient.green}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.amountGradient}
              >
                <Text style={styles.amountTextSelected}>Custom</Text>
              </LinearGradient>
            ) : (
              <Text style={styles.amountText}>Custom</Text>
            )}
          </TouchableOpacity>
        </View>

        {isCustom && (
          <View style={styles.customInput}>
            <Text style={styles.dollar}>$</Text>
            <TextInput
              value={customAmount}
              onChangeText={setCustomAmount}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={Colors.grayMid}
              style={styles.customField}
            />
          </View>
        )}

        {/* Monthly toggle */}
        <View style={styles.recurringRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.recurringLabel}>Monthly donation</Text>
            <Text style={styles.recurringDesc}>
              Set up a recurring gift so the work doesn’t stop between paychecks.
            </Text>
          </View>
          <Toggle value={isRecurring} onToggle={() => setIsRecurring(!isRecurring)} />
        </View>

        {/* One-tap PSP row (Apple Pay / Google Pay) — only renders when
            Stripe is configured AND the device supports the brand.
            Falls back internally to a Zeffy link if no PSP is available. */}
        <DonationCTA
          amount={amount}
          label={`Donate $${amount || '—'}${isRecurring ? '/mo' : ''}`}
          description={`Secured, tax-deductible, receipt by email`}
          showZeffy={false}
        />

        {/* Inline Zeffy form — handles card, ACH, every donation method
            Zeffy supports. No separate "Credit / Debit" button needed. */}
        <BrushText variant="sectionHeader" style={styles.sectionTitle}>
          Donate by card or bank
        </BrushText>
        <Text style={styles.embedHint}>
          Zeffy is the only truly 0% donation platform — we receive every cent.
        </Text>
        <ZeffyEmbed amount={amount} recurring={isRecurring} height={Platform.OS === 'web' ? 920 : 0} />

        <Text style={styles.powered}>
          Powered by Zeffy · Tax-deductible receipt emailed automatically
        </Text>
      </ResponsiveContainer>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 28 },

  amountsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  amountBtn: {
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.grayLight,
    overflow: 'hidden',
    ...Shadows.soft,
  },
  amountSelected: { borderColor: Colors.green, borderWidth: 0 },
  amountGradient: { paddingHorizontal: 22, paddingVertical: 14 },
  amountText: { paddingHorizontal: 22, paddingVertical: 14, fontSize: 16, fontWeight: '700', color: Colors.dark },
  amountTextSelected: { fontSize: 16, fontWeight: '700', color: Colors.white },

  customInput: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: Colors.green,
  },
  dollar: { fontSize: 20, fontWeight: '700', color: Colors.dark, marginRight: 8 },
  customField: { flex: 1, fontSize: 18, fontWeight: '600', color: Colors.dark, paddingVertical: 0 },

  recurringRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.card,
  },
  recurringLabel: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  recurringDesc: { ...Type.caption, marginTop: 2 },

  sectionTitle: { color: Colors.green, marginTop: 12, marginBottom: 6 },
  embedHint: { ...Type.caption, marginBottom: 14 },
  powered: { ...Type.caption, textAlign: 'center', marginTop: 4 },
});
