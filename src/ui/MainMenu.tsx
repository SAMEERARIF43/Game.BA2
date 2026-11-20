import React, { useEffect, useState } from 'react';
import { BookOpen, Compass, Crosshair, Settings, Sliders, Users } from 'lucide-react';
import { GameSettings, WEAPONS, WeaponId } from '../game/types';
import { MAP_REGISTRY } from '../maps/MapManager';
import { MapId } from '../maps/types';
import { getRankSummary } from '../settings/progressionStorage';
import { SettingsPanel } from './SettingsPanel';

interface MainMenuProps {
  selectedMapId: MapId;
  startingWeaponId: WeaponId;
  settings: GameSettings;
  xp: number;
  onSelectStartingWeapon: (id: WeaponId) => void;
  onPlayOfflineTdm: () => void;
  onOpenCustomMatch: () => void;
  onOpenMapSelect: () => void;
  onUpdateSettings: (next: GameSettings) => void;
  onResetSettings?: () => void;
}

type MenuPanel = 'briefing' | 'settings' | 'howto';

export const MainMenu: React.FC<MainMenuProps> = ({
  selectedMapId,
  startingWeaponId,
  settings,
  xp,
  onSelectStartingWeapon,
  onPlayOfflineTdm,
  onOpenCustomMatch,
  onOpenMapSelect,
  onUpdateSettings,
  onResetSettings,
}) => {
  const [activePanel, setActivePanel] = useState<MenuPanel>('briefing');

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && activePanel !== 'briefing') {
        event.preventDefault();
        setActivePanel('briefing');
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [activePanel]);

  const selectedMap = MAP_REGISTRY[selectedMapId];
  const rank = getRankSummary(xp);

  return (
    <div className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center overflow-y-auto bg-gradient-to-r from-[#090d13]/90 via-[#090d13]/65 to-[#090d13]/45 p-3 sm:p-6 md:p-8">
      <div className="grid w-full max-w-5xl grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-12">
        {/* Left Navigation Column */}
        <div className="flex flex-col justify-between border border-white/15 bg-[#0e131b]/90 p-7 backdrop-blur-md lg:col-span-5">
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-white">
              Strike Force
            </h1>
            <p className="mt-1.5 text-sm text-slate-400">
              Team Deathmatch · {selectedMap.name}
            </p>

            {/* Operator Career Rank & XP Bar */}
            <div className="mt-4 border border-white/10 bg-black/40 px-3.5 py-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-display font-semibold text-white">
                  LV {rank.level} · {rank.title}
                </span>
                <span className="font-mono-tabular text-amber-400">
                  {rank.xp.toLocaleString()}
                  {rank.nextTierXp ? ` / ${rank.nextTierXp.toLocaleString()} XP` : ' XP MAX'}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full bg-white/10">
                <div
                  className="h-full bg-amber-400 transition-[width] duration-300"
                  style={{ width: `${rank.progressPct}%` }}
                />
              </div>
            </div>

            <nav className="mt-8 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onPlayOfflineTdm}
                className="flex w-full cursor-pointer items-center justify-between border border-amber-300/70 bg-amber-500 px-5 py-3.5 text-left font-display text-sm font-bold tracking-wide text-slate-950 shadow-lg shadow-amber-950/20 transition-colors hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b]"
              >
                <span>
                  <span className="block">SOLO · BOTS</span>
                  <span className="mt-0.5 block font-sans text-[10px] font-medium tracking-normal text-slate-800">
                    Launch Team Deathmatch
                  </span>
                </span>
                <Crosshair className="h-4 w-4 shrink-0" />
              </button>

              <button
                type="button"
                onClick={onOpenCustomMatch}
                className="flex w-full cursor-pointer items-center justify-between border border-blue-400/45 bg-blue-500/15 px-5 py-3 text-left font-display text-sm font-semibold text-blue-100 transition-colors hover:border-blue-400 hover:bg-blue-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b]"
              >
                <span>
                  <span className="block">MULTIPLAYER</span>
                  <span className="mt-0.5 block font-sans text-[10px] font-medium tracking-normal text-blue-100/70">
                    Host or join a private match
                  </span>
                </span>
                <Users className="h-4 w-4 shrink-0 text-blue-300" />
              </button>

              <button
                type="button"
                onClick={onOpenMapSelect}
                className="flex w-full cursor-pointer items-center justify-between border border-white/15 bg-white/[0.05] px-5 py-3 text-left font-display text-sm font-semibold text-white transition-colors hover:border-amber-400/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b]"
              >
                <span>SELECT THEATER</span>
                <Compass className="h-4 w-4 shrink-0 text-amber-400" />
              </button>

              <div className="mt-2 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    setActivePanel(activePanel === 'settings' ? 'briefing' : 'settings')
                  }
                  className={`flex cursor-pointer items-center justify-center gap-2 border px-4 py-2.5 font-display text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b] whitespace-nowrap ${
                    activePanel === 'settings'
                      ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                      : 'border-white/15 bg-white/[0.04] text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <Settings className="h-3.5 w-3.5" />
                  SETTINGS
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setActivePanel(activePanel === 'howto' ? 'briefing' : 'howto')
                  }
                  className={`flex cursor-pointer items-center justify-center gap-2 border px-4 py-2.5 font-display text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b] whitespace-nowrap ${
                    activePanel === 'howto'
                      ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                      : 'border-white/15 bg-white/[0.04] text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  HOW TO PLAY
                </button>
              </div>
            </nav>
          </div>

          <div className="mt-8 border-t border-white/10 pt-4 text-xs text-slate-400">
            Selected Theater: <span className="font-medium text-slate-200">{selectedMap.name}</span> ·{' '}
            <span className="font-mono-tabular text-slate-300">
              {settings.botsPerTeam}v{settings.botsPerTeam}
            </span>{' '}
            · First to <span className="font-mono-tabular text-slate-300">{settings.killLimit}</span>
          </div>
        </div>

        {/* Right Detail Panel */}
        <div className="border border-white/15 bg-[#0e131b]/85 p-7 backdrop-blur-md lg:col-span-7">
          {activePanel === 'briefing' && (
            <div className="flex h-full flex-col justify-between">
              <div>
                <div className="text-xs font-medium text-amber-400">Active Operation Briefing</div>
                <h2 className="mt-1 font-display text-2xl font-bold text-white">
                  {selectedMap.name}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  {selectedMap.tagline}
                </p>

                <div className="mt-6 grid grid-cols-3 gap-4 border-y border-white/10 py-4 text-xs">
                  <div>
                    <div className="text-slate-400">Environment</div>
                    <div className="mt-1 font-medium text-white">
                      {selectedMap.environmentLabel}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Engagement</div>
                    <div className="mt-1 font-medium text-white">
                      {selectedMap.engagementRange}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Mode Rules</div>
                    <div className="mt-1 font-mono-tabular font-medium text-white">
                      {settings.killLimit} Kills · 05:00
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-medium text-slate-300">Starting Weapon</div>
                    <div className="font-mono-tabular text-[10px] text-slate-500">
                      CHOOSE YOUR LOADOUT
                    </div>
                  </div>
                  <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(['m4a1', 'mp5', 'intervention'] as WeaponId[]).map((id) => {
                      const w = WEAPONS[id];
                      const selected = startingWeaponId === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onSelectStartingWeapon(id)}
                          className={`min-w-0 border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e131b] ${
                            selected
                              ? 'border-amber-400/80 bg-amber-400/10 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.12)]'
                              : 'border-white/10 bg-black/35 hover:border-white/25 hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-mono-tabular text-[10px] font-semibold text-amber-300">
                              SLOT 0{w.slot}
                            </span>
                            {selected && (
                              <span className="font-mono-tabular text-[9px] font-bold tracking-wider text-amber-300">
                                SELECTED
                              </span>
                            )}
                          </div>
                          <div className="mt-2 font-display text-xs font-semibold leading-4 text-white">
                            {w.name}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">
                            {w.category} · {w.rpm} RPM
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-400">
                <span>Current operation · {selectedMap.name}</span>
                <button
                  type="button"
                  onClick={() => setActivePanel('settings')}
                  className="inline-flex cursor-pointer items-center gap-1.5 text-slate-300 hover:text-white"
                >
                  <Sliders className="h-3.5 w-3.5" />
                  Tune Match Settings
                </button>
              </div>
            </div>
          )}

          {activePanel === 'settings' && (
            <div>
              <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-3">
                <h2 className="font-display text-xl font-bold text-white">Settings</h2>
                <button
                  type="button"
                  onClick={() => setActivePanel('briefing')}
                  className="cursor-pointer text-xs text-slate-400 hover:text-white"
                >
                  Done
                </button>
              </div>
              <SettingsPanel
                settings={settings}
                onUpdateSettings={onUpdateSettings}
                onResetSettings={onResetSettings}
              />
            </div>
          )}

          {activePanel === 'howto' && (
            <div>
              <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-3">
                <h2 className="font-display text-xl font-bold text-white">How to Play</h2>
                <button
                  type="button"
                  onClick={() => setActivePanel('briefing')}
                  className="cursor-pointer text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>

              <div className="space-y-4 text-xs text-slate-300">
                <p className="leading-relaxed">
                  Eliminate Red Opposition bots while coordinating with your Blue Task Force squad. First team to reach the score limit or hold the lead when the 5-minute clock expires wins the match.
                </p>

                <div className="grid grid-cols-2 gap-x-6 gap-y-2 border border-white/10 bg-black/35 p-4">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Move</span>
                    <span className="font-mono-tabular text-white">W A S D</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Fire Weapon</span>
                    <span className="font-mono-tabular text-white">Left Click</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sprint</span>
                    <span className="font-mono-tabular text-white">Shift</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Aim Down Sights</span>
                    <span className="font-mono-tabular text-white">Right Click</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Jump</span>
                    <span className="font-mono-tabular text-white">Space</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Reload</span>
                    <span className="font-mono-tabular text-white">R</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Crouch</span>
                    <span className="font-mono-tabular text-white">C / Ctrl</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tactical Slide</span>
                    <span className="font-mono-tabular text-amber-300">Sprint + C / Ctrl</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Switch Weapons</span>
                    <span className="font-mono-tabular text-white">1 · 2 · 3 · 4 / Wheel</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sniper Optic Zoom</span>
                    <span className="font-mono-tabular text-amber-300">B (4X/6X/8X)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Killstreaks</span>
                    <span className="font-mono-tabular text-amber-300">F1 · F2 · F3</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Scoreboard</span>
                    <span className="font-mono-tabular text-white">Hold Tab</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Pause Menu</span>
                    <span className="font-mono-tabular text-white">Esc</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Fullscreen</span>
                    <span className="font-mono-tabular text-white">F</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
