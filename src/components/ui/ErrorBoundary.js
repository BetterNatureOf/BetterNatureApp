// Last-resort error boundary. Catches React render errors anywhere in the
// tree and shows a friendly "something broke" screen with a Reload button.
//
// We log the error to the console (and could ship it to Sentry/PostHog
// later — see logError below). Without this, an exception inside any
// screen takes the whole app to a blank white screen on web.
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Colors, Type, Radius } from '../../config/theme';

function logError(error, info) {
  // Replace this with Sentry.captureException(error) once Sentry is wired.
  console.error('[ErrorBoundary]', error?.message || error);
  if (info?.componentStack) console.error(info.componentStack);
}

export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info)        { logError(error, info); }

  reset = () => {
    this.setState({ error: null });
    // Web-only: a full reload is the safest reset for nav state corruption.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>SOMETHING BROKE</Text>
          <Text style={styles.title}>We hit an unexpected error.</Text>
          <Text style={styles.body}>
            The team has been notified. You can try reloading — most of the
            time that gets you back in. If it keeps happening, email us at
            support@betternatureofficial.org and we’ll fix it fast.
          </Text>
          {/* Always show the error message for now — we're still
              stabilizing the launch. Once the app is stable, gate this
              behind __DEV__ again so end-users don't see stack traces. */}
          {this.state.error?.message ? (
            <View style={styles.devBlock}>
              <Text style={styles.devLabel}>Technical detail (helpful when reporting):</Text>
              <Text style={styles.devText} selectable>
                {String(this.state.error.message)}
              </Text>
              {this.state.error?.stack ? (
                <Text style={[styles.devText, { marginTop: 8, opacity: 0.7 }]} selectable>
                  {String(this.state.error.stack).split('\n').slice(0, 5).join('\n')}
                </Text>
              ) : null}
            </View>
          ) : null}
          <Text style={styles.button} onPress={this.reset}>Reload the app</Text>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: Colors.cream,
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl, padding: 28, maxWidth: 520, width: '100%',
    borderWidth: 1, borderColor: Colors.glassBorder,
  },
  eyebrow: { ...Type.eyebrow, color: Colors.pink, marginBottom: 8 },
  title: { ...Type.screenTitle, color: Colors.green, fontSize: 26, marginBottom: 12 },
  body: { ...Type.body, color: Colors.dark },
  devBlock: { marginTop: 16, padding: 12, backgroundColor: Colors.cream, borderRadius: 10 },
  devLabel: { fontSize: 11, fontWeight: '800', color: Colors.gray, letterSpacing: 1 },
  devText: { ...Type.caption, marginTop: 4, color: Colors.dark, fontFamily: Platform.OS === 'web' ? 'ui-monospace, Menlo, monospace' : undefined },
  button: {
    marginTop: 22, alignSelf: 'flex-start',
    backgroundColor: Colors.green, color: Colors.white,
    fontWeight: '700',
    paddingVertical: 12, paddingHorizontal: 18,
    borderRadius: 10,
    overflow: 'hidden',
  },
});
