/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { EngineManager } from './game/EngineManager';
import { GameSettings, HudState, WEAPONS, WeaponId } from './game/types';
import { MapId } from './maps/types';
import { DEFAULT_KILL_LIMIT, MATCH_DURATION_SEC } from './match/MatchManager';
import { NetworkManager } from './multiplayer/NetworkManager';
import {
  CreatePrivateMatchOptions,
  LobbyRoomSnapshot,
  RoomLookupSummary,
} from './multiplayer/types';
import {
  getRankSummary,
  loadProgression,
} from './settings/progressionStorage';
import {
  loadPersistedSettings,
  resetPersistedSettings,
  savePersistedSettings,
} from './settings/settingsStorage';
import { CustomMatchMenu } from './ui/CustomMatchMenu';
import { EndMatchScreen } from './ui/EndMatchScreen';
import { GameHUD } from './ui/GameHUD';
import { LobbyScreen } from './ui/LobbyScreen';
import { MainMenu } from './ui/MainMenu';
import { MapSelector } from './ui/MapSelector';
import { PauseMenu } from './ui/PauseMenu';
import { toggleFullscreen } from './utils/fullscreen';
import { AppRoute, navigateToRoute, parseRouteFromLocation } from './utils/router';

const INITIAL_HUD: HudState = {
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
  speed: 0,
  headingDeg: 0,
  activeWeapon: WEAPONS.m4a1,
  weaponSlots: [
    { id: 'm4a1', ammoInMag: WEAPONS.m4a1.magSize, reserveAmmo: WEAPONS.m4a1.reserveMax },
    { id: 'mp5', ammoInMag: WEAPONS.mp5.magSize, reserveAmmo: WEAPONS.mp5.reserveMax },
    { id: 'intervention', ammoInMag: WEAPONS.intervention.magSize, reserveAmmo: WEAPONS.intervention.reserveMax },
    { id: 'm1911', ammoInMag: WEAPONS.m1911.magSize, reserveAmmo: WEAPONS.m1911.reserveMax },
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
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<EngineManager | null>(null);
  const networkRef = useRef<NetworkManager | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const [route, setRoute] = useState<AppRoute>(() => parseRouteFromLocation());
  const [selectedMapId, setSelectedMapId] = useState<MapId>(() => {
    const initial = parseRouteFromLocation();
    return initial.view === 'play' ? initial.mapId : 'urban';
  });
  const [settings, setSettings] = useState<GameSettings>(() => loadPersistedSettings());
  const [hud, setHud] = useState<HudState>(() => {
    const rank = getRankSummary(loadProgression().xp);
    return {
      ...INITIAL_HUD,
      xp: rank.xp,
      rankLevel: rank.level,
      rankTitle: rank.title,
      rankProgressPct: rank.progressPct,
    };
  });
  const [contextLost, setContextLost] = useState(false);

  const [lobbySnapshot, setLobbySnapshot] = useState<LobbyRoomSnapshot | null>(null);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [systemNotice, setSystemNotice] = useState<string | null>(null);

  const applyRouteToEngine = useCallback(
    (nextRoute: AppRoute, requestLock: boolean) => {
      const manager = engineRef.current;
      if (!manager) return;

      if (nextRoute.view === 'play') {
        setSelectedMapId(nextRoute.mapId);
        manager.startMatch(nextRoute.mapId, requestLock);
      } else {
        manager.previewMap(selectedMapId);
      }
    },
    [selectedMapId]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const network = new NetworkManager({
      onStateUpdate: (snapshot) => {
        setLobbySnapshot(snapshot);
        setDisconnectError(null);
        setSelectedMapId(snapshot.mapId);
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
      onSystemNotice: (message) => {
        setSystemNotice(message);
        if (noticeTimerRef.current !== null) {
          window.clearTimeout(noticeTimerRef.current);
        }
        noticeTimerRef.current = window.setTimeout(() => {
          setSystemNotice(null);
          noticeTimerRef.current = null;
        }, 3500);
      },
      onDisconnected: (reason) => {
        setLobbySnapshot(null);
        setDisconnectError(reason);
        const nextRoute: AppRoute = { view: 'custom' };
        navigateToRoute(nextRoute);
        setRoute(nextRoute);
        engineRef.current?.returnToMenu();
      },
    });
    networkRef.current = network;

    const manager = new EngineManager(canvas, settings, {
      onHudUpdate: (nextHud) => setHud(nextHud),
      onContextLost: (lost) => setContextLost(lost),
      onMultiplayerShot: (payload) => {
        networkRef.current?.sendFire(payload);
      },
      onMultiplayerMove: (x, y, z, rotY, pitch, weaponId) => {
        networkRef.current?.sendMove(x, y, z, rotY, pitch, weaponId);
      },
    });

    engineRef.current = manager;

    // Handle initial direct URL route
    const initialRoute = parseRouteFromLocation();
    if (initialRoute.view === 'play') {
      manager.startMatch(initialRoute.mapId, false);
    }

    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
      void network.leaveRoom();
      networkRef.current = null;
      manager.dispose();
      engineRef.current = null;
    };
    // Initialize engine and network once on mount; settings updates are pushed via updateSettings
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const next = parseRouteFromLocation();
      if (networkRef.current?.isConnected() && next.view !== 'custom') {
        void networkRef.current.leaveRoom();
        setLobbySnapshot(null);
      }
      setRoute(next);
      applyRouteToEngine(next, false);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [applyRouteToEngine]);

  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'KeyF' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
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

  const handleUpdateSettings = useCallback((next: GameSettings) => {
    const saved = savePersistedSettings(next);
    setSettings(saved);
    engineRef.current?.updateSettings(saved);
  }, []);

  const handleResetSettings = useCallback(() => {
    const reset = resetPersistedSettings();
    setSettings(reset);
    engineRef.current?.updateSettings(reset);
  }, []);

  const handlePlayOfflineTdm = useCallback(() => {
    const nextRoute: AppRoute = { view: 'play', mapId: selectedMapId };
    navigateToRoute(nextRoute);
    setRoute(nextRoute);
    engineRef.current?.startMatch(selectedMapId, true);
  }, [selectedMapId]);

  const handleOpenCustomMatch = useCallback(() => {
    setDisconnectError(null);
    const nextRoute: AppRoute = { view: 'custom' };
    navigateToRoute(nextRoute);
    setRoute(nextRoute);
  }, []);

  const handleOpenMapSelect = useCallback(() => {
    const nextRoute: AppRoute = { view: 'maps' };
    navigateToRoute(nextRoute);
    setRoute(nextRoute);
  }, []);

  const handlePreviewMap = useCallback((mapId: MapId) => {
    setSelectedMapId(mapId);
    engineRef.current?.previewMap(mapId);
  }, []);

  const handleDeployMap = useCallback((mapId: MapId) => {
    setSelectedMapId(mapId);
    const nextRoute: AppRoute = { view: 'play', mapId };
    navigateToRoute(nextRoute);
    setRoute(nextRoute);
    engineRef.current?.startMatch(mapId, true);
  }, []);

  const handleBackToMenu = useCallback(() => {
    setDisconnectError(null);
    const nextRoute: AppRoute = { view: 'menu' };
    navigateToRoute(nextRoute);
    setRoute(nextRoute);
    engineRef.current?.returnToMenu();
  }, []);

  const handleResumeMatch = useCallback(() => {
    engineRef.current?.resumeMatch();
  }, []);

  const handleRestartMatch = useCallback(() => {
    engineRef.current?.restartMatch();
  }, []);

  const handleSelectWeapon = useCallback((id: WeaponId) => {
    engineRef.current?.selectWeapon(id);
  }, []);

  const handleLookupRoom = useCallback(
    async (roomCode: string): Promise<RoomLookupSummary> => {
      if (!networkRef.current) {
        throw new Error('Network client not initialized.');
      }
      return networkRef.current.lookupRoom(roomCode);
    },
    []
  );

  const handleCreatePrivateMatch = useCallback(async (options: CreatePrivateMatchOptions) => {
    if (!networkRef.current) {
      throw new Error('Network client not initialized.');
    }
    setDisconnectError(null);
    const snapshot = await networkRef.current.createPrivateMatch(options);
    setLobbySnapshot(snapshot);
    setSelectedMapId(snapshot.mapId);
    const nextRoute: AppRoute = { view: 'custom' };
    navigateToRoute(nextRoute);
    setRoute(nextRoute);
    engineRef.current?.syncMultiplayerState(snapshot);
  }, []);

  const handleJoinPrivateMatch = useCallback(
    async (roomCode: string, playerName: string, password?: string) => {
      if (!networkRef.current) {
        throw new Error('Network client not initialized.');
      }
      setDisconnectError(null);
      const snapshot = await networkRef.current.joinPrivateMatch(roomCode, playerName, password);
      setLobbySnapshot(snapshot);
      setSelectedMapId(snapshot.mapId);
      const nextRoute: AppRoute = { view: 'custom' };
      navigateToRoute(nextRoute);
      setRoute(nextRoute);
      engineRef.current?.syncMultiplayerState(snapshot);
    },
    []
  );

  const handleLeaveMultiplayer = useCallback(async () => {
    await networkRef.current?.leaveRoom();
    setLobbySnapshot(null);
    setDisconnectError(null);
    setSystemNotice(null);
    const nextRoute: AppRoute = { view: 'menu' };
    navigateToRoute(nextRoute);
    setRoute(nextRoute);
    engineRef.current?.returnToMenu();
  }, []);

  const handleReturnToLobby = useCallback(() => {
    networkRef.current?.returnToLobby();
  }, []);

  const isMultiplayerInMatch =
    route.view === 'custom' &&
    lobbySnapshot !== null &&
    (lobbySnapshot.phase === 'playing' || lobbySnapshot.phase === 'ended');

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0b0e13]">
      <canvas
        ref={canvasRef}
        className="block h-full w-full outline-none"
        tabIndex={0}
      />

      {contextLost && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0b0e13] p-6">
          <div className="max-w-md border border-white/15 bg-black/75 p-6 text-center">
            <h2 className="font-display text-xl font-semibold text-white">
              Graphics Context Interrupted
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              WebGL rendering was temporarily suspended by the browser. Reload the page if the viewport does not restore automatically.
            </p>
          </div>
        </div>
      )}

      {!contextLost && route.view === 'menu' && (
        <MainMenu
          selectedMapId={selectedMapId}
          settings={settings}
          xp={hud.xp}
          onPlayOfflineTdm={handlePlayOfflineTdm}
          onOpenCustomMatch={handleOpenCustomMatch}
          onOpenMapSelect={handleOpenMapSelect}
          onUpdateSettings={handleUpdateSettings}
          onResetSettings={handleResetSettings}
        />
      )}

      {!contextLost && route.view === 'maps' && (
        <MapSelector
          selectedMapId={selectedMapId}
          onPreviewMap={handlePreviewMap}
          onDeployMap={handleDeployMap}
          onBack={handleBackToMenu}
        />
      )}

      {!contextLost && route.view === 'custom' && !lobbySnapshot && (
        <CustomMatchMenu
          initialJoinCode={route.joinCode}
          initialMapId={selectedMapId}
          initialCallsign={settings.callsign}
          errorBanner={disconnectError}
          onCallsignChange={(callsign) =>
            handleUpdateSettings({ ...settings, callsign })
          }
          onCreateMatch={handleCreatePrivateMatch}
          onJoinMatch={handleJoinPrivateMatch}
          onLookupRoom={handleLookupRoom}
          onBack={handleBackToMenu}
        />
      )}

      {!contextLost && route.view === 'custom' && lobbySnapshot?.phase === 'lobby' && (
        <LobbyScreen
          lobby={lobbySnapshot}
          systemNotice={systemNotice}
          onUpdateConfig={(patch) => networkRef.current?.updateConfig(patch)}
          onBalanceTeams={() => networkRef.current?.balanceTeams()}
          onKickPlayer={(targetId) => networkRef.current?.kickPlayer(targetId)}
          onStartMatch={() => networkRef.current?.startMatch()}
          onSwitchTeam={() => networkRef.current?.switchTeam()}
          onToggleReady={() => networkRef.current?.toggleReady()}
          onLeaveLobby={() => {
            void handleLeaveMultiplayer();
          }}
        />
      )}

      {!contextLost && isMultiplayerInMatch && lobbySnapshot && (
        <>
          <GameHUD hud={hud} />

          {hud.match.phase === 'paused' && (
            <PauseMenu
              hud={hud}
              settings={settings}
              isMultiplayer
              onResume={handleResumeMatch}
              onRestartMatch={handleRestartMatch}
              onLeaveToMenu={() => {
                void handleLeaveMultiplayer();
              }}
              onSelectWeapon={handleSelectWeapon}
              onUpdateSettings={handleUpdateSettings}
              onResetSettings={handleResetSettings}
            />
          )}

          {hud.match.phase === 'ended' && (
            <EndMatchScreen
              match={hud.match}
              xp={hud.xp}
              sessionXpEarned={hud.sessionXpEarned}
              isMultiplayer
              isHost={lobbySnapshot.hostId === lobbySnapshot.localPlayerId}
              onPlayAgain={handleRestartMatch}
              onReturnToLobby={handleReturnToLobby}
              onReturnToMenu={() => {
                void handleLeaveMultiplayer();
              }}
            />
          )}
        </>
      )}

      {!contextLost && route.view === 'play' && (
        <>
          <GameHUD hud={hud} />

          {hud.match.phase === 'paused' && (
            <PauseMenu
              hud={hud}
              settings={settings}
              onResume={handleResumeMatch}
              onRestartMatch={handleRestartMatch}
              onLeaveToMenu={handleBackToMenu}
              onSelectWeapon={handleSelectWeapon}
              onUpdateSettings={handleUpdateSettings}
              onResetSettings={handleResetSettings}
            />
          )}

          {hud.match.phase === 'ended' && (
            <EndMatchScreen
              match={hud.match}
              xp={hud.xp}
              sessionXpEarned={hud.sessionXpEarned}
              onPlayAgain={handleRestartMatch}
              onReturnToMenu={handleBackToMenu}
            />
          )}
        </>
      )}
    </main>
  );
}
