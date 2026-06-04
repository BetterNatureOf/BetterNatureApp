// City / state / country autocomplete backed by Nominatim
// (OpenStreetMap). Free, no API key, world-wide coverage.
// Rate-limited to 1 req/sec per their TOS, so we debounce 400ms.
//
// Returns the parsed location to the caller via onSelect:
//   { city, state, country, countryCode, lat, lng, display }
//
// Pass `countryFilter` (ISO-2 code like 'us') to constrain to one
// country — used by the 'National' signup tab. Omit it for the
// 'International' tab.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, Type, Radius } from '../../config/theme';

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

function parseHit(hit) {
  const a = hit.address || {};
  const city =
    a.city || a.town || a.village || a.hamlet || a.municipality || a.suburb || '';
  const state = a.state || a.region || a.province || a.state_district || '';
  return {
    city,
    state,
    country: a.country || '',
    countryCode: (a.country_code || '').toUpperCase(),
    lat: hit.lat ? Number(hit.lat) : null,
    lng: hit.lon ? Number(hit.lon) : null,
    display: hit.display_name || '',
  };
}

export default function CityStateAutocomplete({
  value,
  onChangeText,
  onSelect,
  countryFilter,        // ISO-2 like 'us' to limit to one country
  placeholder = 'Start typing a city…',
  label = 'City',
  error,
}) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  // Keep our local state in sync if the parent resets externally
  // (e.g. tab change).
  useEffect(() => { setQuery(value || ''); }, [value]);

  function handleText(text) {
    setQuery(text);
    onChangeText?.(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text || text.trim().length < 2) {
      setResults([]); setOpen(false); return;
    }
    debounceRef.current = setTimeout(() => fetchResults(text), 400);
  }

  async function fetchResults(text) {
    setLoading(true);
    try {
      const url = new URL(ENDPOINT);
      url.searchParams.set('q', text);
      url.searchParams.set('format', 'json');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('limit', '6');
      // Restrict to populated places so we don't surface every
      // hardware store named 'Memphis'.
      url.searchParams.set('featuretype', 'city');
      if (countryFilter) url.searchParams.set('countrycodes', countryFilter);
      const res = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
      });
      const data = await res.json();
      const parsed = (Array.isArray(data) ? data : [])
        .map(parseHit)
        .filter((p) => p.city); // skip results without a city component
      setResults(parsed);
      setOpen(parsed.length > 0);
    } catch (e) {
      // Network failure — keep the text input working as plain
      // entry. The signup form still saves whatever city the user
      // typed even without autocomplete confirming it.
      setResults([]); setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  function pick(p) {
    setQuery(p.city);
    onChangeText?.(p.city);
    onSelect?.(p);
    setOpen(false);
  }

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View>
        <TextInput
          style={[styles.input, error && styles.inputError]}
          value={query}
          onChangeText={handleText}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={placeholder}
          placeholderTextColor={Colors.grayMid}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {loading ? (
          <View style={styles.spin}>
            <ActivityIndicator color={Colors.green} size="small" />
          </View>
        ) : null}
      </View>
      {error ? <Text style={styles.errText}>{error}</Text> : null}
      {open && results.length ? (
        <View style={styles.dropdown}>
          {results.map((p, i) => (
            <TouchableOpacity
              key={`${p.display}-${i}`}
              style={styles.option}
              onPress={() => pick(p)}
              activeOpacity={0.85}
            >
              <Text style={styles.optionCity}>{p.city}</Text>
              <Text style={styles.optionSub} numberOfLines={1}>
                {[p.state, p.country].filter(Boolean).join(', ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16, position: 'relative' },
  label: { ...Type.label, color: Colors.dark, marginBottom: 6 },
  input: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.glassBorder,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: Colors.dark,
  },
  inputError: { borderColor: '#EF4444' },
  errText: { fontSize: 12, color: '#EF4444', marginTop: 4 },
  spin: { position: 'absolute', right: 12, top: 12 },
  dropdown: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.glassBorder, marginTop: 4,
    overflow: 'hidden',
  },
  option: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.grayLight },
  optionCity: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  optionSub: { ...Type.caption, marginTop: 2 },
});
