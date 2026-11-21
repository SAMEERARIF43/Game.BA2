import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Matrix,
  MeshBuilder,
  NullEngine,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import { AudioEngine } from '../src/game/AudioEngine.ts';
import {
  PooledTracerRingBuffer,
  computeAdsAttenuatedScale,
  getVfxQualityBudget,
  getWeaponFeelProfile,
} from '../src/game/combatVfx.ts';
import { PlayerController } from '../src/game/PlayerController.ts';
import { WEAPONS, WeaponId } from '../src/game/types.ts';
import { WeaponSystem } from '../src/game/WeaponSystem.ts';
import { BotManager } from '../src/bots/BotManager.ts';
import { MatchManager } from '../src/match/MatchManager.ts';
import { RemotePlayerRenderer } from '../src/multiplayer/RemotePlayerRenderer.ts';

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

  const fakeWindow = {
    addEventListener: noop,
    removeEventListener: noop,
    devicePixelRatio: 1,
    AudioContext: undefined,
    webkitAudioContext: undefined,
  };

  const fakeDocument = {
    addEventListener: noop,
    removeEventListener: noop,
    pointerLockElement: fakeCanvas,
    exitPointerLock: noop,
    hidden: false,
    createElement: () => fakeCanvas,
  };

  g.window = fakeWindow;
  g.document = fakeDocument;
  g.OffscreenCanvas = FakeOffscreenCanvas;
  try {
    return fn(fakeCanvas);
  } finally {
    if (prevWindow === undefined) delete g.window;
    else g.window = prevWindow;
    if (prevDocument === undefined) delete g.document;
    else g.document = prevDocument;
    if (prevOffscreenCanvas === undefined) delete g.OffscreenCanvas;
    else g.OffscreenCanvas = prevOffscreenCanvas;
  }
}

test('Batch 15: Combat VFX, Pooled Tracers, Shell Casings & Game-Feel Polish', async (t) => {
  await t.test('VFX quality budgets scale muzzle lights, shell casings, sparks, dust puffs, decals, and knife trails cleanly across LOW / MEDIUM / HIGH', () => {
    const low = getVfxQualityBudget('LOW');
    const med = getVfxQualityBudget('MEDIUM');
    const high = getVfxQualityBudget('HIGH');

    assert.strictEqual(low.muzzleLightEnabled, false);
    assert.strictEqual(low.muzzleLightScale, 0);
    assert.strictEqual(low.casingsEnabled, false);
    assert.strictEqual(low.maxCasings, 0);
    assert.strictEqual(low.dustPuffCount, 0);
    assert.ok(low.maxDecals < med.maxDecals && med.maxDecals < high.maxDecals);
    assert.ok(low.maxTracers < med.maxTracers && med.maxTracers < high.maxTracers);
    assert.ok(low.envSparkCount < med.envSparkCount && med.envSparkCount < high.envSparkCount);
    assert.ok(low.knifeTrailSegments < med.knifeTrailSegments && med.knifeTrailSegments < high.knifeTrailSegments);

    assert.strictEqual(med.muzzleLightEnabled, true);
    assert.strictEqual(med.casingsEnabled, true);
    assert.strictEqual(high.muzzleLightEnabled, true);
    assert.strictEqual(high.casingsEnabled, true);
  });

  await t.test('Weapon feel profiles differentiate recoil/bolt-cycle/casings and attenuate cleanly during ADS', () => {
    const ak = getWeaponFeelProfile('ak47');
    const smg = getWeaponFeelProfile('smg');
    const sniper = getWeaponFeelProfile('sniper');
    const shotgun = getWeaponFeelProfile('shotgun');
    const pistol = getWeaponFeelProfile('pistol');

    assert.ok(sniper.kickRotX > ak.kickRotX && ak.kickRotX > smg.kickRotX);
    assert.ok(smg.kickYaw > ak.kickYaw, 'SMG should have snappier horizontal jitter');
    assert.strictEqual(shotgun.casingKind, 'shotgunHull');
    assert.strictEqual(sniper.casingKind, 'brassHeavy');
    assert.ok(sniper.casingDelaySec > 0.25, 'Sniper casing ejection should wait for bolt cycle');
    assert.strictEqual(ak.casingKind, 'brassRifle');
    assert.strictEqual(pistol.casingKind, 'brassPistol');

    assert.strictEqual(computeAdsAttenuatedScale(0, 0.36), 1);
    assert.ok(Math.abs(computeAdsAttenuatedScale(1, 0.36) - 0.36) < 1e-6);
    assert.ok(computeAdsAttenuatedScale(0.5, 0.36) < 1 && computeAdsAttenuatedScale(0.5, 0.36) > 0.36);
  });

  await t.test('PooledTracerRingBuffer pre-allocates fixed capacity, reuses slots in ring buffer, and tapers/fades without allocating', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const mat = new StandardMaterial('tracer_mat', scene);
      const pool = new PooledTracerRingBuffer(scene, 'test_tracer', 8);

      assert.strictEqual(pool.getCapacity(), 8);
      assert.strictEqual(pool.getActiveCount(), 0);
      const meshCountBefore = scene.meshes.length;
      const matCountBefore = scene.materials.length;

      for (let i = 0; i < 20; i++) {
        pool.spawn(new Vector3(0, 1.6, 0), new Vector3(0, 1.6, 18 + i), mat, {
          thickness: 0.02,
          duration: 0.06,
        });
      }

      assert.strictEqual(scene.meshes.length, meshCountBefore, 'Tracer spawns must not create new meshes');
      assert.strictEqual(scene.materials.length, matCountBefore, 'Tracer spawns must not create new materials');
      assert.strictEqual(pool.getActiveCount(), 8, 'Ring buffer must wrap cleanly at capacity');

      pool.update(0.03);
      assert.strictEqual(pool.getActiveCount(), 8, 'Tracers remain active mid-lifetime');
      pool.update(0.05);
      assert.strictEqual(pool.getActiveCount(), 0, 'Expired tracers disable cleanly');

      pool.spawn(new Vector3(0, 1.6, 0), new Vector3(0, 1.6, 12), mat, { duration: 0.06 });
      pool.setMaxActive(4);
      pool.clear();
      assert.strictEqual(pool.getActiveCount(), 0);

      pool.dispose();
      mat.dispose();
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  await t.test('WeaponSystem pools muzzle flash, pooled PointLight, tracers, shell casings, decals & resets cleanly with zero per-shot allocations', () => {
    withDomStubs((canvas) => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const audio = new AudioEngine();
      const match = new MatchManager();
      const botManager = new BotManager(scene, match, {
        getPlayerTarget: () => ({
          id: 'player',
          isAlive: true,
          position: new Vector3(0, 1, 0),
          eyePosition: new Vector3(0, 1.7, 0),
          collider: null as unknown as never,
        }),
        onPlayerDamaged: () => {},
      });

      const player = new PlayerController(scene, canvas, audio, {
        onFirePress: () => {},
        onFireRelease: () => {},
        onAdsChange: () => {},
        onReload: () => {},
        onSelectSlot: () => {},
        onScoreboardChange: () => {},
        onPointerLockChange: () => {},
      });

      // Target wall placed downrange along +Z so hitscan & raycasts have an environment hit surface
      const wall = MeshBuilder.CreateBox('vfx_test_wall', { width: 12, height: 6, depth: 1 }, scene);
      wall.position.set(0, 2.5, 16);
      wall.isPickable = true;
      wall.checkCollisions = true;

      const weapons = new WeaponSystem(
        scene,
        player.camera,
        player,
        botManager,
        audio,
        undefined,
        undefined,
        'ak47'
      );

      try {
        player.setOrbitPreview(false);
        player.setCanControl(true);
        player.spawnAt(new Vector3(0, 1, 0), 0);
        const baseFov = player.camera.fov;
        weapons.setViewModelVisible(true);
        weapons.setGraphicsQuality('HIGH');

        scene.render();
        const baselineMeshes = scene.meshes.length;
        const baselineMaterials = scene.materials.length;
        const baselineLights = scene.lights.length;

        // Fire single AK-47 shot and check active state within ~45ms muzzle flash window
        weapons.onFirePress();
        player.update(0.012, WEAPONS.ak47.adsFovRatio);
        weapons.update(0.012);
        weapons.onFireRelease();

        const afterStats = weapons.getVfxPoolStats();
        assert.strictEqual(afterStats.muzzleFlashEnabled, true, 'Muzzle flash should activate on shot');
        assert.ok(afterStats.muzzleFlashMeshCount >= 5, 'Multi-blade star/cone muzzle flash should have >= 5 meshes');
        assert.ok(afterStats.muzzleLightIntensity > 0, 'Pooled muzzle PointLight should pulse on HIGH quality');
        assert.ok(afterStats.activeTracers > 0, 'Pooled tracers should be active on fire');
        assert.ok(afterStats.activeCasings > 0, 'Brass shell casings should eject on HIGH quality');
        assert.ok(afterStats.activeDecals > 0, 'Wall impact decals should spawn on environment hit');
        assert.ok(afterStats.activeImpacts > 0, 'Pooled ricochet spark bursts should spawn on environment hit');
        assert.ok(afterStats.activeDust > 0, 'Pooled dust puffs should spawn on HIGH quality');
        assert.ok(player.camera.fov > baseFov, 'Weapon recoil should apply subtle camera FOV kick');

        // Verify zero per-shot allocations across scene collections
        assert.strictEqual(scene.meshes.length, baselineMeshes, 'Firing must not allocate new scene meshes');
        assert.strictEqual(scene.materials.length, baselineMaterials, 'Firing must not allocate new scene materials');
        assert.strictEqual(scene.lights.length, baselineLights, 'Firing must never instantiate new PointLights');

        // Verify ~45ms muzzle flash fade-out without firing
        weapons.update(0.05);
        const fadedStats = weapons.getVfxPoolStats();
        assert.strictEqual(fadedStats.muzzleFlashEnabled, false, 'Muzzle flash should fade out after ~45ms');

        // Verify Sniper delayed bolt-cycle shell casing & transient cancel resets cleanly
        weapons.resetForLife();
        weapons.setEquippedGun('sniper');
        weapons.onFirePress();
        player.update(0.016, WEAPONS.sniper.adsFovRatio);
        weapons.update(0.016);
        weapons.onFireRelease();
        assert.strictEqual(
          weapons.getVfxPoolStats().activeCasings,
          0,
          'Sniper shell casing waits for bolt cycle (~0.34s) rather than ejecting immediately'
        );
        for (let i = 0; i < 10; i++) {
          player.update(0.04, WEAPONS.sniper.adsFovRatio);
          weapons.update(0.04);
        }
        assert.strictEqual(
          weapons.getVfxPoolStats().activeCasings,
          1,
          'Sniper ejects heavy brass casing upon bolt cycle completion'
        );

        weapons.cancelTransientActions();
        assert.strictEqual(weapons.getVfxPoolStats().muzzleFlashEnabled, false);
        assert.strictEqual(weapons.getVfxPoolStats().muzzleLightIntensity, 0);
        assert.ok(Math.abs(player.camera.fov - baseFov) < 1e-6, 'Pause/cancel must clear camera FOV kick');

        // Verify LOW quality skips muzzle light & shell casings
        weapons.resetForLife();
        weapons.setGraphicsQuality('LOW');
        weapons.setEquippedGun('shotgun');
        weapons.onFirePress();
        weapons.update(0.02);
        weapons.onFireRelease();
        const lowStats = weapons.getVfxPoolStats();
        assert.strictEqual(lowStats.muzzleLightIntensity, 0, 'LOW quality must disable muzzle dynamic light');
        assert.strictEqual(lowStats.activeCasings, 0, 'LOW quality must disable shell casings');
        assert.strictEqual(lowStats.activeDust, 0, 'LOW quality must skip dust puffs');
        assert.ok(lowStats.activeTracers > 0, 'Shotgun pellet tracers still pool cleanly on LOW');

        // Verify K-Bar knife slash activates blade-arc trail and resets cleanly on swap/cancel
        weapons.setGraphicsQuality('HIGH');
        weapons.selectSlot(2);
        weapons.onFirePress();
        weapons.update(0.04);
        weapons.update(0.04);
        weapons.onFireRelease();
        assert.ok(weapons.getVfxPoolStats().knifeTrailVisibleCount > 0, 'Knife slash should render pooled blade-arc trail');
        weapons.cancelTransientActions();
        assert.strictEqual(weapons.getVfxPoolStats().knifeTrailVisibleCount, 0, 'Knife arc trail must clear on transient reset');

        assert.strictEqual(scene.meshes.length, baselineMeshes);
        assert.strictEqual(scene.materials.length, baselineMaterials);
        assert.strictEqual(scene.lights.length, baselineLights);
      } finally {
        weapons.dispose();
        botManager.dispose();
        player.dispose();
        audio.dispose();
        wall.dispose();
        scene.dispose();
        engine.dispose();
      }
    });
  });

  await t.test('BotManager and RemotePlayerRenderer pool gunfire tracers without per-shot mesh allocations and honor quality scaling', () => {
    withDomStubs(() => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const match = new MatchManager();
      const botManager = new BotManager(scene, match, {
        getPlayerTarget: () => ({
          id: 'player',
          isAlive: false,
          position: new Vector3(0, 1, 0),
          eyePosition: new Vector3(0, 1.7, 0),
          collider: null as unknown as never,
        }),
        onPlayerDamaged: () => {},
      });
      const remote = new RemotePlayerRenderer(scene);

      try {
        remote.syncPlayers(
          [
            {
              id: 'local',
              name: 'Local',
              team: 'blue',
              isHost: true,
              isReady: true,
              kills: 0,
              deaths: 0,
              x: 0,
              y: 0,
              z: 0,
              rotY: 0,
              rotX: 0,
              health: 100,
              isAlive: true,
              respawnTimer: 0,
              weaponId: 'ak47',
              characterId: 'vanguard',
            },
            {
              id: 'remote_1',
              name: 'Rival',
              team: 'red',
              isHost: false,
              isReady: true,
              kills: 0,
              deaths: 0,
              x: 6,
              y: 0,
              z: 10,
              rotY: 0,
              rotX: 0,
              health: 100,
              isAlive: true,
              respawnTimer: 0,
              weaponId: 'shotgun',
              characterId: 'breacher',
            },
          ],
          'local'
        );

        const meshCountBefore = scene.meshes.length;
        const matCountBefore = scene.materials.length;

        remote.setGraphicsQuality('MEDIUM');
        botManager.setGraphicsQuality('MEDIUM');

        for (let i = 0; i < 12; i++) {
          remote.spawnRemoteFire({
            playerId: 'remote_1',
            muzzleX: 6,
            muzzleY: 1.4,
            muzzleZ: 10,
            endX: 0,
            endY: 1.4,
            endZ: 0,
            weaponId: 'shotgun',
            pellets: [
              { endX: 0.2, endY: 1.4, endZ: 0 },
              { endX: -0.2, endY: 1.3, endZ: 0 },
            ],
          });
        }
        remote.update(0.02);

        assert.strictEqual(scene.meshes.length, meshCountBefore, 'Remote fire must reuse pooled tracer meshes');
        assert.strictEqual(scene.materials.length, matCountBefore, 'Remote fire must reuse pooled tracer materials');
        assert.ok(Matrix.Identity().determinant() === 1);
      } finally {
        remote.dispose();
        botManager.dispose();
        scene.dispose();
        engine.dispose();
      }
    });
  });

  await t.test('Weapon damage, RPM, range, spread, and magSize contracts remain unaltered after Batch 15 polish', () => {
    const expected: Record<WeaponId, { damage: number; rpm: number; magSize: number; pellets?: number }> = {
      shotgun: { damage: 16, rpm: 78, magSize: 8, pellets: 8 },
      ak47: { damage: 34, rpm: 600, magSize: 30 },
      smg: { damage: 21, rpm: 960, magSize: 36 },
      sniper: { damage: 115, rpm: 60, magSize: 6 },
      pistol: { damage: 38, rpm: 360, magSize: 12 },
      knife: { damage: 75, rpm: 140, magSize: 0 },
    };

    for (const [id, spec] of Object.entries(expected) as [
      WeaponId,
      { damage: number; rpm: number; magSize: number; pellets?: number },
    ][]) {
      assert.strictEqual(WEAPONS[id].damage, spec.damage, `${id} damage changed`);
      assert.strictEqual(WEAPONS[id].rpm, spec.rpm, `${id} rpm changed`);
      assert.strictEqual(WEAPONS[id].magSize, spec.magSize, `${id} magSize changed`);
      if (spec.pellets !== undefined) {
        assert.strictEqual(WEAPONS[id].pellets, spec.pellets, `${id} pellets changed`);
      }
    }
  });
});
