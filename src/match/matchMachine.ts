import { GameSettings, HudState, MatchParticipant, WEAPONS } from '../game/types';
import { MapId, TeamId } from '../maps/types';
import { LobbyRoomSnapshot } from '../multiplayer/types';
import { AppRoute } from '../utils/router';
import { DEFAULT_KILL_LIMIT, MATCH_DURATION_SEC } from './MatchManager';

export type MatchMachineStatus =
  | 'menu'
  | 'maps'
  | 'custom_menu'
  | 'mp_connecting'
  | 'mp_lobby'
  | 'mp_playing'
  | 'mp_ended'
  | 'offline_playing'
  | 'offline_paused'
  | 'offline_ended';

export interface RankInfo {
  xp: number;
  level: number;
  title: string;
  progressPct: number;
}

export interface MatchMachineState {
  status: MatchMachineStatus;
  selectedMapId: MapId;
  joinCode?: string;
  settings: GameSettings;
  hud: HudState;
  contextLost: boolean;
  lobbySnapshot: LobbyRoomSnapshot | null;
  disconnectError: string | null;
  systemNotice: string | null;
  connectionEpoch: number;
}

export type MatchMachineAction =
  | { type: 'NAVIGATE_MENU' }
  | { type: 'OPEN_MAP_SELECT' }
  | { type: 'PREVIEW_MAP'; mapId: MapId }
  | { type: 'START_OFFLINE_MATCH'; mapId: MapId; requestLock: boolean }
  | { type: 'RESTART_OFFLINE_MATCH' }
  | { type: 'OPEN_CUSTOM_MATCH'; joinCode?: string }
  | { type: 'MP_CONNECT_START' }
  | { type: 'MP_CONNECT_SUCCESS'; epoch: number; snapshot: LobbyRoomSnapshot }
  | { type: 'MP_CONNECT_FAILURE'; epoch: number }
  | { type: 'MP_CONNECT_CANCEL' }
  | { type: 'MP_STATE_SYNC'; snapshot: LobbyRoomSnapshot; epoch?: number }
  | { type: 'MP_SYSTEM_NOTICE'; message: string }
  | { type: 'CLEAR_SYSTEM_NOTICE' }
  | { type: 'MP_DISCONNECTED'; reason: string }
  | { type: 'LEAVE_MULTIPLAYER' }
  | { type: 'POPSTATE_ROUTE'; route: AppRoute }
  | { type: 'HUD_UPDATED'; hud: HudState }
  | { type: 'SETTINGS_UPDATED'; settings: GameSettings }
  | { type: 'SET_CONTEXT_LOST'; lost: boolean };

export interface PostMatchStats {
  kills: number;
  deaths: number;
  accuracyPct: number;
  headshots: number;
}

export interface MatchMvpSummary {
  id: string;
  name: string;
  team: TeamId;
  isPlayer: boolean;
  isBot: boolean;
  kills: number;
  deaths: number;
  kdRatio: number;
  combatScore: number;
  headshots: number | null;
  accuracyPct: number | null;
}

export const INITIAL_HUD: HudState = {
  isPointerLocked: false,
  health: 100,
  maxHealth: 100,
  isAlive: true,
  respawnTimer: 0,
  lastDamageTimestamp: 0,
  damageIndicators: [],
  lastKillerName: null,
  lastKillerWeapon: null,
  killerBanner: null,
  stance: 'stand',
  isGrounded: true,
  isAds: false,
  adsBlend: 0,
  speed: 0,
  headingDeg: 0,
  activeWeapon: WEAPONS.ak47,
  selectedCharacterId: 'assault',
  equippedGunId: 'ak47',
  queuedGunId: 'ak47',
  knifeCharmId: 'tactical_tag',
  isGunSwitchLocked: false,
  gunLockMessage: null,
  weaponSlots: [
    { id: 'ak47', ammoInMag: WEAPONS.ak47.magSize, reserveAmmo: WEAPONS.ak47.reserveMax },
    { id: 'knife', ammoInMag: 0, reserveAmmo: 0 },
  ],
  isReloading: false,
  reloadProgress: 0,
  crosshairSpreadPx: 14,
  hitMarker: null,
  shotsFired: 0,
  shotsHit: 0,
  headshots: 0,
  eliminations: 0,
  currentStreak: 0,
  killstreaks: [
    { id: 'uav', key: 'F1', name: 'UAV Sweep', requiredKills: 3, unlocked: false, active: false, remainingSec: 0 },
    { id: 'airstrike', key: 'F2', name: 'Barrage', requiredKills: 5, unlocked: false, active: false, remainingSec: 0 },
    { id: 'overdrive', key: 'F3', name: 'Overdrive', requiredKills: 7, unlocked: false, active: false, remainingSec: 0 },
  ],
  uavActive: false,
  uavPulseProgress: 0,
  overdriveActive: false,
  overdriveRemainingSec: 0,
  killstreakBanner: null,
  scorePopups: [],
  radarBlips: [],
  xp: 0,
  sessionXpEarned: 0,
  rankLevel: 1,
  rankTitle: 'Private',
  rankProgressPct: 0,
  rangeDistanceMeters: null,
  targetingEnemy: false,
  showScoreboard: false,
  showOnboarding: false,
  lowHealthPulse: false,
  match: {
    phase: 'menu',
    mapId: 'urban',
    mapName: 'Urban Strike',
    blueScore: 0,
    redScore: 0,
    killLimit: DEFAULT_KILL_LIMIT,
    timeRemainingSec: MATCH_DURATION_SEC,
    winner: null,
    participants: [],
    killFeed: [],
  },
  scopeMagnification: 4,
  fps: 0,
};

export interface CreateInitialMatchStateOptions {
  initialRoute: AppRoute;
  settings: GameSettings;
  rank: RankInfo;
}

export function createInitialMatchState({
  initialRoute,
  settings,
  rank,
}: CreateInitialMatchStateOptions): MatchMachineState {
  const gun = WEAPONS[settings.selectedGunId] ?? WEAPONS.ak47;
  const selectedMapId: MapId = initialRoute.view === 'play' ? initialRoute.mapId : 'urban';

  let status: MatchMachineStatus = 'menu';
  let joinCode: string | undefined;

  switch (initialRoute.view) {
    case 'menu':
      status = 'menu';
      break;
    case 'maps':
      status = 'maps';
      break;
    case 'play':
      status = 'offline_paused';
      break;
    case 'custom':
      status = 'custom_menu';
      joinCode = initialRoute.joinCode;
      break;
  }

  return {
    status,
    selectedMapId,
    joinCode,
    settings,
    hud: {
      ...INITIAL_HUD,
      activeWeapon: gun,
      selectedCharacterId: settings.selectedCharacterId,
      equippedGunId: gun.id === 'knife' ? 'ak47' : gun.id,
      queuedGunId: gun.id === 'knife' ? 'ak47' : gun.id,
      knifeCharmId: settings.knifeCharmId,
      weaponSlots: [
        { id: gun.id === 'knife' ? 'ak47' : gun.id, ammoInMag: gun.magSize, reserveAmmo: gun.reserveMax },
        { id: 'knife', ammoInMag: 0, reserveAmmo: 0 },
      ],
      xp: rank.xp,
      rankLevel: rank.level,
      rankTitle: rank.title,
      rankProgressPct: rank.progressPct,
      match: {
        ...INITIAL_HUD.match,
        mapId: selectedMapId,
      },
    },
    contextLost: false,
    lobbySnapshot: null,
    disconnectError: null,
    systemNotice: null,
    connectionEpoch: 0,
  };
}

export function isActiveMultiplayerStatus(status: MatchMachineStatus): boolean {
  return status === 'mp_lobby' || status === 'mp_playing' || status === 'mp_ended';
}

export function isMultiplayerOrConnecting(status: MatchMachineStatus): boolean {
  return status === 'mp_connecting' || isActiveMultiplayerStatus(status);
}

export function isOfflineMatchStatus(status: MatchMachineStatus): boolean {
  return status === 'offline_playing' || status === 'offline_paused' || status === 'offline_ended';
}

export function isGameplayShortcutBlocked(state: MatchMachineState): boolean {
  return (
    isOfflineMatchStatus(state.status) ||
    state.status === 'mp_playing' ||
    state.status === 'mp_ended'
  );
}

export function deriveActiveRoute(state: MatchMachineState): AppRoute {
  switch (state.status) {
    case 'menu':
      return { view: 'menu' };
    case 'maps':
      return { view: 'maps' };
    case 'custom_menu':
    case 'mp_connecting':
      return { view: 'custom', joinCode: state.joinCode };
    case 'mp_lobby':
    case 'mp_playing':
    case 'mp_ended':
      return { view: 'custom' };
    case 'offline_playing':
    case 'offline_paused':
    case 'offline_ended':
      return { view: 'play', mapId: state.selectedMapId };
  }
}

export function derivePostMatchStats(hud: HudState): PostMatchStats {
  const localParticipant = hud.match.participants.find((participant) => participant.isPlayer);
  const accuracyPct = hud.shotsFired > 0 ? Math.round((hud.shotsHit / hud.shotsFired) * 100) : 0;
  return {
    kills: localParticipant?.kills ?? hud.eliminations,
    deaths: localParticipant?.deaths ?? 0,
    accuracyPct,
    headshots: hud.headshots,
  };
}

export function selectMatchMvp(
  participants: readonly MatchParticipant[],
  playerStats: PostMatchStats
): MatchMvpSummary | null {
  if (participants.length === 0) {
    if (playerStats.kills === 0 && playerStats.deaths === 0 && playerStats.headshots === 0) {
      return null;
    }
    const combatScore =
      playerStats.kills * 100 +
      playerStats.headshots * 50 +
      (playerStats.kills > 0 ? Math.round(playerStats.accuracyPct * 0.5) : 0);
    const kdRatio =
      playerStats.deaths > 0
        ? Math.round((playerStats.kills / playerStats.deaths) * 100) / 100
        : playerStats.kills;
    return {
      id: 'player',
      name: 'You',
      team: 'blue',
      isPlayer: true,
      isBot: false,
      kills: playerStats.kills,
      deaths: playerStats.deaths,
      kdRatio,
      combatScore,
      headshots: playerStats.headshots,
      accuracyPct: playerStats.accuracyPct,
    };
  }

  const scored: MatchMvpSummary[] = participants.map((participant) => {
    const kills = participant.isPlayer ? playerStats.kills : participant.kills;
    const deaths = participant.isPlayer ? playerStats.deaths : participant.deaths;
    const headshots = participant.isPlayer ? playerStats.headshots : null;
    const accuracyPct = participant.isPlayer ? playerStats.accuracyPct : null;
    const combatScore =
      kills * 100 +
      (headshots !== null ? headshots * 50 : 0) +
      (accuracyPct !== null && kills > 0 ? Math.round(accuracyPct * 0.5) : 0);
    const kdRatio = deaths > 0 ? Math.round((kills / deaths) * 100) / 100 : kills;

    return {
      id: participant.id,
      name: participant.name,
      team: participant.team,
      isPlayer: participant.isPlayer,
      isBot: !participant.isPlayer && participant.id.startsWith('bot_'),
      kills,
      deaths,
      kdRatio,
      combatScore,
      headshots,
      accuracyPct,
    };
  });

  scored.sort(
    (a, b) =>
      b.combatScore - a.combatScore ||
      a.deaths - b.deaths ||
      b.kills - a.kills ||
      Number(b.isPlayer) - Number(a.isPlayer)
  );

  return scored[0] ?? null;
}

function mapSnapshotPhaseToStatus(phase: LobbyRoomSnapshot['phase']): MatchMachineStatus {
  switch (phase) {
    case 'lobby':
      return 'mp_lobby';
    case 'playing':
      return 'mp_playing';
    case 'ended':
      return 'mp_ended';
  }
}

export function matchReducer(
  state: MatchMachineState,
  action: MatchMachineAction
): MatchMachineState {
  switch (action.type) {
    case 'NAVIGATE_MENU': {
      const leavingMp = isMultiplayerOrConnecting(state.status);
      return {
        ...state,
        status: 'menu',
        joinCode: undefined,
        lobbySnapshot: null,
        disconnectError: null,
        systemNotice: null,
        connectionEpoch: leavingMp ? state.connectionEpoch + 1 : state.connectionEpoch,
        hud:
          state.hud.match.phase === 'menu'
            ? state.hud
            : {
                ...state.hud,
                match: { ...state.hud.match, phase: 'menu' },
              },
      };
    }

    case 'OPEN_MAP_SELECT': {
      if (state.status !== 'menu' && state.status !== 'maps') {
        return state;
      }
      return {
        ...state,
        status: 'maps',
        disconnectError: null,
      };
    }

    case 'PREVIEW_MAP': {
      if (state.status !== 'menu' && state.status !== 'maps') {
        return state;
      }
      if (state.selectedMapId === action.mapId) {
        return state;
      }
      return {
        ...state,
        selectedMapId: action.mapId,
      };
    }

    case 'START_OFFLINE_MATCH': {
      if (isMultiplayerOrConnecting(state.status)) {
        return state;
      }
      return {
        ...state,
        status: action.requestLock ? 'offline_playing' : 'offline_paused',
        selectedMapId: action.mapId,
        joinCode: undefined,
        lobbySnapshot: null,
        disconnectError: null,
        systemNotice: null,
      };
    }

    case 'RESTART_OFFLINE_MATCH': {
      if (!isOfflineMatchStatus(state.status)) {
        return state;
      }
      return {
        ...state,
        status: 'offline_playing',
        disconnectError: null,
        systemNotice: null,
      };
    }

    case 'OPEN_CUSTOM_MATCH': {
      if (state.status !== 'menu' && state.status !== 'maps' && state.status !== 'custom_menu') {
        return state;
      }
      return {
        ...state,
        status: 'custom_menu',
        joinCode: action.joinCode,
        lobbySnapshot: null,
        disconnectError: null,
        systemNotice: null,
      };
    }

    case 'MP_CONNECT_START': {
      if (state.status !== 'custom_menu') {
        return state;
      }
      return {
        ...state,
        status: 'mp_connecting',
        connectionEpoch: state.connectionEpoch + 1,
        lobbySnapshot: null,
        disconnectError: null,
        systemNotice: null,
      };
    }

    case 'MP_CONNECT_SUCCESS': {
      if (
        action.epoch !== state.connectionEpoch ||
        (state.status !== 'mp_connecting' && !isActiveMultiplayerStatus(state.status))
      ) {
        return state;
      }
      return {
        ...state,
        status: mapSnapshotPhaseToStatus(action.snapshot.phase),
        selectedMapId: action.snapshot.mapId,
        joinCode: undefined,
        lobbySnapshot: action.snapshot,
        disconnectError: null,
      };
    }

    case 'MP_CONNECT_FAILURE': {
      if (state.status !== 'mp_connecting' || action.epoch !== state.connectionEpoch) {
        return state;
      }
      return {
        ...state,
        status: 'custom_menu',
        lobbySnapshot: null,
      };
    }

    case 'MP_CONNECT_CANCEL': {
      if (state.status !== 'mp_connecting') {
        return state;
      }
      return {
        ...state,
        status: 'custom_menu',
        connectionEpoch: state.connectionEpoch + 1,
        lobbySnapshot: null,
      };
    }

    case 'MP_STATE_SYNC': {
      if (action.epoch !== undefined && action.epoch !== state.connectionEpoch) {
        return state;
      }
      if (!isMultiplayerOrConnecting(state.status)) {
        return state;
      }
      return {
        ...state,
        status: mapSnapshotPhaseToStatus(action.snapshot.phase),
        selectedMapId: action.snapshot.mapId,
        joinCode: undefined,
        lobbySnapshot: action.snapshot,
        disconnectError: null,
      };
    }

    case 'MP_SYSTEM_NOTICE': {
      if (!isActiveMultiplayerStatus(state.status)) {
        return state;
      }
      return {
        ...state,
        systemNotice: action.message,
      };
    }

    case 'CLEAR_SYSTEM_NOTICE': {
      if (state.systemNotice === null) {
        return state;
      }
      return {
        ...state,
        systemNotice: null,
      };
    }

    case 'MP_DISCONNECTED': {
      if (!isMultiplayerOrConnecting(state.status)) {
        return state;
      }
      return {
        ...state,
        status: 'custom_menu',
        connectionEpoch: state.connectionEpoch + 1,
        joinCode: undefined,
        lobbySnapshot: null,
        systemNotice: null,
        disconnectError: action.reason,
      };
    }

    case 'LEAVE_MULTIPLAYER': {
      const leavingMp = isMultiplayerOrConnecting(state.status);
      return {
        ...state,
        status: 'menu',
        connectionEpoch: leavingMp ? state.connectionEpoch + 1 : state.connectionEpoch,
        joinCode: undefined,
        lobbySnapshot: null,
        disconnectError: null,
        systemNotice: null,
        hud:
          state.hud.match.phase === 'menu'
            ? state.hud
            : {
                ...state.hud,
                match: { ...state.hud.match, phase: 'menu' },
              },
      };
    }

    case 'POPSTATE_ROUTE': {
      const nextRoute = action.route;

      // Preserve an active multiplayer session only if popstate landed on bare /custom
      if (
        nextRoute.view === 'custom' &&
        !nextRoute.joinCode &&
        isActiveMultiplayerStatus(state.status)
      ) {
        return state;
      }

      const leavingMp = isMultiplayerOrConnecting(state.status);
      const nextEpoch = leavingMp ? state.connectionEpoch + 1 : state.connectionEpoch;

      switch (nextRoute.view) {
        case 'menu':
          return {
            ...state,
            status: 'menu',
            connectionEpoch: nextEpoch,
            joinCode: undefined,
            lobbySnapshot: null,
            disconnectError: null,
            systemNotice: null,
          };
        case 'maps':
          return {
            ...state,
            status: 'maps',
            connectionEpoch: nextEpoch,
            joinCode: undefined,
            lobbySnapshot: null,
            disconnectError: null,
            systemNotice: null,
          };
        case 'play':
          return {
            ...state,
            status: 'offline_paused',
            selectedMapId: nextRoute.mapId,
            connectionEpoch: nextEpoch,
            joinCode: undefined,
            lobbySnapshot: null,
            disconnectError: null,
            systemNotice: null,
          };
        case 'custom':
          return {
            ...state,
            status: 'custom_menu',
            connectionEpoch: nextEpoch,
            joinCode: nextRoute.joinCode,
            lobbySnapshot: null,
            disconnectError: null,
            systemNotice: null,
          };
      }
    }

    case 'HUD_UPDATED': {
      let nextStatus = state.status;
      if (isOfflineMatchStatus(state.status)) {
        switch (action.hud.match.phase) {
          case 'playing':
            nextStatus = 'offline_playing';
            break;
          case 'paused':
            nextStatus = 'offline_paused';
            break;
          case 'ended':
            nextStatus = 'offline_ended';
            break;
          case 'menu':
            // Preserve offline status; returning to menu happens explicitly via NAVIGATE_MENU / POPSTATE_ROUTE
            break;
        }
      }

      return {
        ...state,
        status: nextStatus,
        hud: action.hud,
      };
    }

    case 'SETTINGS_UPDATED': {
      return {
        ...state,
        settings: action.settings,
      };
    }

    case 'SET_CONTEXT_LOST': {
      if (state.contextLost === action.lost) {
        return state;
      }
      return {
        ...state,
        contextLost: action.lost,
      };
    }
  }
}
