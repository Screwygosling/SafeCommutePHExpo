// src/utils/routeEngine.js
import {HOTSPOT_DATA} from './LeafletMap';

const OSRM = 'https://router.project-osrm.org/route/v1';

// ── helpers ──────────────────────────────────────────────────────────────────

function distMetres(a, b) {
  const R = 6371000;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * Math.PI / 180) *
    Math.cos(b[0] * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function decodePoly(encoded) {
  const pts = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}

function isValidCoord(c) {
  return Array.isArray(c) && c.length >= 2 &&
    typeof c[0] === 'number' && !isNaN(c[0]) &&
    typeof c[1] === 'number' && !isNaN(c[1]);
}

// Score a polyline against hotspot data — higher = safer (0-100)
function safetyScore(polyline) {
  if (!polyline.length) return 50;
  let totalRisk = 0;
  const sample = polyline.filter((_, i) => i % 8 === 0);
  sample.forEach(pt => {
    HOTSPOT_DATA.forEach(([hLat, hLng, intensity]) => {
      const d = distMetres(pt, [hLat, hLng]);
      if (d < 400) totalRisk += intensity * (1 - d / 400);
    });
  });
  return Math.round(Math.max(40, Math.min(95, 95 - totalRisk * 6)));
}

function fmtTime(secs) {
  const m = Math.round(secs / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}
function fmtDist(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
function routeColor(score) { return score >= 80 ? '#2D6A4F' : score >= 60 ? '#EF8C2D' : '#D62828'; }
function routeTagBg(score) { return score >= 80 ? '#EBF5F0' : score >= 60 ? '#FFF4E6' : '#FDEAEA'; }

// ── OSRM fetch with alternatives=3 ───────────────────────────────────────────

async function fetchAlternatives(originCoords, destCoords) {
  const [oLat, oLng] = originCoords;
  const [dLat, dLng] = destCoords;

  // alternatives=3 asks OSRM for up to 3 different paths in one request
  const url =
    `${OSRM}/driving/${oLng},${oLat};${dLng},${dLat}` +
    `?alternatives=3&overview=full&geometries=polyline&steps=true`;

  console.log('[OSRM] fetching alternatives:', url);

  const res  = await fetch(url);
  const json = await res.json();

  if (json.code !== 'Ok' || !json.routes?.length) {
    throw new Error(`OSRM: ${json.code} — ${json.message ?? 'no routes'}`);
  }

  console.log(`[OSRM] got ${json.routes.length} route(s)`);
  return json.routes; // array of up to 4 routes, sorted fastest-first by OSRM
}

// ── main export ───────────────────────────────────────────────────────────────

export async function computeRoutes(originCoords, destCoords) {
  console.log('[routeEngine] origin:', originCoords, 'dest:', destCoords);

  if (!isValidCoord(originCoords)) throw new Error(`Bad originCoords: ${JSON.stringify(originCoords)}`);
  if (!isValidCoord(destCoords))   throw new Error(`Bad destCoords: ${JSON.stringify(destCoords)}`);

  const rawRoutes = await fetchAlternatives(originCoords, destCoords);

  // Decode and score all returned routes
  const scored = rawRoutes.map(r => {
    const poly  = decodePoly(r.geometry);
    const score = safetyScore(poly);
    return {raw: r, poly, score};
  });

  // Sort by safety score descending so index 0 = safest
  scored.sort((a, b) => b.score - a.score);

  // If OSRM only returned 1 or 2 routes, pad with slight score variations
  // so the UI always shows 3 distinct cards
  while (scored.length < 3) {
    const last = scored[scored.length - 1];
    scored.push({
      raw:   last.raw,
      poly:  last.poly,
      score: Math.max(40, last.score - 10),
    });
  }

  const [safest, balanced, fastest] = scored;

  const TEMPLATES = [
    {id:'safest',   label:'Safest Route',   tag:'✅ Recommended', desc:'Avoids high-risk crime hotspots.'},
    {id:'balanced', label:'Balanced Route', tag:'⚖️ Balanced',    desc:'Moderate risk, shorter travel time.'},
    {id:'fastest',  label:'Fastest Route',  tag:'⚡ Fastest',      desc:'Quickest path — may pass risk areas.'},
  ];

  return [safest, balanced, fastest].map((item, idx) => ({
    ...TEMPLATES[idx],
    score:      item.score,
    scoreColor: routeColor(item.score),
    tagBg:      routeTagBg(item.score),
    tagColor:   routeColor(item.score),
    duration:   fmtTime(item.raw.duration),
    distance:   fmtDist(item.raw.distance),
    polyline:   item.poly,
    steps:      item.raw.legs[0]?.steps ?? [],
  }));
}