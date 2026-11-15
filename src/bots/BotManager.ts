import {
  Color3,
  Material,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Ray,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { HitZone, MatchParticipant } from '../game/types';
import { MapDefinition, TeamId } from '../maps/types';
import { MatchManager, RESPAWN_DELAY_SEC } from '../match/MatchManager';

export interface BotDamageResult {
  botId: string;
  botName: string;
  team: TeamId;
  zone: HitZone;
  damageApplied: number;
  killed: boolean;
  distanceMeters: number;
}

export interface BotManagerCallbacks {
  getPlayerTarget: () => {
    id: string;
    isAlive: boolean;
    position: Vector3;
    eyePosition: Vector3;
    collider: Mesh;
  };
  onPlayerDamaged: (
    damage: number,
    attackerId: string,
    attackerName: string,
    weaponName: string,
    headshot: boolean,
    distanceMeters: number,
    attackerPos: Vector3,
    attackerHpRemaining: number
  ) => void;
}

interface BotAgent {
  id: string;
  name: string;
  team: TeamId;
  weaponName: string;
  root: TransformNode;
  pivot: TransformNode;
  upperBodyPivot: TransformNode;
  legLPivot: TransformNode;
  legRPivot: TransformNode;
  headMesh: Mesh;
  bodyMesh: Mesh;
  muzzlePoint: TransformNode;
  muzzleFlash: Mesh;
  muzzleFlashTimer: number;
  hp: number;
  maxHp: number;
  isAlive: boolean;
  respawnTimer: number;
  spawnProtection: number;
  yaw: number;
  aimPitch: number;
  walkPhase: number;
  prevPos: Vector3;
  deathRollDir: number;
  currentWaypoint: Vector3;
  strafeDir: number;
  strafeSwitchTimer: number;
  losScanTimer: number;
  targetEnemyId: string | null;
  targetEnemyPos: Vector3 | null;
  reactionTimer: number;
  burstShotsLeft: number;
  fireCooldown: number;
  burstPauseTimer: number;
  hitFlashTimer: number;
  bodyMat: PBRMaterial;
  headMat: PBRMaterial;
}

interface BotTracer {
  mesh: Mesh;
  life: number;
  maxLife: number;
}

const BOT_MOVE_SPEED = 4.9;
const BOT_STRAFE_SPEED = 3.2;
const BOT_DETECT_RANGE = 42;
const BOT_WEAPON_DAMAGE = 16;

export class BotManager {
  private scene: Scene;
  private match: MatchManager;
  private callbacks: BotManagerCallbacks;

  private mapDef: MapDefinition | null = null;
  private bots: BotAgent[] = [];
  private tracers: BotTracer[] = [];
  private sharedMaterials: Material[] = [];
  private blueTracerMat!: StandardMaterial;
  private redTracerMat!: StandardMaterial;

  constructor(scene: Scene, match: MatchManager, callbacks: BotManagerCallbacks) {
    this.scene = scene;
    this.match = match;
    this.callbacks = callbacks;
  }

  public spawnBotsForMatch(
    mapDef: MapDefinition,
    blueBots: MatchParticipant[],
    redBots: MatchParticipant[]
  ): void {
    this.clearBots();
    this.mapDef = mapDef;
    this.ensureSharedTracerMaterials();

    const blueWeaponNames = ['M4A1 Tactical', 'MP5-SD'];
    const redWeaponNames = ['AK-74u', 'M4A1 Tactical'];

    blueBots.forEach((p, idx) => {
      const spawn = mapDef.blueSpawns[idx % mapDef.blueSpawns.length] ?? new Vector3(-16, 1, -20);
      this.createBotAgent(
        p.id,
        p.name,
        'blue',
        blueWeaponNames[idx % blueWeaponNames.length],
        spawn,
        0
      );
    });

    redBots.forEach((p, idx) => {
      const spawn = mapDef.redSpawns[idx % mapDef.redSpawns.length] ?? new Vector3(16, 1, 20);
      this.createBotAgent(
        p.id,
        p.name,
        'red',
        redWeaponNames[idx % redWeaponNames.length],
        spawn,
        Math.PI
      );
    });
  }

  private ensureSharedTracerMaterials(): void {
    if (!this.blueTracerMat || this.blueTracerMat.getScene() !== this.scene) {
      this.blueTracerMat = new StandardMaterial('botTracerBlue', this.scene);
      this.blueTracerMat.disableLighting = true;
      this.blueTracerMat.emissiveColor = new Color3(0.45, 1.0, 1.85);
      this.sharedMaterials.push(this.blueTracerMat);
    }
    if (!this.redTracerMat || this.redTracerMat.getScene() !== this.scene) {
      this.redTracerMat = new StandardMaterial('botTracerRed', this.scene);
      this.redTracerMat.disableLighting = true;
      this.redTracerMat.emissiveColor = new Color3(1.9, 0.65, 0.35);
      this.sharedMaterials.push(this.redTracerMat);
    }
  }

  public clearBots(): void {
    for (const t of this.tracers) {
      t.mesh.dispose();
    }
    this.tracers = [];

    for (const bot of this.bots) {
      bot.bodyMat.dispose();
      bot.headMat.dispose();
      bot.root.dispose();
    }
    this.bots = [];

    for (const m of this.sharedMaterials) {
      m.dispose();
    }
    this.sharedMaterials = [];
  }

  public getRadarActors(): { id: string; x: number; z: number; team: TeamId; isAlive: boolean }[] {
    return this.bots.map((b) => ({
      id: b.id,
      x: b.root.position.x,
      z: b.root.position.z,
      team: b.team,
      isAlive: b.isAlive,
    }));
  }

  public applyAirstrikeDamage(
    impactPos: Vector3,
    radius: number,
    maxDamage: number,
    onKill: (info: { victimId: string; victimName: string; distanceMeters: number }) => void
  ): number {
    let hits = 0;
    for (const bot of this.bots) {
      if (!bot.isAlive || bot.team !== 'red') continue;
      const dist = Vector3.Distance(
        new Vector3(bot.root.position.x, impactPos.y, bot.root.position.z),
        impactPos
      );
      if (dist > radius) continue;

      const falloff = 1 - (dist / radius) * 0.55;
      const dmg = Math.max(25, Math.round(maxDamage * falloff));
      const res = this.applyDamageToBot(
        bot.id,
        'body',
        dmg,
        1.0,
        'player',
        'Precision Barrage',
        Math.round(dist * 10) / 10
      );
      if (res && res.damageApplied > 0) {
        hits += 1;
        if (res.killed) {
          onKill({
            victimId: res.botId,
            victimName: res.botName,
            distanceMeters: res.distanceMeters,
          });
        }
      }
    }
    return hits;
  }

  public getLivingEnemyPositions(forTeam: TeamId): Vector3[] {
    const out: Vector3[] = [];
    for (const bot of this.bots) {
      if (bot.isAlive && bot.team !== forTeam) {
        out.push(bot.root.position.clone());
      }
    }
    if (forTeam === 'red') {
      const p = this.callbacks.getPlayerTarget();
      if (p.isAlive) out.push(p.position.clone());
    }
    return out;
  }

  public pickBestSpawn(team: TeamId): Vector3 {
    if (!this.mapDef) return new Vector3(0, 1, 0);
    const candidates = team === 'blue' ? this.mapDef.blueSpawns : this.mapDef.redSpawns;
    const enemies = this.getLivingEnemyPositions(team);

    if (enemies.length === 0) {
      return candidates[Math.floor(Math.random() * candidates.length)].clone();
    }

    let bestSpawn = candidates[0];
    let bestMinDist = -1;

    for (const spawn of candidates) {
      let minDist = Infinity;
      for (const e of enemies) {
        const d = Vector3.DistanceSquared(spawn, e);
        if (d < minDist) minDist = d;
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestSpawn = spawn;
      }
    }
    return bestSpawn.clone();
  }

  public applyDamageToBot(
    botId: string,
    zone: HitZone,
    baseDamage: number,
    headshotMultiplier: number,
    attackerId: string,
    weaponName: string,
    distanceMeters: number
  ): BotDamageResult | null {
    const bot = this.bots.find((b) => b.id === botId);
    if (!bot || !bot.isAlive) return null;

    if (bot.spawnProtection > 0) {
      return {
        botId: bot.id,
        botName: bot.name,
        team: bot.team,
        zone,
        damageApplied: 0,
        killed: false,
        distanceMeters,
      };
    }

    const damageApplied = Math.round(baseDamage * (zone === 'head' ? headshotMultiplier : 1));
    bot.hp = Math.max(0, bot.hp - damageApplied);
    bot.hitFlashTimer = 0.1;
    bot.bodyMat.emissiveColor = new Color3(0.9, 0.42, 0.18);
    bot.headMat.emissiveColor = new Color3(1.1, 0.35, 0.22);

    let killed = false;
    if (bot.hp <= 0) {
      killed = true;
      bot.isAlive = false;
      bot.respawnTimer = RESPAWN_DELAY_SEC;
      bot.deathRollDir = Math.random() > 0.5 ? 1 : -1;
      bot.headMesh.isPickable = false;
      bot.bodyMesh.isPickable = false;
      this.match.recordKill(attackerId, bot.id, weaponName, zone === 'head', distanceMeters);
    }

    return {
      botId: bot.id,
      botName: bot.name,
      team: bot.team,
      zone,
      damageApplied,
      killed,
      distanceMeters,
    };
  }

  public update(dt: number): void {
    const clampedDt = Math.min(dt, 0.05);
    this.updateTracers(clampedDt);

    if (this.match.getPhase() !== 'playing') return;

    for (const bot of this.bots) {
      if (bot.muzzleFlashTimer > 0) {
        bot.muzzleFlashTimer = Math.max(0, bot.muzzleFlashTimer - clampedDt);
        if (bot.muzzleFlashTimer === 0) {
          bot.muzzleFlash.isVisible = false;
        }
      }

      if (bot.hitFlashTimer > 0) {
        bot.hitFlashTimer = Math.max(0, bot.hitFlashTimer - clampedDt);
        if (bot.hitFlashTimer === 0) {
          this.restoreBotColors(bot);
        }
      }

      if (!bot.isAlive) {
        bot.pivot.rotation.x = Math.min(Math.PI * 0.47, bot.pivot.rotation.x + clampedDt * 8.5);
        bot.pivot.rotation.z = this.lerp(bot.pivot.rotation.z, bot.deathRollDir * 0.26, clampedDt * 8);
        bot.pivot.position.y = Math.max(-0.08, bot.pivot.position.y - clampedDt * 0.6);
        bot.legLPivot.rotation.x = this.lerp(bot.legLPivot.rotation.x, -0.35, clampedDt * 10);
        bot.legRPivot.rotation.x = this.lerp(bot.legRPivot.rotation.x, 0.28, clampedDt * 10);
        bot.respawnTimer -= clampedDt;
        this.match.setParticipantAlive(bot.id, false, Math.max(0, bot.respawnTimer));
        if (bot.respawnTimer <= 0) {
          this.respawnBot(bot);
        }
        continue;
      }

      if (bot.spawnProtection > 0) {
        bot.spawnProtection = Math.max(0, bot.spawnProtection - clampedDt);
      }

      bot.prevPos.copyFrom(bot.root.position);
      this.updateBotAI(bot, clampedDt);
      this.animateBotLocomotion(bot, clampedDt);
    }
  }

  private animateBotLocomotion(bot: BotAgent, dt: number): void {
    const dx = bot.root.position.x - bot.prevPos.x;
    const dz = bot.root.position.z - bot.prevPos.z;
    const moveSpeed = Math.hypot(dx, dz) / Math.max(0.001, dt);

    if (moveSpeed > 0.35) {
      bot.walkPhase += dt * Math.min(14, moveSpeed * 2.15);
      const swing = Math.sin(bot.walkPhase) * Math.min(0.62, moveSpeed * 0.12);
      bot.legLPivot.rotation.x = swing;
      bot.legRPivot.rotation.x = -swing;
      bot.upperBodyPivot.position.y = 0.8 + Math.abs(Math.cos(bot.walkPhase)) * 0.032;
    } else {
      const settle = 1 - Math.exp(-12 * dt);
      bot.legLPivot.rotation.x += (0 - bot.legLPivot.rotation.x) * settle;
      bot.legRPivot.rotation.x += (0 - bot.legRPivot.rotation.x) * settle;
      bot.upperBodyPivot.position.y += (0.8 - bot.upperBodyPivot.position.y) * settle;
    }

    let desiredPitch = 0;
    if (bot.targetEnemyPos) {
      const flatDist = Math.max(
        0.5,
        Math.hypot(bot.targetEnemyPos.x - bot.root.position.x, bot.targetEnemyPos.z - bot.root.position.z)
      );
      const dy = bot.targetEnemyPos.y - (bot.root.position.y + 1.45);
      desiredPitch = Math.max(-0.55, Math.min(0.55, -Math.atan2(dy, flatDist)));
    }
    bot.aimPitch += (desiredPitch - bot.aimPitch) * (1 - Math.exp(-10 * dt));
    bot.upperBodyPivot.rotation.x = bot.aimPitch;
  }

  private updateBotAI(bot: BotAgent, dt: number): void {
    bot.losScanTimer -= dt;
    if (bot.losScanTimer <= 0) {
      bot.losScanTimer = 0.14 + Math.random() * 0.06;
      this.scanForEnemy(bot);
    }

    bot.strafeSwitchTimer -= dt;
    if (bot.strafeSwitchTimer <= 0) {
      bot.strafeSwitchTimer = 0.9 + Math.random() * 1.1;
      bot.strafeDir = Math.random() > 0.5 ? 1 : -1;
    }

    if (bot.targetEnemyId && bot.targetEnemyPos) {
      const toEnemy = bot.targetEnemyPos.subtract(bot.root.position);
      const dist = Math.hypot(toEnemy.x, toEnemy.z);
      const desiredYaw = Math.atan2(toEnemy.x, toEnemy.z);
      bot.yaw = this.lerpAngle(bot.yaw, desiredYaw, 1 - Math.exp(-10 * dt));
      bot.root.rotation.y = bot.yaw;

      const right = new Vector3(Math.cos(bot.yaw), 0, -Math.sin(bot.yaw));
      const forward = new Vector3(Math.sin(bot.yaw), 0, Math.cos(bot.yaw));

      let moveVec = right.scale(bot.strafeDir * BOT_STRAFE_SPEED);
      if (bot.hp < 40 || dist < 6.5) {
        moveVec = moveVec.add(forward.scale(-2.6));
      } else if (dist > 22) {
        moveVec = moveVec.add(forward.scale(2.8));
      }

      this.moveBotWithAvoidance(bot, moveVec, dt);

      if (bot.reactionTimer > 0) {
        bot.reactionTimer -= dt;
      } else if (bot.burstPauseTimer > 0) {
        bot.burstPauseTimer -= dt;
        if (bot.burstPauseTimer <= 0) {
          bot.burstShotsLeft = 3 + Math.floor(Math.random() * 3);
        }
      } else {
        bot.fireCooldown -= dt;
        if (bot.fireCooldown <= 0 && bot.burstShotsLeft > 0) {
          this.fireBotShot(bot, bot.targetEnemyPos);
          bot.burstShotsLeft -= 1;
          bot.fireCooldown = 0.15;
          if (bot.burstShotsLeft <= 0) {
            bot.burstPauseTimer = 0.42 + Math.random() * 0.35;
          }
        }
      }
      return;
    }

    const toWp = bot.currentWaypoint.subtract(bot.root.position);
    const flatDist = Math.hypot(toWp.x, toWp.z);
    if (flatDist < 1.35) {
      bot.currentWaypoint = this.pickRandomWaypoint(bot.root.position);
      return;
    }

    const dirX = toWp.x / flatDist;
    const dirZ = toWp.z / flatDist;
    const desiredYaw = Math.atan2(dirX, dirZ);
    bot.yaw = this.lerpAngle(bot.yaw, desiredYaw, 1 - Math.exp(-7 * dt));
    bot.root.rotation.y = bot.yaw;

    const moveVec = new Vector3(dirX * BOT_MOVE_SPEED, 0, dirZ * BOT_MOVE_SPEED);
    const moved = this.moveBotWithAvoidance(bot, moveVec, dt);
    if (!moved) {
      bot.currentWaypoint = this.pickRandomWaypoint(bot.root.position);
    }
  }

  private moveBotWithAvoidance(bot: BotAgent, desiredVel: Vector3, dt: number): boolean {
    const speed = Math.hypot(desiredVel.x, desiredVel.z);
    if (speed < 0.05) return true;

    const dir = new Vector3(desiredVel.x / speed, 0, desiredVel.z / speed);
    const probeOrigin = new Vector3(bot.root.position.x, bot.root.position.y + 0.85, bot.root.position.z);

    let moveDir = dir.clone();
    if (this.isObstacleAhead(probeOrigin, moveDir, 1.25)) {
      const leftDir = new Vector3(-dir.z, 0, dir.x);
      const rightDir = new Vector3(dir.z, 0, -dir.x);
      if (!this.isObstacleAhead(probeOrigin, leftDir, 1.35)) {
        moveDir = leftDir;
      } else if (!this.isObstacleAhead(probeOrigin, rightDir, 1.35)) {
        moveDir = rightDir;
      } else {
        return false;
      }
    }

    const nextX = Math.max(-27.2, Math.min(27.2, bot.root.position.x + moveDir.x * speed * dt));
    const nextZ = Math.max(-27.2, Math.min(27.2, bot.root.position.z + moveDir.z * speed * dt));

    const groundY = this.sampleGroundY(nextX, bot.root.position.y + 1.35, nextZ);
    if (groundY !== null && groundY - bot.root.position.y <= 0.9) {
      bot.root.position.y += (groundY - bot.root.position.y) * Math.min(1, dt * 14);
    }
    bot.root.position.x = nextX;
    bot.root.position.z = nextZ;
    return true;
  }

  private isObstacleAhead(origin: Vector3, dir: Vector3, dist: number): boolean {
    const ray = new Ray(origin, dir, dist);
    const hit = this.scene.pickWithRay(
      ray,
      (mesh) => mesh.checkCollisions && mesh.isEnabled() && !mesh.metadata?.isBot
    );
    return Boolean(hit?.hit);
  }

  private sampleGroundY(x: number, fromY: number, z: number): number | null {
    const ray = new Ray(new Vector3(x, fromY, z), new Vector3(0, -1, 0), 3.0);
    const hit = this.scene.pickWithRay(
      ray,
      (mesh) => mesh.checkCollisions && mesh.isEnabled() && !mesh.metadata?.isBot
    );
    return hit?.hit && hit.pickedPoint ? hit.pickedPoint.y : null;
  }

  private scanForEnemy(bot: BotAgent): void {
    const eyeOrigin = new Vector3(bot.root.position.x, bot.root.position.y + 1.55, bot.root.position.z);
    let closestId: string | null = null;
    let closestPos: Vector3 | null = null;
    let closestDist = BOT_DETECT_RANGE;

    for (const other of this.bots) {
      if (!other.isAlive || other.team === bot.team) continue;
      const targetCenter = new Vector3(
        other.root.position.x,
        other.root.position.y + 1.25,
        other.root.position.z
      );
      const dist = Vector3.Distance(eyeOrigin, targetCenter);
      if (dist < closestDist && this.hasLineOfSight(eyeOrigin, targetCenter, dist)) {
        closestDist = dist;
        closestId = other.id;
        closestPos = targetCenter;
      }
    }

    if (bot.team === 'red') {
      const player = this.callbacks.getPlayerTarget();
      if (player.isAlive) {
        const playerChest = player.eyePosition.add(new Vector3(0, -0.25, 0));
        const dist = Vector3.Distance(eyeOrigin, playerChest);
        if (dist < closestDist && this.hasLineOfSight(eyeOrigin, playerChest, dist)) {
          closestId = player.id;
          closestPos = playerChest;
        }
      }
    }

    if (closestId && closestId !== bot.targetEnemyId) {
      bot.reactionTimer = 0.28;
      bot.burstShotsLeft = 3 + Math.floor(Math.random() * 3);
      bot.burstPauseTimer = 0;
    }

    bot.targetEnemyId = closestId;
    bot.targetEnemyPos = closestPos;
  }

  private hasLineOfSight(from: Vector3, to: Vector3, dist: number): boolean {
    const dir = to.subtract(from).normalize();
    const ray = new Ray(from, dir, Math.max(0.1, dist - 0.35));
    const hit = this.scene.pickWithRay(
      ray,
      (mesh) => mesh.checkCollisions && mesh.isEnabled() && !mesh.metadata?.isBot
    );
    return !hit?.hit;
  }

  private fireBotShot(bot: BotAgent, targetPos: Vector3): void {
    const eyeOrigin = new Vector3(bot.root.position.x, bot.root.position.y + 1.48, bot.root.position.z);
    const toTarget = targetPos.subtract(eyeOrigin).normalize();

    const spread = 0.055;
    const dir = new Vector3(
      toTarget.x + (Math.random() - 0.5) * spread,
      toTarget.y + (Math.random() - 0.5) * spread * 0.75,
      toTarget.z + (Math.random() - 0.5) * spread
    ).normalize();

    const player = this.callbacks.getPlayerTarget();
    const ray = new Ray(eyeOrigin, dir, 90);

    const prevPickable = player.collider.isPickable;
    player.collider.isPickable = player.isAlive && bot.team === 'red';

    let pick;
    try {
      pick = this.scene.pickWithRay(ray, (mesh) => {
        if (!mesh.isPickable || !mesh.isEnabled()) return false;
        const meta = mesh.metadata as { isBot?: boolean; botId?: string; team?: TeamId } | undefined;
        if (meta?.isBot) {
          return meta.botId !== bot.id && meta.team !== bot.team;
        }
        return true;
      });
    } finally {
      player.collider.isPickable = prevPickable;
    }

    bot.muzzleFlash.isVisible = true;
    bot.muzzleFlashTimer = 0.04;

    const muzzleWorld = bot.muzzlePoint.getAbsolutePosition();
    const endPoint =
      pick?.hit && pick.pickedPoint ? pick.pickedPoint.clone() : eyeOrigin.add(dir.scale(70));
    this.spawnBotTracer(muzzleWorld, endPoint, bot.team);

    if (!pick?.hit || !pick.pickedMesh) return;

    const dist = Math.round(pick.distance * 10) / 10;

    if (pick.pickedMesh === player.collider && bot.team === 'red' && player.isAlive) {
      const headshot = Math.random() < 0.14;
      const dmg = headshot ? Math.round(BOT_WEAPON_DAMAGE * 1.6) : BOT_WEAPON_DAMAGE;
      this.callbacks.onPlayerDamaged(
        dmg,
        bot.id,
        bot.name,
        bot.weaponName,
        headshot,
        dist,
        bot.root.position.clone(),
        bot.hp
      );
      return;
    }

    const meta = pick.pickedMesh.metadata as
      | { isBot?: boolean; botId?: string; zone?: HitZone }
      | undefined;
    if (meta?.isBot && meta.botId && meta.zone) {
      this.applyDamageToBot(
        meta.botId,
        meta.zone,
        BOT_WEAPON_DAMAGE,
        1.75,
        bot.id,
        bot.weaponName,
        dist
      );
    }
  }

  private spawnBotTracer(start: Vector3, end: Vector3, team: TeamId): void {
    this.ensureSharedTracerMaterials();
    const delta = end.subtract(start);
    const fullDist = delta.length();
    if (fullDist < 0.3) return;
    const beamLen = Math.min(fullDist, 24);
    const dir = delta.scale(1 / fullDist);
    const mid = start.add(dir.scale(beamLen * 0.5));

    const beam = MeshBuilder.CreateBox(
      'botTracer',
      { width: 0.018, height: 0.018, depth: beamLen },
      this.scene
    );
    beam.position.copyFrom(mid);
    beam.lookAt(end);
    beam.material = team === 'blue' ? this.blueTracerMat : this.redTracerMat;
    beam.isPickable = false;
    beam.checkCollisions = false;
    this.tracers.push({ mesh: beam, life: 0.055, maxLife: 0.055 });
  }

  private updateTracers(dt: number): void {
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
  }

  private respawnBot(bot: BotAgent): void {
    const spawn = this.pickBestSpawn(bot.team);
    const groundY = this.sampleGroundY(spawn.x, spawn.y + 1.0, spawn.z) ?? 0;
    bot.root.position.set(spawn.x, groundY, spawn.z);
    bot.prevPos.copyFrom(bot.root.position);
    bot.pivot.rotation.set(0, 0, 0);
    bot.pivot.position.set(0, 0, 0);
    bot.legLPivot.rotation.x = 0;
    bot.legRPivot.rotation.x = 0;
    bot.upperBodyPivot.rotation.x = 0;
    bot.aimPitch = 0;
    bot.hp = bot.maxHp;
    bot.isAlive = true;
    bot.respawnTimer = 0;
    bot.spawnProtection = 1.25;
    bot.headMesh.isPickable = true;
    bot.bodyMesh.isPickable = true;
    bot.targetEnemyId = null;
    bot.targetEnemyPos = null;
    bot.currentWaypoint = this.pickRandomWaypoint(bot.root.position);
    this.restoreBotColors(bot);
    this.match.setParticipantAlive(bot.id, true, 0);
  }

  private pickRandomWaypoint(nearPos: Vector3): Vector3 {
    const wps = this.mapDef?.waypoints ?? [new Vector3(0, 0.2, 0)];
    if (wps.length === 1) return wps[0].clone();

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = wps[Math.floor(Math.random() * wps.length)];
      if (Vector3.DistanceSquared(candidate, nearPos) > 9) {
        return candidate.clone();
      }
    }
    return wps[Math.floor(Math.random() * wps.length)].clone();
  }

  private restoreBotColors(bot: BotAgent): void {
    bot.bodyMat.emissiveColor =
      bot.team === 'blue' ? new Color3(0.02, 0.06, 0.14) : new Color3(0.14, 0.03, 0.03);
    bot.headMat.emissiveColor =
      bot.team === 'blue' ? new Color3(0.04, 0.1, 0.24) : new Color3(0.22, 0.05, 0.04);
  }

  private lerp(a: number, b: number, dtFactor: number): number {
    return a + (b - a) * Math.min(1, dtFactor);
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  private createBotAgent(
    id: string,
    name: string,
    team: TeamId,
    weaponName: string,
    spawnPos: Vector3,
    yaw: number
  ): void {
    const root = new TransformNode(`bot_root_${id}`, this.scene);
    const groundY = this.sampleGroundY(spawnPos.x, spawnPos.y + 1.0, spawnPos.z) ?? 0;
    root.position.set(spawnPos.x, groundY, spawnPos.z);
    root.rotation.y = yaw;

    const pivot = new TransformNode(`bot_pivot_${id}`, this.scene);
    pivot.parent = root;

    const bodyMat = new PBRMaterial(`botBody_${id}`, this.scene);
    bodyMat.albedoColor = Color3.FromHexString(team === 'blue' ? '#1e40af' : '#991b1b');
    bodyMat.metallic = 0.18;
    bodyMat.roughness = 0.65;

    const headMat = new PBRMaterial(`botHead_${id}`, this.scene);
    headMat.albedoColor = Color3.FromHexString(team === 'blue' ? '#3b82f6' : '#dc2626');
    headMat.metallic = 0.28;
    headMat.roughness = 0.45;

    const gearMat = new PBRMaterial(`botGear_${id}`, this.scene);
    gearMat.albedoColor = Color3.FromHexString('#1e222a');
    gearMat.metallic = 0.22;
    gearMat.roughness = 0.72;

    const gunMat = new PBRMaterial(`botGun_${id}`, this.scene);
    gunMat.albedoColor = Color3.FromHexString('#2b313c');
    gunMat.metallic = 0.85;
    gunMat.roughness = 0.34;

    const visorMat = new StandardMaterial(`botVisor_${id}`, this.scene);
    visorMat.disableLighting = true;
    visorMat.emissiveColor =
      team === 'blue' ? new Color3(0.4, 1.1, 1.8) : new Color3(1.6, 0.55, 0.25);

    const shoulderBeaconMat = new StandardMaterial(`botBeacon_${id}`, this.scene);
    shoulderBeaconMat.disableLighting = true;
    shoulderBeaconMat.emissiveColor =
      team === 'blue' ? new Color3(0.25, 0.85, 1.85) : new Color3(1.85, 0.25, 0.3);

    const flashMat = new StandardMaterial(`botFlash_${id}`, this.scene);
    flashMat.disableLighting = true;
    flashMat.emissiveColor = new Color3(1.6, 1.15, 0.45);

    this.sharedMaterials.push(gearMat, gunMat, visorMat, shoulderBeaconMat, flashMat);

    // Hip-pivoted articulated legs + boots
    const legLPivot = new TransformNode(`bot_legLPivot_${id}`, this.scene);
    legLPivot.parent = pivot;
    legLPivot.position.set(-0.14, 0.78, 0);

    const legL = MeshBuilder.CreateBox(`bot_legL_${id}`, { width: 0.19, height: 0.66, depth: 0.21 }, this.scene);
    legL.position.set(0, -0.33, 0);
    legL.parent = legLPivot;
    legL.material = gearMat;
    legL.isPickable = false;

    const bootL = MeshBuilder.CreateBox(`bot_bootL_${id}`, { width: 0.2, height: 0.14, depth: 0.28 }, this.scene);
    bootL.position.set(0, -0.71, 0.03);
    bootL.parent = legLPivot;
    bootL.material = gunMat;
    bootL.isPickable = false;

    const legRPivot = new TransformNode(`bot_legRPivot_${id}`, this.scene);
    legRPivot.parent = pivot;
    legRPivot.position.set(0.14, 0.78, 0);

    const legR = MeshBuilder.CreateBox(`bot_legR_${id}`, { width: 0.19, height: 0.66, depth: 0.21 }, this.scene);
    legR.position.set(0, -0.33, 0);
    legR.parent = legRPivot;
    legR.material = gearMat;
    legR.isPickable = false;

    const bootR = MeshBuilder.CreateBox(`bot_bootR_${id}`, { width: 0.2, height: 0.14, depth: 0.28 }, this.scene);
    bootR.position.set(0, -0.71, 0.03);
    bootR.parent = legRPivot;
    bootR.material = gunMat;
    bootR.isPickable = false;

    // Upper body pivot (tilts with aim pitch)
    const upperBodyPivot = new TransformNode(`bot_upper_${id}`, this.scene);
    upperBodyPivot.parent = pivot;
    upperBodyPivot.position.set(0, 0.8, 0);

    // Armored Torso Hitbox (remains pickable with exact metadata)
    const bodyMesh = MeshBuilder.CreateBox(`bot_body_${id}`, { width: 0.54, height: 0.72, depth: 0.3 }, this.scene);
    bodyMesh.position.set(0, 0.36, 0);
    bodyMesh.parent = upperBodyPivot;
    bodyMesh.material = bodyMat;
    bodyMesh.isPickable = true;
    bodyMesh.metadata = {
      isBot: true,
      botId: id,
      team,
      zone: 'body' as HitZone,
    };

    // Tactical chest plate & backpack rig (cosmetic)
    const vest = MeshBuilder.CreateBox(`bot_vest_${id}`, { width: 0.48, height: 0.44, depth: 0.34 }, this.scene);
    vest.position.set(0, 0.41, 0);
    vest.parent = upperBodyPivot;
    vest.material = gearMat;
    vest.isPickable = false;

    // Shoulder pads + Glowing Team Shoulder Beacons
    for (const side of [-1, 1]) {
      const pad = MeshBuilder.CreateBox(`bot_pad_${id}_${side}`, { width: 0.14, height: 0.18, depth: 0.24 }, this.scene);
      pad.position.set(side * 0.33, 0.62, 0);
      pad.parent = upperBodyPivot;
      pad.material = bodyMat;
      pad.isPickable = false;

      const beacon = MeshBuilder.CreateBox(`bot_beacon_${id}_${side}`, { width: 0.05, height: 0.07, depth: 0.16 }, this.scene);
      beacon.position.set(side * 0.39, 0.65, 0);
      beacon.parent = upperBodyPivot;
      beacon.material = shoulderBeaconMat;
      beacon.isPickable = false;
    }

    // Head Hitbox (remains pickable with exact metadata)
    const headMesh = MeshBuilder.CreateBox(`bot_head_${id}`, { width: 0.3, height: 0.3, depth: 0.3 }, this.scene);
    headMesh.position.set(0, 0.9, 0);
    headMesh.parent = upperBodyPivot;
    headMesh.material = headMat;
    headMesh.isPickable = true;
    headMesh.metadata = {
      isBot: true,
      botId: id,
      team,
      zone: 'head' as HitZone,
    };

    // Ballistic Helmet Dome + Glowing Visor
    const helmet = MeshBuilder.CreateBox(`bot_helmet_${id}`, { width: 0.34, height: 0.16, depth: 0.35 }, this.scene);
    helmet.position.set(0, 0.99, -0.01);
    helmet.parent = upperBodyPivot;
    helmet.material = gearMat;
    helmet.isPickable = false;

    const visor = MeshBuilder.CreateBox(`bot_visor_${id}`, { width: 0.25, height: 0.075, depth: 0.05 }, this.scene);
    visor.position.set(0, 0.92, 0.155);
    visor.parent = upperBodyPivot;
    visor.material = visorMat;
    visor.isPickable = false;

    // Articulated Arms holding rifle
    const armR = MeshBuilder.CreateBox(`bot_armR_${id}`, { width: 0.13, height: 0.13, depth: 0.44 }, this.scene);
    armR.position.set(0.32, 0.5, 0.18);
    armR.rotation.x = 0.22;
    armR.parent = upperBodyPivot;
    armR.material = gearMat;
    armR.isPickable = false;

    const armL = MeshBuilder.CreateBox(`bot_armL_${id}`, { width: 0.13, height: 0.13, depth: 0.48 }, this.scene);
    armL.position.set(-0.08, 0.46, 0.28);
    armL.rotation.y = 0.65;
    armL.rotation.x = 0.16;
    armL.parent = upperBodyPivot;
    armL.material = gearMat;
    armL.isPickable = false;

    // Detailed Held Rifle + Barrel + Magazine + Muzzle Point
    const rifle = MeshBuilder.CreateBox(`bot_rifle_${id}`, { width: 0.075, height: 0.11, depth: 0.62 }, this.scene);
    rifle.position.set(0.24, 0.48, 0.38);
    rifle.parent = upperBodyPivot;
    rifle.material = gunMat;
    rifle.isPickable = false;

    const barrel = MeshBuilder.CreateCylinder(`bot_barrel_${id}`, { height: 0.28, diameter: 0.032, tessellation: 8 }, this.scene);
    barrel.rotation.x = Math.PI * 0.5;
    barrel.position.set(0.24, 0.5, 0.78);
    barrel.parent = upperBodyPivot;
    barrel.material = gunMat;
    barrel.isPickable = false;

    const mag = MeshBuilder.CreateBox(`bot_mag_${id}`, { width: 0.04, height: 0.14, depth: 0.08 }, this.scene);
    mag.position.set(0.24, 0.37, 0.45);
    mag.rotation.x = 0.18;
    mag.parent = upperBodyPivot;
    mag.material = gearMat;
    mag.isPickable = false;

    const muzzlePoint = new TransformNode(`bot_muzzle_${id}`, this.scene);
    muzzlePoint.parent = upperBodyPivot;
    muzzlePoint.position.set(0.24, 0.5, 0.94);

    const muzzleFlash = MeshBuilder.CreatePolyhedron(`bot_flash_${id}`, { type: 1, size: 0.08 }, this.scene);
    muzzleFlash.parent = muzzlePoint;
    muzzleFlash.material = flashMat;
    muzzleFlash.isPickable = false;
    muzzleFlash.isVisible = false;

    const bot: BotAgent = {
      id,
      name,
      team,
      weaponName,
      root,
      pivot,
      upperBodyPivot,
      legLPivot,
      legRPivot,
      headMesh,
      bodyMesh,
      muzzlePoint,
      muzzleFlash,
      muzzleFlashTimer: 0,
      hp: 100,
      maxHp: 100,
      isAlive: true,
      respawnTimer: 0,
      spawnProtection: 1.0,
      yaw,
      aimPitch: 0,
      walkPhase: 0,
      prevPos: root.position.clone(),
      deathRollDir: 1,
      currentWaypoint: this.pickRandomWaypoint(root.position),
      strafeDir: Math.random() > 0.5 ? 1 : -1,
      strafeSwitchTimer: 1.0,
      losScanTimer: Math.random() * 0.14,
      targetEnemyId: null,
      targetEnemyPos: null,
      reactionTimer: 0.3,
      burstShotsLeft: 4,
      fireCooldown: 0,
      burstPauseTimer: 0,
      hitFlashTimer: 0,
      bodyMat,
      headMat,
    };

    this.restoreBotColors(bot);
    this.bots.push(bot);
  }

  public dispose(): void {
    this.clearBots();
  }
}
