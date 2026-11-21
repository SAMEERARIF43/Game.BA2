import {
  AbstractMesh,
  BaseTexture,
  Color3,
  DynamicTexture,
  Engine,
  Material,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointLight,
  Ray,
  RawTexture,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  UniversalCamera,
  Vector3,
} from '@babylonjs/core';
import { BotManager } from '../bots/BotManager';
import { TeamId } from '../maps/types';
import { AudioEngine } from './AudioEngine';
import {
  normalizeGunId,
  normalizeKnifeCharmId,
} from './loadoutRules';
import { PlayerController } from './PlayerController';
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

interface TransientTracer {
  mesh: Mesh;
  life: number;
  maxLife: number;
}

interface EjectedCasing {
  mesh: Mesh;
  vel: Vector3;
  spin: Vector3;
  life: number;
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
  private charmPivot: TransformNode | null = null;
  private charmRoots = new Map<KnifeCharmId, TransformNode>();

  private muzzleFlashMesh: Mesh;
  private muzzleLight: PointLight;
  private vmFillLight: PointLight;
  private vmRimLight: PointLight;
  private muzzleFlashTimer = 0;

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
  private readonly slashDuration = 0.32;
  private slashSide = 1;
  private quickMeleeReturnSlot: 1 | 2 | null = null;

  private spreadBloom = 0;
  private kickBackZ = 0;
  private kickRotX = 0;
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
  private tracers: TransientTracer[] = [];
  private casings: EjectedCasing[] = [];
  private impacts: { mesh: Mesh; vel: Vector3; life: number; maxLife: number }[] = [];
  private bulletDecals: Mesh[] = [];
  private decalMaterial: StandardMaterial;
  private tracerMaterial: StandardMaterial;
  private tracerSuppMaterial: StandardMaterial;
  private brassMaterial: PBRMaterial;
  private impactMatTarget: StandardMaterial;
  private impactMatSparkA: StandardMaterial;
  private impactMatSparkB: StandardMaterial;
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

    this.muzzleFlashMesh = this.createMuzzleFlash();
    this.muzzleLight = new PointLight('muzzleLight', Vector3.Zero(), this.scene);
    this.muzzleLight.diffuse = new Color3(1.0, 0.72, 0.35);
    this.muzzleLight.intensity = 0;
    this.muzzleLight.range = 8;
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
    this.decalMaterial.diffuseColor = new Color3(0.06, 0.06, 0.07);
    this.decalMaterial.specularColor = Color3.Black();
    this.decalMaterial.zOffset = -2;

    this.tracerMaterial = new StandardMaterial('tracerGlowMat', this.scene);
    this.tracerMaterial.disableLighting = true;
    this.tracerMaterial.emissiveColor = new Color3(1.75, 1.15, 0.38);

    this.tracerSuppMaterial = new StandardMaterial('tracerSuppGlowMat', this.scene);
    this.tracerSuppMaterial.disableLighting = true;
    this.tracerSuppMaterial.emissiveColor = new Color3(1.1, 0.95, 0.55);

    this.brassMaterial = new PBRMaterial('brassCasingMat', this.scene);
    this.brassMaterial.albedoColor = Color3.FromHexString('#d4a64a');
    this.brassMaterial.metallic = 0.95;
    this.brassMaterial.roughness = 0.24;

    this.impactMatTarget = new StandardMaterial('impactMatTarget', this.scene);
    this.impactMatTarget.disableLighting = true;
    this.impactMatTarget.emissiveColor = new Color3(1.2, 0.32, 0.22);

    this.impactMatSparkA = new StandardMaterial('impactMatSparkA', this.scene);
    this.impactMatSparkA.disableLighting = true;
    this.impactMatSparkA.emissiveColor = new Color3(1.2, 0.85, 0.38);

    this.impactMatSparkB = new StandardMaterial('impactMatSparkB', this.scene);
    this.impactMatSparkB.disableLighting = true;
    this.impactMatSparkB.emissiveColor = new Color3(0.95, 0.95, 1.0);

    this.materialsToDispose.push(
      this.decalMaterial,
      this.tracerMaterial,
      this.tracerSuppMaterial,
      this.brassMaterial,
      this.impactMatTarget,
      this.impactMatSparkA,
      this.impactMatSparkB
    );

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
    const maxDecals = quality === 'LOW' ? 8 : quality === 'MEDIUM' ? 24 : 48;
    while (this.bulletDecals.length > maxDecals) {
      const oldest = this.bulletDecals.shift();
      oldest?.dispose();
    }
  }

  public clearDecals(): void {
    for (const d of this.bulletDecals) {
      d.dispose();
    }
    this.bulletDecals = [];
  }

  public setViewModelVisible(visible: boolean): void {
    this.viewModelVisible = visible;
    this.weaponPivot.setEnabled(visible);
    this.vmFillLight.setEnabled(visible);
    this.vmRimLight.setEnabled(visible);
    if (!visible) {
      this.muzzleFlashMesh.isVisible = false;
      this.muzzleLight.intensity = 0;
      this.muzzleFlashTimer = 0;
    }
  }

  public setMultiplayerContext(enabled: boolean, team: TeamId, friendlyFire: boolean): void {
    this.multiplayerMode = enabled;
    this.localTeam = team;
    this.friendlyFire = friendlyFire;
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

  public cycleSlot(_delta: 1 | -1): void {
    this.selectSlot(this.activeSlot === 1 ? 2 : 1);
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
    this.tryFire();
    this.semiTriggerConsumed = true;
  }

  public cancelTransientActions(): void {
    this.isReloading = false;
    this.reloadElapsed = 0;
    this.reloadMagClickPlayed = false;
    this.slashTimer = 0;
    this.quickMeleeReturnSlot = null;
    this.semiTriggerConsumed = false;
    this.muzzleFlashTimer = 0;
    this.muzzleFlashMesh.isVisible = false;
    this.muzzleLight.intensity = 0;
  }

  public selectWeapon(id: WeaponId, silent = false): void {
    const targetEnabled = this.models.get(id)?.root.isEnabled() ?? false;
    this.isReloading = false;
    this.reloadElapsed = 0;
    this.semiTriggerConsumed = false;
    this.activeId = id;
    this.activeSlot = id === 'knife' ? 2 : 1;

    const cfg = WEAPONS[id];
    this.player.setWeaponSpeedMultiplier(cfg.moveSpeedMultiplier ?? 1.0);

    if (this.activeId !== 'knife') {
      this.slashTimer = 0;
    }

    if (!silent && !targetEnabled) {
      this.equipDrop = 0.14;
      this.audio.playWeaponEquip();
    }

    this.models.forEach((rig, key) => {
      rig.root.setEnabled(key === id);
    });

    const activeRig = this.models.get(id);
    if (activeRig) {
      this.muzzleFlashMesh.parent = activeRig.muzzlePoint;
      this.muzzleFlashMesh.position.setAll(0);
      this.muzzleLight.parent = activeRig.muzzlePoint;
      this.muzzleLight.position.setAll(0);
    }
  }

  public onFirePress(): void {
    if (!this.viewModelVisible) return;
    const cfg = this.getActiveConfig();
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
    this.quickMeleeReturnSlot = null;
    this.muzzleFlashTimer = 0;
    this.muzzleFlashMesh.isVisible = false;
    this.muzzleLight.intensity = 0;
    this.lastHitMarker = null;
    this.spreadBloom = 0;
    this.kickBackZ = 0;
    this.kickRotX = 0;
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
    this.clearTransientEffects();

    const activeRig = this.models.get(this.activeId);
    if (activeRig) {
      activeRig.root.setEnabled(true);
      this.weaponPivot.position.copyFrom(activeRig.hipPos);
      this.weaponPivot.rotation.setAll(0);
    }
    this.player.setWeaponSpeedMultiplier(WEAPONS[this.activeId].moveSpeedMultiplier ?? 1.0);
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

    if (this.slashTimer > 0) {
      this.slashTimer = Math.max(0, this.slashTimer - clampedDt);
      if (this.slashTimer === 0 && this.quickMeleeReturnSlot === 1 && this.activeSlot === 2) {
        this.quickMeleeReturnSlot = null;
        this.activeSlot = 1;
        this.selectWeapon(this.equippedGunId);
      }
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
        this.muzzleFlashMesh.isVisible = false;
        this.muzzleLight.intensity = 0;
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

    if (cfg.isMelee || cfg.id === 'knife') {
      if (this.knifeCooldown > 0) return;
      this.knifeCooldown = 60 / cfg.rpm;
      this.slashTimer = this.slashDuration;
      this.slashSide = -this.slashSide;
      this.audio.playKnifeSlash();
      this.charmVelZ += (Math.random() > 0.5 ? 1 : -1) * 14;
      this.charmVelX += 11;
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

    const kickScale =
      cfg.id === 'sniper' ? 1.35 : cfg.id === 'shotgun' ? 1.25 : cfg.id === 'smg' ? 0.65 : 1.0;
    this.kickBackZ = Math.min(0.14, this.kickBackZ + 0.062 * kickScale);
    this.kickRotX = Math.min(0.24, this.kickRotX + 0.09 * kickScale);

    const adsRecoilScale = this.player.getIsAds() ? 0.68 : 1.0;
    const yawRand = (Math.random() * 2 - 1) * cfg.recoilYaw * adsRecoilScale;
    const pitchKick = cfg.recoilPitch * (0.85 + Math.random() * 0.3) * adsRecoilScale;
    this.player.addRecoil(pitchKick, yawRand);

    this.triggerMuzzleFlash(cfg.suppressed);
    this.spawnShellCasing();
    this.performHitscan(cfg);

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
        | { isBot?: boolean; isRemotePlayer?: boolean; team?: TeamId; zone?: HitZone }
        | undefined;
      const isEnemy = this.multiplayerMode
        ? Boolean(meta?.isRemotePlayer && (meta.team !== this.localTeam || this.friendlyFire))
        : Boolean(meta?.isBot && meta.team === 'red');

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
        const validTarget = meta.team !== this.localTeam || this.friendlyFire;
        if (validTarget) {
          hitPlayerId = meta.playerId;
          hitZone = meta.zone;
          isTargetHit = true;
        }
      }

      this.audio.playKnifeHit(isTargetHit);
      this.spawnImpact(hitPoint, isTargetHit, hitNormal);
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

    if (meta?.isBot && meta.botId && meta.zone && meta.team === 'red') {
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
        this.spawnImpact(hitPoint, true, hitNormal);
        return;
      }
    }

    this.audio.playKnifeHit(false);
    this.spawnImpact(hitPoint, false, hitNormal);
  }

  private performHitscan(cfg: WeaponConfig): void {
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

      this.spawnTracer(muzzleWorld, endPoint, cfg.suppressed);

      if (this.multiplayerMode) {
        let hitPlayerId: string | undefined;
        let hitZone: HitZone | undefined;
        let isTargetHit = false;

        if (pick?.hit && pick.pickedMesh && pick.pickedPoint) {
          const meta = pick.pickedMesh.metadata as
            | { isRemotePlayer?: boolean; playerId?: string; team?: TeamId; zone?: HitZone }
            | undefined;

          if (meta?.isRemotePlayer && meta.playerId && meta.zone) {
            const validTarget = meta.team !== this.localTeam || this.friendlyFire;
            if (validTarget) {
              hitPlayerId = meta.playerId;
              hitZone = meta.zone;
              isTargetHit = true;
            }
          }
          const hitNormal = pick.getNormal(true) ?? dir.scale(-1);
          this.spawnImpact(pick.pickedPoint, isTargetHit, hitNormal);
          if (!meta?.isRemotePlayer) {
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

      if (meta?.isBot && meta.botId && meta.zone && meta.team === 'red') {
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
          this.spawnImpact(pick.pickedPoint, true, hitNormal);
          continue;
        }
      }

      this.spawnImpact(pick.pickedPoint, false, hitNormal);
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
        | { isBot?: boolean; isRemotePlayer?: boolean; team?: TeamId }
        | undefined;
      if (this.multiplayerMode) {
        this.targetingEnemy = Boolean(
          meta?.isRemotePlayer && (meta.team !== this.localTeam || this.friendlyFire)
        );
      } else {
        this.targetingEnemy = Boolean(meta?.isBot && meta.team === 'red');
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

  private triggerMuzzleFlash(suppressed: boolean): void {
    this.muzzleFlashTimer = suppressed ? 0.025 : 0.052;
    this.muzzleFlashMesh.isVisible = !suppressed;
    this.muzzleFlashMesh.rotation.z = Math.random() * Math.PI * 2;
    const scale = suppressed ? 0.45 : 0.95 + Math.random() * 0.55;
    this.muzzleFlashMesh.scaling.setAll(scale);
    this.muzzleLight.intensity = suppressed ? 0.7 : 6.0;
  }

  private spawnShellCasing(): void {
    if (this.graphicsQuality === 'LOW' || this.casings.length >= 18) return;
    if (this.activeId === 'knife') return;
    const rig = this.models.get(this.activeId);
    if (!rig) return;

    const casing = MeshBuilder.CreateCylinder(
      'shellCasing',
      { height: 0.024, diameter: 0.009, tessellation: 8 },
      this.scene
    );
    const portPos = rig.ejectionPort.getAbsolutePosition();
    casing.position.copyFrom(portPos);
    casing.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    casing.material = this.brassMaterial;
    casing.isPickable = false;
    casing.checkCollisions = false;

    const right = this.camera.getDirection(Vector3.Right()).normalize();
    const up = this.camera.getDirection(Vector3.Up()).normalize();
    const back = this.camera.getDirection(Vector3.Forward()).scale(-1).normalize();
    const vel = right
      .scale(2.1 + Math.random() * 0.9)
      .add(up.scale(1.6 + Math.random() * 0.8))
      .add(back.scale(0.4 + Math.random() * 0.5));
    const spin = new Vector3(14 + Math.random() * 12, 10 + Math.random() * 10, 16 + Math.random() * 10);

    this.casings.push({ mesh: casing, vel, spin, life: 0.68 });
  }

  private spawnTracer(start: Vector3, end: Vector3, suppressed: boolean): void {
    const delta = end.subtract(start);
    const fullDist = delta.length();
    if (fullDist < 0.25) return;

    const dir = delta.scale(1 / fullDist);
    const beamLen = Math.min(fullDist, 28);
    const beamStart = start.add(dir.scale(Math.min(0.45, fullDist * 0.15)));
    const mid = beamStart.add(dir.scale(beamLen * 0.5));

    const beam = MeshBuilder.CreateBox(
      'tracer',
      { width: suppressed ? 0.014 : 0.022, height: suppressed ? 0.014 : 0.022, depth: beamLen },
      this.scene
    );
    beam.position.copyFrom(mid);
    beam.lookAt(end);
    beam.material = suppressed ? this.tracerSuppMaterial : this.tracerMaterial;
    beam.isPickable = false;
    beam.checkCollisions = false;

    this.tracers.push({ mesh: beam, life: 0.055, maxLife: 0.055 });
  }

  private spawnImpact(point: Vector3, isTargetHit: boolean, normal: Vector3): void {
    const sparkCount =
      this.graphicsQuality === 'LOW' ? 1 : this.graphicsQuality === 'MEDIUM' ? 3 : 5;

    for (let i = 0; i < sparkCount; i++) {
      const spark = MeshBuilder.CreateBox(
        'impactSpark',
        { size: isTargetHit ? 0.065 : 0.048 },
        this.scene
      );
      spark.position.copyFrom(point);
      spark.isPickable = false;
      spark.checkCollisions = false;

      spark.material = isTargetHit
        ? this.impactMatTarget
        : i % 2 === 0
          ? this.impactMatSparkA
          : this.impactMatSparkB;

      const vel = new Vector3(
        normal.x * (1.8 + Math.random() * 2.2) + (Math.random() - 0.5) * 3.0,
        normal.y * (1.8 + Math.random() * 2.2) + Math.random() * 2.2,
        normal.z * (1.8 + Math.random() * 2.2) + (Math.random() - 0.5) * 3.0
      );

      this.impacts.push({ mesh: spark, vel, life: 0.16, maxLife: 0.16 });
    }
  }

  private spawnBulletDecal(point: Vector3, normal: Vector3): void {
    const maxDecals =
      this.graphicsQuality === 'LOW' ? 8 : this.graphicsQuality === 'MEDIUM' ? 24 : 48;

    while (this.bulletDecals.length >= maxDecals) {
      const oldest = this.bulletDecals.shift();
      oldest?.dispose();
    }

    const decal = MeshBuilder.CreateDisc(
      'bulletDecal',
      { radius: 0.042, tessellation: 8, sideOrientation: Mesh.DOUBLESIDE },
      this.scene
    );
    decal.position.copyFrom(point).addInPlace(normal.scale(0.014));
    decal.lookAt(point.add(normal.scale(2)));
    decal.material = this.decalMaterial;
    decal.isPickable = false;
    decal.checkCollisions = false;
    this.bulletDecals.push(decal);
  }

  private updateTransients(dt: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        t.mesh.dispose();
        this.tracers.splice(i, 1);
      } else {
        const ratio = t.life / t.maxLife;
        t.mesh.scaling.x = ratio;
        t.mesh.scaling.y = ratio;
      }
    }

    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.life -= dt;
      if (c.life <= 0) {
        c.mesh.dispose();
        this.casings.splice(i, 1);
      } else {
        c.mesh.position.x += c.vel.x * dt;
        c.mesh.position.y += c.vel.y * dt;
        c.mesh.position.z += c.vel.z * dt;
        c.vel.y -= 14.5 * dt;
        if (c.mesh.position.y < 0.015 && c.vel.y < 0) {
          c.mesh.position.y = 0.015;
          c.vel.y *= -0.42;
          c.vel.x *= 0.65;
          c.vel.z *= 0.65;
        }
        c.mesh.rotation.x += c.spin.x * dt;
        c.mesh.rotation.y += c.spin.y * dt;
        c.mesh.rotation.z += c.spin.z * dt;
      }
    }

    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const imp = this.impacts[i];
      imp.life -= dt;
      if (imp.life <= 0) {
        imp.mesh.dispose();
        this.impacts.splice(i, 1);
      } else {
        imp.mesh.position.x += imp.vel.x * dt;
        imp.mesh.position.y += imp.vel.y * dt;
        imp.mesh.position.z += imp.vel.z * dt;
        imp.vel.y -= 9.5 * dt;
        const ratio = imp.life / imp.maxLife;
        imp.mesh.scaling.setAll(0.35 + ratio * 0.85);
      }
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
      this.bobTimer += dt * (stance === 'sprint' ? 13.2 : 8.6);
    }

    const hipWeight = 1 - adsBlend;
    const bobScale = isMoving ? 0.0022 * adsBlend + 0.012 * hipWeight : 0.0012;
    const bobX = isMoving ? Math.cos(this.bobTimer * 0.5) * bobScale : 0;
    const bobY = isMoving
      ? Math.abs(Math.sin(this.bobTimer)) * -bobScale * 1.15
      : Math.sin(performance.now() * 0.002) * 0.0015;

    const strafeN = Math.max(-1, Math.min(1, axes.right / 9.1));
    const fwdN = Math.max(-1, Math.min(1, axes.forward / 9.1));
    const swayAmt = isAds ? 0.004 : 0.016;
    const swayX = strafeN * swayAmt;
    const swayZ = -fwdN * swayAmt * 0.45;

    const targetSwayRoll = -strafeN * (stance === 'sprint' && !isAds ? 0.11 : 0.045) * hipWeight;
    const targetSwayPitch = fwdN * (stance === 'sprint' && !isAds ? 0.03 : 0.012) * hipWeight;
    const swayLerp = 1 - Math.exp(-10 * dt);
    this.swayRoll += (targetSwayRoll - this.swayRoll) * swayLerp;
    this.swayPitch += (targetSwayPitch - this.swayPitch) * swayLerp;

    this.kickBackZ *= Math.exp(-22 * dt);
    this.kickRotX *= Math.exp(-20 * dt);
    this.equipDrop *= Math.exp(-12 * dt);

    // Knife slash arc
    let slashOffX = 0;
    let slashOffY = 0;
    let slashOffZ = 0;
    let slashRotX = 0;
    let slashRotY = 0;
    let slashRotZ = 0;
    if (isKnife && this.slashTimer > 0) {
      const p = 1 - this.slashTimer / this.slashDuration;
      const swingCurve = Math.sin(p * Math.PI);
      const windup = p < 0.25 ? p / 0.25 : 1 - (p - 0.25) / 0.75;
      slashOffX = -0.19 * swingCurve * this.slashSide;
      slashOffY = 0.05 * Math.sin(p * Math.PI * 2);
      slashOffZ = 0.18 * swingCurve;
      slashRotX = -0.68 * swingCurve;
      slashRotY = 1.05 * swingCurve * this.slashSide;
      slashRotZ = 0.55 * windup * this.slashSide;
    }

    const baseTargetX = rig.hipPos.x + (rig.adsPos.x - rig.hipPos.x) * adsBlend;
    const baseTargetY = rig.hipPos.y + (rig.adsPos.y - rig.hipPos.y) * adsBlend;
    const baseTargetZ = rig.hipPos.z + (rig.adsPos.z - rig.hipPos.z) * adsBlend;
    const reloadOffsetY = this.isReloading ? -0.11 * Math.sin(this.getReloadProgress() * Math.PI) : 0;
    const reloadTiltZ = this.isReloading ? 0.42 * Math.sin(this.getReloadProgress() * Math.PI) : 0;

    const sprinting = stance === 'sprint' && !isAds && !this.isReloading && this.slashTimer === 0;
    const slidingHip = stance === 'slide' && adsBlend < 0.4 && !this.isReloading && this.slashTimer === 0;
    const slidingAds = stance === 'slide' && isAds && !this.isReloading;

    const sprintRotY = sprinting ? -0.42 : 0;
    const sprintRotX = sprinting ? 0.16 : 0;

    const slideOffsetX = slidingHip ? -0.025 : 0;
    const slideOffsetY = slidingHip ? -0.025 : 0;
    const slideRotY = slidingHip ? -0.14 : 0;
    const slideRotZ = slidingHip ? 0.14 : slidingAds ? 0.035 : 0;

    const targetX = baseTargetX + bobX + swayX + slideOffsetX + slashOffX;
    const targetY = baseTargetY + bobY + reloadOffsetY - this.equipDrop + slideOffsetY + slashOffY;
    const targetZ = baseTargetZ - this.kickBackZ + swayZ + slashOffZ;

    const posLerp = 1 - Math.exp(-(this.slashTimer > 0 ? 28 : isAds ? 20 : 14) * dt);
    this.weaponPivot.position.x += (targetX - this.weaponPivot.position.x) * posLerp;
    this.weaponPivot.position.y += (targetY - this.weaponPivot.position.y) * posLerp;
    this.weaponPivot.position.z += (targetZ - this.weaponPivot.position.z) * posLerp;

    const adsRotX = rig.adsRot.x * adsBlend;
    const adsRotY = rig.adsRot.y * adsBlend;
    const adsRotZ = rig.adsRot.z * adsBlend;

    const targetRotX = -this.kickRotX + sprintRotX + this.swayPitch + adsRotX + slashRotX;
    const targetRotY = sprintRotY + slideRotY + adsRotY + slashRotY;
    const targetRotZ = reloadTiltZ + slideRotZ + this.swayRoll + adsRotZ + slashRotZ;

    const rotLerp = 1 - Math.exp(-(this.slashTimer > 0 ? 28 : isAds ? 18 : 14) * dt);
    this.weaponPivot.rotation.x += (targetRotX - this.weaponPivot.rotation.x) * rotLerp;
    this.weaponPivot.rotation.y += (targetRotY - this.weaponPivot.rotation.y) * rotLerp;
    this.weaponPivot.rotation.z += (targetRotZ - this.weaponPivot.rotation.z) * rotLerp;

    // 3D Knife Charm pendulum motion physics
    if (isKnife && this.charmPivot) {
      const targetRestX = 0.18 + Math.max(-0.35, Math.min(0.45, fwdN * 0.25 + (isMoving ? Math.sin(this.bobTimer) * 0.1 : 0)));
      const targetRestZ = Math.max(-0.55, Math.min(0.55, -strafeN * 0.38 + (this.swayRoll * 1.4)));
      const springK = 68;
      const damping = 7.5;
      const ax = (targetRestX - this.charmSwingX) * springK - this.charmVelX * damping;
      const az = (targetRestZ - this.charmSwingZ) * springK - this.charmVelZ * damping;
      this.charmVelX += ax * dt;
      this.charmVelZ += az * dt;
      this.charmSwingX = Math.max(-0.85, Math.min(0.95, this.charmSwingX + this.charmVelX * dt));
      this.charmSwingZ = Math.max(-0.85, Math.min(0.85, this.charmSwingZ + this.charmVelZ * dt));

      this.charmPivot.rotation.x = this.charmSwingX;
      this.charmPivot.rotation.z = this.charmSwingZ;
      this.charmPivot.rotation.y = Math.sin(performance.now() * 0.0028) * 0.12;
    }
  }

  private createMuzzleFlash(): Mesh {
    const flash = MeshBuilder.CreatePolyhedron('muzzleFlash', { type: 1, size: 0.06 }, this.scene);
    const mat = new StandardMaterial('muzzleFlashMat', this.scene);
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(1.4, 0.95, 0.35);
    flash.material = mat;
    flash.isVisible = false;
    flash.isPickable = false;
    flash.checkCollisions = false;
    flash.renderingGroupId = 1;
    this.materialsToDispose.push(mat);
    return flash;
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

  private createWeaponNormalTex(
    name: string,
    kind: 'anodized' | 'brushed' | 'polymer' | 'scope' | 'wood'
  ): RawTexture | null {
    if (kind !== 'brushed' && kind !== 'polymer' && kind !== 'wood') {
      return null;
    }

    const size = 64;
    const heights = new Float32Array(size * size);
    const strength = kind === 'brushed' ? 1.55 : kind === 'wood' ? 1.85 : 2.15;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (kind === 'brushed') {
          const streak = Math.sin(y * 1.9) * 0.4 + Math.cos(y * 3.7 + x * 0.18) * 0.2;
          heights[y * size + x] = streak;
        } else if (kind === 'wood') {
          const grain =
            Math.sin(y * 0.85 + Math.sin(x * 0.22) * 1.4) * 0.5 +
            Math.sin(x * 0.4 + y * 1.5) * 0.18;
          heights[y * size + x] = grain;
        } else {
          // Micro-knurled tactical polymer stippling
          const dot =
            Math.sin(x * 1.65) * Math.sin(y * 1.65) * 0.55 +
            Math.cos((x + y) * 1.2) * 0.25;
          heights[y * size + x] = dot;
        }
      }
    }

    const rgba = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      const ym = (y - 1 + size) % size;
      const yp = (y + 1) % size;
      for (let x = 0; x < size; x++) {
        const xm = (x - 1 + size) % size;
        const xp = (x + 1) % size;
        const hL = heights[y * size + xm];
        const hR = heights[y * size + xp];
        const hU = heights[ym * size + x];
        const hD = heights[yp * size + x];
        const dx = (hL - hR) * strength;
        const dy = (hU - hD) * strength;
        const dz = 1.0;
        const inv = 1 / Math.hypot(dx, dy, dz);
        const idx = (y * size + x) * 4;
        rgba[idx] = Math.round((dx * inv * 0.5 + 0.5) * 255);
        rgba[idx + 1] = Math.round((dy * inv * 0.5 + 0.5) * 255);
        rgba[idx + 2] = Math.round((dz * inv * 0.5 + 0.5) * 255);
        rgba[idx + 3] = 255;
      }
    }

    const tex = new RawTexture(
      rgba,
      size,
      size,
      Engine.TEXTUREFORMAT_RGBA,
      this.scene,
      true,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
      Engine.TEXTURETYPE_UNSIGNED_BYTE
    );
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    tex.uScale = 2.5;
    tex.vScale = 2.5;
    this.texturesToDispose.push(tex);
    return tex;
  }

  private createWeaponFinish(
    name: string,
    albedoHex: string,
    metallic: number,
    roughness: number,
    kind: 'anodized' | 'brushed' | 'polymer' | 'scope' | 'wood'
  ): PBRMaterial {
    const tex = new DynamicTexture(`${name}_tex`, { width: 256, height: 256 }, this.scene, true);
    const ctx = tex.getContext();
    ctx.fillStyle = albedoHex;
    ctx.fillRect(0, 0, 256, 256);

    if (kind === 'brushed') {
      for (let y = 0; y < 256; y++) {
        const shade = (y % 3 === 0 ? 22 : 10) + ((y * 13) % 12);
        ctx.fillStyle = `rgba(255,255,255,${0.02 + (shade % 7) * 0.005})`;
        ctx.fillRect(0, y, 256, 1);
        ctx.fillStyle = `rgba(0,0,0,${0.024 + (y % 5) * 0.005})`;
        ctx.fillRect(0, y, 256, 1);
      }
    } else if (kind === 'wood') {
      for (let y = 0; y < 256; y += 3) {
        ctx.fillStyle = y % 6 === 0 ? 'rgba(38,16,5,0.28)' : 'rgba(255,205,150,0.08)';
        ctx.fillRect(0, y, 256, 2);
      }
      for (let i = 0; i < 720; i++) {
        ctx.fillStyle = 'rgba(20,8,2,0.14)';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 14, 1.2);
      }
    } else if (kind === 'polymer') {
      for (let i = 0; i < 3200; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.09)';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 2.2, 2.2);
      }
    } else if (kind === 'anodized') {
      for (let i = 0; i < 1100; i++) {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.4, 1.4);
      }
    } else {
      for (let x = 0; x < 256; x += 18) {
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(x, 0, 4, 256);
      }
    }

    tex.update();
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    this.texturesToDispose.push(tex);

    const normalTex = this.createWeaponNormalTex(`${name}_nrm`, kind);

    const mat = new PBRMaterial(name, this.scene);
    mat.albedoColor = Color3.White();
    mat.albedoTexture = tex;
    if (normalTex) {
      mat.bumpTexture = normalTex;
      mat.bumpTexture.level = kind === 'polymer' ? 0.52 : 0.42;
    }
    mat.metallic = metallic;
    mat.roughness = roughness;
    mat.environmentIntensity =
      kind === 'polymer' || kind === 'wood' ? 0.92 : kind === 'anodized' ? 1.08 : 1.38;
    this.materialsToDispose.push(mat);
    return mat;
  }

  private buildAllWeaponModels(): void {
    const gunmetal = this.createWeaponFinish('anodizedRecvMat', '#1c2026', 0.78, 0.38, 'anodized');
    const polymer = this.createWeaponFinish('polymerMat', '#171a1f', 0.08, 0.72, 'polymer');
    const coyote = this.createWeaponFinish('coyoteMat', '#746046', 0.06, 0.68, 'polymer');
    const walnut = this.createWeaponFinish('walnutMat', '#64381d', 0.04, 0.56, 'wood');
    const steelSilver = this.createWeaponFinish('brushedGunmetalMat', '#798492', 0.95, 0.2, 'brushed');
    const bladeEdge = this.createWeaponFinish('knifeEdgeMat', '#c2cedb', 0.98, 0.12, 'brushed');
    const odGreen = this.createWeaponFinish('odGreenMat', '#354634', 0.08, 0.68, 'polymer');
    const scopeTube = this.createWeaponFinish('scopeTubeMat', '#2a3039', 0.93, 0.17, 'scope');

    const reticleRed = new StandardMaterial('reticleRedMat', this.scene);
    reticleRed.disableLighting = true;
    reticleRed.emissiveColor = new Color3(2.15, 0.16, 0.14);

    const tritiumGreen = new StandardMaterial('tritiumGreenMat', this.scene);
    tritiumGreen.disableLighting = true;
    tritiumGreen.emissiveColor = new Color3(0.35, 1.75, 0.68);

    const amberFiber = new StandardMaterial('amberFiberMat', this.scene);
    amberFiber.disableLighting = true;
    amberFiber.emissiveColor = new Color3(1.85, 0.78, 0.16);

    const holoGlass = new PBRMaterial('holoGlassMat', this.scene);
    holoGlass.albedoColor = new Color3(0.14, 0.42, 0.54);
    holoGlass.metallic = 0.06;
    holoGlass.roughness = 0.06;
    holoGlass.alpha = 0.3;
    holoGlass.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    holoGlass.backFaceCulling = false;
    holoGlass.indexOfRefraction = 1.46;

    const scopeLens = new PBRMaterial('scopeLensMat', this.scene);
    scopeLens.albedoColor = new Color3(0.05, 0.14, 0.12);
    scopeLens.metallic = 0.08;
    scopeLens.roughness = 0.04;
    scopeLens.alpha = 0.44;
    scopeLens.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    scopeLens.indexOfRefraction = 1.52;
    scopeLens.environmentIntensity = 1.45;
    scopeLens.backFaceCulling = false;

    this.materialsToDispose.push(
      reticleRed,
      tritiumGreen,
      amberFiber,
      holoGlass,
      scopeLens
    );

    // 1. M870 Combat Shotgun
    {
      const root = new TransformNode('vm_shotgun', this.scene);
      root.parent = this.weaponPivot;

      this.addPart(root, 'sg_recv', { width: 0.05, height: 0.068, depth: 0.23 }, new Vector3(0, 0, 0), gunmetal);
      this.addPart(root, 'sg_eject_port', { width: 0.005, height: 0.022, depth: 0.065 }, new Vector3(0.025, 0.01, 0.02), steelSilver);
      this.addCylinder(root, 'sg_barrel', 0.48, 0.028, new Vector3(0, 0.022, 0.35), Math.PI / 2, steelSilver);
      this.addCylinder(root, 'sg_mag_tube', 0.42, 0.024, new Vector3(0, -0.009, 0.32), Math.PI / 2, gunmetal);
      this.addPart(root, 'sg_barrel_clamp', { width: 0.032, height: 0.042, depth: 0.02 }, new Vector3(0, 0.006, 0.49), gunmetal);
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

      // 2. AK-47 Heavy Rifle + Top-Rail Red Dot Reflex Sight
    {
      const root = new TransformNode('vm_ak47', this.scene);
      root.parent = this.weaponPivot;

      this.addPart(root, 'ak_recv', { width: 0.046, height: 0.066, depth: 0.24 }, new Vector3(0, 0, 0), gunmetal);
      this.addPart(root, 'ak_dust_cover', { width: 0.042, height: 0.024, depth: 0.21 }, new Vector3(0, 0.038, -0.01), steelSilver);
      this.addPart(root, 'ak_bolt_handle', { width: 0.024, height: 0.01, depth: 0.028 }, new Vector3(0.03, 0.018, 0.03), steelSilver);
      this.addPart(root, 'ak_trig_guard', { width: 0.012, height: 0.024, depth: 0.044 }, new Vector3(0, -0.04, -0.04), gunmetal);
      // Iconic walnut handguard & full stock
      this.addPart(root, 'ak_handguard_l', { width: 0.042, height: 0.038, depth: 0.17 }, new Vector3(0, -0.004, 0.2), walnut);
      this.addPart(root, 'ak_handguard_u', { width: 0.036, height: 0.026, depth: 0.15 }, new Vector3(0, 0.025, 0.19), walnut);
      this.addPart(root, 'ak_stock', { width: 0.04, height: 0.092, depth: 0.23 }, new Vector3(0, -0.022, -0.22), walnut, new Vector3(0.09, 0, 0));
      this.addPart(root, 'ak_buttplate', { width: 0.041, height: 0.095, depth: 0.012 }, new Vector3(0, -0.03, -0.338), gunmetal, new Vector3(0.09, 0, 0));
      this.addPart(root, 'ak_grip', { width: 0.03, height: 0.105, depth: 0.042 }, new Vector3(0, -0.078, -0.075), polymer, new Vector3(-0.34, 0, 0));
      // Curved banana magazine (two angled segments + baseplate)
      this.addPart(root, 'ak_mag_top', { width: 0.03, height: 0.085, depth: 0.062 }, new Vector3(0, -0.07, 0.065), coyote, new Vector3(0.14, 0, 0));
      this.addPart(root, 'ak_mag_bot', { width: 0.029, height: 0.09, depth: 0.06 }, new Vector3(0, -0.145, 0.09), coyote, new Vector3(0.42, 0, 0));
      this.addPart(root, 'ak_mag_plate', { width: 0.032, height: 0.008, depth: 0.064 }, new Vector3(0, -0.184, 0.108), gunmetal, new Vector3(0.42, 0, 0));
      // Gas tube, barrel, front sight post & slant brake
      this.addCylinder(root, 'ak_gas_tube', 0.16, 0.018, new Vector3(0, 0.028, 0.24), Math.PI / 2, gunmetal);
      this.addCylinder(root, 'ak_barrel', 0.34, 0.021, new Vector3(0, 0.008, 0.38), Math.PI / 2, steelSilver);
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
      this.addPart(root, 'ak_rds_base', { width: 0.034, height: 0.01, depth: 0.052 }, new Vector3(0, 0.063, 0.02), polymer);
      this.addPart(root, 'ak_rds_clamp', { width: 0.008, height: 0.01, depth: 0.016 }, new Vector3(-0.019, 0.063, 0.02), steelSilver);
      this.addPart(root, 'ak_rds_hood_l', { width: 0.005, height: 0.028, depth: 0.038 }, new Vector3(-0.0145, 0.081, 0.02), gunmetal);
      this.addPart(root, 'ak_rds_hood_r', { width: 0.005, height: 0.028, depth: 0.038 }, new Vector3(0.0145, 0.081, 0.02), gunmetal);
      this.addPart(root, 'ak_rds_hood_top', { width: 0.034, height: 0.005, depth: 0.038 }, new Vector3(0, 0.095, 0.02), gunmetal);
      this.addCylinder(root, 'ak_rds_turret_top', 0.005, 0.009, new Vector3(0, 0.099, 0.02), 0, steelSilver);
      this.addCylinder(root, 'ak_rds_turret_side', 0.005, 0.009, new Vector3(0.018, 0.08, 0.02), Math.PI / 2, steelSilver);
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

    // 3. Vector-9 SMG
    {
      const root = new TransformNode('vm_smg', this.scene);
      root.parent = this.weaponPivot;

      this.addPart(root, 'smg_upper', { width: 0.044, height: 0.056, depth: 0.26 }, new Vector3(0, 0.014, 0.03), gunmetal);
      this.addPart(root, 'smg_lower_shroud', { width: 0.042, height: 0.064, depth: 0.13 }, new Vector3(0, -0.024, 0.095), polymer);
      this.addPart(root, 'smg_rail_top', { width: 0.022, height: 0.007, depth: 0.22 }, new Vector3(0, 0.044, 0.03), steelSilver);
      this.addCylinder(root, 'smg_barrel', 0.12, 0.02, new Vector3(0, 0.008, 0.21), Math.PI / 2, steelSilver);
      this.addCylinder(root, 'smg_comp', 0.055, 0.03, new Vector3(0, 0.008, 0.27), Math.PI / 2, gunmetal);
      this.addPart(root, 'smg_mag', { width: 0.026, height: 0.155, depth: 0.038 }, new Vector3(0, -0.105, 0.09), gunmetal, new Vector3(0.18, 0, 0));
      this.addPart(root, 'smg_grip', { width: 0.03, height: 0.092, depth: 0.04 }, new Vector3(0, -0.065, -0.055), polymer, new Vector3(-0.28, 0, 0));
      this.addPart(root, 'smg_brace', { width: 0.022, height: 0.018, depth: 0.16 }, new Vector3(0, 0.01, -0.17), polymer);
      // Low-profile reflex optic
      this.addPart(root, 'smg_opt_base', { width: 0.032, height: 0.01, depth: 0.046 }, new Vector3(0, 0.05, 0.02), polymer);
      this.addPart(root, 'smg_opt_l', { width: 0.005, height: 0.024, depth: 0.036 }, new Vector3(-0.013, 0.066, 0.02), polymer);
      this.addPart(root, 'smg_opt_r', { width: 0.005, height: 0.024, depth: 0.036 }, new Vector3(0.013, 0.066, 0.02), polymer);
      this.addPart(root, 'smg_opt_top', { width: 0.032, height: 0.005, depth: 0.036 }, new Vector3(0, 0.08, 0.02), polymer);
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

    // 4. AWP-50 Sniper
    {
      const root = new TransformNode('vm_sniper', this.scene);
      root.parent = this.weaponPivot;

      this.addPart(root, 'snp_chassis', { width: 0.052, height: 0.066, depth: 0.42 }, new Vector3(0, -0.004, 0.02), odGreen);
      this.addPart(root, 'snp_recv', { width: 0.046, height: 0.044, depth: 0.24 }, new Vector3(0, 0.026, 0.02), gunmetal);
      this.addCylinder(root, 'snp_barrel', 0.56, 0.032, new Vector3(0, 0.016, 0.44), Math.PI / 2, steelSilver);
      this.addCylinder(root, 'snp_brake', 0.11, 0.044, new Vector3(0, 0.016, 0.75), Math.PI / 2, gunmetal);
      this.addPart(root, 'snp_mag', { width: 0.036, height: 0.11, depth: 0.09 }, new Vector3(0, -0.075, 0.1), gunmetal, new Vector3(0.12, 0, 0));
      this.addPart(root, 'snp_grip', { width: 0.032, height: 0.095, depth: 0.044 }, new Vector3(0, -0.072, -0.1), odGreen, new Vector3(-0.28, 0, 0));
      this.addPart(root, 'snp_stock', { width: 0.044, height: 0.115, depth: 0.27 }, new Vector3(0, -0.018, -0.31), odGreen);
      this.addPart(root, 'snp_cheek', { width: 0.046, height: 0.026, depth: 0.13 }, new Vector3(0, 0.046, -0.27), polymer);

      this.addPart(root, 'snp_scope_base', { width: 0.036, height: 0.02, depth: 0.16 }, new Vector3(0, 0.054, 0.04), polymer);
      this.addPart(root, 'snp_scope_rings', { width: 0.042, height: 0.028, depth: 0.09 }, new Vector3(0, 0.074, 0.04), gunmetal);
      this.addCylinder(root, 'snp_scope_tube', 0.168, 0.034, new Vector3(0, 0.092, 0.04), Math.PI / 2, scopeTube);
      this.addCylinder(root, 'snp_scope_obj', 0.038, 0.054, new Vector3(0, 0.092, 0.146), Math.PI / 2, scopeTube);
      this.addCylinder(root, 'snp_scope_obj_lip', 0.01, 0.06, new Vector3(0, 0.092, 0.168), Math.PI / 2, gunmetal);
      this.addCylinder(root, 'snp_scope_oc', 0.034, 0.048, new Vector3(0, 0.092, -0.066), Math.PI / 2, scopeTube);
      this.addCylinder(root, 'snp_scope_oc_lip', 0.01, 0.052, new Vector3(0, 0.092, -0.088), Math.PI / 2, gunmetal);
      this.addCylinder(root, 'snp_scope_turret', 0.026, 0.02, new Vector3(0, 0.118, 0.04), 0, steelSilver);
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

    // 5. USP-45 Tactical Pistol
    {
      const root = new TransformNode('vm_pistol', this.scene);
      root.parent = this.weaponPivot;

      this.addPart(root, 'p_frame', { width: 0.032, height: 0.026, depth: 0.185 }, new Vector3(0, -0.01, 0.04), polymer);
      this.addPart(root, 'p_slide', { width: 0.034, height: 0.032, depth: 0.205 }, new Vector3(0, 0.018, 0.03), steelSilver);
      this.addPart(root, 'p_eject_port', { width: 0.022, height: 0.008, depth: 0.038 }, new Vector3(0.008, 0.032, 0.032), gunmetal);
      this.addPart(root, 'p_trig_guard', { width: 0.012, height: 0.022, depth: 0.044 }, new Vector3(0, -0.028, 0.024), polymer);
      this.addPart(root, 'p_grip', { width: 0.03, height: 0.1, depth: 0.046 }, new Vector3(0, -0.062, -0.03), gunmetal, new Vector3(-0.26, 0, 0));
      this.addPart(root, 'p_sight_r1', { width: 0.007, height: 0.009, depth: 0.01 }, new Vector3(-0.008, 0.038, -0.055), gunmetal);
      this.addPart(root, 'p_sight_r2', { width: 0.007, height: 0.009, depth: 0.01 }, new Vector3(0.008, 0.038, -0.055), gunmetal);
      this.addPart(root, 'p_sight_f', { width: 0.005, height: 0.01, depth: 0.01 }, new Vector3(0, 0.038, 0.115), gunmetal);

      const dot = MeshBuilder.CreateSphere('p_tritium', { diameter: 0.0035 }, this.scene);
      dot.position = new Vector3(0, 0.042, 0.115);
      dot.parent = root;
      dot.material = tritiumGreen;
      dot.isPickable = false;
      dot.checkCollisions = false;
      dot.renderingGroupId = 1;

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

    // 6. K-Bar Combat Knife + 3D Weapon Charm Mount
    {
      const root = new TransformNode('vm_knife', this.scene);
      root.parent = this.weaponPivot;

      // Tilt the knife vertically forward at an ergonomic combat grip angle
      const gripHolder = new TransformNode('knife_grip_holder', this.scene);
      gripHolder.parent = root;
      gripHolder.rotation.set(0.46, -0.22, 0.18);

      // Ribbed leather/polymer handle
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
      // Steel pommel cap & charm lanyard loop
      this.addCylinder(gripHolder, 'kn_pommel', 0.016, 0.032, new Vector3(0, -0.098, 0), 0, steelSilver);
      this.addPart(gripHolder, 'kn_charm_lug', { width: 0.008, height: 0.012, depth: 0.012 }, new Vector3(0.016, -0.098, -0.004), bladeEdge);

      // Steel crossguard
      this.addPart(gripHolder, 'kn_guard', { width: 0.018, height: 0.01, depth: 0.056 }, new Vector3(0, 0.028, 0.004), gunmetal);

      // Tactical Tanto / Clip-point blade: dark spine + bright honed cutting bevel
      this.addPart(gripHolder, 'kn_blade_spine', { width: 0.006, height: 0.165, depth: 0.024 }, new Vector3(0, 0.114, -0.002), gunmetal);
      this.addPart(gripHolder, 'kn_blade_edge', { width: 0.003, height: 0.162, depth: 0.012 }, new Vector3(0, 0.112, 0.013), bladeEdge);
      this.addPart(
        gripHolder,
        'kn_blade_tip',
        { width: 0.004, height: 0.044, depth: 0.018 },
        new Vector3(0, 0.205, 0.004),
        bladeEdge,
        new Vector3(-0.32, 0, 0)
      );

      // Charm pivot hanging freely from the knife pommel lug
      const charmPivot = new TransformNode('knife_charm_pivot', this.scene);
      charmPivot.parent = gripHolder;
      charmPivot.position.set(0.022, -0.098, -0.006);
      this.charmPivot = charmPivot;
      this.buildKnifeCharms(charmPivot, steelSilver, gunmetal);

      const ejectionPort = new TransformNode('kn_eject', this.scene);
      ejectionPort.parent = root;

      const muzzlePoint = new TransformNode('kn_tip', this.scene);
      muzzlePoint.parent = gripHolder;
      muzzlePoint.position.set(0, 0.22, 0);

      this.models.set('knife', {
        root,
        muzzlePoint,
        ejectionPort,
        hipPos: new Vector3(0.22, -0.17, 0.44),
        adsPos: new Vector3(0.22, -0.17, 0.44),
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
      mat.environmentIntensity = 1.3;
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
      this.addPart(root, 'ch_tag_rim', { width: 0.022, height: 0.006, depth: 0.0045 }, new Vector3(0, -0.018, 0), gunmetal);
      this.charmRoots.set('tactical_tag', root);
    }

    // 2. Crimson Fang
    {
      const root = new TransformNode('charm_crimson_fang', this.scene);
      root.parent = charmPivot;
      const mat = createCharmMat('crimson_fang');
      this.addCylinder(root, 'ch_fang_ring', 0.015, 0.003, new Vector3(0, -0.007, 0), 0, steelSilver);
      this.addCylinder(root, 'ch_fang_cap', 0.008, 0.014, new Vector3(0, -0.018, 0), 0, gunmetal);
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

  public clearTransientEffects(): void {
    for (const tracer of this.tracers) tracer.mesh.dispose();
    for (const casing of this.casings) casing.mesh.dispose();
    for (const impact of this.impacts) impact.mesh.dispose();
    this.tracers.length = 0;
    this.casings.length = 0;
    this.impacts.length = 0;
  }

  public dispose(): void {
    this.clearDecals();
    this.clearTransientEffects();
    this.charmRoots.clear();
    this.charmPivot = null;
    this.models.forEach((rig) => rig.root.dispose());
    this.models.clear();
    this.muzzleFlashMesh.dispose();
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
