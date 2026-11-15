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
}: {
  label: string;
  score: number;
  accentClass: string;
  rows: MatchParticipant[];
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
            <th className="px-4 py-2 font-medium">Operator</th>
            <th className="px-3 py-2 text-right font-medium">Kills</th>
            <th className="px-3 py-2 text-right font-medium">Deaths</th>
            <th className="px-4 py-2 text-right font-medium">K/D</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const kd = p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2);
            return (
              <tr
                key={p.id}
                className={`border-b border-white/5 last:border-b-0 ${
                  p.isPlayer ? 'bg-amber-400/10 text-white' : 'text-slate-300'
                }`}
              >
                <td className="px-4 py-2 font-medium">
                  {p.name}
                  {p.isPlayer ? ' (You)' : ''}
                </td>
                <td className="px-3 py-2 text-right font-mono-tabular font-semibold text-white">
                  {p.kills}
                </td>
                <td className="px-3 py-2 text-right font-mono-tabular text-slate-400">
                  {p.deaths}
                </td>
                <td className="px-4 py-2 text-right font-mono-tabular text-slate-300">
                  {kd}
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

  const content = (
    <div className="w-full max-w-4xl border border-white/15 bg-[#0e131b]/95 p-5 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-3.5">
        <div>
          <h2 className="font-display text-lg font-semibold text-white">
            Team Deathmatch · {match.mapName}
          </h2>
          <p className="text-xs text-slate-400">
            Score Limit {match.killLimit} · Time Remaining {formatMatchTime(match.timeRemainingSec)}
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
        />
        <TeamTable
          label="Red Opposition"
          score={match.redScore}
          accentClass="text-red-400"
          rows={redTeam}
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
