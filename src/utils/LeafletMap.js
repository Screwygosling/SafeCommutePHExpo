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

// Maps OSRM turn type + modifier to an emoji icon
function osrmIcon(type, modifier) {
  if (type === 'arrive')   return '🏁';
  if (type === 'depart')   return '🚦';
  if (type === 'roundabout' || type === 'rotary') return '🔄';
  if (!modifier)           return '⬆️';
  if (modifier.includes('left'))  return modifier.includes('sharp') ? '↰' : '↱';
  if (modifier.includes('right')) return modifier.includes('sharp') ? '↱' : '↰';
  if (modifier === 'uturn') return '↩️';
  return '⬆️';
}

export function buildLeafletHTML({
  center = MANILA_CENTER,
  zoom = 13,
  showHeatmap = true,
  showPolice = false,
  showRoute = false,
  routeCoords = [], // [[startLat, startLng], [endLat, endLng]]
  heatmapPoints = [],
}) {
  const resolvedHeatmap = heatmapPoints.length > 0
    ? heatmapPoints.map(p => [p.lat, p.lng, p.intensity * 100])
    : HOTSPOT_DATA;

  // Serialise all data once here so the template stays clean
  const heatmapJSON  = JSON.stringify(resolvedHeatmap);
  const policeJSON   = JSON.stringify(POLICE_STATIONS);
  const routeJSON    = JSON.stringify(routeCoords);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>

  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>

  <script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"><\/script>
  <link rel="stylesheet" href="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css"/>
  <script src="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js"><\/script>

  <link rel="stylesheet" href="https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.css"/>
  <script src="https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.js"><\/script>

  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body,#map{width:100%;height:100%}
    .leaflet-control-zoom,.leaflet-control-attribution{display:none}
    .leaflet-routing-container{display:none!important}
  </style>
</head>
<body>
<div id="map"></div>
<script>
  // ── helpers ──────────────────────────────────────────────────────────────
  function postRN(obj) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    }
  }

  function osrmIcon(type, modifier) {
    if (type === 'arrive')                            return '🏁';
    if (type === 'depart')                            return '🚦';
    if (type === 'roundabout' || type === 'rotary')   return '🔄';
    if (!modifier)                                    return '⬆️';
    if (modifier.indexOf('left')  !== -1) return modifier.indexOf('sharp') !== -1 ? '↰' : '↱';
    if (modifier.indexOf('right') !== -1) return modifier.indexOf('sharp') !== -1 ? '↱' : '↰';
    if (modifier === 'uturn')                         return '↩️';
    return '⬆️';
  }

  function fmtDist(metres) {
    return metres >= 1000
      ? (metres / 1000).toFixed(1) + ' km'
      : Math.round(metres) + ' m';
  }

  // ── data ─────────────────────────────────────────────────────────────────
  var hotspotsData = ${heatmapJSON};
  var policeData   = ${policeJSON};
  var routePoints  = ${routeJSON};

  // ── map ──────────────────────────────────────────────────────────────────
  var map = L.map('map', {zoomControl: false, attributionControl: false})
    .setView([${center.lat}, ${center.lng}], ${zoom});

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19}).addTo(map);

  // ── heatmap ──────────────────────────────────────────────────────────────
  if (${showHeatmap}) {
    L.heatLayer(hotspotsData, {
      radius: 40, blur: 25, maxZoom: 17,
      gradient: {0.0: '#52B788', 0.3: '#FFD166', 0.6: '#EF8C2D', 0.85: '#D62828'},
    }).addTo(map);
  }

  // ── police markers ───────────────────────────────────────────────────────
  if (${showPolice}) {
    var policeIcon = L.divIcon({
      html: '<div style="font-size:24px;line-height:1">🚔</div>',
      className: '', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15],
    });
    policeData.forEach(function(s) {
      L.marker([s.lat, s.lng], {icon: policeIcon})
        .bindPopup('<b>' + s.name + '</b><br>Police Station — 24/7')
        .addTo(map);
    });
  }

  // ── OSRM routing ─────────────────────────────────────────────────────────
  if (${showRoute} && routePoints.length >= 2) {
    // FIX: store the control in a variable so event handlers can reference it
    var routingControl = L.Routing.control({
      waypoints: [
        L.latLng(routePoints[0][0], routePoints[0][1]),
        L.latLng(routePoints[1][0], routePoints[1][1]),
      ],
      router: L.Routing.osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1',
      }),
      lineOptions: {
        styles: [{color: '#2D6A4F', weight: 6, opacity: 0.9}],
      },
      createMarker: function(i, wp) {
        var color = (i === 0) ? '#1565C0' : '#D62828';
        var label = (i === 0) ? 'Start' : 'Destination';
        return L.circleMarker(wp.latLng, {
          radius: 10, color: color, fillColor: color, fillOpacity: 1,
        }).bindPopup(label);
      },
      addWaypoints: false,
      routeWhileDragging: false,
    }).addTo(map);

    // FIX: 'routesfound' (not 'routingfound') is the correct LRM event name
    routingControl.on('routesfound', function(e) {
      var route = e.routes[0];
      // Map every OSRM step to the shape NavigationScreen expects
      var steps = route.instructions.map(function(instr) {
        return {
          instruction: instr.text,
          distance: fmtDist(instr.distance),
          icon: osrmIcon(instr.type, instr.modifier),
        };
      });
      postRN({type: 'ROUTE_FOUND', steps: steps});
    });

    // FIX: was 'routingerror' — correct LRM event is 'routingerror' but the
    //      handler referenced undefined 'control'; now uses 'routingControl'
    routingControl.on('routingerror', function(e) {
      postRN({
        type: 'ERROR',
        message: 'Routing failed. The OSRM demo server might be busy.',
      });
    });
  }

  // ── ready signal ─────────────────────────────────────────────────────────
  // FIX: was posting a bare string; handleMessage does JSON.parse so must be JSON
  map.whenReady(function() {
    postRN({type: 'MAP_READY'});
  });
<\/script>
</body>
</html>`;
}