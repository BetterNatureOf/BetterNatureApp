// Self-folding "send" button for actions that send something out: a donor
// posting food to the partner network, a coordinator sending a broadcast.
// A paper card folds into a plane while the request is in flight, flies
// off only once the server confirms, and leaves a "✓ Sent" note. If the
// request fails, the plane unfolds back into the card with the reason.
// Inspired by self-folding paper-plane button explorations, in Better
// Nature colours.
//
// onPress: async () => true (sent) | falsy (cancelled, back to idle) |
//          'error' or throw (failed). onSent runs after the flight.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../../config/theme';

const web = Platform.OS === 'web';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = () => web && typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const CSS = `
.bn-plane{position:relative;display:block;width:100%;min-height:60px;border:0;background:none;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
.bn-plane:disabled{cursor:default}
.bn-plane__card{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:16px;
  background:
    linear-gradient(to top right,transparent calc(50% - .6px),rgba(42,86,72,.10) 50%,transparent calc(50% + .6px)),
    linear-gradient(to top left,transparent calc(50% - .6px),rgba(42,86,72,.10) 50%,transparent calc(50% + .6px)),
    linear-gradient(180deg,#FFFEFA,#F6F2E8);
  box-shadow:0 1px 0 #fff inset,0 10px 22px rgba(31,58,48,.16),0 2px 4px rgba(31,58,48,.12);
  transform-origin:50% 50%;transition:transform .42s cubic-bezier(.6,0,.4,1),opacity .3s ease .12s,box-shadow .3s ease}
.bn-plane:hover:not(:disabled) .bn-plane__card{box-shadow:0 1px 0 #fff inset,0 14px 28px rgba(31,58,48,.2),0 3px 6px rgba(31,58,48,.12);transform:translateY(-1px)}
.bn-plane:active:not(:disabled) .bn-plane__card{transform:scale(.98)}
.bn-plane__label{font:800 17px/1 system-ui,-apple-system,'Segoe UI',sans-serif;color:#2A5648;letter-spacing:.1px;transition:opacity .15s ease}
.bn-plane__label[data-tone=error]{color:#C0425C;font-size:15px;font-weight:700}
.bn-plane__plane{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;opacity:0;transform:scale(.3) rotate(10deg);
  transition:opacity .25s ease .2s,transform .42s cubic-bezier(.34,1.56,.64,1) .2s;pointer-events:none;filter:drop-shadow(0 6px 8px rgba(31,58,48,.25))}
.bn-plane__done{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;opacity:0;transform:translateY(6px);
  font:800 17px/1 system-ui,-apple-system,'Segoe UI',sans-serif;color:#2A5648;transition:opacity .35s ease,transform .35s ease;pointer-events:none}
.bn-plane[data-state=folding] .bn-plane__card,.bn-plane[data-state=flying] .bn-plane__card,.bn-plane[data-state=sent] .bn-plane__card{transform:scale(.18,.55) rotate(-12deg);opacity:0}
.bn-plane[data-state=folding] .bn-plane__label,.bn-plane[data-state=flying] .bn-plane__label{opacity:0}
.bn-plane[data-state=folding] .bn-plane__plane{opacity:1;transform:scale(1) rotate(0);animation:bn-plane-bob 1.1s ease-in-out .62s infinite}
.bn-plane[data-state=flying] .bn-plane__plane{opacity:1;animation:bn-plane-fly .75s cubic-bezier(.5,0,.75,0) forwards}
.bn-plane[data-state=sent] .bn-plane__done{opacity:1;transform:none}
.bn-plane:focus-visible{outline:3px solid #2A5648;outline-offset:3px;border-radius:16px}
@keyframes bn-plane-bob{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-5px) rotate(-4deg)}}
@keyframes bn-plane-fly{0%{transform:translate(0,0) rotate(0) scale(1);opacity:1}
  30%{transform:translate(-14px,6px) rotate(8deg) scale(1)}100%{transform:translate(240px,-150px) rotate(-24deg) scale(.45);opacity:0}}
@media (prefers-reduced-motion:reduce){.bn-plane *{animation:none!important;transition-duration:.01s!important}}
`;
let injected = false;
function injectCss() {
  if (injected || typeof document === 'undefined') return;
  const el = document.createElement('style'); el.setAttribute('data-bn-plane', '1'); el.textContent = CSS;
  document.head.appendChild(el); injected = true;
}

function PlaneIcon({ size = 46 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path d="M4 22 L44 6 L30 42 L22 28 Z" fill="#FFFDF7" stroke={Colors.green} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M22 28 L44 6" stroke={Colors.green} strokeWidth={2} strokeLinecap="round" />
      <Path d="M22 28 L24 38 L30 32" fill="#E6F0EC" stroke={Colors.green} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

function usePlane({ onPress, onSent, resetAfterMs }) {
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  async function run() {
    if (state === 'folding' || state === 'flying') return;
    setError('');
    setState('folding');
    const started = Date.now();
    let result;
    try { result = await onPress?.(); } catch (e) { result = { error: e?.message }; }
    const minFold = reduced() ? 0 : 620;
    if (Date.now() - started < minFold) await wait(minFold - (Date.now() - started));
    if (!alive.current) return;
    if (result === true || (result && typeof result === 'object' && !result.error)) {
      setState('flying');
      await wait(reduced() ? 0 : 760);
      if (!alive.current) return;
      setState('sent');
      await wait(reduced() ? 300 : 650);
      onSent?.(result);
      if (resetAfterMs && alive.current) { await wait(resetAfterMs); if (alive.current) setState('idle'); }
    } else if (result === 'error' || result?.error) {
      setError(typeof result?.error === 'string' && result.error ? result.error : 'Couldn’t send — try again');
      setState('error');
    } else setState('idle');
  }
  return { state, error, run };
}

export default function PaperPlaneButton({ title, sentTitle = 'Sent', onPress, onSent, disabled = false, resetAfterMs = 0 }) {
  const { state, error, run } = usePlane({ onPress, onSent, resetAfterMs });
  const label = state === 'error' ? error : title;
  const live = state === 'folding' ? 'Sending' : state === 'sent' ? sentTitle : state === 'error' ? error : '';
  if (web) {
    injectCss();
    return React.createElement('button', {
      type: 'button', className: 'bn-plane', 'data-state': state, onClick: run,
      disabled: disabled || ['folding', 'flying', 'sent'].includes(state), 'aria-busy': state === 'folding' ? 'true' : 'false', 'aria-label': label,
    }, React.createElement('span', { className: 'bn-plane__card' },
      React.createElement('span', { className: 'bn-plane__label', 'data-tone': state === 'error' ? 'error' : 'normal' }, label)),
    React.createElement('span', { className: 'bn-plane__plane', 'aria-hidden': 'true' }, React.createElement(PlaneIcon)),
    React.createElement('span', { className: 'bn-plane__done' }, `✓ ${sentTitle}`),
    React.createElement('span', { role: 'status', 'aria-live': 'polite', style: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' } }, live));
  }
  return <NativePlane {...{ state, label, sentTitle, run, disabled }} />;
}

function NativePlane({ state, label, sentTitle, run, disabled }) {
  const fold = useRef(new Animated.Value(0)).current;   // 0 card, 1 plane
  const fly = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (state === 'folding') Animated.timing(fold, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
    else if (state === 'flying') Animated.timing(fly, { toValue: 1, duration: 750, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start();
    else if (state === 'idle' || state === 'error') { fold.setValue(0); fly.setValue(0); }
  }, [state, fold, fly]);
  const cardStyle = { opacity: fold.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ scaleX: fold.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] }) }] };
  const planeStyle = { opacity: state === 'sent' ? 0 : fold,
    transform: [{ translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [0, 220] }) },
      { translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [0, -140] }) },
      { rotate: fly.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-24deg'] }) }] };
  return (
    <Pressable onPress={run} disabled={disabled || ['folding', 'flying', 'sent'].includes(state)} accessibilityRole="button"
      accessibilityLabel={label} accessibilityState={{ busy: state === 'folding' }} style={styles.wrap}>
      <Animated.View style={[styles.card, cardStyle]}><Text style={[styles.label, state === 'error' && styles.error]}>{label}</Text></Animated.View>
      <Animated.View pointerEvents="none" style={[styles.plane, planeStyle]}><PlaneIcon /></Animated.View>
      {state === 'sent' && <View style={styles.done}><Text style={styles.label} accessibilityLiveRegion="polite">✓ {sentTitle}</Text></View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: 60, justifyContent: 'center' },
  card: { ...StyleSheet.absoluteFillObject, borderRadius: 16, backgroundColor: '#FFFDF7', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1F3A30', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  plane: { position: 'absolute', alignSelf: 'center' },
  done: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  label: { color: Colors.green, fontSize: 17, fontWeight: '800' },
  error: { color: '#C0425C', fontSize: 15 },
});
