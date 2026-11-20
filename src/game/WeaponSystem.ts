import {
  AbstractMesh,
  BaseTexture,
  Color3,
  DynamicTexture,
  Material,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointLight,
  Ray,
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
import { PlayerController } from './PlayerController';
import {
  GraphicsQuality,
  HitMarkerState,
  HitZone,
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

export class WeaponSystem {
  private scene: Scene;
  private camera: UniversalCamera;
  private player: PlayerController;
  private bots: BotManager;
  private audio: AudioEngine;

  private weaponPivot: TransformNode;
  private models = new Map<WeaponId, WeaponModelRig>();
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

  private activeId: WeaponId = 'm4a1';
  private slots: Record<WeaponId, WeaponRuntimeState> = {
    m4a1: { id: 'm4a1', ammoInMag: WEAPONS.m4a1.magSize, reserveAmmo: WEAPONS.m4a1.reserveMax },
    mp5: { id: 'mp5', ammoInMag: WEAPONS.mp5.magSize, reserveAmmo: WEAPONS.mp5.reserveMax },
    intervention: { id: 'intervention', ammoInMag: WEAPONS.intervention.magSize, reserveAmmo: WEAPONS.intervention.reserveMax },
    m1911: { id: 'm1911', ammoInMag: WEAPONS.m1911.magSize, reserveAmmo: WEAPONS.m1911.reserveMax },
  };

  private fireCooldown = 0;
  private semiTriggerConsumed = false;
  private isReloading = false;
  private reloadElapsed = 0;
  private reloadMagClickPlayed = false;
  private reloadSpeedMultiplier = 1.0;

  private spreadBloom = 0;
  private kickBackZ = 0;
  private kickRotX = 0;
  private bobTimer = 0;
  private swayRoll = 0;
  private swayPitch = 0;
  private equipDrop = 0;
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
  private onNetworkShot?: (payload: {
    muzzle: Vector3;
    endPoint: Vector3;
    weaponId: WeaponId;
    targetId?: string;
    zone?: HitZone;
  }) => void;
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
    onNetworkShot?: (payload: {
      muzzle: Vector3;
      endPoint: Vector3;
      weaponId: WeaponId;
      targetId?: string;
      zone?: HitZone;
    }) => void,
    onOfflineKill?: (info: {
      victimId: string;
      victimName: string;
      headshot: boolean;
      distanceMeters: number;
    }) => void
  ) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.bots = bots;
    this.audio = audio;
    this.onNetworkShot = onNetworkShot;
    this.onOfflineKill = onOfflineKill;

    this.weaponPivot = new TransformNode('weaponPivot', this.scene);
    this.weaponPivot.parent = this.camera;

    this.muzzleFlashMesh = this.createMuzzleFlash();
    this.muzzleLight = new PointLight('muzzleLight', Vector3.Zero(), this.scene);
    this.muzzleLight.diffuse = new Color3(1.0, 0.72, 0.35);
    this.muzzleLight.intensity = 0;
    this.muzzleLight.range = 8;
    this.muzzleLight.parent = this.weaponPivot;

    this.vmFillLight = new PointLight('vmFillLight', new Vector3(0.14, 0.18, 0.06), this.scene);
    this.vmFillLight.parent = this.camera;
    this.vmFillLight.diffuse = new Color3(1.0, 0.97, 0.93);
    this.vmFillLight.specular = new Color3(0.35, 0.36, 0.38);
    this.vmFillLight.intensity = 0.72;
    this.vmFillLight.range = 1.85;
    this.vmFillLight.shadowEnabled = false;

    this.vmRimLight = new PointLight('vmRimLight', new Vector3(-0.28, 0.08, 0.42), this.scene);
    this.vmRimLight.parent = this.camera;
    this.vmRimLight.diffuse = new Color3(0.52, 0.68, 0.92);
    this.vmRimLight.specular = new Color3(0.2, 0.24, 0.32);
    this.vmRimLight.intensity = 0.38;
    this.vmRimLight.range = 2.2;
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
    this.selectWeapon('m4a1');
    this.setViewModelVisible(false);
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
    if (this.activeId !== 'intervention') return;
    this.scopeMagnification =
      this.scopeMagnification === 4 ? 6 : this.scopeMagnification === 6 ? 8 : 4;
    this.audio.playReloadMagIn();
  }

  public getScopeMagnification(): 4 | 6 | 8 {
    return this.scopeMagnification;
  }

  public getActiveConfig(): WeaponConfig {
    const cfg = WEAPONS[this.activeId];
    if (this.activeId === 'intervention') {
      const fovRatio =
        this.scopeMagnification === 4 ? 0.25 : this.scopeMagnification === 6 ? 0.165 : 0.125;
      return { ...cfg, adsFovRatio: fovRatio };
    }
    return cfg;
  }

  public getWeaponSlots(): WeaponRuntimeState[] {
    return [
      this.slots.m4a1,
      this.slots.mp5,
      this.slots.intervention,
      this.slots.m1911,
    ].map((s) => ({ ...s }));
  }

  public getIsReloading(): boolean {
    return this.isReloading;
  }

  public getReloadProgress(): number {
    if (!this.isReloading) return 0;
    return Math.min(1, this.reloadElapsed / (this.getActiveConfig().reloadTimeSec / this.reloadSpeedMultiplier));
  }

  public getCrosshairSpreadPx(): number {
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

  public selectSlot(slot: 1 | 2 | 3 | 4): void {
    const id: WeaponId =
      slot === 1 ? 'm4a1' : slot === 2 ? 'mp5' : slot === 3 ? 'intervention' : 'm1911';
    this.selectWeapon(id);
  }

  public cycleSlot(delta: 1 | -1): void {
    const order: WeaponId[] = ['m4a1', 'mp5', 'intervention', 'm1911'];
    const curIdx = order.indexOf(this.activeId);
    if (curIdx === -1) {
      this.selectWeapon('m4a1');
      return;
    }
    const nextIdx = (curIdx + delta + order.length) % order.length;
    const nextId = order[nextIdx];
    if (WEAPONS[nextId]) {
      this.selectWeapon(nextId);
    }
  }

  public selectWeapon(id: WeaponId): void {
    if (this.activeId === id && this.models.get(id)?.root.isEnabled()) return;

    this.isReloading = false;
    this.reloadElapsed = 0;
    this.semiTriggerConsumed = false;
    this.activeId = id;
    this.equipDrop = 0.14;
    this.audio.playWeaponEquip();

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
    const cfg = this.getActiveConfig();
    const state = this.slots[this.activeId];
    if (state.ammoInMag >= cfg.magSize) return;
    if (state.reserveAmmo <= 0) return;

    this.isReloading = true;
    this.reloadElapsed = 0;
    this.reloadMagClickPlayed = false;
    this.audio.playReloadStart();
  }

  public resupplyAll(): void {
    (Object.keys(WEAPONS) as WeaponId[]).forEach((id) => {
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
    this.fireCooldown = 0;
    this.semiTriggerConsumed = false;
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
    this.rangeDistanceMeters = null;
    this.targetingEnemy = false;
    this.clearTransientEffects();

    const activeRig = this.models.get(this.activeId);
    if (activeRig) {
      this.weaponPivot.position.copyFrom(activeRig.hipPos);
      this.weaponPivot.rotation.setAll(0);
    }
  }

  public resetForNewMatch(): void {
    this.resetForLife();
    this.clearDecals();
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.headshots = 0;
    this.eliminations = 0;
  }

  public update(dt: number): void {
    const clampedDt = Math.min(dt, 0.05);

    this.fireCooldown = Math.max(0, this.fireCooldown - clampedDt);
    this.spreadBloom = Math.max(0, this.spreadBloom - clampedDt * 0.045);

    if (this.isReloading && this.viewModelVisible) {
      this.reloadElapsed += clampedDt;
      const cfg = this.getActiveConfig();
      const effectiveReloadTime = cfg.reloadTimeSec / this.reloadSpeedMultiplier;
      if (!this.reloadMagClickPlayed && this.reloadElapsed >= effectiveReloadTime * 0.52) {
        this.reloadMagClickPlayed = true;
        this.audio.playReloadMagIn();
      }
      if (this.reloadElapsed >= effectiveReloadTime) {
        const state = this.slots[this.activeId];
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
    if (this.isReloading || this.fireCooldown > 0) return;

    const cfg = this.getActiveConfig();
    const state = this.slots[this.activeId];

    if (state.ammoInMag <= 0) {
      this.fireCooldown = 0.2;
      this.audio.playDryFire();
      this.startReload();
      return;
    }

    state.ammoInMag -= 1;
    this.fireCooldown = 60 / cfg.rpm;
    this.shotsFired += 1;

    if (state.ammoInMag > 0 && state.ammoInMag === Math.ceil(cfg.magSize * 0.2)) {
      this.audio.playLowAmmoWarning();
    }

    this.audio.playGunshot(cfg.id);

    this.kickBackZ = Math.min(0.11, this.kickBackZ + 0.062);
    this.kickRotX = Math.min(0.2, this.kickRotX + 0.09);

    const adsRecoilScale = this.player.getIsAds() ? 0.68 : 1.0;
    const yawRand = (Math.random() * 2 - 1) * cfg.recoilYaw * adsRecoilScale;
    const pitchKick = cfg.recoilPitch * (0.85 + Math.random() * 0.3) * adsRecoilScale;
    this.player.addRecoil(pitchKick, yawRand);

    this.triggerMuzzleFlash(cfg.suppressed);
    this.spawnShellCasing();
    this.performHitscan(cfg);

    this.spreadBloom = Math.min(0.032, this.spreadBloom + 0.0055);
  }

  private performHitscan(cfg: WeaponConfig): void {
    const spread = this.computeCurrentSpread();
    const origin = this.camera.globalPosition.clone();
    const forward = this.camera.getDirection(Vector3.Forward()).normalize();
    const right = this.camera.getDirection(Vector3.Right()).normalize();
    const up = this.camera.getDirection(Vector3.Up()).normalize();

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

    const rig = this.models.get(this.activeId);
    const muzzleWorld = rig
      ? rig.muzzlePoint.getAbsolutePosition()
      : origin.add(forward.scale(0.6));

    const endPoint =
      pick?.hit && pick.pickedPoint ? pick.pickedPoint.clone() : origin.add(dir.scale(cfg.range));

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

      this.onNetworkShot?.({
        muzzle: muzzleWorld,
        endPoint,
        weaponId: cfg.id,
        targetId: hitPlayerId,
        zone: hitZone,
      });
      return;
    }

    if (!pick?.hit || !pick.pickedMesh || !pick.pickedPoint) return;

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
        this.spawnImpact(pick.pickedPoint, true, hitNormal);
        return;
      }
    }

    this.spawnImpact(pick.pickedPoint, false, hitNormal);
    if (!meta?.isBot) {
      this.spawnBulletDecal(pick.pickedPoint, hitNormal);
    }
  }

  private updateRangefinder(): void {
    this.rangeRay.origin.copyFrom(this.camera.position);
    this.camera.getDirectionToRef(this.forwardAxis, this.rangeRay.direction);
    const pick = this.scene.pickWithRay(
      this.rangeRay,
      this.rangePickPredicate
    );
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
    const adsBlend = this.player.getAdsBlend();
    const isAds = this.player.getIsAds() && !this.isReloading;
    const fullyScoped = this.activeId === 'intervention' && adsBlend > 0.88 && !this.isReloading;
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

    const baseTargetX = rig.hipPos.x + (rig.adsPos.x - rig.hipPos.x) * adsBlend;
    const baseTargetY = rig.hipPos.y + (rig.adsPos.y - rig.hipPos.y) * adsBlend;
    const baseTargetZ = rig.hipPos.z + (rig.adsPos.z - rig.hipPos.z) * adsBlend;
    const reloadOffsetY = this.isReloading ? -0.11 * Math.sin(this.getReloadProgress() * Math.PI) : 0;
    const reloadTiltZ = this.isReloading ? 0.42 * Math.sin(this.getReloadProgress() * Math.PI) : 0;

    const sprinting = stance === 'sprint' && !isAds && !this.isReloading;
    const slidingHip = stance === 'slide' && adsBlend < 0.4 && !this.isReloading;
    const slidingAds = stance === 'slide' && isAds && !this.isReloading;

    const sprintRotY = sprinting ? -0.42 : 0;
    const sprintRotX = sprinting ? 0.16 : 0;

    const slideOffsetX = slidingHip ? -0.025 : 0;
    const slideOffsetY = slidingHip ? -0.025 : 0;
    const slideRotY = slidingHip ? -0.14 : 0;
    const slideRotZ = slidingHip ? 0.14 : slidingAds ? 0.035 : 0;

    const targetX = baseTargetX + bobX + swayX + slideOffsetX;
    const targetY = baseTargetY + bobY + reloadOffsetY - this.equipDrop + slideOffsetY;
    const targetZ = baseTargetZ - this.kickBackZ + swayZ;

    const posLerp = 1 - Math.exp(-(isAds ? 20 : 14) * dt);
    this.weaponPivot.position.x += (targetX - this.weaponPivot.position.x) * posLerp;
    this.weaponPivot.position.y += (targetY - this.weaponPivot.position.y) * posLerp;
    this.weaponPivot.position.z += (targetZ - this.weaponPivot.position.z) * posLerp;

    const adsRotX = rig.adsRot.x * adsBlend;
    const adsRotY = rig.adsRot.y * adsBlend;
    const adsRotZ = rig.adsRot.z * adsBlend;

    const targetRotX = -this.kickRotX + sprintRotX + this.swayPitch + adsRotX;
    const targetRotY = sprintRotY + slideRotY + adsRotY;
    const targetRotZ = reloadTiltZ + slideRotZ + this.swayRoll + adsRotZ;

    const rotLerp = 1 - Math.exp(-(isAds ? 18 : 14) * dt);
    this.weaponPivot.rotation.x += (targetRotX - this.weaponPivot.rotation.x) * rotLerp;
    this.weaponPivot.rotation.y += (targetRotY - this.weaponPivot.rotation.y) * rotLerp;
    this.weaponPivot.rotation.z += (targetRotZ - this.weaponPivot.rotation.z) * rotLerp;
  }

  private createMuzzleFlash(): Mesh {
    const flash = MeshBuilder.CreatePolyhedron('muzzleFlash', { type: 1, size: 0.06 }, this.scene);
    const mat = new StandardMaterial('muzzleFlashMat', this.scene);
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(1.4, 0.95, 0.35);
    flash.material = mat;
    flash.isVisible = false;
    flash.isPickable = false;
    flash.renderingGroupId = 1;
    this.materialsToDispose.push(mat);
    return flash;
  }

  private bindViewModelLights(): void {
    const meshes = this.weaponPivot.getChildMeshes(false);
    this.vmFillLight.includedOnlyMeshes = meshes;
    this.vmRimLight.includedOnlyMeshes = meshes;
  }

  private createWeaponFinish(
    name: string,
    albedoHex: string,
    metallic: number,
    roughness: number,
    kind: 'anodized' | 'brushed' | 'polymer' | 'scope'
  ): PBRMaterial {
    const tex = new DynamicTexture(`${name}_tex`, { width: 256, height: 256 }, this.scene, true);
    const ctx = tex.getContext();
    ctx.fillStyle = albedoHex;
    ctx.fillRect(0, 0, 256, 256);

    if (kind === 'brushed') {
      for (let y = 0; y < 256; y++) {
        const shade = (y % 3 === 0 ? 18 : 8) + ((y * 13) % 10);
        ctx.fillStyle = `rgba(255,255,255,${0.015 + (shade % 7) * 0.004})`;
        ctx.fillRect(0, y, 256, 1);
        ctx.fillStyle = `rgba(0,0,0,${0.02 + (y % 5) * 0.004})`;
        ctx.fillRect(0, y, 256, 1);
      }
    } else if (kind === 'polymer') {
      for (let i = 0; i < 2800; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 2.2, 2.2);
      }
    } else if (kind === 'anodized') {
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.4, 1.4);
      }
    } else {
      for (let x = 0; x < 256; x += 18) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(x, 0, 4, 256);
      }
    }

    tex.update();
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    this.texturesToDispose.push(tex);

    const mat = new PBRMaterial(name, this.scene);
    mat.albedoColor = Color3.White();
    mat.albedoTexture = tex;
    mat.metallic = metallic;
    mat.roughness = roughness;
    mat.environmentIntensity = kind === 'polymer' || kind === 'anodized' ? 0.85 : 1.25;
    this.materialsToDispose.push(mat);
    return mat;
  }

  private buildAllWeaponModels(): void {
    const gunmetal = this.createWeaponFinish('anodizedRecvMat', '#1a1d22', 0.72, 0.46, 'anodized');
    const polymer = this.createWeaponFinish('polymerMat', '#16181c', 0.06, 0.78, 'polymer');
    const coyote = this.createWeaponFinish('coyoteMat', '#6d5a42', 0.05, 0.74, 'polymer');
    const steelSilver = this.createWeaponFinish('brushedGunmetalMat', '#6e7884', 0.94, 0.22, 'brushed');
    const scopeTube = this.createWeaponFinish('scopeTubeMat', '#2a3038', 0.92, 0.18, 'scope');

    const reticleRed = new StandardMaterial('reticleRedMat', this.scene);
    reticleRed.disableLighting = true;
    reticleRed.emissiveColor = new Color3(1.8, 0.2, 0.16);

    const tritiumGreen = new StandardMaterial('tritiumGreenMat', this.scene);
    tritiumGreen.disableLighting = true;
    tritiumGreen.emissiveColor = new Color3(0.35, 1.7, 0.65);

    const holoGlass = new PBRMaterial('holoGlassMat', this.scene);
    holoGlass.albedoColor = new Color3(0.12, 0.38, 0.48);
    holoGlass.metallic = 0.05;
    holoGlass.roughness = 0.08;
    holoGlass.alpha = 0.28;
    holoGlass.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    holoGlass.backFaceCulling = false;
    holoGlass.indexOfRefraction = 1.45;

    const scopeLens = new PBRMaterial('scopeLensMat', this.scene);
    scopeLens.albedoColor = new Color3(0.05, 0.12, 0.1);
    scopeLens.metallic = 0.08;
    scopeLens.roughness = 0.04;
    scopeLens.alpha = 0.42;
    scopeLens.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    scopeLens.indexOfRefraction = 1.52;
    scopeLens.environmentIntensity = 1.4;
    scopeLens.backFaceCulling = false;

    this.materialsToDispose.push(reticleRed, tritiumGreen, holoGlass, scopeLens);

    // 1. M4A1 Tactical
    {
      const root = new TransformNode('vm_m4a1', this.scene);
      root.parent = this.weaponPivot;

      this.addPart(root, 'm4_recv', { width: 0.048, height: 0.068, depth: 0.24 }, new Vector3(0, 0, 0), gunmetal);
      this.addPart(root, 'm4_rail_top', { width: 0.024, height: 0.008, depth: 0.34 }, new Vector3(0, 0.036, 0.06), steelSilver);
      this.addPart(root, 'm4_rail', { width: 0.044, height: 0.046, depth: 0.23 }, new Vector3(0, 0.008, 0.22), polymer);
      this.addPart(root, 'm4_ejection_port', { width: 0.005, height: 0.018, depth: 0.055 }, new Vector3(0.024, 0.014, 0.02), steelSilver);
      this.addCylinder(root, 'm4_barrel', 0.26, 0.02, new Vector3(0, 0.01, 0.38), Math.PI / 2, steelSilver);
      this.addCylinder(root, 'm4_flash', 0.05, 0.028, new Vector3(0, 0.01, 0.51), Math.PI / 2, gunmetal);
      this.addPart(root, 'm4_mag', { width: 0.032, height: 0.13, depth: 0.065 }, new Vector3(0, -0.09, 0.06), coyote, new Vector3(0.18, 0, 0));
      this.addPart(root, 'm4_grip', { width: 0.032, height: 0.1, depth: 0.042 }, new Vector3(0, -0.075, -0.07), coyote, new Vector3(-0.32, 0, 0));
      this.addPart(root, 'm4_stock', { width: 0.04, height: 0.09, depth: 0.18 }, new Vector3(0, -0.01, -0.2), coyote);

      this.addPart(root, 'm4_optic_base', { width: 0.04, height: 0.014, depth: 0.075 }, new Vector3(0, 0.044, 0.01), polymer);
      this.addPart(root, 'm4_optic_l', { width: 0.006, height: 0.034, depth: 0.05 }, new Vector3(-0.017, 0.066, 0.01), polymer);
      this.addPart(root, 'm4_optic_r', { width: 0.006, height: 0.034, depth: 0.05 }, new Vector3(0.017, 0.066, 0.01), polymer);
      this.addPart(root, 'm4_optic_top', { width: 0.04, height: 0.006, depth: 0.05 }, new Vector3(0, 0.084, 0.01), polymer);
      this.addPart(root, 'm4_optic_glass', { width: 0.028, height: 0.028, depth: 0.003 }, new Vector3(0, 0.066, 0.01), holoGlass);
      const dot = MeshBuilder.CreateSphere('m4_dot', { diameter: 0.0045 }, this.scene);
      dot.position = new Vector3(0, 0.066, 0.01);
      dot.parent = root;
      dot.material = reticleRed;
      dot.isPickable = false;
      dot.renderingGroupId = 1;

      const ejectionPort = new TransformNode('m4_eject', this.scene);
      ejectionPort.parent = root;
      ejectionPort.position = new Vector3(0.035, 0.02, 0.02);

      const muzzlePoint = new TransformNode('m4_muzzle', this.scene);
      muzzlePoint.parent = root;
      muzzlePoint.position = new Vector3(0, 0.01, 0.54);

      this.models.set('m4a1', {
        root,
        muzzlePoint,
        ejectionPort,
        hipPos: new Vector3(0.21, -0.19, 0.42),
        adsPos: new Vector3(0, -0.066, 0.29),
        adsRot: Vector3.Zero(),
      });
    }

    // 2. MP5-SD Suppressed SMG
    {
      const root = new TransformNode('vm_mp5', this.scene);
      root.parent = this.weaponPivot;

      this.addPart(root, 'mp5_recv', { width: 0.044, height: 0.062, depth: 0.24 }, new Vector3(0, 0, 0), gunmetal);
      this.addPart(root, 'mp5_rail_top', { width: 0.022, height: 0.007, depth: 0.14 }, new Vector3(0, 0.034, 0.01), steelSilver);
      this.addCylinder(root, 'mp5_supp', 0.26, 0.044, new Vector3(0, 0.006, 0.24), Math.PI / 2, polymer);
      this.addPart(root, 'mp5_mag', { width: 0.026, height: 0.14, depth: 0.045 }, new Vector3(0, -0.095, 0.07), gunmetal, new Vector3(0.22, 0, 0));
      this.addPart(root, 'mp5_grip', { width: 0.03, height: 0.095, depth: 0.04 }, new Vector3(0, -0.072, -0.06), polymer, new Vector3(-0.3, 0, 0));
      this.addPart(root, 'mp5_optic_base', { width: 0.032, height: 0.01, depth: 0.045 }, new Vector3(0, 0.04, 0.01), polymer);
      this.addPart(root, 'mp5_optic_l', { width: 0.005, height: 0.024, depth: 0.035 }, new Vector3(-0.013, 0.056, 0.01), polymer);
      this.addPart(root, 'mp5_optic_r', { width: 0.005, height: 0.024, depth: 0.035 }, new Vector3(0.013, 0.056, 0.01), polymer);
      this.addPart(root, 'mp5_optic_top', { width: 0.032, height: 0.005, depth: 0.035 }, new Vector3(0, 0.07, 0.01), polymer);
      this.addPart(root, 'mp5_optic_glass', { width: 0.022, height: 0.02, depth: 0.003 }, new Vector3(0, 0.056, 0.01), holoGlass);
      this.addPart(root, 'mp5_sight_f', { width: 0.012, height: 0.02, depth: 0.014 }, new Vector3(0, 0.038, 0.12), gunmetal);

      const dot = MeshBuilder.CreateSphere('mp5_tritium', { diameter: 0.004 }, this.scene);
      dot.position = new Vector3(0, 0.056, 0.01);
      dot.parent = root;
      dot.material = tritiumGreen;
      dot.isPickable = false;
      dot.renderingGroupId = 1;

      const ejectionPort = new TransformNode('mp5_eject', this.scene);
      ejectionPort.parent = root;
      ejectionPort.position = new Vector3(0.032, 0.018, 0.02);

      const muzzlePoint = new TransformNode('mp5_muzzle', this.scene);
      muzzlePoint.parent = root;
      muzzlePoint.position = new Vector3(0, 0.006, 0.38);

      this.models.set('mp5', {
        root,
        muzzlePoint,
        ejectionPort,
        hipPos: new Vector3(0.2, -0.18, 0.42),
        adsPos: new Vector3(0, -0.056, 0.3),
        adsRot: Vector3.Zero(),
      });
    }

    // 3. Intervention .50 Heavy Sniper
    {
      const root = new TransformNode('vm_intervention', this.scene);
      root.parent = this.weaponPivot;

      this.addPart(root, 'int_recv', { width: 0.052, height: 0.075, depth: 0.38 }, new Vector3(0, 0, 0), gunmetal);
      this.addCylinder(root, 'int_barrel', 0.58, 0.034, new Vector3(0, 0.012, 0.44), Math.PI / 2, steelSilver);
      this.addCylinder(root, 'int_brake', 0.12, 0.042, new Vector3(0, 0.012, 0.75), Math.PI / 2, gunmetal);
      this.addPart(root, 'int_mag', { width: 0.036, height: 0.14, depth: 0.09 }, new Vector3(0, -0.095, 0.12), coyote, new Vector3(0.15, 0, 0));
      this.addPart(root, 'int_grip', { width: 0.032, height: 0.1, depth: 0.044 }, new Vector3(0, -0.075, -0.1), coyote, new Vector3(-0.3, 0, 0));
      this.addPart(root, 'int_stock', { width: 0.044, height: 0.12, depth: 0.28 }, new Vector3(0, -0.02, -0.32), coyote);

      this.addPart(root, 'int_scope_base', { width: 0.036, height: 0.02, depth: 0.16 }, new Vector3(0, 0.05, 0.04), polymer);
      this.addPart(root, 'int_scope_rings', { width: 0.042, height: 0.028, depth: 0.09 }, new Vector3(0, 0.07, 0.04), gunmetal);
      this.addCylinder(root, 'int_scope_tube', 0.168, 0.034, new Vector3(0, 0.088, 0.04), Math.PI / 2, scopeTube);
      this.addCylinder(root, 'int_scope_obj', 0.038, 0.054, new Vector3(0, 0.088, 0.146), Math.PI / 2, scopeTube);
      this.addCylinder(root, 'int_scope_obj_lip', 0.01, 0.06, new Vector3(0, 0.088, 0.168), Math.PI / 2, gunmetal);
      this.addCylinder(root, 'int_scope_oc', 0.034, 0.048, new Vector3(0, 0.088, -0.066), Math.PI / 2, scopeTube);
      this.addCylinder(root, 'int_scope_oc_lip', 0.01, 0.052, new Vector3(0, 0.088, -0.088), Math.PI / 2, gunmetal);
      this.addCylinder(root, 'int_scope_turret', 0.026, 0.02, new Vector3(0, 0.114, 0.04), 0, steelSilver);
      this.addCylinder(root, 'int_lens_f', 0.006, 0.048, new Vector3(0, 0.088, 0.172), Math.PI / 2, scopeLens);
      this.addCylinder(root, 'int_lens_r', 0.005, 0.042, new Vector3(0, 0.088, -0.094), Math.PI / 2, scopeLens);

      const ejectionPort = new TransformNode('int_eject', this.scene);
      ejectionPort.parent = root;
      ejectionPort.position = new Vector3(0.038, 0.025, 0.05);

      const muzzlePoint = new TransformNode('int_muzzle', this.scene);
      muzzlePoint.parent = root;
      muzzlePoint.position = new Vector3(0, 0.012, 0.82);

      this.models.set('intervention', {
        root,
        muzzlePoint,
        ejectionPort,
        hipPos: new Vector3(0.22, -0.2, 0.45),
        adsPos: new Vector3(0, -0.088, 0.3),
        adsRot: Vector3.Zero(),
      });
    }

    // 4. M1911 Ops Sidearm
    {
      const root = new TransformNode('vm_m1911', this.scene);
      root.parent = this.weaponPivot;

      this.addPart(root, 'p_frame', { width: 0.032, height: 0.026, depth: 0.18 }, new Vector3(0, -0.01, 0.04), polymer);
      this.addPart(root, 'p_slide', { width: 0.034, height: 0.032, depth: 0.2 }, new Vector3(0, 0.018, 0.03), steelSilver);
      this.addPart(root, 'p_grip', { width: 0.03, height: 0.1, depth: 0.046 }, new Vector3(0, -0.062, -0.03), coyote, new Vector3(-0.26, 0, 0));
      this.addPart(root, 'p_sight_r1', { width: 0.007, height: 0.009, depth: 0.01 }, new Vector3(-0.008, 0.038, -0.055), gunmetal);
      this.addPart(root, 'p_sight_r2', { width: 0.007, height: 0.009, depth: 0.01 }, new Vector3(0.008, 0.038, -0.055), gunmetal);
      this.addPart(root, 'p_sight_f', { width: 0.005, height: 0.01, depth: 0.01 }, new Vector3(0, 0.038, 0.115), gunmetal);

      const dot = MeshBuilder.CreateSphere('p_tritium', { diameter: 0.0035 }, this.scene);
      dot.position = new Vector3(0, 0.042, 0.115);
      dot.parent = root;
      dot.material = tritiumGreen;
      dot.isPickable = false;
      dot.renderingGroupId = 1;

      const ejectionPort = new TransformNode('p_eject', this.scene);
      ejectionPort.parent = root;
      ejectionPort.position = new Vector3(0.024, 0.026, 0.02);

      const muzzlePoint = new TransformNode('p_muzzle', this.scene);
      muzzlePoint.parent = root;
      muzzlePoint.position = new Vector3(0, 0.018, 0.14);

      this.models.set('m1911', {
        root,
        muzzlePoint,
        ejectionPort,
        hipPos: new Vector3(0.22, -0.19, 0.48),
        adsPos: new Vector3(0, -0.042, 0.38),
        adsRot: Vector3.Zero(),
      });
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
