import React, {useState, useEffect} from 'react';
import {View, Text, TouchableOpacity, Switch, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator} from 'react-native';
import {getRouteOptions} from '../utils/api';

const ACCENT = '#2D6A4F', DANGER = '#D62828', WARN = '#EF8C2D';

const FALLBACK_ROUTES = [
  {id:'safest',   label:'Safest Route',   score:90, duration:'28 min', distance:'6.2 km', desc:'Avoids all high-risk zones.',      scoreColor:ACCENT, tagBg:'#EBF5F0', tagColor:ACCENT, tag:'✅ Recommended'},
  {id:'balanced', label:'Balanced Route', score:72, duration:'21 min', distance:'4.9 km', desc:'Moderate risk, slightly faster.',  scoreColor:WARN,   tagBg:'#FFF4E6', tagColor:WARN,   tag:'⚖️ Balanced'},
  {id:'fastest',  label:'Fastest Route',  score:55, duration:'15 min', distance:'4.1 km', desc:'Passes high-risk areas. Caution.',scoreColor:DANGER, tagBg:'#FDEAEA', tagColor:DANGER, tag:'⚡ Fastest'},
];

function scoreColor(score) {
  if (score >= 80) return ACCENT;
  if (score >= 60) return WARN;
  return DANGER;
}

function tagStyle(score) {
  if (score >= 80) return {bg: '#EBF5F0', color: ACCENT};
  if (score >= 60) return {bg: '#FFF4E6', color: WARN};
  return {bg: '#FDEAEA', color: DANGER};
}

export default function RouteOptionsScreen({navigation, route}) {
  const {origin = 'Current Location', destination = 'My Destination'} = route?.params || {};
  const [selected, setSelected]   = useState('safest');
  const [filters, setFilters]     = useState({safest: true, police: true, transit: true});
  const [routes, setRoutes]       = useState(FALLBACK_ROUTES);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRouteOptions(origin, destination);
      // Attach colors based on dynamic score
      const enriched = data.routes.map(r => ({
        ...r,
        scoreColor: scoreColor(r.score),
        tagBg:      tagStyle(r.score).bg,
        tagColor:   tagStyle(r.score).color,
      }));
      setRoutes(enriched);
    } catch (e) {
      setError('Could not load live route data. Showing estimates.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const sel = routes.find(r => r.id === selected);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => navigation.goBack()}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Route Options</Text>
        <View style={{width: 40}} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Trip summary */}
        <View style={s.tripCard}>
          <View style={s.tripRow}><Text style={s.tripIcon}>📍</Text><Text style={s.tripText} numberOfLines={1}>{origin}</Text></View>
          <View style={s.tripSep}/>
          <View style={s.tripRow}><Text style={s.tripIcon}>🎯</Text><Text style={s.tripText} numberOfLines={1}>{destination}</Text></View>
        </View>

        {/* Error banner */}
        {error && (
          <View style={s.errorBanner}>
            <Text style={s.errorText}>⚠️ {error}</Text>
            <TouchableOpacity onPress={fetchRoutes}>
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Filters */}
        <View style={s.card}>
          {[{k:'safest',label:'Safest Route',icon:'🛡️'},{k:'police',label:'Police Stations',icon:'🚔'},{k:'transit',label:'Transit Routes',icon:'🚌'}].map(f => (
            <View key={f.k} style={s.filterRow}>
              <Text style={s.filterIcon}>{f.icon}</Text>
              <Text style={s.filterLabel}>{f.label}</Text>
              <Switch value={filters[f.k]} onValueChange={() => setFilters(p => ({...p, [f.k]: !p[f.k]}))}
                trackColor={{false: '#E0E0E0', true: ACCENT}} thumbColor="#FFF" ios_backgroundColor="#E0E0E0"/>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>SELECT A ROUTE</Text>

        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color={ACCENT}/>
            <Text style={s.loadingText}>Calculating safe routes…</Text>
          </View>
        ) : (
          routes.map(r => (
            <TouchableOpacity key={r.id} style={[s.routeCard, selected === r.id && s.routeCardSel]} onPress={() => setSelected(r.id)} activeOpacity={0.85}>
              <View style={s.routeTop}>
                <View style={{flex: 1, marginRight: 12}}>
                  <Text style={s.routeLabel}>{r.label}</Text>
                  <Text style={s.routeDesc}>{r.desc}</Text>
                  <View style={[s.tag, {backgroundColor: r.tagBg}]}>
                    <Text style={[s.tagText, {color: r.tagColor}]}>{r.tag}</Text>
                  </View>
                </View>
                <View style={{alignItems: 'center'}}>
                  <Text style={[s.score, {color: r.scoreColor}]}>{r.score}</Text>
                  <Text style={s.scoreLbl}>Safety</Text>
                </View>
              </View>
              <View style={s.barWrap}>
                <View style={s.barBg}><View style={[s.barFill, {width: `${r.score}%`, backgroundColor: r.scoreColor}]}/></View>
                <Text style={[s.barNum, {color: r.scoreColor}]}>{r.score}</Text>
              </View>
              <View style={s.metaRow}>
                <Text style={s.meta}>⏱ {r.duration}</Text>
                <Text style={s.meta}>📏 {r.distance}</Text>
              </View>
              {selected === r.id && <View style={s.selBadge}><Text style={s.selBadgeText}>✓ Selected</Text></View>}
            </TouchableOpacity>
          ))
        )}

        <TouchableOpacity
          style={s.startBtn}
          onPress={() => navigation.navigate('Navigation', {routeType: sel?.label, safetyScore: sel?.score, origin, destination})}
          activeOpacity={0.87}>
          <Text style={s.startBtnText}>🧭 Start Navigation</Text>
          <Text style={s.startBtnSub}>{sel?.label} • Safety Score: {sel?.score}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#F7F8FA'},
  header:{flexDirection:'row',alignItems:'center',backgroundColor:'#FFF',paddingHorizontal:16,paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#EEE',elevation:2},
  back:{padding:6},backArrow:{fontSize:22,color:'#1A1A1A'},
  headerTitle:{flex:1,textAlign:'center',fontSize:18,fontWeight:'700',color:'#1A1A1A'},
  scroll:{padding:16,paddingBottom:32},
  tripCard:{backgroundColor:'#FFF',borderRadius:14,padding:14,marginBottom:14,elevation:2},
  tripRow:{flexDirection:'row',alignItems:'center',paddingVertical:6},
  tripIcon:{fontSize:16,marginRight:10},
  tripText:{fontSize:14,fontWeight:'600',color:'#333',flex:1},
  tripSep:{height:1,backgroundColor:'#F0F0F0',marginLeft:28},
  card:{backgroundColor:'#FFF',borderRadius:14,overflow:'hidden',marginBottom:14,elevation:2},
  filterRow:{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:13,borderBottomWidth:1,borderBottomColor:'#F5F5F5'},
  filterIcon:{fontSize:18,marginRight:12},filterLabel:{flex:1,fontSize:15,fontWeight:'600',color:'#222'},
  sectionTitle:{fontSize:11,fontWeight:'700',color:'#888',letterSpacing:1.2,marginBottom:10,marginLeft:2},
  routeCard:{backgroundColor:'#FFF',borderRadius:14,padding:16,marginBottom:12,elevation:2,borderWidth:2,borderColor:'transparent'},
  routeCardSel:{borderColor:ACCENT,backgroundColor:'#F8FDFB'},
  routeTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},
  routeLabel:{fontSize:16,fontWeight:'700',color:'#1A1A1A'},
  routeDesc:{fontSize:12,color:'#888',marginTop:3,marginBottom:8},
  tag:{alignSelf:'flex-start',paddingHorizontal:8,paddingVertical:3,borderRadius:8},
  tagText:{fontSize:11,fontWeight:'700'},
  score:{fontSize:32,fontWeight:'800'},scoreLbl:{fontSize:11,color:'#999',fontWeight:'600'},
  barWrap:{flexDirection:'row',alignItems:'center',marginTop:12,marginBottom:10},
  barBg:{flex:1,height:6,backgroundColor:'#EEE',borderRadius:3,overflow:'hidden',marginRight:10},
  barFill:{height:'100%',borderRadius:3},
  barNum:{fontSize:13,fontWeight:'700',minWidth:28,textAlign:'right'},
  metaRow:{flexDirection:'row',gap:16},
  meta:{fontSize:12,color:'#666',fontWeight:'500'},
  selBadge:{marginTop:10,alignSelf:'flex-end',backgroundColor:ACCENT,paddingHorizontal:10,paddingVertical:4,borderRadius:8},
  selBadgeText:{fontSize:12,color:'#FFF',fontWeight:'700'},
  startBtn:{backgroundColor:ACCENT,borderRadius:16,paddingVertical:18,alignItems:'center',marginTop:6,elevation:4},
  startBtnText:{fontSize:17,fontWeight:'800',color:'#FFF'},
  startBtnSub:{fontSize:12,color:'rgba(255,255,255,0.8)',marginTop:3},
  loadingWrap:{alignItems:'center',paddingVertical:40},
  loadingText:{marginTop:12,fontSize:14,color:'#888'},
  errorBanner:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',backgroundColor:'#FFF3CD',paddingHorizontal:16,paddingVertical:8,borderRadius:10,marginBottom:12},
  errorText:{fontSize:12,color:'#856404',flex:1},
  retryText:{fontSize:12,fontWeight:'700',color:ACCENT,marginLeft:8},
});