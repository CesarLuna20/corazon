export type Quality = "low" | "medium" | "high";

export const QualityCaps = {
  particles: { low: 40, medium: 80, high: 140 },
  fps: { low: 30, medium: 30, high: 60 },
} as const;

export function clampQuality(q?: Quality): Quality {
  return q ?? "medium";
}
