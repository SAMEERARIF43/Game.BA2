import React from 'react';
import { Award, LogOut, RotateCcw } from 'lucide-react';
import { MatchSnapshot } from '../game/types';
import { selectMatchMvp } from '../match/matchMachine';
import { getRankSummary } from '../settings/progressionStorage';
import { ScoreboardOverlay } from './ScoreboardOverlay';

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
  isMultiplayer = false,
  isHost = false,
  onPlayAgain,
  onReturnToLobby,
  onReturnToMenu,
}) => {
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
            <span className="font-mono-tabular text-slate-300">
              {rank.xp.toLocaleString()}
              {rank.nextTierXp ? ` / ${rank.nextTierXp.toLocaleString()} XP` : ' XP MAX'}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full bg-white/10">
            <div
              className="h-full bg-amber-400 transition-[width] duration-300"
              style={{ width: `${rank.progressPct}%` }}
            />
          </div>
        </section>

        <ScoreboardOverlay match={match} embedded mvpId={mvp?.id} />
      </div>
    </div>
  );
};
