import React, { useState } from 'react';
import { Award, LogOut, RotateCcw, Trophy, Zap, Crosshair, Shield, Flame } from 'lucide-react';
import { MatchSnapshot, TeamColorsConfig } from '../game/types';
import { TeamId } from '../maps/types';
import { calculateCombatScore, selectMatchMvp } from '../match/matchMachine';
import { getRankSummary } from '../settings/progressionStorage';
import { resolveSideColors } from '../settings/teamColorsConfig';
import { formatMatchTime } from './ScoreboardOverlay';

interface EndMatchScreenProps {
  match: MatchSnapshot;
  playerStats: {
    kills: number;
    deaths: number;
    accuracyPct: number;
    headshots: number;
  };
  xp: number;
  sessionXpEarned: number;
  teamColors?: Partial<TeamColorsConfig>;
  localTeam?: TeamId;
  isMultiplayer?: boolean;
  isHost?: boolean;
  onPlayAgain: () => void;
  onReturnToLobby?: () => void;
  onReturnToMenu: () => void;
}

export const EndMatchScreen: React.FC<EndMatchScreenProps> = ({
  match,
  playerStats,
  xp,
  sessionXpEarned,
  teamColors,
  localTeam = 'blue',
  isMultiplayer = false,
  isHost = false,
  onPlayAgain,
  onReturnToLobby,
  onReturnToMenu,
}) => {
  const [activeTab, setActiveTab] = useState<'scoreboard' | 'highlights'>('scoreboard');
  const sideColors = resolveSideColors(teamColors, localTeam, match.mode ?? 'tdm');

  const headline =
    match.winner === 'blue'
      ? 'Victory — Blue Task Force'
      : match.winner === 'red'
        ? 'Defeat — Red Opposition'
        : 'Draw Match';

  const headlineColor =
    match.winner === 'blue'
      ? 'text-blue-400'
      : match.winner === 'red'
        ? 'text-red-400'
        : 'text-amber-400';

  const rank = getRankSummary(xp);
  const matchDuration = formatMatchTime(Math.max(1, 300 - match.timeRemainingSec));

  // Compute normalized participants with unified score and normalized bot accuracy (22%–48%)
  const participantsWithStats = match.participants.map((p) => {
    const kills = p.isPlayer ? playerStats.kills : p.kills;
    const deaths = p.isPlayer ? playerStats.deaths : p.deaths;
    const headshots = p.isPlayer ? playerStats.headshots : Math.min(kills, Math.round(kills * 0.35));
    const accuracyPct = p.isPlayer
      ? playerStats.accuracyPct
      : 22 + (p.id.charCodeAt(p.id.length - 1) % 27);
    const combatScore = calculateCombatScore(kills, headshots, accuracyPct);
    const kdRatio = deaths > 0 ? Math.round((kills / deaths) * 100) / 100 : kills;
    const isBot = !p.isPlayer && p.id.startsWith('bot_');
    return { ...p, isBot, kills, deaths, headshots, accuracyPct, combatScore, kdRatio };
  });

  const mvp = selectMatchMvp(match.participants, playerStats);
  const normalizedMvp = mvp
    ? {
        ...mvp,
        headshots: mvp.headshots ?? playerStats.headshots,
        accuracyPct: mvp.accuracyPct ?? playerStats.accuracyPct,
        combatScore: mvp.combatScore,
      }
    : participantsWithStats[0];

  const blueParticipants = participantsWithStats.filter((p) => p.team === 'blue');
  const redParticipants = participantsWithStats.filter((p) => p.team === 'red');

  const sharpshooter = [...participantsWithStats].sort((a, b) => b.accuracyPct - a.accuracyPct)[0];
  const deadliestHeadshots = [...participantsWithStats].sort((a, b) => b.headshots - a.headshots)[0];

  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center overflow-hidden bg-black/82 p-3 backdrop-blur-md sm:p-5">
      <div className="flex h-full max-h-[710px] w-full max-w-7xl flex-col justify-between gap-3 overflow-hidden">
        
        {/* Top Command Bar */}
        <header className="flex shrink-0 items-center justify-between border border-slate-400/20 bg-[#0b1017]/95 px-4 py-3 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div>
              <div className="font-mono-tabular text-[10px] uppercase tracking-widest text-slate-400">
                {String(match.mode || 'tdm').toUpperCase()} · {match.mapName} · DURATION {matchDuration}
              </div>
              <h1 className={`font-display text-xl font-bold sm:text-2xl ${headlineColor}`}>
                {headline}
              </h1>
            </div>
            <div className="hidden items-center gap-2 border-l border-white/10 pl-4 sm:flex">
              <span className="font-mono-tabular text-sm font-bold" style={{ color: sideColors.blueHex }}>
                {match.blueScore}
              </span>
              <span className="text-slate-500">:</span>
              <span className="font-mono-tabular text-sm font-bold" style={{ color: sideColors.redHex }}>
                {match.redScore}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex border border-white/15 bg-black/55">
              <button
                type="button"
                onClick={() => setActiveTab('scoreboard')}
                className={`cursor-pointer px-3 py-1.5 font-display text-xs font-bold tracking-wider transition-colors ${
                  activeTab === 'scoreboard'
                    ? 'bg-amber-400/20 text-amber-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                SCOREBOARD
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('highlights')}
                className={`cursor-pointer px-3 py-1.5 font-display text-xs font-bold tracking-wider transition-colors ${
                  activeTab === 'highlights'
                    ? 'bg-amber-400/20 text-amber-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                KILL FEED
              </button>
            </div>

            {(!isMultiplayer || isHost) && (
              <button
                type="button"
                onClick={isMultiplayer ? onReturnToLobby : onPlayAgain}
                className="cursor-pointer bg-amber-500 px-4 py-2 font-display text-xs font-bold tracking-wider text-slate-950 transition-colors hover:bg-amber-400 focus-visible:outline-none whitespace-nowrap"
              >
                {isMultiplayer ? 'LOBBY' : 'PLAY AGAIN'}
              </button>
            )}

            <button
              type="button"
              onClick={onReturnToMenu}
              className="cursor-pointer border border-white/20 bg-white/5 px-4 py-2 font-display text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline-none whitespace-nowrap"
            >
              {isMultiplayer ? 'LEAVE' : 'MENU'}
            </button>
          </div>
        </header>

        {/* Zero-Scroll 2-Column Tactical Body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
          
          {/* Left Column (Primary Scoreboard Panel - 7 Cols) */}
          <div className="flex min-h-0 flex-col border border-white/15 bg-[#0b1017]/90 p-3.5 backdrop-blur-md lg:col-span-7">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-mono-tabular text-[10px] font-bold tracking-widest text-slate-300">
                TACTICAL ENGAGEMENT SCOREBOARD
              </span>
              <span className="font-mono-tabular text-[10px] text-amber-400">
                {participantsWithStats.length} OPERATORS
              </span>
            </div>

            <div className="mt-2.5 min-h-0 flex-1 overflow-y-auto space-y-3 pr-1">
              {/* Blue Team Table */}
              {blueParticipants.length > 0 && (
                <div className="border border-blue-400/25 bg-black/40">
                  <div className="flex items-center justify-between border-b border-blue-400/20 px-3 py-1.5 bg-blue-950/30">
                    <span className="font-display text-xs font-bold text-blue-300" style={{ color: sideColors.blueHex }}>
                      BLUE TASK FORCE
                    </span>
                    <span className="font-mono-tabular text-xs font-bold text-white">
                      {match.blueScore} PTS
                    </span>
                  </div>
                  <table className="w-full text-left font-mono-tabular text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-[10px] text-slate-400">
                        <th className="px-3 py-1.5 font-medium">Operator</th>
                        <th className="px-2 py-1.5 text-right font-medium">K</th>
                        <th className="px-2 py-1.5 text-right font-medium">D</th>
                        <th className="px-2 py-1.5 text-right font-medium">K/D</th>
                        <th className="px-2 py-1.5 text-right font-medium">HS</th>
                        <th className="px-2 py-1.5 text-right font-medium">Acc</th>
                        <th className="px-3 py-1.5 text-right font-medium">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blueParticipants.map((p) => {
                        const isMvp = normalizedMvp?.id === p.id;
                        const roleTag = p.isPlayer ? 'YOU' : p.isBot ? 'BOT' : 'OP';
                        return (
                          <tr
                            key={p.id}
                            className={`border-b border-white/5 last:border-b-0 ${
                              p.isPlayer ? 'bg-amber-400/12 text-white font-semibold' : 'text-slate-300'
                            }`}
                          >
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="truncate">{p.name}</span>
                                <span className="border border-white/20 bg-white/5 px-1 py-0.2 font-mono-tabular text-[8px] font-bold text-slate-300">
                                  {roleTag}
                                </span>
                                {isMvp && (
                                  <span className="border border-amber-400/50 bg-amber-400/20 px-1 py-0.2 font-mono-tabular text-[8px] font-bold text-amber-300">
                                    MVP
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right text-white">{p.kills}</td>
                            <td className="px-2 py-1.5 text-right text-slate-400">{p.deaths}</td>
                            <td className="px-2 py-1.5 text-right text-sky-300">{p.kdRatio.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right text-amber-300">{p.headshots}</td>
                            <td className="px-2 py-1.5 text-right text-emerald-300">{p.accuracyPct}%</td>
                            <td className="px-3 py-1.5 text-right font-bold text-amber-400">{p.combatScore}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Red Team Table */}
              {redParticipants.length > 0 && (
                <div className="border border-red-400/25 bg-black/40">
                  <div className="flex items-center justify-between border-b border-red-400/20 px-3 py-1.5 bg-red-950/30">
                    <span className="font-display text-xs font-bold text-red-300" style={{ color: sideColors.redHex }}>
                      RED OPPOSITION
                    </span>
                    <span className="font-mono-tabular text-xs font-bold text-white">
                      {match.redScore} PTS
                    </span>
                  </div>
                  <table className="w-full text-left font-mono-tabular text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-[10px] text-slate-400">
                        <th className="px-3 py-1.5 font-medium">Operator</th>
                        <th className="px-2 py-1.5 text-right font-medium">K</th>
                        <th className="px-2 py-1.5 text-right font-medium">D</th>
                        <th className="px-2 py-1.5 text-right font-medium">K/D</th>
                        <th className="px-2 py-1.5 text-right font-medium">HS</th>
                        <th className="px-2 py-1.5 text-right font-medium">Acc</th>
                        <th className="px-3 py-1.5 text-right font-medium">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {redParticipants.map((p) => {
                        const isMvp = normalizedMvp?.id === p.id;
                        const roleTag = p.isPlayer ? 'YOU' : p.isBot ? 'BOT' : 'OP';
                        return (
                          <tr
                            key={p.id}
                            className={`border-b border-white/5 last:border-b-0 ${
                              p.isPlayer ? 'bg-amber-400/12 text-white font-semibold' : 'text-slate-300'
                            }`}
                          >
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="truncate">{p.name}</span>
                                <span className="border border-white/20 bg-white/5 px-1 py-0.2 font-mono-tabular text-[8px] font-bold text-slate-300">
                                  {roleTag}
                                </span>
                                {isMvp && (
                                  <span className="border border-amber-400/50 bg-amber-400/20 px-1 py-0.2 font-mono-tabular text-[8px] font-bold text-amber-300">
                                    MVP
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right text-white">{p.kills}</td>
                            <td className="px-2 py-1.5 text-right text-slate-400">{p.deaths}</td>
                            <td className="px-2 py-1.5 text-right text-sky-300">{p.kdRatio.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right text-amber-300">{p.headshots}</td>
                            <td className="px-2 py-1.5 text-right text-emerald-300">{p.accuracyPct}%</td>
                            <td className="px-3 py-1.5 text-right font-bold text-amber-400">{p.combatScore}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right Column (Spotlight & Progression Panel - 5 Cols) */}
          <div className="flex min-h-0 flex-col gap-3 lg:col-span-5">
            
            {/* MVP Spotlight Card */}
            {normalizedMvp && (
              <div className="border border-amber-400/40 bg-[#0b1017]/95 p-3.5 backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="inline-flex items-center gap-1.5 font-mono-tabular text-[10px] font-bold tracking-widest text-amber-400">
                    <Award className="h-3 w-3" />
                    MATCH MVP SPOTLIGHT
                  </span>
                  <span className="font-mono-tabular text-[10px] text-slate-300">
                    {normalizedMvp.team.toUpperCase()} TEAM
                  </span>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-display text-lg font-bold text-white">
                      {normalizedMvp.name}
                    </div>
                    <div className="font-mono-tabular text-[10px] text-slate-400">
                      {normalizedMvp.headshots} Headshots · {normalizedMvp.accuracyPct}% Accuracy
                    </div>
                  </div>
                  <div className="border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-right">
                    <div className="font-mono-tabular text-[9px] text-amber-300">COMBAT SCORE</div>
                    <div className="font-mono-tabular text-lg font-bold text-amber-200">
                      {normalizedMvp.combatScore}
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center font-mono-tabular text-xs">
                  <div className="border border-white/10 bg-black/40 py-1.5">
                    <span className="text-[9px] text-slate-400 block">KILLS</span>
                    <span className="font-bold text-white">{normalizedMvp.kills}</span>
                  </div>
                  <div className="border border-white/10 bg-black/40 py-1.5">
                    <span className="text-[9px] text-slate-400 block">DEATHS</span>
                    <span className="font-bold text-slate-300">{normalizedMvp.deaths}</span>
                  </div>
                  <div className="border border-white/10 bg-black/40 py-1.5">
                    <span className="text-[9px] text-slate-400 block">K/D</span>
                    <span className="font-bold text-sky-300">{normalizedMvp.kdRatio.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Rank & XP Progression Card */}
            <div className="border border-white/15 bg-[#0b1017]/90 p-3.5 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="font-mono-tabular text-[10px] font-bold tracking-widest text-slate-300">
                  RANK & CAREER PROGRESSION
                </span>
                <span className="font-mono-tabular text-[10px] font-bold text-amber-400">
                  +{sessionXpEarned.toLocaleString()} XP
                </span>
              </div>
              <div className="mt-2.5 flex items-center justify-between text-xs">
                <span className="font-display font-bold text-white">
                  LV {rank.level} · {rank.title}
                </span>
                <span className="font-mono-tabular text-slate-300">{rank.progressPct}% to LV {rank.level + 1}</span>
              </div>
              <div className="mt-2 relative h-2 w-full overflow-hidden bg-black/60 border border-amber-400/30">
                <div
                  className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300 transition-[width] duration-500"
                  style={{ width: `${rank.progressPct}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between font-mono-tabular text-[10px] text-slate-400">
                <span>Current: {rank.xp.toLocaleString()} XP</span>
                <span>{rank.nextTierXp ? `Next Tier: ${rank.nextTierXp.toLocaleString()} XP` : 'MAX RANK'}</span>
              </div>
            </div>

            {/* Accolades Mini Banner */}
            <div className="grid grid-cols-2 gap-2 border border-white/15 bg-[#0b1017]/90 p-3.5 backdrop-blur-md">
              {sharpshooter && (
                <div className="border border-sky-400/30 bg-sky-500/10 p-2">
                  <div className="flex items-center gap-1.5 font-display text-[10px] font-bold text-sky-300">
                    <Crosshair className="h-3 w-3" />
                    <span>SHARPSHOOTER</span>
                  </div>
                  <div className="mt-0.5 truncate font-display text-xs font-bold text-white">
                    {sharpshooter.name}
                  </div>
                  <div className="font-mono-tabular text-[10px] text-sky-200">
                    {sharpshooter.accuracyPct}% Accuracy
                  </div>
                </div>
              )}
              {deadliestHeadshots && (
                <div className="border border-amber-400/30 bg-amber-500/10 p-2">
                  <div className="flex items-center gap-1.5 font-display text-[10px] font-bold text-amber-300">
                    <Flame className="h-3 w-3" />
                    <span>HEADHUNTER</span>
                  </div>
                  <div className="mt-0.5 truncate font-display text-xs font-bold text-white">
                    {deadliestHeadshots.name}
                  </div>
                  <div className="font-mono-tabular text-[10px] text-amber-200">
                    {deadliestHeadshots.headshots} Headshots
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

      {/* Highlights / Kill Feed Tab Overlay */}
      {activeTab === 'highlights' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col border border-white/20 bg-[#0b1017] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <div className="font-mono-tabular text-[10px] font-bold tracking-widest text-amber-400">
                  MATCH HIGHLIGHTS · CHRONOLOGICAL KILL FEED
                </div>
                <h2 className="font-display text-xl font-bold text-white">
                  Combat Reconstruction Log ({match.killFeed.length} Events)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('scoreboard')}
                className="cursor-pointer border border-white/15 bg-white/[0.05] p-2 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 min-h-[260px] flex-1 overflow-y-auto space-y-2 pr-1">
              {match.killFeed.length > 0 ? (
                match.killFeed.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 border border-white/10 bg-black/50 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-semibold truncate ${entry.killerTeam === 'blue' ? 'text-blue-400' : 'text-red-400'}`}>
                        {entry.killerName}
                      </span>
                      <span className="text-slate-500">eliminated</span>
                      <span className={`font-semibold truncate ${entry.victimTeam === 'blue' ? 'text-blue-400' : 'text-red-400'}`}>
                        {entry.victimName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono-tabular text-[10px] text-slate-400 shrink-0">
                      <span className="border border-white/15 bg-white/5 px-2 py-0.5 text-amber-300 uppercase">
                        {entry.weaponName}
                      </span>
                      {entry.headshot && (
                        <span className="border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-amber-300 font-bold">
                          HEADSHOT
                        </span>
                      )}
                      <span className="text-slate-500">{entry.distanceMeters}m</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-xs text-slate-500">
                  No active kill feed events recorded during simulation.
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setActiveTab('scoreboard')}
                className="cursor-pointer border border-white/20 bg-white/[0.06] px-5 py-2 font-display text-xs font-bold text-white hover:bg-white/12"
              >
                RETURN TO SCOREBOARD
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
