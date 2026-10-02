import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator} from 'react-native';
import {WebView} from 'react-native-webview';
import {buildLeafletHTML, PASAY_CENTER} from '../utils/LeafletMap';
import {getCrimeIncidents} from '../utils/api';

const LEGEND = [
  {label: 'Low',       color: '#52B788'},
  {label: 'Moderate',  color: '#FFD166'},
  {label: 'High',      color: '#EF8C2D'},
  {label: 'Very High', color: '#D62828'},
];

export default function HotspotsScreen() {
  const [showPolice,    setShowPolice]    = useState(true);
  const [mapReady,      setMapReady]      = useState(false);
  const [heatmapPoints, setHeatmapPoints] = useState([]);
  const [loadingData,   setLoadingData]   = useState(true);
  const [error,         setError]         = useState(null);

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

      <View style={s.mapWrap}>
        {(!mapReady || loadingData) && (
          <View style={s.loader}>
            <ActivityIndicator size="large" color="#2D6A4F" />
            <Text style={s.loaderText}>
              {loadingData ? 'Fetching crime data…' : 'Loading map…'}
            </Text>
          </View>
        )}
        <WebView
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