import React, { useEffect, useRef, useState } from 'react';
import { Bomb, Crosshair, MapPin, MessageSquare, Send, X } from 'lucide-react';
import { getAmmoDisplayState } from '../game/ammoDisplay';
import {
  MINIMAP_LAYOUTS,
  worldSizeToMinimapPercent,
  worldToMinimapPercent,
  yawRadToCompassDeg,
} from '../game/minimap';
import {
  CrosshairSettingsMap,
  GunId,
  HudState,
  KNIFE_CHARMS,
  KnifeCharmId,
  resolveWeaponIdFromName,
  TeamColorsConfig,
  WEAPONS,
} from '../game/types';
import {
  CHAT_FADE_MS,
  CHAT_MAX_LENGTH,
  ChatChannel,
  ChatMessage,
} from '../multiplayer/chat';
import {
  computeReticleGeometry,
  getCrosshairConfigForWeapon,
} from '../settings/crosshairConfig';
import {
  DEFAULT_KEYBINDINGS,
  formatKeyCode,
  KeybindingsConfig,
} from '../settings/keybindings';
import { hexToRgba, resolveSideColors } from '../settings/teamColorsConfig';
import { DeathScreen } from './DeathScreen';
import { formatMatchTime, ScoreboardOverlay } from './ScoreboardOverlay';
import { KillFeedWeaponIcon, WeaponPreview } from './WeaponPreview';

interface GameHUDProps {
  hud: HudState;
  showFps?: boolean;
  keybindings?: KeybindingsConfig;
  crosshairSettings?: Partial<CrosshairSettingsMap>;
  teamColors?: Partial<TeamColorsConfig>;
  onSelectGun?: (id: GunId) => void;
  onSelectKnifeCharm?: (id: KnifeCharmId) => void;
  onRespawn?: () => void;
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
  crosshairSettings,
  teamColors,
  onSelectGun,
  onSelectKnifeCharm,
  onRespawn,
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
  const ammoInMag = activeSlot?.ammoInMag ?? 0;
  const reserveAmmo = activeSlot?.reserveAmmo ?? 0;
  const ammoDisplay = getAmmoDisplayState({
    ammoInMag,
    reserveAmmo,
    magSize: hud.activeWeapon.magSize,
    isMelee: hud.activeWeapon.isMelee,
    isReloading: hud.isReloading,
    reloadKeyLabel: formatKeyCode(keybindings.reload),
  });
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
  const mode = hud.gameMode ?? hud.match.mode ?? 'tdm';
  const bombState = hud.match.bombState ?? null;
  const localParticipant = hud.match.participants.find((p) => p.isPlayer);
  const localParticipantId = localParticipant?.id ?? 'player';
  const localParticipantName = localParticipant?.name;
  const effectiveChatChannel: ChatChannel = mode === 'ffa' ? 'all' : chatChannel;
  const sideColors = resolveSideColors(teamColors, hud.localTeam, mode);

  const activeCrosshair = getCrosshairConfigForWeapon(
    crosshairSettings,
    hud.activeWeapon.id
  );
  const reticle = computeReticleGeometry(
    activeCrosshair,
    hud.crosshairSpreadPx,
    hud.isAds,
    hud.targetingEnemy,
    sideColors.enemyHex
  );
  const gap = reticle.gap;
  const tickLen = reticle.tickLen;
  const reticleColor = reticle.color;

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
  const teammateCount =
    mode === 'ffa'
      ? 0
      : minimap.actors.filter((a) => !a.pingKind && a.kind === 'teammate').length;

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
      onSendChat?.(trimmed, effectiveChatChannel);
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
      if (mode !== 'ffa') {
        onChangeChatChannel?.(chatChannel === 'all' ? 'team' : 'all');
      }
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
                  hud.targetingEnemy ? '' : 'text-slate-300/75'
                }`}
                style={hud.targetingEnemy ? { color: sideColors.enemyHex } : undefined}
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

      {/* Projected 3D Bomb Site & Defuse Markers */}
      {mode === 'bomb' &&
        hud.match.phase === 'playing' &&
        !hud.showScoreboard &&
        hud.bombSites.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            {hud.bombSites.map((site) => (
              <div
                key={site.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${site.screenXPct}%`,
                  top: `${site.screenYPct}%`,
                }}
              >
                <div
                  className={`flex items-center gap-1 border px-1.5 py-0.5 font-mono-tabular text-[10px] font-bold shadow-md shadow-black/40 backdrop-blur-sm ${
                    site.isPlantedHere
                      ? 'border-red-400 bg-red-950/90 text-red-200'
                      : 'border-amber-400/75 bg-slate-950/85 text-amber-200'
                  } ${!site.onScreen ? 'opacity-80 ring-1 ring-white/25' : ''}`}
                >
                  <Bomb className="h-3 w-3 shrink-0" />
                  <span>{site.label}</span>
                  <span className="text-white/90">{site.distanceMeters}m</span>
                </div>
              </div>
            ))}
          </div>
        )}

      {/* Projected Teammate Tactical Ping Markers (synchronized with 3D world icons) */}
      {hud.match.phase === 'playing' && !hud.showScoreboard && hud.pings.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {hud.pings.map((ping) => {
            const isEnemy = ping.kind === 'enemy';
            const pingColor = isEnemy ? sideColors.enemyHex : sideColors.allyHex;
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
                      !ping.onScreen ? 'ring-1 ring-white/30' : ''
                    }`}
                    style={{
                      borderColor: hexToRgba(pingColor, 0.78),
                      backgroundColor: hexToRgba(pingColor, 0.2),
                      color: '#f8fafc',
                    }}
                  >
                    {isEnemy ? (
                      <Crosshair className="h-3 w-3 shrink-0" style={{ color: pingColor }} />
                    ) : (
                      <MapPin className="h-3 w-3 shrink-0" style={{ color: pingColor }} />
                    )}
                    <span style={{ color: pingColor }}>{isEnemy ? 'HOSTILE' : 'PING'}</span>
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

      {/* Dynamic / Static Per-Weapon Center Reticle (hidden when scoped) */}
      {hud.isPointerLocked && hud.isAlive && !hud.showScoreboard && !hideHipReticle && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          data-hud-reticle={hud.activeWeapon.id}
          data-reticle-style={reticle.style}
          data-reticle-gap={gap}
          data-reticle-size={tickLen}
          data-reticle-color={reticleColor}
        >
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
                    hud.targetingEnemy ? '' : 'text-slate-300/75'
                  }`}
                  style={hud.targetingEnemy ? { color: sideColors.enemyHex } : undefined}
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

      {/* Bomb Plant / Defuse Hold [E] Prompt */}
      {hud.isAlive &&
        hud.match.phase === 'playing' &&
        !hud.showScoreboard &&
        hud.bombInteractPrompt && (
          <div className="pointer-events-none absolute bottom-32 left-1/2 z-20 w-72 -translate-x-1/2 border border-amber-400/55 bg-slate-950/90 px-4 py-2.5 shadow-xl shadow-black/40 backdrop-blur-md">
            <div className="flex items-center justify-between gap-2 font-mono-tabular text-[11px] font-bold">
              <span className="flex items-center gap-1.5 text-amber-300">
                <Bomb className="h-3.5 w-3.5" />
                {hud.bombInteractPrompt.action === 'plant'
                  ? `HOLD [E] TO PLANT SITE ${hud.bombInteractPrompt.siteId}`
                  : 'HOLD [E] TO DEFUSE BOMB'}
              </span>
              <span className="text-white">
                {hud.bombInteractPrompt.remainingSec.toFixed(1)}s
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full bg-white/15">
              <div
                className={`h-full transition-[width] duration-75 ${
                  hud.bombInteractPrompt.action === 'plant' ? 'bg-amber-400' : 'bg-emerald-400'
                }`}
                style={{
                  width: `${Math.max(4, Math.min(100, Math.round(hud.bombInteractPrompt.progress * 100)))}%`,
                }}
              />
            </div>
          </div>
        )}

      {/* Interactive Death / Respawn Screen with Visual Gun Switcher */}
      {!hud.isAlive && hud.match.phase === 'playing' && !hud.showScoreboard && (
        <DeathScreen
          hud={hud}
          chatOpen={chatOpen}
          teamColors={teamColors}
          onSelectGun={(gunId) => onSelectGun?.(gunId)}
          onSelectKnifeCharm={onSelectKnifeCharm}
          onRespawn={() => onRespawn?.()}
        />
      )}

      {/* Top-Center Mode Score Bug, Compass & Killstreak Notification Banner */}
      <div className="absolute top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
        {mode === 'ffa' ? (
          <div className="flex items-center border border-slate-400/20 bg-slate-950/80 shadow-lg shadow-black/20 backdrop-blur-md">
            <div className="flex items-center gap-2 border-r border-white/10 px-4 py-1.5">
              <span className="text-[11px] font-medium text-amber-300">RANK</span>
              <span className="font-mono-tabular font-display text-xl font-bold text-white">
                #{hud.ffaRank ?? 1}
              </span>
              <span className="font-mono-tabular text-xs text-slate-400">{hud.eliminations}K</span>
            </div>

            <div className="px-4 py-1 text-center">
              <div className="font-mono-tabular font-display text-base font-bold text-amber-400">
                {formatMatchTime(hud.match.timeRemainingSec)}
              </div>
              <div className="font-mono-tabular text-[10px] text-slate-400">
                FFA · Limit {hud.match.killLimit}
              </div>
            </div>

            <div className="flex items-center gap-2 border-l border-white/10 px-4 py-1.5">
              <span className="max-w-24 truncate font-display text-xs font-semibold text-slate-200">
                {hud.ffaLeaderName ?? '—'}
              </span>
              <span className="font-mono-tabular font-display text-xl font-bold text-amber-300">
                {hud.ffaLeaderKills}
              </span>
              <span className="text-[10px] font-medium text-slate-400">LDR</span>
            </div>
          </div>
        ) : mode === 'bomb' ? (
          <div className="flex items-center border border-slate-400/20 bg-slate-950/80 shadow-lg shadow-black/20 backdrop-blur-md">
            <div className="flex items-center gap-2.5 border-r border-white/10 px-4 py-1.5">
              <span className="text-[11px] font-medium" style={{ color: sideColors.blueHex }}>
                ATK
              </span>
              <span className="font-mono-tabular font-display text-xl font-bold text-white">
                {hud.match.blueScore}
              </span>
            </div>

            <div className="px-4 py-1 text-center">
              {bombState?.phase === 'planted' ? (
                <>
                  <div className="animate-pulse font-mono-tabular font-display text-base font-bold text-red-400">
                    DETONATE {Math.ceil(bombState.detonateRemainingSec)}s
                  </div>
                  <div className="font-mono-tabular text-[10px] font-semibold text-red-300">
                    SITE {bombState.siteId} ARMED
                  </div>
                </>
              ) : (
                <>
                  <div className="font-mono-tabular font-display text-base font-bold text-amber-400">
                    {formatMatchTime(hud.match.timeRemainingSec)}
                  </div>
                  <div className="font-mono-tabular text-[10px] text-slate-400">
                    RND {hud.match.roundNumber} · 1ST TO {hud.match.roundsToWin}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2.5 border-l border-white/10 px-4 py-1.5">
              <span className="font-mono-tabular font-display text-xl font-bold text-white">
                {hud.match.redScore}
              </span>
              <span className="text-[11px] font-medium" style={{ color: sideColors.redHex }}>
                DEF
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center border border-slate-400/20 bg-slate-950/80 shadow-lg shadow-black/20 backdrop-blur-md">
            <div className="flex items-center gap-2.5 border-r border-white/10 px-4 py-1.5">
              <span className="text-[11px] font-medium" style={{ color: sideColors.blueHex }}>
                BLUE
              </span>
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
              <span className="text-[11px] font-medium" style={{ color: sideColors.redHex }}>
                RED
              </span>
            </div>
          </div>
        )}

        <div className="border border-white/10 bg-black/45 px-3 py-0.5 font-mono-tabular text-[11px] text-slate-300">
          <span className="font-semibold text-amber-400">{getCardinalLabel(hud.headingDeg)}</span>{' '}
          <span className="text-slate-500">/</span> {String(hud.headingDeg).padStart(3, '0')}°
        </div>

        {mode === 'bomb' && bombState && (
          <div
            className={`border px-3 py-1 font-mono-tabular text-[10px] font-bold tracking-wider shadow-md backdrop-blur-sm ${
              bombState.phase === 'round_end'
                ? ''
                : bombState.phase === 'planted'
                  ? 'border-red-400/60 bg-red-950/85 text-red-200'
                  : bombState.carrierId === localParticipantId
                    ? 'border-amber-400/65 bg-amber-500/20 text-amber-200'
                    : 'border-white/15 bg-slate-950/75 text-slate-300'
            }`}
            style={
              bombState.phase === 'round_end'
                ? (() => {
                    const winnerHex =
                      bombState.roundWinner === 'blue' ? sideColors.blueHex : sideColors.redHex;
                    return {
                      borderColor: hexToRgba(winnerHex, 0.65),
                      backgroundColor: hexToRgba(winnerHex, 0.22),
                      color: '#f8fafc',
                    };
                  })()
                : undefined
            }
          >
            {bombState.phase === 'round_end'
              ? `${bombState.roundWinner === 'blue' ? 'ATTACKERS WIN ROUND' : 'DEFENDERS WIN ROUND'} · ${bombState.roundEndReason ?? ''}`
              : bombState.phase === 'planted'
                ? `BOMB PLANTED AT SITE ${bombState.siteId} · ${bombState.detonateRemainingSec.toFixed(1)}s`
                : bombState.carrierId === localParticipantId
                  ? 'CARRYING BOMB — HOLD [E] AT SITE A OR B TO PLANT'
                  : hud.localTeam === 'blue'
                    ? `BOMB CARRIER: ${bombState.carrierName ?? 'Unassigned'}`
                    : 'DEFEND SITES A & B'}
          </div>
        )}

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

      {/* Top-Right Kill Feed Overlay */}
      {!hud.showScoreboard && activeKillFeed.length > 0 && (
        <div
          className="absolute right-4 top-28 z-10 flex w-[min(420px,calc(100vw-2rem))] flex-col items-end gap-1.5 md:top-4"
          data-killfeed-overlay="true"
          role="log"
          aria-label="Recent eliminations"
          aria-live="polite"
          aria-relevant="additions"
        >
          {activeKillFeed.map((entry) => {
            const age = Math.max(0, now - entry.timestamp);
            const killerHex =
              mode === 'ffa'
                ? localParticipantName && entry.killerName === localParticipantName
                  ? sideColors.allyHex
                  : sideColors.enemyHex
                : entry.killerTeam === 'blue'
                  ? sideColors.blueHex
                  : sideColors.redHex;
            const victimHex =
              mode === 'ffa'
                ? localParticipantName && entry.victimName === localParticipantName
                  ? sideColors.allyHex
                  : sideColors.enemyHex
                : entry.victimTeam === 'blue'
                  ? sideColors.blueHex
                  : sideColors.redHex;
            const isLocalInvolved = Boolean(
              localParticipantName &&
                (entry.killerName === localParticipantName ||
                  entry.victimName === localParticipantName)
            );
            const resolvedWeaponId =
              entry.weaponId ?? resolveWeaponIdFromName(entry.weaponName);

            return (
              <div
                key={entry.id}
                data-killfeed-entry={entry.id}
                className={`flex max-w-full items-center justify-end gap-2 border px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md shadow-black/25 backdrop-blur-md transition-opacity duration-150 ${
                  isLocalInvolved
                    ? 'border-amber-400/55 bg-slate-900/90'
                    : 'border-white/15 bg-slate-950/85'
                }`}
                style={{
                  opacity: Math.min(1, Math.max(0, (4500 - age) / 650)),
                }}
              >
                <span
                  data-killfeed-killer={entry.killerName}
                  className="max-w-28 truncate font-semibold"
                  style={{ color: killerHex }}
                >
                  {entry.killerName}
                </span>

                <span
                  data-killfeed-weapon={resolvedWeaponId ?? 'ordnance'}
                  title={entry.weaponName}
                  className="inline-flex shrink-0 items-center gap-1 border border-white/10 bg-white/[0.04] px-1.5 py-0.5"
                >
                  <KillFeedWeaponIcon
                    weaponName={entry.weaponName}
                    weaponId={entry.weaponId}
                    className="h-4 w-12 shrink-0"
                  />
                  <span className="sr-only">{entry.weaponName}</span>
                  {entry.headshot && (
                    <span
                      className="inline-flex items-center gap-0.5 border-l border-white/10 pl-1 font-mono-tabular text-[9px] font-bold tracking-wide text-amber-300"
                      title="Headshot elimination"
                    >
                      <Crosshair className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                      HS
                    </span>
                  )}
                </span>

                <span
                  data-killfeed-victim={entry.victimName}
                  className="max-w-28 truncate font-semibold"
                  style={{ color: victimHex }}
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
            data-ally-color={sideColors.allyHex}
            data-enemy-color={sideColors.enemyHex}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-2 py-0.5 font-mono-tabular text-[9px] font-bold tracking-wider">
              <span
                className={hud.uavActive ? '' : 'text-slate-300'}
                style={hud.uavActive ? { color: sideColors.allyHex } : undefined}
              >
                {hud.uavActive ? 'UAV SWEEP' : '2D MINIMAP'}
              </span>
              <span
                className={mode === 'ffa' ? 'text-amber-300/85' : ''}
                style={mode !== 'ffa' ? { color: sideColors.allyHex } : undefined}
              >
                {mode === 'ffa' ? 'FREE-FOR-ALL' : `${teammateCount} ALLY`}
              </span>
            </div>

            <div className="relative h-[132px] w-[132px] shrink-0 overflow-hidden bg-[#06090e]">
              <svg viewBox="0 0 100 100" className="h-full w-full">
                {/* Arena perimeter & North/South spawn sectors */}
                <rect x="4" y="4" width="92" height="92" fill="rgba(15,23,42,0.55)" stroke="rgba(148,163,184,0.28)" strokeWidth="0.9" />
                <rect x="4" y="4" width="92" height="16" fill={hexToRgba(sideColors.redHex, 0.14)} />
                <rect x="4" y="80" width="92" height="16" fill={hexToRgba(sideColors.blueHex, 0.14)} />

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
                    stroke={sideColors.allyHex}
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
                        fill={isEnemyPing ? sideColors.enemyHex : sideColors.allyHex}
                        stroke="#090d13"
                        strokeWidth="0.7"
                      />
                    );
                  }

                  const isFriend = mode !== 'ffa' && actor.kind === 'teammate';
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
                          fill={sideColors.allyHex}
                          stroke="#090d13"
                          strokeWidth="0.7"
                        />
                        <line
                          x1="0"
                          y1="-2.2"
                          x2="0"
                          y2="-5.0"
                          stroke="#f8fafc"
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
                      fill={sideColors.enemyHex}
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
                  const nameHex = isSys
                    ? undefined
                    : msg.senderTeam === 'blue'
                      ? sideColors.blueHex
                      : sideColors.redHex;
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
                        <span
                          className="mr-1 font-semibold"
                          style={nameHex ? { color: nameHex } : undefined}
                        >
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
                disabled={mode === 'ffa'}
                onClick={() => {
                  if (mode !== 'ffa') {
                    onChangeChatChannel?.(chatChannel === 'all' ? 'team' : 'all');
                  }
                }}
                title={mode === 'ffa' ? 'All chat only in Free-For-All' : 'Switch channel (Tab)'}
                className={`shrink-0 border px-1.5 py-1 font-mono-tabular text-[10px] font-bold ${
                  mode === 'ffa' ? 'cursor-default opacity-80' : 'cursor-pointer'
                } ${
                  effectiveChatChannel === 'team'
                    ? 'border-sky-400/50 bg-sky-500/20 text-sky-200'
                    : 'border-amber-400/50 bg-amber-400/20 text-amber-200'
                }`}
              >
                [{effectiveChatChannel.toUpperCase()}]
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
            <span>
              {mode === 'ffa' ? '[Enter / T] All Chat' : '[Enter / T] All · [Y] Team Chat'}
            </span>
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

        {/* Weapon & Dynamic Ammo Card */}
        <div
          data-weapon-hud-card={hud.activeWeapon.id}
          data-ammo-state={ammoDisplay.level}
          className={`border px-4 py-3 shadow-lg shadow-black/20 backdrop-blur-md transition-colors duration-150 ${ammoDisplay.cardBorderClass}`}
        >
          <div className="flex items-center justify-between gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-display text-sm font-semibold text-white">
                  {hud.activeWeapon.name}
                </span>
                {ammoDisplay.statusLabel && (
                  <span
                    data-ammo-status-label="true"
                    className={`shrink-0 font-mono-tabular text-[10px] font-bold tracking-wider ${ammoDisplay.statusTextColorClass}`}
                  >
                    {ammoDisplay.statusLabel}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400">
                {hud.activeWeapon.isMelee
                  ? `Melee · Charm: ${KNIFE_CHARMS[hud.knifeCharmId].name}`
                  : `${hud.activeWeapon.category} · ${
                      hud.activeWeapon.fireMode === 'auto' ? 'Full Auto' : 'Semi-Auto'
                    }`}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden border border-white/10 bg-black/40 px-2 py-0.5 sm:block">
                <WeaponPreview
                  weaponId={hud.activeWeapon.id}
                  charmId={hud.knifeCharmId}
                  variant="compact"
                  className="h-9 w-24"
                />
              </div>
              {hud.activeWeapon.isMelee ? (
                <div
                  data-ammo-counter="melee"
                  className="flex items-baseline gap-1.5 font-mono-tabular"
                >
                  <span className={`font-display text-2xl font-bold ${ammoDisplay.magTextColorClass}`}>
                    ∞
                  </span>
                  <span className="text-[11px] font-semibold tracking-wider text-slate-400">
                    MELEE
                  </span>
                </div>
              ) : (
                <div
                  data-ammo-counter={ammoDisplay.level}
                  className="flex items-baseline gap-1.5 font-mono-tabular"
                >
                  <span
                    data-ammo-mag="true"
                    className={`font-display text-3xl font-bold leading-none transition-colors duration-100 ${ammoDisplay.magTextColorClass}`}
                  >
                    {String(ammoInMag).padStart(2, '0')}
                  </span>
                  <span className="text-sm text-slate-500">/</span>
                  <span
                    data-ammo-reserve="true"
                    className={`text-sm transition-colors duration-100 ${ammoDisplay.reserveTextColorClass}`}
                  >
                    {String(reserveAmmo).padStart(2, '0')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {!hud.activeWeapon.isMelee && hud.activeWeapon.magSize > 0 && (
            <div className="mt-2.5" data-ammo-meter={ammoDisplay.level}>
              {hud.activeWeapon.magSize <= 12 && !hud.isReloading ? (
                <div
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `repeat(${hud.activeWeapon.magSize}, minmax(0, 1fr))`,
                  }}
                >
                  {Array.from({ length: hud.activeWeapon.magSize }, (_, idx) => {
                    const loaded = idx < ammoInMag;
                    return (
                      <span
                        key={idx}
                        className={`h-1.5 transition-colors duration-100 ${
                          loaded ? ammoDisplay.barColorClass : 'bg-white/12'
                        }`}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="h-1.5 w-full overflow-hidden bg-white/12">
                  <div
                    className={`h-full transition-[width,background-color] duration-100 ${ammoDisplay.barColorClass}`}
                    style={{
                      width: `${
                        hud.isReloading
                          ? Math.round(hud.reloadProgress * 100)
                          : Math.round(ammoDisplay.magFillRatio * 100)
                      }%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

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
      {hud.showScoreboard && (
        <ScoreboardOverlay
          match={hud.match}
          teamColors={teamColors}
          localTeam={hud.localTeam}
        />
      )}
    </div>
  );
};
