import type { SpriteAsset } from "../data/spellsSprites";

export type ChargeLevel = 1 | 2 | 3 | 4;

export type Projectile = {
  id: number;
  owner: "player" | "enemy";
  bibixId: string;
  element: string;
  power: number;

  /**
   * Velocidad efectiva en px/ms (se recalcula cada frame con slow/haste).
   * Parte de speedBase y se escala dinámicamente.
   */
  speed: number;

  /**
   * Velocidad base en px/ms (derivada del multiplicador del bibix o del valor directo).
   * No cambia en runtime; sirve para calcular la escala de velocidad.
   */
  speedBase: number;

  radius: number;

  /** posición actual (se actualiza frame a frame) */
  pos: { x: number; y: number };

  /** destino final (hitbox rival) */
  targetPos: { x: number; y: number };

  /** ⛳️ origen fijo del recorrido (para interpolar SIEMPRE desde el inicio) */
  startPos: { x: number; y: number };

  bornAt: number;   // timestamp
  lifetime: number; // ms (derivado de distancia/velocidad y limitado 3.5–6.0 s)

  sprite?: SpriteAsset | null;
  ctrl?: { x: number; y: number } | null; // reservado por si quisieras Bézier
};

export type HitCallbacks = {
  onHitEnemy: (dmg: number) => void;
  onHitPlayer: (dmg: number) => void;
};

let PID = 1;

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const clampLifetime = (n: any, def = 650) =>
  Number.isFinite(n) && n > 0 ? Number(n) : def;

const safeNum = (n: any, def: number) =>
  Number.isFinite(n) ? Number(n) : def;

// ===== Config de tiempo/velocidad objetivo =====
const MIN_MS = 3500;
const MAX_MS = 6000;

// Tuning global (px/s). Con distancias típicas ~1500px, da ~4.4s.
const PX_PER_SEC_BASE = 340;

/**
 * Convierte un "speed" de entrada a px/ms base.
 * - Si speed > 5: se interpreta como px/ms directo (retro-compat).
 * - Si 0 < speed <= 5: multiplicador sobre PX_PER_SEC_BASE (1.0 = base).
 */
function resolveBaseSpeedPxPerMs(speedMulOrPxPerMs?: number): number {
  if (speedMulOrPxPerMs && speedMulOrPxPerMs > 5) {
    return Number(speedMulOrPxPerMs); // px/ms directo
  }
  const mul = speedMulOrPxPerMs && speedMulOrPxPerMs > 0 ? speedMulOrPxPerMs : 1.0;
  const pxPerSec = PX_PER_SEC_BASE * mul;
  return pxPerSec / 1000; // px/ms
}

/** Lifetime 3.5–6.0s según distancia y velocidad base */
function lifetimeForRange(distPx: number, basePxPerMs: number): number {
  const ms = distPx / Math.max(0.001, basePxPerMs);
  return clamp(ms, MIN_MS, MAX_MS);
}

// ===== Crear proyectil =====
export function createProjectile(params: {
  owner: "player" | "enemy";
  bibixId: string;
  element: string;
  chargeLevel: 1 | 2 | 3 | 4;
  power?: number;
  /**
   * Si 0 < speed <= 5 => multiplicador (1.00=base).
   * Si speed > 5     => px/ms directo (retro-compat).
   */
  speed?: number;
  radius?: number;
  pos: { x: number; y: number };
  targetPos: { x: number; y: number };
  lifetime?: number;                  // si no viene, se calcula
  sprite?: SpriteAsset | null;
  ctrl?: { x: number; y: number } | null;
}): Projectile {
  const {
    owner,
    bibixId,
    element,
    power = 0,
    speed = 1.0, // multiplicador 1.0 por defecto
    radius = 12,
    pos,
    targetPos,
    lifetime,
    sprite = null,
    ctrl = null,
  } = params;

  // Velocidad base en px/ms (derivada del multiplicador o del valor directo)
  const speedBasePxPerMs = resolveBaseSpeedPxPerMs(speed);

  // Distancia recta (si usas ctrl para Bézier, mantenemos recta para lifetime)
  const dist = Math.hypot((targetPos?.x ?? 0) - (pos?.x ?? 0), (targetPos?.y ?? 0) - (pos?.y ?? 0));

  // lifetime objetivo 3.5–6.0 s (o el provisto), con clamp final
  const lifeMs = clampLifetime(
    lifetime ?? lifetimeForRange(dist, speedBasePxPerMs),
    MIN_MS
  );

  return {
    id: PID++,
    owner,
    bibixId,
    element,
    power: safeNum(power, 0),
    speed: safeNum(speedBasePxPerMs, 0),     // px/ms efectivo (runtime; el loop lo escalará)
    speedBase: safeNum(speedBasePxPerMs, 0), // px/ms base (constante)
    radius: safeNum(radius, 12),

    // posición actual y objetivo
    pos: { x: safeNum(pos?.x, 0), y: safeNum(pos?.y, 0) },
    targetPos: { x: safeNum(targetPos?.x, 0), y: safeNum(targetPos?.y, 0) },

    // ⛳️ origen fijo (para lerp correcto)
    startPos: { x: safeNum(pos?.x, 0), y: safeNum(pos?.y, 0) },

    bornAt: Date.now(),
    lifetime: clamp(lifeMs, MIN_MS, MAX_MS),
    sprite,
    ctrl,
  };
}

// ===== Avance lineal (con easing leve) desde startPos → targetPos =====
export function stepProjectiles(
  list: Projectile[],
  _dtMs: number,
  cb: HitCallbacks
): Projectile[] {
  const now = Date.now();
  const out: Projectile[] = [];

  const easeInOutQuad = (x: number) =>
    x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

  for (const p of list) {
    const life = clampLifetime(p.lifetime);
    const age = now - (p.bornAt || now);

    // Escala por slow/haste aplicado (speed vs speedBase)
    const speedScale = p.speedBase > 0 ? clamp(p.speed / p.speedBase, 0.1, 4.0) : 1.0;

    const tLin = clamp((age / life) * speedScale, 0, 1);
    const t = easeInOutQuad(tLin);

    const sx = p.startPos.x, sy = p.startPos.y;
    const tx = p.targetPos.x, ty = p.targetPos.y;

    const nx = sx + (tx - sx) * t;
    const ny = sy + (ty - sy) * t;

    // Impacto inmediato al llegar (tolerancia = radio o 6 px)
    const hitTol = Math.max(6, p.radius || 12);
    const dx = tx - nx, dy = ty - ny;
    const reached = (dx * dx + dy * dy) <= hitTol * hitTol;

    if (tLin >= 1 || reached) {
      if (p.owner === "player") cb.onHitEnemy(safeNum(p.power, 0));
      else cb.onHitPlayer(safeNum(p.power, 0));
      continue; // no reinsertar
    }

    out.push({ ...p, pos: { x: safeNum(nx, p.pos.x), y: safeNum(ny, p.pos.y) } });
  }
  return out;
}

// ===== “Pared” por X (hitbox de skins) con margen =====
export function filterAndApplyHits(
  list: Projectile[],
  opts: { playerHitX: number; enemyHitX: number },
  cb: HitCallbacks
): Projectile[] {
  const out: Projectile[] = [];
  for (const p of list) {
    const tol = Math.max(6, p.radius || 12); // margen razonable
    if (p.owner === "player" && p.pos.x >= opts.enemyHitX - tol) {
      cb.onHitEnemy(safeNum(p.power, 0));
      continue;
    }
    if (p.owner === "enemy" && p.pos.x <= opts.playerHitX + tol) {
      cb.onHitPlayer(safeNum(p.power, 0));
      continue;
    }
    out.push(p);
  }
  return out;
}

// ===== Choques en el aire + RPS =====
export type RpsCompare = (a: string, b: string) => 1 | -1 | 0;

/**
 * Detecta choques player/enemy por proximidad y resuelve por RPS.
 * - Perdedor: destruido.
 * - Ganador: sigue con power *= 0.5.
 * - Empate: ambos destruidos.
 */
export function resolveMidAirCollisions(
  list: Projectile[],
  compareElements: RpsCompare
): Projectile[] {
  const remove = new Set<number>();
  const L = list.length;

  for (let i = 0; i < L; i++) {
    const a = list[i];
    if (!a || remove.has(a.id)) continue;

    for (let j = i + 1; j < L; j++) {
      const b = list[j];
      if (!b || remove.has(b.id)) continue;
      if (a.owner === b.owner) continue; // solo player vs enemy

      const dx = a.pos.x - b.pos.x;
      const dy = a.pos.y - b.pos.y;
      const dist2 = dx * dx + dy * dy;
      const rad = (a.radius || 12) + (b.radius || 12);
      if (dist2 > rad * rad) continue;

      // Resolver por RPS
      const r = compareElements(a.element, b.element);
      if (r === 1) {
        remove.add(b.id);
        a.power = Math.max(0, Math.round(a.power * 0.5));
      } else if (r === -1) {
        remove.add(a.id);
        b.power = Math.max(0, Math.round(b.power * 0.5));
        break; // 'a' ya murió
      } else {
        remove.add(a.id);
        remove.add(b.id);
        break;
      }
    }
  }

  return list.filter((p) => p && !remove.has(p.id));
}
