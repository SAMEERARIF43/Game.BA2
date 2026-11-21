import {
  GUN_IDS,
  GunId,
  KNIFE_CHARM_IDS,
  KnifeCharmId,
  MatchPhase,
  WEAPON_IDS,
  WeaponId,
} from './types';

export const GUN_LOCKED_WHILE_ALIVE_MESSAGE =
  'Gun locked while alive — select next gun on death or before spawn';

const GUN_ID_SET = new Set<string>(GUN_IDS);
const WEAPON_ID_SET = new Set<string>(WEAPON_IDS);
const CHARM_ID_SET = new Set<string>(KNIFE_CHARM_IDS);

export interface LoadoutSelectionState {
  equippedGunId: GunId;
  queuedGunId: GunId;
  activeSlot: 1 | 2;
}

export interface GunSelectionOutcome {
  loadout: LoadoutSelectionState;
  switchedImmediately: boolean;
  queuedForNextSpawn: boolean;
  lockMessage: string | null;
}

export function isGunId(value: unknown): value is GunId {
  return typeof value === 'string' && GUN_ID_SET.has(value);
}

export function isWeaponId(value: unknown): value is WeaponId {
  return typeof value === 'string' && WEAPON_ID_SET.has(value);
}

export function isKnifeCharmId(value: unknown): value is KnifeCharmId {
  return typeof value === 'string' && CHARM_ID_SET.has(value);
}

export function normalizeGunId(value: unknown, fallback: GunId = 'ak47'): GunId {
  return isGunId(value) ? value : fallback;
}

export function normalizeWeaponId(value: unknown, fallback: WeaponId = 'ak47'): WeaponId {
  return isWeaponId(value) ? value : fallback;
}

export function normalizeKnifeCharmId(
  value: unknown,
  fallback: KnifeCharmId = 'tactical_tag'
): KnifeCharmId {
  return isKnifeCharmId(value) ? value : fallback;
}

export function canSwitchGunImmediately(phase: MatchPhase, isAlive: boolean): boolean {
  return phase === 'menu' || !isAlive;
}

export function applyGunSelection(
  loadout: LoadoutSelectionState,
  nextGunId: GunId,
  phase: MatchPhase,
  isAlive: boolean
): GunSelectionOutcome {
  if (canSwitchGunImmediately(phase, isAlive)) {
    return {
      loadout: {
        equippedGunId: nextGunId,
        queuedGunId: nextGunId,
        activeSlot: loadout.activeSlot,
      },
      switchedImmediately: true,
      queuedForNextSpawn: false,
      lockMessage: null,
    };
  }

  return {
    loadout: {
      equippedGunId: loadout.equippedGunId,
      queuedGunId: nextGunId,
      activeSlot: loadout.activeSlot,
    },
    switchedImmediately: false,
    queuedForNextSpawn: true,
    lockMessage: GUN_LOCKED_WHILE_ALIVE_MESSAGE,
  };
}

export function resolveRespawnLoadout(loadout: LoadoutSelectionState): LoadoutSelectionState {
  return {
    equippedGunId: loadout.queuedGunId,
    queuedGunId: loadout.queuedGunId,
    activeSlot: 1,
  };
}

export function toggleLoadoutSlot(currentSlot: 1 | 2): 1 | 2 {
  return currentSlot === 1 ? 2 : 1;
}

export function getActiveWeaponIdFromLoadout(loadout: LoadoutSelectionState): WeaponId {
  return loadout.activeSlot === 2 ? 'knife' : loadout.equippedGunId;
}
