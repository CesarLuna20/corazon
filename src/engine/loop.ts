// src/engine/loop.ts
export type LoopOpts = { fps?: 30 | 60; onUpdate: (dt: number) => void };
export class FixedLoop {
  private raf: number | null = null;
  private acc = 0;
  private last = 0;
  private step: number;
  private onUpdate: (dt: number) => void;

  constructor({ fps = 30, onUpdate }: LoopOpts) {
    this.step = 1 / fps;
    this.onUpdate = onUpdate;
  }

  setFps(fps: 30 | 60) {
    const was = this.isRunning();
    if (was) this.stop();
    this.step = 1 / fps;
    if (was) this.start();
  }

  start() {
    if (this.raf != null) return;
    this.acc = 0;
    this.last = performance.now() / 1000;
    const tick = () => {
      const now = performance.now() / 1000;
      let dt = now - this.last;
      this.last = now;
      // clamp para spikes
      if (dt > 0.25) dt = 0.25;
      this.acc += dt;
      while (this.acc >= this.step) {
        this.onUpdate(this.step);
        this.acc -= this.step;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    if (this.raf != null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  isRunning() { return this.raf != null; }
}
