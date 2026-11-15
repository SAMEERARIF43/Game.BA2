import React, { useEffect, useState } from 'react';
import { Maximize2, Minimize2, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { GameSettings, GraphicsQuality } from '../game/types';
import {
  isFullscreenActive,
  isFullscreenSupported,
  toggleFullscreen,
} from '../utils/fullscreen';

interface SettingsPanelProps {
  settings: GameSettings;
  inMatch?: boolean;
  onUpdateSettings: (next: GameSettings) => void;
  onResetSettings?: () => void;
}

const QUALITY_OPTIONS: { id: GraphicsQuality; label: string; detail: string }[] = [
  { id: 'LOW', label: 'LOW', detail: 'Max FPS' },
  { id: 'MEDIUM', label: 'MEDIUM', detail: 'Balanced' },
  { id: 'HIGH', label: 'HIGH', detail: 'Full Shadows' },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  inMatch = false,
  onUpdateSettings,
  onResetSettings,
}) => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => isFullscreenActive());
  const fullscreenSupported = isFullscreenSupported();

  useEffect(() => {
    const syncFs = () => setIsFullscreen(isFullscreenActive());
    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);
    return () => {
      document.removeEventListener('fullscreenchange', syncFs);
      document.removeEventListener('webkitfullscreenchange', syncFs);
    };
  }, []);

  const handleToggleFullscreen = () => {
    void toggleFullscreen().then((active) => setIsFullscreen(active));
  };

  return (
    <div className="space-y-4">
      {!inMatch && (
        <label className="block">
          <span className="text-xs text-slate-300">Operator Callsign</span>
          <input
            type="text"
            maxLength={20}
            value={settings.callsign}
            onChange={(e) =>
              onUpdateSettings({
                ...settings,
                callsign: e.target.value,
              })
            }
            onBlur={(e) => {
              const trimmed = e.target.value.trim();
              if (!trimmed) {
                onUpdateSettings({ ...settings, callsign: 'Operator-101' });
              }
            }}
            className="mt-1.5 w-full border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white outline-none focus:border-amber-400"
            placeholder="Operator-101"
          />
        </label>
      )}

      {/* Controls & Camera */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <div className="flex justify-between text-xs text-slate-300">
            <span>Sensitivity</span>
            <span className="font-mono-tabular text-white">
              {(settings.sensitivity * 1000).toFixed(1)}
            </span>
          </div>
          <input
            type="range"
            min={0.0005}
            max={0.008}
            step={0.0001}
            value={settings.sensitivity}
            onChange={(e) =>
              onUpdateSettings({
                ...settings,
                sensitivity: parseFloat(e.target.value),
              })
            }
            className="mt-2 w-full cursor-pointer accent-amber-400"
          />
        </label>

        <label className="block">
          <div className="flex justify-between text-xs text-slate-300">
            <span>ADS Mult</span>
            <span className="font-mono-tabular text-white">
              {settings.adsSensitivityMultiplier.toFixed(2)}x
            </span>
          </div>
          <input
            type="range"
            min={0.3}
            max={1.2}
            step={0.02}
            value={settings.adsSensitivityMultiplier}
            onChange={(e) =>
              onUpdateSettings({
                ...settings,
                adsSensitivityMultiplier: parseFloat(e.target.value),
              })
            }
            className="mt-2 w-full cursor-pointer accent-amber-400"
          />
        </label>

        <label className="block">
          <div className="flex justify-between text-xs text-slate-300">
            <span>FOV</span>
            <span className="font-mono-tabular text-white">{settings.fovDeg}°</span>
          </div>
          <input
            type="range"
            min={70}
            max={110}
            step={1}
            value={settings.fovDeg}
            onChange={(e) =>
              onUpdateSettings({
                ...settings,
                fovDeg: parseInt(e.target.value, 10),
              })
            }
            className="mt-2 w-full cursor-pointer accent-amber-400"
          />
        </label>
      </div>

      {/* Graphics Quality & Display */}
      <div className="grid grid-cols-1 gap-4 border-t border-white/10 pt-4 sm:grid-cols-12">
        <div className="sm:col-span-8">
          <div className="text-xs text-slate-300">Graphics Quality</div>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {QUALITY_OPTIONS.map((q) => {
              const active = settings.graphicsQuality === q.id;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, graphicsQuality: q.id })}
                  className={`cursor-pointer border px-2 py-1.5 text-left transition-colors ${
                    active
                      ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'
                  }`}
                >
                  <div className="font-mono-tabular text-xs font-bold">{q.label}</div>
                  <div className="text-[10px] text-slate-400">{q.detail}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col justify-end sm:col-span-4">
          <div className="text-xs text-slate-300">Display [F]</div>
          <button
            type="button"
            disabled={!fullscreenSupported}
            onClick={handleToggleFullscreen}
            className="mt-1.5 flex h-[42px] w-full cursor-pointer items-center justify-center gap-2 border border-white/15 bg-white/5 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-40 whitespace-nowrap"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="h-3.5 w-3.5 text-amber-400" />
                Exit Fullscreen
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5 text-amber-400" />
                Fullscreen
              </>
            )}
          </button>
        </div>
      </div>

      {/* Audio Channels */}
      <div className="space-y-3 border-t border-white/10 pt-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onUpdateSettings({ ...settings, muted: !settings.muted })}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
            aria-label={settings.muted ? 'Unmute audio' : 'Mute audio'}
          >
            {settings.muted ? (
              <VolumeX className="h-4 w-4 text-red-400" />
            ) : (
              <Volume2 className="h-4 w-4 text-amber-400" />
            )}
          </button>
          <div className="flex-1">
            <div className="flex justify-between text-xs text-slate-300">
              <span>Master Volume</span>
              <span className="font-mono-tabular text-white">
                {settings.muted ? 'Muted' : `${Math.round(settings.volume * 100)}%`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  volume: parseFloat(e.target.value),
                  muted: false,
                })
              }
              className="mt-1.5 w-full cursor-pointer accent-amber-400"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <div className="flex justify-between text-xs text-slate-300">
              <span>Combat SFX Volume</span>
              <span className="font-mono-tabular text-white">
                {Math.round(settings.sfxVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.sfxVolume}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  sfxVolume: parseFloat(e.target.value),
                })
              }
              className="mt-1.5 w-full cursor-pointer accent-amber-400"
            />
          </label>

          <label className="block">
            <div className="flex justify-between text-xs text-slate-300">
              <span>Ambient / Music Volume</span>
              <span className="font-mono-tabular text-white">
                {Math.round(settings.musicVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.musicVolume}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  musicVolume: parseFloat(e.target.value),
                })
              }
              className="mt-1.5 w-full cursor-pointer accent-amber-400"
            />
          </label>
        </div>
      </div>

      {!inMatch && (
        <div className="grid grid-cols-1 gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
          <div>
            <div className="text-xs text-slate-300">TDM Score Limit</div>
            <div className="mt-2 flex gap-1.5">
              {[15, 30, 50].map((limit) => (
                <button
                  key={limit}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, killLimit: limit })}
                  className={`flex-1 cursor-pointer border py-1.5 font-mono-tabular text-xs font-semibold transition-colors ${
                    settings.killLimit === limit
                      ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'
                  }`}
                >
                  {limit}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-300">Squad Size</div>
            <div className="mt-2 flex gap-1.5">
              {[3, 4, 5].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, botsPerTeam: size })}
                  className={`flex-1 cursor-pointer border py-1.5 font-mono-tabular text-xs font-semibold transition-colors ${
                    settings.botsPerTeam === size
                      ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'
                  }`}
                >
                  {size}v{size}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {onResetSettings && (
        <div className="flex justify-end border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={onResetSettings}
            className="inline-flex cursor-pointer items-center gap-1.5 border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to Defaults
          </button>
        </div>
      )}
    </div>
  );
};
