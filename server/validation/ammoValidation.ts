import { SERVER_WEAPONS } from '../mapSpawns.ts';

export interface PlayerValidationState {
  ammo: Record<string, number>;
  lastShotAt: Record<string, number>;
  lastMoveTime: number;
  lastX: number;
  lastY: number;
  lastZ: number;
  suspiciousCount: number;
}

const DEFAULT_MAG_SIZES: Record<string, number> = {
  ak47: 30,
  smg: 35,
  shotgun: 8,
  sniper: 5,
  pistol: 12,
  knife: 999,
};

export function getInitialMagSize(weaponId: string): number {
  return DEFAULT_MAG_SIZES[weaponId] ?? 30;
}

export function validatePlayerShot(
  state: PlayerValidationState,
  weaponId: string,
  now: number = Date.now()
): { valid: boolean; reason?: string; currentAmmo: number } {
  const weaponSpec = SERVER_WEAPONS[weaponId] || SERVER_WEAPONS['ak47'];
  const minInterval = weaponSpec.minFireIntervalMs;

  // Initialize ammo if missing
  if (state.ammo[weaponId] === undefined) {
    state.ammo[weaponId] = getInitialMagSize(weaponId);
  }

  const lastShot = state.lastShotAt[weaponId] || 0;
  const elapsed = now - lastShot;

  // Fire-rate check (with small network latency allowance)
  if (elapsed < minInterval * 0.75) {
    state.suspiciousCount++;
    return {
      valid: false,
      reason: `Fire rate exceeded for ${weaponId} (${elapsed}ms < ${minInterval}ms)`,
      currentAmmo: state.ammo[weaponId],
    };
  }

  // Ammo check
  if (state.ammo[weaponId] <= 0 && weaponId !== 'knife') {
    state.suspiciousCount++;
    return {
      valid: false,
      reason: `Empty magazine for ${weaponId}`,
      currentAmmo: 0,
    };
  }

  // Consume ammo
  if (weaponId !== 'knife') {
    state.ammo[weaponId]--;
  }

  state.lastShotAt[weaponId] = now;
  return {
    valid: true,
    currentAmmo: state.ammo[weaponId],
  };
}

export function reloadPlayerWeapon(state: PlayerValidationState, weaponId: string): number {
  const maxMag = getInitialMagSize(weaponId);
  state.ammo[weaponId] = maxMag;
  return maxMag;
}

export function validatePlayerMovement(
  state: PlayerValidationState,
  x: number,
  y: number,
  z: number,
  now: number = Date.now()
): { valid: boolean; reason?: string } {
  const dt = (now - state.lastMoveTime) / 1000;
  if (dt <= 0 || state.lastMoveTime === 0) {
    state.lastMoveTime = now;
    state.lastX = x;
    state.lastY = y;
    state.lastZ = z;
    return { valid: true };
  }

  const dx = x - state.lastX;
  const dy = y - state.lastY;
  const dz = z - state.lastZ;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const maxSpeed = 18; // units per second (accounting for sprint / slide)
  const allowedDist = maxSpeed * dt + 5.0; // generous tolerance for lag / latency

  state.lastMoveTime = now;
  state.lastX = x;
  state.lastY = y;
  state.lastZ = z;

  if (dist > allowedDist && dt < 2.0) {
    state.suspiciousCount++;
    return {
      valid: false,
      reason: `Excessive movement delta (${dist.toFixed(1)}m in ${(dt * 1000).toFixed(0)}ms)`,
    };
  }

  return { valid: true };
}
