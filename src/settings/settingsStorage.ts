import { normalizeGameMode } from '../game/gameModeRules';
import {
  normalizeCharacterId,
  normalizeGunId,
  normalizeKnifeCharmId,
  normalizeTacticalEquipmentId,
} from '../game/loadoutRules';
import {
  GameSettings,
  GraphicsQuality,
  PostSlideStance,
  SlideTriggerMode,
} from '../game/types';
import {
  cloneCrosshairSettings,
  DEFAULT_CROSSHAIR_SETTINGS,
  validateCrosshairSettingsMap,
} from './crosshairConfig';
import { DEFAULT_KEYBINDINGS, validateKeybindings } from './keybindings';
import {
  cloneTeamColors,
  DEFAULT_TEAM_COLORS,
  validateTeamColors,
} from './teamColorsConfig';

export const SETTINGS_STORAGE_KEY = 'strike_force_profile_v1';
const LEGACY_CALLSIGN_KEY = 'sf_callsign';

const VALID_QUALITY = new Set<GraphicsQuality>(['LOW', 'MEDIUM', 'HIGH']);
const VALID_SLIDE_TRIGGER = new Set<SlideTriggerMode>(['tap', 'hold']);
const VALID_POST_SLIDE = new Set<PostSlideStance>(['stand', 'crouch']);

export const DEFAULT_SETTINGS: GameSettings = {
  callsign: 'Operator-101',
  sensitivity: 0.0021,
  adsSensitivityMultiplier: 0.68,
  invertY: false,
  fovDeg: 78,
  showFps: false,
  volume: 0.65,
  sfxVolume: 0.85,
  sfxEnabled: true,
  musicVolume: 0.35,
  muted: false,
  graphicsQuality: 'HIGH',
  killLimit: 30,
  botsPerTeam: 4,
  screenShakeScale: 1.0,
  selectedGameMode: 'tdm',
  selectedCharacterId: 'assault',
  selectedGunId: 'ak47',
  knifeCharmId: 'tactical_tag',
  tacticalEquipmentId: 'smoke_grenade',
  slideEnabled: true,
  slideInputMode: 'tap',
  slidePostStance: 'stand',
  slideJumpCancel: true,
  slideCameraTilt: true,
  slideTrigger: 'tap',
  postSlideStance: 'stand',
  jumpCancelsSlide: true,
  slideCameraIntensity: 1.0,
  autoReload: true,
  crosshair: cloneCrosshairSettings(DEFAULT_CROSSHAIR_SETTINGS),
  teamColors: cloneTeamColors(DEFAULT_TEAM_COLORS),
  keybindings: { ...DEFAULT_KEYBINDINGS },
  allyTeamColor: '#3b82f6',
  enemyTeamColor: '#ef4444',
};

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, val));
}

function sanitizeCallsign(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.trim().slice(0, 20);
  return cleaned.length > 0 ? cleaned : fallback;
}

function resolveLegacyVsCurrent<T>(
  currentValid: boolean,
  currentValue: T,
  legacyValid: boolean,
  legacyValue: T,
  fallbackValue: T,
  defaultValue: T
): T {
  if (currentValid && legacyValid) {
    if (currentValue === legacyValue) {
      return currentValue;
    }
    if (currentValue !== fallbackValue && legacyValue === fallbackValue) {
      return currentValue;
    }
    if (currentValue !== defaultValue && legacyValue === defaultValue) {
      return currentValue;
    }
    if (legacyValue !== defaultValue && currentValue === defaultValue) {
      return legacyValue;
    }
    return currentValue;
  }
  if (currentValid) return currentValue;
  if (legacyValid) return legacyValue;
  return fallbackValue;
}

export function validateSettings(raw: unknown, fallback: GameSettings = DEFAULT_SETTINGS): GameSettings {
  const fallbackCrosshair = validateCrosshairSettingsMap(
    fallback.crosshair,
    DEFAULT_CROSSHAIR_SETTINGS
  );
  const fallbackTeamColors = validateTeamColors(fallback.teamColors, DEFAULT_TEAM_COLORS);
  if (!raw || typeof raw !== 'object') {
    return {
      ...fallback,
      tacticalEquipmentId: normalizeTacticalEquipmentId(
        fallback.tacticalEquipmentId,
        'smoke_grenade'
      ),
      sfxEnabled: fallback.sfxEnabled ?? true,
      autoReload: fallback.autoReload ?? true,
      crosshair: fallbackCrosshair,
      teamColors: fallbackTeamColors,
    };
  }

  const obj = raw as Record<string, unknown>;
  const quality = VALID_QUALITY.has(obj.graphicsQuality as GraphicsQuality)
    ? (obj.graphicsQuality as GraphicsQuality)
    : fallback.graphicsQuality;

  const fallbackInputMode: SlideTriggerMode = VALID_SLIDE_TRIGGER.has(fallback.slideInputMode)
    ? fallback.slideInputMode
    : VALID_SLIDE_TRIGGER.has(fallback.slideTrigger)
      ? fallback.slideTrigger
      : 'tap';
  const rawInputValid = VALID_SLIDE_TRIGGER.has(obj.slideInputMode as SlideTriggerMode);
  const rawLegacyTriggerValid = VALID_SLIDE_TRIGGER.has(obj.slideTrigger as SlideTriggerMode);
  const resolvedInputMode = resolveLegacyVsCurrent<SlideTriggerMode>(
    rawInputValid,
    obj.slideInputMode as SlideTriggerMode,
    rawLegacyTriggerValid,
    obj.slideTrigger as SlideTriggerMode,
    fallbackInputMode,
    DEFAULT_SETTINGS.slideInputMode
  );

  const fallbackPostStance: PostSlideStance = VALID_POST_SLIDE.has(fallback.slidePostStance)
    ? fallback.slidePostStance
    : VALID_POST_SLIDE.has(fallback.postSlideStance)
      ? fallback.postSlideStance
      : 'stand';
  const rawPostValid = VALID_POST_SLIDE.has(obj.slidePostStance as PostSlideStance);
  const rawLegacyPostValid = VALID_POST_SLIDE.has(obj.postSlideStance as PostSlideStance);
  const resolvedPostStance = resolveLegacyVsCurrent<PostSlideStance>(
    rawPostValid,
    obj.slidePostStance as PostSlideStance,
    rawLegacyPostValid,
    obj.postSlideStance as PostSlideStance,
    fallbackPostStance,
    DEFAULT_SETTINGS.slidePostStance
  );

  const fallbackJumpCancel =
    typeof fallback.slideJumpCancel === 'boolean'
      ? fallback.slideJumpCancel
      : (fallback.jumpCancelsSlide ?? true);
  const rawJumpValid = typeof obj.slideJumpCancel === 'boolean';
  const rawLegacyJumpValid = typeof obj.jumpCancelsSlide === 'boolean';
  const resolvedJumpCancel = resolveLegacyVsCurrent<boolean>(
    rawJumpValid,
    obj.slideJumpCancel as boolean,
    rawLegacyJumpValid,
    obj.jumpCancelsSlide as boolean,
    fallbackJumpCancel,
    DEFAULT_SETTINGS.slideJumpCancel
  );

  const fallbackCameraTilt =
    typeof fallback.slideCameraTilt === 'boolean'
      ? fallback.slideCameraTilt
      : (fallback.slideCameraIntensity ?? 1.0) > 0;
  const fallbackCameraIntensity = clampNumber(
    fallback.slideCameraIntensity,
    0,
    1,
    fallbackCameraTilt ? 1.0 : 0
  );
  const fallbackTiltPositive = fallbackCameraIntensity > 0;
  const rawTiltValid = typeof obj.slideCameraTilt === 'boolean';
  const rawIntensityValid =
    typeof obj.slideCameraIntensity === 'number' && Number.isFinite(obj.slideCameraIntensity);
  const clampedIntensity = clampNumber(obj.slideCameraIntensity, 0, 1, fallbackCameraIntensity);

  let resolvedCameraTilt = fallbackCameraTilt;
  let resolvedCameraIntensity = fallbackCameraIntensity;
  if (rawTiltValid && rawIntensityValid) {
    const rawTilt = obj.slideCameraTilt as boolean;
    const rawIntensityPositive = clampedIntensity > 0;
    if (rawTilt === rawIntensityPositive) {
      resolvedCameraTilt = rawTilt;
      resolvedCameraIntensity = resolvedCameraTilt
        ? (clampedIntensity > 0 ? clampedIntensity : (fallbackCameraIntensity > 0 ? fallbackCameraIntensity : 1.0))
        : 0;
    } else if (rawTilt !== fallbackCameraTilt && rawIntensityPositive === fallbackTiltPositive) {
      resolvedCameraTilt = rawTilt;
      resolvedCameraIntensity = resolvedCameraTilt ? (fallbackCameraIntensity > 0 ? fallbackCameraIntensity : 1.0) : 0;
    } else if (rawTilt !== DEFAULT_SETTINGS.slideCameraTilt && clampedIntensity === DEFAULT_SETTINGS.slideCameraIntensity) {
      resolvedCameraTilt = rawTilt;
      resolvedCameraIntensity = resolvedCameraTilt ? 1.0 : 0;
    } else if (clampedIntensity !== DEFAULT_SETTINGS.slideCameraIntensity && rawTilt === DEFAULT_SETTINGS.slideCameraTilt) {
      resolvedCameraIntensity = clampedIntensity;
      resolvedCameraTilt = clampedIntensity > 0;
    } else if (clampedIntensity !== fallbackCameraIntensity && rawTilt === fallbackCameraTilt) {
      resolvedCameraIntensity = clampedIntensity;
      resolvedCameraTilt = clampedIntensity > 0;
    } else {
      resolvedCameraTilt = rawTilt;
      resolvedCameraIntensity = resolvedCameraTilt ? (clampedIntensity > 0 ? clampedIntensity : 1.0) : 0;
    }
  } else if (rawTiltValid) {
    resolvedCameraTilt = obj.slideCameraTilt as boolean;
    resolvedCameraIntensity = resolvedCameraTilt ? (fallbackCameraIntensity > 0 ? fallbackCameraIntensity : 1.0) : 0;
  } else if (rawIntensityValid) {
    resolvedCameraIntensity = clampedIntensity;
    resolvedCameraTilt = clampedIntensity > 0;
  }

  return {
    callsign: sanitizeCallsign(obj.callsign, fallback.callsign),
    sensitivity: clampNumber(obj.sensitivity, 0.0005, 0.008, fallback.sensitivity),
    adsSensitivityMultiplier: clampNumber(
      obj.adsSensitivityMultiplier,
      0.3,
      1.2,
      fallback.adsSensitivityMultiplier
    ),
    invertY: typeof obj.invertY === 'boolean' ? obj.invertY : fallback.invertY,
    fovDeg: Math.round(clampNumber(obj.fovDeg, 70, 110, fallback.fovDeg)),
    showFps: typeof obj.showFps === 'boolean' ? obj.showFps : fallback.showFps,
    volume: clampNumber(obj.volume, 0, 1, fallback.volume),
    sfxVolume: clampNumber(obj.sfxVolume, 0, 1, fallback.sfxVolume),
    sfxEnabled:
      typeof obj.sfxEnabled === 'boolean' ? obj.sfxEnabled : (fallback.sfxEnabled ?? true),
    musicVolume: clampNumber(obj.musicVolume, 0, 1, fallback.musicVolume),
    muted: typeof obj.muted === 'boolean' ? obj.muted : fallback.muted,
    graphicsQuality: quality,
    killLimit: Math.round(clampNumber(obj.killLimit, 5, 100, fallback.killLimit)),
    botsPerTeam: Math.round(clampNumber(obj.botsPerTeam, 1, 6, fallback.botsPerTeam)),
    screenShakeScale: clampNumber(obj.screenShakeScale, 0, 1, fallback.screenShakeScale ?? 1.0),
    selectedGameMode: normalizeGameMode(obj.selectedGameMode, fallback.selectedGameMode ?? 'tdm'),
    selectedCharacterId: normalizeCharacterId(
      obj.selectedCharacterId,
      fallback.selectedCharacterId ?? 'assault'
    ),
    selectedGunId: normalizeGunId(obj.selectedGunId, fallback.selectedGunId ?? 'ak47'),
    knifeCharmId: normalizeKnifeCharmId(obj.knifeCharmId, fallback.knifeCharmId ?? 'tactical_tag'),
    tacticalEquipmentId: normalizeTacticalEquipmentId(
      obj.tacticalEquipmentId,
      fallback.tacticalEquipmentId ?? 'smoke_grenade'
    ),
    slideEnabled: typeof obj.slideEnabled === 'boolean' ? obj.slideEnabled : (fallback.slideEnabled ?? true),
    slideInputMode: resolvedInputMode,
    slidePostStance: resolvedPostStance,
    slideJumpCancel: resolvedJumpCancel,
    slideCameraTilt: resolvedCameraTilt,
    slideTrigger: resolvedInputMode,
    postSlideStance: resolvedPostStance,
    jumpCancelsSlide: resolvedJumpCancel,
    slideCameraIntensity: resolvedCameraIntensity,
    autoReload: typeof obj.autoReload === 'boolean' ? obj.autoReload : (fallback.autoReload ?? true),
    crosshair: validateCrosshairSettingsMap(obj.crosshair, fallbackCrosshair),
    teamColors: validateTeamColors(obj.teamColors, fallbackTeamColors),
    keybindings: validateKeybindings(obj.keybindings, fallback.keybindings ?? DEFAULT_KEYBINDINGS),
    allyTeamColor: typeof obj.allyTeamColor === 'string' && obj.allyTeamColor.startsWith('#') ? obj.allyTeamColor : (fallback.allyTeamColor ?? '#3b82f6'),
    enemyTeamColor: typeof obj.enemyTeamColor === 'string' && obj.enemyTeamColor.startsWith('#') ? obj.enemyTeamColor : (fallback.enemyTeamColor ?? '#ef4444'),
  };
}

export function loadPersistedSettings(): GameSettings {
  try {
    const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
    if (!storage) {
      return {
        ...DEFAULT_SETTINGS,
        crosshair: cloneCrosshairSettings(DEFAULT_CROSSHAIR_SETTINGS),
        teamColors: cloneTeamColors(DEFAULT_TEAM_COLORS),
      };
    }
    const legacyCallsign = storage.getItem(LEGACY_CALLSIGN_KEY);
    const baseDefault: GameSettings = {
      ...DEFAULT_SETTINGS,
      crosshair: cloneCrosshairSettings(DEFAULT_CROSSHAIR_SETTINGS),
      teamColors: cloneTeamColors(DEFAULT_TEAM_COLORS),
      callsign: sanitizeCallsign(
        legacyCallsign,
        `Operator-${Math.floor(100 + Math.random() * 899)}`
      ),
    };

    const rawJson = storage.getItem(SETTINGS_STORAGE_KEY);
    if (!rawJson) {
      savePersistedSettings(baseDefault);
      return baseDefault;
    }

    const parsed: unknown = JSON.parse(rawJson);
    const validated = validateSettings(parsed, baseDefault);
    return validated;
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      crosshair: cloneCrosshairSettings(DEFAULT_CROSSHAIR_SETTINGS),
      teamColors: cloneTeamColors(DEFAULT_TEAM_COLORS),
    };
  }
}

export function savePersistedSettings(settings: GameSettings): GameSettings {
  const validated = validateSettings(settings);
  try {
    const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
    if (storage) {
      storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(validated));
      storage.setItem(LEGACY_CALLSIGN_KEY, validated.callsign);
    }
  } catch {
    // Ignore storage quota or private browsing errors
  }
  return validated;
}

export function resetPersistedSettings(): GameSettings {
  const reset: GameSettings = {
    ...DEFAULT_SETTINGS,
    crosshair: cloneCrosshairSettings(DEFAULT_CROSSHAIR_SETTINGS),
    teamColors: cloneTeamColors(DEFAULT_TEAM_COLORS),
    keybindings: { ...DEFAULT_KEYBINDINGS },
  };
  return savePersistedSettings(reset);
}
