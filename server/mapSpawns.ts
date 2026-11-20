export type ServerMapId = 'urban' | 'desert' | 'industrial' | 'forest';

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface ServerMapLayout {
  blueSpawns: Vec3Tuple[];
  redSpawns: Vec3Tuple[];
  waypoints: Vec3Tuple[];
}

export const SERVER_MAP_LAYOUTS: Record<ServerMapId, ServerMapLayout> = {
  urban: {
    blueSpawns: [
      { x: -22, y: 0, z: -20 },
      { x: -14, y: 0, z: -23 },
      { x: 0, y: 0, z: -23 },
      { x: 14, y: 0, z: -22 },
      { x: 22, y: 0, z: -19 },
    ],
    redSpawns: [
      { x: -22, y: 0, z: 20 },
      { x: -14, y: 0, z: 23 },
      { x: 0, y: 0, z: 23 },
      { x: 14, y: 0, z: 22 },
      { x: 22, y: 0, z: 19 },
    ],
    waypoints: [
      { x: -18, y: 0, z: -16 },
      { x: 0, y: 0, z: -17 },
      { x: 18, y: 0, z: -16 },
      { x: -21, y: 0, z: -6 },
      { x: -8, y: 0, z: -8 },
      { x: 7, y: 0, z: -8 },
      { x: 21, y: 0, z: -6 },
      { x: -14, y: 0, z: 0 },
      { x: 0, y: 0, z: -1 },
      { x: 14, y: 0, z: 0 },
      { x: -21, y: 0, z: 6 },
      { x: -8, y: 0, z: 8 },
      { x: 7, y: 0, z: 8 },
      { x: 21, y: 0, z: 6 },
      { x: -18, y: 0, z: 16 },
      { x: 0, y: 0, z: 17 },
      { x: 18, y: 0, z: 16 },
    ],
  },
  desert: {
    blueSpawns: [
      { x: -22, y: 0, z: -21 },
      { x: -12, y: 0, z: -23 },
      { x: 0, y: 0, z: -23 },
      { x: 12, y: 0, z: -23 },
      { x: 22, y: 0, z: -20 },
    ],
    redSpawns: [
      { x: -22, y: 0, z: 21 },
      { x: -12, y: 0, z: 23 },
      { x: 0, y: 0, z: 23 },
      { x: 12, y: 0, z: 23 },
      { x: 22, y: 0, z: 20 },
    ],
    waypoints: [
      { x: -18, y: 0, z: -16 },
      { x: 0, y: 0, z: -17 },
      { x: 18, y: 0, z: -16 },
      { x: -20, y: 0, z: -4 },
      { x: -8, y: 0, z: -7 },
      { x: 8, y: 0, z: -7 },
      { x: 20, y: 0, z: -4 },
      { x: -11, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 11, y: 0, z: 0 },
      { x: -20, y: 0, z: 5 },
      { x: -8, y: 0, z: 7 },
      { x: 8, y: 0, z: 7 },
      { x: 20, y: 0, z: 5 },
      { x: -18, y: 0, z: 16 },
      { x: 0, y: 0, z: 17 },
      { x: 18, y: 0, z: 16 },
    ],
  },
  industrial: {
    blueSpawns: [
      { x: -21, y: 0, z: -21 },
      { x: -11, y: 0, z: -23 },
      { x: 0, y: 0, z: -23 },
      { x: 11, y: 0, z: -23 },
      { x: 21, y: 0, z: -21 },
    ],
    redSpawns: [
      { x: -21, y: 0, z: 21 },
      { x: -11, y: 0, z: 23 },
      { x: 0, y: 0, z: 23 },
      { x: 11, y: 0, z: 23 },
      { x: 21, y: 0, z: 21 },
    ],
    waypoints: [
      { x: -18, y: 0, z: -16 },
      { x: 0, y: 0, z: -16 },
      { x: 18, y: 0, z: -16 },
      { x: -19, y: 0, z: -6 },
      { x: -7, y: 0, z: -7 },
      { x: 7, y: 0, z: -7 },
      { x: 19, y: 0, z: -6 },
      { x: -12, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 12, y: 0, z: 0 },
      { x: -19, y: 0, z: 6 },
      { x: -7, y: 0, z: 7 },
      { x: 7, y: 0, z: 7 },
      { x: 19, y: 0, z: 6 },
      { x: -18, y: 0, z: 16 },
      { x: 0, y: 0, z: 16 },
      { x: 18, y: 0, z: 16 },
    ],
  },
  forest: {
    blueSpawns: [
      { x: -21, y: 0, z: -21 },
      { x: -11, y: 0, z: -23 },
      { x: 0, y: 0, z: -23 },
      { x: 11, y: 0, z: -23 },
      { x: 21, y: 0, z: -21 },
    ],
    redSpawns: [
      { x: -21, y: 0, z: 21 },
      { x: -11, y: 0, z: 23 },
      { x: 0, y: 0, z: 23 },
      { x: 11, y: 0, z: 23 },
      { x: 21, y: 0, z: 21 },
    ],
    waypoints: [
      { x: -18, y: 0, z: -16 },
      { x: 0, y: 0, z: -17 },
      { x: 18, y: 0, z: -16 },
      { x: -21, y: 0, z: -5 },
      { x: -8, y: 0, z: -8 },
      { x: 8, y: 0, z: -8 },
      { x: 21, y: 0, z: -5 },
      { x: -13, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 13, y: 0, z: 0 },
      { x: -21, y: 0, z: 5 },
      { x: -8, y: 0, z: 8 },
      { x: 8, y: 0, z: 8 },
      { x: 21, y: 0, z: 5 },
      { x: -18, y: 0, z: 16 },
      { x: 0, y: 0, z: 17 },
      { x: 18, y: 0, z: 16 },
    ],
  },
};

export interface ServerWeaponSpec {
  id: 'm4a1' | 'mp5' | 'intervention' | 'm1911';
  name: string;
  damage: number;
  headshotMultiplier: number;
  minFireIntervalMs: number;
  range: number;
}

export const SERVER_WEAPONS: Record<string, ServerWeaponSpec> = {
  m4a1: {
    id: 'm4a1',
    name: 'M4A1 Tactical',
    damage: 28,
    headshotMultiplier: 2.0,
    minFireIntervalMs: 55,
    range: 180,
  },
  mp5: {
    id: 'mp5',
    name: 'MP5-SD',
    damage: 24,
    headshotMultiplier: 1.85,
    minFireIntervalMs: 48,
    range: 130,
  },
  m1911: {
    id: 'm1911',
    name: 'M1911 Sidearm',
    damage: 36,
    headshotMultiplier: 2.2,
    minFireIntervalMs: 176,
    range: 120,
  },
  intervention: {
    id: 'intervention',
    name: 'Intervention .50',
    damage: 110,
    headshotMultiplier: 2.5,
    minFireIntervalMs: 833,
    range: 300,
  },
};

export function isValidMapId(value: string): value is ServerMapId {
  return value === 'urban' || value === 'desert' || value === 'industrial' || value === 'forest';
}
