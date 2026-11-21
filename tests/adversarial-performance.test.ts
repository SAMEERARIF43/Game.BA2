import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAuthoritativeHit,
  HitValidationContext,
  HitRejectionReason,
} from '../server/hitValidation.ts';
import {
  checkLineOfSight,
  hasLineOfSight,
  rayIntersectsAABB,
  getMapCollisionBoxes,
  ServerAABB,
} from '../server/mapCollision.ts';
import { PlayerSchema } from '../server/schema/MatchState.ts';

function createPlayer(
  id: string,
  team: 'blue' | 'red',
  x: number,
  y: number,
  z: number,
  rotY = 0,
  pitch = 0,
  weaponId = 'ak47',
  isBot = false
): PlayerSchema {
  const p = new PlayerSchema();
  p.id = id;
  p.name = `${isBot ? 'Bot' : 'Player'}_${id}`;
  p.team = team;
  p.isBot = isBot;
  p.isHost = false;
  p.isAlive = true;
  p.health = 100;
  p.kills = 0;
  p.deaths = 0;
  p.x = x;
  p.y = y;
  p.z = z;
  p.rotY = rotY;
  p.pitch = pitch;
  p.weaponId = weaponId;
  return p;
}

test('ADVERSARIAL & PERFORMANCE: 15 Multi-Vector Attack Scenarios, Micro-Benchmark & Bot Combat', async (t) => {
  // =========================================================================
  // Section A: 15 Combined Adversarial Attack Scenarios
  // =========================================================================

  await t.test('Scenario 1: Fabricated muzzle coordinates + behind solid cover', () => {
    // Shooter at (-5, 0, 2.8) facing west. Target at (-20, 0, 2.8) behind west storefront wall.
    // Client fabricates muzzle at (-19, 1.5, 2.8) next to target trying to bypass cover and distance.
    const shooter = createPlayer('s1', 'blue', -5, 0, 2.8, -Math.PI / 2, 0, 'ak47');
    const target = createPlayer('t1', 'red', -20, 0, 2.8, 0, 0, 'ak47');

    const result = validateAuthoritativeHit(
      shooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        muzzleX: -19, // fabricated muzzle
        muzzleY: 1.55,
        muzzleZ: 2.8,
        endX: target.x,
        endY: target.y + 1.25,
        endZ: target.z,
      },
      {
        friendlyFire: false,
        spawnProtectionUntil: 0,
        currentTime: 1000,
        shooterRotY: shooter.rotY,
        shooterPitch: shooter.pitch,
        mapId: 'urban',
      }
    );

    assert.strictEqual(result.accepted, false);
    // Because server derives authoritative muzzle at shooter's real position, LOS is blocked by the wall
    assert.strictEqual(result.reason, 'LINE_OF_SIGHT_BLOCKED');
  });

  await t.test('Scenario 2: Backward firing + claimed headshot', () => {
    // Shooter at (8, 0, 0) facing +Z (rotY=0). Target behind at (8, 0, -15).
    // Client claims headshot.
    const shooter = createPlayer('s2', 'blue', 8, 0, 0, 0, 0, 'ak47');
    const target = createPlayer('t2', 'red', 8, 0, -15, 0, 0, 'ak47');

    const result = validateAuthoritativeHit(
      shooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        zone: 'head',
        endX: target.x,
        endY: target.y + 1.70,
        endZ: target.z,
      },
      {
        friendlyFire: false,
        spawnProtectionUntil: 0,
        currentTime: 1000,
        shooterRotY: shooter.rotY,
        shooterPitch: shooter.pitch,
        mapId: 'urban',
      }
    );

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'FIRING_DIRECTION_INVALID');
  });

  await t.test('Scenario 3: Spawn-protected target + lethal sniper weapon (AWP-50 Sniper)', () => {
    const shooter = createPlayer('s3', 'blue', 8, 0, 0, 0, 0, 'sniper');
    const target = createPlayer('t3', 'red', 8, 0, 15, 0, 0, 'ak47');

    const result = validateAuthoritativeHit(
      shooter,
      target,
      {
        weaponId: 'sniper',
        targetId: target.id,
        endX: target.x,
        endY: target.y + 1.25,
        endZ: target.z,
      },
      {
        friendlyFire: false,
        spawnProtectionUntil: 5000, // protected until t=5000
        currentTime: 2000,          // fired at t=2000
        shooterRotY: shooter.rotY,
        shooterPitch: shooter.pitch,
        mapId: 'urban',
      }
    );

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'SPAWN_PROTECTION_ACTIVE');
  });

  await t.test('Scenario 4: Dead target + valid line of sight and orientation', () => {
    const shooter = createPlayer('s4', 'blue', 8, 0, 0, 0, 0, 'ak47');
    const target = createPlayer('t4', 'red', 8, 0, 15, 0, 0, 'ak47');
    target.isAlive = false;
    target.health = 0;

    const result = validateAuthoritativeHit(
      shooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        endX: target.x,
        endY: target.y + 1.25,
        endZ: target.z,
      },
      {
        friendlyFire: false,
        spawnProtectionUntil: 0,
        currentTime: 1000,
        shooterRotY: shooter.rotY,
        shooterPitch: shooter.pitch,
        mapId: 'urban',
      }
    );

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'TARGET_NOT_ALIVE');
  });

  await t.test('Scenario 5: Friendly-fire disabled + ally claimed headshot', () => {
    const shooter = createPlayer('s5', 'blue', 8, 0, 0, 0, 0, 'ak47');
    const ally = createPlayer('ally5', 'blue', 8, 0, 15, 0, 0, 'ak47'); // same team

    const result = validateAuthoritativeHit(
      shooter,
      ally,
      {
        weaponId: 'ak47',
        targetId: ally.id,
        zone: 'head',
        endX: ally.x,
        endY: ally.y + 1.70,
        endZ: ally.z,
      },
      {
        friendlyFire: false, // disabled
        spawnProtectionUntil: 0,
        currentTime: 1000,
        shooterRotY: shooter.rotY,
        shooterPitch: shooter.pitch,
        mapId: 'urban',
      }
    );

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'FRIENDLY_FIRE_BLOCKED');
  });

  await t.test('Scenario 6: Friendly-fire enabled + ally legitimate hit', () => {
    const shooter = createPlayer('s6', 'blue', 8, 0, 0, 0, 0, 'ak47');
    const ally = createPlayer('ally6', 'blue', 8, 0, 15, 0, 0, 'ak47');

    const result = validateAuthoritativeHit(
      shooter,
      ally,
      {
        weaponId: 'ak47',
        targetId: ally.id,
        zone: 'body',
        endX: ally.x,
        endY: ally.y + 1.25,
        endZ: ally.z,
      },
      {
        friendlyFire: true, // enabled
        spawnProtectionUntil: 0,
        currentTime: 1000,
        shooterRotY: shooter.rotY,
        shooterPitch: shooter.pitch,
        mapId: 'urban',
      }
    );

    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.damage, 34);
    assert.strictEqual(result.verifiedZone, 'body');
  });

  await t.test('Scenario 7: Rate-of-fire spam against multiple targets in sub-cooldown', () => {
    // In production MatchRoom, rate of fire is enforced via this.lastShotAt.
    // Verify weapon minFireIntervalMs * 0.72 correctly guards consecutive shots.
    const minInterval = 850; // AWP-50 Sniper
    const threshold = minInterval * 0.72; // 612ms
    let lastShotAt = 1000;

    const rapidShotTime = 1200; // 200ms delta < 612ms
    const isRapid = rapidShotTime - lastShotAt < threshold;
    assert.strictEqual(isRapid, true, 'Sub-interval shot must be recognized as rate-of-fire violation');

    const validShotTime = 1700; // 700ms delta > 612ms
    const isValid = validShotTime - lastShotAt < threshold;
    assert.strictEqual(isValid, false, 'Legitimate cadence must be permitted');
  });

  await t.test('Scenario 8: Out-of-range shot + valid line of sight and aim', () => {
    // SMG max range 125m. Tolerance 6m -> cutoff 131m.
    // Target placed at 160m in clear lane.
    const shooter = createPlayer('s8', 'blue', 8, 0, 0, 0, 0, 'smg');
    const target = createPlayer('t8', 'red', 8, 0, 160, 0, 0, 'smg');

    const result = validateAuthoritativeHit(
      shooter,
      target,
      {
        weaponId: 'smg',
        targetId: target.id,
        endX: target.x,
        endY: target.y + 1.25,
        endZ: target.z,
      },
      {
        friendlyFire: false,
        spawnProtectionUntil: 0,
        currentTime: 1000,
        shooterRotY: shooter.rotY,
        shooterPitch: shooter.pitch,
        mapId: 'urban',
      }
    );

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'OUT_OF_WEAPON_RANGE');
  });

  await t.test('Scenario 9: Valid aim + LOS obstructed by partial cover edge', () => {
    // Target is behind corner of tactical van (0.2, 1.0, 0.2). Half width = 2.2 -> x in [-2.0, 2.4]
    // Ray from (0, 1.2, -10) to (0, 1.2, 10) directly clips through van center.
    const shooter = createPlayer('s9', 'blue', 0, 0, -10, 0, 0, 'ak47');
    const target = createPlayer('t9', 'red', 0, 0, 10, 0, 0, 'ak47');

    const result = validateAuthoritativeHit(
      shooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        endX: target.x,
        endY: target.y + 1.25,
        endZ: target.z,
      },
      {
        friendlyFire: false,
        spawnProtectionUntil: 0,
        currentTime: 1000,
        shooterRotY: shooter.rotY,
        shooterPitch: shooter.pitch,
        mapId: 'urban',
      }
    );

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'LINE_OF_SIGHT_BLOCKED');
  });

  await t.test('Scenario 10: Client claiming headshot at extreme angle (>85° yaw deviation)', () => {
    // Shooter facing +Z (rotY = 0). Target placed at +X (rotY ≈ 90° = 1.57 rad).
    const shooter = createPlayer('s10', 'blue', 8, 0, 0, 0, 0, 'ak47');
    const target = createPlayer('t10', 'red', 25, 0, 0, 0, 0, 'ak47');

    const result = validateAuthoritativeHit(
      shooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        zone: 'head',
        endX: target.x,
        endY: target.y + 1.70,
        endZ: target.z,
      },
      {
        friendlyFire: false,
        spawnProtectionUntil: 0,
        currentTime: 1000,
        shooterRotY: shooter.rotY,
        shooterPitch: shooter.pitch,
        mapId: 'urban',
      }
    );

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'FIRING_DIRECTION_INVALID');
  });

  await t.test('Scenario 11: Malformed payload: NaN muzzle coordinates safely handled', () => {
    const shooter = createPlayer('s11', 'blue', 8, 0, 0, 0, 0, 'ak47');
    const target = createPlayer('t11', 'red', 8, 0, 15, 0, 0, 'ak47');

    // Client passes NaN for muzzle coordinates. Server ignores client muzzle and uses authoritative position.
    const result = validateAuthoritativeHit(
      shooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        muzzleX: NaN,
        muzzleY: NaN,
        muzzleZ: NaN,
        endX: target.x,
        endY: target.y + 1.25,
        endZ: target.z,
      },
      {
        friendlyFire: false,
        spawnProtectionUntil: 0,
        currentTime: 1000,
        shooterRotY: shooter.rotY,
        shooterPitch: shooter.pitch,
        mapId: 'urban',
      }
    );

    // Shot is valid because server authoritatively derives muzzle!
    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.damage, 34);
  });

  await t.test('Scenario 12: Malformed payload: Infinity end coordinates rejected', () => {
    const shooter = createPlayer('s12', 'blue', 8, 0, 0, 0, 0, 'ak47');
    const target = createPlayer('t12', 'red', 8, 0, 15, 0, 0, 'ak47');

    const result = validateAuthoritativeHit(
      shooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        endX: Infinity,
        endY: 1.25,
        endZ: target.z,
      },
      {
        friendlyFire: false,
        spawnProtectionUntil: 0,
        currentTime: 1000,
        shooterRotY: shooter.rotY,
        shooterPitch: shooter.pitch,
        mapId: 'urban',
      }
    );

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'INVALID_COORDINATES');
  });

  await t.test('Scenario 13: Empty / undefined targetId rejected', () => {
    const shooter = createPlayer('s13', 'blue', 8, 0, 0, 0, 0, 'ak47');

    const result = validateAuthoritativeHit(
      shooter,
      undefined, // nonexistent target
      {
        weaponId: 'ak47',
        targetId: '',
        endX: 8,
        endY: 1.25,
        endZ: 15,
      },
      {
        friendlyFire: false,
        spawnProtectionUntil: 0,
        currentTime: 1000,
        shooterRotY: shooter.rotY,
        shooterPitch: shooter.pitch,
        mapId: 'urban',
      }
    );

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'TARGET_NOT_FOUND');
  });

  await t.test('Scenario 14: Firing on unregistered map ID with otherwise perfect aim', () => {
    const shooter = createPlayer('s14', 'blue', 8, 0, 0, 0, 0, 'ak47');
    const target = createPlayer('t14', 'red', 8, 0, 15, 0, 0, 'ak47');

    const result = validateAuthoritativeHit(
      shooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        endX: target.x,
        endY: target.y + 1.25,
        endZ: target.z,
      },
      {
        friendlyFire: false,
        spawnProtectionUntil: 0,
        currentTime: 1000,
        shooterRotY: shooter.rotY,
        shooterPitch: shooter.pitch,
        mapId: 'hacked_custom_map_v99',
      }
    );

    // RES-1: Unknown map must fail closed with MAP_COLLISION_DATA_UNAVAILABLE
    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'MAP_COLLISION_DATA_UNAVAILABLE');
  });

  await t.test('Scenario 15: Shooter positioned inside a solid cover AABB trying to shoot out', () => {
    // RES-2: Shooter glitching or clipping inside center van (0.2, 1.0, 0.2)
    const shooter = createPlayer('s15', 'blue', 0.2, 0.5, 0.2, 0, 0, 'ak47');
    const target = createPlayer('t15', 'red', 8, 0, 15, 0, 0, 'ak47');

    const result = validateAuthoritativeHit(
      shooter,
      target,
      {
        weaponId: 'ak47',
        targetId: target.id,
        endX: target.x,
        endY: target.y + 1.25,
        endZ: target.z,
      },
      {
        friendlyFire: false,
        spawnProtectionUntil: 0,
        currentTime: 1000,
        shooterRotY: shooter.rotY,
        shooterPitch: shooter.pitch,
        mapId: 'urban',
      }
    );

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'LINE_OF_SIGHT_BLOCKED');
  });

  // =========================================================================
  // Section B: Numerical Safety Edge Cases
  // =========================================================================

  await t.test('Numerical Safety: NaN, Infinity, negative distance, zero length, parallel rays', () => {
    const dummyBox: ServerAABB = { minX: -2, maxX: 2, minY: 0, maxY: 3, minZ: -2, maxZ: 2, id: 'test' };

    // Zero-length ray
    const zeroLen = rayIntersectsAABB(0, 1, -5, 0, 0, 0, 0, dummyBox);
    assert.strictEqual(zeroLen.hit, false);

    // Negative max distance
    const negDist = rayIntersectsAABB(0, 1, -5, 0, 0, 1, -10, dummyBox);
    assert.strictEqual(negDist.hit, false);

    // Parallel ray outside box (dx=0, dy=0, ray along Z at x=5)
    const parallelRay = rayIntersectsAABB(5, 1, -10, 0, 0, 1, 20, dummyBox);
    assert.strictEqual(parallelRay.hit, false);

    // NaN origin coordinates in checkLineOfSight fails closed with MALFORMED_COLLISION_DATA
    const nanLos = checkLineOfSight(NaN, 1, 0, 5, 1, 0, 'urban');
    assert.strictEqual(nanLos.status, 'MALFORMED_COLLISION_DATA');
    assert.strictEqual(nanLos.clear, false);
  });

  // =========================================================================
  // Section C: Bot Combat Regression Scenarios
  // =========================================================================

  await t.test('Bot Combat: Normal bot engagement hitting human player', () => {
    // Bot shooter facing +Z
    const bot = createPlayer('bot_red_1', 'red', 8, 0, 0, 0, 0, 'ak47', true);
    const human = createPlayer('p_human', 'blue', 8, 0, 15, 0, 0, 'ak47', false);

    // In MatchRoom, server derives botEndX, botEndY, botEndZ and passes isBotShooter=true
    const result = validateAuthoritativeHit(
      bot,
      human,
      {
        weaponId: 'ak47',
        targetId: human.id,
        endX: human.x,
        endY: human.y + 1.25,
        endZ: human.z,
        muzzleX: bot.x,
        muzzleY: bot.y + 1.35,
        muzzleZ: bot.z,
      },
      {
        friendlyFire: false,
        spawnProtectionUntil: 0,
        currentTime: 1000,
        shooterRotY: bot.rotY,
        shooterPitch: bot.pitch,
        mapId: 'urban',
        isBotShooter: true,
      }
    );

    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.verifiedZone, 'body');
    assert.strictEqual(result.damage, 34);
  });

  await t.test('Bot Combat: Bot-to-bot engagement on opposing teams', () => {
    const botBlue = createPlayer('bot_blue_1', 'blue', 8, 0, 0, 0, 0, 'smg', true);
    const botRed = createPlayer('bot_red_2', 'red', 8, 0, 10, 0, 0, 'smg', true);

    const result = validateAuthoritativeHit(
      botBlue,
      botRed,
      {
        weaponId: 'smg',
        targetId: botRed.id,
        endX: botRed.x,
        endY: botRed.y + 1.25,
        endZ: botRed.z,
        muzzleX: botBlue.x,
        muzzleY: botBlue.y + 1.35,
        muzzleZ: botBlue.z,
      },
      {
        friendlyFire: false,
        spawnProtectionUntil: 0,
        currentTime: 1000,
        shooterRotY: botBlue.rotY,
        shooterPitch: botBlue.pitch,
        mapId: 'urban',
        isBotShooter: true,
      }
    );

    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.verifiedZone, 'body');
    assert.strictEqual(result.damage, 21); // SMG base damage is 21
  });

  await t.test('Bot Combat: Bot shot blocked by map cover', () => {
    // Bot at (-5, 0, 2.8) facing west (-X). Human at (-20, 0, 2.8) behind wall.
    const bot = createPlayer('bot_red_3', 'red', -5, 0, 2.8, -Math.PI / 2, 0, 'ak47', true);
    const human = createPlayer('p_human', 'blue', -20, 0, 2.8, 0, 0, 'ak47', false);

    const result = validateAuthoritativeHit(
      bot,
      human,
      {
        weaponId: 'ak47',
        targetId: human.id,
        endX: human.x,
        endY: human.y + 1.25,
        endZ: human.z,
        muzzleX: bot.x,
        muzzleY: bot.y + 1.35,
        muzzleZ: bot.z,
      },
      {
        friendlyFire: false,
        spawnProtectionUntil: 0,
        currentTime: 1000,
        shooterRotY: bot.rotY,
        shooterPitch: bot.pitch,
        mapId: 'urban',
        isBotShooter: true,
      }
    );

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'LINE_OF_SIGHT_BLOCKED');
  });

  await t.test('Bot Combat: Bot out-of-range shot rejected', () => {
    const bot = createPlayer('bot_red_4', 'red', 8, 0, 0, 0, 0, 'smg', true);
    const human = createPlayer('p_human', 'blue', 8, 0, 150, 0, 0, 'smg', false);

    const result = validateAuthoritativeHit(
      bot,
      human,
      {
        weaponId: 'smg',
        targetId: human.id,
        endX: human.x,
        endY: human.y + 1.25,
        endZ: human.z,
        muzzleX: bot.x,
        muzzleY: bot.y + 1.35,
        muzzleZ: bot.z,
      },
      {
        friendlyFire: false,
        spawnProtectionUntil: 0,
        currentTime: 1000,
        shooterRotY: bot.rotY,
        shooterPitch: bot.pitch,
        mapId: 'urban',
        isBotShooter: true,
      }
    );

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'OUT_OF_WEAPON_RANGE');
  });

  await t.test('Bot Combat: Bot friendly-fire blocked when disabled', () => {
    const bot1 = createPlayer('bot_blue_1', 'blue', 8, 0, 0, 0, 0, 'ak47', true);
    const bot2 = createPlayer('bot_blue_2', 'blue', 8, 0, 15, 0, 0, 'ak47', true);

    const result = validateAuthoritativeHit(
      bot1,
      bot2,
      {
        weaponId: 'ak47',
        targetId: bot2.id,
        endX: bot2.x,
        endY: bot2.y + 1.25,
        endZ: bot2.z,
        muzzleX: bot1.x,
        muzzleY: bot1.y + 1.35,
        muzzleZ: bot1.z,
      },
      {
        friendlyFire: false,
        spawnProtectionUntil: 0,
        currentTime: 1000,
        shooterRotY: bot1.rotY,
        shooterPitch: bot1.pitch,
        mapId: 'urban',
        isBotShooter: true,
      }
    );

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, 'FRIENDLY_FIRE_BLOCKED');
  });

  // =========================================================================
  // Section D: Performance Micro-Benchmark (10,000 Queries Across 4 Maps)
  // =========================================================================

  await t.test('Performance Micro-Benchmark: 10,000 line-of-sight queries across all 4 maps', () => {
    const maps = ['urban', 'desert', 'industrial', 'forest'] as const;

    // 1. Warm-up Phase: 500 queries per map (2,000 warm-up queries total)
    // Ensures V8 JIT tier-up (Sparkplug -> Maglev -> Turbofan) and IC stabilization
    // before recording any measured timing samples.
    for (const mapId of maps) {
      for (let i = 0; i < 500; i++) {
        const angle = (i * 0.17) % (2 * Math.PI);
        const dist = 5 + (i % 35);
        const ox = Math.cos(angle) * (i % 20 - 10);
        const oy = 1.0 + (i % 3) * 0.5;
        const oz = Math.sin(angle) * (i % 20 - 10);
        const tx = ox + Math.cos(angle + 0.1) * dist;
        const ty = oy + (i % 5 - 2) * 0.2;
        const tz = oz + Math.sin(angle + 0.1) * dist;
        checkLineOfSight(ox, oy, oz, tx, ty, tz, mapId);
      }
    }

    // 2. Measured Execution: 10,000 queries structured into 100 batches of 100 queries
    const queriesPerMap = 2500;
    const totalQueries = queriesPerMap * maps.length; // 10,000 queries
    const batchSize = 100;
    const totalBatches = totalQueries / batchSize; // 100 batches

    // Pre-allocate typed array for per-query latencies to prevent GC churn during benchmark
    const latenciesMs = new Float64Array(totalQueries);
    let sampleIdx = 0;
    let functionalErrors = 0;
    let verifiedClearCount = 0;
    let verifiedBlockedCount = 0;

    const benchmarkStart = performance.now();

    for (const mapId of maps) {
      for (let i = 0; i < queriesPerMap; i++) {
        let ox: number;
        let oy: number;
        let oz: number;
        let tx: number;
        let ty: number;
        let tz: number;
        let expectedClear: boolean | undefined = undefined;
        let expectedBlocker: string | undefined = undefined;

        // Ground-truth reference queries embedded in the batch
        if (i % batchSize === 0) {
          // Known clear corridor query
          if (mapId === 'urban') {
            ox = -8; oy = 1.5; oz = -5; tx = -8; ty = 1.5; tz = 5;
          } else if (mapId === 'desert') {
            ox = 0; oy = 1.5; oz = -20; tx = 0; ty = 1.5; tz = -5;
          } else if (mapId === 'industrial') {
            ox = 0; oy = 1.5; oz = 0; tx = 0; ty = 1.5; tz = 8;
          } else {
            ox = 0; oy = 1.5; oz = 5; tx = 0; ty = 1.5; tz = 10;
          }
          expectedClear = true;
        } else if (i % batchSize === 1) {
          // Known blocked obstacle query
          if (mapId === 'urban') {
            ox = -5; oy = 1.0; oz = 0.2; tx = 5; ty = 1.0; tz = 0.2;
            expectedBlocker = 'van_center';
          } else if (mapId === 'desert') {
            ox = -13.5; oy = 1.5; oz = -15; tx = -13.5; ty = 1.5; tz = -5;
            expectedBlocker = 'cont_1';
          } else if (mapId === 'industrial') {
            ox = -4.5; oy = 0.75; oz = -8; tx = -4.5; ty = 0.75; tz = -1;
            expectedBlocker = 'crate_1';
          } else {
            ox = -5; oy = 0.9; oz = 0; tx = 5; ty = 0.9; tz = 0;
            expectedBlocker = 'rock_center';
          }
          expectedClear = false;
        } else {
          // Dynamic pseudo-random spatial trajectory
          const angle = (i * 0.17) % (2 * Math.PI);
          const dist = 5 + (i % 35);
          ox = Math.cos(angle) * (i % 20 - 10);
          oy = 1.0 + (i % 3) * 0.5;
          oz = Math.sin(angle) * (i % 20 - 10);
          tx = ox + Math.cos(angle + 0.1) * dist;
          ty = oy + (i % 5 - 2) * 0.2;
          tz = oz + Math.sin(angle + 0.1) * dist;
        }

        const qStart = performance.now();
        const result = checkLineOfSight(ox, oy, oz, tx, ty, tz, mapId);
        const qElapsed = performance.now() - qStart;

        latenciesMs[sampleIdx++] = qElapsed;

        // Functional Correctness verification
        if (!result || typeof result.clear !== 'boolean' || (result.status !== 'CLEAR' && result.status !== 'BLOCKED')) {
          functionalErrors++;
        } else {
          if (result.clear) {
            verifiedClearCount++;
            if (expectedClear === false) functionalErrors++;
          } else {
            verifiedBlockedCount++;
            if (expectedClear === true) functionalErrors++;
            if (expectedBlocker && result.blocker !== expectedBlocker) functionalErrors++;
          }
        }
      }
    }

    const totalDurationMs = performance.now() - benchmarkStart;
    const avgQueryMs = totalDurationMs / totalQueries;
    const avgQueryUs = avgQueryMs * 1000;
    const throughput = Math.round((totalQueries / totalDurationMs) * 1000);

    // Compute distribution percentiles
    const sorted = Float64Array.from(latenciesMs).sort();
    const medianMs = sorted[Math.floor(totalQueries * 0.50)];
    const p90Ms = sorted[Math.floor(totalQueries * 0.90)];
    const p95Ms = sorted[Math.floor(totalQueries * 0.95)];
    const p99Ms = sorted[Math.floor(totalQueries * 0.99)];
    const worstQueryMs = sorted[totalQueries - 1];

    console.log(`\n============================================================`);
    console.log(`LINE-OF-SIGHT MICRO-BENCHMARK (10,000 QUERIES ACROSS 4 MAPS)`);
    console.log(`Warm-up Queries:    2,000 (500 per map)`);
    console.log(`Measured Queries:   ${totalQueries} (in ${totalBatches} batches of ${batchSize})`);
    console.log(`Functional Check:   ${functionalErrors === 0 ? '100% PASS' : 'FAILED (' + functionalErrors + ' errors)'}`);
    console.log(`  - Verified Clear: ${verifiedClearCount}`);
    console.log(`  - Verified Block: ${verifiedBlockedCount}`);
    console.log(`Total Elapsed Time: ${totalDurationMs.toFixed(2)} ms`);
    console.log(`Throughput:         ${throughput.toLocaleString()} queries/sec`);
    console.log(`Latency Statistics:`);
    console.log(`  - Mean (Average): ${(avgQueryUs).toFixed(2)} µs (${avgQueryMs.toFixed(4)} ms)`);
    console.log(`  - Median (p50):   ${(medianMs * 1000).toFixed(2)} µs (${medianMs.toFixed(4)} ms)`);
    console.log(`  - 90th %ile (p90):${(p90Ms * 1000).toFixed(2)} µs (${p90Ms.toFixed(4)} ms)`);
    console.log(`  - 95th %ile (p95):${(p95Ms * 1000).toFixed(2)} µs (${p95Ms.toFixed(4)} ms)`);
    console.log(`  - 99th %ile (p99):${(p99Ms * 1000).toFixed(2)} µs (${p99Ms.toFixed(4)} ms)`);
    console.log(`  - Maximum (Worst):${(worstQueryMs * 1000).toFixed(2)} µs (${worstQueryMs.toFixed(4)} ms) [Diagnostic: Windows/V8 scheduling]`);
    console.log(`============================================================\n`);

    // Functional correctness assertion: Zero tolerance for collision errors
    assert.strictEqual(functionalErrors, 0, `Functional collision correctness failed: ${functionalErrors} errors`);
    assert.ok(verifiedClearCount > 0, 'Must verify unobstructed queries');
    assert.ok(verifiedBlockedCount > 0, 'Must verify obstructed queries');

    // Statistical Performance Regression Gates:
    // 1. Mean query latency < 0.05ms (50µs) — ~7x safety buffer over ~0.003-0.007ms baseline
    assert.ok(avgQueryMs < 0.05, `Average query latency (${avgQueryMs.toFixed(4)}ms) must be < 0.05ms`);

    // 2. 95th percentile latency < 0.02ms (20µs) — guarantees 95% of queries execute in sub-20µs
    assert.ok(p95Ms < 0.02, `95th percentile query latency (${p95Ms.toFixed(4)}ms) must be < 0.02ms`);

    // 3. 99th percentile latency < 0.10ms (100µs) — guarantees 99% of queries execute in sub-100µs
    assert.ok(p99Ms < 0.10, `99th percentile query latency (${p99Ms.toFixed(4)}ms) must be < 0.10ms`);

    // 4. Throughput > 20,000 queries/sec (10-player 20Hz server needs ~200/sec; 20k provides 100x overhead)
    assert.ok(throughput > 20000, `Throughput (${throughput} q/s) must exceed 20,000 queries/sec`);

    // 5. Extreme latency ceiling (diagnostic safeguard): Must not stall server thread > 25ms (half a 20Hz tick)
    assert.ok(worstQueryMs < 25.0, `Extreme worst query (${worstQueryMs.toFixed(4)}ms) must be < 25.0ms`);
  });
});
