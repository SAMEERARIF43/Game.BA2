import React, { useId } from 'react';
import { Crosshair } from 'lucide-react';
import {
  isOrdnanceKillName,
  KNIFE_CHARMS,
  KnifeCharmId,
  resolveWeaponIdFromName,
  WeaponId,
} from '../game/types';

export interface WeaponPreviewProps {
  weaponId: WeaponId;
  charmId?: KnifeCharmId;
  className?: string;
  variant?: 'card' | 'compact' | 'icon';
  accentColor?: string;
}

export const WeaponPreview: React.FC<WeaponPreviewProps> = ({
  weaponId,
  charmId = 'tactical_tag',
  className = '',
  variant = 'card',
  accentColor,
}) => {
  const uid = useId().replace(/:/g, '');
  const steelId = `wp-steel-${uid}`;
  const darkId = `wp-dark-${uid}`;
  const woodId = `wp-wood-${uid}`;
  const bladeId = `wp-blade-${uid}`;
  const opticGlowId = `wp-optic-${uid}`;

  const isIcon = variant === 'icon';
  const charmHex = KNIFE_CHARMS[charmId]?.accentHex ?? '#f59e0b';
  const defaultAccent =
    weaponId === 'sniper'
      ? '#10b981'
      : weaponId === 'ak47'
        ? '#ef4444'
        : weaponId === 'smg'
          ? '#38bdf8'
          : weaponId === 'shotgun'
            ? '#f59e0b'
            : weaponId === 'pistol'
              ? '#94a3b8'
              : charmHex;
  const accent = accentColor ?? defaultAccent;

  const sizeClass =
    className ||
    (variant === 'icon'
      ? 'h-5 w-14 shrink-0'
      : variant === 'compact'
        ? 'h-10 w-36'
        : 'h-16 w-full');

  return (
    <svg
      viewBox="0 0 220 76"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-weapon-preview={weaponId}
      className={`select-none ${isIcon ? 'drop-shadow-[0_0_1.5px_rgba(248,250,252,0.45)]' : ''} ${sizeClass}`}
    >
      <defs>
        <linearGradient id={steelId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isIcon ? '#e2e8f0' : '#94a3b8'} />
          <stop offset="45%" stopColor={isIcon ? '#94a3b8' : '#475569'} />
          <stop offset="100%" stopColor={isIcon ? '#475569' : '#1e293b'} />
        </linearGradient>
        <linearGradient id={darkId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={isIcon ? '#94a3b8' : '#334155'} />
          <stop offset="100%" stopColor={isIcon ? '#334155' : '#0f172a'} />
        </linearGradient>
        <linearGradient id={woodId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#92400e" />
          <stop offset="55%" stopColor="#b45309" />
          <stop offset="100%" stopColor="#78350f" />
        </linearGradient>
        <linearGradient id={bladeId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="60%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
        <radialGradient id={opticGlowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={accent} stopOpacity="1" />
          <stop offset="55%" stopColor={accent} stopOpacity="0.45" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      {weaponId === 'shotgun' && (
        <g data-weapon-art="shotgun">
          {/* Heavy top barrel & ventilated rib */}
          <rect x="86" y="21" width="116" height="6" rx="1" fill={`url(#${steelId})`} stroke="#cbd5e1" strokeOpacity="0.35" strokeWidth="0.8" />
          <rect x="92" y="19" width="102" height="2" fill="#64748b" />
          <rect x="196" y="17.5" width="4" height="3.5" fill={accent} />
          {/* Under-barrel tubular magazine */}
          <rect x="92" y="28.5" width="96" height="5" rx="1.5" fill={`url(#${darkId})`} stroke="#64748b" strokeWidth="0.8" />
          <rect x="184" y="27.5" width="5" height="7" rx="1" fill="#475569" />
          {/* Ribbed tactical pump forend */}
          <rect x="118" y="27.5" width="44" height="9" rx="2" fill="#1e293b" stroke="#94a3b8" strokeOpacity="0.45" strokeWidth="0.9" />
          {[124, 130, 136, 142, 148, 154].map((x) => (
            <line key={x} x1={x} y1="28.5" x2={x} y2="35.5" stroke="#475569" strokeWidth="1.4" />
          ))}
          {/* Receiver & ejection port + brass shell glint */}
          <path d="M52 21 H94 V35 H56 L48 31 Z" fill={`url(#${darkId})`} stroke="#94a3b8" strokeOpacity="0.4" strokeWidth="0.9" />
          <rect x="66" y="23" width="17" height="4.5" rx="0.8" fill="#090d14" stroke="#64748b" strokeWidth="0.6" />
          <rect x="69" y="24" width="8" height="2.4" rx="0.5" fill="#d97706" />
          {/* Shell side saddle */}
          {[56, 61, 66].map((x) => (
            <g key={x}>
              <rect x={x} y="29" width="3.5" height="6.5" rx="0.6" fill="#b91c1c" />
              <rect x={x} y="34" width="3.5" height="2" fill="#f59e0b" />
            </g>
          ))}
          {/* Tactical grip & buttstock */}
          <path d="M56 34 L63 34 L67 51 L58 51 Z" fill="#0f172a" stroke="#64748b" strokeWidth="0.8" />
          <path d="M63 35 Q67 42 74 37 L74 34" stroke="#64748b" strokeWidth="1.2" fill="none" />
          <path d="M14 27 L52 23 L52 34 L16 49 L11 47 L11 29 Z" fill={`url(#${darkId})`} stroke="#64748b" strokeOpacity="0.5" strokeWidth="0.9" />
          <rect x="10" y="27" width="4" height="22" rx="1" fill="#090d14" />
        </g>
      )}

      {weaponId === 'ak47' && (
        <g data-weapon-art="ak47">
          {/* Barrel, gas tube & slant muzzle brake */}
          <rect x="116" y="26" width="80" height="4.5" fill={`url(#${steelId})`} />
          <path d="M196 25.5 H207 L209 30.5 H196 Z" fill="#64748b" stroke="#cbd5e1" strokeOpacity="0.4" strokeWidth="0.7" />
          <rect x="116" y="21.5" width="48" height="3.8" rx="1" fill="#334155" />
          <path d="M168 18 L172 18 L172 26 H167 Z" fill="#475569" />
          {/* Wooden / polymer handguard */}
          <path d="M112 22.5 H160 L163 31 H112 Z" fill={`url(#${woodId})`} stroke="#f59e0b" strokeOpacity="0.3" strokeWidth="0.8" />
          {/* Receiver & top Picatinny rail */}
          <path d="M56 22 H114 V34 H58 L54 29 Z" fill={`url(#${darkId})`} stroke="#94a3b8" strokeOpacity="0.4" strokeWidth="0.9" />
          <rect x="64" y="19.5" width="44" height="2.8" fill="#475569" />
          {/* Red Dot Reflex Optic */}
          <path d="M76 12 H96 V19.5 H76 Z" fill="#0f172a" stroke="#94a3b8" strokeOpacity="0.55" strokeWidth="0.9" />
          <rect x="79" y="13.5" width="14" height="4.5" fill="#1e293b" />
          <circle cx="86" cy="15.7" r="4" fill={`url(#${opticGlowId})`} />
          <circle cx="86" cy="15.7" r="1.4" fill="#ef4444" />
          {/* Iconic curved banana magazine */}
          <path d="M98 34 L112 34 C112 46 116 57 125 65 L112 68 C102 58 98 46 98 34 Z" fill={`url(#${steelId})`} stroke="#cbd5e1" strokeOpacity="0.35" strokeWidth="0.8" />
          <path d="M104 38 C105 48 109 57 116 63" stroke="#1e293b" strokeWidth="1" fill="none" />
          {/* Pistol grip & skeletal stock */}
          <path d="M62 34 L71 34 L67 54 L58 53 Z" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
          <path d="M71 34 Q74 42 82 37 L82 34" stroke="#64748b" strokeWidth="1.2" fill="none" />
          <path d="M14 25 L56 23 V32 L16 45 L12 43 Z" fill={`url(#${woodId})`} stroke="#f59e0b" strokeOpacity="0.25" strokeWidth="0.9" />
          <rect x="11" y="25" width="3.5" height="20" rx="0.8" fill="#1e293b" />
        </g>
      )}

      {weaponId === 'smg' && (
        <g data-weapon-art="smg">
          {/* Compact shrouded barrel & compensator */}
          <rect x="148" y="25" width="44" height="5.5" rx="1" fill={`url(#${steelId})`} />
          <rect x="190" y="24" width="11" height="7.5" rx="1" fill="#334155" stroke="#94a3b8" strokeOpacity="0.45" strokeWidth="0.8" />
          <line x1="194" y1="24.5" x2="194" y2="31" stroke="#0f172a" strokeWidth="1.2" />
          <line x1="197" y1="24.5" x2="197" y2="31" stroke="#0f172a" strokeWidth="1.2" />
          {/* Main upper & lower receiver */}
          <path d="M60 21 H154 V35 H60 Z" fill={`url(#${darkId})`} stroke="#94a3b8" strokeOpacity="0.45" strokeWidth="0.9" />
          <rect x="64" y="23" width="84" height="3" fill="#475569" opacity="0.55" />
          <rect x="116" y="25" width="14" height="4" fill="#090d14" stroke="#64748b" strokeWidth="0.6" />
          {/* Compact Reflex Holo Sight */}
          <path d="M84 12.5 H106 V21 H84 Z" fill="#0f172a" stroke="#38bdf8" strokeOpacity="0.5" strokeWidth="0.9" />
          <rect x="87" y="14" width="16" height="5" fill="#1e293b" />
          <circle cx="95" cy="16.5" r="3.5" fill={`url(#${opticGlowId})`} />
          <circle cx="95" cy="16.5" r="1.1" fill="#38bdf8" />
          {/* Vertical angled foregrip */}
          <path d="M135 35 H144 L142 52 H133 Z" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
          {/* Extended stick magazine */}
          <path d="M108 35 H118 L124 66 L114 67 Z" fill={`url(#${steelId})`} stroke="#cbd5e1" strokeOpacity="0.35" strokeWidth="0.8" />
          <rect x="114" y="64" width="11" height="3.5" rx="0.8" fill="#38bdf8" opacity="0.8" />
          {/* Pistol grip & folding tactical stock */}
          <path d="M68 35 H78 L75 55 H65 Z" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
          <path d="M78 35 Q82 43 90 38 L90 35" stroke="#64748b" strokeWidth="1.2" fill="none" />
          <path d="M24 23 L60 22 V33 L24 41 V23 Z" fill="none" stroke="#64748b" strokeWidth="2.4" />
          <rect x="21" y="22" width="5" height="20" rx="1" fill="#1e293b" stroke="#94a3b8" strokeOpacity="0.4" strokeWidth="0.8" />
        </g>
      )}

      {weaponId === 'sniper' && (
        <g data-weapon-art="sniper">
          {/* Long fluted barrel & heavy multi-chamber muzzle brake */}
          <rect x="112" y="26" width="90" height="4" fill={`url(#${steelId})`} />
          <path d="M202 24 H214 V32 H202 Z" fill="#334155" stroke="#cbd5e1" strokeOpacity="0.45" strokeWidth="0.8" />
          <line x1="206" y1="24.5" x2="206" y2="31.5" stroke="#0f172a" strokeWidth="1.4" />
          <line x1="210" y1="24.5" x2="210" y2="31.5" stroke="#0f172a" strokeWidth="1.4" />
          {/* Deployed front bipod */}
          <line x1="158" y1="31" x2="170" y2="54" stroke="#64748b" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="158" y1="31" x2="149" y2="52" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="170" cy="54.5" r="2" fill="#94a3b8" />
          <circle cx="149" cy="52.5" r="1.8" fill="#64748b" />
          {/* High-mounted 4x/6x/8x Tactical Scope */}
          <rect x="78" y="19" width="4" height="5" fill="#475569" />
          <rect x="104" y="19" width="4" height="5" fill="#475569" />
          <rect x="89" y="10" width="8" height="4" rx="0.8" fill="#64748b" />
          <path d="M66 13 H122 L128 11 V21 L122 19 H66 L61 20.5 V11.5 Z" fill={`url(#${darkId})`} stroke="#94a3b8" strokeOpacity="0.55" strokeWidth="0.9" />
          <ellipse cx="127" cy="16" rx="1.6" ry="4.2" fill={accent} opacity="0.85" />
          <circle cx="64" cy="16" r="2.2" fill={`url(#${opticGlowId})`} />
          {/* Precision chassis receiver & bolt handle */}
          <path d="M46 23 H130 L134 32 H48 Z" fill="#14532d" stroke="#22c55e" strokeOpacity="0.35" strokeWidth="0.9" />
          <rect x="74" y="24" width="38" height="5.5" fill="#1e293b" />
          <circle cx="80" cy="28" r="2.3" fill="#cbd5e1" />
          {/* Box magazine */}
          <rect x="86" y="32" width="22" height="11" rx="1" fill={`url(#${steelId})`} stroke="#64748b" strokeWidth="0.8" />
          {/* Thumbhole chassis stock & cheek riser */}
          <path d="M12 25 H48 V36 L14 45 L10 42 Z" fill="#14532d" stroke="#22c55e" strokeOpacity="0.3" strokeWidth="0.9" />
          <rect x="22" y="21.5" width="19" height="3.5" rx="1" fill="#0f172a" stroke="#475569" strokeWidth="0.7" />
          <path d="M52 32 H62 L58 51 H49 Z" fill="#0f172a" stroke="#475569" strokeWidth="0.8" />
          <rect x="9" y="25" width="3.5" height="20" fill="#090d14" />
        </g>
      )}

      {weaponId === 'pistol' && (
        <g data-weapon-art="pistol">
          {/* Machined slide */}
          <path d="M64 19 H156 L158 29 H64 V19 Z" fill={`url(#${steelId})`} stroke="#cbd5e1" strokeOpacity="0.45" strokeWidth="0.9" />
          <rect x="66" y="16.5" width="4" height="2.5" fill="#94a3b8" />
          <rect x="148" y="16.5" width="4" height="2.5" fill={accent} />
          {/* Slide serrations */}
          {[72, 76, 80, 84].map((x) => (
            <line key={x} x1={x} y1="20.5" x2={x - 1.5} y2="27.5" stroke="#1e293b" strokeWidth="1.4" />
          ))}
          <rect x="108" y="20" width="16" height="4" rx="0.6" fill="#0f172a" opacity="0.7" />
          {/* Threaded muzzle */}
          <rect x="157" y="21.5" width="8" height="4.5" rx="0.8" fill="#475569" stroke="#94a3b8" strokeOpacity="0.4" strokeWidth="0.7" />
          {/* Polymer frame & tactical rail */}
          <path d="M62 29 H152 V36 H112 L94 37 L84 62 H65 L71 36 H62 Z" fill={`url(#${darkId})`} stroke="#64748b" strokeOpacity="0.5" strokeWidth="0.9" />
          {/* Under-barrel tactical LAM module */}
          <rect x="122" y="36" width="26" height="8" rx="1.2" fill="#0f172a" stroke="#64748b" strokeWidth="0.8" />
          <circle cx="146" cy="40" r="1.6" fill="#ef4444" />
          {/* Trigger guard & trigger */}
          <path d="M92 36 H112 V45 H90" stroke="#64748b" strokeWidth="1.8" fill="none" />
          <path d="M101 36 Q100 41 103 43" stroke="#94a3b8" strokeWidth="1.4" fill="none" />
          {/* Magazine baseplate */}
          <rect x="63" y="61" width="22" height="4" rx="1" fill="#475569" />
        </g>
      )}

      {weaponId === 'knife' && (
        <g data-weapon-art="knife">
          {/* Clip-point K-Bar serrated blade */}
          <path
            d="M96 27 H172 Q184 27 195 33 L184 40 Q145 43 96 41 Z"
            fill={`url(#${bladeId})`}
            stroke="#f8fafc"
            strokeOpacity="0.65"
            strokeWidth="0.9"
          />
          {/* Serrated spine notches */}
          <path
            d="M102 27 L105 24.5 L108 27 L111 24.5 L114 27 L117 24.5 L120 27 L123 24.5 L126 27"
            stroke="#cbd5e1"
            strokeWidth="1.1"
            fill="none"
          />
          {/* Blood groove / fuller */}
          <rect x="104" y="31.5" width="54" height="3" rx="1.2" fill="#334155" opacity="0.7" />
          {/* Crossguard */}
          <rect x="90" y="21" width="7" height="26" rx="1.5" fill="#1e293b" stroke="#94a3b8" strokeOpacity="0.55" strokeWidth="0.9" />
          {/* Stacked tactical grip */}
          <rect x="38" y="27" width="52" height="14" rx="2" fill={`url(#${woodId})`} stroke="#78350f" strokeWidth="0.8" />
          {[46, 54, 62, 70, 78, 84].map((x) => (
            <line key={x} x1={x} y1="27.5" x2={x} y2="40.5" stroke="#1e293b" strokeWidth="2.1" />
          ))}
          {/* Pommel cap + lanyard ring + active charm */}
          <rect x="30" y="25.5" width="9" height="17" rx="1.5" fill="#334155" stroke="#94a3b8" strokeOpacity="0.5" strokeWidth="0.9" />
          <circle cx="26" cy="34" r="3.5" stroke="#cbd5e1" strokeWidth="1.5" fill="none" />
          {/* Dangling Charm */}
          <line x1="25" y1="37" x2="25" y2="45" stroke="#cbd5e1" strokeWidth="1.2" />
          <polygon
            points="25,44 31,51 25,60 19,51"
            fill={charmHex}
            stroke="#f8fafc"
            strokeOpacity="0.75"
            strokeWidth="0.9"
          />
        </g>
      )}
    </svg>
  );
};

export interface KillFeedWeaponIconProps {
  weaponName: string;
  weaponId?: WeaponId;
  className?: string;
}

export const KillFeedWeaponIcon: React.FC<KillFeedWeaponIconProps> = ({
  weaponName,
  weaponId,
  className,
}) => {
  const resolvedId = weaponId ?? resolveWeaponIdFromName(weaponName);
  if (resolvedId) {
    return (
      <WeaponPreview
        weaponId={resolvedId}
        variant="icon"
        className={className ?? 'h-5 w-14 shrink-0'}
      />
    );
  }

  if (isOrdnanceKillName(weaponName)) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        data-killfeed-icon="ordnance"
        className={className ?? 'h-4 w-6 shrink-0 text-amber-300'}
      >
        <path
          d="M12 3L15.5 9.5L21 10.5L16.5 14.5L17.8 20.5L12 17.2L6.2 20.5L7.5 14.5L3 10.5L8.5 9.5L12 3Z"
          fill="currentColor"
          fillOpacity="0.25"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12.5" r="2.2" fill="currentColor" />
      </svg>
    );
  }

  return (
    <Crosshair
      aria-hidden="true"
      data-killfeed-icon="generic"
      className={className ?? 'h-3.5 w-3.5 shrink-0 text-slate-300'}
    />
  );
};

