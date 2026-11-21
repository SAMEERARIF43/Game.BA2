import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { EngineManager, InitProgressState } from '../game/EngineManager';
import { CharacterId, GameSettings, GunId, KnifeCharmId } from '../game/types';
import { MapId } from '../maps/types';
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
import { NetworkManager } from '../multiplayer/NetworkManager';
import { CreatePrivateMatchOptions, RoomLookupSummary } from '../multiplayer/types';
import { getRankSummary, loadProgression } from '../settings/progressionStorage';
import {
  loadPersistedSettings,
  resetPersistedSettings,
  savePersistedSettings,
} from '../settings/settingsStorage';
import { toggleFullscreen } from '../utils/fullscreen';
import { navigateToRoute, parseRouteFromLocation } from '../utils/router';
import { registerUiAudioHandler } from '../utils/uiAudio';

export interface MatchMachineDerived {
  isMultiplayerInMatch: boolean;
  isMultiplayerHost: boolean;
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
  previewShowcase: (focus: 'gun' | 'knife', offsetX?: number) => void;
  lookupRoom: (roomCode: string) => Promise<RoomLookupSummary>;
  createPrivateMatch: (options: CreatePrivateMatchOptions) => Promise<void>;
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
      onStateUpdate: (snapshot) => {
        const prevStatus = stateRef.current.status;
        if (!isMultiplayerOrConnecting(prevStatus)) {
          return;
        }
        const nextState = dispatchAction({ type: 'MP_STATE_SYNC', snapshot });
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
      onSystemNotice: (message) => {
        if (!isActiveMultiplayerStatus(stateRef.current.status)) {
          return;
        }
        dispatchAction({ type: 'MP_SYSTEM_NOTICE', message });
        clearNoticeTimer();
        noticeTimerRef.current = window.setTimeout(() => {
          noticeTimerRef.current = null;
          dispatchAction({ type: 'CLEAR_SYSTEM_NOTICE' });
        }, 3500);
      },
      onDisconnected: (reason) => {
        const wasMp = isMultiplayerOrConnecting(stateRef.current.status);
        const nextState = dispatchAction({ type: 'MP_DISCONNECTED', reason });
        if (!wasMp) {
          return;
        }
        clearNoticeTimer();
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
    const nextState = dispatchAction({
      type: 'START_OFFLINE_MATCH',
      mapId,
      requestLock: true,
    });
    if (nextState.status !== 'offline_playing') return;
    navigateToRoute(deriveActiveRoute(nextState));
    engineRef.current?.startMatch(mapId, true);
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
      const nextState = dispatchAction({
        type: 'START_OFFLINE_MATCH',
        mapId,
        requestLock: true,
      });
      if (nextState.status !== 'offline_playing') return;
      navigateToRoute(deriveActiveRoute(nextState));
      engineRef.current?.startMatch(mapId, true);
    },
    [dispatchAction]
  );

  const backToMenu = useCallback(() => {
    const wasMp = isMultiplayerOrConnecting(stateRef.current.status);
    clearNoticeTimer();
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
        const snapshot = await network.createPrivateMatch({
          ...options,
          characterId: latestSettings.selectedCharacterId,
          weaponId: latestSettings.selectedGunId,
        });

        if (stateRef.current.connectionEpoch !== epoch) {
          await network.leaveRoom();
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
          latestSettings.selectedGunId
        );

        if (stateRef.current.connectionEpoch !== epoch) {
          await network.leaveRoom();
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
    setConnectStage(null);
    dispatchAction({ type: 'MP_CONNECT_CANCEL' });
    void networkRef.current?.leaveRoom();
  }, [dispatchAction]);

  const leaveMultiplayer = useCallback(async () => {
    clearNoticeTimer();
    setConnectStage(null);
    const nextState = dispatchAction({ type: 'LEAVE_MULTIPLAYER' });
    navigateToRoute(deriveActiveRoute(nextState));
    engineRef.current?.returnToMenu();
    await networkRef.current?.leaveRoom();
  }, [clearNoticeTimer, dispatchAction]);

  const returnToLobby = useCallback(() => {
    networkRef.current?.returnToLobby();
  }, []);

  const updateRoomConfig = useCallback((patch: Partial<CreatePrivateMatchOptions>) => {
    networkRef.current?.updateConfig(patch);
  }, []);

  const balanceRoomTeams = useCallback(() => {
    networkRef.current?.balanceTeams();
  }, []);

  const kickRoomPlayer = useCallback((targetId: string) => {
    networkRef.current?.kickPlayer(targetId);
  }, []);

  const startRoomMatch = useCallback(() => {
    networkRef.current?.startMatch();
  }, []);

  const switchRoomTeam = useCallback(() => {
    networkRef.current?.switchTeam();
  }, []);

  const toggleRoomReady = useCallback(() => {
    networkRef.current?.toggleReady();
  }, []);

  const derived = useMemo<MatchMachineDerived>(
    () => ({
      isMultiplayerInMatch:
        (state.status === 'mp_playing' || state.status === 'mp_ended') &&
        state.lobbySnapshot !== null,
      isMultiplayerHost:
        state.lobbySnapshot !== null &&
        state.lobbySnapshot.hostId === state.lobbySnapshot.localPlayerId,
      postMatchStats: derivePostMatchStats(state.hud),
      initProgress,
      connectStage,
    }),
    [connectStage, initProgress, state.hud, state.lobbySnapshot, state.status]
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
      previewShowcase,
      lookupRoom,
      createPrivateMatch,
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
    }),
    [
      backToMenu,
      balanceRoomTeams,
      cancelMpConnect,
      createPrivateMatch,
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
      restartMatch,
      resumeMatch,
      returnToLobby,
      selectCharacter,
      selectGun,
      selectKnifeCharm,
      startRoomMatch,
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
