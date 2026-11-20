import React from 'react';
import { MatchParticipant, MatchSnapshot } from '../game/types';

interface ScoreboardOverlayProps {
  match: MatchSnapshot;
  embedded?: boolean;
}

export function formatMatchTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function TeamTable({
  label,
  score,
  accentClass,
  rows,
  mvpId,
}: {
  label: string;
  score: number;
  accentClass: string;
  rows: MatchParticipant[];
  mvpId?: string;
}) {
  return (
    <div className="border border-white/10 bg-black/45">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <span className={`font-display text-sm font-semibold ${accentClass}`}>{label}</span>
        <span className="font-mono-tabular font-display text-lg font-bold text-white">
          {score}
        </span>
      </div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-white/10 text-slate-400">
            <th className="px-2 py-2 font-medium sm:px-4">Operator</th>
            <th className="px-2 py-2 text-right font-medium">Kills</th>
            <th className="px-2 py-2 text-right font-medium">Deaths</th>
            <th
              className="px-2 py-2 text-right font-medium sm:px-4"
              title="Derived score: 100 points per elimination, excluding match bonuses"
            >
              Score
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const isMvp = p.id === mvpId;
            const roleTag = p.isPlayer ? 'YOU' : p.id.startsWith('bot_') ? 'BOT' : 'PLAYER';
            return (
              <tr
                key={p.id}
                className={`border-b border-white/5 last:border-b-0 ${
                  p.isPlayer
                    ? 'bg-amber-400/10 text-white'
                    : isMvp
                      ? 'bg-amber-300/[0.07] text-white'
                      : 'text-slate-300'
                }`}
              >
                <td className="max-w-[170px] px-2 py-2 font-medium sm:max-w-none sm:px-4">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{p.name}</span>
                    <span
                      className={`shrink-0 border px-1 py-0.5 font-mono-tabular text-[8px] font-bold tracking-wider ${
                        p.isPlayer
                          ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                          : roleTag === 'BOT'
                            ? 'border-slate-500/30 bg-slate-500/10 text-slate-400'
                            : 'border-blue-400/25 bg-blue-400/5 text-blue-300/80'
                      }`}
                    >
                      {roleTag}
                    </span>
                    {isMvp && (
                      <span className="shrink-0 border border-amber-300/40 bg-amber-300/10 px-1 py-0.5 font-mono-tabular text-[8px] font-bold tracking-wider text-amber-200">
                        MVP
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2 text-right font-mono-tabular font-semibold text-white">
                  {p.kills}
                </td>
                <td className="px-2 py-2 text-right font-mono-tabular text-slate-400">
                  {p.deaths}
                </td>
                <td className="px-2 py-2 text-right font-mono-tabular text-slate-300 sm:px-4">
                  {p.kills * 100}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const ScoreboardOverlay: React.FC<ScoreboardOverlayProps> = ({
  match,
  embedded = false,
}) => {
  const blueTeam = match.participants.filter((p) => p.team === 'blue');
  const redTeam = match.participants.filter((p) => p.team === 'red');
  const mvp = [...match.participants].sort(
    (a, b) => b.kills - a.kills || a.deaths - b.deaths,
  )[0];

  const content = (
    <div className="w-full max-w-4xl border border-slate-400/20 bg-[#0e131b]/95 p-4 shadow-2xl shadow-black/40 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-3.5">
        <div>
          <h2 className="font-display text-lg font-semibold text-white">
            Team Deathmatch · {match.mapName}
          </h2>
          <p className="text-xs text-slate-400">
            Score Limit {match.killLimit} · Time Remaining {formatMatchTime(match.timeRemainingSec)}
          </p>
          <p className="mt-1 font-mono-tabular text-[9px] text-slate-500">
            Individual score is 100 per elimination, excluding bonuses.
          </p>
        </div>
        <div className="flex items-center gap-4 font-mono-tabular">
          <span className="text-sm font-semibold text-blue-400">Blue {match.blueScore}</span>
          <span className="text-slate-600">—</span>
          <span className="text-sm font-semibold text-red-400">Red {match.redScore}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <TeamTable
          label="Blue Task Force"
          score={match.blueScore}
          accentClass="text-blue-400"
          rows={blueTeam}
          mvpId={mvp?.id}
        />
        <TeamTable
          label="Red Opposition"
          score={match.redScore}
          accentClass="text-red-400"
          rows={redTeam}
          mvpId={mvp?.id}
        />
      </div>
    </div>
  );

  if (embedded) return content;

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-black/45 p-6 backdrop-blur-[2px]">
      {content}
    </div>
  );
};
