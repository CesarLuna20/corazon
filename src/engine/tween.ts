export type EaseFn = (t: number) => number;

export const linear: EaseFn = (t) => t;

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function tween(
  from: number,
  to: number,
  durationMs: number,
  nowMs: number,
  startMs: number,
  ease: EaseFn = linear
) {
  const t = Math.max(0, Math.min(1, (nowMs - startMs) / durationMs));
  return lerp(from, to, ease(t));
}
