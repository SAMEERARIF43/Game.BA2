import React, { useState } from 'react';
import { Award, LogOut, RotateCcw, Trophy, Zap, Crosshair, Shield, Flame } from 'lucide-react';
import { MatchSnapshot, TeamColorsConfig } from '../game/types';
import { TeamId } from '../maps/types';
import { selectMatchMvp } from '../match/matchMachine';
import { getRankSummary } from '../settings/progressionStorage';
import { resolveSideColors } from '../settings/teamColorsConfig';
import { ScoreboardOverlay, formatMatchTime } from './ScoreboardOverlay';

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

  const mvp = selectMatchMvp(match.participants, playerStats);
  const rank = getRankSummary(xp);

  const blueParticipants = match.participants.filter((p) => p.team === 'blue');
  const redParticipants = match.participants.filter((p) => p.team === 'red');
  const blueKills = blueParticipants.reduce((sum, p) => sum + p.kills, 0);
  const blueDeaths = blueParticipants.reduce((sum, p) => sum + p.deaths, 0);
  const redKills = redParticipants.reduce((sum, p) => sum + p.kills, 0);
  const redDeaths = redParticipants.reduce((sum, p) => sum + p.deaths, 0);
  const matchDuration = formatMatchTime(Math.max(1, 300 - match.timeRemainingSec));

  // Compute Accolades across participants
  const participantsWithStats = match.participants.map((p) => {
    const kills = p.isPlayer ? playerStats.kills : p.kills;
    const deaths = p.isPlayer ? playerStats.deaths : p.deaths;
    const headshots = p.isPlayer ? playerStats.headshots : Math.min(kills, Math.round(kills * 0.4));
    const accuracy = p.isPlayer ? playerStats.accuracyPct : (70 + (p.id.charCodeAt(p.id.length - 1) % 25));
    return { ...p, kills, deaths, headshots, accuracy };
  });

  const sharpshooter = [...participantsWithStats].sort((a, b) => b.accuracy - a.accuracy)[0];
  const mostResilient = [...participantsWithStats].sort((a, b) => a.deaths - b.deaths || b.kills - a.kills)[0];
  const deadliestHeadshots = [...participantsWithStats].sort((a, b) => b.headshots - a.headshots)[0];
  const topEliminator = [...participantsWithStats].sort((a, b) => b.kills - a.kills)[0];

  // Reconstruct top/frequent killer from killFeed or participants
  const killerCounts = new Map<string, { name: string; team: string; count: number }>();
  for (const entry of match.killFeed) {
    const curr = killerCounts.get(entry.killerName) ?? { name: entry.killerName, team: entry.killerTeam, count: 0 };
    curr.count += 1;
    killerCounts.set(entry.killerName, curr);
  }
  let topKiller = [...killerCounts.values()].sort((a, b) => b.count - a.count)[0];
  if (!topKiller && topEliminator && topEliminator.kills > 0) {
    topKiller = { name: topEliminator.name, team: topEliminator.team, count: topEliminator.kills };
  }

  const mvpTeamLabel = mvp
    ? mvp.team === 'blue'
      ? 'Blue Task Force'
      : 'Red Opposition'
    : null;
  const mvpTeamColor = mvp
    ? mvp.team === 'blue'
      ? 'text-blue-300'
      : 'text-red-300'
    : 'text-slate-300';
  const mvpRoleLabel = mvp ? (mvp.isPlayer ? 'You' : mvp.isBot ? 'Bot' : 'Operator') : null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/75 p-3 backdrop-blur-md sm:p-6">
      <div className="my-auto w-full max-w-4xl space-y-3 sm:space-y-5">
        <div className="flex flex-col items-start justify-between gap-5 border border-slate-400/20 bg-[#0e131b]/95 p-4 shadow-xl shadow-black/30 sm:flex-row sm:items-center sm:p-6">
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-400">
              Match Complete · {match.mapName}
            </div>
            <h1 className={`mt-1 font-display text-2xl font-bold sm:text-3xl ${headlineColor}`}>
              {headline}
            </h1>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {(!isMultiplayer || isHost) && (
              <button
                type="button"
                onClick={isMultiplayer ? onReturnToLobby : onPlayAgain}
                className="inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 bg-amber-500 px-4 py-2.5 font-display text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b] sm:flex-none sm:px-5 whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {isMultiplayer ? 'Return to Lobby' : 'Play Again'}
              </button>
            )}
            <button
              type="button"
              onClick={onReturnToMenu}
              className="inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 border border-white/15 bg-white/5 px-4 py-2.5 font-display text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b] sm:flex-none whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5" />
              {isMultiplayer ? 'Leave Match' : 'Main Menu'}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/15 bg-[#0e131b]/95">
          <button
            type="button"
            onClick={() => setActiveTab('scoreboard')}
            className={`flex-1 px-4 py-3 font-display text-xs font-bold tracking-wider transition-colors border-b-2 cursor-pointer ${
              activeTab === 'scoreboard'
                ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            SCOREBOARD & SUMMARY
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('highlights')}
            className={`flex-1 px-4 py-3 font-display text-xs font-bold tracking-wider transition-colors border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'highlights'
                ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="h-3.5 w-3.5 text-amber-400" />
            MATCH HIGHLIGHTS & KILL FEED
          </button>
        </div>

        {activeTab === 'highlights' ? (
          <div className="space-y-4">
            {topKiller ? (
              <div className="border border-amber-400/50 bg-gradient-to-r from-amber-500/15 via-[#0e131b] to-black p-5 shadow-xl">
                <div className="flex items-center gap-3.5">
                  <div className="grid h-12 w-12 shrink-0 place-items-center border border-amber-400/55 bg-amber-500/20 text-amber-300">
                    <Trophy className="h-6 w-6 animate-pulse" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-display font-bold tracking-widest text-amber-300">
                      <span>MOST FREQUENT KILLER OF THE GAME</span>
                      <span className="text-slate-500">·</span>
                      <span className={topKiller.team === 'blue' ? 'text-blue-300' : 'text-red-300'}>
                        {topKiller.team === 'blue' ? 'Blue Task Force' : 'Red Opposition'}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate font-display text-2xl font-bold text-white">
                      {topKiller.name}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-300 font-mono-tabular">
                      Dominant combat impact with <span className="font-bold text-amber-300">{topKiller.count} verified eliminations</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border border-white/10 bg-[#0e131b]/95 p-6 text-center text-xs text-slate-400">
                No combat eliminations recorded in this engagement.
              </div>
            )}

            <div className="border border-slate-400/20 bg-[#0e131b]/95 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
                <h3 className="font-display text-xs font-bold tracking-wider text-slate-200">
                  RECONSTRUCTION LOG · {match.killFeed.length} EVENTS
                </h3>
                <span className="font-mono-tabular text-[9px] text-slate-500">CHRONOLOGICAL ELIMINATIONS</span>
              </div>
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {match.killFeed.length > 0 ? (
                  match.killFeed.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-2 border border-white/10 bg-black/40 px-3 py-2 text-xs"
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
                  <div className="py-8 text-center text-xs text-slate-500">
                    No active kill feed events recorded during simulation.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {mvp && (
              <section
                aria-label="Match MVP"
                className="border border-amber-400/40 bg-[#0e131b]/95 px-4 py-4 shadow-lg shadow-black/30 sm:px-6"
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-start gap-3.5">
                    <div className="grid h-11 w-11 shrink-0 place-items-center border border-amber-400/40 bg-amber-500/15 text-amber-300">
                      <Award className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-display font-bold tracking-wider text-amber-300">
                          MATCH MVP
                        </span>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className={mvpTeamColor}>{mvpTeamLabel}</span>
                        {mvpRoleLabel && (
                          <>
                            <span className="text-slate-600" aria-hidden="true">·</span>
                            <span className="text-slate-400">{mvpRoleLabel}</span>
                          </>
                        )}
                      </div>
                      <div className="mt-1 truncate font-display text-xl font-bold text-white sm:text-2xl">
                        {mvp.name}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {mvp.isPlayer && mvp.headshots !== null && mvp.accuracyPct !== null
                          ? `${mvp.headshots} headshots · ${mvp.accuracyPct}% accuracy bonus included`
                          : 'Highest combat score across all match operators'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 sm:shrink-0">
                    <div className="border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-right">
                      <div className="text-[10px] text-amber-200/80">Combat Score</div>
                      <div className="mt-0.5 font-mono-tabular text-base font-bold text-amber-300 sm:text-lg">
                        {mvp.combatScore.toLocaleString()}
                      </div>
                    </div>
                    <div className="border border-white/10 bg-black/35 px-3 py-2 text-right">
                      <div className="text-[10px] text-slate-400">Kills</div>
                      <div className="mt-0.5 font-mono-tabular text-base font-bold text-white sm:text-lg">
                        {mvp.kills}
                      </div>
                    </div>
                    <div className="border border-white/10 bg-black/35 px-3 py-2 text-right">
                      <div className="text-[10px] text-slate-400">Deaths</div>
                      <div className="mt-0.5 font-mono-tabular text-base font-bold text-slate-300 sm:text-lg">
                        {mvp.deaths}
                      </div>
                    </div>
                    <div className="border border-white/10 bg-black/35 px-3 py-2 text-right">
                      <div className="text-[10px] text-slate-400">K/D</div>
                      <div className="mt-0.5 font-mono-tabular text-base font-bold text-sky-300 sm:text-lg">
                        {mvp.kdRatio.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Match Accolades Section */}
            <section
              aria-label="Match Accolades"
              className="border border-slate-400/20 bg-[#0e131b]/95 px-4 py-3.5 sm:px-6 sm:py-4"
            >
              <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
                <h2 className="font-display text-xs font-bold tracking-widest text-slate-200">
                  MATCH ACCOLADES & HONORS
                </h2>
                <span className="font-mono-tabular text-[9px] text-amber-400">DISTINGUISHED PERFORMANCE</span>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {sharpshooter && (
                  <div className="border border-sky-400/30 bg-sky-500/10 p-3">
                    <div className="flex items-center gap-2 text-[10px] font-display font-bold text-sky-300">
                      <Crosshair className="h-3.5 w-3.5" />
                      <span>SHARPSHOOTER</span>
                    </div>
                    <div className="mt-1 font-display text-sm font-bold text-white truncate">{sharpshooter.name}</div>
                    <div className="mt-0.5 font-mono-tabular text-xs text-sky-200">{sharpshooter.accuracy}% Accuracy</div>
                  </div>
                )}
                {mostResilient && (
                  <div className="border border-emerald-400/30 bg-emerald-500/10 p-3">
                    <div className="flex items-center gap-2 text-[10px] font-display font-bold text-emerald-300">
                      <Shield className="h-3.5 w-3.5" />
                      <span>MOST RESILIENT</span>
                    </div>
                    <div className="mt-1 font-display text-sm font-bold text-white truncate">{mostResilient.name}</div>
                    <div className="mt-0.5 font-mono-tabular text-xs text-emerald-200">{mostResilient.deaths} Deaths ({mostResilient.kills} Kills)</div>
                  </div>
                )}
                {deadliestHeadshots && (
                  <div className="border border-amber-400/30 bg-amber-500/10 p-3">
                    <div className="flex items-center gap-2 text-[10px] font-display font-bold text-amber-300">
                      <Flame className="h-3.5 w-3.5" />
                      <span>DEADLY PRECISION</span>
                    </div>
                    <div className="mt-1 font-display text-sm font-bold text-white truncate">{deadliestHeadshots.name}</div>
                    <div className="mt-0.5 font-mono-tabular text-xs text-amber-200">{deadliestHeadshots.headshots} Headshots</div>
                  </div>
                )}
                {topEliminator && (
                  <div className="border border-purple-400/30 bg-purple-500/10 p-3">
                    <div className="flex items-center gap-2 text-[10px] font-display font-bold text-purple-300">
                      <Zap className="h-3.5 w-3.5" />
                      <span>COMBAT ACE</span>
                    </div>
                    <div className="mt-1 font-display text-sm font-bold text-white truncate">{topEliminator.name}</div>
                    <div className="mt-0.5 font-mono-tabular text-xs text-purple-200">{topEliminator.kills} Eliminations</div>
                  </div>
                )}
              </div>
            </section>

            <section
              aria-label="Match Summary"
              className="border border-slate-400/20 bg-[#0e131b]/95 px-4 py-3.5 sm:px-6 sm:py-4"
            >
              <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
                <h2 className="font-display text-xs font-bold tracking-widest text-slate-200">
                  MATCH SUMMARY · {match.mapName}
                </h2>
                <span className="font-mono-tabular text-[9px] text-amber-400">
                  DURATION {matchDuration}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="border border-blue-400/20 bg-blue-500/5 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-xs font-bold text-blue-400" style={{ color: sideColors.blueHex }}>
                      Blue Task Force
                    </span>
                    <span className="font-mono-tabular text-base font-bold text-white">{match.blueScore} PTS</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px]">Total Kills:</span>{' '}
                      <span className="font-mono-tabular font-semibold text-white">{blueKills}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px]">Total Deaths:</span>{' '}
                      <span className="font-mono-tabular font-semibold text-slate-300">{blueDeaths}</span>
                    </div>
                  </div>
                </div>

                <div className="border border-red-400/20 bg-red-500/5 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-xs font-bold text-red-400" style={{ color: sideColors.redHex }}>
                      Red Opposition
                    </span>
                    <span className="font-mono-tabular text-base font-bold text-white">{match.redScore} PTS</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px]">Total Kills:</span>{' '}
                      <span className="font-mono-tabular font-semibold text-white">{redKills}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px]">Total Deaths:</span>{' '}
                      <span className="font-mono-tabular font-semibold text-slate-300">{redDeaths}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section
              aria-label="Your match statistics"
              className="border border-slate-400/20 bg-[#0e131b]/95 px-4 py-3.5 sm:px-6 sm:py-4"
            >
              <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
                <h2 className="font-display text-xs font-bold tracking-widest text-slate-200">
                  YOUR MATCH
                </h2>
                <span className="font-mono-tabular text-[9px] text-slate-500">OPERATOR REPORT</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: 'Kills', value: playerStats.kills, color: 'text-white' },
                  { label: 'Deaths', value: playerStats.deaths, color: 'text-slate-300' },
                  { label: 'Accuracy', value: `${playerStats.accuracyPct}%`, color: 'text-sky-300' },
                  { label: 'Headshots', value: playerStats.headshots, color: 'text-amber-300' },
                ].map((stat) => (
                  <div key={stat.label} className="border border-white/10 bg-black/30 px-3 py-2">
                    <div className="text-[10px] text-slate-500">{stat.label}</div>
                    <div className={`mt-0.5 font-mono-tabular text-lg font-bold ${stat.color}`}>
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section
              aria-label="Career rank and match experience"
              className="border border-slate-400/20 bg-[#0e131b]/95 px-4 py-3.5 sm:px-6 sm:py-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-display text-sm font-bold text-white">
                    LV {rank.level} · {rank.title}
                  </span>
                  <span className="font-mono-tabular font-semibold text-amber-400">
                    +{sessionXpEarned.toLocaleString()} XP EARNED
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono-tabular text-slate-300">
                  <span className="text-amber-300 font-bold">{rank.progressPct}%</span>
                  <span>to LV {rank.level + 1}</span>
                </div>
              </div>
              <div className="mt-2.5 relative h-2 w-full overflow-hidden rounded-none bg-black/60 border border-amber-400/30">
                <div
                  className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300 shadow-sm shadow-amber-500/50 transition-[width] duration-500"
                  style={{ width: `${rank.progressPct}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] font-mono-tabular text-slate-400">
                <span>Current: {rank.xp.toLocaleString()} XP</span>
                <span>{rank.nextTierXp ? `Next Tier: ${rank.nextTierXp.toLocaleString()} XP` : 'MAX RANK'}</span>
              </div>
            </section>

            <ScoreboardOverlay
              match={match}
              embedded
              mvpId={mvp?.id}
              teamColors={teamColors}
              localTeam={localTeam}
              playerStats={playerStats}
            />
          </>
        )}
      </div>
    </div>
  );
};
