import { MapId, TeamId } from '../maps/types';

export type WeaponId = 'm4a1' | 'mp5' | 'intervention' | 'm1911';

export type FireMode = 'auto' | 'semi';

export type HitZone = 'head' | 'body';

export type Stance = 'stand' | 'crouch' | 'sprint' | 'slide';

export type MatchPhase = 'menu' | 'playing' | 'paused' | 'ended';

export interface WeaponConfig {
  id: WeaponId;
  slot: 1 | 2 | 3 | 4;
  name: string;
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
}

export const WEAPONS: Record<WeaponId, WeaponConfig> = {
  m4a1: {
    id: 'm4a1',
    slot: 1,
    name: 'M4A1 Tactical',
    category: 'Assault Rifle',
    fireMode: 'auto',
    rpm: 720,
    damage: 28,
    headshotMultiplier: 2.0,
    magSize: 30,
    reserveMax: 120,
    reloadTimeSec: 1.75,
    hipSpread: 0.022,
    adsSpread: 0.002,
    recoilPitch: 0.022,
    recoilYaw: 0.009,
    adsFovRatio: 0.74,
    range: 180,
    suppressed: false,
  },
  mp5: {
    id: 'mp5',
    slot: 2,
    name: 'MP5-SD Subgun',
    category: 'Submachine Gun',
    fireMode: 'auto',
    rpm: 900,
    damage: 24,
    headshotMultiplier: 1.85,
    magSize: 35,
    reserveMax: 140,
    reloadTimeSec: 1.4,
    hipSpread: 0.015,
    adsSpread: 0.0035,
    recoilPitch: 0.014,
    recoilYaw: 0.007,
    adsFovRatio: 0.8,
    range: 130,
    suppressed: true,
  },
  intervention: {
    id: 'intervention',
    slot: 3,
    name: 'Intervention .50',
    category: 'Heavy Sniper',
    fireMode: 'semi',
    rpm: 72,
    damage: 110,
    headshotMultiplier: 2.5,
    magSize: 8,
    reserveMax: 32,
    reloadTimeSec: 2.4,
    hipSpread: 0.055,
    adsSpread: 0.0001,
    recoilPitch: 0.085,
    recoilYaw: 0.015,
    adsFovRatio: 0.25,
    range: 300,
    suppressed: false,
  },
  m1911: {
    id: 'm1911',
    slot: 4,
    name: 'M1911 Sidearm',
    category: 'Sidearm',
    fireMode: 'semi',
    rpm: 340,
    damage: 36,
    headshotMultiplier: 2.2,
    magSize: 12,
    reserveMax: 48,
    reloadTimeSec: 1.15,
    hipSpread: 0.015,
    adsSpread: 0.0016,
    recoilPitch: 0.030,
    recoilYaw: 0.006,
    adsFovRatio: 0.84,
    range: 120,
    suppressed: false,
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
}
