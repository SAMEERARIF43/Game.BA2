import React, { useState } from 'react';
import { ArrowLeft, Crosshair } from 'lucide-react';
import { MAP_LIST } from '../maps/MapManager';
import { MapId } from '../maps/types';
import { MapPreview, MapPreviewMode, MapViewModeToggle } from './MapPreview';

interface MapSelectorProps {
  selectedMapId: MapId;
  onPreviewMap: (mapId: MapId) => void;
  onDeployMap: (mapId: MapId) => void;
  onBack: () => void;
}

export const MapSelector: React.FC<MapSelectorProps> = ({
  selectedMapId,
  onPreviewMap,
  onDeployMap,
  onBack,
}) => {
  const [mapViewMode, setMapViewMode] = useState<MapPreviewMode>('scenic');

  return (
    <div className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center overflow-y-auto bg-[#090d13]/90 p-3 sm:p-6 md:p-8">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto border border-slate-400/20 bg-[#0e131b]/95 p-4 shadow-2xl shadow-black/40 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Select Operation Map</h1>
            <p className="mt-1 text-xs text-slate-400">
              Select a theater, toggle Scenic View or Tactical Blueprint (Sites A/B), then deploy.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <MapViewModeToggle value={mapViewMode} onChange={setMapViewMode} size="md" />
            <button
              type="button"
              onClick={onBack}
              className="inline-flex cursor-pointer items-center gap-2 border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Menu
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {MAP_LIST.map((map, index) => {
            const isSelected = map.id === selectedMapId;
            const staggerDelayMs = index * 75;
            const blueprintFadeDelayMs = staggerDelayMs + 150;
            return (
              <article
                key={map.id}
                data-map-card={map.id}
                data-stagger-index={index}
                style={{ animationDelay: `${staggerDelayMs}ms` }}
                className={`group map-card-enter flex flex-col justify-between border bg-slate-950/50 p-3 transition-all duration-200 sm:p-4 ${
                  isSelected
                    ? 'scale-[1.005] border-amber-400 shadow-[0_0_24px_rgba(245,158,11,0.16)]'
                    : 'border-white/10 hover:border-white/25'
                }`}
              >
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onPreviewMap(map.id)}
                  className="w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b]"
                >
                  <div className="relative">
                    <MapPreview
                      mapId={map.id}
                      variant="banner"
                      viewMode={mapViewMode}
                      blueprintRevealDelayMs={blueprintFadeDelayMs}
                      selected={isSelected}
                      className="h-32 w-full"
                    />
                    <span
                      className="absolute left-2 top-2 border bg-[#080b10]/90 px-2 py-1 font-mono-tabular text-[9px] font-bold tracking-widest"
                      style={{ borderColor: `${map.accentHex}80`, color: map.accentHex }}
                    >
                      {map.id.toUpperCase()} SECTOR
                    </span>
                    {isSelected && (
                      <span className="absolute right-2 top-2 bg-amber-400 px-2 py-1 font-mono-tabular text-[9px] font-bold tracking-wider text-slate-950">
                        SELECTED
                      </span>
                    )}
                  </div>

                  <div
                    data-blueprint-details={map.id}
                    style={{ animationDelay: `${blueprintFadeDelayMs}ms` }}
                    className="blueprint-fade-in"
                  >
                    <div className="mt-3 flex items-baseline justify-between gap-2">
                      <h2 className="font-display text-lg font-bold text-white">{map.name}</h2>
                      <span className="shrink-0 font-mono-tabular text-[10px] text-slate-400">
                        {map.environmentLabel}
                      </span>
                    </div>

                    <p className="mt-1.5 min-h-9 text-xs leading-relaxed text-slate-300">
                      {map.tagline}
                    </p>

                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <span
                        className="border px-2 py-1 font-mono-tabular text-[9px] font-medium"
                        style={{
                          borderColor: `${map.accentHex}55`,
                          color: map.accentHex,
                          backgroundColor: `${map.accentHex}12`,
                        }}
                      >
                        {map.environmentLabel}
                      </span>
                      <span className="border border-white/10 bg-white/[0.04] px-2 py-1 font-mono-tabular text-[9px] text-slate-300">
                        {map.engagementRange}
                      </span>
                    </div>
                  </div>
                </button>

                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                  <span className="text-[10px] text-slate-400">
                    {isSelected ? 'Previewing this operation' : 'Click card to preview'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeployMap(map.id)}
                    className="inline-flex cursor-pointer items-center gap-1.5 bg-amber-500 px-3.5 py-1.5 font-display text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b] whitespace-nowrap"
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                    Deploy
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
};
