import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBuilder, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { AudioEngine } from '../src/game/AudioEngine.ts';
import { PlayerController } from '../src/game/PlayerController.ts';
import { WeaponSystem } from '../src/game/WeaponSystem.ts';
import { BotManager } from '../src/bots/BotManager.ts';
import { MatchManager } from '../src/match/MatchManager.ts';
import {
  DEFAULT_SETTINGS,
  loadPersistedSettings,
  resetPersistedSettings,
  savePersistedSettings,
  SETTINGS_STORAGE_KEY,
  validateSettings,
} from '../src/settings/settingsStorage.ts';

interface DomStub {
  canvas: HTMLCanvasElement;
  emitWindowKeyDown: (code: string) => void;
  emitWindowKeyUp: (code: string) => void;
  emitMouseDown: (button: number) => void;
  emitMouseUp: (button: number) => void;
}

function withDomStub<T>(fn: (stub: DomStub) => T): T {
  const g = globalThis as Record<string, unknown>;
  const prevWindow = g.window;
  const prevDocument = g.document;
  const prevOffscreenCanvas = g.OffscreenCanvas;
  const noop = () => {};

  const windowListeners = new Map<string, Set<(ev: any) => void>>();
  const documentListeners = new Map<string, Set<(ev: any) => void>>();
  const store = new Map<string, string>();

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

  let fakeDocument: any;

  const fakeCanvas = {
    addEventListener: noop,
    removeEventListener: noop,
    requestPointerLock: () => {
      if (fakeDocument) {
        fakeDocument.pointerLockElement = fakeCanvas;
      }
      const cbs = documentListeners.get('pointerlockchange');
      if (cbs) {
        for (const cb of cbs) cb({});
      }
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    getContext: () => fakeCtx,
  } as unknown as HTMLCanvasElement;

  const fakeWindow = {
    addEventListener: (type: string, cb: (ev: any) => void) => {
      let set = windowListeners.get(type);
      if (!set) {
        set = new Set();
        windowListeners.set(type, set);
      }
      set.add(cb);
    },
    removeEventListener: (type: string, cb: (ev: any) => void) => {
      windowListeners.get(type)?.delete(cb);
    },
    devicePixelRatio: 1,
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
    AudioContext: undefined,
    webkitAudioContext: undefined,
  };

  fakeDocument = {
    addEventListener: (type: string, cb: (ev: any) => void) => {
      let set = documentListeners.get(type);
      if (!set) {
        set = new Set();
        documentListeners.set(type, set);
      }
      set.add(cb);
    },
    removeEventListener: (type: string, cb: (ev: any) => void) => {
      documentListeners.get(type)?.delete(cb);
    },
    pointerLockElement: null,
    exitPointerLock: () => {
      fakeDocument.pointerLockElement = null;
      const cbs = documentListeners.get('pointerlockchange');
      if (cbs) {
        for (const cb of cbs) cb({});
      }
    },
    hidden: false,
    createElement: () => fakeCanvas,
  };

  const emit = (type: string, eventObj: any) => {
    const cbs = windowListeners.get(type);
    if (!cbs) return;
    for (const cb of cbs) cb(eventObj);
  };

  g.window = fakeWindow;
  g.document = fakeDocument;
  g.OffscreenCanvas = FakeOffscreenCanvas;

  try {
    return fn({
      canvas: fakeCanvas,
      emitWindowKeyDown: (code: string) =>
        emit('keydown', { code, repeat: false, preventDefault: noop }),
      emitWindowKeyUp: (code: string) =>
        emit('keyup', { code, preventDefault: noop }),
      emitMouseDown: (button: number) =>
        emit('mousedown', { button, target: fakeCanvas, preventDefault: noop }),
      emitMouseUp: (button: number) =>
        emit('mouseup', { button, target: fakeCanvas, preventDefault: noop }),
    });
  } finally {
    if (prevWindow === undefined) delete g.window;
    else g.window = prevWindow;
    if (prevDocument === undefined) delete g.document;
    else g.document = prevDocument;
    if (prevOffscreenCanvas === undefined) delete g.OffscreenCanvas;
    else g.OffscreenCanvas = prevOffscreenCanvas;
  }
}

test('Batch 18: Complete Tactical Slide Mechanics & Slide Settings', async (t) => {
  await t.test('Sprint + Crouch triggers slide with lowered eye/collider height, FOV/roll feedback, and mid-slide combat', () => {
    withDomStub((dom) => {
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

      const floor = MeshBuilder.CreateBox('b18_floor', { width: 120, height: 1, depth: 120 }, scene);
      floor.position.set(0, -0.5, 0);
      floor.checkCollisions = true;
      floor.isPickable = true;

      let firedMidSlide = 0;
      let selectedSlotMidSlide = 0;
      const player = new PlayerController(scene, dom.canvas, audio, {
        onFirePress: () => {
          firedMidSlide += 1;
        },
        onFireRelease: () => {},
        onAdsChange: () => {},
        onReload: () => {},
        onSelectSlot: (slot) => {
          selectedSlotMidSlide = slot;
        },
        onScoreboardChange: () => {},
        onPointerLockChange: () => {},
      });
      const weapons = new WeaponSystem(scene, player.camera, player, botManager, audio);

      try {
        player.setOrbitPreview(false);
        player.setCanControl(true);
        player.requestPointerLock();
        player.spawnAt(new Vector3(0, 0.92, 0), 0);
        scene.render();

        player.setSlideSettings({
          slideEnabled: true,
          slideInputMode: 'tap',
          slidePostStance: 'stand',
          slideJumpCancel: true,
          slideCameraTilt: true,
        });

        dom.emitWindowKeyDown('KeyW');
        dom.emitWindowKeyDown('ShiftLeft');
        for (let i = 0; i < 18; i++) player.update(0.03, 0.74);

        const standEyeY = player.camera.position.y;
        const standFov = player.camera.fov;
        const sprintSpeed = player.getHorizontalSpeed();
        assert.strictEqual(player.getStance(), 'sprint');

        // Trigger slide with Crouch (KeyC)
        dom.emitWindowKeyDown('KeyC');
        dom.emitWindowKeyUp('KeyC');
        for (let i = 0; i < 6; i++) player.update(0.03, 0.74);

        assert.strictEqual(player.getStance(), 'slide');
        assert.ok(player.getHorizontalSpeed() > sprintSpeed, 'Slide should burst past sprint speed');
        assert.ok(player.camera.position.y < standEyeY - 0.5, 'Eye height must drop cleanly during slide');
        assert.ok(player.camera.position.y > 0.8 && player.camera.position.y < 1.15, 'Slide eye height should be ~0.95m');
        assert.ok(player.getSlideDebugState().colliderHalfHeight < 0.65, 'Collider height must lower during slide');
        assert.ok(Math.abs(player.camera.rotation.z) > 0.03, 'slideCameraTilt=true must tilt camera roll');
        assert.ok(player.camera.fov > standFov + 0.03, 'slideCameraTilt=true must boost FOV');

        // Mid-slide firing, weapon switching, and ADS remain available
        dom.emitMouseDown(0);
        dom.emitMouseUp(0);
        dom.emitWindowKeyDown('Digit2');
        dom.emitMouseDown(2);
        player.update(0.02, 0.74);
        assert.strictEqual(firedMidSlide, 1, 'Firing mid-slide must be allowed');
        assert.strictEqual(selectedSlotMidSlide, 2, 'Weapon/knife switching mid-slide must be allowed');
        assert.strictEqual(player.getIsAds(), true, 'ADS mid-slide must remain allowed');
        assert.strictEqual(player.getStance(), 'slide', 'Mid-slide ADS/slot switch must not abort slide');
        dom.emitMouseUp(2);
      } finally {
        weapons.dispose();
        botManager.dispose();
        player.dispose();
        audio.dispose();
        floor.dispose();
        scene.dispose();
        engine.dispose();
      }
    });
  });

  await t.test('slideEnabled=false suppresses slides and anti-spam cooldown blocks rapid re-slides', () => {
    withDomStub((dom) => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const audio = new AudioEngine();

      const floor = MeshBuilder.CreateBox('b18_floor2', { width: 120, height: 1, depth: 120 }, scene);
      floor.position.set(0, -0.5, 0);
      floor.checkCollisions = true;
      floor.isPickable = true;

      const player = new PlayerController(scene, dom.canvas, audio, {
        onFirePress: () => {},
        onFireRelease: () => {},
        onAdsChange: () => {},
        onReload: () => {},
        onSelectSlot: () => {},
        onScoreboardChange: () => {},
        onPointerLockChange: () => {},
      });

      try {
        player.setOrbitPreview(false);
        player.setCanControl(true);
        player.requestPointerLock();
        player.spawnAt(new Vector3(0, 0.92, 0), 0);
        scene.render();

        dom.emitWindowKeyDown('KeyW');
        dom.emitWindowKeyDown('ShiftLeft');
        for (let i = 0; i < 18; i++) player.update(0.03, 0.74);

        // Disable slide -> sprint + crouch enters normal crouch, never slide
        player.setSlideSettings({ slideEnabled: false });
        dom.emitWindowKeyDown('KeyC');
        dom.emitWindowKeyUp('KeyC');
        player.update(0.03, 0.74);
        assert.notStrictEqual(player.getStance(), 'slide', 'slideEnabled=false must suppress slide');
        assert.strictEqual(player.getStance(), 'crouch', 'Crouch should still toggle normally when slide is disabled');

        // Untoggle crouch, re-enable slide, trigger slide, then disable mid-slide
        dom.emitWindowKeyDown('KeyC');
        dom.emitWindowKeyUp('KeyC');
        for (let i = 0; i < 12; i++) player.update(0.03, 0.74);

        player.setSlideSettings({ slideEnabled: true, slideCameraTilt: false });
        dom.emitWindowKeyDown('KeyC');
        dom.emitWindowKeyUp('KeyC');
        player.update(0.03, 0.74);
        assert.strictEqual(player.getStance(), 'slide');
        assert.ok(Math.abs(player.camera.rotation.z) < 0.005, 'slideCameraTilt=false must suppress roll');

        // Disabling mid-slide ends slide cleanly and starts cooldown
        player.setSlideSettings({ slideEnabled: false });
        player.update(0.02, 0.74);
        assert.notStrictEqual(player.getStance(), 'slide');

        // Re-enabling immediately during 0.6s cooldown still blocks re-slide until cooldown expires
        player.setSlideSettings({ slideEnabled: true });
        for (let i = 0; i < 10; i++) player.update(0.02, 0.74);
        dom.emitWindowKeyDown('KeyC');
        dom.emitWindowKeyUp('KeyC');
        player.update(0.02, 0.74);
        assert.notStrictEqual(player.getStance(), 'slide', 'Cooldown must block re-slide before ~0.6s');
      } finally {
        player.dispose();
        audio.dispose();
        floor.dispose();
        scene.dispose();
        engine.dispose();
      }
    });
  });

  await t.test('slideJumpCancel cancels slide into momentum jump when true and stays sliding when false', () => {
    withDomStub((dom) => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const audio = new AudioEngine();

      const floor = MeshBuilder.CreateBox('b18_floor3', { width: 120, height: 1, depth: 120 }, scene);
      floor.position.set(0, -0.5, 0);
      floor.checkCollisions = true;
      floor.isPickable = true;

      const player = new PlayerController(scene, dom.canvas, audio, {
        onFirePress: () => {},
        onFireRelease: () => {},
        onAdsChange: () => {},
        onReload: () => {},
        onSelectSlot: () => {},
        onScoreboardChange: () => {},
        onPointerLockChange: () => {},
      });

      try {
        player.setOrbitPreview(false);
        player.setCanControl(true);
        player.requestPointerLock();
        player.spawnAt(new Vector3(0, 0.92, 0), 0);
        scene.render();

        dom.emitWindowKeyDown('KeyW');
        dom.emitWindowKeyDown('ShiftLeft');
        for (let i = 0; i < 18; i++) player.update(0.03, 0.74);

        // slideJumpCancel = false keeps sliding on Space
        player.setSlideSettings({ slideEnabled: true, slideJumpCancel: false });
        dom.emitWindowKeyDown('KeyC');
        dom.emitWindowKeyUp('KeyC');
        player.update(0.03, 0.74);
        assert.strictEqual(player.getStance(), 'slide');

        dom.emitWindowKeyDown('Space');
        dom.emitWindowKeyUp('Space');
        player.update(0.03, 0.74);
        assert.strictEqual(player.getStance(), 'slide');
        assert.strictEqual(player.getIsGrounded(), true);

        // Finish slide + cooldown
        for (let i = 0; i < 40; i++) player.update(0.04, 0.74);

        // slideJumpCancel = true launches airborne jump and ends slide
        player.setSlideSettings({ slideJumpCancel: true });
        dom.emitWindowKeyDown('KeyC');
        dom.emitWindowKeyUp('KeyC');
        player.update(0.03, 0.74);
        assert.strictEqual(player.getStance(), 'slide');

        dom.emitWindowKeyDown('Space');
        dom.emitWindowKeyUp('Space');
        player.update(0.03, 0.74);
        assert.notStrictEqual(player.getStance(), 'slide');
        assert.strictEqual(player.getIsGrounded(), false);
        assert.ok(player.getHorizontalSpeed() > 7.5, 'Jump cancel should carry forward sprint/slide momentum');
      } finally {
        player.dispose();
        audio.dispose();
        floor.dispose();
        scene.dispose();
        engine.dispose();
      }
    });
  });

  await t.test('Death, pause, and respawn cleanly reset slide timers, velocity, camera roll, and FOV', () => {
    withDomStub((dom) => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const audio = new AudioEngine();

      const floor = MeshBuilder.CreateBox('b18_floor4', { width: 120, height: 1, depth: 120 }, scene);
      floor.position.set(0, -0.5, 0);
      floor.checkCollisions = true;
      floor.isPickable = true;

      const player = new PlayerController(scene, dom.canvas, audio, {
        onFirePress: () => {},
        onFireRelease: () => {},
        onAdsChange: () => {},
        onReload: () => {},
        onSelectSlot: () => {},
        onScoreboardChange: () => {},
        onPointerLockChange: () => {},
      });

      try {
        player.setOrbitPreview(false);
        player.setCanControl(true);
        player.requestPointerLock();
        player.spawnAt(new Vector3(0, 0.92, 0), 0);
        scene.render();

        const baseFov = player.camera.fov;
        dom.emitWindowKeyDown('KeyW');
        dom.emitWindowKeyDown('ShiftLeft');
        for (let i = 0; i < 18; i++) player.update(0.03, 0.74);

        // Start slide -> kill player mid-slide
        dom.emitWindowKeyDown('KeyC');
        dom.emitWindowKeyUp('KeyC');
        for (let i = 0; i < 4; i++) player.update(0.03, 0.74);
        assert.strictEqual(player.getStance(), 'slide');

        player.setDeadState(true);
        const deadDbg = player.getSlideDebugState();
        assert.strictEqual(deadDbg.isSliding, false);
        assert.strictEqual(deadDbg.slideTimer, 0);
        assert.strictEqual(deadDbg.slideCooldown, 0);
        assert.strictEqual(player.getHorizontalSpeed(), 0);
        assert.ok(Math.abs(player.camera.fov - baseFov) < 1e-5);

        // Respawn -> all slide state & camera roll/FOV reset cleanly
        player.spawnAt(new Vector3(4, 0.92, 4), Math.PI * 0.5);
        const respawnDbg = player.getSlideDebugState();
        assert.strictEqual(respawnDbg.isSliding, false);
        assert.strictEqual(respawnDbg.slideTimer, 0);
        assert.strictEqual(respawnDbg.slideCooldown, 0);
        assert.strictEqual(player.getHorizontalSpeed(), 0);
        assert.strictEqual(player.camera.rotation.z, 0);
        assert.ok(Math.abs(player.camera.fov - baseFov) < 1e-5);

        // Pause mid-slide clears slide timers, velocity, camera roll, and FOV
        dom.emitWindowKeyDown('KeyW');
        dom.emitWindowKeyDown('ShiftLeft');
        for (let i = 0; i < 18; i++) player.update(0.03, 0.74);
        dom.emitWindowKeyDown('KeyC');
        dom.emitWindowKeyUp('KeyC');
        for (let i = 0; i < 4; i++) player.update(0.03, 0.74);
        assert.strictEqual(player.getStance(), 'slide');

        player.setCanControl(false);
        const pausedDbg = player.getSlideDebugState();
        assert.strictEqual(pausedDbg.isSliding, false);
        assert.strictEqual(pausedDbg.slideTimer, 0);
        assert.strictEqual(pausedDbg.slideCooldown, 0);
        assert.strictEqual(player.getHorizontalSpeed(), 0);
        assert.strictEqual(player.camera.rotation.z, 0);
        assert.ok(Math.abs(player.camera.fov - baseFov) < 1e-5);
      } finally {
        player.dispose();
        audio.dispose();
        floor.dispose();
        scene.dispose();
        engine.dispose();
      }
    });
  });

  await t.test('settingsStorage persists, migrates, validates, and resets all 5 Batch 18 slide fields', () => {
    withDomStub(() => {
      assert.strictEqual(DEFAULT_SETTINGS.slideEnabled, true);
      assert.strictEqual(DEFAULT_SETTINGS.slideInputMode, 'tap');
      assert.strictEqual(DEFAULT_SETTINGS.slidePostStance, 'stand');
      assert.strictEqual(DEFAULT_SETTINGS.slideJumpCancel, true);
      assert.strictEqual(DEFAULT_SETTINGS.slideCameraTilt, true);

      // Legacy localStorage entry without Batch 18 keys migrates smoothly
      window.localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          callsign: 'LegacySlide',
          slideTrigger: 'hold',
          postSlideStance: 'crouch',
          jumpCancelsSlide: false,
          slideCameraIntensity: 0,
        })
      );
      const migrated = loadPersistedSettings();
      assert.strictEqual(migrated.slideEnabled, true);
      assert.strictEqual(migrated.slideInputMode, 'hold');
      assert.strictEqual(migrated.slidePostStance, 'crouch');
      assert.strictEqual(migrated.slideJumpCancel, false);
      assert.strictEqual(migrated.slideCameraTilt, false);

      // Invalid types sanitize cleanly to defaults
      const sanitized = validateSettings({
        slideEnabled: 'yes',
        slideInputMode: 'doubletap',
        slidePostStance: 'prone',
        slideJumpCancel: 1,
        slideCameraTilt: 'no',
      });
      assert.strictEqual(sanitized.slideEnabled, true);
      assert.strictEqual(sanitized.slideInputMode, 'tap');
      assert.strictEqual(sanitized.slidePostStance, 'stand');
      assert.strictEqual(sanitized.slideJumpCancel, true);
      assert.strictEqual(sanitized.slideCameraTilt, true);

      // Saving explicit Batch 18 values persists & reloads cleanly
      savePersistedSettings({
        ...DEFAULT_SETTINGS,
        slideEnabled: false,
        slideInputMode: 'hold',
        slidePostStance: 'crouch',
        slideJumpCancel: false,
        slideCameraTilt: false,
      });
      const reloaded = loadPersistedSettings();
      assert.strictEqual(reloaded.slideEnabled, false);
      assert.strictEqual(reloaded.slideInputMode, 'hold');
      assert.strictEqual(reloaded.slidePostStance, 'crouch');
      assert.strictEqual(reloaded.slideJumpCancel, false);
      assert.strictEqual(reloaded.slideCameraTilt, false);
      assert.strictEqual(reloaded.slideCameraIntensity, 0);

      // Reset restores all defaults
      const reset = resetPersistedSettings();
      assert.strictEqual(reset.slideEnabled, true);
      assert.strictEqual(reset.slideInputMode, 'tap');
      assert.strictEqual(reset.slidePostStance, 'stand');
      assert.strictEqual(reset.slideJumpCancel, true);
      assert.strictEqual(reset.slideCameraTilt, true);
      assert.strictEqual(reset.slideCameraIntensity, 1.0);
    });
  });
});
