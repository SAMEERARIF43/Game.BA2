import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialMatchState,
  deriveActiveRoute,
  derivePostMatchStats,
  INITIAL_HUD,
  isGameplayShortcutBlocked,
  matchReducer,
  RankInfo,
  selectMatchMvp,
} from '../src/match/matchMachine.ts';
import { GameSettings } from '../src/game/types.ts';
import { LobbyRoomSnapshot } from '../src/multiplayer/types.ts';
import { DEFAULT_KEYBINDINGS } from '../src/settings/keybindings.ts';
import { AppRoute } from '../src/utils/router.ts';

const TEST_SETTINGS: GameSettings = {
  callsign: 'TestOp',
  sensitivity: 0.0022,
  adsSensitivityMultiplier: 0.55,
  invertY: false,
  fovDeg: 90,
  showFps: false,
  volume: 0.8,
  sfxVolume: 0.9,
  musicVolume: 0.35,
  muted: false,
  graphicsQuality: 'HIGH',
  killLimit: 30,
  botsPerTeam: 4,
  screenShakeScale: 1,
  selectedCharacterId: 'assault',
  selectedGunId: 'ak47',
  knifeCharmId: 'tactical_tag',
  keybindings: { ...DEFAULT_KEYBINDINGS },
};

const TEST_RANK: RankInfo = {
  xp: 250,
  level: 2,
  title: 'Corporal',
  progressPct: 50,
};

function makeSnapshot(
  phase: LobbyRoomSnapshot['phase'] = 'lobby',
  mapId: LobbyRoomSnapshot['mapId'] = 'desert'
): LobbyRoomSnapshot {
  return {
    roomCode: 'WAR482',
    roomName: 'Alpha Private',
    mapId,
    phase,
    killLimit: 30,
    timeLimit: 300,
    timeRemaining: 300,
    respawnDelay: 3,
    friendlyFire: false,
    botCount: 4,
    hasPassword: false,
    hostId: 'p1',
    blueScore: 0,
    redScore: 0,
    winner: '',
    players: [
      {
        id: 'p1',
        name: 'TestOp',
        team: 'blue',
        isBot: false,
        isHost: true,
        ready: true,
        isAlive: true,
        respawnTimer: 0,
        x: 0,
        y: 0,
        z: -20,
        rotY: 0,
        pitch: 0,
        characterId: 'assault',
        weaponId: 'ak47',
        health: 100,
        kills: 5,
        deaths: 2,
      },
    ],
    localPlayerId: 'p1',
  };
}

function makeInitial(initialRoute: AppRoute = { view: 'menu' }) {
  return createInitialMatchState({
    initialRoute,
    settings: TEST_SETTINGS,
    rank: TEST_RANK,
  });
}

test('MatchMachine: initial states from routes', () => {
  const menuState = makeInitial({ view: 'menu' });
  assert.strictEqual(menuState.status, 'menu');
  assert.strictEqual(menuState.selectedMapId, 'urban');
  assert.strictEqual(menuState.hud.xp, 250);
  assert.deepStrictEqual(deriveActiveRoute(menuState), { view: 'menu' });

  const playState = makeInitial({ view: 'play', mapId: 'forest' });
  assert.strictEqual(playState.status, 'offline_paused');
  assert.strictEqual(playState.selectedMapId, 'forest');
  assert.deepStrictEqual(deriveActiveRoute(playState), { view: 'play', mapId: 'forest' });

  const customState = makeInitial({ view: 'custom', joinCode: 'WAR482' });
  assert.strictEqual(customState.status, 'custom_menu');
  assert.strictEqual(customState.joinCode, 'WAR482');
  assert.deepStrictEqual(deriveActiveRoute(customState), { view: 'custom', joinCode: 'WAR482' });
});

test('MatchMachine: valid offline match lifecycle & strict guards', () => {
  let state = makeInitial({ view: 'menu' });

  state = matchReducer(state, { type: 'OPEN_MAP_SELECT' });
  assert.strictEqual(state.status, 'maps');

  state = matchReducer(state, { type: 'PREVIEW_MAP', mapId: 'industrial' });
  assert.strictEqual(state.selectedMapId, 'industrial');

  state = matchReducer(state, { type: 'START_OFFLINE_MATCH', mapId: 'industrial', requestLock: true });
  assert.strictEqual(state.status, 'offline_playing');
  assert.strictEqual(isGameplayShortcutBlocked(state), true);

  // Preview/open-maps/open-custom must be rejected while offline match is active
  const blockedPreview = matchReducer(state, { type: 'PREVIEW_MAP', mapId: 'urban' });
  assert.strictEqual(blockedPreview.selectedMapId, 'industrial');
  const blockedMaps = matchReducer(state, { type: 'OPEN_MAP_SELECT' });
  assert.strictEqual(blockedMaps.status, 'offline_playing');
  const blockedCustom = matchReducer(state, { type: 'OPEN_CUSTOM_MATCH' });
  assert.strictEqual(blockedCustom.status, 'offline_playing');

  // Engine pauses match via HUD update
  state = matchReducer(state, {
    type: 'HUD_UPDATED',
    hud: { ...INITIAL_HUD, match: { ...INITIAL_HUD.match, phase: 'paused' } },
  });
  assert.strictEqual(state.status, 'offline_paused');

  // Engine ends match via HUD update
  state = matchReducer(state, {
    type: 'HUD_UPDATED',
    hud: { ...INITIAL_HUD, match: { ...INITIAL_HUD.match, phase: 'ended' } },
  });
  assert.strictEqual(state.status, 'offline_ended');

  // Restart transitions cleanly back to offline_playing
  state = matchReducer(state, { type: 'RESTART_OFFLINE_MATCH' });
  assert.strictEqual(state.status, 'offline_playing');

  // Stray 'menu' HUD phase cannot exit offline match without explicit NAVIGATE_MENU
  state = matchReducer(state, {
    type: 'HUD_UPDATED',
    hud: { ...INITIAL_HUD, match: { ...INITIAL_HUD.match, phase: 'menu' } },
  });
  assert.strictEqual(state.status, 'offline_playing');

  state = matchReducer(state, { type: 'NAVIGATE_MENU' });
  assert.strictEqual(state.status, 'menu');
  assert.strictEqual(isGameplayShortcutBlocked(state), false);
});

test('MatchMachine: multiplayer connect epoch prevents async race conditions', () => {
  let state = makeInitial({ view: 'custom', joinCode: 'WAR482' });

  // Start connection (epoch 0 -> 1)
  state = matchReducer(state, { type: 'MP_CONNECT_START' });
  assert.strictEqual(state.status, 'mp_connecting');
  assert.strictEqual(state.connectionEpoch, 1);
  assert.strictEqual(state.joinCode, 'WAR482');

  // Duplicate MP_CONNECT_START while connecting must be ignored
  const duplicateStart = matchReducer(state, { type: 'MP_CONNECT_START' });
  assert.strictEqual(duplicateStart.connectionEpoch, 1);
  assert.strictEqual(duplicateStart, state);

  // User navigates back to menu while connection promise is still in flight
  state = matchReducer(state, { type: 'NAVIGATE_MENU' });
  assert.strictEqual(state.status, 'menu');
  assert.strictEqual(state.connectionEpoch, 2);

  // In-flight promise resolves with stale epoch 1 -> MUST be rejected!
  const staleSnapshot = makeSnapshot('lobby', 'desert');
  const afterStaleResolve = matchReducer(state, {
    type: 'MP_CONNECT_SUCCESS',
    epoch: 1,
    snapshot: staleSnapshot,
  });
  assert.strictEqual(afterStaleResolve.status, 'menu');
  assert.strictEqual(afterStaleResolve.lobbySnapshot, null);

  // In-flight promise rejects with stale epoch 1 -> MUST NOT jump back to custom_menu!
  const afterStaleReject = matchReducer(state, {
    type: 'MP_CONNECT_FAILURE',
    epoch: 1,
  });
  assert.strictEqual(afterStaleReject.status, 'menu');
});

test('MatchMachine: stale Colyseus events ignored after leave or in offline mode', () => {
  let state = makeInitial({ view: 'menu' });
  state = matchReducer(state, { type: 'OPEN_CUSTOM_MATCH' });
  state = matchReducer(state, { type: 'MP_CONNECT_START' });
  const epoch = state.connectionEpoch;

  const lobbySnap = makeSnapshot('lobby', 'desert');
  state = matchReducer(state, { type: 'MP_CONNECT_SUCCESS', epoch, snapshot: lobbySnap });
  assert.strictEqual(state.status, 'mp_lobby');
  assert.strictEqual(state.selectedMapId, 'desert');
  assert.strictEqual(state.joinCode, undefined);

  // Match starts via authoritative server snapshot
  state = matchReducer(state, {
    type: 'MP_STATE_SYNC',
    snapshot: makeSnapshot('playing', 'desert'),
  });
  assert.strictEqual(state.status, 'mp_playing');
  assert.strictEqual(isGameplayShortcutBlocked(state), true);

  // Engine pausing in multiplayer updates hud.match.phase without leaving mp_playing
  state = matchReducer(state, {
    type: 'HUD_UPDATED',
    hud: { ...INITIAL_HUD, match: { ...INITIAL_HUD.match, phase: 'paused' } },
  });
  assert.strictEqual(state.status, 'mp_playing');

  // Offline match cannot be started while in multiplayer
  const blockedOffline = matchReducer(state, {
    type: 'START_OFFLINE_MATCH',
    mapId: 'urban',
    requestLock: true,
  });
  assert.strictEqual(blockedOffline.status, 'mp_playing');

  // Player leaves multiplayer
  state = matchReducer(state, { type: 'LEAVE_MULTIPLAYER' });
  assert.strictEqual(state.status, 'menu');
  assert.strictEqual(state.lobbySnapshot, null);

  // Late Colyseus state sync & disconnect events must be ignored
  const afterLateSync = matchReducer(state, {
    type: 'MP_STATE_SYNC',
    snapshot: makeSnapshot('playing', 'desert'),
  });
  assert.strictEqual(afterLateSync.status, 'menu');
  assert.strictEqual(afterLateSync.lobbySnapshot, null);

  const afterLateDisconnect = matchReducer(state, {
    type: 'MP_DISCONNECTED',
    reason: 'Socket closed',
  });
  assert.strictEqual(afterLateDisconnect.status, 'menu');
  assert.strictEqual(afterLateDisconnect.disconnectError, null);
});

test('MatchMachine: disconnect, system notice, popstate & contextLost', () => {
  let state = makeInitial({ view: 'custom' });
  state = matchReducer(state, { type: 'MP_CONNECT_START' });
  state = matchReducer(state, {
    type: 'MP_CONNECT_SUCCESS',
    epoch: state.connectionEpoch,
    snapshot: makeSnapshot('lobby', 'urban'),
  });

  state = matchReducer(state, { type: 'MP_SYSTEM_NOTICE', message: 'Host balanced teams' });
  assert.strictEqual(state.systemNotice, 'Host balanced teams');

  // Unexpected disconnect sends user back to custom_menu with banner and bumps epoch
  const prevEpoch = state.connectionEpoch;
  state = matchReducer(state, { type: 'MP_DISCONNECTED', reason: 'Removed from room by host.' });
  assert.strictEqual(state.status, 'custom_menu');
  assert.strictEqual(state.disconnectError, 'Removed from room by host.');
  assert.strictEqual(state.systemNotice, null);
  assert.strictEqual(state.connectionEpoch, prevEpoch + 1);

  // Re-enter lobby, test popstate to /join/XYZ999
  state = matchReducer(state, { type: 'MP_CONNECT_START' });
  state = matchReducer(state, {
    type: 'MP_CONNECT_SUCCESS',
    epoch: state.connectionEpoch,
    snapshot: makeSnapshot('playing', 'forest'),
  });
  state = matchReducer(state, { type: 'SET_CONTEXT_LOST', lost: true });
  assert.strictEqual(state.contextLost, true);
  assert.strictEqual(state.status, 'mp_playing');

  state = matchReducer(state, {
    type: 'POPSTATE_ROUTE',
    route: { view: 'custom', joinCode: 'XYZ999' },
  });
  assert.strictEqual(state.status, 'custom_menu');
  assert.strictEqual(state.joinCode, 'XYZ999');
  assert.strictEqual(state.lobbySnapshot, null);
  assert.strictEqual(state.contextLost, true);

  state = matchReducer(state, { type: 'SET_CONTEXT_LOST', lost: false });
  assert.strictEqual(state.contextLost, false);

  // Derive post-match stats accurately
  const stats = derivePostMatchStats({
    ...INITIAL_HUD,
    shotsFired: 20,
    shotsHit: 10,
    headshots: 3,
    eliminations: 7,
    match: {
      ...INITIAL_HUD.match,
      participants: [
        {
          id: 'player',
          name: 'You',
          team: 'blue',
          isPlayer: true,
          kills: 9,
          deaths: 4,
          isAlive: true,
          respawnTimer: 0,
        },
      ],
    },
  });
  assert.deepStrictEqual(stats, {
    kills: 9,
    deaths: 4,
    accuracyPct: 50,
    headshots: 3,
  });
});

test('MatchMachine: MP_CONNECT_CANCEL returns to custom_menu and invalidates in-flight epoch', () => {
  let state = makeInitial({ view: 'custom', joinCode: 'WAR482' });
  state = matchReducer(state, { type: 'MP_CONNECT_START' });
  assert.strictEqual(state.status, 'mp_connecting');
  const canceledEpoch = state.connectionEpoch;

  state = matchReducer(state, { type: 'MP_CONNECT_CANCEL' });
  assert.strictEqual(state.status, 'custom_menu');
  assert.strictEqual(state.connectionEpoch, canceledEpoch + 1);
  assert.strictEqual(state.lobbySnapshot, null);

  // Stale connect success after cancel must be ignored
  const afterStaleSuccess = matchReducer(state, {
    type: 'MP_CONNECT_SUCCESS',
    epoch: canceledEpoch,
    snapshot: makeSnapshot('lobby', 'urban'),
  });
  assert.strictEqual(afterStaleSuccess.status, 'custom_menu');
  assert.strictEqual(afterStaleSuccess.lobbySnapshot, null);
});

test('MatchMachine: selectMatchMvp computes highest combat score using playerStats', () => {
  // Case 1: Local player combat score (kills + headshot & accuracy bonuses) beats bot with equal kills
  const mvpPlayerWin = selectMatchMvp(
    [
      {
        id: 'bot_red_1',
        name: 'Viper',
        team: 'red',
        isPlayer: false,
        kills: 10,
        deaths: 3,
        isAlive: true,
        respawnTimer: 0,
      },
      {
        id: 'player',
        name: 'TestOp',
        team: 'blue',
        isPlayer: true,
        kills: 10,
        deaths: 4,
        isAlive: true,
        respawnTimer: 0,
      },
    ],
    { kills: 10, deaths: 4, accuracyPct: 50, headshots: 4 }
  );

  assert.ok(mvpPlayerWin);
  assert.strictEqual(mvpPlayerWin.id, 'player');
  assert.strictEqual(mvpPlayerWin.combatScore, 1225); // 10*100 + 4*50 + 25
  assert.strictEqual(mvpPlayerWin.kdRatio, 2.5);

  // Case 2: Another operator with substantially more eliminations wins MVP
  const mvpOpponentWin = selectMatchMvp(
    [
      {
        id: 'bot_red_1',
        name: 'Viper',
        team: 'red',
        isPlayer: false,
        kills: 18,
        deaths: 2,
        isAlive: true,
        respawnTimer: 0,
      },
      {
        id: 'player',
        name: 'TestOp',
        team: 'blue',
        isPlayer: true,
        kills: 9,
        deaths: 5,
        isAlive: true,
        respawnTimer: 0,
      },
    ],
    { kills: 9, deaths: 5, accuracyPct: 40, headshots: 2 }
  );

  assert.ok(mvpOpponentWin);
  assert.strictEqual(mvpOpponentWin.id, 'bot_red_1');
  assert.strictEqual(mvpOpponentWin.combatScore, 1800);
  assert.strictEqual(mvpOpponentWin.kdRatio, 9);

  // Case 3: Empty participants returns null when playerStats are all zero
  assert.strictEqual(
    selectMatchMvp([], { kills: 0, deaths: 0, accuracyPct: 0, headshots: 0 }),
    null
  );
});

