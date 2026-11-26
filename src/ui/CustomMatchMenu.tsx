import React, { useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, Loader2, Plus, Shield, Users } from 'lucide-react';
import {
  GAME_MODE_IDS,
  GAME_MODE_META,
  GameMode,
  getModeDefaultLimits,
  normalizeGameMode,
} from '../game/gameModeRules';
import { MAP_LIST } from '../maps/MapManager';
import { MapId } from '../maps/types';
import { CreatePrivateMatchOptions, RoomLookupSummary } from '../multiplayer/types';
import { MapPreview, MapPreviewMode, MapViewModeToggle } from './MapPreview';

interface CustomMatchMenuProps {
  initialJoinCode?: string;
  initialMapId: MapId;
  initialMode?: GameMode;
  initialCallsign: string;
  errorBanner: string | null;
  onCallsignChange?: (callsign: string) => void;
  onCreateMatch: (options: CreatePrivateMatchOptions) => Promise<void>;
  onCreateSoloCustom?: (options: CreatePrivateMatchOptions) => void;
  onJoinMatch: (roomCode: string, playerName: string, password?: string) => Promise<void>;
  onLookupRoom: (roomCode: string) => Promise<RoomLookupSummary>;
  onBack: () => void;
}

export const CustomMatchMenu: React.FC<CustomMatchMenuProps> = ({
  initialJoinCode,
  initialMapId,
  initialMode,
  initialCallsign,
  errorBanner,
  onCallsignChange,
  onCreateMatch,
  onCreateSoloCustom,
  onJoinMatch,
  onLookupRoom,
  onBack,
}) => {
  const [playerName, setPlayerName] = useState<string>(() => initialCallsign || 'Operator-101');

  const resolvedInitialMode = normalizeGameMode(initialMode, 'tdm');
  const initialDefaults = getModeDefaultLimits(resolvedInitialMode);

  // Create form state
  const [roomName, setRoomName] = useState('Strike Force Private');
  const [mapId, setMapId] = useState<MapId>(initialMapId);
  const [mapViewMode, setMapViewMode] = useState<MapPreviewMode>('scenic');
  const [mode, setMode] = useState<GameMode>(resolvedInitialMode);
  const [killLimit, setKillLimit] = useState(initialDefaults.killLimit);
  const [timeLimit, setTimeLimit] = useState(initialDefaults.timeLimitSec);
  const [friendlyFire, setFriendlyFire] = useState(false);
  const [botCount, setBotCount] = useState(4);
  const [createPassword, setCreatePassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Join form state
  const [joinCode, setJoinCode] = useState(initialJoinCode?.toUpperCase() || '');
  const [joinPassword, setJoinPassword] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [roomPreview, setRoomPreview] = useState<RoomLookupSummary | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  useEffect(() => {
    if (initialJoinCode) {
      const normalized = initialJoinCode.trim().toUpperCase().slice(0, 6);
      setJoinCode(normalized);
    }
  }, [initialJoinCode]);

  useEffect(() => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      setRoomPreview(null);
      setLookingUp(false);
      return;
    }

    let cancelled = false;
    setLookingUp(true);
    onLookupRoom(code)
      .then((summary) => {
        if (!cancelled) {
          setRoomPreview(summary);
          setJoinError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRoomPreview(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLookingUp(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [joinCode, onLookupRoom]);

  const persistCallsign = (name: string) => {
    const clean = name.trim() || 'Operator-101';
    onCallsignChange?.(clean);
    return clean;
  };

  const handleSelectMode = (nextMode: GameMode) => {
    setMode(nextMode);
    const defaults = getModeDefaultLimits(nextMode);
    setKillLimit(defaults.killLimit);
    setTimeLimit(defaults.timeLimitSec);
    if (nextMode === 'ffa') {
      setFriendlyFire(false);
    }
  };

  const buildCreateOptions = (): CreatePrivateMatchOptions => {
    const defaults = getModeDefaultLimits(mode);
    return {
      playerName: persistCallsign(playerName),
      roomName: roomName.trim() || 'Strike Force Private',
      mapId,
      mode,
      killLimit,
      timeLimit,
      respawnDelay: defaults.respawnDelaySec,
      friendlyFire: mode === 'ffa' ? false : friendlyFire,
      botCount,
      password: createPassword.trim() || undefined,
    };
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await onCreateMatch(buildCreateOptions());
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create private match.');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateSoloClick = () => {
    setCreateError(null);
    onCreateSoloCustom?.(buildCreateOptions());
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setJoinError('Enter a valid 6-character room code (e.g. WAR482).');
      return;
    }

    setJoining(true);
    try {
      const cleanName = persistCallsign(playerName);
      await onJoinMatch(code, cleanName, joinPassword.trim() || undefined);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Unable to join room.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center overflow-y-auto bg-[#090d13]/90 p-3 sm:p-5">
      <div className="my-auto max-h-[calc(100vh-1.5rem)] w-full max-w-5xl overflow-y-auto border border-white/15 bg-[#0e131b]/95 p-4 shadow-2xl sm:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Custom Private Match</h1>
            <p className="mt-1 text-xs text-slate-400">
              Host an authoritative Colyseus lobby or join with a 6-character invite code
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <span>Callsign</span>
              <input
                type="text"
                maxLength={20}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-36 border border-white/15 bg-black/50 px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-400"
                placeholder="Operator"
              />
            </label>

            <button
              type="button"
              onClick={onBack}
              className="inline-flex cursor-pointer items-center gap-2 border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
          </div>
        </div>

        {errorBanner && (
          <div className="mt-4 border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs text-red-200">
            {errorBanner}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Create Private Match Form */}
          <form
            onSubmit={handleCreateSubmit}
            className="border border-white/10 bg-black/35 p-5 lg:col-span-7"
          >
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <Plus className="h-4 w-4 text-amber-400" />
              <h2 className="font-display text-base font-bold text-white">Create Private Match</h2>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-300">Room Name</span>
                <input
                  type="text"
                  maxLength={28}
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="mt-1.5 w-full border border-white/15 bg-black/50 px-3 py-2 text-xs text-white outline-none focus:border-amber-400"
                  placeholder="Strike Force Private"
                />
              </label>

              <div className="sm:col-span-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Game Mode</span>
                  <span className="font-mono-tabular text-[11px] text-amber-300">
                    {GAME_MODE_META[mode].targetLabel}
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  {GAME_MODE_IDS.map((m) => {
                    const meta = GAME_MODE_META[m];
                    const active = mode === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={active}
                        onClick={() => handleSelectMode(m)}
                        className={`cursor-pointer border px-2.5 py-2 text-left transition-colors ${
                          active
                            ? 'border-amber-400 bg-amber-400/15 text-white'
                            : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25 hover:text-white'
                        }`}
                      >
                        <div className="font-display text-xs font-bold">{meta.label}</div>
                        <div className="font-mono-tabular text-[10px] text-amber-300/90">
                          {meta.shortLabel}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-300">Operation Map</span>
                  <MapViewModeToggle value={mapViewMode} onChange={setMapViewMode} />
                </div>
                <div
                  className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"
                  role="radiogroup"
                  aria-label="Select custom match map"
                >
                  {MAP_LIST.map((m) => {
                    const active = mapId === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        data-map-card={m.id}
                        onClick={() => setMapId(m.id)}
                        className={`flex min-w-0 cursor-pointer flex-col border p-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                          active
                            ? 'border-amber-400 bg-amber-400/14 shadow-[0_0_16px_rgba(245,158,11,0.16)]'
                            : 'border-white/10 bg-black/45 hover:border-white/25 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="relative">
                          <MapPreview
                            mapId={m.id}
                            variant="card"
                            viewMode={mapViewMode}
                            selected={active}
                            className="h-20 w-full"
                          />
                          {active && (
                            <span className="absolute left-1.5 top-1.5 bg-amber-400 px-1.5 py-0.5 font-mono-tabular text-[9px] font-bold tracking-wider text-slate-950">
                              SELECTED
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-1.5">
                          <span className="truncate font-display text-xs font-bold text-white">
                            {m.name}
                          </span>
                          <span className="shrink-0 border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono-tabular text-[9px] text-amber-300">
                            {m.engagementRange}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">
                          {m.tagline}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-300">Optional Password</span>
                <input
                  type="password"
                  maxLength={24}
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="mt-1.5 w-full border border-white/15 bg-black/50 px-3 py-2 text-xs text-white outline-none focus:border-amber-400"
                  placeholder="Leave blank for open invite"
                />
              </label>

              <div>
                <span className="text-xs text-slate-300">
                  {mode === 'bomb' ? 'Rounds to Win' : 'Kill Limit'}
                </span>
                <div className="mt-1.5 flex gap-1.5">
                  {(mode === 'bomb' ? [3, 5, 7] : mode === 'ffa' ? [10, 20, 30] : [15, 30, 50]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setKillLimit(v)}
                      className={`flex-1 cursor-pointer border py-1.5 font-mono-tabular text-xs font-semibold ${
                        killLimit === v
                          ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                          : 'border-white/10 bg-white/5 text-slate-300'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-xs text-slate-300">
                  {mode === 'bomb' ? 'Round Timer' : 'Time Limit'}
                </span>
                <div className="mt-1.5 flex gap-1.5">
                  {(mode === 'bomb'
                    ? [
                        { label: '60s', sec: 60 },
                        { label: '90s', sec: 90 },
                        { label: '120s', sec: 120 },
                      ]
                    : [
                        { label: '3m', sec: 180 },
                        { label: '5m', sec: 300 },
                        { label: '10m', sec: 600 },
                      ]
                  ).map((opt) => (
                    <button
                      key={opt.sec}
                      type="button"
                      onClick={() => setTimeLimit(opt.sec)}
                      className={`flex-1 cursor-pointer border py-1.5 font-mono-tabular text-xs font-semibold ${
                        timeLimit === opt.sec
                          ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                          : 'border-white/10 bg-white/5 text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>AI Bot Slots</span>
                  <span className="font-mono-tabular text-white">{botCount}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={8}
                  step={1}
                  value={botCount}
                  onChange={(e) => setBotCount(parseInt(e.target.value, 10))}
                  className="mt-2.5 w-full cursor-pointer accent-amber-400"
                />
              </label>

              <div className="flex items-end">
                {mode === 'ffa' ? (
                  <div className="flex w-full items-center justify-between border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    <span className="inline-flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" />
                      Hostility
                    </span>
                    <span className="font-mono-tabular font-semibold">SOLO FFA</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFriendlyFire((v) => !v)}
                    className={`flex w-full cursor-pointer items-center justify-between border px-3 py-2 text-xs ${
                      friendlyFire
                        ? 'border-red-400/60 bg-red-500/15 text-red-200'
                        : 'border-white/15 bg-white/5 text-slate-300'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" />
                      Friendly Fire
                    </span>
                    <span className="font-mono-tabular font-semibold">
                      {friendlyFire ? 'ON' : 'OFF'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {createError && (
              <div className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {createError}
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="submit"
                disabled={creating}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 bg-amber-500 px-5 py-3 font-display text-xs font-bold tracking-wide text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
              >
                {creating ? 'Creating Match Room...' : 'Create Private Match'}
              </button>

              {onCreateSoloCustom && (
                <button
                  type="button"
                  disabled={creating}
                  onClick={handleCreateSoloClick}
                  className="flex cursor-pointer items-center justify-center gap-2 border border-white/15 bg-white/5 px-4 py-3 font-display text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-50 whitespace-nowrap"
                >
                  Launch Solo Custom Lobby (Offline)
                </button>
              )}
            </div>
          </form>

          {/* Join Private Match Form */}
          <form
            onSubmit={handleJoinSubmit}
            className="flex flex-col justify-between border border-white/10 bg-black/35 p-5 lg:col-span-5"
          >
            <div>
              <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                <Users className="h-4 w-4 text-blue-400" />
                <h2 className="font-display text-base font-bold text-white">Join by Room Code</h2>
              </div>

              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="text-xs text-slate-300">6-Character Room Code</span>
                  <input
                    type="text"
                    maxLength={6}
                    value={joinCode}
                    onChange={(e) =>
                      setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                    }
                    className="mt-1.5 w-full border border-white/15 bg-black/60 px-3.5 py-2.5 font-mono-tabular text-lg font-bold tracking-[0.25em] text-amber-300 uppercase outline-none focus:border-amber-400"
                    placeholder="WAR482"
                  />
                </label>

                {lookingUp && (
                  <div className="flex items-center gap-2 border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400 motion-reduce:animate-none" />
                    <span>Checking room {joinCode}...</span>
                  </div>
                )}

                {!lookingUp && roomPreview && (
                  <div className="border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                    <div className="flex items-center justify-between font-medium text-emerald-200">
                      <span>{roomPreview.roomName}</span>
                      <span className="font-mono-tabular">
                        {roomPreview.playerCount}/{roomPreview.maxPlayers}
                      </span>
                    </div>
                    <div className="mt-1 text-emerald-300/80">
                      Map: {roomPreview.mapId} · {roomPreview.phase}
                      {roomPreview.hasPassword ? ' · Password Required' : ''}
                    </div>
                  </div>
                )}

                <label className="block">
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                    <KeyRound className="h-3.5 w-3.5 text-slate-400" />
                    Room Password (if locked)
                  </span>
                  <input
                    type="password"
                    maxLength={24}
                    value={joinPassword}
                    onChange={(e) => setJoinPassword(e.target.value)}
                    className="mt-1.5 w-full border border-white/15 bg-black/50 px-3 py-2 text-xs text-white outline-none focus:border-amber-400"
                    placeholder="Optional password"
                  />
                </label>

                {joinError && (
                  <div className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {joinError}
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={joining}
              className="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 border border-blue-400/50 bg-blue-500/20 px-5 py-3 font-display text-xs font-bold tracking-wide text-blue-200 transition-colors hover:bg-blue-500/30 disabled:opacity-50"
            >
              {joining ? 'Connecting...' : 'Join Private Match'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
