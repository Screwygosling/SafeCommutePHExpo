// src/utils/routeEngine.js
// Implements: f'(u,v) = Σg(u,v) + h(u,v) + λ * crime_penalty(n)
// crime_penalty values come from the /heatmap API (already fetched in HomeScreen)
// passed in as heatmapPoints — no extra API calls needed during routing.

const OSRM   = 'https://router.project-osrm.org/route/v1/driving';
const LAMBDA = 15; // λ scaling factor — amplified because raw penalties are 0-1 scale

// ── Haversine h(u,v) ──────────────────────────────────────────────────────────
function haversine(a, b) {
  const R    = 6371000;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const s    =
    Math.sin(dLat / 2) ** 2 +
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

// ── crime_penalty(n) from heatmap data ───────────────────────────────────────
// For a given [lat,lng] point, find the nearest barangay and return its
// crime_penalty from the API data. Influence radius: 500m (barangay-level).
function getCrimePenalty(point, heatmapPoints) {
  if (!heatmapPoints || heatmapPoints.length === 0) return 0.4; // fallback

  let nearest     = null;
  let nearestDist = Infinity;

  heatmapPoints.forEach(function(b) {
    const d = haversine(point, [b.lat, b.lng]);
    if (d < nearestDist) {
      nearestDist = d;
      nearest     = b;
    }
  });

  // Only apply penalty if within 500m of a barangay centroid
  // Beyond that, use the city average (0.4)
  if (nearestDist > 500) return 0.4;
  return nearest ? nearest.crime_penalty : 0.4;
}

// ── Apply thesis formula to score a route ────────────────────────────────────
// f'(u,v) = Σ [ g(u,v) + h(u,v) + λ * crime_penalty(n) ]
// Lower total cost = safer route
function scoreRoute(polyline, destCoords, gDistance, heatmapPoints) {
  if (!polyline.length) return {score: 50, totalCost: 999999};

  // Sample up to 8 points evenly along the route
  const sampleCount = Math.min(8, polyline.length);
  const step        = Math.max(1, Math.floor(polyline.length / sampleCount));
  const samples     = [];
  for (let i = 0; i < polyline.length; i += step) {
    samples.push(polyline[i]);
    if (samples.length >= sampleCount) break;
  }

  let totalCost = 0;
  const segDist = gDistance / samples.length; // g(u,v) per segment

  const penalties = [];
  samples.forEach(function(pt) {
    const g       = segDist;                              // distance component
    const h       = haversine(pt, destCoords);            // haversine heuristic
    const penalty = getCrimePenalty(pt, heatmapPoints);  // crime_penalty(n) from API
    const cost    = g + h + LAMBDA * penalty * 1000;     // λ * penalty (scaled to metres)
    penalties.push(penalty);
    totalCost += cost;
  });

  const avgPenalty = penalties.reduce((a, b) => a + b, 0) / penalties.length;
  const maxPenalty = Math.max(...penalties);

  console.log('[score] avgPenalty:', avgPenalty.toFixed(4),
    'maxPenalty:', maxPenalty.toFixed(4),
    'totalCost:', Math.round(totalCost));

  return {totalCost, avgPenalty, maxPenalty};
}

// ── OSRM fetch ────────────────────────────────────────────────────────────────
async function fetchOSRM(waypoints) {
  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url    = `${OSRM}/${coords}?overview=full&geometries=polyline&steps=true`;
  console.log('[OSRM]', url);
  const res    = await fetch(url);
  const json   = await res.json();
  if (json.code !== 'Ok' || !json.routes?.length) {
    throw new Error(`OSRM ${json.code}: ${json.message ?? 'no route'}`);
  }
  return json.routes[0];
}

function snapToRealOrigin(polyline, realOrigin) {
  if (!polyline.length) return polyline;
  let bestIdx = 0, bestDist = Infinity;
  polyline.slice(0, 20).forEach((pt, i) => {
    const d = haversine(pt, realOrigin);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  });
  return [realOrigin, ...polyline.slice(bestIdx + 1)];
}

function nudge([lat, lng], direction, metres = 150) {
  const deg = metres / 111320;
  const map = {
    N: [deg, 0], S: [-deg, 0], E: [0, deg], W: [0, -deg],
    NE: [deg, deg], NW: [deg, -deg], SE: [-deg, deg], SW: [-deg, -deg],
  };
  const [dLat, dLng] = map[direction] ?? [0, 0];
  return [lat + dLat, lng + dLng];
}

function fmtTime(s) {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m} min`;
}
function fmtDist(m) {
  return m >= 1000 ? `${(m/1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
function routeColor(score) { return score >= 80 ? '#2D6A4F' : score >= 60 ? '#EF8C2D' : '#D62828'; }
function routeTagBg(score) { return score >= 80 ? '#EBF5F0' : score >= 60 ? '#FFF4E6' : '#FDEAEA'; }

// ── Convert total cost → safety score (0-100, higher = safer) ────────────────
// We rank the 3 routes relative to each other so differences are always visible
function costsToScores(costs) {
  const sorted = [...costs].sort((a, b) => a - b); // ascending: lowest cost = safest
  const min    = sorted[0];
  const max    = sorted[sorted.length - 1];
  const range  = max - min || 1;

  return costs.map(cost => {
    // Invert: lowest cost → score near 90, highest → score near 55
    const normalised = (cost - min) / range;          // 0 = safest, 1 = riskiest
    return Math.round(90 - normalised * 35);           // maps to 55-90 range
  });
}

// ── Main export ───────────────────────────────────────────────────────────────
// heatmapPoints: the array from /heatmap API, passed in from HomeScreen/RouteOptions
export async function computeRoutes(originCoords, destCoords, heatmapPoints = []) {
  console.log('[routeEngine] origin:', originCoords, 'dest:', destCoords,
    'heatmap points:', heatmapPoints.length);

  if (!isValidCoord(originCoords)) throw new Error(`Bad originCoords: ${JSON.stringify(originCoords)}`);
  if (!isValidCoord(destCoords))   throw new Error(`Bad destCoords: ${JSON.stringify(destCoords)}`);

  const goingEast  = destCoords[1] > originCoords[1];
  const goingNorth = destCoords[0] > originCoords[0];
  const perpDir    = goingEast ? (goingNorth ? 'NW' : 'SW') : (goingNorth ? 'NE' : 'SE');

  // Fetch 3 geometrically different routes
  const [fastestRaw, balancedRaw, safestRaw] = await Promise.all([
    fetchOSRM([originCoords, destCoords]),
    fetchOSRM([nudge(originCoords, perpDir, 150), destCoords])
      .catch(() => fetchOSRM([originCoords, destCoords])),
    fetchOSRM([nudge(originCoords, 'W', 200), destCoords])
      .catch(() => fetchOSRM([originCoords, destCoords])),
  ]);

  const fastestPoly  = snapToRealOrigin(decodePoly(fastestRaw.geometry),  originCoords);
  const balancedPoly = snapToRealOrigin(decodePoly(balancedRaw.geometry), originCoords);
  const safestPoly   = snapToRealOrigin(decodePoly(safestRaw.geometry),   originCoords);

  // Apply thesis formula to each route using real heatmap crime_penalty values
  const fastestResult  = scoreRoute(fastestPoly,  destCoords, fastestRaw.distance,  heatmapPoints);
  const balancedResult = scoreRoute(balancedPoly, destCoords, balancedRaw.distance, heatmapPoints);
  const safestResult   = scoreRoute(safestPoly,   destCoords, safestRaw.distance,   heatmapPoints);

  // Rank by cost: lowest cost = safest
  // Sort all three and assign labels accordingly
  const candidates = [
    {raw: fastestRaw,  poly: fastestPoly,  result: fastestResult,  origLabel: 'fastest'},
    {raw: balancedRaw, poly: balancedPoly, result: balancedResult, origLabel: 'balanced'},
    {raw: safestRaw,   poly: safestPoly,   result: safestResult,   origLabel: 'safest'},
  ];

  // Sort by totalCost ascending — lowest cost route gets the "Safest" label
  candidates.sort((a, b) => a.result.totalCost - b.result.totalCost);

  const costs  = candidates.map(c => c.result.totalCost);
  const scores = costsToScores(costs);

  const TEMPLATES = [
    {
      id:    'safest',
      label: 'Safest Route',
      tag:   '✅ Recommended',
      desc:  'Lowest crime-weighted cost. Avoids high-penalty barangays.',
    },
    {
      id:    'balanced',
      label: 'Balanced Route',
      tag:   '⚖️ Balanced',
      desc:  'Moderate crime penalty, shorter travel time.',
    },
    {
      id:    'fastest',
      label: 'Fastest Route',
      tag:   '⚡ Fastest',
      desc:  'Shortest time — passes higher crime-penalty areas.',
    },
  ];

  return candidates.map((c, idx) => ({
    ...TEMPLATES[idx],
    score:      scores[idx],
    scoreColor: routeColor(scores[idx]),
    tagBg:      routeTagBg(scores[idx]),
    tagColor:   routeColor(scores[idx]),
    duration:   fmtTime(c.raw.duration),
    distance:   fmtDist(c.raw.distance),
    polyline:   c.poly,
    steps:      c.raw.legs[0]?.steps ?? [],
    // expose for debugging / thesis demo
    avgPenalty: c.result.avgPenalty,
    maxPenalty: c.result.maxPenalty,
  }));
}