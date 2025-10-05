// src/game/stats.ts
export type Phase = 1 | 2 | 3 | 4;

export const PHASE_MUL: Record<Phase, number> = {
  1: 1.0,
  2: 1.1,
  3: 1.22,
  4: 1.35,
};

export type BibixRow = {
  id: string;
  name: string;
  element:
    | "fuego" | "agua" | "tierra" | "energía"
    | "aire" | "hielo" | "oscuridad" | "veneno";
  rarity: "common" | "rare" | "epic" | "legendary";
  role?: "ataque" | "defensa" | "soporte";           // NUEVO
  sprite: string;
  base: { hp: number; atk: number; def: number; speed: number };
  growth: { hp: number; atk: number; def: number; speed: number };
  abilities: string[];
  chargeDamage?: Partial<Record<"1"|"2"|"3"|"4", number>>;
};

export function statsForPhase(b: BibixRow, phase: Phase) {
  const mul = PHASE_MUL[phase];
  const lv = (p: number, g: number) => (p + g * (phase - 1)) * mul;
  const hp = Math.round(lv(b.base.hp, b.growth.hp));
  const atk = Math.round(lv(b.base.atk, b.growth.atk));
  const def = Math.round(lv(b.base.def, b.growth.def));
  const speed = Number(lv(b.base.speed, b.growth.speed).toFixed(2));
  return { hp, atk, def, speed };
}

export function chargeDamageForPhase(b: BibixRow, phase: Phase, fallbackAtk: number) {
  const key = String(phase) as "1" | "2" | "3" | "4";
  return Math.round(b.chargeDamage?.[key] ?? fallbackAtk);
}
