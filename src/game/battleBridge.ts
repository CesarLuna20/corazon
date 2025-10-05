// src/game/battleBridge.ts
import { useBattleStore } from "../state/useBattleStore";

// define el tipo aquí (no lo importes)
export type MatchEvent = { gem: number; count: number };

/** Desacoplamos la notificación de matches del ciclo de render */
export function feedMatchesFromBoard(raw: MatchEvent[]) {
  setTimeout(() => {
    useBattleStore.getState().onMatches(raw);
  }, 0);
}
