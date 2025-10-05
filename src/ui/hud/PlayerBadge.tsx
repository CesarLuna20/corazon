// Ejemplo: src/ui/hud/PlayerBadge.tsx
import React from "react";
import { View, Text } from "react-native";
import { useProfileStore } from "../../state/useProfileStore";
// si quieres icono/skin, también puedes importar tu avatar seleccionado

export default function PlayerBadge() {
  const playerName = useProfileStore(s => s.playerName) ?? "Jugador";
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: "#121826", borderWidth: 1, borderColor: "#263247" }}>
      <Text style={{ color: "#E6F0FF", fontWeight: "700" }}>
        {playerName}
      </Text>
    </View>
  );
}
