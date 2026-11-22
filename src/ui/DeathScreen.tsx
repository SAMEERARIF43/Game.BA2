import React, { useEffect } from 'react';
import { Crosshair, RotateCcw, ShieldAlert, Sparkles } from 'lucide-react';
import {
  GUN_IDS,
  GunId,
  HudState,
  KNIFE_CHARMS,
  KNIFE_CHARM_IDS,
  KnifeCharmId,
  WEAPONS,
  WeaponId,
} from '../game/types';
import { WeaponPreview } from './WeaponPreview';

export interface DeathScreenProps {
  hud: HudState;
  chatOpen?: boolean;
  onSelectGun: (id: GunId) => void;
  onSelectKnifeCharm?: (id: KnifeCharmId) => void;
  onRespawn: () => void;
}

function resolveKillerWeaponId(weaponName?: string | null): WeaponId | null {
  if (!weaponName) return null;
  const lower = weaponName.toLowerCase();
  if (lower.includes('shotgun') || lower.includes('m870')) return 'shotgun';
  if (lower.includes('ak')) return 'ak47';
  if (lower.includes('smg') || lower.includes('vector')) return 'smg';
  if (lower.includes('sniper') || lower.includes('awp')) return 'sniper';
  if (lower.includes('pistol') || lower.includes('usp')) return 'pistol';
  if (lower.includes('knife') || lower.includes('k-bar')) return 'knife';
  return null;
}

export const DeathScreen: React.FC<DeathScreenProps> = ({
  hud,
  chatOpen = false,
  onSelectGun,
  onSelectKnifeCharm,
  onRespawn,
}) => {
  const mode = hud.gameMode ?? hud.match.mode ?? 'tdm';
  const isBombMode = mode === 'bomb';
  const canRespawn = !isBombMode && hud.respawnTimer <= 0.05;
  const queuedGun = WEAPONS[hud.queuedGunId];
  const selectedCharm = KNIFE_CHARMS[hud.knifeCharmId];
  const killerWeaponId = resolveKillerWeaponId(
    hud.killerBanner?.weaponName ?? hud.lastKillerWeapon
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (chatOpen) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }

      if (!e.repeat) {
        if (e.code === 'Digit1') {
          e.preventDefault();
          onSelectGun(GUN_IDS[0]);
          return;
        }
        if (e.code === 'Digit2') {
          e.preventDefault();
          onSelectGun(GUN_IDS[1]);
          return;
        }
        if (e.code === 'Digit3') {
          e.preventDefault();
          onSelectGun(GUN_IDS[2]);
          return;
        }
        if (e.code === 'Digit4') {
          e.preventDefault();
          onSelectGun(GUN_IDS[3]);
          return;
        }
        if (e.code === 'Digit5') {
          e.preventDefault();
          onSelectGun(GUN_IDS[4]);
          return;
        }
      }

      if (canRespawn && !e.repeat) {
        if (e.code === 'Space') {
          e.preventDefault();
          e.stopPropagation();
          onRespawn();
        } else if (e.code === 'Enter' && tag !== 'BUTTON') {
          e.preventDefault();
          e.stopPropagation();
          onRespawn();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [canRespawn, chatOpen, onRespawn, onSelectGun]);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:p-6"
      role="dialog"
      aria-modal="false"
      aria-label="Eliminated loadout and respawn"
    >
      <div className="w-full max-w-3xl border border-slate-400/25 bg-[#0b0f17]/94 p-4 shadow-2xl shadow-black/60 backdrop-blur-md sm:p-5">
        {/* Top Elimination Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-400" />
            <span className="font-display text-xs font-bold tracking-widest text-red-400">
              ELIMINATED
            </span>
          </div>
          <span
            className={`font-mono-tabular text-xs font-semibold ${
              isBombMode
                ? 'text-sky-300'
                : canRespawn
                  ? 'text-emerald-300'
                  : 'text-amber-300'
            }`}
          >
            {isBombMode
              ? 'Awaiting Next Round'
              : canRespawn
                ? 'Respawn Ready'
                : `Respawn Ready in ${hud.respawnTimer.toFixed(1)}s`}
          </span>
        </div>

        {/* Attacker Intel Row */}
        {hud.killerBanner ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border border-white/10 bg-black/35 px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-400">Eliminated by</span>
                <span
                  className={`font-display text-base font-bold ${
                    hud.killerBanner.team === 'blue' ? 'text-blue-400' : 'text-red-400'
                  }`}
                >
                  {hud.killerBanner.name}
                </span>
                {hud.killerBanner.headshot && (
                  <span className="border border-amber-400/45 bg-amber-400/15 px-1.5 py-0.5 font-mono-tabular text-[10px] font-bold text-amber-300">
                    HEADSHOT
                  </span>
                )}
              </div>
              <div className="mt-0.5 font-mono-tabular text-xs text-slate-300">
                {hud.killerBanner.weaponName}
                {hud.killerBanner.distanceMeters > 0
                  ? ` · ${hud.killerBanner.distanceMeters.toFixed(1)}m`
                  : ''}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {killerWeaponId && (
                <div className="hidden border border-white/10 bg-slate-950/65 px-2 py-1 sm:block">
                  <WeaponPreview
                    weaponId={killerWeaponId}
                    variant="compact"
                    className="h-8 w-24 opacity-85"
                  />
                </div>
              )}

              {typeof hud.killerBanner.killerHpRemaining === 'number' && (
                <div className="text-right">
                  <div className="font-mono-tabular text-[10px] uppercase tracking-wider text-slate-400">
                    Killer HP
                  </div>
                  <div className="font-mono-tabular text-sm font-bold text-white">
                    {hud.killerBanner.killerHpRemaining}
                  </div>
                  <div className="mt-1 h-1 w-20 bg-white/15">
                    <div
                      className="h-full bg-red-500"
                      style={{
                        width: `${Math.max(0, Math.min(100, hud.killerBanner.killerHpRemaining))}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          hud.lastKillerName && (
            <div className="mt-3 border border-white/10 bg-black/35 px-3.5 py-2 text-xs text-slate-300">
              Taken down by <span className="font-semibold text-white">{hud.lastKillerName}</span>
              {hud.lastKillerWeapon ? ` · ${hud.lastKillerWeapon}` : ''}
            </div>
          )
        )}

        {/* Visual 5-Gun Switcher */}
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-display font-semibold tracking-wide text-white">
              {isBombMode
                ? 'Select Loadout for Next Round · Press [1–5] or Click'
                : 'Switch Primary Gun Before Respawn · Press [1–5] or Click'}
            </span>
            <span className="font-mono-tabular text-[11px] text-amber-300">
              {queuedGun.name} + Knife
            </span>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {GUN_IDS.map((gunId, idx) => {
              const g = WEAPONS[gunId];
              const selected = hud.queuedGunId === gunId;
              return (
                <button
                  key={gunId}
                  type="button"
                  aria-pressed={selected}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSelectGun(gunId);
                  }}
                  className={`flex min-w-0 cursor-pointer flex-col justify-between border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                    selected
                      ? 'border-amber-400 bg-amber-400/16 text-white shadow-[inset_0_0_0_1px_rgba(251,191,36,0.18)]'
                      : 'border-white/10 bg-black/45 text-slate-300 hover:border-white/25 hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono-tabular text-[10px] font-bold text-amber-300">
                      [{idx + 1}]
                    </span>
                    {selected && (
                      <span className="border border-amber-400/40 bg-amber-400/20 px-1 py-0.5 font-mono-tabular text-[9px] font-bold text-amber-200">
                        SELECTED
                      </span>
                    )}
                  </div>

                  <div className="my-1.5 flex items-center justify-center border border-white/[0.06] bg-slate-950/60 px-1 py-1">
                    <WeaponPreview
                      weaponId={gunId}
                      variant="card"
                      className="h-11 w-full"
                    />
                  </div>

                  <div className="truncate font-display text-xs font-bold text-white">
                    {g.shortName}
                  </div>
                  <div className="truncate font-mono-tabular text-[10px] text-slate-400">
                    {g.pellets ? `${g.damage}×${g.pellets}` : `${g.damage}`} DMG · {g.rpm} RPM
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Slot 02 Knife + Charm Strip */}
        <div className="mt-3 flex flex-col gap-2 border border-white/10 bg-black/30 p-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="border border-white/10 bg-slate-950/70 px-2 py-1">
              <WeaponPreview
                weaponId="knife"
                charmId={hud.knifeCharmId}
                variant="compact"
                className="h-8 w-24"
              />
            </div>
            <div>
              <div className="font-display text-xs font-semibold text-white">
                [2] {WEAPONS.knife.name}
              </div>
              <div className="inline-flex items-center gap-1 font-mono-tabular text-[10px] text-amber-300">
                <Sparkles className="h-3 w-3" />
                <span>Charm: {selectedCharm.name}</span>
              </div>
            </div>
          </div>

          {onSelectKnifeCharm && (
            <div className="flex flex-wrap items-center gap-1.5">
              {KNIFE_CHARM_IDS.map((charmId) => {
                const charm = KNIFE_CHARMS[charmId];
                const active = hud.knifeCharmId === charmId;
                return (
                  <button
                    key={charmId}
                    type="button"
                    aria-pressed={active}
                    title={charm.name}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onSelectKnifeCharm(charmId);
                    }}
                    className={`flex cursor-pointer items-center gap-1.5 border px-2 py-1 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                      active
                        ? 'border-amber-400/80 bg-amber-400/18 text-white'
                        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:bg-white/[0.08]'
                    }`}
                  >
                    <span
                      className="h-2 w-2 shrink-0 border border-white/35"
                      style={{ backgroundColor: charm.accentHex }}
                    />
                    <span className="font-mono-tabular whitespace-nowrap">{charm.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Respawn Action Footer */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
          {isBombMode ? (
            <>
              <div className="text-xs text-slate-300">
                Secure Bomb rules: no mid-round respawn.{' '}
                <span className="font-semibold text-white">{queuedGun.name}</span> equips next round.
              </div>
              <span className="border border-sky-400/35 bg-sky-500/15 px-3 py-1.5 font-mono-tabular text-[11px] font-semibold text-sky-200 whitespace-nowrap">
                NEXT ROUND LOADOUT LOCKED IN
              </span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Crosshair className="h-3.5 w-3.5 text-amber-400" />
                <span>
                  Deploying with <span className="font-semibold text-white">{queuedGun.name}</span>
                </span>
              </div>

              <button
                type="button"
                disabled={!canRespawn}
                onClick={onRespawn}
                className={`flex items-center justify-center gap-2 border px-6 py-2.5 font-display text-xs font-bold tracking-widest whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                  canRespawn
                    ? 'cursor-pointer border-amber-300 bg-amber-500 text-slate-950 shadow-lg shadow-amber-950/35 hover:bg-amber-400'
                    : 'cursor-not-allowed border-white/15 bg-white/5 text-slate-400'
                }`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>
                  {canRespawn
                    ? 'RESPAWN [SPACE]'
                    : `RESPAWN IN ${hud.respawnTimer.toFixed(1)}s`}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
