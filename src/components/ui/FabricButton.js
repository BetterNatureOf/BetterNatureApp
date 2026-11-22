// Plush "fabric" primary button for a volunteer's main rescue action
// (Accept offer → I'm on my way → Mark delivered). Better Nature green
// with a soft, napped texture; it inflates under the pointer and squishes
// when pressed, so committing to a rescue feels physical. Inspired by
// plush/suede 3D button explorations, built from CSS (web) and springs
// (native) rather than renders.
import React, { useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../config/theme';

const web = Platform.OS === 'web';

// Fractal noise as the fabric nap (inline SVG, no image request).
const NAP = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.15' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`;

const CSS = `
.bn-fabric{position:relative;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:58px;
  padding:0 26px;border:0;border-radius:999px;cursor:pointer;isolation:isolate;-webkit-tap-highlight-color:transparent;
  background:radial-gradient(130% 160% at 28% 18%,#4E8C76 0%,#2F6553 38%,#234C3F 72%,#1A3A30 100%);
  box-shadow:inset 0 2px 2px rgba(255,255,255,.28),inset 0 -8px 14px rgba(0,0,0,.32),inset 0 0 0 1px rgba(255,255,255,.06),
    0 10px 22px rgba(18,44,35,.32),0 2px 4px rgba(18,44,35,.25);
  transform:translateZ(0) scale(1);transition:transform .45s cubic-bezier(.34,1.56,.64,1),box-shadow .45s ease,filter .3s ease}
.bn-fabric::before{content:'';position:absolute;inset:0;border-radius:inherit;background-image:${NAP};background-size:160px 160px;
  mix-blend-mode:soft-light;opacity:.55;pointer-events:none;z-index:-1}
.bn-fabric::after{content:'';position:absolute;inset:3px 10% auto;height:46%;border-radius:999px;pointer-events:none;
  background:linear-gradient(180deg,rgba(255,255,255,.20),rgba(255,255,255,0));filter:blur(1px);transition:opacity .45s ease,transform .45s ease}
.bn-fabric__seam{position:absolute;inset:5px;border-radius:999px;border:1.5px dashed rgba(230,242,236,.22);pointer-events:none}
.bn-fabric__label{font:800 17px/1 system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:.2px;color:#EEF6F1;
  text-shadow:0 1px 0 rgba(0,0,0,.35),0 -1px 0 rgba(255,255,255,.08)}
.bn-fabric:hover:not(:disabled){transform:scale(1.035);animation:bn-fabric-breathe 2.4s ease-in-out .45s infinite;
  box-shadow:inset 0 3px 3px rgba(255,255,255,.32),inset 0 -10px 18px rgba(0,0,0,.30),inset 0 0 0 1px rgba(255,255,255,.08),
    0 16px 30px rgba(18,44,35,.36),0 3px 6px rgba(18,44,35,.25)}
.bn-fabric:hover:not(:disabled)::after{transform:scaleX(1.04);opacity:1}
.bn-fabric:active:not(:disabled){animation:none;transform:scale(.97,.92);transition-duration:.12s;
  box-shadow:inset 0 1px 1px rgba(255,255,255,.18),inset 0 -3px 8px rgba(0,0,0,.4),0 4px 10px rgba(18,44,35,.3)}
.bn-fabric:focus-visible{outline:3px solid #F6B3C2;outline-offset:3px}
.bn-fabric:disabled{cursor:default;filter:saturate(.4) brightness(1.08);opacity:.7}
@keyframes bn-fabric-breathe{0%,100%{transform:scale(1.035)}50%{transform:scale(1.048,1.04)}}
@media (prefers-reduced-motion:reduce){.bn-fabric,.bn-fabric:hover:not(:disabled){animation:none;transition:none}}
`;
let injected = false;
function injectCss() {
  if (injected || typeof document === 'undefined') return;
  const el = document.createElement('style'); el.setAttribute('data-bn-fabric', '1'); el.textContent = CSS;
  document.head.appendChild(el); injected = true;
}

export default function FabricButton({ title, onPress, loading = false, disabled = false, accessibilityLabel }) {
  if (web) {
    injectCss();
    return React.createElement('button', {
      type: 'button', className: 'bn-fabric', disabled: disabled || loading, onClick: onPress,
      'aria-busy': loading ? 'true' : 'false', 'aria-label': accessibilityLabel || title,
    }, React.createElement('span', { className: 'bn-fabric__seam', 'aria-hidden': 'true' }),
    loading ? React.createElement(ActivityIndicator, { color: '#EEF6F1' }) : null,
    React.createElement('span', { className: 'bn-fabric__label' }, title));
  }
  return <NativeFabric {...{ title, onPress, loading, disabled, accessibilityLabel }} />;
}

function NativeFabric({ title, onPress, loading, disabled, accessibilityLabel }) {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (to, s = 18) => Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: s, bounciness: 10 }).start();
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} accessibilityRole="button" accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPressIn={() => spring(0.94, 40)} onPressOut={() => spring(1)}>
      <Animated.View style={[styles.native, { transform: [{ scale }] }, (disabled || loading) && { opacity: 0.7 }]}>
        <LinearGradient colors={['#4E8C76', '#2F6553', '#1A3A30']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.sheen} />
        <View style={styles.seam} />
        {loading && <ActivityIndicator color="#EEF6F1" style={{ marginRight: 8 }} />}
        <Text style={styles.label}>{title}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  native: { minHeight: 58, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexDirection: 'row',
    paddingHorizontal: 26, shadowColor: '#122C23', shadowOpacity: 0.32, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  sheen: { position: 'absolute', top: 3, left: '10%', right: '10%', height: '46%', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' },
  seam: { position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(230,242,236,0.22)' },
  label: { color: Colors.white, fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
});
