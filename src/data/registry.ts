// src/data/registry.ts
import raw from "./bibix.json";
import type { Role } from "../game/roles";

export type ChargeLevel = 1 | 2 | 3 | 4;

// ===== Fila tal como viene del JSON =====
// NOTA: 'role' es OPCIONAL aquí, para no tronar si aún no lo agregas al archivo.
export type BibixJsonRow = {
  id: string;
  name: string;
  element:
    | "fuego"
    | "agua"
    | "tierra"
    | "energía" // dejamos acento porque así lo tienes en data
    | "aire"
    | "hielo"
    | "oscuridad"
    | "veneno";
  rarity: "common" | "rare" | "epic" | "legendary";
  sprite: string;
  base: { hp: number; atk: number; def: number; speed: number };
  growth: { hp: number; atk: number; def: number; speed: number };
  abilities: string[];
  chargeDamage: Record<ChargeLevel, number>;

  // NUEVO (opcionales)
  role?: Role; // "ataque" | "defensa" | "soporte"
  defBehavior?: "none" | "shield_only";
  shield?: { baseHp: number; growthHp: number; durationMs: number };
};



// ===== Fila "normalizada" para el juego =====
// Aquí 'role' es REQUERIDO (ya sea porque venía o lo inferimos).
export type BibixRow = BibixJsonRow & {
  role: Role;
};

// Heurística MUY sencilla para inferir rol si no viene en JSON.
// Ajusta a tu gusto (o remplázala por un map por id).
function inferRole(b: BibixJsonRow): Role {
  // si trae shield explícito o ability con "shield" => defensa
  const abil = (b.abilities ?? []).join("|").toLowerCase();
  if (b.shield || abil.includes("shield") || abil.includes("skin")) return "defensa";

  // si trae heal/drain/boost => soporte
  if (abil.includes("heal") || abil.includes("drain") || abil.includes("boost")) return "soporte";

  // si DEF es 0 ó muy baja y ATK alto => ataque
  if ((b.base?.def ?? 0) <= 5 || (b.base?.atk ?? 0) >= 100) return "ataque";

  // fallback
  return "ataque";
}

// Aplica defaults: asegura que 'role' exista
function applyDefaults(b: BibixJsonRow): BibixRow {
  return {
    ...b,
    role: b.role ?? inferRole(b),
    defBehavior: b.defBehavior ?? ( (b.role ?? inferRole(b)) === "defensa" ? "shield_only" : "none"),
  };
}

export const bibixList: BibixRow[] = (raw as BibixJsonRow[]).map(applyDefaults);

export const bibixById: Record<string, BibixRow> = Object.fromEntries(
  bibixList.map((b) => [b.id, b])
);

// Helper existente
export function getChargeDamageFromData(
  id: string,
  level: ChargeLevel
): number {
  const b = bibixById[id];
  if (!b) return 0;
  return b.chargeDamage[level] ?? 0;
}
