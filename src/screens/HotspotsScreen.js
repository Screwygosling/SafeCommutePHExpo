import React, {useState, useRef, useEffect, useCallback, useMemo} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator} from 'react-native';
import {WebView} from 'react-native-webview';
import {buildLeafletHTML, PASAY_CENTER} from '../utils/LeafletMap';
import {getCrimeIncidents} from '../utils/api';
import * as Location from 'expo-location';

const LEGEND = [
  {label: 'Low',       color: '#52B788'},
  {label: 'Moderate',  color: '#FFD166'},
  {label: 'High',      color: '#EF8C2D'},
  {label: 'Very High', color: '#D62828'},
];

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export default function HotspotsScreen() {
  const [showPolice,    setShowPolice]    = useState(true);
  const [mapReady,      setMapReady]      = useState(false);
  const [heatmapPoints, setHeatmapPoints] = useState([]);
  const [loadingData,   setLoadingData]   = useState(true);
  const [error,         setError]         = useState(null);
  const webviewRef = useRef(null);

  // Define fetch BEFORE useEffect to avoid hoisting issues
  const fetchData = useCallback(async () => {
    console.log('[Hotspots] fetchData called');
    setLoadingData(true);
    setError(null);
    try {
      console.log('[Hotspots] calling getCrimeIncidents...');
      const data = await getCrimeIncidents();
      console.log('[Hotspots] got data:', typeof data, Array.isArray(data), data?.length);

      if (!Array.isArray(data) || data.length === 0) {
        console.warn('[Hotspots] Empty or invalid data received');
        setError('No crime data available.');
        return;
      }

      const mapped = data.map(inc => ({
        lat:           inc.lat,
        lng:           inc.lng,
        crime_penalty: inc.crime_penalty,
        intensity:     inc.crime_penalty / 100,
        type:          (inc.offense ?? 'UNKNOWN').trim(),
        name:          (inc.offense ?? 'UNKNOWN').trim(),
        threat_level:  inc.crime_penalty >= 75 ? 'very_high'
                     : inc.crime_penalty >= 50 ? 'high'
                     : inc.crime_penalty >= 25 ? 'moderate' : 'low',
      }));

      console.log('[Hotspots] mapped', mapped.length, 'points, sample:', JSON.stringify(mapped[0]));
      setHeatmapPoints(mapped);
    } catch (e) {
      console.error('[Hotspots] fetch error:', e.message);
      setError('Could not load crime data. Please try again.');
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    let subscription;

    const startWatching = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 20,
        },
        (location) => {
          const { latitude, longitude } = location.coords;

          // Check if any hotspot is within 300 meters
          // This uses the getDistance function defined at the top of your file
          const isNearby = heatmapPoints.some(point => {
            const dist = getDistance(latitude, longitude, point.lat, point.lng);
            return dist < 300;
          });

          if (webviewRef.current) {
            webviewRef.current.injectJavaScript(
              `if(window.updateUserLocation) {
                window.updateUserLocation(${latitude}, ${longitude}, ${isNearby});
              } true;`
            );
          }
        }
      );
    };

    startWatching();

    // Cleanup: This must be outside the async function
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [heatmapPoints]); // Added heatmapPoints so the logic updates when data arrives

  useEffect(() => {
    console.log('[Hotspots] useEffect fired — calling fetchData');
    fetchData();
  }, [fetchData]);

  const mapHTML = useMemo(() => {
    console.log('[Hotspots] rebuilding mapHTML with', heatmapPoints.length, 'points');
    return buildLeafletHTML({
      center: PASAY_CENTER,
      zoom: 13,
      showHeatmap: true,
      showPolice,
      heatmapPoints,
    });
  }, [heatmapPoints, showPolice]);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Crime Hotspots</Text>
        <TouchableOpacity
          style={s.toggle}
          onPress={() => { setShowPolice(p => !p); setMapReady(false); }}>
          <Text style={s.toggleText}>{showPolice ? '🚔 Hide Police' : '🚔 Show Police'}</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>⚠️ {error}</Text>
          <TouchableOpacity onPress={fetchData}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={s.mapWrap} collapsable={false} removeClippedSubviews={false}>
        {(!mapReady || loadingData) && (
          <View style={s.loader}>
            <ActivityIndicator size="large" color="#2D6A4F" />
            <Text style={s.loaderText}>
              {loadingData ? 'Fetching crime data…' : 'Loading map…'}
            </Text>
          </View>
        )}
        <WebView
          ref={webviewRef}
          key={heatmapPoints.length}
          originWhitelist={['*']}
          source={{html: mapHTML}}
          style={s.map}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          androidLayerType="software"
          onLoad={() => setMapReady(true)}
          onMessage={() => setMapReady(true)}
          onError={(e) => console.error('[Hotspots] WebView error:', e.nativeEvent)}
          scalesPageToFit={false}
          scrollEnabled={false}
          bounces={false}
        />
      </View>

      <View style={s.legend}>
        {LEGEND.map((item, i) => (
          <View key={i} style={s.legendItem}>
            <View style={[s.dot, {backgroundColor: item.color}]} />
            <Text style={s.legendLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   {flex: 1, backgroundColor: '#F7F8FA'},
  header:      {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EEE', elevation: 2},
  title:       {fontSize: 18, fontWeight: '700', color: '#1A1A1A'},
  toggle:      {backgroundColor: '#EBF5F0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20},
  toggleText:  {fontSize: 12, fontWeight: '600', color: '#2D6A4F'},
  mapWrap:     {flex: 1, position: 'relative'},
  loader:      {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA', zIndex: 10},
  loaderText:  {marginTop: 12, fontSize: 14, color: '#888'},
  map:         {flex: 1, backgroundColor: 'transparent'},
  legend:      {flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#FFF', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#EEE', elevation: 4},
  legendItem:  {flexDirection: 'row', alignItems: 'center'},
  dot:         {width: 12, height: 12, borderRadius: 6, marginRight: 5},
  legendLabel: {fontSize: 12, fontWeight: '500', color: '#444'},
  errorBanner: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF3CD', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#FFD166'},
  errorText:   {fontSize: 12, color: '#856404'},
  retryText:   {fontSize: 12, fontWeight: '700', color: '#2D6A4F'},
});