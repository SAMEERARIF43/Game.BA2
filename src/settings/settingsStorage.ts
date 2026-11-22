import { normalizeGameMode } from '../game/gameModeRules';
import {
  normalizeCharacterId,
  normalizeGunId,
  normalizeKnifeCharmId,
} from '../game/loadoutRules';
import {
  GameSettings,
  GraphicsQuality,
  PostSlideStance,
  SlideTriggerMode,
} from '../game/types';
import { DEFAULT_KEYBINDINGS, validateKeybindings } from './keybindings';

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
  slideEnabled: true,
  slideInputMode: 'tap',
  slidePostStance: 'stand',
  slideJumpCancel: true,
  slideCameraTilt: true,
  slideTrigger: 'tap',
  postSlideStance: 'stand',
  jumpCancelsSlide: true,
  slideCameraIntensity: 1.0,
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

export function validateSettings(raw: unknown, fallback: GameSettings = DEFAULT_SETTINGS): GameSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...fallback };
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
  let resolvedInputMode: SlideTriggerMode = fallbackInputMode;
  if (rawInputValid && rawLegacyTriggerValid) {
    resolvedInputMode =
      obj.slideTrigger !== fallback.slideTrigger && obj.slideInputMode === fallbackInputMode
        ? (obj.slideTrigger as SlideTriggerMode)
        : (obj.slideInputMode as SlideTriggerMode);
  } else if (rawInputValid) {
    resolvedInputMode = obj.slideInputMode as SlideTriggerMode;
  } else if (rawLegacyTriggerValid) {
    resolvedInputMode = obj.slideTrigger as SlideTriggerMode;
  }

  const fallbackPostStance: PostSlideStance = VALID_POST_SLIDE.has(fallback.slidePostStance)
    ? fallback.slidePostStance
    : VALID_POST_SLIDE.has(fallback.postSlideStance)
      ? fallback.postSlideStance
      : 'stand';
  const rawPostValid = VALID_POST_SLIDE.has(obj.slidePostStance as PostSlideStance);
  const rawLegacyPostValid = VALID_POST_SLIDE.has(obj.postSlideStance as PostSlideStance);
  let resolvedPostStance: PostSlideStance = fallbackPostStance;
  if (rawPostValid && rawLegacyPostValid) {
    resolvedPostStance =
      obj.postSlideStance !== fallback.postSlideStance && obj.slidePostStance === fallbackPostStance
        ? (obj.postSlideStance as PostSlideStance)
        : (obj.slidePostStance as PostSlideStance);
  } else if (rawPostValid) {
    resolvedPostStance = obj.slidePostStance as PostSlideStance;
  } else if (rawLegacyPostValid) {
    resolvedPostStance = obj.postSlideStance as PostSlideStance;
  }

  const fallbackJumpCancel =
    typeof fallback.slideJumpCancel === 'boolean'
      ? fallback.slideJumpCancel
      : (fallback.jumpCancelsSlide ?? true);
  const rawJumpValid = typeof obj.slideJumpCancel === 'boolean';
  const rawLegacyJumpValid = typeof obj.jumpCancelsSlide === 'boolean';
  let resolvedJumpCancel = fallbackJumpCancel;
  if (rawJumpValid && rawLegacyJumpValid) {
    resolvedJumpCancel =
      obj.jumpCancelsSlide !== fallback.jumpCancelsSlide &&
      obj.slideJumpCancel === fallbackJumpCancel
        ? (obj.jumpCancelsSlide as boolean)
        : (obj.slideJumpCancel as boolean);
  } else if (rawJumpValid) {
    resolvedJumpCancel = obj.slideJumpCancel as boolean;
  } else if (rawLegacyJumpValid) {
    resolvedJumpCancel = obj.jumpCancelsSlide as boolean;
  }

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
  const rawTiltValid = typeof obj.slideCameraTilt === 'boolean';
  const rawIntensityValid =
    typeof obj.slideCameraIntensity === 'number' && Number.isFinite(obj.slideCameraIntensity);
  const clampedIntensity = clampNumber(obj.slideCameraIntensity, 0, 1, fallbackCameraIntensity);

  let resolvedCameraTilt = fallbackCameraTilt;
  let resolvedCameraIntensity = fallbackCameraIntensity;
  if (rawTiltValid && rawIntensityValid) {
    if (obj.slideCameraTilt !== fallbackCameraTilt && obj.slideCameraIntensity === fallbackCameraIntensity) {
      resolvedCameraTilt = obj.slideCameraTilt as boolean;
      resolvedCameraIntensity = resolvedCameraTilt ? (fallbackCameraIntensity > 0 ? fallbackCameraIntensity : 1.0) : 0;
    } else if (
      obj.slideCameraIntensity !== fallbackCameraIntensity &&
      obj.slideCameraTilt === fallbackCameraTilt
    ) {
      resolvedCameraIntensity = clampedIntensity;
      resolvedCameraTilt = clampedIntensity > 0;
    } else {
      resolvedCameraTilt = obj.slideCameraTilt as boolean;
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
    slideEnabled: typeof obj.slideEnabled === 'boolean' ? obj.slideEnabled : (fallback.slideEnabled ?? true),
    slideInputMode: resolvedInputMode,
    slidePostStance: resolvedPostStance,
    slideJumpCancel: resolvedJumpCancel,
    slideCameraTilt: resolvedCameraTilt,
    slideTrigger: resolvedInputMode,
    postSlideStance: resolvedPostStance,
    jumpCancelsSlide: resolvedJumpCancel,
    slideCameraIntensity: resolvedCameraIntensity,
    keybindings: validateKeybindings(obj.keybindings, fallback.keybindings ?? DEFAULT_KEYBINDINGS),
    allyTeamColor: typeof obj.allyTeamColor === 'string' && obj.allyTeamColor.startsWith('#') ? obj.allyTeamColor : (fallback.allyTeamColor ?? '#3b82f6'),
    enemyTeamColor: typeof obj.enemyTeamColor === 'string' && obj.enemyTeamColor.startsWith('#') ? obj.enemyTeamColor : (fallback.enemyTeamColor ?? '#ef4444'),
  };
}

export function loadPersistedSettings(): GameSettings {
  try {
    const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
    if (!storage) {
      return { ...DEFAULT_SETTINGS };
    }
    const legacyCallsign = storage.getItem(LEGACY_CALLSIGN_KEY);
    const baseDefault: GameSettings = {
      ...DEFAULT_SETTINGS,
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
    return { ...DEFAULT_SETTINGS };
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
    keybindings: { ...DEFAULT_KEYBINDINGS },
  };
  return savePersistedSettings(reset);
}
