import React, { useId } from 'react';
import { Compass, Layers } from 'lucide-react';
import {
  ARENA_HALF_EXTENT,
  MINIMAP_LAYOUTS,
  worldSizeToMinimapPercent,
  worldToMinimapPercent,
} from '../game/minimap';
import { MAP_REGISTRY } from '../maps/MapManager';
import { MapId } from '../maps/types';
import { previewMapAmbient } from '../game/AudioEngine';

export type MapPreviewVariant = 'card' | 'banner';
export type MapPreviewMode = 'scenic' | 'tactical';

export interface MapTacticalBlueprintProps {
  mapId: MapId;
  compact?: boolean;
  className?: string;
}

export const MapTacticalBlueprint: React.FC<MapTacticalBlueprintProps> = ({
  mapId,
  compact = false,
  className = '',
}) => {
  const uid = useId().replace(/:/g, '');
  const gridId = `bp-grid-${uid}`;
  const mapDef = MAP_REGISTRY[mapId] ?? MAP_REGISTRY.urban;
  const structures = MINIMAP_LAYOUTS[mapDef.id] ?? MINIMAP_LAYOUTS.urban;

  const avgBlue = mapDef.blueSpawns.reduce(
    (acc, v) => ({ x: acc.x + v.x / mapDef.blueSpawns.length, z: acc.z + v.z / mapDef.blueSpawns.length }),
    { x: 0, z: -22 }
  );
  const avgRed = mapDef.redSpawns.reduce(
    (acc, v) => ({ x: acc.x + v.x / mapDef.redSpawns.length, z: acc.z + v.z / mapDef.redSpawns.length }),
    { x: 0, z: 22 }
  );
  const blueZone = worldToMinimapPercent(avgBlue.x, avgBlue.z, ARENA_HALF_EXTENT);
  const redZone = worldToMinimapPercent(avgRed.x, avgRed.z, ARENA_HALF_EXTENT);

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-map-blueprint={mapDef.id}
      className={`select-none ${className}`}
    >
      <defs>
        <pattern id={gridId} width="10" height="10" patternUnits="userSpaceOnUse">
          <path
            d="M 10 0 L 0 0 0 10"
            fill="none"
            stroke="rgba(148,163,184,0.12)"
            strokeWidth="0.35"
          />
        </pattern>
      </defs>

      <rect x="0" y="0" width="100" height="100" fill="#070b12" />
      <rect x="4" y="4" width="92" height="92" fill={`url(#${gridId})`} />

      {/* Tactical 3-Lane Route Guides */}
      <g opacity={compact ? 0.35 : 0.48}>
        <path
          d="M 50 86 Q 16 62 16 50 Q 16 34 50 14"
          fill="none"
          stroke={mapDef.accentHex}
          strokeWidth={compact ? '0.6' : '0.55'}
          strokeDasharray="1.8 1.6"
        />
        <line
          x1="50"
          y1="86"
          x2="50"
          y2="14"
          stroke="rgba(226,232,240,0.45)"
          strokeWidth={compact ? '0.55' : '0.5'}
          strokeDasharray="1.5 1.8"
        />
        <path
          d="M 50 86 Q 84 62 84 50 Q 84 34 50 14"
          fill="none"
          stroke={mapDef.accentHex}
          strokeWidth={compact ? '0.6' : '0.55'}
          strokeDasharray="1.8 1.6"
        />
      </g>

      {/* Arena Outer Perimeter */}
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        fill="none"
        stroke="rgba(248,250,252,0.24)"
        strokeWidth="0.7"
      />
      <line x1="4" y1="50" x2="96" y2="50" stroke="rgba(255,255,255,0.08)" strokeWidth="0.4" />
      <line x1="50" y1="4" x2="50" y2="96" stroke="rgba(255,255,255,0.08)" strokeWidth="0.4" />

      {/* Architectural Cover & Buildings from MINIMAP_LAYOUTS */}
      {structures.map((item, idx) => {
        const pos = worldToMinimapPercent(item.x, item.z, ARENA_HALF_EXTENT);
        const dim = worldSizeToMinimapPercent(item.width, item.depth, ARENA_HALF_EXTENT);
        const fill =
          item.kind === 'building'
            ? `${mapDef.accentHex}44`
            : item.kind === 'vehicle'
              ? 'rgba(148,163,184,0.34)'
              : 'rgba(226,232,240,0.2)';
        const stroke =
          item.kind === 'building'
            ? mapDef.accentHex
            : item.kind === 'vehicle'
              ? 'rgba(203,213,225,0.65)'
              : 'rgba(148,163,184,0.45)';
        return (
          <rect
            key={`${item.kind}-${idx}`}
            x={pos.xPct - dim.wPct / 2}
            y={pos.yPct - dim.hPct / 2}
            width={dim.wPct}
            height={dim.hPct}
            rx="0.5"
            fill={fill}
            stroke={stroke}
            strokeWidth={item.kind === 'building' ? '0.6' : '0.4'}
          />
        );
      })}

      {/* RED Spawn Zone (North) */}
      <g data-spawn-zone="red">
        <rect
          x="13"
          y={Math.max(6, redZone.yPct - 4.5)}
          width="74"
          height="9"
          rx="1.2"
          fill="rgba(239,68,68,0.12)"
          stroke="rgba(239,68,68,0.45)"
          strokeWidth="0.5"
          strokeDasharray="1.8 1.2"
        />
        {mapDef.redSpawns.map((sp, i) => {
          const pt = worldToMinimapPercent(sp.x, sp.z, ARENA_HALF_EXTENT);
          return (
            <circle
              key={`r-${i}`}
              cx={pt.xPct}
              cy={pt.yPct}
              r={compact ? '1.3' : '1.15'}
              fill="#ef4444"
              stroke="#070b12"
              strokeWidth="0.35"
            />
          );
        })}
        {!compact && (
          <g>
            <rect
              x="38"
              y={Math.max(5.5, redZone.yPct - 4)}
              width="24"
              height="4.8"
              rx="0.6"
              fill="rgba(127,29,29,0.9)"
              stroke="#ef4444"
              strokeWidth="0.4"
            />
            <text
              x="50"
              y={Math.max(8.8, redZone.yPct - 0.7)}
              textAnchor="middle"
              fill="#fecaca"
              fontSize="3.1"
              fontWeight="700"
              fontFamily="monospace"
            >
              RED SPAWN
            </text>
          </g>
        )}
      </g>

      {/* BLUE Spawn Zone (South) */}
      <g data-spawn-zone="blue">
        <rect
          x="13"
          y={Math.min(85, blueZone.yPct - 4.5)}
          width="74"
          height="9"
          rx="1.2"
          fill="rgba(56,189,248,0.12)"
          stroke="rgba(56,189,248,0.45)"
          strokeWidth="0.5"
          strokeDasharray="1.8 1.2"
        />
        {mapDef.blueSpawns.map((sp, i) => {
          const pt = worldToMinimapPercent(sp.x, sp.z, ARENA_HALF_EXTENT);
          return (
            <circle
              key={`b-${i}`}
              cx={pt.xPct}
              cy={pt.yPct}
              r={compact ? '1.3' : '1.15'}
              fill="#38bdf8"
              stroke="#070b12"
              strokeWidth="0.35"
            />
          );
        })}
        {!compact && (
          <g>
            <rect
              x="36"
              y={Math.min(88.5, blueZone.yPct - 0.8)}
              width="28"
              height="4.8"
              rx="0.6"
              fill="rgba(12,74,110,0.92)"
              stroke="#38bdf8"
              strokeWidth="0.4"
            />
            <text
              x="50"
              y={Math.min(91.8, blueZone.yPct + 2.5)}
              textAnchor="middle"
              fill="#bae6fd"
              fontSize="3.1"
              fontWeight="700"
              fontFamily="monospace"
            >
              BLUE SPAWN
            </text>
          </g>
        )}
      </g>

      {/* Bomb Sites A & B */}
      {mapDef.bombSites.map((site) => {
        const pt = worldToMinimapPercent(site.position.x, site.position.z, ARENA_HALF_EXTENT);
        const radiusPct = (site.radius / ARENA_HALF_EXTENT) * 46;
        const badgeColor = site.id === 'A' ? '#f59e0b' : '#38bdf8';
        return (
          <g key={site.id} data-bomb-site={site.id}>
            <circle
              cx={pt.xPct}
              cy={pt.yPct}
              r={radiusPct}
              fill={site.id === 'A' ? 'rgba(245,158,11,0.12)' : 'rgba(56,189,248,0.12)'}
              stroke={badgeColor}
              strokeOpacity="0.7"
              strokeWidth="0.5"
              strokeDasharray="1.4 1.1"
            />
            <rect
              x={pt.xPct - (compact ? 3.5 : 3.8)}
              y={pt.yPct - (compact ? 3.5 : 3.8)}
              width={compact ? 7 : 7.6}
              height={compact ? 7 : 7.6}
              rx="1"
              fill="#090d14"
              stroke={badgeColor}
              strokeWidth="0.7"
            />
            <text
              x={pt.xPct}
              y={pt.yPct + (compact ? 1.6 : 1.7)}
              textAnchor="middle"
              fill={badgeColor}
              fontSize={compact ? '4.4' : '4.6'}
              fontWeight="800"
              fontFamily="monospace"
            >
              {site.id}
            </text>
          </g>
        );
      })}

      {/* Compass North Indicator on Full Blueprint */}
      {!compact && (
        <g>
          <rect x="6.5" y="6.5" width="7.2" height="5.4" rx="0.6" fill="rgba(15,23,42,0.88)" stroke="rgba(255,255,255,0.22)" strokeWidth="0.35" />
          <text x="10.1" y="10.2" textAnchor="middle" fill="#cbd5e1" fontSize="3.4" fontWeight="700" fontFamily="monospace">
            N↑
          </text>
        </g>
      )}
    </svg>
  );
};

export interface MapPreviewProps {
  mapId: MapId;
  variant?: MapPreviewVariant;
  viewMode?: MapPreviewMode;
  showCornerBlueprint?: boolean;
  blueprintRevealDelayMs?: number;
  selected?: boolean;
  className?: string;
}

export const MapPreview: React.FC<MapPreviewProps> = ({
  mapId,
  variant = 'card',
  viewMode = 'scenic',
  showCornerBlueprint = true,
  blueprintRevealDelayMs = 0,
  selected = false,
  className = '',
}) => {
  const uid = useId().replace(/:/g, '');
  const mapDef = MAP_REGISTRY[mapId] ?? MAP_REGISTRY.urban;

  const skyGradId = `mp-sky-${uid}`;
  const sunGlowId = `mp-sun-${uid}`;
  const groundGradId = `mp-gnd-${uid}`;
  const fogGradId = `mp-fog-${uid}`;

  const defaultHeightClass = variant === 'banner' ? 'h-32 w-full' : 'h-36 w-full';
  const containerSize = className || defaultHeightClass;

  return (
    <div
      data-map-preview={mapDef.id}
      data-map-view-mode={viewMode}
      onMouseEnter={() => previewMapAmbient(mapDef.id)}
      className={`relative overflow-hidden border bg-[#070b12] transition-colors duration-200 ${
        selected ? 'border-amber-400/80' : 'border-white/12'
      } ${containerSize}`}
    >
      {viewMode === 'tactical' ? (
        <div
          key={`${mapDef.id}-tactical`}
          className="blueprint-fade-in relative flex h-full w-full items-center justify-between gap-2 bg-[#070b12] p-1.5 transition-opacity duration-300"
        >
          <div className="h-full min-w-0 flex-1">
            <MapTacticalBlueprint mapId={mapDef.id} className="h-full w-full" />
          </div>
          <div className="hidden h-full w-24 shrink-0 flex-col justify-between border border-white/10 bg-slate-950/85 p-2 font-mono-tabular text-[9px] sm:flex">
            <div className="font-bold tracking-wider text-slate-300">INTEL KEY</div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-red-300">
                <span className="h-2 w-2 shrink-0 bg-red-500" />
                <span>RED SPAWN</span>
              </div>
              <div className="flex items-center gap-1.5 text-sky-300">
                <span className="h-2 w-2 shrink-0 bg-sky-400" />
                <span>BLUE SPAWN</span>
              </div>
              <div className="flex items-center gap-1.5 text-amber-300">
                <span className="grid h-3 w-3 shrink-0 place-items-center border border-amber-400 text-[8px] font-bold">
                  A
                </span>
                <span>BOMB SITE A</span>
              </div>
              <div className="flex items-center gap-1.5 text-sky-300">
                <span className="grid h-3 w-3 shrink-0 place-items-center border border-sky-400 text-[8px] font-bold">
                  B
                </span>
                <span>BOMB SITE B</span>
              </div>
            </div>
            <div className="truncate text-[8px] text-slate-400">58×58m ARENA</div>
          </div>
        </div>
      ) : (
        <div key={`${mapDef.id}-scenic`} className="blueprint-fade-in relative h-full w-full transition-opacity duration-300">
          <svg
            viewBox="0 0 320 144"
            preserveAspectRatio="xMidYMid slice"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            data-map-art={mapDef.id}
            className="h-full w-full select-none"
          >
            <defs>
              <linearGradient id={skyGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={mapDef.skyZenithHex} />
                <stop offset="58%" stopColor={mapDef.skyHex} />
                <stop offset="100%" stopColor={mapDef.skyHorizonHex} />
              </linearGradient>
              <radialGradient id={sunGlowId} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={mapDef.sunColorHex} stopOpacity="0.95" />
                <stop offset="45%" stopColor={mapDef.sunColorHex} stopOpacity="0.32" />
                <stop offset="100%" stopColor={mapDef.sunColorHex} stopOpacity="0" />
              </radialGradient>
              <linearGradient id={groundGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={mapDef.ambientGroundHex} />
                <stop offset="100%" stopColor="#090d14" />
              </linearGradient>
              <linearGradient id={fogGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={mapDef.fogHex} stopOpacity="0" />
                <stop offset="100%" stopColor={mapDef.fogHex} stopOpacity="0.45" />
              </linearGradient>
            </defs>

            {/* Sky Backdrop */}
            <rect x="0" y="0" width="320" height="144" fill={`url(#${skyGradId})`} />

            {mapDef.id === 'urban' && (
              <g>
                {/* Cool afternoon glow & distant city skyline */}
                <circle cx="235" cy="34" r="46" fill={`url(#${sunGlowId})`} />
                <path
                  d="M0 92 V48 H24 V60 H42 V38 H66 V64 H90 V44 H116 V70 H148 V52 H178 V66 H212 V40 H238 V58 H266 V42 H294 V62 H320 V92 Z"
                  fill="#1e293b"
                  opacity="0.72"
                />
                {/* Distant illuminated skyscraper windows */}
                {[48, 54, 96, 102, 218, 224, 272].map((wx, idx) => (
                  <rect
                    key={wx}
                    x={wx}
                    y={46 + (idx % 3) * 6}
                    width="3"
                    height="4"
                    fill="#fbbf24"
                    opacity="0.55"
                  />
                ))}

                {/* Asphalt Avenue */}
                <rect x="0" y="90" width="320" height="54" fill={`url(#${groundGradId})`} />
                <polygon points="108,90 212,90 296,144 24,144" fill="#181e27" />
                <line
                  x1="160"
                  y1="92"
                  x2="160"
                  y2="144"
                  stroke="#f59e0b"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                  opacity="0.75"
                />

                {/* West & East Brick / Concrete Storefronts + Rooftop Ramps */}
                <g>
                  <polygon points="0,34 86,54 86,118 0,136" fill="#2c3542" stroke="#475569" strokeWidth="1" />
                  <polygon points="86,54 112,62 112,106 86,118" fill="#1e2530" />
                  {/* Amber lit storefront windows */}
                  <polygon points="16,84 74,90 74,108 16,112" fill="#f59e0b" fillOpacity="0.28" stroke="#f59e0b" strokeOpacity="0.6" strokeWidth="0.9" />
                  <polygon points="16,58 74,68 74,78 16,74" fill="#38bdf8" fillOpacity="0.18" />
                  {/* Rooftop ramp */}
                  <polygon points="86,78 108,96 86,96" fill="#64748b" opacity="0.7" />
                </g>

                <g>
                  <polygon points="320,30 232,52 232,118 320,136" fill="#293240" stroke="#475569" strokeWidth="1" />
                  <polygon points="232,52 206,62 206,106 232,118" fill="#1b222c" />
                  <polygon points="244,88 304,82 304,110 244,108" fill="#38bdf8" fillOpacity="0.24" stroke="#3b82f6" strokeOpacity="0.65" strokeWidth="0.9" />
                  <polygon points="244,66 304,56 304,72 244,76" fill="#f59e0b" fillOpacity="0.2" />
                </g>

                {/* Overhead Illuminated Street Sign Arch */}
                <path d="M96 96 V50 H224 V96" fill="none" stroke="#475569" strokeWidth="3" />
                <rect x="124" y="43" width="72" height="14" rx="1.5" fill="#0f172a" stroke="#3b82f6" strokeWidth="1.2" />
                <rect x="131" y="48" width="58" height="4" fill="#38bdf8" opacity="0.7" />

                {/* Sodium Street Lamps */}
                <circle cx="104" cy="64" r="14" fill="#fbbf24" opacity="0.16" />
                <circle cx="104" cy="64" r="2.2" fill="#fde68a" />
                <circle cx="216" cy="64" r="14" fill="#fbbf24" opacity="0.16" />
                <circle cx="216" cy="64" r="2.2" fill="#fde68a" />

                {/* Armored Van / Vehicle & Jersey Barriers on Avenue */}
                <rect x="136" y="96" width="48" height="20" rx="2" fill="#334155" stroke="#64748b" strokeWidth="1" />
                <rect x="142" y="100" width="16" height="7" fill="#0f172a" />
                <circle cx="146" cy="116" r="4" fill="#090d14" stroke="#475569" strokeWidth="1" />
                <circle cx="174" cy="116" r="4" fill="#090d14" stroke="#475569" strokeWidth="1" />
                <polygon points="78,122 114,122 110,132 74,132" fill="#475569" stroke="#94a3b8" strokeOpacity="0.4" strokeWidth="0.8" />
                <polygon points="206,122 242,122 246,132 210,132" fill="#475569" stroke="#94a3b8" strokeOpacity="0.4" strokeWidth="0.8" />
              </g>
            )}

            {mapDef.id === 'desert' && (
              <g>
                {/* Arid Low Sun & Sandstone Mesas */}
                <circle cx="256" cy="42" r="44" fill={`url(#${sunGlowId})`} />
                <circle cx="256" cy="42" r="12" fill="#fde68a" opacity="0.88" />
                <path
                  d="M0 90 L38 66 L76 66 L102 82 L152 72 L188 72 L222 86 L278 62 L320 74 V96 H0 Z"
                  fill="#9a6439"
                  opacity="0.72"
                />

                {/* Sunlit Desert Sand Ground */}
                <rect x="0" y="90" width="320" height="54" fill="#8b6239" />
                <polygon points="0,104 320,96 320,144 0,144" fill="#6b4929" />

                {/* SW Guard Tower */}
                <g>
                  <line x1="34" y1="62" x2="34" y2="122" stroke="#57432e" strokeWidth="3" />
                  <line x1="60" y1="62" x2="60" y2="122" stroke="#57432e" strokeWidth="3" />
                  <rect x="26" y="48" width="42" height="16" fill="#a88b68" stroke="#fde68a" strokeOpacity="0.35" strokeWidth="0.9" />
                  <polygon points="22,48 47,38 72,48" fill="#7c5d3f" />
                </g>

                {/* NE Guard Tower */}
                <g>
                  <line x1="258" y1="66" x2="258" y2="112" stroke="#57432e" strokeWidth="2.5" />
                  <line x1="280" y1="66" x2="280" y2="112" stroke="#57432e" strokeWidth="2.5" />
                  <rect x="252" y="54" width="34" height="14" fill="#9a7d5c" stroke="#fde68a" strokeOpacity="0.3" strokeWidth="0.8" />
                  <polygon points="248,54 269,46 290,54" fill="#6e5035" />
                </g>

                {/* Central Command Bunker with Radar Dish & Solar Panels */}
                <g>
                  <polygon points="104,76 216,76 226,112 94,112" fill="#8e7f6d" stroke="#d6c5ad" strokeOpacity="0.45" strokeWidth="1" />
                  <rect x="132" y="88" width="56" height="16" fill="#1e242b" />
                  <rect x="112" y="64" width="28" height="12" fill="#1e3a5f" stroke="#38bdf8" strokeOpacity="0.55" strokeWidth="0.8" />
                  {/* Radar mast & dish */}
                  <line x1="184" y1="76" x2="184" y2="52" stroke="#cbd5e1" strokeWidth="2" />
                  <path d="M174 44 Q184 56 196 46" fill="none" stroke="#e2e8f0" strokeWidth="2.2" />
                  <circle cx="184" cy="48" r="2.5" fill="#f59e0b" />
                </g>

                {/* Corrugated FOB Shipping Containers & Sandbags */}
                <rect x="28" y="102" width="54" height="24" fill="#b45309" stroke="#f59e0b" strokeOpacity="0.5" strokeWidth="0.9" />
                {[36, 44, 52, 60, 68, 74].map((rx) => (
                  <line key={rx} x1={rx} y1="103" x2={rx} y2="125" stroke="#78350f" strokeWidth="1.2" />
                ))}
                <rect x="234" y="100" width="56" height="24" fill="#475569" stroke="#94a3b8" strokeOpacity="0.45" strokeWidth="0.9" />
                <ellipse cx="148" cy="126" rx="22" ry="6" fill="#c2a378" stroke="#785e3a" strokeWidth="0.9" />
                <circle cx="214" cy="121" r="5" fill="#dc2626" stroke="#fbbf24" strokeWidth="0.9" />
              </g>
            )}

            {mapDef.id === 'industrial' && (
              <g>
                {/* Refinery Overhead Trusses & High-Bay Amber Lamps */}
                <rect x="0" y="0" width="320" height="18" fill="#0b1017" />
                <path
                  d="M0 18 L24 0 L48 18 L72 0 L96 18 L120 0 L144 18 L168 0 L192 18 L216 0 L240 18 L264 0 L288 18 L320 0"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="1.6"
                />
                {[64, 160, 256].map((lx) => (
                  <g key={lx}>
                    <polygon points={`${lx - 28},88 ${lx + 28},88 ${lx + 8},20 ${lx - 8},20`} fill="#f59e0b" opacity="0.09" />
                    <rect x={lx - 8} y="16" width="16" height="5" fill="#f59e0b" />
                  </g>
                ))}

                {/* Concrete Refinery Floor & Caution Stripes */}
                <rect x="0" y="92" width="320" height="52" fill="#18202a" />
                <line x1="0" y1="128" x2="320" y2="128" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="10 8" opacity="0.55" />

                {/* 4 Cylindrical Silos Left & Right */}
                <g>
                  <rect x="14" y="34" width="32" height="72" rx="4" fill="#334155" stroke="#64748b" strokeWidth="1" />
                  <rect x="48" y="42" width="26" height="64" rx="3" fill="#273240" stroke="#475569" strokeWidth="1" />
                  <rect x="274" y="34" width="32" height="72" rx="4" fill="#334155" stroke="#64748b" strokeWidth="1" />
                  <rect x="246" y="42" width="26" height="64" rx="3" fill="#273240" stroke="#475569" strokeWidth="1" />
                  {/* Overhead Pipework */}
                  <line x1="14" y1="48" x2="306" y2="48" stroke="#475569" strokeWidth="3.5" />
                </g>

                {/* Central Elevated Steel Catwalk & Hazard Ramps */}
                <g>
                  <rect x="74" y="72" width="172" height="10" fill="#1e293b" stroke="#06b6d4" strokeOpacity="0.65" strokeWidth="1" />
                  <line x1="74" y1="64" x2="246" y2="64" stroke="#f59e0b" strokeWidth="1.2" />
                  {[86, 108, 130, 160, 190, 212, 234].map((px) => (
                    <line key={px} x1={px} y1="64" x2={px} y2="72" stroke="#94a3b8" strokeWidth="1" />
                  ))}
                  <polygon points="74,76 48,108 60,108 78,82" fill="#334155" stroke="#06b6d4" strokeOpacity="0.45" strokeWidth="0.8" />
                  <polygon points="246,76 272,108 260,108 242,82" fill="#334155" stroke="#06b6d4" strokeOpacity="0.45" strokeWidth="0.8" />
                  <line x1="160" y1="82" x2="160" y2="112" stroke="#475569" strokeWidth="4" />
                </g>

                {/* Turbine Machinery & Glowing Cyan Control Consoles */}
                <g>
                  <rect x="92" y="102" width="44" height="24" rx="2" fill="#273444" stroke="#64748b" strokeWidth="1" />
                  <rect x="98" y="107" width="14" height="8" fill="#06b6d4" opacity="0.78" />
                  <rect x="184" y="102" width="44" height="24" rx="2" fill="#273444" stroke="#64748b" strokeWidth="1" />
                  <rect x="208" y="107" width="14" height="8" fill="#06b6d4" opacity="0.78" />
                </g>
              </g>
            )}

            {mapDef.id === 'forest' && (
              <g>
                {/* Misty Mountain Ridges & Soft Dawn Glow */}
                <circle cx="96" cy="38" r="42" fill={`url(#${sunGlowId})`} />
                <path
                  d="M0 90 L46 58 L92 78 L148 50 L204 76 L266 48 L320 78 V96 H0 Z"
                  fill="#3b544d"
                  opacity="0.72"
                />
                {/* Background Pine Silhouette Band */}
                {[12, 28, 44, 62, 118, 134, 174, 192, 246, 264, 284, 304].map((tx, idx) => {
                  const h = 24 + (idx % 3) * 8;
                  const topY = 88 - h;
                  return (
                    <polygon
                      key={tx}
                      points={`${tx},${topY} ${tx - 11},88 ${tx + 11},88`}
                      fill="#1d352a"
                      opacity="0.88"
                    />
                  );
                })}

                {/* Mossy Woodland Ground */}
                <rect x="0" y="88" width="320" height="56" fill="#253827" />
                <polygon points="116,88 204,88 256,144 64,144" fill="#3a3326" opacity="0.55" />

                {/* West & East Timber Outpost Cabins with Lanterns */}
                <g>
                  <rect x="34" y="72" width="56" height="32" fill="#5c3d28" stroke="#8c6244" strokeWidth="0.9" />
                  <polygon points="28,72 62,52 96,72" fill="#3d281a" stroke="#10b981" strokeOpacity="0.4" strokeWidth="0.9" />
                  <rect x="74" y="48" width="8" height="14" fill="#475569" />
                  <rect x="48" y="82" width="14" height="10" fill="#fbbf24" opacity="0.7" />
                  <circle cx="84" cy="84" r="7" fill="#fbbf24" opacity="0.22" />
                  <circle cx="84" cy="84" r="2" fill="#fde68a" />
                </g>

                <g>
                  <rect x="230" y="72" width="56" height="32" fill="#5c3d28" stroke="#8c6244" strokeWidth="0.9" />
                  <polygon points="224,72 258,52 292,72" fill="#3d281a" stroke="#10b981" strokeOpacity="0.4" strokeWidth="0.9" />
                  <rect x="256" y="82" width="14" height="10" fill="#fbbf24" opacity="0.65" />
                  <circle cx="236" cy="84" r="7" fill="#fbbf24" opacity="0.22" />
                  <circle cx="236" cy="84" r="2" fill="#fde68a" />
                </g>

                {/* Granite Boulders & Fallen Logs */}
                <polygon points="134,114 152,92 174,94 188,114 142,118" fill="#64748b" stroke="#94a3b8" strokeOpacity="0.45" strokeWidth="0.9" />
                <polygon points="152,92 174,94 168,114 148,114" fill="#475569" />
                <rect x="92" y="118" width="44" height="7" rx="3" fill="#4a3121" stroke="#6d4c37" strokeWidth="0.8" />
                <rect x="192" y="114" width="38" height="6" rx="3" fill="#4a3121" stroke="#6d4c37" strokeWidth="0.8" />

                {/* Foreground Framing Pines */}
                <polygon points="10,44 -8,128 28,128" fill="#12261c" />
                <polygon points="310,42 292,128 328,128" fill="#12261c" />
              </g>
            )}

            {/* Atmospheric Horizon Fog Wash */}
            <rect x="0" y="78" width="320" height="66" fill={`url(#${fogGradId})`} />

            {/* Subtle Bottom Vignette */}
            <rect
              x="0"
              y="108"
              width="320"
              height="36"
              fill="rgba(7,11,18,0.52)"
            />
          </svg>

          {/* Integrated Corner Tactical Blueprint Inset */}
          {showCornerBlueprint && (
            <div
              className={`blueprint-inset-reveal pointer-events-none absolute bottom-1.5 right-1.5 overflow-hidden border border-white/25 bg-[#070b12]/90 p-0.5 opacity-90 shadow-lg shadow-black/60 transition-opacity duration-300 group-hover:opacity-100 ${
                variant === 'banner' ? 'h-16 w-16' : 'h-14 w-14'
              }`}
              style={
                blueprintRevealDelayMs > 0
                  ? { animationDelay: `${blueprintRevealDelayMs}ms` }
                  : undefined
              }
              data-blueprint-inset={mapDef.id}
              title={`${mapDef.name} Tactical Layout (Sites A & B)`}
            >
              <MapTacticalBlueprint mapId={mapDef.id} compact className="h-full w-full" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export interface MapViewModeToggleProps {
  value: MapPreviewMode;
  onChange: (next: MapPreviewMode) => void;
  size?: 'sm' | 'md';
}

export const MapViewModeToggle: React.FC<MapViewModeToggleProps> = ({
  value,
  onChange,
  size = 'sm',
}) => {
  const btnPad = size === 'md' ? 'px-3 py-1.5 text-[11px]' : 'px-2.5 py-1 text-[10px]';
  return (
    <div
      className="inline-flex border border-white/15 bg-black/50 p-0.5"
      role="group"
      aria-label="Map preview mode"
    >
      <button
        type="button"
        aria-pressed={value === 'scenic'}
        onClick={() => onChange('scenic')}
        className={`inline-flex cursor-pointer items-center gap-1.5 font-mono-tabular font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 whitespace-nowrap ${btnPad} ${
          value === 'scenic'
            ? 'bg-amber-500/20 text-amber-200'
            : 'text-slate-400 hover:text-white'
        }`}
      >
        <Layers className="h-3 w-3" />
        Scenic View
      </button>
      <button
        type="button"
        aria-pressed={value === 'tactical'}
        onClick={() => onChange('tactical')}
        className={`inline-flex cursor-pointer items-center gap-1.5 font-mono-tabular font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 whitespace-nowrap ${btnPad} ${
          value === 'tactical'
            ? 'bg-sky-500/25 text-sky-200'
            : 'text-slate-400 hover:text-white'
        }`}
      >
        <Compass className="h-3 w-3" />
        Tactical Blueprint (Sites A/B)
      </button>
    </div>
  );
};
