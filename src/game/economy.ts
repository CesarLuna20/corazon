// src/game/economy.ts
import storeData from "../data/store.json";
import { useWalletStore } from "../state/useWalletStore";
import { useProfileStore } from "../state/useProfileStore";

export type Phase = 1 | 2 | 3 | 4;
export const maxPhase: Phase = 4;

// Rarezas (EN/ES)
export type RarityEn = "common" | "rare" | "epic" | "legendary";
export type RarityEs = "comun" | "rara" | "epica" | "legendaria";
export type RarityAny = RarityEn | RarityEs;

const RARITY_ES_TO_EN: Record<RarityEs | RarityEn, RarityEn> = {
  comun: "common",
  rara: "rare",
  epica: "epic",
  legendaria: "legendary",
  common: "common",
  rare: "rare",
  epic: "epic",
  legendary: "legendary",
};

const toEn = (r: RarityAny): RarityEn => RARITY_ES_TO_EN[r] ?? "common";
const clampPhase = (p: number): Phase =>
  Math.min(Math.max(p, 1), maxPhase) as Phase;

// Tipos de precios aceptados desde store.json
type PricesArray = Record<RarityEn, [number, number, number]>; // 1->2,2->3,3->4
type PricesObject = Record<RarityEn, { "2": number; "3": number; "4": number }>;
type Prices =
  | {
      buy: Record<RarityEn, number>;
      upgrade: PricesArray | PricesObject;
    }
  | any; // por si el JSON no tipa exacto

const prices: Prices = storeData as Prices;

/** Normaliza la tabla de upgrade a arreglo [p12, p23, p34] */
function getUpgradeArray(rarity: RarityEn): [number, number, number] | null {
  const up = prices?.upgrade?.[rarity];
  if (!up) return null;
  // Forma arreglo
  if (Array.isArray(up)) {
    const a = up as number[];
    return [Number(a[0] ?? 0), Number(a[1] ?? 0), Number(a[2] ?? 0)];
  }
  // Forma objeto {"2":n1,"3":n2,"4":n3}
  const o = up as { "2"?: number; "3"?: number; "4"?: number };
  return [Number(o["2"] ?? 0), Number(o["3"] ?? 0), Number(o["4"] ?? 0)];
}

/** Precio de compra por rareza (seguro) */
export function getBibixPriceToBuy(rarity: RarityAny): number {
  const r = toEn(rarity);
  const val = prices?.buy?.[r];
  return Number(val ?? 0) || 0;
}

/**
 * Precio para mejorar DESDE la fase `fromPhase` a la siguiente.
 * Si fromPhase>=maxPhase => 0.
 */
export function getUpgradePrice(
  rarity: RarityAny,
  fromPhase: Phase
): number {
  if (fromPhase >= maxPhase) return 0;
  const r = toEn(rarity);
  const arr = getUpgradeArray(r);
  if (!arr) return 0;
  const idx = fromPhase - 1; // 1->0, 2->1, 3->2
  return Number(arr[idx] ?? 0) || 0;
}

type EconResult<T extends object = {}> = { ok: boolean; reason?: string } & T;

/** Compra una bibix (seguro y sin crashear) */
export function purchaseBibix(
  bibixId: string,
  rarity: RarityAny
): EconResult {
  const wallet = useWalletStore.getState();
  const profile = useProfileStore.getState();

  const already = profile.ownedBibix?.includes(bibixId);
  if (already) return { ok: false, reason: "ALREADY_OWNED" };

  const price = getBibixPriceToBuy(rarity);
  if (!price || price < 0) return { ok: false, reason: "NO_PRICE" };

  const spend = wallet.spendCoins?.bind(wallet);
  if (!spend) return { ok: false, reason: "WALLET_MISSING" };

  const ok = spend(price);
  if (!ok) return { ok: false, reason: "INSUFFICIENT_COINS" };

  // Soportar ambos nombres: addOwned (nuevo) o own (legacy)
  const ownNew = profile.addOwned as ((id: string) => void) | undefined;
  const ownLegacy = (profile as any).own as ((id: string) => void) | undefined;
  const ownFn = ownNew ?? ownLegacy;
  if (!ownFn) return { ok: false, reason: "PROFILE_OWN_FN_MISSING" };

  ownFn(bibixId);
  return { ok: true };
}

/** Mejora de fase 1->4 (seguro y sin crashear) */
export function upgradeBibixPhase(
  bibixId: string,
  rarity: RarityAny
): EconResult<{ newPhase?: Phase }> {
  const wallet = useWalletStore.getState();
  const profile = useProfileStore.getState();

  const phasesByBibix = profile.phasesByBibix ?? {};
  const current = clampPhase((phasesByBibix[bibixId] ?? 1) as number);

  if (current >= maxPhase) return { ok: false, reason: "MAX_PHASE" };

  const price = getUpgradePrice(rarity, current);
  if (!price || price < 0) return { ok: false, reason: "NO_PRICE" };

  const spend = wallet.spendCoins?.bind(wallet);
  if (!spend) return { ok: false, reason: "WALLET_MISSING" };

  const ok = spend(price);
  if (!ok) return { ok: false, reason: "INSUFFICIENT_COINS" };

  const setPhase = profile.setPhase as
    | ((id: string, phase: Phase) => void)
    | undefined;
  if (!setPhase) return { ok: false, reason: "PROFILE_SET_PHASE_MISSING" };

  const next = clampPhase(current + 1);
  setPhase(bibixId, next);
  return { ok: true, newPhase: next };
}

/* =========================
   (OPCIONAL) Validador dev
   ========================= */
export function validateStoreConfig(): {
  ok: boolean;
  missing: string[];
  warnings: string[];
} {
  const missing: string[] = [];
  const warnings: string[] = [];

  (["common", "rare", "epic", "legendary"] as RarityEn[]).forEach((r) => {
    if (prices?.buy?.[r] == null) missing.push(`buy.${r}`);
    const arr = getUpgradeArray(r);
    if (!arr) {
      missing.push(`upgrade.${r}`);
    } else {
      arr.forEach((n, i) => {
        if (n == null) missing.push(`upgrade.${r}[${i}] (fase ${i + 1}->${i + 2})`);
        if (typeof n === "number" && n < 0) warnings.push(`upgrade.${r}[${i}] negativo`);
      });
    }
  });

  return { ok: missing.length === 0, missing, warnings };
}
