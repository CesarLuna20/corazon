// src/ui/CollectionScreen.tsx
import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Vibration,
  SafeAreaView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useProfileStore } from "../state/useProfileStore";
import Chip from "./components/Chip";
import BibixCard from "./components/BibixCard";
import { bibixList, type BibixRow } from "../data/registry";

type Rarity = "comun" | "rara" | "epica" | "legendaria";
type Phase = 1 | 2 | 3 | 4;

const rarityEnToEs: Record<BibixRow["rarity"], Rarity> = {
  common: "comun",
  rare: "rara",
  epic: "epica",
  legendary: "legendaria",
};

// UI Constantes
const ELEMENTS = [
  "todos","fuego","agua","tierra","energia","aire","hielo","oscuridad","veneno",
] as const;
type ElementFilter = (typeof ELEMENTS)[number];

const RARITIES = ["todas","comun","rara","epica","legendaria"] as const;
type RarityFilter = (typeof RARITIES)[number];

/** 🎨 Tema pastel */
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
const PHASE_MUL: Record<Phase, number> = { 1: 1.0, 2: 1.1, 3: 1.22, 4: 1.35 };

// Helpers de stats/daño por fase
function statsForPhase(row: BibixRow, phase: Phase) {
  const mul = PHASE_MUL[phase];
  const lv = (base: number, g: number) => (base + g * (phase - 1)) * mul;
  const hp = Math.round(lv(row.base.hp, row.growth.hp));
  const atk = Math.round(lv(row.base.atk, row.growth.atk));
  const def = Math.round(lv(row.base.def, row.growth.def));
  const speed = Number((Math.round((row.base.speed ?? 0) * (row.growth.speed ?? 0))).toFixed(2));

  return { hp, atk, def, speed };
}
function damageForPhase(row: BibixRow, phase: Phase, fallbackAtk: number) {
  const key = String(phase) as "1" | "2" | "3" | "4";
  const cd = row.chargeDamage?.[key];
  return Math.round(cd ?? fallbackAtk);
}

export default function CollectionScreen() {
  const nav = useNavigation<any>();

  const ownedBibix = useProfileStore((s) => s.ownedBibix);
  const selectedBibix = useProfileStore((s) => s.selectedBibix);
  const setSelected = useProfileStore((s) => s.setSelected);
  const addOwned = useProfileStore((s) => s.addOwned);
  const phasesByBibix = useProfileStore((s) => s.phasesByBibix);

  const [query, setQuery] = useState("");
  const [element, setElement] = useState<ElementFilter>("todos");
  const [rarity, setRarity] = useState<RarityFilter>("todas");
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  useEffect(() => {
    if (ownedBibix.length === 0) {
      bibixList.slice(0, 12).forEach((b) => addOwned(b.id));
    }
  }, [ownedBibix.length, addOwned]);

  const list = useMemo(() => {
    let arr = bibixList.filter((b) => ownedBibix.includes(b.id));
    if (element !== "todos") arr = arr.filter((b) => b.element === element);
    if (rarity !== "todas") arr = arr.filter((b) => rarityEnToEs[b.rarity] === rarity);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter(
        (b) => b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q)
      );
    }
    return arr;
  }, [query, element, rarity, ownedBibix]);

  const isOwned = (id: string) => ownedBibix.includes(id);
  const isSelected = (id: string) => selectedBibix.some((s) => s === id);
  const firstEmptySlot = () => selectedBibix.findIndex((s) => s === null);

  const setSlot = (idx: number, id: string | null) => {
    const next = [...selectedBibix] as typeof selectedBibix;
    next[idx] = id;
    setSelected(next);
  };
  const addToSelection = (id: string) => {
    if (isSelected(id)) return;
    if (activeSlot !== null) {
      setSlot(activeSlot, id);
      setActiveSlot(null);
      return;
    }
    const i = firstEmptySlot();
    if (i >= 0) setSlot(i, id);
  };
  const removeFromSelection = (idx: number) => setSlot(idx, null);

  const canConfirm = selectedBibix.every((s) => s !== null);
  const confirm = () => {
    if (!canConfirm) {
      Vibration.vibrate(40);
      return;
    }
    nav.goBack();
  };

  const FloatingConfirmButton = () => {
    const count = selectedBibix.filter(Boolean).length;
    return (
      <Pressable
        onPress={confirm}
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          paddingHorizontal: 18,
          paddingVertical: 14,
          borderRadius: 999,
          backgroundColor: canConfirm ? TOON.ok : TOON.err,
          borderWidth: 2,
          borderColor: canConfirm ? TOON.okBorder : TOON.errBorder,
          elevation: 6,
          shadowColor: "#000",
          shadowOpacity: 0.16,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
        android_ripple={{ color: "#00000018", borderless: false }}
      >
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>
          {canConfirm ? "Confirmar" : "Elige 4"}
        </Text>
        <View
          style={{
            backgroundColor: "#ffffff22",
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "#ffffff55",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>
            {count}/4
          </Text>
        </View>
      </Pressable>
    );
  };

  const Badge = ({ color }: { color: string }) => (
    <View style={{ height: 8, backgroundColor: color, borderRadius: 6, marginHorizontal: 2, flex: 1 }} />
  );

  const Header = () => (
    <View>
      {/* Franja de color arriba */}
      <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingTop: 12 }}>
        <Badge color={TOON.sky} />
        <Badge color={TOON.mint} />
        <Badge color={TOON.lemon} />
        <Badge color={TOON.peach} />
        <Badge color={TOON.pink} />
        <Badge color={TOON.grape} />
      </View>

      {/* Título + Búsqueda */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
        <Text style={{ color: TOON.ink, fontSize: 26, fontWeight: "900", marginBottom: 10 }}>
          Bibix — <Text style={{ color: TOON.focus }}>Colección</Text> 🎈
        </Text>

        <TextInput
          placeholder="Buscar por nombre o ID…"
          placeholderTextColor={TOON.sub}
          value={query}
          onChangeText={setQuery}
          style={{
            backgroundColor: TOON.card,
            borderColor: TOON.border,
            borderWidth: 2,
            borderRadius: rounded,
            color: TOON.ink,
            paddingHorizontal: 14,
            paddingVertical: 12,
            elevation: 2,
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
          }}
        />
      </View>

      {/* Filtros */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 4, gap: 10 }}>
        <View
          style={{
            backgroundColor: TOON.card,
            borderColor: TOON.border,
            borderWidth: 2,
            borderRadius: rounded,
            padding: 12,
          }}
        >
          <Text style={{ color: TOON.sub, fontSize: 12, marginBottom: 8 }}>Elemento</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {ELEMENTS.map((el) => (
              <Chip key={el} label={el} selected={element === el} onPress={() => setElement(el)} />
            ))}
          </View>
        </View>

        <View
          style={{
            backgroundColor: TOON.card,
            borderColor: TOON.border,
            borderWidth: 2,
            borderRadius: rounded,
            padding: 12,
          }}
        >
          <Text style={{ color: TOON.sub, fontSize: 12, marginBottom: 8 }}>Rareza</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {RARITIES.map((r) => (
              <Chip key={r} label={r} selected={rarity === r} onPress={() => setRarity(r)} />
            ))}
          </View>
        </View>
      </View>

      {/* Slots */}
      <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
        <Text style={{ color: TOON.ink, fontSize: 18, fontWeight: "900", marginBottom: 10 }}>
          Tu equipo (elige 4) 🎯
        </Text>

        <View style={{ flexDirection: "row", gap: 10, justifyContent: "space-between" }}>
          {selectedBibix.map((id, idx) => {
            const active = activeSlot === idx;
            return (
              <Pressable
                key={idx}
                onPress={() => setActiveSlot(active ? null : idx)}
                onLongPress={() => id && removeFromSelection(idx)}
                style={{
                  flex: 1,
                  minHeight: 74,
                  backgroundColor: TOON.card,
                  borderWidth: 2,
                  borderColor: active ? TOON.focus : TOON.border,
                  borderRadius: rounded,
                  padding: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  elevation: 2,
                  shadowColor: "#000",
                  shadowOpacity: 0.05,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 3 },
                }}
              >
                <Text style={{ color: TOON.ink, fontSize: 12, fontWeight: "800" }}>
                  Slot {idx + 1}
                </Text>
                <Text style={{ color: TOON.sub, fontSize: 11, textAlign: "center" }}>
                  {id
                    ? bibixList.find((b) => b.id === id)?.name ?? id
                    : "vacío (toca para activar)"}
                </Text>
                {id && (
                  <Text style={{ color: TOON.pink, fontSize: 10, marginTop: 2 }}>
                    mantener para quitar
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>

        <Text style={{ color: TOON.sub, fontSize: 12, marginTop: 8 }}>
          Tip: activa un slot y luego toca una Bibix para asignarla.
        </Text>
      </View>

      <View style={{ height: 12 }} />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: TOON.bg }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 120,
            rowGap: 12,
          }}
          initialNumToRender={8}
          windowSize={7}
          removeClippedSubviews
          ListHeaderComponent={Header}
          ListEmptyComponent={
            <Text style={{ color: TOON.sub, textAlign: "center", marginTop: 24 }}>
              No hay Bibix que coincidan con el filtro.
            </Text>
          }
          renderItem={({ item }) => {
            const row = item as BibixRow;
            const owned = isOwned(row.id);
            const selected = isSelected(row.id);
            const phase = (phasesByBibix[row.id] ?? 1) as Phase;

            const { hp, atk, def, speed } = statsForPhase(row, phase);

            // Línea de daño por fase 1-4
            const damageLine = ((): string => {
              const vals = [1, 2, 3, 4].map((p) => {
                const { atk: atkP } = statsForPhase(row, p as Phase);
                return damageForPhase(row, p as Phase, atkP);
              });
              return vals.join("-");
            })();

            // ✅ Daño máximo "desbloqueado" según la fase actual
            const unlockedLevels = phase; // p.ej. fase 3 => niveles 1..3
            const maxDamage = (() => {
              const arr = [1, 2, 3, 4]
                .slice(0, unlockedLevels)
                .map((lvl) => {
                  const key = String(lvl) as "1" | "2" | "3" | "4";
                  return row.chargeDamage?.[key] ?? 0;
                });
              return Math.max(...arr, 0);
            })();

            return (
              <View style={{ flex: 1, borderRadius: 18 }}>
                <BibixCard
                  key={row.id}
                  name={row.name}
                  element={row.element}
                  rarity={rarityEnToEs[row.rarity]}
                  role={row.role}
                  owned={owned}
                  selected={selected}
                  phase={phase}
                  // Nota: mostramos stats, pero el "ataque" visual en la card debe usar maxDamage
                  baseAtk={atk}
                  baseHp={hp}
                  baseDef={def}
                  baseSpeed={speed}
                  damageLine={damageLine}
                  maxDamage={maxDamage}  // 👈 aquí va el nuevo prop
                  onPress={() => {
                    if (!owned) return;
                    if (selected) {
                      const idx = selectedBibix.findIndex((s) => s === row.id);
                      if (idx >= 0) removeFromSelection(idx);
                    } else {
                      addToSelection(row.id);
                    }
                  }}
                />
              </View>
            );
          }}
        />
        <FloatingConfirmButton />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
