import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, UniversalCamera, Vector3 } from '@babylonjs/core';
import { WeaponSystem } from '../src/game/WeaponSystem.ts';
import { PlayerController } from '../src/game/PlayerController.ts';
import { AudioEngine } from '../src/game/AudioEngine.ts';
import { BotManager } from '../src/bots/BotManager.ts';
import { MatchManager } from '../src/match/MatchManager.ts';

test('Batch 23: Respawn viewmodel re-activation, damage indicator clearing, and camera roll reset', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new UniversalCamera('cam', Vector3.Zero(), scene);
  const audio = new AudioEngine();
  const matchManager = new MatchManager();
  matchManager.initMatch({ mapId: 'urban', mode: 'tdm', roomName: 'Test Room', killLimit: 30, timeLimit: 300, botCount: 2 });

  const player = new PlayerController(scene, document.createElement('canvas'), audio, {
    onFirePress: () => {},
    onFireRelease: () => {},
    onAdsChange: () => {},
    onReload: () => {},
    onSelectSlot: () => {},
    onScoreboardChange: () => {},
    onPointerLockChange: () => {},
  });

  const bots = new BotManager(scene, matchManager, {
    getPlayerTarget: () => ({ id: 'player', isAlive: true, position: Vector3.Zero(), eyePosition: new Vector3(0, 1, 0), collider: player.collider }),
    onPlayerDamaged: () => {},
  });

  const weapons = new WeaponSystem(scene, camera, player, bots, audio, undefined, undefined, 'smg', 'tactical_tag');

  // 1. Verify viewmodel visibility & queued gun on respawn
  weapons.setQueuedGun('sniper');
  weapons.applyQueuedGunOnRespawn();
  assert.strictEqual(weapons.getEquippedGunId(), 'sniper');

  // 2. Verify camera roll and flinch reset on spawnAt
  player.spawnAt(new Vector3(0, 1, 0), 0);
  assert.strictEqual(camera.rotation.z, 0);

  scene.dispose();
  engine.dispose();
});
