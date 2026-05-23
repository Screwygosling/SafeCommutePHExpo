import React, {useState} from 'react';
import {View, Text, Switch, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView} from 'react-native';

const ACCENT = '#2D6A4F';

export default function SettingsScreen({navigation}) {
  const [cfg, setCfg] = useState({
    heatmap: true, police: true, transit: true,
    low: true, moderate: true, high: true, veryHigh: false,
    notifications: true, autoReroute: true, darkMode: false,
  });

  const toggle = k => setCfg(p => ({...p, [k]: !p[k]}));

  const Row = ({icon, label, k, color, sub}) => (
    <View style={s.row}>
      <View style={s.rowLeft}>
        <Text style={s.rowIcon}>{icon}</Text>
        <View>
          <Text style={s.rowLabel}>{label}</Text>
          {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
        </View>
      </View>
      <Switch
        value={cfg[k]} onValueChange={() => toggle(k)}
        trackColor={{false: '#E0E0E0', true: color || ACCENT}}
        thumbColor="#FFF" ios_backgroundColor="#E0E0E0"
      />
    </View>
  );

  const Sep = () => <View style={s.sep} />;
  const SectionTitle = ({t}) => <Text style={s.sectionTitle}>{t}</Text>;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}><Text style={s.headerTitle}>Settings</Text></View>
      <ScrollView contentContainerStyle={s.scroll}>

        <SectionTitle t="MAP LAYERS" />
        <View style={s.card}>
          <Row icon="🔥" label="Show Crime Heatmap"   k="heatmap"  sub="Overlay risk zones on map" />
          <Sep/>
          <Row icon="🚔" label="Show Police Stations" k="police"   sub="Nearby police markers" />
          <Sep/>
          <Row icon="🚌" label="Show Transit Routes"  k="transit"  sub="Jeepney & bus lines" />
        </View>

        <SectionTitle t="CRIME HEATMAP RISK LEVELS" />
        <View style={s.card}>
          <Row icon="🟢" label="Low"       k="low"      color="#52B788" sub="Safety Score 80–100" />
          <Sep/>
          <Row icon="🟡" label="Moderate"  k="moderate" color="#FFD166" sub="Safety Score 60–79" />
          <Sep/>
          <Row icon="🟠" label="High"      k="high"     color="#EF8C2D" sub="Safety Score 40–59" />
          <Sep/>
          <Row icon="🔴" label="Very High" k="veryHigh" color="#D62828" sub="Safety Score below 40" />
        </View>

        <SectionTitle t="ALERTS & NAVIGATION" />
        <View style={s.card}>
          <Row icon="🔔" label="Push Notifications" k="notifications" sub="Crime alerts near you" />
          <Sep/>
          <Row icon="🔄" label="Auto Re-route"      k="autoReroute"   sub="Avoid new danger zones" />
        </View>

        <SectionTitle t="APPEARANCE" />
        <View style={s.card}>
          <Row icon="🌙" label="Dark Mode" k="darkMode" sub="Easier on the eyes at night" />
        </View>

        <TouchableOpacity
          style={s.routeBtn}
          onPress={() => navigation.navigate('RouteOptions', {origin: 'Current Location', destination: 'My Destination'})}>
          <Text style={s.routeBtnText}>Route Options</Text>
          <Text style={s.routeBtnArrow}>→</Text>
        </TouchableOpacity>

        <Text style={s.version}>SafeCommute PH v1.0.0  •  OpenStreetMap (Free)</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F7F8FA'},
  header: {backgroundColor: '#FFF', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EEE', elevation: 2},
  headerTitle: {fontSize: 20, fontWeight: '700', color: '#1A1A1A', textAlign: 'center'},
  scroll: {padding: 16, paddingBottom: 32},
  sectionTitle: {fontSize: 11, fontWeight: '700', color: '#888', letterSpacing: 1.2, marginTop: 20, marginBottom: 8, marginLeft: 4},
  card: {backgroundColor: '#FFF', borderRadius: 14, overflow: 'hidden', elevation: 2},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14},
  rowLeft: {flexDirection: 'row', alignItems: 'center', flex: 1},
  rowIcon: {fontSize: 20, marginRight: 12},
  rowLabel: {fontSize: 15, fontWeight: '600', color: '#222'},
  rowSub: {fontSize: 12, color: '#999', marginTop: 1},
  sep: {height: 1, backgroundColor: '#F2F2F2', marginLeft: 52},
  routeBtn: {backgroundColor: '#FFF', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, elevation: 2, borderLeftWidth: 4, borderLeftColor: '#2D6A4F'},
  routeBtnText: {fontSize: 16, fontWeight: '700', color: '#2D6A4F'},
  routeBtnArrow: {fontSize: 20, color: '#2D6A4F', fontWeight: '700'},
  version: {textAlign: 'center', fontSize: 12, color: '#BBB', marginTop: 28},
});
