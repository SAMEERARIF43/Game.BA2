import React, { useEffect, useRef, useState } from 'react';
import { Lock, LogOut, Play, RotateCcw, Settings, Sparkles } from 'lucide-react';
import { GUN_LOCKED_WHILE_ALIVE_MESSAGE } from '../game/loadoutRules';
import {
  GUN_IDS,
  GameSettings,
  GunId,
  HudState,
  KNIFE_CHARMS,
  KNIFE_CHARM_IDS,
  KnifeCharmId,
  WEAPONS,
} from '../game/types';
import { SettingsPanel } from './SettingsPanel';

interface PauseMenuProps {
  hud: HudState;
  settings: GameSettings;
  isMultiplayer?: boolean;
  onResume: () => void;
  onRestartMatch: () => void;
  onLeaveToMenu: () => void;
  onSelectGun: (id: GunId) => void;
  onSelectKnifeCharm: (id: KnifeCharmId) => void;
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
  onSelectGun,
  onSelectKnifeCharm,
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

  const equippedGun = WEAPONS[hud.equippedGunId];
  const queuedGun = WEAPONS[hud.queuedGunId];
  const selectedCharm = KNIFE_CHARMS[hud.knifeCharmId];

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
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto border border-slate-400/20 bg-[#0e131b]/95 p-4 shadow-2xl shadow-black/40 sm:p-6">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3.5">
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
            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                ref={resumeButtonRef}
                type="button"
                onClick={onResume}
                className="flex cursor-pointer items-center justify-center gap-2 bg-amber-500 px-4 py-2.5 font-display text-xs font-bold tracking-wide text-slate-950 transition-colors hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b]"
              >
                <Play className="h-3.5 w-3.5" />
                Resume
              </button>

              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="flex cursor-pointer items-center justify-center gap-2 border border-white/15 bg-white/5 px-4 py-2.5 font-display text-xs font-semibold text-white transition-colors hover:border-amber-400/50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b]"
              >
                <Settings className="h-3.5 w-3.5" />
                Settings
              </button>

              {!isMultiplayer && (
                <button
                  type="button"
                  onClick={onRestartMatch}
                  className="flex cursor-pointer items-center justify-center gap-2 border border-white/15 bg-white/5 px-4 py-2.5 font-display text-xs font-semibold text-white transition-colors hover:border-amber-400/50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restart Match
                </button>
              )}

              <button
                type="button"
                onClick={onLeaveToMenu}
                className={`flex cursor-pointer items-center justify-center gap-2 border border-red-500/30 bg-red-500/10 px-4 py-2.5 font-display text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b] ${
                  isMultiplayer ? 'sm:col-span-2' : ''
                }`}
              >
                <LogOut className="h-3.5 w-3.5" />
                {isMultiplayer ? 'Leave Match' : 'Leave to Menu'}
              </button>
            </div>

            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-medium text-slate-300">
                  Loadout · [1] {equippedGun.name} + [2] {WEAPONS.knife.shortName}
                </div>
                <div className="font-mono-tabular text-[11px] text-slate-400">
                  {hud.queuedGunId !== hud.equippedGunId
                    ? `Next Spawn: ${queuedGun.name}`
                    : 'Knife always ready via [2] or [V / F]'}
                </div>
              </div>

              {hud.isGunSwitchLocked && (
                <div
                  role="status"
                  className="mt-2.5 flex items-center gap-2 border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                >
                  <Lock className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span>{hud.gunLockMessage ?? GUN_LOCKED_WHILE_ALIVE_MESSAGE}</span>
                </div>
              )}

              <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {GUN_IDS.map((id) => {
                  const cfg = WEAPONS[id];
                  const isEquipped = hud.equippedGunId === id;
                  const isQueued = hud.queuedGunId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={hud.isGunSwitchLocked ? isQueued : isEquipped}
                      onClick={() => onSelectGun(id)}
                      className={`flex min-h-20 cursor-pointer flex-col justify-between gap-1.5 border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b] ${
                        isEquipped
                          ? 'border-amber-400 bg-amber-400/15 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.12)]'
                          : isQueued
                            ? 'border-sky-400/75 bg-sky-400/12'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <span className="min-w-0 flex-1 font-display text-xs font-semibold leading-4 text-white">
                          {cfg.shortName}
                        </span>
                        {isEquipped && (
                          <span className="shrink-0 border border-amber-400/40 bg-amber-400/20 px-1 py-0.5 font-mono-tabular text-[9px] font-bold text-amber-300">
                            ACTIVE
                          </span>
                        )}
                        {!isEquipped && isQueued && (
                          <span className="shrink-0 border border-sky-400/40 bg-sky-400/20 px-1 py-0.5 font-mono-tabular text-[9px] font-bold text-sky-300">
                            NEXT
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[10px] leading-4 text-slate-400">
                        {cfg.category}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Knife + Charm Selector */}
              <div className="mt-3 border border-white/10 bg-black/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="font-medium text-slate-200">
                    [2] {WEAPONS.knife.name} · Quick Melee [V / F]
                  </span>
                  <span className="inline-flex items-center gap-1 text-amber-300">
                    <Sparkles className="h-3 w-3" />
                    {selectedCharm.name}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                  {KNIFE_CHARM_IDS.map((charmId) => {
                    const charm = KNIFE_CHARMS[charmId];
                    const active = hud.knifeCharmId === charmId;
                    return (
                      <button
                        key={charmId}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onSelectKnifeCharm(charmId)}
                        className={`flex min-w-0 cursor-pointer items-center gap-1.5 border px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                          active
                            ? 'border-amber-400/80 bg-amber-400/15 text-white'
                            : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:bg-white/[0.07]'
                        }`}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 border border-white/30"
                          style={{ backgroundColor: charm.accentHex }}
                        />
                        <span className="truncate font-mono-tabular text-[10px]">
                          {charm.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
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
