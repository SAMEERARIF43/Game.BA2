import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { AudioEngine } from '../src/game/AudioEngine.ts';
import { PlayerController } from '../src/game/PlayerController.ts';
import {
  ARENA_HALF_EXTENT,
  MINIMAP_LAYOUTS,
  worldToMinimapPercent,
  yawRadToCompassDeg,
} from '../src/game/minimap.ts';
import { MatchManager } from '../src/match/MatchManager.ts';
import {
  CHAT_HISTORY_LIMIT,
  CHAT_MAX_LENGTH,
  ChatMessage,
  sanitizeChatText,
  validateChatPayload,
} from '../src/multiplayer/chat.ts';
import { NetworkManager } from '../src/multiplayer/NetworkManager.ts';
import { MatchRoom } from '../server/rooms/MatchRoom.ts';
import { PlayerSchema } from '../server/schema/MatchState.ts';

interface MockClient {
  sessionId: string;
  sentMessages: Array<{ type: string; data: any }>;
  send(type: string, data: any): void;
  enqueueRaw(data: any): void;
  raw(data: any): void;
  leave(): void;
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
    leave() {},
  };
}

function withInteractiveDomStubs<T>(
  fn: (stub: {
    canvas: HTMLCanvasElement;
    emitWindowKeyDown: (code: string) => void;
    emitWindowKeyUp: (code: string) => void;
    emitMouseDown: (button: number) => void;
    emitMouseUp: (button: number) => void;
  }) => T
): T {
  const g = globalThis as Record<string, unknown>;
  const prevWindow = g.window;
  const prevDocument = g.document;
  const noop = () => {};

  const windowListeners = new Map<string, Set<(ev: any) => void>>();
  const documentListeners = new Map<string, Set<(ev: any) => void>>();

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
    getContext: () => null,
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
    createElement: () => fakeCanvas,
  };

  const emit = (type: string, eventObj: any) => {
    const cbs = windowListeners.get(type);
    if (!cbs) return;
    for (const cb of cbs) cb(eventObj);
  };

  g.window = fakeWindow;
  g.document = fakeDocument;

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
  }
}

test('Batch 17: Custom Match Chat Validation, Server Routing, Offline Fallback, Input Lock Suppression & 2D Minimap', async (t) => {
  await t.test('shared chat sanitizer strips control chars, trims whitespace, clamps 140 chars & rejects empty', () => {
    assert.strictEqual(sanitizeChatText('   '), '');
    assert.strictEqual(sanitizeChatText('\u0000\u0007\n\t   \u001f'), '');
    assert.strictEqual(sanitizeChatText('  Hold\nmid\u0007point!  '), 'Hold midpoint!');
    const overlong = 'A'.repeat(200);
    const sanitized = sanitizeChatText(overlong);
    assert.strictEqual(sanitized.length, CHAT_MAX_LENGTH);

    assert.strictEqual(validateChatPayload(null), null);
    assert.strictEqual(validateChatPayload({ text: '   ', channel: 'all' }), null);
    assert.strictEqual(validateChatPayload({ text: 'Hi', channel: 'whisper' }), null);
    assert.deepStrictEqual(validateChatPayload({ text: '  Push B  ', channel: 'team' }), {
      text: 'Push B',
      channel: 'team',
    });
  });

  await t.test('MatchRoom chat handler validates shape, clamps length, rate-limits spam, attaches authoritative sender metadata & isolates team messages', () => {
    const room = new MatchRoom();
    room.onCreate({ mapId: 'urban', botCount: 0, killLimit: 25, timeLimit: 300 });
    room.state.phase = 'lobby';

    const blueA = createMockClient('blue_a');
    const blueB = createMockClient('blue_b');
    const redA = createMockClient('red_a');
    room.clients.push(blueA as any, blueB as any, redA as any);

    const addHuman = (id: string, name: string, team: 'blue' | 'red') => {
      const p = new PlayerSchema();
      p.id = id;
      p.name = name;
      p.team = team;
      p.isBot = false;
      p.isAlive = true;
      p.health = 100;
      p.weaponId = 'ak47';
      p.stance = 'stand';
      room.state.players.set(id, p);
      return p;
    };

    addHuman('blue_a', 'AlphaLead', 'blue');
    addHuman('blue_b', 'BravoTwo', 'blue');
    addHuman('red_a', 'CrimsonOne', 'red');

    try {
      // Invalid & empty messages are ignored
      (room as any).onMessageEvents.emit('chat', blueA, null);
      (room as any).onMessageEvents.emit('chat', blueA, { text: '   ', channel: 'all' });
      (room as any).onMessageEvents.emit('chat', blueA, { text: 'Hello', channel: 'global' });
      assert.strictEqual(blueA.sentMessages.filter((m) => m.type === 'chat').length, 0);

      // Overlong message with forged metadata is clamped to 140 chars & stamped authoritatively
      const longText = 'X'.repeat(180);
      (room as any).onMessageEvents.emit('chat', blueA, {
        text: `  ${longText}  `,
        channel: 'all',
        senderId: 'forged_id',
        senderName: 'Admin',
        senderTeam: 'red',
      });

      const blueAChats = blueA.sentMessages.filter((m) => m.type === 'chat');
      const blueBChats = blueB.sentMessages.filter((m) => m.type === 'chat');
      const redAChats = redA.sentMessages.filter((m) => m.type === 'chat');
      assert.strictEqual(blueAChats.length, 1);
      assert.strictEqual(blueBChats.length, 1);
      assert.strictEqual(redAChats.length, 1, '"all" channel must reach every client in room');

      const deliveredAll: ChatMessage = redAChats[0].data;
      assert.strictEqual(deliveredAll.senderId, 'blue_a');
      assert.strictEqual(deliveredAll.senderName, 'AlphaLead');
      assert.strictEqual(deliveredAll.senderTeam, 'blue');
      assert.strictEqual(deliveredAll.channel, 'all');
      assert.strictEqual(deliveredAll.text.length, CHAT_MAX_LENGTH);

      // Rapid burst within 600ms cooldown is dropped by server rate limiter
      (room as any).onMessageEvents.emit('chat', blueA, { text: 'Spam burst!', channel: 'all' });
      assert.strictEqual(blueB.sentMessages.filter((m) => m.type === 'chat').length, 1);

      // Advance cooldown for blue_a and send a "team" message -> only blue_a & blue_b receive it
      (room as any).lastChatAt.set('blue_a', Date.now() - 800);
      (room as any).onMessageEvents.emit('chat', blueA, { text: 'Flank left alley', channel: 'team' });

      assert.strictEqual(blueA.sentMessages.filter((m) => m.type === 'chat').length, 2);
      assert.strictEqual(blueB.sentMessages.filter((m) => m.type === 'chat').length, 2);
      assert.strictEqual(
        redA.sentMessages.filter((m) => m.type === 'chat').length,
        1,
        '"team" channel must never leak to opposing team'
      );

      // System notices emit into lobby chat on join/team switch/leave
      (room as any).onMessageEvents.emit('switch_team', blueB, {});
      const sysOnSwitch = redA.sentMessages
        .filter((m) => m.type === 'chat')
        .map((m) => m.data as ChatMessage)
        .find((m) => m.isSystem && m.text.includes('BravoTwo switched'));
      assert.ok(sysOnSwitch, 'Team switch must emit a system chat notice in lobby');
    } finally {
      clearInterval((room as any)._simulationInterval);
      room.onDispose();
    }
  });

  await t.test('NetworkManager & MatchManager support offline local chat fallback and bound history at 50 messages', () => {
    let latestUpdate: ChatMessage[] = [];
    const nm = new NetworkManager({
      onStateUpdate: () => {},
      onRemoteFire: () => {},
      onHitConfirm: () => {},
      onPlayerDamaged: () => {},
      onPlayerRespawn: () => {},
      onKillFeed: () => {},
      onChatUpdate: (msgs) => {
        latestUpdate = msgs;
      },
      onSystemNotice: () => {},
      onDisconnected: () => {},
    });

    assert.strictEqual(nm.sendChatMessage('   ', 'all'), null);
    for (let i = 1; i <= CHAT_HISTORY_LIMIT + 10; i++) {
      nm.sendChatMessage(`Message ${i}`, i % 2 === 0 ? 'team' : 'all', {
        id: 'player',
        name: 'SoloOp',
        team: 'blue',
      });
    }
    assert.strictEqual(nm.getChatMessages().length, CHAT_HISTORY_LIMIT);
    assert.strictEqual(latestUpdate.length, CHAT_HISTORY_LIMIT);
    assert.strictEqual(latestUpdate[0].text, 'Message 11');
    assert.strictEqual(latestUpdate[latestUpdate.length - 1].text, `Message ${CHAT_HISTORY_LIMIT + 10}`);

    const mm = new MatchManager();
    for (let i = 1; i <= CHAT_HISTORY_LIMIT + 5; i++) {
      mm.addLocalChatMessage(`Offline ${i}`, 'all');
    }
    assert.strictEqual(mm.getLocalChatMessages().length, CHAT_HISTORY_LIMIT);
    assert.strictEqual(mm.getLocalChatMessages()[0].text, 'Offline 6');
  });

  await t.test('PlayerController suppresses WASD, firing, reload & weapon hotkeys while typing in chat and unlocks cleanly on death/disable', () => {
    withInteractiveDomStubs((dom) => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const audio = new AudioEngine();
      const openedChats: string[] = [];
      let reloadCount = 0;
      let fireReleaseCount = 0;
      const slots: number[] = [];

      const player = new PlayerController(scene, dom.canvas, audio, {
        onFirePress: () => {},
        onFireRelease: () => {
          fireReleaseCount++;
        },
        onAdsChange: () => {},
        onReload: () => {
          reloadCount++;
        },
        onSelectSlot: (slot) => {
          slots.push(slot);
        },
        onScoreboardChange: () => {},
        onPointerLockChange: () => {},
        onOpenChat: (channel) => {
          openedChats.push(channel);
        },
      });

      try {
        player.setOrbitPreview(false);
        player.setCanControl(true);
        player.spawnAt(new Vector3(0, 1, 0), 0);
        player.setChatTriggersEnabled(true);
        dom.canvas.requestPointerLock();

        // Enter / KeyT opens All chat; closing and pressing KeyY opens Team chat
        dom.emitWindowKeyDown('Enter');
        player.setChatInputOpen(false);
        dom.emitWindowKeyDown('KeyY');
        player.setChatInputOpen(false);
        assert.deepStrictEqual(openedChats, ['all', 'team']);

        // Hold movement + fire, then open chat -> clears held inputs and suppresses further inputs
        dom.emitWindowKeyDown('KeyW');
        dom.emitMouseDown(0);
        player.update(0.05);
        const speedBeforeChat = player.getHorizontalSpeed();
        assert.ok(speedBeforeChat > 0.5, 'Player should accelerate when KeyW is held normally');

        player.setChatInputOpen(true);
        assert.strictEqual(player.isChatInputOpen(), true);
        assert.strictEqual(player.getIsFireHeld(), false);
        assert.ok(fireReleaseCount >= 1, 'Opening chat must release held fire');

        dom.emitWindowKeyDown('KeyR');
        dom.emitWindowKeyDown('Digit2');
        dom.emitWindowKeyDown('KeyC');
        dom.emitWindowKeyDown('KeyW');
        player.update(0.05);

        assert.strictEqual(reloadCount, 0, 'Reload hotkey must be suppressed while chat input is open');
        assert.strictEqual(slots.length, 0, 'Slot hotkeys must be suppressed while chat input is open');
        assert.strictEqual(player.getStance(), 'stand', 'Slide/crouch must be suppressed while chat is open');
        assert.ok(
          player.getHorizontalSpeed() < speedBeforeChat,
          'Player horizontal velocity must decelerate instead of accelerating from WASD while chat input is open'
        );

        // From rest with chat open, pressing KeyW must produce zero horizontal acceleration
        player.spawnAt(new Vector3(0, 1, 0), 0);
        player.setChatInputOpen(true);
        dom.emitWindowKeyDown('KeyW');
        player.update(0.05);
        assert.strictEqual(
          player.getHorizontalSpeed(),
          0,
          'Player must not accelerate from rest when WASD is pressed while typing in chat'
        );

        // Death or losing control cleanly closes open chat state
        player.setDeadState(true);
        assert.strictEqual(player.isChatInputOpen(), false);
        player.setDeadState(false);
        player.setChatInputOpen(true);
        player.setCanControl(false);
        assert.strictEqual(player.isChatInputOpen(), false);
      } finally {
        player.dispose();
        scene.dispose();
        engine.dispose();
      }
    });
  });

  await t.test('2D Minimap coordinate mapping & compass orientation normalize arena bounds and yaw cleanly', () => {
    const origin = worldToMinimapPercent(0, 0, ARENA_HALF_EXTENT);
    assert.strictEqual(origin.xPct, 50);
    assert.strictEqual(origin.yPct, 50);

    const northEast = worldToMinimapPercent(14.5, 14.5, ARENA_HALF_EXTENT);
    assert.ok(northEast.xPct > 50, '+X must map right on 2D minimap');
    assert.ok(northEast.yPct < 50, '+Z (North) must map up on 2D minimap');

    const clamped = worldToMinimapPercent(999, -999, ARENA_HALF_EXTENT);
    assert.strictEqual(clamped.xPct, 97);
    assert.strictEqual(clamped.yPct, 97);

    assert.strictEqual(Math.round(yawRadToCompassDeg(0)), 0);
    assert.strictEqual(Math.round(yawRadToCompassDeg(-Math.PI / 2)), 270);
    assert.ok(MINIMAP_LAYOUTS.urban.length > 0);
    assert.ok(MINIMAP_LAYOUTS.desert.length > 0);
    assert.ok(MINIMAP_LAYOUTS.industrial.length > 0);
    assert.ok(MINIMAP_LAYOUTS.forest.length > 0);
  });
});
