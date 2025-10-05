// src/ui/ProfileScreen.tsx
import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Vibration,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useProfileStore } from "../state/useProfileStore";

// 🎨 Mismo tema TOON que CollectionScreen
const TOON = {
  bg: "#D8DEE7",
  sky: "#9AB7CF",
  mint: "#90C99A",
  lemon: "#E1D06F",
  peach: "#E7B78B",
  pink: "#D886A8",
  grape: "#A594C5",
  ink: "#141B25",
  sub: "#485568",
  card: "#E4E9F0",
  border: "#C1CCDA",
  ok: "#1F9663",
  okBorder: "#17704B",
  err: "#CC4A4A",
  errBorder: "#A63A3A",
  focus: "#3E8EDC",
};
const rounded = 20;

// Paleta suave por elemento (pastel + borde)
const E_COLORS: Record<
  "fuego" | "agua" | "tierra" | "energia" | "aire" | "hielo" | "oscuridad" | "veneno",
  { bg: string; border: string }
> = {
  fuego:     { bg: "#F8C1A8", border: "#E8A285" },
  agua:      { bg: "#BFD9F2", border: "#9ABFE4" },
  tierra:    { bg: "#D6C8A6", border: "#BFAA7A" },
  energia:   { bg: "#F0E19B", border: "#D6C574" },
  aire:      { bg: "#CDEAE7", border: "#9ED4D0" },
  hielo:     { bg: "#D7EBFF", border: "#B7DBFF" },
  oscuridad: { bg: "#C9C2DA", border: "#A79DBE" },
  veneno:    { bg: "#BFE6CC", border: "#93D3AE" },
};

const ELEMENTS: Array<{ key:
  "fuego" | "agua" | "tierra" | "energia" | "aire" | "hielo" | "oscuridad" | "veneno";
  label: string;
}> = [
  { key: "fuego", label: "Fuego" },
  { key: "agua", label: "Agua" },
  { key: "tierra", label: "Tierra" },
  { key: "energia", label: "Energía" },
  { key: "aire", label: "Aire" },
  { key: "hielo", label: "Hielo" },
  { key: "oscuridad", label: "Oscuridad" },
  { key: "veneno", label: "Veneno" },
];

export default function ProfileScreen() {
  const nav = useNavigation<any>();
  const level   = useProfileStore((s) => s.playerLevel);
  const xp      = useProfileStore((s) => s.playerXp);
  const points  = useProfileStore((s) => s.playerStatPoints);
  const hpPts   = useProfileStore((s) => s.playerHpPoints);
  const getHp   = useProfileStore((s) => s.getComputedMaxHp);
  const getAff  = useProfileStore((s) => s.getAffinity);
  const addHp   = useProfileStore((s) => s.allocateHpPoint);
  const addAff  = useProfileStore((s) => s.allocateAffinityPoint);

  // Mismo cálculo que en store:
  const xpNeeded = React.useMemo(() => {
    const XP_BASE = 100, XP_GROWTH = 1.25;
    return Math.round(XP_BASE * Math.pow(XP_GROWTH, Math.max(0, (level ?? 1) - 1)));
  }, [level]);
  const hpMax = getHp();
  const xpPct = Math.max(0, Math.min(1, xpNeeded ? xp / xpNeeded : 0));

  const Badge = ({ color }: { color: string }) => (
    <View style={{ height: 8, backgroundColor: color, borderRadius: 6, marginHorizontal: 2, flex: 1 }} />
  );

  const onIncHp = (n: number) => {
    if (points <= 0) return;
    addHp(Math.min(n, points));
    Vibration.vibrate(20);
  };
  const onIncAff = (el: (typeof ELEMENTS)[number]["key"], n: number) => {
    if (points <= 0) return;
    addAff(el, Math.min(n, points));
    Vibration.vibrate(20);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: TOON.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Franja de colores superior */}
        <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingTop: 12 }}>
          <Badge color={TOON.sky} />
          <Badge color={TOON.mint} />
          <Badge color={TOON.lemon} />
          <Badge color={TOON.peach} />
          <Badge color={TOON.pink} />
          <Badge color={TOON.grape} />
        </View>

        {/* Header / XP */}
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.title}>
            Perfil — <Text style={{ color: TOON.focus }}>Jugador</Text> 🌟
          </Text>
          <Text style={styles.sub}>
            Nivel <Text style={styles.bold}>{level}</Text> • XP {xp}/{xpNeeded}
          </Text>

          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${xpPct * 100}%` }]} />
          </View>

          <View style={[styles.row, { marginTop: 10 }]}>
            <View style={styles.chip}>
              <Text style={styles.chipInk}>Puntos: {points}</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipInk}>Vida máx: {hpMax}</Text>
            </View>
          </View>
        </View>

        {/* Vida Máxima */}
        <View style={styles.card}>
          <Text style={styles.section}>Vida máxima</Text>
          <Text style={styles.sub}>
            Actual: <Text style={styles.bold}>{hpMax}</Text>  (puntos en Vida: {hpPts})
          </Text>

          <View style={styles.row}>
            <Pressable
              style={[styles.btn, points <= 0 && styles.btnDisabled]}
              disabled={points <= 0}
              onPress={() => onIncHp(1)}
              onLongPress={() => onIncHp(5)}
              hitSlop={8}
            >
              <Text style={styles.btnInk}>+ Vida (tap=+1 · long=+5)</Text>
            </Pressable>
          </View>
        </View>

        {/* Afinidades */}
        <View style={styles.card}>
          <Text style={styles.section}>Afinidades elementales</Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {ELEMENTS.map((e) => {
              const mul = getAff(e.key);
              const col = E_COLORS[e.key];
              return (
                <Pressable
                  key={e.key}
                  style={[
                    styles.affTile,
                    { backgroundColor: col.bg, borderColor: col.border },
                    points <= 0 && styles.btnDisabled,
                  ]}
                  disabled={points <= 0}
                  onPress={() => onIncAff(e.key, 1)}
                  onLongPress={() => onIncAff(e.key, 5)}
                  hitSlop={8}
                  android_ripple={{ color: "#00000014", borderless: false }}
                >
                  <Text style={styles.affLabel}>{e.label}</Text>
                  <Text style={styles.affVal}>×{mul.toFixed(2)}</Text>
                  <View style={styles.plusPill}>
                    <Text style={styles.plusPillInk}>+1</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.sub, { marginTop: 8 }]}>
            Tip: mantén presionado para asignar <Text style={styles.bold}>+5</Text>.
          </Text>
        </View>

        {/* Acciones / Navegación */}
        <View style={[styles.card, { alignItems: "center" }]}>
          <Pressable
            style={[styles.btn, { paddingHorizontal: 18 }]}
            onPress={() => nav.reset({ index: 0, routes: [{ name: "Home" }] })}
            hitSlop={8}
          >
            <Text style={styles.btnInk}>Ir a Home</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: TOON.card,
    borderWidth: 2,
    borderColor: TOON.border,
    borderRadius: rounded,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  title: {
    color: TOON.ink, fontSize: 26, fontWeight: "900", marginBottom: 6,
  },
  section: {
    color: TOON.ink, fontSize: 18, fontWeight: "900", marginBottom: 6,
  },
  sub: { color: TOON.sub },
  bold: { fontWeight: "900", color: TOON.ink },

  // XP bar
  barBg: {
    height: 12, borderRadius: 8, backgroundColor: "#C8D1DE",
    marginTop: 10, overflow: "hidden",
  },
  barFill: {
    height: 12, backgroundColor: TOON.mint,
  },

  row: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" },
  chip: {
    backgroundColor: "#FFFFFFAA",
    borderColor: TOON.border,
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  chipInk: { color: TOON.ink, fontWeight: "900" },

  // Botones
  btn: {
    backgroundColor: "#FFFFFFAA",
    borderColor: TOON.border,
    borderWidth: 2,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  btnDisabled: { opacity: 0.5 },
  btnInk: { color: TOON.ink, fontWeight: "900" },

  // Tiles de afinidad
  affTile: {
    width: "48%",
    borderWidth: 2,
    borderRadius: 14,
    padding: 12,
  },
  affLabel: { color: TOON.ink, fontWeight: "900", fontSize: 14 },
  affVal: { color: TOON.sub, fontWeight: "800", marginTop: 2 },
  plusPill: {
    alignSelf: "flex-start",
    marginTop: 8,
    backgroundColor: "#ffffffcc",
    borderColor: "#ffffffaa",
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  plusPillInk: { color: TOON.ink, fontWeight: "900" },
});
