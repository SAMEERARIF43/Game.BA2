import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Compass,
  Crosshair,
  Eye,
  Maximize2,
  Play,
  Settings,
  Shield,
  Sparkles,
  Swords,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  CHARACTERS,
  CHARACTER_IDS,
  CharacterId,
  GUN_IDS,
  GameSettings,
  GunId,
  KNIFE_CHARMS,
  KNIFE_CHARM_IDS,
  KnifeCharmId,
  WEAPONS,
} from '../game/types';
import { MAP_LIST, MAP_REGISTRY } from '../maps/MapManager';
import { MapId } from '../maps/types';
import { getRankSummary } from '../settings/progressionStorage';
import { DEFAULT_KEYBINDINGS, formatKeyCode } from '../settings/keybindings';
import { toggleFullscreen } from '../utils/fullscreen';
import { SettingsPanel } from './SettingsPanel';

interface MainMenuProps {
  selectedMapId: MapId;
  selectedCharacterId: CharacterId;
  selectedGunId: GunId;
  knifeCharmId: KnifeCharmId;
  settings: GameSettings;
  xp: number;
  onSelectCharacter: (id: CharacterId, equipSignatureGun?: boolean) => void;
  onSelectGun: (id: GunId) => void;
  onSelectKnifeCharm: (id: KnifeCharmId) => void;
  onPreviewMap?: (id: MapId) => void;
  onPreviewShowcase?: (focus: 'gun' | 'knife', offsetX?: number) => void;
  onPlayOfflineTdm: () => void;
  onOpenCustomMatch: () => void;
  onOpenMapSelect: () => void;
  onUpdateSettings: (next: GameSettings) => void;
  onResetSettings?: () => void;
}

type MenuTab = 'play' | 'loadout' | 'maps' | 'settings' | 'howto';

export const MainMenu: React.FC<MainMenuProps> = ({
  selectedMapId,
  selectedCharacterId,
  selectedGunId,
  knifeCharmId,
  settings,
  xp,
  onSelectCharacter,
  onSelectGun,
  onSelectKnifeCharm,
  onPreviewMap,
  onPreviewShowcase,
  onPlayOfflineTdm,
  onOpenCustomMatch,
  onOpenMapSelect,
  onUpdateSettings,
  onResetSettings,
}) => {
  const [activeTab, setActiveTab] = useState<MenuTab>('play');
  const [showcaseFocus, setShowcaseFocus] = useState<'gun' | 'knife'>('gun');

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && activeTab !== 'play') {
        event.preventDefault();
        setActiveTab('play');
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [activeTab]);

  useEffect(() => {
    if (!onPreviewShowcase) return;
    if (activeTab === 'loadout') {
      onPreviewShowcase(showcaseFocus, 0.36);
    } else if (activeTab === 'play') {
      onPreviewShowcase(showcaseFocus, 0);
    } else {
      onPreviewShowcase('gun', 0.44);
    }
  }, [activeTab, showcaseFocus, onPreviewShowcase]);

  const selectedMap = MAP_REGISTRY[selectedMapId];
  const selectedCharacter = CHARACTERS[selectedCharacterId];
  const selectedGun = WEAPONS[selectedGunId];
  const selectedCharm = KNIFE_CHARMS[knifeCharmId];
  const rank = getRankSummary(xp);

  const navItems: Array<{ id: MenuTab; label: string; icon: React.ReactNode }> = [
    { id: 'play', label: 'PLAY', icon: <Play className="h-3.5 w-3.5" /> },
    { id: 'loadout', label: 'LOADOUT', icon: <Swords className="h-3.5 w-3.5" /> },
    { id: 'maps', label: 'MAPS', icon: <Compass className="h-3.5 w-3.5" /> },
    { id: 'settings', label: 'SETTINGS', icon: <Settings className="h-3.5 w-3.5" /> },
    { id: 'howto', label: 'CONTROLS', icon: <BookOpen className="h-3.5 w-3.5" /> },
  ];

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-20 flex flex-col overflow-hidden"
      style={{
        background:
          activeTab === 'play'
            ? 'radial-gradient(circle at 50% 48%, rgba(6,10,16,0.06) 18%, rgba(6,10,16,0.48) 70%, rgba(5,8,13,0.84) 100%)'
            : 'linear-gradient(90deg, rgba(6,10,16,0.82) 0%, rgba(6,10,16,0.48) 56%, rgba(6,10,16,0.28) 100%)',
      }}
    >
      {/* Deadshot-Inspired Top Bar Navigation */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/12 bg-[#070b11]/85 px-4 backdrop-blur-md sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center border border-amber-400/50 bg-amber-500/15 text-amber-400">
            <Crosshair className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-lg font-bold tracking-tight text-white sm:text-xl">
              STRIKE FORCE
            </div>
            <div className="hidden truncate font-mono-tabular text-[10px] tracking-wider text-slate-400 sm:block">
              TDM · {selectedMap.name.toUpperCase()}
            </div>
          </div>
        </div>

        <nav className="flex h-full items-center gap-1 overflow-x-auto sm:gap-2" aria-label="Main Menu Navigation">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex h-full cursor-pointer items-center gap-1.5 whitespace-nowrap px-3 font-display text-xs font-bold tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 sm:px-4 ${
                  active
                    ? 'text-amber-400'
                    : 'text-slate-300 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {active && (
                  <span className="absolute inset-x-1 bottom-0 h-0.5 bg-amber-400" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2.5">
          <div className="hidden items-center gap-2.5 border border-white/12 bg-black/45 px-3 py-1.5 md:flex">
            <Shield className="h-3.5 w-3.5 text-amber-400" />
            <div className="font-mono-tabular text-[11px]">
              <span className="font-semibold text-white">LV {rank.level}</span>{' '}
              <span className="text-slate-400">{rank.title}</span>
            </div>
            <div className="h-1.5 w-14 bg-white/10">
              <div
                className="h-full bg-amber-400"
                style={{ width: `${rank.progressPct}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            aria-label="Toggle fullscreen"
            title="Fullscreen (F)"
            onClick={() => {
              void toggleFullscreen();
            }}
            className="grid h-8 w-8 cursor-pointer place-items-center border border-white/15 bg-white/[0.04] text-slate-300 transition-colors hover:border-amber-400/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Main Content Stage */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3.5 sm:p-5 lg:p-6">
        {activeTab === 'play' && (
          <div className="flex min-h-0 flex-1 flex-col justify-between gap-4">
            {/* Upper Side Panels Leaving Center Stage Open for the Live 3D Operator */}
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              {/* Top-Left: Operator Identity, Current Theater & Build 12 Roster Summary */}
              <div className="flex w-full flex-col gap-3 lg:w-76">
                <section className="border border-white/15 bg-[#0b1017]/82 p-3.5 backdrop-blur-md">
                  <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                    <span className="font-mono-tabular text-[10px] font-semibold tracking-widest text-slate-400">
                      OPERATOR PROFILE
                    </span>
                    <span className="font-mono-tabular text-[10px] text-amber-400">
                      {rank.xp.toLocaleString()} XP
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <label htmlFor="menu-callsign" className="sr-only">
                      Operator Callsign
                    </label>
                    <input
                      id="menu-callsign"
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
                          onUpdateSettings({
                            ...settings,
                            callsign: 'Operator-101',
                          });
                        }
                      }}
                      className="w-full border border-white/12 bg-black/45 px-2.5 py-1.5 font-display text-sm font-bold text-white transition-colors focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Theater</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('maps')}
                      className="cursor-pointer font-display font-semibold text-amber-300 transition-colors hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                    >
                      {selectedMap.name} →
                    </button>
                  </div>
                  <div className="mt-1 flex items-center justify-between font-mono-tabular text-[11px] text-slate-400">
                    <span>Team Size</span>
                    <span className="text-slate-200">
                      {settings.botsPerTeam}v{settings.botsPerTeam} · {settings.killLimit} Kills
                    </span>
                  </div>
                </section>

                {/* Compact Patch Notes / Updates Panel */}
                <section className="hidden border border-white/12 bg-[#0b1017]/78 p-3.5 backdrop-blur-md lg:block">
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                    <span className="font-mono-tabular text-[10px] font-bold tracking-widest text-amber-400">
                      LATEST UPDATE
                    </span>
                    <span className="font-mono-tabular text-[10px] text-slate-500">
                      BUILD 12
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1.5 text-[11px] leading-snug text-slate-300">
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1 w-1 shrink-0 bg-amber-400" />
                      <span>4 distinct operator archetypes with signature gun pairings.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1 w-1 shrink-0 bg-sky-400" />
                      <span>AK-47 red dot optic, K-Bar knife & 3D weapon charms.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1 w-1 shrink-0 bg-emerald-400" />
                      <span>Live 3D operator showcase & full bot/multiplayer parity.</span>
                    </li>
                  </ul>
                </section>
              </div>

              {/* Top-Right: 4-Character Quick Selector + Active Loadout Shortcut */}
              <div className="flex w-full flex-col gap-3 lg:w-80">
                <section className="border border-white/15 bg-[#0b1017]/82 p-3.5 backdrop-blur-md">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="inline-flex items-center gap-1.5 font-mono-tabular text-[10px] font-semibold tracking-widest text-slate-400">
                      <UserCheck className="h-3 w-3 text-amber-400" />
                      SELECT OPERATOR
                    </span>
                    <span className="font-mono-tabular text-[10px] font-semibold text-amber-300">
                      {selectedCharacter.role.toUpperCase()}
                    </span>
                  </div>

                  {/* 4 Character Archetype Quick Grid */}
                  <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                    {CHARACTER_IDS.map((charId) => {
                      const charCfg = CHARACTERS[charId];
                      const sigGun = WEAPONS[charCfg.signatureGunId];
                      const active = selectedCharacterId === charId;
                      return (
                        <button
                          key={charId}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            setShowcaseFocus('gun');
                            onSelectCharacter(charId, true);
                          }}
                          className={`min-w-0 cursor-pointer border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                            active
                              ? 'border-amber-400/90 bg-amber-400/14'
                              : 'border-white/12 bg-black/45 hover:border-white/30 hover:bg-white/[0.06]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate font-display text-xs font-bold text-white">
                              {charCfg.callsign}
                            </span>
                            <span
                              className="h-2 w-2 shrink-0 border border-white/30"
                              style={{ backgroundColor: charCfg.accentHex }}
                            />
                          </div>
                          <div className="mt-0.5 truncate font-mono-tabular text-[10px] text-slate-300">
                            {charCfg.role} · {sigGun.shortName}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2">
                    <span className="font-mono-tabular text-[10px] font-semibold tracking-widest text-slate-400">
                      DEPLOY LOADOUT
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = showcaseFocus === 'gun' ? 'knife' : 'gun';
                        setShowcaseFocus(next);
                      }}
                      className="inline-flex cursor-pointer items-center gap-1 font-mono-tabular text-[10px] font-semibold text-sky-300 transition-colors hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                    >
                      <Eye className="h-3 w-3" />
                      {showcaseFocus === 'gun' ? 'VIEW KNIFE' : 'VIEW GUN'}
                    </button>
                  </div>

                  {/* Slot 1 Gun Summary */}
                  <div className="mt-2 border border-amber-400/35 bg-amber-400/10 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono-tabular text-[10px] font-bold text-amber-300">
                        SLOT 01 · PRIMARY
                      </span>
                      <span className="font-mono-tabular text-[10px] text-slate-300">
                        {selectedCharacter.signatureGunId === selectedGunId
                          ? 'SIGNATURE'
                          : selectedGun.fireMode === 'auto'
                            ? 'AUTO'
                            : 'SEMI'}
                      </span>
                    </div>
                    <div className="mt-0.5 font-display text-sm font-bold text-white">
                      {selectedGun.name}
                    </div>
                    <div className="mt-0.5 font-mono-tabular text-[10px] text-slate-300">
                      {selectedGun.pellets
                        ? `${selectedGun.damage}×${selectedGun.pellets} DMG`
                        : `${selectedGun.damage} DMG`}{' '}
                      · {selectedGun.rpm} RPM · MAG {selectedGun.magSize}
                    </div>
                  </div>

                  {/* Slot 2 Knife & Charm Summary */}
                  <div className="mt-2 border border-white/12 bg-black/40 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono-tabular text-[10px] font-bold text-emerald-300">
                        SLOT 02 · MELEE [V / F]
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono-tabular text-[10px] text-amber-300">
                        <span
                          className="h-2 w-2 border border-white/40"
                          style={{ backgroundColor: selectedCharm.accentHex }}
                        />
                        {selectedCharm.name}
                      </span>
                    </div>
                    <div className="mt-0.5 font-display text-xs font-semibold text-white">
                      {WEAPONS.knife.name}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTab('loadout')}
                    className="mt-2.5 flex w-full cursor-pointer items-center justify-center gap-2 border border-white/15 bg-white/[0.06] py-2 font-display text-xs font-bold tracking-wider text-white transition-colors hover:border-amber-400/60 hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    <Swords className="h-3.5 w-3.5 text-amber-400" />
                    CUSTOMIZE OPERATOR & GUN
                  </button>
                </section>
              </div>
            </div>

            {/* Bottom-Center Dominant Play CTA Dock */}
            <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-2 sm:flex-row sm:items-stretch sm:justify-center sm:gap-3">
              <button
                type="button"
                onClick={onOpenCustomMatch}
                className="flex cursor-pointer items-center justify-center gap-2.5 border border-blue-400/45 bg-[#0b1322]/90 px-5 py-3 font-display text-xs font-bold tracking-wider text-blue-100 backdrop-blur-md transition-colors hover:border-blue-400 hover:bg-blue-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 whitespace-nowrap sm:min-w-[180px]"
              >
                <Users className="h-4 w-4 text-blue-300" />
                <span>MULTIPLAYER</span>
              </button>

              <button
                type="button"
                onClick={onPlayOfflineTdm}
                className="flex cursor-pointer items-center justify-center gap-3 border border-amber-300 bg-amber-500 px-10 py-3.5 font-display text-base font-bold tracking-widest text-slate-950 shadow-xl shadow-amber-950/35 transition-colors hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 whitespace-nowrap sm:min-w-[260px]"
              >
                <Crosshair className="h-5 w-5" />
                <span>PLAY · SOLO BOTS</span>
              </button>

              <button
                type="button"
                onClick={onOpenMapSelect}
                className="flex cursor-pointer items-center justify-center gap-2.5 border border-white/20 bg-[#0b1017]/90 px-5 py-3 font-display text-xs font-bold tracking-wider text-white backdrop-blur-md transition-colors hover:border-amber-400/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 whitespace-nowrap sm:min-w-[180px]"
              >
                <Compass className="h-4 w-4 text-amber-400" />
                <span>THEATERS</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'loadout' && (
          <div className="flex min-h-0 flex-1 items-start">
            <div className="flex max-h-full w-full max-w-[620px] flex-col overflow-y-auto border border-white/15 bg-[#0b1017]/90 p-5 backdrop-blur-md">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div>
                  <div className="font-mono-tabular text-[10px] font-bold tracking-widest text-amber-400">
                    ARMORY · PRE-SPAWN LOADOUT
                  </div>
                  <h2 className="mt-0.5 font-display text-xl font-bold text-white">
                    Select Operator, Gun & Knife Charm
                  </h2>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowcaseFocus('gun')}
                    className={`cursor-pointer border px-2.5 py-1 font-mono-tabular text-[10px] font-semibold transition-colors ${
                      showcaseFocus === 'gun'
                        ? 'border-amber-400 bg-amber-400/20 text-amber-200'
                        : 'border-white/15 bg-white/[0.04] text-slate-300 hover:text-white'
                    }`}
                  >
                    PREVIEW GUN
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowcaseFocus('knife')}
                    className={`cursor-pointer border px-2.5 py-1 font-mono-tabular text-[10px] font-semibold transition-colors ${
                      showcaseFocus === 'knife'
                        ? 'border-emerald-400 bg-emerald-400/20 text-emerald-200'
                        : 'border-white/15 bg-white/[0.04] text-slate-300 hover:text-white'
                    }`}
                  >
                    PREVIEW KNIFE
                  </button>
                </div>
              </div>

              {/* 4-Character Operator Roster */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-display font-semibold text-white">
                    Operator Archetype (4 Distinct Characters)
                  </span>
                  <span className="font-mono-tabular text-[10px] text-slate-400">
                    PAIRS SIGNATURE GUN
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {CHARACTER_IDS.map((charId) => {
                    const c = CHARACTERS[charId];
                    const sigGun = WEAPONS[c.signatureGunId];
                    const active = selectedCharacterId === charId;
                    return (
                      <button
                        key={charId}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setShowcaseFocus('gun');
                          onSelectCharacter(charId, true);
                        }}
                        className={`min-w-0 cursor-pointer border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                          active
                            ? 'border-amber-400/85 bg-amber-400/14 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.16)]'
                            : 'border-white/10 bg-black/40 hover:border-white/25 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono-tabular text-[10px] font-semibold text-amber-300">
                            {c.role.toUpperCase()} · SIG: {sigGun.shortName.toUpperCase()}
                          </span>
                          <span
                            className="h-2.5 w-2.5 shrink-0 border border-white/30"
                            style={{ backgroundColor: c.accentHex }}
                          />
                        </div>
                        <div className="mt-1 truncate font-display text-sm font-bold text-white">
                          {c.fullName}
                        </div>
                        <div className="mt-0.5 truncate font-mono-tabular text-[10px] text-slate-300">
                          {c.silhouetteLabel}
                        </div>
                        <p className="mt-1 line-clamp-1 text-[10px] text-slate-400">
                          {c.gearSummary}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 5-Gun Roster */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-display font-semibold text-white">
                    Primary Weapon (Slot 01)
                  </span>
                  <span className="font-mono-tabular text-[10px] text-slate-400">
                    PICK 1 GUN PER SPAWN
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {GUN_IDS.map((id) => {
                    const w = WEAPONS[id];
                    const selected = selectedGunId === id;
                    const isSignature = selectedCharacter.signatureGunId === id;
                    const opticTag =
                      id === 'ak47'
                        ? 'Red Dot Sight'
                        : id === 'sniper'
                          ? '4x/6x/8x Scope'
                          : id === 'smg'
                            ? 'Reflex Holo'
                            : w.category;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setShowcaseFocus('gun');
                          onSelectGun(id);
                        }}
                        className={`min-w-0 cursor-pointer border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                          selected
                            ? 'border-amber-400/85 bg-amber-400/14 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.16)]'
                            : 'border-white/10 bg-black/40 hover:border-white/25 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono-tabular text-[10px] font-semibold text-amber-300">
                            {w.shortName.toUpperCase()} · {opticTag}
                          </span>
                          <div className="flex shrink-0 items-center gap-1">
                            {isSignature && (
                              <span className="border border-sky-400/40 bg-sky-400/15 px-1 py-0.5 font-mono-tabular text-[9px] font-bold text-sky-300">
                                SIG
                              </span>
                            )}
                            {selected && (
                              <span className="font-mono-tabular text-[9px] font-bold tracking-wider text-amber-300">
                                EQUIPPED
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 truncate font-display text-sm font-bold text-white">
                          {w.name}
                        </div>
                        <div className="mt-0.5 font-mono-tabular text-[10px] text-slate-400">
                          {w.pellets ? `${w.damage}×${w.pellets} DMG` : `${w.damage} DMG`} ·{' '}
                          {w.rpm} RPM · MAG {w.magSize}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Slot 02 Knife + 5 Selectable 3D Charms */}
              <div className="mt-4 border border-white/12 bg-black/40 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="border border-emerald-400/35 bg-emerald-500/15 px-1.5 py-0.5 font-mono-tabular text-[10px] font-bold text-emerald-300">
                      SLOT 02 · ALWAYS EQUIPPED
                    </span>
                    <span className="font-display text-xs font-bold text-white">
                      {WEAPONS.knife.name}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 font-mono-tabular text-[10px] text-amber-300">
                    <Sparkles className="h-3 w-3" />
                    {selectedCharm.name}
                  </span>
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                  {KNIFE_CHARM_IDS.map((charmId) => {
                    const charm = KNIFE_CHARMS[charmId];
                    const active = knifeCharmId === charmId;
                    return (
                      <button
                        key={charmId}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setShowcaseFocus('knife');
                          onSelectKnifeCharm(charmId);
                        }}
                        className={`flex min-w-0 cursor-pointer items-center gap-1.5 border px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                          active
                            ? 'border-amber-400/85 bg-amber-400/18 text-white'
                            : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:bg-white/[0.08]'
                        }`}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 border border-white/35"
                          style={{ backgroundColor: charm.accentHex }}
                        />
                        <span className="truncate font-mono-tabular text-[10px] font-medium">
                          {charm.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                <span className="text-[11px] text-slate-400">
                  Gun switches lock while alive and unlock on death or pre-spawn.
                </span>
                <button
                  type="button"
                  onClick={onPlayOfflineTdm}
                  className="shrink-0 cursor-pointer border border-amber-300 bg-amber-500 px-5 py-2 font-display text-xs font-bold tracking-wider text-slate-950 transition-colors hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                >
                  DEPLOY NOW
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'maps' && (
          <div className="flex min-h-0 flex-1 items-start">
            <div className="flex max-h-full w-full max-w-2xl flex-col overflow-y-auto border border-white/15 bg-[#0b1017]/90 p-5 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <div className="font-mono-tabular text-[10px] font-bold tracking-widest text-amber-400">
                    COMBAT THEATERS
                  </div>
                  <h2 className="mt-0.5 font-display text-xl font-bold text-white">
                    Choose Operational Arena
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onOpenMapSelect}
                  className="cursor-pointer border border-white/15 bg-white/[0.05] px-3 py-1.5 font-display text-xs font-semibold text-slate-200 transition-colors hover:border-amber-400/50 hover:text-white"
                >
                  Full Map Intel
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {MAP_LIST.map((map) => {
                  const active = map.id === selectedMapId;
                  return (
                    <button
                      key={map.id}
                      type="button"
                      onClick={() => onPreviewMap?.(map.id)}
                      className={`cursor-pointer border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                        active
                          ? 'border-amber-400/85 bg-amber-400/14'
                          : 'border-white/10 bg-black/40 hover:border-white/25 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-sm font-bold text-white">
                          {map.name}
                        </span>
                        <span
                          className="h-2.5 w-2.5 shrink-0 border border-white/30"
                          style={{ backgroundColor: map.accentHex }}
                        />
                      </div>
                      <div className="mt-1 font-mono-tabular text-[10px] text-amber-300">
                        {map.environmentLabel} · {map.engagementRange}
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-xs text-slate-400">
                        {map.tagline}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                <div className="text-xs text-slate-300">
                  Selected: <span className="font-semibold text-white">{selectedMap.name}</span>
                </div>
                <button
                  type="button"
                  onClick={onPlayOfflineTdm}
                  className="cursor-pointer border border-amber-300 bg-amber-500 px-6 py-2 font-display text-xs font-bold tracking-wider text-slate-950 transition-colors hover:bg-amber-400"
                >
                  PLAY ON {selectedMap.name.toUpperCase()}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="flex min-h-0 flex-1 items-start">
            <div className="max-h-full w-full max-w-2xl overflow-y-auto border border-white/15 bg-[#0b1017]/92 p-5 backdrop-blur-md">
              <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
                <h2 className="font-display text-xl font-bold text-white">Settings</h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('play')}
                  className="cursor-pointer text-xs text-slate-400 hover:text-white"
                >
                  Done [Esc]
                </button>
              </div>
              <SettingsPanel
                settings={settings}
                onUpdateSettings={onUpdateSettings}
                onResetSettings={onResetSettings}
              />
            </div>
          </div>
        )}

        {activeTab === 'howto' && (
          <div className="flex min-h-0 flex-1 items-start">
            <div className="max-h-full w-full max-w-2xl overflow-y-auto border border-white/15 bg-[#0b1017]/92 p-5 backdrop-blur-md">
              <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
                <h2 className="font-display text-xl font-bold text-white">Combat Controls</h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('play')}
                  className="cursor-pointer text-xs text-slate-400 hover:text-white"
                >
                  Close [Esc]
                </button>
              </div>

              <div className="space-y-4 text-xs text-slate-300">
                <p className="leading-relaxed">
                  Choose 1 of 4 distinct operator archetypes (Assault, Vanguard, Breacher, Marksman) paired with their signature firearm or any of the 5 guns (Slot 1), plus your K-Bar Combat Knife (Slot 2) with a custom 3D charm. Guns lock while alive and swap before spawn or on death; your Knife stays ready at all times via [2] or quick-melee [V / F].
                </p>

                {(() => {
                  const kb = settings.keybindings ?? DEFAULT_KEYBINDINGS;
                  return (
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 border border-white/10 bg-black/40 p-4 sm:grid-cols-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Move</span>
                        <span className="font-mono-tabular text-white">
                          {formatKeyCode(kb.moveForward)} {formatKeyCode(kb.moveLeft)} {formatKeyCode(kb.moveBackward)} {formatKeyCode(kb.moveRight)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Fire / Slash</span>
                        <span className="font-mono-tabular text-white">Left Click</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Sprint</span>
                        <span className="font-mono-tabular text-white">{formatKeyCode(kb.sprint)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Aim Down Sights / Red Dot</span>
                        <span className="font-mono-tabular text-white">Right Click</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Jump</span>
                        <span className="font-mono-tabular text-white">{formatKeyCode(kb.jump)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Reload</span>
                        <span className="font-mono-tabular text-white">{formatKeyCode(kb.reload)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Crouch</span>
                        <span className="font-mono-tabular text-white">
                          {formatKeyCode(kb.crouchToggle)} / {formatKeyCode(kb.crouchHold)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Tactical Slide</span>
                        <span className="font-mono-tabular text-amber-300">
                          {formatKeyCode(kb.sprint)} + {formatKeyCode(kb.crouchToggle)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Gun / Knife</span>
                        <span className="font-mono-tabular text-white">
                          {formatKeyCode(kb.slotGun)} · {formatKeyCode(kb.slotKnife)} / Wheel
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Quick Melee Knife</span>
                        <span className="font-mono-tabular text-amber-300">
                          {formatKeyCode(kb.quickMelee)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Sniper Optic Zoom</span>
                        <span className="font-mono-tabular text-amber-300">
                          {formatKeyCode(kb.cycleOptic)} (4X/6X/8X)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Killstreaks</span>
                        <span className="font-mono-tabular text-amber-300">
                          {formatKeyCode(kb.streakUav)} · {formatKeyCode(kb.streakBarrage)} · {formatKeyCode(kb.streakOverdrive)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Scoreboard</span>
                        <span className="font-mono-tabular text-white">Hold {formatKeyCode(kb.scoreboard)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Pause / Fullscreen</span>
                        <span className="font-mono-tabular text-white">Esc / F (Menu)</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
