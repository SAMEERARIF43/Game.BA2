import { MapId, TeamId } from '../maps/types';

export type GunId = 'shotgun' | 'ak47' | 'smg' | 'sniper' | 'pistol';

export type WeaponId = GunId | 'knife';

export const GUN_IDS: readonly GunId[] = ['shotgun', 'ak47', 'smg', 'sniper', 'pistol'];

export const WEAPON_IDS: readonly WeaponId[] = ['shotgun', 'ak47', 'smg', 'sniper', 'pistol', 'knife'];

export type KnifeCharmId =
  | 'tactical_tag'
  | 'crimson_fang'
  | 'gold_bullet'
  | 'cyber_core'
  | 'emerald_prism';

export const KNIFE_CHARM_IDS: readonly KnifeCharmId[] = [
  'tactical_tag',
  'crimson_fang',
  'gold_bullet',
  'cyber_core',
  'emerald_prism',
];

export interface KnifeCharmConfig {
  id: KnifeCharmId;
  name: string;
  finish: string;
  accentHex: string;
  metallic: number;
  roughness: number;
  emissiveHex?: string;
}

export const KNIFE_CHARMS: Record<KnifeCharmId, KnifeCharmConfig> = {
  tactical_tag: {
    id: 'tactical_tag',
    name: 'Dog Tag',
    finish: 'Brushed Titanium',
    accentHex: '#94a3b8',
    metallic: 0.92,
    roughness: 0.28,
  },
  crimson_fang: {
    id: 'crimson_fang',
    name: 'Crimson Fang',
    finish: 'Anodized Ruby',
    accentHex: '#ef4444',
    metallic: 0.85,
    roughness: 0.24,
    emissiveHex: '#7f1d1d',
  },
  gold_bullet: {
    id: 'gold_bullet',
    name: '24K Brass Shell',
    finish: 'Polished Gold',
    accentHex: '#f59e0b',
    metallic: 0.98,
    roughness: 0.18,
    emissiveHex: '#78350f',
  },
  cyber_core: {
    id: 'cyber_core',
    name: 'Cobalt Prism',
    finish: 'Electric Cyan',
    accentHex: '#38bdf8',
    metallic: 0.55,
    roughness: 0.16,
    emissiveHex: '#0284c7',
  },
  emerald_prism: {
    id: 'emerald_prism',
    name: 'Recon Emerald',
    finish: 'Tactical Emerald',
    accentHex: '#10b981',
    metallic: 0.65,
    roughness: 0.2,
    emissiveHex: '#047857',
  },
};

export type FireMode = 'auto' | 'semi';

export type HitZone = 'head' | 'body';

export type Stance = 'stand' | 'crouch' | 'sprint' | 'slide';

export type MatchPhase = 'menu' | 'playing' | 'paused' | 'ended';

export interface WeaponConfig {
  id: WeaponId;
  slot: 1 | 2;
  name: string;
  shortName: string;
  category: string;
  fireMode: FireMode;
  rpm: number;
  damage: number;
  headshotMultiplier: number;
  magSize: number;
  reserveMax: number;
  reloadTimeSec: number;
  hipSpread: number;
  adsSpread: number;
  recoilPitch: number;
  recoilYaw: number;
  adsFovRatio: number;
  range: number;
  suppressed: boolean;
  pellets?: number;
  isMelee?: boolean;
  moveSpeedMultiplier?: number;
}

export const WEAPONS: Record<WeaponId, WeaponConfig> = {
  shotgun: {
    id: 'shotgun',
    slot: 1,
    name: 'M870 Combat Shotgun',
    shortName: 'Shotgun',
    category: 'Pump Shotgun',
    fireMode: 'semi',
    rpm: 78,
    pellets: 8,
    damage: 16,
    headshotMultiplier: 1.5,
    magSize: 8,
    reserveMax: 40,
    reloadTimeSec: 2.0,
    hipSpread: 0.056,
    adsSpread: 0.036,
    recoilPitch: 0.068,
    recoilYaw: 0.016,
    adsFovRatio: 0.84,
    range: 45,
    suppressed: false,
    moveSpeedMultiplier: 1.0,
  },
  ak47: {
    id: 'ak47',
    slot: 1,
    name: 'AK-47 Heavy Rifle',
    shortName: 'AK-47',
    category: 'Assault Rifle',
    fireMode: 'auto',
    rpm: 600,
    damage: 34,
    headshotMultiplier: 2.0,
    magSize: 30,
    reserveMax: 120,
    reloadTimeSec: 1.85,
    hipSpread: 0.024,
    adsSpread: 0.0024,
    recoilPitch: 0.032,
    recoilYaw: 0.013,
    adsFovRatio: 0.74,
    range: 185,
    suppressed: false,
    moveSpeedMultiplier: 1.0,
  },
  smg: {
    id: 'smg',
    slot: 1,
    name: 'Vector-9 SMG',
    shortName: 'SMG',
    category: 'Submachine Gun',
    fireMode: 'auto',
    rpm: 960,
    damage: 21,
    headshotMultiplier: 1.85,
    magSize: 36,
    reserveMax: 144,
    reloadTimeSec: 1.35,
    hipSpread: 0.013,
    adsSpread: 0.0032,
    recoilPitch: 0.013,
    recoilYaw: 0.006,
    adsFovRatio: 0.82,
    range: 125,
    suppressed: false,
    moveSpeedMultiplier: 1.08,
  },
  sniper: {
    id: 'sniper',
    slot: 1,
    name: 'AWP-50 Sniper',
    shortName: 'Sniper',
    category: 'Precision Rifle',
    fireMode: 'semi',
    rpm: 60,
    damage: 115,
    headshotMultiplier: 2.5,
    magSize: 6,
    reserveMax: 30,
    reloadTimeSec: 2.4,
    hipSpread: 0.058,
    adsSpread: 0.0001,
    recoilPitch: 0.088,
    recoilYaw: 0.015,
    adsFovRatio: 0.25,
    range: 300,
    suppressed: false,
    moveSpeedMultiplier: 0.96,
  },
  pistol: {
    id: 'pistol',
    slot: 1,
    name: 'USP-45 Tactical',
    shortName: 'Pistol',
    category: 'Sidearm',
    fireMode: 'semi',
    rpm: 360,
    damage: 38,
    headshotMultiplier: 2.2,
    magSize: 12,
    reserveMax: 60,
    reloadTimeSec: 1.15,
    hipSpread: 0.014,
    adsSpread: 0.0015,
    recoilPitch: 0.028,
    recoilYaw: 0.006,
    adsFovRatio: 0.86,
    range: 120,
    suppressed: false,
    moveSpeedMultiplier: 1.05,
  },
  knife: {
    id: 'knife',
    slot: 2,
    name: 'K-Bar Combat Knife',
    shortName: 'Knife',
    category: 'Tactical Melee',
    fireMode: 'semi',
    rpm: 140,
    damage: 75,
    headshotMultiplier: 1.6,
    magSize: 0,
    reserveMax: 0,
    reloadTimeSec: 0,
    hipSpread: 0.001,
    adsSpread: 0.001,
    recoilPitch: 0.01,
    recoilYaw: 0.005,
    adsFovRatio: 0.94,
    range: 2.8,
    suppressed: true,
    isMelee: true,
    moveSpeedMultiplier: 1.12,
  },
};

export interface WeaponRuntimeState {
  id: WeaponId;
  ammoInMag: number;
  reserveAmmo: number;
}

export interface HitMarkerState {
  id: number;
  zone: HitZone;
  killed: boolean;
  timestamp: number;
}

export interface KillFeedEntry {
  id: number;
  killerName: string;
  killerTeam: TeamId;
  victimName: string;
  victimTeam: TeamId;
  weaponName: string;
  headshot: boolean;
  distanceMeters: number;
  timestamp: number;
}

export interface MatchParticipant {
  id: string;
  name: string;
  team: TeamId;
  isPlayer: boolean;
  kills: number;
  deaths: number;
  isAlive: boolean;
  respawnTimer: number;
}

export interface MatchSnapshot {
  phase: MatchPhase;
  mapId: MapId;
  mapName: string;
  blueScore: number;
  redScore: number;
  killLimit: number;
  timeRemainingSec: number;
  winner: TeamId | 'draw' | null;
  participants: MatchParticipant[];
  killFeed: KillFeedEntry[];
}

export type GraphicsQuality = 'LOW' | 'MEDIUM' | 'HIGH';

export interface DamageIndicator {
  id: number;
  angleDeg: number;
  timestamp: number;
}

export type KillstreakId = 'uav' | 'airstrike' | 'overdrive';

export interface KillstreakSlotState {
  id: KillstreakId;
  key: string;
  name: string;
  requiredKills: number;
  unlocked: boolean;
  active: boolean;
  remainingSec: number;
}

export interface KillstreakBanner {
  id: number;
  title: string;
  subtitle: string;
  timestamp: number;
}

export interface ScorePopup {
  id: number;
  points: number;
  label: string;
  sublabel?: string;
  isHeadshot: boolean;
  timestamp: number;
}

export interface RadarBlip {
  id: string;
  relX: number;
  relZ: number;
  team: TeamId;
}

export interface KillerBannerInfo {
  name: string;
  team: TeamId;
  weaponName: string;
  distanceMeters: number;
  headshot: boolean;
  killerHpRemaining?: number;
}

export interface HudState {
  isPointerLocked: boolean;
  health: number;
  maxHealth: number;
  isAlive: boolean;
  respawnTimer: number;
  lastDamageTimestamp: number;
  damageIndicators: DamageIndicator[];
  lastKillerName: string | null;
  lastKillerWeapon: string | null;
  killerBanner: KillerBannerInfo | null;
  stance: Stance;
  isGrounded: boolean;
  isAds: boolean;
  adsBlend: number;
  speed: number;
  headingDeg: number;
  activeWeapon: WeaponConfig;
  equippedGunId: GunId;
  queuedGunId: GunId;
  knifeCharmId: KnifeCharmId;
  isGunSwitchLocked: boolean;
  gunLockMessage: string | null;
  weaponSlots: WeaponRuntimeState[];
  isReloading: boolean;
  reloadProgress: number;
  crosshairSpreadPx: number;
  hitMarker: HitMarkerState | null;
  shotsFired: number;
  shotsHit: number;
  headshots: number;
  eliminations: number;
  currentStreak: number;
  killstreaks: KillstreakSlotState[];
  uavActive: boolean;
  uavPulseProgress: number;
  overdriveActive: boolean;
  overdriveRemainingSec: number;
  killstreakBanner: KillstreakBanner | null;
  scorePopups: ScorePopup[];
  radarBlips: RadarBlip[];
  xp: number;
  sessionXpEarned: number;
  rankLevel: number;
  rankTitle: string;
  rankProgressPct: number;
  rangeDistanceMeters: number | null;
  targetingEnemy: boolean;
  scopeMagnification: 4 | 6 | 8;
  showScoreboard: boolean;
  showOnboarding: boolean;
  lowHealthPulse: boolean;
  fps: number;
  match: MatchSnapshot;
}

export interface GameSettings {
  callsign: string;
  sensitivity: number;
  adsSensitivityMultiplier: number;
  invertY: boolean;
  fovDeg: number;
  showFps: boolean;
  volume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
  graphicsQuality: GraphicsQuality;
  killLimit: number;
  botsPerTeam: number;
  screenShakeScale: number;
  selectedGunId: GunId;
  knifeCharmId: KnifeCharmId;
}
