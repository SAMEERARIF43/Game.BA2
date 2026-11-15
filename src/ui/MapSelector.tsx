import React from 'react';
import { ArrowLeft, Crosshair } from 'lucide-react';
import { MAP_LIST } from '../maps/MapManager';
import { MapId } from '../maps/types';

interface MapSelectorProps {
  selectedMapId: MapId;
  onPreviewMap: (mapId: MapId) => void;
  onDeployMap: (mapId: MapId) => void;
  onBack: () => void;
}

function MapSchematic({ id, accentHex }: { id: MapId; accentHex: string }) {
  return (
    <svg
      viewBox="0 0 160 88"
      className="h-24 w-full border border-white/10 bg-[#080b10]"
      aria-hidden="true"
    >
      <rect x="6" y="6" width="148" height="76" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      {id === 'urban' && (
        <>
          <rect x="26" y="24" width="26" height="40" fill="rgba(255,255,255,0.12)" stroke={accentHex} strokeWidth="1" />
          <rect x="108" y="24" width="26" height="40" fill="rgba(255,255,255,0.12)" stroke={accentHex} strokeWidth="1" />
          <rect x="74" y="34" width="12" height="20" fill="rgba(255,255,255,0.22)" />
          <line x1="80" y1="8" x2="80" y2="80" stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
        </>
      )}
      {id === 'desert' && (
        <>
          <rect x="64" y="30" width="32" height="28" fill="rgba(255,255,255,0.12)" stroke={accentHex} strokeWidth="1" />
          <rect x="24" y="16" width="22" height="12" fill="rgba(255,255,255,0.18)" />
          <rect x="114" y="60" width="22" height="12" fill="rgba(255,255,255,0.18)" />
          <circle cx="22" cy="64" r="7" fill="none" stroke={accentHex} strokeWidth="1.2" />
          <circle cx="138" cy="24" r="7" fill="none" stroke={accentHex} strokeWidth="1.2" />
        </>
      )}
      {id === 'industrial' && (
        <>
          <rect x="34" y="39" width="92" height="10" fill={accentHex} fillOpacity="0.35" stroke={accentHex} strokeWidth="1" />
          <rect x="22" y="16" width="28" height="14" fill="rgba(255,255,255,0.14)" />
          <rect x="110" y="58" width="28" height="14" fill="rgba(255,255,255,0.14)" />
          <circle cx="22" cy="64" r="6" fill="rgba(255,255,255,0.2)" />
          <circle cx="138" cy="24" r="6" fill="rgba(255,255,255,0.2)" />
        </>
      )}
      {id === 'forest' && (
        <>
          <rect x="28" y="28" width="22" height="32" fill="rgba(255,255,255,0.14)" stroke={accentHex} strokeWidth="1" />
          <rect x="110" y="28" width="22" height="32" fill="rgba(255,255,255,0.14)" stroke={accentHex} strokeWidth="1" />
          <polygon points="80,34 90,48 70,48" fill={accentHex} fillOpacity="0.45" />
          <circle cx="20" cy="18" r="5" fill="rgba(16,185,129,0.3)" />
          <circle cx="140" cy="70" r="5" fill="rgba(16,185,129,0.3)" />
          <circle cx="62" cy="18" r="4" fill="rgba(16,185,129,0.3)" />
          <circle cx="98" cy="70" r="4" fill="rgba(16,185,129,0.3)" />
        </>
      )}
    </svg>
  );
}

export const MapSelector: React.FC<MapSelectorProps> = ({
  selectedMapId,
  onPreviewMap,
  onDeployMap,
  onBack,
}) => {
  return (
    <div className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-[#090d13]/75 p-6 backdrop-blur-sm md:p-10">
      <div className="w-full max-w-5xl border border-white/15 bg-[#0e131b]/92 p-7 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Select Operation Map</h1>
            <p className="mt-1 text-xs text-slate-400">
              Preview any theater in real time or deploy directly via /map/id
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex cursor-pointer items-center gap-2 border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 whitespace-nowrap"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Menu
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {MAP_LIST.map((map) => {
            const isSelected = map.id === selectedMapId;
            return (
              <div
                key={map.id}
                onClick={() => onPreviewMap(map.id)}
                className={`flex cursor-pointer flex-col justify-between border p-4 transition-colors ${
                  isSelected
                    ? 'border-amber-400 bg-amber-400/[0.08]'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                }`}
              >
                <div>
                  <MapSchematic id={map.id} accentHex={map.accentHex} />

                  <div className="mt-3.5 flex items-baseline justify-between gap-2">
                    <h2 className="font-display text-lg font-bold text-white">{map.name}</h2>
                    <span className="font-mono-tabular text-[11px] text-slate-400">
                      /map/{map.id}
                    </span>
                  </div>

                  <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{map.tagline}</p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                  <span className="text-xs text-slate-400">
                    {map.environmentLabel} · {map.engagementRange}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeployMap(map.id);
                    }}
                    className="inline-flex cursor-pointer items-center gap-1.5 bg-amber-500 px-3.5 py-1.5 font-display text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap"
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                    Deploy
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
