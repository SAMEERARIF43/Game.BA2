import {
  AbstractMesh,
  Camera,
  Color3,
  Matrix,
  Mesh,
  MeshBuilder,
  Ray,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  Viewport,
} from '@babylonjs/core';
import { TeamId } from '../maps/types';
import { GameMode } from './gameModeRules';
import { PingHudMarker, PingKind } from './types';

export interface PingPlacementRequest {
  id: string;
  senderId: string;
  senderName: string;
  team: TeamId;
  kind: PingKind;
  x: number;
  y: number;
  z: number;
  targetId?: string;
  durationSec?: number;
}

export interface ActivePingRecord {
  id: string;
  senderId: string;
  senderName: string;
  team: TeamId;
  kind: PingKind;
  x: number;
  y: number;
  z: number;
  targetId?: string;
  ageSec: number;
  totalSec: number;
  remainingSec: number;
  targetLost: boolean;
}

export interface PingTargetLookupResult {
  x: number;
  y: number;
  z: number;
  isAlive: boolean;
}

export interface PingRaycastResult {
  kind: PingKind;
  x: number;
  y: number;
  z: number;
  targetId?: string;
}

interface PingVisualSlot {
  activePingId: string | null;
  root: TransformNode;
  iconNode: TransformNode;
  beam: Mesh;
  ring: Mesh;
  diamondBars: Mesh[];
  coreDiamond: Mesh;
  enemyChevrons: Mesh[];
}

const MAX_PING_SLOTS = 12;
const MAX_PINGS_PER_SENDER = 2;
const DEFAULT_LOCATION_DURATION_SEC = 8.0;
const DEFAULT_ENEMY_DURATION_SEC = 6.0;
const FALLBACK_SKY_PING_RANGE = 65;

export function resolvePingRaycast(
  scene: Scene,
  origin: Vector3,
  direction: Vector3,
  localTeam: TeamId,
  excludeMesh?: AbstractMesh | null,
  maxRange = 180,
  gameMode: GameMode = 'tdm'
): PingRaycastResult {
  const dir = direction.clone();
  if (dir.lengthSquared() < 1e-6) {
    dir.set(0, 0, 1);
  } else {
    dir.normalize();
  }

  const ray = new Ray(origin, dir, maxRange);
  const pick = scene.pickWithRay(
    ray,
    (mesh) => mesh.isPickable && mesh.isEnabled() && mesh !== excludeMesh
  );

  if (pick?.hit && pick.pickedPoint) {
    const meta = pick.pickedMesh?.metadata as
      | {
          isBot?: boolean;
          botId?: string;
          isRemotePlayer?: boolean;
          playerId?: string;
          team?: TeamId;
        }
      | undefined;

    if (meta?.isBot && meta.botId && meta.team && (gameMode === 'ffa' || meta.team !== localTeam)) {
      const grandParent = pick.pickedMesh?.parent?.parent;
      const rootPos = grandParent instanceof TransformNode ? grandParent.position : undefined;
      return {
        kind: 'enemy',
        x: rootPos ? rootPos.x : pick.pickedPoint.x,
        y: rootPos ? rootPos.y : Math.max(0, pick.pickedPoint.y - 1.2),
        z: rootPos ? rootPos.z : pick.pickedPoint.z,
        targetId: meta.botId,
      };
    }

    if (meta?.isRemotePlayer && meta.playerId && meta.team && (gameMode === 'ffa' || meta.team !== localTeam)) {
      const grandParent = pick.pickedMesh?.parent?.parent;
      const rootPos = grandParent instanceof TransformNode ? grandParent.position : undefined;
      return {
        kind: 'enemy',
        x: rootPos ? rootPos.x : pick.pickedPoint.x,
        y: rootPos ? rootPos.y : Math.max(0, pick.pickedPoint.y - 1.2),
        z: rootPos ? rootPos.z : pick.pickedPoint.z,
        targetId: meta.playerId,
      };
    }

    return {
      kind: 'location',
      x: pick.pickedPoint.x,
      y: pick.pickedPoint.y,
      z: pick.pickedPoint.z,
    };
  }

  return {
    kind: 'location',
    x: origin.x + dir.x * FALLBACK_SKY_PING_RANGE,
    y: Math.max(0.2, origin.y + dir.y * FALLBACK_SKY_PING_RANGE),
    z: origin.z + dir.z * FALLBACK_SKY_PING_RANGE,
  };
}

export class PingSystem {
  private scene: Scene;
  private localTeam: TeamId = 'blue';
  private poolRoot: TransformNode;
  private slots: PingVisualSlot[] = [];
  private activePings: ActivePingRecord[] = [];
  private materials: StandardMaterial[] = [];

  private locationOuterMat: StandardMaterial;
  private locationCoreMat: StandardMaterial;
  private locationBeamMat: StandardMaterial;
  private enemyOuterMat: StandardMaterial;
  private enemyCoreMat: StandardMaterial;
  private enemyBeamMat: StandardMaterial;

  private readonly worldScratch = new Vector3();
  private readonly iconWorldScratch = new Vector3();
  private readonly toTargetScratch = new Vector3();
  private readonly forwardScratch = new Vector3();
  private readonly identityMatrix = Matrix.Identity();
  private readonly viewportScratch = new Viewport(0, 0, 1, 1);

  constructor(scene: Scene) {
    this.scene = scene;
    this.poolRoot = new TransformNode('tacticalPingPoolRoot', this.scene);

    this.locationOuterMat = this.createUnlitMat('pingLocOuterMat', new Color3(0.22, 0.82, 1.0), 0.95);
    this.locationCoreMat = this.createUnlitMat('pingLocCoreMat', new Color3(0.72, 0.96, 1.0), 0.98);
    this.locationBeamMat = this.createUnlitMat('pingLocBeamMat', new Color3(0.2, 0.72, 0.98), 0.34);

    this.enemyOuterMat = this.createUnlitMat('pingEnemyOuterMat', new Color3(1.0, 0.24, 0.24), 0.96);
    this.enemyCoreMat = this.createUnlitMat('pingEnemyCoreMat', new Color3(1.0, 0.72, 0.42), 0.98);
    this.enemyBeamMat = this.createUnlitMat('pingEnemyBeamMat', new Color3(1.0, 0.22, 0.22), 0.38);

    this.materials.push(
      this.locationOuterMat,
      this.locationCoreMat,
      this.locationBeamMat,
      this.enemyOuterMat,
      this.enemyCoreMat,
      this.enemyBeamMat
    );

    for (let i = 0; i < MAX_PING_SLOTS; i++) {
      this.slots.push(this.createSlot(i));
    }
  }

  private createUnlitMat(name: string, emissive: Color3, alpha: number): StandardMaterial {
    const mat = new StandardMaterial(name, this.scene);
    mat.disableLighting = true;
    mat.diffuseColor = Color3.Black();
    mat.emissiveColor = emissive;
    mat.alpha = alpha;
    mat.backFaceCulling = false;
    return mat;
  }

  private createSlot(index: number): PingVisualSlot {
    const root = new TransformNode(`pingSlot_${index}`, this.scene);
    root.parent = this.poolRoot;
    root.setEnabled(false);

    const beam = MeshBuilder.CreateCylinder(
      `pingBeam_${index}`,
      { height: 1.45, diameterTop: 0.04, diameterBottom: 0.09, tessellation: 10 },
      this.scene
    );
    beam.parent = root;
    beam.position.y = 0.72;
    beam.material = this.locationBeamMat;
    beam.isPickable = false;
    beam.checkCollisions = false;

    const ring = MeshBuilder.CreateTorus(
      `pingRing_${index}`,
      { diameter: 0.82, thickness: 0.045, tessellation: 24 },
      this.scene
    );
    ring.parent = root;
    ring.position.y = 0.04;
    ring.material = this.locationOuterMat;
    ring.isPickable = false;
    ring.checkCollisions = false;

    const iconNode = new TransformNode(`pingIcon_${index}`, this.scene);
    iconNode.parent = root;
    iconNode.position.y = 1.45;
    iconNode.billboardMode = Mesh.BILLBOARDMODE_ALL;

    const diamondBars: Mesh[] = [];
    const barOffsets = [
      { x: -0.14, y: 0.14, rot: Math.PI * 0.25 },
      { x: 0.14, y: 0.14, rot: -Math.PI * 0.25 },
      { x: -0.14, y: -0.14, rot: -Math.PI * 0.25 },
      { x: 0.14, y: -0.14, rot: Math.PI * 0.25 },
    ];
    for (let b = 0; b < barOffsets.length; b++) {
      const bar = MeshBuilder.CreateBox(
        `pingBar_${index}_${b}`,
        { width: 0.32, height: 0.052, depth: 0.03 },
        this.scene
      );
      bar.parent = iconNode;
      bar.position.set(barOffsets[b].x, barOffsets[b].y, 0);
      bar.rotation.z = barOffsets[b].rot;
      bar.material = this.locationOuterMat;
      bar.isPickable = false;
      bar.checkCollisions = false;
      diamondBars.push(bar);
    }

    const coreDiamond = MeshBuilder.CreateDisc(
      `pingCore_${index}`,
      { radius: 0.12, tessellation: 4 },
      this.scene
    );
    coreDiamond.parent = iconNode;
    coreDiamond.rotation.z = Math.PI * 0.25;
    coreDiamond.material = this.locationCoreMat;
    coreDiamond.isPickable = false;
    coreDiamond.checkCollisions = false;

    const enemyChevrons: Mesh[] = [];
    const chevOffsets = [
      { x: -0.12, y: 0.42, rot: Math.PI * 0.22 },
      { x: 0.12, y: 0.42, rot: -Math.PI * 0.22 },
    ];
    for (let c = 0; c < chevOffsets.length; c++) {
      const chev = MeshBuilder.CreateBox(
        `pingChev_${index}_${c}`,
        { width: 0.28, height: 0.058, depth: 0.03 },
        this.scene
      );
      chev.parent = iconNode;
      chev.position.set(chevOffsets[c].x, chevOffsets[c].y, 0);
      chev.rotation.z = chevOffsets[c].rot;
      chev.material = this.enemyOuterMat;
      chev.isPickable = false;
      chev.checkCollisions = false;
      chev.setEnabled(false);
      enemyChevrons.push(chev);
    }

    return {
      activePingId: null,
      root,
      iconNode,
      beam,
      ring,
      diamondBars,
      coreDiamond,
      enemyChevrons,
    };
  }

  public setLocalTeam(team: TeamId): void {
    if (this.localTeam === team) return;
    this.localTeam = team;
    this.activePings = this.activePings.filter((p) => p.team === team);
    this.syncVisualSlots();
  }

  public upsertPing(req: PingPlacementRequest): ActivePingRecord | null {
    if (req.team !== this.localTeam) {
      return null;
    }

    const defaultDur =
      req.kind === 'enemy' ? DEFAULT_ENEMY_DURATION_SEC : DEFAULT_LOCATION_DURATION_SEC;
    const totalSec = Math.max(1.5, Math.min(15, req.durationSec ?? defaultDur));

    const existingIdx = this.activePings.findIndex((p) => p.id === req.id);
    if (existingIdx >= 0) {
      const existing = this.activePings[existingIdx];
      existing.kind = req.kind;
      existing.x = req.x;
      existing.y = req.y;
      existing.z = req.z;
      existing.targetId = req.targetId;
      existing.totalSec = totalSec;
      existing.remainingSec = totalSec;
      existing.ageSec = 0;
      existing.targetLost = false;
      this.syncVisualSlots();
      return existing;
    }

    // Enforce per-sender cap
    const senderPings = this.activePings.filter((p) => p.senderId === req.senderId);
    if (senderPings.length >= MAX_PINGS_PER_SENDER) {
      const oldestSenderPing = senderPings[0];
      const removeIdx = this.activePings.indexOf(oldestSenderPing);
      if (removeIdx >= 0) {
        this.activePings.splice(removeIdx, 1);
      }
    }

    // Enforce global pool cap
    if (this.activePings.length >= MAX_PING_SLOTS) {
      this.activePings.shift();
    }

    const record: ActivePingRecord = {
      id: req.id,
      senderId: req.senderId,
      senderName: req.senderName,
      team: req.team,
      kind: req.kind,
      x: req.x,
      y: req.y,
      z: req.z,
      targetId: req.targetId,
      ageSec: 0,
      totalSec,
      remainingSec: totalSec,
      targetLost: false,
    };

    this.activePings.push(record);
    this.syncVisualSlots();
    return record;
  }

  public getActivePings(): readonly ActivePingRecord[] {
    return this.activePings;
  }

  public update(
    dt: number,
    camera: Camera,
    resolveTargetPos?: (targetId: string) => PingTargetLookupResult | null
  ): void {
    const clampedDt = Math.min(Math.max(dt, 0), 0.1);

    for (let i = this.activePings.length - 1; i >= 0; i--) {
      const p = this.activePings[i];
      p.ageSec += clampedDt;
      p.remainingSec -= clampedDt;

      if (p.kind === 'enemy' && p.targetId && resolveTargetPos && !p.targetLost) {
        const target = resolveTargetPos(p.targetId);
        if (target && target.isAlive) {
          p.x = target.x;
          p.y = target.y;
          p.z = target.z;
        } else {
          // Target died or disconnected — hold last known briefly then clear
          p.targetLost = true;
          p.remainingSec = Math.min(p.remainingSec, 1.0);
        }
      }

      if (p.remainingSec <= 0) {
        this.activePings.splice(i, 1);
      }
    }

    this.syncVisualSlots();

    const camPos = camera.globalPosition;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot.activePingId) continue;
      const p = this.activePings.find((item) => item.id === slot.activePingId);
      if (!p) {
        slot.activePingId = null;
        slot.root.setEnabled(false);
        continue;
      }

      const isEnemy = p.kind === 'enemy';
      slot.root.position.set(p.x, p.y, p.z);

      const dist = Vector3.Distance(camPos, slot.root.position);
      const distScale = Math.max(0.75, Math.min(3.1, dist * 0.048));
      const popIn = Math.min(1, p.ageSec / 0.14);
      const popScale = 0.65 + 0.35 * popIn + (p.ageSec < 0.25 ? Math.sin(p.ageSec * 18) * 0.12 : 0);
      const bobOffset = Math.sin(p.ageSec * 5.0) * 0.08;

      const baseIconHeight = isEnemy ? 2.15 : 1.25;
      slot.iconNode.position.y = baseIconHeight + bobOffset;
      slot.iconNode.scaling.setAll(distScale * popScale);

      const ringPulse = 0.78 + ((p.ageSec * 1.45) % 1) * 0.72;
      slot.ring.scaling.set(ringPulse, 1, ringPulse);

      slot.beam.scaling.y = isEnemy ? 1.35 : 0.9;
      slot.beam.position.y = isEnemy ? 0.95 : 0.65;
    }
  }

  public getHudMarkers(
    camera: Camera,
    viewportWidth: number,
    viewportHeight: number
  ): PingHudMarker[] {
    if (this.activePings.length === 0 || viewportWidth <= 0 || viewportHeight <= 0) {
      return [];
    }

    const transformMatrix = this.scene.getTransformMatrix();
    this.viewportScratch.x = 0;
    this.viewportScratch.y = 0;
    this.viewportScratch.width = 1;
    this.viewportScratch.height = 1;
    const globalViewport = this.viewportScratch.toGlobal(viewportWidth, viewportHeight);

    const camPos = camera.globalPosition;
    camera.getDirectionToRef(Vector3.Forward(), this.forwardScratch);

    return this.activePings.map((p) => {
      const iconYOffset = p.kind === 'enemy' ? 2.15 : 1.25;
      this.worldScratch.set(p.x, p.y, p.z);
      this.iconWorldScratch.set(p.x, p.y + iconYOffset, p.z);

      const distanceMeters = Math.max(1, Math.round(Vector3.Distance(camPos, this.worldScratch)));

      this.toTargetScratch.copyFrom(this.iconWorldScratch).subtractInPlace(camPos);
      const inFront = Vector3.Dot(this.toTargetScratch, this.forwardScratch) > 0.05;

      const projected = Vector3.Project(
        this.iconWorldScratch,
        this.identityMatrix,
        transformMatrix,
        globalViewport
      );

      let pctX = (projected.x / viewportWidth) * 100;
      let pctY = (projected.y / viewportHeight) * 100;

      if (!inFront) {
        pctX = 100 - pctX;
        pctY = 100 - pctY;
        // Push behind-camera markers toward perimeter
        const dx = pctX - 50;
        const dy = pctY - 50;
        const mag = Math.hypot(dx, dy) || 1;
        pctX = 50 + (dx / mag) * 48;
        pctY = 50 + (dy / mag) * 48;
      }

      const onScreen =
        inFront && pctX >= 4 && pctX <= 96 && pctY >= 5 && pctY <= 95;

      const clampedX = Math.max(5, Math.min(95, pctX));
      const clampedY = Math.max(7, Math.min(92, pctY));

      return {
        id: p.id,
        senderId: p.senderId,
        senderName: p.senderName,
        team: p.team,
        kind: p.kind,
        x: p.x,
        y: p.y,
        z: p.z,
        distanceMeters,
        remainingSec: Math.max(0, Math.round(p.remainingSec * 10) / 10),
        totalSec: p.totalSec,
        screenXPct: Math.round(clampedX * 10) / 10,
        screenYPct: Math.round(clampedY * 10) / 10,
        onScreen,
        targetId: p.targetId,
      };
    });
  }

  public clear(): void {
    this.activePings = [];
    for (const slot of this.slots) {
      slot.activePingId = null;
      slot.root.setEnabled(false);
    }
  }

  public dispose(): void {
    this.clear();
    for (const slot of this.slots) {
      slot.root.dispose();
    }
    this.slots = [];
    this.poolRoot.dispose();
    for (const mat of this.materials) {
      mat.dispose();
    }
    this.materials = [];
  }

  private syncVisualSlots(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const ping = this.activePings[i];
      if (!ping) {
        slot.activePingId = null;
        slot.root.setEnabled(false);
        continue;
      }

      slot.activePingId = ping.id;
      slot.root.setEnabled(true);
      slot.root.position.set(ping.x, ping.y, ping.z);

      const isEnemy = ping.kind === 'enemy';
      const outerMat = isEnemy ? this.enemyOuterMat : this.locationOuterMat;
      const coreMat = isEnemy ? this.enemyCoreMat : this.locationCoreMat;
      const beamMat = isEnemy ? this.enemyBeamMat : this.locationBeamMat;

      slot.beam.material = beamMat;
      slot.ring.material = outerMat;
      slot.coreDiamond.material = coreMat;
      for (const bar of slot.diamondBars) {
        bar.material = outerMat;
      }
      for (const chev of slot.enemyChevrons) {
        chev.setEnabled(isEnemy);
      }
    }
  }
}
