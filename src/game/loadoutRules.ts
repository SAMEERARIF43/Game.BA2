import {
  CHARACTER_IDS,
  CHARACTERS,
  CharacterId,
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
const CHARACTER_ID_SET = new Set<string>(CHARACTER_IDS);

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

export interface CharacterSelectionOutcome {
  characterId: CharacterId;
  signatureGunId: GunId;
  gunOutcome: GunSelectionOutcome | null;
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

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && CHARACTER_ID_SET.has(value);
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

export function normalizeCharacterId(
  value: unknown,
  fallback: CharacterId = 'assault'
): CharacterId {
  return isCharacterId(value) ? value : fallback;
}

export function getSignatureGunForCharacter(characterId: CharacterId): GunId {
  return CHARACTERS[normalizeCharacterId(characterId)].signatureGunId;
}

export function getCharacterForWeaponId(weaponId: WeaponId): CharacterId {
  switch (weaponId) {
    case 'smg':
      return 'vanguard';
    case 'shotgun':
      return 'breacher';
    case 'sniper':
      return 'marksman';
    case 'ak47':
    case 'pistol':
    case 'knife':
    default:
      return 'assault';
  }
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

export function applyCharacterSelection(
  loadout: LoadoutSelectionState,
  nextCharacterId: CharacterId,
  equipSignatureGun: boolean,
  phase: MatchPhase,
  isAlive: boolean
): CharacterSelectionOutcome {
  const characterId = normalizeCharacterId(nextCharacterId);
  const signatureGunId = getSignatureGunForCharacter(characterId);
  const gunOutcome = equipSignatureGun
    ? applyGunSelection(loadout, signatureGunId, phase, isAlive)
    : null;
  return {
    characterId,
    signatureGunId,
    gunOutcome,
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
