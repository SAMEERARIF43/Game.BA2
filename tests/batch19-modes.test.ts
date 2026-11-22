import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOMB_DEFUSE_DURATION_SEC,
  BOMB_DETONATE_DURATION_SEC,
  BOMB_PLANT_DURATION_SEC,
  BOMB_ROUND_DURATION_SEC,
  BOMB_ROUND_END_DELAY_SEC,
  BOMB_ROUNDS_TO_WIN,
  FFA_DEFAULT_KILL_LIMIT,
  getModeDefaultLimits,
  isHostile,
  normalizeGameMode,
  sortFfaParticipants,
  TDM_DEFAULT_KILL_LIMIT,
} from '../src/game/gameModeRules.ts';
import { MatchManager } from '../src/match/MatchManager.ts';
import { MAP_LIST } from '../src/maps/MapManager.ts';
import { SERVER_MAP_LAYOUTS } from '../server/mapSpawns.ts';
import { MatchRoom } from '../server/rooms/MatchRoom.ts';
import { PlayerSchema } from '../server/schema/MatchState.ts';

interface MockClient {
  sessionId: string;
  sentMessages: Array<{ type: string; data: any }>;
  send(type: string, data: any): void;
  enqueueRaw(data: any): void;
  raw(data: any): void;
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
  };
}

function createBombOrFfaRoom(mode: 'ffa' | 'bomb', mapId: 'urban' | 'desert' | 'industrial' | 'forest' = 'urban') {
  const room = new MatchRoom();
  room.onCreate({
    mapId,
    mode,
    friendlyFire: false,
    killLimit: mode === 'ffa' ? 3 : 2,
    timeLimit: mode === 'bomb' ? BOMB_ROUND_DURATION_SEC : 300,
    botCount: 0,
  });
  room.state.phase = 'playing';

  const addPlayer = (
    id: string,
    team: 'blue' | 'red',
    x: number,
    y: number,
    z: number,
    rotY = 0,
    weaponId = 'ak47'
  ) => {
    const p = new PlayerSchema();
    p.id = id;
    p.name = `Op_${id}`;
    p.team = team;
    p.isBot = false;
    p.isHost = id === 'p1';
    p.isAlive = true;
    p.health = 100;
    p.kills = 0;
    p.deaths = 0;
    p.x = x;
    p.y = y;
    p.z = z;
    p.rotY = rotY;
    p.pitch = 0;
    p.weaponId = weaponId;
    room.state.players.set(id, p);
    return p;
  };

  const cleanup = () => {
    clearInterval((room as any)._simulationInterval);
    room.onDispose();
  };

  return { room, addPlayer, cleanup };
}

test('GameModeRules: normalization, default limits, hostility & FFA sorting', () => {
  assert.strictEqual(normalizeGameMode('ffa'), 'ffa');
  assert.strictEqual(normalizeGameMode('bomb'), 'bomb');
  assert.strictEqual(normalizeGameMode('invalid', 'tdm'), 'tdm');

  assert.deepStrictEqual(getModeDefaultLimits('tdm'), {
    killLimit: TDM_DEFAULT_KILL_LIMIT,
    timeLimitSec: 300,
    respawnDelaySec: 3,
  });
  assert.deepStrictEqual(getModeDefaultLimits('ffa'), {
    killLimit: FFA_DEFAULT_KILL_LIMIT,
    timeLimitSec: 300,
    respawnDelaySec: 2.5,
  });
  assert.deepStrictEqual(getModeDefaultLimits('bomb'), {
    killLimit: BOMB_ROUNDS_TO_WIN,
    timeLimitSec: BOMB_ROUND_DURATION_SEC,
    respawnDelaySec: 0,
  });

  const blueA = { id: 'a1', team: 'blue' };
  const blueB = { id: 'a2', team: 'blue' };
  const redA = { id: 'b1', team: 'red' };

  // Self is never hostile
  assert.strictEqual(isHostile('ffa', blueA, blueA), false);
  assert.strictEqual(isHostile('tdm', blueA, blueA, true), false);

  // TDM & Bomb respect team unless friendlyFire enabled
  assert.strictEqual(isHostile('tdm', blueA, blueB, false), false);
  assert.strictEqual(isHostile('tdm', blueA, blueB, true), true);
  assert.strictEqual(isHostile('tdm', blueA, redA, false), true);
  assert.strictEqual(isHostile('bomb', blueA, blueB, false), false);

  // FFA treats every other actor as hostile regardless of underlying team field
  assert.strictEqual(isHostile('ffa', blueA, blueB, false), true);
  assert.strictEqual(isHostile('ffa', blueA, redA, false), true);

  const sorted = sortFfaParticipants([
    { id: 'c', name: 'Charlie', kills: 5, deaths: 4 },
    { id: 'b', name: 'Bravo', kills: 5, deaths: 2 },
    { id: 'a', name: 'Alpha', kills: 8, deaths: 5 },
    { id: 'd', name: 'Delta', kills: 5, deaths: 2 },
  ]);
  assert.deepStrictEqual(
    sorted.map((p) => p.id),
    ['a', 'b', 'd', 'c']
  );
});

test('Map Bomb Sites: all 4 maps define distinct Site A and B across client and server', () => {
  for (const mapDef of MAP_LIST) {
    assert.strictEqual(mapDef.bombSites.length, 2, `${mapDef.id} should define 2 client bomb sites`);
    const clientA = mapDef.bombSites.find((s) => s.id === 'A');
    const clientB = mapDef.bombSites.find((s) => s.id === 'B');
    assert.ok(clientA && clientB);
    assert.ok(Math.hypot(clientA.position.x - clientB.position.x, clientA.position.z - clientB.position.z) > 10);

    const serverLayout = SERVER_MAP_LAYOUTS[mapDef.id];
    assert.strictEqual(serverLayout.bombSites.length, 2, `${mapDef.id} should define 2 server bomb sites`);
    const serverA = serverLayout.bombSites.find((s) => s.id === 'A')!;
    const serverB = serverLayout.bombSites.find((s) => s.id === 'B')!;
    assert.strictEqual(serverA.x, clientA.position.x);
    assert.strictEqual(serverA.z, clientA.position.z);
    assert.strictEqual(serverB.x, clientB.position.x);
    assert.strictEqual(serverB.z, clientB.position.z);
  }
});

test('MatchManager FFA: every combatant hostile, kill limit wins, and time-expiry draw/winner', () => {
  const mm = new MatchManager();
  mm.configureMatch('urban', 'Urban Strike', 20, 3, {
    mode: 'ffa',
    playerName: 'Striker',
  });
  mm.setPhase('playing');

  assert.strictEqual(mm.getMode(), 'ffa');
  assert.strictEqual(mm.isHostile('bot_ffa_1', 'bot_ffa_2'), true);
  assert.strictEqual(mm.isHostile('player', 'bot_ffa_1'), true);
  assert.strictEqual(mm.isHostile('player', 'player'), false);

  // Player eliminates bots up to 20
  for (let i = 0; i < 19; i++) {
    mm.recordKill('player', 'bot_ffa_1', 'AK-47', false, 15);
    assert.strictEqual(mm.getPhase(), 'playing');
  }
  mm.recordKill('player', 'bot_ffa_2', 'AK-47', true, 18);
  const snap = mm.getSnapshot();
  assert.strictEqual(snap.phase, 'ended');
  assert.strictEqual(snap.winnerParticipantId, 'player');
  assert.strictEqual(snap.winnerName, 'Striker');

  // Time expiry tie -> draw
  const tieMm = new MatchManager();
  tieMm.configureMatch('desert', 'Desert Compound', 20, 2, { mode: 'ffa', timeLimitSec: 60 });
  tieMm.setPhase('playing');
  tieMm.recordKill('player', 'bot_ffa_1', 'AK-47', false, 10);
  tieMm.recordKill('bot_ffa_2', 'player', 'SMG', false, 10);
  tieMm.update(61);
  assert.strictEqual(tieMm.getPhase(), 'ended');
  assert.strictEqual(tieMm.getSnapshot().winner, 'draw');
});

test('MatchManager Secure Bomb: plant, release cancel, detonate, defuse, wipeout, carrier transfer & round transition', () => {
  const mm = new MatchManager();
  mm.configureMatch('urban', 'Urban Strike', 5, 2, {
    mode: 'bomb',
    playerName: 'AlphaLead',
    bombSites: [
      { id: 'A', x: -8, y: 0, z: 8, radius: 4.5 },
      { id: 'B', x: 20, y: 0, z: 6, radius: 4.5 },
    ],
  });
  mm.setPhase('playing');

  let bomb = mm.getBombState()!;
  assert.strictEqual(bomb.phase, 'unplanted');
  assert.strictEqual(bomb.carrierId, 'player');

  // Partial plant then release cancels progress
  mm.updateBombInteraction({ id: 'player', team: 'blue', x: -8, y: 0, z: 8, isAlive: true }, true, 2.0);
  bomb = mm.getBombState()!;
  assert.ok(bomb.actionProgress > 0.4 && bomb.actionType === 'plant');
  mm.updateBombInteraction({ id: 'player', team: 'blue', x: -8, y: 0, z: 8, isAlive: true }, false, 0.1);
  bomb = mm.getBombState()!;
  assert.strictEqual(bomb.actionProgress, 0);
  assert.strictEqual(bomb.actionPlayerId, null);

  // Full plant over 3.5s
  const plantedRes = mm.updateBombInteraction(
    { id: 'player', team: 'blue', x: -8, y: 0, z: 8, isAlive: true },
    true,
    BOMB_PLANT_DURATION_SEC
  );
  assert.strictEqual(plantedRes.event, 'planted');
  bomb = mm.getBombState()!;
  assert.strictEqual(bomb.phase, 'planted');
  assert.strictEqual(bomb.siteId, 'A');

  // Eliminating remaining attackers while bomb IS planted does NOT award round to defenders
  mm.recordKill('bot_red_1', 'player', 'AK-47', false, 12);
  mm.recordKill('bot_red_1', 'bot_blue_1', 'AK-47', false, 12);
  assert.strictEqual(mm.getBombState()!.phase, 'planted');
  assert.strictEqual(mm.getSnapshot().redScore, 0);

  // Defender defuses over 4.5s -> Defenders win Round 1
  const defuseRes = mm.updateBombInteraction(
    { id: 'bot_red_1', team: 'red', x: -8, y: 0, z: 8, isAlive: true },
    true,
    BOMB_DEFUSE_DURATION_SEC
  );
  assert.strictEqual(defuseRes.event, 'defused');
  assert.strictEqual(mm.getSnapshot().redScore, 1);
  assert.strictEqual(mm.getBombState()!.phase, 'round_end');
  assert.strictEqual(mm.getBombState()!.roundWinner, 'red');

  // Advance round transition timer (3.0s) -> Round 2 resets players & flags pendingRoundReset
  mm.update(BOMB_ROUND_END_DELAY_SEC + 0.05);
  assert.strictEqual(mm.consumePendingRoundReset(), true);
  assert.strictEqual(mm.consumePendingRoundReset(), false);
  assert.strictEqual(mm.getRoundNumber(), 2);
  assert.strictEqual(mm.getBombState()!.phase, 'unplanted');
  assert.strictEqual(mm.getBombState()!.carrierId, 'player');

  // Carrier death transfers bomb to surviving Blue teammate
  mm.recordKill('bot_red_1', 'player', 'Sniper', true, 25);
  assert.strictEqual(mm.getBombState()!.carrierId, 'bot_blue_1');

  // Remaining attacker plants and detonates (40s) -> Attackers win Round 2
  mm.updateBombInteraction(
    { id: 'bot_blue_1', team: 'blue', x: 20, y: 0, z: 6, isAlive: true },
    true,
    BOMB_PLANT_DURATION_SEC
  );
  assert.strictEqual(mm.getBombState()!.phase, 'planted');
  mm.update(BOMB_DETONATE_DURATION_SEC + 0.1);
  assert.strictEqual(mm.getSnapshot().blueScore, 1);
  assert.strictEqual(mm.getBombState()!.roundWinner, 'blue');
});

test('MatchManager Secure Bomb: 5-round win concludes match and round timer expiry awards defenders', () => {
  const mm = new MatchManager();
  mm.configureMatch('desert', 'Desert Compound', 5, 1, {
    mode: 'bomb',
    roundsToWin: 2,
    timeLimitSec: 90,
  });
  mm.setPhase('playing');

  // Round 1: timer expires -> Defenders score 1
  mm.update(BOMB_ROUND_DURATION_SEC + 0.1);
  assert.strictEqual(mm.getSnapshot().redScore, 1);
  assert.strictEqual(mm.getPhase(), 'playing');

  // Advance to Round 2
  mm.update(BOMB_ROUND_END_DELAY_SEC + 0.1);
  assert.strictEqual(mm.getRoundNumber(), 2);

  // Round 2: timer expires -> Defenders reach 2 rounds -> Match ends
  mm.update(BOMB_ROUND_DURATION_SEC + 0.1);
  const finalSnap = mm.getSnapshot();
  assert.strictEqual(finalSnap.redScore, 2);
  assert.strictEqual(finalSnap.phase, 'ended');
  assert.strictEqual(finalSnap.winner, 'red');
});

test('Colyseus MatchRoom FFA: allows cross-combatant hits regardless of team and forces [ALL] chat', () => {
  const { room, addPlayer, cleanup } = createBombOrFfaRoom('ffa', 'urban');
  const c1 = createMockClient('p1');
  const c2 = createMockClient('p2');
  room.clients.push(c1 as any, c2 as any);

  // Both assigned 'blue' team, but FFA must still treat them as hostile!
  const p1 = addPlayer('p1', 'blue', 8, 0, 0, 0, 'sniper');
  const p2 = addPlayer('p2', 'blue', 8, 0, 15, 0, 'ak47');

  (room as any).onMessageEvents.emit('player_fire', c1, {
    weaponId: 'sniper',
    targetId: p2.id,
    endX: p2.x,
    endY: p2.y + 1.25,
    endZ: p2.z,
  });

  assert.strictEqual(p2.isAlive, false);
  assert.strictEqual(p1.kills, 1);

  // Team chat message in FFA is normalized to 'all'
  (room as any).onMessageEvents.emit('chat', c1, { text: 'gg', channel: 'team' });
  const chatEvents = c2.sentMessages.filter((m) => m.type === 'chat');
  assert.strictEqual(chatEvents.length, 1);
  assert.strictEqual(chatEvents[0].data.channel, 'all');

  cleanup();
});

test('Colyseus MatchRoom Bomb: authoritative plant, out-of-site rejection, defuse, and round win', () => {
  const { room, addPlayer, cleanup } = createBombOrFfaRoom('bomb', 'urban');
  const c1 = createMockClient('p1');
  const c2 = createMockClient('p2');
  room.clients.push(c1 as any, c2 as any);

  const siteA = SERVER_MAP_LAYOUTS.urban.bombSites.find((s) => s.id === 'A')!;
  const attacker = addPlayer('p1', 'blue', 0, 0, -20, 0, 'ak47');
  const defender = addPlayer('p2', 'red', siteA.x, 0, siteA.z, 0, 'ak47');
  room.state.bombCarrierId = attacker.id;

  // Attacker outside site holding E -> no plant progress
  (room as any).onMessageEvents.emit('bomb_interact', c1, { holding: true });
  (room as any).simulateTick(2.0);
  assert.strictEqual(room.state.bombActionProgress, 0);
  assert.strictEqual(room.state.bombPhase, 'unplanted');

  // Move attacker onto Site A and advance 3.5s -> planted
  attacker.x = siteA.x;
  attacker.z = siteA.z;
  (room as any).simulateTick(BOMB_PLANT_DURATION_SEC + 0.05);
  assert.strictEqual(room.state.bombPhase, 'planted');
  assert.strictEqual(room.state.bombSite, 'A');

  // Defender holds E at planted bomb for 4.5s -> defused & Defenders score round 1
  (room as any).onMessageEvents.emit('bomb_interact', c2, { holding: true });
  (room as any).simulateTick(BOMB_DEFUSE_DURATION_SEC + 0.05);
  assert.strictEqual(room.state.redScore, 1);
  assert.strictEqual(room.state.bombPhase, 'round_end');
  assert.strictEqual(room.state.roundWinner, 'red');

  cleanup();
});
