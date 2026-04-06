import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import BrushDivider from '../../components/ui/BrushDivider';

export default function AboutScreen({ navigation }) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.back} onPress={() => navigation.goBack()}>‹ Back</Text>

      <BrushText variant="heroStat" style={styles.title}>
        Better Nature
      </BrushText>
      <Text style={styles.tagline}>
        Building a better world, one community at a time.
      </Text>

      <BrushDivider />

      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Our Mission
      </BrushText>
      <Text style={styles.body}>
        Better Nature is a nonprofit organization dedicated to food rescue,
        wildlife conservation, and clean water access. We empower communities
        through local chapters that organize volunteers to make a direct,
        measurable impact.
      </Text>

      <BrushDivider />

      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Our Projects
      </BrushText>

      <View style={styles.projectItem}>
        <Text style={styles.projectEmoji}>🍽️</Text>
        <View style={styles.projectText}>
          <Text style={styles.projectName}>IRIS — Food Rescue</Text>
          <Text style={styles.projectDesc}>
            Rescue surplus food from restaurants and deliver it to those in need.
          </Text>
        </View>
      </View>

      <View style={styles.projectItem}>
        <Text style={styles.projectEmoji}>🌲</Text>
        <View style={styles.projectText}>
          <Text style={styles.projectName}>Evergreen — Conservation</Text>
          <Text style={styles.projectDesc}>
            Protect wildlife and restore natural habitats in local communities.
          </Text>
        </View>
      </View>

      <View style={styles.projectItem}>
        <Text style={styles.projectEmoji}>💧</Text>
        <View style={styles.projectText}>
          <Text style={styles.projectName}>Hydro — Clean Water</Text>
          <Text style={styles.projectDesc}>
            Provide safe drinking water to underserved communities worldwide.
          </Text>
        </View>
      </View>

      <BrushDivider />

      <Text style={styles.footer}>
        Better Nature © {new Date().getFullYear()}{'\n'}
        Built with love for a better world.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 12 },
  title: { color: Colors.green, textAlign: 'center' },
  tagline: { ...Type.body, color: Colors.gray, textAlign: 'center', marginTop: 4 },
  sectionTitle: { color: Colors.green, marginBottom: 8 },
  body: { ...Type.body, color: Colors.gray, lineHeight: 24 },
  projectItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  projectEmoji: { fontSize: 28, marginRight: 14, marginTop: 2 },
  projectText: { flex: 1 },
  projectName: { fontSize: 16, fontWeight: '700', color: Colors.dark },
  projectDesc: { ...Type.body, color: Colors.gray, marginTop: 2 },
  footer: { ...Type.caption, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
