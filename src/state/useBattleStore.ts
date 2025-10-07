// src/state/useBattleStore.ts
import { create } from "zustand";
import { Dimensions } from "react-native";
import { FixedLoop } from "../engine/loop";
import { compareElements, type ElementId } from "../game/rps";

import {
  createProjectile,
  stepProjectiles,
  filterAndApplyHits,
  resolveMidAirCollisions,
  type Projectile,
} from "../game/projectiles";

import { useProfileStore } from "./useProfileStore";
import { useWalletStore } from "./useWalletStore";
import { holdMsToChargeLevel } from "../game/charge";

import { bibixById, registryIds, type BibixRow } from "../data/registry";
import { SPELL_SPRITES } from "../data/spellsSprites";

// ================= helpers =================
const SLOT_TO_ELEMENT: ElementId[] = ["fuego", "agua", "tierra", "energia"];

/** Mapeo especial de gemas → slots jugador (0-based):
 * gem4 -> slot 0, gem0 -> slot 1, gem5 -> slot 2, gem2 -> slot 3
 * gem1 = cura pequeña, gem3 = daño directo pequeño (no cargan slot)
 */
const GEM_TO_SLOT_SPECIAL: Record<number, number | null> = {
  0: 1,
  1: null, // heal
  2: 3,
  3: null, // direct small dmg
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
  if (elo < 900) return 0.9;
  if (elo < 1100) return 1.0;
  if (elo < 1300) return 1.15;
  if (elo < 1500) return 1.3;
  if (elo < 1700) return 1.45;
  return 1.6;
};

type Outcome = "win" | "lose";

// ======== Hechizos / estados ========
type AnyElement =
  | "fuego" | "agua" | "tierra" | "energia" | "energía"
  | "aire" | "hielo" | "oscuridad" | "veneno";

const normEl = (s: string | AnyElement): Exclude<AnyElement, "energía"> => {
  const t = (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const val = (t === "energia" ? "energia" : t) as AnyElement;
  const ok: Exclude<AnyElement, "energía">[] = ["fuego","agua","tierra","energia","aire","hielo","oscuridad","veneno"];
  return (ok.includes(val as any) ? (val as any) : "fuego");
};

const toCoreElement = (e: AnyElement): ElementId => {
  const x = normEl(e);
  switch (x) {
    case "hielo": return "agua";
    case "aire": return "energia";
    case "oscuridad": return "tierra";
    case "veneno": return "tierra";
    default: return x as ElementId;
  }
};

type StackingRule = "stack" | "refresh";
type DotEff = { id: string; element: AnyElement; dps: number; remainMs: number; stacks: number; canStack: boolean; maxStacks: number; };
type RegenEff = { id: string; hps: number; remainMs: number };
type TimedFlag = { until: number; value?: number };
type SideStatus = {
  shieldHp: number;
  shieldUntil: number;
  antiShieldPct: number;
  antiHeal: TimedFlag | null;
  projSlow: TimedFlag | null;
  wet: TimedFlag | null;
  dots: DotEff[];
  regens: RegenEff[];
};
const newStatus = (): SideStatus => ({
  shieldHp: 0, shieldUntil: 0, antiShieldPct: 0,
  antiHeal: null, projSlow: null, wet: null, dots: [], regens: [],
});

// Umbrales por nivel y tope máximo
const CHARGE_THRESHOLDS = [10, 20, 30, 45] as const;
const MAX_ENERGY = 45;

// ===== Parse abilities =====
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
    const rest = t.slice(4); const parts = rest.split(",").map(x => x.trim());
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
  const n = normEl(el);
  switch (n) {
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
  const key = normEl(el);
  const m = (useProfileStore.getState().getAffinity as any)?.(key) ?? 1;
  return clamp(m, 0.5, 2.5);
};

// ======== helpers de FASE/SELECCIÓN (Jugador) =========
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

// ======== IA: helpers de loadout enemigo =========
function randomEnemyLoadout(): string[] {
  const pool = registryIds.filter(id => !!SPELL_SPRITES[id]);
  const out: string[] = [];
  const bag = [...pool];
  while (out.length < 4 && bag.length) {
    const i = Math.floor(Math.random() * bag.length);
    out.push(bag.splice(i, 1)[0]);
  }
  while (out.length < 4) out.push("bola_fuego"); // fallback si faltan assets
  return out;
}
function enemySelectedIdAt(slot: number): string | null {
  const ids = useBattleStore.getState().enemyLoadout || [];
  return (ids[slot] ?? null) as string | null;
}
function enemyOwnedPhaseFor(id: string | null): 0|1|2|3|4 {
  return id ? 4 : 0; // el rival siempre puede castear hasta Lv4
}

// ======== Store principal =========
export type ResultPayload = {
  outcome: Outcome;
  coins: number;
  xp: number;
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
};

type BattleState = {
  // HP (normalizados 0..1) + máximos
  playerHP: number;
  enemyHP: number;
  playerHPMax: number;
  enemyHPMax: number;

  // Estados
  playerStatus: SideStatus;
  enemyStatus: SideStatus;

  // Energía jugador
  energy: number[];
  energyCost: number;

  // Proyectiles / colisión
  projectiles: Projectile[];
  playerHitX: number;
  enemyHitX: number;

  // Orígenes de disparo (X e Y)
  playerShotX: number; enemyShotX: number;
  playerShotY: number; enemyShotY: number;
  setShotOrigins: (px: number, ex: number) => void;
  setShotHeights: (py: number, ey: number) => void;

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

  // === IA enemigo ===
  enemyLoadout: string[];         // 4 ids
  enemyEnergy: number[];          // energía de 4 slots
  enemyCooldowns: number[];       // ms restantes de cooldown por slot
  _lastEnemyCastAt: number;       // timestamp último cast enemigo
  _minEnemyCastIntervalMs: number;// intervalo global mínimo entre hechizos
  setEnemyLoadout: (ids: string[]) => void;
};

export const useBattleStore = create<BattleState>((set, get) => {
  // ===== helpers internos =====
  const now = () => Date.now();

  const updateHPFields = (side: "player" | "enemy", newAbs: number) => {
    const s = get();
    if (side === "player") set({ playerHP: clamp(newAbs / s.playerHPMax, 0, 1) });
    else set({ enemyHP: clamp(newAbs / s.enemyHPMax, 0, 1) });
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
      if (st.shieldHp <= 0) { st.shieldHp = 0; st.shieldUntil = 0; }
    }

    const next = Math.max(0, Math.round(curAbs - remain));
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
    if (hp > st.shieldHp) { st.shieldHp = Math.max(0, Math.round(hp)); st.shieldUntil = ts; }
    else { st.shieldUntil = ts; }
    if (side === "player") set({ playerStatus: st }); else set({ enemyStatus: st });
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
        ex.stacks = 1; ex.remainMs = durationMs; ex.dps = dps;
      }
    } else {
      st.dots.push({
        id: tag, element, dps, remainMs: durationMs,
        stacks: 1, canStack: canStack || rule.stacking === "stack",
        maxStacks: Math.max(maxStacks, rule.max),
      });
    }
    if (side === "player") set({ playerStatus: st }); else set({ enemyStatus: st });
  };

  const addRegen = (side: "player" | "enemy", hps: number, durationMs: number) => {
    const s = get();
    const st = side === "player" ? { ...s.playerStatus } : { ...s.enemyStatus };
    st.regens.push({ id: "regen", hps, remainMs: durationMs });
    if (side === "player") set({ playerStatus: st }); else set({ enemyStatus: st });
  };

  const cleanse = (side: "player" | "enemy", count: number) => {
    const s = get();
    const st = side === "player" ? { ...s.playerStatus } : { ...s.enemyStatus };
    while (count > 0 && st.dots.length > 0) { st.dots.pop(); count--; }
    if (count > 0) { st.antiHeal = null; count--; }
    if (count > 0) { st.projSlow = null; count--; }
    if (side === "player") set({ playerStatus: st }); else set({ enemyStatus: st });
  };

  const setWet = (side: "player" | "enemy", ms: number) => {
    const s = get();
    const st = side === "player" ? { ...s.playerStatus } : { ...s.enemyStatus };
    st.wet = { until: now() + ms };
    if (side === "player") set({ playerStatus: st }); else set({ enemyStatus: st });
  };
  const isWet = (side: "player" | "enemy") => {
    const st = side === "player" ? get().playerStatus : get().enemyStatus;
    return !!(st.wet && st.wet.until > now());
  };

  const setProjSlow = (side: "player" | "enemy", pct: number, ms: number) => {
    const s = get();
    const st = side === "player" ? { ...s.playerStatus } : { ...s.enemyStatus };
    st.projSlow = { until: now() + ms, value: clamp(pct, 0, 0.9) };
    if (side === "player") set({ playerStatus: st }); else set({ enemyStatus: st });
  };
  const setAntiHeal = (side: "player" | "enemy", pct: number, ms: number) => {
    const s = get();
    const st = side === "player" ? { ...s.playerStatus } : { ...s.enemyStatus };
    st.antiHeal = { until: now() + ms, value: clamp(pct, 0, 0.9) };
    if (side === "player") set({ playerStatus: st }); else set({ enemyStatus: st });
  };
  const setAntiShield = (side: "player" | "enemy", pct: number) => {
    const s = get();
    const st = side === "player" ? { ...s.playerStatus } : { ...s.enemyStatus };
    st.antiShieldPct = clamp(pct, 0, 0.9);
    if (side === "player") set({ playerStatus: st }); else set({ enemyStatus: st });
  };

  // ===== tick de efectos =====
  const tickEffects = (side: "player" | "enemy", dtMs: number) => {
    const st = side === "player" ? { ...get().playerStatus } : { ...get().enemyStatus };
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
    if (st.shieldUntil && st.shieldUntil <= t) { st.shieldHp = 0; st.shieldUntil = 0; }
    if (st.projSlow && st.projSlow.until <= t) st.projSlow = null;
    if (st.antiHeal && st.antiHeal.until <= t) st.antiHeal = null;
    if (st.wet && st.wet.until <= t) st.wet = null;

    if (side === "player") set({ playerStatus: st });
    else set({ enemyStatus: st });
  };

  // ===== CAST jugador =====
  const applySpellFrom = (slotIndex: number, level: 1|2|3|4, _energySpent: number) => {
    const prof = useProfileStore.getState();
    const sel = prof.getSelectedArray?.() ?? [];
    const id = sel[slotIndex];
    if (!id) return;

    const row: BibixRow | undefined = bibixById[id];
    if (!row) return;

    const phase = (prof.phasesByBibix?.[id] ?? 1) as 1 | 2 | 3 | 4;
    const atkFallback = (row.base.atk ?? 0) + (row.growth.atk ?? 0) * (phase - 1);
    const baseDirect =
      (row.chargeDamage?.[String(level) as "1"|"2"|"3"|"4"] ?? atkFallback);

    const el = normEl(row.element as AnyElement);
    const aff = affinityMul(el);
    const abilities = parseAbilities(row);

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
            const dotTotal = Math.max(1, Math.round(baseDirect / 0.7));
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

      // Daño directo con sinergias
      let dmg = baseDirect;
      if (normEl(el) === "agua" && isWet("enemy")) dmg = Math.round(dmg * 1.25);

      // Orígenes/targets desde UI
      const width = Dimensions.get("window").width;
      const spawnX = Number.isFinite(get().playerShotX) ? get().playerShotX : 90;
      const spawnY = Number.isFinite(get().playerShotY) ? get().playerShotY : (Dimensions.get("window").height * 0.5);
      const hitX   = Number.isFinite(get().enemyHitX)  ? get().enemyHitX  : width - 60;

      const sprite = SPELL_SPRITES[id] ?? null;
      const effSpeedMul = Math.max(0.5, (row.base.speed ?? 1) + (row.growth.speed ?? 0) * (phase - 1));

      const p = createProjectile({
        owner: "player",
        bibixId: id,
        element: toCoreElement(el),
        chargeLevel: level,
        power: Math.max(0, Math.round(dmg)),
        speed: effSpeedMul,
        radius: 12,
        pos: { x: spawnX, y: spawnY },
        targetPos: { x: hitX, y: spawnY },
        sprite,
      });

      set({ projectiles: [...(get().projectiles ?? []), p] });
    }
    set((s) => ({ tick: (s.tick + 1) & 1023 }));
  };

  // ===== CAST enemigo (IA) =====
  const enemyApplySpellFrom = (slotIndex: number, level: 1|2|3|4) => {
    const id = enemySelectedIdAt(slotIndex);
    if (!id) return;
    const row = bibixById[id];
    if (!row) return;

    const el = normEl(row.element as AnyElement);
    const aff = affinityMul(el); // o 1.0 si no quieres afinidad enemiga
    const abilities = parseAbilities(row);
    const phase: 1|2|3|4 = 4;

    const atkFallback = (row.base.atk ?? 0) + (row.growth.atk ?? 0) * (phase - 1);
    const baseDirect =
      (row.chargeDamage?.[String(level) as "1"|"2"|"3"|"4"] ?? atkFallback);

    const width = Dimensions.get("window").width;
    const spawnX = Number.isFinite(get().enemyShotX) ? get().enemyShotX : (width - 90);
    const spawnY = Number.isFinite(get().enemyShotY) ? get().enemyShotY : Math.round(Dimensions.get("window").height * 0.5);
    const hitX   = Number.isFinite(get().playerHitX) ? get().playerHitX : 60;

    const hasShield = !!row.shield;
    const isHealer = abilities.some(a => a.kind==="healInst" || a.kind==="regen" || a.kind==="cleanse");

    if (hasShield) {
      const hpShield = (row.shield?.baseHp ?? 90) + (row.shield?.growthHp ?? 18) * (phase - 1);
      const dur = row.shield?.durationMs ?? 8000;
      applyShield("enemy", Math.round(hpShield * aff), dur);
      return;
    }
    if (isHealer) {
      const max = get().enemyHPMax;
      let inst = 0;
      abilities.forEach(a => {
        if (a.kind==="healInst") inst += Math.round(max * a.pctMax * aff);
        if (a.kind==="regen") addRegen("enemy", max * a.pctPerSec * aff, a.seconds * 1000);
        if (a.kind==="cleanse") cleanse("enemy", a.count);
      });
      if (inst > 0) heal("enemy", inst);
      return;
    }

    abilities.forEach(a => {
      switch (a.kind) {
        case "dot": {
          const rule = elementStackingRule(el);
          const durMs = a.seconds * 1000;
          const dotTotal = Math.max(1, Math.round(baseDirect / 0.7));
          const dps = (dotTotal / a.seconds) * aff;
          addDot("player", el, a.tag, dps, durMs, a.stackingRule==="stack" || rule.stacking==="stack", Math.max(a.maxStacks, rule.max));
          break;
        }
        case "wet": setWet("player", a.seconds * 1000); break;
        case "slow_proj": setProjSlow("player", a.pct, a.seconds * 1000); break;
        case "antiheal": setAntiHeal("player", a.pct, 5000); break;
        case "antishield": setAntiShield("player", a.pct); break;
      }
    });

    let dmg = baseDirect;
    if (normEl(el) === "agua" && isWet("player")) dmg = Math.round(dmg * 1.25);

    const sprite = SPELL_SPRITES[id] ?? null;
    const effSpeedMul = Math.max(0.5, (row.base.speed ?? 1) + (row.growth.speed ?? 0) * (phase - 1));

    const p = createProjectile({
      owner: "enemy",
      bibixId: id,
      element: toCoreElement(el),
      chargeLevel: level,
      power: Math.max(0, Math.round(dmg)),
      speed: effSpeedMul,
      radius: 12,
      pos: { x: spawnX, y: spawnY },
      targetPos: { x: hitX, y: spawnY },
      sprite,
    });

    set({ projectiles: [...(get().projectiles ?? []), p] });
    set((s) => ({ tick: (s.tick + 1) & 1023 }));
  };

  const enemyFireSlot = (i: number) => {
    if (i < 0 || i > 3) return;
    const id = enemySelectedIdAt(i);
    const ownedPhase = enemyOwnedPhaseFor(id);
    if (!ownedPhase) return;

    const e = get().enemyEnergy.slice();
    const cds = get().enemyCooldowns.slice();
    const energy = e[i] ?? 0;

    let level = levelFromEnergy(energy); // 0..4
    level = Math.min(level, ownedPhase) as 0|1|2|3|4;
    if (!level) return;

    const spend = CHARGE_THRESHOLDS[level - 1];
    if (energy < spend) return;

    // aplica gasto y cooldown
    e[i] = clamp(energy - spend, 0, capEnergyForPhase(ownedPhase));
    set({ enemyEnergy: e });

    enemyApplySpellFrom(i, level as 1|2|3|4);

    // Cooldown por nivel (ms)
    const cdMs = [0, 800, 1100, 1500, 1900][level];
    cds[i] = Math.max(cdMs, cds[i] || 0);
    set({ enemyCooldowns: cds, _lastEnemyCastAt: now() });
  };

  // ===== estado inicial =====
  return {
    playerHPMax: 1000, enemyHPMax: 1000,
    playerHP: 1, enemyHP: 1,

    playerStatus: newStatus(),
    enemyStatus: newStatus(),

    energy: [0, 0, 0, 0],
    energyCost: MAX_ENERGY,

    projectiles: [],
    playerHitX: 60,
    enemyHitX: Dimensions.get("window").width - 60,

    playerShotX: 90,
    enemyShotX: Dimensions.get("window").width - 90,
    playerShotY: Math.round(Dimensions.get("window").height * 0.75),
    enemyShotY: Math.round(Dimensions.get("window").height * 0.25),
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

    // === IA fields ===
    enemyLoadout: randomEnemyLoadout(),
    enemyEnergy: [0, 0, 0, 0],
    enemyCooldowns: [0, 0, 0, 0],
    _lastEnemyCastAt: 0,
    _minEnemyCastIntervalMs: 950, // intervalo global mínimo entre casts
    setEnemyLoadout: (ids) => set({ enemyLoadout: (ids?.length === 4 ? ids : []) }),

    setImpactLines: (playerX, enemyX) => set({ playerHitX: playerX, enemyHitX: enemyX }),

    // ====== Sumar energía jugador + efectos gem1/gem3 ======
    onMatches: (raw) => {
      const s = get();
      const energies = s.energy.slice();

      for (const r of raw) {
        const g = r.gem % 6;
        const count = Math.max(3, r.count);

        if (g === 1) { // heal pequeña
          const max = s.playerHPMax;
          const pct = clamp(0.02 + (count - 3) * 0.01, 0.01, 0.05);
          const amt = Math.round(max * pct);
          if (amt > 0) {
            const aff = affinityMul("agua");
            const adj = Math.round(amt * aff);
            (heal as any)("player", adj);
          }
          continue;
        }
        if (g === 3) { // daño directo pequeño
          const max = s.enemyHPMax;
          const pct = clamp(0.015 + (count - 3) * 0.01, 0.01, 0.04);
          const amt = Math.round(max * pct);
          if (amt > 0) (applyDamage as any)("enemy", amt);
          continue;
        }

        const slot = GEM_TO_SLOT_SPECIAL[g];
        if (slot == null) continue;

        const gain = 6 + Math.min(12, (count - 3) * 4);
        const id = getSelectedIdAt(slot);
        const phase = getOwnedPhaseFor(id);
        const cap = capEnergyForPhase(phase);
        energies[slot] = clamp((energies[slot] ?? 0) + gain, 0, cap);
      }

      // reclamp por si cambió fase/selección
      for (let i = 0; i < 4; i++) {
        const id = getSelectedIdAt(i);
        const phase = getOwnedPhaseFor(id);
        const cap = capEnergyForPhase(phase);
        energies[i] = clamp(energies[i], 0, cap);
      }

      set({ energy: energies });
    },

    // ====== Disparo jugador ======
    fireSlot: (i, params) => {
      const st = get();
      if (st.paused || i < 0 || i > 3) return;

      const selId = getSelectedIdAt(i);
      const ownedPhase = getOwnedPhaseFor(selId);
      if (!ownedPhase) return;

      const energy = st.energy?.[i] ?? 0;

      let levelByEnergy = levelFromEnergy(energy);
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

      // seed del loadout enemigo si falta
      if (!s0.enemyLoadout || s0.enemyLoadout.length !== 4) {
        set({ enemyLoadout: randomEnemyLoadout(), enemyEnergy: [0,0,0,0] });
      }

      // ===== IA variables internas (no estado global para evitar renders) =====
      type AIMode = "buildUp" | "poke" | "burst" | "panic";
      let aiMode: AIMode = "buildUp";
      let aiModeTimerMs = 3500 + Math.random()*1500;
      let reactionDelayMs = 350 + Math.random()*350; // hesitación humana
      let focusSlot = Math.floor(Math.random() * 4);
      let focusTimerMs = 2500 + Math.random()*1500;

      const pickNewFocus = () => {
        focusSlot = Math.floor(Math.random() * 4);
        focusTimerMs = 2200 + Math.random()*1800;
      };

      // acumulador de segundos (robusto a dt)
      let enemyEnergySecondsAcc = 0;

      const loop = new FixedLoop({
        fps: s0.fps,
        onUpdate: (dtRaw) => {
          const st = get();
          if (st.paused || st.showResults) return;

          // normalizamos dt a milisegundos
          const dtMs = dtRaw > 5 ? dtRaw : dtRaw * 1000;
          const dtSec = dtMs / 1000;

          // Ajustes de slow/haste a los proyectiles
          let list = (st.projectiles ?? []).map(p => {
            const base = (p as any).speedBase > 0 ? (p as any).speedBase : p.speed;
            const slowEnemy = get().enemyStatus.projSlow?.value ?? 0; // proyectiles del ENEMIGO
            const slowPlayer = get().playerStatus.projSlow?.value ?? 0; // proyectiles del JUGADOR
            const k = p.owner === "enemy" ? (1 - slowEnemy) : (1 - slowPlayer);
            const nextSpeed = Math.max(0.05, base * k);
            return { ...p, speed: nextSpeed, speedBase: base } as Projectile & { speedBase?: number };
          });

          // 1) Avanza/expira proyectiles (en ms)
          list = stepProjectiles(list, dtMs, {
            onHitEnemy: (dmg: number) => applyDamage("enemy", Math.round(dmg)),
            onHitPlayer: (dmg: number) => applyDamage("player", Math.round(dmg)),
          });

          // 1.5) Choques en el aire (RPS)
          list = resolveMidAirCollisions(list, (a, b) => compareElements(a as any, b as any));

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
              p.pos && Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y) &&
              p.targetPos && Number.isFinite(p.targetPos.x) && Number.isFinite(p.targetPos.y) &&
              Number.isFinite(p.radius) && Number.isFinite(p.lifetime)
          );

          set({ projectiles: list });

          // 4) Tick de estados (en ms)
          tickEffects("player", dtMs);
          tickEffects("enemy", dtMs);

          // ===== IA ENEMIGA: energía + decisión divertida =====

          // enfriar cooldowns por slot
          {
            const cds = get().enemyCooldowns.slice();
            for (let i = 0; i < 4; i++) cds[i] = Math.max(0, (cds[i] ?? 0) - dtMs);
            set({ enemyCooldowns: cds });
          }

          // escalado leve por ELO
          const elo = useProfileStore.getState().playerElo ?? 1000;
          const eloMul = Math.min(1.30, Math.max(0.85, 1 + (elo - 1000) / 3500));

          // base de carga por segundo (más tranquilo que 12)
          const BASE_GAIN_PER_SEC = 2; // antes 12
          const GAIN_PER_SEC = BASE_GAIN_PER_SEC * eloMul;

          // rotación de foco
          focusTimerMs -= dtMs;
          if (focusTimerMs <= 0) pickNewFocus();

          // sumador
          enemyEnergySecondsAcc += dtSec * GAIN_PER_SEC;

          // Reparto aleatorio (no a todos a la vez):
          // 70% va al focusSlot, 30% se divide en 0–1 slots aleatorios
          {
            const ee = (get().enemyEnergy.slice() || [0,0,0,0]);
            const totalGain = dtSec * GAIN_PER_SEC;

            // pequeño jitter para que no sea constante
            const jitter = (Math.random() * 0.3 + 0.85);
            const gainFocus = totalGain * 0.7 * jitter;
            const gainRest = totalGain - gainFocus;

            const applyGain = (idx: number, g: number) => {
              const id = enemySelectedIdAt(idx);
              const phase = enemyOwnedPhaseFor(id);
              const cap = capEnergyForPhase(phase);
              ee[idx] = clamp((ee[idx] ?? 0) + g, 0, cap);
            };

            applyGain(focusSlot, gainFocus);

            const restSlots = [0,1,2,3].filter(i => i !== focusSlot);
            // decide si reparte a 1 slot al azar o ninguno
            if (gainRest > 0 && Math.random() < 0.9) {
              const pick = restSlots[Math.floor(Math.random() * restSlots.length)];
              applyGain(pick, gainRest);
            }

            set({ enemyEnergy: ee });
          }

          // máquina de estados de la IA para hacerlo entretenido
          aiModeTimerMs -= dtMs;
          const pHP = clamp01(get().playerHP);
          const eHP = clamp01(get().enemyHP);

          // cambios por HP
          if (eHP < 0.25 && aiMode !== "panic") { aiMode = "panic"; aiModeTimerMs = 2400 + Math.random()*1200; }
          else if (aiMode !== "panic" && aiModeTimerMs <= 0) {
            // rotación natural
            const roll = Math.random();
            if (roll < 0.35) aiMode = "buildUp";
            else if (roll < 0.7) aiMode = "poke";
            else aiMode = "burst";
            aiModeTimerMs = 2800 + Math.random()*1800;
          }

          // reacción humana (no dispara justo al umbral)
          reactionDelayMs = Math.max(0, reactionDelayMs - dtMs);

          // gating global
          const sinceLast = now() - (get()._lastEnemyCastAt || 0);
          const globalReady = sinceLast >= get()._minEnemyCastIntervalMs;

          // si aún está en "reacción", no decide este frame
          if (reactionDelayMs <= 0 && globalReady) {
            // re-arma la reacción para la siguiente vez (aleatorio)
            reactionDelayMs = 300 + Math.random()*400;

            // orden de prioridad: el foco primero, luego quien tenga mayor nivel
            const ee = get().enemyEnergy.slice();
            const order = [focusSlot, ...[0,1,2,3].filter(i=>i!==focusSlot)]
              .sort((a,b) => levelFromEnergy(ee[b]||0) - levelFromEnergy(ee[a]||0));

            const cds = get().enemyCooldowns.slice();

            // decisión por modo
            let fired = false;
            for (const i of order) {
              const id = enemySelectedIdAt(i);
              if (!id) continue;

              const phase = enemyOwnedPhaseFor(id);
              const energy = ee[i] ?? 0;
              let lvl = levelFromEnergy(energy);
              lvl = Math.min(lvl, phase) as 0|1|2|3|4;
              if (!lvl) continue;

              // cooldown por slot
              if ((cds[i] || 0) > 0) continue;

              // no tires apenas cruces umbral: pide un buffer extra de energía
              const spend = CHARGE_THRESHOLDS[lvl - 1];
              const buffer = 2.5 + Math.random()*3; // requiere un pelín más
              if (energy < spend + buffer) continue;

              // Política de tiro por modo (probabilidades de esperar a subir nivel):
              // buildUp: prefiere esperar a niveles altos
              // poke: prefiere niveles 1-2
              // burst: si tiene 3-4 los usa; si no, dispara 2 con más prob.
              // panic: reduce intervalos, acepta niveles bajos con más frecuencia
              let shoot = false;
              switch (aiMode) {
                case "buildUp": {
                  // 60% espera si no es 4; 40% dispara si ≥3
                  if (lvl === 4) shoot = true;
                  else if (lvl >= 3) shoot = Math.random() < 0.4;
                  else shoot = Math.random() < 0.15;
                  break;
                }
                case "poke": {
                  // Tira 1-2 con facilidad, 3 ocasional, 4 raramente (prefiere guardarlo)
                  if (lvl <= 2) shoot = Math.random() < 0.75;
                  else if (lvl === 3) shoot = Math.random() < 0.5;
                  else shoot = Math.random() < 0.25;
                  break;
                }
                case "burst": {
                  // Si llegó 4 suelta; si 3 también; 1-2 sólo si acumula
                  if (lvl >= 3) shoot = true;
                  else shoot = Math.random() < 0.35;
                  break;
                }
                case "panic": {
                  // Más agresivo pero no spam: se apoya en global interval + cd slot
                  if (lvl >= 2) shoot = Math.random() < 0.85;
                  else shoot = Math.random() < 0.55;
                  break;
                }
              }

              if (!shoot) continue;

              // dispara
              enemyFireSlot(i);
              fired = true;
              break;
            }

            // bonus: en burst, a veces encadena dos tiros en frames cercanos
            if (fired && aiMode === "burst" && Math.random() < 0.35) {
              // reduce el intervalo global para permitir un follow-up pronto
              set({ _minEnemyCastIntervalMs: 700 + Math.round(Math.random()*150) });
            } else {
              set({ _minEnemyCastIntervalMs: 950 }); // default
            }
          }

          // 5) ¿Fin de partida?
          const pHP2 = clamp01(get().playerHP);
          const eHP2 = clamp01(get().enemyHP);
          if (!get().showResults && (eHP2 <= 0 || pHP2 <= 0)) {
            const outcome: Outcome = eHP2 <= 0 && pHP2 > 0 ? "win" : "lose";
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

    setMaxHp: (playerMax, enemyMax) => {
      const pM = Math.max(1, Math.round(playerMax || 1000));
      const eM = Math.max(1, Math.round(enemyMax || 1000));
      set({
        playerHPMax: pM, enemyHPMax: eM,
        playerHP: 1, enemyHP: 1,
        playerStatus: newStatus(), enemyStatus: newStatus(),
        energy: [0, 0, 0, 0],
        enemyEnergy: [0, 0, 0, 0],
        enemyCooldowns: [0, 0, 0, 0],
        _lastEnemyCastAt: 0,
        _minEnemyCastIntervalMs: 950,
      });
      if (!get().enemyLoadout || get().enemyLoadout.length !== 4) {
        set({ enemyLoadout: randomEnemyLoadout() });
      }
    },

    resetEnergy: () => set({ energy: [0, 0, 0, 0] }),

    resetMatch: () => {
      const s = get();
      s._loop?.stop();
      set({
        energy: [0, 0, 0, 0],
        enemyEnergy: [0, 0, 0, 0],
        enemyCooldowns: [0, 0, 0, 0],
        _lastEnemyCastAt: 0,
        _minEnemyCastIntervalMs: 950,
        projectiles: [],
        playerHP: 1, enemyHP: 1,
        playerStatus: newStatus(), enemyStatus: newStatus(),
        paused: false, showResults: false, result: null,
        _loop: null,
        tick: (get().tick + 1) & 1023,
      });
      set({ enemyLoadout: randomEnemyLoadout() });
      get().start();
    },
  };
});

// ====== concluir partida ======
function conclude(outcome: Outcome) {
  const battle = useBattleStore.getState();
  const profile = useProfileStore.getState();
  const wallet = useWalletStore.getState();

  const eloBefore = profile.playerElo ?? 1000;
  const oppElo = eloBefore;
  const exp = expectedScore(eloBefore, oppElo);
  const score = outcome === "win" ? 1 : 0;
  const eloDelta = Math.round(K_NORMAL * (score - exp));
  const eloAfter = Math.max(600, Math.min(2400, eloBefore + eloDelta));

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
    result: { outcome, coins, xp, eloBefore, eloAfter, eloDelta },
  });
}
