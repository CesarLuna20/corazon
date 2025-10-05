export type Particle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  ageMs: number;
};

export class ParticleSystem {
  private pool: Particle[] = [];
  private nextId = 1;
  private readonly max: number;

  constructor(maxParticles: number) {
    this.max = maxParticles;
  }

  spawn(x: number, y: number, vx = 0, vy = 0, lifeMs = 500) {
    if (this.pool.length >= this.max) return;
    this.pool.push({
      id: this.nextId++,
      x,
      y,
      vx,
      vy,
      lifeMs,
      ageMs: 0,
    });
  }

  update(dtMs: number) {
    for (const p of this.pool) {
      p.ageMs += dtMs;
      p.x += (p.vx * dtMs) / 1000;
      p.y += (p.vy * dtMs) / 1000;
    }
    this.pool = this.pool.filter((p) => p.ageMs < p.lifeMs);
  }

  getParticles() {
    return this.pool;
  }

  clear() {
    this.pool = [];
  }
}
