import React, {useState, useEffect, useRef} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Animated, Alert, Share, ActivityIndicator} from 'react-native';
import {WebView} from 'react-native-webview';
import {buildLeafletHTML, SAFE_ROUTE} from '../utils/LeafletMap';

const ACCENT = '#2D6A4F';
const DANGER = '#D62828';

export default function NavigationScreen({navigation, route}) {
  const {
    routeType    = 'Safest Route',
    safetyScore  = 90,
    origin       = 'Current Location',
    destination  = 'Destination',
    originCoords = SAFE_ROUTE[0],
    destCoords   = SAFE_ROUTE[SAFE_ROUTE.length - 1],
  } = route?.params || {};

  const [steps, setSteps]     = useState([{instruction: 'Calculating route…', distance: '', icon: '🛰️'}]);
  const [step, setStep]       = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [alert, setAlert]     = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const alertAnim = useRef(new Animated.Value(0)).current;

  const mapHTML = buildLeafletHTML({
    center: {lat: originCoords[0], lng: originCoords[1]},
    zoom: 14,
    showHeatmap: true,
    showPolice: false,
    showRoute: true,
    routeCoords: [originCoords, destCoords],
  });

  // Wire up real OSRM turn-by-turn steps from the WebView
  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'MAP_READY') {
        setMapReady(true);
      }

      if (data.type === 'ROUTE_FOUND' && Array.isArray(data.steps) && data.steps.length > 0) {
        setSteps(data.steps);
        setStep(0);
      }
    } catch (_) {
      // Non-JSON postMessage from Leaflet internals — ignore
    }
  };

  useEffect(() => {
    const t1 = setInterval(() => setElapsed(e => e + 1), 1000);

    // Show the caution alert after 5 s
    const t2 = setTimeout(() => {
      setAlert(true);
      Animated.timing(alertAnim, {toValue: 1, duration: 300, useNativeDriver: true}).start();
    }, 5000);

    // Auto-advance steps every 8 s (fallback when OSRM steps aren't available)
    const t3 = setInterval(() => setStep(p => (p < steps.length - 1 ? p + 1 : p)), 8000);

    return () => {
      clearInterval(t1);
      clearTimeout(t2);
      clearInterval(t3);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.length]);

  const dismissAlert = () =>
    Animated.timing(alertAnim, {toValue: 0, duration: 200, useNativeDriver: true}).start(() =>
      setAlert(false),
    );

  const fmt = s => `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;
  const scoreColor = safetyScore >= 80 ? ACCENT : safetyScore >= 60 ? '#EF8C2D' : DANGER;
  const progress = ((step + 1) / steps.length) * 100;
  const cur = steps[step] ?? steps[0];

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => navigation.goBack()}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Navigation</Text>
        <View style={s.timer}>
          <Text style={s.timerText}>{fmt(elapsed)}</Text>
        </View>
      </View>

      {/* Safety score bar */}
      <View style={s.scoreBar}>
        <Text style={s.scoreLabel}>Safety Score:</Text>
        <Text style={[s.scoreVal, {color: scoreColor}]}>{safetyScore}</Text>
        <View style={s.scoreBg}>
          <View style={[s.scoreFill, {width: `${safetyScore}%`, backgroundColor: scoreColor}]} />
        </View>
      </View>

      {/* Current step banner */}
      <View style={s.stepBanner}>
        <Text style={s.stepIcon}>{cur.icon ?? '⬆️'}</Text>
        <View style={{flex: 1}}>
          <Text style={s.stepInstr}>{cur.instruction}</Text>
          {cur.distance ? <Text style={s.stepDist}>In {cur.distance}</Text> : null}
        </View>
        <View style={s.stepCount}>
          <Text style={s.stepCountText}>{step + 1}/{steps.length}</Text>
        </View>
      </View>

      {/* Map */}
      <View style={s.mapWrap}>
        {!mapReady && (
          <View style={s.loader}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={s.loaderText}>Loading route…</Text>
          </View>
        )}

        <WebView
          originWhitelist={['*']}
          source={{html: mapHTML}}
          style={s.map}
          javaScriptEnabled
          domStorageEnabled
          onLoad={() => setMapReady(true)}
          onMessage={handleMessage}   // ← fixed: was an inline no-op
          scalesPageToFit={false}
          scrollEnabled={false}
          bounces={false}
        />

        {alert && (
          <Animated.View
            style={[
              s.alertBox,
              {
                opacity: alertAnim,
                transform: [
                  {
                    translateY: alertAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={s.alertIcon}>⚠️</Text>
            <View style={{flex: 1}}>
              <Text style={s.alertTitle}>Alert: Caution</Text>
              <Text style={s.alertMsg}>High Crime Area Ahead</Text>
            </View>
            <TouchableOpacity onPress={dismissAlert} style={{padding: 6}}>
              <Text style={{fontSize: 16, color: '#92400E'}}>✕</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>

      {/* Progress bar */}
      <View style={s.prog}>
        <View style={s.progBg}>
          <View style={[s.progFill, {width: `${progress}%`}]} />
        </View>
        <Text style={s.progLabel}>{Math.round(progress)}% complete</Text>
      </View>

      {/* Action buttons */}
      <View style={s.actions}>
        <TouchableOpacity
          style={s.shareBtn}
          onPress={() => Share.share({message: `Navigating to ${destination} via SafeCommute PH 📍`})}
          activeOpacity={0.85}
        >
          <Text style={s.shareBtnText}>📤 Share Location</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.endBtn}
          onPress={() =>
            Alert.alert('End Trip', 'End this trip?', [
              {text: 'Cancel', style: 'cancel'},
              {text: 'End Trip', style: 'destructive', onPress: () => navigation.navigate('MainTabs')},
            ])
          }
          activeOpacity={0.85}
        >
          <Text style={s.endBtnText}>🏁 End Trip</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:     {flex: 1, backgroundColor: '#F7F8FA'},
  header:        {flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#EEE', elevation: 2},
  back:          {padding: 6, marginRight: 8},
  backArrow:     {fontSize: 22, color: '#1A1A1A'},
  headerTitle:   {flex: 1, fontSize: 18, fontWeight: '700', color: '#1A1A1A'},
  timer:         {backgroundColor: '#EBF5F0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10},
  timerText:     {fontSize: 13, fontWeight: '700', color: ACCENT},
  scoreBar:      {flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0'},
  scoreLabel:    {fontSize: 13, fontWeight: '600', color: '#555'},
  scoreVal:      {fontSize: 18, fontWeight: '800', minWidth: 34},
  scoreBg:       {flex: 1, height: 6, backgroundColor: '#EEE', borderRadius: 3, overflow: 'hidden'},
  scoreFill:     {height: '100%', borderRadius: 3},
  stepBanner:    {flexDirection: 'row', alignItems: 'center', backgroundColor: ACCENT, paddingHorizontal: 16, paddingVertical: 14, gap: 12},
  stepIcon:      {fontSize: 28},
  stepInstr:     {fontSize: 15, fontWeight: '700', color: '#FFF'},
  stepDist:      {fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2},
  stepCount:     {backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8},
  stepCountText: {fontSize: 12, color: '#FFF', fontWeight: '700'},
  mapWrap:       {flex: 1, position: 'relative'},
  loader:        {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA', zIndex: 10},
  loaderText:    {marginTop: 12, fontSize: 14, color: '#888'},
  map:           {flex: 1, backgroundColor: 'transparent'},
  alertBox:      {position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: '#FFF3CD', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', borderLeftWidth: 4, borderLeftColor: '#EF8C2D', elevation: 8},
  alertIcon:     {fontSize: 22, marginRight: 10},
  alertTitle:    {fontSize: 14, fontWeight: '800', color: '#B45309'},
  alertMsg:      {fontSize: 13, color: '#92400E', marginTop: 2},
  prog:          {backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 10, gap: 4, borderTopWidth: 1, borderTopColor: '#F0F0F0'},
  progBg:        {height: 5, backgroundColor: '#EEE', borderRadius: 3, overflow: 'hidden'},
  progFill:      {height: '100%', backgroundColor: ACCENT, borderRadius: 3},
  progLabel:     {fontSize: 11, color: '#999', fontWeight: '500', textAlign: 'right'},
  actions:       {flexDirection: 'row', padding: 14, gap: 10, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#EEE'},
  shareBtn:      {flex: 1, backgroundColor: '#F0F4F8', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#D0D8E4'},
  shareBtnText:  {fontSize: 14, fontWeight: '700', color: '#333'},
  endBtn:        {flex: 1, backgroundColor: DANGER, borderRadius: 12, paddingVertical: 14, alignItems: 'center', elevation: 2},
  endBtnText:    {fontSize: 14, fontWeight: '700', color: '#FFF'},
});