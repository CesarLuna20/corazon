import React, { memo } from "react";
import { View, Text, Pressable } from "react-native";

type Elemento =
  | "fuego" | "agua" | "tierra" | "energia" | "energía"
  | "aire" | "hielo" | "oscuridad" | "veneno";
type Rarity = "comun" | "rara" | "epica" | "legendaria";
type Role = "ataque" | "defensa" | "soporte";
type Phase = 1 | 2 | 3 | 4;

type Props = {
  name: string;
  element: Elemento;
  rarity: Rarity;
  role?: Role;

  owned?: boolean;
  selected?: boolean;
  onPress?: () => void;

  phase?: Phase;

  /** Ya no mostramos ATK. Si lo mandas, se ignora a menos que no podamos calcular dmg. */
  baseAtk?: number;

  baseHp?: number;
  baseDef?: number;
  baseSpeed?: number;

  /** Ej: "100-220-360-600" o "100•220•360•600" */
  damageLine?: string;

  /** Daño máximo “desbloqueado” (si lo envías, se usa directo). */
  maxDamage?: number;

  showStats?: boolean; // default true
};

const TOON = {
  bg: "#D8DEE7",
  card: "#E4E9F0",
  border: "#C1CCDA",
  ink: "#141B25",
  sub: "#485568",
  focus: "#3E8EDC",
  ok: "#1F9663",
  err: "#CC4A4A",
};

// --- Helpers de color ---
const normEl = (e: Elemento) => (e === "energía" ? "energia" : e) as Exclude<Elemento, "energía">;

const ELEMENT_COLORS: Record<Exclude<Elemento, "energía">, { bg: string; fg: string }> = {
  fuego:     { bg: "#FFDFD7", fg: "#B0331E" },
  agua:      { bg: "#D7ECFF", fg: "#1C5FA3" },
  tierra:    { bg: "#EDE2D4", fg: "#6A4A2E" },
  energia:   { bg: "#F6F0FF", fg: "#6B3FA0" },
  aire:      { bg: "#EAF6FF", fg: "#1C6A90" },
  hielo:     { bg: "#EAF7FB", fg: "#2B6C7A" },
  oscuridad: { bg: "#EDE8F2", fg: "#4E3B6B" },
  veneno:    { bg: "#EAF6EA", fg: "#2F7A3A" },
};

const RARITY_COLORS: Record<Rarity, { bg: string; fg: string; bd: string }> = {
  comun:       { bg: "#F0F3F7", fg: "#2E3A4A", bd: "#C8D2E0" },
  rara:        { bg: "#E4F7FA", fg: "#0F6E7A", bd: "#9ED8DF" },
  epica:       { bg: "#F2E8FF", fg: "#5B2F91", bd: "#C9B2F0" },
  legendaria:  { bg: "#FFF3D9", fg: "#9E6A00", bd: "#F0D28A" },
};

const ROLE_COLORS: Record<Role, { bg: string; fg: string; bd: string }> = {
  ataque:  { bg: "#FFE7E7", fg: "#A51B1B", bd: "#F2A1A1" },
  defensa: { bg: "#EAF4FF", fg: "#1757A3", bd: "#A9CCF2" },
  soporte: { bg: "#EAFBEF", fg: "#0E6B3A", bd: "#A7E0BE" },
};

const Chip = ({ label, bg, fg, bd }: { label: string; bg: string; fg: string; bd?: string }) => (
  <View
    style={{
      backgroundColor: bg,
      borderColor: bd ?? "transparent",
      borderWidth: bd ? 1 : 0,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      marginRight: 6,
    }}
  >
    <Text style={{ color: fg, fontSize: 11, fontWeight: "800" }}>{label}</Text>
  </View>
);

function fmt(n?: number, unit?: string) {
  if (n == null) return "-";
  return unit ? `${n}${unit}` : `${n}`;
}

/** Extrae el máximo numérico de una damageLine (soporta -, •, ·, , y espacios) */
function parseMaxFromDamageLine(line?: string): number | undefined {
  if (!line) return undefined;
  const parts = line
    .replace(/•|·|,|\s+/g, "-")
    .split("-")
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
  if (!parts.length) return undefined;
  return Math.max(...parts);
}

const BibixCard = memo(function BibixCard({
  name,
  element,
  rarity,
  role,
  owned = true,
  selected = false,
  onPress,
  phase,
  baseAtk,     // ya no se muestra (solo fallback si no hay otra cosa)
  baseHp,
  baseDef,
  baseSpeed,
  damageLine,
  maxDamage,
  showStats = true,
}: Props) {
  const elN = normEl(element);
  const elC = ELEMENT_COLORS[elN];
  const rarC = RARITY_COLORS[rarity];
  const rolC = role ? ROLE_COLORS[role] : undefined;

  // Prioridad: maxDamage prop > parsed from damageLine > baseAtk (fallback)
  const dmgMax =
    (typeof maxDamage === "number" ? maxDamage : undefined) ??
    parseMaxFromDamageLine(damageLine) ??
    baseAtk;

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: "#00000012", borderless: false }}
      style={{
        backgroundColor: TOON.card,
        borderColor: selected ? TOON.focus : TOON.border,
        borderWidth: 2,
        borderRadius: 18,
        padding: 12,
        gap: 8,
        opacity: owned ? 1 : 0.55,
        elevation: 2,
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      }}
    >
      {/* Título */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: TOON.ink, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
          {name}
        </Text>
        {phase && (
          <View style={{ backgroundColor: "#ffffffc8", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: TOON.sub, fontWeight: "900", fontSize: 11 }}>Fase {phase}</Text>
          </View>
        )}
      </View>

      {/* Chips de info */}
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <Chip label={elN} bg={elC.bg} fg={elC.fg} />
        <Chip label={rarity} bg={rarC.bg} fg={rarC.fg} bd={rarC.bd} />
        {role && <Chip label={role} bg={rolC!.bg} fg={rolC!.fg} bd={rolC!.bd} />}
        {!owned && <Chip label="No poseída" bg="#F8D7DA" fg="#842029" bd="#F5C2C7" />}
        {selected && <Chip label="En equipo" bg="#E7F6E7" fg="#146C43" bd="#B7E1C7" />}
      </View>

      {/* Stats */}
      {showStats && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
          <View>
            <Text style={{ color: TOON.sub, fontSize: 11 }}>DAÑO MAX</Text>
            <Text style={{ color: TOON.ink, fontWeight: "800" }}>{fmt(dmgMax)}</Text>
          </View>
          <View>
            <Text style={{ color: TOON.sub, fontSize: 11 }}>HP</Text>
            <Text style={{ color: TOON.ink, fontWeight: "800" }}>{fmt(baseHp)}</Text>
          </View>
          <View>
            <Text style={{ color: TOON.sub, fontSize: 11 }}>DEF</Text>
            <Text style={{ color: TOON.ink, fontWeight: "800" }}>{fmt(baseDef)}</Text>
          </View>
          <View>
            <Text style={{ color: TOON.sub, fontSize: 11 }}>SPD</Text>
            <Text style={{ color: TOON.ink, fontWeight: "800" }}>{fmt(baseSpeed)}</Text>
          </View>
        </View>
      )}

      {/* Línea de daño por fase */}
      {damageLine && (
        <View style={{ marginTop: 6 }}>
          <Text style={{ color: TOON.sub, fontSize: 11, marginBottom: 2 }}>Daño por fase</Text>
          <View
            style={{
              backgroundColor: "#ffffff",
              borderColor: TOON.border,
              borderWidth: 1,
              borderRadius: 12,
              paddingVertical: 6,
              paddingHorizontal: 10,
            }}
          >
            <Text style={{ color: TOON.ink, fontWeight: "800", letterSpacing: 0.4 }} numberOfLines={1}>
              {damageLine /* ej: "100-220-360-600" */}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
});

export default BibixCard;
