import {
  Material,
  Mesh,
  MeshBuilder,
  Scene,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { GraphicsQuality, WeaponId } from './types';

export interface VfxQualityBudget {
  muzzleLightEnabled: boolean;
  muzzleLightScale: number;
  casingsEnabled: boolean;
  maxCasings: number;
  envSparkCount: number;
  targetBurstCount: number;
  dustPuffCount: number;
  maxDecals: number;
  maxTracers: number;
  maxImpacts: number;
  maxDustPuffs: number;
  knifeTrailSegments: number;
}

export type CasingKind = 'none' | 'brassRifle' | 'brassPistol' | 'brassHeavy' | 'shotgunHull';

export interface WeaponFeelProfile {
  kickBack: number;
  kickRotX: number;
  kickYaw: number;
  kickRoll: number;
  fovKickRad: number;
  adsAttenuation: number;
  muzzleScale: number;
  tracerThickness: number;
  tracerDuration: number;
  casingKind: CasingKind;
  casingDelaySec: number;
  boltCyclePulseAtSec: number;
}

export function getVfxQualityBudget(quality: GraphicsQuality): VfxQualityBudget {
  if (quality === 'LOW') {
    return {
      muzzleLightEnabled: false,
      muzzleLightScale: 0,
      casingsEnabled: false,
      maxCasings: 0,
      envSparkCount: 1,
      targetBurstCount: 2,
      dustPuffCount: 0,
      maxDecals: 8,
      maxTracers: 16,
      maxImpacts: 16,
      maxDustPuffs: 0,
      knifeTrailSegments: 2,
    };
  }
  if (quality === 'MEDIUM') {
    return {
      muzzleLightEnabled: true,
      muzzleLightScale: 0.72,
      casingsEnabled: true,
      maxCasings: 12,
      envSparkCount: 3,
      targetBurstCount: 4,
      dustPuffCount: 1,
      maxDecals: 24,
      maxTracers: 28,
      maxImpacts: 36,
      maxDustPuffs: 12,
      knifeTrailSegments: 4,
    };
  }
  return {
    muzzleLightEnabled: true,
    muzzleLightScale: 1.0,
    casingsEnabled: true,
    maxCasings: 24,
    envSparkCount: 5,
    targetBurstCount: 6,
    dustPuffCount: 2,
    maxDecals: 48,
    maxTracers: 40,
    maxImpacts: 64,
    maxDustPuffs: 24,
    knifeTrailSegments: 6,
  };
}

const WEAPON_FEEL_PROFILES: Record<WeaponId, WeaponFeelProfile> = {
  shotgun: {
    kickBack: 0.092,
    kickRotX: 0.138,
    kickYaw: 0.012,
    kickRoll: 0.052,
    fovKickRad: 0.022,
    adsAttenuation: 0.42,
    muzzleScale: 1.28,
    tracerThickness: 0.016,
    tracerDuration: 0.055,
    casingKind: 'shotgunHull',
    casingDelaySec: 0,
    boltCyclePulseAtSec: 0.24,
  },
  ak47: {
    kickBack: 0.064,
    kickRotX: 0.104,
    kickYaw: 0.014,
    kickRoll: 0.026,
    fovKickRad: 0.011,
    adsAttenuation: 0.36,
    muzzleScale: 1.05,
    tracerThickness: 0.022,
    tracerDuration: 0.062,
    casingKind: 'brassRifle',
    casingDelaySec: 0,
    boltCyclePulseAtSec: 0,
  },
  smg: {
    kickBack: 0.036,
    kickRotX: 0.048,
    kickYaw: 0.024,
    kickRoll: 0.034,
    fovKickRad: 0.0055,
    adsAttenuation: 0.44,
    muzzleScale: 0.78,
    tracerThickness: 0.016,
    tracerDuration: 0.052,
    casingKind: 'brassPistol',
    casingDelaySec: 0,
    boltCyclePulseAtSec: 0,
  },
  sniper: {
    kickBack: 0.105,
    kickRotX: 0.155,
    kickYaw: 0.01,
    kickRoll: 0.036,
    fovKickRad: 0.028,
    adsAttenuation: 0.25,
    muzzleScale: 1.38,
    tracerThickness: 0.028,
    tracerDuration: 0.095,
    casingKind: 'brassHeavy',
    casingDelaySec: 0.34,
    boltCyclePulseAtSec: 0.34,
  },
  pistol: {
    kickBack: 0.052,
    kickRotX: 0.088,
    kickYaw: 0.009,
    kickRoll: 0.02,
    fovKickRad: 0.0075,
    adsAttenuation: 0.4,
    muzzleScale: 0.74,
    tracerThickness: 0.015,
    tracerDuration: 0.054,
    casingKind: 'brassPistol',
    casingDelaySec: 0,
    boltCyclePulseAtSec: 0,
  },
  knife: {
    kickBack: 0.02,
    kickRotX: 0.03,
    kickYaw: 0.01,
    kickRoll: 0.02,
    fovKickRad: 0.008,
    adsAttenuation: 1.0,
    muzzleScale: 0,
    tracerThickness: 0.01,
    tracerDuration: 0.05,
    casingKind: 'none',
    casingDelaySec: 0,
    boltCyclePulseAtSec: 0,
  },
};

export function getWeaponFeelProfile(weaponId: WeaponId): WeaponFeelProfile {
  return WEAPON_FEEL_PROFILES[weaponId] ?? WEAPON_FEEL_PROFILES.ak47;
}

export function computeAdsAttenuatedScale(adsBlend: number, adsAttenuation: number): number {
  const clampedBlend = Math.max(0, Math.min(1, adsBlend));
  const clampedTarget = Math.max(0.05, Math.min(1, adsAttenuation));
  return 1 - clampedBlend * (1 - clampedTarget);
}

interface PooledTracerSlot {
  mesh: Mesh;
  active: boolean;
  life: number;
  maxLife: number;
  thickness: number;
  beamLen: number;
}

export class PooledTracerRingBuffer {
  private pool: PooledTracerSlot[] = [];
  private maxActive: number;
  private cursor = 0;
  private poolRoot: TransformNode;
  private readonly deltaScratch = new Vector3();
  private readonly dirScratch = new Vector3();
  private readonly startScratch = new Vector3();
  private readonly midScratch = new Vector3();

  constructor(scene: Scene, namePrefix: string, capacity = 40) {
    this.maxActive = Math.max(1, capacity);
    this.poolRoot = new TransformNode(`${namePrefix}_root`, scene);

    for (let i = 0; i < capacity; i++) {
      const mesh = MeshBuilder.CreateBox(
        `${namePrefix}_${i}`,
        { width: 1, height: 1, depth: 1 },
        scene
      );
      mesh.parent = this.poolRoot;
      mesh.isPickable = false;
      mesh.checkCollisions = false;
      mesh.setEnabled(false);
      this.pool.push({
        mesh,
        active: false,
        life: 0,
        maxLife: 0.06,
        thickness: 0.02,
        beamLen: 1,
      });
    }
  }

  public getCapacity(): number {
    return this.pool.length;
  }

  public getActiveCount(): number {
    let count = 0;
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i].active) count += 1;
    }
    return count;
  }

  public setMaxActive(limit: number): void {
    this.maxActive = Math.max(1, Math.min(this.pool.length, Math.floor(limit)));
    for (let i = this.maxActive; i < this.pool.length; i++) {
      const slot = this.pool[i];
      if (slot.active) {
        slot.active = false;
        slot.life = 0;
        slot.mesh.setEnabled(false);
      }
    }
    if (this.cursor >= this.maxActive) {
      this.cursor = 0;
    }
  }

  public spawn(
    start: Vector3,
    end: Vector3,
    material: Material,
    options?: {
      thickness?: number;
      duration?: number;
      maxLength?: number;
      startLead?: number;
    }
  ): void {
    if (this.pool.length === 0) return;

    end.subtractToRef(start, this.deltaScratch);
    const fullDist = this.deltaScratch.length();
    if (fullDist < 0.25) return;

    const maxLength = options?.maxLength ?? 28;
    const thickness = options?.thickness ?? 0.02;
    const duration = options?.duration ?? 0.06;
    const leadRatio = options?.startLead ?? 0.15;

    const invDist = 1 / fullDist;
    this.dirScratch.set(
      this.deltaScratch.x * invDist,
      this.deltaScratch.y * invDist,
      this.deltaScratch.z * invDist
    );

    const lead = Math.min(0.45, fullDist * leadRatio);
    const beamLen = Math.min(Math.max(0.2, fullDist - lead * 0.5), maxLength);
    this.startScratch.set(
      start.x + this.dirScratch.x * lead,
      start.y + this.dirScratch.y * lead,
      start.z + this.dirScratch.z * lead
    );
    this.midScratch.set(
      this.startScratch.x + this.dirScratch.x * (beamLen * 0.5),
      this.startScratch.y + this.dirScratch.y * (beamLen * 0.5),
      this.startScratch.z + this.dirScratch.z * (beamLen * 0.5)
    );

    const slot = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.maxActive;

    slot.active = true;
    slot.life = duration;
    slot.maxLife = duration;
    slot.thickness = thickness;
    slot.beamLen = beamLen;

    slot.mesh.material = material;
    slot.mesh.position.copyFrom(this.midScratch);
    slot.mesh.lookAt(end);
    slot.mesh.scaling.set(thickness, thickness, beamLen);
    slot.mesh.visibility = 1.0;
    slot.mesh.setEnabled(true);
  }

  public update(dt: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const slot = this.pool[i];
      if (!slot.active) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.active = false;
        slot.life = 0;
        slot.mesh.setEnabled(false);
      } else {
        const ratio = slot.life / slot.maxLife;
        const widthScale = slot.thickness * (0.35 + 0.65 * ratio);
        slot.mesh.scaling.x = widthScale;
        slot.mesh.scaling.y = widthScale;
        slot.mesh.visibility = Math.pow(ratio, 0.85);
      }
    }
  }

  public clear(): void {
    this.cursor = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const slot = this.pool[i];
      slot.active = false;
      slot.life = 0;
      slot.mesh.setEnabled(false);
    }
  }

  public dispose(): void {
    this.clear();
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].mesh.dispose();
    }
    this.pool = [];
    this.poolRoot.dispose();
  }
}
