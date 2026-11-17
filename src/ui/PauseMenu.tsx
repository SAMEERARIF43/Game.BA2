import React, { useState } from 'react';
import { LogOut, Play, RotateCcw, Settings } from 'lucide-react';
import { GameSettings, HudState, WEAPONS, WeaponId } from '../game/types';
import { SettingsPanel } from './SettingsPanel';

interface PauseMenuProps {
  hud: HudState;
  settings: GameSettings;
  isMultiplayer?: boolean;
  onResume: () => void;
  onRestartMatch: () => void;
  onLeaveToMenu: () => void;
  onSelectWeapon: (id: WeaponId) => void;
  onUpdateSettings: (next: GameSettings) => void;
  onResetSettings?: () => void;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({
  hud,
  settings,
  isMultiplayer = false,
  onResume,
  onRestartMatch,
  onLeaveToMenu,
  onSelectWeapon,
  onUpdateSettings,
  onResetSettings,
}) => {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="pointer-events-auto fixed inset-0 z-25 flex items-center justify-center bg-black/65 p-6 backdrop-blur-sm">
      <div className="w-full max-w-xl border border-white/15 bg-[#0e131b]/95 p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              {isMultiplayer ? 'Match Menu' : 'Match Paused'}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {hud.match.mapName} · Blue {hud.match.blueScore} — Red {hud.match.redScore}
            </p>
          </div>
          <span className="font-mono-tabular text-xs text-slate-400">
            Score Limit {hud.match.killLimit}
          </span>
        </div>

        {!showSettings ? (
          <>
            <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={onResume}
                className="flex cursor-pointer items-center justify-center gap-2 bg-amber-500 px-4 py-3 font-display text-xs font-bold tracking-wide text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap"
              >
                <Play className="h-3.5 w-3.5" />
                Resume
              </button>

              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="flex cursor-pointer items-center justify-center gap-2 border border-white/15 bg-white/5 px-4 py-3 font-display text-xs font-semibold text-white transition-colors hover:bg-white/10 whitespace-nowrap"
              >
                <Settings className="h-3.5 w-3.5" />
                Settings
              </button>

              {!isMultiplayer && (
                <button
                  type="button"
                  onClick={onRestartMatch}
                  className="flex cursor-pointer items-center justify-center gap-2 border border-white/15 bg-white/5 px-4 py-3 font-display text-xs font-semibold text-white transition-colors hover:bg-white/10 whitespace-nowrap"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restart Match
                </button>
              )}

              <button
                type="button"
                onClick={onLeaveToMenu}
                className={`flex cursor-pointer items-center justify-center gap-2 border border-red-500/30 bg-red-500/10 px-4 py-3 font-display text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20 whitespace-nowrap ${
                  isMultiplayer ? 'sm:col-span-2' : ''
                }`}
              >
                <LogOut className="h-3.5 w-3.5" />
                {isMultiplayer ? 'Leave Match' : 'Leave to Menu'}
              </button>
            </div>

            <div className="mt-6 border-t border-white/10 pt-4">
              <div className="text-xs font-medium text-slate-400">Loadout Selection</div>
              <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {(['m4a1', 'mp5', 'intervention', 'm1911'] as WeaponId[]).map((id) => {
                  const cfg = WEAPONS[id];
                  const selected = hud.activeWeapon.id === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectWeapon(id)}
                      className={`cursor-pointer border p-2.5 text-left transition-colors ${
                        selected
                          ? 'border-amber-400 bg-amber-400/15'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-display font-semibold text-white">{cfg.name}</span>
                        <span className="font-mono-tabular text-slate-400">[{cfg.slot}]</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">{cfg.category}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="mt-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-medium text-amber-400">Match &amp; Controls Settings</span>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="cursor-pointer text-xs text-slate-300 hover:text-white"
              >
                Back
              </button>
            </div>
            <SettingsPanel
              settings={settings}
              inMatch
              onUpdateSettings={onUpdateSettings}
              onResetSettings={onResetSettings}
            />
          </div>
        )}
      </div>
    </div>
  );
};
