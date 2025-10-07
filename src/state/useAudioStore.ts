// src/state/useAudioStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { jsonPortableStorage } from "./mmkv"; // 👈 usa el helper con MMKV/AsyncStorage/mem

type AudioState = {
  musicVolume: number;   // 0..1
  sfxVolume: number;     // 0..1
  musicMuted: boolean;
  sfxMuted: boolean;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  toggleMusicMute: () => void;
  toggleSfxMute: () => void;
};

export const useAudioStore = create<AudioState>()(
  persist(
    (set, get) => ({
      musicVolume: 0.65,
      sfxVolume: 0.9,
      musicMuted: false,
      sfxMuted: false,
      setMusicVolume: (v) => set({ musicVolume: Math.max(0, Math.min(1, v)) }),
      setSfxVolume: (v) => set({ sfxVolume: Math.max(0, Math.min(1, v)) }),
      toggleMusicMute: () => set({ musicMuted: !get().musicMuted }),
      toggleSfxMute: () => set({ sfxMuted: !get().sfxMuted }),
    }),
    {
      name: "audio-prefs",
      storage: jsonPortableStorage(), // 👈 usa MMKV si hay, si no AsyncStorage, si no memoria
    }
  )
);
