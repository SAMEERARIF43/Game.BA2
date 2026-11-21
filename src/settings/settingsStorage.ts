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
  selectedCharacterId: 'assault',
  selectedGunId: 'ak47',
  knifeCharmId: 'tactical_tag',
  slideTrigger: 'tap',
  postSlideStance: 'stand',
  jumpCancelsSlide: true,
  slideCameraIntensity: 1.0,
  keybindings: { ...DEFAULT_KEYBINDINGS },
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
    selectedCharacterId: normalizeCharacterId(
      obj.selectedCharacterId,
      fallback.selectedCharacterId ?? 'assault'
    ),
    selectedGunId: normalizeGunId(obj.selectedGunId, fallback.selectedGunId ?? 'ak47'),
    knifeCharmId: normalizeKnifeCharmId(obj.knifeCharmId, fallback.knifeCharmId ?? 'tactical_tag'),
    slideTrigger: VALID_SLIDE_TRIGGER.has(obj.slideTrigger as SlideTriggerMode)
      ? (obj.slideTrigger as SlideTriggerMode)
      : (fallback.slideTrigger ?? 'tap'),
    postSlideStance: VALID_POST_SLIDE.has(obj.postSlideStance as PostSlideStance)
      ? (obj.postSlideStance as PostSlideStance)
      : (fallback.postSlideStance ?? 'stand'),
    jumpCancelsSlide:
      typeof obj.jumpCancelsSlide === 'boolean'
        ? obj.jumpCancelsSlide
        : (fallback.jumpCancelsSlide ?? true),
    slideCameraIntensity: clampNumber(
      obj.slideCameraIntensity,
      0,
      1,
      fallback.slideCameraIntensity ?? 1.0
    ),
    keybindings: validateKeybindings(obj.keybindings, fallback.keybindings ?? DEFAULT_KEYBINDINGS),
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
