import { SERVER_WEAPONS, ServerWeaponSpec } from './mapSpawns.ts';
import { checkLineOfSight } from './mapCollision.ts';

export interface AuthoritativePlayerState {
  id: string;
  team: string;
  isAlive: boolean;
  x: number;
  y: number;
  z: number;
  rotY?: number;
  pitch?: number;
  health?: number;
}

export interface HitValidationPayload {
  muzzleX?: number;
  muzzleY?: number;
  muzzleZ?: number;
  endX?: number;
  endY?: number;
  endZ?: number;
  weaponId: string;
  targetId: string;
  claimedZone?: 'head' | 'body'; // Untrusted client claim
}

export interface HitValidationContext {
  friendlyFire: boolean;
  spawnProtectionUntil: number;
  currentTime: number;
  lastShotTime?: number;
  checkRateOfFire?: boolean;
  /**
   * Authoritative server-side collision map identifier (VULN-1 / RES-1).
   * An omitted, undefined, or unregistered mapId does not bypass LOS;
   * missing or unknown collision data fails closed and causes rejection with MAP_COLLISION_DATA_UNAVAILABLE.
   */
  mapId?: string;
  /** Server-held shooter orientation for firing-direction validation (VULN-2 / VULN-5). */
  shooterRotY?: number;
  shooterPitch?: number;
  /**
   * Set true for server-authoritative bot shooters.
   * Skips client-coordinate checks (VULN-3 muzzle override, VULN-2 direction) because
   * the server itself computed the bot's shot coordinates.
   */
  isBotShooter?: boolean;
}

export type HitRejectionReason =
  | 'INVALID_COORDINATES'
  | 'TARGET_NOT_FOUND'
  | 'TARGET_NOT_ALIVE'
  | 'SELF_HIT'
  | 'FRIENDLY_FIRE_BLOCKED'
  | 'SPAWN_PROTECTION_ACTIVE'
  | 'RATE_OF_FIRE_VIOLATION'
  | 'OUT_OF_WEAPON_RANGE'
  | 'HITPOINT_OUT_OF_BOUNDS'
  | 'FIRING_DIRECTION_INVALID'
  | 'LINE_OF_SIGHT_BLOCKED'
  | 'MUZZLE_TO_HIT_RANGE_EXCEEDED'
  | 'MAP_COLLISION_DATA_UNAVAILABLE';

export interface HitValidationResult {
  accepted: boolean;
  reason?: HitRejectionReason;
  verifiedZone?: 'head' | 'body';
  damage: number;
  weapon: ServerWeaponSpec;
  isHeadshot: boolean;
}

/**
 * Server-owned hitbox constants derived from Babylon avatar dimensions and PlayerController:
 * - Total player height is ~1.85m (standing foot level is target.y).
 * - Upper body pivot (waist joint where pitch rotation occurs) is at target.y + 0.80m.
 * - Local head center is 0.90m above upper body pivot (standing head center = target.y + 1.70m).
 * - Head box dimensions: 0.30m x 0.30m x 0.30m (half-diagonal = 0.26m).
 * - Head sphere tolerance: 0.38m (covers head/helmet + network latency lead while remaining strictly above 1.48m).
 * - Neck division: 0.70m above pivot (standing neck threshold = target.y + 1.50m).
 * - Hitpoint max radial distance from player center: 1.80m (standard latency-compensated bounding sphere).
 * - Max horizontal distance from vertical player axis: 1.45m (0.42m radius + 100ms sprint latency at 9.1m/s + margin).
 *
 * Muzzle heights (VULN-3 server override):
 * - Player eye height: PLAYER_HALF_HEIGHT(0.9) + STAND_EYE_OFFSET(0.72) ≈ 1.62m above foot.
 *   We use 1.55 (conservative, accounts for muzzle below camera centre).
 * - Bot eye height: 1.35m (matches existing broadcast code at MatchRoom.ts:666).
 *
 * Firing direction tolerance (VULN-2):
 * - Maximum weapon hip spread: ~0.065 rad for Intervention → atan(0.065) ≈ 3.7°.
 * - Network/movement lag allowance: ±25°.
 * - Combined tolerance: 30° → cos(30°) ≈ 0.866. Shots within 30° of forward are accepted.
 * - This is NOT aimbot prevention — it only blocks shots fired behind the shooter.
 */
export const HITBOX = {
  PLAYER_HEIGHT: 1.85,
  PLAYER_RADIUS: 0.42,
  UPPER_BODY_PIVOT_Y: 0.80,
  HEAD_LOCAL_Y: 0.90,
  HEAD_SPHERE_RADIUS: 0.38,
  NECK_LOCAL_Y: 0.70,
  HITPOINT_MAX_DISTANCE: 1.80,
  MAX_HORIZONTAL_DISTANCE: 1.45,
  MIN_VERTICAL_OFFSET: -0.30,
  MAX_VERTICAL_OFFSET: 2.15,
  /** Server muzzle Y offset above foot for standing players (VULN-3). */
  PLAYER_MUZZLE_Y_OFFSET: 1.55,
  /** Server muzzle Y offset above foot for bots (VULN-3). */
  BOT_MUZZLE_Y_OFFSET: 1.35,
  /**
   * Minimum dot product between server-computed forward vector and shot-to-target vector
   * required for a valid shot (VULN-2). cos(30°) ≈ 0.866.
   * Tolerates max weapon spread + 100ms lag while rejecting backward shots.
   */
  FIRING_DIRECTION_MIN_DOT: 0.866,
} as const;

export function isValidCoordinate(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val);
}

/**
 * Normalises an angle (in radians) to the range (−π, +π].
 * Used to sanitise server-held rotY values before computing forward vectors (VULN-5).
 */
function normaliseAngle(a: number): number {
  const twoPi = 2 * Math.PI;
  return ((((a % twoPi) + twoPi) % twoPi) + Math.PI) % twoPi - Math.PI;
}

/**
 * Validates hit claims authoritatively on the server.
 *
 * Security model (all checks additive — existing checks are preserved):
 *
 * [Batch 3.0R-H]  Client claimedZone is NEVER trusted. The server independently computes
 *                 head position from target pitch/rotY and classifies the hit zone.
 *
 * [Batch 3.0R-H2] Additional checks:
 *  VULN-3: Client muzzle coordinates are ignored. The server derives the authoritative
 *          muzzle origin from the shooter's authoritative position + fixed height offset.
 *          An extended range check is applied from server muzzle to hit point.
 *  VULN-5: Shooter rotY is normalised to (−π,+π] and pitch is clamped to [−1.48,+1.48]
 *          before use in any geometric computation.
 *  VULN-2: The server computes a forward vector from (clamped) rotY + pitch and verifies
 *          that the shot direction matches within a 30° tolerance.
 *          Skipped for bot shooters (isBotShooter=true) since server controls their aim.
 *  VULN-1: checkLineOfSight() is called against the authoritative server AABB
 *          collision representation. Obstructed shots are rejected.
 *          Rejects with MAP_COLLISION_DATA_UNAVAILABLE if mapId is unregistered,
 *          undefined, or collision data is unavailable (fail-closed).
 */
export function validateAuthoritativeHit(
  shooter: AuthoritativePlayerState,
  target: AuthoritativePlayerState | undefined | null,
  payload: HitValidationPayload,
  context: HitValidationContext
): HitValidationResult {
  const weapon = SERVER_WEAPONS[payload.weaponId] ?? SERVER_WEAPONS.ak47;
  const isBotShooter = context.isBotShooter === true;

  // 1. Validate coordinates: reject undefined, NaN, Infinity, non-numbers
  if (
    !isValidCoordinate(payload.endX) ||
    !isValidCoordinate(payload.endY) ||
    !isValidCoordinate(payload.endZ)
  ) {
    return {
      accepted: false,
      reason: 'INVALID_COORDINATES',
      damage: 0,
      weapon,
      isHeadshot: false,
    };
  }

  // 2. Validate rate of fire if requested
  if (context.checkRateOfFire && typeof context.lastShotTime === 'number') {
    const fireIntervalThreshold = weapon.minFireIntervalMs * 0.72;
    if (context.currentTime - context.lastShotTime < fireIntervalThreshold) {
      return {
        accepted: false,
        reason: 'RATE_OF_FIRE_VIOLATION',
        damage: 0,
        weapon,
        isHeadshot: false,
      };
    }
  }

  // 3. Target existence & state validation
  if (!target) {
    return {
      accepted: false,
      reason: 'TARGET_NOT_FOUND',
      damage: 0,
      weapon,
      isHeadshot: false,
    };
  }

  if (!target.isAlive) {
    return {
      accepted: false,
      reason: 'TARGET_NOT_ALIVE',
      damage: 0,
      weapon,
      isHeadshot: false,
    };
  }

  if (target.id === shooter.id) {
    return {
      accepted: false,
      reason: 'SELF_HIT',
      damage: 0,
      weapon,
      isHeadshot: false,
    };
  }

  // 4. Friendly fire rule check
  const sameTeam = target.team === shooter.team;
  if (sameTeam && !context.friendlyFire) {
    return {
      accepted: false,
      reason: 'FRIENDLY_FIRE_BLOCKED',
      damage: 0,
      weapon,
      isHeadshot: false,
    };
  }

  // 5. Spawn protection check
  if (context.currentTime < context.spawnProtectionUntil) {
    return {
      accepted: false,
      reason: 'SPAWN_PROTECTION_ACTIVE',
      damage: 0,
      weapon,
      isHeadshot: false,
    };
  }

  // 6. Range check: shooter position to target position
  const distShooterToTarget = Math.hypot(
    target.x - shooter.x,
    target.y - shooter.y,
    target.z - shooter.z
  );
  if (distShooterToTarget > weapon.range + 6) {
    return {
      accepted: false,
      reason: 'OUT_OF_WEAPON_RANGE',
      damage: 0,
      weapon,
      isHeadshot: false,
    };
  }

  // -------------------------------------------------------------------------
  // VULN-3: Server-authoritative muzzle origin.
  // Client-supplied muzzleX/Y/Z are NEVER used for authoritative range or
  // direction checks. The server derives the muzzle from shooter's
  // authoritative position + a fixed eye-height offset.
  // -------------------------------------------------------------------------
  const serverMuzzleX = shooter.x;
  const serverMuzzleY = shooter.y + (isBotShooter ? HITBOX.BOT_MUZZLE_Y_OFFSET : HITBOX.PLAYER_MUZZLE_Y_OFFSET);
  const serverMuzzleZ = shooter.z;

  // Range check: server muzzle to claimed hit point
  const distMuzzleToHit = Math.hypot(
    payload.endX - serverMuzzleX,
    payload.endY - serverMuzzleY,
    payload.endZ - serverMuzzleZ
  );
  if (distMuzzleToHit > weapon.range + 6) {
    return {
      accepted: false,
      reason: 'MUZZLE_TO_HIT_RANGE_EXCEEDED',
      damage: 0,
      weapon,
      isHeadshot: false,
    };
  }

  // -------------------------------------------------------------------------
  // VULN-5: Sanitise shooter orientation before any geometric use.
  // rotY is normalised to (−π,+π]; pitch is clamped to [−1.48,+1.48].
  // Fall back to 0 for non-finite inputs.
  // -------------------------------------------------------------------------
  const rawRotY  = isValidCoordinate(context.shooterRotY)  ? context.shooterRotY  : 0;
  const rawPitch = isValidCoordinate(context.shooterPitch) ? context.shooterPitch : 0;
  const safeRotY  = normaliseAngle(rawRotY);
  const safePitch = Math.max(-1.48, Math.min(1.48, rawPitch));

  // -------------------------------------------------------------------------
  // VULN-2: Firing-direction validation.
  // Server computes the expected forward vector from (safePitch, safeRotY) and
  // verifies that the vector from server muzzle to hit point agrees within
  // FIRING_DIRECTION_MIN_DOT (cos 30°). Backward and sideways shots are rejected.
  // Skipped for bot shooters (server controls their orientation).
  // -------------------------------------------------------------------------
  if (!isBotShooter && distMuzzleToHit > 0.5) {
    // Forward vector: Babylon convention — positive pitch = look down
    const fwdX = Math.cos(safePitch) * Math.sin(safeRotY);
    const fwdY = -Math.sin(safePitch);
    const fwdZ = Math.cos(safePitch) * Math.cos(safeRotY);

    const hitVecX = (payload.endX - serverMuzzleX) / distMuzzleToHit;
    const hitVecY = (payload.endY - serverMuzzleY) / distMuzzleToHit;
    const hitVecZ = (payload.endZ - serverMuzzleZ) / distMuzzleToHit;

    const dot = fwdX * hitVecX + fwdY * hitVecY + fwdZ * hitVecZ;
    if (dot < HITBOX.FIRING_DIRECTION_MIN_DOT) {
      return {
        accepted: false,
        reason: 'FIRING_DIRECTION_INVALID',
        damage: 0,
        weapon,
        isHeadshot: false,
      };
    }
  }

  // -------------------------------------------------------------------------
  // VULN-1 & RES-1: Server-side line-of-sight / occlusion check (Fail-Closed).
  // Uses authoritative map collision registry (server/mapCollision.ts).
  // A playable map MUST have registered collision data. If mapId is undefined,
  // unknown, or collision data is empty, the shot is rejected with
  // MAP_COLLISION_DATA_UNAVAILABLE (fail-closed).
  // -------------------------------------------------------------------------
  const losResult = checkLineOfSight(
    serverMuzzleX, serverMuzzleY, serverMuzzleZ,
    payload.endX,  payload.endY,  payload.endZ,
    context.mapId
  );

  if (!losResult.clear) {
    if (losResult.status === 'BLOCKED') {
      return {
        accepted: false,
        reason: 'LINE_OF_SIGHT_BLOCKED',
        damage: 0,
        weapon,
        isHeadshot: false,
      };
    }
    // 'UNKNOWN_MAP', 'MISSING_COLLISION_DATA', 'MALFORMED_COLLISION_DATA'
    return {
      accepted: false,
      reason: 'MAP_COLLISION_DATA_UNAVAILABLE',
      damage: 0,
      weapon,
      isHeadshot: false,
    };
  }

  // 7. Spatial hitpoint validation against target bounding volume
  const playerCenterY = target.y + 1.10;
  const hitDistFromCenter = Math.hypot(
    payload.endX - target.x,
    payload.endY - playerCenterY,
    payload.endZ - target.z
  );
  if (hitDistFromCenter > HITBOX.HITPOINT_MAX_DISTANCE) {
    return {
      accepted: false,
      reason: 'HITPOINT_OUT_OF_BOUNDS',
      damage: 0,
      weapon,
      isHeadshot: false,
    };
  }

  const horizontalDist = Math.hypot(
    payload.endX - target.x,
    payload.endZ - target.z
  );
  if (horizontalDist > HITBOX.MAX_HORIZONTAL_DISTANCE) {
    return {
      accepted: false,
      reason: 'HITPOINT_OUT_OF_BOUNDS',
      damage: 0,
      weapon,
      isHeadshot: false,
    };
  }

  const verticalOffset = payload.endY - target.y;
  if (
    verticalOffset < HITBOX.MIN_VERTICAL_OFFSET ||
    verticalOffset > HITBOX.MAX_VERTICAL_OFFSET
  ) {
    return {
      accepted: false,
      reason: 'HITPOINT_OUT_OF_BOUNDS',
      damage: 0,
      weapon,
      isHeadshot: false,
    };
  }

  // 8. Authoritative Headshot Verification
  // Head rotates around upper body pivot at (target.x, target.y + 0.80, target.z).
  // Use target's authoritative pitch/rotY from server state (clamped, same as VULN-5).
  const targetPitch = isValidCoordinate(target.pitch)
    ? Math.max(-1.1, Math.min(1.1, target.pitch))
    : 0;
  const targetRotY = isValidCoordinate(target.rotY) ? target.rotY : 0;

  const headOffsetY = HITBOX.UPPER_BODY_PIVOT_Y + HITBOX.HEAD_LOCAL_Y * Math.cos(targetPitch);
  const headForward = HITBOX.HEAD_LOCAL_Y * Math.sin(targetPitch);
  const headCenterX = target.x + headForward * Math.sin(targetRotY);
  const headCenterY = target.y + headOffsetY;
  const headCenterZ = target.z + headForward * Math.cos(targetRotY);

  const distToHeadCenter = Math.hypot(
    payload.endX - headCenterX,
    payload.endY - headCenterY,
    payload.endZ - headCenterZ
  );

  const neckMinY = target.y + HITBOX.UPPER_BODY_PIVOT_Y + HITBOX.NECK_LOCAL_Y * Math.cos(targetPitch);

  // Independent server verification:
  // Must be within head sphere tolerance and above the pitched neck boundary plane
  const isHeadshot = distToHeadCenter <= HITBOX.HEAD_SPHERE_RADIUS && payload.endY >= neckMinY;
  const verifiedZone: 'head' | 'body' = isHeadshot ? 'head' : 'body';

  const damage = Math.round(
    weapon.damage * (verifiedZone === 'head' ? weapon.headshotMultiplier : 1)
  );

  return {
    accepted: true,
    verifiedZone,
    damage,
    weapon,
    isHeadshot,
  };
}
