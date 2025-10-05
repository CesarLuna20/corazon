// src/game/boardModel.ts
export type MatchEvent = { gem: number; count: number };
import { feedMatchesFromBoard } from "./battleBridge";

// Tablero 8x8 match-3 – swap libre + resolución de matches con cascadas
export type Cell = number; // 0..(COLORS-1) y -1 para huecos
export type Board = {
  w: number;
  h: number;
  cells: Cell[]; // length = w*h
  colors: number;
};

export const W = 7;
export const H = 5;
export const COLORS = 6;

// Helpers
export const idx2d = (x: number, y: number, w: number) => y * w + x;
export const inBounds = (x: number, y: number, w: number, h: number) =>
  x >= 0 && x < w && y >= 0 && y < h;

export function createBoard(
  w = W,
  h = H,
  colors = COLORS,
  rng: () => number = Math.random
): Board {
  const cells = new Array(w * h).fill(0);
  // Evitar matches iniciales evidentes
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v: number;
      do {
        v = (rng() * colors) | 0;
      } while (
        (x >= 2 &&
          cells[idx2d(x - 1, y, w)] === v &&
          cells[idx2d(x - 2, y, w)] === v) ||
        (y >= 2 &&
          cells[idx2d(x, y - 1, w)] === v &&
          cells[idx2d(x, y - 2, w)] === v)
      );
      cells[idx2d(x, y, w)] = v;
    }
  }
  return { w, h, cells, colors };
}

export function toMatchEvents(raw: { gem: number; count: number }[]): MatchEvent[] {
  return raw.map((r) => ({ gem: r.gem, count: r.count }));
}

export function cloneBoard(b: Board): Board {
  return { ...b, cells: b.cells.slice() };
}

export function swap(b: Board, aX: number, aY: number, bX: number, bY: number) {
  const i = idx2d(aX, aY, b.w);
  const j = idx2d(bX, bY, b.w);
  const tmp = b.cells[i];
  b.cells[i] = b.cells[j];
  b.cells[j] = tmp;
}

export type MatchInfo = {
  cleared: number[];   // índices lineales eliminados (unificados)
  groups: number[][];  // grupos por si quieres FX por grupo
  rawClears: { gem: number; count: number }[]; // por grupo, para energía/curas/daño
};

export function findMatches(b: Board): MatchInfo {
  const groups: number[][] = [];
  const { w, h, cells } = b;

  // Horizontales
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const start = x;
      const val = cells[idx2d(x, y, w)];
      x++;
      while (x < w && cells[idx2d(x, y, w)] === val) x++;
      const len = x - start;
      if (val != null && val !== -1 && len >= 3) {
        const g: number[] = [];
        for (let k = 0; k < len; k++) g.push(idx2d(start + k, y, w));
        groups.push(g);
      }
    }
  }

  // Verticales
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      const start = y;
      const val = cells[idx2d(x, y, w)];
      y++;
      while (y < h && cells[idx2d(x, y, w)] === val) y++;
      const len = y - start;
      if (val != null && val !== -1 && len >= 3) {
        const g: number[] = [];
        for (let k = 0; k < len; k++) g.push(idx2d(x, start + k, w));
        groups.push(g);
      }
    }
  }

  // Unificar eliminados
  const clearedSet = new Set<number>();
  for (const g of groups) for (const i of g) clearedSet.add(i);

  // Construir rawClears por grupo (gem, count)
  const rawClears: { gem: number; count: number }[] = [];
  for (const g of groups) {
    if (g.length === 0) continue;
    const gem = cells[g[0]]; // todos en el grupo comparten valor
    if (gem != null && gem !== -1) {
      rawClears.push({ gem, count: g.length });
    }
  }

  return { cleared: [...clearedSet], groups, rawClears };
}

export function clearMatches(b: Board, cleared: number[]) {
  for (const i of cleared) b.cells[i] = -1; // hueco
}

export function applyGravity(b: Board) {
  const { w, h, cells } = b;
  for (let x = 0; x < w; x++) {
    let write = h - 1; // desde abajo
    for (let y = h - 1; y >= 0; y--) {
      const i = idx2d(x, y, w);
      const v = cells[i];
      if (v !== -1) {
        const wi = idx2d(x, write, w);
        cells[wi] = v;
        if (wi !== i) cells[i] = -1;
        write--;
      }
    }
  }
}

export function refill(b: Board, rng: () => number = Math.random) {
  const { w, h, colors, cells } = b;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx2d(x, y, w);
      if (cells[i] === -1) {
        cells[i] = (rng() * colors) | 0;
      }
    }
  }
}

export type ResolveStep =
  | { type: "swap"; a: number; b: number }
  | { type: "clear"; cleared: number[] }
  | { type: "gravity" }
  | { type: "refill" };

export type ResolveResult = {
  steps: ResolveStep[];
  totalCleared: number;
};

/** Swap libre + cascadas */
export function swapAndResolveFree(
  b: Board,
  aX: number,
  aY: number,
  bX: number,
  bY: number,
  rng: () => number = Math.random
): ResolveResult {
  const steps: ResolveStep[] = [];
  swap(b, aX, aY, bX, bY);
  steps.push({ type: "swap", a: idx2d(aX, aY, b.w), b: idx2d(bX, bY, b.w) });

  let totalCleared = 0;
  while (true) {
    const { cleared, rawClears } = findMatches(b);
    if (cleared.length === 0) break;

    // 🔥 Alimentar HUD/batalla ANTES de borrar y caer
    //    (esto carga slots, cura y hace daño directo según gem y tamaño)
    if (rawClears.length > 0) {
      // Puedes pasar rawClears directo; NormalScreen hará el mapping
      feedMatchesFromBoard(rawClears);
    }

    // Eliminar, gravedad y refill
    steps.push({ type: "clear", cleared: [...cleared] });
    totalCleared += cleared.length;
    clearMatches(b, cleared);

    applyGravity(b);
    steps.push({ type: "gravity" });

    refill(b, rng);
    steps.push({ type: "refill" });
  }

  return { steps, totalCleared };
}
