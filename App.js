import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {StatusBar} from 'react-native';

import MainTabs from './src/navigation/MainTabs';
import NavigationScreen from './src/screens/NavigationScreen';
import RouteOptionsScreen from './src/screens/RouteOptionsScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <NavigationContainer>
          <Stack.Navigator screenOptions={{headerShown: false, cardStyle: {backgroundColor: '#F5F5F5'}}}>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="Navigation" component={NavigationScreen} />
            <Stack.Screen name="RouteOptions" component={RouteOptionsScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
