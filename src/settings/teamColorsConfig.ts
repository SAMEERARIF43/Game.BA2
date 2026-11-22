import { GameMode, TeamColorsConfig } from '../game/types';
import { TeamId } from '../maps/types';
import { normalizeCrosshairColor } from './crosshairConfig';

export const DEFAULT_TEAM_COLORS: TeamColorsConfig = {
  ally: '#38bdf8',
  enemy: '#ef4444',
};

export const TEAM_COLOR_SWATCHES: readonly {
  id: string;
  label: string;
  hex: string;
}[] = [
  { id: 'cyan', label: 'Tactical Cyan', hex: '#38bdf8' },
  { id: 'cobalt', label: 'Cobalt Blue', hex: '#3b82f6' },
  { id: 'emerald', label: 'Emerald Green', hex: '#22c55e' },
  { id: 'teal', label: 'Mint Teal', hex: '#14b8a6' },
  { id: 'amber', label: 'Amber Gold', hex: '#fbbf24' },
  { id: 'orange', label: 'Blaze Orange', hex: '#f97316' },
  { id: 'crimson', label: 'Crimson Red', hex: '#ef4444' },
  { id: 'magenta', label: 'Neon Magenta', hex: '#e879f9' },
];

export const TEAM_COLOR_PRESET_PAIRS: readonly {
  id: string;
  label: string;
  description: string;
  colors: TeamColorsConfig;
}[] = [
  {
    id: 'default',
    label: 'Default Tactical',
    description: 'Cyan allies · Crimson enemies',
    colors: { ally: '#38bdf8', enemy: '#ef4444' },
  },
  {
    id: 'colorblind_amber',
    label: 'Colorblind Safe',
    description: 'Cyan allies · High-vis Amber enemies',
    colors: { ally: '#38bdf8', enemy: '#fbbf24' },
  },
  {
    id: 'high_contrast',
    label: 'High-Contrast',
    description: 'Emerald allies · Neon Magenta enemies',
    colors: { ally: '#22c55e', enemy: '#e879f9' },
  },
  {
    id: 'blaze_teal',
    label: 'Teal & Blaze',
    description: 'Mint Teal allies · Blaze Orange enemies',
    colors: { ally: '#14b8a6', enemy: '#f97316' },
  },
];

export function normalizeTeamColor(raw: unknown, fallback: string): string {
  return normalizeCrosshairColor(raw, fallback);
}

export function cloneTeamColors(
  source: TeamColorsConfig = DEFAULT_TEAM_COLORS
): TeamColorsConfig {
  return {
    ally: source.ally,
    enemy: source.enemy,
  };
}

export function validateTeamColors(
  raw: unknown,
  fallback: TeamColorsConfig = DEFAULT_TEAM_COLORS
): TeamColorsConfig {
  const safeFallback = {
    ally: normalizeTeamColor(fallback?.ally, DEFAULT_TEAM_COLORS.ally),
    enemy: normalizeTeamColor(fallback?.enemy, DEFAULT_TEAM_COLORS.enemy),
  };
  if (!raw || typeof raw !== 'object') {
    return safeFallback;
  }
  const obj = raw as Record<string, unknown>;
  return {
    ally: normalizeTeamColor(obj.ally, safeFallback.ally),
    enemy: normalizeTeamColor(obj.enemy, safeFallback.enemy),
  };
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = normalizeTeamColor(hex, '#38bdf8').slice(1);
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export interface ResolvedSideColors {
  allyHex: string;
  enemyHex: string;
  blueHex: string;
  redHex: string;
}

export function resolveSideColors(
  teamColors: Partial<TeamColorsConfig> | undefined,
  localTeam: TeamId = 'blue',
  mode: GameMode = 'tdm'
): ResolvedSideColors {
  const validated = validateTeamColors(teamColors, DEFAULT_TEAM_COLORS);
  if (mode === 'ffa') {
    return {
      allyHex: validated.ally,
      enemyHex: validated.enemy,
      blueHex: validated.ally,
      redHex: validated.enemy,
    };
  }
  const isBlueLocal = localTeam !== 'red';
  return {
    allyHex: validated.ally,
    enemyHex: validated.enemy,
    blueHex: isBlueLocal ? validated.ally : validated.enemy,
    redHex: isBlueLocal ? validated.enemy : validated.ally,
  };
}
