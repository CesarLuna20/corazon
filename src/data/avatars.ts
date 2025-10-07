// src/data/avatars.ts
export type SpriteMeta = {
  source: any;      // require(...) del PNG/atlas
  rows: number;     // filas del atlas
  cols: number;     // columnas del atlas
  fps?: number;     // opcional: fps de animación
  renderW?: number; // opcional: ancho en pantalla (si no pones, se usa default 80)
  renderH?: number; // opcional: alto en pantalla (si no pones, se usa default 100)
};

export type AvatarDef = {
  id: string;
  name: string;
  sprite: SpriteMeta;
};

// ===== Ejemplos =====
// Si tu atlas mide 1024x1536 y está acomodado en 2x3 frames (como tus sprites viejos),
// entonces cada frame es 512x768. Eso está OK si tu componente <Sprite> usa rows/cols
// para cortar los frames. El tamaño en pantalla lo controlas con renderW/renderH.

export const PLAYER_SKINS: AvatarDef[] = [
  {
    id: "hero_fire",
    name: "Ignis",
    sprite: {
      source: require("../../assets/personajes/itsuka.png"),
      rows: 2,
      cols: 3,
      fps: 1.8,
      renderW: 80,
      renderH: 100,
    },
  },
];

export const OPPONENTS: AvatarDef[] = [
      {
        id: "Ayumu",
        name: "Ayumo",
        sprite: {
          // EJEMPLO con atlas grande 1024x1536 (2 filas x 3 columnas)
          source: require("../../assets/personajes/Ayumu.png"),
          rows: 2,
          cols: 3,
          fps: 2,
          renderW: 75,   // puedes ajustar por avatar si quieres
          renderH: 100,
        },
      },
    {
        id: "Kiko",
        name: "Kiko",
        sprite: {
          // EJEMPLO con atlas grande 1024x1536 (2 filas x 3 columnas)
          source: require("../../assets/personajes/Kiko.png"),
          rows: 2,
          cols: 3,
          fps: 1.8,
          renderW: 80,   // puedes ajustar por avatar si quieres
          renderH: 100,
        },
    },
    {
        id: "Hina",
        name: "Hina",
        sprite: {
          // EJEMPLO con atlas grande 1024x1536 (2 filas x 3 columnas)
          source: require("../../assets/personajes/Hina.png"),
          rows: 2,
          cols: 2,
          fps: 1.8,
          renderW: 80,   // puedes ajustar por avatar si quieres
          renderH: 100,
        },
    },
    {
        id: "Shuna",
        name: "Shuna",
        sprite: {
          // EJEMPLO con atlas grande 1024x1536 (2 filas x 3 columnas)
          source: require("../../assets/personajes/Shunav1.png"),
          rows: 2,
          cols: 3,
          fps: 1,
          renderW: 110,   // puedes ajustar por avatar si quieres
          renderH: 130,
        },
    }
];
