import React, { useEffect, useRef, useState } from 'react';
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
  const resumeButtonRef = useRef<HTMLButtonElement>(null);
  const settingsBackRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (showSettings) {
        setShowSettings(false);
      } else {
        onResume();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onResume, showSettings]);

  useEffect(() => {
    if (showSettings) {
      settingsBackRef.current?.focus();
    } else {
      resumeButtonRef.current?.focus();
    }
  }, [showSettings]);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-25 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-menu-title"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select:not(:disabled), [tabindex="0"]'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto border border-slate-400/20 bg-[#0e131b]/95 p-4 shadow-2xl shadow-black/40 sm:p-7">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 id="pause-menu-title" className="font-display text-2xl font-bold text-white">
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
                ref={resumeButtonRef}
                type="button"
                onClick={onResume}
                className="flex cursor-pointer items-center justify-center gap-2 bg-amber-500 px-4 py-3 font-display text-xs font-bold tracking-wide text-slate-950 transition-colors hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b]"
              >
                <Play className="h-3.5 w-3.5" />
                Resume
              </button>

              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="flex cursor-pointer items-center justify-center gap-2 border border-white/15 bg-white/5 px-4 py-3 font-display text-xs font-semibold text-white transition-colors hover:border-amber-400/50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b]"
              >
                <Settings className="h-3.5 w-3.5" />
                Settings
              </button>

              {!isMultiplayer && (
                <button
                  type="button"
                  onClick={onRestartMatch}
                  className="flex cursor-pointer items-center justify-center gap-2 border border-white/15 bg-white/5 px-4 py-3 font-display text-xs font-semibold text-white transition-colors hover:border-amber-400/50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restart Match
                </button>
              )}

              <button
                type="button"
                onClick={onLeaveToMenu}
                className={`flex cursor-pointer items-center justify-center gap-2 border border-red-500/30 bg-red-500/10 px-4 py-3 font-display text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b] ${
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
                      aria-pressed={selected}
                      onClick={() => onSelectWeapon(id)}
                      className={`flex min-h-24 flex-col justify-between gap-2 border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b] ${
                        selected
                          ? 'border-amber-400 bg-amber-400/15 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.12)]'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1 font-display text-xs font-semibold leading-4 text-white">
                          {cfg.name}
                        </span>
                        <span className="shrink-0 border border-white/10 bg-black/30 px-1.5 py-0.5 font-mono-tabular text-[10px] text-slate-300">
                          [{cfg.slot}]
                        </span>
                      </div>
                      <div className="text-[11px] leading-4 text-slate-400">{cfg.category}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="mt-5">
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
              <span className="font-display text-sm font-semibold text-amber-300">Settings</span>
              <button
                ref={settingsBackRef}
                type="button"
                onClick={() => setShowSettings(false)}
                className="cursor-pointer border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                Back to Match
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
