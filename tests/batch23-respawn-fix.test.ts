import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, UniversalCamera, Vector3 } from '@babylonjs/core';
import { WeaponSystem } from '../src/game/WeaponSystem.ts';
import { PlayerController } from '../src/game/PlayerController.ts';
import { AudioEngine } from '../src/game/AudioEngine.ts';
import { BotManager } from '../src/bots/BotManager.ts';
import { MatchManager } from '../src/match/MatchManager.ts';

function withDomStubs<T>(fn: (canvas: HTMLCanvasElement) => T): T {
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
    quadraticCurveTo: noop,
    arc: noop,
    stroke: noop,
    fill: noop,
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textAlign: 'center',
    textBaseline: 'middle',
  };

  class FakeOffscreenCanvas {
    public width: number;
    public height: number;
    constructor(width = 256, height = 256) {
      this.width = width;
      this.height = height;
    }
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

  const store = new Map<string, string>();
  const fakeWindow = {
    addEventListener: noop,
    removeEventListener: noop,
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
    },
    devicePixelRatio: 1,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };

  const fakeDocument = {
    pointerLockElement: null,
    hidden: false,
    exitPointerLock: noop,
    addEventListener: noop,
    removeEventListener: noop,
    createElement: () => fakeCanvas,
  };

  g.window = fakeWindow;
  g.document = fakeDocument;
  g.OffscreenCanvas = FakeOffscreenCanvas;

  try {
    return fn(fakeCanvas);
  } finally {
    g.window = prevWindow;
    g.document = prevDocument;
    g.OffscreenCanvas = prevOffscreenCanvas;
  }
}

test('Batch 23: Respawn viewmodel re-activation, damage indicator clearing, and camera roll reset', () => {
  withDomStubs((canvas) => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new UniversalCamera('cam', Vector3.Zero(), scene);
    const audio = new AudioEngine();
    const matchManager = new MatchManager();
    matchManager.initMatch({ mapId: 'urban', mode: 'tdm', roomName: 'Test Room', killLimit: 30, timeLimit: 300, botCount: 2 });

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

    weapons.dispose();
    bots.dispose();
    player.dispose();
    audio.dispose();
    scene.dispose();
    engine.dispose();
  });
});
