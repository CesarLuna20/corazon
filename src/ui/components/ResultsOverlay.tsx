// src/ui/components/ResultsOverlay.tsx
import React from "react";
import { View, Text, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useBattleStore } from "../../state/useBattleStore";

const UI = {
  backdrop: "rgba(0,0,0,0.55)",
  panel: "#0F1829",
  ink: "#E6F3FF",
  sub: "#BFD0E8",
  win: "#65E08E",
  lose: "#FF7A7A",
  btn: "#1F3A5F",
  btn2: "#2A3E2E",
  stroke: "#1f2a44",
};

export default function ResultsOverlay() {
  const navigation = useNavigation<any>();
  const show = useBattleStore((s) => s.showResults);
  const res = useBattleStore((s) => s.result);
  const resetMatch = useBattleStore((s) => s.resetMatch);

  if (!show || !res) return null;

  const title = res.outcome === "win" ? "¡Victoria!" : "Derrota";
  const col = res.outcome === "win" ? UI.win : UI.lose;
  const eloLine = `${res.eloBefore} → ${res.eloAfter}  (${res.eloDelta >= 0 ? "+" : ""}${res.eloDelta})`;

  return (
    <View
      pointerEvents="auto"
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: UI.backdrop,
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
      }}
    >
      <View
        style={{
          width: 300,
          borderRadius: 18,
          backgroundColor: UI.panel,
          borderWidth: 1,
          borderColor: UI.stroke,
          padding: 16,
        }}
      >
        <Text style={{ color: col, fontSize: 24, fontWeight: "900", textAlign: "center" }}>
          {title}
        </Text>

        <View style={{ height: 8 }} />

        <View style={{ gap: 6 }}>
          <Text style={{ color: UI.sub, textAlign: "center" }}>
            +{res.coins} monedas · +{res.xp} XP
          </Text>
          <Text style={{ color: UI.sub, textAlign: "center" }}>
            ELO: {eloLine}
          </Text>
        </View>

        <View style={{ height: 14 }} />

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => {
              // Oculta overlay y relanza la partida (HP/energía/proyectiles limpios)
              useBattleStore.setState({ showResults: false, result: null, paused: false });
              resetMatch();
              // Nota: si quieres también regenerar el tablero,
              // haz que NormalScreen escuche un matchId en el store y regenere al cambiar.
            }}
            style={{
              flex: 1,
              backgroundColor: UI.btn2,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#2E4D32",
            }}
          >
            <Text style={{ color: UI.ink, fontWeight: "800" }}>Revancha</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              useBattleStore.getState().stop(); // por si acaso
              useBattleStore.setState({ showResults: false, result: null, paused: false });
              navigation.reset({ index: 0, routes: [{ name: "Home" }] });
            }}
            style={{
              flex: 1,
              backgroundColor: UI.btn,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#2B4B76",
            }}
          >
            <Text style={{ color: UI.ink, fontWeight: "800" }}>Home</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
