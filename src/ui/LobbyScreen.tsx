import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Copy,
  Crosshair,
  Link2,
  Lock,
  LogOut,
  MessageSquare,
  Scale,
  Send,
  Share2,
  Shield,
  UserX,
} from 'lucide-react';
import {
  GAME_MODE_IDS,
  GAME_MODE_META,
  GameMode,
  getModeDefaultLimits,
  normalizeGameMode,
} from '../game/gameModeRules';
import { MAP_LIST } from '../maps/MapManager';
import { MapId } from '../maps/types';
import {
  CHAT_MAX_LENGTH,
  ChatChannel,
  ChatMessage,
  QUICK_CHAT_CALLOUTS,
  formatChatTimestamp,
} from '../multiplayer/chat';
import { CreatePrivateMatchOptions, LobbyPlayerInfo, LobbyRoomSnapshot } from '../multiplayer/types';

interface LobbyScreenProps {
  lobby: LobbyRoomSnapshot;
  systemNotice: string | null;
  chatMessages: ChatMessage[];
  onSendChat: (text: string, channel: ChatChannel) => void;
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
  chatMessages,
  onSendChat,
  onUpdateConfig,
  onBalanceTeams,
  onKickPlayer,
  onStartMatch,
  onSwitchTeam,
  onToggleReady,
  onLeaveLobby,
}) => {
  const [toast, setToast] = useState<string | null>(null);
  const [chatText, setChatText] = useState('');
  const [chatChannel, setChatChannel] = useState<ChatChannel>('all');
  const toastTimerRef = useRef<number | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chatMessages]);

  const localPlayer = lobby.players.find((p) => p.id === lobby.localPlayerId);
  const isHost = lobby.hostId === lobby.localPlayerId;
  const mode = normalizeGameMode(lobby.mode, 'tdm');
  const modeMeta = GAME_MODE_META[mode];
  const effectiveChatChannel: ChatChannel = mode === 'ffa' ? 'all' : chatChannel;

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

  const handleSubmitChat = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatText.trim();
    if (!trimmed) return;
    onSendChat(trimmed, effectiveChatChannel);
    setChatText('');
  };

  const handleCallout = (callout: string) => {
    onSendChat(callout, effectiveChatChannel);
  };

  const renderRosterRow = (p: LobbyPlayerInfo) => {
    const isSelf = p.id === lobby.localPlayerId;
    return (
      <div
        key={p.id}
        className={`flex items-center justify-between border-b border-white/5 px-4 py-2 text-xs last:border-b-0 ${
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
    <div className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center overflow-y-auto bg-[#090d13]/80 p-4 backdrop-blur-sm md:p-6">
      <div className="my-auto max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto border border-white/15 bg-[#0e131b]/95 p-5 shadow-2xl md:p-6">
        {/* Top Lobby Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3.5">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-xl font-bold text-white md:text-2xl">{lobby.roomName}</h1>
              <span className="border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 font-mono-tabular text-[10px] font-bold text-amber-300">
                {modeMeta.shortLabel}
              </span>
              {lobby.hasPassword && <Lock className="h-4 w-4 text-amber-400" />}
              {lobby.isLocalSolo && (
                <span className="border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 font-mono-tabular text-[10px] font-semibold text-sky-300">
                  SOLO OFFLINE
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span>
                Room Code:{' '}
                <strong className="font-mono-tabular tracking-widest text-amber-300">
                  {lobby.roomCode}
                </strong>
              </span>
              <span>·</span>
              <span>{modeMeta.label}</span>
              <span>·</span>
              <span>Map: {MAP_LIST.find((m) => m.id === lobby.mapId)?.name ?? lobby.mapId}</span>
              <span>·</span>
              <span className="font-mono-tabular">
                {mode === 'bomb'
                  ? `First to ${lobby.roundsToWin ?? lobby.killLimit} Rounds · ${lobby.timeLimit}s/rnd`
                  : `First to ${lobby.killLimit} · ${Math.round(lobby.timeLimit / 60)}m`}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex cursor-pointer items-center gap-1.5 border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy Code
            </button>

            <button
              type="button"
              onClick={handleCopyInvite}
              className="inline-flex cursor-pointer items-center gap-1.5 border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap"
            >
              <Link2 className="h-3.5 w-3.5" />
              Copy Invite Link
            </button>

            <button
              type="button"
              onClick={handleNativeShare}
              className="inline-flex cursor-pointer items-center gap-1.5 border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>

            <button
              type="button"
              onClick={onLeaveLobby}
              className="inline-flex cursor-pointer items-center gap-1.5 border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 whitespace-nowrap"
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

        {/* Team Rosters or FFA Roster */}
        {mode === 'ffa' ? (
          <div className="mt-4 border border-amber-400/30 bg-black/40">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
              <span className="font-display text-sm font-bold text-amber-300">
                Free-For-All Roster
              </span>
              <span className="font-mono-tabular text-xs text-slate-400">
                {lobby.players.length} Combatants · Every Operator Hostile
              </span>
            </div>
            <div className="max-h-44 overflow-y-auto">
              {lobby.players.length === 0 ? (
                <div className="px-4 py-5 text-center text-xs text-slate-500">
                  No operators in lobby
                </div>
              ) : (
                lobby.players.map(renderRosterRow)
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="border border-blue-500/30 bg-black/40">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
                <span className="font-display text-sm font-bold text-blue-400">
                  {mode === 'bomb' ? 'Blue — Attackers' : 'Blue Task Force'}
                </span>
                <span className="font-mono-tabular text-xs text-slate-400">
                  {bluePlayers.length} Operators
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {bluePlayers.length === 0 ? (
                  <div className="px-4 py-5 text-center text-xs text-slate-500">
                    No operators assigned
                  </div>
                ) : (
                  bluePlayers.map(renderRosterRow)
                )}
              </div>
            </div>

            <div className="border border-red-500/30 bg-black/40">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
                <span className="font-display text-sm font-bold text-red-400">
                  {mode === 'bomb' ? 'Red — Defenders' : 'Red Opposition'}
                </span>
                <span className="font-mono-tabular text-xs text-slate-400">
                  {redPlayers.length} Operators
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {redPlayers.length === 0 ? (
                  <div className="px-4 py-5 text-center text-xs text-slate-500">
                    No operators assigned
                  </div>
                ) : (
                  redPlayers.map(renderRosterRow)
                )}
              </div>
            </div>
          </div>
        )}

        {/* Lobby Comms Chat Panel */}
        <div
          className="mt-4 border border-slate-400/20 bg-slate-950/75 p-3.5 backdrop-blur-md"
          role="region"
          aria-label="Lobby chat"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-amber-400" />
              <span className="font-display text-xs font-bold tracking-wider text-slate-200">
                LOBBY COMMS
              </span>
              <div className="ml-1 flex border border-white/15 bg-black/40">
                {(mode === 'ffa' ? (['all'] as const) : (['all', 'team'] as const)).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setChatChannel(ch)}
                    className={`cursor-pointer px-2 py-0.5 font-mono-tabular text-[10px] font-bold transition-colors ${
                      effectiveChatChannel === ch
                        ? ch === 'team'
                          ? 'bg-sky-500/25 text-sky-200'
                          : 'bg-amber-400/25 text-amber-200'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    [{ch.toUpperCase()}]
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {QUICK_CHAT_CALLOUTS.map((callout) => (
                <button
                  key={callout}
                  type="button"
                  onClick={() => handleCallout(callout)}
                  className="cursor-pointer border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-slate-300 transition-colors hover:border-amber-400/40 hover:bg-amber-400/10 hover:text-amber-200"
                >
                  {callout}
                </button>
              ))}
            </div>
          </div>

          <div
            ref={chatScrollRef}
            className="mt-2 h-28 overflow-y-auto scroll-smooth border border-white/10 bg-black/45 px-3 py-2 text-xs"
            aria-live="polite"
          >
            {chatMessages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[11px] text-slate-500">
                No lobby messages yet. Send a callout or press Enter to chat.
              </div>
            ) : (
              <div className="space-y-1">
                {chatMessages.map((msg) => {
                  const isSys = Boolean(msg.isSystem || msg.senderTeam === 'system');
                  const nameColor = isSys
                    ? 'text-amber-300'
                    : msg.senderTeam === 'blue'
                      ? 'text-blue-400'
                      : 'text-red-400';
                  const tagLabel = isSys
                    ? '[SYS]'
                    : msg.channel === 'team'
                      ? '[TEAM]'
                      : '[ALL]';
                  const tagColor = isSys
                    ? 'text-amber-400/80'
                    : msg.channel === 'team'
                      ? 'text-sky-400'
                      : 'text-slate-400';

                  return (
                    <div key={msg.id} className="flex items-baseline gap-1.5 break-words leading-snug">
                      <span className="shrink-0 font-mono-tabular text-[10px] text-slate-500">
                        {formatChatTimestamp(msg.timestamp)}
                      </span>
                      <span className={`shrink-0 font-mono-tabular text-[10px] font-bold ${tagColor}`}>
                        {tagLabel}
                      </span>
                      {!isSys && (
                        <span className={`shrink-0 font-semibold ${nameColor}`}>
                          {msg.senderName}:
                        </span>
                      )}
                      <span className={isSys ? 'text-amber-200/90' : 'text-slate-200'}>
                        {msg.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmitChat} className="mt-2 flex items-center gap-2">
            <input
              type="text"
              maxLength={CHAT_MAX_LENGTH}
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder={`Message ${effectiveChatChannel === 'team' ? 'team' : 'lobby'}...`}
              className="min-w-0 flex-1 border border-white/15 bg-black/55 px-3 py-1.5 text-xs text-white outline-none placeholder:text-slate-500 focus:border-amber-400"
            />
            <button
              type="submit"
              disabled={chatText.trim().length === 0}
              className="inline-flex cursor-pointer items-center gap-1.5 border border-amber-400/50 bg-amber-500/20 px-3.5 py-1.5 font-display text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </button>
          </form>
        </div>

        {/* Host Rules & Player Controls */}
        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-white/10 pt-4 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-8">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">
                {isHost ? 'Host Match Configuration' : 'Match Configuration (Host Controlled)'}
              </span>
              {isHost && mode !== 'ffa' && (
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

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <label className="block text-xs">
                <span className="text-slate-400">Mode</span>
                <select
                  disabled={!isHost}
                  value={mode}
                  onChange={(e) => {
                    const nextMode = e.target.value as GameMode;
                    const defaults = getModeDefaultLimits(nextMode);
                    onUpdateConfig({
                      mode: nextMode,
                      killLimit: defaults.killLimit,
                      timeLimit: defaults.timeLimitSec,
                      respawnDelay: defaults.respawnDelaySec,
                      friendlyFire: nextMode === 'ffa' ? false : lobby.friendlyFire,
                    });
                  }}
                  className="mt-1 w-full border border-white/15 bg-[#0b1017] px-2.5 py-1.5 text-xs text-white disabled:opacity-60"
                >
                  {GAME_MODE_IDS.map((m) => (
                    <option key={m} value={m}>
                      {GAME_MODE_META[m].label}
                    </option>
                  ))}
                </select>
              </label>

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
                <span className="text-slate-400">
                  {mode === 'bomb' ? 'Rounds to Win' : 'Score Limit'}
                </span>
                <select
                  disabled={!isHost}
                  value={mode === 'bomb' ? (lobby.roundsToWin ?? lobby.killLimit) : lobby.killLimit}
                  onChange={(e) =>
                    onUpdateConfig({ killLimit: parseInt(e.target.value, 10) })
                  }
                  className="mt-1 w-full border border-white/15 bg-[#0b1017] px-2.5 py-1.5 font-mono-tabular text-xs text-white disabled:opacity-60"
                >
                  {(mode === 'bomb' ? [3, 5, 7, 9] : [15, 20, 30, 50, 75]).map((k) => (
                    <option key={k} value={k}>
                      {mode === 'bomb' ? `${k} Rounds` : `${k} Kills`}
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
                <span className="text-slate-400">
                  {mode === 'ffa' ? 'Rule' : 'Friendly Fire'}
                </span>
                {mode === 'ffa' ? (
                  <div className="mt-1 flex w-full items-center justify-between border border-amber-400/25 bg-amber-500/10 px-2.5 py-1.5 font-mono-tabular text-amber-200">
                    <Shield className="h-3.5 w-3.5" />
                    <span>FFA</span>
                  </div>
                ) : (
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
                )}
              </div>
            </div>
          </div>

          {/* Right Action Stack */}
          <div className="flex flex-col justify-end gap-2 lg:col-span-4">
            {mode !== 'ffa' && (
              <button
                type="button"
                onClick={onSwitchTeam}
                className="flex w-full cursor-pointer items-center justify-center gap-2 border border-white/15 bg-white/5 px-4 py-2 font-display text-xs font-semibold text-white hover:bg-white/10"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Switch Team ({localPlayer?.team === 'blue' ? 'to Red' : 'to Blue'})
              </button>
            )}

            {isHost ? (
              <button
                type="button"
                onClick={onStartMatch}
                className="flex w-full cursor-pointer items-center justify-center gap-2 bg-amber-500 px-5 py-2.5 font-display text-sm font-bold tracking-wide text-slate-950 transition-colors hover:bg-amber-400"
              >
                <Crosshair className="h-4 w-4" />
                START MATCH
              </button>
            ) : (
              <button
                type="button"
                onClick={onToggleReady}
                className={`flex w-full cursor-pointer items-center justify-center gap-2 px-5 py-2.5 font-display text-sm font-bold tracking-wide transition-colors ${
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
