// src/data/registry.ts
import raw from "./bibix.json";
import type { Role } from "../game/roles";

// ===== Tipos base =====
export type ChargeLevel = 1 | 2 | 3 | 4;

// En algunos JSON usas un mapa de 1..4 como claves string; lo soportamos.
export type ChargeMap = { [k in "1" | "2" | "3" | "4"]?: number };

// ===== Fila tal como viene del JSON =====
export type BibixJsonRow = {
  id: string;
  name: string;
  element:
    | "fuego"
    | "agua"
    | "tierra"
    | "energía" // acento permitido en JSON
    | "energia"
    | "aire"
    | "hielo"
    | "oscuridad"
    | "veneno";
  rarity: "common" | "rare" | "epic" | "legendary";
  sprite?: string;
  // Opcional: metadatos para sprites tipo atlas
  spriteMeta?: {
    rows: number;
    cols: number;
    fps: number;
    frameW?: number;
    frameH?: number;
  };

  base: { hp: number; atk: number; def: number; speed?: number };
  growth: { hp: number; atk: number; def: number; speed?: number };
  abilities?: string[];

  // Puede venir como Record<number, number> o como claves "1".."4"
  chargeDamage?: Record<ChargeLevel, number> | ChargeMap;

  // NUEVO (opcionales) — roles/escudos
  role?: Role; // "ataque" | "defensa" | "soporte"
  defBehavior?: "none" | "shield_only";
  shield?: { baseHp?: number; growthHp?: number; durationMs?: number };
};

// ===== Fila "normalizada" para el juego =====
export type BibixRow = Omit<BibixJsonRow, "chargeDamage" | "element"> & {
  role: Role;                       // siempre presente
  defBehavior: "none" | "shield_only";
  element: "fuego" | "agua" | "tierra" | "energia" | "aire" | "hielo" | "oscuridad" | "veneno"; // sin acentos
  chargeDamage?: ChargeMap;         // claves string "1".."4"
};

// ---------------- Utils de normalización ----------------
const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "");

function normalizeElement(e: BibixJsonRow["element"]): BibixRow["element"] {
  const t = stripAccents(String(e || "").toLowerCase());
  const ok = ["fuego", "agua", "tierra", "energia", "aire", "hielo", "oscuridad", "veneno"] as const;
  return (ok.includes(t as any) ? (t as any) : "fuego");
}

// Heurística para inferir rol si no viene en JSON
function inferRole(b: BibixJsonRow): Role {
  const abil = (b.abilities ?? []).join("|").toLowerCase();
  if (b.shield || abil.includes("shield") || abil.includes("skin")) return "defensa";
  if (abil.includes("heal") || abil.includes("drain") || abil.includes("boost")) return "soporte";
  if ((b.base?.def ?? 0) <= 5 || (b.base?.atk ?? 0) >= 100) return "ataque";
  return "ataque";
}

// Asegura chargeDamage como mapa de "1".."4"
function normalizeChargeDamage(cd: BibixJsonRow["chargeDamage"]): ChargeMap | undefined {
  if (!cd) return undefined;
  const out: ChargeMap = {};
  const read = (k: any) => {
    const v = (cd as any)[k];
    return typeof v === "number" && isFinite(v) ? v : undefined;
  };
  const v1 = read(1) ?? read("1");
  const v2 = read(2) ?? read("2");
  const v3 = read(3) ?? read("3");
  const v4 = read(4) ?? read("4");
  if (v1 != null) out["1"] = v1;
  if (v2 != null) out["2"] = v2;
  if (v3 != null) out["3"] = v3;
  if (v4 != null) out["4"] = v4;
  return Object.keys(out).length ? out : undefined;
}

// Aplica defaults y normaliza
function applyDefaults(b: BibixJsonRow): BibixRow {
  const role = b.role ?? inferRole(b);
  const defBehavior = b.defBehavior ?? (role === "defensa" ? "shield_only" : "none");
  return {
    ...b,
    role,
    defBehavior,
    element: normalizeElement(b.element),
    chargeDamage: normalizeChargeDamage(b.chargeDamage),
  };
}

// ---------------- Exportados ----------------
export const bibixList: BibixRow[] = (Array.isArray(raw) ? (raw as BibixJsonRow[]) : []).map(applyDefaults);

export const bibixById: Record<string, BibixRow> = Object.fromEntries(
  bibixList.filter((b) => b && b.id).map((b) => [b.id, b])
);

// Lista de ids disponibles (para randomizar loadout enemigo, o menús)
export const registryIds: string[] = bibixList.map((b) => b.id);

// Helper existente (respeta tu firma)
export function getChargeDamageFromData(id: string, level: ChargeLevel): number {
  const b = bibixById[id];
  if (!b || !b.chargeDamage) return 0;
  return b.chargeDamage[String(level) as "1" | "2" | "3" | "4"] ?? 0;
}
