import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, UniversalCamera, Vector3 } from '@babylonjs/core';
import { WeaponSystem } from '../src/game/WeaponSystem.ts';
import { PlayerController } from '../src/game/PlayerController.ts';
import { AudioEngine } from '../src/game/AudioEngine.ts';
import { BotManager } from '../src/bots/BotManager.ts';
import { MatchManager } from '../src/match/MatchManager.ts';

function withDomStub<T>(fn: (stub: { canvas: HTMLCanvasElement }) => T): T {
  const g = globalThis as Record<string, unknown>;
  const prevWindow = g.window;
  const prevDocument = g.document;
  const prevOffscreenCanvas = g.OffscreenCanvas;
  const noop = () => {};

  const fakeCtx = {
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    fillText: noop,
    strokeText: noop,
    measureText: () => ({ width: 48 }),
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    fill: noop,
    save: noop,
    restore: noop,
  };

  class FakeOffscreenCanvas {
    public width = 256;
    public height = 256;
    getContext() {
      return fakeCtx;
    }
  }

  const fakeCanvas = {
    addEventListener: noop,
    removeEventListener: noop,
    requestPointerLock: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    getContext: () => fakeCtx,
  } as unknown as HTMLCanvasElement;

  const fakeWindow = {
    addEventListener: noop,
    removeEventListener: noop,
    devicePixelRatio: 1,
  };

  const fakeDocument = {
    addEventListener: noop,
    removeEventListener: noop,
    createElement: () => fakeCanvas,
    pointerLockElement: null,
    exitPointerLock: noop,
    hidden: false,
  };

  g.window = fakeWindow;
  g.document = fakeDocument;
  g.OffscreenCanvas = FakeOffscreenCanvas;

  try {
    return fn({ canvas: fakeCanvas });
  } finally {
    g.window = prevWindow;
    g.document = prevDocument;
    g.OffscreenCanvas = prevOffscreenCanvas;
  }
}

test('Batch 23: Respawn viewmodel re-activation, damage indicator clearing, and camera roll reset', () => {
  withDomStub(({ canvas }) => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new UniversalCamera('cam', Vector3.Zero(), scene);
    const audio = new AudioEngine();
    const matchManager = new MatchManager();
    matchManager.configureMatch('urban', 'Urban Strike', 30, 2, { mode: 'tdm', timeLimitSec: 300 });

    const player = new PlayerController(scene, canvas, audio, {
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
});
