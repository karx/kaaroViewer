/**
 * locationHelper.mjs — vendor-agnostic geocoding.
 *
 * Currently backed by OpenStreetMap Nominatim.
 * Swap the implementation to Google Maps, Mapbox, etc. by replacing _geocodeNominatim.
 *
 * Rate limit: 1 req/sec (Nominatim policy).
 */

import { log } from '../../logger.mjs';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const UA = 'kaaroViewer/2.0 (karx@akriya.co.in)';

let _lastGeoReq = 0;
const GEO_GAP   = 1100; // 1.1 sec between requests

/**
 * Geocode a place name to lat/lon.
 * @param {string} label — e.g. "India", "Berlin"
 * @returns {Promise<{lat:number, lon:number, displayName:string}|null>}
 */
export async function geocode(label) {
  if (!label) return null;

  // Rate limit
  const wait = GEO_GAP - (Date.now() - _lastGeoReq);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastGeoReq = Date.now();

  return _geocodeNominatim(label);
}

// ── Nominatim backend (swappable) ─────────────────────────────────────────────

async function _geocodeNominatim(label) {
  const url = `${NOMINATIM_URL}?${new URLSearchParams({
    q: label, format: 'json', limit: '1', addressdetails: '0',
  })}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);

    const results = await res.json();
    if (!results.length) {
      log('SOURCE', `[Location] no geocode result for "${label}"`);
      return null;
    }

    const r = results[0];
    log('SOURCE', `[Location] geocoded "${label}" → ${r.lat}, ${r.lon}`);
    return {
      lat:         parseFloat(r.lat),
      lon:         parseFloat(r.lon),
      displayName: r.display_name ?? label,
    };
  } catch (err) {
    log('ERROR', `[Location] geocode failed for "${label}"`, { message: err.message });
    return null;
  }
}
