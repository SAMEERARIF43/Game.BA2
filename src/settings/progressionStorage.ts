export const PROGRESSION_STORAGE_KEY = 'strike_force_progression_v1';

export interface ProgressionProfile {
  xp: number;
  totalKills: number;
  totalHeadshots: number;
  matchesPlayed: number;
  matchesWon: number;
}

export interface RankTier {
  level: number;
  title: string;
  minXp: number;
}

export const RANK_TIERS: RankTier[] = [
  { level: 1, title: 'Private', minXp: 0 },
  { level: 2, title: 'Private First Class', minXp: 300 },
  { level: 3, title: 'Lance Corporal', minXp: 750 },
  { level: 4, title: 'Corporal', minXp: 1400 },
  { level: 5, title: 'Sergeant', minXp: 2300 },
  { level: 6, title: 'Staff Sergeant', minXp: 3500 },
  { level: 7, title: 'Lieutenant', minXp: 5000 },
  { level: 8, title: 'Captain', minXp: 7000 },
  { level: 9, title: 'Major', minXp: 9500 },
  { level: 10, title: 'Commander', minXp: 13000 },
];

export interface RankSummary {
  level: number;
  title: string;
  xp: number;
  currentTierXp: number;
  nextTierXp: number | null;
  progressPct: number;
}

const DEFAULT_PROGRESSION: ProgressionProfile = {
  xp: 0,
  totalKills: 0,
  totalHeadshots: 0,
  matchesPlayed: 0,
  matchesWon: 0,
};

function safeInt(val: unknown, fallback = 0): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(0, Math.floor(val));
}

export function validateProgression(raw: unknown): ProgressionProfile {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PROGRESSION };
  }
  const obj = raw as Record<string, unknown>;
  return {
    xp: safeInt(obj.xp),
    totalKills: safeInt(obj.totalKills),
    totalHeadshots: safeInt(obj.totalHeadshots),
    matchesPlayed: safeInt(obj.matchesPlayed),
    matchesWon: safeInt(obj.matchesWon),
  };
}

export function loadProgression(): ProgressionProfile {
  try {
    const raw = window.localStorage.getItem(PROGRESSION_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROGRESSION };
    return validateProgression(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PROGRESSION };
  }
}

export function saveProgression(profile: ProgressionProfile): ProgressionProfile {
  const clean = validateProgression(profile);
  try {
    window.localStorage.setItem(PROGRESSION_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Ignore storage quota / private mode failures
  }
  return clean;
}

export function addProgressionReward(
  xpDelta: number,
  delta: Partial<Omit<ProgressionProfile, 'xp'>> = {}
): ProgressionProfile {
  const current = loadProgression();
  const next: ProgressionProfile = {
    xp: current.xp + Math.max(0, Math.round(xpDelta)),
    totalKills: current.totalKills + Math.max(0, delta.totalKills ?? 0),
    totalHeadshots: current.totalHeadshots + Math.max(0, delta.totalHeadshots ?? 0),
    matchesPlayed: current.matchesPlayed + Math.max(0, delta.matchesPlayed ?? 0),
    matchesWon: current.matchesWon + Math.max(0, delta.matchesWon ?? 0),
  };
  return saveProgression(next);
}

export function getRankSummary(xp: number): RankSummary {
  const cleanXp = Math.max(0, Math.floor(xp));
  let current = RANK_TIERS[0];
  let next: RankTier | null = RANK_TIERS[1] ?? null;

  for (let i = 0; i < RANK_TIERS.length; i++) {
    if (cleanXp >= RANK_TIERS[i].minXp) {
      current = RANK_TIERS[i];
      next = RANK_TIERS[i + 1] ?? null;
    } else {
      break;
    }
  }

  let progressPct = 100;
  if (next) {
    const span = Math.max(1, next.minXp - current.minXp);
    progressPct = Math.max(0, Math.min(100, Math.round(((cleanXp - current.minXp) / span) * 100)));
  }

  return {
    level: current.level,
    title: current.title,
    xp: cleanXp,
    currentTierXp: current.minXp,
    nextTierXp: next ? next.minXp : null,
    progressPct,
  };
}
