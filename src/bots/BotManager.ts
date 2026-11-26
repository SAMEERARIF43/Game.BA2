import {
  AbstractMesh,
  Color3,
  Constants,
  Material,
  Mesh,
  PBRMaterial,
  Ray,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import {
  OperatorPalette,
  buildOperatorRig,
  createOperatorPalette,
  updateOperatorPaletteTeamColor,
} from '../game/OperatorMeshBuilder';
import { PooledTracerRingBuffer, getVfxQualityBudget } from '../game/combatVfx';
import { GameMode, isHostile } from '../game/gameModeRules';
import { getCharacterForWeaponId } from '../game/loadoutRules';
import { CharacterId, GraphicsQuality, HitZone, MatchParticipant, WeaponId } from '../game/types';
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
  onKillRecorded?: (info: {
    killerId: string;
    victimId: string;
    weaponName: string;
    headshot: boolean;
    distanceMeters: number;
    victimPos: { x: number; y: number; z: number };
    victimYaw: number;
  }) => void;
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
  movementScratch: Vector3;
  directionScratch: Vector3;
  moveDirectionScratch: Vector3;
  forwardScratch: Vector3;
  rightScratch: Vector3;
  leftScratch: Vector3;
  probeOriginScratch: Vector3;
  eyeOriginScratch: Vector3;
  scanTargetScratch: Vector3;
  losDirectionScratch: Vector3;
  shotOriginScratch: Vector3;
  shotDirectionScratch: Vector3;
  shotTargetScratch: Vector3;
  obstacleRay: Ray;
  groundRay: Ray;
  losRay: Ray;
  shotRay: Ray;
  deathRollDir: number;
  currentWaypoint: Vector3;
  strafeDir: number;
  strafeSwitchTimer: number;
  losScanTimer: number;
  lostSightTimer: number;
  stuckTimer: number;
  targetEnemyId: string | null;
  targetEnemyPos: Vector3 | null;
  reactionTimer: number;
  burstShotsLeft: number;
  fireCooldown: number;
  burstPauseTimer: number;
  hitFlashTimer: number;
  blindTimer: number;
  slowTimer: number;
  bodyMat: PBRMaterial;
  headMat: PBRMaterial;
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
  private gameMode: GameMode = 'tdm';
  private bots: BotAgent[] = [];
  private botRays: Ray[] = [];
  private tracerPool: PooledTracerRingBuffer;
  private sharedMaterials: Material[] = [];
  private bluePalette: OperatorPalette | null = null;
  private redPalette: OperatorPalette | null = null;
  private blueTracerMat: StandardMaterial;
  private redTracerMat: StandardMaterial;
  private blueHex = '#38bdf8';
  private redHex = '#ef4444';
  private blueEmissive = new Color3(0.02, 0.06, 0.14);
  private redEmissive = new Color3(0.14, 0.03, 0.03);
  private smokeClouds: Array<{ x: number; y: number; z: number; radius: number }> = [];
  private readonly spawnGroundRay = new Ray(Vector3.Zero(), new Vector3(0, -1, 0), 3);
  private readonly collisionPickPredicate = (mesh: AbstractMesh): boolean =>
    mesh.checkCollisions && mesh.isEnabled() && !mesh.metadata?.isBot;

  constructor(scene: Scene, match: MatchManager, callbacks: BotManagerCallbacks) {
    this.scene = scene;
    this.match = match;
    this.callbacks = callbacks;

    this.tracerPool = new PooledTracerRingBuffer(this.scene, 'botTracerPool', 32);

    this.blueTracerMat = new StandardMaterial('botTracerBlue', this.scene);
    this.blueTracerMat.disableLighting = true;
    this.blueTracerMat.diffuseColor = Color3.Black();
    this.blueTracerMat.emissiveColor = new Color3(0.45, 1.05, 1.9);
    this.blueTracerMat.alpha = 0.94;
    this.blueTracerMat.alphaMode = Constants.ALPHA_ADD;
    this.blueTracerMat.disableDepthWrite = true;

    this.redTracerMat = new StandardMaterial('botTracerRed', this.scene);
    this.redTracerMat.disableLighting = true;
    this.redTracerMat.diffuseColor = Color3.Black();
    this.redTracerMat.emissiveColor = new Color3(1.95, 0.68, 0.35);
    this.redTracerMat.alpha = 0.94;
    this.redTracerMat.alphaMode = Constants.ALPHA_ADD;
    this.redTracerMat.disableDepthWrite = true;
  }

  public setTeamColors(blueHex: string, redHex: string): void {
    this.blueHex = blueHex;
    this.redHex = redHex;
    try {
      const b = Color3.FromHexString(blueHex);
      this.blueEmissive = new Color3(b.r * 0.14, b.g * 0.14, b.b * 0.14);
      this.blueTracerMat.emissiveColor = new Color3(
        b.r * 1.45 + 0.2,
        b.g * 1.45 + 0.2,
        b.b * 1.45 + 0.2
      );
    } catch {
      // Keep default blue
    }
    try {
      const r = Color3.FromHexString(redHex);
      this.redEmissive = new Color3(r.r * 0.14, r.g * 0.14, r.b * 0.14);
      this.redTracerMat.emissiveColor = new Color3(
        r.r * 1.45 + 0.2,
        r.g * 1.45 + 0.2,
        r.b * 1.45 + 0.2
      );
    } catch {
      // Keep default red
    }

    if (this.bluePalette) {
      updateOperatorPaletteTeamColor(this.bluePalette, this.blueHex);
    }
    if (this.redPalette) {
      updateOperatorPaletteTeamColor(this.redPalette, this.redHex);
    }
    for (const bot of this.bots) {
      this.restoreBotColors(bot);
    }
  }

  public setGraphicsQuality(quality: GraphicsQuality): void {
    const budget = getVfxQualityBudget(quality);
    this.tracerPool.setMaxActive(budget.maxTracers);
  }

  public setGameMode(mode: GameMode): void {
    this.gameMode = mode;
  }

  public setSmokeClouds(
    clouds: ReadonlyArray<{ x: number; y: number; z: number; radius: number }>
  ): void {
    this.smokeClouds = clouds.map((c) => ({ x: c.x, y: c.y, z: c.z, radius: c.radius }));
  }

  public resetBotsForNewRound(): void {
    this.smokeClouds = [];
    for (const bot of this.bots) {
      this.respawnBot(bot);
    }
  }

  public spawnBotsForMatch(
    mapDef: MapDefinition,
    blueBots: MatchParticipant[],
    redBots: MatchParticipant[]
  ): void {
    this.clearBots();
    this.mapDef = mapDef;
    this.ensureOperatorPalettes();

    const blueWeaponNames = ['AK-47 Heavy Rifle', 'Vector-9 SMG', 'M870 Combat Shotgun', 'AWP-50 Sniper'];
    const redWeaponNames = ['AK-47 Heavy Rifle', 'Vector-9 SMG', 'M870 Combat Shotgun', 'AWP-50 Sniper'];

    const blueSpawnPool =
      mapDef.blueSpawns.length > 1 ? mapDef.blueSpawns.slice(1) : mapDef.blueSpawns;
    blueBots.forEach((p, idx) => {
      const baseSpawn = blueSpawnPool[idx % blueSpawnPool.length] ?? new Vector3(-16, 1, -20);
      const stackIndex = Math.floor(idx / Math.max(1, blueSpawnPool.length));
      const spawn =
        stackIndex === 0
          ? baseSpawn
          : new Vector3(
              baseSpawn.x + (idx % 2 === 0 ? 1.8 : -1.8) * stackIndex,
              baseSpawn.y,
              baseSpawn.z
            );
      this.createBotAgent(
        p.id,
        p.name,
        'blue',
        blueWeaponNames[idx % blueWeaponNames.length],
        spawn,
        0
      );
    });

    const ffaSpawns = [...mapDef.blueSpawns.slice(1), ...mapDef.redSpawns];
    redBots.forEach((p, idx) => {
      const spawns =
        this.gameMode === 'ffa'
          ? ffaSpawns.length > 0
            ? ffaSpawns
            : mapDef.redSpawns
          : mapDef.redSpawns;
      const baseSpawn = spawns[idx % spawns.length] ?? new Vector3(16, 1, 20);
      const stackIndex = Math.floor(idx / Math.max(1, spawns.length));
      const spawn =
        stackIndex === 0
          ? baseSpawn
          : new Vector3(
              baseSpawn.x + (idx % 2 === 0 ? 1.8 : -1.8) * stackIndex,
              baseSpawn.y,
              baseSpawn.z
            );
      this.createBotAgent(
        p.id,
        p.name,
        'red',
        redWeaponNames[idx % redWeaponNames.length],
        spawn,
        this.gameMode === 'ffa' ? Math.atan2(-spawn.x, -spawn.z) : Math.PI
      );
    });
  }

  private ensureOperatorPalettes(): void {
    if (!this.bluePalette) {
      this.bluePalette = createOperatorPalette(this.scene, 'blue', 'botBluePal');
      updateOperatorPaletteTeamColor(this.bluePalette, this.blueHex);
    }
    if (!this.redPalette) {
      this.redPalette = createOperatorPalette(this.scene, 'red', 'botRedPal');
      updateOperatorPaletteTeamColor(this.redPalette, this.redHex);
    }
  }

  private disposeRay(ray: Ray): void {
    const disposable = ray as Ray & { dispose?: () => void };
    disposable.dispose?.();
    ray.origin.set(0, 0, 0);
    ray.direction.set(0, 0, 1);
    ray.length = 0;
  }

  public clearBots(): void {
    this.tracerPool.clear();

    for (const bot of this.bots) {
      this.disposeRay(bot.obstacleRay);
      this.disposeRay(bot.groundRay);
      this.disposeRay(bot.losRay);
      this.disposeRay(bot.shotRay);
      bot.bodyMat.dispose();
      bot.headMat.dispose();
      bot.root.dispose();
    }
    this.bots = [];

    for (const ray of this.botRays) {
      this.disposeRay(ray);
    }
    this.botRays = [];

    for (const m of this.sharedMaterials) {
      m.dispose();
    }
    this.sharedMaterials = [];

    this.bluePalette?.dispose();
    this.bluePalette = null;
    this.redPalette?.dispose();
    this.redPalette = null;
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
    return this.bots.map((b) => ({
      id: b.id,
      name: b.name,
      x: b.root.position.x,
      z: b.root.position.z,
      yawRad: b.yaw,
      team: b.team,
      isAlive: b.isAlive,
    }));
  }

  public getBotTargetPosition(
    botId: string
  ): { x: number; y: number; z: number; isAlive: boolean } | null {
    const bot = this.bots.find((b) => b.id === botId);
    if (!bot) return null;
    return {
      x: bot.root.position.x,
      y: bot.root.position.y,
      z: bot.root.position.z,
      isAlive: bot.isAlive,
    };
  }

  public getActorSnapshot(actorId: string): {
    id: string;
    name: string;
    team: TeamId;
    characterId: CharacterId;
    weaponId: WeaponId;
    x: number;
    y: number;
    z: number;
    yaw: number;
  } | null {
    const bot = this.bots.find((b) => b.id === actorId);
    if (!bot) return null;
    const weaponId = this.mapWeaponNameToId(bot.weaponName);
    return {
      id: bot.id,
      name: bot.name,
      team: bot.team,
      characterId: getCharacterForWeaponId(weaponId),
      weaponId,
      x: bot.root.position.x,
      y: bot.root.position.y,
      z: bot.root.position.z,
      yaw: bot.yaw,
    };
  }

  public setBotsVisible(visible: boolean): void {
    for (const bot of this.bots) {
      bot.root.setEnabled(visible);
    }
  }

  public applyAirstrikeDamage(
    impactPos: Vector3,
    radius: number,
    maxDamage: number,
    onKill: (info: { victimId: string; victimName: string; distanceMeters: number }) => void
  ): number {
    return this.applyExplosiveDamage(
      impactPos,
      radius,
      maxDamage,
      'Precision Barrage',
      onKill
    );
  }

  public applyExplosiveDamage(
    impactPos: Vector3,
    radius: number,
    maxDamage: number,
    weaponName: string,
    onKill: (info: { victimId: string; victimName: string; distanceMeters: number }) => void
  ): number {
    let hits = 0;
    for (const bot of this.bots) {
      if (!bot.isAlive) continue;
      if (!isHostile(this.gameMode, { id: 'player', team: 'blue' }, { id: bot.id, team: bot.team })) {
        continue;
      }
      const dist = Vector3.Distance(
        new Vector3(bot.root.position.x, impactPos.y, bot.root.position.z),
        impactPos
      );
      if (dist > radius) continue;

      const falloff = 1 - (dist / radius) * 0.65;
      const dmg = Math.max(20, Math.round(maxDamage * falloff));
      const res = this.applyDamageToBot(
        bot.id,
        'body',
        dmg,
        1.0,
        'player',
        weaponName,
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

  public applyTacticalDisruption(
    center: Vector3,
    radius: number,
    effect: 'flash' | 'stun',
    durationSec: number
  ): number {
    let affected = 0;
    for (const bot of this.bots) {
      if (!bot.isAlive) continue;
      if (!isHostile(this.gameMode, { id: 'player', team: 'blue' }, { id: bot.id, team: bot.team })) {
        continue;
      }
      const dist = Vector3.Distance(
        new Vector3(bot.root.position.x, center.y, bot.root.position.z),
        center
      );
      if (dist > radius) continue;

      const strength = Math.max(0.45, 1 - (dist / radius) * 0.55);
      const effectiveDur = durationSec * strength;
      if (effect === 'flash') {
        bot.blindTimer = Math.max(bot.blindTimer, effectiveDur);
        bot.targetEnemyId = null;
        bot.targetEnemyPos = null;
        bot.hitFlashTimer = 0.25;
        bot.headMat.emissiveColor = new Color3(0.95, 1.35, 1.85);
      } else {
        bot.slowTimer = Math.max(bot.slowTimer, effectiveDur);
        bot.hitFlashTimer = 0.22;
        bot.bodyMat.emissiveColor = new Color3(0.15, 0.95, 0.65);
      }
      affected += 1;
    }
    return affected;
  }

  public getLivingEnemyPositions(forTeam: TeamId, excludeBotId?: string): Vector3[] {
    const out: Vector3[] = [];
    for (const bot of this.bots) {
      if (!bot.isAlive || bot.id === excludeBotId) continue;
      if (
        isHostile(
          this.gameMode,
          { id: excludeBotId ?? 'player', team: forTeam },
          { id: bot.id, team: bot.team }
        )
      ) {
        out.push(bot.root.position.clone());
      }
    }
    if ((forTeam === 'red' || this.gameMode === 'ffa') && excludeBotId !== 'player') {
      const p = this.callbacks.getPlayerTarget();
      if (p.isAlive) out.push(p.position.clone());
    }
    return out;
  }

  public pickBestSpawn(team: TeamId, excludeActorId?: string): Vector3 {
    if (!this.mapDef) return new Vector3(0, 1, 0);
    const candidates =
      this.gameMode === 'ffa'
        ? [...this.mapDef.blueSpawns, ...this.mapDef.redSpawns]
        : team === 'blue'
          ? this.mapDef.blueSpawns
          : this.mapDef.redSpawns;
    const enemies = this.getLivingEnemyPositions(team, excludeActorId);

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
      this.callbacks.onKillRecorded?.({
        killerId: attackerId,
        victimId: bot.id,
        weaponName,
        headshot: zone === 'head',
        distanceMeters,
        victimPos: {
          x: bot.root.position.x,
          y: bot.root.position.y,
          z: bot.root.position.z,
        },
        victimYaw: bot.yaw,
      });
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
    this.tracerPool.update(clampedDt);

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
        if (this.gameMode === 'bomb') {
          this.match.setParticipantAlive(bot.id, false, 0);
          continue;
        }
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
      if (bot.blindTimer > 0) {
        bot.blindTimer = Math.max(0, bot.blindTimer - clampedDt);
      }
      if (bot.slowTimer > 0) {
        bot.slowTimer = Math.max(0, bot.slowTimer - clampedDt);
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
    const speedScale = bot.blindTimer > 0 ? 0.35 : bot.slowTimer > 0 ? 0.48 : 1.0;

    if (bot.blindTimer > 0) {
      bot.targetEnemyId = null;
      bot.targetEnemyPos = null;
      bot.movementScratch.set(
        Math.cos(bot.yaw) * bot.strafeDir * BOT_STRAFE_SPEED * speedScale,
        0,
        -Math.sin(bot.yaw) * bot.strafeDir * BOT_STRAFE_SPEED * speedScale
      );
      this.moveBotWithAvoidance(bot, bot.movementScratch, dt);
      return;
    }

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
      if (bot.lostSightTimer > 0) {
        bot.lostSightTimer -= dt;
        if (bot.lostSightTimer <= 0) {
          bot.targetEnemyId = null;
          bot.targetEnemyPos = null;
          bot.currentWaypoint = this.pickRandomWaypoint(bot.root.position);
          return;
        }
      }

      const toEnemyX = bot.targetEnemyPos.x - bot.root.position.x;
      const toEnemyZ = bot.targetEnemyPos.z - bot.root.position.z;
      const dist = Math.hypot(toEnemyX, toEnemyZ);
      const desiredYaw = Math.atan2(toEnemyX, toEnemyZ);
      bot.yaw = this.lerpAngle(bot.yaw, desiredYaw, 1 - Math.exp(-10 * dt));
      bot.root.rotation.y = bot.yaw;

      bot.rightScratch.set(Math.cos(bot.yaw), 0, -Math.sin(bot.yaw));
      bot.forwardScratch.set(Math.sin(bot.yaw), 0, Math.cos(bot.yaw));
      let moveX = bot.rightScratch.x * bot.strafeDir * BOT_STRAFE_SPEED * speedScale;
      let moveZ = bot.rightScratch.z * bot.strafeDir * BOT_STRAFE_SPEED * speedScale;
      if (bot.hp < 40 || dist < 6.5) {
        moveX -= bot.forwardScratch.x * 2.6 * speedScale;
        moveZ -= bot.forwardScratch.z * 2.6 * speedScale;
      } else if (dist > 22) {
        moveX += bot.forwardScratch.x * 2.8 * speedScale;
        moveZ += bot.forwardScratch.z * 2.8 * speedScale;
      }

      bot.movementScratch.set(moveX, 0, moveZ);
      this.moveBotWithAvoidance(bot, bot.movementScratch, dt);

      if (bot.reactionTimer > 0) {
        bot.reactionTimer -= dt;
      } else if (bot.burstPauseTimer > 0) {
        bot.burstPauseTimer -= dt;
        if (bot.burstPauseTimer <= 0) {
          bot.burstShotsLeft = 3 + Math.floor(Math.random() * 3);
        }
      } else {
        bot.fireCooldown -= dt * (bot.slowTimer > 0 ? 0.65 : 1.0);
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

    // Objective behavior in Secure Bomb mode
    if (this.gameMode === 'bomb') {
      const bombState = this.match.getBombState();
      if (bombState && bombState.phase === 'unplanted' && bot.team === 'blue' && bombState.carrierId === bot.id) {
        const sites = this.mapDef?.bombSites ?? [];
        const targetSite = sites[bot.id.charCodeAt(bot.id.length - 1) % Math.max(1, sites.length)];
        if (targetSite) {
          const sdx = targetSite.position.x - bot.root.position.x;
          const sdz = targetSite.position.z - bot.root.position.z;
          const sdist = Math.hypot(sdx, sdz);
          if (sdist <= targetSite.radius * 0.72) {
            this.match.updateBombInteraction(
              {
                id: bot.id,
                team: bot.team,
                x: bot.root.position.x,
                y: bot.root.position.y,
                z: bot.root.position.z,
                isAlive: bot.isAlive,
              },
              true,
              dt
            );
            return;
          }
          bot.currentWaypoint = targetSite.position.clone();
        }
      } else if (bombState && bombState.phase === 'planted' && bot.team === 'red') {
        const bdx = bombState.plantX - bot.root.position.x;
        const bdz = bombState.plantZ - bot.root.position.z;
        const bdist = Math.hypot(bdx, bdz);
        if (bdist <= 3.6) {
          this.match.updateBombInteraction(
            {
              id: bot.id,
              team: bot.team,
              x: bot.root.position.x,
              y: bot.root.position.y,
              z: bot.root.position.z,
              isAlive: bot.isAlive,
            },
            true,
            dt
          );
          return;
        }
        bot.currentWaypoint = new Vector3(bombState.plantX, 0.2, bombState.plantZ);
      }
    }

    const toWaypointX = bot.currentWaypoint.x - bot.root.position.x;
    const toWaypointZ = bot.currentWaypoint.z - bot.root.position.z;
    const flatDist = Math.hypot(toWaypointX, toWaypointZ);
    if (flatDist < 1.35) {
      bot.currentWaypoint = this.pickRandomWaypoint(bot.root.position);
      return;
    }

    const dirX = toWaypointX / flatDist;
    const dirZ = toWaypointZ / flatDist;
    const desiredYaw = Math.atan2(dirX, dirZ);
    bot.yaw = this.lerpAngle(bot.yaw, desiredYaw, 1 - Math.exp(-7 * dt));
    bot.root.rotation.y = bot.yaw;

    bot.movementScratch.set(
      dirX * BOT_MOVE_SPEED * speedScale,
      0,
      dirZ * BOT_MOVE_SPEED * speedScale
    );
    const moved = this.moveBotWithAvoidance(bot, bot.movementScratch, dt);
    if (!moved) {
      bot.currentWaypoint = this.pickRandomWaypoint(bot.root.position);
      bot.stuckTimer = 0;
    }

    // Stuck detection: if bot barely moved, pick a new waypoint
    const movedDist = Math.hypot(
      bot.root.position.x - bot.prevPos.x,
      bot.root.position.y - bot.prevPos.y,
      bot.root.position.z - bot.prevPos.z
    );
    if (movedDist < 0.02 * dt) {
      bot.stuckTimer += dt;
      if (bot.stuckTimer > 1.2) {
        bot.currentWaypoint = this.pickRandomWaypoint(bot.root.position);
        bot.stuckTimer = 0;
      }
    } else {
      bot.stuckTimer = 0;
    }
  }

  private moveBotWithAvoidance(bot: BotAgent, desiredVel: Vector3, dt: number): boolean {
    const speed = Math.hypot(desiredVel.x, desiredVel.z);
    if (speed < 0.05) return true;

    bot.directionScratch.set(desiredVel.x / speed, 0, desiredVel.z / speed);
    bot.probeOriginScratch.set(bot.root.position.x, bot.root.position.y + 0.85, bot.root.position.z);

    bot.moveDirectionScratch.copyFrom(bot.directionScratch);
    if (this.isObstacleAhead(bot, bot.moveDirectionScratch, 1.25)) {
      bot.leftScratch.set(-bot.directionScratch.z, 0, bot.directionScratch.x);
      bot.rightScratch.set(bot.directionScratch.z, 0, -bot.directionScratch.x);
      if (!this.isObstacleAhead(bot, bot.leftScratch, 1.35)) {
        bot.moveDirectionScratch.copyFrom(bot.leftScratch);
      } else if (!this.isObstacleAhead(bot, bot.rightScratch, 1.35)) {
        bot.moveDirectionScratch.copyFrom(bot.rightScratch);
      } else {
        return false;
      }
    }

    const nextX = Math.max(-27.2, Math.min(27.2, bot.root.position.x + bot.moveDirectionScratch.x * speed * dt));
    const nextZ = Math.max(-27.2, Math.min(27.2, bot.root.position.z + bot.moveDirectionScratch.z * speed * dt));

    const groundY = this.sampleGroundY(bot, nextX, bot.root.position.y + 1.35, nextZ);
    if (groundY !== null && groundY - bot.root.position.y <= 0.9) {
      bot.root.position.y += (groundY - bot.root.position.y) * Math.min(1, dt * 14);
    }
    bot.root.position.x = nextX;
    bot.root.position.z = nextZ;
    return true;
  }

  private isObstacleAhead(bot: BotAgent, dir: Vector3, dist: number): boolean {
    bot.obstacleRay.origin.copyFrom(bot.probeOriginScratch);
    bot.obstacleRay.direction.copyFrom(dir);
    bot.obstacleRay.length = dist;
    const hit = this.scene.pickWithRay(
      bot.obstacleRay,
      this.collisionPickPredicate
    );
    return Boolean(hit?.hit);
  }

  private sampleGroundY(bot: BotAgent | null, x: number, fromY: number, z: number): number | null {
    const ray = bot?.groundRay ?? this.spawnGroundRay;
    ray.origin.set(x, fromY, z);
    const hit = this.scene.pickWithRay(
      ray,
      this.collisionPickPredicate
    );
    return hit?.hit && hit.pickedPoint ? hit.pickedPoint.y : null;
  }

  private scanForEnemy(bot: BotAgent): void {
    const eyeOrigin = bot.eyeOriginScratch.set(
      bot.root.position.x,
      bot.root.position.y + 1.55,
      bot.root.position.z
    );
    let closestId: string | null = null;
    let closestDist = BOT_DETECT_RANGE;

    for (const other of this.bots) {
      if (
        !other.isAlive ||
        !isHostile(
          this.gameMode,
          { id: bot.id, team: bot.team },
          { id: other.id, team: other.team }
        )
      ) {
        continue;
      }
      const targetCenter = bot.scanTargetScratch.set(
        other.root.position.x,
        other.root.position.y + 1.25,
        other.root.position.z
      );
      const dist = Math.hypot(
        targetCenter.x - eyeOrigin.x,
        targetCenter.y - eyeOrigin.y,
        targetCenter.z - eyeOrigin.z
      );
      if (dist < closestDist && this.hasLineOfSight(bot, eyeOrigin, targetCenter, dist)) {
        closestDist = dist;
        closestId = other.id;
        if (!bot.targetEnemyPos) bot.targetEnemyPos = new Vector3();
        bot.targetEnemyPos.copyFrom(targetCenter);
      }
    }

    if (this.gameMode === 'ffa' || bot.team === 'red') {
      const player = this.callbacks.getPlayerTarget();
      if (player.isAlive) {
        const playerChest = bot.scanTargetScratch.set(
          player.eyePosition.x,
          player.eyePosition.y - 0.25,
          player.eyePosition.z
        );
        const dist = Math.hypot(
          playerChest.x - eyeOrigin.x,
          playerChest.y - eyeOrigin.y,
          playerChest.z - eyeOrigin.z
        );
        if (dist < closestDist && this.hasLineOfSight(bot, eyeOrigin, playerChest, dist)) {
          closestId = player.id;
          if (!bot.targetEnemyPos) bot.targetEnemyPos = new Vector3();
          bot.targetEnemyPos.copyFrom(playerChest);
        }
      }
    }

    if (closestId) {
      // We have LOS on a target
      if (closestId !== bot.targetEnemyId) {
        // New target acquired — distance-scaled reaction delay
        const reactionBase = 0.22 + Math.random() * 0.14; // 0.22-0.36s
        const distReaction = Math.min(0.2, closestDist * 0.004); // slower reaction at range
        bot.reactionTimer = reactionBase + distReaction;
        bot.burstShotsLeft = 3 + Math.floor(Math.random() * 3);
        bot.burstPauseTimer = 0;
      }
      bot.targetEnemyId = closestId;
      bot.lostSightTimer = 0; // reset — we can see them
    } else if (bot.targetEnemyId) {
      // Had a target but lost LOS this scan — start countdown
      if (bot.lostSightTimer <= 0) {
        bot.lostSightTimer = 0.4 + Math.random() * 0.2;
      }
      // Don't clear target here; updateBotAI drains lostSightTimer and clears
    }
  }

  private hasLineOfSight(bot: BotAgent, from: Vector3, to: Vector3, dist: number): boolean {
    if (dist <= 1e-4) {
      return true;
    }
    if (this.smokeClouds.length > 0 && dist > 0.05) {
      const segDx = to.x - from.x;
      const segDy = to.y - from.y;
      const segDz = to.z - from.z;
      const segLenSq = segDx * segDx + segDy * segDy + segDz * segDz;
      if (segLenSq > 0.0001) {
        for (const cloud of this.smokeClouds) {
          const cx = cloud.x - from.x;
          const cy = cloud.y + 1.1 - from.y;
          const cz = cloud.z - from.z;
          const t = Math.max(
            0,
            Math.min(1, (cx * segDx + cy * segDy + cz * segDz) / segLenSq)
          );
          const nearX = from.x + segDx * t - cloud.x;
          const nearY = from.y + segDy * t - (cloud.y + 1.1);
          const nearZ = from.z + segDz * t - cloud.z;
          const effectiveRadius = cloud.radius * 0.92;
          if (nearX * nearX + nearY * nearY + nearZ * nearZ <= effectiveRadius * effectiveRadius) {
            return false;
          }
        }
      }
    }

    bot.losDirectionScratch.set(to.x - from.x, to.y - from.y, to.z - from.z).normalize();
    bot.losRay.origin.copyFrom(from);
    bot.losRay.direction.copyFrom(bot.losDirectionScratch);
    bot.losRay.length = Math.max(0.1, dist - 0.35);
    const hit = this.scene.pickWithRay(
      bot.losRay,
      this.collisionPickPredicate
    );
    return !hit?.hit;
  }

  private fireBotShot(bot: BotAgent, targetPos: Vector3): void {
    const eyeOrigin = bot.shotOriginScratch.set(
      bot.root.position.x,
      bot.root.position.y + 1.48,
      bot.root.position.z
    );
    const toTargetX = targetPos.x - eyeOrigin.x;
    const toTargetY = targetPos.y - eyeOrigin.y;
    const toTargetZ = targetPos.z - eyeOrigin.z;
    const dist = Math.hypot(toTargetX, toTargetY, toTargetZ);
    const direction = bot.shotDirectionScratch;
    if (dist > 1e-4) {
      const invDist = 1 / dist;
      direction.set(toTargetX * invDist, toTargetY * invDist, toTargetZ * invDist);
    } else {
      direction.set(Math.sin(bot.yaw), 0, Math.cos(bot.yaw));
    }

    // Distance-dependent spread: tight at close range, wider at long range
    const distFactor = Math.max(0, Math.min(1, (dist - 5) / 30)); // 0 at ≤5m, 1 at ≥35m
    const spread = 0.035 + distFactor * 0.050; // 0.035 close → 0.085 far
    direction.set(
      direction.x + (Math.random() - 0.5) * spread,
      direction.y + (Math.random() - 0.5) * spread * 0.75,
      direction.z + (Math.random() - 0.5) * spread
    ).normalize();

    const player = this.callbacks.getPlayerTarget();
    bot.shotRay.origin.copyFrom(eyeOrigin);
    bot.shotRay.direction.copyFrom(direction);
    bot.shotRay.length = 90;

    const prevPickable = player.collider.isPickable;
    player.collider.isPickable = player.isAlive && (this.gameMode === 'ffa' || bot.team === 'red');

    let pick;
    try {
      pick = this.scene.pickWithRay(bot.shotRay, (mesh) => {
        if (!mesh.isPickable || !mesh.isEnabled()) return false;
        const meta = mesh.metadata as { isBot?: boolean; botId?: string; team?: TeamId } | undefined;
        if (meta?.isBot) {
          return isHostile(
            this.gameMode,
            { id: bot.id, team: bot.team },
            { id: meta.botId ?? '', team: meta.team ?? 'red' }
          );
        }
        return true;
      });
    } finally {
      player.collider.isPickable = prevPickable;
    }

    bot.muzzleFlash.isVisible = true;
    bot.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
    const flashScale = 0.8 + Math.random() * 0.45;
    bot.muzzleFlash.scaling.setAll(flashScale);
    bot.muzzleFlashTimer = 0.045;

    const muzzleWorld = bot.muzzlePoint.getAbsolutePosition();
    const endPoint = bot.shotTargetScratch;
    if (pick?.hit && pick.pickedPoint) {
      endPoint.copyFrom(pick.pickedPoint);
    } else {
      endPoint.set(
        eyeOrigin.x + direction.x * 70,
        eyeOrigin.y + direction.y * 70,
        eyeOrigin.z + direction.z * 70
      );
    }
    this.spawnBotTracer(muzzleWorld, endPoint, bot.team);

    if (!pick?.hit || !pick.pickedMesh) return;

    const hitDist = Math.round(pick.distance * 10) / 10;

    if (
      pick.pickedMesh === player.collider &&
      (this.gameMode === 'ffa' || bot.team === 'red') &&
      player.isAlive
    ) {
      const headshot = Math.random() < 0.14;
      const dmg = headshot ? Math.round(BOT_WEAPON_DAMAGE * 1.6) : BOT_WEAPON_DAMAGE;
      this.callbacks.onPlayerDamaged(
        dmg,
        bot.id,
        bot.name,
        bot.weaponName,
        headshot,
        hitDist,
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
        hitDist
      );
    }
  }

  private spawnBotTracer(start: Vector3, end: Vector3, team: TeamId): void {
    this.tracerPool.spawn(
      start,
      end,
      team === 'blue' ? this.blueTracerMat : this.redTracerMat,
      {
        thickness: 0.018,
        duration: 0.058,
        maxLength: 24,
        startLead: 0.05,
      }
    );
  }

  private respawnBot(bot: BotAgent): void {
    const spawn = this.pickBestSpawn(bot.team, bot.id);
    const groundY = this.sampleGroundY(null, spawn.x, spawn.y + 1.0, spawn.z) ?? 0;
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
    bot.lostSightTimer = 0;
    bot.stuckTimer = 0;
    bot.blindTimer = 0;
    bot.slowTimer = 0;
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
    const base = bot.team === 'blue' ? this.blueEmissive : this.redEmissive;
    bot.bodyMat.emissiveColor = base.clone();
    bot.headMat.emissiveColor = new Color3(base.r * 1.65, base.g * 1.65, base.b * 1.65);
  }

  private lerp(a: number, b: number, dtFactor: number): number {
    return a + (b - a) * Math.min(1, dtFactor);
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  private mapWeaponNameToId(weaponName: string): WeaponId {
    if (weaponName.includes('SMG')) return 'smg';
    if (weaponName.includes('Shotgun')) return 'shotgun';
    if (weaponName.includes('Sniper')) return 'sniper';
    if (weaponName.includes('Pistol') || weaponName.includes('USP')) return 'pistol';
    return 'ak47';
  }

  private createBotAgent(
    id: string,
    name: string,
    team: TeamId,
    weaponName: string,
    spawnPos: Vector3,
    yaw: number
  ): void {
    this.ensureOperatorPalettes();
    const palette = (team === 'blue' ? this.bluePalette : this.redPalette)!;
    const weaponId = this.mapWeaponNameToId(weaponName);
    const characterId = getCharacterForWeaponId(weaponId);

    const rig = buildOperatorRig(this.scene, {
      id: `bot_${id}`,
      team,
      palette,
      characterId,
      initialWeaponId: weaponId,
      buildAllWeapons: false,
      isPickableHitboxes: true,
      hitboxMetadata: {
        isBot: true,
        botId: id,
        team,
      },
    });

    const groundY = this.sampleGroundY(null, spawnPos.x, spawnPos.y + 1.0, spawnPos.z) ?? 0;
    rig.root.position.set(spawnPos.x, groundY, spawnPos.z);
    rig.root.rotation.y = yaw;

    const bot: BotAgent = {
      id,
      name,
      team,
      weaponName,
      root: rig.root,
      pivot: rig.pivot,
      upperBodyPivot: rig.upperBodyPivot,
      legLPivot: rig.legLPivot,
      legRPivot: rig.legRPivot,
      headMesh: rig.headMesh,
      bodyMesh: rig.bodyMesh,
      muzzlePoint: rig.muzzlePoint,
      muzzleFlash: rig.muzzleFlash,
      muzzleFlashTimer: 0,
      hp: 100,
      maxHp: 100,
      isAlive: true,
      respawnTimer: 0,
      spawnProtection: 1.0,
      yaw,
      aimPitch: 0,
      walkPhase: 0,
      prevPos: rig.root.position.clone(),
      movementScratch: new Vector3(),
      directionScratch: new Vector3(),
      moveDirectionScratch: new Vector3(),
      forwardScratch: new Vector3(),
      rightScratch: new Vector3(),
      leftScratch: new Vector3(),
      probeOriginScratch: new Vector3(),
      eyeOriginScratch: new Vector3(),
      scanTargetScratch: new Vector3(),
      losDirectionScratch: new Vector3(),
      shotOriginScratch: new Vector3(),
      shotDirectionScratch: new Vector3(),
      shotTargetScratch: new Vector3(),
      obstacleRay: new Ray(Vector3.Zero(), new Vector3(0, 0, 1), 1.25),
      groundRay: new Ray(Vector3.Zero(), new Vector3(0, -1, 0), 3),
      losRay: new Ray(Vector3.Zero(), new Vector3(0, 0, 1), BOT_DETECT_RANGE),
      shotRay: new Ray(Vector3.Zero(), new Vector3(0, 0, 1), 90),
      deathRollDir: 1,
      currentWaypoint: this.pickRandomWaypoint(rig.root.position),
      strafeDir: Math.random() > 0.5 ? 1 : -1,
      strafeSwitchTimer: 1.0,
      losScanTimer: Math.random() * 0.14,
      lostSightTimer: 0,
      stuckTimer: 0,
      targetEnemyId: null,
      targetEnemyPos: null,
      reactionTimer: 0.3,
      burstShotsLeft: 4,
      fireCooldown: 0,
      burstPauseTimer: 0,
      hitFlashTimer: 0,
      blindTimer: 0,
      slowTimer: 0,
      bodyMat: rig.bodyMat,
      headMat: rig.headMat,
    };

    this.botRays.push(bot.obstacleRay, bot.groundRay, bot.losRay, bot.shotRay);
    this.restoreBotColors(bot);
    this.bots.push(bot);
  }

  public dispose(): void {
    this.clearBots();
    this.disposeRay(this.spawnGroundRay);
    this.tracerPool.dispose();
    this.blueTracerMat.dispose();
    this.redTracerMat.dispose();
  }
}
