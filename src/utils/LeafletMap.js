// src/utils/LeafletMap.js
// Uses OpenStreetMap + Leaflet.js — 100% FREE, no API key required.

export const MANILA_CENTER = {lat: 14.58, lng: 120.99};
export const PASAY_CENTER  = {lat: 14.5378, lng: 121.0014};

export const HOTSPOT_DATA = [
  [14.5995, 120.9842, 1.0],
  [14.5547, 121.0244, 0.9],
  [14.5764, 121.0107, 0.8],
  [14.6091, 120.9822, 0.7],
  [14.5800, 120.9800, 1.0],
  [14.5350, 121.0150, 0.6],
  [14.6200, 121.0000, 0.8],
  [14.5650, 120.9950, 0.9],
  [14.5900, 121.0100, 0.7],
  [14.5450, 120.9900, 1.0],
  [14.6100, 120.9700, 0.6],
  [14.5700, 121.0300, 0.8],
  [14.5880, 121.0050, 0.95],
  [14.5620, 120.9870, 0.85],
  [14.6050, 121.0120, 0.75],
];

export const POLICE_STATIONS = [
  {name: 'Manila Police District', lat: 14.5906, lng: 120.9810},
  {name: 'Pasay City Police',      lat: 14.5378, lng: 121.0014},
  {name: 'Makati Police Station',  lat: 14.5547, lng: 121.0244},
  {name: 'Paranaque Police',       lat: 14.4673, lng: 121.0146},
];

export function buildLeafletHTML({
  center        = MANILA_CENTER,
  zoom          = 13,
  showHeatmap   = true,
  showPolice    = false,
  showRoute     = false,
  routeCoords   = [],     // [[lat,lng], [lat,lng]] — only used as fallback
  routePolyline = [],     // [[lat,lng], ...] full decoded polyline from routeEngine
  heatmapPoints = [],
}) {
  const resolvedHeatmap = heatmapPoints.length > 0
    ? heatmapPoints.map(p => [p.lat, p.lng, p.intensity * 100])
    : HOTSPOT_DATA;

  const heatmapJSON  = JSON.stringify(resolvedHeatmap);
  const policeJSON   = JSON.stringify(POLICE_STATIONS);
  const polylineJSON = JSON.stringify(routePolyline);   // pre-computed full path
  const endpointsJSON = JSON.stringify(routeCoords);    // just start+end for fallback

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>

  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
  <script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"><\/script>

  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body,#map{width:100%;height:100%}
    .leaflet-control-zoom,.leaflet-control-attribution{display:none}
  </style>
</head>
<body>
<div id="map"></div>
<script>
  function postRN(obj) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    }
  }

  function osrmIcon(type, modifier) {
    if (type === 'arrive')                          return '🏁';
    if (type === 'depart')                          return '🚦';
    if (type === 'roundabout' || type === 'rotary') return '🔄';
    if (!modifier)                                  return '⬆️';
    if (modifier.indexOf('left')  !== -1) return modifier.indexOf('sharp') !== -1 ? '↰' : '↱';
    if (modifier.indexOf('right') !== -1) return modifier.indexOf('sharp') !== -1 ? '↱' : '↰';
    if (modifier === 'uturn')                       return '↩️';
    return '⬆️';
  }

  function fmtDist(metres) {
    return metres >= 1000
      ? (metres / 1000).toFixed(1) + ' km'
      : Math.round(metres) + ' m';
  }

  function markerIcon(color) {
    return L.divIcon({
      html: '<div style="width:14px;height:14px;border-radius:50%;background:' + color + ';border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
      className: '', iconSize: [14, 14], iconAnchor: [7, 7],
    });
  }

  // ── data injected from React Native ──────────────────────────────────────
  var hotspotsData  = ${heatmapJSON};
  var policeData    = ${policeJSON};
  var precomputedPolyline = ${polylineJSON};  // full route from routeEngine
  var endpoints     = ${endpointsJSON};        // [[startLat,startLng],[endLat,endLng]]

  // ── map ───────────────────────────────────────────────────────────────────
  var map = L.map('map', {zoomControl: false, attributionControl: false})
    .setView([${center.lat}, ${center.lng}], ${zoom});

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19}).addTo(map);

  // ── heatmap ───────────────────────────────────────────────────────────────
  if (${showHeatmap}) {
    L.heatLayer(hotspotsData, {
      radius: 40, blur: 25, maxZoom: 17,
      gradient: {0.0: '#52B788', 0.3: '#FFD166', 0.6: '#EF8C2D', 0.85: '#D62828'},
    }).addTo(map);
  }

  // ── police markers ────────────────────────────────────────────────────────
  if (${showPolice}) {
    policeData.forEach(function(s) {
      L.marker([s.lat, s.lng], {
        icon: L.divIcon({html: '<div style="font-size:24px;line-height:1">🚔</div>', className:'', iconSize:[30,30], iconAnchor:[15,15]}),
      }).bindPopup('<b>' + s.name + '</b><br>Police Station — 24/7').addTo(map);
    });
  }

  // ── route drawing ─────────────────────────────────────────────────────────
  if (${showRoute}) {

    // PATH 1 — use the pre-computed polyline from routeEngine (the chosen route)
    if (precomputedPolyline && precomputedPolyline.length > 1) {
      // Draw the polyline directly — no OSRM call needed
      var routeLine = L.polyline(precomputedPolyline, {
        color: '#2D6A4F', weight: 6, opacity: 0.9,
      }).addTo(map);

      // Fit map to the route bounds
      map.fitBounds(routeLine.getBounds(), {padding: [40, 40]});

      // Place start / end markers
      var start = precomputedPolyline[0];
      var end   = precomputedPolyline[precomputedPolyline.length - 1];
      L.marker(start, {icon: markerIcon('#1565C0')}).bindPopup('Start').addTo(map);
      L.marker(end,   {icon: markerIcon('#D62828')}).bindPopup('Destination').addTo(map);

      // Signal ready — steps come from NavigationScreen params, not the map
      postRN({type: 'MAP_READY'});

    // PATH 2 — no polyline passed, fall back to a fresh OSRM call
    } else if (endpoints && endpoints.length >= 2) {
      var origin = endpoints[0];
      var dest   = endpoints[endpoints.length - 1];
      var coordStr = origin[1] + ',' + origin[0] + ';' + dest[1] + ',' + dest[0];
      var osrmUrl  = 'https://router.project-osrm.org/route/v1/driving/' + coordStr
        + '?overview=full&geometries=geojson&steps=true';

      fetch(osrmUrl)
        .then(function(r) { return r.json(); })
        .then(function(json) {
          if (json.code !== 'Ok' || !json.routes.length) throw new Error('No route');
          var route = json.routes[0];

          // Draw GeoJSON route line
          var line = L.geoJSON(route.geometry, {
            style: {color: '#2D6A4F', weight: 6, opacity: 0.9},
          }).addTo(map);
          map.fitBounds(line.getBounds(), {padding: [40, 40]});

          L.marker(origin, {icon: markerIcon('#1565C0')}).bindPopup('Start').addTo(map);
          L.marker(dest,   {icon: markerIcon('#D62828')}).bindPopup('Destination').addTo(map);

          // Build steps for NavigationScreen
          var allSteps = [];
          route.legs.forEach(function(leg) {
            leg.steps.forEach(function(step) {
              var maneuver = step.maneuver || {};
              allSteps.push({
                instruction: step.name || maneuver.type || 'Continue',
                distance:    fmtDist(step.distance),
                icon:        osrmIcon(maneuver.type, maneuver.modifier),
              });
            });
          });

          postRN({type: 'MAP_READY'});
          postRN({type: 'ROUTE_FOUND', steps: allSteps});
        })
        .catch(function(err) {
          postRN({type: 'ERROR', message: 'Routing failed: ' + err.message});
          postRN({type: 'MAP_READY'});
        });
    }

  } else {
    // No route — just signal ready
    map.whenReady(function() { postRN({type: 'MAP_READY'}); });
  }
<\/script>
</body>
</html>`;
}