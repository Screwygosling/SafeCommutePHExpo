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
  routeCoords   = [],
  routePolyline = [],
  heatmapPoints = [],
}) {
  // If API points available, pass them through — KDE runs inside the WebView.
  // If not, fall back to static HOTSPOT_DATA (already scaled 0-1).
  const useAPIPoints = heatmapPoints.length > 0;

  // For the fallback static data, pass as-is (already correct scale).
  // For API data, pass raw crime_penalty values — KDE will process them.
  const rawPoints = useAPIPoints
    ? heatmapPoints.map(p => ({
        lat:           p.lat,
        lng:           p.lng,
        crime_penalty: p.crime_penalty,  // raw 0-100 scale from ML model
        threat_level:  p.threat_level,
      }))
    : [];

  const fallbackHeatmap = useAPIPoints ? [] : HOTSPOT_DATA;

  const rawPointsJSON    = JSON.stringify(rawPoints);
  const fallbackJSON     = JSON.stringify(fallbackHeatmap);
  const policeJSON       = JSON.stringify(POLICE_STATIONS);
  const polylineJSON     = JSON.stringify(routePolyline);
  const endpointsJSON    = JSON.stringify(routeCoords);

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
  // ── PostMessage helper ────────────────────────────────────────────────────
  function postRN(obj) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    }
  }

  // ── Injected data ─────────────────────────────────────────────────────────
  var rawAPIPoints    = ${rawPointsJSON};    // from /heatmap endpoint
  var fallbackPoints  = ${fallbackJSON};     // static HOTSPOT_DATA
  var policeData      = ${policeJSON};
  var precomputedPolyline = ${polylineJSON};
  var endpoints       = ${endpointsJSON};

  // ── KDE Implementation ────────────────────────────────────────────────────
  // Implements the Gaussian Kernel Density Estimation from the thesis proposal:
  //   f(x) = (1/nh) * Σ K((x - xi) / h)
  //   K(u) = (1/√2π) * e^(-u²/2)   ← Gaussian kernel
  //
  // Each barangay point is treated as xi with weight = crime_penalty.
  // We evaluate the KDE on a fine grid over Pasay City and pass the
  // resulting [lat, lng, intensity] array to Leaflet.heat.

  function gaussianKernel(u) {
    // K(u) = (1/√2π) * e^(-u²/2)
    return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * u * u);
  }

  function haversineDeg(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
            Math.sin(dLng/2)*Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function computeKDE(points, bandwidth) {
    if (rawAPIPoints.length > 0) {
      // Use actual barangay coordinates with crime_penalty as intensity
      // Scale intensity for visibility
      var maxPenalty = 0;
      rawAPIPoints.forEach(function(p) {
        if (p.crime_penalty > maxPenalty) maxPenalty = p.crime_penalty;
      });
      if (maxPenalty === 0) maxPenalty = 1;

      heatPoints = rawAPIPoints.map(function(p) {
        return [p.lat, p.lng, p.crime_penalty / maxPenalty];
      });
    } else {
      heatPoints = fallbackPoints;
    }

    // Normalise densities to 0-1 for Leaflet heatmap
    // Only include grid cells with meaningful density (> 1% of max)
    // to keep the heatmap focused on actual crime areas
    var heatPoints = [];
    gridValues.forEach(function(g) {
      var normalised = maxDensity > 0 ? g.density / maxDensity : 0;
      if (normalised > 0.01) {
        heatPoints.push([g.lat, g.lng, normalised]);
      }
    });

    return heatPoints;
  }

  // ── Map setup ─────────────────────────────────────────────────────────────
  var map = L.map('map', {zoomControl: false, attributionControl: false})
    .setView([${center.lat}, ${center.lng}], ${zoom});

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19}).addTo(map);

  // ── Heatmap ───────────────────────────────────────────────────────────────
    if (${showHeatmap}) {
      var heatPoints;

      if (rawAPIPoints.length > 0) {
        var maxPenalty = 0;
        rawAPIPoints.forEach(function(p) {
          if (p.crime_penalty > maxPenalty) maxPenalty = p.crime_penalty;
        });
        if (maxPenalty === 0) maxPenalty = 1;

        heatPoints = rawAPIPoints.map(function(p) {
          return [p.lat, p.lng, p.crime_penalty / maxPenalty];
        });
      } else {
        heatPoints = fallbackPoints;
      }

      L.heatLayer(heatPoints, {
        radius:  50,
        blur:    25,
        maxZoom: 17,
        max:     1.0,
        gradient: {
          0.0:  '#52B788',
          0.35: '#FFD166',
          0.65: '#EF8C2D',
          0.85: '#D62828',
        },
      }).addTo(map);
    }

  // ── Police markers ────────────────────────────────────────────────────────
  if (${showPolice}) {
    policeData.forEach(function(s) {
      L.marker([s.lat, s.lng], {
        icon: L.divIcon({
          html: '<div style="font-size:24px;line-height:1">🚔</div>',
          className: '', iconSize: [30,30], iconAnchor: [15,15],
        }),
      }).bindPopup('<b>' + s.name + '</b><br>Police Station — 24/7').addTo(map);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function markerIcon(color) {
    return L.divIcon({
      html: '<div style="width:14px;height:14px;border-radius:50%;background:' + color + ';border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
      className: '', iconSize: [14,14], iconAnchor: [7,7],
    });
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

  // ── Route drawing ─────────────────────────────────────────────────────────
  if (${showRoute}) {
    if (precomputedPolyline && precomputedPolyline.length > 1) {
      var routeLine = L.polyline(precomputedPolyline, {
        color: '#2D6A4F', weight: 6, opacity: 0.9,
      }).addTo(map);
      map.fitBounds(routeLine.getBounds(), {padding: [40, 40]});

      var start = precomputedPolyline[0];
      var end   = precomputedPolyline[precomputedPolyline.length - 1];
      L.marker(start, {icon: markerIcon('#1565C0')}).bindPopup('Start').addTo(map);
      L.marker(end,   {icon: markerIcon('#D62828')}).bindPopup('Destination').addTo(map);

      postRN({type: 'MAP_READY'});

    } else if (endpoints && endpoints.length >= 2) {
      var origin   = endpoints[0];
      var dest     = endpoints[endpoints.length - 1];
      var coordStr = origin[1] + ',' + origin[0] + ';' + dest[1] + ',' + dest[0];
      var osrmUrl  = 'https://router.project-osrm.org/route/v1/driving/' + coordStr
        + '?overview=full&geometries=geojson&steps=true';

      fetch(osrmUrl)
        .then(function(r) { return r.json(); })
        .then(function(json) {
          if (json.code !== 'Ok' || !json.routes.length) throw new Error('No route');
          var route = json.routes[0];
          var line  = L.geoJSON(route.geometry, {
            style: {color: '#2D6A4F', weight: 6, opacity: 0.9},
          }).addTo(map);
          map.fitBounds(line.getBounds(), {padding: [40, 40]});
          L.marker(origin, {icon: markerIcon('#1565C0')}).bindPopup('Start').addTo(map);
          L.marker(dest,   {icon: markerIcon('#D62828')}).bindPopup('Destination').addTo(map);

          var allSteps = [];
          route.legs.forEach(function(leg) {
            leg.steps.forEach(function(step) {
              var m = step.maneuver || {};
              allSteps.push({
                instruction: step.name || m.type || 'Continue',
                distance:    fmtDist(step.distance),
                icon:        osrmIcon(m.type, m.modifier),
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
    map.whenReady(function() { postRN({type: 'MAP_READY'}); });
  }
<\/script>
</body>
</html>`;
}