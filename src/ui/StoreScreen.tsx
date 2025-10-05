// src/ui/StoreScreen.tsx
import React, { useMemo, useState } from "react";
import { View, Text, FlatList, Pressable, TextInput, Vibration, StyleSheet } from "react-native";
import WalletBar from "./components/WalletBar";
import Chip from "./components/Chip";
import rawData from "../data/bibix.json";
import { useProfileStore } from "../state/useProfileStore";
import { useWalletStore } from "../state/useWalletStore";
import {
  getBibixPriceToBuy,
  getUpgradePrice,
  purchaseBibix,
  upgradeBibixPhase,
  maxPhase,
} from "../game/economy";

// --- Tema (igual que colección) ---
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
  frame: "#F8FAFF",
  ok: "#1F9663",
  okBorder: "#17704B",
  err: "#CC4A4A",
  errBorder: "#A63A3A",
  focus: "#3E8EDC",
  el: {
    fuego: "#CC5F5F",
    agua: "#559DD6",
    tierra: "#87B678",
    energía: "#DCB83E",
    aire: "#91C4DA",
    hielo: "#7FAFD9",
    oscuridad: "#5F527F",
    veneno: "#79BD75",
  } as const,
  rare: {
    comun: "#A6B3C6",
    rara: "#6F9DD3",
    epica: "#9789D3",
    legendaria: "#D49DBF",
  } as const,
};
const rounded = 20 as const;
const PHASE_MUL: Record<1 | 2 | 3 | 4, number> = { 1: 1.0, 2: 1.1, 3: 1.22, 4: 1.35 };

// --- TIPOS (JSON real + UI) ---
type UiElement = keyof typeof TOON.el; // elementos en ES (el JSON usa 'energía' con acento)
type UiRarity = keyof typeof TOON.rare; // comun | rara | epica | legendaria
type EconRarity = "common" | "rare" | "epic" | "legendary";

type BibixJsonRow = {
  id: string;
  name: string;
  element: UiElement;
  rarity: EconRarity;
  sprite: string;
  base: { hp: number; atk: number; def: number; speed: number };
  growth: { hp: number; atk: number; def: number; speed: number };
  abilities: string[];
  chargeDamage?: Partial<Record<"1" | "2" | "3" | "4", number>>;
  owned?: boolean;
};

type BibixUI = {
  id: string;
  name: string;
  element: UiElement;
  rarityEs: UiRarity;
  row: BibixJsonRow;
};

// --- MAPEO DE RAREZAS (EN <-> ES) ---
const RARITY_EN_TO_ES: Record<EconRarity, UiRarity> = {
  common: "comun",
  rare: "rara",
  epic: "epica",
  legendary: "legendaria",
};
const RARITY_ES_TO_EN: Record<UiRarity, EconRarity> = {
  comun: "common",
  rara: "rare",
  epica: "epic",
  legendaria: "legendary",
};

// --- Listas de filtros (como en Collection) ---
const ELEMENTS = [
  "todos", "fuego", "agua", "tierra", "energía", "aire", "hielo", "oscuridad", "veneno",
] as const;
type ElementFilter = (typeof ELEMENTS)[number];

const RARITIES = ["todas", "comun", "rara", "epica", "legendaria"] as const;
type RarityFilter = (typeof RARITIES)[number];

// --- Helpers de stats/daño por fase ---
function statsForPhase(row: BibixJsonRow, phase: 1 | 2 | 3 | 4) {
  const mul = PHASE_MUL[phase];
  const lv = (base: number, g: number) => (base + g * (phase - 1)) * mul;
  const hp = Math.round(lv(row.base.hp, row.growth.hp));
  const atk = Math.round(lv(row.base.atk, row.growth.atk));
  const def = Math.round(lv(row.base.def, row.growth.def));
  const speed = Number(lv(row.base.speed, row.growth.speed).toFixed(2));
  return { hp, atk, def, speed };
}
function damageForPhase(row: BibixJsonRow, phase: 1 | 2 | 3 | 4, fallbackAtk: number) {
  const key = String(phase) as "1" | "2" | "3" | "4";
  const cd = row.chargeDamage?.[key];
  return Math.round(cd ?? fallbackAtk);
}
const titleCase = (s: string) => (s?.length ? s.slice(0, 1).toUpperCase() + s.slice(1) : s);

// --- UI Auxiliares ---
const Badge = ({ color }: { color: string }) => (
  <View style={{ height: 8, backgroundColor: color, borderRadius: 6, marginHorizontal: 2, flex: 1 }} />
);
const Pill = ({
  label,
  bg,
  fg = "#0b0d12",
  br = "#00000010",
}: { label: string; bg: string; fg?: string; br?: string }) => (
  <View
    style={{
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: bg,
      borderRadius: 999,
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: br,
    }}
  >
    <Text style={{ color: fg, fontSize: 11, fontWeight: "800" }}>{label}</Text>
  </View>
);

export default function StoreScreen() {
  const coins = useWalletStore((s) => s.coins);
  const owned = useProfileStore((s) => s.ownedBibix);
  const phases = useProfileStore((s) => s.phasesByBibix);

  const [tab, setTab] = useState<"buy" | "upgrade">("buy");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string>("");

  // NEW: filtros al estilo Collection
  const [element, setElement] = useState<ElementFilter>("todos");
  const [rarity, setRarity] = useState<RarityFilter>("todas");

  // Parseo del JSON -> modelo UI con rareza en español
  const all: BibixUI[] = useMemo(() => {
    return (rawData as BibixJsonRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      element: row.element,
      rarityEs: RARITY_EN_TO_ES[row.rarity],
      row,
    }));
  }, []);

  // Filtro de búsqueda + elemento + rareza
  const list = useMemo(() => {
    const qn = q.trim().toLowerCase();
    let arr = all.filter(
      (b) =>
        !qn ||
        b.name.toLowerCase().includes(qn) ||
        b.id.toLowerCase().includes(qn) ||
        (b.element as string).toLowerCase().includes(qn)
    );
    if (element !== "todos") arr = arr.filter((b) => b.element === element);
    if (rarity !== "todas") arr = arr.filter((b) => b.rarityEs === rarity);
    return arr;
  }, [q, all, element, rarity]);

  const buyList = useMemo(() => list.filter((b) => !owned.includes(b.id)), [list, owned]);
  const upgList = useMemo(() => list.filter((b) => owned.includes(b.id)), [list, owned]);
  const dataSource = tab === "buy" ? buyList : upgList;

  const Header = () => (
    <View>
      <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingTop: 12 }}>
        <Badge color={TOON.sky} />
        <Badge color={TOON.mint} />
        <Badge color={TOON.lemon} />
        <Badge color={TOON.peach} />
        <Badge color={TOON.pink} />
        <Badge color={TOON.grape} />
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: TOON.ink, fontSize: 26, fontWeight: "900" }}>Tienda 🛒</Text>
          <WalletBar />
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <Pressable
            onPress={() => setTab("buy")}
            style={[styles.tabBtn, { borderColor: tab === "buy" ? TOON.focus : TOON.border }]}
            android_ripple={{ color: "#00000018", borderless: false }}
          >
            <Text style={{ color: tab === "buy" ? TOON.ink : TOON.sub, fontWeight: "800" }}>Comprar</Text>
          </Pressable>

          <Pressable
            onPress={() => setTab("upgrade")}
            style={[styles.tabBtn, { borderColor: tab === "upgrade" ? TOON.focus : TOON.border }]}
            android_ripple={{ color: "#00000018", borderless: false }}
          >
            <Text style={{ color: tab === "upgrade" ? TOON.ink : TOON.sub, fontWeight: "800" }}>Mejorar</Text>
          </Pressable>
        </View>

        <TextInput
          placeholder="Buscar por nombre, ID o elemento…"
          placeholderTextColor={TOON.sub}
          value={q}
          onChangeText={setQ}
          style={styles.search}
        />
      </View>

      {/* NEW: paneles de filtros, igual que en Collection */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 4, gap: 10 }}>
        <View style={{ backgroundColor: TOON.card, borderColor: TOON.border, borderWidth: 2, borderRadius: rounded, padding: 12 }}>
          <Text style={{ color: TOON.sub, fontSize: 12, marginBottom: 8 }}>Elemento</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {ELEMENTS.map((el) => (
              <Chip key={el} label={el} selected={element === el} onPress={() => setElement(el)} />
            ))}
          </View>
        </View>

        <View style={{ backgroundColor: TOON.card, borderColor: TOON.border, borderWidth: 2, borderRadius: rounded, padding: 12 }}>
          <Text style={{ color: TOON.sub, fontSize: 12, marginBottom: 8 }}>Rareza</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {RARITIES.map((r) => (
              <Chip key={r} label={r} selected={rarity === r} onPress={() => setRarity(r)} />
            ))}
          </View>
        </View>
      </View>
    </View>
  );

  const ItemCard = ({ b }: { b: BibixUI }) => {
    const ownedIt = owned.includes(b.id);
    const phase = (phases[b.id] ?? (ownedIt ? 1 : 1)) as 1 | 2 | 3 | 4; // preview en fase 1 si no es tuya
    const econRarity: EconRarity = RARITY_ES_TO_EN[b.rarityEs] ?? "common";

    // Precios
    const priceBuy = !ownedIt ? getBibixPriceToBuy(econRarity) : 0;
    const priceUpg = ownedIt && phase < maxPhase ? getUpgradePrice(econRarity, phase) : 0;

    // Deshabilitar si no hay monedas suficientes
    const canUpgrade = ownedIt && phase < maxPhase;
    const disableBuy = !priceBuy || coins < priceBuy || ownedIt;
    const disableUpg = !canUpgrade || !priceUpg || coins < priceUpg;

    // Stats actuales (o preview) y daños por fase
    const { hp, atk, def, speed } = statsForPhase(b.row, phase);
    const damage = damageForPhase(b.row, phase, atk);

    const damageLine = ((): string => {
      const vals = [1, 2, 3, 4].map((p) => {
        const { atk: atkP } = statsForPhase(b.row, p as 1 | 2 | 3 | 4);
        return damageForPhase(b.row, p as 1 | 2 | 3 | 4, atkP);
      });
      return vals.join("-");
    })();

    const showBuy = tab === "buy";

    const onBuy = () => {
      const res = purchaseBibix(b.id, econRarity);
      if (!res.ok) {
        Vibration.vibrate(60);
        setMsg(res.reason ?? "No se pudo comprar");
      } else {
        setMsg(`Compraste ${b.name}`);
      }
    };

    const onUpgrade = () => {
      const res = upgradeBibixPhase(b.id, econRarity);
      if (!res.ok) {
        Vibration.vibrate(60);
        setMsg(res.reason ?? "No se pudo mejorar");
      } else {
        setMsg(`Mejoraste ${b.name} a fase ${res.newPhase}`);
      }
    };

    return (
      <View style={styles.card}>
        {/* Header: Elemento / Rareza / Nivel */}
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pill label={titleCase(b.element)} bg={TOON.el[b.element]} />
            <Pill label={titleCase(b.rarityEs)} bg={TOON.rare[b.rarityEs]} />
          </View>
          <Pill label={`Fase ${phase}`} bg={"#D7DEE8"} />
        </View>

        {/* Marco “arte” */}
        <View style={styles.frame}>
          <View style={{ height: 10, backgroundColor: TOON.el[b.element] }} />
          <View style={{ padding: 10, gap: 4 }}>
            <Text numberOfLines={1} style={styles.name}>{b.name}</Text>
            <Text style={styles.meta}>{b.id} · {b.element}</Text>

            {/* Stats compactos */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 8 }}>
              <Stat label="Daño" value={damage} />
              <Stat label="HP" value={hp} />
              <Stat label="ATK" value={atk} />
              <Stat label="DEF" value={def} />
              <Stat label="SPD" value={speed} />
            </View>

            {/* Línea de daño por fase */}
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: TOON.sub, fontSize: 11 }}>Daño por fase:</Text>
              <Text style={{ color: TOON.ink, fontWeight: "800", fontSize: 13 }}>
                {damageLine}
              </Text>
            </View>
          </View>
        </View>

        {/* Footer acción */}
        <View style={styles.footerRow}>
          {showBuy ? (
            <Text style={{ color: TOON.ink }}>
              Precio: <Text style={styles.price}>🪙 {priceBuy}</Text>
            </Text>
          ) : (
            <Text style={{ color: TOON.ink }}>
              Fase: <Text style={{ color: TOON.focus, fontWeight: "900" }}>{phase}</Text> / {maxPhase}
              {canUpgrade && (
                <> · Costo mejora: <Text style={styles.price}>🪙 {priceUpg}</Text></>
              )}
            </Text>
          )}

          <Pressable
            disabled={showBuy ? disableBuy : disableUpg}
            onPress={showBuy ? onBuy : onUpgrade}
            style={[
              styles.actionBtn,
              {
                borderColor: (showBuy ? disableBuy : disableUpg) ? TOON.border : TOON.focus,
                opacity: (showBuy ? disableBuy : disableUpg) ? 0.5 : 1,
              },
            ]}
            android_ripple={{ color: "#00000018", borderless: false }}
          >
            <Text style={{ color: TOON.ink, fontWeight: "800" }}>
              {showBuy ? (ownedIt ? "Ya en colección" : "Comprar") : canUpgrade ? "Mejorar" : "Máxima"}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: TOON.bg }}>
      <FlatList
        data={dataSource}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <Header />
            {msg ? <Text style={styles.msg}>{msg}</Text> : null}
          </>
        }
        renderItem={({ item }) => <ItemCard b={item as BibixUI} />}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListEmptyComponent={
          <Text style={{ color: TOON.sub, textAlign: "center", marginTop: 16 }}>
            No hay resultados con ese filtro.
          </Text>
        }
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={{ minWidth: 56 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: TOON.card,
    borderWidth: 2,
  },
  search: {
    marginTop: 10,
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
  },
  msg: {
    color: "#0b3d91",
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontWeight: "700",
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: TOON.card,
    borderWidth: 2,
    borderColor: TOON.border,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  frame: {
    borderWidth: 1.5,
    borderColor: "#00000012",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: TOON.frame,
    marginTop: 10,
  },
  name: { color: TOON.ink, fontSize: 16, fontWeight: "900", letterSpacing: 0.3 },
  meta: { color: TOON.sub, fontSize: 12 },
  statLabel: { color: TOON.sub, fontSize: 11 },
  statValue: { color: TOON.ink, fontSize: 13, fontWeight: "800" },
  footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  price: { color: "#9a7b00", fontWeight: "900" },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: TOON.card,
    borderWidth: 2,
  },
});
