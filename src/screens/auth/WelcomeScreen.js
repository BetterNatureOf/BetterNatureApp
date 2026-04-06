import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';

export default function WelcomeScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <BrushText variant="heroStat" style={styles.title}>
          Better Nature
        </BrushText>
      </View>

      <View style={styles.bottom}>
        <Button
          title="Get Started"
          onPress={() => navigation.navigate('SignupStep1')}
        />
        <Button
          title="I already have an account"
          variant="secondary"
          onPress={() => navigation.navigate('Login')}
          style={styles.loginBtn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  top: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: Colors.green,
  },
  bottom: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  loginBtn: {
    marginTop: 12,
  },
});
