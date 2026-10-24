// src/utils/RouteEngine.js
// Calls the thesis ML server for crime-weighted A* routing
// Falls back to OSRM-based scoring if server is unavailable

const API_BASE  = 'https://thesisml.onrender.com';
const OSRM_BASE = 'https://router.project-osrm.org/route/v1';

function osrmUrlFor(mode) {
  return mode === 'walking' ? `${OSRM_BASE}/foot` : `${OSRM_BASE}/driving`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isValidCoord(c) {
  return Array.isArray(c) && c.length >= 2 &&
    typeof c[0] === 'number' && !isNaN(c[0]) &&
    typeof c[1] === 'number' && !isNaN(c[1]);
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

// ── Primary: call /safe-route on thesis ML server ─────────────────────────────
async function fetchFromServer(originCoords, destCoords, mode = 'driving') {
  const res  = await fetch(`${API_BASE}/safe-route`, {
    method:  'POST',
    headers: {'Content-Type': 'application/json'},
    body:    JSON.stringify({
      origin_lat: originCoords[0],
      origin_lng: originCoords[1],
      dest_lat:   destCoords[0],
      dest_lng:   destCoords[1],
      mode,
    }),
  });

  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.routes;
}

// ── Fallback: OSRM + crime scoring ───────────────────────────────────────────
function haversine(a, b) {
  const R    = 6371000;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const s    = Math.min(1, Math.max(0,
    Math.sin(dLat/2)**2 +
    Math.cos(a[0]*Math.PI/180) * Math.cos(b[0]*Math.PI/180) *
    Math.sin(dLng/2)**2
  ));
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
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

function getCrimePenalty(point, heatmapPoints) {
  if (!heatmapPoints || !heatmapPoints.length) return 40;
  let best = 40, bestD = Infinity;
  heatmapPoints.forEach(b => {
    const d = haversine(point, [b.lat, b.lng]);
    if (d < bestD) { bestD = d; best = b.crime_penalty; }
  });
  return bestD < 600 ? best : 40;
}

function snapToOrigin(poly, origin) {
  if (!poly.length) return poly;
  let bestIdx = 0, bestD = Infinity;
  poly.slice(0, 20).forEach((pt, i) => {
    const d = haversine(pt, origin);
    if (d < bestD) { bestD = d; bestIdx = i; }
  });
  return [origin, ...poly.slice(bestIdx + 1)];
}

function nudge([lat, lng], dir, m = 150) {
  const d = m / 111320;
  const offsets = {N:[d,0],S:[-d,0],E:[0,d],W:[0,-d],NE:[d,d],NW:[d,-d],SE:[-d,d],SW:[-d,-d]};
  const [dLat, dLng] = offsets[dir] ?? [0,0];
  return [lat+dLat, lng+dLng];
}

async function fetchOSRM(waypoints, mode = 'driving') {
  const coords = waypoints.map(([lat,lng]) => `${lng},${lat}`).join(';');
  const res    = await fetch(`${osrmUrlFor(mode)}/${coords}?overview=full&geometries=polyline&steps=true`);
  const json   = await res.json();
  if (json.code !== 'Ok' || !json.routes?.length) throw new Error('OSRM no route');
  return json.routes[0];
}

function scoreRoute(poly, dest, dist, heatmapPoints) {
  if (!poly.length) return 999999;
  const n     = Math.min(8, poly.length);
  const step  = Math.max(1, Math.floor(poly.length / n));
  const samp  = [];
  for (let i = 0; i < poly.length && samp.length < n; i += step) samp.push(poly[i]);

  let cost = 0;
  const segDist = dist / samp.length;
  samp.forEach(pt => {
    cost += segDist + haversine(pt, dest) + 0.015 * getCrimePenalty(pt, heatmapPoints) * 1000;
  });
  return cost;
}

function costsToScores(costs) {
  const min = Math.min(...costs), max = Math.max(...costs);
  const rng = (max - min) || 1;
  return costs.map(c => Math.round(90 - ((c - min) / rng) * 35));
}

async function fetchFallbackRoutes(originCoords, destCoords, heatmapPoints, mode = 'driving') {
  const goE   = destCoords[1] > originCoords[1];
  const goN   = destCoords[0] > originCoords[0];
  const perp  = goE ? (goN ? 'NW' : 'SW') : (goN ? 'NE' : 'SE');

  const [r1, r2, r3] = await Promise.all([
    fetchOSRM([originCoords, destCoords], mode),
    fetchOSRM([nudge(originCoords, perp, 150), destCoords], mode).catch(() => fetchOSRM([originCoords, destCoords], mode)),
    fetchOSRM([nudge(originCoords, 'W', 200), destCoords], mode).catch(() => fetchOSRM([originCoords, destCoords], mode)),
  ]);

  const p1 = snapToOrigin(decodePoly(r1.geometry), originCoords);
  const p2 = snapToOrigin(decodePoly(r2.geometry), originCoords);
  const p3 = snapToOrigin(decodePoly(r3.geometry), originCoords);

  const costs   = [r1, r2, r3].map((r, i) => scoreRoute([p1,p2,p3][i], destCoords, r.distance, heatmapPoints));
  const cands   = [{raw:r1,poly:p1},{raw:r2,poly:p2},{raw:r3,poly:p3}]
    .map((c,i) => ({...c, cost:costs[i]}))
    .sort((a,b) => a.cost - b.cost);
  const scores  = costsToScores(cands.map(c => c.cost));

  const TMPL = [
    {id:'safest',   label:'Safest Route',   tag:'✅ Recommended', desc:'Lowest crime-weighted cost.'},
    {id:'balanced', label:'Balanced Route', tag:'⚖️ Balanced',    desc:'Moderate crime penalty.'},
    {id:'fastest',  label:'Fastest Route',  tag:'⚡ Fastest',      desc:'Shortest time, higher crime risk.'},
  ];

  return cands.map((c, i) => ({
    ...TMPL[i],
    score:      scores[i],
    scoreColor: routeColor(scores[i]),
    tagBg:      routeTagBg(scores[i]),
    tagColor:   routeColor(scores[i]),
    duration:   fmtTime(c.raw.duration),
    distance:   fmtDist(c.raw.distance),
    polyline:   c.poly,
    steps:      c.raw.legs[0]?.steps ?? [],
  }));
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function computeRoutes(originCoords, destCoords, heatmapPoints = [], mode = 'driving') {
  console.log('[RouteEngine] origin:', originCoords, 'dest:', destCoords,
    'heatmap:', heatmapPoints.length, 'points', 'mode:', mode);

  if (!isValidCoord(originCoords)) throw new Error(`Bad originCoords: ${JSON.stringify(originCoords)}`);
  if (!isValidCoord(destCoords))   throw new Error(`Bad destCoords: ${JSON.stringify(destCoords)}`);

  // Try thesis ML server first (proper A* with crime-weighted graph)
  try {
    console.log('[RouteEngine] trying ML server...');
    const routes = await fetchFromServer(originCoords, destCoords, mode);
    console.log('[RouteEngine] ML server returned', routes.length, 'routes');

    const TMPL = [
      {id:'safest',   label:'Safest Route',   tag:'✅ Recommended', desc:'Avoids high crime-penalty roads.'},
      {id:'balanced', label:'Balanced Route', tag:'⚖️ Balanced',    desc:'Moderate crime avoidance.'},
      {id:'fastest',  label:'Fastest Route',  tag:'⚡ Fastest',      desc:'Shortest time, higher crime risk.'},
    ];

    return routes.map((r, i) => ({
      ...r,
      ...(TMPL[i] ?? {}),
      scoreColor: routeColor(r.score),
      tagBg:      routeTagBg(r.score),
      tagColor:   routeColor(r.score),
      steps:      r.steps ?? [],
    }));

  } catch (e) {
    console.warn('[RouteEngine] ML server failed, falling back to OSRM:', e.message);
    return fetchFallbackRoutes(originCoords, destCoords, heatmapPoints, mode);
  }
}