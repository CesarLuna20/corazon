// src/game/projectiles.ts
export type ChargeLevel = 1 | 2 | 3 | 4;

export type Projectile = {
  id: number;
  owner: "player" | "enemy";
  bibixId: string;
  element: string;
  power: number;
  speed: number;              // px/ms o factor de lerp
  radius: number;
  pos: { x: number; y: number };
  targetPos: { x: number; y: number };
  bornAt: number;             // ms
  lifetime: number;           // ms (duración del tween/lerp)
};

let PID = 1;

const clampLifetime = (n: any, def = 650) =>
  Number.isFinite(n) && n > 0 ? Number(n) : def;

const safeNum = (n: any, def: number) =>
  Number.isFinite(n) ? Number(n) : def;

export function createProjectile(params: {
  owner: "player" | "enemy";
  bibixId: string;
  element: string;
  chargeLevel: 1 | 2 | 3 | 4;
  power?: number;
  speed?: number;
  radius?: number;
  pos: { x: number; y: number };
  targetPos: { x: number; y: number };
  lifetime?: number; // ms
}): Projectile {
  const {
    owner,
    bibixId,
    element,
    power = 0,
    speed = 1.0,
    radius = 10,
    pos,
    targetPos,
    lifetime = 650,
  } = params;

  return {
    id: PID++,
    owner,
    bibixId,
    element,
    power: safeNum(power, 0),
    speed: safeNum(speed, 1),
    radius: safeNum(radius, 10),
    pos: { x: safeNum(pos?.x, 0), y: safeNum(pos?.y, 0) },
    targetPos: { x: safeNum(targetPos?.x, 0), y: safeNum(targetPos?.y, 0) },
    bornAt: Date.now(),
    lifetime: clampLifetime(lifetime),
  };
}

// ===== Runtime helpers para el loop =====

export type HitCallbacks = {
  onHitEnemy: (dmg: number) => void;
  onHitPlayer: (dmg: number) => void;
};

/**
 * Avanza posiciones por tiempo y devuelve una lista NUEVA.
 * Cuando el t del lerp alcanza 1.0, dispara el callback correspondiente.
 */
// Usa 'now - bornAt' (no sumes dt), y evita NaN
export function stepProjectiles(
  list: Projectile[],
  _dtMs: number,
  cb: HitCallbacks
): Projectile[] {
  const now = Date.now();
  const out: Projectile[] = [];
  for (const p of list) {
    const life = clampLifetime(p.lifetime);
    const age = now - (p.bornAt || now);
    const t = Math.max(0, Math.min(1, age / life));

    const nx = p.pos.x + (p.targetPos.x - p.pos.x) * t;
    const ny = p.pos.y + (p.targetPos.y - p.pos.y) * t;

    if (t >= 1) {
      if (p.owner === "player") cb.onHitEnemy(safeNum(p.power, 0));
      else cb.onHitPlayer(safeNum(p.power, 0));
      continue;
    }

    out.push({
      ...p,
      pos: { x: safeNum(nx, p.pos.x), y: safeNum(ny, p.pos.y) },
    });
  }
  return out;
}

/**
 * Si aparte usas un “muro” de colisión por X (p.ej. choque con hitbox enemiga),
 * aplícalo aquí. Si no, puedes dejarlo como no-op.
 */
export function filterAndApplyHits(
  list: Projectile[],
  opts: { playerHitX: number; enemyHitX: number },
  cb: HitCallbacks
): Projectile[] {
  const out: Projectile[] = [];
  for (const p of list) {
    if (p.owner === "player" && p.pos.x >= opts.enemyHitX) {
      cb.onHitEnemy(p.power);
      continue;
    }
    if (p.owner === "enemy" && p.pos.x <= opts.playerHitX) {
      cb.onHitPlayer(p.power);
      continue;
    }
    out.push(p);
  }
  return out;
}
