import React from 'react';
import { HudState, WEAPONS, WeaponId } from '../game/types';
import { formatMatchTime, ScoreboardOverlay } from './ScoreboardOverlay';

interface GameHUDProps {
  hud: HudState;
}

function getCardinalLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

export const GameHUD: React.FC<GameHUDProps> = ({ hud }) => {
  const activeSlot = hud.weaponSlots.find((s) => s.id === hud.activeWeapon.id);
  const accuracyPct =
    hud.shotsFired > 0 ? Math.round((hud.shotsHit / hud.shotsFired) * 100) : 0;

  const now = performance.now();
  const damageRecent = now - hud.lastDamageTimestamp < 320;
  const gap = hud.isAds ? 3 : Math.min(34, hud.crosshairSpreadPx);
  const tickLen = hud.isAds ? 4 : 9;
  const reticleColor = hud.targetingEnemy ? '#ef4444' : '#f8fafc';

  const localTeam =
    hud.match.participants.find((p) => p.isPlayer)?.team ?? 'blue';
  const isSniperAds = hud.activeWeapon.id === 'intervention' && hud.isAds && hud.isAlive;
  const swayX = isSniperAds ? Math.sin(now * 0.003) * (hud.speed > 0.5 ? 4.5 : 1.2) : 0;
  const swayY = isSniperAds ? Math.cos(now * 0.0025) * (hud.speed > 0.5 ? 4.5 : 1.2) : 0;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      {/* Full-Viewport Professional Military Mil-Dot Sniper Scope Overlay */}
      {isSniperAds && hud.isPointerLocked && !hud.showScoreboard && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black">
          <div
            className="relative h-[100vw] w-[100vw] max-h-[100vh] max-w-[100vh] overflow-hidden rounded-full border-[76px] border-black bg-[#020407]"
            style={{
              transform: `translate(${swayX}px, ${swayY}px)`,
              boxShadow:
                'inset 0 0 160px 80px rgba(0,0,0,0.99), 0 0 0 4px rgba(22,28,38,0.95), 0 0 40px rgba(0,0,0,0.9)',
              backgroundImage:
                'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(16,185,129,0.04) 35%, rgba(0,0,0,0.98) 70%)',
            }}
          >
            {/* Fine green mil-dot reticle & hash marks */}
            <div className="absolute inset-0 flex items-center justify-center">
              {/* Primary Crosshair H/V lines */}
              <div className="absolute h-full w-[1.5px] bg-emerald-500/90 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
              <div className="absolute h-[1.5px] w-full bg-emerald-500/90 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />

              {/* Mil-dot center illumination */}
              <div className="absolute h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,1)]" />

              {/* Mil-dots & Rangefinder Stadiametric Ticks */}
              <div className="absolute top-[28%] h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />
              <div className="absolute top-[34%] h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />
              <div className="absolute top-[40%] h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />

              <div className="absolute bottom-[28%] h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />
              <div className="absolute bottom-[34%] h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />
              <div className="absolute bottom-[40%] h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />

              <div className="absolute left-[28%] h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />
              <div className="absolute left-[34%] h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />
              <div className="absolute left-[40%] h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />

              <div className="absolute right-[28%] h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />
              <div className="absolute right-[34%] h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />
              <div className="absolute right-[40%] h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />
            </div>

            {/* Scope Telemetry & Range */}
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 border border-emerald-500/40 bg-black/90 px-5 py-2 font-mono-tabular text-xs text-emerald-400 backdrop-blur-md shadow-lg">
              <div className="font-semibold tracking-wider">
                {hud.scopeMagnification}.0X INTERVENTION OPTIC {hud.rangeDistanceMeters !== null ? `· ${hud.rangeDistanceMeters}m` : ''}
              </div>
              <div className="text-[10px] text-emerald-500/70">
                [B] Toggle Magnification (4X / 6X / 8X)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overdrive Perimeter Surge */}
      {hud.overdriveActive && hud.isAlive && (
        <div
          className="fixed inset-0"
          style={{
            boxShadow: 'inset 0 0 90px 18px rgba(245, 158, 11, 0.24)',
          }}
        />
      )}

      {/* Damage Vignette Flash */}
      {damageRecent && (
        <div
          className="fixed inset-0 transition-opacity duration-150"
          style={{
            boxShadow: 'inset 0 0 110px 28px rgba(220, 38, 38, 0.55)',
          }}
        />
      )}

      {/* Directional Damage Indicator Arcs */}
      {hud.isAlive && hud.damageIndicators.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative h-64 w-64">
            {hud.damageIndicators.map((ind) => {
              const age = Math.max(0, now - ind.timestamp);
              const opacity = Math.max(0, Math.min(1, 1 - age / 950));
              return (
                <svg
                  key={ind.id}
                  viewBox="0 0 240 240"
                  className="absolute inset-0 h-full w-full"
                  style={{
                    transform: `rotate(${ind.angleDeg}deg)`,
                    opacity,
                  }}
                >
                  <path
                    d="M 82 28 A 96 96 0 0 1 158 28 L 146 42 A 80 80 0 0 0 94 42 Z"
                    fill="#ef4444"
                  />
                </svg>
              );
            })}
          </div>
        </div>
      )}

      {/* Dynamic Center Reticle (hidden when sniping) */}
      {hud.isPointerLocked && hud.isAlive && !hud.showScoreboard && !isSniperAds && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            <div
              className="h-1 w-1 rounded-full transition-colors duration-75"
              style={{
                backgroundColor: reticleColor,
                opacity: hud.isAds ? 0.95 : 0.75,
              }}
            />

            {!hud.isAds && (
              <>
                <span
                  className="absolute w-[2px] transition-colors duration-75"
                  style={{
                    height: `${tickLen}px`,
                    backgroundColor: reticleColor,
                    transform: `translateY(-${gap + tickLen / 2}px)`,
                  }}
                />
                <span
                  className="absolute w-[2px] transition-colors duration-75"
                  style={{
                    height: `${tickLen}px`,
                    backgroundColor: reticleColor,
                    transform: `translateY(${gap + tickLen / 2}px)`,
                  }}
                />
                <span
                  className="absolute h-[2px] transition-colors duration-75"
                  style={{
                    width: `${tickLen}px`,
                    backgroundColor: reticleColor,
                    transform: `translateX(-${gap + tickLen / 2}px)`,
                  }}
                />
                <span
                  className="absolute h-[2px] transition-colors duration-75"
                  style={{
                    width: `${tickLen}px`,
                    backgroundColor: reticleColor,
                    transform: `translateX(${gap + tickLen / 2}px)`,
                  }}
                />
              </>
            )}

            {hud.hitMarker && (
              <div
                key={hud.hitMarker.id}
                className="absolute inset-0 flex items-center justify-center"
              >
                <span
                  className="absolute h-[2px] w-4 rotate-45"
                  style={{
                    backgroundColor:
                      hud.hitMarker.zone === 'head' || hud.hitMarker.killed
                        ? '#ef4444'
                        : '#ffffff',
                  }}
                />
                <span
                  className="absolute h-[2px] w-4 -rotate-45"
                  style={{
                    backgroundColor:
                      hud.hitMarker.zone === 'head' || hud.hitMarker.killed
                        ? '#ef4444'
                        : '#ffffff',
                  }}
                />
              </div>
            )}

            <div className="absolute top-8 flex flex-col items-center gap-1 whitespace-nowrap">
              {hud.isReloading && (
                <div className="flex flex-col items-center gap-1 border border-white/10 bg-black/60 px-2.5 py-1">
                  <span className="font-display text-[11px] font-semibold tracking-wider text-amber-400">
                    Reloading
                  </span>
                  <div className="h-1 w-24 bg-white/15">
                    <div
                      className="h-full bg-amber-400 transition-[width] duration-75"
                      style={{ width: `${Math.round(hud.reloadProgress * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {!hud.isReloading && hud.rangeDistanceMeters !== null && (
                <span
                  className={`font-mono-tabular text-[11px] ${
                    hud.targetingEnemy ? 'text-red-400' : 'text-slate-300/75'
                  }`}
                >
                  {hud.rangeDistanceMeters}m
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Arcade Score Popups */}
      {hud.isPointerLocked && hud.isAlive && !hud.showScoreboard && hud.scorePopups.length > 0 && (
        <div className="absolute top-[55%] left-[55%] flex flex-col gap-1">
          {hud.scorePopups.map((pop) => {
            const age = Math.max(0, now - pop.timestamp);
            const opacity = Math.max(0, Math.min(1, 1 - Math.max(0, age - 900) / 550));
            return (
              <div
                key={pop.id}
                className="flex flex-col"
                style={{ opacity }}
              >
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`font-mono-tabular font-display text-sm font-bold ${
                      pop.isHeadshot ? 'text-amber-300' : 'text-amber-400'
                    }`}
                  >
                    +{pop.points}
                  </span>
                  <span className="font-display text-xs font-bold tracking-wider text-white">
                    {pop.label}
                  </span>
                </div>
                {pop.sublabel && (
                  <span className="font-mono-tabular text-[10px] text-slate-300/90">
                    {pop.sublabel}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Killer Banner & Kill-Cam Respawn Overlay */}
      {!hud.isAlive && hud.match.phase === 'playing' && (
        <div className="absolute inset-0 flex items-end justify-center pb-14">
          <div className="w-full max-w-md border border-white/20 bg-[#0b0f16]/90 px-6 py-4 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-display text-xs font-bold tracking-widest text-red-400">
                ELIMINATED BY
              </span>
              <span className="font-mono-tabular text-xs font-semibold text-amber-400">
                Respawning in {hud.respawnTimer.toFixed(1)}s
              </span>
            </div>

            {hud.killerBanner ? (
              <div className="mt-3 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-display text-lg font-bold ${
                        hud.killerBanner.team === 'blue' ? 'text-blue-400' : 'text-red-400'
                      }`}
                    >
                      {hud.killerBanner.name}
                    </span>
                    {hud.killerBanner.headshot && (
                      <span className="border border-amber-400/40 bg-amber-400/15 px-1.5 py-0.5 font-mono-tabular text-[10px] font-bold text-amber-300">
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

                {typeof hud.killerBanner.killerHpRemaining === 'number' && (
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">
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
            ) : (
              hud.lastKillerName && (
                <div className="mt-2 text-xs text-slate-300">
                  Taken down by <span className="font-semibold text-white">{hud.lastKillerName}</span>
                  {hud.lastKillerWeapon ? ` · ${hud.lastKillerWeapon}` : ''}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Top-Center TDM Score Bug, Compass & Killstreak Notification Banner */}
      <div className="absolute top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <div className="flex items-center border border-white/15 bg-black/60 backdrop-blur-sm">
          <div className="flex items-center gap-2.5 border-r border-white/10 px-4 py-1.5">
            <span className="text-[11px] font-medium text-blue-400">BLUE</span>
            <span className="font-mono-tabular font-display text-xl font-bold text-white">
              {hud.match.blueScore}
            </span>
          </div>

          <div className="px-4 py-1 text-center">
            <div className="font-mono-tabular font-display text-base font-bold text-amber-400">
              {formatMatchTime(hud.match.timeRemainingSec)}
            </div>
            <div className="font-mono-tabular text-[10px] text-slate-400">
              Limit {hud.match.killLimit}
            </div>
          </div>

          <div className="flex items-center gap-2.5 border-l border-white/10 px-4 py-1.5">
            <span className="font-mono-tabular font-display text-xl font-bold text-white">
              {hud.match.redScore}
            </span>
            <span className="text-[11px] font-medium text-red-400">RED</span>
          </div>
        </div>

        <div className="border border-white/10 bg-black/45 px-3 py-0.5 font-mono-tabular text-[11px] text-slate-300">
          <span className="font-semibold text-amber-400">{getCardinalLabel(hud.headingDeg)}</span>{' '}
          <span className="text-slate-500">/</span> {String(hud.headingDeg).padStart(3, '0')}°
        </div>

        {hud.killstreakBanner && (
          <div className="mt-1 border border-amber-400/50 bg-[#0b1017]/90 px-5 py-2 text-center backdrop-blur-md">
            <div className="font-display text-xs font-bold tracking-widest text-amber-400">
              {hud.killstreakBanner.title}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-200">
              {hud.killstreakBanner.subtitle}
            </div>
          </div>
        )}
      </div>

      {/* Top-Left Corner Tactical Radar + Stats + Live Kill Feed */}
      <div className="absolute top-4 left-4 flex flex-col gap-2">
        <div className="flex items-start gap-2.5">
          {/* Circular Tactical Radar */}
          <div className="relative h-[126px] w-[126px] shrink-0 overflow-hidden rounded-full border border-white/20 bg-[#080c12]/80 backdrop-blur-sm">
            <svg viewBox="-60 -60 120 120" className="h-full w-full">
              <circle cx="0" cy="0" r="28" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              <circle cx="0" cy="0" r="54" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <polygon points="0,0 -34,-54 34,-54" fill="rgba(255,255,255,0.05)" />
              <line x1="-58" y1="0" x2="58" y2="0" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
              <line x1="0" y1="-58" x2="0" y2="58" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

              {hud.uavActive && (
                <circle
                  cx="0"
                  cy="0"
                  r={4 + hud.uavPulseProgress * 54}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                  opacity={Math.max(0, 1 - hud.uavPulseProgress)}
                />
              )}

              {hud.radarBlips.map((b) => {
                const px = b.relX * 52;
                const py = -b.relZ * 52;
                const isFriend = b.team === localTeam;
                return (
                  <circle
                    key={b.id}
                    cx={px}
                    cy={py}
                    r={isFriend ? 3.2 : 3.6}
                    fill={isFriend ? '#38bdf8' : '#ef4444'}
                    stroke="#090d13"
                    strokeWidth="1"
                  />
                );
              })}

              <polygon points="0,-6 4.5,4.5 0,2 -4.5,4.5" fill="#fbbf24" />
            </svg>
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 font-mono-tabular text-[9px] font-semibold tracking-wider text-slate-300">
              {hud.uavActive ? <span className="text-sky-400">UAV</span> : 'RADAR'}
            </div>
          </div>

          {/* Operator Session Telemetry */}
          <div className="flex flex-col gap-1.5">
            <div className="border border-white/10 bg-black/55 px-3 py-1.5 backdrop-blur-sm">
              <div className="flex items-center gap-3 text-xs text-slate-300">
                <div>
                  <span className="text-slate-400">Kills </span>
                  <span className="font-mono-tabular font-semibold text-white">
                    {hud.eliminations}
                  </span>
                </div>
                <span className="text-slate-600">·</span>
                <div>
                  <span className="text-slate-400">Acc </span>
                  <span className="font-mono-tabular font-semibold text-white">
                    {accuracyPct}%
                  </span>
                </div>
                <span className="text-slate-600">·</span>
                <div>
                  <span className="text-slate-400">HS </span>
                  <span className="font-mono-tabular font-semibold text-amber-400">
                    {hud.headshots}
                  </span>
                </div>
              </div>
            </div>

            <div className="border border-white/10 bg-black/55 px-3 py-1 font-mono-tabular text-[11px] text-slate-300 backdrop-blur-sm">
              <span className="text-slate-400">LV {hud.rankLevel}</span>{' '}
              <span className="font-semibold text-white">{hud.rankTitle}</span>
              <span className="mx-1.5 text-slate-600">|</span>
              <span className="text-amber-400">Streak {hud.currentStreak}</span>
            </div>
          </div>
        </div>

        {hud.match.killFeed.length > 0 && (
          <div className="flex flex-col gap-1">
            {hud.match.killFeed.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-1.5 border border-white/10 bg-black/55 px-3 py-1 text-xs backdrop-blur-sm"
              >
                <span
                  className={`font-semibold ${
                    entry.killerTeam === 'blue' ? 'text-blue-400' : 'text-red-400'
                  }`}
                >
                  {entry.killerName}
                </span>
                <span className="border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono-tabular text-[10px] text-slate-200">
                  {entry.weaponName}
                </span>
                {entry.headshot && (
                  <span className="border border-amber-400/40 bg-amber-400/15 px-1.5 py-0.5 font-mono-tabular text-[10px] font-bold text-amber-300">
                    HEADSHOT
                  </span>
                )}
                <span className="text-slate-500">→</span>
                <span
                  className={`font-semibold ${
                    entry.victimTeam === 'blue' ? 'text-blue-400' : 'text-red-400'
                  }`}
                >
                  {entry.victimName}
                </span>
                <span className="font-mono-tabular text-[10px] text-slate-500">
                  {Math.round(entry.distanceMeters)}m
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom-Left Player Vitals & Stance */}
      <div className="absolute bottom-4 left-4 border border-white/10 bg-black/55 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-baseline justify-between gap-6">
          <span
            className={`font-mono-tabular font-display text-2xl font-bold ${
              hud.health <= 30 ? 'text-red-400' : hud.overdriveActive ? 'text-amber-300' : 'text-white'
            }`}
          >
            {hud.health}
          </span>
          <span
            className={`text-xs font-medium capitalize ${
              hud.stance === 'slide' ? 'font-semibold text-amber-400' : 'text-slate-300'
            }`}
          >
            {hud.overdriveActive ? `OVERDRIVE ${hud.overdriveRemainingSec}s · ` : ''}
            {hud.stance}
            {!hud.isGrounded ? ' · Airborne' : ''}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-44 bg-white/15">
          <div
            className={`h-full transition-[width] duration-100 ${
              hud.health <= 30 ? 'bg-red-500' : 'bg-amber-400'
            }`}
            style={{ width: `${Math.round((hud.health / hud.maxHealth) * 100)}%` }}
          />
        </div>
      </div>

      {/* Bottom-Right Killstreak Slots & Weapon Readout */}
      <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
        {/* Killstreak Bar */}
        <div className="flex items-center gap-1.5">
          {hud.killstreaks.map((ks) => {
            const stateClass = ks.active
              ? 'border-sky-400/70 bg-sky-500/20 text-sky-200'
              : ks.unlocked
                ? 'border-amber-400 bg-amber-500/25 text-amber-200'
                : 'border-white/10 bg-black/50 text-slate-400';
            return (
              <div
                key={ks.id}
                className={`border px-2.5 py-1 font-mono-tabular text-[11px] backdrop-blur-sm ${stateClass}`}
              >
                <span className="font-bold">[{ks.key}]</span> {ks.name}{' '}
                <span className="text-[10px] opacity-80">
                  {ks.active && ks.remainingSec > 0
                    ? `${ks.remainingSec}s`
                    : ks.unlocked
                      ? 'READY'
                      : `${Math.min(hud.currentStreak, ks.requiredKills)}/${ks.requiredKills}`}
                </span>
              </div>
            );
          })}
        </div>

        {/* Weapon & Ammo Card */}
        <div className="border border-white/10 bg-black/55 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-baseline justify-between gap-6">
            <div>
              <div className="font-display text-sm font-semibold text-white">
                {hud.activeWeapon.name}
              </div>
              <div className="text-xs text-slate-400">
                {hud.activeWeapon.category} ·{' '}
                {hud.activeWeapon.fireMode === 'auto' ? 'Full Auto' : 'Semi-Auto'}
              </div>
            </div>
            <div className="flex items-baseline gap-1.5 font-mono-tabular">
              <span
                className={`font-display text-3xl font-bold ${
                  (activeSlot?.ammoInMag ?? 0) <= Math.ceil(hud.activeWeapon.magSize * 0.25)
                    ? 'text-red-400'
                    : 'text-white'
                }`}
              >
                {String(activeSlot?.ammoInMag ?? 0).padStart(2, '0')}
              </span>
              <span className="text-sm text-slate-500">/</span>
              <span className="text-sm text-slate-300">
                {activeSlot?.reserveAmmo ?? 0}
              </span>
            </div>
          </div>

          <div className="mt-2.5 flex items-center gap-2 border-t border-white/10 pt-2 text-xs">
            {(['m4a1', 'mp5', 'intervention', 'm1911'] as WeaponId[]).map((id) => {
              const w = WEAPONS[id];
              const active = hud.activeWeapon.id === id;
              const shortName = id === 'intervention' ? '.50 Cal' : w.name.split(' ')[0];
              return (
                <div
                  key={id}
                  className={`border px-2 py-0.5 font-mono-tabular ${
                    active
                      ? 'border-amber-400/40 bg-amber-400/20 text-amber-300'
                      : 'border-transparent text-slate-400'
                  }`}
                >
                  [{w.slot}] {shortName}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Live Tab Scoreboard */}
      {hud.showScoreboard && <ScoreboardOverlay match={hud.match} />}
    </div>
  );
};
