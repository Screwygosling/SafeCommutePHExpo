export const MANILA_CENTER = {lat: 14.58, lng: 120.99};
export const PASAY_CENTER  = {lat: 14.5378, lng: 121.0014};

export const PASAY_BOUNDS = {
  southWest: [14.5200, 120.9750],
  northEast: [14.5650, 121.0200],
};

// Updated to include Crime Type as the 4th element
export const HOTSPOT_DATA = [
  [14.5995, 120.9842, 1.0, 'Robbery'], [14.5547, 121.0244, 0.9, 'Theft'],
  [14.5764, 121.0107, 0.8, 'Assault'], [14.6091, 120.9822, 0.7, 'Snatching'],
  [14.5800, 120.9800, 1.0, 'Robbery'], [14.5350, 121.0150, 0.6, 'Theft'],
  [14.6200, 121.0000, 0.8, 'Assault'], [14.5650, 120.9950, 0.9, 'Pickpocketing'],
  [14.5900, 121.0100, 0.7, 'Theft'],   [14.5450, 120.9900, 1.0, 'Robbery'],
  [14.6100, 120.9700, 0.6, 'Snatching'], [14.5700, 121.0300, 0.8, 'Assault'],
  [14.5880, 121.0050, 0.95, 'Theft'],  [14.5620, 120.9870, 0.85, 'Robbery'],
  [14.6050, 121.0120, 0.75, 'Assault'],
];

export const POLICE_STATIONS = [
  {name: 'Pasay City Police',      lat: 14.5378, lng: 121.0014},
];


export function buildLeafletHTML({
  center        = MANILA_CENTER,
  zoom          = 13,
  showHeatmap   = true,
  showPolice    = false,
  showRoute     = false,
  routeCoords   = [],
  routePolyline = [],
  heatmapPoints = [], // Default to empty array
  // restrictToPasay false for now, change back to !showRoute when ready
  restrictToPasay = false,
}) {
  // This prevents the "Cannot read property 'map' of undefined" crash.
  const safePoints = Array.isArray(heatmapPoints) ? heatmapPoints : [];

  // 1. Define rawPoints using the safe array
  const rawPoints = safePoints.map(p => ({
    lat: p.lat !== undefined ? p.lat : p[0],
    lng: p.lng !== undefined ? p.lng : p[1],
    type: p.type || p.name || 'Unspecified Incident'
  }));

  // 2. Define fallbackHeatmap including the type string
  const fallbackHeatmap = HOTSPOT_DATA.map(p => ({
    lat: p[0],
    lng: p[1],
    intensity: p[2],
    type: p[3]
  }));

  const rawPointsJSON  = JSON.stringify(rawPoints);
  const fallbackJSON   = JSON.stringify(fallbackHeatmap);
  const policeJSON     = JSON.stringify(POLICE_STATIONS);
  const polylineJSON   = JSON.stringify(routePolyline);
  const endpointsJSON  = JSON.stringify(routeCoords);

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
    html,body,#map{width:100%;height:100%;background:#f0f0f0}
    .leaflet-control-zoom,.leaflet-control-attribution{display:none}

    /* Fix for floating/3D effect */
    .leaflet-overlay-pane { z-index: 400; }
    .leaflet-pane > svg { transform: none !important; }
    .leaflet-zoom-animated { will-change: auto !important; transform-origin: 0 0; }
    .leaflet-container { perspective: none !important; -webkit-perspective: none !important; }

    /* Popup Styling */
    .leaflet-popup-content-wrapper {
      background: #ffffff;
      color: #333;
      border-radius: 8px;
      font-family: sans-serif;
    }
    .leaflet-popup-content { margin: 12px; font-size: 14px; }

    /* Pulse ring effect */
    .pulse-ring {
      position: absolute;
      top: 0; left: 0;
      width: 12px; height: 12px;
      border-radius: 50%;
      background-color: #D62828; /* Red pulse */
      animation: leaflet-pulsate 2s infinite;
      display: none; /* Hidden by default */
    }

    .is-nearby .pulse-ring {
      display: block;
    }

    @keyframes leaflet-pulsate {
      0% { transform: scale(1); opacity: 1; }
      70% { transform: scale(3); opacity: 0; }
      100% { transform: scale(3); opacity: 0; }
    }

    .user-location-icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }
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

  // FIX 2: Wrap in try-catch to catch data injection errors
  try {
    var rawAPIPoints        = ${rawPointsJSON};
    var fallbackPoints      = ${fallbackJSON};
    var policeData          = ${policeJSON};
    var precomputedPolyline = ${polylineJSON};
    var endpoints           = ${endpointsJSON};

    var mapOptions = {
      preferCanvas: true,
      zoomControl: false,
      attributionControl: false,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    };

    ${restrictToPasay ? `
    mapOptions.maxBounds = L.latLngBounds([14.5200, 120.9750], [14.5650, 121.0200]);
    mapOptions.maxBoundsViscosity = 1.0;
    mapOptions.minZoom = 14;
    ` : ''}

    var map = L.map('map', mapOptions).setView([${center.lat}, ${center.lng}], ${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19}).addTo(map);

    function startDrawing() {
      // FIX 3: Ensure map has dimensions before drawing
      if (map.getSize().x === 0) {
        setTimeout(startDrawing, 100);
        return;
      }
      map.invalidateSize();
      drawHeatmap();
      drawRoute();
      if (${showPolice}) drawPolice();

      // Signal to React Native that the map is ready
      postRN({type: 'MAP_READY'});
    }

    var userMarker = null;

    window.updateUserLocation = function(lat, lng, isNearby) {
      try {
        var latlng = [lat, lng];

        if (userMarker) {
          userMarker.setLatLng(latlng);
          var el = userMarker.getElement();
          if (el) {
            if (isNearby) el.classList.add('is-nearby');
            else el.classList.remove('is-nearby');
          }
        } else {
          // FIX: Use single quotes and + to avoid breaking the main template literal
          var iconHtml = '<div class="pulse-ring"></div>' +
            '<div style="width:18px;height:18px;border-radius:50%;background:#1565C0;border:3px solid #fff;box-shadow:0 0 5px rgba(0,0,0,0.3);position:relative;z-index:2;"></div>';

          userMarker = L.marker(latlng, {
            icon: L.divIcon({
              html: iconHtml,
              className: 'user-location-icon' + (isNearby ? ' is-nearby' : ''),
              iconSize: [18, 18],
              iconAnchor: [9, 9],
            }),
            zIndexOffset: 1000,
          }).addTo(map);
        }
      } catch (e) {
        postRN({type: 'ERROR', message: 'updateUserLocation failed: ' + e.message});
      }
    };

    function drawHeatmap() {
      if (!${showHeatmap}) return;
      var heatData = rawAPIPoints.length > 0
        ? rawAPIPoints.map(p => [p.lat, p.lng, 0.5])
        : fallbackPoints.map(p => [p.lat, p.lng, p.intensity]);

      L.heatLayer(heatData, {
        radius: 25, blur: 15, maxZoom: 17,
        gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' }
      }).addTo(map);

      var interactionPoints = rawAPIPoints.length > 0 ? rawAPIPoints : fallbackPoints;
      interactionPoints.forEach(function(p) {
        L.circleMarker([p.lat, p.lng], {
          radius: 20,
          fillColor: 'transparent',
          color: 'transparent',
          stroke: false
        })
        .bindPopup("<b>Crime Type:</b><br/>" + p.type)
        .addTo(map);
      });
    }

    function drawRoute() {
      if (!${showRoute}) return;
      if (precomputedPolyline && precomputedPolyline.length > 1) {
        var routeLine = L.polyline(precomputedPolyline, {
          color: '#2D6A4F', weight: 6, opacity: 0.9, smoothFactor: 0
        }).addTo(map);
        L.marker(precomputedPolyline[0]).addTo(map);
        L.marker(precomputedPolyline[precomputedPolyline.length - 1]).addTo(map);
        map.fitBounds(routeLine.getBounds(), {padding: [40, 40]});
      }
    }

    function drawPolice() {
      policeData.forEach(function(s) {
        L.marker([s.lat, s.lng]).bindPopup("<b>" + s.name + "</b>").addTo(map);
      });
    }

    window.onload = startDrawing;
  } catch (e) {
    postRN({type: 'ERROR', message: e.message});
  }
<\/script>
</body>
</html>`;
}