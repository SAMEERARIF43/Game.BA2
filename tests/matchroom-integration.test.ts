import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchRoom } from '../server/rooms/MatchRoom.ts';
import { PlayerSchema } from '../server/schema/MatchState.ts';
import { SERVER_WEAPONS } from '../server/mapSpawns.ts';

interface MockClient {
  sessionId: string;
  sentMessages: Array<{ type: string; data: any }>;
  send(type: string, data: any): void;
  enqueueRaw(data: any): void;
  raw(data: any): void;
}

function createMockClient(sessionId: string): MockClient {
  const sentMessages: Array<{ type: string; data: any }> = [];
  return {
    sessionId,
    sentMessages,
    send(type: string, data: any) {
      sentMessages.push({ type, data });
    },
    enqueueRaw() {},
    raw() {},
  };
}

function setupTestRoom(options: { mapId?: string; friendlyFire?: boolean } = {}) {
  const room = new MatchRoom();
  room.onCreate({
    mapId: options.mapId ?? 'urban',
    friendlyFire: options.friendlyFire ?? false,
    killLimit: 25,
    timeLimit: 300,
    botCount: 0,
  });

  // Put room into active 'playing' state
  room.state.phase = 'playing';

  // Helper to add player
  const addPlayer = (
    id: string,
    team: 'blue' | 'red',
    x: number,
    y: number,
    z: number,
    rotY = 0,
    pitch = 0,
    weaponId = 'ak47'
  ) => {
    const p = new PlayerSchema();
    p.id = id;
    p.name = `Player_${id}`;
    p.team = team;
    p.isBot = false;
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
    room.state.players.set(id, p);
    return p;
  };

  const cleanup = () => {
    clearInterval((room as any)._simulationInterval);
    room.onDispose();
  };

  return { room, addPlayer, cleanup };
}

test('RES-3: Complete Production Firing-Path Integration Test (MatchRoom -> applyAuthoritativeHit -> validateAuthoritativeHit)', async (t) => {
  await t.test('1. Valid player fire message reaches authoritative validation path & applies correct body damage', () => {
    const { room, addPlayer, cleanup } = setupTestRoom();
    const shooterClient = createMockClient('p_shooter');
    const targetClient = createMockClient('p_target');
    room.clients.push(shooterClient as any, targetClient as any);

    // Shooter at (8, 0, 0) facing +Z (rotY=0), target at (8, 0, 15) on opposing team
    const shooter = addPlayer('p_shooter', 'blue', 8, 0, 0, 0, 0, 'ak47');
    const target = addPlayer('p_target', 'red', 8, 0, 15, 0, 0, 'ak47');

    // Emit fire message through production onMessage handler
    (room as any).onMessageEvents.emit('player_fire', shooterClient, {
      weaponId: 'ak47',
      targetId: target.id,
      zone: 'body',
      endX: target.x,
      endY: target.y + 1.25,
      endZ: target.z,
      muzzleX: 8,
      muzzleY: 1.55,
      muzzleZ: 0,
    });

    // Verify target took authoritative AK-47 body damage (34)
    assert.strictEqual(target.health, 66, 'Target health should be 100 - 34 = 66');
    assert.strictEqual(target.isAlive, true);

    // Verify shooter received hit_confirm message
    const hitConfirm = shooterClient.sentMessages.find((m) => m.type === 'hit_confirm');
    assert.ok(hitConfirm, 'Shooter must receive hit_confirm');
    assert.strictEqual(hitConfirm.data.zone, 'body');
    assert.strictEqual(hitConfirm.data.damage, 34);
    assert.strictEqual(hitConfirm.data.killed, false);

    // Verify target received player_damaged message
    const playerDamaged = targetClient.sentMessages.find((m) => m.type === 'player_damaged');
    assert.ok(playerDamaged, 'Target must receive player_damaged');
    assert.strictEqual(playerDamaged.data.damage, 34);
    assert.strictEqual(playerDamaged.data.headshot, false);

    cleanup();
  });

  await t.test('2. Client claims headshot but server independently validates body -> body damage applied', () => {
    const { room, addPlayer, cleanup } = setupTestRoom();
    const shooterClient = createMockClient('p_shooter');
    const targetClient = createMockClient('p_target');
    room.clients.push(shooterClient as any, targetClient as any);

    const shooter = addPlayer('p_shooter', 'blue', 8, 0, 0, 0, 0, 'ak47');
    const target = addPlayer('p_target', 'red', 8, 0, 15, 0, 0, 'ak47');

    // Malicious client claims headshot, but end coordinates hit chest (y = target.y + 1.16)
    (room as any).onMessageEvents.emit('player_fire', shooterClient, {
      weaponId: 'ak47',
      targetId: target.id,
      zone: 'head', // untrusted client claim
      endX: target.x,
      endY: target.y + 1.16,
      endZ: target.z,
      muzzleX: 8,
      muzzleY: 1.55,
      muzzleZ: 0,
    });

    // Must be classified as body damage only (34), not headshot (68)
    assert.strictEqual(target.health, 66);
    const hitConfirm = shooterClient.sentMessages.find((m) => m.type === 'hit_confirm');
    assert.strictEqual(hitConfirm?.data.zone, 'body', 'Server must authoritatively override zone to body');
    assert.strictEqual(hitConfirm?.data.damage, 34);

    cleanup();
  });

  await t.test('3. Server-verified headshot applies weapon headshot multiplier & emits headshot: true', () => {
    const { room, addPlayer, cleanup } = setupTestRoom();
    const shooterClient = createMockClient('p_shooter');
    const targetClient = createMockClient('p_target');
    room.clients.push(shooterClient as any, targetClient as any);

    const shooter = addPlayer('p_shooter', 'blue', 8, 0, 0, 0, 0, 'ak47');
    const target = addPlayer('p_target', 'red', 8, 0, 15, 0, 0, 'ak47');

    // Valid head hit (y = target.y + 1.70)
    (room as any).onMessageEvents.emit('player_fire', shooterClient, {
      weaponId: 'ak47',
      targetId: target.id,
      zone: 'body', // client claims body, server upgrades to head
      endX: target.x,
      endY: target.y + 1.70,
      endZ: target.z,
    });

    // AK-47 headshot damage = 34 * 2.0 = 68
    assert.strictEqual(target.health, 32, 'Target health should be 100 - 68 = 32');
    const hitConfirm = shooterClient.sentMessages.find((m) => m.type === 'hit_confirm');
    assert.strictEqual(hitConfirm?.data.zone, 'head');
    assert.strictEqual(hitConfirm?.data.damage, 68);

    const playerDamaged = targetClient.sentMessages.find((m) => m.type === 'player_damaged');
    assert.strictEqual(playerDamaged?.data.headshot, true);

    cleanup();
  });

  await t.test('4. Lethal shot updates kills, deaths, scores and broadcasts kill_feed', () => {
    const { room, addPlayer, cleanup } = setupTestRoom();
    const shooterClient = createMockClient('p_shooter');
    const targetClient = createMockClient('p_target');
    room.clients.push(shooterClient as any, targetClient as any);

    const shooter = addPlayer('p_shooter', 'blue', 8, 0, 0, 0, 0, 'sniper');
    const target = addPlayer('p_target', 'red', 8, 0, 15, 0, 0, 'ak47');

    // Sniper does 115 base damage -> 1-shot lethal
    (room as any).onMessageEvents.emit('player_fire', shooterClient, {
      weaponId: 'sniper',
      targetId: target.id,
      endX: target.x,
      endY: target.y + 1.25,
      endZ: target.z,
    });

    assert.strictEqual(target.health, 0);
    assert.strictEqual(target.isAlive, false);
    assert.strictEqual(target.deaths, 1);
    assert.strictEqual(shooter.kills, 1);
    assert.strictEqual(room.state.blueScore, 1);

    const hitConfirm = shooterClient.sentMessages.find((m) => m.type === 'hit_confirm');
    assert.strictEqual(hitConfirm?.data.killed, true);

    cleanup();
  });

  await t.test('5. Firing direction mismatch (>30° deviation) is rejected with zero damage', () => {
    const { room, addPlayer, cleanup } = setupTestRoom({ mapId: 'desert' });
    const shooterClient = createMockClient('p_shooter');
    room.clients.push(shooterClient as any);

    // Shooter at (0, 0, -20) facing +Z (rotY=0). Target at (-Z, behind shooter at z=-35)
    const shooter = addPlayer('p_shooter', 'blue', 0, 0, -20, 0, 0, 'ak47');
    const target = addPlayer('p_target', 'red', 0, 0, -35, 0, 0, 'ak47');

    (room as any).onMessageEvents.emit('player_fire', shooterClient, {
      weaponId: 'ak47',
      targetId: target.id,
      endX: target.x,
      endY: target.y + 1.25,
      endZ: target.z,
    });

    // Shot fired backwards must be rejected
    assert.strictEqual(target.health, 100, 'Target should take NO damage from backward shot');
    assert.strictEqual(shooterClient.sentMessages.length, 0, 'No hit confirm should be sent');

    cleanup();
  });

  await t.test('6. Line of sight blocked by map geometry rejected with zero damage', () => {
    const { room, addPlayer, cleanup } = setupTestRoom({ mapId: 'urban' });
    const shooterClient = createMockClient('p_shooter');
    room.clients.push(shooterClient as any);

    // Shooter at (-5, 0, 2.8) facing west (-X). Target at (-20, 0, 2.8) on other side of west building wall
    const shooter = addPlayer('p_shooter', 'blue', -5, 0, 2.8, -Math.PI / 2, 0, 'ak47');
    const target = addPlayer('p_target', 'red', -20, 0, 2.8, 0, 0, 'ak47');

    (room as any).onMessageEvents.emit('player_fire', shooterClient, {
      weaponId: 'ak47',
      targetId: target.id,
      endX: target.x,
      endY: target.y + 1.25,
      endZ: target.z,
    });

    // Wall blocks shot
    assert.strictEqual(target.health, 100, 'Target behind solid wall must take NO damage');
    assert.strictEqual(shooterClient.sentMessages.length, 0);

    cleanup();
  });

  await t.test('7. Client-provided fabricated muzzle coordinates cannot bypass distance or extend range', () => {
    const { room, addPlayer, cleanup } = setupTestRoom({ mapId: 'urban' });
    const shooterClient = createMockClient('p_shooter');
    room.clients.push(shooterClient as any);

    // Shooter at (8, 0, 0). Target at (8, 0, 180) - well beyond MP5 range (130m + 6m = 136m threshold)
    const shooter = addPlayer('p_shooter', 'blue', 8, 0, 0, 0, 0, 'smg');
    const target = addPlayer('p_target', 'red', 8, 0, 180, 0, 0, 'smg');

    // Client fabricates muzzle near target (8, 1.55, 120) attempting to claim in-range shot
    (room as any).onMessageEvents.emit('player_fire', shooterClient, {
      weaponId: 'smg',
      targetId: target.id,
      muzzleX: 8,
      muzzleY: 1.55,
      muzzleZ: 120, // fabricated!
      endX: target.x,
      endY: target.y + 1.25,
      endZ: target.z,
    });

    assert.strictEqual(target.health, 100, 'Out-of-range shot must be rejected despite fabricated muzzle');
    assert.strictEqual(shooterClient.sentMessages.length, 0);

    cleanup();
  });

  await t.test('8. Rate of fire violation rejected with zero damage', () => {
    const { room, addPlayer, cleanup } = setupTestRoom({ mapId: 'urban' });
    const shooterClient = createMockClient('p_shooter');
    room.clients.push(shooterClient as any);

    // Sniper minFireIntervalMs is 850ms (min interval * 0.72 = 612ms)
    const shooter = addPlayer('p_shooter', 'blue', 8, 0, 0, 0, 0, 'sniper');
    const target = addPlayer('p_target', 'red', 8, 0, 15, 0, 0, 'ak47');

    // First shot
    (room as any).onMessageEvents.emit('player_fire', shooterClient, {
      weaponId: 'sniper',
      targetId: target.id,
      endX: target.x,
      endY: target.y + 1.25,
      endZ: target.z,
    });
    assert.strictEqual(target.health, 0, 'First shot hits');

    // Revive target for second rapid shot test
    target.health = 100;
    target.isAlive = true;

    // Immediate second shot (within 50ms < 612ms threshold)
    (room as any).onMessageEvents.emit('player_fire', shooterClient, {
      weaponId: 'sniper',
      targetId: target.id,
      endX: target.x,
      endY: target.y + 1.25,
      endZ: target.z,
    });
    assert.strictEqual(target.health, 100, 'Rapid follow-up shot must be rejected by rate-of-fire check');

    cleanup();
  });

  await t.test('9. Friendly fire rules respected (disabled blocks, enabled allows)', () => {
    // Disabled friendly fire
    const { room: roomNoFF, addPlayer: addPlayerNoFF, cleanup: cleanupNoFF } = setupTestRoom({ friendlyFire: false });
    const c1 = createMockClient('p1');
    roomNoFF.clients.push(c1 as any);
    const s1 = addPlayerNoFF('p1', 'blue', 8, 0, 0, 0, 0, 'ak47');
    const ally1 = addPlayerNoFF('ally1', 'blue', 8, 0, 15, 0, 0, 'ak47'); // same team

    (roomNoFF as any).onMessageEvents.emit('player_fire', c1, {
      weaponId: 'ak47',
      targetId: ally1.id,
      endX: ally1.x,
      endY: ally1.y + 1.25,
      endZ: ally1.z,
    });
    assert.strictEqual(ally1.health, 100, 'Ally must take NO damage when friendly fire is disabled');
    cleanupNoFF();

    // Enabled friendly fire
    const { room: roomFF, addPlayer: addPlayerFF, cleanup: cleanupFF } = setupTestRoom({ friendlyFire: true });
    const c2 = createMockClient('p2');
    roomFF.clients.push(c2 as any);
    const s2 = addPlayerFF('p2', 'blue', 8, 0, 0, 0, 0, 'ak47');
    const ally2 = addPlayerFF('ally2', 'blue', 8, 0, 15, 0, 0, 'ak47');

    (roomFF as any).onMessageEvents.emit('player_fire', c2, {
      weaponId: 'ak47',
      targetId: ally2.id,
      endX: ally2.x,
      endY: ally2.y + 1.25,
      endZ: ally2.z,
    });
    assert.strictEqual(ally2.health, 66, 'Ally takes damage when friendly fire is enabled');
    cleanupFF();
  });

  await t.test('10. Spawn-protected target takes zero damage', () => {
    const { room, addPlayer, cleanup } = setupTestRoom({ mapId: 'urban' });
    const shooterClient = createMockClient('p_shooter');
    room.clients.push(shooterClient as any);

    const shooter = addPlayer('p_shooter', 'blue', 8, 0, 0, 0, 0, 'sniper');
    const target = addPlayer('p_target', 'red', 8, 0, 15, 0, 0, 'ak47');

    // Activate spawn protection for 3000ms
    (room as any).spawnProtectionUntil.set(target.id, Date.now() + 3000);

    (room as any).onMessageEvents.emit('player_fire', shooterClient, {
      weaponId: 'sniper',
      targetId: target.id,
      endX: target.x,
      endY: target.y + 1.25,
      endZ: target.z,
    });

    assert.strictEqual(target.health, 100, 'Spawn protected player must take zero damage');
    cleanup();
  });

  await t.test('11. Dead or nonexistent target rejected with zero damage', () => {
    const { room, addPlayer, cleanup } = setupTestRoom({ mapId: 'urban' });
    const shooterClient = createMockClient('p_shooter');
    room.clients.push(shooterClient as any);

    const shooter = addPlayer('p_shooter', 'blue', 8, 0, 0, 0, 0, 'ak47');
    const deadTarget = addPlayer('p_dead', 'red', 8, 0, 15, 0, 0, 'ak47');
    deadTarget.isAlive = false;
    deadTarget.health = 0;

    // Shot against dead player
    (room as any).onMessageEvents.emit('player_fire', shooterClient, {
      weaponId: 'ak47',
      targetId: deadTarget.id,
      endX: deadTarget.x,
      endY: deadTarget.y + 1.25,
      endZ: deadTarget.z,
    });
    assert.strictEqual(deadTarget.health, 0);

    // Shot against nonexistent player ID
    (room as any).onMessageEvents.emit('player_fire', shooterClient, {
      weaponId: 'ak47',
      targetId: 'ghost_id_404',
      endX: 8,
      endY: 1.25,
      endZ: 15,
    });
    assert.strictEqual(shooterClient.sentMessages.length, 0);

    cleanup();
  });

  await t.test('12. Unregistered or unknown map ID in MatchRoom fails closed (MAP_COLLISION_DATA_UNAVAILABLE)', () => {
    const { room, addPlayer, cleanup } = setupTestRoom({ mapId: 'unknown_hacked_map' });
    room.state.mapId = 'unknown_hacked_map'; // explicitly override validated mapId to verify fail-closed on unknown map!
    const shooterClient = createMockClient('p_shooter');
    room.clients.push(shooterClient as any);

    const shooter = addPlayer('p_shooter', 'blue', 8, 0, 0, 0, 0, 'ak47');
    const target = addPlayer('p_target', 'red', 8, 0, 15, 0, 0, 'ak47');

    (room as any).onMessageEvents.emit('player_fire', shooterClient, {
      weaponId: 'ak47',
      targetId: target.id,
      endX: target.x,
      endY: target.y + 1.25,
      endZ: target.z,
    });

    // Unknown map must fail closed with zero damage
    assert.strictEqual(target.health, 100, 'Target must take zero damage when map collision is unknown');
    assert.strictEqual(shooterClient.sentMessages.length, 0);

    cleanup();
  });

  await t.test('13. Combined LOS + Direction + Range: Multi-control verification and negative isolations', () => {
    // 1. Positive baseline: all controls satisfied
    const { room: rPos, addPlayer: addPPos, cleanup: cPos } = setupTestRoom({ mapId: 'urban' });
    const c1 = createMockClient('p_shooter');
    const t1Client = createMockClient('p_target');
    rPos.clients.push(c1 as any, t1Client as any);

    const sPos = addPPos('p_shooter', 'blue', 8, 0, 0, 0, 0, 'ak47'); // facing +Z (rotY=0)
    const tPos = addPPos('p_target', 'red', 8, 0, 15, 0, 0, 'ak47');  // at +15m along +Z

    (rPos as any).onMessageEvents.emit('player_fire', c1, {
      weaponId: 'ak47',
      targetId: tPos.id,
      endX: tPos.x,
      endY: tPos.y + 1.25,
      endZ: tPos.z,
    });
    assert.strictEqual(tPos.health, 66, 'All controls valid -> shot applies 34 damage');
    assert.strictEqual(c1.sentMessages.filter((m) => m.type === 'hit_confirm').length, 1);
    cPos();

    // 2. Negative Isolation A: Correct direction and range, but blocked LOS
    const { room: rA, addPlayer: addPA, cleanup: cA } = setupTestRoom({ mapId: 'urban' });
    const cAClient = createMockClient('p_shooter');
    rA.clients.push(cAClient as any);
    const sA = addPA('p_shooter', 'blue', -5, 0, 2.8, -Math.PI / 2, 0, 'ak47'); // facing -X directly at target
    const tA = addPA('p_target', 'red', -20, 0, 2.8, 0, 0, 'ak47');              // behind storefront wall
    (rA as any).onMessageEvents.emit('player_fire', cAClient, {
      weaponId: 'ak47',
      targetId: tA.id,
      endX: tA.x,
      endY: tA.y + 1.25,
      endZ: tA.z,
    });
    assert.strictEqual(tA.health, 100, 'Isolation A: Blocked LOS results in 0 damage');
    assert.strictEqual(cAClient.sentMessages.length, 0);
    cA();

    // 3. Negative Isolation B: Clear LOS and valid range, but invalid firing direction (>30° deviation)
    const { room: rB, addPlayer: addPB, cleanup: cB } = setupTestRoom({ mapId: 'urban' });
    const cBClient = createMockClient('p_shooter');
    rB.clients.push(cBClient as any);
    const sB = addPB('p_shooter', 'blue', 8, 0, 0, 0, 0, 'ak47'); // facing +Z
    const tB = addPB('p_target', 'red', 8, 0, -15, 0, 0, 'ak47');  // behind shooter at -Z
    (rB as any).onMessageEvents.emit('player_fire', cBClient, {
      weaponId: 'ak47',
      targetId: tB.id,
      endX: tB.x,
      endY: tB.y + 1.25,
      endZ: tB.z,
    });
    assert.strictEqual(tB.health, 100, 'Isolation B: Backward shot results in 0 damage');
    assert.strictEqual(cBClient.sentMessages.length, 0);
    cB();

    // 4. Negative Isolation C: Clear LOS and valid direction, but excessive range (out of weapon range)
    const { room: rC, addPlayer: addPC, cleanup: cC } = setupTestRoom({ mapId: 'urban' });
    const cCClient = createMockClient('p_shooter');
    rC.clients.push(cCClient as any);
    const sC = addPC('p_shooter', 'blue', 8, 0, 0, 0, 0, 'smg');   // MP5 max range 130m + 6m = 136m
    const tC = addPC('p_target', 'red', 8, 0, 160, 0, 0, 'smg');    // 160m away
    (rC as any).onMessageEvents.emit('player_fire', cCClient, {
      weaponId: 'smg',
      targetId: tC.id,
      endX: tC.x,
      endY: tC.y + 1.25,
      endZ: tC.z,
    });
    assert.strictEqual(tC.health, 100, 'Isolation C: Out-of-range shot results in 0 damage');
    assert.strictEqual(cCClient.sentMessages.length, 0);
    cC();

    // 5. Negative Isolation D: Valid direction, range, and spatial path, but invalid map ID
    const { room: rD, addPlayer: addPD, cleanup: cD } = setupTestRoom({ mapId: 'urban' });
    rD.state.mapId = 'unregistered_custom_map';
    const cDClient = createMockClient('p_shooter');
    rD.clients.push(cDClient as any);
    const sD = addPD('p_shooter', 'blue', 8, 0, 0, 0, 0, 'ak47');
    const tD = addPD('p_target', 'red', 8, 0, 15, 0, 0, 'ak47');
    (rD as any).onMessageEvents.emit('player_fire', cDClient, {
      weaponId: 'ak47',
      targetId: tD.id,
      endX: tD.x,
      endY: tD.y + 1.25,
      endZ: tD.z,
    });
    assert.strictEqual(tD.health, 100, 'Isolation D: Unregistered map results in 0 damage');
    assert.strictEqual(cDClient.sentMessages.length, 0);
    cD();
  });

  await t.test('14. Undefined / missing map ID through MatchRoom fails closed and recovers gracefully', () => {
    const { room, addPlayer, cleanup } = setupTestRoom({ mapId: 'urban' });
    const shooterClient = createMockClient('p_shooter');
    room.clients.push(shooterClient as any);

    const shooter = addPlayer('p_shooter', 'blue', 8, 0, 0, 0, 0, 'ak47');
    const target = addPlayer('p_target', 'red', 8, 0, 15, 0, 0, 'ak47');

    // 1. Force mapId to undefined
    (room.state as any).mapId = undefined;

    (room as any).onMessageEvents.emit('player_fire', shooterClient, {
      weaponId: 'ak47',
      targetId: target.id,
      endX: target.x,
      endY: target.y + 1.25,
      endZ: target.z,
    });

    // Fails closed without crashing
    assert.strictEqual(target.health, 100, 'Undefined map ID must fail closed with 0 damage');
    assert.strictEqual(shooterClient.sentMessages.length, 0);
    assert.strictEqual(room.state.blueScore, 0);

    // 2. Restore mapId to registered 'urban' map and reset fire cooldown
    room.state.mapId = 'urban';
    (room as any).lastShotAt.delete(shooter.id);
    (room as any).playerValidationStates?.delete(shooter.id);

    (room as any).onMessageEvents.emit('player_fire', shooterClient, {
      weaponId: 'ak47',
      targetId: target.id,
      endX: target.x,
      endY: target.y + 1.25,
      endZ: target.z,
    });

    // Valid firing resumes gracefully
    assert.strictEqual(target.health, 66, 'Restored valid map applies authoritative damage');
    const hitConfirm = shooterClient.sentMessages.find((m) => m.type === 'hit_confirm');
    assert.ok(hitConfirm);
    assert.strictEqual(hitConfirm.data.damage, 34);

    cleanup();
  });

  await t.test('15. Production Bot Firing-Path: MatchRoom.simulateBot -> applyAuthoritativeHit -> state updates', () => {
    const { room, addPlayer, cleanup } = setupTestRoom({ mapId: 'urban' });

    // 1. Setup bot and human target
    const bot = new PlayerSchema();
    bot.id = 'bot_blue_1';
    bot.name = 'Bot_Alpha';
    bot.team = 'blue';
    bot.isBot = true;
    bot.isHost = false;
    bot.isAlive = true;
    bot.health = 100;
    bot.kills = 0;
    bot.deaths = 0;
    bot.weaponId = 'ak47';
    bot.x = 8;
    bot.y = 0;
    bot.z = 0;
    bot.rotY = 0;
    bot.pitch = 0;
    room.state.players.set(bot.id, bot);

    const target = addPlayer('p_human', 'red', 8, 0, 15, 0, 0, 'ak47');
    const targetClient = createMockClient('p_human');
    room.clients.push(targetClient as any);

    // Setup bot brain
    (room as any).botBrains.set(bot.id, { waypointIndex: 0, fireCooldownMs: 0, yaw: 0 });

    // Mock Math.random deterministically:
    // Call 1: fireCooldownMs random (returns 0.5)
    // Call 2: hitRoll (returns 0.20 < 0.36 -> hit = true, zone = 'body')
    const originalRandom = Math.random;
    let callIdx = 0;
    Math.random = () => {
      callIdx++;
      if (callIdx === 2) return 0.20; // guaranteed hit, body zone
      return 0.5;
    };

    try {
      // Execute production simulateBot
      (room as any).simulateBot(bot, 0.05);

      // Verify human target took authoritative AK-47 damage (34)
      assert.strictEqual(target.health, 66, 'Bot attack applies authoritative AK-47 body damage');
      const playerDamaged = targetClient.sentMessages.find((m) => m.type === 'player_damaged');
      assert.ok(playerDamaged, 'Human target received player_damaged notification');
      assert.strictEqual(playerDamaged.data.damage, 34);
      assert.strictEqual(playerDamaged.data.attackerName, 'Bot_Alpha');
    } finally {
      Math.random = originalRandom;
    }

    // 2. Moving human target
    target.x = 12;
    target.z = 20;
    target.health = 100;
    (room as any).botBrains.set(bot.id, { waypointIndex: 0, fireCooldownMs: 0, yaw: 0 });

    callIdx = 0;
    Math.random = () => {
      callIdx++;
      if (callIdx === 2) return 0.20;
      return 0.5;
    };

    try {
      (room as any).simulateBot(bot, 0.05);
      // Verify bot rotated towards moved target
      const expectedYaw = Math.atan2(12 - bot.x, 20 - bot.z);
      assert.ok(Math.abs(bot.rotY - expectedYaw) < 0.01, 'Bot rotated authoritatively to target position');
      assert.strictEqual(target.health, 66, 'Bot successfully damaged moving human target');
    } finally {
      Math.random = originalRandom;
    }

    // 3. Bot attack blocked by cover
    bot.x = -5;
    bot.z = 2.8;
    target.x = -20;
    target.z = 2.8;
    target.health = 100;
    (room as any).botBrains.set(bot.id, { waypointIndex: 0, fireCooldownMs: 0, yaw: 0 });

    callIdx = 0;
    Math.random = () => {
      callIdx++;
      if (callIdx === 2) return 0.20;
      return 0.5;
    };

    try {
      (room as any).simulateBot(bot, 0.05);
      assert.strictEqual(target.health, 100, 'Bot shot through solid storefront wall blocked by LOS check');
    } finally {
      Math.random = originalRandom;
    }

    // 4. Verify client cannot forge isBotShooter
    // A malicious human client attempts to bypass aim checks by sending forged payload
    const humanShooter = addPlayer('p_exploiter', 'blue', 8, 0, 0, 0, 0, 'ak47'); // facing +Z
    const humanClient = createMockClient('p_exploiter');
    room.clients.push(humanClient as any);
    target.x = 8;
    target.z = -15; // behind shooter!
    target.health = 100;

    (room as any).onMessageEvents.emit('player_fire', humanClient, {
      weaponId: 'ak47',
      targetId: target.id,
      isBotShooter: true, // untrusted forged flag!
      endX: target.x,
      endY: target.y + 1.25,
      endZ: target.z,
    });

    assert.strictEqual(target.health, 100, 'Client attempt to forge isBotShooter rejected by server');
    assert.strictEqual(humanClient.sentMessages.length, 0);

    cleanup();
  });
});
