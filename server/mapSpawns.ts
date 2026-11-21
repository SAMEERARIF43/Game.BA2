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
  id: 'shotgun' | 'ak47' | 'smg' | 'sniper' | 'pistol' | 'knife';
  name: string;
  damage: number;
  headshotMultiplier: number;
  minFireIntervalMs: number;
  range: number;
  pellets?: number;
  isMelee?: boolean;
}

export const SERVER_WEAPONS: Record<string, ServerWeaponSpec> = {
  shotgun: {
    id: 'shotgun',
    name: 'M870 Combat Shotgun',
    damage: 16,
    headshotMultiplier: 1.5,
    minFireIntervalMs: 750,
    range: 45,
    pellets: 8,
  },
  ak47: {
    id: 'ak47',
    name: 'AK-47 Heavy Rifle',
    damage: 34,
    headshotMultiplier: 2.0,
    minFireIntervalMs: 65,
    range: 185,
  },
  smg: {
    id: 'smg',
    name: 'Vector-9 SMG',
    damage: 21,
    headshotMultiplier: 1.85,
    minFireIntervalMs: 42,
    range: 125,
  },
  sniper: {
    id: 'sniper',
    name: 'AWP-50 Sniper',
    damage: 115,
    headshotMultiplier: 2.5,
    minFireIntervalMs: 850,
    range: 300,
  },
  pistol: {
    id: 'pistol',
    name: 'USP-45 Tactical',
    damage: 38,
    headshotMultiplier: 2.2,
    minFireIntervalMs: 165,
    range: 120,
  },
  knife: {
    id: 'knife',
    name: 'K-Bar Combat Knife',
    damage: 75,
    headshotMultiplier: 1.6,
    minFireIntervalMs: 400,
    range: 2.8,
    isMelee: true,
  },
};

export function isValidMapId(value: string): value is ServerMapId {
  return value === 'urban' || value === 'desert' || value === 'industrial' || value === 'forest';
}
