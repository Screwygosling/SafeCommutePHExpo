import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, FlatList,
} from 'react-native';
import {WebView} from 'react-native-webview';
import * as Location from 'expo-location';
import {buildLeafletHTML, PASAY_CENTER} from '../utils/LeafletMap';

const ACCENT = '#2D6A4F';

// Pasay City bounding box (west, south, east, north) with small buffer
const PASAY_BOUNDS = { west: 120.9750, south: 14.5200, east: 121.0200, north: 14.5650 };

// Nominatim geocoder restricted to Pasay City only
const geocode = async (query) => {
  if (!query || query.trim().length < 3) return [];
  try {
    const {west, south, east, north} = PASAY_BOUNDS;
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(query)},+Pasay+City` +
      `&format=json&limit=6&countrycodes=ph` +
      `&viewbox=${west},${north},${east},${south}` +
      `&bounded=1` +
      `&accept-language=en`;
    const res = await fetch(url, {
      headers: {'User-Agent': 'SafeCommutePH/1.0'},
    });
    const json = await res.json();
    // Client-side guard — drop anything outside the bounding box
    return json
      .filter(r => {
        const lat = parseFloat(r.lat);
        const lng = parseFloat(r.lon);
        return lat >= south && lat <= north && lng >= west && lng <= east;
      })
      .map(r => ({
        id:   r.place_id,
        name: r.display_name,
        lat:  parseFloat(r.lat),
        lng:  parseFloat(r.lon),
      }));
  } catch {
    return [];
  }
};

const mapHTML = buildLeafletHTML({center: PASAY_CENTER, zoom: 13, showHeatmap: true});

export default function HomeScreen({navigation}) {
  // ── origin state ─────────────────────────────────────────────────────────
  const [originText,   setOriginText]   = useState('');
  const [originCoords, setOriginCoords] = useState(null);   // [lat, lng] or null
  const [gpsLoading,   setGpsLoading]   = useState(false);

  // ── destination state ─────────────────────────────────────────────────────
  const [destText,    setDestText]    = useState('');
  const [destCoords,  setDestCoords]  = useState(null);     // [lat, lng] or null
  const [destResults, setDestResults] = useState([]);
  const [destLoading, setDestLoading] = useState(false);

  // ── origin results (when user types instead of using GPS) ─────────────────
  const [originResults, setOriginResults] = useState([]);
  const [originLoading, setOriginLoading] = useState(false);

  const [activeInput, setActiveInput] = useState(null);     // 'origin' | 'dest' | null
  const [mapReady,      setMapReady]      = useState(false);
  const [heatmapPoints, setHeatmapPoints] = useState([]);

  const destTimer   = useRef(null);
  const originTimer = useRef(null);

  // ── Fetch heatmap data from API on mount ─────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch('https://thesisml.onrender.com/heatmap');
        const json = await res.json();
        if (json.points && json.points.length > 0) {
          setHeatmapPoints(json.points);
          console.log('[HomeScreen] heatmap loaded:', json.points.length, 'points');
        }
      } catch (e) {
        console.warn('[HomeScreen] heatmap fetch failed:', e.message);
      }
    })();
  }, []);

  // ── GPS: get current location on mount ───────────────────────────────────
  useEffect(() => {
    (async () => {
      setGpsLoading(true);
      try {
        const {status} = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setOriginText('Current Location (GPS denied)');
          return;
        }
        const loc = await Location.getCurrentPositionAsync({accuracy: Location.Accuracy.Balanced});
        setOriginCoords([loc.coords.latitude, loc.coords.longitude]);
        setOriginText('Current Location');
      } catch {
        setOriginText('Current Location (unavailable)');
      } finally {
        setGpsLoading(false);
      }
    })();
  }, []);

  // ── debounced geocode: destination ────────────────────────────────────────
  const onDestChange = useCallback((text) => {
    setDestText(text);
    setDestCoords(null);          // clear any previously picked coord
    clearTimeout(destTimer.current);
    if (text.trim().length < 3) { setDestResults([]); return; }
    destTimer.current = setTimeout(async () => {
      setDestLoading(true);
      const results = await geocode(text);
      setDestResults(results);
      setDestLoading(false);
    }, 500);
  }, []);

  // ── debounced geocode: origin (when user types manually) ──────────────────
  const onOriginChange = useCallback((text) => {
    setOriginText(text);
    setOriginCoords(null);
    clearTimeout(originTimer.current);
    if (text.trim().length < 3) { setOriginResults([]); return; }
    originTimer.current = setTimeout(async () => {
      setOriginLoading(true);
      const results = await geocode(text);
      setOriginResults(results);
      setOriginLoading(false);
    }, 500);
  }, []);

  // ── pick a suggestion ─────────────────────────────────────────────────────
  const pickOrigin = (item) => {
    setOriginText(item.name);
    setOriginCoords([item.lat, item.lng]);
    setOriginResults([]);
    setActiveInput(null);
  };

  const pickDest = (item) => {
    setDestText(item.name);
    setDestCoords([item.lat, item.lng]);
    setDestResults([]);
    setActiveInput(null);
  };

  // ── navigate ──────────────────────────────────────────────────────────────
  const canGo = destCoords !== null;

  const findRoute = () => {
    if (!canGo) return;

    // Fall back to Pasay centre if GPS failed and user didn't type an origin
    const finalOrigin = originCoords ?? [PASAY_CENTER.lat, PASAY_CENTER.lng];

    navigation.navigate('RouteOptions', {
      origin:        originText || 'Current Location',
      destination:   destText,
      originCoords:  finalOrigin,
      destCoords,
      heatmapPoints, // pass API crime data for route scoring
    });
  };

  // ── render suggestion rows ────────────────────────────────────────────────
  const renderSuggestion = (item, onPress) => (
    <TouchableOpacity key={item.id} style={s.suggRow} onPress={() => onPress(item)}>
      <Text style={s.suggPin}>📍</Text>
      <Text style={s.suggText} numberOfLines={2}>{item.name}</Text>
    </TouchableOpacity>
  );

  const showOriginDropdown = activeInput === 'origin' && originResults.length > 0;
  const showDestDropdown   = activeInput === 'dest'   && destResults.length > 0;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.appName}>SafeCommute PH</Text>
      </View>

      <View style={s.card}>
        {/* ── Origin ── */}
        <View style={s.row}>
          <Text style={s.pin}>{gpsLoading ? '⏳' : '📍'}</Text>
          <TextInput
            style={s.input}
            placeholder="Current Location"
            placeholderTextColor="#AAA"
            value={originText}
            onChangeText={onOriginChange}
            onFocus={() => setActiveInput('origin')}
            onBlur={() => setTimeout(() => { if (activeInput === 'origin') setActiveInput(null); }, 200)}
          />
          {originLoading && <ActivityIndicator size="small" color={ACCENT} style={{marginLeft: 6}} />}
        </View>

        {showOriginDropdown && (
          <View style={s.suggestions}>
            {originResults.map(item => renderSuggestion(item, pickOrigin))}
          </View>
        )}

        <View style={s.sep} />

        {/* ── Destination ── */}
        <View style={s.row}>
          <Text style={s.pin}>🎯</Text>
          <TextInput
            style={s.input}
            placeholder="Enter Destination"
            placeholderTextColor="#AAA"
            value={destText}
            onChangeText={onDestChange}
            onFocus={() => setActiveInput('dest')}
            onBlur={() => setTimeout(() => { if (activeInput === 'dest') setActiveInput(null); }, 200)}
          />
          {destLoading && <ActivityIndicator size="small" color={ACCENT} style={{marginLeft: 6}} />}
          {destCoords && <Text style={s.tick}>✅</Text>}
        </View>

        {showDestDropdown && (
          <View style={s.suggestions}>
            {destResults.map(item => renderSuggestion(item, pickDest))}
          </View>
        )}

        {/* hint when user has typed but not picked yet */}
        {activeInput === 'dest' && destText.length >= 3 && !destCoords && !destLoading && destResults.length === 0 && (
          <Text style={s.hint}>No results found — try a different search</Text>
        )}
        {activeInput === 'dest' && destText.length > 0 && !destCoords && destResults.length > 0 && (
          <Text style={s.hint}>👆 Tap a result to confirm your destination</Text>
        )}

        <TouchableOpacity
          style={[s.btn, !canGo && s.btnDisabled]}
          onPress={findRoute}
          activeOpacity={0.85}
          disabled={!canGo}
        >
          <Text style={s.btnText}>Find Safe Route</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.mapLabel}>MAP / CRIME HOTSPOTS  •  OpenStreetMap (Free)</Text>

      <View style={s.mapWrap}>
        {!mapReady && (
          <View style={s.loader}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={s.loaderText}>Loading map…</Text>
          </View>
        )}
        <WebView
          originWhitelist={['*']}
          source={{html: mapHTML}}
          style={s.map}
          javaScriptEnabled
          domStorageEnabled
          onLoad={() => setMapReady(true)}
          onMessage={() => setMapReady(true)}
          scalesPageToFit={false}
          scrollEnabled={false}
          bounces={false}
        />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   {flex: 1, backgroundColor: '#F7F8FA'},
  header:      {backgroundColor: '#FFF', paddingHorizontal: 20, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#EEE', elevation: 2},
  appName:     {fontSize: 20, fontWeight: '700', color: '#1A1A1A'},
  card:        {backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 12, borderRadius: 16, padding: 4, elevation: 4, zIndex: 100},
  row:         {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8},
  pin:         {fontSize: 16, marginRight: 10},
  input:       {flex: 1, fontSize: 15, color: '#333', paddingVertical: 6},
  tick:        {fontSize: 14, marginLeft: 6},
  sep:         {height: 1, backgroundColor: '#F0F0F0', marginHorizontal: 12},
  suggestions: {backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F0F0F0', maxHeight: 220},
  suggRow:     {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F7F7F7'},
  suggPin:     {fontSize: 14, marginRight: 10},
  suggText:    {flex: 1, fontSize: 13, color: '#444'},
  hint:        {fontSize: 12, color: '#999', paddingHorizontal: 16, paddingBottom: 8, fontStyle: 'italic'},
  btn:         {backgroundColor: ACCENT, margin: 8, borderRadius: 12, paddingVertical: 14, alignItems: 'center'},
  btnDisabled: {backgroundColor: '#A0C4B4'},
  btnText:     {color: '#FFF', fontSize: 16, fontWeight: '700'},
  mapLabel:    {textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#888', letterSpacing: 1.2, paddingVertical: 6},
  mapWrap:     {flex: 1, position: 'relative'},
  loader:      {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA', zIndex: 10},
  loaderText:  {marginTop: 12, fontSize: 14, color: '#888'},
  map:         {flex: 1, backgroundColor: 'transparent'},
});