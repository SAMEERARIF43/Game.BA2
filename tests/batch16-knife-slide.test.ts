import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBuilder, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { AudioEngine } from '../src/game/AudioEngine.ts';
import { PlayerController } from '../src/game/PlayerController.ts';
import { WEAPONS } from '../src/game/types.ts';
import { WeaponSystem } from '../src/game/WeaponSystem.ts';
import { BotManager } from '../src/bots/BotManager.ts';
import { MatchManager } from '../src/match/MatchManager.ts';
import { RemotePlayerRenderer } from '../src/multiplayer/RemotePlayerRenderer.ts';
import {
  DEFAULT_SETTINGS,
  loadPersistedSettings,
  resetPersistedSettings,
  savePersistedSettings,
  SETTINGS_STORAGE_KEY,
  validateSettings,
} from '../src/settings/settingsStorage.ts';
import { MatchRoom } from '../server/rooms/MatchRoom.ts';
import { PlayerSchema } from '../server/schema/MatchState.ts';

interface InteractiveDomStub {
  canvas: HTMLCanvasElement;
  emitWindowKeyDown: (code: string) => void;
  emitWindowKeyUp: (code: string) => void;
  emitMouseDown: (button: number) => void;
  emitMouseUp: (button: number) => void;
}

function withInteractiveDomStubs<T>(fn: (stub: InteractiveDomStub) => T): T {
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

test('Batch 16: K-Bar Knife Overhaul, Tactical Slide Physics & Slide Settings', async (t) => {
  await t.test('K-Bar knife viewmodel includes sculpted forearm/glove, pommel charm mount, equip flip, slash vs stab & clean resets', () => {
    withInteractiveDomStubs((dom) => {
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

      const player = new PlayerController(scene, dom.canvas, audio, {
        onFirePress: () => {},
        onFireRelease: () => {},
        onAdsChange: () => {},
        onReload: () => {},
        onSelectSlot: () => {},
        onScoreboardChange: () => {},
        onPointerLockChange: () => {},
      });

      const weapons = new WeaponSystem(scene, player.camera, player, botManager, audio);

      try {
        player.setOrbitPreview(false);
        player.setCanControl(true);
        player.spawnAt(new Vector3(0, 1, 0), 0);
        weapons.setViewModelVisible(true);
        weapons.setGraphicsQuality('HIGH');

        const knifeInfoBefore = weapons.getKnifeViewmodelState();
        assert.strictEqual(knifeInfoBefore.hasForearmAndHand, true, 'Knife viewmodel must include forearm & gloved grip hand');
        assert.strictEqual(knifeInfoBefore.charmAnchoredToPommel, true, '3D charm must anchor at bottom pommel lug');
        assert.ok(knifeInfoBefore.knifeMeshCount >= 20, 'Knife viewmodel should compose hand, forearm, handle, blade & charm meshes');

        // Equip [2] triggers snappy draw twist/flip animation and disables ADS zoom
        weapons.selectSlot(2);
        const afterEquip = weapons.getKnifeViewmodelState();
        assert.ok(afterEquip.equipTimer > 0.25, 'Selecting knife should trigger equip draw twist animation');

        weapons.update(0.06);

        // Primary fire triggers diagonal slash
        weapons.onFirePress();
        weapons.onFireRelease();
        const afterPrimary = weapons.getKnifeViewmodelState();
        assert.strictEqual(afterPrimary.attackMode, 'slash');
        assert.ok(afterPrimary.slashTimer > 0.2);

        // Wait out cooldown, then secondary fire (RMB) triggers heavy forward stab without ADS zoom
        for (let i = 0; i < 12; i++) {
          weapons.update(0.05);
        }
        const fovBeforeStab = player.camera.fov;
        weapons.onSecondaryFire();
        const afterStab = weapons.getKnifeViewmodelState();
        assert.strictEqual(afterStab.attackMode, 'stab');
        assert.ok(afterStab.slashTimer > 0.28);
        assert.strictEqual(player.getIsAds(), false, 'Holding knife must not enter firearm ADS zoom on RMB');
        assert.ok(player.camera.fov >= fovBeforeStab);

        // Quick melee from slot 1 switches to knife stab and returns cleanly to slot 1
        weapons.selectSlot(1);
        for (let i = 0; i < 12; i++) weapons.update(0.05);
        weapons.triggerQuickMelee();
        assert.strictEqual(weapons.getKnifeViewmodelState().attackMode, 'stab');
        for (let i = 0; i < 10; i++) weapons.update(0.05);
        assert.strictEqual(weapons.getActiveConfig().id, 'ak47', 'Quick melee must return cleanly to primary gun');

        // Cancel & resetForLife clear all transient knife timers cleanly
        weapons.selectSlot(2);
        weapons.onFirePress();
        weapons.cancelTransientActions();
        const afterCancel = weapons.getKnifeViewmodelState();
        assert.strictEqual(afterCancel.equipTimer, 0);
        assert.strictEqual(afterCancel.slashTimer, 0);

        // Weapon damage & stats remain untouched
        assert.strictEqual(WEAPONS.knife.damage, 75);
        assert.strictEqual(WEAPONS.knife.rpm, 140);
      } finally {
        weapons.dispose();
        botManager.dispose();
        player.dispose();
        audio.dispose();
        scene.dispose();
        engine.dispose();
      }
    });
  });

  await t.test('Tactical slide mechanics honor tap/hold trigger, stand/crouch post-slide, jump-cancel toggle, 0.6s cooldown, FOV/roll & ellipsoid height', () => {
    withInteractiveDomStubs((dom) => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const audio = new AudioEngine();

      // Solid arena floor for ground ray & collision
      const floor = MeshBuilder.CreateBox('slide_floor', { width: 120, height: 1, depth: 120 }, scene);
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

        // Step a few frames to settle on floor & build sprint speed
        dom.emitWindowKeyDown('KeyW');
        dom.emitWindowKeyDown('ShiftLeft');
        for (let i = 0; i < 18; i++) {
          player.update(0.03, 0.74);
        }
        assert.strictEqual(player.getStance(), 'sprint');
        const sprintSpeed = player.getHorizontalSpeed();
        assert.ok(sprintSpeed > 7.5);
        const standFov = player.camera.fov;

        // 1. Tap trigger + stand post-slide + camera intensity 1.0
        player.setSlideSettings({
          slideTrigger: 'tap',
          postSlideStance: 'stand',
          jumpCancelsSlide: true,
          slideCameraIntensity: 1.0,
        });
        dom.emitWindowKeyDown('KeyC');
        dom.emitWindowKeyUp('KeyC');
        player.update(0.02, 0.74);

        assert.strictEqual(player.getStance(), 'slide', 'Tap crouch while sprinting must initiate tactical slide');
        assert.ok(player.getHorizontalSpeed() > sprintSpeed, 'Slide must apply forward momentum burst');

        const slideDbg = player.getSlideDebugState();
        assert.ok(slideDbg.colliderHalfHeight < 0.65, 'Collider height must lower during slide');
        assert.ok(
          Math.abs(slideDbg.colliderHalfHeight - slideDbg.colliderEllipsoidOffsetY - 0.9) < 0.01,
          'Ellipsoid bottom must stay aligned with player feet to avoid floor clipping'
        );

        // Advance a few frames to observe camera roll & dynamic slide FOV boost
        for (let i = 0; i < 5; i++) player.update(0.03, 0.74);
        assert.ok(Math.abs(player.camera.rotation.z) > 0.02, 'Slide should apply directional camera roll tilt');
        assert.ok(player.camera.fov > standFov + 0.01, 'Slide should apply dynamic FOV boost');

        // Let slide finish naturally -> auto-stand + ~0.6s cooldown
        for (let i = 0; i < 24; i++) player.update(0.04, 0.74);
        assert.notStrictEqual(player.getStance(), 'slide');
        assert.strictEqual(player.getSlideDebugState().isCrouching, false, 'postSlideStance=stand should auto-stand');

        // Anti-spam cooldown blocks immediate re-slide within 0.6s
        for (let i = 0; i < 4; i++) player.update(0.02, 0.74);
        dom.emitWindowKeyDown('KeyC');
        dom.emitWindowKeyUp('KeyC');
        assert.notStrictEqual(player.getStance(), 'slide', 'Anti-spam cooldown should block immediate re-slide');
        // Untoggle crouch from the blocked press so player resumes sprinting while cooldown clears
        dom.emitWindowKeyDown('KeyC');
        dom.emitWindowKeyUp('KeyC');

        // Wait for cooldown to expire, test 'hold' trigger + early release
        for (let i = 0; i < 20; i++) player.update(0.04, 0.74);
        player.setSlideSettings({
          slideTrigger: 'hold',
          postSlideStance: 'crouch',
          jumpCancelsSlide: false,
          slideCameraIntensity: 0,
        });
        dom.emitWindowKeyDown('KeyC');
        player.update(0.03, 0.74);
        assert.strictEqual(player.getStance(), 'slide');
        assert.ok(Math.abs(player.camera.rotation.z) < 0.005, 'Camera intensity 0 should suppress slide tilt');

        // Jump should NOT cancel slide when jumpCancelsSlide is false
        dom.emitWindowKeyDown('Space');
        dom.emitWindowKeyUp('Space');
        player.update(0.03, 0.74);
        assert.strictEqual(player.getStance(), 'slide', 'Space must not cancel slide when jumpCancelsSlide=false');

        // Releasing Crouch in 'hold' mode ends slide early
        dom.emitWindowKeyUp('KeyC');
        player.update(0.03, 0.74);
        assert.notStrictEqual(player.getStance(), 'slide', 'Releasing crouch in hold mode must end slide early');

        // Wait cooldown, test natural slide end with postSlideStance='crouch' + jumpCancelsSlide=true
        for (let i = 0; i < 20; i++) player.update(0.04, 0.74);
        player.setSlideSettings({ slideTrigger: 'tap', postSlideStance: 'crouch', jumpCancelsSlide: true });
        dom.emitWindowKeyDown('KeyC');
        dom.emitWindowKeyUp('KeyC');
        for (let i = 0; i < 26; i++) player.update(0.04, 0.74);
        assert.strictEqual(player.getStance(), 'crouch', 'postSlideStance=crouch should stay crouched after natural slide');
        assert.ok(player.getSlideDebugState().colliderHalfHeight < 0.65);

        // Stand back up from post-slide crouch and rebuild sprint before testing jump cancel mid-slide
        dom.emitWindowKeyDown('KeyC');
        dom.emitWindowKeyUp('KeyC');
        for (let i = 0; i < 20; i++) player.update(0.04, 0.74);
        dom.emitWindowKeyDown('KeyC');
        dom.emitWindowKeyUp('KeyC');
        player.update(0.03, 0.74);
        assert.strictEqual(player.getStance(), 'slide');
        dom.emitWindowKeyDown('Space');
        dom.emitWindowKeyUp('Space');
        player.update(0.03, 0.74);
        assert.notStrictEqual(player.getStance(), 'slide', 'Space must cancel slide when jumpCancelsSlide=true');
        assert.strictEqual(player.getIsGrounded(), false, 'Jump-canceling slide should launch player airborne');
      } finally {
        player.dispose();
        audio.dispose();
        floor.dispose();
        scene.dispose();
        engine.dispose();
      }
    });
  });

  await t.test('Slide Settings persist, validate legacy/corrupt values, and reset cleanly', () => {
    withInteractiveDomStubs(() => {
      assert.strictEqual(DEFAULT_SETTINGS.slideTrigger, 'tap');
      assert.strictEqual(DEFAULT_SETTINGS.postSlideStance, 'stand');
      assert.strictEqual(DEFAULT_SETTINGS.jumpCancelsSlide, true);
      assert.strictEqual(DEFAULT_SETTINGS.slideCameraIntensity, 1.0);

      const legacy = validateSettings({ callsign: 'OldProfile', sensitivity: 0.003 });
      assert.strictEqual(legacy.slideTrigger, 'tap');
      assert.strictEqual(legacy.postSlideStance, 'stand');
      assert.strictEqual(legacy.jumpCancelsSlide, true);
      assert.strictEqual(legacy.slideCameraIntensity, 1.0);

      const bad = validateSettings({
        slideTrigger: 'doubletap',
        postSlideStance: 'prone',
        jumpCancelsSlide: 'yes',
        slideCameraIntensity: 9,
      });
      assert.strictEqual(bad.slideTrigger, 'tap');
      assert.strictEqual(bad.postSlideStance, 'stand');
      assert.strictEqual(bad.jumpCancelsSlide, true);
      assert.strictEqual(bad.slideCameraIntensity, 1.0);

      savePersistedSettings({
        ...DEFAULT_SETTINGS,
        slideTrigger: 'hold',
        postSlideStance: 'crouch',
        jumpCancelsSlide: false,
        slideCameraIntensity: 0.45,
      });
      assert.ok(window.localStorage.getItem(SETTINGS_STORAGE_KEY));

      const reloaded = loadPersistedSettings();
      assert.strictEqual(reloaded.slideTrigger, 'hold');
      assert.strictEqual(reloaded.postSlideStance, 'crouch');
      assert.strictEqual(reloaded.jumpCancelsSlide, false);
      assert.strictEqual(reloaded.slideCameraIntensity, 0.45);

      const reset = resetPersistedSettings();
      assert.strictEqual(reset.slideTrigger, 'tap');
      assert.strictEqual(reset.postSlideStance, 'stand');
      assert.strictEqual(reset.jumpCancelsSlide, true);
      assert.strictEqual(reset.slideCameraIntensity, 1.0);
    });
  });

  await t.test('MatchRoom & RemotePlayerRenderer synchronize tactical slide and crouch posture over Colyseus', () => {
    withInteractiveDomStubs(() => {
      const room = new MatchRoom();
      room.onCreate({ mapId: 'urban', botCount: 0, killLimit: 25, timeLimit: 300 });
      room.state.phase = 'playing';

      const client = { sessionId: 'p1', sentMessages: [], send() {}, enqueueRaw() {}, raw() {} };
      const p1 = new PlayerSchema();
      p1.id = 'p1';
      p1.name = 'Slider';
      p1.team = 'blue';
      p1.isBot = false;
      p1.isAlive = true;
      p1.health = 100;
      p1.weaponId = 'ak47';
      p1.stance = 'stand';
      room.state.players.set('p1', p1);

      const engine = new NullEngine();
      const scene = new Scene(engine);
      const remote = new RemotePlayerRenderer(scene);

      try {
        (room as any).onMessageEvents.emit('player_move', client, {
          x: 2,
          y: 0,
          z: 4,
          rotY: 0,
          pitch: 0,
          weaponId: 'ak47',
          stance: 'slide',
        });
        assert.strictEqual(p1.stance, 'slide');

        // Invalid stance strings are rejected
        (room as any).onMessageEvents.emit('player_move', client, {
          x: 2,
          y: 0,
          z: 4,
          rotY: 0,
          pitch: 0,
          weaponId: 'ak47',
          stance: 'fly_hack',
        });
        assert.strictEqual(p1.stance, 'slide');

        remote.syncPlayers(
          [
            {
              id: 'p1',
              name: 'Slider',
              team: 'blue',
              isBot: false,
              isHost: true,
              ready: true,
              isAlive: true,
              respawnTimer: 0,
              x: 2,
              y: 0,
              z: 4,
              rotY: 0,
              pitch: 0,
              characterId: 'assault',
              weaponId: 'ak47',
              stance: 'slide',
              health: 100,
              kills: 0,
              deaths: 0,
            },
          ],
          'local_viewer'
        );
        for (let i = 0; i < 6; i++) remote.update(0.04);

        const avatarRoot = scene.transformNodes.find((n) => n.name === 'op_pivot_rem_p1');
        assert.ok(avatarRoot && avatarRoot.position.y < -0.25, 'Remote slide posture must lower avatar pivot cleanly');
      } finally {
        remote.dispose();
        scene.dispose();
        engine.dispose();
        clearInterval((room as any)._simulationInterval);
        room.onDispose();
      }
    });
  });
});
