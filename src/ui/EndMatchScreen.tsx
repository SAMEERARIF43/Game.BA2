import React from 'react';
import { LogOut, RotateCcw } from 'lucide-react';
import { MatchSnapshot } from '../game/types';
import { getRankSummary } from '../settings/progressionStorage';
import { ScoreboardOverlay } from './ScoreboardOverlay';

interface EndMatchScreenProps {
  match: MatchSnapshot;
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

  const topOperator = match.participants[0];
  const rank = getRankSummary(xp);

  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/75 p-6 backdrop-blur-md">
      <div className="w-full max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border border-white/15 bg-[#0e131b]/95 p-6">
          <div>
            <div className="text-xs font-medium text-slate-400">
              Match Complete · {match.mapName}
            </div>
            <h1 className={`mt-1 font-display text-3xl font-bold ${headlineColor}`}>
              {headline}
            </h1>
            {topOperator && (
              <p className="mt-1 text-xs text-slate-300">
                Top Operator: <span className="font-semibold text-white">{topOperator.name}</span>{' '}
                with <span className="font-mono-tabular text-amber-400">{topOperator.kills}</span> eliminations
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onReturnToMenu}
              className="inline-flex cursor-pointer items-center gap-2 border border-white/15 bg-white/5 px-4 py-2.5 font-display text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10 whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5" />
              {isMultiplayer ? 'Leave Match' : 'Leave to Menu'}
            </button>

            {(!isMultiplayer || isHost) && (
              <button
                type="button"
                onClick={isMultiplayer ? onReturnToLobby : onPlayAgain}
                className="inline-flex cursor-pointer items-center gap-2 bg-amber-500 px-5 py-2.5 font-display text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {isMultiplayer ? 'Return to Lobby' : 'Play Again'}
              </button>
            )}
          </div>
        </div>

        {/* Career Rank & Match XP Breakdown */}
        <div className="border border-white/15 bg-[#0e131b]/95 px-6 py-4">
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
        </div>

        <ScoreboardOverlay match={match} embedded />
      </div>
    </div>
  );
};
