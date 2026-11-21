import { MapId } from '../maps/types';

export const ARENA_HALF_EXTENT = 29;

export interface MinimapStructure {
  x: number;
  z: number;
  width: number;
  depth: number;
  kind: 'building' | 'cover' | 'vehicle';
}

export const MINIMAP_LAYOUTS: Record<MapId, readonly MinimapStructure[]> = {
  urban: [
    { x: -13.5, z: 0, width: 6.0, depth: 9.0, kind: 'building' },
    { x: 13.5, z: 0, width: 6.0, depth: 9.0, kind: 'building' },
    { x: -22, z: 14, width: 6.0, depth: 6.0, kind: 'building' },
    { x: 22, z: -14, width: 6.0, depth: 6.0, kind: 'building' },
    { x: -2.5, z: -11.5, width: 2.2, depth: 4.4, kind: 'vehicle' },
    { x: 2.8, z: 11.5, width: 2.2, depth: 4.4, kind: 'vehicle' },
    { x: 0.2, z: 0.2, width: 4.4, depth: 2.1, kind: 'vehicle' },
    { x: -4.5, z: 4.5, width: 3.6, depth: 0.8, kind: 'cover' },
    { x: 4.5, z: -4.5, width: 3.6, depth: 0.8, kind: 'cover' },
    { x: -10, z: -16, width: 3.4, depth: 0.8, kind: 'cover' },
    { x: 10, z: 16, width: 3.4, depth: 0.8, kind: 'cover' },
  ],
  desert: [
    { x: 0, z: 0, width: 7.2, depth: 7.2, kind: 'building' },
    { x: -13.5, z: -9.5, width: 3.2, depth: 7.6, kind: 'vehicle' },
    { x: 13.5, z: 9.5, width: 3.2, depth: 7.6, kind: 'vehicle' },
    { x: -13.5, z: 10.5, width: 7.2, depth: 3.2, kind: 'vehicle' },
    { x: 13.5, z: -10.5, width: 7.2, depth: 3.2, kind: 'vehicle' },
    { x: -20, z: -10, width: 3.8, depth: 3.8, kind: 'building' },
    { x: 20, z: 10, width: 3.8, depth: 3.8, kind: 'building' },
    { x: -5.5, z: -15.5, width: 4.2, depth: 0.8, kind: 'cover' },
    { x: 6.5, z: -15.5, width: 4.2, depth: 0.8, kind: 'cover' },
    { x: -6.5, z: 15.5, width: 4.2, depth: 0.8, kind: 'cover' },
    { x: 5.5, z: 15.5, width: 4.2, depth: 0.8, kind: 'cover' },
  ],
  industrial: [
    { x: 0, z: 0, width: 18.0, depth: 3.2, kind: 'building' },
    { x: -11, z: 10, width: 7.5, depth: 0.8, kind: 'cover' },
    { x: -14.3, z: 14, width: 0.8, depth: 7.2, kind: 'cover' },
    { x: 11, z: -10, width: 7.5, depth: 0.8, kind: 'cover' },
    { x: 14.3, z: -14, width: 0.8, depth: 7.2, kind: 'cover' },
    { x: -12, z: -11, width: 4.2, depth: 2.6, kind: 'vehicle' },
    { x: 12, z: 11, width: 4.2, depth: 2.6, kind: 'vehicle' },
    { x: 0, z: 10.5, width: 4.6, depth: 1.8, kind: 'vehicle' },
    { x: 0, z: -10.5, width: 4.6, depth: 1.8, kind: 'vehicle' },
    { x: -21, z: 11, width: 2.8, depth: 2.8, kind: 'building' },
    { x: -21, z: 15.5, width: 2.8, depth: 2.8, kind: 'building' },
    { x: 21, z: -11, width: 2.8, depth: 2.8, kind: 'building' },
    { x: 21, z: -15.5, width: 2.8, depth: 2.8, kind: 'building' },
    { x: -4.5, z: -4.5, width: 2.4, depth: 2.4, kind: 'cover' },
    { x: 4.5, z: 4.5, width: 2.4, depth: 2.4, kind: 'cover' },
  ],
  forest: [
    { x: -13.5, z: 0, width: 5.4, depth: 6.8, kind: 'building' },
    { x: 13.5, z: 0, width: 5.4, depth: 6.8, kind: 'building' },
    { x: 0, z: 0, width: 5.0, depth: 5.0, kind: 'cover' },
    { x: -7.5, z: 12.5, width: 4.0, depth: 4.0, kind: 'cover' },
    { x: 7.5, z: -12.5, width: 4.0, depth: 4.0, kind: 'cover' },
    { x: 16.5, z: 12.0, width: 3.6, depth: 3.6, kind: 'cover' },
    { x: -16.5, z: -12.0, width: 3.6, depth: 3.6, kind: 'cover' },
    { x: -4.5, z: -13.5, width: 3.8, depth: 0.9, kind: 'vehicle' },
    { x: 4.5, z: 13.5, width: 3.8, depth: 0.9, kind: 'vehicle' },
    { x: -5.5, z: 5.2, width: 0.9, depth: 3.6, kind: 'vehicle' },
    { x: 5.5, z: -5.2, width: 0.9, depth: 3.6, kind: 'vehicle' },
  ],
};

function clampNumber(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Convert world (x, z) coordinates into North-up 2D minimap [0..100] SVG space.
 * +X maps right (50 -> 100), +Z maps North/up (50 -> 0).
 */
export function worldToMinimapPercent(
  x: number,
  z: number,
  halfExtent = ARENA_HALF_EXTENT
): { xPct: number; yPct: number } {
  const safeHalf = Math.max(1, halfExtent);
  const normX = (Number.isFinite(x) ? x : 0) / safeHalf;
  const normZ = (Number.isFinite(z) ? z : 0) / safeHalf;
  return {
    xPct: clampNumber(50 + normX * 46, 3, 97),
    yPct: clampNumber(50 - normZ * 46, 3, 97),
  };
}

export function worldSizeToMinimapPercent(
  width: number,
  depth: number,
  halfExtent = ARENA_HALF_EXTENT
): { wPct: number; hPct: number } {
  const safeHalf = Math.max(1, halfExtent);
  return {
    wPct: (Math.max(0.2, width) / safeHalf) * 46,
    hPct: (Math.max(0.2, depth) / safeHalf) * 46,
  };
}

export function yawRadToCompassDeg(yawRad: number): number {
  if (!Number.isFinite(yawRad)) return 0;
  const deg = ((yawRad * 180) / Math.PI) % 360;
  return deg < 0 ? deg + 360 : deg;
}
