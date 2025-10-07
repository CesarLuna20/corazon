// src/audio/audio.ts
import { Audio, InterruptionModeAndroid, InterruptionModeIOS, type AVPlaybackSource } from "expo-av";
// import { Asset } from "expo-asset"; // opcional

// =======================================================
// 🔊 Estado global (usa tu useAudioStore sin crash de imports circulares)
// =======================================================
type AudioSlice = {
  musicVolume: number;
  musicMuted: boolean;
  setMusicVolume: (v: number) => void;
  toggleMusicMute: () => void;
};

let _useAudioStore: any = null;
function getAudioStore(): { getState: () => AudioSlice } | null {
  try {
    if (!_useAudioStore) {
      _useAudioStore = require("../state/useAudioStore").useAudioStore;
    }
    return _useAudioStore;
  } catch {
    return null;
  }
}

// =======================================================
// 🎵 Registro de pistas
// =======================================================
export const MUSIC_ASSETS: Record<string, AVPlaybackSource> = {
  theme: require("../../assets/sounds/sounds1.wav"),  // música de Home
  battle: require("../../assets/sounds/sounds2.wav"), // Normal
  endless: require("../../assets/sounds/sounds2.wav"),
  story: require("../../assets/sounds/sounds2.wav"),
};

// =======================================================
// 🎚️ Variables internas
// =======================================================
let musicSound: Audio.Sound | null = null;
let currentKey: keyof typeof MUSIC_ASSETS | null = null;
let initialized = false;
let isSwitching = false; // 🔒 evita que se ejecuten 2 playMusic a la vez

// =======================================================
// ⚙️ Inicialización del sistema de audio
// =======================================================
export async function initAudio() {
  if (initialized) return;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    staysActiveInBackground: false,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    interruptionModeIOS: InterruptionModeIOS.DuckOthers,
  });
  initialized = true;
}

// =======================================================
// ▶️ Reproducir pista
// =======================================================
type PlayOpts = {
  loop?: boolean;
  respectExisting?: boolean;
  volume?: number;
};

export async function playMusic(
  key: keyof typeof MUSIC_ASSETS = "theme",
  opts: PlayOpts = {}
) {
  await initAudio();

  // 🚫 si ya suena la misma pista y está activa, no la reinicies
  if (opts.respectExisting && currentKey === key && musicSound) {
    try {
      const status = await musicSound.getStatusAsync();
      if (status.isLoaded && status.isPlaying) return;
    } catch {}
  }

  // 🔒 evita carreras de reproducción
  if (isSwitching) return;
  isSwitching = true;

  try {
    // Detiene la pista anterior si es otra
    if (musicSound && currentKey !== key) {
      try { await musicSound.stopAsync(); } catch {}
      try { await musicSound.unloadAsync(); } catch {}
      musicSound = null;
      currentKey = null;
    }

    // Si la pista es la misma y está cargada, solo reanuda
    if (musicSound && currentKey === key) {
      const st = await musicSound.getStatusAsync();
      if (st.isLoaded && !st.isPlaying) await musicSound.playAsync();
      return;
    }

    const store = getAudioStore()?.getState?.();
    const muted = store?.musicMuted ?? false;
    const baseVol = store?.musicVolume ?? 0.7;
    const vol = typeof opts.volume === "number" ? opts.volume : baseVol;

    const { sound } = await Audio.Sound.createAsync(MUSIC_ASSETS[key], {
      isLooping: opts.loop ?? true,
      volume: muted ? 0 : vol,
      shouldPlay: !muted,
    });

    musicSound = sound;
    currentKey = key;

    if (!muted) {
      const status = await sound.getStatusAsync();
      if (status.isLoaded && !status.isPlaying) await sound.playAsync();
    }
  } finally {
    isSwitching = false;
  }
}

// =======================================================
// 🔄 Cambio con crossfade
// =======================================================
export async function changeMusic(
  key: keyof typeof MUSIC_ASSETS,
  { crossfadeMs = 600, loop = true, volume }: { crossfadeMs?: number; loop?: boolean; volume?: number } = {}
) {
  if (currentKey === key) {
    const st = await musicSound?.getStatusAsync();
    if (st && st.isLoaded && !st.isPlaying) await musicSound?.playAsync();
    return;
  }

  await fadeOutMusic(crossfadeMs);
  await playMusic(key, { loop, respectExisting: false, volume });
  await fadeInMusic(crossfadeMs);
}

// =======================================================
// ⏹️ Detener y liberar
// =======================================================
export async function stopMusic(unload = false, fadeMs = 0) {
  if (!musicSound) return;
  if (fadeMs > 0) await fadeOutMusic(fadeMs);
  try { await musicSound.stopAsync(); } catch {}
  if (unload) {
    try { await musicSound.unloadAsync(); } catch {}
    musicSound = null;
    currentKey = null;
  }
}

export async function unloadMusic() {
  if (!musicSound) return;
  try { await musicSound.unloadAsync(); } catch {}
  musicSound = null;
  currentKey = null;
}

// =======================================================
// 🎛️ Controles de volumen / mute
// =======================================================
export function setMusicVolume(vol: number) {
  const store = getAudioStore();
  const v = Math.max(0, Math.min(1, vol));
  store?.getState?.().setMusicVolume?.(v);
  const muted = store?.getState?.().musicMuted ?? false;
  if (musicSound) musicSound.setStatusAsync({ volume: muted ? 0 : v });
}

export function toggleMusicMute() {
  const store = getAudioStore();
  store?.getState?.().toggleMusicMute?.();
  const st = store?.getState?.();
  const muted = st?.musicMuted ?? false;
  const vol = st?.musicVolume ?? 0.7;
  if (musicSound) musicSound.setStatusAsync({ volume: muted ? 0 : vol });
}

export async function setMusicFromStore() {
  if (!musicSound) return;
  const st = getAudioStore()?.getState?.();
  const muted = st?.musicMuted ?? false;
  const vol = st?.musicVolume ?? 0.7;
  try { await musicSound.setStatusAsync({ volume: muted ? 0 : vol }); } catch {}
}

// =======================================================
// ⏯️ Pausa y reanudar
// =======================================================
export async function pauseMusic() {
  if (!musicSound) return;
  try { await musicSound.pauseAsync(); } catch {}
}
export async function resumeMusic() {
  if (!musicSound) return;
  try { await musicSound.playAsync(); } catch {}
}

// =======================================================
// 🌗 Fades suaves
// =======================================================
export async function fadeInMusic(durationMs = 1500) {
  if (!musicSound) return;
  const st = getAudioStore()?.getState?.();
  const muted = st?.musicMuted ?? false;
  const vol = st?.musicVolume ?? 0.7;
  if (muted) return;
  const steps = 24, dt = durationMs / steps;
  for (let i = 1; i <= steps; i++) {
    await new Promise(r => setTimeout(r, dt));
    await musicSound.setStatusAsync({ volume: (vol * i) / steps });
  }
}

export async function fadeOutMusic(durationMs = 600) {
  if (!musicSound) return;
  const st = getAudioStore()?.getState?.();
  const vol = st?.musicVolume ?? 0.7;
  const steps = 24, dt = Math.max(8, durationMs / steps);
  for (let i = steps - 1; i >= 0; i--) {
    await new Promise(r => setTimeout(r, dt));
    await musicSound.setStatusAsync({ volume: (vol * i) / steps });
  }
}

// =======================================================
// 🧩 Utilidades
// =======================================================
export function getCurrentMusicKey() {
  return currentKey;
}
