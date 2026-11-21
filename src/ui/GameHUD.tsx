import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, MapPin, MessageSquare, Send, X } from 'lucide-react';
import {
  MINIMAP_LAYOUTS,
  worldSizeToMinimapPercent,
  worldToMinimapPercent,
  yawRadToCompassDeg,
} from '../game/minimap';
import { GUN_IDS, GunId, HudState, KNIFE_CHARMS, WEAPONS } from '../game/types';
import {
  CHAT_FADE_MS,
  CHAT_MAX_LENGTH,
  ChatChannel,
  ChatMessage,
} from '../multiplayer/chat';
import {
  DEFAULT_KEYBINDINGS,
  formatKeyCode,
  KeybindingsConfig,
} from '../settings/keybindings';
import { formatMatchTime, ScoreboardOverlay } from './ScoreboardOverlay';

interface GameHUDProps {
  hud: HudState;
  showFps?: boolean;
  keybindings?: KeybindingsConfig;
  onSelectGun?: (id: GunId) => void;
  isCustomMatch?: boolean;
  chatMessages?: ChatMessage[];
  chatOpen?: boolean;
  chatChannel?: ChatChannel;
  onChangeChatChannel?: (channel: ChatChannel) => void;
  onSendChat?: (text: string, channel: ChatChannel) => void;
  onCloseChat?: (restorePointerLock: boolean) => void;
}

function getCardinalLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

export const GameHUD: React.FC<GameHUDProps> = ({
  hud,
  showFps = false,
  keybindings = DEFAULT_KEYBINDINGS,
  onSelectGun,
  isCustomMatch = false,
  chatMessages = [],
  chatOpen = false,
  chatChannel = 'all',
  onChangeChatChannel,
  onSendChat,
  onCloseChat,
}) => {
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [chatClockMs, setChatClockMs] = useState(() => Date.now());
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const chatFeedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hud.showOnboarding) {
      setOnboardingVisible(false);
      setOnboardingDismissed(false);
      return;
    }

    if (hud.match.phase !== 'playing') {
      setOnboardingVisible(false);
      return;
    }

    if (hud.isAds) {
      setOnboardingVisible(false);
      setOnboardingDismissed(true);
      return;
    }

    if (onboardingDismissed) {
      setOnboardingVisible(false);
      return;
    }

    setOnboardingVisible(true);
    let dismissTimeout: number | undefined;
    const fadeTimeout = window.setTimeout(() => {
      setOnboardingVisible(false);
      dismissTimeout = window.setTimeout(() => setOnboardingDismissed(true), 350);
    }, 10000);

    return () => {
      window.clearTimeout(fadeTimeout);
      if (dismissTimeout !== undefined) window.clearTimeout(dismissTimeout);
    };
  }, [hud.isAds, hud.match.phase, hud.showOnboarding, onboardingDismissed]);

  useEffect(() => {
    if (chatOpen) {
      setChatClockMs(Date.now());
      const focusTimer = window.setTimeout(() => {
        chatInputRef.current?.focus();
      }, 10);
      return () => window.clearTimeout(focusTimer);
    }
    setChatDraft('');
  }, [chatOpen]);

  useEffect(() => {
    setChatClockMs(Date.now());
    const el = chatFeedRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatMessages, chatOpen]);

  const newestChatTs =
    chatMessages.length > 0 ? chatMessages[chatMessages.length - 1].timestamp : 0;

  useEffect(() => {
    if (!isCustomMatch || chatOpen || newestChatTs === 0) return;
    if (Date.now() - newestChatTs > CHAT_FADE_MS + 1000) return;
    const interval = window.setInterval(() => {
      setChatClockMs(Date.now());
    }, 450);
    return () => window.clearInterval(interval);
  }, [chatOpen, isCustomMatch, newestChatTs]);

  const activeSlot = hud.weaponSlots.find((s) => s.id === hud.activeWeapon.id);
  const stanceLabel =
    hud.stance === 'stand'
      ? 'Stand'
      : hud.stance === 'crouch'
        ? 'Crouch'
        : hud.stance === 'slide'
          ? 'Slide'
          : 'Sprint';
  const accuracyPct =
    hud.shotsFired > 0 ? Math.round((hud.shotsHit / hud.shotsFired) * 100) : 0;

  const now = performance.now();
  const activeKillFeed = hud.match.killFeed
    .filter((entry) => now - entry.timestamp < 4500)
    .slice(0, 5);
  const damageAge = now - hud.lastDamageTimestamp;
  const damageRecent = hud.lastDamageTimestamp > 0 && damageAge < 320;
  const latestDamage = hud.damageIndicators[hud.damageIndicators.length - 1];
  const gap = hud.isAds ? 3 : Math.min(34, hud.crosshairSpreadPx);
  const tickLen = hud.isAds ? 4 : 9;
  const reticleColor = hud.targetingEnemy ? '#ef4444' : '#f8fafc';

  const sniperScopeBlend =
    hud.activeWeapon.id === 'sniper' && hud.isAlive ? hud.adsBlend : 0;
  const showSniperOverlay =
    hud.match.phase === 'playing' &&
    sniperScopeBlend > 0.18 &&
    hud.isPointerLocked &&
    !hud.showScoreboard;
  const akRedDotBlend =
    hud.activeWeapon.id === 'ak47' && hud.isAlive ? hud.adsBlend : 0;
  const showAkRedDotOverlay =
    hud.match.phase === 'playing' &&
    akRedDotBlend > 0.28 &&
    hud.isPointerLocked &&
    !hud.showScoreboard;
  const hideHipReticle =
    (showSniperOverlay && sniperScopeBlend > 0.42) ||
    (showAkRedDotOverlay && akRedDotBlend > 0.48);
  const swayX = showSniperOverlay ? Math.sin(now * 0.003) * (hud.speed > 0.5 ? 3.2 : 0.8) : 0;
  const swayY = showSniperOverlay ? Math.cos(now * 0.0025) * (hud.speed > 0.5 ? 3.2 : 0.8) : 0;

  // Real-time 2D Minimap projection data
  const minimap = hud.minimap;
  const mapStructures = MINIMAP_LAYOUTS[minimap.mapId] ?? MINIMAP_LAYOUTS.urban;
  const playerMapPos = worldToMinimapPercent(
    minimap.playerX,
    minimap.playerZ,
    minimap.halfExtent
  );
  const playerCompassDeg = yawRadToCompassDeg(minimap.playerYawRad);
  const teammateCount = minimap.actors.filter(
    (a) => !a.pingKind && a.team === minimap.localTeam
  ).length;

  // Custom Match In-Game Chat Feed filtering (always show last 6 when typing, fade >6s otherwise)
  const visibleChatMessages = chatOpen
    ? chatMessages.slice(-6)
    : chatMessages
        .filter((m) => chatClockMs - m.timestamp < CHAT_FADE_MS)
        .slice(-4);
  const showInMatchChat =
    isCustomMatch &&
    hud.match.phase === 'playing' &&
    !hud.showScoreboard &&
    (chatOpen || visibleChatMessages.length > 0);

  const handleChatFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatDraft.trim();
    if (trimmed.length > 0) {
      onSendChat?.(trimmed, chatChannel);
    }
    setChatDraft('');
    chatInputRef.current?.blur();
    onCloseChat?.(true);
  };

  const handleChatInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setChatDraft('');
      chatInputRef.current?.blur();
      onCloseChat?.(true);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onChangeChatChannel?.(chatChannel === 'all' ? 'team' : 'all');
    }
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      {showSniperOverlay && (
        <div
          className="absolute inset-0 z-20"
          style={{
            opacity: Math.min(1, (sniperScopeBlend - 0.18) / 0.7),
            transform: `translate(${swayX}px, ${swayY}px)`,
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 34%, rgba(0,0,0,0.45) 48%, rgba(0,0,0,0.88) 62%, #000 78%)',
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative h-[min(92vw,92vh)] w-[min(92vw,92vh)]">
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-emerald-400/80" />
              <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-emerald-400/80" />
              <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
              {[28, 34, 40].map((pct) => (
                <React.Fragment key={pct}>
                  <div
                    className="absolute left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-emerald-400/90"
                    style={{ top: `${pct}%` }}
                  />
                  <div
                    className="absolute left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-emerald-400/90"
                    style={{ bottom: `${pct}%` }}
                  />
                  <div
                    className="absolute top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-emerald-400/90"
                    style={{ left: `${pct}%` }}
                  />
                  <div
                    className="absolute top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-emerald-400/90"
                    style={{ right: `${pct}%` }}
                  />
                </React.Fragment>
              ))}
            </div>
          </div>
          {sniperScopeBlend > 0.82 && (
            <div className="absolute bottom-[18%] left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 border border-emerald-500/35 bg-black/55 px-4 py-1.5 font-mono-tabular text-[11px] text-emerald-400">
              <div className="tracking-wider">
                {hud.scopeMagnification}.0X
                {hud.rangeDistanceMeters !== null ? ` · ${hud.rangeDistanceMeters}m` : ''}
              </div>
              <div className="text-[9px] text-emerald-500/70">[B] 4X / 6X / 8X</div>
            </div>
          )}
        </div>
      )}

      {/* AK-47 Reflex Red Dot ADS Reticle */}
      {showAkRedDotOverlay && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
          style={{ opacity: Math.min(1, (akRedDotBlend - 0.28) / 0.55) }}
        >
          <div className="relative flex items-center justify-center">
            <div
              className="h-12 w-12 rounded-full border border-red-400/20"
              style={{
                background:
                  'radial-gradient(circle, rgba(239,68,68,0.08) 0%, rgba(56,189,248,0.04) 68%, transparent 100%)',
              }}
            />
            <span
              className="absolute h-1.5 w-1.5 rounded-full bg-red-500"
              style={{
                boxShadow:
                  '0 0 6px 2px rgba(239, 68, 68, 0.95), 0 0 14px 4px rgba(239, 68, 68, 0.45)',
              }}
            />
            <span className="absolute h-[3px] w-[3px] rounded-full bg-rose-100" />
            {hud.rangeDistanceMeters !== null && (
              <span
                className={`absolute top-8 font-mono-tabular text-[10px] ${
                  hud.targetingEnemy ? 'text-red-400' : 'text-slate-300/75'
                }`}
              >
                {hud.rangeDistanceMeters}m
              </span>
            )}
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
            opacity: Math.max(0, 1 - damageAge / 320),
            boxShadow: 'inset 0 0 110px 28px rgba(220, 38, 38, 0.38)',
          }}
        />
      )}
      {latestDamage && now - latestDamage.timestamp < 950 && (
        <div
          className="fixed inset-0"
          style={{
            opacity: Math.max(0, 1 - (now - latestDamage.timestamp) / 950),
            background: `conic-gradient(from ${latestDamage.angleDeg - 35}deg, rgba(239,68,68,0.42) 0deg, rgba(239,68,68,0.12) 42deg, transparent 78deg 360deg)`,
            maskImage: 'radial-gradient(ellipse at center, transparent 42%, black 96%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, transparent 42%, black 96%)',
          }}
        />
      )}

      {/* Low Health Pulsing Heartbeat Vignette */}
      {hud.lowHealthPulse && hud.isAlive && (
        <div
          className="heartbeat-vignette fixed inset-0 pointer-events-none transition-opacity duration-300"
          style={{
            boxShadow: 'inset 0 0 140px 48px rgba(239, 68, 68, 0.42)',
          }}
        />
      )}

      {/* Projected Teammate Tactical Ping Markers (synchronized with 3D world icons) */}
      {hud.match.phase === 'playing' && !hud.showScoreboard && hud.pings.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {hud.pings.map((ping) => {
            const isEnemy = ping.kind === 'enemy';
            const fade = Math.min(1, Math.max(0.25, ping.remainingSec / 1.1));
            return (
              <div
                key={ping.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${ping.screenXPct}%`,
                  top: `${ping.screenYPct}%`,
                  opacity: fade,
                }}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <div
                    className={`flex items-center gap-1 border px-1.5 py-0.5 font-mono-tabular text-[10px] font-bold shadow-md shadow-black/40 backdrop-blur-sm ${
                      isEnemy
                        ? 'border-red-400/75 bg-red-950/85 text-red-200'
                        : 'border-sky-400/75 bg-slate-950/85 text-sky-200'
                    } ${!ping.onScreen ? 'ring-1 ring-white/30' : ''}`}
                  >
                    {isEnemy ? (
                      <Crosshair className="h-3 w-3 shrink-0 text-red-400" />
                    ) : (
                      <MapPin className="h-3 w-3 shrink-0 text-sky-400" />
                    )}
                    <span>{isEnemy ? 'HOSTILE' : 'PING'}</span>
                    <span className="text-white/90">{ping.distanceMeters}m</span>
                  </div>
                  <span className="max-w-24 truncate bg-black/55 px-1 font-mono-tabular text-[9px] text-slate-300">
                    {ping.senderName}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
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
      {hud.isPointerLocked && hud.isAlive && !hud.showScoreboard && !hideHipReticle && (
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

      {/* Directional Hitmarker Pulse (visible across hipfire, Red Dot ADS, and Sniper Scope) */}
      {hud.isPointerLocked && hud.isAlive && !hud.showScoreboard && hud.hitMarker && (
        <div
          key={hud.hitMarker.id}
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
        >
          {(() => {
            const isKill = hud.hitMarker.killed;
            const isHead = hud.hitMarker.zone === 'head';
            const tickColor = isKill ? '#ef4444' : isHead ? '#fbbf24' : '#f8fafc';
            const glowColor = isKill
              ? 'rgba(239, 68, 68, 0.92)'
              : isHead
                ? 'rgba(251, 191, 36, 0.88)'
                : 'rgba(248, 250, 252, 0.72)';
            const tickLength = isKill ? 12 : isHead ? 10 : 8;
            const tickThickness = isKill ? 2.5 : 2;
            const gapOffset = isKill ? 8 : 6;
            const animClass = isKill
              ? 'animate-[hitmarker-kill-pop_165ms_ease-out]'
              : 'animate-[hitmarker-pop_140ms_ease-out]';
            const armAngles = [-45, 45, 135, -135];

            return (
              <div className={`relative flex items-center justify-center ${animClass}`}>
                {armAngles.map((deg) => (
                  <span
                    key={deg}
                    className="absolute block rounded-full"
                    style={{
                      width: `${tickThickness}px`,
                      height: `${tickLength}px`,
                      backgroundColor: tickColor,
                      boxShadow: `0 0 ${isKill ? 9 : 6}px ${glowColor}`,
                      transform: `rotate(${deg}deg) translateY(-${gapOffset + tickLength / 2}px)`,
                    }}
                  />
                ))}
                {(isKill || isHead) && (
                  <span
                    className="absolute rounded-full"
                    style={{
                      width: isKill ? '5px' : '4px',
                      height: isKill ? '5px' : '4px',
                      backgroundColor: isHead ? '#fbbf24' : '#fca5a5',
                      boxShadow: `0 0 8px ${glowColor}`,
                    }}
                  />
                )}
              </div>
            );
          })()}
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
        <div className="absolute inset-0 flex items-end justify-center pb-10">
          <div className="pointer-events-auto w-full max-w-xl border border-white/20 bg-[#0b0f16]/90 px-6 py-4 backdrop-blur-md">
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

            {/* Death / Pre-Spawn Gun Switcher */}
            <div className="mt-3.5 border-t border-white/10 pt-3">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-display font-semibold tracking-wider text-slate-300">
                  NEXT SPAWN GUN · PRESS [1–5] OR CLICK
                </span>
                <span className="font-mono-tabular text-amber-300">
                  {WEAPONS[hud.queuedGunId].name} + Knife
                </span>
              </div>
              <div className="mt-2 grid grid-cols-5 gap-1.5">
                {GUN_IDS.map((gunId, idx) => {
                  const g = WEAPONS[gunId];
                  const selected = hud.queuedGunId === gunId;
                  return (
                    <button
                      key={gunId}
                      type="button"
                      onClick={() => onSelectGun?.(gunId)}
                      className={`cursor-pointer border px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                        selected
                          ? 'border-amber-400 bg-amber-400/20 text-white'
                          : 'border-white/10 bg-black/40 text-slate-300 hover:border-white/25 hover:bg-white/10'
                      }`}
                    >
                      <div className="font-mono-tabular text-[9px] font-bold text-amber-300">
                        [{idx + 1}]
                      </div>
                      <div className="truncate font-display text-[11px] font-semibold">
                        {g.shortName}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top-Center TDM Score Bug, Compass & Killstreak Notification Banner */}
      <div className="absolute top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <div className="flex items-center border border-slate-400/20 bg-slate-950/80 shadow-lg shadow-black/20 backdrop-blur-md">
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

        {showFps && (
          <div className="border border-slate-400/20 bg-slate-950/75 px-2.5 py-1 font-mono-tabular text-[10px] text-slate-300 backdrop-blur-sm">
            FPS <span className="font-semibold text-emerald-300">{hud.fps}</span>
          </div>
        )}

        {hud.killstreakBanner && (
          <div
            className="mt-1 max-w-[min(32rem,calc(100vw-2rem))] border-l-2 border-amber-400 bg-slate-950/90 px-4 py-2 text-center shadow-lg shadow-black/20 backdrop-blur-md animate-fade-in"
            style={{
              opacity: Math.min(
                1,
                Math.max(0, (4500 - (now - hud.killstreakBanner.timestamp)) / 500),
              ),
            }}
          >
            <div className="font-display text-xs font-bold tracking-widest text-amber-300">
              {hud.killstreakBanner.title}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-300">
              {hud.killstreakBanner.subtitle}
            </div>
          </div>
        )}
      </div>

      {/* Top-Right Combat Feed */}
      {activeKillFeed.length > 0 && (
        <div
          className="absolute right-4 top-28 z-10 flex w-[min(420px,calc(100vw-2rem))] flex-col items-end gap-1 md:top-4"
          role="log"
          aria-label="Recent eliminations"
          aria-live="polite"
          aria-relevant="additions"
        >
          <div className="flex w-full items-center justify-between border border-slate-400/20 bg-slate-950/80 px-3 py-1 font-mono-tabular text-[9px] font-bold tracking-widest text-slate-400 backdrop-blur-md">
            <span>COMBAT FEED</span>
            <span className="text-emerald-300/80">LIVE</span>
          </div>
          {activeKillFeed.map((entry) => {
            const age = Math.max(0, now - entry.timestamp);
            return (
              <div
                key={entry.id}
                className={`flex w-full flex-wrap items-center justify-end gap-x-1.5 gap-y-1 border border-slate-400/20 border-r-2 bg-slate-950/85 px-2.5 py-1.5 text-right text-xs shadow-md shadow-black/20 backdrop-blur-md ${
                  entry.killerTeam === 'blue' ? 'border-r-blue-400' : 'border-r-red-400'
                }`}
                style={{ opacity: Math.min(1, Math.max(0, (4500 - age) / 650)) }}
              >
                <span
                  className={`max-w-24 truncate font-semibold ${
                    entry.killerTeam === 'blue' ? 'text-blue-300' : 'text-red-300'
                  }`}
                >
                  {entry.killerName}
                </span>
                <span className="max-w-28 truncate border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono-tabular text-[10px] text-slate-200">
                  {entry.weaponName}
                </span>
                {entry.headshot && (
                  <span className="border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 font-mono-tabular text-[9px] font-bold tracking-wide text-amber-300">
                    HEADSHOT
                  </span>
                )}
                <span className="text-slate-500">→</span>
                <span
                  className={`max-w-24 truncate font-semibold ${
                    entry.victimTeam === 'blue' ? 'text-blue-300' : 'text-red-300'
                  }`}
                >
                  {entry.victimName}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Top-Left Corner Real-Time 2D Tactical Minimap + Telemetry */}
      <div className="absolute top-4 left-4 flex flex-col gap-2">
        <div className="flex items-start gap-2.5">
          {/* Real-Time 2D Minimap */}
          <div
            className="flex flex-col border border-slate-400/25 bg-[#080c12]/85 shadow-lg shadow-black/30 backdrop-blur-md"
            aria-label="Real-time 2D tactical minimap"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-2 py-0.5 font-mono-tabular text-[9px] font-bold tracking-wider">
              <span className={hud.uavActive ? 'text-sky-400' : 'text-slate-300'}>
                {hud.uavActive ? 'UAV SWEEP' : '2D MINIMAP'}
              </span>
              <span className="text-sky-300/80">{teammateCount} ALLY</span>
            </div>

            <div className="relative h-[132px] w-[132px] shrink-0 overflow-hidden bg-[#06090e]">
              <svg viewBox="0 0 100 100" className="h-full w-full">
                {/* Arena perimeter & North/South spawn sectors */}
                <rect x="4" y="4" width="92" height="92" fill="rgba(15,23,42,0.55)" stroke="rgba(148,163,184,0.28)" strokeWidth="0.9" />
                <rect x="4" y="4" width="92" height="16" fill="rgba(239,68,68,0.10)" />
                <rect x="4" y="80" width="92" height="16" fill="rgba(59,130,246,0.12)" />

                {/* Tactical sector grid */}
                <line x1="50" y1="4" x2="50" y2="96" stroke="rgba(255,255,255,0.07)" strokeWidth="0.6" strokeDasharray="2 2" />
                <line x1="4" y1="50" x2="96" y2="50" stroke="rgba(255,255,255,0.07)" strokeWidth="0.6" strokeDasharray="2 2" />
                <text x="50" y="9.5" textAnchor="middle" fill="rgba(251,191,36,0.75)" fontSize="4.6" fontFamily="monospace" fontWeight="bold">
                  N
                </text>

                {/* Map geometry obstacles */}
                {mapStructures.map((s, idx) => {
                  const pos = worldToMinimapPercent(s.x, s.z, minimap.halfExtent);
                  const size = worldSizeToMinimapPercent(s.width, s.depth, minimap.halfExtent);
                  const fill =
                    s.kind === 'building'
                      ? 'rgba(148,163,184,0.38)'
                      : s.kind === 'vehicle'
                        ? 'rgba(100,116,139,0.45)'
                        : 'rgba(203,213,225,0.24)';
                  return (
                    <rect
                      key={`${minimap.mapId}_${idx}`}
                      x={pos.xPct - size.wPct / 2}
                      y={pos.yPct - size.hPct / 2}
                      width={size.wPct}
                      height={size.hPct}
                      fill={fill}
                      stroke="rgba(255,255,255,0.16)"
                      strokeWidth="0.4"
                    />
                  );
                })}

                {/* UAV pulse ring centered on local player */}
                {hud.uavActive && (
                  <circle
                    cx={playerMapPos.xPct}
                    cy={playerMapPos.yPct}
                    r={4 + hud.uavPulseProgress * 46}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="1.2"
                    opacity={Math.max(0, 1 - hud.uavPulseProgress)}
                  />
                )}

                {/* Teammates, revealed enemies, and tactical pings */}
                {minimap.actors.map((actor) => {
                  const pt = worldToMinimapPercent(actor.x, actor.z, minimap.halfExtent);
                  if (actor.pingKind) {
                    const isEnemyPing = actor.pingKind === 'enemy';
                    return (
                      <polygon
                        key={actor.id}
                        points={`${pt.xPct},${pt.yPct - 3.4} ${pt.xPct + 3.4},${pt.yPct} ${pt.xPct},${pt.yPct + 3.4} ${pt.xPct - 3.4},${pt.yPct}`}
                        fill={isEnemyPing ? '#f87171' : '#38bdf8'}
                        stroke="#090d13"
                        strokeWidth="0.7"
                      />
                    );
                  }

                  const isFriend = actor.team === minimap.localTeam;
                  if (isFriend) {
                    const deg = yawRadToCompassDeg(actor.yawRad);
                    return (
                      <g
                        key={actor.id}
                        transform={`translate(${pt.xPct} ${pt.yPct}) rotate(${deg})`}
                      >
                        <circle
                          cx="0"
                          cy="0"
                          r="2.6"
                          fill="#38bdf8"
                          stroke="#090d13"
                          strokeWidth="0.7"
                        />
                        <line
                          x1="0"
                          y1="-2.2"
                          x2="0"
                          y2="-5.0"
                          stroke="#bae6fd"
                          strokeWidth="1.1"
                          strokeLinecap="round"
                        />
                      </g>
                    );
                  }

                  return (
                    <circle
                      key={actor.id}
                      cx={pt.xPct}
                      cy={pt.yPct}
                      r="2.6"
                      fill="#ef4444"
                      stroke="#090d13"
                      strokeWidth="0.7"
                    />
                  );
                })}

                {/* Local player position & live orientation FOV wedge */}
                <g
                  transform={`translate(${playerMapPos.xPct} ${playerMapPos.yPct}) rotate(${playerCompassDeg})`}
                >
                  <polygon
                    points="0,0 -9,-16 9,-16"
                    fill="rgba(251,191,36,0.18)"
                  />
                  <polygon
                    points="0,-4.6 3.5,3.4 0,1.5 -3.5,3.4"
                    fill="#fbbf24"
                    stroke="#090d13"
                    strokeWidth="0.7"
                  />
                </g>
              </svg>
            </div>

            <div className="flex items-center justify-between border-t border-white/10 px-2 py-0.5 font-mono-tabular text-[9px] text-slate-400">
              <span>
                X {minimap.playerX >= 0 ? '+' : ''}
                {Math.round(minimap.playerX)}
              </span>
              <span>
                Z {minimap.playerZ >= 0 ? '+' : ''}
                {Math.round(minimap.playerZ)}
              </span>
            </div>
          </div>

          {/* Operator Session Telemetry */}
          <div className="flex flex-col gap-1.5">
            <div className="border border-slate-400/20 bg-slate-950/75 px-3 py-1.5 shadow-md shadow-black/20 backdrop-blur-md">
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

            <div className="border border-slate-400/20 bg-slate-950/75 px-3 py-1 font-mono-tabular text-[11px] text-slate-300 shadow-md shadow-black/20 backdrop-blur-md">
              <span className="text-slate-400">LV {hud.rankLevel}</span>{' '}
              <span className="font-semibold text-white">{hud.rankTitle}</span>
              <span className="mx-1.5 text-slate-600">|</span>
              <span className="text-amber-400">Streak {hud.currentStreak}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Match In-Game Tactical Chat Overlay */}
      {showInMatchChat && (
        <div
          className={`absolute bottom-28 left-4 z-30 flex w-72 flex-col gap-1.5 sm:w-80 ${
            chatOpen ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
          role="region"
          aria-label="In-match tactical chat"
        >
          {visibleChatMessages.length > 0 && (
            <div
              ref={chatFeedRef}
              className="max-h-36 overflow-y-auto border border-slate-400/20 bg-slate-950/80 px-2.5 py-2 shadow-lg shadow-black/30 backdrop-blur-md"
            >
              <div className="space-y-1 text-[11px]">
                {visibleChatMessages.map((msg) => {
                  const ageMs = Math.max(0, chatClockMs - msg.timestamp);
                  const opacity = chatOpen
                    ? 1
                    : Math.max(0, Math.min(1, (CHAT_FADE_MS - ageMs) / 900));
                  const isSys = Boolean(msg.isSystem || msg.senderTeam === 'system');
                  const nameColor = isSys
                    ? 'text-amber-300'
                    : msg.senderTeam === 'blue'
                      ? 'text-blue-400'
                      : 'text-red-400';
                  const tagLabel = isSys
                    ? '[SYS]'
                    : msg.channel === 'team'
                      ? '[TEAM]'
                      : '[ALL]';
                  const tagColor = isSys
                    ? 'text-amber-400/80'
                    : msg.channel === 'team'
                      ? 'text-sky-400'
                      : 'text-slate-400';

                  return (
                    <div
                      key={msg.id}
                      className="break-words leading-snug"
                      style={{ opacity }}
                    >
                      <span className={`mr-1 font-mono-tabular text-[10px] font-bold ${tagColor}`}>
                        {tagLabel}
                      </span>
                      {!isSys && (
                        <span className={`mr-1 font-semibold ${nameColor}`}>
                          {msg.senderName}:
                        </span>
                      )}
                      <span className={isSys ? 'text-amber-200/90' : 'text-slate-100'}>
                        {msg.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {chatOpen && (
            <form
              onSubmit={handleChatFormSubmit}
              className="flex items-center gap-1 border border-amber-400/45 bg-slate-950/92 p-1.5 shadow-xl shadow-black/40 backdrop-blur-md"
            >
              <button
                type="button"
                onClick={() => onChangeChatChannel?.(chatChannel === 'all' ? 'team' : 'all')}
                title="Switch channel (Tab)"
                className={`shrink-0 cursor-pointer border px-1.5 py-1 font-mono-tabular text-[10px] font-bold ${
                  chatChannel === 'team'
                    ? 'border-sky-400/50 bg-sky-500/20 text-sky-200'
                    : 'border-amber-400/50 bg-amber-400/20 text-amber-200'
                }`}
              >
                [{chatChannel.toUpperCase()}]
              </button>
              <input
                ref={chatInputRef}
                type="text"
                maxLength={CHAT_MAX_LENGTH}
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                onKeyDown={handleChatInputKeyDown}
                placeholder="Type message... (Enter send / Esc cancel)"
                className="min-w-0 flex-1 bg-transparent px-1.5 py-1 text-xs text-white outline-none placeholder:text-slate-500"
              />
              <button
                type="submit"
                aria-label="Send message"
                className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center bg-amber-500/25 text-amber-200 hover:bg-amber-500/40"
              >
                <Send className="h-3 w-3" />
              </button>
            </form>
          )}
        </div>
      )}

      {isCustomMatch &&
        hud.match.phase === 'playing' &&
        !chatOpen &&
        hud.isAlive &&
        !hud.showScoreboard &&
        visibleChatMessages.length === 0 && (
          <div className="absolute bottom-24 left-4 flex items-center gap-1.5 border border-white/10 bg-black/45 px-2 py-0.5 font-mono-tabular text-[10px] text-slate-400">
            <MessageSquare className="h-3 w-3 text-slate-400" />
            <span>[Enter / T] All · [Y] Team Chat</span>
          </div>
        )}

      {/* Bottom-Left Player Vitals & Stance */}
      <div className="absolute bottom-4 left-4 border border-slate-400/20 bg-slate-950/80 px-4 py-3 shadow-lg shadow-black/20 backdrop-blur-md">
        <div className="flex items-baseline justify-between gap-6">
          <span
            className={`font-mono-tabular font-display text-2xl font-bold ${
              hud.health <= 30 ? 'text-red-400' : hud.overdriveActive ? 'text-amber-300' : 'text-white'
            }`}
          >
            {hud.health}
          </span>
          <div className="flex items-center gap-2">
            {hud.overdriveActive && (
              <span className="font-mono-tabular text-[10px] font-semibold text-amber-300">
                OVERDRIVE {hud.overdriveRemainingSec}s
              </span>
            )}
            <span
              className={`border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-semibold tracking-wide ${
                hud.stance === 'slide'
                  ? 'text-amber-300'
                  : hud.stance === 'crouch'
                    ? 'text-sky-300'
                    : 'text-slate-200'
              }`}
            >
              {stanceLabel}
              {!hud.isGrounded ? ' · Airborne' : ''}
            </span>
          </div>
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
                className={`border px-2.5 py-1 font-mono-tabular text-[11px] shadow-md shadow-black/20 backdrop-blur-sm ${stateClass}`}
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
        <div className="border border-slate-400/20 bg-slate-950/80 px-4 py-3 shadow-lg shadow-black/20 backdrop-blur-md">
          <div className="flex items-baseline justify-between gap-6">
            <div>
              <div className="font-display text-sm font-semibold text-white">
                {hud.activeWeapon.name}
              </div>
              <div className="text-xs text-slate-400">
                {hud.activeWeapon.isMelee
                  ? `Melee · Charm: ${KNIFE_CHARMS[hud.knifeCharmId].name}`
                  : `${hud.activeWeapon.category} · ${
                      hud.activeWeapon.fireMode === 'auto' ? 'Full Auto' : 'Semi-Auto'
                    }`}
              </div>
            </div>
            {hud.activeWeapon.isMelee ? (
              <div className="flex items-baseline gap-1.5 font-mono-tabular">
                <span className="font-display text-2xl font-bold text-emerald-300">∞</span>
                <span className="text-[11px] font-semibold tracking-wider text-slate-400">
                  MELEE
                </span>
              </div>
            ) : (
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
                  {String(activeSlot?.reserveAmmo ?? 0).padStart(2, '0')}
                </span>
              </div>
            )}
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/10 pt-2 text-xs">
            <div className="flex items-center gap-2">
              <div
                className={`border px-2 py-0.5 font-mono-tabular ${
                  hud.activeWeapon.slot === 1
                    ? 'border-amber-400/40 bg-amber-400/20 text-amber-300'
                    : 'border-white/10 text-slate-400'
                }`}
              >
                [{formatKeyCode(keybindings.slotGun)}] {WEAPONS[hud.equippedGunId].shortName}
              </div>
              <div
                className={`border px-2 py-0.5 font-mono-tabular ${
                  hud.activeWeapon.slot === 2
                    ? 'border-amber-400/40 bg-amber-400/20 text-amber-300'
                    : 'border-white/10 text-slate-400'
                }`}
              >
                [{formatKeyCode(keybindings.slotKnife)}] Knife · [{formatKeyCode(keybindings.quickMelee)}]
              </div>
            </div>

            {hud.queuedGunId !== hud.equippedGunId && (
              <span className="border border-sky-400/35 bg-sky-500/15 px-1.5 py-0.5 font-mono-tabular text-[10px] font-semibold text-sky-300">
                NEXT: {WEAPONS[hud.queuedGunId].shortName}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* First-spawn Quick Controls */}
      {hud.showOnboarding &&
        !onboardingDismissed &&
        !chatOpen &&
        hud.isAlive &&
        hud.match.phase === 'playing' && (
          <div
            className={`pointer-events-auto absolute bottom-24 left-1/2 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 border border-slate-400/25 bg-slate-950/90 p-2.5 shadow-2xl shadow-black/30 backdrop-blur-md transition-[opacity,transform] duration-300 sm:p-3 ${
              onboardingVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
            }`}
            role="region"
            aria-label="First-spawn control hints"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-1 pb-2">
              <span className="font-display text-[10px] font-bold tracking-widest text-slate-300">
                FIELD CONTROLS
              </span>
              <button
                type="button"
                aria-label="Dismiss control hints"
                onClick={() => {
                  setOnboardingVisible(false);
                  setOnboardingDismissed(true);
                }}
                className="grid h-6 w-6 cursor-pointer place-items-center text-slate-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-5">
              {[
                {
                  key: `${formatKeyCode(keybindings.slotGun)} / ${formatKeyCode(keybindings.slotKnife)}`,
                  label: 'Gun & Knife',
                },
                { key: formatKeyCode(keybindings.quickMelee), label: 'Quick Knife' },
                {
                  key: `${formatKeyCode(keybindings.ping)} / MMB`,
                  label: 'Team Ping',
                },
                {
                  key: `${formatKeyCode(keybindings.sprint)}+${formatKeyCode(keybindings.crouchToggle)}`,
                  label: 'Slide',
                },
                {
                  key: `${formatKeyCode(keybindings.streakUav)}/${formatKeyCode(keybindings.streakBarrage)}/${formatKeyCode(keybindings.streakOverdrive)}`,
                  label: 'Streaks',
                },
              ].map((hint) => (
                <div
                  key={hint.key}
                  className="flex min-w-0 items-center gap-2 border border-white/[0.07] bg-white/[0.03] px-2 py-1.5"
                >
                  <kbd className="shrink-0 border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 font-mono-tabular text-[10px] font-semibold text-amber-300">
                    [{hint.key}]
                  </kbd>
                  <span className="truncate text-[10px] text-slate-300">{hint.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-center font-mono-tabular text-[9px] text-slate-500">
              Fades after 10 seconds · Move or aim to dismiss
            </div>
          </div>
        )}

      {/* Live Tab Scoreboard */}
      {hud.showScoreboard && <ScoreboardOverlay match={hud.match} />}
    </div>
  );
};
