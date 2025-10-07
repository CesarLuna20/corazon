import { Platform } from "react-native";
import { createJSONStorage } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";

// Detecta Expo Go (ownership === "expo")
let Constants: any = null;
try { Constants = require("expo-constants").default; } catch {}
const isExpoGo = !!Constants && Constants.appOwnership === "expo";

// Intenta cargar MMKV nativo
let MMKVClass: any = null;
try {
  // En Expo Go fallará
  MMKVClass = require("react-native-mmkv")?.MMKV ?? null;
} catch {
  MMKVClass = null;
}

const mmkv = MMKVClass ? new MMKVClass() : null;

// Fallback persistente (mejor que Map)
let AsyncStorage: any = null;
try { AsyncStorage = require("@react-native-async-storage/async-storage").default ?? null; } catch {}

export const isMMKVAvailable =
  !!mmkv && Platform.OS !== "web" && !isExpoGo;

// --- Implementaciones de I/O ---
const mem = new Map<string, string>();

const syncStorage: StateStorage = {
  getItem: (k) => {
    if (isMMKVAvailable) return mmkv!.getString(k) ?? null;
    return mem.get(k) ?? null;
  },
  setItem: (k, v) => {
    if (isMMKVAvailable) mmkv!.set(k, v);
    else mem.set(k, v);
  },
  removeItem: (k) => {
    if (isMMKVAvailable) mmkv!.delete(k);
    else mem.delete(k);
  },
};

const asyncStorageAdapter: StateStorage = {
  getItem: (k) => {
    if (isMMKVAvailable) return mmkv!.getString(k) ?? null;
    if (AsyncStorage) return AsyncStorage.getItem(k) as unknown as string | null;
    return mem.get(k) ?? null;
  },
  setItem: (k, v) => {
    if (isMMKVAvailable) return mmkv!.set(k, v);
    if (AsyncStorage) return AsyncStorage.setItem(k, v) as unknown as void;
    mem.set(k, v);
  },
  removeItem: (k) => {
    if (isMMKVAvailable) return mmkv!.delete(k);
    if (AsyncStorage) return AsyncStorage.removeItem(k) as unknown as void;
    mem.delete(k);
  },
};

// 👉 Exporta uno de estos dos según prefieras:
export const jsonMMKVStorage = () => createJSONStorage(() => syncStorage);
// (recomendado) Usa AsyncStorage si no hay MMKV (Expo Go), luego memoria:
export const jsonPortableStorage = () => createJSONStorage(() => asyncStorageAdapter);
