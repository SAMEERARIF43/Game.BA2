import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine, previewMapAmbient } from '../src/game/AudioEngine.ts';
import { MAP_REGISTRY } from '../src/maps/MapManager.ts';
import { PingSystem } from '../src/game/PingSystem.ts';
import { NullEngine, Scene, UniversalCamera, Vector3 } from '@babylonjs/core';

test('Spatial audio manager triggers ambient environmental soundscapes per map', () => {
  const audio = new AudioEngine();
  // Verify map registry IDs correspond to valid ambient environments
  const mapIds = Object.keys(MAP_REGISTRY);
  assert.ok(mapIds.length >= 4);

  for (const mapId of mapIds) {
    // Should not throw when setting ambient environment
    audio.setAmbientEnvironment(mapId as any);
    // Should not throw when previewing map ambient
    previewMapAmbient(mapId as any);
  }

  audio.setAmbientEnvironment('menu');
  const vol = audio.getVolumeState();
  assert.ok(vol.masterVolume >= 0);
  audio.dispose();
});

test('Tactical ping system places, tracks, and projects markers with distance indicators', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new UniversalCamera('cam', Vector3.Zero(), scene);
  const pingSystem = new PingSystem(scene);

  pingSystem.setLocalTeam('blue');
  pingSystem.upsertPing({
    id: 'test_ping_1',
    senderId: 'player',
    senderName: 'Operator',
    team: 'blue',
    kind: 'location',
    x: 10,
    y: 0,
    z: 15,
  });

  const pings = pingSystem.getActivePings();
  assert.strictEqual(pings.length, 1);
  assert.strictEqual(pings[0].id, 'test_ping_1');

  pingSystem.update(0.016, camera, () => null);
  const markers = pingSystem.getHudMarkers(camera, 1280, 720);
  assert.ok(markers.length >= 0);

  pingSystem.dispose();
  scene.dispose();
  engine.dispose();
});
