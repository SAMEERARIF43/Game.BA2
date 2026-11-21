import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchRoom } from '../server/rooms/MatchRoom.ts';
import { HITBOX, validateAuthoritativeHit } from '../server/hitValidation.ts';
import { SERVER_WEAPONS } from '../server/mapSpawns.ts';
import {
  GUN_LOCKED_WHILE_ALIVE_MESSAGE,
  applyCharacterSelection,
  applyGunSelection,
  getCharacterForWeaponId,
  getSignatureGunForCharacter,
  normalizeCharacterId,
  normalizeGunId,
  normalizeKnifeCharmId,
  resolveRespawnLoadout,
} from '../src/game/loadoutRules.ts';
import {
  CHARACTER_IDS,
  CHARACTERS,
  GUN_IDS,
  KNIFE_CHARM_IDS,
  WEAPONS,
} from '../src/game/types.ts';

interface MockClient {
  sessionId: string;
  sentMessages: Array<{ type: string; data: unknown }>;
  send(type: string, data: unknown): void;
  enqueueRaw(): void;
  raw(): void;
  leave(): void;
}

function createMockClient(sessionId: string): MockClient {
  const sentMessages: Array<{ type: string; data: unknown }> = [];
  return {
    sessionId,
    sentMessages,
    send(type: string, data: unknown) {
      sentMessages.push({ type, data });
    },
    enqueueRaw() {},
    raw() {},
    leave() {},
  };
}

function createRoomWithPlayers() {
  const room = new MatchRoom();
  room.onCreate({
    mapId: 'desert',
    killLimit: 25,
    timeLimit: 300,
    botCount: 0,
    friendlyFire: false,
  });

  const c1 = createMockClient('human_1');
  const c2 = createMockClient('human_2');
  room.clients.push(c1 as never, c2 as never);

  room.onJoin(c1 as never, {
    playerName: 'Kodiak',
    characterId: 'assault',
    weaponId: 'shotgun',
  });
  room.onJoin(c2 as never, {
    playerName: 'Spectre',
    characterId: 'marksman',
    weaponId: 'sniper',
  });

  const cleanup = () => {
    clearInterval((room as unknown as { _simulationInterval?: NodeJS.Timeout })._simulationInterval);
    room.onDispose();
  };

  return { room, c1, c2, cleanup };
}

test('Batch 13 Audit: MatchRoom initial weaponId & characterId join sync', () => {
  const { room, cleanup } = createRoomWithPlayers();
  try {
    const p1 = room.state.players.get('human_1');
    const p2 = room.state.players.get('human_2');
    assert.ok(p1);
    assert.ok(p2);
    assert.equal(p1.characterId, 'assault');
    assert.equal(p1.weaponId, 'shotgun');
    assert.equal(p2.characterId, 'marksman');
    assert.equal(p2.weaponId, 'sniper');

    // Invalid weapon/character ids fall back safely
    const c3 = createMockClient('human_3');
    room.clients.push(c3 as never);
    room.onJoin(c3 as never, {
      playerName: 'BadPayload',
      characterId: 'nonexistent_char',
      weaponId: 'railgun_cheat',
    });
    const p3 = room.state.players.get('human_3');
    assert.ok(p3);
    assert.equal(p3.characterId, 'assault');
    assert.equal(p3.weaponId, 'ak47');
  } finally {
    cleanup();
  }
});

test('Batch 13 Audit: MatchRoom enforces per-life gun lock, allows knife, and queues next-spawn gun', () => {
  const { room, c1, cleanup } = createRoomWithPlayers();
  try {
    const handlers = (room as unknown as { onMessageEvents: { emit: (type: string, client: unknown, payload?: unknown) => void } }).onMessageEvents;

    // Lobby phase allows immediate gun change via select_loadout
    handlers.emit('select_loadout', c1, { weaponId: 'smg', characterId: 'vanguard' });
    const p1 = room.state.players.get('human_1')!;
    const p2 = room.state.players.get('human_2')!;
    assert.equal(p1.weaponId, 'smg');
    assert.equal(p1.characterId, 'vanguard');

    // Start match -> put players in clean LOS facing each other
    handlers.emit('start_match', c1);
    assert.equal(room.state.phase, 'playing');
    p1.x = 0;
    p1.y = 0;
    p1.z = -10;
    p1.rotY = 0;
    p1.pitch = 0;
    p2.x = 0;
    p2.y = 0;
    p2.z = -8.5; // 1.5m ahead (within both gun & knife range)
    p2.rotY = Math.PI;
    p2.pitch = 0;
    (room as unknown as { spawnProtectionUntil: Map<string, number> }).spawnProtectionUntil.clear();

    // Alive client trying to spoof gun switch in player_move must be ignored
    handlers.emit('player_move', c1, {
      x: 0,
      y: 0,
      z: -10,
      rotY: 0,
      pitch: 0,
      weaponId: 'sniper',
    });
    assert.equal(p1.weaponId, 'smg');

    // Alive client CAN toggle visual weaponId to 'knife' and back to 'smg'
    handlers.emit('player_move', c1, {
      x: 0,
      y: 0,
      z: -10,
      rotY: 0,
      pitch: 0,
      weaponId: 'knife',
    });
    assert.equal(p1.weaponId, 'knife');

    handlers.emit('player_move', c1, {
      x: 0,
      y: 0,
      z: -10,
      rotY: 0,
      pitch: 0,
      weaponId: 'smg',
    });
    assert.equal(p1.weaponId, 'smg');

    // Spoofing sniper shot while equipped gun is 'smg' must deal 0 damage
    handlers.emit('player_fire', c1, {
      weaponId: 'sniper',
      targetId: p2.id,
      endX: p2.x,
      endY: p2.y + 1.25,
      endZ: p2.z,
    });
    assert.equal(p2.health, 100);

    // Quick-melee / Knife hit with equipped gun 'smg' IS allowed and deals knife damage (75)
    handlers.emit('player_fire', c1, {
      weaponId: 'knife',
      targetId: p2.id,
      endX: p2.x,
      endY: p2.y + 1.25,
      endZ: p2.z,
    });
    assert.equal(p2.health, 25);

    // Queue 'pistol' while p1 is alive -> stays on 'smg' for this life
    handlers.emit('select_loadout', c1, { weaponId: 'pistol' });
    assert.equal(p1.weaponId, 'smg');

    // Simulate p1 death -> selecting 'ak47' while dead takes effect immediately, or respawn applies queued
    p1.isAlive = false;
    p1.health = 0;
    handlers.emit('select_loadout', c1, { weaponId: 'ak47' });
    assert.equal(p1.weaponId, 'ak47');

    // Verify respawn applies queued gun cleanly after alive-queueing
    p1.isAlive = true;
    p1.health = 100;
    handlers.emit('select_loadout', c1, { weaponId: 'pistol' });
    p1.isAlive = false;
    (room as unknown as { respawnPlayer: (p: unknown, now: number) => void }).respawnPlayer(p1, Date.now());
    assert.equal(p1.isAlive, true);
    assert.equal(p1.weaponId, 'pistol');
  } finally {
    cleanup();
  }
});

test('Batch 13 Audit: 4 Characters, 5 Guns, 5 Charms & Hitbox parity checks', () => {
  assert.equal(CHARACTER_IDS.length, 4);
  assert.equal(GUN_IDS.length, 5);
  assert.equal(KNIFE_CHARM_IDS.length, 5);

  // Every character has a valid signature gun in GUN_IDS and round-trips safely
  for (const charId of CHARACTER_IDS) {
    const cfg = CHARACTERS[charId];
    assert.ok(GUN_IDS.includes(cfg.signatureGunId));
    assert.equal(getSignatureGunForCharacter(charId), cfg.signatureGunId);
    assert.equal(normalizeCharacterId(charId), charId);
  }

  for (const gunId of GUN_IDS) {
    assert.ok(SERVER_WEAPONS[gunId], `Server weapon ${gunId} missing`);
    assert.equal(WEAPONS[gunId].slot, 1);
    assert.equal(normalizeGunId(gunId), gunId);
    const matchedChar = getCharacterForWeaponId(gunId);
    assert.ok(CHARACTER_IDS.includes(matchedChar));
  }
  assert.equal(WEAPONS.knife.slot, 2);
  assert.ok(SERVER_WEAPONS.knife?.isMelee);

  for (const charmId of KNIFE_CHARM_IDS) {
    assert.equal(normalizeKnifeCharmId(charmId), charmId);
  }

  // Alive character change with signature gun queues without unlocking mid-life
  const aliveCharOutcome = applyCharacterSelection(
    { equippedGunId: 'ak47', queuedGunId: 'ak47', activeSlot: 1 },
    'marksman',
    true,
    'playing',
    true
  );
  assert.equal(aliveCharOutcome.characterId, 'marksman');
  assert.equal(aliveCharOutcome.signatureGunId, 'sniper');
  assert.equal(aliveCharOutcome.gunOutcome?.switchedImmediately, false);
  assert.equal(aliveCharOutcome.gunOutcome?.lockMessage, GUN_LOCKED_WHILE_ALIVE_MESSAGE);
  assert.equal(aliveCharOutcome.gunOutcome?.loadout.equippedGunId, 'ak47');
  assert.equal(aliveCharOutcome.gunOutcome?.loadout.queuedGunId, 'sniper');

  // Respawn resolves queued gun into slot 1
  const respawned = resolveRespawnLoadout(aliveCharOutcome.gunOutcome!.loadout);
  assert.equal(respawned.equippedGunId, 'sniper');
  assert.equal(respawned.activeSlot, 1);

  // Dead/pre-spawn allows immediate switch even while holding knife in slot 2
  const deadOutcome = applyGunSelection(
    { equippedGunId: 'ak47', queuedGunId: 'ak47', activeSlot: 2 },
    'shotgun',
    'playing',
    false
  );
  assert.equal(deadOutcome.switchedImmediately, true);
  assert.equal(deadOutcome.loadout.equippedGunId, 'shotgun');

  // Hitbox geometry alignment between OperatorMeshBuilder (pivot=0.80, head=+0.90) & hitValidation
  assert.equal(HITBOX.UPPER_BODY_PIVOT_Y, 0.8);
  assert.equal(HITBOX.HEAD_LOCAL_Y, 0.9);
  const headHit = validateAuthoritativeHit(
    { id: 's', team: 'blue', isAlive: true, x: 0, y: 0, z: -10, rotY: 0, pitch: 0 },
    { id: 't', team: 'red', isAlive: true, x: 0, y: 0, z: 0, rotY: Math.PI, pitch: 0 },
    { weaponId: 'ak47', targetId: 't', claimedZone: 'body', endX: 0, endY: 1.7, endZ: 0 },
    { friendlyFire: false, spawnProtectionUntil: 0, currentTime: 1000, mapId: 'desert', shooterRotY: 0, shooterPitch: 0 }
  );
  assert.equal(headHit.accepted, true);
  assert.equal(headHit.verifiedZone, 'head');

  const bodyHit = validateAuthoritativeHit(
    { id: 's', team: 'blue', isAlive: true, x: 0, y: 0, z: -10, rotY: 0, pitch: 0 },
    { id: 't', team: 'red', isAlive: true, x: 0, y: 0, z: 0, rotY: Math.PI, pitch: 0 },
    { weaponId: 'ak47', targetId: 't', claimedZone: 'head', endX: 0, endY: 1.16, endZ: 0 },
    { friendlyFire: false, spawnProtectionUntil: 0, currentTime: 1000, mapId: 'desert', shooterRotY: 0, shooterPitch: 0 }
  );
  assert.equal(bodyHit.accepted, true);
  assert.equal(bodyHit.verifiedZone, 'body');
});
