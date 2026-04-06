import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Toggle from '../../components/ui/Toggle';
import { openDonationForm } from '../../services/zeffy';

const AMOUNTS = [5, 15, 25, 50];

export default function DonateScreen() {
  const [selectedAmount, setSelectedAmount] = useState(25);
  const [customAmount, setCustomAmount] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [isCustom, setIsCustom] = useState(false);

  function handleDonate() {
    const amount = isCustom ? Number(customAmount) : selectedAmount;
    openDonationForm({ amount, recurring: isRecurring });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BrushText variant="screenTitle" style={styles.title}>
        Make a Donation
      </BrushText>
      <Text style={styles.subtitle}>
        100% of your donation goes to Better Nature programs. Tax-deductible.
      </Text>

      {/* Amount Selection */}
      <View style={styles.amountsRow}>
        {AMOUNTS.map((amt) => (
          <TouchableOpacity
            key={amt}
            onPress={() => {
              setSelectedAmount(amt);
              setIsCustom(false);
            }}
            style={[
              styles.amountBtn,
              selectedAmount === amt && !isCustom && styles.amountSelected,
            ]}
          >
            <Text
              style={[
                styles.amountText,
                selectedAmount === amt && !isCustom && styles.amountTextSelected,
              ]}
            >
              ${amt}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={() => setIsCustom(true)}
          style={[styles.amountBtn, isCustom && styles.amountSelected]}
        >
          <Text style={[styles.amountText, isCustom && styles.amountTextSelected]}>
            Custom
          </Text>
        </TouchableOpacity>
      </View>

      {isCustom && (
        <View style={styles.customInput}>
          <Text style={styles.dollar}>$</Text>
          <Text style={styles.customHint}>Enter amount via Zeffy</Text>
        </View>
      )}

      {/* Monthly Toggle */}
      <View style={styles.recurringRow}>
        <View>
          <Text style={styles.recurringLabel}>Monthly Donation</Text>
          <Text style={styles.recurringDesc}>
            Set up a recurring gift to sustain our mission
          </Text>
        </View>
        <Toggle value={isRecurring} onToggle={() => setIsRecurring(!isRecurring)} />
      </View>

      {/* Payment Methods */}
      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Payment Methods
      </BrushText>

      <TouchableOpacity style={styles.paymentOption} onPress={handleDonate}>
        <Text style={styles.paymentEmoji}>🍎</Text>
        <Text style={styles.paymentText}>Apple Pay</Text>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.paymentOption} onPress={handleDonate}>
        <Text style={styles.paymentEmoji}>💳</Text>
        <Text style={styles.paymentText}>Credit / Debit Card</Text>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.paymentOption} onPress={handleDonate}>
        <Text style={styles.paymentEmoji}>📱</Text>
        <Text style={styles.paymentText}>Tap to Pay</Text>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <Button
        title={`Donate $${isCustom ? '...' : selectedAmount}${isRecurring ? '/month' : ''}`}
        onPress={handleDonate}
        style={styles.donateBtn}
      />

      <Text style={styles.powered}>
        Powered by Zeffy · Free for nonprofits · Tax-deductible receipt provided
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  amountsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  amountBtn: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.grayLight,
    ...Shadows.card,
  },
  amountSelected: {
    borderColor: Colors.pink,
    backgroundColor: Colors.pinkLight,
  },
  amountText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.dark,
  },
  amountTextSelected: {
    color: Colors.pink,
  },
  customInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: Colors.pink,
  },
  dollar: { fontSize: 20, fontWeight: '700', color: Colors.dark, marginRight: 8 },
  customHint: { ...Type.caption },
  recurringRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 24,
    ...Shadows.card,
  },
  recurringLabel: { fontSize: 15, fontWeight: '600', color: Colors.dark },
  recurringDesc: { ...Type.caption, marginTop: 2 },
  sectionTitle: { color: Colors.green, marginBottom: 12 },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 10,
    ...Shadows.card,
  },
  paymentEmoji: { fontSize: 24, marginRight: 14 },
  paymentText: { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.dark },
  arrow: { fontSize: 24, color: Colors.grayMid },
  donateBtn: { marginTop: 24 },
  powered: { ...Type.caption, textAlign: 'center', marginTop: 16 },
});
