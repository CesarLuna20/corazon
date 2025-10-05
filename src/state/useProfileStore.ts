// src/state/useProfileStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { storage } from "./secureStorage"; // MMKV wrapper

export type BibixId = string;
export type Phase = 1 | 2 | 3 | 4;

type Elemento =
  | "fuego" | "agua" | "tierra" | "energia"
  | "aire" | "hielo" | "oscuridad" | "veneno";

const ELEMENTS: Elemento[] = [
  "fuego", "agua", "tierra", "energia",
  "aire", "hielo", "oscuridad", "veneno",
];

// ===== Curvas / balance =====
const XP_BASE = 100;
const XP_GROWTH = 1.25;
const POINTS_PER_LVL = 3;
const HP_BASE = 1000;         // Vida base del jugador
const HP_PER_POINT = 50;      // +HP por punto invertido
const AFF_STEP = 0.02;        // +2% por punto (1.00 → 1.02 → 1.04 …)
const AFF_MIN = 0.50;         // límites de seguridad
const AFF_MAX = 2.50;

const xpToNext = (lvl: number) =>
  Math.round(XP_BASE * Math.pow(XP_GROWTH, Math.max(0, lvl - 1)));

type ProfileState = {
  // ===== Estado base =====
  playerElo: number;
  ownedBibix: BibixId[];
  selectedBibix: [BibixId | null, BibixId | null, BibixId | null, BibixId | null];
  phasesByBibix: Record<BibixId, Phase>;

  // ===== Onboarding / Perfil =====
  playerName: string | null;
  hasOnboarded: boolean;
  setPlayerName: (name: string) => void;
  setHasOnboarded: (v: boolean) => void;

  // ===== Progresión del jugador principal =====
  playerLevel: number;
  playerXp: number;
  addXp: (amount: number) => {
    level: number; xp: number; toNext: number; leveledUp: boolean; levelsGained: number;
  };

  // ===== Puntos y asignación de stats =====
  playerStatPoints: number;               // puntos sin asignar
  playerHpPoints: number;                 // puntos invertidos en Vida
  affinityMul: Record<Elemento, number>;  // multiplicadores por elemento (1.00 = neutro)

  // Helpers para asignar
  getComputedMaxHp: () => number;
  getAffinity: (el: Elemento) => number;

  allocateHpPoint: (n?: number) => void;                 // resta de available y suma a hpPoints
  allocateAffinityPoint: (el: Elemento, n?: number) => void;

  // ===== Setters originales (conservar nombres) =====
  setElo: (elo: number) => void;
  addOwned: (id: BibixId) => void;
  setSelected: (arr: [BibixId | null, BibixId | null, BibixId | null, BibixId | null]) => void;
  setPhase: (id: BibixId, phase: Phase) => void;

  // ===== Alias “Bibix” =====
  addOwnedBibix: (id: BibixId) => void;
  setSelectedBibix: (arr: [BibixId | null, BibixId | null, BibixId | null, BibixId | null]) => void;
  setPhaseBibix: (id: BibixId, phase: Phase) => void;

  // ===== Helpers =====
  isOwned: (id: BibixId) => boolean;
  isSelected: (id: BibixId) => boolean;
  clearSelected: () => void;
  toggleSelectedBibix: (id: BibixId) => void;
  moveSelectedBibix: (from: number, to: number) => void;
  getSelectedArray: () => BibixId[];
};

const ensureLen4 = (
  arr: (BibixId | null)[]
): [BibixId | null, BibixId | null, BibixId | null, BibixId | null] => {
  const base: (BibixId | null)[] = [null, null, null, null];
  for (let i = 0; i < 4; i++) base[i] = (arr[i] ?? null) as BibixId | null;
  return base as [BibixId | null, BibixId | null, BibixId | null, BibixId | null];
};

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      // ===== Defaults =====
      playerElo: 1000,
      ownedBibix: [],
      selectedBibix: [null, null, null, null],
      phasesByBibix: {},

      // Onboarding / Perfil
      playerName: null,
      hasOnboarded: false,
      setPlayerName: (name: string) => set({ playerName: name }),
      setHasOnboarded: (v: boolean) => set({ hasOnboarded: v }),

      // Progresión
      playerLevel: 1,
      playerXp: 0,
      addXp: (amount: number) => {
        const s = get();
        const gained = Math.max(0, Math.floor(amount || 0));

        let level = s.playerLevel ?? 1;
        let xp = (s.playerXp ?? 0) + gained;
        let leveledUp = false;
        let levelsGained = 0;

        let need = xpToNext(level);
        while (xp >= need) {
          xp -= need;
          level += 1;
          leveledUp = true;
          levelsGained += 1;
          need = xpToNext(level);
        }

        const extraPoints = levelsGained * POINTS_PER_LVL;
        set({
          playerLevel: level,
          playerXp: xp,
          playerStatPoints: (s.playerStatPoints ?? 0) + extraPoints,
        });

        return { level, xp, toNext: need, leveledUp, levelsGained };
      },

      // Puntos y stats
      playerStatPoints: 0,
      playerHpPoints: 0,
      affinityMul: ELEMENTS.reduce((acc, el) => {
        acc[el] = 1.0; // neutral
        return acc;
      }, {} as Record<Elemento, number>),

      getComputedMaxHp: () => {
        const s = get();
        return HP_BASE + (s.playerHpPoints ?? 0) * HP_PER_POINT;
      },
      getAffinity: (el) => {
        const s = get();
        return s.affinityMul[el] ?? 1.0;
      },

      allocateHpPoint: (n = 1) =>
        set((s) => {
          const nClamped = Math.max(0, Math.min(n, s.playerStatPoints));
          if (!nClamped) return {} as Partial<ProfileState>;
          return {
            playerHpPoints: (s.playerHpPoints ?? 0) + nClamped,
            playerStatPoints: s.playerStatPoints - nClamped,
          };
        }),

      allocateAffinityPoint: (el, n = 1) =>
        set((s) => {
          const nClamped = Math.max(0, Math.min(n, s.playerStatPoints));
          if (!nClamped) return {} as Partial<ProfileState>;
          const current = s.affinityMul[el] ?? 1.0;
          const next = Math.max(
            AFF_MIN,
            Math.min(AFF_MAX, +(current + nClamped * AFF_STEP).toFixed(2))
          );
          return {
            affinityMul: { ...s.affinityMul, [el]: next },
            playerStatPoints: s.playerStatPoints - nClamped,
          };
        }),

      // ===== Setters originales =====
      setElo: (elo) => set({ playerElo: Math.max(600, Math.min(2400, Math.round(elo))) }),
      addOwned: (id) =>
        set((s) => ({
          ownedBibix: s.ownedBibix.includes(id) ? s.ownedBibix : [...s.ownedBibix, id],
          phasesByBibix: s.phasesByBibix[id] ? s.phasesByBibix : { ...s.phasesByBibix, [id]: 1 },
        })),
      setSelected: (arr) => set({ selectedBibix: ensureLen4(arr) }),
      setPhase: (id, phase) =>
        set((s) => ({
          phasesByBibix: { ...s.phasesByBibix, [id]: Math.max(1, Math.min(4, phase)) as Phase },
        })),

      // ===== Alias “Bibix” =====
      addOwnedBibix: (id) => get().addOwned(id),
      setSelectedBibix: (arr) => get().setSelected(ensureLen4(arr)),
      setPhaseBibix: (id, phase) => get().setPhase(id, phase),

      // ===== Helpers =====
      isOwned: (id) => get().ownedBibix.includes(id),
      isSelected: (id) => get().selectedBibix.includes(id),
      clearSelected: () => set({ selectedBibix: [null, null, null, null] }),
      toggleSelectedBibix: (id) => {
        const s = get();
        const idx = s.selectedBibix.findIndex((x) => x === id);
        if (idx >= 0) {
          const next = [...s.selectedBibix] as (BibixId | null)[];
          next[idx] = null;
          set({ selectedBibix: ensureLen4(next) });
        } else {
          const next = [...s.selectedBibix] as (BibixId | null)[];
          const empty = next.findIndex((x) => x === null);
          if (empty >= 0) {
            next[empty] = id;
            set({ selectedBibix: ensureLen4(next) });
          }
        }
      },
      moveSelectedBibix: (from, to) => {
        const s = get();
        if (from === to || from < 0 || from > 3 || to < 0 || to > 3) return;
        const next = [...s.selectedBibix] as (BibixId | null)[];
        const tmp = next[from];
        next[from] = next[to];
        next[to] = tmp;
        set({ selectedBibix: ensureLen4(next) });
      },
      getSelectedArray: () => get().selectedBibix.filter(Boolean) as BibixId[],
    }),
    {
      name: "profile-store",
      storage: createJSONStorage(() => storage),
      version: 2,
      partialize: (state) => ({
        playerElo: state.playerElo,
        ownedBibix: state.ownedBibix,
        selectedBibix: state.selectedBibix,
        phasesByBibix: state.phasesByBibix,

        // persist nuevos
        playerName: state.playerName,
        hasOnboarded: state.hasOnboarded,

        // progreso
        playerLevel: state.playerLevel,
        playerXp: state.playerXp,
        playerStatPoints: state.playerStatPoints,
        playerHpPoints: state.playerHpPoints,
        affinityMul: state.affinityMul,
      }),
    }
  )
);
