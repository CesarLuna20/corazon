// src/ui/hooks/useSpriteSheet.ts
import { useEffect, useMemo, useRef, useState } from "react";

type UseSpriteSheetOpts = {
  fps?: number;
  rows: number;
  cols: number;
  sequence?: number[];
  loop?: boolean;
};

export function useSpriteSheet({
  fps = 8,
  rows,
  cols,
  sequence,
  loop = true,
}: UseSpriteSheetOpts) {
  const total = rows * cols;
  const seq = useMemo(
    () => (sequence && sequence.length ? sequence : [...Array(total).keys()]),
    [rows, cols, sequence]
  );

  const [frame, setFrame] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const accRef = useRef(0);

  useEffect(() => {
    const dtPerFrame = 1000 / fps;

    const tick = (t: number) => {
      if (!lastRef.current) lastRef.current = t;
      const dt = t - lastRef.current;
      lastRef.current = t;

      accRef.current += dt;
      while (accRef.current >= dtPerFrame) {
        accRef.current -= dtPerFrame;
        setFrame((f) => {
          const i = seq.indexOf(f);
          const next = i < 0 ? 0 : i + 1;
          if (next >= seq.length) return loop ? seq[0] : seq[seq.length - 1];
          return seq[next];
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastRef.current = 0;
      accRef.current = 0;
    };
  }, [fps, seq, loop]);

  return { frame, rows, cols, total };
}
