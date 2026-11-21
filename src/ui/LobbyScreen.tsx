import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Copy,
  Crosshair,
  Link2,
  Lock,
  LogOut,
  Scale,
  Share2,
  Shield,
  UserX,
} from 'lucide-react';
import { MAP_LIST } from '../maps/MapManager';
import { MapId } from '../maps/types';
import { CreatePrivateMatchOptions, LobbyPlayerInfo, LobbyRoomSnapshot } from '../multiplayer/types';

interface LobbyScreenProps {
  lobby: LobbyRoomSnapshot;
  systemNotice: string | null;
  onUpdateConfig: (patch: Partial<CreatePrivateMatchOptions>) => void;
  onBalanceTeams: () => void;
  onKickPlayer: (targetId: string) => void;
  onStartMatch: () => void;
  onSwitchTeam: () => void;
  onToggleReady: () => void;
  onLeaveLobby: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  lobby,
  systemNotice,
  onUpdateConfig,
  onBalanceTeams,
  onKickPlayer,
  onStartMatch,
  onSwitchTeam,
  onToggleReady,
  onLeaveLobby,
}) => {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const localPlayer = lobby.players.find((p) => p.id === lobby.localPlayerId);
  const isHost = lobby.hostId === lobby.localPlayerId;

  const bluePlayers = lobby.players.filter((p) => p.team === 'blue');
  const redPlayers = lobby.players.filter((p) => p.team === 'red');

  const inviteUrl = `${window.location.origin}/join/${lobby.roomCode}`;

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2400);
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(lobby.roomCode);
      showToast(`Copied code ${lobby.roomCode}`);
    } catch {
      showToast(`Room code: ${lobby.roomCode}`);
    }
  };

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      showToast('Invite link copied to clipboard');
    } catch {
      showToast(inviteUrl);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Strike Force — ${lobby.roomName}`,
          text: `Join my Strike Force match with code ${lobby.roomCode}`,
          url: inviteUrl,
        });
        return;
      } catch {
        // User cancelled or share unsupported, fall back to clipboard copy
      }
    }
    await handleCopyInvite();
  };

  const renderRosterRow = (p: LobbyPlayerInfo) => {
    const isSelf = p.id === lobby.localPlayerId;
    return (
      <div
        key={p.id}
        className={`flex items-center justify-between border-b border-white/5 px-4 py-2.5 text-xs last:border-b-0 ${
          isSelf ? 'bg-amber-400/10' : ''
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate font-medium text-white">
            {p.name}
            {isSelf ? ' (You)' : ''}
          </span>
          {p.isHost && (
            <span className="font-mono-tabular text-[10px] font-semibold text-amber-400">
              [HOST]
            </span>
          )}
          {p.isBot && (
            <span className="font-mono-tabular text-[10px] text-slate-400">[BOT]</span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span
            className={`text-[11px] font-medium ${
              p.ready ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            {p.ready ? 'Ready' : 'Waiting'}
          </span>

          {isHost && !p.isBot && !isSelf && (
            <button
              type="button"
              onClick={() => onKickPlayer(p.id)}
              title={`Kick ${p.name}`}
              className="inline-flex cursor-pointer items-center gap-1 border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-500/20"
            >
              <UserX className="h-3 w-3" />
              Kick
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center overflow-y-auto bg-[#090d13]/80 p-6 backdrop-blur-sm md:p-10">
      <div className="w-full max-w-5xl border border-white/15 bg-[#0e131b]/95 p-6 shadow-2xl">
        {/* Top Lobby Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-2xl font-bold text-white">{lobby.roomName}</h1>
              {lobby.hasPassword && <Lock className="h-4 w-4 text-amber-400" />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span>
                Room Code:{' '}
                <strong className="font-mono-tabular tracking-widest text-amber-300">
                  {lobby.roomCode}
                </strong>
              </span>
              <span>·</span>
              <span>Map: {MAP_LIST.find((m) => m.id === lobby.mapId)?.name ?? lobby.mapId}</span>
              <span>·</span>
              <span className="font-mono-tabular">
                First to {lobby.killLimit} · {Math.round(lobby.timeLimit / 60)}m
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex cursor-pointer items-center gap-1.5 border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy Code
            </button>

            <button
              type="button"
              onClick={handleCopyInvite}
              className="inline-flex cursor-pointer items-center gap-1.5 border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap"
            >
              <Link2 className="h-3.5 w-3.5" />
              Copy Invite Link
            </button>

            <button
              type="button"
              onClick={handleNativeShare}
              className="inline-flex cursor-pointer items-center gap-1.5 border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>

            <button
              type="button"
              onClick={onLeaveLobby}
              className="inline-flex cursor-pointer items-center gap-1.5 border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/20 whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5" />
              Leave Lobby
            </button>
          </div>
        </div>

        {(toast || systemNotice) && (
          <div className="mt-3 border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
            {toast || systemNotice}
          </div>
        )}

        {/* Team Rosters */}
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="border border-blue-500/30 bg-black/40">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
              <span className="font-display text-sm font-bold text-blue-400">
                Blue Task Force
              </span>
              <span className="font-mono-tabular text-xs text-slate-400">
                {bluePlayers.length} Operators
              </span>
            </div>
            <div>
              {bluePlayers.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-500">
                  No operators assigned
                </div>
              ) : (
                bluePlayers.map(renderRosterRow)
              )}
            </div>
          </div>

          <div className="border border-red-500/30 bg-black/40">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
              <span className="font-display text-sm font-bold text-red-400">
                Red Opposition
              </span>
              <span className="font-mono-tabular text-xs text-slate-400">
                {redPlayers.length} Operators
              </span>
            </div>
            <div>
              {redPlayers.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-500">
                  No operators assigned
                </div>
              ) : (
                redPlayers.map(renderRosterRow)
              )}
            </div>
          </div>
        </div>

        {/* Host Rules & Player Controls */}
        <div className="mt-5 grid grid-cols-1 gap-5 border-t border-white/10 pt-5 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-8">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">
                {isHost ? 'Host Match Configuration' : 'Match Configuration (Host Controlled)'}
              </span>
              {isHost && (
                <button
                  type="button"
                  onClick={onBalanceTeams}
                  className="inline-flex cursor-pointer items-center gap-1.5 border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-200 hover:bg-white/10"
                >
                  <Scale className="h-3.5 w-3.5" />
                  Balance Teams
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="block text-xs">
                <span className="text-slate-400">Map</span>
                <select
                  disabled={!isHost}
                  value={lobby.mapId}
                  onChange={(e) => onUpdateConfig({ mapId: e.target.value as MapId })}
                  className="mt-1 w-full border border-white/15 bg-[#0b1017] px-2.5 py-1.5 text-xs text-white disabled:opacity-60"
                >
                  {MAP_LIST.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs">
                <span className="text-slate-400">Score Limit</span>
                <select
                  disabled={!isHost}
                  value={lobby.killLimit}
                  onChange={(e) =>
                    onUpdateConfig({ killLimit: parseInt(e.target.value, 10) })
                  }
                  className="mt-1 w-full border border-white/15 bg-[#0b1017] px-2.5 py-1.5 font-mono-tabular text-xs text-white disabled:opacity-60"
                >
                  {[15, 30, 50, 75].map((k) => (
                    <option key={k} value={k}>
                      {k} Kills
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs">
                <span className="text-slate-400">AI Bots</span>
                <div className="mt-1 flex items-center border border-white/15 bg-black/40">
                  <button
                    type="button"
                    disabled={!isHost || lobby.botCount <= 0}
                    onClick={() => onUpdateConfig({ botCount: Math.max(0, lobby.botCount - 1) })}
                    className="cursor-pointer px-2.5 py-1.5 text-xs text-white hover:bg-white/10 disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="flex-1 text-center font-mono-tabular text-xs text-white">
                    {lobby.botCount}
                  </span>
                  <button
                    type="button"
                    disabled={!isHost || lobby.botCount >= 10}
                    onClick={() => onUpdateConfig({ botCount: Math.min(10, lobby.botCount + 1) })}
                    className="cursor-pointer px-2.5 py-1.5 text-xs text-white hover:bg-white/10 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </label>

              <div className="text-xs">
                <span className="text-slate-400">Friendly Fire</span>
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() => onUpdateConfig({ friendlyFire: !lobby.friendlyFire })}
                  className={`mt-1 flex w-full cursor-pointer items-center justify-between border px-2.5 py-1.5 disabled:opacity-60 ${
                    lobby.friendlyFire
                      ? 'border-red-400/50 bg-red-500/15 text-red-200'
                      : 'border-white/15 bg-black/40 text-slate-300'
                  }`}
                >
                  <Shield className="h-3.5 w-3.5" />
                  <span className="font-mono-tabular">{lobby.friendlyFire ? 'ON' : 'OFF'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Action Stack */}
          <div className="flex flex-col justify-end gap-2.5 lg:col-span-4">
            <button
              type="button"
              onClick={onSwitchTeam}
              className="flex w-full cursor-pointer items-center justify-center gap-2 border border-white/15 bg-white/5 px-4 py-2.5 font-display text-xs font-semibold text-white hover:bg-white/10"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Switch Team ({localPlayer?.team === 'blue' ? 'to Red' : 'to Blue'})
            </button>

            {isHost ? (
              <button
                type="button"
                onClick={onStartMatch}
                className="flex w-full cursor-pointer items-center justify-center gap-2 bg-amber-500 px-5 py-3 font-display text-sm font-bold tracking-wide text-slate-950 transition-colors hover:bg-amber-400"
              >
                <Crosshair className="h-4 w-4" />
                START MATCH
              </button>
            ) : (
              <button
                type="button"
                onClick={onToggleReady}
                className={`flex w-full cursor-pointer items-center justify-center gap-2 px-5 py-3 font-display text-sm font-bold tracking-wide transition-colors ${
                  localPlayer?.ready
                    ? 'border border-emerald-400 bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                }`}
              >
                <Check className="h-4 w-4" />
                {localPlayer?.ready ? 'READY (Waiting for Host)' : 'TOGGLE READY'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
