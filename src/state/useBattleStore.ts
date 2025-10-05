// src/state/useBattleStore.ts
import { create } from "zustand";
import { Dimensions } from "react-native";
import { FixedLoop } from "../engine/loop";
import type { ElementId } from "../game/rps";

import {
  createProjectile,
  stepProjectiles,
  filterAndApplyHits,
  type Projectile,
} from "../game/projectiles";
import { useProfileStore } from "./useProfileStore";
import { useWalletStore } from "./useWalletStore";
import { holdMsToChargeLevel } from "../game/charge";
import { bibixById, type BibixRow } from "../data/registry";

// ================= helpers =================
const SLOT_TO_ELEMENT: ElementId[] = ["fuego", "agua", "tierra", "energia"];

/** Mapeo solicitado (0-based):
 * gem4 -> slot 0, gem0 -> slot 1, gem5 -> slot 2, gem2 -> slot 3
 * gem1 = cura pequeña, gem3 = daño directo pequeño (no cargan slot)
 */
const GEM_TO_SLOT_SPECIAL: Record<number, number | null> = {
  0: 1,
  1: null, // heal
  2: 3,
  3: null, // small direct dmg
  4: 0,
  5: 2,
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

// ELO y recompensas (Normal)
const K_NORMAL = 24;
const expectedScore = (player: number, opp: number) =>
  1 / (1 + Math.pow(10, (opp - player) / 400));

const bracketMul = (elo: number) => {
  if (elo < 900) return 0.9;      // Bronze
  if (elo < 1100) return 1.0;     // Silver
  if (elo < 1300) return 1.15;    // Gold
  if (elo < 1500) return 1.3;     // Platinum
  if (elo < 1700) return 1.45;    // Diamond
  return 1.6;                      // Master
};

type Outcome = "win" | "lose";

export type ResultPayload = {
  outcome: Outcome;
  coins: number;
  xp: number;
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
};

// ======== Hechizos / estados ========
type AnyElement =
  | "fuego" | "agua" | "tierra" | "energia"
  | "aire" | "hielo" | "oscuridad" | "veneno";

const normEl = (s: string | AnyElement): AnyElement => {
  const t = (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  if (t === "energia") return "energia";
  const ok: AnyElement[] = ["fuego","agua","tierra","energia","aire","hielo","oscuridad","veneno"];
  return (ok.includes(t as AnyElement) ? (t as AnyElement) : "fuego");
};

const toCoreElement = (e: AnyElement): ElementId => {
  switch (e) {
    case "hielo": return "agua";
    case "aire": return "energia";
    case "oscuridad": return "tierra";
    case "veneno": return "tierra";
    default: return (e as ElementId);
  }
};

type StackingRule = "stack" | "refresh";

type DotEff = {
  id: string;
  element: AnyElement;
  dps: number;
  remainMs: number;
  stacks: number;
  canStack: boolean;
  maxStacks: number;
};

type RegenEff = { id: string; hps: number; remainMs: number };

type TimedFlag = { until: number; value?: number };

type SideStatus = {
  shieldHp: number;
  shieldUntil: number;
  antiShieldPct: number;     // 0..1
  antiHeal: TimedFlag | null;
  projSlow: TimedFlag | null;
  wet: TimedFlag | null;
  dots: DotEff[];
  regens: RegenEff[];
};

const newStatus = (): SideStatus => ({
  shieldHp: 0,
  shieldUntil: 0,
  antiShieldPct: 0,
  antiHeal: null,
  projSlow: null,
  wet: null,
  dots: [],
  regens: [],
});

// Umbrales por nivel y tope máximo (anillo completo = 45)
const CHARGE_THRESHOLDS = [10, 20, 30, 45] as const;
const MAX_ENERGY = 45;

// ===== Parse de abilities (desde JSON) =====
type ParsedAbility =
  | { kind: "dot"; tag: string; seconds: number; maxStacks: number; stackingRule: StackingRule }
  | { kind: "antishield"; pct: number }
  | { kind: "healInst"; pctMax: number }
  | { kind: "regen"; seconds: number; pctPerSec: number }
  | { kind: "cleanse"; count: number }
  | { kind: "wet"; seconds: number }
  | { kind: "slow_proj"; pct: number; seconds: number }
  | { kind: "antiheal"; pct: number }
  | { kind: "leech_energy"; amount: number };

function parseAbility(s: string): ParsedAbility | null {
  const t = s.toLowerCase().trim();

  if (t.startsWith("dot:")) {
    const rest = t.slice(4);
    const parts = rest.split(",").map(x => x.trim());
    const tag = parts[0] || "dot";
    const sec = parseFloat((parts.find(p => p.endsWith("s")) || "4s").replace("s", "")) || 4;
    const st = parts.find(p => p.startsWith("stack"));
    const maxStacks = st ? Math.max(1, parseInt(st.replace("stack", ""))) : 1;
    return { kind: "dot", tag, seconds: sec, maxStacks, stackingRule: st ? "stack" : "refresh" };
  }

  if (t.startsWith("antishield:")) {
    const pct = (parseFloat(t.replace("antishield:", "").replace("%","")) || 0) / 100;
    return { kind: "antishield", pct: clamp(pct, 0, 0.9) };
  }

  if (t.startsWith("heal:inst")) {
    const p = t.split(",")[1] || "8%max";
    const pct = (parseFloat(p) || 8) / 100;
    return { kind: "healInst", pctMax: clamp(pct, 0, 0.5) };
  }

  if (t.startsWith("regen:")) {
    const parts = t.replace("regen:","").split(",").map(x=>x.trim());
    const sec = parseFloat((parts[0] || "4s").replace("s","")) || 4;
    const pctPerSec = (parseFloat((parts[1] || "2%/s")) || 2) / 100;
    return { kind: "regen", seconds: sec, pctPerSec: clamp(pctPerSec, 0, 0.1) };
  }

  if (t.startsWith("cleanse:")) {
    const n = parseInt(t.replace("cleanse:","")) || 1;
    return { kind: "cleanse", count: Math.max(1, n) };
  }

  if (t.startsWith("wet:")) {
    const sec = parseFloat(t.replace("wet:","").replace("s","")) || 4;
    return { kind: "wet", seconds: sec };
  }

  if (t.startsWith("slow_proj:") || t.startsWith("projectile_slow_rival:")) {
    const raw = t.replace("slow_proj:","").replace("projectile_slow_rival:","");
    const [p1, p2] = raw.split(",").map(x=>x.trim());
    const pct = clamp(((parseFloat((p1||"10%").replace("%",""))||10)/100), 0, 0.9);
    const sec = parseFloat((p2||"2s").replace("s","")) || 2;
    return { kind: "slow_proj", pct, seconds: sec };
  }

  if (t.startsWith("antiheal:")) {
    const pct = clamp(((parseFloat(t.replace("antiheal:","").replace("%",""))||30)/100), 0, 0.9);
    return { kind: "antiheal", pct };
  }

  if (t.startsWith("leech_energy:")) {
    const amount = Math.max(1, parseInt(t.replace("leech_energy:","")) || 4);
    return { kind: "leech_energy", amount };
  }

  return null;
}

function parseAbilities(row: BibixRow): ParsedAbility[] {
  return (row.abilities || []).map(parseAbility).filter(Boolean) as ParsedAbility[];
}

type StackingRuleInfo = { stacking: StackingRule; max: number };
function elementStackingRule(el: AnyElement): StackingRuleInfo {
  switch (el) {
    case "fuego":   return { stacking: "stack",   max: 2 };
    case "veneno":  return { stacking: "stack",   max: 3 };
    case "hielo":
    case "oscuridad":
      return { stacking: "refresh", max: 1 };
    default:
      return { stacking: "refresh", max: 1 };
  }
}

const affinityMul = (el: AnyElement) => {
  const key = el === "energia" ? "energia" : el;
  const m = (useProfileStore.getState().getAffinity as any)?.(key) ?? 1;
  return clamp(m, 0.5, 2.5);
};

// ======== helpers de FASE/SELECCIÓN =========
function getSelectedIdAt(slot: number): string | null {
  const sel = useProfileStore.getState().getSelectedArray?.() ?? [];
  return (sel[slot] ?? null) as string | null;
}
function getOwnedPhaseFor(id: string | null): 0 | 1 | 2 | 3 | 4 {
  if (!id) return 0;
  const phase = useProfileStore.getState().phasesByBibix?.[id] ?? 1;
  const p = Number(phase);
  return (p === 1 || p === 2 || p === 3 || p === 4) ? (p as 1|2|3|4) : 1;
}
function capEnergyForPhase(phase: 0|1|2|3|4): number {
  if (!phase) return 0;
  return CHARGE_THRESHOLDS[phase - 1];
}
function levelFromEnergy(energy: number): 0|1|2|3|4 {
  if (energy >= CHARGE_THRESHOLDS[3]) return 4;
  if (energy >= CHARGE_THRESHOLDS[2]) return 3;
  if (energy >= CHARGE_THRESHOLDS[1]) return 2;
  if (energy >= CHARGE_THRESHOLDS[0]) return 1;
  return 0;
}

type BattleState = {
  // HP (normalizados 0..1) + máximos absolutos
  playerHP: number;
  enemyHP: number;
  playerHPMax: number;
  enemyHPMax: number;

  // Estados
  playerStatus: SideStatus;
  enemyStatus: SideStatus;

  // Energía por slot (0..cap de fase)
  energy: number[];
  energyCost: number;

  // Proyectiles / colisión
  projectiles: Projectile[];
  playerHitX: number;
  enemyHitX: number;

  // Orígenes de disparo (X e Y)
  playerShotX: number;
  enemyShotX: number;
  playerShotY: number; // ✅ nuevo
  enemyShotY: number;  // ✅ nuevo
  setShotOrigins: (px: number, ex: number) => void;
  setShotHeights: (py: number, ey: number) => void; // ✅ nuevo

  // Loop
  _loop: FixedLoop | null;
  fps: 30 | 60;
  tick: number;
  _bump: () => void;

  // Pausa
  paused: boolean;
  openPause: () => void;
  resumeGame: () => void;

  // Resultados
  showResults: boolean;
  result: ResultPayload | null;

  // API tablero→combate
  setImpactLines: (playerX: number, enemyX: number) => void;
  onMatches: (raw: { gem: number; count: number }[]) => void;

  // Disparo jugador
  fireSlot: (i: number, params?: { heldMs?: number; level?: 1 | 2 | 3 | 4 }) => void;

  // Ciclo
  start: () => void;
  stop: () => void;

  // Control de partida
  setMaxHp: (playerMax: number, enemyMax: number) => void;
  resetMatch: () => void;

  // util expuesto
  resetEnergy: () => void;
};

export const useBattleStore = create<BattleState>((set, get) => {
  // ===== helpers internos que mutan estado =====
  const now = () => Date.now();

  const updateHPFields = (side: "player" | "enemy", newAbs: number) => {
    const s = get();
    if (side === "player") {
      set({ playerHP: clamp(newAbs / s.playerHPMax, 0, 1) });
    } else {
      set({ enemyHP: clamp(newAbs / s.enemyHPMax, 0, 1) });
    }
  };

  const applyDamage = (side: "player" | "enemy", rawDmg: number) => {
    const s = get();
    const max = side === "player" ? s.playerHPMax : s.enemyHPMax;
    const curAbs = Math.round((side === "player" ? s.playerHP : s.enemyHP) * max);
    const st = side === "player" ? { ...s.playerStatus } : { ...s.enemyStatus };

    let remain = Math.max(0, Math.round(rawDmg));
    const eff = clamp(1 - (st.antiShieldPct || 0), 0, 1);

    if (st.shieldHp > 0 && st.shieldUntil > now() && eff > 0) {
      const absorb = Math.min(st.shieldHp, Math.round(remain * eff));
      st.shieldHp -= absorb;
      remain -= absorb;
      if (st.shieldHp <= 0) {
        st.shieldHp = 0;
        st.shieldUntil = 0;
      }
    }

    const next = Math.max(0, curAbs - remain);
    if (side === "player") set({ playerStatus: st });
    else set({ enemyStatus: st });

    updateHPFields(side, next);
  };

  const heal = (side: "player" | "enemy", amt: number) => {
    const s = get();
    const max = side === "player" ? s.playerHPMax : s.enemyHPMax;
    const curAbs = Math.round((side === "player" ? s.playerHP : s.enemyHP) * max);
    const st = side === "player" ? s.playerStatus : s.enemyStatus;

    let eff = Math.max(0, Math.round(amt));
    const anti = st.antiHeal;
    if (anti && anti.until > now()) {
      const cut = clamp(anti.value ?? 0.3, 0, 0.9);
      eff = Math.round(eff * (1 - cut));
    }
    const next = clamp(curAbs + eff, 0, max);
    updateHPFields(side, next);
  };

  const applyShield = (side: "player" | "enemy", hp: number, durationMs: number) => {
    const s = get();
    const st = side === "player" ? { ...s.playerStatus } : { ...s.enemyStatus };
    const ts = now() + Math.max(0, durationMs);
    if (hp > st.shieldHp) {
      st.shieldHp = Math.max(0, Math.round(hp));
      st.shieldUntil = ts;
    } else {
      st.shieldUntil = ts;
    }
    if (side === "player") set({ playerStatus: st });
    else set({ enemyStatus: st });
  };

  const addDot = (
    side: "player" | "enemy",
    element: AnyElement,
    tag: string,
    dps: number,
    durationMs: number,
    canStack: boolean,
    maxStacks: number
  ) => {
    const s = get();
    const st = side === "player" ? { ...s.playerStatus } : { ...s.enemyStatus };
    const rule = elementStackingRule(element);
    const ex = st.dots.find(d => d.id === tag);

    if (ex) {
      if (canStack || rule.stacking === "stack") {
        ex.stacks = clamp(ex.stacks + 1, 1, Math.max(maxStacks, rule.max));
        ex.remainMs = Math.max(ex.remainMs, durationMs);
      } else {
        ex.stacks = 1;
        ex.remainMs = durationMs;
        ex.dps = dps;
      }
    } else {
      st.dots.push({
        id: tag,
        element,
        dps,
        remainMs: durationMs,
        stacks: 1,
        canStack: canStack || rule.stacking === "stack",
        maxStacks: Math.max(maxStacks, rule.max),
      });
    }

    if (side === "player") set({ playerStatus: st });
    else set({ enemyStatus: st });
  };

  const addRegen = (side: "player" | "enemy", hps: number, durationMs: number) => {
    const s = get();
    const st = side === "player" ? { ...s.playerStatus } : { ...s.enemyStatus };
    st.regens.push({ id: "regen", hps, remainMs: durationMs });
    if (side === "player") set({ playerStatus: st });
    else set({ enemyStatus: st });
  };

  const cleanse = (side: "player" | "enemy", count: number) => {
    const s = get();
    const st = side === "player" ? { ...s.playerStatus } : { ...s.enemyStatus };
    while (count > 0 && st.dots.length > 0) { st.dots.pop(); count--; }
    if (count > 0) { st.antiHeal = null; count--; }
    if (count > 0) { st.projSlow = null; count--; }
    if (side === "player") set({ playerStatus: st });
    else set({ enemyStatus: st });
  };

  const setWet = (side: "player" | "enemy", ms: number) => {
    const s = get();
    const st = side === "player" ? { ...s.playerStatus } : { ...s.enemyStatus };
    st.wet = { until: now() + ms };
    if (side === "player") set({ playerStatus: st });
    else set({ enemyStatus: st });
  };
  const isWet = (side: "player" | "enemy") => {
    const st = side === "player" ? get().playerStatus : get().enemyStatus;
    return !!(st.wet && st.wet.until > now());
  };

  const setProjSlow = (side: "player" | "enemy", pct: number, ms: number) => {
    const s = get();
    const st = side === "player" ? { ...s.playerStatus } : { ...s.enemyStatus };
    st.projSlow = { until: now() + ms, value: clamp(pct, 0, 0.9) };
    if (side === "player") set({ playerStatus: st });
    else set({ enemyStatus: st });
  };

  const setAntiHeal = (side: "player" | "enemy", pct: number, ms: number) => {
    const s = get();
    const st = side === "player" ? { ...s.playerStatus } : { ...s.enemyStatus };
    st.antiHeal = { until: now() + ms, value: clamp(pct, 0, 0.9) };
    if (side === "player") set({ playerStatus: st });
    else set({ enemyStatus: st });
  };

  const setAntiShield = (side: "player" | "enemy", pct: number) => {
    const s = get();
    const st = side === "player" ? { ...s.playerStatus } : { ...s.enemyStatus };
    st.antiShieldPct = clamp(pct, 0, 0.9);
    if (side === "player") set({ playerStatus: st });
    else set({ enemyStatus: st });
  };

  const tickEffects = (side: "player" | "enemy", dtMs: number) => {
    const s = get();
    const st = side === "player" ? { ...s.playerStatus } : { ...s.enemyStatus };
    const t = now();

    // DoTs
    const dots: DotEff[] = [];
    for (const d of st.dots) {
      const totalDps = d.dps * d.stacks;
      const dmg = (totalDps * dtMs) / 1000;
      if (dmg > 0) applyDamage(side, Math.round(dmg));
      d.remainMs -= dtMs;
      if (d.remainMs > 0) dots.push(d);
    }
    st.dots = dots;

    // Regens
    const regs: RegenEff[] = [];
    for (const r of st.regens) {
      const h = (r.hps * dtMs) / 1000;
      if (h > 0) heal(side, Math.round(h));
      r.remainMs -= dtMs;
      if (r.remainMs > 0) regs.push(r);
    }
    st.regens = regs;

    // Expiraciones
    if (st.shieldUntil && st.shieldUntil <= t) {
      st.shieldHp = 0; st.shieldUntil = 0;
    }
    if (st.projSlow && st.projSlow.until <= t) st.projSlow = null;
    if (st.antiHeal && st.antiHeal.until <= t) st.antiHeal = null;
    if (st.wet && st.wet.until <= t) st.wet = null;

    if (side === "player") set({ playerStatus: st });
    else set({ enemyStatus: st });
  };

  const applySpellFrom = (slotIndex: number, level: 1|2|3|4, _energySpent: number) => {
    const prof = useProfileStore.getState();
    const sel = prof.getSelectedArray?.() ?? [];
    const id = sel[slotIndex];
    if (!id) return;

    const row: BibixRow | undefined = bibixById[id];
    if (!row) return;

    const phase = (prof.phasesByBibix?.[id] ?? 1) as 1 | 2 | 3 | 4;
    const atkFallback = row.base.atk + row.growth.atk * (phase - 1);
    const baseDirect = row.chargeDamage?.[String(level) as "1"|"2"|"3"|"4"] ?? atkFallback;

    const el = normEl(row.element);
    const aff = affinityMul(el);
    const abilities = (row.abilities || []).map(parseAbility).filter(Boolean) as ParsedAbility[];

    const hasShield = !!row.shield;
    const isHealer = abilities.some(a => a.kind==="healInst" || a.kind==="regen" || a.kind==="cleanse");

    if (hasShield) {
      const hpShield = (row.shield?.baseHp ?? 90) + (row.shield?.growthHp ?? 18) * (phase - 1);
      const dur = row.shield?.durationMs ?? 8000;
      applyShield("player", Math.round(hpShield * aff), dur);
    } else if (isHealer) {
      const max = get().playerHPMax;
      let inst = 0;
      abilities.forEach(a => {
        if (a.kind === "healInst") inst += Math.round(max * a.pctMax * aff);
        if (a.kind === "regen") addRegen("player", max * a.pctPerSec * aff, a.seconds * 1000);
        if (a.kind === "cleanse") cleanse("player", a.count);
      });
      if (inst > 0) heal("player", inst);
    } else {
      abilities.forEach(a => {
        switch (a.kind) {
          case "dot": {
            const rule = elementStackingRule(el);
            const durMs = a.seconds * 1000;
            const dotTotal = Math.max(1, Math.round(baseDirect / 0.7)); // burst≈70% del DoT total
            const dps = (dotTotal / a.seconds) * aff;
            addDot("enemy", el, a.tag, dps, durMs, a.stackingRule==="stack" || rule.stacking==="stack", Math.max(a.maxStacks, rule.max));
            break;
          }
          case "wet": setWet("enemy", a.seconds * 1000); break;
          case "slow_proj": setProjSlow("enemy", a.pct, a.seconds * 1000); break;
          case "antiheal": setAntiHeal("enemy", a.pct, 5000); break;
          case "antishield": setAntiShield("enemy", a.pct); break;
          case "leech_energy": {
            const e = [...get().energy];
            let left = a.amount;
            for (let r = 0; r < a.amount; r++) {
              for (let i = 0; i < 4 && left > 0; i++) {
                if (e[i] > 0) { e[i] -= 1; left--; }
              }
            }
            e[slotIndex] = clamp(e[slotIndex] + a.amount, 0, MAX_ENERGY);
            set({ energy: e });
            break;
          }
        }
      });

      // Golpe directo base (se puede modificar por estados)
      let dmg = baseDirect;
      if (el === "agua" && isWet("enemy")) dmg = Math.round(dmg * 1.25);

      // === Orígenes/objetivos desde el UI (TODOS salen del sprite del player) ===
      const width = Dimensions.get("window").width;
      const spawnX = Number.isFinite(get().playerShotX) ? get().playerShotX : 90;
      const spawnY = Number.isFinite(get().playerShotY) ? get().playerShotY : (Dimensions.get("window").height * 0.5);
      const hitX   = Number.isFinite(get().enemyHitX)  ? get().enemyHitX  : width - 60;
      const hitY   = Number.isFinite(get().enemyShotY) ? get().enemyShotY : spawnY;

      const p = createProjectile({
        owner: "player",
        bibixId: id,
        element: toCoreElement(el),
        chargeLevel: level,
        power: Math.max(0, Math.round(dmg)),
        speed: 1.0,
        radius: 12,
        pos: { x: spawnX, y: spawnY },        // ✅ usa Y del sprite del player
        targetPos: { x: hitX, y: hitY },      // ✅ altura objetivo configurable
        lifetime: 650,
      });

      set({ projectiles: [...(get().projectiles ?? []), p] });
    }

    set((s) => ({ tick: (s.tick + 1) & 1023 }));
  };

  // ===== estado inicial =====
  return {
    playerHPMax: 1000,
    enemyHPMax: 1000,
    playerHP: 1,
    enemyHP: 1,

    playerStatus: newStatus(),
    enemyStatus: newStatus(),

    energy: [0, 0, 0, 0],
    energyCost: MAX_ENERGY,

    projectiles: [],
    playerHitX: 60,
    enemyHitX: Dimensions.get("window").width - 60,

    // shot origins (ajustables desde la UI)
    playerShotX: 90,
    enemyShotX: Dimensions.get("window").width - 90,
    playerShotY: Math.round(Dimensions.get("window").height * 0.75), // valor seguro
    enemyShotY: Math.round(Dimensions.get("window").height * 0.25),  // valor seguro
    setShotOrigins: (px: number, ex: number) =>
      set({
        playerShotX: Number.isFinite(px) ? px : 90,
        enemyShotX: Number.isFinite(ex) ? ex : Dimensions.get("window").width - 90,
      }),
    setShotHeights: (py: number, ey: number) =>
      set({
        playerShotY: Number.isFinite(py) ? py : Math.round(Dimensions.get("window").height * 0.5),
        enemyShotY: Number.isFinite(ey) ? ey : Math.round(Dimensions.get("window").height * 0.5),
      }),

    _loop: null,
    fps: 30,
    tick: 0,
    _bump: () => set((s) => ({ tick: (s.tick + 1) & 1023 })),

    paused: false,
    openPause: () => set({ paused: true }),
    resumeGame: () => set({ paused: false }),

    showResults: false,
    result: null,

    setImpactLines: (playerX, enemyX) => set({ playerHitX: playerX, enemyHitX: enemyX }),

    // ====== SUMA energía (cap por fase) + efectos de gem1/gem3 ======
    onMatches: (raw) => {
      const s = get();
      const energies = s.energy.slice();

      for (const r of raw) {
        const g = r.gem % 6;
        const count = Math.max(3, r.count);

        // gem1: curación pequeña
        if (g === 1) {
          const max = s.playerHPMax;
          const pct = clamp(0.02 + (count - 3) * 0.01, 0.01, 0.05); // 3=2%, 4=3%, 5=4% (cap 5%)
          const amt = Math.round(max * pct);
          if (amt > 0) {
            const aff = affinityMul("agua");
            const adj = Math.round(amt * aff);
            (heal as any)("player", adj);
          }
          continue;
        }

        // gem3: daño directo pequeño
        if (g === 3) {
          const max = s.enemyHPMax;
          const pct = clamp(0.015 + (count - 3) * 0.01, 0.01, 0.04); // 3=1.5%, 4=2.5%, 5=3.5% (cap 4%)
          const amt = Math.round(max * pct);
          if (amt > 0) (applyDamage as any)("enemy", amt);
          continue;
        }

        // demás gemas → cargar slot según mapeo especial
        const slot = GEM_TO_SLOT_SPECIAL[g];
        if (slot == null) continue;

        const gain = 6 + Math.min(12, (count - 3) * 4); // 3-> +6, 4-> +10, 5-> +14...
        const id = getSelectedIdAt(slot);
        const phase = getOwnedPhaseFor(id);
        const cap = capEnergyForPhase(phase);
        energies[slot] = clamp((energies[slot] ?? 0) + gain, 0, cap);
      }

      // reclamp global por si cambió la fase/selección en runtime
      for (let i = 0; i < 4; i++) {
        const id = getSelectedIdAt(i);
        const phase = getOwnedPhaseFor(id);
        const cap = capEnergyForPhase(phase);
        energies[i] = clamp(energies[i], 0, cap);
      }

      set({ energy: energies });
    },

    // ====== Disparo jugador (tap en el slot) ======
    fireSlot: (i, params) => {
      const st = get();
      if (st.paused || i < 0 || i > 3) return;

      const selId = getSelectedIdAt(i);
      const ownedPhase = getOwnedPhaseFor(selId); // 0..4
      if (!ownedPhase) return;

      const energy = st.energy?.[i] ?? 0;

      // nivel por energía / hold / override
      let levelByEnergy = levelFromEnergy(energy); // 0..4
      if (params?.heldMs != null) levelByEnergy = holdMsToChargeLevel(params.heldMs) as 1|2|3|4;
      if (params?.level != null) levelByEnergy = params.level;

      const level = Math.min(levelByEnergy, ownedPhase) as 0|1|2|3|4;
      if (!level) return;

      const spend = CHARGE_THRESHOLDS[level - 1];
      if (energy < spend) return;

      const energies = st.energy.slice();
      energies[i] = clamp(energy - spend, 0, capEnergyForPhase(ownedPhase));
      set({ energy: energies });

      applySpellFrom(i, level as 1|2|3|4, spend);
    },

    // ====== loop fijo ======
    start: () => {
      const s0 = get();
      if (s0._loop) return;

      const loop = new FixedLoop({
        fps: s0.fps,
        onUpdate: (dt) => {
          const st = get();
          if (st.paused || st.showResults) return;

          // Slow de proyectiles activo
          let list = (st.projectiles ?? []).map(p => {
            const base = (p as any).speedBase ?? p.speed;
            (p as any).speedBase = base;
            const slowEnemy = get().enemyStatus.projSlow?.value ?? 0; // a proyectiles del ENEMIGO
            const slowPlayer = get().playerStatus.projSlow?.value ?? 0; // a proyectiles del JUGADOR
            const k = p.owner === "enemy" ? (1 - slowEnemy) : (1 - slowPlayer);
            p.speed = Math.max(0.1, base * k);
            return p;
          });

          // 1) Avanza/expira proyectiles
          list = stepProjectiles(list, dt, {
            onHitEnemy: (dmg: number) => applyDamage("enemy", Math.round(dmg)),
            onHitPlayer: (dmg: number) => applyDamage("player", Math.round(dmg)),
          });

          // 2) “pared” por X
          list = filterAndApplyHits(
            list,
            { playerHitX: get().playerHitX, enemyHitX: get().enemyHitX },
            {
              onHitEnemy: (dmg: number) => applyDamage("enemy", Math.round(dmg)),
              onHitPlayer: (dmg: number) => applyDamage("player", Math.round(dmg)),
            }
          );

          // 3) Sanitiza lista
          list = list.filter(
            (p) =>
              p &&
              p.pos &&
              Number.isFinite(p.pos.x) &&
              Number.isFinite(p.pos.y) &&
              p.targetPos &&
              Number.isFinite(p.targetPos.x) &&
              Number.isFinite(p.targetPos.y) &&
              Number.isFinite(p.radius) &&
              Number.isFinite(p.lifetime)
          );
          if (list.length !== st.projectiles.length) set({ projectiles: list });

          // 4) Tick de estados
          tickEffects("player", dt);
          tickEffects("enemy", dt);

          // 5) ¿Fin de partida?
          const pHP = clamp01(get().playerHP);
          const eHP = clamp01(get().enemyHP);
          if (!get().showResults && (eHP <= 0 || pHP <= 0)) {
            const outcome: Outcome = eHP <= 0 && pHP > 0 ? "win" : "lose";
            conclude(outcome);
          }

          get()._bump();
        },
      });

      loop.start();
      set({ _loop: loop });
    },

    stop: () => {
      const s = get();
      s._loop?.stop();
      set({ _loop: null });
    },

    // 👇 FIX: cuando seteas HP máximos (inicio de partida), también limpias energía
    setMaxHp: (playerMax, enemyMax) => {
      const pM = Math.max(1, Math.round(playerMax || 1000));
      const eM = Math.max(1, Math.round(enemyMax || 1000));
      set({
        playerHPMax: pM,
        enemyHPMax: eM,
        playerHP: 1,
        enemyHP: 1,
        playerStatus: newStatus(),
        enemyStatus: newStatus(),
        energy: [0, 0, 0, 0],           // <<< RESET ENERGÍA AQUÍ
      });
    },

    // util expuesto por si lo quieres llamar desde UI
    resetEnergy: () => set({ energy: [0, 0, 0, 0] }),

    resetMatch: () => {
      const s = get();
      s._loop?.stop();
      set({
        energy: [0, 0, 0, 0],
        projectiles: [],
        playerHP: 1,
        enemyHP: 1,
        playerStatus: newStatus(),
        enemyStatus: newStatus(),
        paused: false,
        showResults: false,
        result: null,
        _loop: null,
        tick: (get().tick + 1) & 1023,
      });
      get().start();
    },
  };
});

// ====== concluir partida (aplica XP/coins/ELO y abre overlay) ======
function conclude(outcome: Outcome) {
  const battle = useBattleStore.getState();
  const profile = useProfileStore.getState();
  const wallet = useWalletStore.getState();

  const eloBefore = profile.playerElo ?? 1000;
  const oppElo = eloBefore;
  const exp = expectedScore(eloBefore, oppElo);
  const score = outcome === "win" ? 1 : 0;
  const eloDelta = Math.round(K_NORMAL * (score - exp));
  const eloAfter = clamp(eloBefore + eloDelta, 600, 2400);

  const mul = bracketMul(eloBefore);
  const baseCoins = outcome === "win" ? 80 : 35;
  const coins = Math.round(baseCoins * mul);

  const baseXp = outcome === "win" ? 90 : 45;
  const xp = Math.round(baseXp * 1.0);

  wallet.addCoins(coins);
  profile.setElo(eloAfter);
  profile.addXp(xp);

  battle._loop?.stop();
  useBattleStore.setState({
    _loop: null,
    paused: true,
    showResults: true,
    result: {
      outcome,
      coins,
      xp,
      eloBefore,
      eloAfter,
      eloDelta,
    },
  });
}
