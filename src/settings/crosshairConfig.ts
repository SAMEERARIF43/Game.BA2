import {
  CrosshairConfig,
  CrosshairSettingsMap,
  CrosshairStyle,
  WEAPON_IDS,
  WeaponId,
} from '../game/types';

export const CROSSHAIR_SIZE_MIN = 2;
export const CROSSHAIR_SIZE_MAX = 24;
export const CROSSHAIR_GAP_MIN = 0;
export const CROSSHAIR_GAP_MAX = 28;

export const CROSSHAIR_COLOR_PRESETS: readonly {
  id: string;
  label: string;
  hex: string;
}[] = [
  { id: 'white', label: 'Tactical White', hex: '#f8fafc' },
  { id: 'emerald', label: 'Viper Green', hex: '#22c55e' },
  { id: 'cyan', label: 'Holo Cyan', hex: '#38bdf8' },
  { id: 'amber', label: 'Amber Gold', hex: '#fbbf24' },
  { id: 'crimson', label: 'Crimson Red', hex: '#ef4444' },
  { id: 'magenta', label: 'Neon Magenta', hex: '#e879f9' },
];

export const DEFAULT_CROSSHAIR_SETTINGS: CrosshairSettingsMap = {
  shotgun: { size: 10, color: '#f8fafc', gap: 14, style: 'dynamic' },
  ak47: { size: 9, color: '#f8fafc', gap: 8, style: 'dynamic' },
  smg: { size: 8, color: '#38bdf8', gap: 7, style: 'dynamic' },
  sniper: { size: 12, color: '#22c55e', gap: 12, style: 'static' },
  pistol: { size: 7, color: '#f8fafc', gap: 6, style: 'dynamic' },
  knife: { size: 5, color: '#fbbf24', gap: 4, style: 'static' },
};

const HEX_6_RE = /^#([0-9a-f]{6})$/i;
const HEX_3_RE = /^#([0-9a-f]{3})$/i;

export function normalizeCrosshairColor(raw: unknown, fallback = '#f8fafc'): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  const m6 = HEX_6_RE.exec(trimmed);
  if (m6) {
    return `#${m6[1].toLowerCase()}`;
  }
  const m3 = HEX_3_RE.exec(trimmed);
  if (m3) {
    const [r, g, b] = m3[1].toLowerCase().split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

export function normalizeCrosshairStyle(
  raw: unknown,
  fallback: CrosshairStyle = 'dynamic'
): CrosshairStyle {
  return raw === 'dynamic' || raw === 'static' ? raw : fallback;
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.round(Math.max(min, Math.min(max, raw)));
}

export function validateCrosshairConfig(
  raw: unknown,
  fallback: CrosshairConfig = DEFAULT_CROSSHAIR_SETTINGS.ak47
): CrosshairConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...fallback };
  }
  const obj = raw as Record<string, unknown>;
  return {
    size: clampInt(obj.size, CROSSHAIR_SIZE_MIN, CROSSHAIR_SIZE_MAX, fallback.size),
    color: normalizeCrosshairColor(obj.color, fallback.color),
    gap: clampInt(obj.gap, CROSSHAIR_GAP_MIN, CROSSHAIR_GAP_MAX, fallback.gap),
    style: normalizeCrosshairStyle(obj.style, fallback.style),
  };
}

export function cloneCrosshairSettings(
  source: CrosshairSettingsMap = DEFAULT_CROSSHAIR_SETTINGS
): CrosshairSettingsMap {
  return {
    shotgun: { ...source.shotgun },
    ak47: { ...source.ak47 },
    smg: { ...source.smg },
    sniper: { ...source.sniper },
    pistol: { ...source.pistol },
    knife: { ...source.knife },
  };
}

export function validateCrosshairSettingsMap(
  raw: unknown,
  fallback: CrosshairSettingsMap = DEFAULT_CROSSHAIR_SETTINGS
): CrosshairSettingsMap {
  const base = cloneCrosshairSettings(fallback);
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  const obj = raw as Record<string, unknown>;
  const result = cloneCrosshairSettings(base);
  for (const weaponId of WEAPON_IDS) {
    result[weaponId] = validateCrosshairConfig(obj[weaponId], base[weaponId]);
  }
  return result;
}

export function getCrosshairConfigForWeapon(
  crosshairMap: Partial<CrosshairSettingsMap> | undefined,
  weaponId: WeaponId
): CrosshairConfig {
  const fallback = DEFAULT_CROSSHAIR_SETTINGS[weaponId] ?? DEFAULT_CROSSHAIR_SETTINGS.ak47;
  if (!crosshairMap || typeof crosshairMap !== 'object') {
    return { ...fallback };
  }
  return validateCrosshairConfig(crosshairMap[weaponId], fallback);
}

export interface ReticleGeometry {
  tickLen: number;
  gap: number;
  color: string;
  style: CrosshairStyle;
}

export function computeReticleGeometry(
  config: CrosshairConfig,
  spreadPx: number,
  isAds: boolean,
  targetingEnemy: boolean,
  enemyHighlightColor = '#ef4444'
): ReticleGeometry {
  const safe = validateCrosshairConfig(config);
  const tickLen = isAds ? Math.max(2, Math.round(safe.size * 0.55)) : safe.size;
  const dynamicExpansion =
    safe.style === 'dynamic' ? Math.max(0, spreadPx - 14) * 0.7 : 0;
  const gap = isAds
    ? Math.max(1, Math.round(safe.gap * 0.4))
    : Math.min(44, Math.round((safe.gap + dynamicExpansion) * 10) / 10);
  const color = targetingEnemy ? normalizeCrosshairColor(enemyHighlightColor, '#ef4444') : safe.color;

  return {
    tickLen,
    gap,
    color,
    style: safe.style,
  };
}
