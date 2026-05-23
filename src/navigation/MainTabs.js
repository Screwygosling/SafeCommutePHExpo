import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {Text, StyleSheet} from 'react-native';

import HomeScreen from '../screens/HomeScreen';
import HotspotsScreen from '../screens/HotspotsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#2D6A4F',
        tabBarInactiveTintColor: '#9E9E9E',
        tabBarLabelStyle: styles.tabLabel,
      }}>
      <Tab.Screen
        name="Map"
        component={HomeScreen}
        options={{tabBarIcon: ({color}) => <Text style={{fontSize: 22}}>🗺️</Text>, tabBarLabel: 'Map'}}
      />
      <Tab.Screen
        name="Hotspots"
        component={HotspotsScreen}
        options={{tabBarIcon: () => <Text style={{fontSize: 22}}>⚠️</Text>, tabBarLabel: 'Hotspots'}}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{tabBarIcon: () => <Text style={{fontSize: 22}}>⚙️</Text>, tabBarLabel: 'Settings'}}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    height: 60,
    paddingBottom: 8,
    paddingTop: 4,
    elevation: 10,
  },
  tabLabel: {fontSize: 11, fontWeight: '600'},
});
