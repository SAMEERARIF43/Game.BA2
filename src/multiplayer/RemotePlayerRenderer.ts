import {
  Color3,
  Constants,
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
  updateOperatorPaletteTeamColor,
} from '../game/OperatorMeshBuilder';
import {
  PooledTracerRingBuffer,
  getVfxQualityBudget,
  getWeaponFeelProfile,
} from '../game/combatVfx';
import { CharacterId, GraphicsQuality, Stance, WeaponId } from '../game/types';
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
  targetStance: Stance;
  bodyMat: PBRMaterial;
  headMat: PBRMaterial;
}

export class RemotePlayerRenderer {
  private scene: Scene;
  private avatars = new Map<string, RemoteAvatar>();
  private tracerPool: PooledTracerRingBuffer;
  private sharedMaterials: Material[] = [];
  private bluePalette: OperatorPalette;
  private redPalette: OperatorPalette;
  private blueTracerMat: StandardMaterial;
  private redTracerMat: StandardMaterial;
  private blueHex = '#3b82f6';
  private redHex = '#ef4444';
  private readonly fireStartScratch = new Vector3();
  private readonly fireEndScratch = new Vector3();

  constructor(scene: Scene) {
    this.scene = scene;

    this.tracerPool = new PooledTracerRingBuffer(this.scene, 'remoteTracerPool', 32);

    this.bluePalette = createOperatorPalette(this.scene, 'blue', 'remBluePal');
    this.redPalette = createOperatorPalette(this.scene, 'red', 'remRedPal');

    this.blueTracerMat = new StandardMaterial('remoteTracerBlue', this.scene);
    this.blueTracerMat.disableLighting = true;
    this.blueTracerMat.diffuseColor = Color3.Black();
    this.blueTracerMat.emissiveColor = new Color3(0.45, 1.05, 1.9);
    this.blueTracerMat.alpha = 0.94;
    this.blueTracerMat.alphaMode = Constants.ALPHA_ADD;
    this.blueTracerMat.disableDepthWrite = true;

    this.redTracerMat = new StandardMaterial('remoteTracerRed', this.scene);
    this.redTracerMat.disableLighting = true;
    this.redTracerMat.diffuseColor = Color3.Black();
    this.redTracerMat.emissiveColor = new Color3(1.95, 0.68, 0.35);
    this.redTracerMat.alpha = 0.94;
    this.redTracerMat.alphaMode = Constants.ALPHA_ADD;
    this.redTracerMat.disableDepthWrite = true;

    this.sharedMaterials.push(
      this.blueTracerMat,
      this.redTracerMat
    );
  }

  public setTeamColors(blueHex: string, redHex: string): void {
    this.blueHex = blueHex;
    this.redHex = redHex;
    updateOperatorPaletteTeamColor(this.bluePalette, blueHex);
    updateOperatorPaletteTeamColor(this.redPalette, redHex);

    try {
      const b = Color3.FromHexString(blueHex);
      this.blueTracerMat.emissiveColor = new Color3(
        b.r * 1.45 + 0.2,
        b.g * 1.45 + 0.2,
        b.b * 1.45 + 0.2
      );
    } catch {
      // Ignore invalid color
    }
    try {
      const r = Color3.FromHexString(redHex);
      this.redTracerMat.emissiveColor = new Color3(
        r.r * 1.45 + 0.2,
        r.g * 1.45 + 0.2,
        r.b * 1.45 + 0.2
      );
    } catch {
      // Ignore invalid color
    }

    for (const avatar of this.avatars.values()) {
      this.drawNameplate(avatar.nameplateTex, avatar.name, avatar.team);
    }
  }

  private drawNameplate(tex: DynamicTexture, name: string, team: TeamId): void {
    const nctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    nctx.clearRect(0, 0, 256, 64);
    nctx.fillStyle = 'rgba(10, 14, 20, 0.72)';
    nctx.fillRect(12, 12, 232, 40);
    nctx.fillStyle = team === 'blue' ? this.blueHex : this.redHex;
    nctx.fillRect(12, 12, 6, 40);
    nctx.fillStyle = '#f8fafc';
    nctx.font = 'bold 22px sans-serif';
    nctx.textAlign = 'center';
    nctx.textBaseline = 'middle';
    nctx.fillText(name.slice(0, 14), 132, 32);
    tex.update();
  }

  public setGraphicsQuality(quality: GraphicsQuality): void {
    const budget = getVfxQualityBudget(quality);
    this.tracerPool.setMaxActive(budget.maxTracers);
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
      avatar.targetStance = p.stance ?? 'stand';
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

  public getRadarActors(): {
    id: string;
    name: string;
    x: number;
    z: number;
    yawRad: number;
    team: TeamId;
    isAlive: boolean;
  }[] {
    const list: {
      id: string;
      name: string;
      x: number;
      z: number;
      yawRad: number;
      team: TeamId;
      isAlive: boolean;
    }[] = [];
    for (const a of this.avatars.values()) {
      list.push({
        id: a.id,
        name: a.name,
        x: a.root.position.x,
        z: a.root.position.z,
        yawRad: a.root.rotation.y,
        team: a.team,
        isAlive: a.isAlive,
      });
    }
    return list;
  }

  public getPlayerTargetPosition(
    playerId: string
  ): { x: number; y: number; z: number; isAlive: boolean } | null {
    const avatar = this.avatars.get(playerId);
    if (!avatar) return null;
    return {
      x: avatar.root.position.x,
      y: avatar.root.position.y,
      z: avatar.root.position.z,
      isAlive: avatar.isAlive,
    };
  }

  public spawnRemoteFire(evt: RemoteFireEvent): void {
    if (evt.weaponId === 'knife') return;
    const feel = getWeaponFeelProfile(evt.weaponId);
    const avatar = this.avatars.get(evt.shooterId);
    this.fireStartScratch.set(evt.muzzleX, evt.muzzleY, evt.muzzleZ);
    if (avatar && avatar.isAlive) {
      avatar.muzzleFlash.isVisible = true;
      avatar.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
      const flashScale = (0.82 + Math.random() * 0.44) * feel.muzzleScale;
      avatar.muzzleFlash.scaling.setAll(flashScale);
      avatar.muzzleFlashTimer = 0.045;
      this.fireStartScratch.copyFrom(avatar.muzzlePoint.getAbsolutePosition());
    }

    this.fireEndScratch.set(evt.endX, evt.endY, evt.endZ);
    this.tracerPool.spawn(
      this.fireStartScratch,
      this.fireEndScratch,
      avatar?.team === 'blue' ? this.blueTracerMat : this.redTracerMat,
      {
        thickness: feel.tracerThickness,
        duration: feel.tracerDuration,
        maxLength: 26,
        startLead: 0.05,
      }
    );
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
        const stance = avatar.targetStance;
        const targetPivotY = stance === 'slide' ? -0.42 : stance === 'crouch' ? -0.24 : 0;
        const targetPivotRotX = stance === 'slide' ? -0.44 : stance === 'crouch' ? 0.08 : 0;
        const postureLerp = 1 - Math.exp(-14 * clampedDt);
        avatar.pivot.rotation.x += (targetPivotRotX - avatar.pivot.rotation.x) * postureLerp;
        avatar.pivot.rotation.z *= Math.exp(-12 * clampedDt);
        avatar.pivot.position.y += (targetPivotY - avatar.pivot.position.y) * postureLerp;
        avatar.upperBodyPivot.rotation.x += (avatar.targetPitch - avatar.upperBodyPivot.rotation.x) * rotBlend;

        const moveSpeed =
          Math.hypot(avatar.root.position.x - avatar.prevPos.x, avatar.root.position.z - avatar.prevPos.z) /
          Math.max(0.001, clampedDt);

        if (stance === 'slide') {
          const slideLerp = 1 - Math.exp(-16 * clampedDt);
          avatar.legLPivot.rotation.x += (-1.05 - avatar.legLPivot.rotation.x) * slideLerp;
          avatar.legRPivot.rotation.x += (0.72 - avatar.legRPivot.rotation.x) * slideLerp;
          avatar.upperBodyPivot.position.y += (0.76 - avatar.upperBodyPivot.position.y) * slideLerp;
        } else if (stance === 'crouch') {
          const crouchLerp = 1 - Math.exp(-12 * clampedDt);
          const crouchWalk = moveSpeed > 0.25 ? Math.sin((avatar.walkPhase += clampedDt * 8)) * 0.24 : 0;
          avatar.legLPivot.rotation.x += (-0.52 + crouchWalk - avatar.legLPivot.rotation.x) * crouchLerp;
          avatar.legRPivot.rotation.x += (0.42 - crouchWalk - avatar.legRPivot.rotation.x) * crouchLerp;
          avatar.upperBodyPivot.position.y += (0.78 - avatar.upperBodyPivot.position.y) * crouchLerp;
        } else if (moveSpeed > 0.35) {
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

    this.tracerPool.update(clampedDt);
  }

  public clear(): void {
    this.tracerPool.clear();

    for (const avatar of this.avatars.values()) {
      this.disposeAvatar(avatar);
    }
    this.avatars.clear();
  }

  public dispose(): void {
    this.clear();
    this.tracerPool.dispose();
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
    this.drawNameplate(nameplateTex, p.name, p.team);

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
      targetStance: p.stance ?? 'stand',
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
