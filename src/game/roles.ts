// src/game/roles.ts
export type BibixRole = "ataque" | "defensa" | "soporte";

// pequeña ayuda para UI / lógica
export const isAttackRole = (r?: BibixRole) => r === "ataque";
export const isSupportRole = (r?: BibixRole) => r === "soporte";
export type Role = "ataque" | "defensa" | "soporte";
export const isDefenseRole = (r?: Role | null) => r === "defensa";