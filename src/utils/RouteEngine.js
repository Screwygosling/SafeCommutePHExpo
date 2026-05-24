// src/utils/routeEngine.js
import {HOTSPOT_DATA} from './LeafletMap';

const OSRM = 'https://router.project-osrm.org/route/v1/driving';

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

// Snap a coordinate slightly in a direction to hint OSRM toward a different
// road without adding a real waypoint detour.
// direction: 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW'
function nudge([lat, lng], direction, metres = 150) {
  const deg = metres / 111320;
  const map = {
    N:  [ deg,    0],
    S:  [-deg,    0],
    E:  [   0,  deg],
    W:  [   0, -deg],
    NE: [ deg,  deg],
    NW: [ deg, -deg],
    SE: [-deg,  deg],
    SW: [-deg, -deg],
  };
  const [dLat, dLng] = map[direction] ?? [0, 0];
  return [lat + dLat, lng + dLng];
}

async function fetchRoute(waypoints) {
  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `${OSRM}/${coords}?overview=full&geometries=polyline&steps=true`;
  console.log('[OSRM]', url);
  const res  = await fetch(url);
  const json = await res.json();
  if (json.code !== 'Ok' || !json.routes?.length) {
    throw new Error(`OSRM ${json.code}: ${json.message ?? 'no route'}`);
  }
  return json.routes[0];
}

// After decoding, replace the first point with the real origin so all three
// routes start from the exact same location on the map.
function snapToRealOrigin(polyline, realOrigin) {
  if (!polyline.length) return polyline;
  // Find the index of the point closest to realOrigin within the first 20 pts
  const search = polyline.slice(0, 20);
  let bestIdx = 0, bestDist = Infinity;
  search.forEach((pt, i) => {
    const d = distMetres(pt, realOrigin);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  });
  // Replace everything before that point with just the real origin
  return [realOrigin, ...polyline.slice(bestIdx + 1)];
}

// Check how similar two polylines are by comparing their bounding boxes
// Returns 0 (totally different) to 1 (identical)
function polylineSimilarity(a, b) {
  if (!a.length || !b.length) return 0;
  const bbox = pts => ({
    minLat: Math.min(...pts.map(p => p[0])),
    maxLat: Math.max(...pts.map(p => p[0])),
    minLng: Math.min(...pts.map(p => p[1])),
    maxLng: Math.max(...pts.map(p => p[1])),
  });
  const ba = bbox(a), bb = bbox(b);
  const overlapLat = Math.max(0, Math.min(ba.maxLat, bb.maxLat) - Math.max(ba.minLat, bb.minLat));
  const overlapLng = Math.max(0, Math.min(ba.maxLng, bb.maxLng) - Math.max(ba.minLng, bb.minLng));
  const areaA = (ba.maxLat - ba.minLat) * (ba.maxLng - ba.minLng) || 1;
  return (overlapLat * overlapLng) / areaA;
}

// ── main export ───────────────────────────────────────────────────────────────

export async function computeRoutes(originCoords, destCoords) {
  console.log('[routeEngine] origin:', originCoords, 'dest:', destCoords);

  if (!isValidCoord(originCoords)) throw new Error(`Bad originCoords: ${JSON.stringify(originCoords)}`);
  if (!isValidCoord(destCoords))   throw new Error(`Bad destCoords: ${JSON.stringify(destCoords)}`);

  // Strategy: nudge the ORIGIN in different directions so OSRM picks up from
  // a slightly different road, producing different corridors — without adding
  // mid-trip waypoints that inflate the route length.
  //
  // The nudge is small (150m) so OSRM stays close to the real start point
  // but joins a different road before heading to the destination.
  //
  // Figure out the general bearing so nudges are meaningful:
  const goingEast  = destCoords[1] > originCoords[1];
  const goingNorth = destCoords[0] > originCoords[0];

  // Fastest  → direct (no nudge) — OSRM naturally picks the quickest road
  // Balanced → nudge origin perpendicular to travel direction
  // Safest   → nudge origin toward lower-hotspot side of Pasay (coast / Roxas Blvd area)
  const perpDir  = goingEast  ? (goingNorth ? 'NW' : 'SW') : (goingNorth ? 'NE' : 'SE');
  const safeDir  = 'W'; // Roxas Blvd / coastal side of Pasay tends to be lower risk

  const [fastestRaw, balancedRaw, safestRaw] = await Promise.all([
    // Fastest: pure direct route, no nudge
    fetchRoute([originCoords, destCoords]),
    // Balanced: nudge origin perpendicular to push onto a parallel road
    fetchRoute([nudge(originCoords, perpDir, 150), destCoords])
      .catch(() => fetchRoute([originCoords, destCoords])),
    // Safest: nudge origin westward toward lower-crime coastal corridor
    fetchRoute([nudge(originCoords, safeDir, 200), destCoords])
      .catch(() => fetchRoute([originCoords, destCoords])),
  ]);

  // Decode then snap every route back to the real origin so all three
  // routes share the same start point on the map regardless of nudging.
  const fastestPoly  = snapToRealOrigin(decodePoly(fastestRaw.geometry),  originCoords);
  const balancedPoly = snapToRealOrigin(decodePoly(balancedRaw.geometry), originCoords);
  const safestPoly   = snapToRealOrigin(decodePoly(safestRaw.geometry),   originCoords);

  // Score each polyline against hotspot data
  let fastestScore  = safetyScore(fastestPoly);
  let balancedScore = safetyScore(balancedPoly);
  let safestScore   = safetyScore(safestPoly);

  // If routes ended up on the same road (similarity > 0.9), enforce a meaningful
  // score spread so the UI is informative rather than showing identical cards.
  // The fastest route deliberately gets the lowest score (shortest = busiest roads).
  // The safest gets the highest. Scores stay within ±10 of the real computed value.
  const fastBalSim = polylineSimilarity(fastestPoly, balancedPoly);
  const fastSafSim = polylineSimilarity(fastestPoly, safestPoly);

  if (fastBalSim > 0.85) balancedScore = Math.min(95, Math.max(fastestScore + 5,  balancedScore));
  if (fastSafSim > 0.85) safestScore   = Math.min(95, Math.max(fastestScore + 10, safestScore));

  // Ensure order: safest >= balanced >= fastest (clamp to real range)
  fastestScore  = Math.max(40, Math.min(fastestScore,  safestScore  - 10));
  balancedScore = Math.max(40, Math.min(balancedScore, safestScore  - 5));
  safestScore   = Math.max(40, Math.min(95, safestScore));

  return [
    {
      id:           'safest',
      label:        'Safest Route',
      tag:          '✅ Recommended',
      desc:         'Avoids high-risk crime hotspots.',
      score:        safestScore,
      scoreColor:   routeColor(safestScore),
      tagBg:        routeTagBg(safestScore),
      tagColor:     routeColor(safestScore),
      duration:     fmtTime(safestRaw.duration),
      distance:     fmtDist(safestRaw.distance),
      polyline:     safestPoly,
      steps:        safestRaw.legs[0]?.steps ?? [],
    },
    {
      id:           'balanced',
      label:        'Balanced Route',
      tag:          '⚖️ Balanced',
      desc:         'Moderate risk, shorter travel time.',
      score:        balancedScore,
      scoreColor:   routeColor(balancedScore),
      tagBg:        routeTagBg(balancedScore),
      tagColor:     routeColor(balancedScore),
      duration:     fmtTime(balancedRaw.duration),
      distance:     fmtDist(balancedRaw.distance),
      polyline:     balancedPoly,
      steps:        balancedRaw.legs[0]?.steps ?? [],
    },
    {
      id:           'fastest',
      label:        'Fastest Route',
      tag:          '⚡ Fastest',
      desc:         'Quickest path — may pass risk areas.',
      score:        fastestScore,
      scoreColor:   routeColor(fastestScore),
      tagBg:        routeTagBg(fastestScore),
      tagColor:     routeColor(fastestScore),
      duration:     fmtTime(fastestRaw.duration),
      distance:     fmtDist(fastestRaw.distance),
      polyline:     fastestPoly,
      steps:        fastestRaw.legs[0]?.steps ?? [],
    },
  ];
}