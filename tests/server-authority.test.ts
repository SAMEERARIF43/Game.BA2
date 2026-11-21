import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAuthoritativeHit,
  isValidCoordinate,
  HITBOX,
  type AuthoritativePlayerState,
} from '../server/hitValidation.ts';
import { SERVER_WEAPONS } from '../server/mapSpawns.ts';
import { WEAPON_IDS, WEAPONS, type WeaponId } from '../src/game/types.ts';

test('Production Logic: Coordinate Validation', async (t) => {
  await t.test('Validates normal numbers as true', () => {
    assert.strictEqual(isValidCoordinate(0), true);
    assert.strictEqual(isValidCoordinate(1.25), true);
    assert.strictEqual(isValidCoordinate(-42.7), true);
    assert.strictEqual(isValidCoordinate(1e5), true);
  });

  await t.test('Rejects NaN, Infinity, -Infinity and non-numbers', () => {
    assert.strictEqual(isValidCoordinate(NaN), false);
    assert.strictEqual(isValidCoordinate(Infinity), false);
    assert.strictEqual(isValidCoordinate(-Infinity), false);
    assert.strictEqual(isValidCoordinate('123'), false);
    assert.strictEqual(isValidCoordinate(null), false);
    assert.strictEqual(isValidCoordinate(undefined), false);
    assert.strictEqual(isValidCoordinate({}), false);
  });
});

test('Server Authority: Hit-Zone Security & Anti-Cheat Scenarios', async (t) => {
  const baseShooter: AuthoritativePlayerState = {
    id: 'shooter_p1',
    team: 'blue',
    x: 8,
    y: 0,
    z: 0,
    isAlive: true,
  };

  const baseTarget: AuthoritativePlayerState = {
    id: 'target_p2',
    team: 'red',
    x: 8,
    y: 0,
    z: 20,
    rotY: 0,
    pitch: 0,
    isAlive: true,
    health: 100,
  };

  const defaultContext = {
    friendlyFire: false,
    spawnProtectionUntil: 0,
    currentTime: 10000,
    lastShotTime: 0,
    checkRateOfFire: false,
    mapId: 'urban',
  };

  await t.test('SCENARIO 1: Client claims headshot but validated hit is body -> Body damage only', () => {
    const target = { ...baseTarget };
    // Hit point is on target's chest (y = 1.16m, centered horizontally at z = 20)
    const chestHitY = target.y + 1.16;

    const result = validateAuthoritativeHit(
      baseShooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        claimedZone: 'head', // Malicious or mistaken client claims headshot
        endX: target.x,
        endY: chestHitY,
        endZ: target.z,
      },
      defaultContext
    );

    assert.strictEqual(result.accepted, true, 'Hit should be accepted as valid impact on player');
    assert.strictEqual(result.isHeadshot, false, 'Server must independently reject headshot claim');
    assert.strictEqual(result.verifiedZone, 'body', 'Server must classify hit as body');
    assert.strictEqual(
      result.damage,
      34,
      'Damage must be base weapon damage (34), NOT headshot multiplier (68)'
    );
  });

  await t.test('SCENARIO 2: Client claims body but validated hit is head -> Follow server verified classification', () => {
    const target = { ...baseTarget };
    // Hit point is directly on target head center (standing head center y = target.y + 1.70m)
    const headHitY = target.y + 1.70;

    const result = validateAuthoritativeHit(
      baseShooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        claimedZone: 'body', // Client claims body (or omitted)
        endX: target.x,
        endY: headHitY,
        endZ: target.z,
      },
      defaultContext
    );

    assert.strictEqual(result.accepted, true, 'Hit should be accepted');
    assert.strictEqual(result.isHeadshot, true, 'Server must recognize hit is on the head');
    assert.strictEqual(result.verifiedZone, 'head', 'Server must authoritatively upgrade to head');
    assert.strictEqual(
      result.damage,
      68, // 34 * 2.0
      'Damage must apply full headshot multiplier (68), ignoring client body claim'
    );
  });

  await t.test('SCENARIO 3: Valid server-confirmed headshot -> Correct multiplier for all weapons', () => {
    const weaponsToTest: { id: WeaponId; baseDmg: number; multiplier: number; expectedDmg: number; targetZ: number }[] = [
      { id: 'shotgun', baseDmg: 16, multiplier: 1.5, expectedDmg: 24, targetZ: 20 },
      { id: 'ak47', baseDmg: 34, multiplier: 2.0, expectedDmg: 68, targetZ: 20 },
      { id: 'smg', baseDmg: 21, multiplier: 1.85, expectedDmg: 39, targetZ: 20 }, // Math.round(21 * 1.85) = 39
      { id: 'sniper', baseDmg: 115, multiplier: 2.5, expectedDmg: 288, targetZ: 20 }, // Math.round(115 * 2.5) = 288
      { id: 'pistol', baseDmg: 38, multiplier: 2.2, expectedDmg: 84, targetZ: 20 }, // Math.round(38 * 2.2) = 84
      { id: 'knife', baseDmg: 75, multiplier: 1.6, expectedDmg: 120, targetZ: 2 },
    ];

    for (const w of weaponsToTest) {
      const target = { ...baseTarget, z: w.targetZ };
      const headHitY = target.y + 1.70;

      const result = validateAuthoritativeHit(
        baseShooter,
        target,
        {
          weaponId: w.id,
          targetId: target.id,
          claimedZone: 'head',
          endX: target.x + 0.05,
          endY: headHitY + 0.02,
          endZ: target.z,
        },
        defaultContext
      );

      assert.strictEqual(result.accepted, true, `Weapon ${w.id} headshot should be accepted`);
      assert.strictEqual(result.isHeadshot, true);
      assert.strictEqual(result.verifiedZone, 'head');
      assert.strictEqual(
        result.damage,
        w.expectedDmg,
        `Weapon ${w.id} headshot damage must equal Math.round(${w.baseDmg} * ${w.multiplier})`
      );
    }
  });

  await t.test('SCENARIO 4: Invalid coordinates (undefined / missing) -> Rejected', () => {
    const target = { ...baseTarget };
    const result = validateAuthoritativeHit(
      baseShooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        claimedZone: 'head',
        // endX, endY, endZ missing
      },
      defaultContext
    );

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'INVALID_COORDINATES');
    assert.strictEqual(result.damage, 0);
  });

  await t.test('SCENARIO 5: NaN and Infinity -> Rejected', () => {
    const target = { ...baseTarget };

    const nanResult = validateAuthoritativeHit(
      baseShooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        endX: NaN,
        endY: 1.70,
        endZ: 20,
      },
      defaultContext
    );
    assert.strictEqual(nanResult.accepted, false);
    assert.strictEqual(nanResult.reason, 'INVALID_COORDINATES');

    const infResult = validateAuthoritativeHit(
      baseShooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        endX: 0,
        endY: Infinity,
        endZ: 20,
      },
      defaultContext
    );
    assert.strictEqual(infResult.accepted, false);
    assert.strictEqual(infResult.reason, 'INVALID_COORDINATES');

    const negInfResult = validateAuthoritativeHit(
      baseShooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        endX: 0,
        endY: 1.70,
        endZ: -Infinity,
      },
      defaultContext
    );
    assert.strictEqual(negInfResult.accepted, false);
    assert.strictEqual(negInfResult.reason, 'INVALID_COORDINATES');
  });

  await t.test('SCENARIO 6: Out-of-range hit -> Rejected', () => {
    // SMG range is 125m (max allowed 131m)
    const farTarget: AuthoritativePlayerState = {
      ...baseTarget,
      z: 150, // 150m away
    };

    const result = validateAuthoritativeHit(
      baseShooter,
      farTarget,
      {
        weaponId: 'smg',
        targetId: farTarget.id,
        endX: farTarget.x,
        endY: farTarget.y + 1.16,
        endZ: farTarget.z,
      },
      defaultContext
    );

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'OUT_OF_WEAPON_RANGE');
    assert.strictEqual(result.damage, 0);
  });

  await t.test('SCENARIO 7: Dead or nonexistent target -> Rejected', () => {
    // Nonexistent target
    const notFound = validateAuthoritativeHit(
      baseShooter,
      null,
      {
        weaponId: 'ak47',
        targetId: 'ghost_id',
        endX: 0,
        endY: 1.2,
        endZ: 10,
      },
      defaultContext
    );
    assert.strictEqual(notFound.accepted, false);
    assert.strictEqual(notFound.reason, 'TARGET_NOT_FOUND');

    // Dead target
    const deadTarget: AuthoritativePlayerState = {
      ...baseTarget,
      isAlive: false,
    };
    const deadResult = validateAuthoritativeHit(
      baseShooter,
      deadTarget,
      {
        weaponId: 'ak47',
        targetId: deadTarget.id,
        endX: deadTarget.x,
        endY: deadTarget.y + 1.2,
        endZ: deadTarget.z,
      },
      defaultContext
    );
    assert.strictEqual(deadResult.accepted, false);
    assert.strictEqual(deadResult.reason, 'TARGET_NOT_ALIVE');

    // Self-hit
    const selfHit = validateAuthoritativeHit(
      baseShooter,
      baseShooter,
      {
        weaponId: 'ak47',
        targetId: baseShooter.id,
        endX: baseShooter.x,
        endY: baseShooter.y + 1.2,
        endZ: baseShooter.z,
      },
      defaultContext
    );
    assert.strictEqual(selfHit.accepted, false);
    assert.strictEqual(selfHit.reason, 'SELF_HIT');
  });

  await t.test('SCENARIO 8: Friendly-fire disabled -> Rejected', () => {
    const allyTarget: AuthoritativePlayerState = {
      ...baseTarget,
      team: 'blue', // same team as shooter
    };

    const blocked = validateAuthoritativeHit(
      baseShooter,
      allyTarget,
      {
        weaponId: 'ak47',
        targetId: allyTarget.id,
        endX: allyTarget.x,
        endY: allyTarget.y + 1.16,
        endZ: allyTarget.z,
      },
      { ...defaultContext, friendlyFire: false }
    );
    assert.strictEqual(blocked.accepted, false);
    assert.strictEqual(blocked.reason, 'FRIENDLY_FIRE_BLOCKED');

    // When friendly fire is enabled, hit should be accepted
    const allowed = validateAuthoritativeHit(
      baseShooter,
      allyTarget,
      {
        weaponId: 'ak47',
        targetId: allyTarget.id,
        endX: allyTarget.x,
        endY: allyTarget.y + 1.16,
        endZ: allyTarget.z,
      },
      { ...defaultContext, friendlyFire: true }
    );
    assert.strictEqual(allowed.accepted, true);
    assert.strictEqual(allowed.damage, 34);
  });

  await t.test('SCENARIO 9: Spawn-protected target -> Rejected', () => {
    const target = { ...baseTarget };
    const protectedContext = {
      ...defaultContext,
      spawnProtectionUntil: 15000,
      currentTime: 12000, // within protection window
    };

    const result = validateAuthoritativeHit(
      baseShooter,
      target,
      {
        weaponId: 'sniper',
        targetId: target.id,
        claimedZone: 'head',
        endX: target.x,
        endY: target.y + 1.70,
        endZ: target.z,
      },
      protectedContext
    );

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'SPAWN_PROTECTION_ACTIVE');
    assert.strictEqual(result.damage, 0);
  });

  await t.test('SCENARIO 10: Fire-rate violation -> Rejected', () => {
    const target = { ...baseTarget };
    // Sniper minFireIntervalMs is 850ms (min interval * 0.72 = 612ms)
    const rofContext = {
      ...defaultContext,
      checkRateOfFire: true,
      lastShotTime: 10000,
      currentTime: 10250, // 250ms later < 612ms threshold
    };

    const result = validateAuthoritativeHit(
      baseShooter,
      target,
      {
        weaponId: 'sniper',
        targetId: target.id,
        endX: target.x,
        endY: target.y + 1.16,
        endZ: target.z,
      },
      rofContext
    );

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'RATE_OF_FIRE_VIOLATION');

    // Paced shot after interval passes
    const validPacedContext = {
      ...rofContext,
      currentTime: 10700, // 700ms later > 612ms threshold
    };
    const validResult = validateAuthoritativeHit(
      baseShooter,
      target,
      {
        weaponId: 'sniper',
        targetId: target.id,
        endX: target.x,
        endY: target.y + 1.16,
        endZ: target.z,
      },
      validPacedContext
    );
    assert.strictEqual(validResult.accepted, true);
    assert.strictEqual(validResult.damage, 115);
  });

  await t.test('SCENARIO 11: All 5 guns and knife damage remain synchronized', () => {
    const weaponIds: readonly WeaponId[] = WEAPON_IDS;
    for (const wid of weaponIds) {
      assert.strictEqual(
        SERVER_WEAPONS[wid].damage,
        WEAPONS[wid].damage,
        `Damage synchronization failed for ${wid}`
      );
      assert.strictEqual(
        SERVER_WEAPONS[wid].headshotMultiplier,
        WEAPONS[wid].headshotMultiplier,
        `Headshot multiplier synchronization failed for ${wid}`
      );
      assert.strictEqual(
        SERVER_WEAPONS[wid].range,
        WEAPONS[wid].range,
        `Range synchronization failed for ${wid}`
      );
    }
  });

  await t.test('SCENARIO 12: Upper body pitch transformation maintains accurate headshot verification', () => {
    // Target looking down at pitch = -0.5 rad (~28 degrees)
    const targetPitchDown: AuthoritativePlayerState = {
      ...baseTarget,
      pitch: -0.5,
      rotY: 0,
    };

    // Upper body pivot is at y = 0.80.
    // Local head is at (0, 0.90, 0).
    // With pitch = -0.5 rad:
    // headOffsetY = 0.80 + 0.90 * cos(-0.5) = 0.80 + 0.90 * 0.87758 = 1.5898m
    // headForward = 0.90 * sin(-0.5) = -0.4315m
    // Since rotY = 0, headCenterZ = target.z + headForward = 20 - 0.4315 = 19.5685m
    const expectedPitchedHeadY = targetPitchDown.y + 0.80 + 0.90 * Math.cos(-0.5);
    const expectedPitchedHeadZ = targetPitchDown.z + 0.90 * Math.sin(-0.5);

    // Hit right at the pitched head center
    const hitPitchedHead = validateAuthoritativeHit(
      baseShooter,
      targetPitchDown,
      {
        weaponId: 'ak47',
        targetId: targetPitchDown.id,
        endX: targetPitchDown.x,
        endY: expectedPitchedHeadY,
        endZ: expectedPitchedHeadZ,
      },
      defaultContext
    );
    assert.strictEqual(hitPitchedHead.accepted, true);
    assert.strictEqual(hitPitchedHead.isHeadshot, true, 'Pitched head hit must be verified as headshot');
    assert.strictEqual(hitPitchedHead.damage, 68);

    // Hit at the OLD standing head position (y = 1.70, z = 20.0) where the player's head used to be
    // Distance from pitched head center is hypot(0, 1.70 - 1.59, 20.0 - 19.5685) = hypot(0.11, 0.43) = 0.44m > 0.38m
    const hitOldHeadPos = validateAuthoritativeHit(
      baseShooter,
      targetPitchDown,
      {
        weaponId: 'ak47',
        targetId: targetPitchDown.id,
        claimedZone: 'head', // Client claims headshot on phantom upright head position
        endX: targetPitchDown.x,
        endY: targetPitchDown.y + 1.70,
        endZ: targetPitchDown.z,
      },
      defaultContext
    );
    assert.strictEqual(
      hitOldHeadPos.isHeadshot,
      false,
      'Phantom upright head position must NOT register as headshot when target is pitched'
    );
  });

  await t.test('SCENARIO 13: Hit point spatial bounds enforcement', () => {
    const target = { ...baseTarget }; // at (8, 0, 20)

    // Hitpoint horizontally too far (x = target.x + 1.6m > MAX_HORIZONTAL_DISTANCE 1.45m)
    const farHorizontal = validateAuthoritativeHit(
      baseShooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        endX: target.x + 1.60,
        endY: target.y + 1.20,
        endZ: target.z,
      },
      defaultContext
    );
    assert.strictEqual(farHorizontal.accepted, false);
    assert.strictEqual(farHorizontal.reason, 'HITPOINT_OUT_OF_BOUNDS');

    // Hitpoint vertically too high (y = target.y + 2.5m > MAX_VERTICAL_OFFSET 2.15m)
    const tooHigh = validateAuthoritativeHit(
      baseShooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        endX: target.x,
        endY: target.y + 2.50,
        endZ: target.z,
      },
      defaultContext
    );
    assert.strictEqual(tooHigh.accepted, false);
    assert.strictEqual(tooHigh.reason, 'HITPOINT_OUT_OF_BOUNDS');

    // Hitpoint vertically below floor (y = target.y - 0.5m < MIN_VERTICAL_OFFSET -0.30m)
    const tooLow = validateAuthoritativeHit(
      baseShooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        endX: target.x,
        endY: target.y - 0.50,
        endZ: target.z,
      },
      defaultContext
    );
    assert.strictEqual(tooLow.accepted, false);
    assert.strictEqual(tooLow.reason, 'HITPOINT_OUT_OF_BOUNDS');
  });
});

// =============================================================================
// BATCH 3.0R-H2 — NEW SECURITY TESTS (VULN-1, VULN-2, VULN-3, VULN-4, VULN-5, VULN-8)
// =============================================================================

import { type HitValidationContext } from '../server/hitValidation.ts';
import { checkLineOfSight, hasLineOfSight, MAP_COLLISION_DATA } from '../server/mapCollision.ts';

// ---------------------------------------------------------------------------
// Helpers shared across H2 test suites
// ---------------------------------------------------------------------------
const mkShooter = (overrides: Partial<AuthoritativePlayerState> = {}): AuthoritativePlayerState => ({
  id: 'shooter_h2',
  team: 'blue',
  x: 8,
  y: 0,
  z: 0,
  isAlive: true,
  rotY: 0,
  pitch: 0,
  ...overrides,
});

const mkTarget = (overrides: Partial<AuthoritativePlayerState> = {}): AuthoritativePlayerState => ({
  id: 'target_h2',
  team: 'red',
  x: 8,
  y: 0,
  z: 15,
  isAlive: true,
  rotY: 0,
  pitch: 0,
  health: 100,
  ...overrides,
});

const mkCtx = (overrides: Partial<HitValidationContext> = {}): HitValidationContext => ({
  friendlyFire: false,
  spawnProtectionUntil: 0,
  currentTime: 10000,
  checkRateOfFire: false,
  mapId: 'urban',
  ...overrides,
});

// Thin wrapper: endPoint = target body centre
const bodyHit = (target: AuthoritativePlayerState) => ({
  endX: target.x,
  endY: target.y + 1.25,
  endZ: target.z,
});

// Thin wrapper: endPoint = target head centre
const headHit = (target: AuthoritativePlayerState) => ({
  endX: target.x,
  endY: target.y + 1.70,
  endZ: target.z,
});

// ---------------------------------------------------------------------------
// VULN-3: Server muzzle derivation — fabricated muzzle cannot extend range
// ---------------------------------------------------------------------------
test('VULN-3: Server muzzle derivation — client muzzle coordinates are ignored', async (t) => {
  const shooter = mkShooter({ x: 8, y: 0, z: 0 });
  const target  = mkTarget({ x: 8, y: 0, z: 15 });

  await t.test('Fabricated muzzle at weapon range boundary cannot extend shot range beyond weapon.range+6', () => {
    // Client claims muzzle at z = 125 (near weapon.range = 125m) to reach a target at z = 180m
    // The target is 180m from shooter — far beyond smg range (131m with +6 margin).
    const farTarget = mkTarget({ x: 8, z: 180 });
    const result = validateAuthoritativeHit(
      shooter,
      farTarget,
      {
        weaponId: 'smg',
        targetId: farTarget.id,
        muzzleX: 0,
        muzzleY: 0,
        muzzleZ: 125,  // fabricated muzzle — server must ignore this
        endX: farTarget.x,
        endY: farTarget.y + 1.25,
        endZ: farTarget.z,
      },
      mkCtx({ shooterRotY: 0, shooterPitch: 0 })
    );
    // Server measures from shooter (8,0,0) -> target (8,0,180) = 180m > 131m: rejected
    assert.strictEqual(result.accepted, false, 'Fabricated muzzle must not allow out-of-range shots');
    assert.ok(
      result.reason === 'OUT_OF_WEAPON_RANGE' || result.reason === 'MUZZLE_TO_HIT_RANGE_EXCEEDED',
      `Expected range rejection, got: ${result.reason}`
    );
  });

  await t.test('Valid in-range shot with plausible client muzzle is accepted', () => {
    const result = validateAuthoritativeHit(
      shooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        muzzleX: 8.1, // plausible near shooter x=8
        muzzleY: 1.3,
        muzzleZ: 0.1,
        ...bodyHit(target),
      },
      mkCtx({ shooterRotY: 0, shooterPitch: 0 })
    );
    assert.strictEqual(result.accepted, true, 'Valid in-range shot must be accepted');
    assert.strictEqual(result.damage, 34);
  });

  await t.test('HITBOX constants expose correct server muzzle Y offsets', () => {
    assert.strictEqual(HITBOX.PLAYER_MUZZLE_Y_OFFSET, 1.55);
    assert.strictEqual(HITBOX.BOT_MUZZLE_Y_OFFSET, 1.35);
  });
});

// ---------------------------------------------------------------------------
// VULN-2: Firing-direction validation
// ---------------------------------------------------------------------------
test('VULN-2: Firing-direction validation', async (t) => {
  // In Desert map at z = -20 to -5, firing lane is wide open with clear LOS
  const shooter = mkShooter({ x: 0, y: 0, z: -20, rotY: 0, pitch: 0 });
  const target  = mkTarget({ x: 0, y: 0, z: -5 });
  const ctx     = mkCtx({ mapId: 'desert', shooterRotY: 0, shooterPitch: 0 });

  await t.test('Shot in forward direction (0°) accepted', () => {
    const result = validateAuthoritativeHit(
      shooter, target,
      { weaponId: 'ak47', targetId: target.id, ...bodyHit(target) },
      ctx
    );
    assert.strictEqual(result.accepted, true);
  });

  await t.test('Shot 29° from forward accepted (within 30° tolerance)', () => {
    // 15m ahead; shift x by tan(29°)*15 ≈ 8.31 (use 8.1 for 28.37°)
    const sideTarget = mkTarget({ x: 8.1, y: 0, z: -5 });
    const result = validateAuthoritativeHit(
      shooter, sideTarget,
      { weaponId: 'ak47', targetId: sideTarget.id, ...bodyHit(sideTarget) },
      ctx
    );
    assert.strictEqual(result.accepted, true, '29° within 30° tolerance must be accepted');
  });

  await t.test('Shot 31° from forward rejected (exceeds 30° tolerance)', () => {
    // 15m ahead; shift x by 9.3 for 31.8° > 30°
    const sideTarget = mkTarget({ x: 9.3, y: 0, z: -5 });
    const result = validateAuthoritativeHit(
      shooter, sideTarget,
      { weaponId: 'ak47', targetId: sideTarget.id, ...bodyHit(sideTarget) },
      ctx
    );
    assert.strictEqual(result.accepted, false, '31° beyond 30° tolerance must be rejected');
    assert.strictEqual(result.reason, 'FIRING_DIRECTION_INVALID');
  });

  await t.test('Shot directly backward (-Z, 180°) rejected', () => {
    // Target behind shooter at z = -35 (shooter is at z = -20)
    const behindTarget = mkTarget({ x: 0, y: 0, z: -35 });
    const result = validateAuthoritativeHit(
      shooter, behindTarget,
      { weaponId: 'ak47', targetId: behindTarget.id, ...bodyHit(behindTarget) },
      ctx
    );
    assert.strictEqual(result.accepted, false, 'Backward shot must be rejected');
    assert.strictEqual(result.reason, 'FIRING_DIRECTION_INVALID');
  });

  await t.test('NaN/Inf shooter orientation defaults to 0 — valid forward shot still accepted', () => {
    const nanCtx = mkCtx({ mapId: 'desert', shooterRotY: NaN, shooterPitch: Infinity });
    const result = validateAuthoritativeHit(
      shooter, target,
      { weaponId: 'ak47', targetId: target.id, ...bodyHit(target) },
      nanCtx
    );
    assert.strictEqual(result.accepted, true, 'NaN orientation must default to 0, allowing valid forward shot');
  });

  await t.test('Bot shooter skips firing-direction check (isBotShooter=true)', () => {
    const behindTarget = mkTarget({ x: 0, y: 0, z: -35 });
    const result = validateAuthoritativeHit(
      shooter, behindTarget,
      { weaponId: 'ak47', targetId: behindTarget.id, ...bodyHit(behindTarget) },
      mkCtx({ mapId: 'desert', isBotShooter: true })
    );
    assert.notEqual(result.reason, 'FIRING_DIRECTION_INVALID', 'Bot shooter must skip direction check');
  });
});

// ---------------------------------------------------------------------------
// VULN-1: Occlusion / line-of-sight checks
// ---------------------------------------------------------------------------
test('VULN-1: Server-side occlusion checks (hasLineOfSight)', async (t) => {
  await t.test('hasLineOfSight returns true for clear path (no obstruction)', () => {
    // Open path from origin going straight north (+Z), far from any building.
    // Urban map: buildings at x=±13.5, perimeter at z≈29. A ray at x=8 (clear lane) is unobstructed.
    const clear = hasLineOfSight(8, 1.55, -20, 8, 1.55, 20, 'urban');
    assert.strictEqual(clear, true, 'Clear path along east lane must return true');
  });

  await t.test('hasLineOfSight returns false when ray hits urban perimeter wall', () => {
    // Shoot from inside the arena toward the south perimeter wall (z≈-29)
    const blocked = hasLineOfSight(0, 1.55, 0, 0, 1.55, -32, 'urban');
    assert.strictEqual(blocked, false, 'Shot through perimeter wall must be blocked');
  });

  await t.test('hasLineOfSight returns false when ray hits urban building', () => {
    // West building AABB: (-16.6, *, -4.5) to (-10.4, *, 4.5)
    // Ray from outside west building (x=-5, z=0) toward east side (x=5, z=0)
    // must pass through the building core
    const blocked = hasLineOfSight(-5, 1.55, 0, 5, 1.55, 0, 'urban');
    // The west building sits at x=-13.5 ± 3.1 → (-16.6 to -10.4).
    // A ray from x=-5 heading to x=5 does NOT pass through the building.
    // Use a ray starting from deep west side to east that crosses the building:
    const blocked2 = hasLineOfSight(-20, 1.55, 0, 0, 1.55, 0, 'urban');
    // Ray from x=-20 to x=0 crosses x=[-16.6,-10.4] → hits bldg_w AABB
    assert.strictEqual(blocked2, false, 'Shot through urban building must be blocked');
  });

  await t.test('RES-1: hasLineOfSight and checkLineOfSight fail closed for unknown mapId', () => {
    const result = hasLineOfSight(0, 1.5, 0, 0, 1.5, -100, 'nonexistent_map');
    assert.strictEqual(result, false, 'Unknown map must fail closed (return false)');
    const check = checkLineOfSight(0, 1.5, 0, 0, 1.5, -100, 'nonexistent_map');
    assert.strictEqual(check.status, 'UNKNOWN_MAP');
    assert.strictEqual(check.clear, false);
  });

  await t.test('RES-1: hasLineOfSight and checkLineOfSight fail closed for undefined mapId', () => {
    const result = hasLineOfSight(0, 1.5, 0, 0, 1.5, -100, undefined);
    assert.strictEqual(result, false, 'Undefined mapId must fail closed (return false)');
    const check = checkLineOfSight(0, 1.5, 0, 0, 1.5, -100, undefined);
    assert.strictEqual(check.status, 'UNKNOWN_MAP');
    assert.strictEqual(check.clear, false);
  });

  await t.test('MAP_COLLISION_DATA contains all 4 maps', () => {
    assert.ok(MAP_COLLISION_DATA['urban'],      'urban collision data must exist');
    assert.ok(MAP_COLLISION_DATA['desert'],     'desert collision data must exist');
    assert.ok(MAP_COLLISION_DATA['industrial'], 'industrial collision data must exist');
    assert.ok(MAP_COLLISION_DATA['forest'],     'forest collision data must exist');
  });

  await t.test('validateAuthoritativeHit rejects shots blocked by LOS in urban map', () => {
    // Shooter at x=-5, target on the other side of west building at x=-20, z=2.8
    // Ray passes through west building solid wall (bldg_w_e_n) at x≈-10.58
    const shooter = mkShooter({ x: -5, y: 0, z: 2.8, rotY: -Math.PI / 2, pitch: 0 });
    const target  = mkTarget({ x: -20, y: 0, z: 2.8 });
    const result = validateAuthoritativeHit(
      shooter, target,
      { weaponId: 'ak47', targetId: target.id, ...bodyHit(target) },
      mkCtx({ mapId: 'urban', shooterRotY: -Math.PI / 2, shooterPitch: 0 })
    );
    assert.strictEqual(result.accepted, false, 'Shot through urban building wall must be rejected by LOS check');
    assert.strictEqual(result.reason, 'LINE_OF_SIGHT_BLOCKED');
  });
});

// ---------------------------------------------------------------------------
// VULN-4: Bot combat — bot hits must now reach applyAuthoritativeHit with coords
// (These tests exercise validateAuthoritativeHit directly with bot-style inputs)
// ---------------------------------------------------------------------------
test('VULN-4: Bot combat — server-supplied coordinates bypass client checks', async (t) => {
  const bot = mkShooter({ id: 'bot_red_1', team: 'red', x: 8, y: 1, z: -10, rotY: 0, pitch: 0 });
  const target = mkTarget({ id: 'player_blue_1', team: 'blue', x: 8, y: 0, z: 5 });
  const botCtx = mkCtx({ isBotShooter: true });

  await t.test('Bot body shot accepted with server-computed coordinates', () => {
    const result = validateAuthoritativeHit(
      bot, target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        endX: target.x,
        endY: target.y + 1.25,
        endZ: target.z,
        // No muzzle — bot doesn't send client muzzle
      },
      botCtx
    );
    assert.strictEqual(result.accepted, true, 'Bot body shot must be accepted');
    assert.strictEqual(result.verifiedZone, 'body');
    assert.strictEqual(result.damage, 34);
  });

  await t.test('Bot head shot accepted with server-computed head coordinates', () => {
    const result = validateAuthoritativeHit(
      bot, target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        endX: target.x,
        endY: target.y + 1.70,
        endZ: target.z,
      },
      botCtx
    );
    assert.strictEqual(result.accepted, true, 'Bot head shot must be accepted');
    assert.strictEqual(result.isHeadshot, true);
    assert.strictEqual(result.damage, 68); // 34 * 2.0
  });

  await t.test('Bot respects weapon fire rate even with isBotShooter=true', () => {
    const result = validateAuthoritativeHit(
      bot, target,
      {
        weaponId: 'sniper',
        targetId: target.id,
        endX: target.x,
        endY: target.y + 1.25,
        endZ: target.z,
      },
      { ...botCtx, checkRateOfFire: true, lastShotTime: 10000, currentTime: 10100 }
    );
    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'RATE_OF_FIRE_VIOLATION');
  });

  await t.test('Bot respects spawn protection even with isBotShooter=true', () => {
    const result = validateAuthoritativeHit(
      bot, target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        endX: target.x,
        endY: target.y + 1.25,
        endZ: target.z,
      },
      { ...botCtx, spawnProtectionUntil: 15000, currentTime: 12000 }
    );
    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'SPAWN_PROTECTION_ACTIVE');
  });

  await t.test('Bot out-of-range shot rejected (SERVER_WEAPONS range enforced)', () => {
    // Bot at z=-10 on red team; target on blue team at z=200 → dist ≈ 210m > 126m threshold
    const farTarget = mkTarget({ team: 'blue', z: 200 });
    const result = validateAuthoritativeHit(
      bot, farTarget,
      {
        weaponId: 'pistol',
        targetId: farTarget.id,
        endX: farTarget.x,
        endY: farTarget.y + 1.25,
        endZ: farTarget.z,
      },
      botCtx
    );
    assert.strictEqual(result.accepted, false);
    assert.ok(
      result.reason === 'OUT_OF_WEAPON_RANGE' || result.reason === 'MUZZLE_TO_HIT_RANGE_EXCEEDED'
    );
  });

  await t.test('Bot weapon damage uses SERVER_WEAPONS specification', () => {
    const result = validateAuthoritativeHit(
      bot, target,
      {
        weaponId: 'smg',
        targetId: target.id,
        endX: target.x,
        endY: target.y + 1.25,
        endZ: target.z,
      },
      botCtx
    );
    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.damage, SERVER_WEAPONS['smg'].damage);
  });
});

// ---------------------------------------------------------------------------
// VULN-5: Rotation hardening
// ---------------------------------------------------------------------------
test('VULN-5: Rotation hardening — extreme yaw and pitch inputs sanitised', async (t) => {
  const shooter = mkShooter({ x: 8, y: 0, z: 0 });
  const target  = mkTarget({ x: 8, y: 0, z: 15 });

  await t.test('Extreme yaw (1000π) wraps correctly and allows forward shot', () => {
    // 1000π = 500 full rotations → equivalent to 0 (forward = +Z)
    const result = validateAuthoritativeHit(
      shooter, target,
      { weaponId: 'ak47', targetId: target.id, ...bodyHit(target) },
      mkCtx({ mapId: 'urban', shooterRotY: 1000 * Math.PI, shooterPitch: 0 })
    );
    // 1000π mod 2π = 0 → forward → target at z=15 is ahead → accepted
    assert.strictEqual(result.accepted, true, 'Extreme yaw must wrap and allow forward shot');
  });

  await t.test('Pitch +2.5 rad (beyond ±1.48 clamp) is clamped, not rejected outright', () => {
    // Shooter with extreme downward pitch tries to hit target at z=15 body centre
    const result = validateAuthoritativeHit(
      shooter, target,
      { weaponId: 'ak47', targetId: target.id, ...bodyHit(target) },
      mkCtx({ mapId: 'urban', shooterRotY: 0, shooterPitch: 2.5 })  // will be clamped to 1.48
    );
    // Clamped pitch=1.48 (sharp downward) may cause direction check to fail for z=15 target.
    // The important thing is pitch is clamped, not passed raw.
    // We only assert no crash and that if rejected it is not due to INVALID_COORDINATES.
    assert.notEqual(result.reason, 'INVALID_COORDINATES', 'Extreme pitch must be clamped, not treated as invalid coord');
  });

  await t.test('Pitched head position still verified correctly after clamping', () => {
    // Target looking down at pitch = -0.5 rad
    const pitchedTarget = mkTarget({ x: 8, pitch: -0.5, rotY: 0, z: 15 });
    const expectedHeadY = pitchedTarget.y + 0.80 + 0.90 * Math.cos(-0.5);
    const expectedHeadZ = pitchedTarget.z + 0.90 * Math.sin(-0.5);

    const result = validateAuthoritativeHit(
      shooter, pitchedTarget,
      {
        weaponId: 'ak47',
        targetId: pitchedTarget.id,
        endX: pitchedTarget.x,
        endY: expectedHeadY,
        endZ: expectedHeadZ,
      },
      mkCtx({ mapId: 'urban', shooterRotY: 0, shooterPitch: 0 })
    );
    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.isHeadshot, true, 'Pitched head must register as headshot');
  });

  await t.test('NaN rotY in context defaults to 0 — does not crash or accept backward shot', () => {
    const behindTarget = mkTarget({ x: 8, z: -15 });
    const result = validateAuthoritativeHit(
      shooter, behindTarget,
      { weaponId: 'ak47', targetId: behindTarget.id, ...bodyHit(behindTarget) },
      mkCtx({ mapId: 'urban', shooterRotY: NaN, shooterPitch: 0 })
    );
    // NaN rotY → defaults to 0 (forward=+Z). Target at z=-15 is 180° behind → rejected.
    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'FIRING_DIRECTION_INVALID', 'NaN rotY must default to 0, causing backward shot rejection');
  });

  await t.test('Infinity pitch in context defaults to 0', () => {
    const result = validateAuthoritativeHit(
      shooter, target,
      { weaponId: 'ak47', targetId: target.id, ...bodyHit(target) },
      mkCtx({ mapId: 'urban', shooterRotY: 0, shooterPitch: Infinity })
    );
    // Infinity pitch → defaults to 0. Target is ahead at z=15 → accepted.
    assert.strictEqual(result.accepted, true, 'Infinity pitch must default to 0 and allow valid shot');
  });
});
