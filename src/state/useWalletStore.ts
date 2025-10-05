// src/state/useWalletStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { storage } from "./secureStorage"; // tu MMKV

type WalletState = {
  coins: number;
  addCoins: (n: number) => void;
  spendCoins: (n: number) => boolean;     // true si pudo gastar
  hasCoins: (n: number) => boolean;       // solo compara, NO gasta
  grantOnce: (key: string, amount: number) => void; // evita duplicado
  _grants: Record<string, boolean>;
};

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      coins: 0,
      _grants: {},
      addCoins: (n) => set((s) => ({ coins: s.coins + Math.max(0, Math.floor(n)) })),
      spendCoins: (n) => {
        const need = Math.max(0, Math.floor(n));
        const s = get();
        if (s.coins < need) return false;
        set({ coins: s.coins - need });
        return true;
      },
      hasCoins: (n) => get().coins >= Math.max(0, Math.floor(n)),
      grantOnce: (key, amount) => {
        const s = get();
        if (s._grants[key]) return;
        set({
          coins: s.coins + Math.max(0, Math.floor(amount)),
          _grants: { ...s._grants, [key]: true },
        });
      },
    }),
    {
      name: "wallet-mmkv",
      storage: createJSONStorage(() => storage),
      version: 1,
    }
  )
);
