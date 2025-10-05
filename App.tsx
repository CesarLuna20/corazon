// App.tsx
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import { useFonts, Montserrat_400Regular, Montserrat_700Bold } from "@expo-google-fonts/montserrat";

// Screens
import HomeScreen from "./src/ui/HomeScreen";
import StoryScreen from "./src/ui/StoryScreen";
import NormalScreen from "./src/ui/NormalScreen";
import EndlessScreen from "./src/ui/EndlessScreen";
import CollectionScreen from "./src/ui/CollectionScreen";
import StoreScreen from "./src/ui/StoreScreen";
import ProfileScreen from "@/ui/ProfileScreen";




export type RootStackParamList = {
  Home: undefined;
  Story: undefined;
  Normal: undefined;
  Endless: undefined;
  Collection: undefined;
  Store: undefined;
  Profile: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export default function App() {
  useEffect(() => {
    // Android: ocultar barra de navegación (modo inmersivo)
    NavigationBar.setVisibilityAsync("hidden");
    NavigationBar.setBehaviorAsync("overlay-swipe");
    NavigationBar.setBackgroundColorAsync("transparent").catch(() => {});
  }, []);

  // ✅ Cargar Montserrat (Regular y Bold) usando exports del paquete
  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_700Bold,
  });

  const theme = {
    ...DefaultTheme,
    colors: { ...DefaultTheme.colors, background: "transparent" },
  };

  if (!fontsLoaded) return null;

  return (
    <>
      {/* iOS/Android: oculta status bar */}
      <StatusBar hidden />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <NavigationContainer theme={theme}>
          <Stack.Navigator
            initialRouteName="Home"
            screenOptions={{ headerShown: false, animation: "fade" }}
          >
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Story" component={StoryScreen} />
            <Stack.Screen name="Normal" component={NormalScreen} />
            <Stack.Screen name="Endless" component={EndlessScreen} />
            <Stack.Screen name="Collection" component={CollectionScreen} />
            <Stack.Screen name="Store" component={StoreScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </GestureHandlerRootView>
    </>
  );
}
