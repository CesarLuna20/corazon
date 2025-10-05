// src/game/elo.ts
export function expectedScore(player: number, opp: number) {
  return 1 / (1 + Math.pow(10, (opp - player) / 400));
}

export function updateElo(
  player: number,
  opp: number,
  score: 0 | 0.5 | 1,
  K = 24
) {
  const exp = expectedScore(player, opp);
  const delta = K * (score - exp);
  const next = Math.round(player + delta);
  return Math.max(600, Math.min(2400, next));
}

export function bracket(elo: number) {
  if (elo < 900) return "Bronze";
  if (elo < 1100) return "Silver";
  if (elo < 1300) return "Gold";
  if (elo < 1500) return "Plat";
  if (elo < 1700) return "Diamond";
  return "Master";
}
