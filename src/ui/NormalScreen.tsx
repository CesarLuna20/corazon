// src/ui/NormalScreen.tsx
import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { View, Dimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import ResultsOverlay from "./components/ResultsOverlay";
import {
  Canvas,
  Group,
  RoundedRect,
  LinearGradient,
  vec,
  Image as SkImage,
  useImage,
  Circle,
  Text as SkText,
  useFont,
} from "@shopify/react-native-skia";
import {
  Board,
  swap,
  cloneBoard,
  createBoard,
  swapAndResolveFree,
  W as BW,
  H as BH,
  COLORS,
} from "../game/boardModel";
import { useBattleStore } from "../state/useBattleStore";
import { useNavigation } from "@react-navigation/native";
import { useProfileStore } from "../state/useProfileStore";
import { PLAYER_SKINS, OPPONENTS } from "../data/avatars";

import Sprite from "./components/Sprite";
import { SPELL_SPRITES } from "../data/spellsSprites";

// 🎵 Audio (corregido)
import { initAudio, changeMusic, stopMusic, setMusicFromStore } from "../audio/audio";
import { useAudioStore } from "../state/useAudioStore";

// ====== Layout ======
const { width, height } = Dimensions.get("window");
const GAP = 0;
const TILE_R = 2222;
const boardSize = Math.min(width, height) * 0.95;
const cell = (boardSize - GAP * (BW - 1)) / BW;
const BOARD_SHIFT_Y = 105;
const boardLeft = (width - boardSize) / 2;
const boardTop = (height - boardSize) / 2 + BOARD_SHIFT_Y;

// Mejora de input
const TAP_SLOP = 14;
const PAN_MIN_DIST = 12;
const HIT_PAD = 10;

// HUD top
const TOP_Y = 10;
const PADDING_X = 12;
const BAR_H = 16;
const BAR_R = 10;
const BAR_W = Math.min(280, (width - 140) / 2);
const LABEL_DY = -6;

// 🌟 Offsets de barras centradas
const PLAYER_BAR_X = width * 0.5 - BAR_W - 12;
const ENEMY_BAR_X = width * 0.5 + 12;

// Slots
const LEFT_COL_W = 92;
const SLOT_R = 28;
const SLOT_MARGIN_Y = 14;

// ===== Sprites (posición/tamaño) =====
const PLAYER_SPRITE_W = 220;
const PLAYER_SPRITE_H = 220;
const ENEMY_SPRITE_W = 220;
const ENEMY_SPRITE_H = 220;

// Gestos/util
const idx = (x: number, y: number) => y * BW + x;
const gridToPx = (x: number, y: number) => ({ px: x * (cell + GAP), py: y * (cell + GAP) });
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const MOVE_MS = 180;
const SPAWN_MS = 160;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ========= Pause button / menu bounds =========
const PAUSE_BTN_SIZE = 42;
const pauseBtn = {
  x: width / 2 - PAUSE_BTN_SIZE / 2,
  y: TOP_Y + 6,
  w: PAUSE_BTN_SIZE,
  h: PAUSE_BTN_SIZE,
};

type V = { x: number; y: number; a: number; s: number };
type Tween = { from: V; to: V; t0: number; dur: number; alive: boolean };

// ====== Brackets por ELO (para HP del enemigo) ======
function eloBracket(elo: number) {
  if (elo < 900) return { name: "Bronze", hpMul: 0.95 };
  if (elo < 1100) return { name: "Silver", hpMul: 1.0 };
  if (elo < 1300) return { name: "Gold", hpMul: 1.06 };
  if (elo < 1500) return { name: "Platinum", hpMul: 1.12 };
  if (elo < 1700) return { name: "Diamond", hpMul: 1.18 };
  return { name: "Master", hpMul: 1.25 };
}

const SLOT_LABELS = ["Fuego", "Agua", "Tierra", "Energía"];

// ====== Helpers de visualización de nivel/cap por fase ======
const TH = [10, 20, 30, 45] as const;
const levelFromEnergy = (e: number): 0 | 1 | 2 | 3 | 4 =>
  e >= TH[3] ? 4 : e >= TH[2] ? 3 : e >= TH[1] ? 2 : e >= TH[0] ? 1 : 0;

const getOwnedPhase = (slotIndex: number): 0 | 1 | 2 | 3 | 4 => {
  const sel = useProfileStore.getState().getSelectedArray?.() ?? [];
  const id = sel[slotIndex] ?? null;
  if (!id) return 0;
  const p = useProfileStore.getState().phasesByBibix?.[id] ?? 1;
  return p === 1 || p === 2 || p === 3 || p === 4 ? (p as 1 | 2 | 3 | 4) : 1;
};

// === Helper: texto centrado dentro de una barra ===
const HpInBar: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontRef: any;
}> = ({ x, y, w, h, text, fontRef }) => {
  if (!fontRef) return null as any;
  const m = fontRef.measureText(text);
  const tx = x + (w - (m?.width ?? 0)) / 2;
  const ty = y + h / 2 + (m?.height ? m.height * 0.35 : 6);

  return (
    <>
      <RoundedRect x={x + 6} y={y + 2} width={w - 12} height={h - 4} r={h / 2} color="rgba(0,0,0,0.20)" />
      <SkText text={text} x={tx + 1} y={ty + 1} font={fontRef} color="rgba(0,0,0,0.55)" />
      <SkText text={text} x={tx} y={ty} font={fontRef} color="#EAF6FF" />
    </>
  );
};

export default function NormalScreen() {
  // ====== Música de escena ======
  useEffect(() => {
    (async () => {
      await initAudio();
      await changeMusic("battle", { crossfadeMs: 600, loop: true }); // 👈 corregido
      await setMusicFromStore();
    })();

    return () => {
      // al salir de batalla, paramos y descargamos (Home la volverá a encender)
      stopMusic(true, 300);
    };
  }, []);

  useEffect(() => {
    const unsub = useAudioStore.subscribe(() => setMusicFromStore());
    return unsub;
  }, []);

  const navigation = useNavigation<any>();

  // ====== Background ======
  const bgImg = useImage(require("../../assets/background/Background1.jpeg"));

  // ====== Skia fonts ======
  const font = useFont(require("../../assets/fonts/Montserrat-Bold.ttf"), 16);
  const fontSmall = useFont(require("../../assets/fonts/Montserrat-Regular.ttf"), 13);

  // ====== Tiles (para tablero) ======
  const img0 = useImage(require("../../assets/tiles/gem0.png"));
  const img1 = useImage(require("../../assets/tiles/gem1.png"));
  const img2 = useImage(require("../../assets/tiles/gem2.png"));
  const img3 = useImage(require("../../assets/tiles/gem3.png"));
  const img4 = useImage(require("../../assets/tiles/gem4.png"));
  const img5 = useImage(require("../../assets/tiles/gem5.png"));
  const TILE_IMGS = [img0, img1, img2, img3, img4, img5];
  const readyTiles = TILE_IMGS.every(Boolean);

  // ====== Preload de sprites de los 4 slots (jugador) ======
  const selectedIds = useProfileStore.getState().getSelectedArray?.() ?? [];
  const preSpell0 = useImage(selectedIds[0] && SPELL_SPRITES[selectedIds[0]] ? SPELL_SPRITES[selectedIds[0]].source : null);
  const preSpell1 = useImage(selectedIds[1] && SPELL_SPRITES[selectedIds[1]] ? SPELL_SPRITES[selectedIds[1]].source : null);
  const preSpell2 = useImage(selectedIds[2] && SPELL_SPRITES[selectedIds[2]] ? SPELL_SPRITES[selectedIds[2]].source : null);
  const preSpell3 = useImage(selectedIds[3] && SPELL_SPRITES[selectedIds[3]] ? SPELL_SPRITES[selectedIds[3]].source : null);
  void preSpell0; void preSpell1; void preSpell2; void preSpell3;

  // ====== Enemy (IA) – loadout y preload ======
  const enemyIds = useBattleStore((s) => s.enemyLoadout) ?? [];
  const preE0 = useImage(enemyIds[0] && SPELL_SPRITES[enemyIds[0]] ? SPELL_SPRITES[enemyIds[0]].source : null);
  const preE1 = useImage(enemyIds[1] && SPELL_SPRITES[enemyIds[1]] ? SPELL_SPRITES[enemyIds[1]].source : null);
  const preE2 = useImage(enemyIds[2] && SPELL_SPRITES[enemyIds[2]] ? SPELL_SPRITES[enemyIds[2]].source : null);
  const preE3 = useImage(enemyIds[3] && SPELL_SPRITES[enemyIds[3]] ? SPELL_SPRITES[enemyIds[3]].source : null);
  void preE0; void preE1; void preE2; void preE3;

  // ====== Board state ======
  const [board, setBoard] = useState<Board>(() => createBoard(BW, BH, COLORS));
  const [, setTick] = useState(0);
  const visualCellsRef = useRef<number[]>(board.cells.slice());

  // ====== Profile (nivel/HP/ELO) ======
  const level = useProfileStore((s) => s.playerLevel);
  const playerElo = useProfileStore((s) => s.playerElo);
  const getComputedMaxHp = useProfileStore((s) => s.getComputedMaxHp);

  // Nombres/skins
  const playerNameFromStore = useProfileStore((s: any) => s.playerName);
  const playerSkinIdFromStore = useProfileStore((s: any) => s.playerSkinId);

  // "player" en el store = RIVAL aleatorio (izquierda)
  const opponentSkinRef = useRef(OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)] ?? OPPONENTS[0]);
  const opponentSkin = opponentSkinRef.current;

  // "enemy" en el store = Tú (derecha)
  const mySkin = useMemo(() => {
    const id = playerSkinIdFromStore ?? PLAYER_SKINS[0]?.id;
    return PLAYER_SKINS.find((a) => a.id === id) ?? PLAYER_SKINS[0];
  }, [playerSkinIdFromStore]);

  // Sprites básicos
  const defaultSprite = require("../../assets/personajes/itsuka.png");
  const enemySpriteSource =
    (opponentSkin as any)?.sprite?.source ?? (opponentSkin as any)?.sprite ?? defaultSprite;
  const enemyRows = (opponentSkin as any)?.sprite?.rows ?? 2;
  const enemyCols = (opponentSkin as any)?.sprite?.cols ?? 3;
  const enemyFps = (opponentSkin as any)?.sprite?.fps ?? 1.8;
  const enemyW = (opponentSkin as any)?.sprite?.renderW ?? 80;
  const enemyH = (opponentSkin as any)?.sprite?.renderH ?? 100;

  const mySpriteSource = (mySkin as any)?.sprite?.source ?? (mySkin as any)?.sprite ?? defaultSprite;
  const myRows = (mySkin as any)?.sprite?.rows ?? 2;
  const myCols = (mySkin as any)?.sprite?.cols ?? 3;
  const myFps = (mySkin as any)?.sprite?.fps ?? 1.8;
  const myW = (mySkin as any)?.sprite?.renderW ?? 80;
  const myH = (mySkin as any)?.sprite?.renderH ?? 100;

  // Nombres en HUD
  const leftName = playerNameFromStore || mySkin?.name || "Tú";
  const rightName = opponentSkin?.name || "Rival";

  // ====== Battle store ======
  const paused = useBattleStore((s) => s.paused);
  const openPause = useBattleStore((s) => s.openPause);
  const resumeGame = useBattleStore((s) => s.resumeGame);
  const resetMatch = useBattleStore((s) => s.resetMatch);
  const battleStart = useBattleStore((s) => s.start);
  const battleStop = useBattleStore((s) => s.stop);

  // ====== Inicializa HP máximos con perfil/ELO ======
  const applyMaxHpFromProfile = useCallback(() => {
    const pMax = getComputedMaxHp(); // player (rival/izq)
    const br = eloBracket(playerElo ?? 1000);
    const enemyMax = Math.round(1000 * br.hpMul); // enemy (tú/der)
    useBattleStore.getState().setMaxHp(pMax, enemyMax);
  }, [getComputedMaxHp, playerElo]);

  useEffect(() => {
    applyMaxHpFromProfile();
  }, [applyMaxHpFromProfile]);

  useEffect(() => {
    const b = useBattleStore.getState();
    b.start();
    return () => b.stop();
  }, []);

  // ====== Efectos de vida del loop ======
  useEffect(() => {
    battleStart();
    return () => battleStop();
  }, [battleStart, battleStop]);

  // forzar re-render cuando cambie tick del store
  useEffect(() => {
    let prev = useBattleStore.getState().tick;
    const unsub = useBattleStore.subscribe(() => {
      const t = useBattleStore.getState().tick;
      if (t !== prev) {
        prev = t;
        setTick((n) => (n + 1) & 1023);
      }
    });
    return () => unsub();
  }, []);

  // impacto (líneas X) + orígenes y ALTURA fija (pista azul)
  useEffect(() => {
    const playerLineX = boardLeft - 170;
    const enemyLineX = boardLeft + boardSize + 185;
    useBattleStore.getState().setImpactLines(playerLineX, enemyLineX);

    // Orígenes: ligeramente fuera del tablero
    const playerShotX = boardLeft - 150; // punto rojo
    const enemyShotX = boardLeft + boardSize + 185;
    useBattleStore.getState().setShotOrigins(playerShotX, enemyShotX);

    // Altura única de recorrido (línea recta sobre el board)
    const trackY = boardTop - 40;
    useBattleStore.getState().setShotHeights(trackY, trackY);
  }, []);

  // ====== Tweens tablero ======
  const valuesRef = useRef<V[]>(
    Array.from({ length: BW * BH }, (_, i) => {
      const x = i % BW;
      const y = Math.floor(i / BW);
      const { px, py } = gridToPx(x, y);
      return { x: px, y: py, a: 1, s: 1 };
    })
  );
  const tweenRef = useRef<Tween[]>(
    Array.from({ length: BW * BH }, () => ({
      from: { x: 0, y: 0, a: 1, s: 1 },
      to: { x: 0, y: 0, a: 1, s: 1 },
      t0: 0,
      dur: 0,
      alive: false,
    }))
  );

  const animLock = useSharedValue(0);
  const rafId = useRef<number | null>(null);

  const step = (now: number) => {
    let any = false;
    const vals = valuesRef.current;
    const tweens = tweenRef.current;

    for (let i = 0; i < tweens.length; i++) {
      const tw = tweens[i];
      if (!tw.alive) continue;
      const t = Math.min(1, (now - tw.t0) / tw.dur);
      const k = ease(t);
      vals[i].x = tw.from.x + (tw.to.x - tw.from.x) * k;
      vals[i].y = tw.from.y + (tw.to.y - tw.from.y) * k;
      vals[i].a = tw.from.a + (tw.to.a - tw.from.a) * k;
      vals[i].s = tw.from.s + (tw.to.s - tw.from.s) * k;
      if (t < 1) any = true;
      else tw.alive = false;
    }

    if (any) {
      setTick((n) => (n + 1) & 1023);
      rafId.current = requestAnimationFrame(step);
    } else {
      rafId.current = null;
      animLock.value = 0;
    }
  };
  const kick = () => {
    if (rafId.current == null) rafId.current = requestAnimationFrame(step);
  };
  const startTweenFor = (i: number, from: V, to: V, dur: number) => {
    const tw = tweenRef.current[i];
    tw.from = from;
    tw.to = to;
    tw.t0 = performance.now();
    tw.dur = dur;
    tw.alive = true;
    valuesRef.current[i] = { ...from };
    kick();
  };

  useEffect(() => {
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
      rafId.current = null;
      animLock.value = 0;
    };
  }, []);

  type AnimJob = () => void;
  const animQueueRef = useRef<AnimJob[]>([]);
  const flushQueuedAnims = () => {
    requestAnimationFrame(() => {
      const q = animQueueRef.current;
      animQueueRef.current = [];
      for (const job of q) job();
    });
  };

  const mapColumnFalls = (before: number[], after: number[]) => {
    const mapping = Array.from({ length: BW * BH }, () => ({ fromX: 0, fromY: -1, spawn: false }));
    for (let x = 0; x < BW; x++) {
      const src: number[] = [];
      for (let y = BH - 1; y >= 0; y--) if (before[idx(x, y)] >= 0) src.push(y);
      for (let y = BH - 1; y >= 0; y--) {
        const i = idx(x, y);
        if (after[i] < 0) continue;
        if (src.length) {
          const ySrc = src.shift()!;
          mapping[i] = { fromX: x, fromY: ySrc, spawn: false };
        } else {
          mapping[i] = { fromX: x, fromY: -1, spawn: true };
        }
      }
    }
    return mapping;
  };

  const doSwap = (sx: number, sy: number, tx: number, ty: number) => {
    if (animLock.value || paused) return;
    animLock.value = 1;

    setBoard((prev) => {
      const mid = cloneBoard(prev);
      swap(mid, sx, sy, tx, ty);

      const next = cloneBoard(prev);
      const res = swapAndResolveFree(next, sx, sy, tx, ty);
      const after = next.cells;

      // 1) swap
      animQueueRef.current.push(() => {
        visualCellsRef.current = mid.cells.slice();

        const { px: ax, py: ay } = gridToPx(sx, sy);
        const { px: bx, py: by } = gridToPx(tx, ty);

        const iAB = idx(tx, ty);
        const iBA = idx(sx, sy);
        startTweenFor(iAB, { x: ax, y: ay, a: 1, s: 1 }, { x: bx, y: by, a: 1, s: 1 }, MOVE_MS);
        startTweenFor(iBA, { x: bx, y: by, a: 1, s: 1 }, { x: ax, y: ay, a: 1, s: 1 }, MOVE_MS);
      });

      const hadCascades = res.steps.some(
        (s) => s.type === "clear" || s.type === "gravity" || s.type === "refill"
      );

      // 2) caída/refill
      animQueueRef.current.push(() => {
        setTimeout(() => {
          visualCellsRef.current = after.slice();
          if (hadCascades) {
            const mapping = mapColumnFalls(mid.cells, after);
            for (let y = 0; y < BH; y++) {
              for (let x = 0; x < BW; x++) {
                const i = idx(x, y);
                if (after[i] < 0) continue;
                const { px, py } = gridToPx(x, y);
                const m = mapping[i];
                if (m.spawn) {
                  startTweenFor(
                    i,
                    { x: px, y: -cell, a: 0, s: 0.85 },
                    { x: px, y: py, a: 1, s: 1 },
                    SPAWN_MS
                  );
                } else {
                  const { px: sxPx, py: syPx } = gridToPx(m.fromX, m.fromY);
                  startTweenFor(i, { x: sxPx, y: syPx, a: 1, s: 1 }, { x: px, y: py, a: 1, s: 1 }, MOVE_MS);
                }
              }
            }
          } else {
            for (let y = 0; y < BH; y++) {
              for (let x = 0; x < BW; x++) {
                const i = idx(x, y);
                const { px, py } = gridToPx(x, y);
                startTweenFor(i, { x: px, y: py, a: 1, s: 1 }, { x: px, y: py, a: 1, s: 1 }, 1);
              }
            }
          }
          kick();
        }, MOVE_MS);
      });

      flushQueuedAnims();
      return next;
    });
  };

  // ===== Helpers JS (para runOnJS) =====
  const fireSlotJS = (i: number) => {
    const api: any = useBattleStore as any;
    if (typeof api?.getState !== "function") return;
    const st = api.getState();
    if (typeof st.fireSlot === "function") st.fireSlot(i);
  };

  const resetBoardJS = () => {
    const b = createBoard(BW, BH, COLORS);
    setBoard(b);
    visualCellsRef.current = b.cells.slice();
    for (let i = 0; i < BW * BH; i++) {
      const x = i % BW;
      const y = Math.floor(i / BW);
      const { px, py } = gridToPx(x, y);
      valuesRef.current[i] = { x: px, y: py, a: 1, s: 1 };
      const tw = tweenRef.current[i];
      tw.alive = false;
      tw.dur = 0;
    }
  };

  const onPausePress = () => {
    const st = useBattleStore.getState();
    st.paused ? st.resumeGame() : st.openPause();
  };
  const onContinue = () => useBattleStore.getState().resumeGame();
  const onRestart = () => {
    applyMaxHpFromProfile();
    resetBoardJS();
    useBattleStore.getState().resetMatch();
  };
  const onExit = () => {
    onRestart();
    navigation.reset({ index: 0, routes: [{ name: "Home" }] });
  };

  // ===== Gestos =====
  const startGX = useSharedValue<number | null>(null);
  const startGY = useSharedValue<number | null>(null);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(PAN_MIN_DIST)
        .onStart((e) => {
          "worklet";
          if (animLock.value || paused) return;
          const inBoard =
            e.x >= boardLeft &&
            e.y >= boardTop &&
            e.x <= boardLeft + boardSize &&
            e.y <= boardTop + boardSize;
          if (!inBoard) {
            startGX.value = null;
            startGY.value = null;
            return;
          }
          const gx = Math.floor((e.x - boardLeft) / (cell + GAP));
          const gy = Math.floor((e.y - boardTop) / (cell + GAP));
          if (gx >= 0 && gx < BW && gy >= 0 && gy < BH) {
            startGX.value = gx;
            startGY.value = gy;
          } else {
            startGX.value = null;
            startGY.value = null;
          }
        })
        .onEnd((e) => {
          "worklet";
          if (animLock.value || paused) return;
          const sx = startGX.value;
          const sy = startGY.value;
          startGX.value = null;
          startGY.value = null;
          if (sx == null || sy == null) return;

          const inBoard =
            e.x >= boardLeft &&
            e.y >= boardTop &&
            e.x <= boardLeft + boardSize &&
            e.y <= boardTop + boardSize;
          if (!inBoard) return;

          const ex = Math.floor((e.x - boardLeft) / (cell + GAP));
          const ey = Math.floor((e.y - boardTop) / (cell + GAP));
          if (ex < 0 || ex >= BW || ey < 0 || ey >= BH) return;

          const dx = ex - sx;
          const dy = ey - sy;
          let tx = sx;
          let ty = sy;
          if (Math.abs(dx) > Math.abs(dy)) tx = sx + (dx > 0 ? 1 : -1);
          else ty = sy + (dy > 0 ? 1 : -1);

          if (tx === sx && ty === sy) return;
          if (tx < 0 || tx >= BW || ty < 0 || ty >= BH) return;

          runOnJS(doSwap)(sx, sy, tx, ty);
        }),
    [paused]
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(TAP_SLOP)
        .onEnd((e) => {
          "worklet";
          // ---- botón pausa (Skia) ----
          if (
            e.x >= pauseBtn.x - HIT_PAD &&
            e.x <= pauseBtn.x + pauseBtn.w + HIT_PAD &&
            e.y >= pauseBtn.y - HIT_PAD &&
            e.y <= pauseBtn.y + pauseBtn.h + HIT_PAD
          ) {
            runOnJS(onPausePress)();
            return;
          }

          if (paused) {
            // ---- menú de pausa ----
            const MENU_W = 260;
            const MENU_X = (width - MENU_W) / 2;
            const MENU_Y = height * 0.32;
            const BTN_H = 48;
            const GAPY = 12;

            const rContinue = { x: MENU_X + 16, y: MENU_Y + 64, w: MENU_W - 32, h: BTN_H };
            const rRestart = { x: MENU_X + 16, y: rContinue.y + BTN_H + GAPY, w: MENU_W - 32, h: BTN_H };
            const rExit = { x: MENU_X + 16, y: rRestart.y + BTN_H + GAPY, w: MENU_W - 32, h: BTN_H };

            const hit = (r: { x: number; y: number; w: number; h: number }) =>
              e.x >= r.x - HIT_PAD &&
              e.x <= r.x + r.w + HIT_PAD &&
              e.y >= r.y - HIT_PAD &&
              e.y <= r.y + r.h + HIT_PAD;

            if (hit(rContinue)) {
              runOnJS(onContinue)();
              return;
            }
            if (hit(rRestart)) {
              runOnJS(onRestart)();
              return;
            }
            if (hit(rExit)) {
              runOnJS(onExit)();
              return;
            }
            return;
          }

          // ---- tap en slots izquierdos (disparo) ----
          const inLeftPanel =
            e.x >= PADDING_X - HIT_PAD &&
            e.x <= PADDING_X + LEFT_COL_W + HIT_PAD &&
            e.y >= boardTop - HIT_PAD &&
            e.y <= boardTop + boardSize + HIT_PAD;

          if (!inLeftPanel) return;

          const usableH = boardSize - SLOT_MARGIN_Y * 2;
          const gap = usableH / 5;
          const yRel = e.y - boardTop - SLOT_MARGIN_Y;
          let i = Math.round(yRel / gap);
          if (i < 0) i = 0;
          if (i > 3) i = 3;

          runOnJS(fireSlotJS)(i);
        }),
    [paused]
  );

  const gestures = useMemo(() => Gesture.Exclusive(tap, pan), [tap, pan]);

  // HP del store (0..1)
  const pHP = clamp01(useBattleStore.getState().playerHP); // player = rival (izq)
  const eHP = clamp01(useBattleStore.getState().enemyHP); // enemy = tú (der)

  // Números visibles
  const pMax = useBattleStore.getState().playerHPMax ?? 1000;
  const eMax = useBattleStore.getState().enemyHPMax ?? 1000;
  const pCur = Math.max(0, Math.round(pHP * pMax));
  const eCur = Math.max(0, Math.round(eHP * eMax));

  const tiles = visualCellsRef.current.slice();

  const br = eloBracket(playerElo ?? 1000);

  // ===== Helpers de fase del ENEMIGO (derecha)
  const getEnemyPhase = (slotIndex: number): 0 | 1 | 2 | 3 | 4 => {
    const id = enemyIds[slotIndex];
    return id ? 4 : 0;
    // si más adelante manejas fases reales del enemigo, cámbialo aquí
  };

  if (!readyTiles) return <View style={{ flex: 1, backgroundColor: "#0B0E14" }} />;

  return (
    <View style={{ flex: 1, backgroundColor: "#0B0E14" }}>
      <GestureDetector gesture={gestures}>
        <Canvas style={{ flex: 1 }}>
          {/* Fondo */}
          {bgImg ? (
            <SkImage image={bgImg} x={0} y={0} width={width} height={height} fit="cover" />
          ) : (
            <RoundedRect x={0} y={0} width={width} height={height} r={0} color="#0B0E14" />
          )}
          {/* Overlay para contraste */}
          <RoundedRect x={0} y={0} width={width} height={height} r={0}>
            <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={["#00000040", "#00000080"]} />
          </RoundedRect>

          {/* ======= HUD TOP ======= */}
          {font && (
            <>
              {/* Nivel */}
              <RoundedRect x={PADDING_X} y={TOP_Y - 2} width={86} height={20} r={8} color="#1C2A44" />
              <SkText text={`Nv ${level ?? 1}`} x={PADDING_X + 8} y={TOP_Y + 13} font={fontSmall ?? font} color="#E6F3FF" />

              {/* Nombres */}
              <SkText text={leftName} x={PLAYER_BAR_X + 190} y={TOP_Y + LABEL_DY + 16} font={font} color="#E6F3FF" />
              <SkText text={rightName} x={ENEMY_BAR_X + BAR_W - 245} y={TOP_Y + LABEL_DY + 16} font={font} color="#E6F3FF" />
            </>
          )}

          {/* Player bar (izquierda) — HP dentro */}
          <RoundedRect x={PLAYER_BAR_X - 15} y={TOP_Y + 20} width={BAR_W} height={BAR_H} r={BAR_R} color="#1F2737" />
          <RoundedRect x={PLAYER_BAR_X - 15} y={TOP_Y + 20} width={BAR_W * pHP} height={BAR_H} r={BAR_R} color="#65E08E" />
          <HpInBar x={PLAYER_BAR_X - 15} y={TOP_Y + 20} w={BAR_W} h={BAR_H} text={`${pCur}/${pMax}`} fontRef={font} />

          {/* Enemy bar (derecha) — HP dentro */}
          <RoundedRect x={ENEMY_BAR_X + 15} y={TOP_Y + 20} width={BAR_W} height={BAR_H} r={BAR_R} color="#1F2737" />
          <RoundedRect
            x={ENEMY_BAR_X + BAR_W * (1 - eHP) + 15}
            y={TOP_Y + 20}
            width={BAR_W * eHP}
            height={BAR_H}
            r={BAR_R}
            color="#FF7A7A"
          />
          <HpInBar x={ENEMY_BAR_X + 15} y={TOP_Y + 20} w={BAR_W} h={BAR_H} text={`${eCur}/${eMax}`} fontRef={font} />

          {/* Botón de pausa */}
          <RoundedRect x={pauseBtn.x} y={pauseBtn.y} width={pauseBtn.w} height={pauseBtn.h} r={8} color={paused ? "#305A96" : "#1C2A44"} />
          <RoundedRect x={pauseBtn.x + 12} y={pauseBtn.y + 10} width={6} height={pauseBtn.h - 20} r={3} color="#E6F3FF" />
          <RoundedRect x={pauseBtn.x + pauseBtn.w - 18} y={pauseBtn.y + 10} width={6} height={pauseBtn.h - 20} r={3} color="#E6F3FF" />

          {/* ===== Sprites del jugador y rival ===== */}
          {/* Rival real (lado izquierdo, "player" en store) */}
          <Sprite
            source={enemySpriteSource}
            rows={enemyRows}
            cols={enemyCols}
            x={800}
            y={0}
            width={enemyW}
            height={enemyH}
            fps={enemyFps}
            loop
          />
          {/* Tú (lado derecho, espejado) */}
          <Group
            transform={
              [
                {
                  translateX:
                    Math.min(width - ENEMY_SPRITE_W - 8, boardLeft + boardSize - 0.45 * ENEMY_SPRITE_W) +
                    ENEMY_SPRITE_W,
                },
                { translateY: boardTop + 12 },
                { scaleX: -1 },
              ] as any
            }
          >
            <Sprite
              source={mySpriteSource}
              rows={myRows}
              cols={myCols}
              x={650}
              y={-130}
              width={myW}
              height={myH}
              fps={myFps}
              loop
            />
          </Group>

          {/* ===== Tablero ===== */}
          <Group transform={[{ translateX: boardLeft }, { translateY: boardTop }]}>
            {visualCellsRef.current.map((t, i) => {
              const img = t >= 0 ? TILE_IMGS[t % TILE_IMGS.length] : null;
              const v = valuesRef.current[i];
              const transform = [
                { translateX: v.x },
                { translateY: v.y },
                { translateX: cell * 0.5 },
                { translateY: cell * 0.5 },
                { scale: v.s },
                { translateX: -cell * 0.5 },
                { translateY: -cell * 0.5 },
              ] as unknown as any;

              if (!img) return null;
              return (
                <Group key={i} opacity={v.a} transform={transform}>
                  <SkImage x={0} y={0} width={cell} height={cell} image={img!} fit="cover" />
                </Group>
              );
            })}
          </Group>

          {/* ===== Proyectiles (sprite) ===== */}
          <Group>
            {(Array.isArray(useBattleStore.getState().projectiles)
              ? useBattleStore.getState().projectiles
              : []
            ).map((p) => {
              if (!p || !p.pos || !Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.y)) return null;

              // orientar el sprite hacia el target
              const dx = (p.targetPos?.x ?? p.pos.x) - p.pos.x;
              const dy = (p.targetPos?.y ?? p.pos.y) - p.pos.y;
              const ang = Math.atan2(dy, dx);

               const rot = ang + (p.owner === "enemy" ? Math.PI : 0);
                 const flipX = p.owner === "enemy" ? -1 : 1;

              // tamaño del sprite
              const fw = p.sprite?.meta.frameW ?? 64;
              const fh = p.sprite?.meta.frameH ?? 64;
              const size = Math.max(28, Math.round(Math.max(fw, fh) * 0.9));

              if (!p.sprite) return null; // no sprite -> no dibujar nada

              return (
                <Group
                  key={p.id}
                  transform={
                    [
                      { translateX: p.pos.x },
                      { translateY: p.pos.y },
                      { rotate: rot },
                      { scaleX: flipX },
                      { translateX: -size * 0.5 },
                      { translateY: -size * 0.5 },
                    ] as any
                  }
                >
                  <Sprite
                    source={p.sprite.source}
                    rows={p.sprite.meta.rows ?? 1}
                    cols={p.sprite.meta.cols ?? 1}
                    x={0}
                    y={0}
                    width={size}
                    height={size}
                    fps={p.sprite.meta.fps ?? 12}
                    loop
                  />
                </Group>
              );
            })}
          </Group>

          {/* ===== Slots izquierdos (jugador) ===== */}
          <Group transform={[{ translateX: PADDING_X }, { translateY: boardTop }]}>
            {Array.from({ length: 4 }).map((_, i) => {
              const usableH = boardSize - SLOT_MARGIN_Y * 2;
              const gap = usableH / 5;
              const cx = LEFT_COL_W / 2;
              const cy = SLOT_MARGIN_Y + i * gap;

              const energy = useBattleStore.getState().energy[i] ?? 0;
              const phase = getOwnedPhase(i);
              const lvlByEnergy = levelFromEnergy(energy);
              const lvlAvail = Math.min(lvlByEnergy, phase) as 0 | 1 | 2 | 3 | 4;
              const pct = phase ? Math.min(1, energy / TH[phase - 1]) : 0;

              const sel = useProfileStore.getState().getSelectedArray?.() ?? [];
              const id = sel[i] as string | undefined;
              const asset = id ? SPELL_SPRITES[id] : null;

              return (
                <Group key={`player-slot-${i}`} transform={[{ translateX: 0 }, { translateY: cy }]}>
                  {/* Base slot */}
                  <Circle cx={cx} cy={SLOT_R} r={SLOT_R + 5} color="#0A0E17" />
                  <Circle cx={cx} cy={SLOT_R} r={SLOT_R} color="#1C2433" />
                  <Circle cx={cx} cy={SLOT_R} r={SLOT_R * pct} color={pct >= 1 ? "#65E08E" : "#324257"} />

                  {/* Sprite preview */}
                  {asset && (
                    <Group transform={[{ translateX: cx - 20 }, { translateY: SLOT_R - 20 }] as any}>
                      <Sprite
                        source={asset.source}
                        rows={asset.meta.rows}
                        cols={asset.meta.cols}
                        x={0}
                        y={0}
                        width={40}
                        height={40}
                        fps={asset.meta.fps}
                        loop={false}
                        freezeAtFrame={0}
                      />
                    </Group>
                  )}

                  {/* Nivel disponible */}
                  {fontSmall && (
                    <SkText
                      text={lvlAvail ? `Lv ${lvlAvail}` : `Lv 0`}
                      x={cx - (fontSmall.measureText(lvlAvail ? `Lv ${lvlAvail}` : "Lv 0").width ?? 0) / 2}
                      y={SLOT_R + 5}
                      font={fontSmall}
                      color={lvlAvail ? "#E6F3FF" : "#6B7B95"}
                    />
                  )}
                  {/* Etiqueta */}
                  {fontSmall && (
                    <SkText
                      text={SLOT_LABELS[i]}
                      x={cx - (fontSmall.measureText(SLOT_LABELS[i]).width ?? 0) / 2}
                      y={SLOT_R + 24}
                      font={fontSmall}
                      color="#9FB3D1"
                    />
                  )}
                </Group>
              );
            })}
          </Group>

          {/* ===== Slots derechos (enemigo) ===== */}
          {(() => {
            const RIGHT_PANEL_X = width - PADDING_X - LEFT_COL_W;
            return (
              <Group transform={[{ translateX: RIGHT_PANEL_X }, { translateY: boardTop }]}>
                {Array.from({ length: 4 }).map((_, i) => {
                  const usableH = boardSize - SLOT_MARGIN_Y * 2;
                  const gap = usableH / 5;
                  const cx = LEFT_COL_W / 2;
                  const cy = SLOT_MARGIN_Y + i * gap;

                  const energy = useBattleStore.getState().enemyEnergy?.[i] ?? 0;
                  const phase = getEnemyPhase(i);
                  const lvlByEnergy = levelFromEnergy(energy);
                  const lvlAvail = Math.min(lvlByEnergy, phase) as 0 | 1 | 2 | 3 | 4;
                  const pct = phase ? Math.min(1, energy / TH[phase - 1]) : 0;

                  const id = enemyIds[i];
                  const asset = id ? SPELL_SPRITES[id] : null;

                  return (
                    <Group key={`enemy-slot-${i}`} transform={[{ translateX: 0 }, { translateY: cy }]}>
                      {/* Fondo del slot */}
                      <Circle cx={cx} cy={SLOT_R} r={SLOT_R + 5} color="#0A0E17" />
                      <Circle cx={cx} cy={SLOT_R} r={SLOT_R} color="#2A2331" />

                      {/* Carga de energía (roja para enemigo) */}
                      <Circle cx={cx} cy={SLOT_R} r={SLOT_R * pct} color={pct >= 1 ? "#FF7A7A" : "#4A2E39"} />

                      {/* Sprite preview del hechizo del slot */}
                      {asset && (
                        <Group transform={[{ translateX: cx - 20 }, { translateY: SLOT_R - 20 }] as any}>
                          <Sprite
                            source={asset.source}
                            rows={asset.meta.rows}
                            cols={asset.meta.cols}
                            x={0}
                            y={0}
                            width={40}
                            height={40}
                            fps={asset.meta.fps}
                            loop={false}
                            freezeAtFrame={0}
                          />
                        </Group>
                      )}

                      {/* Nivel disponible */}
                      {fontSmall && (
                        <SkText
                          text={lvlAvail ? `Lv ${lvlAvail}` : `Lv 0`}
                          x={cx - (fontSmall.measureText(lvlAvail ? `Lv ${lvlAvail}` : "Lv 0").width ?? 0) / 2}
                          y={SLOT_R + 5}
                          font={fontSmall}
                          color={lvlAvail ? "#FFE6E6" : "#8A6B72"}
                        />
                      )}

                      {/* Etiqueta (mismas que a la izquierda) */}
                      {fontSmall && (
                        <SkText
                          text={SLOT_LABELS[i]}
                          x={cx - (fontSmall.measureText(SLOT_LABELS[i]).width ?? 0) / 2}
                          y={SLOT_R + 24}
                          font={fontSmall}
                          color="#D8A1A1"
                        />
                      )}
                    </Group>
                  );
                })}
              </Group>
            );
          })()}

          {/* ======= Menú de pausa ======= */}
          {paused && (
            <>
              <RoundedRect x={0} y={0} width={width} height={height} r={0} color="rgba(0,0,0,0.45)" />
              {(() => {
                const MENU_W = 260;
                const MENU_H = 220;
                const X = (width - MENU_W) / 2;
                const Y = height * 0.28;

                const BTN_H = 48;
                const GAPY = 12;

                return (
                  <Group>
                    <RoundedRect x={X} y={Y} width={MENU_W} height={MENU_H} r={18} color="#0F1829" />
                    {font && <SkText text="Pausa" x={X + 18} y={Y + 30} font={font} color="#E6F3FF" />}

                    <RoundedRect x={X + 16} y={Y + 48} width={MENU_W - 32} height={BTN_H} r={12} color="#1F3A5F" />
                    {fontSmall && <SkText text="Continuar" x={X + 28} y={Y + 78} font={fontSmall} color="#E6F3FF" />}

                    <RoundedRect x={X + 16} y={Y + 48 + BTN_H + GAPY} width={MENU_W - 32} height={BTN_H} r={12} color="#2A3E2E" />
                    {fontSmall && (
                      <SkText text="Reiniciar" x={X + 28} y={Y + 78 + BTN_H + GAPY} font={fontSmall} color="#E6F3FF" />
                    )}

                    <RoundedRect
                      x={X + 16}
                      y={Y + 48 + (BTN_H + GAPY) * 2}
                      width={MENU_W - 32}
                      height={BTN_H}
                      r={12}
                      color="#5A2A2A"
                    />
                    {fontSmall && <SkText text="Salir" x={X + 28} y={Y + 78 + (BTN_H + GAPY) * 2} font={fontSmall} color="#E6F3FF" />}
                  </Group>
                );
              })()}
            </>
          )}
        </Canvas>
      </GestureDetector>
      <ResultsOverlay />
    </View>
  );
}
