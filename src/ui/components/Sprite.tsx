// src/ui/components/Sprite.tsx
import React, { useMemo } from "react";
import {
  Image as SkImage,
  useImage,
  Group,
  type SkImage as TSkImage,
} from "@shopify/react-native-skia";
import { useSpriteSheet } from "../hooks/useSpriteSheet";

type Props = {
  source: any;
  rows: number;
  cols: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fps?: number;
  sequence?: number[];
  loop?: boolean;
  freezeAtFrame?: number | null; // ✅ nuevo
  rotation?: number;             // ✅ nuevo (radianes)
};

export default function Sprite({
  source,
  rows,
  cols,
  x,
  y,
  width,
  height,
  fps = 8,
  sequence,
  loop = true,
  freezeAtFrame = null,
  rotation = 0,
}: Props) {
  const img = useImage(source);
  const { frame: animFrame } = useSpriteSheet({ fps, rows, cols, sequence, loop });

  // Determina frame final (animado o congelado)
  const total = Math.max(1, rows * cols);
  const frame = freezeAtFrame != null ? Math.max(0, Math.min(total - 1, freezeAtFrame)) : animFrame;

  let atlasW = 1;
  let atlasH = 1;
  if (img) {
    atlasW = (img as TSkImage).width();
    atlasH = (img as TSkImage).height();
  }

  const frameW = atlasW / cols;
  const frameH = atlasH / rows;

  const outW = width ?? frameW;
  const outH = height ?? frameH;

  const col = frame % cols;
  const row = Math.floor(frame / cols);

  const scaleX = outW / frameW;
  const scaleY = outH / frameH;

  const offsetX = -col * frameW * scaleX;
  const offsetY = -row * frameH * scaleY;

  const clipRect = useMemo(
    () => ({ x, y, width: outW, height: outH }),
    [x, y, outW, outH]
  );

  return (
    <Group
      clip={clipRect}
      transform={
        rotation
          ? ([{ rotate: rotation }, { translateX: 0 }, { translateY: 0 }] as any)
          : (undefined as any)
      }
    >
      {img && (
        <SkImage
          image={img}
          x={x + offsetX}
          y={y + offsetY}
          width={atlasW * scaleX}
          height={atlasH * scaleY}
          fit="fill"
        />
      )}
    </Group>
  );
}
