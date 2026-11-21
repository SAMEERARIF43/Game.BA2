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
import {
  OperatorPalette,
  OperatorRig,
  buildOperatorRig,
  createOperatorPalette,
} from '../game/OperatorMeshBuilder';
import { CharacterId, WeaponId } from '../game/types';
import { TeamId } from '../maps/types';
import { LobbyPlayerInfo, RemoteFireEvent } from './types';

interface RemoteAvatar {
  id: string;
  name: string;
  team: TeamId;
  characterId: CharacterId;
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
  rig: OperatorRig;
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
  private bluePalette: OperatorPalette;
  private redPalette: OperatorPalette;
  private blueTracerMat: StandardMaterial;
  private redTracerMat: StandardMaterial;

  constructor(scene: Scene) {
    this.scene = scene;

    this.bluePalette = createOperatorPalette(this.scene, 'blue', 'remBluePal');
    this.redPalette = createOperatorPalette(this.scene, 'red', 'remRedPal');

    this.blueTracerMat = new StandardMaterial('remoteTracerBlue', this.scene);
    this.blueTracerMat.disableLighting = true;
    this.blueTracerMat.emissiveColor = new Color3(0.45, 1.0, 1.85);

    this.redTracerMat = new StandardMaterial('remoteTracerRed', this.scene);
    this.redTracerMat.disableLighting = true;
    this.redTracerMat.emissiveColor = new Color3(1.9, 0.65, 0.35);

    this.sharedMaterials.push(
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
      if (!avatar || avatar.team !== p.team || avatar.characterId !== p.characterId) {
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
        avatar.rig.setWeapon(p.weaponId);
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
    this.bluePalette.dispose();
    this.redPalette.dispose();
    for (const mat of this.sharedMaterials) {
      mat.dispose();
    }
    this.sharedMaterials = [];
  }

  private createAvatar(p: LobbyPlayerInfo): RemoteAvatar {
    const palette = p.team === 'blue' ? this.bluePalette : this.redPalette;
    const rig = buildOperatorRig(this.scene, {
      id: `rem_${p.id}`,
      team: p.team,
      palette,
      characterId: p.characterId,
      initialWeaponId: p.weaponId,
      buildAllWeapons: true,
      isPickableHitboxes: p.isAlive,
      hitboxMetadata: {
        isRemotePlayer: true,
        playerId: p.id,
        team: p.team,
      },
    });
    rig.root.position.set(p.x, p.y, p.z);
    rig.root.rotation.y = p.rotY;

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
    nameplateMesh.parent = rig.root;
    nameplateMesh.position.set(0, 2.22, 0);
    nameplateMesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    nameplateMesh.material = nameplateMat;
    nameplateMesh.isPickable = false;
    nameplateMesh.isVisible = p.isAlive;

    return {
      id: p.id,
      name: p.name,
      team: p.team,
      characterId: rig.characterId,
      root: rig.root,
      pivot: rig.pivot,
      upperBodyPivot: rig.upperBodyPivot,
      legLPivot: rig.legLPivot,
      legRPivot: rig.legRPivot,
      headMesh: rig.headMesh,
      bodyMesh: rig.bodyMesh,
      nameplateMesh,
      nameplateMat,
      nameplateTex,
      rig,
      muzzlePoint: rig.muzzlePoint,
      muzzleFlash: rig.muzzleFlash,
      muzzleFlashTimer: 0,
      targetPos: new Vector3(p.x, p.y, p.z),
      targetRotY: p.rotY,
      targetPitch: p.pitch,
      walkPhase: 0,
      prevPos: new Vector3(p.x, p.y, p.z),
      isAlive: p.isAlive,
      weaponId: p.weaponId,
      bodyMat: rig.bodyMat,
      headMat: rig.headMat,
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
