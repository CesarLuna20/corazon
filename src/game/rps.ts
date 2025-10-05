// src/game/rps.ts

// Acepta ambos: "energia" y "energía" para que no choquen tus datos/tipos.
export type ElementId =
  | "fuego" | "agua" | "tierra" | "energia" | "energía"
  | "aire" | "hielo" | "oscuridad" | "veneno";

export const RPS = {
  advantage: 1.25,
  disadvantage: 0.75,
  neutral: 1.0,
} as const;

// Normaliza a claves internas sin acento
const norm = (e: ElementId): Exclude<ElementId, "energía"> => {
  
  const v: ElementId = e;
  if (v === "energía") return "energia";
  return v as Exclude<ElementId, "energía">;
};

// Matriz sobre claves normalizadas (sin acento)
type Key = Exclude<ElementId, "energía">;

const TABLE: Record<Key, Partial<Record<Key, 1 | -1 | 0>>> = {
  fuego:      { veneno: 1, hielo: 1, agua: -1, tierra: -1 },
  agua:       { fuego: 1, tierra: 1, energia: -1, veneno: -1 },
  tierra:     { fuego: 1, energia: 1, aire: -1, agua: -1 },
  energia:    { agua: 1, oscuridad: 1, tierra: -1, aire: -1 },
  aire:       { tierra: 1, veneno: 1, hielo: -1, energia: -1 },
  hielo:      { aire: 1, tierra: 1, fuego: -1, oscuridad: -1 },
  oscuridad:  { hielo: 1, agua: 1, energia: -1, veneno: -1 },
  veneno:     { oscuridad: 1, agua: 1, fuego: -1, aire: -1 },
};

export function compareElements(a: ElementId, b: ElementId): 1 | -1 | 0 {
  const A = norm(a);
  const B = norm(b);
  if (A === B) return 0;
  const row = TABLE[A];
  return (row && row[B]) ?? 0;
}

export function rpsMultiplier(a: ElementId, b: ElementId): number {
  const r = compareElements(a, b);
  if (r === 1) return RPS.advantage;
  if (r === -1) return RPS.disadvantage;
  return RPS.neutral;
}
