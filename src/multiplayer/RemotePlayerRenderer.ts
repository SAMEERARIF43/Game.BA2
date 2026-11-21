import {
  Color3,
  DynamicTexture,
  Material,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { HitZone, WeaponId } from '../game/types';
import { TeamId } from '../maps/types';
import { LobbyPlayerInfo, RemoteFireEvent } from './types';

interface RemoteAvatar {
  id: string;
  name: string;
  team: TeamId;
  root: TransformNode;
  pivot: TransformNode;
  upperBodyPivot: TransformNode;
  legLPivot: TransformNode;
  legRPivot: TransformNode;
  headMesh: Mesh;
  bodyMesh: Mesh;
  nameplateMesh: Mesh;
  nameplateMat: StandardMaterial;
  nameplateTex: DynamicTexture;
  rifleAssembly: TransformNode;
  muzzlePoint: TransformNode;
  muzzleFlash: Mesh;
  muzzleFlashTimer: number;
  targetPos: Vector3;
  targetRotY: number;
  targetPitch: number;
  walkPhase: number;
  prevPos: Vector3;
  isAlive: boolean;
  weaponId: WeaponId;
  bodyMat: PBRMaterial;
  headMat: PBRMaterial;
}

interface RemoteTracer {
  mesh: Mesh;
  life: number;
  maxLife: number;
}

export class RemotePlayerRenderer {
  private scene: Scene;
  private avatars = new Map<string, RemoteAvatar>();
  private tracers: RemoteTracer[] = [];
  private sharedMaterials: Material[] = [];
  private gearMat: PBRMaterial;
  private gunMat: PBRMaterial;
  private flashMat: StandardMaterial;
  private blueTracerMat: StandardMaterial;
  private redTracerMat: StandardMaterial;

  constructor(scene: Scene) {
    this.scene = scene;

    this.gearMat = new PBRMaterial('remoteGearMat', this.scene);
    this.gearMat.albedoColor = Color3.FromHexString('#1e222a');
    this.gearMat.metallic = 0.22;
    this.gearMat.roughness = 0.72;

    this.gunMat = new PBRMaterial('remoteGunMat', this.scene);
    this.gunMat.albedoColor = Color3.FromHexString('#2b313c');
    this.gunMat.metallic = 0.85;
    this.gunMat.roughness = 0.34;

    this.flashMat = new StandardMaterial('remoteFlashMat', this.scene);
    this.flashMat.disableLighting = true;
    this.flashMat.emissiveColor = new Color3(1.6, 1.15, 0.45);

    this.blueTracerMat = new StandardMaterial('remoteTracerBlue', this.scene);
    this.blueTracerMat.disableLighting = true;
    this.blueTracerMat.emissiveColor = new Color3(0.45, 1.0, 1.85);

    this.redTracerMat = new StandardMaterial('remoteTracerRed', this.scene);
    this.redTracerMat.disableLighting = true;
    this.redTracerMat.emissiveColor = new Color3(1.9, 0.65, 0.35);

    this.sharedMaterials.push(
      this.gearMat,
      this.gunMat,
      this.flashMat,
      this.blueTracerMat,
      this.redTracerMat
    );
  }

  public syncPlayers(players: LobbyPlayerInfo[], localPlayerId: string): void {
    const activeIds = new Set<string>();

    for (const p of players) {
      if (p.id === localPlayerId) continue;
      activeIds.add(p.id);

      let avatar = this.avatars.get(p.id);
      if (!avatar || avatar.team !== p.team) {
        if (avatar) {
          this.disposeAvatar(avatar);
        }
        avatar = this.createAvatar(p);
        this.avatars.set(p.id, avatar);
      }

      avatar.targetPos.set(p.x, p.y, p.z);
      avatar.targetRotY = p.rotY;
      avatar.targetPitch = Math.max(-0.65, Math.min(0.65, p.pitch));
      avatar.isAlive = p.isAlive;
      avatar.headMesh.isPickable = p.isAlive;
      avatar.bodyMesh.isPickable = p.isAlive;
      avatar.nameplateMesh.isVisible = p.isAlive;

      if (avatar.weaponId !== p.weaponId) {
        avatar.weaponId = p.weaponId;
        if (p.weaponId === 'knife') {
          avatar.rifleAssembly.scaling.set(0.55, 0.55, 0.32);
        } else {
          const scaleZ =
            p.weaponId === 'pistol'
              ? 0.44
              : p.weaponId === 'smg'
                ? 0.78
                : p.weaponId === 'shotgun'
                  ? 0.96
                  : p.weaponId === 'sniper'
                    ? 1.24
                    : 1.0;
          avatar.rifleAssembly.scaling.set(1, 1, scaleZ);
        }
      }
    }

    for (const [id, avatar] of this.avatars.entries()) {
      if (!activeIds.has(id)) {
        this.disposeAvatar(avatar);
        this.avatars.delete(id);
      }
    }
  }

  public getRadarActors(): { id: string; x: number; z: number; team: TeamId; isAlive: boolean }[] {
    const list: { id: string; x: number; z: number; team: TeamId; isAlive: boolean }[] = [];
    for (const a of this.avatars.values()) {
      list.push({
        id: a.id,
        x: a.root.position.x,
        z: a.root.position.z,
        team: a.team,
        isAlive: a.isAlive,
      });
    }
    return list;
  }

  public spawnRemoteFire(evt: RemoteFireEvent): void {
    if (evt.weaponId === 'knife') return;
    const avatar = this.avatars.get(evt.shooterId);
    let start = new Vector3(evt.muzzleX, evt.muzzleY, evt.muzzleZ);
    if (avatar && avatar.isAlive) {
      avatar.muzzleFlash.isVisible = true;
      avatar.muzzleFlashTimer = 0.045;
      start = avatar.muzzlePoint.getAbsolutePosition();
    }

    const end = new Vector3(evt.endX, evt.endY, evt.endZ);
    const delta = end.subtract(start);
    const fullDist = delta.length();
    if (fullDist < 0.3) return;
    const beamLen = Math.min(fullDist, 24);
    const dir = delta.scale(1 / fullDist);
    const mid = start.add(dir.scale(beamLen * 0.5));

    const beam = MeshBuilder.CreateBox(
      'remoteTracer',
      { width: 0.018, height: 0.018, depth: beamLen },
      this.scene
    );
    beam.position.copyFrom(mid);
    beam.lookAt(end);
    beam.material = avatar?.team === 'blue' ? this.blueTracerMat : this.redTracerMat;
    beam.isPickable = false;
    beam.checkCollisions = false;
    this.tracers.push({ mesh: beam, life: 0.06, maxLife: 0.06 });
  }

  public update(dt: number): void {
    const clampedDt = Math.min(dt, 0.05);
    const posBlend = 1 - Math.exp(-15 * clampedDt);
    const rotBlend = 1 - Math.exp(-16 * clampedDt);

    for (const avatar of this.avatars.values()) {
      avatar.prevPos.copyFrom(avatar.root.position);

      if (Vector3.DistanceSquared(avatar.root.position, avatar.targetPos) > 36) {
        avatar.root.position.copyFrom(avatar.targetPos);
      } else {
        Vector3.LerpToRef(avatar.root.position, avatar.targetPos, posBlend, avatar.root.position);
      }

      avatar.root.rotation.y = this.lerpAngle(avatar.root.rotation.y, avatar.targetRotY, rotBlend);

      if (!avatar.isAlive) {
        avatar.pivot.rotation.x = Math.min(Math.PI * 0.47, avatar.pivot.rotation.x + clampedDt * 8.5);
        avatar.pivot.rotation.z += (0.24 - avatar.pivot.rotation.z) * Math.min(1, clampedDt * 8);
        avatar.pivot.position.y = Math.max(-0.08, avatar.pivot.position.y - clampedDt * 0.6);
        avatar.legLPivot.rotation.x += (-0.35 - avatar.legLPivot.rotation.x) * Math.min(1, clampedDt * 10);
        avatar.legRPivot.rotation.x += (0.25 - avatar.legRPivot.rotation.x) * Math.min(1, clampedDt * 10);
      } else {
        avatar.pivot.rotation.x = Math.max(0, avatar.pivot.rotation.x - clampedDt * 12);
        avatar.pivot.rotation.z *= Math.exp(-12 * clampedDt);
        avatar.pivot.position.y += (0 - avatar.pivot.position.y) * Math.min(1, clampedDt * 14);
        avatar.upperBodyPivot.rotation.x += (avatar.targetPitch - avatar.upperBodyPivot.rotation.x) * rotBlend;

        const moveSpeed =
          Math.hypot(avatar.root.position.x - avatar.prevPos.x, avatar.root.position.z - avatar.prevPos.z) /
          Math.max(0.001, clampedDt);
        if (moveSpeed > 0.35) {
          avatar.walkPhase += clampedDt * Math.min(14, moveSpeed * 2.15);
          const swing = Math.sin(avatar.walkPhase) * Math.min(0.62, moveSpeed * 0.12);
          avatar.legLPivot.rotation.x = swing;
          avatar.legRPivot.rotation.x = -swing;
          avatar.upperBodyPivot.position.y = 0.8 + Math.abs(Math.cos(avatar.walkPhase)) * 0.032;
        } else {
          const settle = 1 - Math.exp(-12 * clampedDt);
          avatar.legLPivot.rotation.x += (0 - avatar.legLPivot.rotation.x) * settle;
          avatar.legRPivot.rotation.x += (0 - avatar.legRPivot.rotation.x) * settle;
          avatar.upperBodyPivot.position.y += (0.8 - avatar.upperBodyPivot.position.y) * settle;
        }
      }

      if (avatar.muzzleFlashTimer > 0) {
        avatar.muzzleFlashTimer = Math.max(0, avatar.muzzleFlashTimer - clampedDt);
        if (avatar.muzzleFlashTimer === 0) {
          avatar.muzzleFlash.isVisible = false;
        }
      }
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= clampedDt;
      if (t.life <= 0) {
        t.mesh.dispose();
        this.tracers.splice(i, 1);
      } else {
        const ratio = t.life / t.maxLife;
        t.mesh.scaling.x = ratio;
        t.mesh.scaling.y = ratio;
      }
    }
  }

  public clear(): void {
    for (const t of this.tracers) {
      t.mesh.dispose();
    }
    this.tracers = [];

    for (const avatar of this.avatars.values()) {
      this.disposeAvatar(avatar);
    }
    this.avatars.clear();
  }

  public dispose(): void {
    this.clear();
    for (const mat of this.sharedMaterials) {
      mat.dispose();
    }
    this.sharedMaterials = [];
  }

  private createAvatar(p: LobbyPlayerInfo): RemoteAvatar {
    const root = new TransformNode(`remote_root_${p.id}`, this.scene);
    root.position.set(p.x, p.y, p.z);
    root.rotation.y = p.rotY;

    const pivot = new TransformNode(`remote_pivot_${p.id}`, this.scene);
    pivot.parent = root;

    const bodyMat = new PBRMaterial(`remoteBody_${p.id}`, this.scene);
    bodyMat.albedoColor = Color3.FromHexString(p.team === 'blue' ? '#1e40af' : '#991b1b');
    bodyMat.emissiveColor =
      p.team === 'blue' ? new Color3(0.02, 0.06, 0.14) : new Color3(0.14, 0.03, 0.03);
    bodyMat.metallic = 0.18;
    bodyMat.roughness = 0.65;

    const headMat = new PBRMaterial(`remoteHead_${p.id}`, this.scene);
    headMat.albedoColor = Color3.FromHexString(p.team === 'blue' ? '#3b82f6' : '#dc2626');
    headMat.emissiveColor =
      p.team === 'blue' ? new Color3(0.04, 0.1, 0.24) : new Color3(0.22, 0.05, 0.04);
    headMat.metallic = 0.28;
    headMat.roughness = 0.45;

    const beaconMat = new StandardMaterial(`remoteBeacon_${p.id}`, this.scene);
    beaconMat.disableLighting = true;
    beaconMat.emissiveColor =
      p.team === 'blue' ? new Color3(0.25, 0.85, 1.85) : new Color3(1.85, 0.25, 0.3);
    this.sharedMaterials.push(beaconMat);

    const visorMat = new StandardMaterial(`remoteVisor_${p.id}`, this.scene);
    visorMat.disableLighting = true;
    visorMat.emissiveColor =
      p.team === 'blue' ? new Color3(0.4, 1.1, 1.8) : new Color3(1.6, 0.55, 0.25);
    this.sharedMaterials.push(visorMat);

    // Hip-pivoted legs + boots
    const legLPivot = new TransformNode(`rem_legLPivot_${p.id}`, this.scene);
    legLPivot.parent = pivot;
    legLPivot.position.set(-0.14, 0.78, 0);

    const legL = MeshBuilder.CreateBox(`rem_legL_${p.id}`, { width: 0.19, height: 0.66, depth: 0.21 }, this.scene);
    legL.position.set(0, -0.33, 0);
    legL.parent = legLPivot;
    legL.material = this.gearMat;
    legL.isPickable = false;

    const bootL = MeshBuilder.CreateBox(`rem_bootL_${p.id}`, { width: 0.2, height: 0.14, depth: 0.28 }, this.scene);
    bootL.position.set(0, -0.71, 0.03);
    bootL.parent = legLPivot;
    bootL.material = this.gunMat;
    bootL.isPickable = false;

    const legRPivot = new TransformNode(`rem_legRPivot_${p.id}`, this.scene);
    legRPivot.parent = pivot;
    legRPivot.position.set(0.14, 0.78, 0);

    const legR = MeshBuilder.CreateBox(`rem_legR_${p.id}`, { width: 0.19, height: 0.66, depth: 0.21 }, this.scene);
    legR.position.set(0, -0.33, 0);
    legR.parent = legRPivot;
    legR.material = this.gearMat;
    legR.isPickable = false;

    const bootR = MeshBuilder.CreateBox(`rem_bootR_${p.id}`, { width: 0.2, height: 0.14, depth: 0.28 }, this.scene);
    bootR.position.set(0, -0.71, 0.03);
    bootR.parent = legRPivot;
    bootR.material = this.gunMat;
    bootR.isPickable = false;

    // Upper body pivot (tilts with aim pitch)
    const upperBodyPivot = new TransformNode(`rem_upper_${p.id}`, this.scene);
    upperBodyPivot.parent = pivot;
    upperBodyPivot.position.set(0, 0.8, 0);

    const bodyMesh = MeshBuilder.CreateBox(`rem_body_${p.id}`, { width: 0.54, height: 0.72, depth: 0.3 }, this.scene);
    bodyMesh.position.set(0, 0.36, 0);
    bodyMesh.parent = upperBodyPivot;
    bodyMesh.material = bodyMat;
    bodyMesh.isPickable = p.isAlive;
    bodyMesh.metadata = {
      isRemotePlayer: true,
      playerId: p.id,
      team: p.team,
      zone: 'body' as HitZone,
    };

    const vest = MeshBuilder.CreateBox(`rem_vest_${p.id}`, { width: 0.48, height: 0.44, depth: 0.34 }, this.scene);
    vest.position.set(0, 0.41, 0);
    vest.parent = upperBodyPivot;
    vest.material = this.gearMat;
    vest.isPickable = false;

    for (const side of [-1, 1]) {
      const pad = MeshBuilder.CreateBox(`rem_pad_${p.id}_${side}`, { width: 0.14, height: 0.18, depth: 0.24 }, this.scene);
      pad.position.set(side * 0.33, 0.62, 0);
      pad.parent = upperBodyPivot;
      pad.material = bodyMat;
      pad.isPickable = false;

      const beacon = MeshBuilder.CreateBox(`rem_beacon_${p.id}_${side}`, { width: 0.05, height: 0.07, depth: 0.16 }, this.scene);
      beacon.position.set(side * 0.39, 0.65, 0);
      beacon.parent = upperBodyPivot;
      beacon.material = beaconMat;
      beacon.isPickable = false;
    }

    const headMesh = MeshBuilder.CreateBox(`rem_head_${p.id}`, { width: 0.3, height: 0.3, depth: 0.3 }, this.scene);
    headMesh.position.set(0, 0.9, 0);
    headMesh.parent = upperBodyPivot;
    headMesh.material = headMat;
    headMesh.isPickable = p.isAlive;
    headMesh.metadata = {
      isRemotePlayer: true,
      playerId: p.id,
      team: p.team,
      zone: 'head' as HitZone,
    };

    const helmet = MeshBuilder.CreateBox(`rem_helmet_${p.id}`, { width: 0.34, height: 0.16, depth: 0.35 }, this.scene);
    helmet.position.set(0, 0.99, -0.01);
    helmet.parent = upperBodyPivot;
    helmet.material = this.gearMat;
    helmet.isPickable = false;

    const visor = MeshBuilder.CreateBox(`rem_visor_${p.id}`, { width: 0.25, height: 0.075, depth: 0.05 }, this.scene);
    visor.position.set(0, 0.92, 0.155);
    visor.parent = upperBodyPivot;
    visor.material = visorMat;
    visor.isPickable = false;

    const armR = MeshBuilder.CreateBox(`rem_armR_${p.id}`, { width: 0.13, height: 0.13, depth: 0.44 }, this.scene);
    armR.position.set(0.32, 0.5, 0.18);
    armR.rotation.x = 0.22;
    armR.parent = upperBodyPivot;
    armR.material = this.gearMat;
    armR.isPickable = false;

    const armL = MeshBuilder.CreateBox(`rem_armL_${p.id}`, { width: 0.13, height: 0.13, depth: 0.48 }, this.scene);
    armL.position.set(-0.08, 0.46, 0.28);
    armL.rotation.y = 0.65;
    armL.rotation.x = 0.16;
    armL.parent = upperBodyPivot;
    armL.material = this.gearMat;
    armL.isPickable = false;

    const rifleAssembly = new TransformNode(`rem_weapon_${p.id}`, this.scene);
    rifleAssembly.parent = upperBodyPivot;
    rifleAssembly.position.set(0.24, 0.48, 0.38);

    const rifleMesh = MeshBuilder.CreateBox(`rem_rifle_${p.id}`, { width: 0.075, height: 0.11, depth: 0.62 }, this.scene);
    rifleMesh.parent = rifleAssembly;
    rifleMesh.material = this.gunMat;
    rifleMesh.isPickable = false;

    const barrel = MeshBuilder.CreateCylinder(`rem_barrel_${p.id}`, { height: 0.28, diameter: 0.032, tessellation: 8 }, this.scene);
    barrel.rotation.x = Math.PI * 0.5;
    barrel.position.set(0, 0.02, 0.4);
    barrel.parent = rifleAssembly;
    barrel.material = this.gunMat;
    barrel.isPickable = false;

    const muzzlePoint = new TransformNode(`rem_muzzle_${p.id}`, this.scene);
    muzzlePoint.parent = rifleAssembly;
    muzzlePoint.position.set(0, 0.02, 0.56);

    const muzzleFlash = MeshBuilder.CreatePolyhedron(`rem_flash_${p.id}`, { type: 1, size: 0.08 }, this.scene);
    muzzleFlash.parent = muzzlePoint;
    muzzleFlash.material = this.flashMat;
    muzzleFlash.isPickable = false;
    muzzleFlash.isVisible = false;

    // Floating Nameplate Billboard (named rem_np_* so GlowLayer excludes it)
    const nameplateTex = new DynamicTexture(`rem_np_tex_${p.id}`, { width: 256, height: 64 }, this.scene, true);
    nameplateTex.hasAlpha = true;
    const nctx = nameplateTex.getContext() as unknown as CanvasRenderingContext2D;
    nctx.clearRect(0, 0, 256, 64);
    nctx.fillStyle = 'rgba(10, 14, 20, 0.72)';
    nctx.fillRect(12, 12, 232, 40);
    nctx.fillStyle = p.team === 'blue' ? '#3b82f6' : '#ef4444';
    nctx.fillRect(12, 12, 6, 40);
    nctx.fillStyle = '#f8fafc';
    nctx.font = 'bold 22px sans-serif';
    nctx.textAlign = 'center';
    nctx.textBaseline = 'middle';
    nctx.fillText(p.name.slice(0, 14), 132, 32);
    nameplateTex.update();

    const nameplateMat = new StandardMaterial(`rem_np_mat_${p.id}`, this.scene);
    nameplateMat.diffuseTexture = nameplateTex;
    nameplateMat.emissiveTexture = nameplateTex;
    nameplateMat.disableLighting = true;
    nameplateMat.useAlphaFromDiffuseTexture = true;
    nameplateMat.backFaceCulling = false;

    const nameplateMesh = MeshBuilder.CreatePlane(`rem_np_${p.id}`, { width: 1.35, height: 0.34 }, this.scene);
    nameplateMesh.parent = root;
    nameplateMesh.position.set(0, 2.22, 0);
    nameplateMesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    nameplateMesh.material = nameplateMat;
    nameplateMesh.isPickable = false;
    nameplateMesh.isVisible = p.isAlive;

    return {
      id: p.id,
      name: p.name,
      team: p.team,
      root,
      pivot,
      upperBodyPivot,
      legLPivot,
      legRPivot,
      headMesh,
      bodyMesh,
      nameplateMesh,
      nameplateMat,
      nameplateTex,
      rifleAssembly,
      muzzlePoint,
      muzzleFlash,
      muzzleFlashTimer: 0,
      targetPos: new Vector3(p.x, p.y, p.z),
      targetRotY: p.rotY,
      targetPitch: p.pitch,
      walkPhase: 0,
      prevPos: new Vector3(p.x, p.y, p.z),
      isAlive: p.isAlive,
      weaponId: p.weaponId,
      bodyMat,
      headMat,
    };
  }

  private disposeAvatar(avatar: RemoteAvatar): void {
    avatar.nameplateTex.dispose();
    avatar.nameplateMat.dispose();
    avatar.bodyMat.dispose();
    avatar.headMat.dispose();
    avatar.root.dispose();
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }
}
