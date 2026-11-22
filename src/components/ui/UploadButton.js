// Glass upload button for photo and ID uploads. A frosted pill sits in a
// recessed track; a light runs around its rim while the upload is in
// flight and settles to green when the server has the file (pink on a
// failure). Progress, when known, fills the pill from the left. Inspired
// by glass/shader upload-button explorations, in Better Nature colours.
//
// state: 'idle' | 'working' | 'done' | 'error'
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../config/theme';
import Icon from './Icon';

const web = Platform.OS === 'web';
const CSS = `
.bn-upload{position:relative;display:block;width:100%;padding:6px;border-radius:999px;border:0;cursor:pointer;
  background:linear-gradient(180deg,#E3E8E4,#F6F7F4);box-shadow:inset 0 2px 5px rgba(20,40,30,.16),inset 0 -1px 0 rgba(255,255,255,.9);
  -webkit-tap-highlight-color:transparent}
.bn-upload:disabled{cursor:default}
.bn-upload__rim{position:relative;display:block;border-radius:999px;padding:3px;overflow:hidden;isolation:isolate}
.bn-upload__rim::before{content:'';position:absolute;inset:-150%;z-index:-1;
  background:conic-gradient(from 0deg,transparent 0 55%,#9DDCC0 63%,#F6B3C2 70%,#BCB2FF 76%,#FFD38A 82%,transparent 90%);
  opacity:.55;animation:bn-upload-spin 6s linear infinite}
.bn-upload:hover .bn-upload__rim::before{opacity:.8}
.bn-upload[data-state=working] .bn-upload__rim::before{opacity:1;animation-duration:1.1s}
.bn-upload[data-state=done] .bn-upload__rim::before{animation:none;opacity:1;background:#2F7A5F}
.bn-upload[data-state=error] .bn-upload__rim::before{animation:none;opacity:1;background:#E8627C}
.bn-upload__pill{position:relative;display:flex;align-items:center;justify-content:center;gap:10px;min-height:54px;padding:0 22px;
  border-radius:999px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(242,246,243,.92));
  box-shadow:inset 0 1px 0 #fff,inset 0 -6px 12px rgba(20,40,30,.06),0 6px 16px rgba(20,40,30,.14);
  transition:transform .35s cubic-bezier(.34,1.56,.64,1)}
.bn-upload:hover:not(:disabled) .bn-upload__pill{transform:scale(1.015)}
.bn-upload:active:not(:disabled) .bn-upload__pill{transform:scale(.98)}
.bn-upload__fill{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,rgba(157,220,192,.35),rgba(157,220,192,.15));
  transition:width .35s ease;pointer-events:none}
.bn-upload__label{position:relative;font:750 17px/1 system-ui,-apple-system,'Segoe UI',sans-serif;color:#1F2A26;letter-spacing:-.1px}
.bn-upload__icon{position:relative;display:flex}
.bn-upload:focus-visible{outline:3px solid #2A5648;outline-offset:3px}
@keyframes bn-upload-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.bn-upload__rim::before{animation:none}}
`;
let injected = false;
function injectCss() {
  if (injected || typeof document === 'undefined') return;
  const el = document.createElement('style'); el.setAttribute('data-bn-upload', '1'); el.textContent = CSS;
  document.head.appendChild(el); injected = true;
}

const ICON = { idle: 'upload', working: 'upload', done: 'check', error: 'alert' };
const ICON_COLOR = { idle: '#5C6B64', working: Colors.green, done: '#2F7A5F', error: Colors.pink };

export default function UploadButton({ label, workingLabel = 'Uploading…', doneLabel = 'Uploaded', errorLabel = 'Upload failed — tap to retry',
  state = 'idle', progress = null, onPress, disabled = false }) {
  const text = state === 'working' ? workingLabel : state === 'done' ? doneLabel : state === 'error' ? errorLabel : label;
  if (web) {
    injectCss();
    const pct = state === 'done' ? 100 : state === 'working' && Number.isFinite(progress) ? Math.round(progress * 100) : 0;
    return React.createElement('button', {
      type: 'button', className: 'bn-upload', 'data-state': state, onClick: onPress, disabled: disabled || state === 'working',
      'aria-busy': state === 'working' ? 'true' : 'false', 'aria-label': text,
    }, React.createElement('span', { className: 'bn-upload__rim' },
      React.createElement('span', { className: 'bn-upload__pill' },
        React.createElement('span', { className: 'bn-upload__fill', style: { width: `${pct}%` }, 'aria-hidden': 'true' }),
        React.createElement('span', { className: 'bn-upload__icon', 'aria-hidden': 'true' },
          React.createElement(Icon, { name: ICON[state], size: 22, color: ICON_COLOR[state] })),
        React.createElement('span', { className: 'bn-upload__label', role: 'status', 'aria-live': 'polite' }, text))));
  }
  return <NativeUpload {...{ text, state, progress, onPress, disabled }} />;
}

function NativeUpload({ text, state, progress, onPress, disabled }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (state !== 'working') { pulse.stopAnimation(); pulse.setValue(0); return undefined; }
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [state, pulse]);
  const rim = state === 'done' ? '#2F7A5F' : state === 'error' ? Colors.pink
    : pulse.interpolate({ inputRange: [0, 0.33, 0.66, 1], outputRange: ['#9DDCC0', '#F6B3C2', '#BCB2FF', '#9DDCC0'] });
  const pct = state === 'done' ? 1 : Number.isFinite(progress) ? progress : 0;
  return (
    <Pressable onPress={onPress} disabled={disabled || state === 'working'} accessibilityRole="button" accessibilityLabel={text}
      accessibilityState={{ busy: state === 'working', disabled }} style={styles.track}>
      <Animated.View style={[styles.rim, { borderColor: state === 'idle' ? 'rgba(157,220,192,0.5)' : rim }]}>
        <View style={styles.pill}>
          <View style={[styles.fill, { width: `${Math.round(pct * 100)}%` }]} />
          <Icon name={ICON[state]} size={22} color={ICON_COLOR[state]} />
          <Text style={styles.label} accessibilityLiveRegion="polite">{text}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { padding: 6, borderRadius: 999, backgroundColor: '#E9EEEA' },
  rim: { borderRadius: 999, borderWidth: 2 },
  pill: { minHeight: 54, borderRadius: 999, backgroundColor: '#FBFCFA', overflow: 'hidden', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10, paddingHorizontal: 22 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(157,220,192,0.3)' },
  label: { fontSize: 17, fontWeight: '700', color: '#1F2A26' },
});
