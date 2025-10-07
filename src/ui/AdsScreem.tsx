import React from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useWalletStore } from "../state/useWalletStore";

export default function AdsScreen() {
  const navigation = useNavigation();
  const addCoins = useWalletStore((s) => s.addCoins);

  const watchAd = (reward: number) => {
    // ⚠️ Aquí luego se integrará AdMob o Unity Ads
    Alert.alert("Anuncio visto 🎉", `Has ganado ${reward} monedas`);
    addCoins(reward);
  };

  const options = [
    { id: 1, label: "Ver anuncio y ganar 50 monedas", reward: 50 },
    { id: 2, label: "Ver anuncio y duplicar tus monedas", reward: 100 },
    { id: 3, label: "Ver anuncio premium (+200 monedas)", reward: 200 },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: "#121212", padding: 24 }}>
      <Text style={{ color: "white", fontSize: 26, fontWeight: "bold", marginBottom: 20 }}>
        Centro de Recompensas
      </Text>

      {options.map((opt) => (
        <TouchableOpacity
          key={opt.id}
          style={{
            backgroundColor: "#2c2c2c",
            borderRadius: 14,
            paddingVertical: 16,
            paddingHorizontal: 12,
            marginBottom: 14,
          }}
          onPress={() => watchAd(opt.reward)}
        >
          <Text style={{ color: "white", fontSize: 18 }}>{opt.label}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={{
          marginTop: 30,
          alignSelf: "center",
          backgroundColor: "#444",
          paddingHorizontal: 30,
          paddingVertical: 12,
          borderRadius: 14,
        }}
        onPress={() => navigation.goBack()}
      >
        <Text style={{ color: "white", fontSize: 18 }}>Volver</Text>
      </TouchableOpacity>
    </View>
  );
}
