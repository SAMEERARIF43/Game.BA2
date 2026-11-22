import { WeaponId } from './types';

export type AmmoStatusLevel = 'normal' | 'low' | 'empty' | 'out' | 'reloading' | 'melee';

export function resolveWeaponIdFromName(name: string | null | undefined): WeaponId | null {
  if (!name) return null;
  const lower = name.trim().toLowerCase();
  if (!lower) return null;
  if (lower.includes('shotgun') || lower.includes('m870')) return 'shotgun';
  if (lower.includes('ak-47') || lower.includes('ak47') || lower.includes('heavy rifle')) return 'ak47';
  if (lower.includes('smg') || lower.includes('vector')) return 'smg';
  if (lower.includes('sniper') || lower.includes('awp') || lower.includes('precision rifle')) return 'sniper';
  if (lower.includes('pistol') || lower.includes('usp')) return 'pistol';
  if (lower.includes('knife') || lower.includes('k-bar') || lower.includes('melee')) return 'knife';
  return null;
}

export function isOrdnanceKillName(name: string | null | undefined): boolean {
  if (!name) return false;
  const lower = name.trim().toLowerCase();
  return (
    lower.includes('barrage') ||
    lower.includes('airstrike') ||
    lower.includes('ordnance') ||
    lower.includes('bomb') ||
    lower.includes('blast')
  );
}

export interface AmmoDisplayState {
  level: AmmoStatusLevel;
  lowThreshold: number;
  isLow: boolean;
  isEmpty: boolean;
  isOutOfAmmo: boolean;
  magFillRatio: number;
  statusLabel: string | null;
  magTextColorClass: string;
  reserveTextColorClass: string;
  barColorClass: string;
  statusTextColorClass: string;
  cardBorderClass: string;
}

export function getLowAmmoThreshold(magSize: number): number {
  if (!Number.isFinite(magSize) || magSize <= 0) return 0;
  return Math.max(1, Math.ceil(magSize * 0.25));
}

export function getAmmoDisplayState(params: {
  ammoInMag: number;
  reserveAmmo: number;
  magSize: number;
  isMelee?: boolean;
  isReloading?: boolean;
  reloadKeyLabel?: string;
}): AmmoDisplayState {
  const {
    ammoInMag,
    reserveAmmo,
    magSize,
    isMelee = false,
    isReloading = false,
    reloadKeyLabel = 'R',
  } = params;

  if (isMelee || magSize <= 0) {
    return {
      level: 'melee',
      lowThreshold: 0,
      isLow: false,
      isEmpty: false,
      isOutOfAmmo: false,
      magFillRatio: 1,
      statusLabel: null,
      magTextColorClass: 'text-emerald-300',
      reserveTextColorClass: 'text-slate-300',
      barColorClass: 'bg-emerald-400',
      statusTextColorClass: 'text-emerald-300',
      cardBorderClass: 'border-slate-400/20 bg-slate-950/80',
    };
  }

  const clampedMag = Math.max(0, ammoInMag);
  const clampedReserve = Math.max(0, reserveAmmo);
  const lowThreshold = getLowAmmoThreshold(magSize);
  const magFillRatio = Math.max(0, Math.min(1, clampedMag / magSize));
  const reserveTextColorClass = clampedReserve <= 0 ? 'text-red-400/80' : 'text-slate-300';

  if (isReloading) {
    return {
      level: 'reloading',
      lowThreshold,
      isLow: clampedMag > 0 && clampedMag <= lowThreshold,
      isEmpty: clampedMag <= 0,
      isOutOfAmmo: false,
      magFillRatio,
      statusLabel: 'RELOADING',
      magTextColorClass: 'text-sky-300',
      reserveTextColorClass,
      barColorClass: 'bg-sky-400',
      statusTextColorClass: 'text-sky-300',
      cardBorderClass: 'border-sky-400/40 bg-slate-950/85',
    };
  }

  if (clampedMag <= 0) {
    const outOfReserve = clampedReserve <= 0;
    return {
      level: outOfReserve ? 'out' : 'empty',
      lowThreshold,
      isLow: false,
      isEmpty: true,
      isOutOfAmmo: outOfReserve,
      magFillRatio: 0,
      statusLabel: outOfReserve ? 'NO AMMO' : `EMPTY · [${reloadKeyLabel}] RELOAD`,
      magTextColorClass: 'text-red-500',
      reserveTextColorClass,
      barColorClass: 'bg-red-500',
      statusTextColorClass: 'text-red-400',
      cardBorderClass: 'border-red-500/55 bg-red-950/35',
    };
  }

  if (clampedMag <= lowThreshold) {
    return {
      level: 'low',
      lowThreshold,
      isLow: true,
      isEmpty: false,
      isOutOfAmmo: false,
      magFillRatio,
      statusLabel: 'LOW AMMO',
      magTextColorClass: 'text-amber-400',
      reserveTextColorClass,
      barColorClass: 'bg-amber-400',
      statusTextColorClass: 'text-amber-300',
      cardBorderClass: 'border-amber-400/45 bg-slate-950/85',
    };
  }

  return {
    level: 'normal',
    lowThreshold,
    isLow: false,
    isEmpty: false,
    isOutOfAmmo: false,
    magFillRatio,
    statusLabel: null,
    magTextColorClass: 'text-white',
    reserveTextColorClass,
    barColorClass: 'bg-white/85',
    statusTextColorClass: 'text-slate-300',
    cardBorderClass: 'border-slate-400/20 bg-slate-950/80',
  };
}
