// src/game/charge.ts
import type { ChargeLevel } from "../data/registry";

export type ChargeTuning = {
  t1: number; // ms para alcanzar nivel 1 (o disparo inmediato)
  t2: number; // ms para pasar a nivel 2
  t3: number; // ms para pasar a nivel 3
  t4: number; // ms para pasar a nivel 4 (máximo)
};

// Tiempos sugeridos. Ajusta a gusto.
export const DEFAULT_CHARGE_TUNING: ChargeTuning = {
  t1: 0,
  t2: 300,
  t3: 650,
  t4: 1000,
};

export function holdMsToChargeLevel(
  heldMs: number,
  cfg: ChargeTuning = DEFAULT_CHARGE_TUNING
): ChargeLevel {
  if (heldMs >= cfg.t4) return 4;
  if (heldMs >= cfg.t3) return 3;
  if (heldMs >= cfg.t2) return 2;
  return 1;
}
