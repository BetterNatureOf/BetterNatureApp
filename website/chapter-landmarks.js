// Curated city photographs. Sources and reuse details: images/chapters/sources.json
const LANDMARKS = {
  "bangalore": {
    "title": "Bangalore Palace",
    "source": "https://commons.wikimedia.org/wiki/File:Bengaluru_Palace_Front_part.jpg",
    "author": "Shubham Shah",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "image": "images/chapters/bangalore.jpg",
    "thumbnail": "images/chapters/bangalore-thumb.jpg",
    "countries": [
      "india",
      "in",
      "ind"
    ]
  },
  "college-station": {
    "title": "Kyle Field",
    "source": "https://commons.wikimedia.org/wiki/File:Kyle_Field_Panorama.jpg",
    "author": "Janreagan at English Wikipedia",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "image": "images/chapters/college-station.jpg",
    "thumbnail": "images/chapters/college-station-thumb.jpg",
    "countries": [
      "united states",
      "us",
      "usa"
    ]
  },
  "cuenca": {
    "title": "New Cathedral of Cuenca",
    "source": "https://commons.wikimedia.org/wiki/File:Catedral_de_la_Inmaculada_Concepci%C3%B3n,_Cuenca.jpg",
    "author": "Bernard Gagnon",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "image": "images/chapters/cuenca.jpg",
    "thumbnail": "images/chapters/cuenca-thumb.jpg",
    "countries": [
      "ecuador",
      "ec",
      "ecu"
    ]
  },
  "guatemala-city": {
    "title": "National Palace (Guatemala)",
    "source": "https://commons.wikimedia.org/wiki/File:20230914_GG_IZADA_DE_LA_BANDERA_NACIONAL_1_(2).jpg",
    "author": "Gobierno de Guatemala",
    "license": "Public domain",
    "licenseUrl": "",
    "image": "images/chapters/guatemala-city.jpg",
    "thumbnail": "images/chapters/guatemala-city-thumb.jpg",
    "countries": [
      "guatemala",
      "gt",
      "gtm"
    ]
  },
  "memphis": {
    "title": "Hernando de Soto Bridge",
    "source": "https://commons.wikimedia.org/wiki/File:HernandoDeSoto_Bridge_Pyramid.jpg",
    "author": "Trevor Birchett",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "image": "images/chapters/memphis.jpg",
    "thumbnail": "images/chapters/memphis-thumb.jpg",
    "countries": [
      "united states",
      "us",
      "usa"
    ]
  },
  "montevideo": {
    "title": "Palacio Salvo",
    "source": "https://commons.wikimedia.org/wiki/File:Palacio_Salvo_9.jpg",
    "author": "Rarrillaga86",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "image": "images/chapters/montevideo.jpg",
    "thumbnail": "images/chapters/montevideo-thumb.jpg",
    "countries": [
      "uruguay",
      "uy",
      "ury"
    ]
  },
  "murfreesboro": {
    "title": "Rutherford County Courthouse (Tennessee)",
    "source": "https://commons.wikimedia.org/wiki/File:Rutherford_county_courthouse_9736.JPG",
    "author": "Pollinator at en.wikipedia",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "http://creativecommons.org/licenses/by-sa/3.0/",
    "image": "images/chapters/murfreesboro.jpg",
    "thumbnail": "images/chapters/murfreesboro-thumb.jpg",
    "countries": [
      "united states",
      "us",
      "usa"
    ]
  },
  "orlando": {
    "title": "Lake Eola Park",
    "source": "https://commons.wikimedia.org/wiki/File:Lakeeola_09232006_trees.jpg",
    "author": "Cwolfsheep at English Wikipedia",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "http://creativecommons.org/licenses/by-sa/3.0/",
    "image": "images/chapters/orlando.jpg",
    "thumbnail": "images/chapters/orlando-thumb.jpg",
    "countries": [
      "united states",
      "us",
      "usa"
    ]
  },
  "santiago": {
    "title": "La Moneda Palace",
    "source": "https://commons.wikimedia.org/wiki/File:Palacio_de_La_Moneda_-_miguelreflex.jpg",
    "author": "Miguel hernandez",
    "license": "CC BY-SA 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0",
    "image": "images/chapters/santiago.jpg",
    "thumbnail": "images/chapters/santiago-thumb.jpg",
    "countries": [
      "chile",
      "cl",
      "chl"
    ]
  },
  "sugarland": {
    "title": "City Hall at Sugar Land Town Square",
    "source": "https://commons.wikimedia.org/wiki/File:SugarLandTXCityHall.JPG",
    "author": "WhisperToMe",
    "license": "Public domain",
    "licenseUrl": "",
    "image": "images/chapters/sugarland.jpg",
    "thumbnail": "images/chapters/sugarland-thumb.jpg",
    "countries": [
      "united states",
      "us",
      "usa"
    ]
  },
  "valparaiso": {
    "title": "Monument to the Heroes of Iquique",
    "source": "https://commons.wikimedia.org/wiki/File:Monumento_a_los_h%C3%A9roes_de_Iquique,_Valpara%C3%ADso,_Chile1.jpg",
    "author": "Diego Delso",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "image": "images/chapters/valparaiso.jpg",
    "thumbnail": "images/chapters/valparaiso-thumb.jpg",
    "countries": [
      "chile",
      "cl",
      "chl"
    ]
  }
};
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function chapterLandmark(chapter) {
  let city = normalize(chapter.city || chapter.name).replace(/chapter$/, '');
  if (city === 'bengaluru') city = 'bangalore';
  const entry = Object.entries(LANDMARKS).find(([key]) => normalize(key) === city)?.[1];
  return entry && entry.countries.some(country => normalize(country) === normalize(chapter.country)) ? entry : null;
}
