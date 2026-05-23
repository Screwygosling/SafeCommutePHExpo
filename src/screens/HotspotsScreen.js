import React, {useState, useEffect, useMemo} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator} from 'react-native';
import {WebView} from 'react-native-webview';
import {buildLeafletHTML, PASAY_CENTER} from '../utils/LeafletMap';
import {getCrimeHeatmapData} from '../utils/api';

const LEGEND = [
  {label: 'Low',       color: '#52B788'},
  {label: 'Moderate',  color: '#FFD166'},
  {label: 'High',      color: '#EF8C2D'},
  {label: 'Very High', color: '#D62828'},
];

export default function HotspotsScreen() {
  const [showPolice, setShowPolice] = useState(true);
  const [mapReady, setMapReady]     = useState(false);
  const [heatmapPoints, setHeatmapPoints] = useState([]);
  const [loadingData, setLoadingData]     = useState(true);
  const [error, setError]                 = useState(null);

  useEffect(() => {
    fetchHeatmapData();
  }, []);

  const fetchHeatmapData = async () => {
    setLoadingData(true);
    setError(null);
    try {
      console.log('Fetching heatmap data...');
      const data = await getCrimeHeatmapData();
      console.log('Data received:', data.length, 'points');
      setHeatmapPoints(data);
    } catch (e) {
      console.log('Error:', e.message);
      setError('Could not load crime data. Using default map.');
    } finally {
      setLoadingData(false);
    }
  };

  const mapHTML = useMemo(() => buildLeafletHTML({
    center: PASAY_CENTER,
    zoom: 13,
    showHeatmap: true,
    showPolice,
    heatmapPoints,
  }), [heatmapPoints, showPolice]);
console.log('heatmapPoints sample:', heatmapPoints.slice(0, 2));
console.log('mapHTML contains points:', mapHTML.includes('heatLayer'));

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Crime Hotspots</Text>
        <TouchableOpacity style={s.toggle} onPress={() => { setShowPolice(p => !p); setMapReady(false); }}>
          <Text style={s.toggleText}>{showPolice ? '🚔 Hide Police' : '🚔 Show Police'}</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>⚠️ {error}</Text>
          <TouchableOpacity onPress={fetchHeatmapData}>
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
          source={{
            html: mapHTML,
            baseUrl: 'https://unpkg.com'
          }}
          style={s.map}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          allowsInlineMediaPlayback
          onLoad={() => setMapReady(true)}
          onMessage={() => setMapReady(true)}
          onError={(e) => console.log('WebView error:', e.nativeEvent)}
          scalesPageToFit={false}
          scrollEnabled={false}
          bounces={false}
          onHttpError={(e) => console.log('HTTP error:', e.nativeEvent)}
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
  container: {flex: 1, backgroundColor: '#F7F8FA'},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EEE', elevation: 2},
  title: {fontSize: 18, fontWeight: '700', color: '#1A1A1A'},
  toggle: {backgroundColor: '#EBF5F0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20},
  toggleText: {fontSize: 12, fontWeight: '600', color: '#2D6A4F'},
  mapWrap: {flex: 1, position: 'relative'},
  loader: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA', zIndex: 10},
  loaderText: {marginTop: 12, fontSize: 14, color: '#888'},
  map: {flex: 1, backgroundColor: 'transparent'},
  legend: {flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#FFF', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#EEE', elevation: 4},
  legendItem: {flexDirection: 'row', alignItems: 'center'},
  dot: {width: 12, height: 12, borderRadius: 6, marginRight: 5},
  legendLabel: {fontSize: 12, fontWeight: '500', color: '#444'},
  errorBanner: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF3CD', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#FFD166'},
  errorText: {fontSize: 12, color: '#856404'},
  retryText: {fontSize: 12, fontWeight: '700', color: '#2D6A4F'},
});