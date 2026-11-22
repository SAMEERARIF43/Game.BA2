export type GameMode = 'tdm' | 'ffa' | 'bomb';
export type BombSiteId = 'A' | 'B';
export type BombPhase = 'unplanted' | 'planted' | 'defused' | 'detonated' | 'round_end';

export const GAME_MODE_IDS: readonly GameMode[] = ['tdm', 'ffa', 'bomb'];

export const TDM_DEFAULT_KILL_LIMIT = 30;
export const FFA_DEFAULT_KILL_LIMIT = 20;
export const DEFAULT_MATCH_TIME_LIMIT_SEC = 300;
export const TDM_RESPAWN_DELAY_SEC = 3;
export const FFA_RESPAWN_DELAY_SEC = 2.5;

export const BOMB_ROUNDS_TO_WIN = 5;
export const BOMB_ROUND_DURATION_SEC = 90;
export const BOMB_PLANT_DURATION_SEC = 3.5;
export const BOMB_DEFUSE_DURATION_SEC = 4.5;
export const BOMB_DETONATE_DURATION_SEC = 40;
export const BOMB_ROUND_END_DELAY_SEC = 3.0;
export const BOMB_SITE_RADIUS = 4.5;

export interface GameModeMeta {
  id: GameMode;
  label: string;
  shortLabel: string;
  tagline: string;
  targetLabel: string;
}

export const GAME_MODE_META: Record<GameMode, GameModeMeta> = {
  tdm: {
    id: 'tdm',
    label: 'Team Deathmatch',
    shortLabel: 'TDM',
    tagline: '6v6 tactical squad combat. First team to 30 eliminations.',
    targetLabel: 'First to 30 Kills',
  },
  ffa: {
    id: 'ffa',
    label: 'Free-For-All',
    shortLabel: 'FFA',
    tagline: 'Every operator for themselves. First to 20 eliminations wins.',
    targetLabel: 'First to 20 Kills',
  },
  bomb: {
    id: 'bomb',
    label: 'Secure Bomb',
    shortLabel: 'BOMB',
    tagline: 'Round-based Plant & Defuse. First squad to 5 round wins.',
    targetLabel: 'First to 5 Rounds',
  },
};

export function normalizeGameMode(raw: unknown, fallback: GameMode = 'tdm'): GameMode {
  if (raw === 'tdm' || raw === 'ffa' || raw === 'bomb') {
    return raw;
  }
  return fallback;
}

export function getModeDefaultLimits(mode: GameMode): {
  killLimit: number;
  timeLimitSec: number;
  respawnDelaySec: number;
} {
  if (mode === 'ffa') {
    return {
      killLimit: FFA_DEFAULT_KILL_LIMIT,
      timeLimitSec: DEFAULT_MATCH_TIME_LIMIT_SEC,
      respawnDelaySec: FFA_RESPAWN_DELAY_SEC,
    };
  }
  if (mode === 'bomb') {
    return {
      killLimit: BOMB_ROUNDS_TO_WIN,
      timeLimitSec: BOMB_ROUND_DURATION_SEC,
      respawnDelaySec: 0,
    };
  }
  return {
    killLimit: TDM_DEFAULT_KILL_LIMIT,
    timeLimitSec: DEFAULT_MATCH_TIME_LIMIT_SEC,
    respawnDelaySec: TDM_RESPAWN_DELAY_SEC,
  };
}

export function isHostile(
  mode: GameMode,
  actorA: { id: string; team: string },
  actorB: { id: string; team: string },
  friendlyFire = false,
): boolean {
  if (!actorA.id || !actorB.id || actorA.id === actorB.id) {
    return false;
  }
  if (mode === 'ffa') {
    return true;
  }
  if (friendlyFire) {
    return true;
  }
  return actorA.team !== actorB.team;
}

export function sortFfaParticipants<
  T extends { id: string; kills: number; deaths: number; name?: string },
>(participants: readonly T[]): T[] {
  return [...participants].sort((a, b) => {
    if (b.kills !== a.kills) return b.kills - a.kills;
    if (a.deaths !== b.deaths) return a.deaths - b.deaths;
    return (a.name ?? a.id).localeCompare(b.name ?? b.id);
  });
}
