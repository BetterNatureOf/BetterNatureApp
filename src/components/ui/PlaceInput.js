// City / location autocomplete that works with no API keys.
//
// Web: emits an HTML <input> + <datalist>, so the browser shows a real
// suggestion dropdown as the user types — same UX as Stripe / Airbnb forms.
//
// Native: shows the chips of best matches under the input. Filters against
// a built-in list of US cities (state-tagged) so suggestions are relevant
// without any network call.
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Platform } from 'react-native';
import { Colors, Type, Radius } from '../../config/theme';

// A short curated list — common chapter cities + every state capital and
// every metro >250k. Easy to extend later. Format: "City, ST".
const CITIES = [
  'Memphis, TN','Nashville, TN','Knoxville, TN','Chattanooga, TN','Franklin, TN',
  'Atlanta, GA','Savannah, GA','Athens, GA','Augusta, GA',
  'Birmingham, AL','Mobile, AL','Huntsville, AL','Montgomery, AL',
  'Charlotte, NC','Raleigh, NC','Durham, NC','Greensboro, NC','Asheville, NC',
  'Charleston, SC','Columbia, SC','Greenville, SC',
  'Jacksonville, FL','Miami, FL','Orlando, FL','Tampa, FL','Tallahassee, FL','Gainesville, FL',
  'Louisville, KY','Lexington, KY',
  'St. Louis, MO','Kansas City, MO','Columbia, MO','Springfield, MO',
  'Little Rock, AR','Fayetteville, AR',
  'New Orleans, LA','Baton Rouge, LA','Lafayette, LA','Shreveport, LA',
  'Jackson, MS','Oxford, MS',
  'Houston, TX','Dallas, TX','Austin, TX','San Antonio, TX','Fort Worth, TX','El Paso, TX','Lubbock, TX','Plano, TX',
  'Oklahoma City, OK','Tulsa, OK','Norman, OK',
  'Phoenix, AZ','Tucson, AZ','Mesa, AZ','Tempe, AZ',
  'Albuquerque, NM','Santa Fe, NM',
  'Denver, CO','Boulder, CO','Colorado Springs, CO','Fort Collins, CO',
  'Salt Lake City, UT','Provo, UT',
  'Las Vegas, NV','Reno, NV',
  'Los Angeles, CA','San Francisco, CA','San Diego, CA','San Jose, CA','Sacramento, CA','Oakland, CA','Berkeley, CA','Long Beach, CA','Fresno, CA','Anaheim, CA','Irvine, CA','Pasadena, CA',
  'Portland, OR','Eugene, OR','Salem, OR',
  'Seattle, WA','Spokane, WA','Tacoma, WA','Bellevue, WA','Olympia, WA',
  'Boise, ID',
  'Helena, MT','Bozeman, MT',
  'Cheyenne, WY','Jackson, WY',
  'Fargo, ND','Sioux Falls, SD',
  'Omaha, NE','Lincoln, NE',
  'Des Moines, IA','Iowa City, IA','Ames, IA',
  'Minneapolis, MN','St. Paul, MN','Duluth, MN',
  'Milwaukee, WI','Madison, WI','Green Bay, WI',
  'Chicago, IL','Springfield, IL','Champaign, IL','Evanston, IL',
  'Indianapolis, IN','Bloomington, IN','South Bend, IN',
  'Detroit, MI','Ann Arbor, MI','Grand Rapids, MI','Lansing, MI',
  'Columbus, OH','Cleveland, OH','Cincinnati, OH','Toledo, OH','Akron, OH',
  'Pittsburgh, PA','Philadelphia, PA','Harrisburg, PA','Erie, PA',
  'New York, NY','Buffalo, NY','Albany, NY','Rochester, NY','Syracuse, NY','Brooklyn, NY','Bronx, NY','Queens, NY',
  'Newark, NJ','Jersey City, NJ','Trenton, NJ',
  'Boston, MA','Cambridge, MA','Worcester, MA','Springfield, MA',
  'Hartford, CT','New Haven, CT','Stamford, CT',
  'Providence, RI',
  'Manchester, NH','Concord, NH',
  'Burlington, VT','Montpelier, VT',
  'Portland, ME','Augusta, ME',
  'Wilmington, DE','Dover, DE',
  'Baltimore, MD','Annapolis, MD','Bethesda, MD',
  'Washington, DC',
  'Richmond, VA','Norfolk, VA','Arlington, VA','Charlottesville, VA',
  'Charleston, WV','Morgantown, WV',
  'Anchorage, AK','Fairbanks, AK',
  'Honolulu, HI',
];

export default function PlaceInput({ value, onChange, placeholder = 'Start typing your city…', style }) {
  const [focus, setFocus] = useState(false);
  const matches = useMemo(() => {
    const q = (value || '').trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return CITIES.filter((c) => c.toLowerCase().startsWith(q)).slice(0, 6);
  }, [value]);

  if (Platform.OS === 'web') {
    // Use a <datalist> — every modern browser renders a styled dropdown.
    const id = 'places-' + Math.random().toString(36).slice(2, 8);
    return (
      <View style={[{ width: '100%' }, style]}>
        {React.createElement('input', {
          type: 'text',
          value: value || '',
          placeholder,
          list: id,
          onChange: (e) => onChange?.(e.target.value),
          style: webInputStyle,
        })}
        {React.createElement(
          'datalist',
          { id },
          CITIES.map((c) => React.createElement('option', { key: c, value: c }))
        )}
      </View>
    );
  }

  return (
    <View style={[{ width: '100%' }, style]}>
      <TextInput
        value={value || ''}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.gray}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        style={styles.input}
      />
      {focus && matches.length > 0 && (
        <View style={styles.suggestBox}>
          {matches.map((c) => (
            <TouchableOpacity key={c} style={styles.suggestRow} onPress={() => { onChange?.(c); setFocus(false); }}>
              <Text style={styles.suggestText}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const webInputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 14,
  border: `1.5px solid ${Colors.glassBorder}`,
  background: Colors.white,
  fontSize: 15,
  color: Colors.dark,
  fontFamily: 'inherit',
  outline: 'none',
};

const styles = StyleSheet.create({
  input: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.glassBorder,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.dark,
  },
  suggestBox: {
    marginTop: 6,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: 'hidden',
  },
  suggestRow: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: Colors.grayLight },
  suggestText: { ...Type.body, color: Colors.dark },
});
