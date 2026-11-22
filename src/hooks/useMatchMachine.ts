import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { EngineManager, InitProgressState } from '../game/EngineManager';
import {
  BOMB_ROUND_DURATION_SEC,
  BOMB_ROUNDS_TO_WIN,
  GameMode,
  getModeDefaultLimits,
  normalizeGameMode,
} from '../game/gameModeRules';
import {
  CharacterId,
  GameSettings,
  GunId,
  KnifeCharmId,
  TacticalEquipmentId,
  WeaponId,
} from '../game/types';
import { MapId, TeamId } from '../maps/types';
import {
  createInitialMatchState,
  deriveActiveRoute,
  derivePostMatchStats,
  isActiveMultiplayerStatus,
  isGameplayShortcutBlocked,
  isMultiplayerOrConnecting,
  MatchMachineAction,
  MatchMachineState,
  matchReducer,
  PostMatchStats,
} from '../match/matchMachine';
import { ChatChannel, ChatMessage } from '../multiplayer/chat';
import { NetworkManager } from '../multiplayer/NetworkManager';
import {
  CreatePrivateMatchOptions,
  LobbyPlayerInfo,
  LobbyRoomSnapshot,
  RoomLookupSummary,
} from '../multiplayer/types';
import { getRankSummary, loadProgression } from '../settings/progressionStorage';
import {
  loadPersistedSettings,
  resetPersistedSettings,
  savePersistedSettings,
} from '../settings/settingsStorage';
import { toggleFullscreen } from '../utils/fullscreen';
import { navigateToRoute, parseRouteFromLocation } from '../utils/router';
import { registerUiAudioHandler } from '../utils/uiAudio';

function buildSoloLobbyPlayers(
  localTeam: TeamId,
  botCount: number,
  playerName: string,
  characterId: CharacterId,
  weaponId: WeaponId
): LobbyPlayerInfo[] {
  const safeName = playerName.trim() || 'Operator-101';
  const players: LobbyPlayerInfo[] = [
    {
      id: 'player',
      name: safeName,
      team: localTeam,
      isBot: false,
      isHost: true,
      ready: true,
      isAlive: true,
      respawnTimer: 0,
      x: 0,
      y: 0,
      z: localTeam === 'blue' ? -20 : 20,
      rotY: localTeam === 'blue' ? 0 : Math.PI,
      pitch: 0,
      characterId,
      weaponId,
      stance: 'stand',
      health: 100,
      kills: 0,
      deaths: 0,
    },
  ];

  const blueNames = ['Vanguard-1', 'Ghost-2', 'Echo-3', 'Specter-4', 'Nomad-5'];
  const redNames = ['Viper-1', 'Talon-2', 'Reaper-3', 'Jackal-4', 'Raven-5'];
  let blueTotal = localTeam === 'blue' ? 1 : 0;
  let redTotal = localTeam === 'red' ? 1 : 0;
  let blueBots = 0;
  let redBots = 0;

  for (let i = 0; i < botCount; i++) {
    const team: TeamId = blueTotal <= redTotal ? 'blue' : 'red';
    if (team === 'blue') {
      blueTotal++;
      blueBots++;
    } else {
      redTotal++;
      redBots++;
    }
    const callsign =
      team === 'blue'
        ? blueNames[blueBots - 1] ?? `Blue-${blueBots}`
        : redNames[redBots - 1] ?? `Red-${redBots}`;
    players.push({
      id: `solo_bot_${i + 1}`,
      name: callsign,
      team,
      isBot: true,
      isHost: false,
      ready: true,
      isAlive: true,
      respawnTimer: 0,
      x: 0,
      y: 0,
      z: team === 'blue' ? -20 : 20,
      rotY: team === 'blue' ? 0 : Math.PI,
      pitch: 0,
      characterId: 'assault',
      weaponId: 'ak47',
      stance: 'stand',
      health: 100,
      kills: 0,
      deaths: 0,
    });
  }

  return players;
}

export interface MatchMachineDerived {
  isMultiplayerInMatch: boolean;
  isMultiplayerHost: boolean;
  isCustomMatch: boolean;
  chatMessages: ChatMessage[];
  chatOpen: boolean;
  chatChannel: ChatChannel;
  postMatchStats: PostMatchStats;
  initProgress: InitProgressState;
  connectStage: string | null;
}

export interface MatchMachineActions {
  updateSettings: (next: GameSettings) => void;
  updateCallsign: (callsign: string) => void;
  resetSettings: () => void;
  playOfflineTdm: () => void;
  openCustomMatch: () => void;
  openMapSelect: () => void;
  previewMap: (mapId: MapId) => void;
  deployMap: (mapId: MapId) => void;
  backToMenu: () => void;
  resumeMatch: () => void;
  restartMatch: () => void;
  selectCharacter: (id: CharacterId, equipSignatureGun?: boolean) => void;
  selectGun: (id: GunId) => void;
  selectKnifeCharm: (id: KnifeCharmId) => void;
  selectTacticalEquipment: (id: TacticalEquipmentId) => void;
  previewShowcase: (focus: 'gun' | 'knife', offsetX?: number) => void;
  lookupRoom: (roomCode: string) => Promise<RoomLookupSummary>;
  createPrivateMatch: (options: CreatePrivateMatchOptions) => Promise<void>;
  createSoloCustomLobby: (options: CreatePrivateMatchOptions) => void;
  joinPrivateMatch: (roomCode: string, playerName: string, password?: string) => Promise<void>;
  cancelMpConnect: () => void;
  leaveMultiplayer: () => Promise<void>;
  returnToLobby: () => void;
  updateRoomConfig: (patch: Partial<CreatePrivateMatchOptions>) => void;
  balanceRoomTeams: () => void;
  kickRoomPlayer: (targetId: string) => void;
  startRoomMatch: () => void;
  switchRoomTeam: () => void;
  toggleRoomReady: () => void;
  sendChatMessage: (text: string, channel?: ChatChannel) => void;
  setChatChannel: (channel: ChatChannel) => void;
  closeInMatchChat: (restorePointerLock: boolean) => void;
  respawnPlayer: () => void;
  startHighlightReplay: (mvpId?: string) => void;
  stopHighlightReplay: () => void;
}

export function useMatchMachine() {
  const [state, dispatch] = useReducer(matchReducer, undefined, () =>
    createInitialMatchState({
      initialRoute: parseRouteFromLocation(),
      settings: loadPersistedSettings(),
      rank: getRankSummary(loadProgression().xp),
    })
  );

  const [initProgress, setInitProgress] = useState<InitProgressState>({
    active: true,
    progress: 12,
    stage: 'Initializing 3D viewport',
  });
  const [connectStage, setConnectStage] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatChannel, setChatChannel] = useState<ChatChannel>('all');

  const stateRef = useRef<MatchMachineState>(state);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<EngineManager | null>(null);
  const networkRef = useRef<NetworkManager | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const dispatchAction = useCallback((action: MatchMachineAction): MatchMachineState => {
    const nextState = matchReducer(stateRef.current, action);
    stateRef.current = nextState;
    dispatch(action);
    return nextState;
  }, []);

  const clearNoticeTimer = useCallback(() => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
  }, []);

  // Initialize Babylon EngineManager and Colyseus NetworkManager once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const network = new NetworkManager({
      onStateUpdate: (snapshot, epoch) => {
        if (epoch !== undefined && epoch !== stateRef.current.connectionEpoch) {
          return;
        }
        const prevStatus = stateRef.current.status;
        if (!isMultiplayerOrConnecting(prevStatus)) {
          return;
        }
        const nextState = dispatchAction({ type: 'MP_STATE_SYNC', snapshot, epoch });
        if (!isMultiplayerOrConnecting(nextState.status)) {
          return;
        }
        if (prevStatus === 'mp_connecting' && isActiveMultiplayerStatus(nextState.status)) {
          navigateToRoute(deriveActiveRoute(nextState));
        }
        engineRef.current?.syncMultiplayerState(snapshot);
      },
      onRemoteFire: (event) => {
        engineRef.current?.handleRemoteFire(event);
      },
      onHitConfirm: (event) => {
        engineRef.current?.handleNetworkHitConfirm(event);
      },
      onPlayerDamaged: (event) => {
        engineRef.current?.handleNetworkDamaged(event);
      },
      onPlayerRespawn: (pos) => {
        engineRef.current?.handleNetworkRespawn(pos);
      },
      onKillFeed: (event) => {
        engineRef.current?.handleNetworkKillFeed(event);
      },
      onTeamPing: (event) => {
        engineRef.current?.handleNetworkPing(event);
      },
      onChatUpdate: (messages) => {
        setChatMessages(messages);
      },
      onSystemNotice: (message, epoch) => {
        if (epoch !== undefined && epoch !== stateRef.current.connectionEpoch) {
          return;
        }
        if (!isActiveMultiplayerStatus(stateRef.current.status)) {
          return;
        }
        dispatchAction({ type: 'MP_SYSTEM_NOTICE', message, epoch });
        clearNoticeTimer();
        noticeTimerRef.current = window.setTimeout(() => {
          noticeTimerRef.current = null;
          dispatchAction({ type: 'CLEAR_SYSTEM_NOTICE' });
        }, 3500);
      },
      onDisconnected: (reason, epoch) => {
        if (epoch !== undefined && epoch !== stateRef.current.connectionEpoch) {
          return;
        }
        const wasMp = isMultiplayerOrConnecting(stateRef.current.status);
        const nextState = dispatchAction({ type: 'MP_DISCONNECTED', reason, epoch });
        if (!wasMp) {
          return;
        }
        clearNoticeTimer();
        setChatOpen(false);
        setChatMessages([]);
        navigateToRoute(deriveActiveRoute(nextState));
        engineRef.current?.returnToMenu();
      },
    });
    networkRef.current = network;

    const manager = new EngineManager(canvas, stateRef.current.settings, {
      onHudUpdate: (nextHud) => {
        dispatchAction({ type: 'HUD_UPDATED', hud: nextHud });
      },
      onContextLost: (lost) => {
        dispatchAction({ type: 'SET_CONTEXT_LOST', lost });
      },
      onInitProgress: (nextProgress) => {
        setInitProgress(nextProgress);
      },
      onMultiplayerShot: (payload) => {
        networkRef.current?.sendFire(payload);
      },
      onMultiplayerMove: (x, y, z, rotY, pitch, weaponId, characterId, stance) => {
        networkRef.current?.sendMove(x, y, z, rotY, pitch, weaponId, characterId, stance);
      },
      onMultiplayerPing: (payload) => {
        networkRef.current?.sendPing(payload);
      },
      onGunPersistedChange: (gunId) => {
        networkRef.current?.selectLoadout(gunId);
        const saved = savePersistedSettings({
          ...stateRef.current.settings,
          selectedGunId: gunId,
        });
        dispatchAction({ type: 'SETTINGS_UPDATED', settings: saved });
      },
      onChatOpenChange: (open, channel) => {
        setChatOpen(open);
        if (open) {
          const activeMode =
            stateRef.current.lobbySnapshot?.mode ??
            normalizeGameMode(stateRef.current.settings.selectedGameMode, 'tdm');
          setChatChannel(activeMode === 'ffa' ? 'all' : channel);
        }
      },
      onMultiplayerBombInteract: (holding) => {
        networkRef.current?.sendBombInteract(holding);
      },
      onMultiplayerRespawnRequest: (gunId) => {
        networkRef.current?.requestRespawn(gunId);
      },
    });
    engineRef.current = manager;
    registerUiAudioHandler((cue) => {
      engineRef.current?.playUiAudioCue(cue);
    });

    const onDocumentClick = (event: MouseEvent) => {
      if (document.pointerLockElement) return;
      const target = event.target as HTMLElement | null;
      if (!target || target === canvas) return;
      const interactive = target.closest(
        'button, [role="tab"], [role="switch"], select, input[type="checkbox"], input[type="radio"]'
      ) as HTMLElement | null;
      if (!interactive) return;
      if ((interactive as HTMLButtonElement).disabled || interactive.getAttribute('aria-disabled') === 'true') {
        return;
      }
      if (interactive.dataset.uiSound === 'none') return;
      const isToggle =
        interactive.getAttribute('role') === 'switch' ||
        interactive.getAttribute('aria-pressed') !== null;
      manager.playUiAudioCue(isToggle ? 'toggle' : 'click');
    };
    document.addEventListener('click', onDocumentClick);

    // Handle initial direct URL route (e.g. /map/:id)
    if (stateRef.current.status === 'offline_paused') {
      manager.startMatch(stateRef.current.selectedMapId, false);
    }

    return () => {
      document.removeEventListener('click', onDocumentClick);
      registerUiAudioHandler(null);
      clearNoticeTimer();
      void network.leaveRoom();
      networkRef.current = null;
      manager.dispose();
      engineRef.current = null;
    };
  }, [clearNoticeTimer, dispatchAction]);

  // Synchronize browser history back/forward navigation with machine & Engine/Network layers
  useEffect(() => {
    const onPopState = () => {
      const nextRoute = parseRouteFromLocation();
      const wasActiveMp = isMultiplayerOrConnecting(stateRef.current.status);
      const nextState = dispatchAction({ type: 'POPSTATE_ROUTE', route: nextRoute });
      const stillInMp = isMultiplayerOrConnecting(nextState.status);

      if (wasActiveMp && !stillInMp) {
        clearNoticeTimer();
        setChatOpen(false);
        setChatMessages([]);
        if (networkRef.current?.isConnected()) {
          void networkRef.current.leaveRoom();
        }
      }

      if (stillInMp) {
        return;
      }

      if (nextRoute.view === 'play') {
        engineRef.current?.startMatch(nextRoute.mapId, false);
      } else {
        engineRef.current?.previewMap(nextState.selectedMapId);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [clearNoticeTimer, dispatchAction]);

  // Sync 3D operator showcase visibility strictly to 'menu' state
  const isMenu = state.status === 'menu';
  useEffect(() => {
    engineRef.current?.setMenuShowcaseVisible(isMenu);
    if (!isMenu) {
      engineRef.current?.setMenuShowcaseFocus('gun', 0);
    }
  }, [isMenu]);

  // Global fullscreen shortcut (disabled during active gameplay & text input)
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'KeyF' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.pointerLockElement || isGameplayShortcutBlocked(stateRef.current)) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      e.preventDefault();
      void toggleFullscreen();
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  const updateSettings = useCallback(
    (next: GameSettings) => {
      const saved = savePersistedSettings(next);
      dispatchAction({ type: 'SETTINGS_UPDATED', settings: saved });
      engineRef.current?.updateSettings(saved);
    },
    [dispatchAction]
  );

  const updateCallsign = useCallback(
    (callsign: string) => {
      const saved = savePersistedSettings({ ...stateRef.current.settings, callsign });
      dispatchAction({ type: 'SETTINGS_UPDATED', settings: saved });
      engineRef.current?.updateSettings(saved);
    },
    [dispatchAction]
  );

  const resetSettings = useCallback(() => {
    const reset = resetPersistedSettings();
    dispatchAction({ type: 'SETTINGS_UPDATED', settings: reset });
    engineRef.current?.updateSettings(reset);
  }, [dispatchAction]);

  const playOfflineTdm = useCallback(() => {
    const mapId = stateRef.current.selectedMapId;
    const mode: GameMode = normalizeGameMode(stateRef.current.settings.selectedGameMode, 'tdm');
    networkRef.current?.clearChatMessages();
    setChatMessages([]);
    setChatOpen(false);
    const nextState = dispatchAction({
      type: 'START_OFFLINE_MATCH',
      mapId,
      requestLock: true,
      isCustomMatch: false,
    });
    if (nextState.status !== 'offline_playing') return;
    navigateToRoute(deriveActiveRoute(nextState));
    engineRef.current?.startMatch(mapId, true, { mode });
  }, [dispatchAction]);

  const openCustomMatch = useCallback(() => {
    const nextState = dispatchAction({ type: 'OPEN_CUSTOM_MATCH' });
    if (nextState.status !== 'custom_menu') return;
    navigateToRoute(deriveActiveRoute(nextState));
  }, [dispatchAction]);

  const openMapSelect = useCallback(() => {
    const nextState = dispatchAction({ type: 'OPEN_MAP_SELECT' });
    if (nextState.status !== 'maps') return;
    navigateToRoute(deriveActiveRoute(nextState));
  }, [dispatchAction]);

  const previewMap = useCallback(
    (mapId: MapId) => {
      const prevStatus = stateRef.current.status;
      if (prevStatus !== 'menu' && prevStatus !== 'maps') return;
      dispatchAction({ type: 'PREVIEW_MAP', mapId });
      engineRef.current?.previewMap(mapId);
    },
    [dispatchAction]
  );

  const deployMap = useCallback(
    (mapId: MapId) => {
      const mode: GameMode = normalizeGameMode(stateRef.current.settings.selectedGameMode, 'tdm');
      networkRef.current?.clearChatMessages();
      setChatMessages([]);
      setChatOpen(false);
      const nextState = dispatchAction({
        type: 'START_OFFLINE_MATCH',
        mapId,
        requestLock: true,
        isCustomMatch: false,
      });
      if (nextState.status !== 'offline_playing') return;
      navigateToRoute(deriveActiveRoute(nextState));
      engineRef.current?.startMatch(mapId, true, { mode });
    },
    [dispatchAction]
  );

  const backToMenu = useCallback(() => {
    const wasMp = isMultiplayerOrConnecting(stateRef.current.status);
    clearNoticeTimer();
    setChatOpen(false);
    networkRef.current?.clearChatMessages();
    setChatMessages([]);
    const nextState = dispatchAction({ type: 'NAVIGATE_MENU' });
    if (wasMp || networkRef.current?.isConnected()) {
      void networkRef.current?.leaveRoom();
    }
    navigateToRoute(deriveActiveRoute(nextState));
    engineRef.current?.returnToMenu();
  }, [clearNoticeTimer, dispatchAction]);

  const resumeMatch = useCallback(() => {
    engineRef.current?.resumeMatch();
  }, []);

  const respawnPlayer = useCallback(() => {
    engineRef.current?.respawnLocalPlayer();
  }, []);

  const restartMatch = useCallback(() => {
    if (isMultiplayerOrConnecting(stateRef.current.status)) {
      return;
    }
    dispatchAction({ type: 'RESTART_OFFLINE_MATCH' });
    engineRef.current?.restartMatch();
  }, [dispatchAction]);

  const selectCharacter = useCallback(
    (id: CharacterId, equipSignatureGun = true) => {
      const outcome = engineRef.current?.selectCharacter(id, equipSignatureGun);
      const nextGun =
        equipSignatureGun && outcome?.signatureGunId ? outcome.signatureGunId : undefined;
      networkRef.current?.selectLoadout(nextGun, id);
      const prev = stateRef.current.settings;
      const saved = savePersistedSettings({
        ...prev,
        selectedCharacterId: id,
        selectedGunId: nextGun ?? prev.selectedGunId,
      });
      dispatchAction({ type: 'SETTINGS_UPDATED', settings: saved });
    },
    [dispatchAction]
  );

  const selectGun = useCallback(
    (id: GunId) => {
      engineRef.current?.selectGun(id);
      networkRef.current?.selectLoadout(id);
      const saved = savePersistedSettings({
        ...stateRef.current.settings,
        selectedGunId: id,
      });
      dispatchAction({ type: 'SETTINGS_UPDATED', settings: saved });
    },
    [dispatchAction]
  );

  const selectKnifeCharm = useCallback(
    (id: KnifeCharmId) => {
      engineRef.current?.selectKnifeCharm(id);
      const saved = savePersistedSettings({
        ...stateRef.current.settings,
        knifeCharmId: id,
      });
      dispatchAction({ type: 'SETTINGS_UPDATED', settings: saved });
    },
    [dispatchAction]
  );

  const selectTacticalEquipment = useCallback(
    (id: TacticalEquipmentId) => {
      engineRef.current?.selectTacticalEquipment(id);
      const saved = savePersistedSettings({
        ...stateRef.current.settings,
        tacticalEquipmentId: id,
      });
      dispatchAction({ type: 'SETTINGS_UPDATED', settings: saved });
    },
    [dispatchAction]
  );

  const previewShowcase = useCallback((focus: 'gun' | 'knife', offsetX = 0) => {
    engineRef.current?.setMenuShowcaseFocus(focus, offsetX);
  }, []);

  const lookupRoom = useCallback(async (roomCode: string): Promise<RoomLookupSummary> => {
    if (!networkRef.current) {
      throw new Error('Network client not initialized.');
    }
    return networkRef.current.lookupRoom(roomCode);
  }, []);

  const createPrivateMatch = useCallback(
    async (options: CreatePrivateMatchOptions) => {
      const network = networkRef.current;
      if (!network) {
        throw new Error('Network client not initialized.');
      }
      if (stateRef.current.status !== 'custom_menu') {
        throw new Error('A multiplayer connection attempt is already in progress.');
      }

      const started = dispatchAction({ type: 'MP_CONNECT_START' });
      if (started.status !== 'mp_connecting') {
        throw new Error('A multiplayer connection attempt is already in progress.');
      }
      setConnectStage('Creating private match room...');
      const epoch = started.connectionEpoch;
      const latestSettings = stateRef.current.settings;

      try {
        const snapshot = await network.createPrivateMatch(
          {
            ...options,
            characterId: latestSettings.selectedCharacterId,
            weaponId: latestSettings.selectedGunId,
          },
          epoch
        );

        if (stateRef.current.connectionEpoch !== epoch) {
          await network.leaveRoomIfEpoch(epoch);
          return;
        }

        const synced = dispatchAction({ type: 'MP_CONNECT_SUCCESS', epoch, snapshot });
        setConnectStage(null);
        navigateToRoute(deriveActiveRoute(synced));
        engineRef.current?.syncMultiplayerState(snapshot);
      } catch (err) {
        if (stateRef.current.connectionEpoch === epoch) {
          setConnectStage(null);
          dispatchAction({ type: 'MP_CONNECT_FAILURE', epoch });
          throw err;
        }
      }
    },
    [dispatchAction]
  );

  const createSoloCustomLobby = useCallback(
    (options: CreatePrivateMatchOptions) => {
      if (stateRef.current.status !== 'custom_menu') return;
      const latestSettings = stateRef.current.settings;
      const safeName = options.playerName.trim() || latestSettings.callsign || 'Operator-101';
      if (safeName !== latestSettings.callsign) {
        const saved = savePersistedSettings({ ...latestSettings, callsign: safeName });
        dispatchAction({ type: 'SETTINGS_UPDATED', settings: saved });
      }
      const mode = normalizeGameMode(options.mode, 'tdm');
      const defaults = getModeDefaultLimits(mode);
      const roundsToWin =
        mode === 'bomb'
          ? Math.max(1, Math.min(13, options.killLimit || BOMB_ROUNDS_TO_WIN))
          : 1;
      const killLimit = mode === 'bomb' ? roundsToWin : options.killLimit || defaults.killLimit;
      const timeLimit = options.timeLimit || defaults.timeLimitSec;
      const snapshot: LobbyRoomSnapshot = {
        roomCode: 'SOLO01',
        roomName: options.roomName.trim() || 'Solo Custom Lobby',
        mapId: options.mapId,
        mode,
        phase: 'lobby',
        killLimit,
        timeLimit,
        timeRemaining: timeLimit,
        respawnDelay: mode === 'bomb' ? 0 : options.respawnDelay ?? defaults.respawnDelaySec,
        friendlyFire: options.friendlyFire,
        botCount: options.botCount,
        hasPassword: false,
        hostId: 'player',
        blueScore: 0,
        redScore: 0,
        roundNumber: 1,
        roundsToWin,
        winner: '',
        bombState: null,
        players: buildSoloLobbyPlayers(
          'blue',
          options.botCount,
          safeName,
          latestSettings.selectedCharacterId,
          latestSettings.selectedGunId
        ),
        localPlayerId: 'player',
        isLocalSolo: true,
      };
      networkRef.current?.clearChatMessages();
      setChatMessages([]);
      setChatOpen(false);
      networkRef.current?.pushSystemNoticeToChat(
        `${safeName} opened Solo Custom lobby (${snapshot.roomName}). Local chat active.`
      );
      const nextState = dispatchAction({ type: 'OPEN_SOLO_CUSTOM_LOBBY', snapshot });
      navigateToRoute(deriveActiveRoute(nextState));
      engineRef.current?.previewMap(snapshot.mapId);
    },
    [dispatchAction]
  );

  const joinPrivateMatch = useCallback(
    async (roomCode: string, playerName: string, password?: string) => {
      const network = networkRef.current;
      if (!network) {
        throw new Error('Network client not initialized.');
      }
      if (stateRef.current.status !== 'custom_menu') {
        throw new Error('A multiplayer connection attempt is already in progress.');
      }

      const started = dispatchAction({ type: 'MP_CONNECT_START' });
      if (started.status !== 'mp_connecting') {
        throw new Error('A multiplayer connection attempt is already in progress.');
      }
      const normalizedCode = roomCode.trim().toUpperCase();
      setConnectStage(`Joining room ${normalizedCode}...`);
      const epoch = started.connectionEpoch;
      const latestSettings = stateRef.current.settings;

      try {
        const snapshot = await network.joinPrivateMatch(
          roomCode,
          playerName,
          password,
          latestSettings.selectedCharacterId,
          latestSettings.selectedGunId,
          epoch
        );

        if (stateRef.current.connectionEpoch !== epoch) {
          await network.leaveRoomIfEpoch(epoch);
          return;
        }

        const synced = dispatchAction({ type: 'MP_CONNECT_SUCCESS', epoch, snapshot });
        setConnectStage(null);
        navigateToRoute(deriveActiveRoute(synced));
        engineRef.current?.syncMultiplayerState(snapshot);
      } catch (err) {
        if (stateRef.current.connectionEpoch === epoch) {
          setConnectStage(null);
          dispatchAction({ type: 'MP_CONNECT_FAILURE', epoch });
          throw err;
        }
      }
    },
    [dispatchAction]
  );

  const cancelMpConnect = useCallback(() => {
    const cancelEpoch = stateRef.current.connectionEpoch;
    setConnectStage(null);
    dispatchAction({ type: 'MP_CONNECT_CANCEL', epoch: cancelEpoch });
    void networkRef.current?.leaveRoom();
  }, [dispatchAction]);

  const leaveMultiplayer = useCallback(async () => {
    clearNoticeTimer();
    setConnectStage(null);
    setChatOpen(false);
    networkRef.current?.clearChatMessages();
    setChatMessages([]);
    const nextState = dispatchAction({ type: 'LEAVE_MULTIPLAYER' });
    navigateToRoute(deriveActiveRoute(nextState));
    engineRef.current?.returnToMenu();
    await networkRef.current?.leaveRoom();
  }, [clearNoticeTimer, dispatchAction]);

  const returnToLobby = useCallback(() => {
    if (stateRef.current.lobbySnapshot?.isLocalSolo) {
      setChatOpen(false);
      const nextState = dispatchAction({ type: 'RETURN_SOLO_CUSTOM_LOBBY' });
      navigateToRoute(deriveActiveRoute(nextState));
      engineRef.current?.previewMap(nextState.selectedMapId);
      networkRef.current?.pushSystemNoticeToChat('Returned to Solo Custom lobby.');
      return;
    }
    engineRef.current?.stopHighlightReplay(false);
    networkRef.current?.returnToLobby();
  }, [dispatchAction]);

  const updateRoomConfig = useCallback(
    (patch: Partial<CreatePrivateMatchOptions>) => {
      const snap = stateRef.current.lobbySnapshot;
      if (stateRef.current.status === 'local_custom_lobby' && snap?.isLocalSolo) {
        const localPlayer = snap.players.find((p) => p.id === snap.localPlayerId);
        const nextBotCount =
          typeof patch.botCount === 'number' ? Math.max(0, Math.min(10, patch.botCount)) : snap.botCount;
        const nextMapId = patch.mapId ?? snap.mapId;
        const currentMode = normalizeGameMode(snap.mode, 'tdm');
        const nextMode = patch.mode ? normalizeGameMode(patch.mode, currentMode) : currentMode;
        const modeChanged = nextMode !== currentMode;
        const nextDefaults = getModeDefaultLimits(nextMode);
        const nextKillLimit =
          patch.killLimit ?? (modeChanged ? nextDefaults.killLimit : snap.killLimit);
        const nextTimeLimit =
          patch.timeLimit ??
          (modeChanged
            ? nextMode === 'bomb'
              ? BOMB_ROUND_DURATION_SEC
              : nextDefaults.timeLimitSec
            : snap.timeLimit);
        const nextRoundsToWin =
          nextMode === 'bomb'
            ? Math.max(1, Math.min(13, nextKillLimit || BOMB_ROUNDS_TO_WIN))
            : 1;
        const nextSnapshot: LobbyRoomSnapshot = {
          ...snap,
          mapId: nextMapId,
          mode: nextMode,
          killLimit: nextKillLimit,
          roundsToWin: nextRoundsToWin,
          timeLimit: nextTimeLimit,
          timeRemaining: nextTimeLimit,
          respawnDelay: nextMode === 'bomb' ? 0 : nextDefaults.respawnDelaySec,
          friendlyFire: patch.friendlyFire ?? snap.friendlyFire,
          botCount: nextBotCount,
          players: buildSoloLobbyPlayers(
            localPlayer?.team ?? 'blue',
            nextBotCount,
            localPlayer?.name ?? stateRef.current.settings.callsign,
            localPlayer?.characterId ?? stateRef.current.settings.selectedCharacterId,
            localPlayer?.weaponId ?? stateRef.current.settings.selectedGunId
          ),
        };
        dispatchAction({ type: 'UPDATE_SOLO_CUSTOM_LOBBY', snapshot: nextSnapshot });
        if (patch.mapId && patch.mapId !== snap.mapId) {
          engineRef.current?.previewMap(nextMapId);
        }
        networkRef.current?.pushSystemNoticeToChat('Host updated match settings.');
        return;
      }
      networkRef.current?.updateConfig(patch);
    },
    [dispatchAction]
  );

  const balanceRoomTeams = useCallback(() => {
    if (stateRef.current.status === 'local_custom_lobby' && stateRef.current.lobbySnapshot?.isLocalSolo) {
      networkRef.current?.pushSystemNoticeToChat('Host balanced teams.');
      return;
    }
    networkRef.current?.balanceTeams();
  }, []);

  const kickRoomPlayer = useCallback((targetId: string) => {
    networkRef.current?.kickPlayer(targetId);
  }, []);

  const startRoomMatch = useCallback(() => {
    const snap = stateRef.current.lobbySnapshot;
    if (stateRef.current.status === 'local_custom_lobby' && snap?.isLocalSolo) {
      const localPlayer = snap.players.find((p) => p.id === snap.localPlayerId);
      const nextState = dispatchAction({ type: 'START_SOLO_CUSTOM_MATCH' });
      if (nextState.status !== 'offline_playing') return;
      navigateToRoute(deriveActiveRoute(nextState));
      const botsPerTeam = snap.botCount === 0 ? 0 : Math.max(1, Math.ceil(snap.botCount / 2));
      engineRef.current?.startMatch(snap.mapId, true, {
        mode: snap.mode,
        killLimit: snap.killLimit,
        timeLimitSec: snap.timeLimit,
        botsPerTeam,
        isCustomMatch: true,
        playerName: localPlayer?.name ?? stateRef.current.settings.callsign,
      });
      return;
    }
    networkRef.current?.startMatch();
  }, [dispatchAction]);

  const switchRoomTeam = useCallback(() => {
    const snap = stateRef.current.lobbySnapshot;
    if (stateRef.current.status === 'local_custom_lobby' && snap?.isLocalSolo) {
      const localPlayer = snap.players.find((p) => p.id === snap.localPlayerId);
      const nextTeam: TeamId = localPlayer?.team === 'blue' ? 'red' : 'blue';
      const playerName = localPlayer?.name ?? stateRef.current.settings.callsign;
      const nextSnapshot: LobbyRoomSnapshot = {
        ...snap,
        players: buildSoloLobbyPlayers(
          nextTeam,
          snap.botCount,
          playerName,
          localPlayer?.characterId ?? stateRef.current.settings.selectedCharacterId,
          localPlayer?.weaponId ?? stateRef.current.settings.selectedGunId
        ),
      };
      dispatchAction({ type: 'UPDATE_SOLO_CUSTOM_LOBBY', snapshot: nextSnapshot });
      networkRef.current?.pushSystemNoticeToChat(
        `${playerName} switched to ${nextTeam === 'blue' ? 'Blue Task Force' : 'Red Opposition'}.`
      );
      return;
    }
    networkRef.current?.switchTeam();
  }, [dispatchAction]);

  const toggleRoomReady = useCallback(() => {
    networkRef.current?.toggleReady();
  }, []);

  const sendChatMessage = useCallback(
    (text: string, channel?: ChatChannel) => {
      const snap = stateRef.current.lobbySnapshot;
      const activeMode =
        snap?.mode ?? normalizeGameMode(stateRef.current.settings.selectedGameMode, 'tdm');
      const requestedChannel = channel ?? chatChannel;
      const targetChannel: ChatChannel = activeMode === 'ffa' ? 'all' : requestedChannel;
      const local = snap?.players.find((p) => p.id === snap.localPlayerId);
      networkRef.current?.sendChatMessage(text, targetChannel, {
        id: local?.id ?? 'player',
        name: local?.name ?? stateRef.current.settings.callsign,
        team: local?.team ?? 'blue',
      });
    },
    [chatChannel]
  );

  const closeInMatchChat = useCallback((restorePointerLock: boolean) => {
    engineRef.current?.closeChatInput(restorePointerLock);
  }, []);

  const startHighlightReplay = useCallback((mvpId?: string) => {
    engineRef.current?.startHighlightReplay(mvpId);
  }, []);

  const stopHighlightReplay = useCallback(() => {
    engineRef.current?.stopHighlightReplay(true);
  }, []);

  const derived = useMemo<MatchMachineDerived>(
    () => ({
      isMultiplayerInMatch:
        (state.status === 'mp_playing' || state.status === 'mp_ended') &&
        state.lobbySnapshot !== null,
      isMultiplayerHost:
        state.lobbySnapshot !== null &&
        state.lobbySnapshot.hostId === state.lobbySnapshot.localPlayerId,
      isCustomMatch: Boolean(
        state.isCustomMatch || isActiveMultiplayerStatus(state.status) || state.status === 'local_custom_lobby'
      ),
      chatMessages,
      chatOpen,
      chatChannel,
      postMatchStats: derivePostMatchStats(state.hud),
      initProgress,
      connectStage,
    }),
    [chatChannel, chatMessages, chatOpen, connectStage, initProgress, state.hud, state.isCustomMatch, state.lobbySnapshot, state.status]
  );

  const actions = useMemo<MatchMachineActions>(
    () => ({
      updateSettings,
      updateCallsign,
      resetSettings,
      playOfflineTdm,
      openCustomMatch,
      openMapSelect,
      previewMap,
      deployMap,
      backToMenu,
      resumeMatch,
      restartMatch,
      selectCharacter,
      selectGun,
      selectKnifeCharm,
      selectTacticalEquipment,
      previewShowcase,
      lookupRoom,
      createPrivateMatch,
      createSoloCustomLobby,
      joinPrivateMatch,
      cancelMpConnect,
      leaveMultiplayer,
      returnToLobby,
      updateRoomConfig,
      balanceRoomTeams,
      kickRoomPlayer,
      startRoomMatch,
      switchRoomTeam,
      toggleRoomReady,
      sendChatMessage,
      setChatChannel,
      closeInMatchChat,
      respawnPlayer,
      startHighlightReplay,
      stopHighlightReplay,
    }),
    [
      backToMenu,
      balanceRoomTeams,
      cancelMpConnect,
      closeInMatchChat,
      createPrivateMatch,
      createSoloCustomLobby,
      deployMap,
      joinPrivateMatch,
      kickRoomPlayer,
      leaveMultiplayer,
      lookupRoom,
      openCustomMatch,
      openMapSelect,
      playOfflineTdm,
      previewMap,
      previewShowcase,
      resetSettings,
      respawnPlayer,
      restartMatch,
      resumeMatch,
      returnToLobby,
      selectCharacter,
      selectGun,
      selectKnifeCharm,
      selectTacticalEquipment,
      sendChatMessage,
      startHighlightReplay,
      startRoomMatch,
      stopHighlightReplay,
      switchRoomTeam,
      toggleRoomReady,
      updateCallsign,
      updateRoomConfig,
      updateSettings,
    ]
  );

  return {
    canvasRef,
    state,
    derived,
    actions,
  };
}
