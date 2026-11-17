import {
  Color3,
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
  private muzzleFlashTimer = 0;

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
  private materialsToDispose: Material[] = [];

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
    this.muzzleLight.range = 15;
    this.muzzleLight.parent = this.weaponPivot;

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

    this.materialsToDispose.push(
      this.decalMaterial,
      this.tracerMaterial,
      this.tracerSuppMaterial,
      this.brassMaterial
    );

    this.buildAllWeaponModels();
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
    if (!visible) {
      this.muzzleFlashMesh.isVisible = false;
      this.muzzleLight.intensity = 0;
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

  public selectWeapon(id: WeaponId): void {
    if (this.activeId === id && this.models.get(id)?.root.isEnabled()) return;

    this.isReloading = false;
    this.reloadElapsed = 0;
    this.semiTriggerConsumed = false;
    this.activeId = id;
    this.equipDrop = 0.14;

    this.models.forEach((rig, key) => {
      rig.root.setEnabled(key === id);
    });

    const activeRig = this.models.get(id);
    if (activeRig) {
      this.muzzleFlashMesh.parent = activeRig.muzzlePoint;
      this.muzzleFlashMesh.position.setAll(0);
      this.muzzleLight.position.copyFrom(activeRig.muzzlePoint.position);
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

    if (state.reserveAmmo <= 0) {
      state.reserveAmmo = cfg.reserveMax;
    }

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
  }

  public resetForNewMatch(): void {
    this.resupplyAll();
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.headshots = 0;
    this.eliminations = 0;
    this.lastHitMarker = null;
    this.spreadBloom = 0;
    this.kickBackZ = 0;
    this.kickRotX = 0;
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
        if (state.reserveAmmo === 0) {
          state.reserveAmmo = cfg.reserveMax;
        }
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

    this.audio.playGunshot(cfg.id);

    this.kickBackZ = Math.min(0.08, this.kickBackZ + 0.048);
    this.kickRotX = Math.min(0.14, this.kickRotX + 0.06);

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
    const origin = this.camera.globalPosition;
    const forward = this.camera.getDirection(Vector3.Forward());
    const ray = new Ray(origin, forward, 160);
    const pick = this.scene.pickWithRay(
      ray,
      (mesh) => mesh.isPickable && mesh.isEnabled() && mesh !== this.player.collider
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
    this.muzzleLight.intensity = suppressed ? 1.8 : 14.0;
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

      const mat = new StandardMaterial('impactMat', this.scene);
      mat.disableLighting = true;
      mat.emissiveColor = isTargetHit
        ? new Color3(1.2, 0.32, 0.22)
        : i % 2 === 0
          ? new Color3(1.2, 0.85, 0.38)
          : new Color3(0.95, 0.95, 1.0);
      spark.material = mat;

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
        c.mesh.position.addInPlace(c.vel.scale(dt));
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
        imp.mesh.material?.dispose();
        imp.mesh.dispose();
        this.impacts.splice(i, 1);
      } else {
        imp.mesh.position.addInPlace(imp.vel.scale(dt));
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
    const isAds = this.player.getIsAds() && !this.isReloading;
    if (this.activeId === 'intervention') {
      rig.root.setEnabled(!isAds);
    }
    const speed = this.player.getHorizontalSpeed();
    const isMoving = this.player.getIsGrounded() && speed > 0.6 && stance !== 'slide';

    if (isMoving) {
      this.bobTimer += dt * (stance === 'sprint' ? 12.5 : 8.5);
    }

    const bobScale = isMoving ? (isAds ? 0.0025 : 0.011) : 0.0012;
    const bobX = isMoving ? Math.cos(this.bobTimer * 0.5) * bobScale : 0;
    const bobY = isMoving
      ? Math.abs(Math.sin(this.bobTimer)) * -bobScale * 1.15
      : Math.sin(performance.now() * 0.002) * 0.0015;

    this.kickBackZ *= Math.exp(-18 * dt);
    this.kickRotX *= Math.exp(-16 * dt);
    this.equipDrop *= Math.exp(-12 * dt);

    const baseTarget = isAds ? rig.adsPos : rig.hipPos;
    const reloadOffsetY = this.isReloading ? -0.11 * Math.sin(this.getReloadProgress() * Math.PI) : 0;
    const reloadTiltZ = this.isReloading ? 0.42 * Math.sin(this.getReloadProgress() * Math.PI) : 0;

    const sprinting = stance === 'sprint' && !isAds && !this.isReloading;
    const slidingHip = stance === 'slide' && !isAds && !this.isReloading;
    const slidingAds = stance === 'slide' && isAds && !this.isReloading;

    const sprintRotY = sprinting ? -0.38 : 0;
    const sprintRotX = sprinting ? 0.14 : 0;

    const slideOffsetX = slidingHip ? -0.025 : 0;
    const slideOffsetY = slidingHip ? -0.025 : 0;
    const slideRotY = slidingHip ? -0.14 : 0;
    const slideRotZ = slidingHip ? 0.24 : slidingAds ? 0.05 : 0;

    const targetX = baseTarget.x + bobX + slideOffsetX;
    const targetY = baseTarget.y + bobY + reloadOffsetY - this.equipDrop + slideOffsetY;
    const targetZ = baseTarget.z - this.kickBackZ;

    const lerpFactor = 1 - Math.exp(-16 * dt);
    this.weaponPivot.position.x += (targetX - this.weaponPivot.position.x) * lerpFactor;
    this.weaponPivot.position.y += (targetY - this.weaponPivot.position.y) * lerpFactor;
    this.weaponPivot.position.z += (targetZ - this.weaponPivot.position.z) * lerpFactor;

    const targetRotX = -this.kickRotX + sprintRotX;
    const targetRotY = sprintRotY + slideRotY;
    const targetRotZ = reloadTiltZ + slideRotZ;

    this.weaponPivot.rotation.x += (targetRotX - this.weaponPivot.rotation.x) * lerpFactor;
    this.weaponPivot.rotation.y += (targetRotY - this.weaponPivot.rotation.y) * lerpFactor;
    this.weaponPivot.rotation.z += (targetRotZ - this.weaponPivot.rotation.z) * lerpFactor;
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

  private buildAllWeaponModels(): void {
    const gunmetal = new PBRMaterial('gunmetalMat', this.scene);
    gunmetal.albedoColor = Color3.FromHexString('#282e38');
    gunmetal.metallic = 0.85;
    gunmetal.roughness = 0.34;
    gunmetal.environmentIntensity = 1.15;

    const polymer = new PBRMaterial('polymerMat', this.scene);
    polymer.albedoColor = Color3.FromHexString('#181b20');
    polymer.metallic = 0.08;
    polymer.roughness = 0.62;

    const coyote = new PBRMaterial('coyoteMat', this.scene);
    coyote.albedoColor = Color3.FromHexString('#746249');
    coyote.metallic = 0.06;
    coyote.roughness = 0.68;

    const steelSilver = new PBRMaterial('steelSilverMat', this.scene);
    steelSilver.albedoColor = Color3.FromHexString('#7a8490');
    steelSilver.metallic = 0.94;
    steelSilver.roughness = 0.24;
    steelSilver.environmentIntensity = 1.25;

    const reticleRed = new StandardMaterial('reticleRedMat', this.scene);
    reticleRed.disableLighting = true;
    reticleRed.emissiveColor = new Color3(1.8, 0.2, 0.16);

    const tritiumGreen = new StandardMaterial('tritiumGreenMat', this.scene);
    tritiumGreen.disableLighting = true;
    tritiumGreen.emissiveColor = new Color3(0.35, 1.7, 0.65);

    const holoGlass = new StandardMaterial('holoGlassMat', this.scene);
    holoGlass.diffuseColor = new Color3(0.18, 0.55, 0.72);
    holoGlass.emissiveColor = new Color3(0.05, 0.18, 0.24);
    holoGlass.alpha = 0.22;
    holoGlass.backFaceCulling = false;

    this.materialsToDispose.push(
      gunmetal,
      polymer,
      coyote,
      steelSilver,
      reticleRed,
      tritiumGreen,
      holoGlass
    );

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
      this.addCylinder(root, 'int_scope_tube', 0.22, 0.045, new Vector3(0, 0.082, 0.04), Math.PI / 2, gunmetal);
      this.addPart(root, 'int_scope_glass_f', { width: 0.038, height: 0.038, depth: 0.003 }, new Vector3(0, 0.082, 0.15), holoGlass);
      this.addPart(root, 'int_scope_glass_r', { width: 0.038, height: 0.038, depth: 0.003 }, new Vector3(0, 0.082, -0.07), holoGlass);

      const crosshair = MeshBuilder.CreateSphere('int_crosshair', { diameter: 0.004 }, this.scene);
      crosshair.position = new Vector3(0, 0.082, 0.15);
      crosshair.parent = root;
      crosshair.material = tritiumGreen;
      crosshair.isPickable = false;
      crosshair.renderingGroupId = 1;

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
        adsPos: new Vector3(0, -0.082, 0.32),
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
    const mesh = MeshBuilder.CreateCylinder(name, { height, diameter, tessellation: 14 }, this.scene);
    mesh.parent = parent;
    mesh.position.copyFrom(pos);
    mesh.rotation.x = rotX;
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.renderingGroupId = 1;
    return mesh;
  }

  public dispose(): void {
    this.clearDecals();
    this.tracers.forEach((t) => t.mesh.dispose());
    this.casings.forEach((c) => c.mesh.dispose());
    this.impacts.forEach((i) => {
      i.mesh.material?.dispose();
      i.mesh.dispose();
    });
    this.tracers = [];
    this.casings = [];
    this.impacts = [];
    this.models.forEach((rig) => rig.root.dispose());
    this.models.clear();
    this.muzzleFlashMesh.dispose();
    this.muzzleLight.dispose();
    this.weaponPivot.dispose();
    this.materialsToDispose.forEach((m) => m.dispose());
    this.materialsToDispose = [];
  }
}
