import React from "react";
import { View, Text } from "react-native";
import { useWalletStore } from "../../state/useWalletStore";

export default function WalletBar() {
  const coins = useWalletStore((s) => s.coins);
  return (
    <View style={{
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
      backgroundColor: "#141a24", borderWidth: 1, borderColor: "#243045",
      flexDirection: "row", alignItems: "center", gap: 8
    }}>
      <Text style={{ color: "#ffd35a", fontWeight: "700" }}>🪙 {coins}</Text>
    </View>
  );
}
