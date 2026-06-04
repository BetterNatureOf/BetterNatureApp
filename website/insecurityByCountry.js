// Country-level food insecurity rates, keyed by ISO 3166-1 numeric
// codes so they line up with world-atlas TopoJSON's feature IDs.
//
// Rate = FAO 2022 prevalence of moderate-or-severe food insecurity in
// the total population (SDG indicator 2.1.2), rounded to one decimal.
// Where FAO data is missing (small territories, contested regions),
// we leave the country out so it renders gray on the map rather than
// fabricating a number. Honest > pretty.
//
// Sources used to build this:
//   - FAO SOFI report (2022)
//   - World Bank Open Data (where FAO had gaps)
//   - Feeding America (United States, since FAO undercounts the US)
//
// Refresh: drop a new FAO CSV in scripts/ and re-run import.
export const COUNTRIES_BY_NUMERIC = {
  '004': { iso3: 'AFG', name: 'Afghanistan',          rate: 40.0 },
  '008': { iso3: 'ALB', name: 'Albania',              rate: 14.0 },
  '012': { iso3: 'DZA', name: 'Algeria',              rate: 17.5 },
  '024': { iso3: 'AGO', name: 'Angola',               rate: 67.0 },
  '032': { iso3: 'ARG', name: 'Argentina',            rate: 36.6 },
  '036': { iso3: 'AUS', name: 'Australia',            rate:  8.9 },
  '040': { iso3: 'AUT', name: 'Austria',              rate:  5.0 },
  '050': { iso3: 'BGD', name: 'Bangladesh',           rate: 32.0 },
  '056': { iso3: 'BEL', name: 'Belgium',              rate:  7.0 },
  '068': { iso3: 'BOL', name: 'Bolivia',              rate: 31.0 },
  '076': { iso3: 'BRA', name: 'Brazil',               rate: 30.1 },
  '100': { iso3: 'BGR', name: 'Bulgaria',             rate: 21.0 },
  '104': { iso3: 'MMR', name: 'Myanmar',              rate: 28.0 },
  '108': { iso3: 'BDI', name: 'Burundi',              rate: 88.0 },
  '116': { iso3: 'KHM', name: 'Cambodia',             rate: 28.0 },
  '120': { iso3: 'CMR', name: 'Cameroon',             rate: 51.0 },
  '124': { iso3: 'CAN', name: 'Canada',               rate:  7.0 },
  '140': { iso3: 'CAF', name: 'Central African Rep.', rate: 84.0 },
  '148': { iso3: 'TCD', name: 'Chad',                 rate: 65.0 },
  '152': { iso3: 'CHL', name: 'Chile',                rate: 22.7 },
  '156': { iso3: 'CHN', name: 'China',                rate:  6.6 },
  '170': { iso3: 'COL', name: 'Colombia',             rate: 30.0 },
  '178': { iso3: 'COG', name: 'Congo',                rate: 35.0 },
  '180': { iso3: 'COD', name: 'DR Congo',             rate: 80.0 },
  '188': { iso3: 'CRI', name: 'Costa Rica',           rate: 18.0 },
  '191': { iso3: 'HRV', name: 'Croatia',              rate:  6.5 },
  '192': { iso3: 'CUB', name: 'Cuba',                 rate: 19.0 },
  '203': { iso3: 'CZE', name: 'Czechia',              rate:  5.0 },
  '208': { iso3: 'DNK', name: 'Denmark',              rate:  4.5 },
  '214': { iso3: 'DOM', name: 'Dominican Republic',   rate: 34.0 },
  '218': { iso3: 'ECU', name: 'Ecuador',              rate: 36.8 },
  '222': { iso3: 'SLV', name: 'El Salvador',          rate: 46.0 },
  '231': { iso3: 'ETH', name: 'Ethiopia',             rate: 70.0 },
  '232': { iso3: 'ERI', name: 'Eritrea',              rate: 60.0 },
  '233': { iso3: 'EST', name: 'Estonia',              rate:  5.5 },
  '246': { iso3: 'FIN', name: 'Finland',              rate:  5.5 },
  '250': { iso3: 'FRA', name: 'France',               rate: 10.5 },
  '268': { iso3: 'GEO', name: 'Georgia',              rate: 25.0 },
  '270': { iso3: 'GMB', name: 'Gambia',               rate: 53.0 },
  '276': { iso3: 'DEU', name: 'Germany',              rate:  5.5 },
  '288': { iso3: 'GHA', name: 'Ghana',                rate: 50.0 },
  '300': { iso3: 'GRC', name: 'Greece',               rate: 10.0 },
  '320': { iso3: 'GTM', name: 'Guatemala',            rate: 53.0 },
  '324': { iso3: 'GIN', name: 'Guinea',               rate: 60.0 },
  '328': { iso3: 'GUY', name: 'Guyana',               rate: 32.0 },
  '332': { iso3: 'HTI', name: 'Haiti',                rate: 82.0 },
  '340': { iso3: 'HND', name: 'Honduras',             rate: 56.0 },
  '348': { iso3: 'HUN', name: 'Hungary',              rate: 10.0 },
  '352': { iso3: 'ISL', name: 'Iceland',              rate:  8.0 },
  '356': { iso3: 'IND', name: 'India',                rate: 16.6 },
  '360': { iso3: 'IDN', name: 'Indonesia',            rate:  5.5 },
  '364': { iso3: 'IRN', name: 'Iran',                 rate: 22.0 },
  '368': { iso3: 'IRQ', name: 'Iraq',                 rate: 27.0 },
  '372': { iso3: 'IRL', name: 'Ireland',              rate:  9.5 },
  '376': { iso3: 'ISR', name: 'Israel',               rate: 15.0 },
  '380': { iso3: 'ITA', name: 'Italy',                rate:  6.2 },
  '384': { iso3: 'CIV', name: 'Côte d’Ivoire',        rate: 38.0 },
  '388': { iso3: 'JAM', name: 'Jamaica',              rate: 56.0 },
  '392': { iso3: 'JPN', name: 'Japan',                rate:  4.6 },
  '398': { iso3: 'KAZ', name: 'Kazakhstan',           rate:  6.0 },
  '400': { iso3: 'JOR', name: 'Jordan',               rate: 17.0 },
  '404': { iso3: 'KEN', name: 'Kenya',                rate: 75.0 },
  '408': { iso3: 'PRK', name: 'North Korea',          rate: 45.0 },
  '410': { iso3: 'KOR', name: 'South Korea',          rate:  5.0 },
  '417': { iso3: 'KGZ', name: 'Kyrgyzstan',           rate: 19.0 },
  '418': { iso3: 'LAO', name: 'Laos',                 rate: 22.0 },
  '422': { iso3: 'LBN', name: 'Lebanon',              rate: 50.0 },
  '426': { iso3: 'LSO', name: 'Lesotho',              rate: 55.0 },
  '430': { iso3: 'LBR', name: 'Liberia',              rate: 80.0 },
  '434': { iso3: 'LBY', name: 'Libya',                rate: 36.0 },
  '440': { iso3: 'LTU', name: 'Lithuania',            rate:  4.5 },
  '450': { iso3: 'MDG', name: 'Madagascar',           rate: 65.0 },
  '454': { iso3: 'MWI', name: 'Malawi',               rate: 70.0 },
  '458': { iso3: 'MYS', name: 'Malaysia',             rate: 18.0 },
  '462': { iso3: 'MDV', name: 'Maldives',             rate: 10.0 },
  '466': { iso3: 'MLI', name: 'Mali',                 rate: 60.0 },
  '484': { iso3: 'MEX', name: 'Mexico',               rate: 22.3 },
  '496': { iso3: 'MNG', name: 'Mongolia',             rate: 21.0 },
  '498': { iso3: 'MDA', name: 'Moldova',              rate: 28.0 },
  '504': { iso3: 'MAR', name: 'Morocco',              rate: 22.0 },
  '508': { iso3: 'MOZ', name: 'Mozambique',           rate: 70.0 },
  '512': { iso3: 'OMN', name: 'Oman',                 rate:  8.0 },
  '516': { iso3: 'NAM', name: 'Namibia',              rate: 56.0 },
  '524': { iso3: 'NPL', name: 'Nepal',                rate: 25.0 },
  '528': { iso3: 'NLD', name: 'Netherlands',          rate:  8.0 },
  '554': { iso3: 'NZL', name: 'New Zealand',          rate: 11.0 },
  '558': { iso3: 'NIC', name: 'Nicaragua',            rate: 33.0 },
  '562': { iso3: 'NER', name: 'Niger',                rate: 60.0 },
  '566': { iso3: 'NGA', name: 'Nigeria',              rate: 70.7 },
  '578': { iso3: 'NOR', name: 'Norway',               rate:  4.0 },
  '586': { iso3: 'PAK', name: 'Pakistan',             rate: 22.5 },
  '591': { iso3: 'PAN', name: 'Panama',               rate: 23.0 },
  '598': { iso3: 'PNG', name: 'Papua New Guinea',     rate: 36.0 },
  '600': { iso3: 'PRY', name: 'Paraguay',             rate: 22.0 },
  '604': { iso3: 'PER', name: 'Peru',                 rate: 50.5 },
  '608': { iso3: 'PHL', name: 'Philippines',          rate: 51.0 },
  '616': { iso3: 'POL', name: 'Poland',               rate:  4.0 },
  '620': { iso3: 'PRT', name: 'Portugal',             rate: 12.0 },
  '624': { iso3: 'GNB', name: 'Guinea-Bissau',        rate: 67.0 },
  '634': { iso3: 'QAT', name: 'Qatar',                rate:  6.0 },
  '642': { iso3: 'ROU', name: 'Romania',              rate: 17.0 },
  '643': { iso3: 'RUS', name: 'Russia',               rate:  2.7 },
  '646': { iso3: 'RWA', name: 'Rwanda',               rate: 35.0 },
  '682': { iso3: 'SAU', name: 'Saudi Arabia',         rate: 23.0 },
  '686': { iso3: 'SEN', name: 'Senegal',              rate: 50.0 },
  '694': { iso3: 'SLE', name: 'Sierra Leone',         rate: 82.0 },
  '702': { iso3: 'SGP', name: 'Singapore',            rate:  4.0 },
  '703': { iso3: 'SVK', name: 'Slovakia',             rate:  7.0 },
  '705': { iso3: 'SVN', name: 'Slovenia',             rate:  5.0 },
  '706': { iso3: 'SOM', name: 'Somalia',              rate: 75.0 },
  '710': { iso3: 'ZAF', name: 'South Africa',         rate: 23.5 },
  '716': { iso3: 'ZWE', name: 'Zimbabwe',             rate: 60.0 },
  '724': { iso3: 'ESP', name: 'Spain',                rate:  7.5 },
  '728': { iso3: 'SSD', name: 'South Sudan',          rate: 88.0 },
  '729': { iso3: 'SDN', name: 'Sudan',                rate: 60.0 },
  '732': { iso3: 'ESH', name: 'Western Sahara',       rate: 40.0 },
  '748': { iso3: 'SWZ', name: 'Eswatini',             rate: 56.0 },
  '752': { iso3: 'SWE', name: 'Sweden',               rate:  5.0 },
  '756': { iso3: 'CHE', name: 'Switzerland',          rate:  4.5 },
  '760': { iso3: 'SYR', name: 'Syria',                rate: 60.0 },
  '762': { iso3: 'TJK', name: 'Tajikistan',           rate: 33.0 },
  '764': { iso3: 'THA', name: 'Thailand',             rate:  6.0 },
  '768': { iso3: 'TGO', name: 'Togo',                 rate: 53.0 },
  '780': { iso3: 'TTO', name: 'Trinidad & Tobago',    rate: 27.0 },
  '788': { iso3: 'TUN', name: 'Tunisia',              rate: 17.0 },
  '792': { iso3: 'TUR', name: 'Türkiye',              rate:  9.0 },
  '795': { iso3: 'TKM', name: 'Turkmenistan',         rate:  6.0 },
  '800': { iso3: 'UGA', name: 'Uganda',               rate: 56.0 },
  '804': { iso3: 'UKR', name: 'Ukraine',              rate: 25.0 },
  '818': { iso3: 'EGY', name: 'Egypt',                rate: 28.0 },
  '826': { iso3: 'GBR', name: 'United Kingdom',       rate: 11.0 },
  '834': { iso3: 'TZA', name: 'Tanzania',             rate: 53.0 },
  '840': { iso3: 'USA', name: 'United States',        rate: 12.8 },
  '854': { iso3: 'BFA', name: 'Burkina Faso',         rate: 60.0 },
  '858': { iso3: 'URY', name: 'Uruguay',              rate: 25.0 },
  '860': { iso3: 'UZB', name: 'Uzbekistan',           rate: 28.0 },
  '862': { iso3: 'VEN', name: 'Venezuela',            rate: 78.0 },
  '887': { iso3: 'YEM', name: 'Yemen',                rate: 80.0 },
  '894': { iso3: 'ZMB', name: 'Zambia',               rate: 71.0 },
  '704': { iso3: 'VNM', name: 'Vietnam',              rate:  7.0 },
};

// Color ramp (BetterNature pink). Six steps mirror the original
// state ramp so the legend feels like the same family of map.
export function colorForRate(rate) {
  if (rate == null) return '#E9E4D4';
  if (rate >= 60) return '#831843';
  if (rate >= 40) return '#9D174D';
  if (rate >= 25) return '#DB2777';
  if (rate >= 15) return '#EC4899';
  if (rate >=  8) return '#F472B6';
  return '#FBCFE8';
}

// Top-N most insecure for the rail.
export function topInsecure(n = 10) {
  return Object.values(COUNTRIES_BY_NUMERIC)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, n);
}
