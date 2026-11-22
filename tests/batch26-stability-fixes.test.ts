import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBuilder, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { BotManager } from '../src/bots/BotManager.ts';
import { AudioEngine } from '../src/game/AudioEngine.ts';
import {
  applyCharacterSelection,
  LoadoutSelectionState,
} from '../src/game/loadoutRules.ts';
import { PlayerController } from '../src/game/PlayerController.ts';
import { CHARACTERS, CharacterId, WEAPONS } from '../src/game/types.ts';
import { WeaponSystem } from '../src/game/WeaponSystem.ts';
import { urbanMap } from '../src/maps/urbanMap.ts';
import { MatchManager } from '../src/match/MatchManager.ts';
import {
  createInitialMatchState,
  matchReducer,
  RankInfo,
} from '../src/match/matchMachine.ts';
import { ChatMessage } from '../src/multiplayer/chat.ts';
import { NetworkManager } from '../src/multiplayer/NetworkManager.ts';
import { LobbyRoomSnapshot } from '../src/multiplayer/types.ts';
import {
  DEFAULT_SETTINGS,
  validateSettings,
} from '../src/settings/settingsStorage.ts';

interface DomStubHarness {
  canvas: HTMLCanvasElement;
  emitWindowWheel: (deltaY: number) => void;
  setPointerLocked: (locked: boolean) => void;
}

function withDomStubs<T>(fn: (dom: DomStubHarness) => T): T {
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
      for (const cb of documentListeners.get('pointerlockchange') ?? []) cb({});
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

  fakeDocument = {
    pointerLockElement: null as any,
    hidden: false,
    exitPointerLock: () => {
      fakeDocument.pointerLockElement = null;
      for (const cb of documentListeners.get('pointerlockchange') ?? []) cb({});
    },
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
    createElement: () => fakeCanvas,
  };

  g.window = fakeWindow;
  g.document = fakeDocument;
  g.OffscreenCanvas = FakeOffscreenCanvas;

  try {
    return fn({
      canvas: fakeCanvas,
      emitWindowWheel: (deltaY: number) => {
        const ev = { deltaY, preventDefault: noop };
        for (const cb of windowListeners.get('wheel') ?? []) cb(ev);
      },
      setPointerLocked: (locked: boolean) => {
        fakeDocument.pointerLockElement = locked ? fakeCanvas : null;
        for (const cb of documentListeners.get('pointerlockchange') ?? []) cb({});
      },
    });
  } finally {
    g.window = prevWindow;
    g.document = prevDocument;
    g.OffscreenCanvas = prevOffscreenCanvas;
  }
}

const TEST_RANK: RankInfo = {
  xp: 0,
  level: 1,
  title: 'Private',
  progressPct: 0,
};

function makeSnapshot(roomCode = 'TST123'): LobbyRoomSnapshot {
  return {
    roomCode,
    roomName: 'Batch 26 Room',
    mapId: 'urban',
    mode: 'tdm',
    phase: 'lobby',
    killLimit: 30,
    timeLimit: 300,
    timeRemaining: 300,
    respawnDelay: 3,
    friendlyFire: false,
    botCount: 2,
    hasPassword: false,
    hostId: 'p1',
    blueScore: 0,
    redScore: 0,
    roundNumber: 1,
    roundsToWin: 1,
    winner: '',
    bombState: null,
    players: [],
    localPlayerId: 'p1',
  };
}

test('Batch 26: Connection epoch ordering & superseded NetworkManager attempts', async () => {
  // 1. matchReducer rejects stale epoch actions across cancel, notice, and disconnect
  let state = createInitialMatchState({
    initialRoute: { view: 'custom' },
    settings: DEFAULT_SETTINGS,
    rank: TEST_RANK,
  });

  state = matchReducer(state, { type: 'MP_CONNECT_START' });
  const firstEpoch = state.connectionEpoch;
  assert.strictEqual(state.status, 'mp_connecting');

  state = matchReducer(state, { type: 'MP_CONNECT_CANCEL', epoch: firstEpoch });
  assert.strictEqual(state.status, 'custom_menu');
  assert.ok(state.connectionEpoch > firstEpoch);

  // Stale success/cancel/disconnect from firstEpoch cannot alter a newer connection attempt
  state = matchReducer(state, { type: 'MP_CONNECT_START' });
  const secondEpoch = state.connectionEpoch;
  state = matchReducer(state, { type: 'MP_CONNECT_CANCEL', epoch: firstEpoch });
  assert.strictEqual(state.status, 'mp_connecting');
  assert.strictEqual(state.connectionEpoch, secondEpoch);

  state = matchReducer(state, { type: 'MP_DISCONNECTED', reason: 'Old socket closed', epoch: firstEpoch });
  assert.strictEqual(state.status, 'mp_connecting');
  assert.strictEqual(state.disconnectError, null);

  state = matchReducer(state, {
    type: 'MP_CONNECT_SUCCESS',
    epoch: secondEpoch,
    snapshot: makeSnapshot('NEW999'),
  });
  assert.strictEqual(state.status, 'mp_lobby');

  state = matchReducer(state, {
    type: 'MP_SYSTEM_NOTICE',
    message: 'Stale room notice',
    epoch: firstEpoch,
  });
  assert.strictEqual(state.systemNotice, null);

  state = matchReducer(state, {
    type: 'MP_SYSTEM_NOTICE',
    message: 'Active room notice',
    epoch: secondEpoch,
  });
  assert.strictEqual(state.systemNotice, 'Active room notice');

  // 2. NetworkManager cancels superseded async connect and leaveRoomIfEpoch ignores newer epochs
  const stateUpdates: Array<{ code: string; epoch?: number }> = [];
  const network = new NetworkManager({
    onStateUpdate: (snapshot, epoch) => {
      stateUpdates.push({ code: snapshot.roomCode, epoch });
    },
    onRemoteFire: () => {},
    onHitConfirm: () => {},
    onPlayerDamaged: () => {},
    onPlayerRespawn: () => {},
    onKillFeed: () => {},
    onSystemNotice: () => {},
    onDisconnected: () => {},
  });

  let resolveFirst!: (room: any) => void;
  let firstRoomLeft = false;
  let secondRoomLeft = false;

  const makeMockRoom = (roomId: string, onLeaveMark: () => void) => ({
    roomId,
    sessionId: 'p1',
    state: {
      roomCode: roomId,
      roomName: 'Mock',
      mapId: 'urban',
      mode: 'tdm',
      phase: 'lobby',
      players: new Map(),
    },
    onStateChange: () => {},
    onMessage: () => {},
    onLeave: () => {},
    send: () => {},
    leave: async () => {
      onLeaveMark();
    },
  });

  let callCount = 0;
  (network as unknown as { client: { create: () => Promise<any> } }).client = {
    create: () => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve(makeMockRoom('ROOM02', () => {
        secondRoomLeft = true;
      }));
    },
  };

  const firstAttempt = network.createPrivateMatch(
    {
      roomName: 'First',
      playerName: 'Op1',
      mapId: 'urban',
      mode: 'tdm',
      killLimit: 30,
      timeLimit: 300,
      friendlyFire: false,
      botCount: 2,
    },
    10
  );

  // Immediately supersede with second attempt on epoch 11
  const secondSnapshot = await network.createPrivateMatch(
    {
      roomName: 'Second',
      playerName: 'Op1',
      mapId: 'urban',
      mode: 'tdm',
      killLimit: 30,
      timeLimit: 300,
      friendlyFire: false,
      botCount: 2,
    },
    11
  );
  assert.strictEqual(secondSnapshot.roomCode, 'ROOM02');
  assert.strictEqual(network.getRoomEpoch(), 11);

  // Now resolve the stale first attempt
  resolveFirst(
    makeMockRoom('ROOM01', () => {
      firstRoomLeft = true;
    })
  );
  await assert.rejects(firstAttempt, /superseded|cancelled/i);
  assert.strictEqual(firstRoomLeft, true, 'Superseded room must be closed immediately');
  assert.strictEqual(secondRoomLeft, false, 'Active newer room must stay connected');
  assert.strictEqual(network.getRoomEpoch(), 11);

  // leaveRoomIfEpoch for stale epoch must NOT touch active epoch 11 room
  await network.leaveRoomIfEpoch(10);
  assert.strictEqual(network.isConnected(), true);
  assert.strictEqual(secondRoomLeft, false);

  await network.leaveRoomIfEpoch(11);
  assert.strictEqual(network.isConnected(), false);
  assert.strictEqual(secondRoomLeft, true);
});

test('Batch 26: NetworkManager chat message deduplication by id', () => {
  const received: ChatMessage[] = [];
  const updates: number[] = [];
  const network = new NetworkManager({
    onStateUpdate: () => {},
    onRemoteFire: () => {},
    onHitConfirm: () => {},
    onPlayerDamaged: () => {},
    onPlayerRespawn: () => {},
    onKillFeed: () => {},
    onChatMessage: (msg) => received.push(msg),
    onChatUpdate: (msgs) => updates.push(msgs.length),
    onSystemNotice: () => {},
    onDisconnected: () => {},
  });

  const msg1: ChatMessage = {
    id: 'srv_msg_42',
    senderId: 'p2',
    senderName: 'Alpha',
    senderTeam: 'blue',
    channel: 'all',
    text: 'Planting A',
    timestamp: 1000,
  };

  assert.strictEqual(network.appendChatMessage(msg1), true);
  assert.strictEqual(network.appendChatMessage({ ...msg1 }), false);
  assert.strictEqual(network.getChatMessages().length, 1);
  assert.strictEqual(received.length, 1);

  network.clearChatMessages();
  assert.strictEqual(network.getChatMessages().length, 0);
  // After clear (e.g. room reconnect), id can be appended cleanly again
  assert.strictEqual(network.appendChatMessage(msg1), true);
  assert.strictEqual(network.getChatMessages().length, 1);
});

test('Batch 26: WeaponSystem slot ammo consistency, cycleSlot, and pivot disposal', () => {
  withDomStubs((dom) => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const matchManager = new MatchManager();
    matchManager.initMatch({
      mapId: 'urban',
      mode: 'tdm',
      roomName: 'Batch26',
      killLimit: 30,
      timeLimit: 300,
      botCount: 2,
    });
    const audio = new AudioEngine();
    const player = new PlayerController(scene, dom.canvas, audio, {
      onFirePress: () => {},
      onFireRelease: () => {},
      onAdsChange: () => {},
      onReload: () => {},
      onSelectSlot: () => {},
      onScoreboardChange: () => {},
      onPointerLockChange: () => {},
    });
    const bots = new BotManager(scene, matchManager, {
      getPlayerTarget: () => ({
        id: 'player',
        isAlive: true,
        position: Vector3.Zero(),
        eyePosition: new Vector3(0, 1.5, 0),
        collider: player.collider,
      }),
      onPlayerDamaged: () => {},
    });

    const weapons = new WeaponSystem(scene, player.camera, player, bots, audio, undefined, undefined, 'ak47');

    try {
      // Simulate firing rounds cleanly by editing slot ammo via runtime state + switching via selectWeapon
      const internal = weapons as unknown as {
        slots: Record<string, { id: string; ammoInMag: number; reserveAmmo: number }>;
        knifeWristPivot: any;
        charmPivot: any;
        gunHandMeshes: any[];
      };

      internal.slots.ak47.ammoInMag = 17;
      weapons.selectWeapon('smg', true);
      assert.strictEqual(weapons.getEquippedGunId(), 'smg');
      assert.strictEqual(weapons.getWeaponSlots()[0].id, 'smg');
      assert.strictEqual(weapons.getWeaponSlots()[0].ammoInMag, WEAPONS.smg.magSize);

      weapons.selectWeapon('knife', true);
      assert.strictEqual(weapons.getActiveSlot(), 2);
      assert.strictEqual(weapons.getEquippedGunId(), 'smg');

      weapons.selectWeapon('ak47', true);
      assert.strictEqual(weapons.getEquippedGunId(), 'ak47');
      assert.strictEqual(weapons.getWeaponSlots()[0].id, 'ak47');
      assert.strictEqual(weapons.getWeaponSlots()[0].ammoInMag, 17);

      weapons.cycleSlot(1);
      assert.strictEqual(weapons.getActiveSlot(), 2);
      weapons.cycleSlot(-1);
      assert.strictEqual(weapons.getActiveSlot(), 1);

      const wrist = internal.knifeWristPivot;
      const charm = internal.charmPivot;
      assert.ok(wrist);
      assert.ok(charm);

      weapons.dispose();
      assert.strictEqual(internal.knifeWristPivot, null);
      assert.strictEqual(internal.charmPivot, null);
      assert.strictEqual(internal.gunHandMeshes.length, 0);
      assert.strictEqual(wrist.isDisposed(), true);
      assert.strictEqual(charm.isDisposed(), true);
    } finally {
      bots.dispose();
      player.dispose();
      audio.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});

test('Batch 26: applyCharacterSelection guards missing and already-equipped signature gun', () => {
  const loadout: LoadoutSelectionState = {
    equippedGunId: 'smg',
    queuedGunId: 'smg',
    activeSlot: 1,
  };

  // Already has vanguard's signature gun equipped and queued -> no redundant lock/queue outcome
  const sameGunOutcome = applyCharacterSelection(loadout, 'vanguard', true, 'playing', true);
  assert.strictEqual(sameGunOutcome.characterId, 'vanguard');
  assert.strictEqual(sameGunOutcome.signatureGunId, 'smg');
  assert.strictEqual(sameGunOutcome.gunOutcome, null);

  // Missing signature gun entry in CHARACTERS -> returns null cleanly instead of forcing fallback gun
  const originalChar = CHARACTERS.assault as { signatureGunId?: unknown };
  const prevSig = originalChar.signatureGunId;
  originalChar.signatureGunId = undefined;
  try {
    const missingSigOutcome = applyCharacterSelection(loadout, 'assault' as CharacterId, true, 'menu', true);
    assert.strictEqual(missingSigOutcome.characterId, 'assault');
    assert.strictEqual(missingSigOutcome.signatureGunId, null);
    assert.strictEqual(missingSigOutcome.gunOutcome, null);
  } finally {
    originalChar.signatureGunId = prevSig;
  }
});

test('Batch 26: PlayerController rapid-fire addFovKick and intuitive onWheel direction', () => {
  withDomStubs((dom) => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const audio = new AudioEngine();
    const wheelDeltas: Array<1 | -1> = [];

    const player = new PlayerController(scene, dom.canvas, audio, {
      onFirePress: () => {},
      onFireRelease: () => {},
      onAdsChange: () => {},
      onReload: () => {},
      onSelectSlot: () => {},
      onCycleSlot: (delta) => wheelDeltas.push(delta),
      onScoreboardChange: () => {},
      onPointerLockChange: () => {},
    });

    try {
      dom.setPointerLocked(true);
      player.setOrbitPreview(false);
      player.setCanControl(true);

      // Immediate first wheel scroll up (-deltaY -> +1) and later scroll down (+deltaY -> -1)
      dom.emitWindowWheel(-120);
      assert.deepStrictEqual(wheelDeltas, [1]);

      // Advance lastWheelTime backwards via internal check or simulate rapid wait > 120ms
      (player as unknown as { lastWheelTime: number }).lastWheelTime = performance.now() - 200;
      dom.emitWindowWheel(120);
      assert.deepStrictEqual(wheelDeltas, [1, -1]);

      // Rapid-fire addFovKick keeps climbing toward cap and updates camera.fov immediately
      const baseFov = player.camera.fov;
      player.addFovKick(0.015);
      const afterShot1 = player.camera.fov;
      player.addFovKick(0.015);
      const afterShot2 = player.camera.fov;

      assert.ok(afterShot1 > baseFov);
      assert.ok(afterShot2 > afterShot1);
      assert.ok(afterShot2 <= baseFov + 0.0551);

      player.update(0.05, 0.74);
      assert.ok(player.camera.fov < afterShot2, 'FOV kick should decay cleanly over update ticks');
    } finally {
      player.dispose();
      audio.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});

test('Batch 26: BotManager ray cleanup and near-zero distance shot guard', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const ground = MeshBuilder.CreateBox('floor', { width: 80, height: 1, depth: 80 }, scene);
  ground.position.set(0, -0.5, 0);
  ground.checkCollisions = true;

  const matchManager = new MatchManager();
  matchManager.initMatch({
    mapId: 'urban',
    mode: 'tdm',
    roomName: 'RayTest',
    killLimit: 30,
    timeLimit: 300,
    botsPerTeam: 1,
  });
  matchManager.setPhase('playing');

  const bots = new BotManager(scene, matchManager, {
    getPlayerTarget: () => ({
      id: 'player',
      isAlive: true,
      position: Vector3.Zero(),
      eyePosition: new Vector3(0, 1.5, 0),
      collider: ground,
    }),
    onPlayerDamaged: () => {},
  });

  try {
    bots.spawnBotsForMatch(
      urbanMap,
      matchManager.getBlueBotParticipants(),
      matchManager.getRedBotParticipants()
    );

    const internal = bots as unknown as {
      bots: Array<{
        root: { position: Vector3 };
        yaw: number;
        shotDirectionScratch: Vector3;
        shotRay: { length: number; direction: Vector3 };
      }>;
      botRays: Array<{ length: number }>;
      fireBotShot: (bot: any, targetPos: Vector3) => void;
    };

    assert.ok(internal.botRays.length >= 4);
    const bot = internal.bots[0];
    // Fire with target practically identical to eye origin (dist <= 1e-4)
    const zeroTarget = new Vector3(
      bot.root.position.x,
      bot.root.position.y + 1.48,
      bot.root.position.z
    );
    internal.fireBotShot(bot, zeroTarget);
    assert.ok(Number.isFinite(bot.shotRay.direction.x));
    assert.ok(Number.isFinite(bot.shotRay.direction.y));
    assert.ok(Number.isFinite(bot.shotRay.direction.z));
    assert.ok(Math.abs(bot.shotRay.direction.length() - 1) < 1e-3);

    const oldRay = internal.botRays[0];
    bots.clearBots();
    assert.strictEqual(internal.botRays.length, 0);
    assert.strictEqual(oldRay.length, 0);
  } finally {
    bots.dispose();
    ground.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test('Batch 26: settingsStorage migration preserves legacy overrides and user changes against runtime fallbacks', () => {
  // 1. Legacy override against DEFAULT_SETTINGS still migrates cleanly
  const legacyValidated = validateSettings({
    ...DEFAULT_SETTINGS,
    slideTrigger: 'hold',
    postSlideStance: 'crouch',
    jumpCancelsSlide: false,
    slideCameraIntensity: 0.45,
  });
  assert.strictEqual(legacyValidated.slideInputMode, 'hold');
  assert.strictEqual(legacyValidated.slideTrigger, 'hold');
  assert.strictEqual(legacyValidated.slidePostStance, 'crouch');
  assert.strictEqual(legacyValidated.postSlideStance, 'crouch');
  assert.strictEqual(legacyValidated.slideJumpCancel, false);
  assert.strictEqual(legacyValidated.jumpCancelsSlide, false);
  assert.strictEqual(legacyValidated.slideCameraTilt, true);
  assert.strictEqual(legacyValidated.slideCameraIntensity, 0.45);

  // 2. Non-default runtime fallback MUST NOT cause current user values with default legacy keys to revert
  const runtimeFallback = {
    ...DEFAULT_SETTINGS,
    slideInputMode: 'hold' as const,
    slideTrigger: 'hold' as const,
    slidePostStance: 'crouch' as const,
    postSlideStance: 'crouch' as const,
    slideJumpCancel: false,
    jumpCancelsSlide: false,
    slideCameraTilt: false,
    slideCameraIntensity: 0,
  };

  const withDefaultLegacyUntouched = validateSettings(
    {
      ...DEFAULT_SETTINGS,
      slideInputMode: 'hold',
      slidePostStance: 'crouch',
      slideJumpCancel: false,
      slideCameraTilt: false,
    },
    runtimeFallback
  );
  assert.strictEqual(withDefaultLegacyUntouched.slideInputMode, 'hold');
  assert.strictEqual(withDefaultLegacyUntouched.slidePostStance, 'crouch');
  assert.strictEqual(withDefaultLegacyUntouched.slideJumpCancel, false);
  assert.strictEqual(withDefaultLegacyUntouched.slideCameraTilt, false);
  assert.strictEqual(withDefaultLegacyUntouched.slideCameraIntensity, 0);

  // 3. Reverting modern key back to default against customized runtimeFallback must stick
  const revertedModern = validateSettings(
    {
      ...runtimeFallback,
      slideInputMode: 'tap',
      slidePostStance: 'stand',
      slideJumpCancel: true,
      slideCameraTilt: true,
    },
    runtimeFallback
  );
  assert.strictEqual(revertedModern.slideInputMode, 'tap');
  assert.strictEqual(revertedModern.slideTrigger, 'tap');
  assert.strictEqual(revertedModern.slidePostStance, 'stand');
  assert.strictEqual(revertedModern.postSlideStance, 'stand');
  assert.strictEqual(revertedModern.slideJumpCancel, true);
  assert.strictEqual(revertedModern.jumpCancelsSlide, true);
  assert.strictEqual(revertedModern.slideCameraTilt, true);
  assert.strictEqual(revertedModern.slideCameraIntensity, 1.0);
});
