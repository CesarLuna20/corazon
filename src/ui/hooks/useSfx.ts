import { useEffect, useRef } from "react";
import { Audio, AVPlaybackSource } from "expo-av";

type MapSfx = Record<string, AVPlaybackSource>;

export function useSfx(map: MapSfx) {
  const cache = useRef<Record<string, Audio.Sound>>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      for (const [k, src] of Object.entries(map)) {
        const { sound } = await Audio.Sound.createAsync(src);
        if (mounted) cache.current[k] = sound;
      }
    })();
    return () => {
      mounted = false;
      for (const s of Object.values(cache.current)) s.unloadAsync();
      cache.current = {};
    };
  }, []);

  const play = async (key: string) => {
    const snd = cache.current[key];
    if (!snd) return;
    await snd.replayAsync();
  };

  return { play };
}
