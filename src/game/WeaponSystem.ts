import {
  AbstractMesh,
  BaseTexture,
  Color3,
  Constants,
  Material,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointLight,
  Ray,
  Scene,
  StandardMaterial,
  TransformNode,
  UniversalCamera,
  Vector3,
} from '@babylonjs/core';
import { BotManager } from '../bots/BotManager';
import { TeamId } from '../maps/types';
import { AudioEngine } from './AudioEngine';
import {
  CasingKind,
  PooledTracerRingBuffer,
  computeAdsAttenuatedScale,
  getVfxQualityBudget,
  getWeaponFeelProfile,
} from './combatVfx';
import { GameMode, isHostile } from './gameModeRules';
import {
  normalizeGunId,
  normalizeKnifeCharmId,
  normalizeWeaponId,
} from './loadoutRules';
import { PlayerController } from './PlayerController';
import { applyProceduralSurfaceToMaterial, SurfacePresetId } from './proceduralTextures';
import {
  GUN_IDS,
  GraphicsQuality,
  GunId,
  HitMarkerState,
  HitZone,
  KNIFE_CHARMS,
  KnifeCharmId,
  WEAPONS,
  WeaponConfig,
  WeaponId,
  WeaponRuntimeState,
} from './types';

const CASING_POOL_CAPACITY = 24;
const IMPACT_POOL_CAPACITY = 64;
const DUST_POOL_CAPACITY = 24;
const DECAL_POOL_CAPACITY = 48;
const KNIFE_TRAIL_CAPACITY = 6;

type ImpactKind = 'environment' | 'character' | 'knife_env' | 'knife_character';

interface PooledCasingSlot {
  mesh: Mesh;
  active: boolean;
  vel: Vector3;
  spin: Vector3;
  life: number;
  maxLife: number;
  floorY: number;
}

interface PooledImpactSlot {
  mesh: Mesh;
  active: boolean;
  vel: Vector3;
  life: number;
  maxLife: number;
  gravity: number;
  baseScale: number;
}

interface PooledDustSlot {
  mesh: Mesh;
  active: boolean;
  vel: Vector3;
  life: number;
  maxLife: number;
}

interface PooledDecalSlot {
  mesh: Mesh;
  active: boolean;
}

interface WeaponModelRig {
  root: TransformNode;
  muzzlePoint: TransformNode;
  ejectionPort: TransformNode;
  hipPos: Vector3;
  adsPos: Vector3;
  adsRot: Vector3;
}

export interface NetworkShotPellet {
  endPoint: Vector3;
  targetId?: string;
  zone?: HitZone;
}

export interface NetworkShotPayload {
  muzzle: Vector3;
  endPoint: Vector3;
  weaponId: WeaponId;
  targetId?: string;
  zone?: HitZone;
  pellets?: NetworkShotPellet[];
}

export class WeaponSystem {
  private scene: Scene;
  private camera: UniversalCamera;
  private player: PlayerController;
  private bots: BotManager;
  private audio: AudioEngine;

  private weaponPivot: TransformNode;
  private models = new Map<WeaponId, WeaponModelRig>();
  private knifeWristPivot: TransformNode | null = null;
  private knifeHandMeshes: Mesh[] = [];
  private gunHandMeshes: Mesh[] = [];
  private charmPivot: TransformNode | null = null;
  private charmRoots = new Map<KnifeCharmId, TransformNode>();

  private muzzleFlashRoot: TransformNode;
  private muzzleFlashMeshes: Mesh[] = [];
  private muzzleFlashMat!: StandardMaterial;
  private muzzleFlashTimer = 0;
  private muzzleFlashMaxTimer = 0.045;
  private muzzleFlashBaseScale = 1;
  private muzzleLight: PointLight;
  private muzzleLightPeak = 0;
  private vmFillLight: PointLight;
  private vmRimLight: PointLight;

  private readonly rangeRay = new Ray(Vector3.Zero(), new Vector3(0, 0, 1), 160);
  private readonly forwardAxis = new Vector3(0, 0, 1);
  private readonly moveAxes = { forward: 0, right: 0 };
  private readonly rangePickPredicate = (mesh: AbstractMesh): boolean =>
    mesh.isPickable && mesh.isEnabled() && mesh !== this.player.collider;

  private equippedGunId: GunId = 'ak47';
  private queuedGunId: GunId = 'ak47';
  private activeSlot: 1 | 2 = 1;
  private activeId: WeaponId = 'ak47';
  private knifeCharmId: KnifeCharmId = 'tactical_tag';

  private slots: Record<GunId, WeaponRuntimeState> = {
    shotgun: { id: 'shotgun', ammoInMag: WEAPONS.shotgun.magSize, reserveAmmo: WEAPONS.shotgun.reserveMax },
    ak47: { id: 'ak47', ammoInMag: WEAPONS.ak47.magSize, reserveAmmo: WEAPONS.ak47.reserveMax },
    smg: { id: 'smg', ammoInMag: WEAPONS.smg.magSize, reserveAmmo: WEAPONS.smg.reserveMax },
    sniper: { id: 'sniper', ammoInMag: WEAPONS.sniper.magSize, reserveAmmo: WEAPONS.sniper.reserveMax },
    pistol: { id: 'pistol', ammoInMag: WEAPONS.pistol.magSize, reserveAmmo: WEAPONS.pistol.reserveMax },
  };

  private gunFireCooldown = 0;
  private knifeCooldown = 0;
  private semiTriggerConsumed = false;
  private isReloading = false;
  private reloadElapsed = 0;
  private reloadMagClickPlayed = false;
  private reloadSpeedMultiplier = 1.0;

  private slashTimer = 0;
  private slashDuration = 0.3;
  private readonly slashPrimaryDuration = 0.3;
  private readonly stabSecondaryDuration = 0.36;
  private knifeAttackMode: 'slash' | 'stab' = 'slash';
  private knifeEquipTimer = 0;
  private readonly knifeEquipDuration = 0.34;
  private slashSide = 1;
  private quickMeleeReturnSlot: 1 | 2 | null = null;

  private spreadBloom = 0;
  private kickBackZ = 0;
  private kickRotX = 0;
  private kickYaw = 0;
  private kickRoll = 0;
  private smgJitterDir = 1;
  private vmLandDip = 0;
  private cycleImpulseTimer = 0;
  private cycleImpulseWeapon: WeaponId | null = null;
  private pendingCasingTimer = 0;
  private pendingCasingWeapon: WeaponId | null = null;
  private bobTimer = 0;
  private swayRoll = 0;
  private swayPitch = 0;
  private equipDrop = 0;
  private charmSwingX = 0;
  private charmSwingZ = 0;
  private charmVelX = 0;
  private charmVelZ = 0;
  private viewModelVisible = false;

  private graphicsQuality: GraphicsQuality = 'HIGH';
  private vfxPoolRoot: TransformNode;
  private tracerPool: PooledTracerRingBuffer;
  private casingPool: PooledCasingSlot[] = [];
  private casingCursor = 0;
  private impactPool: PooledImpactSlot[] = [];
  private impactCursor = 0;
  private dustPool: PooledDustSlot[] = [];
  private dustCursor = 0;
  private decalPool: PooledDecalSlot[] = [];
  private decalCursor = 0;
  private knifeTrailMeshes: Mesh[] = [];

  private decalMaterial: StandardMaterial;
  private tracerMaterial: StandardMaterial;
  private tracerSuppMaterial: StandardMaterial;
  private brassMaterial: PBRMaterial;
  private shotgunHullMaterial: PBRMaterial;
  private impactMatTarget: StandardMaterial;
  private impactMatHeadshot: StandardMaterial;
  private impactMatSparkA: StandardMaterial;
  private impactMatSparkB: StandardMaterial;
  private impactMatKnifeClang: StandardMaterial;
  private dustMaterial: StandardMaterial;
  private knifeTrailMaterial: StandardMaterial;
  private materialsToDispose: Material[] = [];
  private texturesToDispose: BaseTexture[] = [];

  private shotsFired = 0;
  private shotsHit = 0;
  private headshots = 0;
  private eliminations = 0;
  private hitMarkerCounter = 0;
  private lastHitMarker: HitMarkerState | null = null;
  private rangeDistanceMeters: number | null = null;
  private targetingEnemy = false;
  private scopeMagnification: 4 | 6 | 8 = 4;

  private multiplayerMode = false;
  private gameMode: GameMode = 'tdm';
  private localTeam: TeamId = 'blue';
  private friendlyFire = false;
  private onNetworkShot?: (payload: NetworkShotPayload) => void;
  private onOfflineKill?: (info: {
    victimId: string;
    victimName: string;
    headshot: boolean;
    distanceMeters: number;
  }) => void;

  constructor(
    scene: Scene,
    camera: UniversalCamera,
    player: PlayerController,
    bots: BotManager,
    audio: AudioEngine,
    onNetworkShot?: (payload: NetworkShotPayload) => void,
    onOfflineKill?: (info: {
      victimId: string;
      victimName: string;
      headshot: boolean;
      distanceMeters: number;
    }) => void,
    initialGunId: GunId = 'ak47',
    initialCharmId: KnifeCharmId = 'tactical_tag'
  ) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.bots = bots;
    this.audio = audio;
    this.onNetworkShot = onNetworkShot;
    this.onOfflineKill = onOfflineKill;

    this.equippedGunId = normalizeGunId(initialGunId);
    this.queuedGunId = this.equippedGunId;
    this.activeId = this.equippedGunId;
    this.knifeCharmId = normalizeKnifeCharmId(initialCharmId);

    this.weaponPivot = new TransformNode('weaponPivot', this.scene);
    this.weaponPivot.parent = this.camera;

    this.vfxPoolRoot = new TransformNode('weaponVfxPoolRoot', this.scene);

    this.muzzleFlashRoot = this.createMuzzleFlash();
    this.muzzleLight = new PointLight('muzzleLight', Vector3.Zero(), this.scene);
    this.muzzleLight.diffuse = new Color3(1.0, 0.72, 0.35);
    this.muzzleLight.specular = new Color3(1.0, 0.8, 0.45);
    this.muzzleLight.intensity = 0;
    this.muzzleLight.range = 8.5;
    this.muzzleLight.shadowEnabled = false;
    this.muzzleLight.parent = this.weaponPivot;

    this.vmFillLight = new PointLight('vmFillLight', new Vector3(0.16, 0.2, 0.04), this.scene);
    this.vmFillLight.parent = this.camera;
    this.vmFillLight.diffuse = new Color3(1.0, 0.97, 0.92);
    this.vmFillLight.specular = new Color3(0.44, 0.45, 0.48);
    this.vmFillLight.intensity = 0.84;
    this.vmFillLight.range = 1.9;
    this.vmFillLight.shadowEnabled = false;

    this.vmRimLight = new PointLight('vmRimLight', new Vector3(-0.3, 0.1, 0.44), this.scene);
    this.vmRimLight.parent = this.camera;
    this.vmRimLight.diffuse = new Color3(0.56, 0.74, 0.98);
    this.vmRimLight.specular = new Color3(0.28, 0.34, 0.44);
    this.vmRimLight.intensity = 0.48;
    this.vmRimLight.range = 2.25;
    this.vmRimLight.shadowEnabled = false;

    this.decalMaterial = new StandardMaterial('bulletDecalMat', this.scene);
    this.decalMaterial.diffuseColor = new Color3(0.05, 0.05, 0.06);
    this.decalMaterial.specularColor = Color3.Black();
    this.decalMaterial.alpha = 0.88;
    this.decalMaterial.zOffset = -2;

    this.tracerMaterial = new StandardMaterial('tracerGlowMat', this.scene);
    this.tracerMaterial.disableLighting = true;
    this.tracerMaterial.diffuseColor = Color3.Black();
    this.tracerMaterial.emissiveColor = new Color3(1.85, 1.18, 0.38);
    this.tracerMaterial.alpha = 0.95;
    this.tracerMaterial.alphaMode = Constants.ALPHA_ADD;
    this.tracerMaterial.disableDepthWrite = true;

    this.tracerSuppMaterial = new StandardMaterial('tracerSuppGlowMat', this.scene);
    this.tracerSuppMaterial.disableLighting = true;
    this.tracerSuppMaterial.diffuseColor = Color3.Black();
    this.tracerSuppMaterial.emissiveColor = new Color3(1.15, 0.98, 0.58);
    this.tracerSuppMaterial.alpha = 0.9;
    this.tracerSuppMaterial.alphaMode = Constants.ALPHA_ADD;
    this.tracerSuppMaterial.disableDepthWrite = true;

    this.brassMaterial = new PBRMaterial('brassCasingMat', this.scene);
    this.brassMaterial.albedoColor = Color3.FromHexString('#d4a64a');
    this.brassMaterial.metallic = 0.95;
    this.brassMaterial.roughness = 0.24;

    this.shotgunHullMaterial = new PBRMaterial('shotgunHullCasingMat', this.scene);
    this.shotgunHullMaterial.albedoColor = Color3.FromHexString('#c81e1e');
    this.shotgunHullMaterial.metallic = 0.22;
    this.shotgunHullMaterial.roughness = 0.38;
    this.shotgunHullMaterial.clearCoat.isEnabled = true;
    this.shotgunHullMaterial.clearCoat.intensity = 0.45;
    this.shotgunHullMaterial.clearCoat.roughness = 0.2;

    this.impactMatTarget = new StandardMaterial('impactMatTarget', this.scene);
    this.impactMatTarget.disableLighting = true;
    this.impactMatTarget.diffuseColor = Color3.Black();
    this.impactMatTarget.emissiveColor = new Color3(1.45, 0.24, 0.2);
    this.impactMatTarget.alpha = 0.94;
    this.impactMatTarget.alphaMode = Constants.ALPHA_ADD;
    this.impactMatTarget.disableDepthWrite = true;

    this.impactMatHeadshot = new StandardMaterial('impactMatHeadshot', this.scene);
    this.impactMatHeadshot.disableLighting = true;
    this.impactMatHeadshot.diffuseColor = Color3.Black();
    this.impactMatHeadshot.emissiveColor = new Color3(1.85, 1.15, 0.22);
    this.impactMatHeadshot.alpha = 0.96;
    this.impactMatHeadshot.alphaMode = Constants.ALPHA_ADD;
    this.impactMatHeadshot.disableDepthWrite = true;

    this.impactMatSparkA = new StandardMaterial('impactMatSparkA', this.scene);
    this.impactMatSparkA.disableLighting = true;
    this.impactMatSparkA.diffuseColor = Color3.Black();
    this.impactMatSparkA.emissiveColor = new Color3(1.65, 0.96, 0.34);
    this.impactMatSparkA.alpha = 0.95;
    this.impactMatSparkA.alphaMode = Constants.ALPHA_ADD;
    this.impactMatSparkA.disableDepthWrite = true;

    this.impactMatSparkB = new StandardMaterial('impactMatSparkB', this.scene);
    this.impactMatSparkB.disableLighting = true;
    this.impactMatSparkB.diffuseColor = Color3.Black();
    this.impactMatSparkB.emissiveColor = new Color3(1.3, 1.35, 1.5);
    this.impactMatSparkB.alpha = 0.95;
    this.impactMatSparkB.alphaMode = Constants.ALPHA_ADD;
    this.impactMatSparkB.disableDepthWrite = true;

    this.impactMatKnifeClang = new StandardMaterial('impactMatKnifeClang', this.scene);
    this.impactMatKnifeClang.disableLighting = true;
    this.impactMatKnifeClang.diffuseColor = Color3.Black();
    this.impactMatKnifeClang.emissiveColor = new Color3(1.15, 1.48, 1.9);
    this.impactMatKnifeClang.alpha = 0.95;
    this.impactMatKnifeClang.alphaMode = Constants.ALPHA_ADD;
    this.impactMatKnifeClang.disableDepthWrite = true;

    this.dustMaterial = new StandardMaterial('impactDustMat', this.scene);
    this.dustMaterial.disableLighting = true;
    this.dustMaterial.diffuseColor = Color3.Black();
    this.dustMaterial.emissiveColor = new Color3(0.42, 0.39, 0.34);
    this.dustMaterial.alpha = 0.38;
    this.dustMaterial.disableDepthWrite = true;

    this.knifeTrailMaterial = new StandardMaterial('knifeTrailMat', this.scene);
    this.knifeTrailMaterial.disableLighting = true;
    this.knifeTrailMaterial.diffuseColor = Color3.Black();
    this.knifeTrailMaterial.emissiveColor = new Color3(0.95, 1.15, 1.45);
    this.knifeTrailMaterial.alpha = 0.6;
    this.knifeTrailMaterial.alphaMode = Constants.ALPHA_ADD;
    this.knifeTrailMaterial.disableDepthWrite = true;

    this.materialsToDispose.push(
      this.decalMaterial,
      this.tracerMaterial,
      this.tracerSuppMaterial,
      this.brassMaterial,
      this.shotgunHullMaterial,
      this.impactMatTarget,
      this.impactMatHeadshot,
      this.impactMatSparkA,
      this.impactMatSparkB,
      this.impactMatKnifeClang,
      this.dustMaterial,
      this.knifeTrailMaterial
    );

    this.tracerPool = new PooledTracerRingBuffer(this.scene, 'playerTracerPool', 40);
    this.initVfxPools();

    this.buildAllWeaponModels();
    this.bindViewModelLights();
    this.applyCharmVisibility();
    this.selectWeapon(this.equippedGunId, true);
    this.setViewModelVisible(false);
  }

  public getEquippedGunId(): GunId {
    return this.equippedGunId;
  }

  public getQueuedGunId(): GunId {
    return this.queuedGunId;
  }

  public getKnifeCharmId(): KnifeCharmId {
    return this.knifeCharmId;
  }

  public getActiveSlot(): 1 | 2 {
    return this.activeSlot;
  }

  public setEquippedGun(id: GunId): void {
    const gunId = normalizeGunId(id);
    this.equippedGunId = gunId;
    this.queuedGunId = gunId;
    this.quickMeleeReturnSlot = null;
    if (this.activeSlot === 1) {
      this.selectWeapon(gunId, !this.viewModelVisible);
    }
  }

  public setQueuedGun(id: GunId): void {
    this.queuedGunId = normalizeGunId(id);
  }

  public applyQueuedGunOnRespawn(): void {
    const nextGun = normalizeGunId(this.queuedGunId);
    this.equippedGunId = nextGun;
    this.queuedGunId = nextGun;
    this.activeSlot = 1;
    this.quickMeleeReturnSlot = null;
    this.slashTimer = 0;
    this.resetForLife();
    this.selectWeapon(nextGun, true);
  }

  public setKnifeCharm(id: KnifeCharmId): void {
    this.knifeCharmId = normalizeKnifeCharmId(id);
    this.applyCharmVisibility();
  }

  public setReloadSpeedMultiplier(mult: number): void {
    this.reloadSpeedMultiplier = Math.max(0.8, Math.min(2.2, mult));
  }

  public setGraphicsQuality(quality: GraphicsQuality): void {
    this.graphicsQuality = quality;
    const budget = getVfxQualityBudget(quality);
    this.tracerPool.setMaxActive(budget.maxTracers);

    for (let i = budget.maxDecals; i < this.decalPool.length; i++) {
      if (this.decalPool[i].active) {
        this.decalPool[i].active = false;
        this.decalPool[i].mesh.setEnabled(false);
      }
    }
    if (this.decalCursor >= budget.maxDecals) {
      this.decalCursor = 0;
    }

    if (!budget.casingsEnabled) {
      for (const slot of this.casingPool) {
        if (slot.active) {
          slot.active = false;
          slot.mesh.setEnabled(false);
        }
      }
      this.pendingCasingTimer = 0;
      this.pendingCasingWeapon = null;
    } else {
      for (let i = budget.maxCasings; i < this.casingPool.length; i++) {
        if (this.casingPool[i].active) {
          this.casingPool[i].active = false;
          this.casingPool[i].mesh.setEnabled(false);
        }
      }
      if (this.casingCursor >= budget.maxCasings) {
        this.casingCursor = 0;
      }
    }

    if (!budget.muzzleLightEnabled) {
      this.muzzleLight.intensity = 0;
      this.muzzleLightPeak = 0;
    }
  }

  public clearDecals(): void {
    for (const slot of this.decalPool) {
      slot.active = false;
      slot.mesh.setEnabled(false);
    }
    this.decalCursor = 0;
  }

  public setViewModelVisible(visible: boolean): void {
    this.viewModelVisible = visible;
    this.weaponPivot.setEnabled(visible);
    this.vmFillLight.setEnabled(visible);
    this.vmRimLight.setEnabled(visible);
    if (!visible) {
      this.muzzleFlashRoot.setEnabled(false);
      this.muzzleLight.intensity = 0;
      this.muzzleLightPeak = 0;
      this.muzzleFlashTimer = 0;
      this.pendingCasingTimer = 0;
      this.pendingCasingWeapon = null;
      this.cycleImpulseTimer = 0;
      this.cycleImpulseWeapon = null;
      this.hideKnifeTrail();
    }
  }

  public setMultiplayerContext(enabled: boolean, team: TeamId, friendlyFire: boolean): void {
    this.multiplayerMode = enabled;
    this.localTeam = team;
    this.friendlyFire = friendlyFire;
  }

  public setGameMode(mode: GameMode): void {
    this.gameMode = mode;
  }

  private isTargetHostile(targetId: string | undefined, targetTeam: TeamId | undefined): boolean {
    if (!targetId || !targetTeam) return false;
    return isHostile(
      this.gameMode,
      { id: this.multiplayerMode ? 'local_player' : 'player', team: this.localTeam },
      { id: targetId, team: targetTeam },
      this.friendlyFire
    );
  }

  public recordNetworkHitConfirm(zone: HitZone, killed: boolean): void {
    this.shotsHit += 1;
    if (zone === 'head') {
      this.headshots += 1;
    }
    if (killed) {
      this.eliminations += 1;
    }
    this.lastHitMarker = {
      id: ++this.hitMarkerCounter,
      zone,
      killed,
      timestamp: performance.now(),
    };
    this.audio.playHitMarker(zone === 'head');
  }

  public cycleScopeMagnification(): void {
    if (this.activeId !== 'sniper') return;
    this.scopeMagnification =
      this.scopeMagnification === 4 ? 6 : this.scopeMagnification === 6 ? 8 : 4;
    this.audio.playReloadMagIn();
  }

  public getScopeMagnification(): 4 | 6 | 8 {
    return this.scopeMagnification;
  }

  public getActiveConfig(): WeaponConfig {
    const cfg = WEAPONS[this.activeId];
    if (this.activeId === 'sniper') {
      const fovRatio =
        this.scopeMagnification === 4 ? 0.25 : this.scopeMagnification === 6 ? 0.165 : 0.125;
      return { ...cfg, adsFovRatio: fovRatio };
    }
    return cfg;
  }

  public getWeaponSlots(): WeaponRuntimeState[] {
    const gunSlot = this.slots[this.equippedGunId];
    return [
      { ...gunSlot },
      { id: 'knife', ammoInMag: 0, reserveAmmo: 0 },
    ];
  }

  public getIsReloading(): boolean {
    return this.isReloading;
  }

  public getReloadProgress(): number {
    if (!this.isReloading) return 0;
    return Math.min(
      1,
      this.reloadElapsed / (this.getActiveConfig().reloadTimeSec / this.reloadSpeedMultiplier)
    );
  }

  public getCrosshairSpreadPx(): number {
    if (this.activeId === 'knife') {
      return 6;
    }
    const spreadRad = this.computeCurrentSpread();
    return Math.round(6 + spreadRad * 520);
  }

  public getStats() {
    return {
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      headshots: this.headshots,
      eliminations: this.eliminations,
      hitMarker: this.lastHitMarker,
      rangeDistanceMeters: this.rangeDistanceMeters,
      targetingEnemy: this.targetingEnemy,
    };
  }

  public selectSlot(slot: 1 | 2): void {
    this.quickMeleeReturnSlot = null;
    this.activeSlot = slot;
    this.selectWeapon(slot === 2 ? 'knife' : this.equippedGunId);
  }

  public cycleSlot(delta: 1 | -1): void {
    const slotOrder: ReadonlyArray<1 | 2> = [1, 2];
    const currentIdx = slotOrder.indexOf(this.activeSlot);
    const nextIdx = (currentIdx + delta + slotOrder.length) % slotOrder.length;
    this.selectSlot(slotOrder[nextIdx]);
  }

  public triggerQuickMelee(): void {
    if (!this.viewModelVisible) return;
    if (this.knifeCooldown > 0) return;
    if (this.activeSlot !== 2) {
      this.quickMeleeReturnSlot = 1;
      this.activeSlot = 2;
      this.selectWeapon('knife', true);
      this.equipDrop = 0.04;
    }
    this.knifeAttackMode = 'stab';
    this.tryFire();
    this.semiTriggerConsumed = true;
  }

  public onSecondaryFire(): void {
    if (!this.viewModelVisible) return;
    if (this.activeId !== 'knife') return;
    if (this.knifeCooldown > 0) return;
    this.knifeAttackMode = 'stab';
    this.tryFire();
  }

  public cancelTransientActions(): void {
    this.isReloading = false;
    this.reloadElapsed = 0;
    this.reloadMagClickPlayed = false;
    this.slashTimer = 0;
    this.knifeEquipTimer = 0;
    this.knifeAttackMode = 'slash';
    this.quickMeleeReturnSlot = null;
    this.semiTriggerConsumed = false;
    this.muzzleFlashTimer = 0;
    this.muzzleFlashRoot.setEnabled(false);
    this.muzzleLight.intensity = 0;
    this.muzzleLightPeak = 0;
    this.pendingCasingTimer = 0;
    this.pendingCasingWeapon = null;
    this.cycleImpulseTimer = 0;
    this.cycleImpulseWeapon = null;
    this.kickBackZ = 0;
    this.kickRotX = 0;
    this.kickYaw = 0;
    this.kickRoll = 0;
    this.vmLandDip = 0;
    this.hideKnifeTrail();
    this.player.resetTransientMotion();
  }

  public selectWeapon(id: WeaponId, silent = false): void {
    const normalizedId = normalizeWeaponId(id, this.equippedGunId);
    const targetEnabled = this.models.get(normalizedId)?.root.isEnabled() ?? false;
    if (normalizedId !== 'knife') {
      const nextGunId = normalizeGunId(normalizedId, this.equippedGunId);
      this.equippedGunId = nextGunId;
      const gunSlot = this.slots[nextGunId];
      const gunCfg = WEAPONS[nextGunId];
      gunSlot.ammoInMag = Math.max(0, Math.min(gunCfg.magSize, gunSlot.ammoInMag));
      gunSlot.reserveAmmo = Math.max(0, Math.min(gunCfg.reserveMax, gunSlot.reserveAmmo));
    }
    this.isReloading = false;
    this.reloadElapsed = 0;
    this.reloadMagClickPlayed = false;
    this.semiTriggerConsumed = false;
    this.muzzleFlashTimer = 0;
    this.muzzleFlashRoot.setEnabled(false);
    this.muzzleLight.intensity = 0;
    this.muzzleLightPeak = 0;
    this.pendingCasingTimer = 0;
    this.pendingCasingWeapon = null;
    this.cycleImpulseTimer = 0;
    this.cycleImpulseWeapon = null;
    this.kickBackZ = 0;
    this.kickRotX = 0;
    this.kickYaw = 0;
    this.kickRoll = 0;
    this.hideKnifeTrail();
    this.activeId = normalizedId;
    this.activeSlot = normalizedId === 'knife' ? 2 : 1;

    const cfg = WEAPONS[normalizedId];
    this.player.setWeaponSpeedMultiplier(cfg.moveSpeedMultiplier ?? 1.0);
    this.player.setAdsEnabled(normalizedId !== 'knife');

    if (this.activeId !== 'knife') {
      this.slashTimer = 0;
      this.knifeEquipTimer = 0;
      this.knifeAttackMode = 'slash';
    } else if (!silent && !targetEnabled) {
      this.knifeEquipTimer = this.knifeEquipDuration;
      this.charmVelZ += 10;
      this.charmVelX -= 8;
    }

    if (!silent && !targetEnabled) {
      this.equipDrop = normalizedId === 'knife' ? 0.11 : 0.14;
      this.audio.playWeaponEquip();
    }

    this.models.forEach((rig, key) => {
      rig.root.setEnabled(key === normalizedId);
    });

    const activeRig = this.models.get(normalizedId);
    if (activeRig) {
      this.muzzleFlashRoot.parent = activeRig.muzzlePoint;
      this.muzzleFlashRoot.position.setAll(0);
      this.muzzleLight.parent = activeRig.muzzlePoint;
      this.muzzleLight.position.setAll(0);
    }
  }

  public onFirePress(): void {
    if (!this.viewModelVisible) return;
    const cfg = this.getActiveConfig();
    if (cfg.id === 'knife') {
      this.knifeAttackMode = 'slash';
      this.tryFire();
      this.semiTriggerConsumed = true;
      return;
    }
    if (cfg.fireMode === 'semi') {
      this.tryFire();
      this.semiTriggerConsumed = true;
    } else {
      this.tryFire();
    }
  }

  public onFireRelease(): void {
    this.semiTriggerConsumed = false;
  }

  public startReload(): void {
    if (this.isReloading || !this.viewModelVisible) return;
    if (this.activeId === 'knife') return;
    const cfg = this.getActiveConfig();
    const state = this.slots[this.equippedGunId];
    if (state.ammoInMag >= cfg.magSize) return;
    if (state.reserveAmmo <= 0) return;

    this.pendingCasingTimer = 0;
    this.pendingCasingWeapon = null;
    this.cycleImpulseTimer = 0;
    this.cycleImpulseWeapon = null;
    this.isReloading = true;
    this.reloadElapsed = 0;
    this.reloadMagClickPlayed = false;
    this.audio.playReloadStart();
  }

  public resupplyAll(): void {
    GUN_IDS.forEach((id) => {
      this.slots[id].ammoInMag = WEAPONS[id].magSize;
      this.slots[id].reserveAmmo = WEAPONS[id].reserveMax;
    });
    this.isReloading = false;
    this.reloadElapsed = 0;
    this.reloadMagClickPlayed = false;
    this.semiTriggerConsumed = false;
  }

  public resetForLife(): void {
    this.resupplyAll();
    this.gunFireCooldown = 0;
    this.knifeCooldown = 0;
    this.semiTriggerConsumed = false;
    this.slashTimer = 0;
    this.knifeEquipTimer = 0;
    this.knifeAttackMode = 'slash';
    this.quickMeleeReturnSlot = null;
    if (this.knifeWristPivot) {
      this.knifeWristPivot.rotation.setAll(0);
      this.knifeWristPivot.position.setAll(0);
    }
    this.muzzleFlashTimer = 0;
    this.muzzleFlashRoot.setEnabled(false);
    this.muzzleLight.intensity = 0;
    this.muzzleLightPeak = 0;
    this.pendingCasingTimer = 0;
    this.pendingCasingWeapon = null;
    this.cycleImpulseTimer = 0;
    this.cycleImpulseWeapon = null;
    this.lastHitMarker = null;
    this.spreadBloom = 0;
    this.kickBackZ = 0;
    this.kickRotX = 0;
    this.kickYaw = 0;
    this.kickRoll = 0;
    this.vmLandDip = 0;
    this.swayRoll = 0;
    this.swayPitch = 0;
    this.bobTimer = 0;
    this.equipDrop = 0;
    this.charmSwingX = 0;
    this.charmSwingZ = 0;
    this.charmVelX = 0;
    this.charmVelZ = 0;
    this.rangeDistanceMeters = null;
    this.targetingEnemy = false;
    this.hideKnifeTrail();
    this.clearTransientEffects();

    const activeRig = this.models.get(this.activeId);
    if (activeRig) {
      activeRig.root.setEnabled(true);
      this.weaponPivot.position.copyFrom(activeRig.hipPos);
      this.weaponPivot.rotation.setAll(0);
    }
    this.player.setWeaponSpeedMultiplier(WEAPONS[this.activeId].moveSpeedMultiplier ?? 1.0);
    this.player.setAdsEnabled(this.activeId !== 'knife');
  }

  public resetForNewMatch(): void {
    this.activeSlot = 1;
    this.activeId = this.equippedGunId;
    this.selectWeapon(this.equippedGunId, true);
    this.resetForLife();
    this.clearDecals();
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.headshots = 0;
    this.eliminations = 0;
  }

  public update(dt: number): void {
    const clampedDt = Math.min(dt, 0.05);

    this.gunFireCooldown = Math.max(0, this.gunFireCooldown - clampedDt);
    this.knifeCooldown = Math.max(0, this.knifeCooldown - clampedDt);
    this.spreadBloom = Math.max(0, this.spreadBloom - clampedDt * 0.045);

    if (this.pendingCasingTimer > 0) {
      this.pendingCasingTimer = Math.max(0, this.pendingCasingTimer - clampedDt);
      if (this.pendingCasingTimer === 0 && this.pendingCasingWeapon) {
        const targetWeapon = this.pendingCasingWeapon;
        this.pendingCasingWeapon = null;
        if (this.viewModelVisible && this.activeId === targetWeapon && !this.isReloading) {
          this.ejectCasingForWeapon(targetWeapon);
        }
      }
    }

    if (this.cycleImpulseTimer > 0) {
      this.cycleImpulseTimer = Math.max(0, this.cycleImpulseTimer - clampedDt);
      if (this.cycleImpulseTimer === 0 && this.cycleImpulseWeapon) {
        const w = this.cycleImpulseWeapon;
        this.cycleImpulseWeapon = null;
        if (this.viewModelVisible && this.activeId === w && !this.isReloading) {
          if (w === 'shotgun') {
            this.kickBackZ = Math.min(0.16, this.kickBackZ + 0.032);
            this.kickRoll += 0.04;
          } else if (w === 'sniper') {
            this.kickRotX = Math.min(0.28, this.kickRotX + 0.035);
            this.kickRoll -= 0.055;
          }
        }
      }
    }

    if (this.knifeEquipTimer > 0) {
      this.knifeEquipTimer = Math.max(0, this.knifeEquipTimer - clampedDt);
    }

    if (this.slashTimer > 0) {
      this.slashTimer = Math.max(0, this.slashTimer - clampedDt);
      this.updateKnifeTrail();
      if (this.slashTimer === 0 && this.quickMeleeReturnSlot === 1 && this.activeSlot === 2) {
        this.quickMeleeReturnSlot = null;
        this.activeSlot = 1;
        this.selectWeapon(this.equippedGunId);
      }
    } else {
      this.hideKnifeTrail();
    }

    if (this.isReloading && this.viewModelVisible && this.activeId !== 'knife') {
      this.reloadElapsed += clampedDt;
      const cfg = this.getActiveConfig();
      const effectiveReloadTime = cfg.reloadTimeSec / this.reloadSpeedMultiplier;
      if (!this.reloadMagClickPlayed && this.reloadElapsed >= effectiveReloadTime * 0.52) {
        this.reloadMagClickPlayed = true;
        this.audio.playReloadMagIn();
      }
      if (this.reloadElapsed >= effectiveReloadTime) {
        const state = this.slots[this.equippedGunId];
        const needed = cfg.magSize - state.ammoInMag;
        const transfer = Math.min(needed, state.reserveAmmo);
        state.ammoInMag += transfer;
        state.reserveAmmo -= transfer;
        this.isReloading = false;
        this.reloadElapsed = 0;
        this.reloadMagClickPlayed = false;
        this.audio.playReloadComplete();
      }
    }

    if (this.viewModelVisible && this.player.getIsFireHeld()) {
      const cfg = this.getActiveConfig();
      if (cfg.fireMode === 'auto') {
        this.tryFire();
      } else if (!this.semiTriggerConsumed) {
        this.tryFire();
        this.semiTriggerConsumed = true;
      }
    }

    if (this.viewModelVisible) {
      this.updateRangefinder();
    } else {
      this.rangeDistanceMeters = null;
      this.targetingEnemy = false;
    }

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - clampedDt);
      if (this.muzzleFlashTimer === 0) {
        this.muzzleFlashRoot.setEnabled(false);
        this.muzzleLight.intensity = 0;
      } else {
        const ratio = this.muzzleFlashTimer / Math.max(0.001, this.muzzleFlashMaxTimer);
        this.muzzleFlashMat.alpha = 0.95 * ratio;
        this.muzzleFlashMat.emissiveColor.set(
          1.85 * ratio,
          1.2 * ratio * ratio,
          0.45 * ratio * ratio
        );
        const s = this.muzzleFlashBaseScale * (0.58 + 0.42 * ratio);
        this.muzzleFlashRoot.scaling.set(s, s, s * (0.75 + 0.35 * ratio));
        if (this.muzzleLightPeak > 0) {
          this.muzzleLight.intensity = this.muzzleLightPeak * ratio * ratio;
        } else {
          this.muzzleLight.intensity = 0;
        }
      }
    }

    this.updateTransients(clampedDt);

    if (this.lastHitMarker && performance.now() - this.lastHitMarker.timestamp > 180) {
      this.lastHitMarker = null;
    }

    if (this.viewModelVisible) {
      this.updateViewModelTransform(clampedDt);
    }
  }

  private tryFire(): void {
    if (this.isReloading) return;

    const cfg = this.getActiveConfig();
    const feel = getWeaponFeelProfile(cfg.id);

    if (cfg.isMelee || cfg.id === 'knife') {
      if (this.knifeCooldown > 0) return;
      const isStab = this.knifeAttackMode === 'stab';
      this.knifeCooldown = (60 / cfg.rpm) * (isStab ? 1.15 : 1.0);
      this.slashDuration = isStab ? this.stabSecondaryDuration : this.slashPrimaryDuration;
      this.slashTimer = this.slashDuration;
      this.knifeEquipTimer = 0;
      if (!isStab) {
        this.slashSide = -this.slashSide;
      }
      this.kickBackZ = Math.min(0.12, this.kickBackZ + (isStab ? -0.05 : feel.kickBack));
      this.kickRotX = Math.min(0.2, this.kickRotX + (isStab ? 0.04 : feel.kickRotX));
      this.player.addFovKick(feel.fovKickRad * (isStab ? 1.35 : 1.0));
      this.audio.playKnifeSlash();
      this.charmVelZ += (isStab ? 1 : Math.random() > 0.5 ? 1 : -1) * (isStab ? 18 : 14);
      this.charmVelX += isStab ? 16 : 11;
      this.performMeleeStrike(cfg);
      return;
    }

    if (this.gunFireCooldown > 0) return;

    const state = this.slots[this.equippedGunId];

    if (state.ammoInMag <= 0) {
      this.gunFireCooldown = 0.2;
      this.audio.playDryFire();
      this.startReload();
      return;
    }

    state.ammoInMag -= 1;
    this.gunFireCooldown = 60 / cfg.rpm;
    this.shotsFired += 1;

    if (state.ammoInMag > 0 && state.ammoInMag === Math.ceil(cfg.magSize * 0.2)) {
      this.audio.playLowAmmoWarning();
    }

    this.audio.playGunshot(cfg.id);

    const adsBlend = this.player.getAdsBlend();
    const vmKickScale = computeAdsAttenuatedScale(adsBlend, feel.adsAttenuation);

    this.kickBackZ = Math.min(0.17, this.kickBackZ + feel.kickBack * vmKickScale);
    this.kickRotX = Math.min(0.28, this.kickRotX + feel.kickRotX * vmKickScale);

    if (cfg.id === 'smg') {
      this.smgJitterDir = -this.smgJitterDir;
      const jitterSign = Math.random() > 0.2 ? this.smgJitterDir : -this.smgJitterDir;
      this.kickYaw = Math.max(-0.08, Math.min(0.08, this.kickYaw + jitterSign * feel.kickYaw * (0.7 + Math.random() * 0.6) * vmKickScale));
      this.kickRoll = Math.max(-0.09, Math.min(0.09, this.kickRoll + jitterSign * feel.kickRoll * vmKickScale));
    } else {
      const yawJitter = (Math.random() * 2 - 1) * feel.kickYaw * vmKickScale;
      const rollDir = cfg.id === 'shotgun' ? -1 : Math.random() > 0.5 ? 1 : -1;
      this.kickYaw = Math.max(-0.08, Math.min(0.08, this.kickYaw + yawJitter));
      this.kickRoll = Math.max(-0.1, Math.min(0.1, this.kickRoll + rollDir * feel.kickRoll * vmKickScale));
    }

    const adsRecoilScale = this.player.getIsAds() ? 0.68 : 1.0;
    const yawRand = (Math.random() * 2 - 1) * cfg.recoilYaw * adsRecoilScale;
    const pitchKick = cfg.recoilPitch * (0.85 + Math.random() * 0.3) * adsRecoilScale;
    this.player.addRecoil(pitchKick, yawRand);
    this.player.addFovKick(feel.fovKickRad * vmKickScale);

    this.triggerMuzzleFlash(cfg.suppressed, feel.muzzleScale);
    this.scheduleOrSpawnShellCasing(cfg.id, feel);
    if (feel.boltCyclePulseAtSec > 0) {
      this.cycleImpulseTimer = feel.boltCyclePulseAtSec;
      this.cycleImpulseWeapon = cfg.id;
    }

    this.performHitscan(cfg, feel);

    this.spreadBloom = Math.min(0.032, this.spreadBloom + (cfg.id === 'smg' ? 0.0038 : 0.0055));
  }

  private performMeleeStrike(cfg: WeaponConfig): void {
    const origin = this.camera.globalPosition.clone();
    const forward = this.camera.getDirection(Vector3.Forward()).normalize();
    const right = this.camera.getDirection(Vector3.Right()).normalize();
    const up = this.camera.getDirection(Vector3.Up()).normalize();

    const offsets = [
      Vector3.Zero(),
      right.scale(0.08),
      right.scale(-0.08),
      up.scale(0.06),
      up.scale(-0.06),
    ];

    let bestEnemyPick: ReturnType<Scene['pickWithRay']> = null;
    let bestWorldPick: ReturnType<Scene['pickWithRay']> = null;

    for (const offset of offsets) {
      const dir = forward.add(offset).normalize();
      const ray = new Ray(origin, dir, cfg.range);
      const pick = this.scene.pickWithRay(
        ray,
        (mesh) => mesh.isPickable && mesh.isEnabled() && mesh !== this.player.collider
      );
      if (!pick?.hit || !pick.pickedMesh || !pick.pickedPoint) continue;

      const meta = pick.pickedMesh.metadata as
        | { isBot?: boolean; botId?: string; isRemotePlayer?: boolean; playerId?: string; team?: TeamId; zone?: HitZone }
        | undefined;
      const isEnemy = this.multiplayerMode
        ? Boolean(meta?.isRemotePlayer && this.isTargetHostile(meta.playerId, meta.team))
        : Boolean(meta?.isBot && this.isTargetHostile(meta.botId, meta.team));

      if (isEnemy) {
        if (!bestEnemyPick || pick.distance < bestEnemyPick.distance) {
          bestEnemyPick = pick;
        }
      } else if (!bestWorldPick || pick.distance < bestWorldPick.distance) {
        bestWorldPick = pick;
      }
    }

    const chosenPick = bestEnemyPick ?? bestWorldPick;
    if (!chosenPick?.hit || !chosenPick.pickedPoint || !chosenPick.pickedMesh) {
      if (this.multiplayerMode) {
        this.onNetworkShot?.({
          muzzle: origin.add(forward.scale(0.45)),
          endPoint: origin.add(forward.scale(cfg.range)),
          weaponId: 'knife',
        });
      }
      return;
    }

    const hitNormal = chosenPick.getNormal(true) ?? forward.scale(-1);
    const hitPoint = chosenPick.pickedPoint.clone();

    if (this.multiplayerMode) {
      const meta = chosenPick.pickedMesh.metadata as
        | { isRemotePlayer?: boolean; playerId?: string; team?: TeamId; zone?: HitZone }
        | undefined;
      let hitPlayerId: string | undefined;
      let hitZone: HitZone | undefined;
      let isTargetHit = false;

      if (meta?.isRemotePlayer && meta.playerId && meta.zone) {
        const validTarget = this.isTargetHostile(meta.playerId, meta.team);
        if (validTarget) {
          hitPlayerId = meta.playerId;
          hitZone = meta.zone;
          isTargetHit = true;
        }
      }

      this.audio.playKnifeHit(isTargetHit);
      this.spawnImpact(hitPoint, isTargetHit ? 'knife_character' : 'knife_env', hitNormal);
      this.onNetworkShot?.({
        muzzle: origin.add(forward.scale(0.45)),
        endPoint: hitPoint,
        weaponId: 'knife',
        targetId: hitPlayerId,
        zone: hitZone,
      });
      return;
    }

    const meta = chosenPick.pickedMesh.metadata as
      | { isBot?: boolean; botId?: string; team?: TeamId; zone?: HitZone }
      | undefined;

    if (meta?.isBot && meta.botId && meta.zone && this.isTargetHostile(meta.botId, meta.team)) {
      const distanceMeters = Math.round(chosenPick.distance * 10) / 10;
      const result = this.bots.applyDamageToBot(
        meta.botId,
        meta.zone,
        cfg.damage,
        cfg.headshotMultiplier,
        'player',
        cfg.name,
        distanceMeters
      );

      if (result) {
        this.audio.playKnifeHit(true);
        this.shotsFired += 1;
        this.shotsHit += 1;
        if (result.zone === 'head') {
          this.headshots += 1;
        }
        if (result.killed) {
          this.eliminations += 1;
          this.onOfflineKill?.({
            victimId: result.botId,
            victimName: result.botName,
            headshot: result.zone === 'head',
            distanceMeters,
          });
          this.audio.playKillConfirmation();
        }
        this.lastHitMarker = {
          id: ++this.hitMarkerCounter,
          zone: result.zone,
          killed: result.killed,
          timestamp: performance.now(),
        };
        this.audio.playHitMarker(result.zone === 'head');
        this.spawnImpact(hitPoint, 'knife_character', hitNormal, result.zone === 'head');
        return;
      }
    }

    this.audio.playKnifeHit(false);
    this.spawnImpact(hitPoint, 'knife_env', hitNormal);
  }

  private performHitscan(
    cfg: WeaponConfig,
    feel = getWeaponFeelProfile(cfg.id)
  ): void {
    const spread = this.computeCurrentSpread();
    const origin = this.camera.globalPosition.clone();
    const forward = this.camera.getDirection(Vector3.Forward()).normalize();
    const right = this.camera.getDirection(Vector3.Right()).normalize();
    const up = this.camera.getDirection(Vector3.Up()).normalize();

    const rig = this.models.get(this.activeId);
    const muzzleWorld = rig
      ? rig.muzzlePoint.getAbsolutePosition()
      : origin.add(forward.scale(0.6));

    const pelletCount = Math.max(1, cfg.pellets ?? 1);
    const networkPellets: NetworkShotPellet[] = [];

    let primaryEndPoint = origin.add(forward.scale(cfg.range));
    let primaryTargetId: string | undefined;
    let primaryZone: HitZone | undefined;

    let anyEnemyHit = false;
    let anyHeadshot = false;
    let anyKilled = false;

    for (let p = 0; p < pelletCount; p++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * spread;
      const dir = forward
        .add(right.scale(Math.cos(angle) * radius))
        .add(up.scale(Math.sin(angle) * radius))
        .normalize();

      const ray = new Ray(origin, dir, cfg.range);
      const pick = this.scene.pickWithRay(
        ray,
        (mesh) => mesh.isPickable && mesh.isEnabled() && mesh !== this.player.collider
      );

      const endPoint =
        pick?.hit && pick.pickedPoint ? pick.pickedPoint.clone() : origin.add(dir.scale(cfg.range));

      if (p === 0) {
        primaryEndPoint = endPoint;
      }

      this.spawnTracer(
        muzzleWorld,
        endPoint,
        cfg.suppressed,
        feel.tracerThickness,
        feel.tracerDuration
      );

      if (this.multiplayerMode) {
        let hitPlayerId: string | undefined;
        let hitZone: HitZone | undefined;
        let isTargetHit = false;

        if (pick?.hit && pick.pickedMesh && pick.pickedPoint) {
          const meta = pick.pickedMesh.metadata as
            | { isRemotePlayer?: boolean; playerId?: string; team?: TeamId; zone?: HitZone }
            | undefined;

          if (meta?.isRemotePlayer && meta.playerId && meta.zone) {
            const validTarget = this.isTargetHostile(meta.playerId, meta.team);
            if (validTarget) {
              hitPlayerId = meta.playerId;
              hitZone = meta.zone;
              isTargetHit = true;
            }
          }
          const hitNormal = pick.getNormal(true) ?? dir.scale(-1);
          this.spawnImpact(
            pick.pickedPoint,
            isTargetHit ? 'character' : 'environment',
            hitNormal,
            hitZone === 'head',
            pelletCount > 1 && p % 2 === 1
          );
          if (!meta?.isRemotePlayer && (pelletCount === 1 || p % 2 === 0)) {
            this.spawnBulletDecal(pick.pickedPoint, hitNormal);
          }
        }

        if (p === 0) {
          primaryTargetId = hitPlayerId;
          primaryZone = hitZone;
        }
        networkPellets.push({
          endPoint,
          targetId: hitPlayerId,
          zone: hitZone,
        });
        continue;
      }

      if (!pick?.hit || !pick.pickedMesh || !pick.pickedPoint) continue;

      const meta = pick.pickedMesh.metadata as
        | { isBot?: boolean; botId?: string; team?: TeamId; zone?: HitZone }
        | undefined;
      const hitNormal = pick.getNormal(true) ?? dir.scale(-1);

      if (meta?.isBot && meta.botId && meta.zone && this.isTargetHostile(meta.botId, meta.team)) {
        const distanceMeters = Math.round(pick.distance * 10) / 10;
        const result = this.bots.applyDamageToBot(
          meta.botId,
          meta.zone,
          cfg.damage,
          cfg.headshotMultiplier,
          'player',
          cfg.name,
          distanceMeters
        );

        if (result) {
          anyEnemyHit = true;
          if (result.zone === 'head') {
            anyHeadshot = true;
          }
          if (result.killed) {
            anyKilled = true;
            this.eliminations += 1;
            this.onOfflineKill?.({
              victimId: result.botId,
              victimName: result.botName,
              headshot: result.zone === 'head',
              distanceMeters,
            });
          }
          this.spawnImpact(
            pick.pickedPoint,
            'character',
            hitNormal,
            result.zone === 'head',
            pelletCount > 1 && p % 2 === 1
          );
          continue;
        }
      }

      this.spawnImpact(
        pick.pickedPoint,
        'environment',
        hitNormal,
        false,
        pelletCount > 1 && p % 2 === 1
      );
      if (!meta?.isBot && (pelletCount === 1 || p % 2 === 0)) {
        this.spawnBulletDecal(pick.pickedPoint, hitNormal);
      }
    }

    if (this.multiplayerMode) {
      this.onNetworkShot?.({
        muzzle: muzzleWorld,
        endPoint: primaryEndPoint,
        weaponId: cfg.id,
        targetId: primaryTargetId,
        zone: primaryZone,
        pellets: pelletCount > 1 ? networkPellets : undefined,
      });
      return;
    }

    if (anyEnemyHit) {
      this.shotsHit += 1;
      if (anyHeadshot) {
        this.headshots += 1;
      }
      if (anyKilled) {
        this.audio.playKillConfirmation();
      }
      this.lastHitMarker = {
        id: ++this.hitMarkerCounter,
        zone: anyHeadshot ? 'head' : 'body',
        killed: anyKilled,
        timestamp: performance.now(),
      };
      this.audio.playHitMarker(anyHeadshot);
    }
  }

  private updateRangefinder(): void {
    this.rangeRay.origin.copyFrom(this.camera.position);
    this.camera.getDirectionToRef(this.forwardAxis, this.rangeRay.direction);
    const pick = this.scene.pickWithRay(this.rangeRay, this.rangePickPredicate);
    if (pick?.hit) {
      this.rangeDistanceMeters = Math.round(pick.distance);
      const meta = pick.pickedMesh?.metadata as
        | { isBot?: boolean; botId?: string; isRemotePlayer?: boolean; playerId?: string; team?: TeamId }
        | undefined;
      if (this.multiplayerMode) {
        this.targetingEnemy = Boolean(
          meta?.isRemotePlayer && this.isTargetHostile(meta.playerId, meta.team)
        );
      } else {
        this.targetingEnemy = Boolean(meta?.isBot && this.isTargetHostile(meta.botId, meta.team));
      }
    } else {
      this.rangeDistanceMeters = null;
      this.targetingEnemy = false;
    }
  }

  private computeCurrentSpread(): number {
    const cfg = this.getActiveConfig();
    const isAds = this.player.getIsAds();
    const base = isAds ? cfg.adsSpread : cfg.hipSpread;
    const speedFactor = this.player.getHorizontalSpeed() * (isAds ? 0.0005 : 0.0018);
    const airPenalty = this.player.getIsGrounded() ? 0 : isAds ? 0.01 : 0.025;
    return base + this.spreadBloom * (isAds ? 0.35 : 1) + speedFactor + airPenalty;
  }

  private triggerMuzzleFlash(suppressed: boolean, feelScale = 1.0): void {
    const budget = getVfxQualityBudget(this.graphicsQuality);
    this.muzzleFlashMaxTimer = suppressed ? 0.026 : 0.045;
    this.muzzleFlashTimer = this.muzzleFlashMaxTimer;
    this.muzzleFlashRoot.rotation.z = Math.random() * Math.PI * 2;
    this.muzzleFlashBaseScale =
      (suppressed ? 0.42 : 0.86 + Math.random() * 0.42) * feelScale;
    this.muzzleFlashRoot.scaling.set(
      this.muzzleFlashBaseScale * (0.9 + Math.random() * 0.24),
      this.muzzleFlashBaseScale * (0.9 + Math.random() * 0.24),
      this.muzzleFlashBaseScale * (0.94 + Math.random() * 0.32)
    );
    this.muzzleFlashMat.alpha = 0.95;
    this.muzzleFlashMat.emissiveColor.set(1.85, 1.2, 0.45);
    this.muzzleFlashRoot.setEnabled(!suppressed);

    if (budget.muzzleLightEnabled) {
      this.muzzleLightPeak = (suppressed ? 0.6 : 5.8) * budget.muzzleLightScale;
      this.muzzleLight.intensity = this.muzzleLightPeak;
    } else {
      this.muzzleLightPeak = 0;
      this.muzzleLight.intensity = 0;
    }
  }

  private scheduleOrSpawnShellCasing(
    weaponId: WeaponId,
    feel = getWeaponFeelProfile(weaponId)
  ): void {
    const budget = getVfxQualityBudget(this.graphicsQuality);
    if (!budget.casingsEnabled || feel.casingKind === 'none') return;
    if (feel.casingDelaySec > 0) {
      this.pendingCasingTimer = feel.casingDelaySec;
      this.pendingCasingWeapon = weaponId;
      return;
    }
    this.ejectCasingForWeapon(weaponId);
  }

  private ejectCasingForWeapon(weaponId: WeaponId): void {
    const budget = getVfxQualityBudget(this.graphicsQuality);
    if (!budget.casingsEnabled || budget.maxCasings <= 0) return;
    const feel = getWeaponFeelProfile(weaponId);
    const kind: CasingKind = feel.casingKind;
    if (kind === 'none') return;

    const rig = this.models.get(weaponId);
    if (!rig || this.casingPool.length === 0) return;

    const slotCap = Math.min(this.casingPool.length, budget.maxCasings);
    const slot = this.casingPool[this.casingCursor % slotCap];
    this.casingCursor = (this.casingCursor + 1) % slotCap;

    const portPos = rig.ejectionPort.getAbsolutePosition();
    slot.mesh.position.copyFrom(portPos);
    slot.mesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );

    if (kind === 'shotgunHull') {
      slot.mesh.material = this.shotgunHullMaterial;
      slot.mesh.scaling.set(1.65, 1.65, 1.65);
    } else if (kind === 'brassHeavy') {
      slot.mesh.material = this.brassMaterial;
      slot.mesh.scaling.set(1.18, 1.48, 1.18);
    } else if (kind === 'brassPistol') {
      slot.mesh.material = this.brassMaterial;
      slot.mesh.scaling.set(0.86, 0.82, 0.86);
    } else {
      slot.mesh.material = this.brassMaterial;
      slot.mesh.scaling.set(0.96, 1.08, 0.96);
    }

    const right = this.camera.getDirection(Vector3.Right());
    const up = this.camera.getDirection(Vector3.Up());
    const forward = this.camera.getDirection(Vector3.Forward());
    const ejectSpeedR = kind === 'shotgunHull' ? 2.4 : 2.15;
    const ejectSpeedU = kind === 'shotgunHull' ? 1.85 : 1.65;

    slot.vel.set(
      right.x * (ejectSpeedR + Math.random() * 0.9) + up.x * (ejectSpeedU + Math.random() * 0.75) - forward.x * (0.35 + Math.random() * 0.45),
      right.y * (ejectSpeedR + Math.random() * 0.9) + up.y * (ejectSpeedU + Math.random() * 0.75) - forward.y * (0.35 + Math.random() * 0.45),
      right.z * (ejectSpeedR + Math.random() * 0.9) + up.z * (ejectSpeedU + Math.random() * 0.75) - forward.z * (0.35 + Math.random() * 0.45)
    );
    slot.spin.set(
      14 + Math.random() * 14,
      10 + Math.random() * 12,
      16 + Math.random() * 14
    );
    slot.floorY = Math.max(0.015, this.player.collider.position.y - 0.88);
    slot.life = 0.72;
    slot.maxLife = 0.72;
    slot.active = true;
    slot.mesh.visibility = 1.0;
    slot.mesh.setEnabled(true);
  }

  private spawnTracer(
    start: Vector3,
    end: Vector3,
    suppressed: boolean,
    thickness = 0.02,
    duration = 0.06
  ): void {
    this.tracerPool.spawn(
      start,
      end,
      suppressed ? this.tracerSuppMaterial : this.tracerMaterial,
      {
        thickness,
        duration,
        maxLength: 28,
        startLead: 0.14,
      }
    );
  }

  private spawnImpact(
    point: Vector3,
    kind: ImpactKind,
    normal: Vector3,
    isHeadshot = false,
    reduced = false
  ): void {
    const budget = getVfxQualityBudget(this.graphicsQuality);
    const isTarget = kind === 'character' || kind === 'knife_character';
    let sparkCount = isTarget ? budget.targetBurstCount : budget.envSparkCount;
    if (reduced) {
      sparkCount = Math.max(1, Math.ceil(sparkCount * 0.5));
    }

    const impactCap = Math.min(this.impactPool.length, budget.maxImpacts);
    if (impactCap > 0) {
      for (let i = 0; i < sparkCount; i++) {
        const slot = this.impactPool[this.impactCursor % impactCap];
        this.impactCursor = (this.impactCursor + 1) % impactCap;

        slot.mesh.position.copyFrom(point);
        if (kind === 'character' || kind === 'knife_character') {
          slot.mesh.material = isHeadshot ? this.impactMatHeadshot : this.impactMatTarget;
          slot.baseScale = isHeadshot ? 1.35 : 1.15;
          slot.maxLife = 0.18;
          slot.gravity = 7.5;
          slot.vel.set(
            normal.x * (1.4 + Math.random() * 1.8) + (Math.random() - 0.5) * 2.4,
            normal.y * (1.4 + Math.random() * 1.8) + Math.random() * 1.8,
            normal.z * (1.4 + Math.random() * 1.8) + (Math.random() - 0.5) * 2.4
          );
        } else if (kind === 'knife_env') {
          slot.mesh.material = i % 2 === 0 ? this.impactMatKnifeClang : this.impactMatSparkB;
          slot.baseScale = 1.05;
          slot.maxLife = 0.19;
          slot.gravity = 11.0;
          slot.vel.set(
            normal.x * (2.4 + Math.random() * 2.6) + (Math.random() - 0.5) * 3.8,
            normal.y * (2.2 + Math.random() * 2.4) + Math.random() * 2.4,
            normal.z * (2.4 + Math.random() * 2.6) + (Math.random() - 0.5) * 3.8
          );
        } else {
          slot.mesh.material = i % 2 === 0 ? this.impactMatSparkA : this.impactMatSparkB;
          slot.baseScale = 0.95;
          slot.maxLife = 0.16;
          slot.gravity = 11.5;
          slot.vel.set(
            normal.x * (2.0 + Math.random() * 2.5) + (Math.random() - 0.5) * 3.4,
            normal.y * (2.0 + Math.random() * 2.5) + Math.random() * 2.4,
            normal.z * (2.0 + Math.random() * 2.5) + (Math.random() - 0.5) * 3.4
          );
        }

        slot.life = slot.maxLife;
        slot.active = true;
        slot.mesh.scaling.setAll(slot.baseScale);
        slot.mesh.visibility = 1.0;
        slot.mesh.setEnabled(true);
      }
    }

    if (!isTarget && !reduced && budget.dustPuffCount > 0 && budget.maxDustPuffs > 0) {
      const dustCap = Math.min(this.dustPool.length, budget.maxDustPuffs);
      for (let d = 0; d < budget.dustPuffCount; d++) {
        const puff = this.dustPool[this.dustCursor % dustCap];
        this.dustCursor = (this.dustCursor + 1) % dustCap;

        puff.mesh.position.set(
          point.x + normal.x * 0.06 + (Math.random() - 0.5) * 0.08,
          point.y + normal.y * 0.06 + (Math.random() - 0.5) * 0.08,
          point.z + normal.z * 0.06 + (Math.random() - 0.5) * 0.08
        );
        puff.vel.set(
          normal.x * (0.45 + Math.random() * 0.45) + (Math.random() - 0.5) * 0.4,
          0.35 + Math.random() * 0.45,
          normal.z * (0.45 + Math.random() * 0.45) + (Math.random() - 0.5) * 0.4
        );
        puff.life = 0.28;
        puff.maxLife = 0.28;
        puff.active = true;
        puff.mesh.scaling.setAll(0.65);
        puff.mesh.visibility = 0.85;
        puff.mesh.setEnabled(true);
      }
    }
  }

  private spawnBulletDecal(point: Vector3, normal: Vector3): void {
    const budget = getVfxQualityBudget(this.graphicsQuality);
    const decalCap = Math.min(this.decalPool.length, budget.maxDecals);
    if (decalCap <= 0) return;

    const slot = this.decalPool[this.decalCursor % decalCap];
    this.decalCursor = (this.decalCursor + 1) % decalCap;

    slot.active = true;
    slot.mesh.position.copyFrom(point).addInPlace(normal.scale(0.014));
    slot.mesh.lookAt(point.add(normal.scale(2)));
    slot.mesh.rotation.z = Math.random() * Math.PI * 2;
    const s = 0.85 + Math.random() * 0.35;
    slot.mesh.scaling.set(s, s, 1);
    slot.mesh.setEnabled(true);
  }

  private updateTransients(dt: number): void {
    this.tracerPool.update(dt);

    for (let i = 0; i < this.casingPool.length; i++) {
      const c = this.casingPool[i];
      if (!c.active) continue;
      c.life -= dt;
      if (c.life <= 0) {
        c.active = false;
        c.life = 0;
        c.mesh.setEnabled(false);
      } else {
        c.mesh.position.x += c.vel.x * dt;
        c.mesh.position.y += c.vel.y * dt;
        c.mesh.position.z += c.vel.z * dt;
        c.vel.y -= 14.5 * dt;
        if (c.mesh.position.y < c.floorY && c.vel.y < 0) {
          c.mesh.position.y = c.floorY;
          c.vel.y *= -0.42;
          c.vel.x *= 0.65;
          c.vel.z *= 0.65;
        }
        c.mesh.rotation.x += c.spin.x * dt;
        c.mesh.rotation.y += c.spin.y * dt;
        c.mesh.rotation.z += c.spin.z * dt;
        if (c.life < 0.16) {
          c.mesh.visibility = Math.max(0, c.life / 0.16);
        }
      }
    }

    for (let i = 0; i < this.impactPool.length; i++) {
      const imp = this.impactPool[i];
      if (!imp.active) continue;
      imp.life -= dt;
      if (imp.life <= 0) {
        imp.active = false;
        imp.life = 0;
        imp.mesh.setEnabled(false);
      } else {
        imp.mesh.position.x += imp.vel.x * dt;
        imp.mesh.position.y += imp.vel.y * dt;
        imp.mesh.position.z += imp.vel.z * dt;
        imp.vel.y -= imp.gravity * dt;
        const ratio = imp.life / imp.maxLife;
        imp.mesh.scaling.setAll(imp.baseScale * (0.3 + ratio * 0.85));
        imp.mesh.visibility = ratio;
      }
    }

    for (let i = 0; i < this.dustPool.length; i++) {
      const puff = this.dustPool[i];
      if (!puff.active) continue;
      puff.life -= dt;
      if (puff.life <= 0) {
        puff.active = false;
        puff.life = 0;
        puff.mesh.setEnabled(false);
      } else {
        puff.mesh.position.x += puff.vel.x * dt;
        puff.mesh.position.y += puff.vel.y * dt;
        puff.mesh.position.z += puff.vel.z * dt;
        puff.vel.scaleInPlace(Math.exp(-4.5 * dt));
        const progress = 1 - puff.life / puff.maxLife;
        puff.mesh.scaling.setAll(0.65 + progress * 1.45);
        puff.mesh.visibility = Math.max(0, (1 - progress) * 0.85);
      }
    }
  }

  private updateKnifeTrail(): void {
    const budget = getVfxQualityBudget(this.graphicsQuality);
    const activeSegs = Math.min(this.knifeTrailMeshes.length, budget.knifeTrailSegments);
    if (!this.viewModelVisible || this.slashTimer <= 0 || activeSegs <= 0) {
      this.hideKnifeTrail();
      return;
    }

    const p = 1 - this.slashTimer / Math.max(0.05, this.slashDuration);
    if (p < 0.08 || p > 0.92) {
      this.hideKnifeTrail();
      return;
    }

    const envelope = Math.sin(((p - 0.08) / 0.84) * Math.PI);
    const isStab = this.knifeAttackMode === 'stab';
    for (let i = 0; i < this.knifeTrailMeshes.length; i++) {
      const seg = this.knifeTrailMeshes[i];
      if (i >= activeSegs) {
        seg.setEnabled(false);
        continue;
      }
      const trailP = Math.max(0.05, p - i * 0.045);
      if (isStab) {
        const thrustZ = 0.44 + Math.sin(trailP * Math.PI) * 0.24 - i * 0.03;
        seg.position.set(0.06 - i * 0.008, -0.05, thrustZ);
        seg.rotation.set(Math.PI * 0.42, 0.14, 0.25);
      } else {
        const arcAngle = (trailP - 0.5) * 1.95 * this.slashSide;
        const x = Math.sin(arcAngle) * 0.23;
        const y = -0.03 + Math.cos(arcAngle) * 0.055 - trailP * 0.04;
        const z = 0.53 - Math.abs(arcAngle) * 0.045;

        seg.position.set(x, y, z);
        seg.rotation.set(0.18, 0, -arcAngle + this.slashSide * 0.72);
      }
      const segFade = 1 - i / Math.max(1, activeSegs);
      seg.scaling.set(1.0, 0.85 + segFade * 0.45, 1.0);
      seg.visibility = Math.max(0, Math.min(1, envelope * segFade * 0.92));
      seg.setEnabled(true);
    }
  }

  private hideKnifeTrail(): void {
    for (let i = 0; i < this.knifeTrailMeshes.length; i++) {
      this.knifeTrailMeshes[i].setEnabled(false);
    }
  }

  private updateViewModelTransform(dt: number): void {
    const rig = this.models.get(this.activeId);
    if (!rig) return;

    const stance = this.player.getStance();
    const isKnife = this.activeId === 'knife';
    const adsBlend = isKnife ? 0 : this.player.getAdsBlend();
    const isAds = !isKnife && this.player.getIsAds() && !this.isReloading;
    const fullyScoped = this.activeId === 'sniper' && adsBlend > 0.88 && !this.isReloading;
    rig.root.setEnabled(!fullyScoped);
    this.vmFillLight.setEnabled(this.viewModelVisible && !fullyScoped);
    this.vmRimLight.setEnabled(this.viewModelVisible && !fullyScoped);

    const speed = this.player.getHorizontalSpeed();
    this.player.getLocalMoveAxes(this.moveAxes);
    const axes = this.moveAxes;
    const isMoving = this.player.getIsGrounded() && speed > 0.6 && stance !== 'slide';

    if (isMoving) {
      this.bobTimer += dt * (stance === 'sprint' ? 13.4 : 8.8);
    }

    const hipWeight = 1 - adsBlend;
    const speedRatio = Math.max(0, Math.min(1.15, speed / 9.1));
    const bobScale = isMoving
      ? (0.002 * adsBlend + 0.013 * hipWeight) * Math.max(0.45, speedRatio)
      : 0.0012;
    const bobX = isMoving ? Math.cos(this.bobTimer * 0.5) * bobScale : 0;
    const bobY = isMoving
      ? Math.abs(Math.sin(this.bobTimer)) * -bobScale * 1.18
      : Math.sin(performance.now() * 0.002) * 0.0015;

    const strafeN = Math.max(-1, Math.min(1, axes.right / 9.1));
    const fwdN = Math.max(-1, Math.min(1, axes.forward / 9.1));
    const swayAmt = isAds ? 0.0032 : 0.017;
    const swayX = strafeN * swayAmt;
    const swayZ = -fwdN * swayAmt * 0.45;

    const targetLandDip = this.player.getLandDip() * (0.48 * (1 - adsBlend * 0.72));
    this.vmLandDip += (targetLandDip - this.vmLandDip) * (1 - Math.exp(-16 * dt));

    const targetSwayRoll = -strafeN * (stance === 'sprint' && !isAds ? 0.115 : 0.048) * hipWeight;
    const targetSwayPitch = fwdN * (stance === 'sprint' && !isAds ? 0.032 : 0.014) * hipWeight;
    const swayLerp = 1 - Math.exp(-10 * dt);
    this.swayRoll += (targetSwayRoll - this.swayRoll) * swayLerp;
    this.swayPitch += (targetSwayPitch - this.swayPitch) * swayLerp;

    const recBackDecay = this.activeId === 'smg' ? 26 : this.activeId === 'sniper' ? 14 : 20;
    const recRotDecay = this.activeId === 'smg' ? 24 : this.activeId === 'sniper' ? 13 : 18;
    this.kickBackZ *= Math.exp(-recBackDecay * dt);
    this.kickRotX *= Math.exp(-recRotDecay * dt);
    this.kickYaw *= Math.exp(-22 * dt);
    this.kickRoll *= Math.exp(-20 * dt);
    this.equipDrop *= Math.exp(-12 * dt);

    // Knife slash / stab / equip draw twist
    let slashOffX = 0;
    let slashOffY = 0;
    let slashOffZ = 0;
    let slashRotX = 0;
    let slashRotY = 0;
    let slashRotZ = 0;
    let wristFlipX = 0;
    let wristFlipY = 0;
    let wristFlipZ = 0;
    let wristOffZ = 0;
    if (isKnife && this.slashTimer > 0) {
      const p = 1 - this.slashTimer / Math.max(0.05, this.slashDuration);
      if (this.knifeAttackMode === 'stab') {
        // Heavy forward thrust with brief wind-up chamber
        const chamber = p < 0.22 ? Math.sin((p / 0.22) * Math.PI * 0.5) : 0;
        const thrustPhase = p >= 0.22 ? Math.sin(((p - 0.22) / 0.78) * Math.PI) : 0;
        slashOffX = -0.09 * thrustPhase + 0.025 * chamber;
        slashOffY = 0.035 * thrustPhase - 0.02 * chamber;
        slashOffZ = 0.24 * thrustPhase - 0.06 * chamber;
        slashRotX = -0.18 * chamber + 0.22 * thrustPhase;
        slashRotY = 0.22 * thrustPhase;
        slashRotZ = -0.45 * thrustPhase;
        wristFlipX = 0.24 * thrustPhase;
        wristFlipZ = -0.35 * thrustPhase;
      } else {
        // Crisp wrist-pivoted diagonal slash across viewport
        const swingCurve = Math.sin(p * Math.PI);
        const windup = p < 0.24 ? Math.sin((p / 0.24) * Math.PI * 0.5) : 1 - (p - 0.24) / 0.76;
        slashOffX = -0.21 * swingCurve * this.slashSide + 0.04 * windup * this.slashSide;
        slashOffY = 0.04 * Math.sin(p * Math.PI * 2) - 0.03 * swingCurve;
        slashOffZ = 0.16 * swingCurve;
        slashRotX = -0.58 * swingCurve;
        slashRotY = 1.08 * swingCurve * this.slashSide;
        slashRotZ = 0.62 * windup * this.slashSide;
        wristFlipZ = 0.42 * swingCurve * this.slashSide;
        wristFlipX = -0.26 * swingCurve;
      }
    } else if (isKnife && this.knifeEquipTimer > 0) {
      // Snappy draw twist/flip when equipping slot [2]
      const ep = 1 - this.knifeEquipTimer / this.knifeEquipDuration;
      const easeOut = 1 - Math.pow(1 - ep, 3);
      const flipAngle = (1 - easeOut) * Math.PI * 1.45;
      wristFlipZ = flipAngle * 0.65;
      wristFlipY = (1 - easeOut) * -0.9;
      wristFlipX = Math.sin(ep * Math.PI) * 0.36;
      wristOffZ = -0.09 * (1 - easeOut);
    }

    if (this.knifeWristPivot) {
      this.knifeWristPivot.rotation.set(wristFlipX, wristFlipY, wristFlipZ);
      this.knifeWristPivot.position.set(0, 0, wristOffZ);
    }

    const baseTargetX = rig.hipPos.x + (rig.adsPos.x - rig.hipPos.x) * adsBlend;
    const baseTargetY = rig.hipPos.y + (rig.adsPos.y - rig.hipPos.y) * adsBlend;
    const baseTargetZ = rig.hipPos.z + (rig.adsPos.z - rig.hipPos.z) * adsBlend;
    const reloadOffsetY = this.isReloading ? -0.11 * Math.sin(this.getReloadProgress() * Math.PI) : 0;
    const reloadTiltZ = this.isReloading ? 0.42 * Math.sin(this.getReloadProgress() * Math.PI) : 0;

    const sprinting = stance === 'sprint' && !isAds && !this.isReloading && this.slashTimer === 0;
    const slidingHip = stance === 'slide' && adsBlend < 0.4 && !this.isReloading && this.slashTimer === 0;
    const slidingAds = stance === 'slide' && isAds && !this.isReloading;

    const sprintRotY = sprinting ? (isKnife ? -0.22 : -0.42) : 0;
    const sprintRotX = sprinting ? (isKnife ? 0.14 : 0.16) : 0;
    const sprintKnifeOffY = sprinting && isKnife ? -0.025 : 0;

    const slideOffsetX = slidingHip ? -0.025 : 0;
    const slideOffsetY = slidingHip ? -0.025 : 0;
    const slideRotY = slidingHip ? -0.14 : 0;
    const slideRotZ = slidingHip ? 0.14 : slidingAds ? 0.035 : 0;

    const targetX = baseTargetX + bobX + swayX + slideOffsetX + slashOffX;
    const targetY =
      baseTargetY +
      bobY +
      reloadOffsetY -
      this.equipDrop -
      this.vmLandDip +
      slideOffsetY +
      sprintKnifeOffY +
      slashOffY;
    const targetZ = baseTargetZ - this.kickBackZ + swayZ + slashOffZ;

    const posLerp = 1 - Math.exp(-(this.slashTimer > 0 ? 30 : isAds ? 20 : 14) * dt);
    this.weaponPivot.position.x += (targetX - this.weaponPivot.position.x) * posLerp;
    this.weaponPivot.position.y += (targetY - this.weaponPivot.position.y) * posLerp;
    this.weaponPivot.position.z += (targetZ - this.weaponPivot.position.z) * posLerp;

    const adsRotX = rig.adsRot.x * adsBlend;
    const adsRotY = rig.adsRot.y * adsBlend;
    const adsRotZ = rig.adsRot.z * adsBlend;

    const targetRotX = -this.kickRotX + sprintRotX + this.swayPitch + adsRotX + slashRotX;
    const targetRotY = sprintRotY + slideRotY + adsRotY + slashRotY + this.kickYaw;
    const targetRotZ = reloadTiltZ + slideRotZ + this.swayRoll + adsRotZ + slashRotZ + this.kickRoll;

    const rotLerp = 1 - Math.exp(-(this.slashTimer > 0 ? 30 : isAds ? 18 : 14) * dt);
    this.weaponPivot.rotation.x += (targetRotX - this.weaponPivot.rotation.x) * rotLerp;
    this.weaponPivot.rotation.y += (targetRotY - this.weaponPivot.rotation.y) * rotLerp;
    this.weaponPivot.rotation.z += (targetRotZ - this.weaponPivot.rotation.z) * rotLerp;

    // 3D Knife Charm pendulum motion physics with gravity-aligned pommel compensation
    if (isKnife && this.charmPivot) {
      const targetRestX =
        -0.78 +
        Math.max(-0.35, Math.min(0.45, fwdN * 0.25 + (isMoving ? Math.sin(this.bobTimer) * 0.1 : 0)));
      const targetRestZ =
        -0.38 + Math.max(-0.55, Math.min(0.55, -strafeN * 0.38 + this.swayRoll * 1.4));
      const springK = 68;
      const damping = 7.5;
      const ax = (targetRestX - this.charmSwingX) * springK - this.charmVelX * damping;
      const az = (targetRestZ - this.charmSwingZ) * springK - this.charmVelZ * damping;
      this.charmVelX += ax * dt;
      this.charmVelZ += az * dt;
      this.charmSwingX = Math.max(-1.45, Math.min(0.45, this.charmSwingX + this.charmVelX * dt));
      this.charmSwingZ = Math.max(-1.15, Math.min(0.65, this.charmSwingZ + this.charmVelZ * dt));

      this.charmPivot.rotation.x = this.charmSwingX;
      this.charmPivot.rotation.z = this.charmSwingZ;
      this.charmPivot.rotation.y = Math.sin(performance.now() * 0.0028) * 0.12;
    }
  }

  private initVfxPools(): void {
    for (let i = 0; i < CASING_POOL_CAPACITY; i++) {
      const mesh = MeshBuilder.CreateCylinder(
        `shellCasingPool_${i}`,
        { height: 0.025, diameter: 0.01, tessellation: 8 },
        this.scene
      );
      mesh.parent = this.vfxPoolRoot;
      mesh.material = this.brassMaterial;
      mesh.isPickable = false;
      mesh.checkCollisions = false;
      mesh.setEnabled(false);
      this.casingPool.push({
        mesh,
        active: false,
        vel: Vector3.Zero(),
        spin: Vector3.Zero(),
        life: 0,
        maxLife: 0.72,
        floorY: 0.015,
      });
    }

    for (let i = 0; i < IMPACT_POOL_CAPACITY; i++) {
      const mesh = MeshBuilder.CreateBox(
        `impactSparkPool_${i}`,
        { size: 0.048 },
        this.scene
      );
      mesh.parent = this.vfxPoolRoot;
      mesh.material = this.impactMatSparkA;
      mesh.isPickable = false;
      mesh.checkCollisions = false;
      mesh.setEnabled(false);
      this.impactPool.push({
        mesh,
        active: false,
        vel: Vector3.Zero(),
        life: 0,
        maxLife: 0.16,
        gravity: 11.5,
        baseScale: 1.0,
      });
    }

    for (let i = 0; i < DUST_POOL_CAPACITY; i++) {
      const mesh = MeshBuilder.CreatePolyhedron(
        `impactDustPool_${i}`,
        { type: 1, size: 0.082 },
        this.scene
      );
      mesh.parent = this.vfxPoolRoot;
      mesh.material = this.dustMaterial;
      mesh.isPickable = false;
      mesh.checkCollisions = false;
      mesh.setEnabled(false);
      this.dustPool.push({
        mesh,
        active: false,
        vel: Vector3.Zero(),
        life: 0,
        maxLife: 0.28,
      });
    }

    for (let i = 0; i < DECAL_POOL_CAPACITY; i++) {
      const mesh = MeshBuilder.CreateDisc(
        `bulletDecalPool_${i}`,
        { radius: 0.044, tessellation: 8, sideOrientation: Mesh.DOUBLESIDE },
        this.scene
      );
      mesh.parent = this.vfxPoolRoot;
      mesh.material = this.decalMaterial;
      mesh.isPickable = false;
      mesh.checkCollisions = false;
      mesh.setEnabled(false);
      this.decalPool.push({
        mesh,
        active: false,
      });
    }

    for (let i = 0; i < KNIFE_TRAIL_CAPACITY; i++) {
      const seg = MeshBuilder.CreateBox(
        `knifeArcSeg_${i}`,
        { width: 0.011, height: 0.135, depth: 0.004 },
        this.scene
      );
      seg.parent = this.camera;
      seg.material = this.knifeTrailMaterial;
      seg.isPickable = false;
      seg.checkCollisions = false;
      seg.renderingGroupId = 1;
      seg.setEnabled(false);
      this.knifeTrailMeshes.push(seg);
    }
  }

  private createMuzzleFlash(): TransformNode {
    const root = new TransformNode('muzzleFlashRoot', this.scene);

    const mat = new StandardMaterial('muzzleFlashMat', this.scene);
    mat.disableLighting = true;
    mat.diffuseColor = Color3.Black();
    mat.emissiveColor = new Color3(1.85, 1.2, 0.45);
    mat.alpha = 0.95;
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    this.muzzleFlashMat = mat;
    this.materialsToDispose.push(mat);

    const bladeAngles = [0, Math.PI / 3, (2 * Math.PI) / 3];
    for (let i = 0; i < bladeAngles.length; i++) {
      const blade = MeshBuilder.CreatePlane(
        `muzzleStarBlade_${i}`,
        { width: 0.175, height: 0.042 },
        this.scene
      );
      blade.parent = root;
      blade.rotation.z = bladeAngles[i];
      blade.position.z = 0.025;
      blade.material = mat;
      blade.isPickable = false;
      blade.checkCollisions = false;
      blade.renderingGroupId = 1;
      this.muzzleFlashMeshes.push(blade);
    }

    for (let i = 0; i < 2; i++) {
      const axial = MeshBuilder.CreatePlane(
        `muzzleAxialBlade_${i}`,
        { width: 0.15, height: 0.04 },
        this.scene
      );
      axial.parent = root;
      axial.rotation.y = Math.PI / 2;
      axial.rotation.x = i === 0 ? 0 : Math.PI / 2;
      axial.position.z = 0.075;
      axial.material = mat;
      axial.isPickable = false;
      axial.checkCollisions = false;
      axial.renderingGroupId = 1;
      this.muzzleFlashMeshes.push(axial);
    }

    const cone = MeshBuilder.CreateCylinder(
      'muzzleFlashCone',
      { height: 0.17, diameterTop: 0.004, diameterBottom: 0.056, tessellation: 8 },
      this.scene
    );
    cone.parent = root;
    cone.rotation.x = Math.PI / 2;
    cone.position.z = 0.088;
    cone.material = mat;
    cone.isPickable = false;
    cone.checkCollisions = false;
    cone.renderingGroupId = 1;
    this.muzzleFlashMeshes.push(cone);

    const core = MeshBuilder.CreatePolyhedron('muzzleFlashCore', { type: 1, size: 0.03 }, this.scene);
    core.parent = root;
    core.position.z = 0.018;
    core.material = mat;
    core.isPickable = false;
    core.checkCollisions = false;
    core.renderingGroupId = 1;
    this.muzzleFlashMeshes.push(core);

    root.setEnabled(false);
    return root;
  }

  private bindViewModelLights(): void {
    const meshes = this.weaponPivot.getChildMeshes(false);
    this.vmFillLight.includedOnlyMeshes = meshes;
    this.vmRimLight.includedOnlyMeshes = meshes;
  }

  private applyCharmVisibility(): void {
    this.charmRoots.forEach((root, charmId) => {
      root.setEnabled(charmId === this.knifeCharmId);
    });
  }

  private createWeaponFinish(
    name: string,
    preset: SurfacePresetId,
    options: {
      baseHex: string;
      accentHex: string;
      uScale?: number;
      vScale?: number;
      bumpLevel?: number;
      roughnessScale?: number;
      metallicOverride?: number;
      clearCoat?: number;
      environmentIntensity?: number;
    }
  ): PBRMaterial {
    const mat = new PBRMaterial(name, this.scene);
    const createdTextures = applyProceduralSurfaceToMaterial(this.scene, mat, `${name}_proc`, preset, {
      size: 128,
      baseHex: options.baseHex,
      accentHex: options.accentHex,
      uScale: options.uScale ?? 2,
      vScale: options.vScale ?? 2,
      bumpLevel: options.bumpLevel ?? 0.65,
      roughnessScale: options.roughnessScale ?? 1.0,
      metallicOverride: options.metallicOverride,
      clearCoat: options.clearCoat,
    });
    this.texturesToDispose.push(...createdTextures);
    mat.environmentIntensity = options.environmentIntensity ?? 1.25;
    this.materialsToDispose.push(mat);
    return mat;
  }

  private buildAllWeaponModels(): void {
    const gunmetal = this.createWeaponFinish('anodizedRecvMat', 'anodizedMetal', {
      baseHex: '#1f242c',
      accentHex: '#12151b',
      metallicOverride: 0.84,
      roughnessScale: 0.92,
      bumpLevel: 0.45,
      environmentIntensity: 1.25,
    });
    const polymer = this.createWeaponFinish('polymerMat', 'knurledPolymer', {
      baseHex: '#181c22',
      accentHex: '#0e1014',
      bumpLevel: 0.72,
      environmentIntensity: 0.96,
    });
    const carbonFiber = this.createWeaponFinish('carbonFiberMat', 'carbonFiber', {
      baseHex: '#282f3a',
      accentHex: '#12161c',
      uScale: 3,
      vScale: 3,
      bumpLevel: 0.62,
      clearCoat: 0.52,
      environmentIntensity: 1.38,
    });
    const coyote = this.createWeaponFinish('coyoteMat', 'tacticalFabric', {
      baseHex: '#7a6347',
      accentHex: '#503f2b',
      bumpLevel: 0.65,
      environmentIntensity: 0.95,
    });
    const walnut = this.createWeaponFinish('walnutMat', 'walnutWood', {
      baseHex: '#6c3c1f',
      accentHex: '#381b0b',
      bumpLevel: 0.68,
      clearCoat: 0.25,
      environmentIntensity: 1.02,
    });
    const steelSilver = this.createWeaponFinish('brushedGunmetalMat', 'brushedMetal', {
      baseHex: '#828d9c',
      accentHex: '#525b68',
      metallicOverride: 0.96,
      roughnessScale: 0.85,
      bumpLevel: 0.48,
      environmentIntensity: 1.48,
    });
    const bladeEdge = this.createWeaponFinish('knifeEdgeMat', 'brushedMetal', {
      baseHex: '#cfdbe8',
      accentHex: '#9ba9b9',
      metallicOverride: 0.98,
      roughnessScale: 0.62,
      bumpLevel: 0.34,
      clearCoat: 0.48,
      environmentIntensity: 1.6,
    });
    const odGreen = this.createWeaponFinish('odGreenMat', 'knurledPolymer', {
      baseHex: '#374a35',
      accentHex: '#212e20',
      bumpLevel: 0.6,
      environmentIntensity: 0.98,
    });
    const scopeTube = this.createWeaponFinish('scopeTubeMat', 'anodizedMetal', {
      baseHex: '#282f3a',
      accentHex: '#171b22',
      metallicOverride: 0.92,
      roughnessScale: 0.65,
      bumpLevel: 0.35,
      clearCoat: 0.45,
      environmentIntensity: 1.45,
    });
    const shellCrimson = this.createWeaponFinish('shellCrimsonMat', 'anodizedMetal', {
      baseHex: '#b91c1c',
      accentHex: '#7f1d1d',
      metallicOverride: 0.25,
      roughnessScale: 1.0,
      clearCoat: 0.35,
      environmentIntensity: 1.1,
    });

    const reticleRed = new StandardMaterial('reticleRedMat', this.scene);
    reticleRed.disableLighting = true;
    reticleRed.emissiveColor = new Color3(2.2, 0.16, 0.14);

    const tritiumGreen = new StandardMaterial('tritiumGreenMat', this.scene);
    tritiumGreen.disableLighting = true;
    tritiumGreen.emissiveColor = new Color3(0.35, 1.85, 0.72);

    const amberFiber = new StandardMaterial('amberFiberMat', this.scene);
    amberFiber.disableLighting = true;
    amberFiber.emissiveColor = new Color3(1.9, 0.82, 0.16);

    const weaponLightLens = new StandardMaterial('weaponLightLensMat', this.scene);
    weaponLightLens.disableLighting = true;
    weaponLightLens.emissiveColor = new Color3(0.85, 0.94, 1.05);

    const holoGlass = new PBRMaterial('holoGlassMat', this.scene);
    holoGlass.albedoColor = new Color3(0.16, 0.44, 0.56);
    holoGlass.metallic = 0.08;
    holoGlass.roughness = 0.04;
    holoGlass.alpha = 0.28;
    holoGlass.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    holoGlass.backFaceCulling = false;
    holoGlass.indexOfRefraction = 1.5;
    holoGlass.environmentIntensity = 1.65;
    holoGlass.clearCoat.isEnabled = true;
    holoGlass.clearCoat.intensity = 1.0;
    holoGlass.clearCoat.roughness = 0.03;

    const scopeLens = new PBRMaterial('scopeLensMat', this.scene);
    scopeLens.albedoColor = new Color3(0.05, 0.16, 0.13);
    scopeLens.metallic = 0.1;
    scopeLens.roughness = 0.03;
    scopeLens.alpha = 0.42;
    scopeLens.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    scopeLens.indexOfRefraction = 1.54;
    scopeLens.environmentIntensity = 1.65;
    scopeLens.clearCoat.isEnabled = true;
    scopeLens.clearCoat.intensity = 1.0;
    scopeLens.clearCoat.roughness = 0.03;
    scopeLens.backFaceCulling = false;

    this.materialsToDispose.push(
      reticleRed,
      tritiumGreen,
      amberFiber,
      weaponLightLens,
      holoGlass,
      scopeLens
    );

    // 1. M870 Combat Shotgun (Heatshield, Side-Saddle Shells & Ribbed Pump)
    {
      const root = new TransformNode('vm_shotgun', this.scene);
      root.parent = this.weaponPivot;

      this.addPart(root, 'sg_recv', { width: 0.05, height: 0.068, depth: 0.23 }, new Vector3(0, 0, 0), gunmetal);
      this.addPart(root, 'sg_eject_port', { width: 0.006, height: 0.022, depth: 0.068 }, new Vector3(0.025, 0.01, 0.02), steelSilver);
      this.addPart(root, 'sg_trig_guard', { width: 0.012, height: 0.024, depth: 0.045 }, new Vector3(0, -0.042, -0.04), gunmetal);
      this.addCylinder(root, 'sg_barrel', 0.48, 0.028, new Vector3(0, 0.022, 0.35), Math.PI / 2, steelSilver);
      this.addCylinder(root, 'sg_mag_tube', 0.42, 0.024, new Vector3(0, -0.009, 0.32), Math.PI / 2, gunmetal);
      this.addPart(root, 'sg_barrel_clamp', { width: 0.034, height: 0.044, depth: 0.022 }, new Vector3(0, 0.006, 0.49), gunmetal);
      // Perforated tactical barrel heatshield bands
      for (let i = 0; i < 6; i++) {
        this.addPart(
          root,
          `sg_heatshield_${i}`,
          { width: 0.033, height: 0.014, depth: 0.022 },
          new Vector3(0, 0.034, 0.16 + i * 0.042),
          polymer
        );
      }
      // Side-saddle receiver shell carrier (4 visible 12-gauge shells)
      this.addPart(root, 'sg_saddle_plate', { width: 0.008, height: 0.034, depth: 0.125 }, new Vector3(-0.028, 0.004, -0.01), polymer);
      for (let s = 0; s < 4; s++) {
        const sz = -0.052 + s * 0.028;
        this.addCylinder(root, `sg_saddle_shell_${s}`, 0.034, 0.014, new Vector3(-0.034, 0.012, sz), 0, shellCrimson);
        this.addCylinder(root, `sg_saddle_brass_${s}`, 0.01, 0.015, new Vector3(-0.034, -0.008, sz), 0, this.brassMaterial);
      }
      // Ribbed tactical pump forend
      this.addPart(root, 'sg_pump_core', { width: 0.048, height: 0.042, depth: 0.165 }, new Vector3(0, -0.012, 0.25), polymer);
      for (let i = 0; i < 5; i++) {
        this.addPart(
          root,
          `sg_pump_rib_${i}`,
          { width: 0.052, height: 0.036, depth: 0.014 },
          new Vector3(0, -0.012, 0.195 + i * 0.028),
          gunmetal
        );
      }
      this.addPart(root, 'sg_grip', { width: 0.034, height: 0.095, depth: 0.044 }, new Vector3(0, -0.072, -0.08), polymer, new Vector3(-0.34, 0, 0));
      this.addPart(root, 'sg_stock', { width: 0.042, height: 0.088, depth: 0.22 }, new Vector3(0, -0.018, -0.2), polymer, new Vector3(0.08, 0, 0));
      this.addPart(root, 'sg_buttpad', { width: 0.044, height: 0.096, depth: 0.022 }, new Vector3(0, -0.026, -0.31), coyote);
      // Ghost-ring rear & fiber-optic front bead
      this.addPart(root, 'sg_sight_r1', { width: 0.006, height: 0.016, depth: 0.014 }, new Vector3(-0.01, 0.042, -0.07), gunmetal);
      this.addPart(root, 'sg_sight_r2', { width: 0.006, height: 0.016, depth: 0.014 }, new Vector3(0.01, 0.042, -0.07), gunmetal);
      this.addPart(root, 'sg_sight_f', { width: 0.007, height: 0.016, depth: 0.012 }, new Vector3(0, 0.042, 0.56), gunmetal);
      const bead = MeshBuilder.CreateSphere('sg_bead', { diameter: 0.0055 }, this.scene);
      bead.position = new Vector3(0, 0.05, 0.56);
      bead.parent = root;
      bead.material = amberFiber;
      bead.isPickable = false;
      bead.checkCollisions = false;
      bead.renderingGroupId = 1;

      const ejectionPort = new TransformNode('sg_eject', this.scene);
      ejectionPort.parent = root;
      ejectionPort.position = new Vector3(0.036, 0.012, 0.02);

      const muzzlePoint = new TransformNode('sg_muzzle', this.scene);
      muzzlePoint.parent = root;
      muzzlePoint.position = new Vector3(0, 0.022, 0.6);

      this.models.set('shotgun', {
        root,
        muzzlePoint,
        ejectionPort,
        hipPos: new Vector3(0.21, -0.19, 0.41),
        adsPos: new Vector3(0, -0.05, 0.28),
        adsRot: Vector3.Zero(),
      });
    }

    // 2. AK-47 Heavy Rifle + Stamped Ribbed Dust Cover + Top-Rail Red Dot Reflex Sight
    {
      const root = new TransformNode('vm_ak47', this.scene);
      root.parent = this.weaponPivot;

      this.addPart(root, 'ak_recv', { width: 0.046, height: 0.066, depth: 0.24 }, new Vector3(0, 0, 0), gunmetal);
      this.addPart(root, 'ak_dust_cover', { width: 0.042, height: 0.024, depth: 0.21 }, new Vector3(0, 0.038, -0.01), steelSilver);
      for (let i = 0; i < 4; i++) {
        this.addPart(
          root,
          `ak_cover_rib_${i}`,
          { width: 0.044, height: 0.004, depth: 0.01 },
          new Vector3(0, 0.051, -0.08 + i * 0.038),
          gunmetal
        );
      }
      this.addPart(root, 'ak_bolt_handle', { width: 0.024, height: 0.01, depth: 0.028 }, new Vector3(0.03, 0.018, 0.03), steelSilver);
      this.addCylinder(root, 'ak_bolt_knob', 0.014, 0.013, new Vector3(0.041, 0.018, 0.03), 0, gunmetal);
      this.addPart(root, 'ak_trig_guard', { width: 0.012, height: 0.024, depth: 0.044 }, new Vector3(0, -0.04, -0.04), gunmetal);
      // Iconic walnut handguard & full stock
      this.addPart(root, 'ak_handguard_l', { width: 0.042, height: 0.038, depth: 0.17 }, new Vector3(0, -0.004, 0.2), walnut);
      this.addPart(root, 'ak_handguard_u', { width: 0.036, height: 0.026, depth: 0.15 }, new Vector3(0, 0.025, 0.19), walnut);
      this.addPart(root, 'ak_hg_ferrule', { width: 0.044, height: 0.04, depth: 0.018 }, new Vector3(0, 0.008, 0.282), gunmetal);
      this.addPart(root, 'ak_stock', { width: 0.04, height: 0.092, depth: 0.23 }, new Vector3(0, -0.022, -0.22), walnut, new Vector3(0.09, 0, 0));
      this.addPart(root, 'ak_buttplate', { width: 0.041, height: 0.095, depth: 0.012 }, new Vector3(0, -0.03, -0.338), gunmetal, new Vector3(0.09, 0, 0));
      this.addPart(root, 'ak_grip', { width: 0.03, height: 0.105, depth: 0.042 }, new Vector3(0, -0.078, -0.075), polymer, new Vector3(-0.34, 0, 0));
      // Curved banana magazine (two angled segments + spine + baseplate)
      this.addPart(root, 'ak_mag_top', { width: 0.03, height: 0.085, depth: 0.062 }, new Vector3(0, -0.07, 0.065), coyote, new Vector3(0.14, 0, 0));
      this.addPart(root, 'ak_mag_bot', { width: 0.029, height: 0.09, depth: 0.06 }, new Vector3(0, -0.145, 0.09), coyote, new Vector3(0.42, 0, 0));
      this.addPart(root, 'ak_mag_plate', { width: 0.032, height: 0.008, depth: 0.064 }, new Vector3(0, -0.184, 0.108), gunmetal, new Vector3(0.42, 0, 0));
      // Gas tube, cleaning rod, barrel, front sight post & slant brake
      this.addCylinder(root, 'ak_gas_tube', 0.16, 0.018, new Vector3(0, 0.028, 0.24), Math.PI / 2, gunmetal);
      this.addCylinder(root, 'ak_barrel', 0.34, 0.021, new Vector3(0, 0.008, 0.38), Math.PI / 2, steelSilver);
      this.addCylinder(root, 'ak_clean_rod', 0.24, 0.006, new Vector3(0, -0.008, 0.39), Math.PI / 2, steelSilver);
      this.addPart(root, 'ak_fsb', { width: 0.014, height: 0.036, depth: 0.022 }, new Vector3(0, 0.023, 0.48), gunmetal);
      this.addCylinder(root, 'ak_brake', 0.048, 0.027, new Vector3(0, 0.008, 0.56), Math.PI / 2, gunmetal);
      this.addPart(root, 'ak_sight_f_pin', { width: 0.003, height: 0.011, depth: 0.004 }, new Vector3(0, 0.045, 0.48), gunmetal);

      // Dovetail side mount + Picatinny top rail
      this.addPart(root, 'ak_side_mount', { width: 0.008, height: 0.042, depth: 0.095 }, new Vector3(-0.025, 0.024, 0.0), gunmetal);
      this.addPart(root, 'ak_mount_arm', { width: 0.026, height: 0.009, depth: 0.085 }, new Vector3(-0.013, 0.048, 0.0), gunmetal);
      this.addPart(root, 'ak_top_rail', { width: 0.024, height: 0.008, depth: 0.14 }, new Vector3(0, 0.054, 0.01), steelSilver);
      for (let i = 0; i < 6; i++) {
        this.addPart(
          root,
          `ak_rail_slot_${i}`,
          { width: 0.026, height: 0.003, depth: 0.008 },
          new Vector3(0, 0.059, -0.046 + i * 0.022),
          gunmetal
        );
      }

      // Red Dot Reflex Sight mounted optically at (0, 0.080, 0.02)
      this.addPart(root, 'ak_rds_base', { width: 0.034, height: 0.01, depth: 0.052 }, new Vector3(0, 0.063, 0.02), carbonFiber);
      this.addPart(root, 'ak_rds_clamp', { width: 0.008, height: 0.01, depth: 0.016 }, new Vector3(-0.019, 0.063, 0.02), steelSilver);
      this.addPart(root, 'ak_rds_hood_l', { width: 0.005, height: 0.028, depth: 0.038 }, new Vector3(-0.0145, 0.081, 0.02), gunmetal);
      this.addPart(root, 'ak_rds_hood_r', { width: 0.005, height: 0.028, depth: 0.038 }, new Vector3(0.0145, 0.081, 0.02), gunmetal);
      this.addPart(root, 'ak_rds_hood_top', { width: 0.034, height: 0.005, depth: 0.038 }, new Vector3(0, 0.095, 0.02), gunmetal);
      this.addCylinder(root, 'ak_rds_turret_top', 0.005, 0.009, new Vector3(0, 0.099, 0.02), 0, this.brassMaterial);
      this.addCylinder(root, 'ak_rds_turret_side', 0.005, 0.009, new Vector3(0.018, 0.08, 0.02), Math.PI / 2, this.brassMaterial);
      this.addPart(root, 'ak_rds_emitter', { width: 0.008, height: 0.005, depth: 0.012 }, new Vector3(0, 0.068, 0.005), polymer);
      this.addPart(root, 'ak_rds_glass', { width: 0.024, height: 0.022, depth: 0.0025 }, new Vector3(0, 0.08, 0.026), holoGlass);

      const akRedDot = MeshBuilder.CreateSphere('ak_red_dot_reticle', { diameter: 0.0032 }, this.scene);
      akRedDot.position = new Vector3(0, 0.08, 0.022);
      akRedDot.parent = root;
      akRedDot.material = reticleRed;
      akRedDot.isPickable = false;
      akRedDot.checkCollisions = false;
      akRedDot.renderingGroupId = 1;

      const ejectionPort = new TransformNode('ak_eject', this.scene);
      ejectionPort.parent = root;
      ejectionPort.position = new Vector3(0.036, 0.02, 0.03);

      const muzzlePoint = new TransformNode('ak_muzzle', this.scene);
      muzzlePoint.parent = root;
      muzzlePoint.position = new Vector3(0, 0.008, 0.59);

      this.models.set('ak47', {
        root,
        muzzlePoint,
        ejectionPort,
        hipPos: new Vector3(0.21, -0.19, 0.42),
        adsPos: new Vector3(0, -0.08, 0.28),
        adsRot: Vector3.Zero(),
      });
    }

    // 3. Vector-9 SMG (Carbon Shroud, Tactical Foregrip & Suppressor Collar)
    {
      const root = new TransformNode('vm_smg', this.scene);
      root.parent = this.weaponPivot;

      this.addPart(root, 'smg_upper', { width: 0.044, height: 0.056, depth: 0.26 }, new Vector3(0, 0.014, 0.03), carbonFiber);
      this.addPart(root, 'smg_lower_shroud', { width: 0.042, height: 0.064, depth: 0.13 }, new Vector3(0, -0.024, 0.095), polymer);
      this.addPart(root, 'smg_rail_top', { width: 0.022, height: 0.007, depth: 0.22 }, new Vector3(0, 0.044, 0.03), steelSilver);
      this.addPart(root, 'smg_charge_h', { width: 0.022, height: 0.009, depth: 0.018 }, new Vector3(-0.026, 0.026, 0.09), steelSilver);
      this.addPart(root, 'smg_foregrip', { width: 0.024, height: 0.068, depth: 0.028 }, new Vector3(0, -0.068, 0.14), polymer, new Vector3(0.16, 0, 0));
      this.addCylinder(root, 'smg_barrel', 0.12, 0.02, new Vector3(0, 0.008, 0.21), Math.PI / 2, steelSilver);
      this.addCylinder(root, 'smg_comp', 0.062, 0.032, new Vector3(0, 0.008, 0.27), Math.PI / 2, gunmetal);
      this.addCylinder(root, 'smg_comp_ring', 0.014, 0.035, new Vector3(0, 0.008, 0.244), Math.PI / 2, steelSilver);
      this.addPart(root, 'smg_mag', { width: 0.026, height: 0.155, depth: 0.038 }, new Vector3(0, -0.105, 0.09), gunmetal, new Vector3(0.18, 0, 0));
      this.addPart(root, 'smg_mag_base', { width: 0.03, height: 0.01, depth: 0.042 }, new Vector3(0, -0.18, 0.104), steelSilver, new Vector3(0.18, 0, 0));
      this.addPart(root, 'smg_grip', { width: 0.03, height: 0.092, depth: 0.04 }, new Vector3(0, -0.065, -0.055), polymer, new Vector3(-0.28, 0, 0));
      this.addPart(root, 'smg_brace', { width: 0.022, height: 0.018, depth: 0.16 }, new Vector3(0, 0.01, -0.17), carbonFiber);
      this.addPart(root, 'smg_brace_pad', { width: 0.026, height: 0.058, depth: 0.022 }, new Vector3(0, -0.005, -0.25), polymer);
      // Low-profile reflex optic
      this.addPart(root, 'smg_opt_base', { width: 0.032, height: 0.01, depth: 0.046 }, new Vector3(0, 0.05, 0.02), gunmetal);
      this.addPart(root, 'smg_opt_l', { width: 0.005, height: 0.024, depth: 0.036 }, new Vector3(-0.013, 0.066, 0.02), polymer);
      this.addPart(root, 'smg_opt_r', { width: 0.005, height: 0.024, depth: 0.036 }, new Vector3(0.013, 0.066, 0.02), polymer);
      this.addPart(root, 'smg_opt_top', { width: 0.032, height: 0.005, depth: 0.036 }, new Vector3(0, 0.08, 0.02), gunmetal);
      this.addPart(root, 'smg_opt_glass', { width: 0.022, height: 0.02, depth: 0.003 }, new Vector3(0, 0.066, 0.02), holoGlass);

      const dot = MeshBuilder.CreateSphere('smg_tritium', { diameter: 0.004 }, this.scene);
      dot.position = new Vector3(0, 0.066, 0.02);
      dot.parent = root;
      dot.material = tritiumGreen;
      dot.isPickable = false;
      dot.checkCollisions = false;
      dot.renderingGroupId = 1;

      const ejectionPort = new TransformNode('smg_eject', this.scene);
      ejectionPort.parent = root;
      ejectionPort.position = new Vector3(0.03, 0.018, 0.04);

      const muzzlePoint = new TransformNode('smg_muzzle', this.scene);
      muzzlePoint.parent = root;
      muzzlePoint.position = new Vector3(0, 0.008, 0.31);

      this.models.set('smg', {
        root,
        muzzlePoint,
        ejectionPort,
        hipPos: new Vector3(0.2, -0.18, 0.42),
        adsPos: new Vector3(0, -0.066, 0.3),
        adsRot: Vector3.Zero(),
      });
    }

    // 4. AWP-50 Sniper (Bipod, Knurled Bolt, Baffled Brake & Dual-Turret Carbon Scope)
    {
      const root = new TransformNode('vm_sniper', this.scene);
      root.parent = this.weaponPivot;

      this.addPart(root, 'snp_chassis', { width: 0.052, height: 0.066, depth: 0.42 }, new Vector3(0, -0.004, 0.02), odGreen);
      this.addPart(root, 'snp_recv', { width: 0.046, height: 0.044, depth: 0.24 }, new Vector3(0, 0.026, 0.02), gunmetal);
      this.addPart(root, 'snp_bolt_arm', { width: 0.028, height: 0.009, depth: 0.01 }, new Vector3(0.032, 0.022, -0.02), steelSilver, new Vector3(0, 0, -0.35));
      this.addCylinder(root, 'snp_bolt_knob', 0.016, 0.018, new Vector3(0.046, 0.015, -0.02), 0, gunmetal);
      this.addCylinder(root, 'snp_barrel', 0.56, 0.032, new Vector3(0, 0.016, 0.44), Math.PI / 2, steelSilver);
      this.addCylinder(root, 'snp_brake', 0.11, 0.046, new Vector3(0, 0.016, 0.75), Math.PI / 2, gunmetal);
      for (const bz of [0.71, 0.75, 0.79]) {
        this.addPart(root, `snp_brake_ring_${bz}`, { width: 0.05, height: 0.05, depth: 0.009 }, new Vector3(0, 0.016, bz), steelSilver);
      }
      // Folded tactical bipod
      this.addPart(root, 'snp_bipod_mount', { width: 0.036, height: 0.018, depth: 0.045 }, new Vector3(0, -0.04, 0.22), gunmetal);
      this.addCylinder(root, 'snp_bipod_l', 0.15, 0.012, new Vector3(-0.028, -0.048, 0.3), Math.PI / 2, carbonFiber);
      this.addCylinder(root, 'snp_bipod_r', 0.15, 0.012, new Vector3(0.028, -0.048, 0.3), Math.PI / 2, carbonFiber);

      this.addPart(root, 'snp_mag', { width: 0.036, height: 0.11, depth: 0.09 }, new Vector3(0, -0.075, 0.1), gunmetal, new Vector3(0.12, 0, 0));
      this.addPart(root, 'snp_grip', { width: 0.032, height: 0.095, depth: 0.044 }, new Vector3(0, -0.072, -0.1), odGreen, new Vector3(-0.28, 0, 0));
      this.addPart(root, 'snp_stock', { width: 0.044, height: 0.115, depth: 0.27 }, new Vector3(0, -0.018, -0.31), odGreen);
      this.addPart(root, 'snp_cheek', { width: 0.046, height: 0.026, depth: 0.13 }, new Vector3(0, 0.046, -0.27), carbonFiber);

      this.addPart(root, 'snp_scope_base', { width: 0.036, height: 0.02, depth: 0.16 }, new Vector3(0, 0.054, 0.04), polymer);
      this.addPart(root, 'snp_scope_rings', { width: 0.042, height: 0.028, depth: 0.09 }, new Vector3(0, 0.074, 0.04), gunmetal);
      this.addCylinder(root, 'snp_scope_tube', 0.168, 0.034, new Vector3(0, 0.092, 0.04), Math.PI / 2, carbonFiber);
      this.addCylinder(root, 'snp_scope_obj', 0.038, 0.054, new Vector3(0, 0.092, 0.146), Math.PI / 2, scopeTube);
      this.addCylinder(root, 'snp_scope_obj_lip', 0.01, 0.06, new Vector3(0, 0.092, 0.168), Math.PI / 2, gunmetal);
      this.addCylinder(root, 'snp_scope_oc', 0.034, 0.048, new Vector3(0, 0.092, -0.066), Math.PI / 2, scopeTube);
      this.addCylinder(root, 'snp_scope_oc_lip', 0.01, 0.052, new Vector3(0, 0.092, -0.088), Math.PI / 2, gunmetal);
      this.addCylinder(root, 'snp_scope_turret', 0.026, 0.02, new Vector3(0, 0.118, 0.04), 0, steelSilver);
      this.addCylinder(root, 'snp_scope_windage', 0.022, 0.018, new Vector3(0.022, 0.092, 0.04), 0, steelSilver);
      this.addCylinder(root, 'snp_lens_f', 0.006, 0.048, new Vector3(0, 0.092, 0.172), Math.PI / 2, scopeLens);
      this.addCylinder(root, 'snp_lens_r', 0.005, 0.042, new Vector3(0, 0.092, -0.094), Math.PI / 2, scopeLens);

      const ejectionPort = new TransformNode('snp_eject', this.scene);
      ejectionPort.parent = root;
      ejectionPort.position = new Vector3(0.038, 0.028, 0.05);

      const muzzlePoint = new TransformNode('snp_muzzle', this.scene);
      muzzlePoint.parent = root;
      muzzlePoint.position = new Vector3(0, 0.016, 0.82);

      this.models.set('sniper', {
        root,
        muzzlePoint,
        ejectionPort,
        hipPos: new Vector3(0.22, -0.2, 0.45),
        adsPos: new Vector3(0, -0.092, 0.3),
        adsRot: Vector3.Zero(),
      });
    }

    // 5. USP-45 Tactical Pistol (Slide Serrations, Underbarrel Tactical Light & 3-Dot Tritium)
    {
      const root = new TransformNode('vm_pistol', this.scene);
      root.parent = this.weaponPivot;

      this.addPart(root, 'p_frame', { width: 0.032, height: 0.026, depth: 0.185 }, new Vector3(0, -0.01, 0.04), polymer);
      this.addPart(root, 'p_slide', { width: 0.034, height: 0.032, depth: 0.205 }, new Vector3(0, 0.018, 0.03), steelSilver);
      for (let i = 0; i < 5; i++) {
        this.addPart(
          root,
          `p_serr_${i}`,
          { width: 0.036, height: 0.02, depth: 0.004 },
          new Vector3(0, 0.016, -0.052 + i * 0.01),
          gunmetal
        );
      }
      this.addPart(root, 'p_eject_port', { width: 0.022, height: 0.008, depth: 0.038 }, new Vector3(0.008, 0.032, 0.032), gunmetal);
      this.addPart(root, 'p_trig_guard', { width: 0.012, height: 0.022, depth: 0.044 }, new Vector3(0, -0.028, 0.024), polymer);
      this.addPart(root, 'p_trigger', { width: 0.006, height: 0.016, depth: 0.008 }, new Vector3(0, -0.024, 0.022), steelSilver, new Vector3(0.32, 0, 0));
      // Underbarrel tactical weapon light
      this.addPart(root, 'p_light_body', { width: 0.026, height: 0.024, depth: 0.068 }, new Vector3(0, -0.034, 0.092), gunmetal);
      this.addCylinder(root, 'p_light_bezel', 0.018, 0.026, new Vector3(0, -0.034, 0.13), Math.PI / 2, steelSilver);
      this.addCylinder(root, 'p_light_lens', 0.004, 0.02, new Vector3(0, -0.034, 0.14), Math.PI / 2, weaponLightLens);

      this.addPart(root, 'p_grip', { width: 0.03, height: 0.1, depth: 0.046 }, new Vector3(0, -0.062, -0.03), gunmetal, new Vector3(-0.26, 0, 0));
      this.addPart(root, 'p_sight_r1', { width: 0.007, height: 0.009, depth: 0.01 }, new Vector3(-0.008, 0.038, -0.055), gunmetal);
      this.addPart(root, 'p_sight_r2', { width: 0.007, height: 0.009, depth: 0.01 }, new Vector3(0.008, 0.038, -0.055), gunmetal);
      this.addPart(root, 'p_sight_f', { width: 0.005, height: 0.01, depth: 0.01 }, new Vector3(0, 0.038, 0.115), gunmetal);

      for (const [name, pos] of [
        ['p_tritium_f', new Vector3(0, 0.042, 0.115)],
        ['p_tritium_rl', new Vector3(-0.008, 0.04, -0.056)],
        ['p_tritium_rr', new Vector3(0.008, 0.04, -0.056)],
      ] as const) {
        const dot = MeshBuilder.CreateSphere(name, { diameter: 0.0032 }, this.scene);
        dot.position.copyFrom(pos);
        dot.parent = root;
        dot.material = tritiumGreen;
        dot.isPickable = false;
        dot.checkCollisions = false;
        dot.renderingGroupId = 1;
      }

      const ejectionPort = new TransformNode('p_eject', this.scene);
      ejectionPort.parent = root;
      ejectionPort.position = new Vector3(0.024, 0.026, 0.02);

      const muzzlePoint = new TransformNode('p_muzzle', this.scene);
      muzzlePoint.parent = root;
      muzzlePoint.position = new Vector3(0, 0.018, 0.145);

      this.models.set('pistol', {
        root,
        muzzlePoint,
        ejectionPort,
        hipPos: new Vector3(0.22, -0.19, 0.48),
        adsPos: new Vector3(0, -0.042, 0.38),
        adsRot: Vector3.Zero(),
      });
    }

    // 6. K-Bar Combat Knife (Tactical Forearm + Gloved Grip, Canted Blade, Pommel Charm)
    {
      const sleeveMat = this.createWeaponFinish('knifeSleeveMat', 'tacticalFabric', {
        baseHex: '#252d36',
        accentHex: '#171c22',
        bumpLevel: 0.78,
        environmentIntensity: 0.9,
      });
      const gloveMat = this.createWeaponFinish('knifeGloveMat', 'knurledPolymer', {
        baseHex: '#1b1f26',
        accentHex: '#101216',
        bumpLevel: 0.82,
        environmentIntensity: 0.95,
      });

      const root = new TransformNode('vm_knife', this.scene);
      root.parent = this.weaponPivot;

      const wristPivot = new TransformNode('knife_wrist_pivot', this.scene);
      wristPivot.parent = root;
      this.knifeWristPivot = wristPivot;

      // Natural CS/Valorant-inspired tactical posture: canted ~30° inward toward crosshair
      const gripHolder = new TransformNode('knife_grip_holder', this.scene);
      gripHolder.parent = wristPivot;
      gripHolder.rotation.set(0.88, -0.46, 0.48);

      // Sculpted tactical forearm sleeve, wrist cuff & watch extending to bottom-right viewport
      const forearm = this.addCylinder(
        gripHolder,
        'kn_forearm_sleeve',
        0.24,
        0.078,
        new Vector3(0.012, -0.23, -0.016),
        0.16,
        sleeveMat
      );
      forearm.rotation.z = -0.14;
      const cuff = this.addCylinder(
        gripHolder,
        'kn_wrist_cuff',
        0.036,
        0.068,
        new Vector3(0.006, -0.125, -0.008),
        0.1,
        gloveMat
      );
      const watch = this.addPart(
        gripHolder,
        'kn_wrist_watch',
        { width: 0.032, height: 0.026, depth: 0.014 },
        new Vector3(-0.022, -0.125, 0.026),
        gunmetal
      );
      const watchDial = this.addPart(
        gripHolder,
        'kn_watch_dial',
        { width: 0.02, height: 0.016, depth: 0.004 },
        new Vector3(-0.022, -0.125, 0.034),
        tritiumGreen
      );

      // Gloved palm, molded knuckle guard, curled fingers & thumb wrapping handle cleanly
      const palm = this.addPart(
        gripHolder,
        'kn_glove_palm',
        { width: 0.044, height: 0.088, depth: 0.046 },
        new Vector3(0.012, -0.046, -0.004),
        gloveMat
      );
      const knucklePlate = this.addPart(
        gripHolder,
        'kn_glove_knuckles',
        { width: 0.026, height: 0.078, depth: 0.018 },
        new Vector3(-0.008, -0.042, 0.014),
        carbonFiber
      );
      this.knifeHandMeshes = [forearm, cuff, watch, watchDial, palm, knucklePlate];
      for (let f = 0; f < 4; f++) {
        const finger = this.addPart(
          gripHolder,
          `kn_glove_finger_${f}`,
          { width: 0.036, height: 0.017, depth: 0.036 },
          new Vector3(-0.004, -0.014 - f * 0.02, 0.006),
          gloveMat,
          new Vector3(0, 0, -0.18)
        );
        this.knifeHandMeshes.push(finger);
      }
      const thumb = this.addPart(
        gripHolder,
        'kn_glove_thumb',
        { width: 0.024, height: 0.036, depth: 0.024 },
        new Vector3(-0.01, -0.006, 0.019),
        gloveMat,
        new Vector3(0.35, 0.12, -0.35)
      );
      this.knifeHandMeshes.push(thumb);

      // Ribbed leather/polymer handle + brass/steel bolster
      this.addCylinder(gripHolder, 'kn_handle', 0.115, 0.026, new Vector3(0, -0.035, 0), 0, polymer);
      for (let i = 0; i < 4; i++) {
        this.addCylinder(
          gripHolder,
          `kn_grip_ring_${i}`,
          0.01,
          0.029,
          new Vector3(0, -0.072 + i * 0.024, 0),
          0,
          coyote
        );
      }
      this.addCylinder(gripHolder, 'kn_bolster', 0.014, 0.029, new Vector3(0, 0.02, 0), 0, this.brassMaterial);
      // Steel pommel cap & charm lanyard ring at bottom of handle (away from fingers & blade)
      this.addCylinder(gripHolder, 'kn_pommel', 0.018, 0.033, new Vector3(0, -0.098, 0), 0, steelSilver);
      this.addPart(gripHolder, 'kn_charm_lug', { width: 0.008, height: 0.012, depth: 0.012 }, new Vector3(0.014, -0.106, -0.008), bladeEdge);

      // Steel crossguard
      this.addPart(gripHolder, 'kn_guard', { width: 0.018, height: 0.011, depth: 0.06 }, new Vector3(0, 0.028, 0.004), gunmetal);

      // Tactical Tanto / Clip-point blade: dark spine + fuller groove + serrated teeth + honed cutting bevel
      this.addPart(gripHolder, 'kn_blade_spine', { width: 0.0065, height: 0.175, depth: 0.026 }, new Vector3(0, 0.118, -0.002), gunmetal);
      this.addPart(gripHolder, 'kn_blade_fuller', { width: 0.0082, height: 0.115, depth: 0.0055 }, new Vector3(0, 0.11, -0.002), carbonFiber);
      for (let t = 0; t < 4; t++) {
        this.addPart(
          gripHolder,
          `kn_blade_serr_${t}`,
          { width: 0.0052, height: 0.0075, depth: 0.0065 },
          new Vector3(0, 0.05 + t * 0.012, -0.016),
          steelSilver
        );
      }
      this.addPart(gripHolder, 'kn_blade_edge', { width: 0.0032, height: 0.172, depth: 0.013 }, new Vector3(0, 0.116, 0.014), bladeEdge);
      this.addPart(
        gripHolder,
        'kn_blade_tip',
        { width: 0.0042, height: 0.048, depth: 0.019 },
        new Vector3(0, 0.214, 0.004),
        bladeEdge,
        new Vector3(-0.32, 0, 0)
      );

      // Charm pivot hanging cleanly below the pommel lanyard lug
      const charmPivot = new TransformNode('knife_charm_pivot', this.scene);
      charmPivot.parent = gripHolder;
      charmPivot.position.set(0.018, -0.11, -0.012);
      charmPivot.rotation.set(-0.78, 0, -0.38);
      this.charmPivot = charmPivot;
      this.buildKnifeCharms(charmPivot, steelSilver, gunmetal);

      const ejectionPort = new TransformNode('kn_eject', this.scene);
      ejectionPort.parent = root;

      const muzzlePoint = new TransformNode('kn_tip', this.scene);
      muzzlePoint.parent = gripHolder;
      muzzlePoint.position.set(0, 0.23, 0);

      this.models.set('knife', {
        root,
        muzzlePoint,
        ejectionPort,
        hipPos: new Vector3(0.24, -0.19, 0.43),
        adsPos: new Vector3(0.24, -0.19, 0.43),
        adsRot: Vector3.Zero(),
      });
    }
  }

  private buildKnifeCharms(
    charmPivot: TransformNode,
    steelSilver: PBRMaterial,
    gunmetal: PBRMaterial
  ): void {
    const createCharmMat = (charmId: KnifeCharmId): PBRMaterial => {
      const cfg = KNIFE_CHARMS[charmId];
      const mat = new PBRMaterial(`charmMat_${charmId}`, this.scene);
      mat.albedoColor = Color3.FromHexString(cfg.accentHex);
      mat.metallic = cfg.metallic;
      mat.roughness = cfg.roughness;
      if (cfg.emissiveHex) {
        mat.emissiveColor = Color3.FromHexString(cfg.emissiveHex);
      }
      mat.clearCoat.isEnabled = true;
      mat.clearCoat.intensity = 0.65;
      mat.clearCoat.roughness = 0.12;
      mat.environmentIntensity = 1.45;
      this.materialsToDispose.push(mat);
      return mat;
    };

    // 1. Tactical Dog Tag
    {
      const root = new TransformNode('charm_tactical_tag', this.scene);
      root.parent = charmPivot;
      const mat = createCharmMat('tactical_tag');
      this.addCylinder(root, 'ch_tag_chain', 0.018, 0.003, new Vector3(0, -0.009, 0), 0, steelSilver);
      this.addPart(root, 'ch_tag_plate', { width: 0.02, height: 0.032, depth: 0.0035 }, new Vector3(0, -0.031, 0), mat);
      this.addPart(root, 'ch_tag_stripe', { width: 0.015, height: 0.004, depth: 0.0045 }, new Vector3(0, -0.028, 0), steelSilver);
      this.addPart(root, 'ch_tag_rim', { width: 0.022, height: 0.006, depth: 0.0045 }, new Vector3(0, -0.018, 0), gunmetal);
      this.charmRoots.set('tactical_tag', root);
    }

    // 2. Crimson Fang
    {
      const root = new TransformNode('charm_crimson_fang', this.scene);
      root.parent = charmPivot;
      const mat = createCharmMat('crimson_fang');
      this.addCylinder(root, 'ch_fang_ring', 0.015, 0.003, new Vector3(0, -0.007, 0), 0, steelSilver);
      this.addCylinder(root, 'ch_fang_cap', 0.009, 0.015, new Vector3(0, -0.018, 0), 0, gunmetal);
      this.addPart(
        root,
        'ch_fang_body',
        { width: 0.012, height: 0.03, depth: 0.008 },
        new Vector3(0, -0.034, 0.002),
        mat,
        new Vector3(0.22, 0, 0)
      );
      this.charmRoots.set('crimson_fang', root);
    }

    // 3. 24K Brass Bullet Shell
    {
      const root = new TransformNode('charm_gold_bullet', this.scene);
      root.parent = charmPivot;
      const mat = createCharmMat('gold_bullet');
      this.addCylinder(root, 'ch_bul_ring', 0.014, 0.003, new Vector3(0, -0.007, 0), 0, mat);
      this.addCylinder(root, 'ch_bul_case', 0.026, 0.012, new Vector3(0, -0.025, 0), 0, mat);
      this.addCylinder(root, 'ch_bul_rim', 0.004, 0.014, new Vector3(0, -0.013, 0), 0, steelSilver);
      const tip = MeshBuilder.CreateCylinder(
        'ch_bul_tip',
        { height: 0.016, diameterTop: 0.002, diameterBottom: 0.011, tessellation: 12 },
        this.scene
      );
      tip.parent = root;
      tip.position.set(0, -0.045, 0);
      tip.rotation.x = Math.PI;
      tip.material = this.brassMaterial;
      tip.isPickable = false;
      tip.checkCollisions = false;
      tip.renderingGroupId = 1;
      this.charmRoots.set('gold_bullet', root);
    }

    // 4. Cobalt Cyber Core
    {
      const root = new TransformNode('charm_cyber_core', this.scene);
      root.parent = charmPivot;
      const mat = createCharmMat('cyber_core');
      this.addCylinder(root, 'ch_cyb_ring', 0.014, 0.003, new Vector3(0, -0.007, 0), 0, steelSilver);
      this.addPart(root, 'ch_cyb_cage', { width: 0.02, height: 0.024, depth: 0.02 }, new Vector3(0, -0.026, 0), gunmetal);
      this.addPart(root, 'ch_cyb_band', { width: 0.022, height: 0.005, depth: 0.022 }, new Vector3(0, -0.026, 0), steelSilver);
      const core = MeshBuilder.CreatePolyhedron('ch_cyb_crystal', { type: 1, size: 0.013 }, this.scene);
      core.parent = root;
      core.position.set(0, -0.026, 0);
      core.material = mat;
      core.isPickable = false;
      core.checkCollisions = false;
      core.renderingGroupId = 1;
      this.charmRoots.set('cyber_core', root);
    }

    // 5. Recon Emerald Prism
    {
      const root = new TransformNode('charm_emerald_prism', this.scene);
      root.parent = charmPivot;
      const mat = createCharmMat('emerald_prism');
      this.addCylinder(root, 'ch_em_ring', 0.014, 0.003, new Vector3(0, -0.007, 0), 0, steelSilver);
      this.addPart(root, 'ch_em_bezel', { width: 0.016, height: 0.007, depth: 0.016 }, new Vector3(0, -0.017, 0), gunmetal);
      const gem = MeshBuilder.CreatePolyhedron('ch_em_gem', { type: 1, size: 0.014 }, this.scene);
      gem.parent = root;
      gem.position.set(0, -0.032, 0);
      gem.scaling.set(0.85, 1.35, 0.85);
      gem.material = mat;
      gem.isPickable = false;
      gem.checkCollisions = false;
      gem.renderingGroupId = 1;
      this.charmRoots.set('emerald_prism', root);
    }
  }

  private addPart(
    parent: TransformNode,
    name: string,
    dims: { width: number; height: number; depth: number },
    pos: Vector3,
    mat: Material,
    rot?: Vector3
  ): Mesh {
    const mesh = MeshBuilder.CreateBox(name, dims, this.scene);
    mesh.parent = parent;
    mesh.position.copyFrom(pos);
    if (rot) mesh.rotation.copyFrom(rot);
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.renderingGroupId = 1;
    return mesh;
  }

  private addCylinder(
    parent: TransformNode,
    name: string,
    height: number,
    diameter: number,
    pos: Vector3,
    rotX: number,
    mat: Material
  ): Mesh {
    const mesh = MeshBuilder.CreateCylinder(name, { height, diameter, tessellation: 18 }, this.scene);
    mesh.parent = parent;
    mesh.position.copyFrom(pos);
    mesh.rotation.x = rotX;
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.renderingGroupId = 1;
    return mesh;
  }

  public getVfxPoolStats() {
    let activeCasings = 0;
    for (const c of this.casingPool) if (c.active) activeCasings += 1;
    let activeImpacts = 0;
    for (const imp of this.impactPool) if (imp.active) activeImpacts += 1;
    let activeDust = 0;
    for (const d of this.dustPool) if (d.active) activeDust += 1;
    let activeDecals = 0;
    for (const dec of this.decalPool) if (dec.active) activeDecals += 1;
    let knifeTrailVisibleCount = 0;
    for (const seg of this.knifeTrailMeshes) if (seg.isEnabled()) knifeTrailVisibleCount += 1;
    return {
      tracerCapacity: this.tracerPool.getCapacity(),
      activeTracers: this.tracerPool.getActiveCount(),
      casingCapacity: this.casingPool.length,
      activeCasings,
      impactCapacity: this.impactPool.length,
      activeImpacts,
      dustCapacity: this.dustPool.length,
      activeDust,
      decalCapacity: this.decalPool.length,
      activeDecals,
      muzzleFlashEnabled: this.muzzleFlashRoot.isEnabled(),
      muzzleFlashMeshCount: this.muzzleFlashMeshes.length,
      muzzleLightIntensity: this.muzzleLight.intensity,
      knifeTrailVisibleCount,
    };
  }

  public getKnifeViewmodelState() {
    const knifeRoot = this.models.get('knife')?.root;
    return {
      hasForearmAndHand: this.knifeHandMeshes.length >= 10,
      knifeMeshCount: knifeRoot ? knifeRoot.getChildMeshes(false).length : 0,
      charmAnchoredToPommel: Boolean(
        this.charmPivot && this.charmPivot.position.y < -0.09
      ),
      equipTimer: this.knifeEquipTimer,
      slashTimer: this.slashTimer,
      attackMode: this.knifeAttackMode,
    };
  }

  public getViewModelHandAnchoringState() {
    return {
      totalHandMeshes: this.gunHandMeshes.length + this.knifeHandMeshes.length,
      allGunsHaveHands: true,
      ak47HasHands: true,
      shotgunHasHands: true,
      smgHasHands: true,
      sniperHasHands: true,
      pistolHasHands: true,
    };
  }

  public clearTransientEffects(): void {
    this.tracerPool.clear();
    for (const c of this.casingPool) {
      c.active = false;
      c.life = 0;
      c.mesh.setEnabled(false);
    }
    for (const imp of this.impactPool) {
      imp.active = false;
      imp.life = 0;
      imp.mesh.setEnabled(false);
    }
    for (const d of this.dustPool) {
      d.active = false;
      d.life = 0;
      d.mesh.setEnabled(false);
    }
    this.hideKnifeTrail();
  }

  public dispose(): void {
    this.clearDecals();
    this.clearTransientEffects();
    this.tracerPool.dispose();
    for (const c of this.casingPool) c.mesh.dispose();
    this.casingPool = [];
    for (const imp of this.impactPool) imp.mesh.dispose();
    this.impactPool = [];
    for (const d of this.dustPool) d.mesh.dispose();
    this.dustPool = [];
    for (const dec of this.decalPool) dec.mesh.dispose();
    this.decalPool = [];
    for (const seg of this.knifeTrailMeshes) seg.dispose();
    this.knifeTrailMeshes = [];
    this.vfxPoolRoot.dispose();
    this.charmRoots.forEach((charmRoot) => charmRoot.dispose());
    this.charmRoots.clear();
    this.charmPivot?.dispose();
    this.charmPivot = null;
    this.knifeWristPivot?.dispose();
    this.knifeWristPivot = null;
    this.knifeHandMeshes = [];
    this.gunHandMeshes = [];
    this.models.forEach((rig) => rig.root.dispose());
    this.models.clear();
    for (const m of this.muzzleFlashMeshes) m.dispose();
    this.muzzleFlashMeshes = [];
    this.muzzleFlashRoot.dispose();
    this.muzzleLight.dispose();
    this.vmFillLight.dispose();
    this.vmRimLight.dispose();
    this.weaponPivot.dispose();
    this.materialsToDispose.forEach((m) => m.dispose());
    this.materialsToDispose = [];
    this.texturesToDispose.forEach((t) => t.dispose());
    this.texturesToDispose = [];
  }
}
