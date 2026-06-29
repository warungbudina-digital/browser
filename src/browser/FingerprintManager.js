// Seeded PRNG (mulberry32) — menghasilkan fingerprint konsisten per nama profile
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
];

const GEOLOCATIONS = [
  { latitude: -6.2088, longitude: 106.8456 },  // Jakarta Pusat
  { latitude: -6.3728, longitude: 106.8347 },  // Jakarta Selatan
  { latitude: -6.9175, longitude: 107.6191 },  // Bandung
  { latitude: -7.2575, longitude: 112.7521 },  // Surabaya
  { latitude: -6.9934, longitude: 110.4203 },  // Semarang
];

export class FingerprintManager {
  static generate(profileName) {
    const rand = seededRandom(hashString(String(profileName)));
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];

    return {
      userAgent: pick(USER_AGENTS),
      viewport: pick(VIEWPORTS),
      locale: 'id-ID',
      timezoneId: 'Asia/Jakarta',
      geolocation: { ...pick(GEOLOCATIONS), accuracy: 50 + Math.floor(rand() * 100) },
      colorScheme: 'light',
      deviceScaleFactor: 1,
    };
  }
}
