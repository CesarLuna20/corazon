// src/game/combat.ts
import type { Phase, BibixRow } from "./stats";
import { statsForPhase, chargeDamageForPhase } from "./stats";
import { rpsMultiplier } from "./rps";
import { isDefenseRole } from "./roles";
import { getChargeDamageFromData } from "../data/registry"; // 👈 NUEVO

// ===== Tipos base =====
export type Vec2 = { x: number; y: number };

export type Projectile = {
  id: string;
  ownerId: string;               // bibix id del atacante
  element: BibixRow["element"];
  power: number;                 // daño base del proyectil (Post-chargeDamage)
  speed: number;                 // pixels/s o unidades
  radius: number;
  pos: Vec2;
  targetPos: Vec2;
  lifetimeMs: number;
};

export type Shield = {
  id: string;
  ownerId: string;               // bibix id del defensor (quien lo generó)
  element: BibixRow["element"];
  capacity: number;              // “vida” del escudo (solo DEF role la define)
  expiresAt: number;             // timestamp ms, 0 si sin expiración fija
};

// ===== Config por defecto (ajústalo a gusto) =====
const DEFAULT_PROJECTILE = {
  speed: 900,        // ms aproximado 400–700 moverás con tween fuera
  radius: 16,
  lifetimeMs: 1200,
};

// ===== FACTOR de conversión DEF -> capacidad de escudo =====
// Ej: cada punto de DEF aporta 6 de “vida de escudo”
const SHIELD_DEF_FACTOR = 6;

// ===== Crear proyectil de ataque =====
export function fireAttack(b: BibixRow, phase: Phase, origin: Vec2, target: Vec2): Projectile {
  const { atk, speed } = statsForPhase(b, phase);
  const base = chargeDamageForPhase(b, phase, atk);

  return {
    id: `proj_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    ownerId: b.id,
    element: b.element,
    power: base,                  // el ataque puramente
    speed: DEFAULT_PROJECTILE.speed,
    radius: DEFAULT_PROJECTILE.radius,
    pos: origin,
    targetPos: target,
    lifetimeMs: DEFAULT_PROJECTILE.lifetimeMs,
  };
}

// ===== Crear escudo (solo roles de defensa) =====
export function castShield(b: BibixRow, phase: Phase, nowMs: number, durationMs = 4000): Shield | null {
  if (!isDefenseRole(b.role)) return null;
  const { def } = statsForPhase(b, phase);
  const capacity = Math.max(1, Math.round(def * SHIELD_DEF_FACTOR));
  return {
    id: `shield_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    ownerId: b.id,
    element: b.element,
    capacity,
    expiresAt: nowMs + durationMs,
  };
}

// ===== Resolver proyectil contra objetivo con escudo opcional =====
export function resolveHit({
  projectile,
  defender,       // row del defensor (bibix)
  defenderPhase,
  activeShield,   // escudo activo o null
}: {
  projectile: Projectile;
  defender: BibixRow;
  defenderPhase: Phase;
  activeShield: Shield | null;
}) {
  // 1) multiplicador elemental
  const vsElement = activeShield ? activeShield.element : defender.element;
  const mul = rpsMultiplier(projectile.element, vsElement);
  let effectivePower = Math.max(1, Math.round(projectile.power * mul));

  // 2) si hay escudo, lo dañamos primero
  let shieldBroken = false;
  let newShield: Shield | null = activeShield;

  if (activeShield) {
    const capLeft = Math.max(0, activeShield.capacity - effectivePower);
    if (capLeft <= 0) {
      shieldBroken = true;
      newShield = null;
      effectivePower = Math.abs(capLeft); // remanente entra a HP
    } else {
      // el escudo aguanta; no entra nada a HP
      newShield = { ...activeShield, capacity: capLeft };
      effectivePower = 0;
    }
  }

  // 3) DEF del defensor (solo si NO hay escudo). Por tu regla nueva, la DEF
  //    efectiva solo existe como escudo → daño directo a HP.
  const hpDamage = Math.max(0, effectivePower);

  return {
    hpDamage,
    newShield,      // escudo actualizado (o null si se rompió/no había)
    shieldBroken,
  };
}

// ===== Resolver choque de proyectiles (aire-aire) =====
export function resolveProjectileVsProjectile(a: Projectile, b: Projectile) {
  const aMul = rpsMultiplier(a.element, b.element);
  const bMul = rpsMultiplier(b.element, a.element);

  const aScore = a.power * aMul;
  const bScore = b.power * bMul;

  if (Math.abs(aScore - bScore) < 0.0001) {
    return { aDestroyed: true, bDestroyed: true, aNewPower: 0, bNewPower: 0 };
  }

  if (aScore > bScore) {
    return {
      aDestroyed: false,
      bDestroyed: true,
      aNewPower: Math.max(1, Math.round(a.power * 0.5)),
      bNewPower: 0,
    };
  } else {
    return {
      aDestroyed: true,
      bDestroyed: false,
      aNewPower: 0,
      bNewPower: Math.max(1, Math.round(b.power * 0.5)),
    };
  }
}

// ===== NUEVO: poder del proyectil (para useBattleStore.fireSlot) =====
// Lee directamente del catálogo (registry) tu tabla chargeDamage[1..4].
export function computeProjectilePower(bibixId: string, level: 1 | 2 | 3 | 4): number {
  return getChargeDamageFromData(bibixId, level);
}
