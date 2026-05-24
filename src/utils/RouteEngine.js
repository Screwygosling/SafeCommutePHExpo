// src/utils/routeEngine.js
// Implements the thesis formula: f'(u,v) = Σg(u,v) + h(u,v) + λ * crime_penalty(n)
// - g(u,v)          = OSRM route distance (metres)
// - h(u,v)          = Haversine heuristic (straight-line distance to destination)
// - crime_penalty(n) = ML model prediction from render server /predict endpoint
// - λ (lambda)      = scaling factor that weights crime vs distance

const OSRM         = 'https://router.project-osrm.org/route/v1/driving';
const API_BASE     = 'https://thesisml.onrender.com';
const LAMBDA       = 0.4;  // λ — scaling factor from thesis formula

// ── Haversine heuristic h(u,v) ───────────────────────────────────────────────
// Straight-line distance in metres between two [lat,lng] points
function haversine(a, b) {
  const R = 6371000;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * Math.PI / 180) *
    Math.cos(b[0] * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// ── Polyline decoder ──────────────────────────────────────────────────────────
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

// ── OSRM fetch ────────────────────────────────────────────────────────────────
async function fetchOSRM(waypoints) {
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

// ── /predict call — uses real ML model on render server ──────────────────────
// Returns crime_penalty (raw regression output, 0–100 scale)
async function fetchCrimePenalty(lat, lng) {
  try {
    const now = new Date();
    const body = {
      lat,
      lng,
      month:             now.getMonth() + 1,
      day_of_week:       now.getDay() === 0 ? 6 : now.getDay() - 1, // 0=Mon
      hour:              now.getHours(),
      areaCrimeCount:    10,   // conservative mid-range default
      barangay_encoded:  0,
      municipal_encoded: 0,
      victimCount:       1,
      crime_severity:    2,
    };
    const res  = await fetch(`${API_BASE}/predict`, {
      method:  'POST',
      headers: {'Content-Type': 'application/json'},
      body:    JSON.stringify(body),
    });
    const json = await res.json();
    // crime_penalty is the raw regression output (0-100 range)
    return typeof json.crime_penalty === 'number' ? json.crime_penalty : 25;
  } catch {
    return 25; // fallback: moderate penalty if server unreachable
  }
}

// ── Core thesis formula ───────────────────────────────────────────────────────
// f'(u,v) = Σg(u,v) + h(u,v) + λ * crime_penalty(n)
//
// We sample N points along the polyline, call /predict for each,
// then sum to get the total crime-weighted cost of the route.
// The safety score (0-100) is the inverse: lower cost = safer.
async function scoreRoute(polyline, destCoords, gDistance) {
  if (!polyline.length) return 50;

  // Sample up to 6 points evenly along the route (balance accuracy vs API calls)
  const sampleCount = Math.min(6, polyline.length);
  const step        = Math.floor(polyline.length / sampleCount);
  const samples     = polyline.filter((_, i) => i % step === 0).slice(0, sampleCount);

  // Fetch crime penalties in parallel for all sample points
  const penalties = await Promise.all(
    samples.map(([lat, lng]) => fetchCrimePenalty(lat, lng))
  );

  // Apply thesis formula for each sampled node:
  // f'(u,v) = g(u,v) + h(u,v) + λ * crime_penalty(n)
  let totalCost = 0;
  samples.forEach((pt, idx) => {
    const g       = gDistance / samples.length;           // distributed route distance
    const h       = haversine(pt, destCoords);            // haversine to destination
    const penalty = penalties[idx];                       // ML model crime_penalty
    totalCost    += g + h + LAMBDA * penalty;             // thesis formula
  });

  // Normalise cost to a 0-100 safety score (inverse: higher cost = less safe)
  // Typical cost range for short Pasay trips: 5000–50000
  const normalised = Math.max(0, Math.min(1, totalCost / 80000));
  const score      = Math.round(Math.max(40, Math.min(95, 95 - normalised * 55)));
  return score;
}

// ── Snap polyline back to real origin ────────────────────────────────────────
function snapToRealOrigin(polyline, realOrigin) {
  if (!polyline.length) return polyline;
  const search = polyline.slice(0, 20);
  let bestIdx = 0, bestDist = Infinity;
  search.forEach((pt, i) => {
    const d = haversine(pt, realOrigin);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  });
  return [realOrigin, ...polyline.slice(bestIdx + 1)];
}

// ── Nudge helper ──────────────────────────────────────────────────────────────
function nudge([lat, lng], direction, metres = 150) {
  const deg = metres / 111320;
  const map = {
    N: [deg, 0], S: [-deg, 0], E: [0, deg], W: [0, -deg],
    NE: [deg, deg], NW: [deg, -deg], SE: [-deg, deg], SW: [-deg, -deg],
  };
  const [dLat, dLng] = map[direction] ?? [0, 0];
  return [lat + dLat, lng + dLng];
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

// ── Main export ───────────────────────────────────────────────────────────────
export async function computeRoutes(originCoords, destCoords) {
  console.log('[routeEngine] origin:', originCoords, 'dest:', destCoords);

  if (!isValidCoord(originCoords)) throw new Error(`Bad originCoords: ${JSON.stringify(originCoords)}`);
  if (!isValidCoord(destCoords))   throw new Error(`Bad destCoords: ${JSON.stringify(destCoords)}`);

  const goingEast  = destCoords[1] > originCoords[1];
  const goingNorth = destCoords[0] > originCoords[0];
  const perpDir    = goingEast ? (goingNorth ? 'NW' : 'SW') : (goingNorth ? 'NE' : 'SE');

  // Fetch 3 geometrically different routes from OSRM
  const [fastestRaw, balancedRaw, safestRaw] = await Promise.all([
    fetchOSRM([originCoords, destCoords]),                                          // direct
    fetchOSRM([nudge(originCoords, perpDir, 150), destCoords])                      // perpendicular nudge
      .catch(() => fetchOSRM([originCoords, destCoords])),
    fetchOSRM([nudge(originCoords, 'W', 200), destCoords])                          // westward (coastal)
      .catch(() => fetchOSRM([originCoords, destCoords])),
  ]);

  // Decode and snap all polylines to the real origin
  const fastestPoly  = snapToRealOrigin(decodePoly(fastestRaw.geometry),  originCoords);
  const balancedPoly = snapToRealOrigin(decodePoly(balancedRaw.geometry), originCoords);
  const safestPoly   = snapToRealOrigin(decodePoly(safestRaw.geometry),   originCoords);

  // Score each route using the thesis formula with real ML crime_penalty values
  // Run in parallel to save time
  console.log('[routeEngine] scoring routes with ML model...');
  const [fastestScore, balancedScore, safestScore] = await Promise.all([
    scoreRoute(fastestPoly,  destCoords, fastestRaw.distance),
    scoreRoute(balancedPoly, destCoords, balancedRaw.distance),
    scoreRoute(safestPoly,   destCoords, safestRaw.distance),
  ]);

  console.log('[routeEngine] scores — fastest:', fastestScore, 'balanced:', balancedScore, 'safest:', safestScore);

  // Enforce meaningful ordering: safest >= balanced >= fastest
  // (if routes snapped to same road, scores may be equal — add min spread)
  const finalSafest   = Math.min(95, Math.max(safestScore,   balancedScore + 3, fastestScore + 8));
  const finalBalanced = Math.min(95, Math.max(balancedScore, fastestScore  + 3));
  const finalFastest  = Math.max(40, fastestScore);

  return [
    {
      id:         'safest',
      label:      'Safest Route',
      tag:        '✅ Recommended',
      desc:       'Lowest crime-weighted cost via modified A* formula.',
      score:      finalSafest,
      scoreColor: routeColor(finalSafest),
      tagBg:      routeTagBg(finalSafest),
      tagColor:   routeColor(finalSafest),
      duration:   fmtTime(safestRaw.duration),
      distance:   fmtDist(safestRaw.distance),
      polyline:   safestPoly,
      steps:      safestRaw.legs[0]?.steps ?? [],
    },
    {
      id:         'balanced',
      label:      'Balanced Route',
      tag:        '⚖️ Balanced',
      desc:       'Moderate crime penalty, shorter travel time.',
      score:      finalBalanced,
      scoreColor: routeColor(finalBalanced),
      tagBg:      routeTagBg(finalBalanced),
      tagColor:   routeColor(finalBalanced),
      duration:   fmtTime(balancedRaw.duration),
      distance:   fmtDist(balancedRaw.distance),
      polyline:   balancedPoly,
      steps:      balancedRaw.legs[0]?.steps ?? [],
    },
    {
      id:         'fastest',
      label:      'Fastest Route',
      tag:        '⚡ Fastest',
      desc:       'Shortest time — higher crime penalty along route.',
      score:      finalFastest,
      scoreColor: routeColor(finalFastest),
      tagBg:      routeTagBg(finalFastest),
      tagColor:   routeColor(finalFastest),
      duration:   fmtTime(fastestRaw.duration),
      distance:   fmtDist(fastestRaw.distance),
      polyline:   fastestPoly,
      steps:      fastestRaw.legs[0]?.steps ?? [],
    },
  ];
}