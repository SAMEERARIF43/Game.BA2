import {
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  Engine,
  GlowLayer,
  HemisphericLight,
  ImageProcessingConfiguration,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import { BotManager } from '../bots/BotManager';
import { MAP_REGISTRY, MapManager } from '../maps/MapManager';
import { MapId, TeamId } from '../maps/types';
import { MatchManager, RESPAWN_DELAY_SEC } from '../match/MatchManager';
import { RemotePlayerRenderer } from '../multiplayer/RemotePlayerRenderer';
import {
  LobbyRoomSnapshot,
  NetworkDamagedEvent,
  NetworkHitConfirmEvent,
  NetworkKillFeedEvent,
  RemoteFireEvent,
} from '../multiplayer/types';
import {
  addProgressionReward,
  getRankSummary,
  loadProgression,
} from '../settings/progressionStorage';
import { AudioEngine } from './AudioEngine';
import { PlayerController } from './PlayerController';
import {
  DamageIndicator,
  GameSettings,
  GraphicsQuality,
  HudState,
  KillFeedEntry,
  KillerBannerInfo,
  KillstreakBanner,
  KillstreakId,
  KillstreakSlotState,
  MatchSnapshot,
  RadarBlip,
  ScorePopup,
  WeaponId,
} from './types';
import { WeaponSystem } from './WeaponSystem';

export interface EngineCallbacks {
  onHudUpdate: (hud: HudState) => void;
  onContextLost: (lost: boolean) => void;
  onMultiplayerShot?: (payload: {
    muzzleX: number;
    muzzleY: number;
    muzzleZ: number;
    endX: number;
    endY: number;
    endZ: number;
    weaponId: WeaponId;
    targetId?: string;
    zone?: 'head' | 'body';
  }) => void;
  onMultiplayerMove?: (
    x: number,
    y: number,
    z: number,
    rotY: number,
    pitch: number,
    weaponId: WeaponId
  ) => void;
}

interface BarrageShell {
  mesh: Mesh;
  mat: StandardMaterial;
  targetPos: Vector3;
  delay: number;
  detonated: boolean;
}

interface BlastEffect {
  sphere: Mesh;
  ring: Mesh;
  sphereMat: StandardMaterial;
  ringMat: StandardMaterial;
  life: number;
  maxLife: number;
}

const UAV_DURATION_SEC = 20;
const OVERDRIVE_DURATION_SEC = 15;
const RADAR_RANGE_METERS = 32;
const PROXIMITY_REVEAL_METERS = 12;

export class EngineManager {
  private canvas: HTMLCanvasElement;
  private engine: Engine;
  private scene: Scene;
  private sunLight!: DirectionalLight;
  private hemiLight!: HemisphericLight;
  private shadowGenerator: ShadowGenerator | null = null;
  private renderPipeline: DefaultRenderingPipeline | null = null;
  private glowLayer: GlowLayer | null = null;

  private audio: AudioEngine;
  private mapManager: MapManager;
  private matchManager: MatchManager;
  private botManager: BotManager;
  private remoteRenderer: RemotePlayerRenderer;
  private player: PlayerController;
  private weapons: WeaponSystem;
  private callbacks: EngineCallbacks;

  private settings: GameSettings;
  private sessionMode: 'offline' | 'multiplayer' = 'offline';
  private mpPaused = false;
  private mpSnapshot: LobbyRoomSnapshot | null = null;
  private mpKillFeed: KillFeedEntry[] = [];
  private lastMoveSendTime = 0;

  private elapsedTime = 0;
  private lastHudEmitTime = 0;
  private disposed = false;

  private playerHealth = 100;
  private readonly playerMaxHealth = 100;
  private playerIsAlive = true;
  private playerRespawnTimer = 0;
  private playerSpawnProtection = 0;
  private lastDamageTimestamp = 0;
  private damageIndicators: DamageIndicator[] = [];
  private damageIndicatorSeq = 0;
  private lastKillerName: string | null = null;
  private lastKillerWeapon: string | null = null;
  private killerBanner: KillerBannerInfo | null = null;
  private showScoreboard = false;
  private showOnboarding = false;
  private onboardingDismissed = false;
  private heartbeatCooldown = 0;

  // CoD4-style Killstreaks, Progression & Popups
  private currentStreak = 0;
  private unlockedStreaks: Record<KillstreakId, boolean> = {
    uav: false,
    airstrike: false,
    overdrive: false,
  };
  private uavRemainingSec = 0;
  private uavPulseTimer = 0;
  private overdriveRemainingSec = 0;
  private overdriveHealAccum = 0;
  private killstreakBanner: KillstreakBanner | null = null;
  private killstreakBannerSeq = 0;
  private scorePopups: ScorePopup[] = [];
  private scorePopupSeq = 0;
  private barrageShells: BarrageShell[] = [];
  private blastEffects: BlastEffect[] = [];

  private xpTotal = 0;
  private sessionXpEarned = 0;
  private matchEndXpAwarded = false;

  constructor(canvas: HTMLCanvasElement, initialSettings: GameSettings, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    this.settings = { ...initialSettings };
    this.callbacks = callbacks;
    this.xpTotal = loadProgression().xp;

    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.11, 0.14, 0.19, 1.0);
    this.scene.collisionsEnabled = true;

    // Keep the world depth buffer for the viewmodel and avoid a no-op buffer clear.
    this.scene.setRenderingAutoClearDepthStencil(1, false, false, false);

    this.setupLighting();

    this.audio = new AudioEngine();
    this.audio.setVolumes(
      initialSettings.volume,
      initialSettings.sfxVolume,
      initialSettings.musicVolume,
      initialSettings.muted
    );
    this.audio.setAmbientEnvironment('menu');

    this.mapManager = new MapManager(
      this.scene,
      this.sunLight,
      this.hemiLight,
      this.shadowGenerator
    );

    this.matchManager = new MatchManager();
    this.remoteRenderer = new RemotePlayerRenderer(this.scene);

    this.player = new PlayerController(this.scene, this.canvas, this.audio, {
      onFirePress: () => this.weapons.onFirePress(),
      onFireRelease: () => this.weapons.onFireRelease(),
      onAdsChange: () => this.emitHudState(true),
      onReload: () => {
        this.weapons.startReload();
        this.emitHudState(true);
      },
      onSelectSlot: (slot) => {
        this.weapons.selectSlot(slot);
        this.emitHudState(true);
      },
      onCycleSlot: (delta) => {
        this.weapons.cycleSlot(delta);
        this.emitHudState(true);
      },
      onActivateKillstreak: (slot) => {
        this.activateKillstreak(slot);
      },
      onScoreboardChange: (open) => {
        this.showScoreboard = open;
        this.emitHudState(true);
      },
      onCycleScopeMagnification: () => {
        this.weapons.cycleScopeMagnification();
        this.emitHudState(true);
      },
      onPointerLockChange: (locked) => {
        if (this.sessionMode === 'offline') {
          if (!locked && this.matchManager.getPhase() === 'playing') {
            this.matchManager.setPhase('paused');
          } else if (locked && this.matchManager.getPhase() === 'paused') {
            this.matchManager.setPhase('playing');
          }
        } else if (this.mpSnapshot?.phase === 'playing') {
          this.mpPaused = !locked;
        }
        this.emitHudState(true);
      },
      onFocusLost: () => {
        if (this.sessionMode === 'offline' && this.matchManager.getPhase() === 'playing') {
          this.matchManager.setPhase('paused');
          this.player.exitPointerLock();
          this.emitHudState(true);
        } else if (this.sessionMode === 'multiplayer' && this.mpSnapshot?.phase === 'playing') {
          this.mpPaused = true;
          this.player.exitPointerLock();
          this.emitHudState(true);
        }
      },
    });

    this.player.setSensitivity(initialSettings.sensitivity);
    this.player.setAdsSensitivityMultiplier(initialSettings.adsSensitivityMultiplier);
    this.player.setInvertY(initialSettings.invertY);
    this.player.setBaseFov(initialSettings.fovDeg);
    this.player.setScreenShakeScale(initialSettings.screenShakeScale);

    this.botManager = new BotManager(this.scene, this.matchManager, {
      getPlayerTarget: () => ({
        id: 'player',
        isAlive: this.playerIsAlive && this.matchManager.getPhase() === 'playing',
        position: this.player.collider.position.clone(),
        eyePosition: this.player.getEyePosition(),
        collider: this.player.collider,
      }),
      onPlayerDamaged: (
        damage,
        attackerId,
        attackerName,
        weaponName,
        headshot,
        dist,
        attackerPos,
        attackerHpRemaining
      ) => {
        this.handleOfflinePlayerDamaged(
          damage,
          attackerId,
          attackerName,
          weaponName,
          headshot,
          dist,
          attackerPos,
          attackerHpRemaining
        );
      },
    });

    this.weapons = new WeaponSystem(
      this.scene,
      this.player.camera,
      this.player,
      this.botManager,
      this.audio,
      (shot) => {
        this.callbacks.onMultiplayerShot?.({
          muzzleX: shot.muzzle.x,
          muzzleY: shot.muzzle.y,
          muzzleZ: shot.muzzle.z,
          endX: shot.endPoint.x,
          endY: shot.endPoint.y,
          endZ: shot.endPoint.z,
          weaponId: shot.weaponId,
          targetId: shot.targetId,
          zone: shot.zone,
        });
      },
      (info) => {
        this.handlePlayerKillCredit(info.headshot, info.distanceMeters, info.victimName);
      }
    );

    this.setupPostProcessing();
    this.applyGraphicsQuality(initialSettings.graphicsQuality);
    this.bindLifecycleEvents();
    this.previewMap('urban');

    this.engine.runRenderLoop(() => {
      if (this.disposed) return;
      const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05);
      this.elapsedTime += dt;

      if (this.sessionMode === 'multiplayer') {
        this.tickMultiplayerFrame(dt);
      } else {
        const phase = this.matchManager.getPhase();
        if (phase === 'menu') {
          const target = this.mapManager.getCurrentDefinition().previewCameraTarget;
          this.player.updateOrbitCamera(target, this.elapsedTime);
        } else {
          this.updateOfflineMatchTick(dt);
          const activeCfg = this.weapons.getActiveConfig();
          this.player.update(dt, activeCfg.adsFovRatio);
          this.weapons.update(dt);
          this.botManager.update(dt);
        }
      }

      this.scene.render();
      this.emitHudState(false);
    });
  }

  public previewMap(mapId: MapId): void {
    this.sessionMode = 'offline';
    this.mpSnapshot = null;
    this.mpPaused = false;
    this.resetCombatArcadeState(true);
    this.remoteRenderer.clear();
    this.weapons.resetForNewMatch();
    this.weapons.setMultiplayerContext(false, 'blue', false);
    this.player.exitPointerLock();
    this.player.setCanControl(false);
    this.player.setOrbitPreview(true);
    this.weapons.setViewModelVisible(false);
    this.botManager.clearBots();
    this.matchManager.setPhase('menu');
    this.mapManager.loadMap(mapId);
    this.audio.setAmbientEnvironment('menu');
    this.emitHudState(true);
  }

  public startMatch(mapId: MapId, requestLock: boolean): void {
    this.sessionMode = 'offline';
    this.mpSnapshot = null;
    this.mpPaused = false;
    this.resetCombatArcadeState(true);
    this.remoteRenderer.clear();
    this.weapons.setMultiplayerContext(false, 'blue', false);

    const def =
      this.mapManager.getCurrentMapId() === mapId
        ? this.mapManager.getCurrentDefinition()
        : this.mapManager.loadMap(mapId);

    this.audio.setAmbientEnvironment(def.id);

    this.matchManager.configureMatch(
      def.id,
      def.name,
      this.settings.killLimit,
      this.settings.botsPerTeam
    );

    this.botManager.spawnBotsForMatch(
      def,
      this.matchManager.getBlueBotParticipants(),
      this.matchManager.getRedBotParticipants()
    );

    this.weapons.resetForNewMatch();
    this.resetPlayerForLife(def.blueSpawns[0] ?? new Vector3(0, 1, -20), 0);

    this.player.setOrbitPreview(false);
    this.player.setCanControl(true);
    this.weapons.setViewModelVisible(true);
    this.showScoreboard = false;
    this.showOnboarding = !this.onboardingDismissed;
    this.heartbeatCooldown = 0;

    if (requestLock) {
      this.matchManager.setPhase('playing');
      this.player.requestPointerLock();
    } else {
      this.matchManager.setPhase('paused');
    }

    this.emitHudState(true);
  }

  public startMultiplayerMatch(snapshot: LobbyRoomSnapshot, requestLock: boolean): void {
    this.sessionMode = 'multiplayer';
    this.botManager.clearBots();
    this.resetCombatArcadeState(true);
    this.mpSnapshot = snapshot;
    this.mpPaused = !requestLock;

    if (this.mapManager.getCurrentMapId() !== snapshot.mapId) {
      this.mapManager.loadMap(snapshot.mapId);
    }
    this.audio.setAmbientEnvironment(snapshot.mapId);

    const local = snapshot.players.find((p) => p.id === snapshot.localPlayerId);
    const localTeam = local?.team ?? 'blue';
    this.weapons.setMultiplayerContext(true, localTeam, snapshot.friendlyFire);
    this.weapons.resetForNewMatch();

    const spawnX = local?.x ?? 0;
    const spawnY = (local?.y ?? 0) + 0.95;
    const spawnZ = local?.z ?? (localTeam === 'blue' ? -20 : 20);
    const spawnRotY = local?.rotY ?? (localTeam === 'blue' ? 0 : Math.PI);

    this.resetPlayerForLife(new Vector3(spawnX, spawnY, spawnZ), spawnRotY);
    this.player.setOrbitPreview(false);
    this.player.setCanControl(true);
    this.weapons.setViewModelVisible(true);
    this.showScoreboard = false;
    this.showOnboarding = !this.onboardingDismissed;
    this.heartbeatCooldown = 0;
    this.remoteRenderer.syncPlayers(snapshot.players, snapshot.localPlayerId);

    if (requestLock) {
      this.player.requestPointerLock();
    }
    this.emitHudState(true);
  }

  public syncMultiplayerState(snapshot: LobbyRoomSnapshot): void {
    this.mpSnapshot = snapshot;

    if (snapshot.phase === 'lobby') {
      if (this.mapManager.getCurrentMapId() !== snapshot.mapId) {
        this.mapManager.loadMap(snapshot.mapId);
      }
      this.audio.setAmbientEnvironment('menu');
      if (this.sessionMode === 'multiplayer') {
        this.remoteRenderer.clear();
        this.resetCombatArcadeState(true);
        this.weapons.resetForNewMatch();
        this.player.exitPointerLock();
        this.player.setCanControl(false);
        this.player.setOrbitPreview(true);
        this.weapons.setViewModelVisible(false);
      }
      this.emitHudState(true);
      return;
    }

    if (snapshot.phase === 'playing') {
      if (this.sessionMode !== 'multiplayer' || this.mapManager.getCurrentMapId() !== snapshot.mapId) {
        this.startMultiplayerMatch(snapshot, true);
        return;
      }

      const local = snapshot.players.find((p) => p.id === snapshot.localPlayerId);
      if (local) {
        this.playerHealth = local.health;
        this.playerIsAlive = local.isAlive;
        this.playerRespawnTimer = local.respawnTimer;
        this.weapons.setMultiplayerContext(true, local.team, snapshot.friendlyFire);
      }

      this.remoteRenderer.syncPlayers(snapshot.players, snapshot.localPlayerId);
    } else if (snapshot.phase === 'ended') {
      this.mpPaused = false;
      this.player.setCanControl(false);
      this.player.exitPointerLock();
      this.weapons.setViewModelVisible(false);
      this.remoteRenderer.syncPlayers(snapshot.players, snapshot.localPlayerId);
      const local = snapshot.players.find((p) => p.id === snapshot.localPlayerId);
      this.awardMatchCompletionXp(Boolean(local && snapshot.winner === local.team));
    }

    this.emitHudState(true);
  }

  public handleRemoteFire(event: RemoteFireEvent): void {
    this.remoteRenderer.spawnRemoteFire(event);
  }

  public handleNetworkHitConfirm(event: NetworkHitConfirmEvent): void {
    this.weapons.recordNetworkHitConfirm(event.zone, event.killed);
    if (event.killed) {
      this.handlePlayerKillCredit(event.zone === 'head', null);
    }
    this.emitHudState(true);
  }

  public handleNetworkDamaged(event: NetworkDamagedEvent): void {
    this.lastDamageTimestamp = performance.now();
    this.audio.playPlayerHurt();
    const sanitizedPos = this.sanitizeAttackerPosition(
      null,
      event.attackerX,
      event.attackerY,
      event.attackerZ
    );
    if (sanitizedPos) {
      this.pushDamageIndicator(sanitizedPos);
    }
    if (!event.killed) {
      this.player.applyDamageImpact(event.damage, sanitizedPos, event.headshot === true);
    }
    if (event.killed) {
      this.playerIsAlive = false;
      this.lastKillerName = event.attackerName;
      this.lastKillerWeapon = event.weaponName;
      const dist = sanitizedPos
        ? Math.round(Vector3.Distance(this.player.collider.position, sanitizedPos) * 10) / 10
        : 0;
      const local = this.mpSnapshot?.players.find((p) => p.id === this.mpSnapshot?.localPlayerId);
      const attacker = this.mpSnapshot?.players.find((p) => p.name === event.attackerName);
      const killerTeam: TeamId = attacker?.team ?? (local?.team === 'blue' ? 'red' : 'blue');
      this.killerBanner = {
        name: event.attackerName,
        team: killerTeam,
        weaponName: event.weaponName,
        distanceMeters: dist,
        headshot: event.headshot,
        killerHpRemaining: attacker?.health,
      };
      this.onPlayerEliminatedCleanup(sanitizedPos);
    }
    this.emitHudState(true);
  }

  public handleNetworkRespawn(pos: { x: number; y: number; z: number; rotY: number }): void {
    this.resetPlayerForLife(new Vector3(pos.x, pos.y + 0.95, pos.z), pos.rotY);
    this.weapons.resetForLife();
    this.weapons.setViewModelVisible(true);
    this.emitHudState(true);
  }

  public handleNetworkKillFeed(event: NetworkKillFeedEvent): void {
    this.mpKillFeed = [
      {
        ...event,
        timestamp: performance.now(),
      },
      ...this.mpKillFeed.slice(0, 4),
    ];
    this.emitHudState(true);
  }

  public resumeMatch(): void {
    if (this.sessionMode === 'multiplayer') {
      if (this.mpSnapshot?.phase !== 'playing') return;
      this.mpPaused = false;
      this.player.setCanControl(true);
      this.player.requestPointerLock();
      this.emitHudState(true);
      return;
    }

    if (this.matchManager.getPhase() === 'ended') return;
    this.matchManager.setPhase('playing');
    this.player.setCanControl(true);
    this.player.requestPointerLock();
    this.emitHudState(true);
  }

  public restartMatch(): void {
    if (this.sessionMode === 'multiplayer') return;
    const currentId = this.mapManager.getCurrentMapId() ?? 'urban';
    this.startMatch(currentId, true);
  }

  public returnToMenu(): void {
    const currentId = this.mapManager.getCurrentMapId() ?? 'urban';
    this.previewMap(currentId);
  }

  public updateSettings(settings: GameSettings): void {
    this.settings = { ...settings };
    this.player.setSensitivity(settings.sensitivity);
    this.player.setAdsSensitivityMultiplier(settings.adsSensitivityMultiplier);
    this.player.setInvertY(settings.invertY);
    this.player.setBaseFov(settings.fovDeg);
    this.player.setScreenShakeScale(settings.screenShakeScale);
    this.audio.setVolumes(settings.volume, settings.sfxVolume, settings.musicVolume, settings.muted);
    this.applyGraphicsQuality(settings.graphicsQuality);
  }

  private handlePlayerKillCredit(
    headshot: boolean,
    distanceMeters: number | null,
    victimName?: string,
    fromStreak = false
  ): void {
    const basePoints = 100;
    const headshotBonus = headshot ? 50 : 0;
    const streakBonus = this.currentStreak >= 2 ? 25 : 0;
    const totalPoints = basePoints + headshotBonus + streakBonus;

    this.sessionXpEarned += totalPoints;
    const updated = addProgressionReward(totalPoints, {
      totalKills: 1,
      totalHeadshots: headshot ? 1 : 0,
    });
    this.xpTotal = updated.xp;

    const subParts: string[] = [];
    if (victimName) subParts.push(victimName);
    if (distanceMeters !== null && distanceMeters > 0) subParts.push(`${Math.round(distanceMeters)}m`);
    if (streakBonus > 0) subParts.push(`+${streakBonus} STREAK`);

    this.scorePopups = [
      ...this.scorePopups.slice(-3),
      {
        id: ++this.scorePopupSeq,
        points: totalPoints,
        label: headshot ? 'HEADSHOT' : 'ELIMINATED',
        sublabel: subParts.length > 0 ? subParts.join(' · ') : undefined,
        isHeadshot: headshot,
        timestamp: performance.now(),
      },
    ];

    if (!fromStreak) {
      this.currentStreak += 1;
      if (this.currentStreak === 3 && !this.unlockedStreaks.uav) {
        this.unlockedStreaks.uav = true;
        this.audio.playKillstreakReady();
        this.pushKillstreakBanner('[F1] UAV SWEEP READY', 'Enemy positions will appear on your radar');
      } else if (this.currentStreak === 5 && !this.unlockedStreaks.airstrike) {
        this.unlockedStreaks.airstrike = true;
        this.audio.playKillstreakReady();
        this.pushKillstreakBanner('[F2] PRECISION BARRAGE READY', 'Ordnance support is standing by');
      } else if (this.currentStreak === 7 && !this.unlockedStreaks.overdrive) {
        this.unlockedStreaks.overdrive = true;
        this.audio.playKillstreakReady();
        this.pushKillstreakBanner('[F3] TACTICAL OVERDRIVE READY', 'Speed, reload and armor regen boosted');
      }
    }

    this.emitHudState(true);
  }

  private pushKillstreakBanner(title: string, subtitle: string): void {
    this.killstreakBanner = {
      id: ++this.killstreakBannerSeq,
      title,
      subtitle,
      timestamp: performance.now(),
    };
  }

  private activateKillstreak(slot: 4 | 5 | 6): void {
    if (!this.playerIsAlive) return;
    const playing =
      this.sessionMode === 'offline'
        ? this.matchManager.getPhase() === 'playing'
        : this.mpSnapshot?.phase === 'playing' && !this.mpPaused;
    if (!playing) return;

    if (slot === 4 && this.unlockedStreaks.uav) {
      this.unlockedStreaks.uav = false;
      this.uavRemainingSec = UAV_DURATION_SEC;
      this.uavPulseTimer = 0;
      this.audio.playUavSweep();
      this.pushKillstreakBanner('UAV ONLINE', 'Hostile signatures illuminated on radar (20s)');
      this.emitHudState(true);
      return;
    }

    if (slot === 5 && this.unlockedStreaks.airstrike) {
      this.unlockedStreaks.airstrike = false;
      this.audio.playAirstrikeIncoming();
      this.pushKillstreakBanner('PRECISION BARRAGE INBOUND', 'Ordnance impact on forward sector');
      this.launchPrecisionBarrage();
      this.emitHudState(true);
      return;
    }

    if (slot === 6 && this.unlockedStreaks.overdrive) {
      this.unlockedStreaks.overdrive = false;
      this.overdriveRemainingSec = OVERDRIVE_DURATION_SEC;
      this.overdriveHealAccum = 0;
      this.player.setMoveSpeedMultiplier(1.25);
      this.weapons.setReloadSpeedMultiplier(1.35);
      this.weapons.resupplyAll();
      this.audio.playOverdriveActivate();
      this.pushKillstreakBanner('TACTICAL OVERDRIVE ENGAGED', '1.25x Speed · 1.35x Reload · Armor Regen');
      this.emitHudState(true);
    }
  }

  private launchPrecisionBarrage(): void {
    const pPos = this.player.collider.position;
    const forward = this.player.camera.getDirection(Vector3.Forward());
    const flatFwd = new Vector3(forward.x, 0, forward.z);
    if (flatFwd.lengthSquared() < 0.001) {
      flatFwd.set(0, 0, 1);
    } else {
      flatFwd.normalize();
    }

    let center = new Vector3(pPos.x + flatFwd.x * 14, 0.2, pPos.z + flatFwd.z * 14);
    if (this.sessionMode === 'offline') {
      const enemies = this.botManager.getLivingEnemyPositions('blue');
      if (enemies.length > 0) {
        // Pick nearest living enemy ahead or closest overall to reward tactical strike placement
        let best = enemies[0];
        let bestScore = Infinity;
        for (const e of enemies) {
          const distToAim = Vector3.Distance(e, center);
          if (distToAim < bestScore) {
            bestScore = distToAim;
            best = e;
          }
        }
        center = new Vector3(best.x, 0.2, best.z);
      }
    }

    center.x = Math.max(-22, Math.min(22, center.x));
    center.z = Math.max(-22, Math.min(22, center.z));

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
      const rad = i === 0 ? 0.5 : 2.2 + Math.random() * 4.5;
      const tx = Math.max(-24, Math.min(24, center.x + Math.cos(angle) * rad));
      const tz = Math.max(-24, Math.min(24, center.z + Math.sin(angle) * rad));

      const shellMat = new StandardMaterial(`barrageShellMat_${Date.now()}_${i}`, this.scene);
      shellMat.disableLighting = true;
      shellMat.emissiveColor = new Color3(2.0, 0.9, 0.28);

      const shell = MeshBuilder.CreateCylinder(
        `barrageShell_${i}`,
        { height: 1.4, diameterTop: 0.08, diameterBottom: 0.22, tessellation: 8 },
        this.scene
      );
      shell.position.set(tx, 26, tz);
      shell.material = shellMat;
      shell.isPickable = false;
      shell.checkCollisions = false;
      shell.isVisible = false;

      this.barrageShells.push({
        mesh: shell,
        mat: shellMat,
        targetPos: new Vector3(tx, 0.2, tz),
        delay: 0.3 + i * 0.34,
        detonated: false,
      });
    }
  }

  private updateArcadeEffects(dt: number): void {
    // UAV timer + radar sweep chime
    if (this.uavRemainingSec > 0) {
      this.uavRemainingSec = Math.max(0, this.uavRemainingSec - dt);
      this.uavPulseTimer += dt;
      if (this.uavPulseTimer >= 2.0 && this.uavRemainingSec > 0) {
        this.uavPulseTimer -= 2.0;
        this.audio.playUavSweep();
      }
    }

    // Overdrive timer + passive armor regeneration
    if (this.overdriveRemainingSec > 0) {
      this.overdriveRemainingSec = Math.max(0, this.overdriveRemainingSec - dt);
      if (this.sessionMode === 'offline' && this.playerIsAlive && this.playerHealth < this.playerMaxHealth) {
        this.overdriveHealAccum += 12 * dt;
        if (this.overdriveHealAccum >= 1) {
          const heal = Math.floor(this.overdriveHealAccum);
          this.overdriveHealAccum -= heal;
          this.playerHealth = Math.min(this.playerMaxHealth, this.playerHealth + heal);
        }
      }
      if (this.overdriveRemainingSec === 0) {
        this.player.setMoveSpeedMultiplier(1.0);
        this.weapons.setReloadSpeedMultiplier(1.0);
      }
    }

    // Falling Precision Barrage shells
    for (let i = this.barrageShells.length - 1; i >= 0; i--) {
      const s = this.barrageShells[i];
      if (s.delay > 0) {
        s.delay -= dt;
        if (s.delay <= 0) {
          s.mesh.isVisible = true;
        }
        continue;
      }

      s.mesh.position.y -= 42 * dt;
      if (s.mesh.position.y <= s.targetPos.y) {
        this.detonateBarrageShell(s.targetPos);
        s.mat.dispose();
        s.mesh.dispose();
        this.barrageShells.splice(i, 1);
      }
    }

    // Blast spheres & shockwave rings
    for (let i = this.blastEffects.length - 1; i >= 0; i--) {
      const b = this.blastEffects[i];
      b.life -= dt;
      if (b.life <= 0) {
        b.sphereMat.dispose();
        b.ringMat.dispose();
        b.sphere.dispose();
        b.ring.dispose();
        this.blastEffects.splice(i, 1);
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
  }

  private detonateBarrageShell(pos: Vector3): void {
    this.audio.playExplosion();
    const distToPlayer = Vector3.Distance(this.player.collider.position, pos);
    if (distToPlayer < 35) {
      this.player.addCameraShake(Math.max(0.03, 0.16 * (1 - distToPlayer / 35)));
    }

    const sphereMat = new StandardMaterial(`blastSphMat_${Date.now()}`, this.scene);
    sphereMat.disableLighting = true;
    sphereMat.emissiveColor = new Color3(2.2, 0.95, 0.25);
    sphereMat.alpha = 0.85;

    const sphere = MeshBuilder.CreateSphere('blastSphere', { diameter: 1.4, segments: 10 }, this.scene);
    sphere.position.copyFrom(pos).addInPlace(new Vector3(0, 0.4, 0));
    sphere.material = sphereMat;
    sphere.isPickable = false;

    const ringMat = new StandardMaterial(`blastRingMat_${Date.now()}`, this.scene);
    ringMat.disableLighting = true;
    ringMat.emissiveColor = new Color3(1.8, 1.25, 0.6);
    ringMat.alpha = 0.9;
    ringMat.backFaceCulling = false;

    const ring = MeshBuilder.CreateDisc('blastRing', { radius: 0.9, tessellation: 24 }, this.scene);
    ring.position.copyFrom(pos).addInPlace(new Vector3(0, 0.08, 0));
    ring.rotation.x = Math.PI * 0.5;
    ring.material = ringMat;
    ring.isPickable = false;

    this.blastEffects.push({
      sphere,
      ring,
      sphereMat,
      ringMat,
      life: 0.48,
      maxLife: 0.48,
    });

    if (this.sessionMode === 'offline' && this.matchManager.getPhase() === 'playing') {
      this.botManager.applyAirstrikeDamage(pos, 8.5, 130, (kill) => {
        this.handlePlayerKillCredit(false, kill.distanceMeters, kill.victimName, true);
      });
    }
  }

  private awardMatchCompletionXp(won: boolean): void {
    if (this.matchEndXpAwarded) return;
    this.matchEndXpAwarded = true;
    const bonus = won ? 150 : 75;
    this.sessionXpEarned += bonus;
    const updated = addProgressionReward(bonus, {
      matchesPlayed: 1,
      matchesWon: won ? 1 : 0,
    });
    this.xpTotal = updated.xp;
  }

  private onPlayerEliminatedCleanup(attackerPos: Vector3 | null): void {
    this.currentStreak = 0;
    this.overdriveRemainingSec = 0;
    this.overdriveHealAccum = 0;
    this.player.setMoveSpeedMultiplier(1.0);
    this.weapons.setReloadSpeedMultiplier(1.0);
    this.player.setDeathLookTarget(attackerPos);
    this.player.setDeadState(true);
    this.weapons.setViewModelVisible(false);
    this.weapons.clearTransientEffects();
  }

  private resetCombatArcadeState(clearSession: boolean): void {
    this.currentStreak = 0;
    this.unlockedStreaks = { uav: false, airstrike: false, overdrive: false };
    this.uavRemainingSec = 0;
    this.uavPulseTimer = 0;
    this.overdriveRemainingSec = 0;
    this.overdriveHealAccum = 0;
    this.killstreakBanner = null;
    this.scorePopups = [];
    this.killerBanner = null;
    this.mpKillFeed = [];
    this.damageIndicators = [];
    this.lastDamageTimestamp = 0;
    this.showScoreboard = false;
    this.player.setMoveSpeedMultiplier(1.0);
    this.player.setDeathLookTarget(null);
    this.weapons.setReloadSpeedMultiplier(1.0);
    this.matchManager.clearKillFeed();

    for (const s of this.barrageShells) {
      s.mat.dispose();
      s.mesh.dispose();
    }
    this.barrageShells = [];
    for (const b of this.blastEffects) {
      b.sphereMat.dispose();
      b.ringMat.dispose();
      b.sphere.dispose();
      b.ring.dispose();
    }
    this.blastEffects = [];

    if (clearSession) {
      this.sessionXpEarned = 0;
      this.matchEndXpAwarded = false;
    }
  }

  private setupPostProcessing(): void {
    const pipeline = new DefaultRenderingPipeline(
      'fpsPostProcess',
      true,
      this.scene,
      [this.player.camera]
    );
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.toneMappingEnabled = true;
    pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    pipeline.imageProcessing.exposure = 1.1;
    pipeline.imageProcessing.contrast = 1.14;
    pipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0);
    pipeline.sharpenEnabled = false;
    this.renderPipeline = pipeline;
  }

  private ensureGlowLayer(kernelSize: number, intensity: number): void {
    if (!this.glowLayer) {
      const glow = new GlowLayer('tacticalGlow', this.scene, {
        mainTextureFixedSize: 512,
        blurKernelSize: kernelSize,
      });
      glow.intensity = intensity;
      glow.customEmissiveColorSelector = (mesh, _subMesh, _mat, result) => {
        if (mesh.name === 'skyDome' || mesh.name.startsWith('rem_np_')) {
          result.set(0, 0, 0, 0);
          return;
        }
        const std = mesh.material as StandardMaterial | undefined;
        if (std && std.emissiveColor) {
          const e = std.emissiveColor;
          result.set(e.r, e.g, e.b, 1);
          return;
        }
        result.set(0, 0, 0, 0);
      };
      this.glowLayer = glow;
    } else {
      this.glowLayer.blurKernelSize = kernelSize;
      this.glowLayer.intensity = intensity;
    }
  }

  private applyGraphicsQuality(quality: GraphicsQuality): void {
    const dprScale = 1 / Math.min(window.devicePixelRatio || 1, 2);
    if (quality === 'LOW') {
      this.engine.setHardwareScalingLevel(1.5);
      this.scene.shadowsEnabled = false;
      this.sunLight.shadowEnabled = false;
      this.player.camera.maxZ = 180;
      if (this.glowLayer) {
        this.glowLayer.dispose();
        this.glowLayer = null;
      }
      if (this.renderPipeline) {
        this.renderPipeline.samples = 1;
        this.renderPipeline.fxaaEnabled = false;
        this.renderPipeline.bloomEnabled = false;
        this.renderPipeline.chromaticAberrationEnabled = false;
        this.renderPipeline.imageProcessing.vignetteEnabled = false;
      }
    } else if (quality === 'MEDIUM') {
      this.engine.setHardwareScalingLevel(1.0);
      this.scene.shadowsEnabled = true;
      this.sunLight.shadowEnabled = true;
      this.player.camera.maxZ = 250;
      this.ensureGlowLayer(24, 0.55);
      if (this.shadowGenerator) {
        this.shadowGenerator.usePercentageCloserFiltering = false;
        const shadowMap = this.shadowGenerator.getShadowMap();
        if (shadowMap) shadowMap.refreshRate = 2;
      }
      if (this.renderPipeline) {
        this.renderPipeline.samples = 1;
        this.renderPipeline.fxaaEnabled = true;
        this.renderPipeline.bloomEnabled = true;
        this.renderPipeline.bloomThreshold = 0.78;
        this.renderPipeline.bloomWeight = 0.22;
        this.renderPipeline.bloomKernel = 48;
        this.renderPipeline.bloomScale = 0.5;
        this.renderPipeline.chromaticAberrationEnabled = false;
        this.renderPipeline.imageProcessing.vignetteEnabled = true;
        this.renderPipeline.imageProcessing.vignetteWeight = 1.1;
        this.renderPipeline.imageProcessing.vignetteStretch = 0.5;
      }
    } else {
      this.engine.setHardwareScalingLevel(dprScale);
      this.scene.shadowsEnabled = true;
      this.sunLight.shadowEnabled = true;
      this.player.camera.maxZ = 300;
      this.ensureGlowLayer(36, 0.75);
      if (this.shadowGenerator) {
        this.shadowGenerator.usePercentageCloserFiltering = true;
        const shadowMap = this.shadowGenerator.getShadowMap();
        if (shadowMap) shadowMap.refreshRate = 1;
      }
      if (this.renderPipeline) {
        this.renderPipeline.samples = 2;
        this.renderPipeline.fxaaEnabled = true;
        this.renderPipeline.bloomEnabled = true;
        this.renderPipeline.bloomThreshold = 0.72;
        this.renderPipeline.bloomWeight = 0.3;
        this.renderPipeline.bloomKernel = 64;
        this.renderPipeline.bloomScale = 0.5;
        this.renderPipeline.chromaticAberrationEnabled = true;
        this.renderPipeline.chromaticAberration.aberrationAmount = 7;
        this.renderPipeline.chromaticAberration.radialIntensity = 0.6;
        this.renderPipeline.imageProcessing.vignetteEnabled = true;
        this.renderPipeline.imageProcessing.vignetteWeight = 1.35;
        this.renderPipeline.imageProcessing.vignetteStretch = 0.45;
      }
    }
    this.weapons.setGraphicsQuality(quality);
  }

  public selectWeapon(id: WeaponId): void {
    this.weapons.selectWeapon(id);
    this.emitHudState(true);
  }

  private tickMultiplayerFrame(dt: number): void {
    const phase = this.mpSnapshot?.phase ?? 'lobby';
    if (phase === 'lobby') {
      const target = this.mapManager.getCurrentDefinition().previewCameraTarget;
      this.player.updateOrbitCamera(target, this.elapsedTime);
      return;
    }

    const activeCfg = this.weapons.getActiveConfig();
    this.player.update(dt, activeCfg.adsFovRatio);
    this.weapons.update(dt);
    this.remoteRenderer.update(dt);
    this.updateArcadeEffects(dt);

    const now = performance.now();
    if (this.mpKillFeed.length > 0) {
      this.mpKillFeed = this.mpKillFeed.filter((k) => now - k.timestamp < 4500);
    }

    if (phase === 'playing' && this.playerIsAlive && now - this.lastMoveSendTime >= 50) {
      this.lastMoveSendTime = now;
      const pos = this.player.collider.position;
      this.callbacks.onMultiplayerMove?.(
        pos.x,
        Math.max(0, pos.y - 0.9),
        pos.z,
        this.player.camera.rotation.y,
        this.player.camera.rotation.x,
        activeCfg.id
      );
    }
  }

  private updateOfflineMatchTick(dt: number): void {
    const phase = this.matchManager.getPhase();
    if (phase !== 'playing') return;

    this.matchManager.update(dt);
    this.updateArcadeEffects(dt);

    // Dismiss onboarding overlay on first player movement
    if (this.showOnboarding && this.player.getHorizontalSpeed() > 0.3) {
      this.showOnboarding = false;
      this.onboardingDismissed = true;
    }

    // Low-health heartbeat audio pulse (~1Hz when alive and health ≤ 25)
    if (this.playerIsAlive && this.playerHealth <= 25) {
      this.heartbeatCooldown -= dt;
      if (this.heartbeatCooldown <= 0) {
        this.audio.playHeartbeatPulse();
        this.heartbeatCooldown = 1.0;
      }
    } else {
      this.heartbeatCooldown = 0;
    }

    if (this.matchManager.getPhase() === 'ended') {
      const snap = this.matchManager.getSnapshot();
      this.awardMatchCompletionXp(snap.winner === 'blue');
      this.player.setCanControl(false);
      this.player.exitPointerLock();
      this.weapons.setViewModelVisible(false);
      this.emitHudState(true);
      return;
    }

    if (this.playerSpawnProtection > 0) {
      this.playerSpawnProtection = Math.max(0, this.playerSpawnProtection - dt);
    }

    if (!this.playerIsAlive) {
      this.playerRespawnTimer -= dt;
      this.matchManager.setParticipantAlive('player', false, Math.max(0, this.playerRespawnTimer));
      if (this.playerRespawnTimer <= 0) {
        const spawn = this.botManager.pickBestSpawn('blue');
        const toCenterYaw = Math.atan2(-spawn.x, -spawn.z);
        this.resetPlayerForLife(spawn, toCenterYaw);
        this.weapons.resetForLife();
        this.weapons.setViewModelVisible(true);
        this.emitHudState(true);
      }
    }
  }

  private handleOfflinePlayerDamaged(
    damage: number,
    attackerId: string,
    attackerName: string,
    weaponName: string,
    headshot: boolean,
    distanceMeters: number,
    attackerPos: Vector3,
    attackerHpRemaining: number
  ): void {
    if (!this.playerIsAlive || this.matchManager.getPhase() !== 'playing') return;
    if (this.playerSpawnProtection > 0) return;

    this.playerHealth = Math.max(0, this.playerHealth - damage);
    this.lastDamageTimestamp = performance.now();
    const sanitizedPos = this.sanitizeAttackerPosition(attackerPos);
    if (sanitizedPos) {
      this.pushDamageIndicator(sanitizedPos);
    }
    this.audio.playPlayerHurt();

    if (this.playerHealth > 0) {
      this.player.applyDamageImpact(damage, sanitizedPos, headshot === true);
    } else {
      this.playerIsAlive = false;
      this.playerRespawnTimer = RESPAWN_DELAY_SEC;
      this.lastKillerName = attackerName;
      this.lastKillerWeapon = weaponName;
      this.killerBanner = {
        name: attackerName,
        team: 'red',
        weaponName,
        distanceMeters,
        headshot,
        killerHpRemaining: attackerHpRemaining,
      };
      this.onPlayerEliminatedCleanup(sanitizedPos);
      this.matchManager.recordKill(attackerId, 'player', weaponName, headshot, distanceMeters);

      if (this.matchManager.getPhase() === 'ended') {
        const snap = this.matchManager.getSnapshot();
        this.awardMatchCompletionXp(snap.winner === 'blue');
        this.player.setCanControl(false);
        this.player.exitPointerLock();
      }
      this.emitHudState(true);
    }
  }

  private sanitizeAttackerPosition(
    rawPos?: Vector3 | null,
    rawX?: number,
    rawY?: number,
    rawZ?: number
  ): Vector3 | null {
    let x: number;
    let y: number;
    let z: number;

    if (rawPos && typeof rawPos.x === 'number' && typeof rawPos.z === 'number') {
      x = rawPos.x;
      y = typeof rawPos.y === 'number' ? rawPos.y : 0;
      z = rawPos.z;
    } else if (typeof rawX === 'number' && typeof rawZ === 'number') {
      x = rawX;
      y = typeof rawY === 'number' ? rawY : 0;
      z = rawZ;
    } else {
      return null;
    }

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }

    const playerPos = this.player?.collider?.position;
    if (!playerPos || !Number.isFinite(playerPos.x) || !Number.isFinite(playerPos.z)) {
      return null;
    }

    const dx = x - playerPos.x;
    const dz = z - playerPos.z;

    if (Math.abs(dx) > 2000 || Math.abs(dz) > 2000) {
      return null;
    }

    const distSq = dx * dx + dz * dz;
    if (distSq < 0.01 || distSq > 4000000) {
      return null;
    }

    return new Vector3(x, y, z);
  }

  private pushDamageIndicator(attackerPos: Vector3): void {
    const pPos = this.player.collider.position;
    const dx = attackerPos.x - pPos.x;
    const dz = attackerPos.z - pPos.z;
    if (dx * dx + dz * dz < 0.01) return;

    const attackerBearing = Math.atan2(dx, dz);
    const relativeRad = attackerBearing - this.player.getYawRad();
    const angleDeg = (relativeRad * 180) / Math.PI;

    const now = performance.now();
    this.damageIndicators = [
      ...this.damageIndicators.filter((d) => now - d.timestamp < 950).slice(-4),
      { id: ++this.damageIndicatorSeq, angleDeg, timestamp: now },
    ];
  }

  private resetPlayerForLife(spawnPos: Vector3, yawRad: number): void {
    this.playerHealth = this.playerMaxHealth;
    this.playerIsAlive = true;
    this.playerRespawnTimer = 0;
    this.playerSpawnProtection = 1.5;
    this.lastKillerName = null;
    this.lastKillerWeapon = null;
    this.killerBanner = null;
    this.player.setDeathLookTarget(null);
    this.player.spawnAt(spawnPos, yawRad);
    if (this.sessionMode === 'offline') {
      this.matchManager.setParticipantAlive('player', true, 0);
    }
  }

  private setupLighting(): void {
    this.hemiLight = new HemisphericLight('hemiLight', new Vector3(0.15, 1, 0.2), this.scene);
    this.hemiLight.intensity = 0.52;
    this.hemiLight.diffuse = new Color3(0.82, 0.88, 0.96);
    this.hemiLight.groundColor = new Color3(0.16, 0.17, 0.2);

    this.sunLight = new DirectionalLight('sunLight', new Vector3(-0.48, -0.82, -0.32), this.scene);
    this.sunLight.position = new Vector3(24, 38, 18);
    this.sunLight.intensity = 1.48;
    this.sunLight.diffuse = new Color3(1.0, 0.94, 0.84);

    this.shadowGenerator = new ShadowGenerator(1024, this.sunLight);
    this.shadowGenerator.usePercentageCloserFiltering = true;
    this.shadowGenerator.bias = 0.0008;

    const rim = new DirectionalLight('rimLight', new Vector3(0.5, -0.4, 0.6), this.scene);
    rim.intensity = 0.3;
    rim.diffuse = new Color3(0.55, 0.72, 0.95);
  }

  private buildRadarBlips(): RadarBlip[] {
    const actors =
      this.sessionMode === 'multiplayer'
        ? this.remoteRenderer.getRadarActors()
        : this.botManager.getRadarActors();

    const localTeam: TeamId =
      this.sessionMode === 'multiplayer'
        ? (this.mpSnapshot?.players.find((p) => p.id === this.mpSnapshot?.localPlayerId)?.team ?? 'blue')
        : 'blue';

    const pPos = this.player.collider.position;
    const yaw = this.player.getYawRad();
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const uavActive = this.uavRemainingSec > 0;

    const blips: RadarBlip[] = [];
    for (const actor of actors) {
      if (!actor.isAlive) continue;
      const dx = actor.x - pPos.x;
      const dz = actor.z - pPos.z;
      const dist = Math.hypot(dx, dz);
      const isFriend = actor.team === localTeam;
      if (!isFriend && !uavActive && dist > PROXIMITY_REVEAL_METERS) {
        continue;
      }

      // Transform world delta into player-local radar coordinates (Up = forward, Right = +X)
      const localRight = (dx * cosY - dz * sinY) / RADAR_RANGE_METERS;
      const localForward = (dx * sinY + dz * cosY) / RADAR_RANGE_METERS;
      const mag = Math.hypot(localRight, localForward);
      const clampedMag = mag > 0.94 ? 0.94 / mag : 1;

      blips.push({
        id: actor.id,
        relX: localRight * clampedMag,
        relZ: localForward * clampedMag,
        team: actor.team,
      });
    }
    return blips;
  }

  private buildMultiplayerMatchSnapshot(): MatchSnapshot {
    const snap = this.mpSnapshot!;
    const mapDef = MAP_REGISTRY[snap.mapId] ?? MAP_REGISTRY.urban;

    const phase =
      snap.phase === 'ended'
        ? 'ended'
        : snap.phase === 'playing'
          ? this.mpPaused
            ? 'paused'
            : 'playing'
          : 'menu';

    const participants = [...snap.players]
      .sort((a, b) => (b.kills !== a.kills ? b.kills - a.kills : a.deaths - b.deaths))
      .map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        isPlayer: p.id === snap.localPlayerId,
        kills: p.kills,
        deaths: p.deaths,
        isAlive: p.isAlive,
        respawnTimer: p.respawnTimer,
      }));

    return {
      phase,
      mapId: snap.mapId,
      mapName: mapDef.name,
      blueScore: snap.blueScore,
      redScore: snap.redScore,
      killLimit: snap.killLimit,
      timeRemainingSec: snap.timeRemaining,
      winner: snap.winner === '' ? null : snap.winner,
      participants,
      killFeed: [...this.mpKillFeed],
    };
  }

  private emitHudState(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastHudEmitTime < 33) return;
    this.lastHudEmitTime = now;

    if (this.damageIndicators.length > 0) {
      this.damageIndicators = this.damageIndicators.filter((d) => now - d.timestamp < 950);
    }
    if (this.scorePopups.length > 0) {
      this.scorePopups = this.scorePopups.filter((p) => now - p.timestamp < 1450);
    }
    if (this.killstreakBanner && now - this.killstreakBanner.timestamp > 4500) {
      this.killstreakBanner = null;
    }

    const stats = this.weapons.getStats();
    const match =
      this.sessionMode === 'multiplayer' && this.mpSnapshot
        ? this.buildMultiplayerMatchSnapshot()
        : this.matchManager.getSnapshot();

    const rank = getRankSummary(this.xpTotal);
    const killstreaks: KillstreakSlotState[] = [
      {
        id: 'uav',
        key: 'F1',
        name: 'UAV Sweep',
        requiredKills: 3,
        unlocked: this.unlockedStreaks.uav,
        active: this.uavRemainingSec > 0,
        remainingSec: Math.ceil(this.uavRemainingSec),
      },
      {
        id: 'airstrike',
        key: 'F2',
        name: 'Barrage',
        requiredKills: 5,
        unlocked: this.unlockedStreaks.airstrike,
        active: this.barrageShells.length > 0,
        remainingSec: 0,
      },
      {
        id: 'overdrive',
        key: 'F3',
        name: 'Overdrive',
        requiredKills: 7,
        unlocked: this.unlockedStreaks.overdrive,
        active: this.overdriveRemainingSec > 0,
        remainingSec: Math.ceil(this.overdriveRemainingSec),
      },
    ];

    this.callbacks.onHudUpdate({
      isPointerLocked: this.player.getIsPointerLocked(),
      health: this.playerHealth,
      maxHealth: this.playerMaxHealth,
      isAlive: this.playerIsAlive,
      respawnTimer: Math.max(0, this.playerRespawnTimer),
      lastDamageTimestamp: this.lastDamageTimestamp,
      damageIndicators: [...this.damageIndicators],
      lastKillerName: this.lastKillerName,
      lastKillerWeapon: this.lastKillerWeapon,
      killerBanner: this.killerBanner,
      stance: this.player.getStance(),
      isGrounded: this.player.getIsGrounded(),
      isAds: this.player.getIsAds(),
      adsBlend: this.player.getAdsBlend(),
      speed: Math.round(this.player.getHorizontalSpeed() * 10) / 10,
      headingDeg: Math.round(this.player.getHeadingDeg()),
      activeWeapon: this.weapons.getActiveConfig(),
      weaponSlots: this.weapons.getWeaponSlots(),
      isReloading: this.weapons.getIsReloading(),
      reloadProgress: this.weapons.getReloadProgress(),
      crosshairSpreadPx: this.weapons.getCrosshairSpreadPx(),
      hitMarker: stats.hitMarker,
      shotsFired: stats.shotsFired,
      shotsHit: stats.shotsHit,
      headshots: stats.headshots,
      eliminations: stats.eliminations,
      currentStreak: this.currentStreak,
      killstreaks,
      uavActive: this.uavRemainingSec > 0,
      uavPulseProgress: (this.uavPulseTimer % 2.0) / 2.0,
      overdriveActive: this.overdriveRemainingSec > 0,
      overdriveRemainingSec: Math.ceil(this.overdriveRemainingSec),
      killstreakBanner: this.killstreakBanner,
      scorePopups: [...this.scorePopups],
      radarBlips: match.phase === 'playing' || match.phase === 'paused' ? this.buildRadarBlips() : [],
      xp: rank.xp,
      sessionXpEarned: this.sessionXpEarned,
      rankLevel: rank.level,
      rankTitle: rank.title,
      rankProgressPct: rank.progressPct,
      rangeDistanceMeters: stats.rangeDistanceMeters,
      targetingEnemy: stats.targetingEnemy,
      scopeMagnification: this.weapons.getScopeMagnification(),
      showScoreboard: this.showScoreboard,
      showOnboarding: this.showOnboarding,
      lowHealthPulse: this.playerIsAlive && this.playerHealth <= 25,
      fps: Math.round(this.engine.getFps()),
      match,
    });
  }

  private onResize = (): void => {
    this.engine.resize();
  };

  private onWebGLContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onContextLost(true);
  };

  private onWebGLContextRestored = (): void => {
    this.callbacks.onContextLost(false);
  };

  private bindLifecycleEvents(): void {
    window.addEventListener('resize', this.onResize);
    this.canvas.addEventListener('webglcontextlost', this.onWebGLContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onWebGLContextRestored);
  }

  public dispose(): void {
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('webglcontextlost', this.onWebGLContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onWebGLContextRestored);

    this.resetCombatArcadeState(true);
    this.weapons.dispose();
    this.remoteRenderer.dispose();
    this.botManager.dispose();
    this.player.dispose();
    this.mapManager.dispose();
    this.audio.dispose();
    this.glowLayer?.dispose();
    this.glowLayer = null;
    this.renderPipeline?.dispose();
    this.renderPipeline = null;
    this.shadowGenerator?.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
