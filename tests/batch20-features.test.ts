import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MeshBuilder, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { AudioEngine } from '../src/game/AudioEngine.ts';
import { PlayerController } from '../src/game/PlayerController.ts';
import { WeaponSystem } from '../src/game/WeaponSystem.ts';
import { BotManager } from '../src/bots/BotManager.ts';
import { MatchManager } from '../src/match/MatchManager.ts';
import {
  applyGunSelection,
  GUN_LOCKED_WHILE_ALIVE_MESSAGE,
  resolveRespawnLoadout,
} from '../src/game/loadoutRules.ts';
import { GUN_IDS, KNIFE_CHARMS, WEAPONS } from '../src/game/types.ts';
import { INITIAL_HUD } from '../src/match/matchMachine.ts';
import { MatchRoom } from '../server/rooms/MatchRoom.ts';
import { PlayerSchema } from '../server/schema/MatchState.ts';
import { WeaponPreview } from '../src/ui/WeaponPreview.tsx';
import { DeathScreen } from '../src/ui/DeathScreen.tsx';

function withDomStub<T>(fn: (stub: { canvas: HTMLCanvasElement }) => T): T {
  const g = globalThis as Record<string, unknown>;
  const prevWindow = g.window;
  const prevDocument = g.document;
  const prevOffscreenCanvas = g.OffscreenCanvas;
  const noop = () => {};

  const windowListeners = new Map<string, Set<(ev: any) => void>>();
  const documentListeners = new Map<string, Set<(ev: any) => void>>();

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

test('Batch 20: Repeated damage impulses decay camera.rotation.z cleanly back to 0 without permanent lean', () => {
  withDomStub(({ canvas }) => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const audio = new AudioEngine();
    const floor = MeshBuilder.CreateBox('b20_floor', { width: 100, height: 1, depth: 100 }, scene);
    floor.position.set(0, -0.5, 0);
    floor.checkCollisions = true;
    floor.isPickable = true;

    const player = new PlayerController(scene, canvas, audio, {
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
      player.spawnAt(new Vector3(0, 0.95, 0), 0);
      scene.render();

      // Repeated hits from the right flank
      for (let i = 0; i < 6; i++) {
        player.applyDamageImpact(35, new Vector3(12, 1, 0), true);
      }
      const rightPeak = player.getCameraRollDebugState();
      assert.ok(Math.abs(rightPeak.damageFlinchRoll) > 0.005, 'Lateral damage should apply transient roll flinch');
      assert.ok(Math.abs(rightPeak.damageFlinchRoll) <= 0.035 + 1e-6, 'damageFlinchRoll must stay clamped within ±0.035 rad');

      // Step 0.25s of simulation -> roll decays cleanly back to exact 0
      for (let i = 0; i < 13; i++) {
        player.update(0.02, 0.74);
      }
      const settledRight = player.getCameraRollDebugState();
      assert.strictEqual(settledRight.damageFlinchRoll, 0, 'damageFlinchRoll must decay to exact 0 within ~0.25s');
      assert.strictEqual(player.camera.rotation.z, 0, 'camera.rotation.z must return to exact 0 after damage');

      // Repeated hits from left flank, then immediate death + respawn
      for (let i = 0; i < 5; i++) {
        player.applyDamageImpact(40, new Vector3(-12, 1, 0), false);
      }
      assert.ok(Math.abs(player.camera.rotation.z) > 0.005);

      player.setDeadState(true);
      assert.strictEqual(player.camera.rotation.z, 0, 'setDeadState(true) must clear residual roll tilt');
      player.update(0.05, 0.74);
      assert.strictEqual(player.camera.rotation.z, 0, 'Dead camera update must not introduce persistent tilt');

      player.spawnAt(new Vector3(2, 0.95, -5), Math.PI * 0.25);
      assert.strictEqual(player.camera.rotation.z, 0, 'Respawn must reset camera.rotation.z to exact 0');

      // Also verify setCanControl(false) clears mid-flinch tilt cleanly
      player.applyDamageImpact(34, new Vector3(10, 1, 0), false);
      assert.ok(Math.abs(player.camera.rotation.z) > 0.002);
      player.setCanControl(false);
      assert.strictEqual(player.camera.rotation.z, 0, 'setCanControl(false) must clear residual flinch tilt');
    } finally {
      player.dispose();
      audio.dispose();
      floor.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});

test('Batch 20: Death holds respawn until explicit player confirmation and equips selected gun', () => {
  // 1) Colyseus MatchRoom holds human respawn at timer 0 until request_respawn
  const room = new MatchRoom();
  room.onCreate({
    mapId: 'urban',
    mode: 'tdm',
    friendlyFire: false,
    killLimit: 30,
    timeLimit: 300,
    respawnDelay: 2,
    botCount: 1,
  });
  room.state.phase = 'playing';

  const humanClient = {
    sessionId: 'human_1',
    sentMessages: [] as Array<{ type: string; data: any }>,
    send(type: string, data: any) {
      this.sentMessages.push({ type, data });
    },
    enqueueRaw() {},
    raw() {},
  };
  room.clients.push(humanClient as any);

  const human = new PlayerSchema();
  human.id = 'human_1';
  human.name = 'Striker';
  human.team = 'blue';
  human.isBot = false;
  human.isAlive = false;
  human.health = 0;
  human.respawnTimer = 0.5;
  human.weaponId = 'ak47';
  room.state.players.set('human_1', human);

  const bot = new PlayerSchema();
  bot.id = 'bot_red_1';
  bot.name = 'Viper';
  bot.team = 'red';
  bot.isBot = true;
  bot.isAlive = false;
  bot.health = 0;
  bot.respawnTimer = 0.5;
  bot.weaponId = 'smg';
  room.state.players.set('bot_red_1', bot);

  try {
    // Advance simulation by 0.6s
    (room as any).stepSimulation(0.6);

    assert.strictEqual(bot.isAlive, true, 'Bots should still auto-respawn when timer reaches 0');
    assert.strictEqual(human.isAlive, false, 'Human player must NOT auto-respawn before explicit confirmation');
    assert.strictEqual(human.respawnTimer, 0, 'Human respawnTimer should count down to 0 and wait');

    // Player switches gun while dead and clicks Respawn
    (room as any).onMessageEvents.emit('select_loadout', humanClient, { weaponId: 'sniper' });
    assert.strictEqual(human.weaponId, 'sniper');

    (room as any).onMessageEvents.emit('request_respawn', humanClient, { weaponId: 'sniper' });
    assert.strictEqual(human.isAlive, true, 'request_respawn should spawn human player');
    assert.strictEqual(human.weaponId, 'sniper', 'Chosen gun must be equipped on respawn');
    const respawnMsg = humanClient.sentMessages.find((m) => m.type === 'player_respawn');
    assert.ok(respawnMsg, 'Server must send player_respawn event');
  } finally {
    clearInterval((room as any)._simulationInterval);
    room.onDispose();
  }

  // 2) Client WeaponSystem + loadoutRules gun lock while alive vs switch on death + respawn
  withDomStub(({ canvas }) => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const audio = new AudioEngine();
    const match = new MatchManager();
    const bots = new BotManager(scene, match, {
      getPlayerTarget: () => ({
        id: 'player',
        isAlive: false,
        position: Vector3.Zero(),
        eyePosition: new Vector3(0, 1.6, 0),
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
    const weapons = new WeaponSystem(scene, player.camera, player, bots, audio, undefined, undefined, 'ak47');

    try {
      // Alive -> gun stays locked, next gun queued
      const aliveOutcome = applyGunSelection(
        { equippedGunId: 'ak47', queuedGunId: 'ak47', activeSlot: 1 },
        'shotgun',
        'playing',
        true
      );
      assert.strictEqual(aliveOutcome.switchedImmediately, false);
      assert.strictEqual(aliveOutcome.lockMessage, GUN_LOCKED_WHILE_ALIVE_MESSAGE);

      // Dead -> player picks shotgun immediately in death screen, then respawns with it
      const deadOutcome = applyGunSelection(
        { equippedGunId: 'ak47', queuedGunId: 'ak47', activeSlot: 1 },
        'shotgun',
        'playing',
        false
      );
      assert.strictEqual(deadOutcome.switchedImmediately, true);
      weapons.setEquippedGun(deadOutcome.loadout.equippedGunId);
      weapons.applyQueuedGunOnRespawn();
      assert.strictEqual(weapons.getEquippedGunId(), 'shotgun');
      assert.strictEqual(weapons.getActiveConfig().id, 'shotgun');

      const resolved = resolveRespawnLoadout(deadOutcome.loadout);
      assert.strictEqual(resolved.equippedGunId, 'shotgun');
      assert.strictEqual(resolved.activeSlot, 1);
    } finally {
      weapons.dispose();
      player.dispose();
      bots.clearBots();
      audio.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});

test('Batch 20: WeaponPreview renders distinct SVGs for all 5 guns + knife and DeathScreen renders respawn + mode rules', () => {
  const renderedArt = new Set<string>();
  for (const gunId of GUN_IDS) {
    const html = renderToStaticMarkup(React.createElement(WeaponPreview, { weaponId: gunId }));
    assert.ok(html.includes('<svg'), `${gunId} WeaponPreview must render an <svg>`);
    assert.ok(html.includes(`data-weapon-art="${gunId}"`), `${gunId} SVG must have distinct weapon artwork group`);
    renderedArt.add(html);
  }

  const knifeHtml = renderToStaticMarkup(
    React.createElement(WeaponPreview, { weaponId: 'knife', charmId: 'neon_blade' })
  );
  assert.ok(knifeHtml.includes('data-weapon-art="knife"'));
  assert.ok(
    knifeHtml.includes(KNIFE_CHARMS.neon_blade.accentHex),
    'Knife WeaponPreview must render selected charm accent color'
  );
  assert.strictEqual(renderedArt.size, 5, 'All 5 guns must produce distinct visual artwork');

  // DeathScreen in TDM with cooldown > 0 vs ready (0)
  const cooldownHtml = renderToStaticMarkup(
    React.createElement(DeathScreen, {
      hud: {
        ...INITIAL_HUD,
        isAlive: false,
        respawnTimer: 2.1,
        queuedGunId: 'ak47',
        gameMode: 'tdm',
        killerBanner: {
          name: 'Ghost-Red',
          team: 'red',
          weaponName: WEAPONS.sniper.name,
          distanceMeters: 28.4,
          headshot: true,
          killerHpRemaining: 85,
        },
        match: { ...INITIAL_HUD.match, phase: 'playing', mode: 'tdm' },
      },
      onSelectGun: () => {},
      onRespawn: () => {},
    })
  );
  assert.ok(cooldownHtml.includes('RESPAWN IN 2.1s'));
  assert.ok(cooldownHtml.includes('Ghost-Red'));
  assert.ok(cooldownHtml.includes('HEADSHOT'));
  for (const gunId of GUN_IDS) {
    assert.ok(cooldownHtml.includes(`data-weapon-art="${gunId}"`), `DeathScreen must display ${gunId} preview picture`);
  }

  const readyHtml = renderToStaticMarkup(
    React.createElement(DeathScreen, {
      hud: {
        ...INITIAL_HUD,
        isAlive: false,
        respawnTimer: 0,
        queuedGunId: 'smg',
        gameMode: 'ffa',
        match: { ...INITIAL_HUD.match, phase: 'playing', mode: 'ffa' },
      },
      onSelectGun: () => {},
      onRespawn: () => {},
    })
  );
  assert.ok(readyHtml.includes('RESPAWN [SPACE]'));
  assert.ok(readyHtml.includes(WEAPONS.smg.name));

  // DeathScreen in Bomb mode shows next-round loadout selector without Respawn button
  const bombHtml = renderToStaticMarkup(
    React.createElement(DeathScreen, {
      hud: {
        ...INITIAL_HUD,
        isAlive: false,
        respawnTimer: 0,
        queuedGunId: 'shotgun',
        gameMode: 'bomb',
        match: { ...INITIAL_HUD.match, phase: 'playing', mode: 'bomb' },
      },
      onSelectGun: () => {},
      onRespawn: () => {},
    })
  );
  assert.ok(bombHtml.includes('Select Loadout for Next Round'));
  assert.ok(!bombHtml.includes('RESPAWN [SPACE]'));
});
