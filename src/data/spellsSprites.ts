// src/data/spellSprites.ts
export type SpriteMeta = {
  rows: number;
  cols: number;
  fps: number;
  frameW?: number;
  frameH?: number;
};

export type SpriteAsset = {
  source: number; // require(...)
  meta: SpriteMeta;
};

export const SPELL_SPRITES: Record<string, SpriteAsset> = {
  bola_fuego: {
    source: require("../../assets/spells/fireball.png"),
    meta: { rows: 2, cols: 2, fps: 10, frameW: 64, frameH: 64 },
  },
  chorro_agua: {
    source: require("../../assets/spells/water_jet.png"),
    meta: { rows: 1, cols: 6, fps: 12, frameW: 64, frameH: 64 },
  },
  proyectil_roca: {
    source: require("../../assets/spells/stone_bolt.png"),
    meta: { rows: 1, cols: 5, fps: 10, frameW: 64, frameH: 64 },
  },
  rafaga_aire: {
    source: require("../../assets/spells/gust.png"),
    meta: { rows: 2, cols: 3, fps: 12, frameW: 64, frameH: 64 },
  },
  lanza_hielo: {
    source: require("../../assets/spells/ice_lance.png"),
    meta: { rows: 1, cols: 6, fps: 12, frameW: 64, frameH: 64 },
  },
  nube_veneno: {
    source: require("../../assets/spells/poison_cloud.png"),
    meta: { rows: 2, cols: 4, fps: 10, frameW: 64, frameH: 64 },
  },
  rayo_energia: {
    source: require("../../assets/spells/energy_beam.png"),
    meta: { rows: 1, cols: 8, fps: 14, frameW: 64, frameH: 64 },
  },
  muro_agua: {
    source: require("../../assets/spells/water_wall.png"),
    meta: { rows: 2, cols: 3, fps: 8, frameW: 64, frameH: 64 },
  },
  terremoto: {
    source: require("../../assets/spells/earthquake.png"),
    meta: { rows: 2, cols: 4, fps: 10, frameW: 64, frameH: 64 },
  },
  tornado: {
    source: require("../../assets/spells/tornado.png"),
    meta: { rows: 2, cols: 4, fps: 12, frameW: 64, frameH: 64 },
  },
  sobrecarga: {
    source: require("../../assets/spells/overcharge.png"),
    meta: { rows: 2, cols: 3, fps: 12, frameW: 64, frameH: 64 },
  },
  meteorito: {
    source: require("../../assets/spells/meteor.png"),
    meta: { rows: 2, cols: 4, fps: 10, frameW: 64, frameH: 64 },
  },
  orbe_sombras: {
    source: require("../../assets/spells/shadow_orb.png"),
    meta: { rows: 2, cols: 4, fps: 12, frameW: 64, frameH: 64 },
  },
  aliento_dragon: {
    source: require("../../assets/spells/dragon_breath.png"),
    meta: { rows: 1, cols: 8, fps: 14, frameW: 64, frameH: 64 },
  },
  prision_hielo: {
    source: require("../../assets/spells/ice_prison.png"),
    meta: { rows: 2, cols: 3, fps: 8, frameW: 64, frameH: 64 },
  },
  eclipse: {
    source: require("../../assets/spells/eclipse.png"),
    meta: { rows: 2, cols: 4, fps: 10, frameW: 64, frameH: 64 },
  },
  manto_piedra: {
    source: require("../../assets/spells/stone_skin.png"),
    meta: { rows: 2, cols: 3, fps: 8, frameW: 64, frameH: 64 },
  },
  cura_arcana: {
    source: require("../../assets/spells/arcane_heal.png"),
    meta: { rows: 2, cols: 3, fps: 10, frameW: 64, frameH: 64 },
  },
  hoja_viento: {
    source: require("../../assets/spells/wind_blade.png"),
    meta: { rows: 1, cols: 6, fps: 12, frameW: 64, frameH: 64 },
  },
  aguacero: {
    source: require("../../assets/spells/downpour.png"),
    meta: { rows: 2, cols: 4, fps: 10, frameW: 64, frameH: 64 },
  },
  veneno_reptante: {
    source: require("../../assets/spells/creeping_poison.png"),
    meta: { rows: 2, cols: 3, fps: 10, frameW: 64, frameH: 64 },
  },
  llamarada: {
    source: require("../../assets/spells/flame_burst.png"),
    meta: { rows: 2, cols: 3, fps: 12, frameW: 64, frameH: 64 },
  },
};
