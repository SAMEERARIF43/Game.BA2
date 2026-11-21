import {
  BaseTexture,
  Color3,
  Engine,
  PBRMaterial,
  RawTexture,
  Scene,
  Texture,
} from '@babylonjs/core';

export type SurfacePresetId =
  | 'concrete'
  | 'asphalt'
  | 'brick'
  | 'sandstone'
  | 'plaster'
  | 'timber'
  | 'bark'
  | 'rock'
  | 'meadow'
  | 'hazard'
  | 'diamondPlate'
  | 'brushedMetal'
  | 'anodizedMetal'
  | 'carbonFiber'
  | 'knurledPolymer'
  | 'walnutWood'
  | 'tacticalFabric'
  | 'kevlarPlate'
  | 'crate';

export interface SurfaceTextureOptions {
  size?: number;
  baseHex?: string;
  accentHex?: string;
  uScale?: number;
  vScale?: number;
  bumpStrength?: number;
  roughnessScale?: number;
  metallicOverride?: number;
  seed?: number;
}

export interface SynthesizedSurfaceBuffers {
  size: number;
  albedo: Uint8Array;
  normal: Uint8Array;
  metallicRoughness: Uint8Array;
}

export interface ProceduralSurfaceTextures {
  albedoTexture: RawTexture;
  bumpTexture: RawTexture;
  metallicTexture: RawTexture;
  textures: BaseTexture[];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = Number.parseInt(full, 16);
  if (!Number.isFinite(num)) return [0.5, 0.5, 0.5];
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

export function hash2D(x: number, y: number, seed = 0): number {
  const n = Math.sin((x + seed * 17.31) * 127.1 + (y + seed * 31.17) * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function smoothNoise2D(x: number, y: number, period: number, seed = 0): number {
  const p = Math.max(1, Math.round(period));
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const wrap = (val: number) => ((val % p) + p) % p;
  const x0 = wrap(xi);
  const x1 = wrap(xi + 1);
  const y0 = wrap(yi);
  const y1 = wrap(yi + 1);

  const a = hash2D(x0, y0, seed);
  const b = hash2D(x1, y0, seed);
  const c = hash2D(x0, y1, seed);
  const d = hash2D(x1, y1, seed);

  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbmTileable2D(u: number, v: number, baseFreq: number, octaves = 3, seed = 0): number {
  let sum = 0;
  let amp = 0.55;
  let freq = Math.max(1, Math.round(baseFreq));
  let weight = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * smoothNoise2D(u * freq, v * freq, freq, seed + i * 11);
    weight += amp;
    freq *= 2;
    amp *= 0.5;
  }
  return weight > 0 ? sum / weight : 0.5;
}

const DEFAULT_PALETTES: Record<SurfacePresetId, { base: string; accent: string; bump: number }> = {
  concrete: { base: '#626973', accent: '#3c424b', bump: 2.3 },
  asphalt: { base: '#282d35', accent: '#171a20', bump: 2.0 },
  brick: { base: '#784639', accent: '#482a22', bump: 3.1 },
  sandstone: { base: '#b49469', accent: '#816542', bump: 2.5 },
  plaster: { base: '#9e8b74', accent: '#6e5e4b', bump: 2.1 },
  timber: { base: '#755336', accent: '#442e1b', bump: 2.7 },
  bark: { base: '#513926', accent: '#2c1d12', bump: 3.4 },
  rock: { base: '#5e6569', accent: '#363c40', bump: 3.2 },
  meadow: { base: '#34472e', accent: '#4d653c', bump: 2.2 },
  hazard: { base: '#d99a16', accent: '#1b1e23', bump: 2.0 },
  diamondPlate: { base: '#434c57', accent: '#262c34', bump: 3.5 },
  brushedMetal: { base: '#798492', accent: '#49525e', bump: 1.7 },
  anodizedMetal: { base: '#21262e', accent: '#14181e', bump: 1.3 },
  carbonFiber: { base: '#232830', accent: '#12151a', bump: 2.2 },
  knurledPolymer: { base: '#1a1e24', accent: '#101216', bump: 2.6 },
  walnutWood: { base: '#66381d', accent: '#361a0b', bump: 2.1 },
  tacticalFabric: { base: '#272f38', accent: '#171c22', bump: 2.4 },
  kevlarPlate: { base: '#2d3540', accent: '#1b2028', bump: 2.5 },
  crate: { base: '#6f5538', accent: '#3b2c1b', bump: 2.7 },
};

export function synthesizeSurfaceBuffers(
  kind: SurfacePresetId,
  size = 128,
  options: SurfaceTextureOptions = {}
): SynthesizedSurfaceBuffers {
  const s = Math.max(32, Math.min(512, Math.round(size)));
  const defaults = DEFAULT_PALETTES[kind];
  const baseRgb = hexToRgb(options.baseHex ?? defaults.base);
  const accentRgb = hexToRgb(options.accentHex ?? defaults.accent);
  const bumpStrength = options.bumpStrength ?? defaults.bump;
  const roughScale = options.roughnessScale ?? 1.0;
  const seed = options.seed ?? 0;

  const albedo = new Uint8Array(s * s * 4);
  const metallicRoughness = new Uint8Array(s * s * 4);
  const heights = new Float32Array(s * s);

  for (let y = 0; y < s; y++) {
    const v = y / s;
    for (let x = 0; x < s; x++) {
      const u = x / s;
      const idx = (y * s + x) * 4;

      const fLow = fbmTileable2D(u, v, 4, 3, seed);
      const fMid = fbmTileable2D(u, v, 8, 3, seed + 5);
      const fFine = smoothNoise2D(u * 24, v * 24, 24, seed + 13);

      let r = baseRgb[0];
      let g = baseRgb[1];
      let b = baseRgb[2];
      let h = 0.5;
      let rough = 0.78;
      let metal = 0.05;

      switch (kind) {
        case 'concrete': {
          const seam = u < 0.025 || v < 0.025 || Math.abs(u - 0.5) < 0.012 || Math.abs(v - 0.5) < 0.012;
          const drip = fbmTileable2D(u * 1.0, v * 0.25, 6, 2, seed + 2);
          const shade = lerp(0.84, 1.14, fMid * 0.65 + fFine * 0.35) * (0.9 + drip * 0.14);
          r = (seam ? accentRgb[0] : baseRgb[0]) * shade;
          g = (seam ? accentRgb[1] : baseRgb[1]) * shade;
          b = (seam ? accentRgb[2] : baseRgb[2]) * shade;
          h = (seam ? -0.35 : 0) + fMid * 0.45 + fFine * 0.2;
          rough = seam ? 0.94 : 0.72 + fMid * 0.22;
          metal = 0.03;
          break;
        }
        case 'asphalt': {
          const aggregate = smoothNoise2D(u * 40, v * 40, 40, seed + 9);
          const crack = Math.abs(fbmTileable2D(u, v, 5, 3, seed + 19) - 0.5) < 0.018;
          const oilPatch = fLow < 0.34 ? 0.78 : 1.0;
          const shade = lerp(0.75, 1.28, aggregate * 0.65 + fMid * 0.35) * oilPatch;
          r = (crack ? accentRgb[0] * 0.6 : baseRgb[0]) * shade;
          g = (crack ? accentRgb[1] * 0.6 : baseRgb[1]) * shade;
          b = (crack ? accentRgb[2] * 0.6 : baseRgb[2]) * shade;
          h = (crack ? -0.4 : 0) + aggregate * 0.5 + fMid * 0.2;
          rough = oilPatch < 0.9 ? 0.42 : 0.68 + aggregate * 0.26;
          metal = 0.05;
          break;
        }
        case 'brick': {
          const rows = 8;
          const cols = 4;
          const rowIdx = Math.floor(v * rows);
          const rowFrac = (v * rows) % 1;
          const colPos = (u * cols + (rowIdx % 2 === 1 ? 0.5 : 0)) % cols;
          const colIdx = Math.floor(colPos);
          const colFrac = colPos % 1;
          const mortar = rowFrac < 0.11 || colFrac < 0.06;
          const brickJitter = hash2D(colIdx, rowIdx, seed + 3);
          const brickShade = lerp(0.78, 1.18, brickJitter * 0.6 + fFine * 0.4);
          if (mortar) {
            r = lerp(accentRgb[0], 0.56, 0.35) * (0.9 + fFine * 0.15);
            g = lerp(accentRgb[1], 0.54, 0.35) * (0.9 + fFine * 0.15);
            b = lerp(accentRgb[2], 0.5, 0.35) * (0.9 + fFine * 0.15);
            h = -0.35 + fFine * 0.12;
            rough = 0.94;
          } else {
            r = lerp(baseRgb[0], accentRgb[0], brickJitter * 0.25) * brickShade;
            g = lerp(baseRgb[1], accentRgb[1], brickJitter * 0.25) * brickShade;
            b = lerp(baseRgb[2], accentRgb[2], brickJitter * 0.25) * brickShade;
            h = 0.35 + fMid * 0.35 + fFine * 0.15;
            rough = 0.78 + fFine * 0.16;
          }
          metal = 0.02;
          break;
        }
        case 'sandstone': {
          const strata = Math.sin(v * Math.PI * 10 + fLow * 4.5) * 0.5 + 0.5;
          const windRipple = Math.sin(u * Math.PI * 6 + v * Math.PI * 2) * 0.12;
          const mix = strata * 0.55 + fMid * 0.45;
          r = lerp(accentRgb[0], baseRgb[0], mix) * (0.92 + fFine * 0.14);
          g = lerp(accentRgb[1], baseRgb[1], mix) * (0.92 + fFine * 0.14);
          b = lerp(accentRgb[2], baseRgb[2], mix) * (0.92 + fFine * 0.14);
          h = mix * 0.6 + windRipple + fFine * 0.2;
          rough = 0.84 + (1 - mix) * 0.12;
          metal = 0.02;
          break;
        }
        case 'plaster': {
          const trowel = fLow * 0.6 + fMid * 0.4;
          const chip = fMid > 0.74;
          r = lerp(baseRgb[0], accentRgb[0], chip ? 0.55 : (1 - trowel) * 0.28);
          g = lerp(baseRgb[1], accentRgb[1], chip ? 0.55 : (1 - trowel) * 0.28);
          b = lerp(baseRgb[2], accentRgb[2], chip ? 0.55 : (1 - trowel) * 0.28);
          h = (chip ? -0.25 : 0.15) + trowel * 0.45 + fFine * 0.15;
          rough = chip ? 0.95 : 0.78 + fFine * 0.14;
          metal = 0.02;
          break;
        }
        case 'timber':
        case 'walnutWood': {
          const planks = kind === 'timber' ? 5 : 1;
          const plankIdx = Math.floor(u * planks);
          const plankSeam = kind === 'timber' && (u * planks) % 1 < 0.045;
          const grainWarp = fbmTileable2D(u * 0.5, v * 1.5, 4, 2, seed + plankIdx);
          const ring = Math.sin((u * 16 + grainWarp * 3.8 + plankIdx * 1.7) * Math.PI) * 0.5 + 0.5;
          const streak = smoothNoise2D(u * 8, v * 32, 32, seed + 7);
          const mix = ring * 0.6 + streak * 0.4;
          if (plankSeam) {
            r = accentRgb[0] * 0.55;
            g = accentRgb[1] * 0.55;
            b = accentRgb[2] * 0.55;
            h = -0.35;
            rough = 0.94;
          } else {
            r = lerp(accentRgb[0], baseRgb[0], mix);
            g = lerp(accentRgb[1], baseRgb[1], mix);
            b = lerp(accentRgb[2], baseRgb[2], mix);
            h = mix * 0.5 + streak * 0.25;
            rough = kind === 'walnutWood' ? 0.42 + (1 - ring) * 0.26 : 0.66 + (1 - ring) * 0.22;
          }
          metal = 0.03;
          break;
        }
        case 'bark': {
          const ridge = Math.sin(u * Math.PI * 14 + fLow * 5.2) * 0.5 + 0.5;
          const fissure = ridge < 0.24;
          const moss = fLow > 0.66 && !fissure;
          const shade = lerp(0.65, 1.15, ridge * 0.7 + fFine * 0.3);
          r = (moss ? 0.24 : lerp(accentRgb[0], baseRgb[0], ridge)) * shade;
          g = (moss ? 0.34 : lerp(accentRgb[1], baseRgb[1], ridge)) * shade;
          b = (moss ? 0.2 : lerp(accentRgb[2], baseRgb[2], ridge)) * shade;
          h = (fissure ? -0.45 : ridge * 0.65) + fFine * 0.2;
          rough = 0.92;
          metal = 0.0;
          break;
        }
        case 'rock': {
          const fracture = Math.abs(fLow - 0.5) * 2.0;
          const mossCap = fMid > 0.67;
          const shade = lerp(0.65, 1.25, fracture * 0.65 + fFine * 0.35);
          r = (mossCap ? 0.24 : baseRgb[0]) * shade;
          g = (mossCap ? 0.32 : baseRgb[1]) * shade;
          b = (mossCap ? 0.22 : baseRgb[2]) * shade;
          h = fracture * 0.65 + fMid * 0.35;
          rough = mossCap ? 0.9 : 0.76 + (1 - fracture) * 0.18;
          metal = 0.04;
          break;
        }
        case 'meadow': {
          const blades = smoothNoise2D(u * 28, v * 28, 28, seed + 17);
          const patch = fLow;
          r = lerp(baseRgb[0], accentRgb[0], patch) * lerp(0.8, 1.18, blades);
          g = lerp(baseRgb[1], accentRgb[1], patch) * lerp(0.8, 1.18, blades);
          b = lerp(baseRgb[2], accentRgb[2], patch) * lerp(0.8, 1.18, blades);
          h = blades * 0.55 + fMid * 0.3;
          rough = 0.88 + (1 - blades) * 0.09;
          metal = 0.0;
          break;
        }
        case 'hazard': {
          const diag = ((u + v) * 4) % 1;
          const isStripe = diag < 0.5;
          const scuff = fMid > 0.68 || fFine > 0.88;
          const col = isStripe ? baseRgb : accentRgb;
          const mult = scuff ? 1.12 : 0.94 + fFine * 0.1;
          r = scuff && fMid > 0.75 ? 0.52 : col[0] * mult;
          g = scuff && fMid > 0.75 ? 0.55 : col[1] * mult;
          b = scuff && fMid > 0.75 ? 0.58 : col[2] * mult;
          h = (isStripe ? 0.12 : 0.0) + fFine * 0.12;
          rough = scuff ? 0.34 : isStripe ? 0.46 : 0.62;
          metal = scuff ? 0.82 : 0.28;
          break;
        }
        case 'diamondPlate': {
          const gx = (u * 8) % 1;
          const gy = (v * 8) % 1;
          const cell = (Math.floor(u * 8) + Math.floor(v * 8)) % 2;
          const dx = gx - 0.5;
          const dy = gy - 0.5;
          const rotU = cell === 0 ? dx + dy : dx - dy;
          const rotV = cell === 0 ? dx - dy : dx + dy;
          const diamond = Math.abs(rotU) < 0.34 && Math.abs(rotV) < 0.12;
          const shade = diamond ? 1.24 : 0.82 + fFine * 0.14;
          r = lerp(accentRgb[0], baseRgb[0], diamond ? 0.85 : 0.25) * shade;
          g = lerp(accentRgb[1], baseRgb[1], diamond ? 0.85 : 0.25) * shade;
          b = lerp(accentRgb[2], baseRgb[2], diamond ? 0.85 : 0.25) * shade;
          h = diamond ? 0.75 : 0.1 + fFine * 0.1;
          rough = diamond ? 0.22 : 0.48 + fMid * 0.18;
          metal = diamond ? 0.94 : 0.76;
          break;
        }
        case 'brushedMetal': {
          const streak = smoothNoise2D(u * 4, v * 48, 48, seed + 21);
          const edgeWear = fLow > 0.68 ? 1.15 : 0.95;
          const shade = lerp(0.86, 1.12, streak * 0.7 + fFine * 0.3) * edgeWear;
          r = lerp(accentRgb[0], baseRgb[0], streak * 0.8) * shade;
          g = lerp(accentRgb[1], baseRgb[1], streak * 0.8) * shade;
          b = lerp(accentRgb[2], baseRgb[2], streak * 0.8) * shade;
          h = streak * 0.45 + fFine * 0.15;
          rough = 0.16 + (1 - streak) * 0.14 + (fMid > 0.7 ? 0.08 : 0);
          metal = 0.92;
          break;
        }
        case 'anodizedMetal': {
          const micro = smoothNoise2D(u * 32, v * 32, 32, seed + 27);
          const shade = lerp(0.88, 1.14, micro * 0.55 + fLow * 0.45);
          r = baseRgb[0] * shade;
          g = baseRgb[1] * shade;
          b = baseRgb[2] * shade;
          h = micro * 0.25 + fMid * 0.15;
          rough = 0.34 + (1 - micro) * 0.16;
          metal = 0.82;
          break;
        }
        case 'carbonFiber': {
          const cellX = Math.floor(u * 16) % 4;
          const cellY = Math.floor(v * 16) % 4;
          const fx = (u * 16) % 1;
          const fy = (v * 16) % 1;
          const twill = (cellX + cellY) % 4 < 2;
          const fiber = twill ? Math.sin(fx * Math.PI) : Math.sin(fy * Math.PI);
          const mix = clamp01(fiber * 0.75 + 0.15);
          r = lerp(accentRgb[0], baseRgb[0], mix);
          g = lerp(accentRgb[1], baseRgb[1], mix);
          b = lerp(accentRgb[2], baseRgb[2], mix);
          h = fiber * 0.5;
          rough = twill ? 0.24 : 0.44;
          metal = 0.24;
          break;
        }
        case 'knurledPolymer': {
          const kA = Math.sin((u + v) * Math.PI * 28);
          const kB = Math.sin((u - v) * Math.PI * 28);
          const diamond = clamp01((kA * kB + 1) * 0.5);
          const shade = lerp(0.8, 1.18, diamond * 0.7 + fFine * 0.3);
          r = baseRgb[0] * shade;
          g = baseRgb[1] * shade;
          b = baseRgb[2] * shade;
          h = diamond * 0.65;
          rough = 0.62 + (1 - diamond) * 0.24;
          metal = 0.08;
          break;
        }
        case 'tacticalFabric': {
          const warp = Math.abs(Math.sin(u * Math.PI * 32));
          const weft = Math.abs(Math.sin(v * Math.PI * 32));
          const ripstop = ((Math.floor(u * 32) % 8 === 0) || (Math.floor(v * 32) % 8 === 0)) ? 0.14 : 0;
          const weave = clamp01((warp + weft) * 0.42 + ripstop);
          const shade = lerp(0.8, 1.16, weave * 0.65 + fLow * 0.35);
          r = lerp(accentRgb[0], baseRgb[0], weave) * shade;
          g = lerp(accentRgb[1], baseRgb[1], weave) * shade;
          b = lerp(accentRgb[2], baseRgb[2], weave) * shade;
          h = weave * 0.55;
          rough = 0.78 + (1 - weave) * 0.16;
          metal = 0.05;
          break;
        }
        case 'kevlarPlate': {
          const hexWave = Math.sin(u * Math.PI * 20) * Math.cos(v * Math.PI * 20) * 0.5 + 0.5;
          const seam = Math.abs(u - 0.5) < 0.025 || Math.abs(v - 0.5) < 0.025;
          const mix = seam ? 0.1 : hexWave * 0.7 + fMid * 0.3;
          r = lerp(accentRgb[0], baseRgb[0], mix);
          g = lerp(accentRgb[1], baseRgb[1], mix);
          b = lerp(accentRgb[2], baseRgb[2], mix);
          h = seam ? -0.3 : hexWave * 0.45 + fFine * 0.15;
          rough = seam ? 0.78 : 0.44 + (1 - hexWave) * 0.18;
          metal = seam ? 0.15 : 0.36;
          break;
        }
        case 'crate': {
          const border = u < 0.09 || u > 0.91 || v < 0.09 || v > 0.91;
          const cross = Math.abs(u - v) < 0.045;
          const slats = Math.floor(v * 6) % 2 === 0 ? 1.05 : 0.94;
          const cornerBolt =
            (u < 0.08 || u > 0.92) && (v < 0.08 || v > 0.92);
          if (cornerBolt) {
            r = 0.32;
            g = 0.35;
            b = 0.4;
            h = 0.65;
            rough = 0.35;
            metal = 0.85;
          } else {
            const isFrame = border || cross;
            const grain = Math.sin(u * 26 + fLow * 4) * 0.12 + 0.94;
            const col = isFrame ? accentRgb : baseRgb;
            r = col[0] * slats * grain;
            g = col[1] * slats * grain;
            b = col[2] * slats * grain;
            h = (isFrame ? 0.38 : 0.05) + fFine * 0.16;
            rough = isFrame ? 0.68 : 0.82;
            metal = 0.06;
          }
          break;
        }
      }

      const finalRough = clamp01(rough * roughScale);
      const finalMetal = clamp01(options.metallicOverride ?? metal);

      albedo[idx] = clampByte(r * 255);
      albedo[idx + 1] = clampByte(g * 255);
      albedo[idx + 2] = clampByte(b * 255);
      albedo[idx + 3] = 255;

      metallicRoughness[idx] = 255;
      metallicRoughness[idx + 1] = clampByte(finalRough * 255);
      metallicRoughness[idx + 2] = clampByte(finalMetal * 255);
      metallicRoughness[idx + 3] = 255;

      heights[y * s + x] = h;
    }
  }

  const normal = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) {
    const ym = (y - 1 + s) % s;
    const yp = (y + 1) % s;
    for (let x = 0; x < s; x++) {
      const xm = (x - 1 + s) % s;
      const xp = (x + 1) % s;
      const hL = heights[y * s + xm];
      const hR = heights[y * s + xp];
      const hU = heights[ym * s + x];
      const hD = heights[yp * s + x];
      const dx = (hL - hR) * bumpStrength;
      const dy = (hU - hD) * bumpStrength;
      const dz = 1.0;
      const invLen = 1 / Math.hypot(dx, dy, dz);

      const idx = (y * s + x) * 4;
      normal[idx] = clampByte((dx * invLen * 0.5 + 0.5) * 255);
      normal[idx + 1] = clampByte((dy * invLen * 0.5 + 0.5) * 255);
      normal[idx + 2] = clampByte((dz * invLen * 0.5 + 0.5) * 255);
      normal[idx + 3] = 255;
    }
  }

  return { size: s, albedo, normal, metallicRoughness };
}

function createWrapRawTexture(
  scene: Scene,
  name: string,
  data: Uint8Array,
  size: number,
  uScale: number,
  vScale: number
): RawTexture {
  const tex = new RawTexture(
    data,
    size,
    size,
    Engine.TEXTUREFORMAT_RGBA,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
    Engine.TEXTURETYPE_UNSIGNED_BYTE
  );
  tex.name = name;
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.uScale = uScale;
  tex.vScale = vScale;
  return tex;
}

export function createProceduralSurfaceSet(
  scene: Scene,
  name: string,
  kind: SurfacePresetId,
  options: SurfaceTextureOptions = {}
): ProceduralSurfaceTextures {
  const uScale = options.uScale ?? 1;
  const vScale = options.vScale ?? 1;
  const buffers = synthesizeSurfaceBuffers(kind, options.size ?? 128, options);

  const albedoTexture = createWrapRawTexture(
    scene,
    `${name}_alb`,
    buffers.albedo,
    buffers.size,
    uScale,
    vScale
  );
  const bumpTexture = createWrapRawTexture(
    scene,
    `${name}_nrm`,
    buffers.normal,
    buffers.size,
    uScale,
    vScale
  );
  const metallicTexture = createWrapRawTexture(
    scene,
    `${name}_mr`,
    buffers.metallicRoughness,
    buffers.size,
    uScale,
    vScale
  );

  return {
    albedoTexture,
    bumpTexture,
    metallicTexture,
    textures: [albedoTexture, bumpTexture, metallicTexture],
  };
}

export function applyProceduralSurfaceToMaterial(
  scene: Scene,
  mat: PBRMaterial,
  name: string,
  kind: SurfacePresetId,
  options: SurfaceTextureOptions & { bumpLevel?: number; clearCoat?: number } = {}
): BaseTexture[] {
  const set = createProceduralSurfaceSet(scene, name, kind, options);
  mat.albedoColor = Color3.White();
  mat.albedoTexture = set.albedoTexture;
  mat.bumpTexture = set.bumpTexture;
  mat.bumpTexture.level = options.bumpLevel ?? 0.85;
  mat.metallicTexture = set.metallicTexture;
  mat.useRoughnessFromMetallicTextureAlpha = false;
  mat.useRoughnessFromMetallicTextureGreen = true;
  mat.useMetallnessFromMetallicTextureBlue = true;
  mat.metallic = 1.0;
  mat.roughness = 1.0;
  if (options.clearCoat && options.clearCoat > 0) {
    mat.clearCoat.isEnabled = true;
    mat.clearCoat.intensity = options.clearCoat;
    mat.clearCoat.roughness = 0.14;
  }
  return set.textures;
}
