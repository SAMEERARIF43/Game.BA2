import {
  AbstractMesh,
  Color3,
  Mesh,
  MeshBuilder,
  Ray,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import { TACTICAL_EQUIPMENT, TacticalEquipmentId } from './types';

interface BarrageShell {
  mesh: Mesh;
  targetX: number;
  targetY: number;
  targetZ: number;
  delay: number;
  active: boolean;
}

interface BlastEffect {
  sphere: Mesh;
  ring: Mesh;
  sphereMat: StandardMaterial;
  ringMat: StandardMaterial;
  life: number;
  maxLife: number;
  active: boolean;
}

interface TacticalProjectile {
  kind: TacticalEquipmentId;
  mesh: Mesh;
  velocity: Vector3;
  fuseRemaining: number;
}

export interface SmokeCloudEffect {
  meshes: Mesh[];
  mat: StandardMaterial;
  x: number;
  y: number;
  z: number;
  radius: number;
  life: number;
  maxLife: number;
}

export interface TacticalEffectsCallbacks {
  onBarrageImpact: (pos: Vector3) => void;
  onTacticalDetonate: (kind: TacticalEquipmentId, pos: Vector3) => void;
  onSmokeCloudsChanged: (clouds: SmokeCloudEffect[]) => void;
}

const MAX_POOLED_BLASTS = 10;
const BARRAGE_SHELL_SPEED = 42;
const SMOKE_PUFF_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1.35, 0],
  [-1.85, 1.05, 1.15],
  [1.9, 1.1, 0.95],
  [-1.2, 1.15, -1.75],
  [1.5, 1.25, -1.45],
];

export class TacticalEffectsManager {
  private readonly scene: Scene;
  private readonly callbacks: TacticalEffectsCallbacks;
  private readonly tacticalMeshPredicate: (mesh: AbstractMesh) => boolean;

  private readonly barrageShells: BarrageShell[] = [];
  private barrageShellMat: StandardMaterial | null = null;

  private readonly blastPool: BlastEffect[] = [];
  private readonly tacticalProjectiles: TacticalProjectile[] = [];
  private readonly tacticalProjMats = new Map<TacticalEquipmentId, StandardMaterial>();
  private readonly smokeClouds: SmokeCloudEffect[] = [];

  // Zero-alloc scratch vectors & ray
  private readonly hitRay = new Ray(Vector3.Zero(), Vector3.Forward(), 2);
  private readonly stepScratch = new Vector3();
  private readonly normalScratch = new Vector3();
  private readonly offsetScratch = new Vector3();
  private readonly forwardScratch = new Vector3();
  private readonly impactScratch = new Vector3();
  private readonly barrageCenterScratch = new Vector3();
  private projSeq = 0;
  private smokeSeq = 0;

  constructor(scene: Scene, callbacks: TacticalEffectsCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.tacticalMeshPredicate = (mesh: AbstractMesh): boolean =>
      mesh.checkCollisions && mesh.isEnabled() && !mesh.metadata?.isBot;
  }

  public hasActiveBarrage(): boolean {
    for (let i = 0; i < this.barrageShells.length; i++) {
      if (this.barrageShells[i].active) return true;
    }
    return false;
  }

  public launchBarrage(
    playerPos: Vector3,
    cameraForward: Vector3,
    livingEnemies: Vector3[]
  ): void {
    this.barrageCenterScratch.set(cameraForward.x, 0, cameraForward.z);
    if (this.barrageCenterScratch.lengthSquared() < 0.001) {
      this.barrageCenterScratch.set(0, 0, 1);
    } else {
      this.barrageCenterScratch.normalize();
    }

    let centerX = playerPos.x + this.barrageCenterScratch.x * 14;
    let centerZ = playerPos.z + this.barrageCenterScratch.z * 14;

    if (livingEnemies.length > 0) {
      let best = livingEnemies[0];
      let bestDistSq = Infinity;
      for (const e of livingEnemies) {
        const dx = e.x - centerX;
        const dz = e.z - centerZ;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          best = e;
        }
      }
      centerX = best.x;
      centerZ = best.z;
    }

    centerX = Math.max(-22, Math.min(22, centerX));
    centerZ = Math.max(-22, Math.min(22, centerZ));

    if (!this.barrageShellMat) {
      const mat = new StandardMaterial('barrageShellSharedMat', this.scene);
      mat.disableLighting = true;
      mat.emissiveColor = new Color3(2.0, 0.9, 0.28);
      this.barrageShellMat = mat;
    }

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
      const rad = i === 0 ? 0.5 : 2.2 + Math.random() * 4.5;
      const tx = Math.max(-24, Math.min(24, centerX + Math.cos(angle) * rad));
      const tz = Math.max(-24, Math.min(24, centerZ + Math.sin(angle) * rad));

      let shellSlot = this.barrageShells[i];
      if (!shellSlot) {
        const mesh = MeshBuilder.CreateCylinder(
          `barrageShell_${i}`,
          { height: 1.4, diameterTop: 0.08, diameterBottom: 0.22, tessellation: 8 },
          this.scene
        );
        mesh.material = this.barrageShellMat;
        mesh.isPickable = false;
        mesh.checkCollisions = false;
        mesh.setEnabled(false);
        shellSlot = {
          mesh,
          targetX: tx,
          targetY: 0.2,
          targetZ: tz,
          delay: 0.3 + i * 0.34,
          active: false,
        };
        this.barrageShells[i] = shellSlot;
      }

      shellSlot.targetX = tx;
      shellSlot.targetY = 0.2;
      shellSlot.targetZ = tz;
      shellSlot.delay = 0.3 + i * 0.34;
      shellSlot.active = true;
      shellSlot.mesh.position.set(tx, 26, tz);
      shellSlot.mesh.isVisible = false;
      shellSlot.mesh.setEnabled(true);
    }
  }

  public spawnBlastVisual(
    pos: Vector3,
    sphereColor: Color3,
    ringColor: Color3,
    maxLife = 0.48
  ): void {
    let slot = this.blastPool.find((b) => !b.active);
    if (!slot) {
      if (this.blastPool.length < MAX_POOLED_BLASTS) {
        const idx = this.blastPool.length;
        const sphereMat = new StandardMaterial(`blastSphPoolMat_${idx}`, this.scene);
        sphereMat.disableLighting = true;

        const sphere = MeshBuilder.CreateSphere(
          `blastSpherePool_${idx}`,
          { diameter: 1.4, segments: 10 },
          this.scene
        );
        sphere.material = sphereMat;
        sphere.isPickable = false;
        sphere.checkCollisions = false;

        const ringMat = new StandardMaterial(`blastRingPoolMat_${idx}`, this.scene);
        ringMat.disableLighting = true;
        ringMat.backFaceCulling = false;

        const ring = MeshBuilder.CreateDisc(
          `blastRingPool_${idx}`,
          { radius: 0.9, tessellation: 24 },
          this.scene
        );
        ring.rotation.x = Math.PI * 0.5;
        ring.material = ringMat;
        ring.isPickable = false;
        ring.checkCollisions = false;

        slot = {
          sphere,
          ring,
          sphereMat,
          ringMat,
          life: 0,
          maxLife,
          active: false,
        };
        this.blastPool.push(slot);
      } else {
        // Recycle oldest slot
        slot = this.blastPool[0];
        for (let i = 1; i < this.blastPool.length; i++) {
          if (this.blastPool[i].life < slot.life) {
            slot = this.blastPool[i];
          }
        }
      }
    }

    slot.sphereMat.emissiveColor.copyFrom(sphereColor);
    slot.sphereMat.alpha = 0.85;
    slot.sphere.position.set(pos.x, pos.y + 0.4, pos.z);
    slot.sphere.scaling.setAll(0.6);
    slot.sphere.setEnabled(true);

    slot.ringMat.emissiveColor.copyFrom(ringColor);
    slot.ringMat.alpha = 0.9;
    slot.ring.position.set(pos.x, pos.y + 0.08, pos.z);
    slot.ring.scaling.set(0.8, 0.8, 1);
    slot.ring.setEnabled(true);

    slot.life = maxLife;
    slot.maxLife = maxLife;
    slot.active = true;
  }

  public spawnProjectile(
    kind: TacticalEquipmentId,
    origin: Vector3,
    forward: Vector3
  ): void {
    const cfg = TACTICAL_EQUIPMENT[kind];
    this.forwardScratch.copyFrom(forward).normalize();

    let mat = this.tacticalProjMats.get(kind);
    if (!mat) {
      mat = new StandardMaterial(`tacProjSharedMat_${kind}`, this.scene);
      const color = Color3.FromHexString(cfg.accentHex);
      mat.diffuseColor = color;
      mat.emissiveColor = color.scale(0.45);
      this.tacticalProjMats.set(kind, mat);
    }

    const mesh = MeshBuilder.CreateCylinder(
      `tacProj_${++this.projSeq}`,
      { height: 0.22, diameterTop: 0.1, diameterBottom: 0.11, tessellation: 10 },
      this.scene
    );
    mesh.position.set(
      origin.x + this.forwardScratch.x * 0.68,
      origin.y + this.forwardScratch.y * 0.68 - 0.1,
      origin.z + this.forwardScratch.z * 0.68
    );
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.checkCollisions = false;

    const velocity = new Vector3(
      this.forwardScratch.x * 18.5,
      this.forwardScratch.y * 18.5 + 4.2,
      this.forwardScratch.z * 18.5
    );

    this.tacticalProjectiles.push({
      kind,
      mesh,
      velocity,
      fuseRemaining: cfg.fuseSec,
    });
  }

  public spawnSmokeCloud(pos: Vector3, radiusMeters: number, durationSec: number): void {
    const id = ++this.smokeSeq;
    const smokeMat = new StandardMaterial(`smokeMat_${id}`, this.scene);
    smokeMat.diffuseColor = new Color3(0.74, 0.78, 0.84);
    smokeMat.emissiveColor = new Color3(0.22, 0.25, 0.29);
    smokeMat.specularColor = Color3.Black();
    smokeMat.alpha = 0.72;
    smokeMat.disableDepthWrite = true;

    const meshes = SMOKE_PUFF_OFFSETS.map(([ox, oy, oz], idx) => {
      const puff = MeshBuilder.CreateSphere(
        `smokePuff_${id}_${idx}`,
        { diameter: idx === 0 ? radiusMeters * 1.15 : radiusMeters * 0.86, segments: 10 },
        this.scene
      );
      puff.position.set(pos.x + ox, pos.y + oy, pos.z + oz);
      puff.material = smokeMat;
      puff.isPickable = false;
      puff.checkCollisions = false;
      puff.scaling.setAll(0.45);
      return puff;
    });

    this.smokeClouds.push({
      meshes,
      mat: smokeMat,
      x: pos.x,
      y: pos.y + 1.2,
      z: pos.z,
      radius: radiusMeters,
      life: durationSec,
      maxLife: durationSec,
    });
    this.callbacks.onSmokeCloudsChanged(this.smokeClouds);
  }

  public update(dt: number): void {
    // 1. Falling barrage shells
    for (let i = 0; i < this.barrageShells.length; i++) {
      const s = this.barrageShells[i];
      if (!s.active) continue;

      if (s.delay > 0) {
        s.delay -= dt;
        if (s.delay <= 0) {
          s.mesh.isVisible = true;
        }
        continue;
      }

      s.mesh.position.y -= BARRAGE_SHELL_SPEED * dt;
      if (s.mesh.position.y <= s.targetY) {
        s.active = false;
        s.mesh.setEnabled(false);
        this.impactScratch.set(s.targetX, s.targetY, s.targetZ);
        this.callbacks.onBarrageImpact(this.impactScratch);
      }
    }

    // 2. Pooled blast spheres & shockwave rings
    for (let i = 0; i < this.blastPool.length; i++) {
      const b = this.blastPool[i];
      if (!b.active) continue;

      b.life -= dt;
      if (b.life <= 0) {
        b.active = false;
        b.sphere.setEnabled(false);
        b.ring.setEnabled(false);
      } else {
        const t = 1 - b.life / b.maxLife;
        const sphereScale = 0.6 + t * 5.2;
        b.sphere.scaling.setAll(sphereScale);
        b.sphereMat.alpha = Math.max(0, (1 - t) * 0.85);
        const ringScale = 0.8 + t * 10.5;
        b.ring.scaling.set(ringScale, ringScale, 1);
        b.ringMat.alpha = Math.max(0, (1 - t) * 0.9);
      }
    }

    // 3. Thrown tactical projectiles
    for (let i = this.tacticalProjectiles.length - 1; i >= 0; i--) {
      const p = this.tacticalProjectiles[i];
      p.velocity.y -= 20 * dt;

      this.stepScratch.copyFrom(p.velocity).scaleInPlace(dt);
      const stepLen = this.stepScratch.length();
      if (stepLen > 0.001) {
        this.hitRay.origin.copyFrom(p.mesh.position);
        this.hitRay.direction.copyFrom(this.stepScratch).scaleInPlace(1 / stepLen);
        this.hitRay.length = stepLen + 0.16;
        const hit = this.scene.pickWithRay(this.hitRay, this.tacticalMeshPredicate);
        if (hit?.hit && hit.pickedPoint) {
          const pickedNormal = hit.getNormal(true);
          if (pickedNormal) {
            this.normalScratch.copyFrom(pickedNormal);
          } else {
            this.normalScratch.set(0, 1, 0);
          }
          this.offsetScratch.copyFrom(this.normalScratch).scaleInPlace(0.14);
          p.mesh.position.copyFrom(hit.pickedPoint).addInPlace(this.offsetScratch);
          const vn = Vector3.Dot(p.velocity, this.normalScratch);
          if (vn < 0) {
            this.offsetScratch.copyFrom(this.normalScratch).scaleInPlace(1.48 * vn);
            p.velocity.subtractInPlace(this.offsetScratch);
            p.velocity.scaleInPlace(0.62);
          }
        } else {
          p.mesh.position.addInPlace(this.stepScratch);
        }
      }

      if (p.mesh.position.y < 0.22) {
        p.mesh.position.y = 0.22;
        if (p.velocity.y < 0) {
          p.velocity.y = -p.velocity.y * 0.42;
          p.velocity.x *= 0.72;
          p.velocity.z *= 0.72;
        }
      }
      if (p.mesh.position.x > 27.5 || p.mesh.position.x < -27.5) {
        p.mesh.position.x = Math.max(-27.5, Math.min(27.5, p.mesh.position.x));
        p.velocity.x *= -0.5;
      }
      if (p.mesh.position.z > 27.5 || p.mesh.position.z < -27.5) {
        p.mesh.position.z = Math.max(-27.5, Math.min(27.5, p.mesh.position.z));
        p.velocity.z *= -0.5;
      }

      p.mesh.rotation.x += 7.5 * dt;
      p.mesh.rotation.z += 5.2 * dt;
      p.fuseRemaining -= dt;
      if (p.fuseRemaining <= 0) {
        this.impactScratch.copyFrom(p.mesh.position);
        const kind = p.kind;
        p.mesh.dispose();
        this.tacticalProjectiles.splice(i, 1);
        this.callbacks.onTacticalDetonate(kind, this.impactScratch);
      }
    }

    // 4. Active smoke concealment clouds
    if (this.smokeClouds.length > 0) {
      let cloudsChanged = false;
      for (let i = this.smokeClouds.length - 1; i >= 0; i--) {
        const cloud = this.smokeClouds[i];
        cloud.life -= dt;
        if (cloud.life <= 0) {
          for (const m of cloud.meshes) {
            m.dispose();
          }
          cloud.mat.dispose();
          this.smokeClouds.splice(i, 1);
          cloudsChanged = true;
        } else {
          const age = cloud.maxLife - cloud.life;
          const expandT = Math.min(1, age / 0.65);
          const fadeT = cloud.life < 2.5 ? cloud.life / 2.5 : 1;
          cloud.mat.alpha = 0.72 * fadeT;
          const scale = 0.45 + expandT * 0.55;
          for (const m of cloud.meshes) {
            m.scaling.setAll(scale);
          }
        }
      }
      if (cloudsChanged) {
        this.callbacks.onSmokeCloudsChanged(this.smokeClouds);
      }
    }
  }

  public clear(): void {
    for (const s of this.barrageShells) {
      s.active = false;
      s.mesh.setEnabled(false);
    }
    for (const b of this.blastPool) {
      b.active = false;
      b.sphere.setEnabled(false);
      b.ring.setEnabled(false);
    }
    for (const p of this.tacticalProjectiles) {
      p.mesh.dispose();
    }
    this.tacticalProjectiles.length = 0;
    for (const c of this.smokeClouds) {
      for (const m of c.meshes) {
        m.dispose();
      }
      c.mat.dispose();
    }
    this.smokeClouds.length = 0;
    this.callbacks.onSmokeCloudsChanged([]);
  }

  public dispose(): void {
    this.clear();
    for (const s of this.barrageShells) {
      s.mesh.dispose();
    }
    this.barrageShells.length = 0;
    this.barrageShellMat?.dispose();
    this.barrageShellMat = null;

    for (const b of this.blastPool) {
      b.sphere.dispose();
      b.ring.dispose();
      b.sphereMat.dispose();
      b.ringMat.dispose();
    }
    this.blastPool.length = 0;

    for (const mat of this.tacticalProjMats.values()) {
      mat.dispose();
    }
    this.tacticalProjMats.clear();
  }
}
