import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MeshBuilder,
  NullEngine,
  Scene,
  UniversalCamera,
  Vector3,
} from '@babylonjs/core';
import { PingSystem, resolvePingRaycast } from '../src/game/PingSystem.ts';
import { DEFAULT_KEYBINDINGS, validateKeybindings } from '../src/settings/keybindings.ts';
import { MatchRoom } from '../server/rooms/MatchRoom.ts';
import { PlayerSchema } from '../server/schema/MatchState.ts';

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

test('Tactical Ping System: raycast resolution, 3D pooling, tracking, keybindings & team isolation', async (t) => {
  await t.test('resolvePingRaycast marks map surfaces as location pings and opposing bots/players as enemy pings', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);

    try {
      const wall = MeshBuilder.CreateBox('cover_wall', { width: 4, height: 3, depth: 1 }, scene);
      wall.position.set(0, 1.5, 14);
      wall.isPickable = true;

      const enemyMesh = MeshBuilder.CreateBox('enemy_body', { width: 0.7, height: 1.5, depth: 0.5 }, scene);
      enemyMesh.position.set(6, 1.0, 12);
      enemyMesh.isPickable = true;
      enemyMesh.metadata = { isBot: true, botId: 'bot_red_1', team: 'red', zone: 'body' };

      const friendlyMesh = MeshBuilder.CreateBox('ally_body', { width: 0.7, height: 1.5, depth: 0.5 }, scene);
      friendlyMesh.position.set(-6, 1.0, 12);
      friendlyMesh.isPickable = true;
      friendlyMesh.metadata = { isBot: true, botId: 'bot_blue_1', team: 'blue', zone: 'body' };

      wall.computeWorldMatrix(true);
      enemyMesh.computeWorldMatrix(true);
      friendlyMesh.computeWorldMatrix(true);
      const origin = new Vector3(0, 1.6, 0);

      const wallHit = resolvePingRaycast(scene, origin, new Vector3(0, 0, 1), 'blue');
      assert.strictEqual(wallHit.kind, 'location');
      assert.ok(wallHit.z > 13 && wallHit.z < 14.5);
      assert.strictEqual(wallHit.targetId, undefined);

      const enemyDir = new Vector3(6, -0.6, 12).normalize();
      const enemyHit = resolvePingRaycast(scene, origin, enemyDir, 'blue');
      assert.strictEqual(enemyHit.kind, 'enemy');
      assert.strictEqual(enemyHit.targetId, 'bot_red_1');

      // Allies should never trigger hostile enemy ping markers
      const allyDir = new Vector3(-6, -0.6, 12).normalize();
      const allyHit = resolvePingRaycast(scene, origin, allyDir, 'blue');
      assert.strictEqual(allyHit.kind, 'location');
      assert.strictEqual(allyHit.targetId, undefined);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  await t.test('PingSystem pools 3D beacons without per-ping material allocations, tracks enemy movement, caps per sender, and expires cleanly', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new UniversalCamera('ping_cam', new Vector3(0, 1.7, 0), scene);
    camera.setTarget(new Vector3(0, 1.5, 12));
    scene.render();

    try {
      const pings = new PingSystem(scene);
      pings.setLocalTeam('blue');

      const meshBaseline = scene.meshes.length;
      const matBaseline = scene.materials.length;

      let enemyX = 2;
      let enemyZ = 15;
      let enemyAlive = true;

      pings.upsertPing({
        id: 'p1_ping_1',
        senderId: 'p1',
        senderName: 'Alpha',
        team: 'blue',
        kind: 'enemy',
        x: enemyX,
        y: 1.4,
        z: enemyZ,
        targetId: 'bot_red_1',
        durationSec: 4.0,
      });

      assert.strictEqual(scene.meshes.length, meshBaseline, 'Ping creation must reuse pooled meshes');
      assert.strictEqual(scene.materials.length, matBaseline, 'Ping creation must reuse pooled materials');

      enemyX = 5.5;
      enemyZ = 18;
      pings.update(0.25, camera, (id) =>
        id === 'bot_red_1' ? { x: enemyX, y: 0, z: enemyZ, isAlive: enemyAlive } : null
      );

      const active = pings.getActivePings();
      assert.strictEqual(active.length, 1);
      assert.strictEqual(active[0].x, 5.5, 'Enemy ping should track live target X');
      assert.strictEqual(active[0].z, 18, 'Enemy ping should track live target Z');

      const hudMarkers = pings.getHudMarkers(camera, 1280, 720);
      assert.strictEqual(hudMarkers.length, 1);
      assert.strictEqual(hudMarkers[0].kind, 'enemy');
      assert.ok(hudMarkers[0].distanceMeters >= 15);
      assert.strictEqual(hudMarkers[0].onScreen, true);

      // Same-sender cap keeps at most 2 concurrent pings per sender
      pings.upsertPing({
        id: 'p1_ping_2',
        senderId: 'p1',
        senderName: 'Alpha',
        team: 'blue',
        kind: 'location',
        x: -3,
        y: 0.5,
        z: 10,
      });
      pings.upsertPing({
        id: 'p1_ping_3',
        senderId: 'p1',
        senderName: 'Alpha',
        team: 'blue',
        kind: 'location',
        x: 3,
        y: 0.5,
        z: 10,
      });
      assert.strictEqual(pings.getActivePings().length, 2, 'Per-sender cap must keep only newest 2 pings');

      // Advance past TTL (8s location default) in realistic frame steps and verify clean expiration
      for (let i = 0; i < 95; i++) {
        pings.update(0.1, camera);
      }
      assert.strictEqual(pings.getActivePings().length, 0);

      pings.dispose();
    } finally {
      camera.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  await t.test('Ping keybinding defaults to KeyZ and validates/rebinds cleanly', () => {
    assert.strictEqual(DEFAULT_KEYBINDINGS.ping, 'KeyZ');
    const validated = validateKeybindings({ ping: 'KeyG' });
    assert.strictEqual(validated.ping, 'KeyG');
  });

  await t.test('MatchRoom place_ping broadcasts team_ping strictly to sender teammates, clamps coordinates, and rate-limits spam', () => {
    const room = new MatchRoom();
    room.onCreate({ mapId: 'urban', botCount: 0, killLimit: 25, timeLimit: 300 });
    room.state.phase = 'playing';

    const blueA = createMockClient('blue_a');
    const blueB = createMockClient('blue_b');
    const redA = createMockClient('red_a');
    room.clients.push(blueA as any, blueB as any, redA as any);

    const addPlayer = (id: string, team: 'blue' | 'red', x: number, z: number) => {
      const p = new PlayerSchema();
      p.id = id;
      p.name = id;
      p.team = team;
      p.isBot = false;
      p.isAlive = true;
      p.health = 100;
      p.x = x;
      p.y = 0;
      p.z = z;
      p.weaponId = 'ak47';
      p.stance = 'stand';
      room.state.players.set(id, p);
      return p;
    };

    addPlayer('blue_a', 'blue', 0, -10);
    addPlayer('blue_b', 'blue', 4, -10);
    addPlayer('red_a', 'red', 2, 12);

    try {
      (room as any).onMessageEvents.emit('place_ping', blueA, {
        id: 'ping_1',
        kind: 'enemy',
        x: 999,
        y: 1.5,
        z: 999,
        targetId: 'red_a',
      });

      assert.strictEqual(blueA.sentMessages.filter((m) => m.type === 'team_ping').length, 1);
      assert.strictEqual(blueB.sentMessages.filter((m) => m.type === 'team_ping').length, 1);
      assert.strictEqual(
        redA.sentMessages.filter((m) => m.type === 'team_ping').length,
        0,
        'Enemy team must never receive team_ping events'
      );

      const pingPayload = blueB.sentMessages[0].data;
      assert.strictEqual(pingPayload.kind, 'enemy');
      assert.strictEqual(pingPayload.targetId, 'red_a');
      assert.strictEqual(pingPayload.x, 2, 'Server must anchor enemy ping to authoritative enemy position');
      assert.strictEqual(pingPayload.z, 12);

      // Immediate second ping within 300ms cooldown is dropped
      (room as any).onMessageEvents.emit('place_ping', blueA, {
        id: 'ping_2',
        kind: 'location',
        x: 5,
        y: 1,
        z: 5,
      });
      assert.strictEqual(
        blueB.sentMessages.filter((m) => m.type === 'team_ping').length,
        1,
        'Rate limit must block ping spam under 300ms'
      );
    } finally {
      clearInterval((room as any)._simulationInterval);
      room.onDispose();
    }
  });
});
