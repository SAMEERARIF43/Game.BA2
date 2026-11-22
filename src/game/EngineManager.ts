import {
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  Engine,
  GlowLayer,
  HemisphericLight,
  ImageProcessingConfiguration,
  Matrix,
  Mesh,
  MeshBuilder,
  PointLight,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
  Viewport,
} from '@babylonjs/core';
import { BotManager } from '../bots/BotManager';
import { MAP_REGISTRY, MapManager } from '../maps/MapManager';
import { MapDefinition, MapId, TeamId } from '../maps/types';
import { MatchManager, RESPAWN_DELAY_SEC } from '../match/MatchManager';
import { RemotePlayerRenderer } from '../multiplayer/RemotePlayerRenderer';
import {
  LobbyRoomSnapshot,
  NetworkDamagedEvent,
  NetworkHitConfirmEvent,
  NetworkKillFeedEvent,
  NetworkPingEvent,
  RemoteFireEvent,
} from '../multiplayer/types';
import {
  addProgressionReward,
  getRankSummary,
  loadProgression,
} from '../settings/progressionStorage';
import { AudioEngine } from './AudioEngine';
import {
  GUN_LOCKED_WHILE_ALIVE_MESSAGE,
  applyCharacterSelection,
  applyGunSelection,
  canSwitchGunImmediately,
  normalizeCharacterId,
  normalizeGunId,
  normalizeKnifeCharmId,
} from './loadoutRules';
import {
  OperatorPalette,
  OperatorRig,
  buildOperatorRig,
  createOperatorPalette,
} from './OperatorMeshBuilder';
import { PingSystem, resolvePingRaycast } from './PingSystem';
import { PlayerController } from './PlayerController';
import { ARENA_HALF_EXTENT } from './minimap';
import type { ChatChannel } from '../multiplayer/chat';
import {
  BOMB_DEFUSE_DURATION_SEC,
  BOMB_DETONATE_DURATION_SEC,
  BOMB_PLANT_DURATION_SEC,
  BOMB_SITE_RADIUS,
  FFA_RESPAWN_DELAY_SEC,
  GameMode,
  isHostile as checkActorsHostile,
  normalizeGameMode,
  sortFfaParticipants,
} from './gameModeRules';
import {
  BombPhase,
  BombSiteHudMarker,
  BombStateSnapshot,
  CharacterId,
  DamageIndicator,
  GUN_IDS,
  GameSettings,
  GraphicsQuality,
  GunId,
  HudState,
  KillFeedEntry,
  KillerBannerInfo,
  KillstreakBanner,
  KillstreakId,
  KillstreakSlotState,
  KnifeCharmId,
  MatchPhase,
  MatchSnapshot,
  MinimapActor,
  MinimapState,
  RadarBlip,
  ScorePopup,
  Stance,
  WeaponId,
} from './types';
import { DEFAULT_KEYBINDINGS, formatKeyCode } from '../settings/keybindings';
import { WeaponSystem } from './WeaponSystem';

export interface InitProgressState {
  active: boolean;
  progress: number;
  stage: string;
}

export interface EngineCallbacks {
  onHudUpdate: (hud: HudState) => void;
  onContextLost: (lost: boolean) => void;
  onInitProgress?: (state: InitProgressState) => void;
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
    pellets?: Array<{
      endX: number;
      endY: number;
      endZ: number;
      targetId?: string;
      zone?: 'head' | 'body';
    }>;
  }) => void;
  onMultiplayerMove?: (
    x: number,
    y: number,
    z: number,
    rotY: number,
    pitch: number,
    weaponId: WeaponId,
    characterId: CharacterId,
    stance: Stance
  ) => void;
  onMultiplayerPing?: (payload: {
    id: string;
    kind: 'location' | 'enemy';
    x: number;
    y: number;
    z: number;
    targetId?: string;
  }) => void;
  onGunPersistedChange?: (gunId: GunId) => void;
  onChatOpenChange?: (open: boolean, channel: ChatChannel) => void;
  onMultiplayerBombInteract?: (holding: boolean) => void;
  onMultiplayerRespawnRequest?: (weaponId: GunId) => void;
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
  private pingSystem: PingSystem;
  private player: PlayerController;
  private weapons: WeaponSystem;
  private callbacks: EngineCallbacks;

  private settings: GameSettings;
  private sessionMode: 'offline' | 'multiplayer' = 'offline';
  private gameMode: GameMode = 'tdm';
  private mpPaused = false;
  private mpSnapshot: LobbyRoomSnapshot | null = null;
  private mpKillFeed: KillFeedEntry[] = [];
  private lastMoveSendTime = 0;
  private lastPingPlacementTime = 0;
  private localPingSeq = 0;
  private chatOpen = false;
  private customChatEnabled = false;
  private lastSentBombInteract = false;
  private prevMpRoundNumber = 1;
  private lastBombPhase: BombPhase = 'unplanted';
  private bombBeepCooldown = 0;

  private bombSiteVisualRoot: TransformNode | null = null;
  private bombSiteVisualMaterials: StandardMaterial[] = [];
  private plantedBombRoot: TransformNode | null = null;
  private plantedBombMaterials: StandardMaterial[] = [];
  private plantedBombLedMat: StandardMaterial | null = null;
  private readonly bombProjIdentity = Matrix.Identity();
  private readonly bombProjViewport = new Viewport(0, 0, 1, 1);
  private readonly bombWorldScratch = new Vector3();
  private readonly bombForwardScratch = new Vector3();
  private readonly bombDeltaScratch = new Vector3();

  private elapsedTime = 0;
  private lastHudEmitTime = 0;
  private initFallbackTimer: number | null = null;
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

  private selectedCharacterId: CharacterId;
  private showcasePivot: TransformNode | null = null;
  private showcasePalette: OperatorPalette | null = null;
  private showcaseRig: OperatorRig | null = null;
  private showcaseFillLight: PointLight | null = null;
  private showcaseRimLight: PointLight | null = null;
  private menuShowcaseVisible = true;
  private menuShowcaseFocus: 'gun' | 'knife' = 'gun';
  private showcaseTargetOffsetX = 0;

  constructor(canvas: HTMLCanvasElement, initialSettings: GameSettings, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    this.settings = { ...initialSettings };
    this.selectedCharacterId = normalizeCharacterId(initialSettings.selectedCharacterId);
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
    this.callbacks.onInitProgress?.({
      active: true,
      progress: 25,
      stage: 'Initializing 3D renderer & audio',
    });

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
    this.pingSystem = new PingSystem(this.scene);

    this.player = new PlayerController(this.scene, this.canvas, this.audio, {
      onFirePress: () => this.weapons.onFirePress(),
      onFireRelease: () => this.weapons.onFireRelease(),
      onSecondaryPress: () => this.weapons.onSecondaryFire(),
      onAdsChange: () => this.emitHudState(true),
      onReload: () => {
        this.weapons.startReload();
        this.emitHudState(true);
      },
      onSelectSlot: (slot) => {
        this.weapons.selectSlot(slot);
        this.emitHudState(true);
      },
      onQuickMelee: () => {
        this.weapons.triggerQuickMelee();
        this.emitHudState(true);
      },
      onDeadGunHotkey: (gunIndex) => {
        this.handleDeadGunHotkey(gunIndex);
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
      onPing: () => {
        this.placePing();
      },
      onOpenChat: (channel) => {
        this.openChatInput(channel);
      },
      onPointerLockChange: (locked) => {
        if (locked && this.chatOpen) {
          this.chatOpen = false;
          this.player.setChatInputOpen(false);
          this.callbacks.onChatOpenChange?.(false, 'all');
        }
        if (this.sessionMode === 'offline') {
          if (!locked && this.matchManager.getPhase() === 'playing') {
            if (!this.chatOpen && this.playerIsAlive) {
              this.matchManager.setPhase('paused');
              this.weapons.cancelTransientActions();
            }
          } else if (locked && this.matchManager.getPhase() === 'paused') {
            this.matchManager.setPhase('playing');
          }
        } else if (this.mpSnapshot?.phase === 'playing') {
          if (!locked) {
            if (!this.chatOpen && this.playerIsAlive) {
              this.mpPaused = true;
              this.weapons.cancelTransientActions();
            }
          } else {
            this.mpPaused = false;
          }
        }
        this.emitHudState(true);
      },
      onFocusLost: () => {
        if (this.chatOpen) {
          this.closeChatInput(false);
        }
        if (this.sessionMode === 'offline' && this.matchManager.getPhase() === 'playing') {
          this.matchManager.setPhase('paused');
          this.weapons.cancelTransientActions();
          this.player.exitPointerLock();
          this.emitHudState(true);
        } else if (this.sessionMode === 'multiplayer' && this.mpSnapshot?.phase === 'playing') {
          this.mpPaused = true;
          this.weapons.cancelTransientActions();
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
    this.player.setKeybindings(initialSettings.keybindings ?? DEFAULT_KEYBINDINGS);
    this.player.setSlideSettings({
      slideEnabled: initialSettings.slideEnabled,
      slideInputMode: initialSettings.slideInputMode,
      slidePostStance: initialSettings.slidePostStance,
      slideJumpCancel: initialSettings.slideJumpCancel,
      slideCameraTilt: initialSettings.slideCameraTilt,
      slideTrigger: initialSettings.slideTrigger,
      postSlideStance: initialSettings.postSlideStance,
      jumpCancelsSlide: initialSettings.jumpCancelsSlide,
      slideCameraIntensity: initialSettings.slideCameraIntensity,
    });

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
          pellets: shot.pellets?.map((p) => ({
            endX: p.endPoint.x,
            endY: p.endPoint.y,
            endZ: p.endPoint.z,
            targetId: p.targetId,
            zone: p.zone,
          })),
        });
      },
      (info) => {
        this.handlePlayerKillCredit(info.headshot, info.distanceMeters, info.victimName);
      },
      normalizeGunId(initialSettings.selectedGunId),
      normalizeKnifeCharmId(initialSettings.knifeCharmId)
    );

    this.callbacks.onInitProgress?.({
      active: true,
      progress: 55,
      stage: 'Building weapon & operator models',
    });
    this.setupMenuShowcase();
    this.setupPostProcessing();
    this.applyGraphicsQuality(initialSettings.graphicsQuality);
    this.bindLifecycleEvents();
    this.callbacks.onInitProgress?.({
      active: true,
      progress: 78,
      stage: 'Loading tactical arena assets',
    });
    this.previewMap('urban');
    this.callbacks.onInitProgress?.({
      active: true,
      progress: 92,
      stage: 'Compiling WebGL shaders',
    });

    let initSettled = false;
    const finishInit = () => {
      if (initSettled || this.disposed) return;
      initSettled = true;
      if (this.initFallbackTimer !== null) {
        window.clearTimeout(this.initFallbackTimer);
        this.initFallbackTimer = null;
      }
      this.callbacks.onInitProgress?.({
        active: false,
        progress: 100,
        stage: 'Ready',
      });
    };

    this.initFallbackTimer = window.setTimeout(finishInit, 1800);
    this.scene.executeWhenReady(() => {
      window.requestAnimationFrame(finishInit);
    });

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
          this.animateMenuShowcase(dt);
        } else {
          this.updateOfflineMatchTick(dt);
          const activeCfg = this.weapons.getActiveConfig();
          this.player.update(dt, activeCfg.adsFovRatio);
          this.weapons.update(dt);
          this.botManager.update(dt);
          this.pingSystem.update(dt, this.player.camera, (targetId) =>
            this.botManager.getBotTargetPosition(targetId)
          );
        }
      }

      this.scene.render();
      this.emitHudState(false);
    });
  }

  public setCustomChatEnabled(enabled: boolean): void {
    this.customChatEnabled = enabled;
    this.player.setChatTriggersEnabled(enabled);
    if (!enabled && this.chatOpen) {
      this.closeChatInput(false);
    }
  }

  public openChatInput(channel: ChatChannel = 'all'): void {
    if (!this.customChatEnabled) return;
    const phase = this.getCurrentMatchPhase();
    if (phase !== 'playing' || !this.playerIsAlive) return;
    this.chatOpen = true;
    this.player.setChatInputOpen(true);
    this.weapons.cancelTransientActions();
    this.showScoreboard = false;
    this.showOnboarding = false;
    this.player.exitPointerLock();
    this.callbacks.onChatOpenChange?.(true, channel);
    this.emitHudState(true);
  }

  public closeChatInput(restorePointerLock: boolean): void {
    const wasOpen = this.chatOpen;
    this.chatOpen = false;
    this.player.setChatInputOpen(false);
    if (wasOpen) {
      this.callbacks.onChatOpenChange?.(false, 'all');
    }
    if (restorePointerLock) {
      const phase = this.getCurrentMatchPhase();
      if (phase === 'playing' && this.playerIsAlive) {
        this.player.requestPointerLock();
      }
    }
    this.emitHudState(true);
  }

  public previewMap(mapId: MapId): void {
    this.sessionMode = 'offline';
    this.gameMode = normalizeGameMode(this.settings.selectedGameMode, 'tdm');
    this.mpSnapshot = null;
    this.mpPaused = false;
    this.lastSentBombInteract = false;
    this.setCustomChatEnabled(false);
    this.closeChatInput(false);
    this.clearBombVisuals();
    this.playerHealth = this.playerMaxHealth;
    this.playerIsAlive = true;
    this.playerRespawnTimer = 0;
    this.playerSpawnProtection = 0;
    this.lastKillerName = null;
    this.lastKillerWeapon = null;
    this.player.setDeadState(false);
    this.resetCombatArcadeState(true);
    this.remoteRenderer.clear();
    this.pingSystem.clear();
    this.weapons.setEquippedGun(this.weapons.getQueuedGunId());
    this.weapons.resetForNewMatch();
    this.weapons.setGameMode(this.gameMode);
    this.weapons.setMultiplayerContext(false, 'blue', false);
    this.player.exitPointerLock();
    this.player.setCanControl(false);
    this.player.setOrbitPreview(true);
    this.weapons.cancelTransientActions();
    this.weapons.setViewModelVisible(false);
    this.botManager.clearBots();
    this.matchManager.setPhase('menu');
    const def = this.mapManager.loadMap(mapId);
    this.applyMapColorGrading(def.exposure, def.contrast);
    this.audio.setAmbientEnvironment('menu');
    this.updateMenuShowcaseVisuals();
    this.emitHudState(true);
  }

  public startMatch(
    mapId: MapId,
    requestLock: boolean,
    customOptions?: {
      mode?: GameMode;
      killLimit?: number;
      timeLimitSec?: number;
      botsPerTeam?: number;
      isCustomMatch?: boolean;
      playerName?: string;
    }
  ): void {
    this.sessionMode = 'offline';
    this.mpSnapshot = null;
    this.mpPaused = false;
    this.lastSentBombInteract = false;
    const mode = normalizeGameMode(customOptions?.mode ?? this.settings.selectedGameMode, 'tdm');
    this.gameMode = mode;
    const isCustom = Boolean(customOptions?.isCustomMatch);
    this.setCustomChatEnabled(isCustom);
    this.closeChatInput(false);
    this.resetCombatArcadeState(true);
    this.remoteRenderer.clear();
    this.pingSystem.clear();
    this.pingSystem.setLocalTeam('blue');
    this.weapons.setGameMode(mode);
    this.weapons.setMultiplayerContext(false, 'blue', false);
    this.botManager.setGameMode(mode);

    const def =
      this.mapManager.getCurrentMapId() === mapId
        ? this.mapManager.getCurrentDefinition()
        : this.mapManager.loadMap(mapId);

    this.applyMapColorGrading(def.exposure, def.contrast);
    this.audio.setAmbientEnvironment(def.id);

    this.matchManager.configureMatch(
      def.id,
      def.name,
      customOptions?.killLimit ?? this.settings.killLimit,
      customOptions?.botsPerTeam ?? this.settings.botsPerTeam,
      {
        mode,
        timeLimitSec: customOptions?.timeLimitSec,
        isCustomMatch: isCustom,
        playerName: customOptions?.playerName ?? this.settings.callsign,
        bombSites: def.bombSites.map((s) => ({
          id: s.id,
          x: s.position.x,
          y: s.position.y,
          z: s.position.z,
          radius: s.radius,
        })),
      }
    );

    this.botManager.spawnBotsForMatch(
      def,
      this.matchManager.getBlueBotParticipants(),
      this.matchManager.getRedBotParticipants()
    );
    this.rebuildBombVisuals(def, mode === 'bomb');

    this.weapons.setEquippedGun(this.weapons.getQueuedGunId());
    this.weapons.resetForNewMatch();
    const initialSpawn = def.blueSpawns[0] ?? new Vector3(0, 1, -20);
    const initialYaw = mode === 'ffa' ? Math.atan2(-initialSpawn.x, -initialSpawn.z) : 0;
    this.resetPlayerForLife(initialSpawn, initialYaw);

    this.player.setOrbitPreview(false);
    this.player.setCanControl(true);
    this.weapons.setViewModelVisible(true);
    this.updateMenuShowcaseVisuals();
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
    const mode = normalizeGameMode(snapshot.mode, 'tdm');
    this.gameMode = mode;
    this.prevMpRoundNumber = snapshot.roundNumber ?? 1;
    this.lastSentBombInteract = false;
    this.setCustomChatEnabled(true);
    this.closeChatInput(false);
    this.botManager.clearBots();
    this.pingSystem.clear();
    this.resetCombatArcadeState(true);
    this.mpSnapshot = snapshot;
    this.mpPaused = !requestLock;

    const def =
      this.mapManager.getCurrentMapId() !== snapshot.mapId
        ? this.mapManager.loadMap(snapshot.mapId)
        : this.mapManager.getCurrentDefinition();
    this.applyMapColorGrading(def.exposure, def.contrast);
    this.audio.setAmbientEnvironment(snapshot.mapId);
    this.rebuildBombVisuals(def, mode === 'bomb');

    const local = snapshot.players.find((p) => p.id === snapshot.localPlayerId);
    const localTeam = local?.team ?? 'blue';
    this.pingSystem.setLocalTeam(localTeam);
    this.weapons.setGameMode(mode);
    this.weapons.setMultiplayerContext(true, localTeam, snapshot.friendlyFire);
    this.weapons.setEquippedGun(this.weapons.getQueuedGunId());
    this.weapons.resetForNewMatch();

    const spawnX = local?.x ?? 0;
    const spawnY = (local?.y ?? 0) + 0.95;
    const spawnZ = local?.z ?? (localTeam === 'blue' ? -20 : 20);
    const spawnRotY = local?.rotY ?? (localTeam === 'blue' ? 0 : Math.PI);

    this.resetPlayerForLife(new Vector3(spawnX, spawnY, spawnZ), spawnRotY);
    this.player.setOrbitPreview(false);
    this.player.setCanControl(true);
    this.weapons.setViewModelVisible(true);
    this.updateMenuShowcaseVisuals();
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
    const mode = normalizeGameMode(snapshot.mode, 'tdm');

    if (snapshot.phase === 'lobby') {
      this.gameMode = mode;
      this.closeChatInput(false);
      this.setCustomChatEnabled(true);
      this.clearBombVisuals();
      this.lastSentBombInteract = false;
      if (this.mapManager.getCurrentMapId() !== snapshot.mapId) {
        const def = this.mapManager.loadMap(snapshot.mapId);
        this.applyMapColorGrading(def.exposure, def.contrast);
      }
      this.audio.setAmbientEnvironment('menu');
      this.mpPaused = false;
      this.playerHealth = this.playerMaxHealth;
      this.playerIsAlive = true;
      this.playerRespawnTimer = 0;
      this.playerSpawnProtection = 0;
      this.lastKillerName = null;
      this.lastKillerWeapon = null;
      this.player.setDeadState(false);
      this.weapons.setGameMode(mode);
      this.weapons.setEquippedGun(this.weapons.getQueuedGunId());
      if (this.sessionMode === 'multiplayer') {
        this.remoteRenderer.clear();
        this.pingSystem.clear();
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
      this.setCustomChatEnabled(true);
      if (
        this.sessionMode !== 'multiplayer' ||
        this.mapManager.getCurrentMapId() !== snapshot.mapId ||
        this.gameMode !== mode
      ) {
        this.startMultiplayerMatch(snapshot, true);
        return;
      }

      if (mode === 'bomb' && !this.bombSiteVisualRoot) {
        this.rebuildBombVisuals(this.mapManager.getCurrentDefinition(), true);
      }
      if ((snapshot.roundNumber ?? 1) !== this.prevMpRoundNumber) {
        this.prevMpRoundNumber = snapshot.roundNumber ?? 1;
        this.lastBombPhase = 'unplanted';
        this.bombBeepCooldown = 0;
        this.lastSentBombInteract = false;
      }

      const local = snapshot.players.find((p) => p.id === snapshot.localPlayerId);
      if (local) {
        this.playerHealth = local.health;
        this.playerIsAlive = local.isAlive;
        this.playerRespawnTimer = local.respawnTimer;
        if (!local.isAlive && this.chatOpen) {
          this.closeChatInput(false);
        }
        this.pingSystem.setLocalTeam(local.team);
        this.weapons.setGameMode(mode);
        this.weapons.setMultiplayerContext(true, local.team, snapshot.friendlyFire);
      }

      this.remoteRenderer.syncPlayers(snapshot.players, snapshot.localPlayerId);
    } else if (snapshot.phase === 'ended') {
      this.closeChatInput(false);
      this.mpPaused = false;
      this.lastSentBombInteract = false;
      this.clearBombVisuals();
      this.pingSystem.clear();
      this.player.setCanControl(false);
      this.player.exitPointerLock();
      this.weapons.cancelTransientActions();
      this.weapons.setViewModelVisible(false);
      this.remoteRenderer.syncPlayers(snapshot.players, snapshot.localPlayerId);
      const local = snapshot.players.find((p) => p.id === snapshot.localPlayerId);
      const won =
        mode === 'ffa'
          ? Boolean(snapshot.winnerId && snapshot.winnerId === snapshot.localPlayerId)
          : Boolean(local && snapshot.winner === local.team);
      this.awardMatchCompletionXp(won);
    }

    this.emitHudState(true);
  }

  public handleRemoteFire(event: RemoteFireEvent): void {
    this.remoteRenderer.spawnRemoteFire(event);
  }

  public handleNetworkPing(event: NetworkPingEvent): void {
    if (this.sessionMode !== 'multiplayer' || this.mpSnapshot?.phase !== 'playing') return;
    if (this.mpSnapshot.mode === 'ffa' && event.senderId !== this.mpSnapshot.localPlayerId) {
      return;
    }
    const local = this.mpSnapshot.players.find((p) => p.id === this.mpSnapshot?.localPlayerId);
    const localTeam = local?.team ?? 'blue';
    if (event.team !== localTeam) return;

    this.pingSystem.setLocalTeam(localTeam);
    this.pingSystem.upsertPing({
      id: event.id,
      senderId: event.senderId,
      senderName: event.senderName,
      team: event.team,
      kind: event.kind,
      x: event.x,
      y: event.y,
      z: event.z,
      targetId: event.targetId,
      durationSec: Math.max(1.5, event.durationMs / 1000),
    });

    if (event.senderId !== this.mpSnapshot.localPlayerId) {
      this.audio.playPing(event.kind === 'enemy');
    }
    this.emitHudState(true);
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
    this.weapons.applyQueuedGunOnRespawn();
    this.weapons.setViewModelVisible(true);
    this.lastMoveSendTime = 0;
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
    this.closeChatInput(false);
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
    const isCustom = this.matchManager.getIsCustomMatch();
    const snap = this.matchManager.getSnapshot();
    this.startMatch(currentId, true, {
      mode: snap.mode,
      killLimit: isCustom ? snap.killLimit : undefined,
      isCustomMatch: isCustom,
      playerName: this.settings.callsign,
    });
  }

  public returnToMenu(): void {
    this.setCustomChatEnabled(false);
    this.closeChatInput(false);
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
    this.player.setKeybindings(settings.keybindings ?? DEFAULT_KEYBINDINGS);
    this.player.setSlideSettings({
      slideEnabled: settings.slideEnabled,
      slideInputMode: settings.slideInputMode,
      slidePostStance: settings.slidePostStance,
      slideJumpCancel: settings.slideJumpCancel,
      slideCameraTilt: settings.slideCameraTilt,
      slideTrigger: settings.slideTrigger,
      postSlideStance: settings.postSlideStance,
      jumpCancelsSlide: settings.jumpCancelsSlide,
      slideCameraIntensity: settings.slideCameraIntensity,
    });
    this.audio.setVolumes(settings.volume, settings.sfxVolume, settings.musicVolume, settings.muted);
    this.applyGraphicsQuality(settings.graphicsQuality);
    if (settings.knifeCharmId !== this.weapons.getKnifeCharmId()) {
      this.weapons.setKnifeCharm(settings.knifeCharmId);
    }
    const nextChar = normalizeCharacterId(settings.selectedCharacterId);
    if (nextChar !== this.selectedCharacterId) {
      this.selectedCharacterId = nextChar;
      this.rebuildMenuShowcaseRig();
    }
    this.updateMenuShowcaseVisuals();
    this.emitHudState(true);
  }

  public setMenuShowcaseVisible(visible: boolean): void {
    this.menuShowcaseVisible = visible;
    this.updateMenuShowcaseVisuals();
  }

  public setMenuShowcaseFocus(focus: 'gun' | 'knife', offsetX = 0): void {
    this.menuShowcaseFocus = focus;
    this.showcaseTargetOffsetX = offsetX;
    this.updateMenuShowcaseVisuals();
  }

  public playUiAudioCue(cue: 'click' | 'toggle' | 'sfx_preview' = 'click'): void {
    if (cue === 'sfx_preview') {
      this.audio.playWeaponEquip();
      return;
    }
    this.audio.playUiClick(cue);
  }

  private setupMenuShowcase(): void {
    const pivot = new TransformNode('menuShowcasePivot', this.scene);
    pivot.parent = this.player.camera;
    pivot.position.set(0, -0.84, 2.38);

    const palette = createOperatorPalette(this.scene, 'blue', 'showcaseOp');

    const fill = new PointLight('menuShowcaseFillLight', new Vector3(0.85, 1.38, -0.9), this.scene);
    fill.parent = pivot;
    fill.diffuse = new Color3(1.0, 0.96, 0.9);
    fill.specular = new Color3(0.55, 0.56, 0.6);
    fill.intensity = 2.4;
    fill.range = 6.0;
    fill.shadowEnabled = false;

    const rim = new PointLight('menuShowcaseRimLight', new Vector3(-1.05, 1.48, 0.95), this.scene);
    rim.parent = pivot;
    rim.diffuse = new Color3(0.45, 0.75, 1.0);
    rim.specular = new Color3(0.35, 0.45, 0.62);
    rim.intensity = 2.1;
    rim.range = 6.0;
    rim.shadowEnabled = false;

    this.showcasePivot = pivot;
    this.showcasePalette = palette;
    this.showcaseFillLight = fill;
    this.showcaseRimLight = rim;

    this.rebuildMenuShowcaseRig();
  }

  private rebuildMenuShowcaseRig(): void {
    if (!this.showcasePivot || !this.showcasePalette) return;

    if (this.showcaseRig) {
      this.showcaseRig.root.dispose();
      this.showcaseRig.bodyMat.dispose();
      this.showcaseRig.headMat.dispose();
      this.showcaseRig = null;
    }

    const rig = buildOperatorRig(this.scene, {
      id: `menu_showcase_${this.selectedCharacterId}`,
      team: 'blue',
      palette: this.showcasePalette,
      characterId: this.selectedCharacterId,
      buildAllWeapons: true,
      initialWeaponId: this.weapons.getEquippedGunId(),
      initialCharmId: this.weapons.getKnifeCharmId(),
      isPickableHitboxes: false,
      renderingGroupId: 0,
    });
    rig.root.parent = this.showcasePivot;
    rig.root.rotation.y = Math.PI - 0.34;

    const showcaseMeshes = rig.root.getChildMeshes(false);
    if (this.showcaseFillLight) {
      this.showcaseFillLight.includedOnlyMeshes = showcaseMeshes;
    }
    if (this.showcaseRimLight) {
      this.showcaseRimLight.includedOnlyMeshes = showcaseMeshes;
    }

    this.showcaseRig = rig;
  }

  private updateMenuShowcaseVisuals(): void {
    if (!this.showcasePivot || !this.showcaseRig) return;
    const active =
      this.menuShowcaseVisible &&
      this.sessionMode === 'offline' &&
      this.matchManager.getPhase() === 'menu';

    this.showcasePivot.setEnabled(active);
    this.showcaseFillLight?.setEnabled(active);
    this.showcaseRimLight?.setEnabled(active);

    if (active) {
      const displayWeapon =
        this.menuShowcaseFocus === 'knife' ? 'knife' : this.weapons.getEquippedGunId();
      this.showcaseRig.setWeapon(displayWeapon);
      this.showcaseRig.setCharm(this.weapons.getKnifeCharmId());
    }
  }

  private animateMenuShowcase(dt: number): void {
    if (!this.showcasePivot || !this.showcaseRig || !this.showcasePivot.isEnabled()) return;
    const lerp = 1 - Math.exp(-8 * dt);
    this.showcasePivot.position.x +=
      (this.showcaseTargetOffsetX - this.showcasePivot.position.x) * lerp;
    this.showcaseRig.upperBodyPivot.position.y = 0.8 + Math.sin(this.elapsedTime * 1.9) * 0.012;
    this.showcaseRig.root.rotation.y =
      Math.PI - 0.34 + Math.sin(this.elapsedTime * 0.6) * 0.16;
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
      const kb = this.settings.keybindings ?? DEFAULT_KEYBINDINGS;
      if (this.currentStreak === 3 && !this.unlockedStreaks.uav) {
        this.unlockedStreaks.uav = true;
        this.audio.playKillstreakReady();
        this.pushKillstreakBanner(
          `[${formatKeyCode(kb.streakUav)}] UAV SWEEP READY`,
          'Enemy positions will appear on your radar'
        );
      } else if (this.currentStreak === 5 && !this.unlockedStreaks.airstrike) {
        this.unlockedStreaks.airstrike = true;
        this.audio.playKillstreakReady();
        this.pushKillstreakBanner(
          `[${formatKeyCode(kb.streakBarrage)}] PRECISION BARRAGE READY`,
          'Ordnance support is standing by'
        );
      } else if (this.currentStreak === 7 && !this.unlockedStreaks.overdrive) {
        this.unlockedStreaks.overdrive = true;
        this.audio.playKillstreakReady();
        this.pushKillstreakBanner(
          `[${formatKeyCode(kb.streakOverdrive)}] TACTICAL OVERDRIVE READY`,
          'Speed, reload and armor regen boosted'
        );
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
    this.closeChatInput(false);
    this.currentStreak = 0;
    this.overdriveRemainingSec = 0;
    this.overdriveHealAccum = 0;
    this.player.setMoveSpeedMultiplier(1.0);
    this.weapons.setReloadSpeedMultiplier(1.0);
    this.player.setDeathLookTarget(attackerPos);
    this.player.setDeadState(true);
    this.player.exitPointerLock();
    this.weapons.setViewModelVisible(false);
    this.weapons.cancelTransientActions();
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
    pipeline.imageProcessing.exposure = 1.12;
    pipeline.imageProcessing.contrast = 1.18;
    pipeline.imageProcessing.vignetteColor = new Color4(0.01, 0.015, 0.025, 0);
    pipeline.sharpenEnabled = false;
    this.renderPipeline = pipeline;
  }

  private applyMapColorGrading(exposure = 1.12, contrast = 1.18): void {
    if (!this.renderPipeline) return;
    this.renderPipeline.imageProcessing.exposure = exposure;
    this.renderPipeline.imageProcessing.contrast = contrast;
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
        const mat = mesh.material as { emissiveColor?: Color3 } | undefined;
        if (mat && mat.emissiveColor) {
          const e = mat.emissiveColor;
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
        this.renderPipeline.sharpenEnabled = false;
        this.renderPipeline.chromaticAberrationEnabled = false;
        this.renderPipeline.imageProcessing.vignetteEnabled = false;
      }
    } else if (quality === 'MEDIUM') {
      this.engine.setHardwareScalingLevel(1.0);
      this.scene.shadowsEnabled = true;
      this.sunLight.shadowEnabled = true;
      this.player.camera.maxZ = 250;
      this.ensureGlowLayer(24, 0.58);
      if (this.shadowGenerator) {
        this.shadowGenerator.usePercentageCloserFiltering = true;
        this.shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_LOW;
        const shadowMap = this.shadowGenerator.getShadowMap();
        if (shadowMap) shadowMap.refreshRate = 2;
      }
      if (this.renderPipeline) {
        this.renderPipeline.samples = 1;
        this.renderPipeline.fxaaEnabled = true;
        this.renderPipeline.bloomEnabled = true;
        this.renderPipeline.bloomThreshold = 0.78;
        this.renderPipeline.bloomWeight = 0.24;
        this.renderPipeline.bloomKernel = 48;
        this.renderPipeline.bloomScale = 0.5;
        this.renderPipeline.sharpenEnabled = false;
        this.renderPipeline.chromaticAberrationEnabled = false;
        this.renderPipeline.imageProcessing.vignetteEnabled = true;
        this.renderPipeline.imageProcessing.vignetteWeight = 1.05;
        this.renderPipeline.imageProcessing.vignetteStretch = 0.5;
      }
    } else {
      this.engine.setHardwareScalingLevel(dprScale);
      this.scene.shadowsEnabled = true;
      this.sunLight.shadowEnabled = true;
      this.player.camera.maxZ = 300;
      this.ensureGlowLayer(38, 0.8);
      if (this.shadowGenerator) {
        this.shadowGenerator.usePercentageCloserFiltering = true;
        this.shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
        const shadowMap = this.shadowGenerator.getShadowMap();
        if (shadowMap) shadowMap.refreshRate = 1;
      }
      if (this.renderPipeline) {
        this.renderPipeline.samples = 2;
        this.renderPipeline.fxaaEnabled = true;
        this.renderPipeline.bloomEnabled = true;
        this.renderPipeline.bloomThreshold = 0.74;
        this.renderPipeline.bloomWeight = 0.3;
        this.renderPipeline.bloomKernel = 64;
        this.renderPipeline.bloomScale = 0.5;
        this.renderPipeline.sharpenEnabled = true;
        this.renderPipeline.sharpen.edgeAmount = 0.18;
        this.renderPipeline.sharpen.colorAmount = 1.0;
        this.renderPipeline.chromaticAberrationEnabled = true;
        this.renderPipeline.chromaticAberration.aberrationAmount = 6;
        this.renderPipeline.chromaticAberration.radialIntensity = 0.55;
        this.renderPipeline.imageProcessing.vignetteEnabled = true;
        this.renderPipeline.imageProcessing.vignetteWeight = 1.25;
        this.renderPipeline.imageProcessing.vignetteStretch = 0.45;
      }
    }
    this.weapons.setGraphicsQuality(quality);
    this.botManager.setGraphicsQuality(quality);
    this.remoteRenderer.setGraphicsQuality(quality);
  }

  private getCurrentMatchPhase(): MatchPhase {
    if (this.sessionMode === 'multiplayer' && this.mpSnapshot) {
      if (this.mpSnapshot.phase === 'ended') return 'ended';
      if (this.mpSnapshot.phase === 'playing') return this.mpPaused ? 'paused' : 'playing';
      return 'menu';
    }
    return this.matchManager.getPhase();
  }

  public selectGun(id: GunId): { switchedImmediately: boolean } {
    const phase = this.getCurrentMatchPhase();
    const outcome = applyGunSelection(
      {
        equippedGunId: this.weapons.getEquippedGunId(),
        queuedGunId: this.weapons.getQueuedGunId(),
        activeSlot: this.weapons.getActiveSlot(),
      },
      normalizeGunId(id),
      phase,
      this.playerIsAlive
    );

    if (outcome.switchedImmediately) {
      this.weapons.setEquippedGun(outcome.loadout.equippedGunId);
    } else {
      this.weapons.setQueuedGun(outcome.loadout.queuedGunId);
    }
    this.updateMenuShowcaseVisuals();
    this.emitHudState(true);
    return { switchedImmediately: outcome.switchedImmediately };
  }

  public selectCharacter(
    id: CharacterId,
    equipSignatureGun = true
  ): { characterId: CharacterId; signatureGunId: GunId; switchedImmediately: boolean } {
    const normalized = normalizeCharacterId(id);
    if (normalized !== this.selectedCharacterId) {
      this.selectedCharacterId = normalized;
      this.rebuildMenuShowcaseRig();
    }

    const phase = this.getCurrentMatchPhase();
    const outcome = applyCharacterSelection(
      {
        equippedGunId: this.weapons.getEquippedGunId(),
        queuedGunId: this.weapons.getQueuedGunId(),
        activeSlot: this.weapons.getActiveSlot(),
      },
      normalized,
      equipSignatureGun,
      phase,
      this.playerIsAlive
    );

    if (outcome.gunOutcome) {
      if (outcome.gunOutcome.switchedImmediately) {
        this.weapons.setEquippedGun(outcome.gunOutcome.loadout.equippedGunId);
      } else {
        this.weapons.setQueuedGun(outcome.gunOutcome.loadout.queuedGunId);
      }
    }

    this.updateMenuShowcaseVisuals();
    this.emitHudState(true);
    return {
      characterId: outcome.characterId,
      signatureGunId: outcome.signatureGunId,
      switchedImmediately: outcome.gunOutcome?.switchedImmediately ?? false,
    };
  }

  public getSelectedCharacterId(): CharacterId {
    return this.selectedCharacterId;
  }

  public selectKnifeCharm(id: KnifeCharmId): void {
    this.weapons.setKnifeCharm(normalizeKnifeCharmId(id));
    this.updateMenuShowcaseVisuals();
    this.emitHudState(true);
  }

  public selectWeapon(id: WeaponId): void {
    if (id === 'knife') {
      this.weapons.selectSlot(2);
      this.emitHudState(true);
      return;
    }
    this.selectGun(id);
  }

  private handleDeadGunHotkey(gunIndex: number): void {
    const phase = this.getCurrentMatchPhase();
    if (canSwitchGunImmediately(phase, this.playerIsAlive) && gunIndex >= 1 && gunIndex <= GUN_IDS.length) {
      const nextGun = GUN_IDS[gunIndex - 1];
      this.selectGun(nextGun);
      this.callbacks.onGunPersistedChange?.(nextGun);
      this.audio.playReloadMagIn();
    }
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
    this.pingSystem.update(dt, this.player.camera, (targetId) =>
      this.remoteRenderer.getPlayerTargetPosition(targetId)
    );
    this.updateArcadeEffects(dt);

    if (phase === 'playing' && this.mpSnapshot) {
      this.updateBombVisualsAndAudio(
        dt,
        this.mpSnapshot.mode === 'bomb' ? (this.mpSnapshot.bombState ?? null) : null
      );
      if (this.mpSnapshot.mode === 'bomb') {
        const holdingE = !this.mpPaused && this.player.isInteractHeld();
        if (holdingE !== this.lastSentBombInteract) {
          this.lastSentBombInteract = holdingE;
          this.callbacks.onMultiplayerBombInteract?.(holdingE);
        }
      } else if (this.lastSentBombInteract) {
        this.lastSentBombInteract = false;
        this.callbacks.onMultiplayerBombInteract?.(false);
      }
    } else if (this.lastSentBombInteract) {
      this.lastSentBombInteract = false;
      this.callbacks.onMultiplayerBombInteract?.(false);
    }

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
        activeCfg.id,
        this.selectedCharacterId,
        this.player.getStance()
      );
    }
  }

  private updateOfflineMatchTick(dt: number): void {
    const phase = this.matchManager.getPhase();
    if (phase !== 'playing') return;

    this.matchManager.update(dt);
    this.updateArcadeEffects(dt);

    if (this.matchManager.consumePendingRoundReset()) {
      const def = this.mapManager.getCurrentDefinition();
      this.botManager.resetBotsForNewRound();
      const spawn = def.blueSpawns[0] ?? new Vector3(0, 1, -20);
      this.resetPlayerForLife(spawn, 0);
      this.weapons.applyQueuedGunOnRespawn();
      this.weapons.resetForNewMatch();
      this.weapons.setViewModelVisible(true);
      this.lastBombPhase = 'unplanted';
      this.bombBeepCooldown = 0;
      this.emitHudState(true);
    }

    if (this.gameMode === 'bomb') {
      const pos = this.player.collider.position;
      this.matchManager.updateBombInteraction(
        {
          id: 'player',
          team: 'blue',
          x: pos.x,
          y: Math.max(0, pos.y - 0.9),
          z: pos.z,
          isAlive: this.playerIsAlive,
        },
        this.player.isInteractHeld(),
        dt
      );
      this.updateBombVisualsAndAudio(dt, this.matchManager.getBombState());
    } else {
      this.updateBombVisualsAndAudio(dt, null);
    }

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
      this.closeChatInput(false);
      const snap = this.matchManager.getSnapshot();
      const playerWon =
        snap.mode === 'ffa' ? snap.winnerParticipantId === 'player' : snap.winner === 'blue';
      this.awardMatchCompletionXp(playerWon);
      this.player.setCanControl(false);
      this.player.exitPointerLock();
      this.weapons.cancelTransientActions();
      this.weapons.setViewModelVisible(false);
      this.emitHudState(true);
      return;
    }

    if (this.playerSpawnProtection > 0) {
      this.playerSpawnProtection = Math.max(0, this.playerSpawnProtection - dt);
    }

    if (!this.playerIsAlive) {
      if (this.gameMode === 'bomb') {
        this.playerRespawnTimer = 0;
        this.matchManager.setParticipantAlive('player', false, 0);
        return;
      }

      this.playerRespawnTimer = Math.max(0, this.playerRespawnTimer - dt);
      this.matchManager.setParticipantAlive('player', false, this.playerRespawnTimer);
    }
  }

  public respawnLocalPlayer(): boolean {
    if (this.playerIsAlive) return false;
    const phase = this.getCurrentMatchPhase();
    if (phase !== 'playing') return false;
    if (this.gameMode === 'bomb') return false;
    if (this.playerRespawnTimer > 0.05) return false;

    const queuedGun = this.weapons.getQueuedGunId();
    if (this.sessionMode === 'multiplayer') {
      this.callbacks.onMultiplayerRespawnRequest?.(queuedGun);
      this.player.requestPointerLock();
      this.emitHudState(true);
      return true;
    }

    const spawn = this.botManager.pickBestSpawn('blue', 'player');
    const toCenterYaw = Math.atan2(-spawn.x, -spawn.z);
    this.resetPlayerForLife(spawn, toCenterYaw);
    this.weapons.applyQueuedGunOnRespawn();
    this.weapons.setViewModelVisible(true);
    this.player.setCanControl(true);
    this.player.requestPointerLock();
    this.emitHudState(true);
    return true;
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
      const mode = this.matchManager.getMode();
      this.playerIsAlive = false;
      this.playerRespawnTimer =
        mode === 'bomb'
          ? 0
          : mode === 'ffa'
            ? FFA_RESPAWN_DELAY_SEC
            : RESPAWN_DELAY_SEC;
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
        const playerWon =
          snap.mode === 'ffa' ? snap.winnerParticipantId === 'player' : snap.winner === 'blue';
        this.awardMatchCompletionXp(playerWon);
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
    this.closeChatInput(false);
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
    this.hemiLight.intensity = 0.54;
    this.hemiLight.diffuse = new Color3(0.84, 0.9, 0.98);
    this.hemiLight.groundColor = new Color3(0.18, 0.19, 0.22);

    this.sunLight = new DirectionalLight('sunLight', new Vector3(-0.48, -0.82, -0.32), this.scene);
    this.sunLight.position = new Vector3(24, 38, 18);
    this.sunLight.intensity = 1.56;
    this.sunLight.diffuse = new Color3(1.0, 0.94, 0.85);
    this.sunLight.shadowMinZ = 2;
    this.sunLight.shadowMaxZ = 120;

    this.shadowGenerator = new ShadowGenerator(2048, this.sunLight);
    this.shadowGenerator.usePercentageCloserFiltering = true;
    this.shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    this.shadowGenerator.bias = 0.0006;
    this.shadowGenerator.normalBias = 0.015;

    const rim = new DirectionalLight('rimLight', new Vector3(0.5, -0.4, 0.6), this.scene);
    rim.intensity = 0.34;
    rim.diffuse = new Color3(0.58, 0.76, 0.98);
  }

  private clearBombVisuals(): void {
    if (this.bombSiteVisualRoot) {
      this.bombSiteVisualRoot.dispose();
      this.bombSiteVisualRoot = null;
    }
    for (const mat of this.bombSiteVisualMaterials) {
      mat.dispose();
    }
    this.bombSiteVisualMaterials = [];

    if (this.plantedBombRoot) {
      this.plantedBombRoot.dispose();
      this.plantedBombRoot = null;
    }
    for (const mat of this.plantedBombMaterials) {
      mat.dispose();
    }
    this.plantedBombMaterials = [];
    this.plantedBombLedMat = null;
    this.lastBombPhase = 'unplanted';
    this.bombBeepCooldown = 0;
  }

  private rebuildBombVisuals(mapDef: MapDefinition, active: boolean): void {
    this.clearBombVisuals();
    if (!active || !mapDef.bombSites || mapDef.bombSites.length === 0) {
      return;
    }

    const siteRoot = new TransformNode('bombSiteVisualRoot', this.scene);
    this.bombSiteVisualRoot = siteRoot;

    for (const site of mapDef.bombSites) {
      const baseColor =
        site.id === 'A' ? new Color3(0.96, 0.62, 0.08) : new Color3(0.06, 0.78, 0.92);

      const ringMat = new StandardMaterial(`bombSiteRingMat_${site.id}`, this.scene);
      ringMat.disableLighting = true;
      ringMat.diffuseColor = Color3.Black();
      ringMat.emissiveColor = baseColor;
      ringMat.alpha = 0.72;
      this.bombSiteVisualMaterials.push(ringMat);

      const ring = MeshBuilder.CreateTorus(
        `bombSiteRing_${site.id}`,
        { diameter: site.radius * 2, thickness: 0.09, tessellation: 48 },
        this.scene
      );
      ring.parent = siteRoot;
      ring.position.set(site.position.x, site.position.y + 0.05, site.position.z);
      ring.material = ringMat;
      ring.isPickable = false;
      ring.checkCollisions = false;

      const discMat = new StandardMaterial(`bombSiteDiscMat_${site.id}`, this.scene);
      discMat.disableLighting = true;
      discMat.diffuseColor = Color3.Black();
      discMat.emissiveColor = baseColor;
      discMat.alpha = 0.09;
      discMat.backFaceCulling = false;
      this.bombSiteVisualMaterials.push(discMat);

      const disc = MeshBuilder.CreateDisc(
        `bombSiteDisc_${site.id}`,
        { radius: site.radius, tessellation: 48 },
        this.scene
      );
      disc.parent = siteRoot;
      disc.position.set(site.position.x, site.position.y + 0.025, site.position.z);
      disc.rotation.x = Math.PI * 0.5;
      disc.material = discMat;
      disc.isPickable = false;
      disc.checkCollisions = false;

      const beaconMat = new StandardMaterial(`bombSiteBeaconMat_${site.id}`, this.scene);
      beaconMat.disableLighting = true;
      beaconMat.diffuseColor = Color3.Black();
      beaconMat.emissiveColor = baseColor;
      beaconMat.alpha = 0.22;
      beaconMat.disableDepthWrite = true;
      this.bombSiteVisualMaterials.push(beaconMat);

      const beacon = MeshBuilder.CreateCylinder(
        `bombSiteBeacon_${site.id}`,
        { height: 3.4, diameterTop: 0.14, diameterBottom: 0.48, tessellation: 12 },
        this.scene
      );
      beacon.parent = siteRoot;
      beacon.position.set(site.position.x, site.position.y + 1.7, site.position.z);
      beacon.material = beaconMat;
      beacon.isPickable = false;
      beacon.checkCollisions = false;
    }

    // 3D Planted C4 Satchel Mesh
    const bombRoot = new TransformNode('plantedBombRoot', this.scene);
    const bodyMat = new StandardMaterial('plantedBombBodyMat', this.scene);
    bodyMat.diffuseColor = new Color3(0.18, 0.2, 0.17);
    bodyMat.specularColor = new Color3(0.15, 0.16, 0.16);
    this.plantedBombMaterials.push(bodyMat);

    const screenMat = new StandardMaterial('plantedBombScreenMat', this.scene);
    screenMat.disableLighting = true;
    screenMat.emissiveColor = new Color3(0.14, 0.85, 0.45);
    this.plantedBombMaterials.push(screenMat);

    const ledMat = new StandardMaterial('plantedBombLedMat', this.scene);
    ledMat.disableLighting = true;
    ledMat.emissiveColor = new Color3(1.8, 0.18, 0.12);
    this.plantedBombMaterials.push(ledMat);
    this.plantedBombLedMat = ledMat;

    const casing = MeshBuilder.CreateBox(
      'plantedBombCasing',
      { width: 0.42, height: 0.14, depth: 0.28 },
      this.scene
    );
    casing.parent = bombRoot;
    casing.position.y = 0.07;
    casing.material = bodyMat;
    casing.isPickable = false;
    casing.checkCollisions = false;

    const keypad = MeshBuilder.CreateBox(
      'plantedBombKeypad',
      { width: 0.2, height: 0.03, depth: 0.14 },
      this.scene
    );
    keypad.parent = bombRoot;
    keypad.position.set(0, 0.15, 0.02);
    keypad.material = screenMat;
    keypad.isPickable = false;
    keypad.checkCollisions = false;

    const antenna = MeshBuilder.CreateCylinder(
      'plantedBombAntenna',
      { height: 0.24, diameter: 0.025, tessellation: 8 },
      this.scene
    );
    antenna.parent = bombRoot;
    antenna.position.set(0.14, 0.22, -0.08);
    antenna.material = bodyMat;
    antenna.isPickable = false;
    antenna.checkCollisions = false;

    const led = MeshBuilder.CreateSphere(
      'plantedBombLed',
      { diameter: 0.075, segments: 8 },
      this.scene
    );
    led.parent = bombRoot;
    led.position.set(-0.12, 0.16, -0.06);
    led.material = ledMat;
    led.isPickable = false;
    led.checkCollisions = false;

    bombRoot.setEnabled(false);
    this.plantedBombRoot = bombRoot;
  }

  private updateBombVisualsAndAudio(dt: number, bombState: BombStateSnapshot | null): void {
    if (!bombState || this.gameMode !== 'bomb') {
      if (this.plantedBombRoot?.isEnabled()) {
        this.plantedBombRoot.setEnabled(false);
      }
      this.lastBombPhase = 'unplanted';
      this.bombBeepCooldown = 0;
      return;
    }

    if (bombState.phase === 'planted' && this.lastBombPhase !== 'planted') {
      this.audio.playBombPlanted();
      this.bombBeepCooldown = 0.25;
    } else if (bombState.phase === 'defused' && this.lastBombPhase !== 'defused') {
      this.audio.playBombDefused();
    } else if (bombState.phase === 'detonated' && this.lastBombPhase !== 'detonated') {
      this.audio.playBombExplosion();
      this.player.addCameraShake(0.28);
    }
    this.lastBombPhase = bombState.phase;

    if (this.plantedBombRoot) {
      if (bombState.phase === 'planted' || bombState.phase === 'detonated') {
        this.plantedBombRoot.position.set(bombState.plantX, bombState.plantY, bombState.plantZ);
        this.plantedBombRoot.setEnabled(true);
      } else {
        this.plantedBombRoot.setEnabled(false);
      }
    }

    if (bombState.phase === 'planted') {
      const urgency = Math.max(
        0,
        Math.min(1, 1 - bombState.detonateRemainingSec / BOMB_DETONATE_DURATION_SEC)
      );
      this.bombBeepCooldown -= dt;
      if (this.bombBeepCooldown <= 0) {
        this.audio.playBombBeep(urgency);
        this.bombBeepCooldown = Math.max(
          0.16,
          0.15 + (bombState.detonateRemainingSec / BOMB_DETONATE_DURATION_SEC) * 0.85
        );
      }
      if (this.plantedBombLedMat) {
        const pulse = Math.sin(this.elapsedTime * (8 + urgency * 18)) > 0 ? 2.4 : 0.25;
        this.plantedBombLedMat.emissiveColor.set(pulse, 0.12, 0.08);
      }
    }
  }

  private buildBombSiteHudMarkers(bombState: BombStateSnapshot | null): BombSiteHudMarker[] {
    if (this.gameMode !== 'bomb') return [];
    const def = this.mapManager.getCurrentDefinition();
    const sites = def.bombSites ?? [];
    if (sites.length === 0) return [];

    const viewportWidth = this.engine.getRenderWidth();
    const viewportHeight = this.engine.getRenderHeight();
    if (viewportWidth <= 0 || viewportHeight <= 0) return [];

    const transformMatrix = this.scene.getTransformMatrix();
    this.bombProjViewport.x = 0;
    this.bombProjViewport.y = 0;
    this.bombProjViewport.width = 1;
    this.bombProjViewport.height = 1;
    const globalViewport = this.bombProjViewport.toGlobal(viewportWidth, viewportHeight);

    const camPos = this.player.camera.globalPosition;
    this.player.camera.getDirectionToRef(Vector3.Forward(), this.bombForwardScratch);

    return sites.map((site) => {
      const isPlantedHere = Boolean(
        bombState && bombState.phase === 'planted' && bombState.siteId === site.id
      );
      const wx = isPlantedHere && bombState ? bombState.plantX : site.position.x;
      const wy = (isPlantedHere && bombState ? bombState.plantY : site.position.y) + 2.0;
      const wz = isPlantedHere && bombState ? bombState.plantZ : site.position.z;

      this.bombWorldScratch.set(wx, wy, wz);
      const distanceMeters = Math.max(1, Math.round(Vector3.Distance(camPos, this.bombWorldScratch)));

      this.bombDeltaScratch.copyFrom(this.bombWorldScratch).subtractInPlace(camPos);
      const inFront = Vector3.Dot(this.bombDeltaScratch, this.bombForwardScratch) > 0.05;

      const projected = Vector3.Project(
        this.bombWorldScratch,
        this.bombProjIdentity,
        transformMatrix,
        globalViewport
      );

      let pctX = (projected.x / viewportWidth) * 100;
      let pctY = (projected.y / viewportHeight) * 100;

      if (!inFront) {
        pctX = 100 - pctX;
        pctY = 100 - pctY;
        const dx = pctX - 50;
        const dy = pctY - 50;
        const mag = Math.hypot(dx, dy) || 1;
        pctX = 50 + (dx / mag) * 48;
        pctY = 50 + (dy / mag) * 48;
      }

      const onScreen = inFront && pctX >= 4 && pctX <= 96 && pctY >= 5 && pctY <= 95;
      const clampedX = Math.max(5, Math.min(95, pctX));
      const clampedY = Math.max(7, Math.min(92, pctY));

      return {
        id: site.id,
        label: isPlantedHere ? `DEFUSE ${site.id}` : `SITE ${site.id}`,
        x: wx,
        y: wy - 2.0,
        z: wz,
        distanceMeters,
        screenXPct: Math.round(clampedX * 10) / 10,
        screenYPct: Math.round(clampedY * 10) / 10,
        onScreen,
        isPlantedHere,
      };
    });
  }

  private computeBombInteractPrompt(
    match: MatchSnapshot,
    localId: string,
    localTeam: TeamId
  ): HudState['bombInteractPrompt'] {
    if (
      this.gameMode !== 'bomb' ||
      match.phase !== 'playing' ||
      !this.playerIsAlive ||
      !match.bombState
    ) {
      return null;
    }

    const bomb = match.bombState;
    const pos = this.player.collider.position;

    if (bomb.phase === 'unplanted' && localTeam === 'blue') {
      const carrier = bomb.carrierId
        ? match.participants.find((p) => p.id === bomb.carrierId)
        : undefined;
      const canCarry = bomb.carrierId === localId || !carrier || !carrier.isAlive;
      if (!canCarry) return null;

      const def = this.mapManager.getCurrentDefinition();
      const nearSite = (def.bombSites ?? []).find(
        (site) => Math.hypot(pos.x - site.position.x, pos.z - site.position.z) <= site.radius
      );
      if (!nearSite) return null;

      const progress =
        bomb.actionPlayerId === localId && bomb.actionType === 'plant' ? bomb.actionProgress : 0;
      return {
        action: 'plant',
        siteId: nearSite.id,
        progress,
        remainingSec: Math.max(
          0,
          Math.round(BOMB_PLANT_DURATION_SEC * (1 - progress) * 10) / 10
        ),
      };
    }

    if (bomb.phase === 'planted' && localTeam === 'red') {
      const dist = Math.hypot(pos.x - bomb.plantX, pos.z - bomb.plantZ);
      if (dist > BOMB_SITE_RADIUS) return null;

      const progress =
        bomb.actionPlayerId === localId && bomb.actionType === 'defuse' ? bomb.actionProgress : 0;
      return {
        action: 'defuse',
        siteId: bomb.siteId ?? 'A',
        progress,
        remainingSec: Math.max(
          0,
          Math.round(BOMB_DEFUSE_DURATION_SEC * (1 - progress) * 10) / 10
        ),
      };
    }

    return null;
  }

  private buildRadarBlips(): RadarBlip[] {
    const actors =
      this.sessionMode === 'multiplayer'
        ? this.remoteRenderer.getRadarActors()
        : this.botManager.getRadarActors();

    const localId =
      this.sessionMode === 'multiplayer' ? (this.mpSnapshot?.localPlayerId ?? 'player') : 'player';
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
      const isEnemy = checkActorsHostile(
        this.gameMode,
        { id: localId, team: localTeam },
        { id: actor.id, team: actor.team }
      );
      const isFriend = !isEnemy;
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
        team: isFriend ? localTeam : localTeam === 'blue' ? 'red' : 'blue',
      });
    }

    for (const ping of this.pingSystem.getActivePings()) {
      const dx = ping.x - pPos.x;
      const dz = ping.z - pPos.z;
      const localRight = (dx * cosY - dz * sinY) / RADAR_RANGE_METERS;
      const localForward = (dx * sinY + dz * cosY) / RADAR_RANGE_METERS;
      const mag = Math.hypot(localRight, localForward);
      const clampedMag = mag > 0.94 ? 0.94 / mag : 1;

      blips.push({
        id: `ping_radar_${ping.id}`,
        relX: localRight * clampedMag,
        relZ: localForward * clampedMag,
        team: ping.team,
        pingKind: ping.kind,
      });
    }

    return blips;
  }

  private buildMinimapState(): MinimapState {
    const mapId =
      this.sessionMode === 'multiplayer' && this.mpSnapshot
        ? this.mpSnapshot.mapId
        : this.mapManager.getCurrentMapId() ?? 'urban';
    const actorsSource =
      this.sessionMode === 'multiplayer'
        ? this.remoteRenderer.getRadarActors()
        : this.botManager.getRadarActors();

    const localId =
      this.sessionMode === 'multiplayer' ? (this.mpSnapshot?.localPlayerId ?? 'player') : 'player';
    const localTeam: TeamId =
      this.sessionMode === 'multiplayer'
        ? (this.mpSnapshot?.players.find((p) => p.id === this.mpSnapshot?.localPlayerId)?.team ?? 'blue')
        : 'blue';

    const pPos = this.player.collider.position;
    const uavActive = this.uavRemainingSec > 0;
    const actors: MinimapActor[] = [];

    for (const actor of actorsSource) {
      if (!actor.isAlive) continue;
      const dist = Math.round(Math.hypot(actor.x - pPos.x, actor.z - pPos.z));
      const isEnemy = checkActorsHostile(
        this.gameMode,
        { id: localId, team: localTeam },
        { id: actor.id, team: actor.team }
      );
      const isFriend = !isEnemy;
      if (!isFriend && !uavActive && dist > PROXIMITY_REVEAL_METERS) {
        continue;
      }
      actors.push({
        id: actor.id,
        name: actor.name,
        x: actor.x,
        z: actor.z,
        yawRad: actor.yawRad,
        team: isFriend ? localTeam : localTeam === 'blue' ? 'red' : 'blue',
        kind: isFriend ? 'teammate' : 'enemy',
        distanceMeters: dist,
      });
    }

    for (const ping of this.pingSystem.getActivePings()) {
      const dist = Math.round(Math.hypot(ping.x - pPos.x, ping.z - pPos.z));
      actors.push({
        id: `ping_mm_${ping.id}`,
        name: ping.senderName,
        x: ping.x,
        z: ping.z,
        yawRad: 0,
        team: ping.team,
        kind: 'ping',
        pingKind: ping.kind,
        distanceMeters: dist,
      });
    }

    return {
      mapId,
      halfExtent: ARENA_HALF_EXTENT,
      playerX: pPos.x,
      playerZ: pPos.z,
      playerYawRad: this.player.getYawRad(),
      localTeam,
      actors,
    };
  }

  private placePing(): void {
    if (!this.playerIsAlive) return;
    const playing =
      this.sessionMode === 'offline'
        ? this.matchManager.getPhase() === 'playing'
        : this.mpSnapshot?.phase === 'playing' && !this.mpPaused;
    if (!playing) return;

    const now = performance.now();
    if (now - this.lastPingPlacementTime < 300) return;
    this.lastPingPlacementTime = now;

    const localPlayer =
      this.sessionMode === 'multiplayer'
        ? this.mpSnapshot?.players.find((p) => p.id === this.mpSnapshot?.localPlayerId)
        : null;
    const localTeam: TeamId = localPlayer?.team ?? 'blue';
    const senderId = localPlayer?.id ?? 'player';
    const senderName = localPlayer?.name ?? (this.settings.callsign || 'Operator');

    const origin = this.player.camera.globalPosition;
    const dir = this.player.camera.getDirection(Vector3.Forward());
    const hit = resolvePingRaycast(
      this.scene,
      origin,
      dir,
      localTeam,
      this.player.collider,
      180,
      this.gameMode
    );

    const pingId = `${senderId}_ping_${++this.localPingSeq}`;
    this.pingSystem.setLocalTeam(localTeam);
    this.pingSystem.upsertPing({
      id: pingId,
      senderId,
      senderName,
      team: localTeam,
      kind: hit.kind,
      x: hit.x,
      y: hit.y,
      z: hit.z,
      targetId: hit.targetId,
    });
    this.audio.playPing(hit.kind === 'enemy');

    if (this.sessionMode === 'multiplayer') {
      this.callbacks.onMultiplayerPing?.({
        id: pingId,
        kind: hit.kind,
        x: hit.x,
        y: hit.y,
        z: hit.z,
        targetId: hit.targetId,
      });
    }

    this.emitHudState(true);
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

    const participants = sortFfaParticipants(
      snap.players.map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        isPlayer: p.id === snap.localPlayerId,
        kills: p.kills,
        deaths: p.deaths,
        isAlive: p.isAlive,
        respawnTimer: p.respawnTimer,
      }))
    );

    const resolvedMode = snap.mode ?? 'tdm';
    return {
      phase,
      mode: resolvedMode,
      mapId: snap.mapId,
      mapName: mapDef.name,
      blueScore: snap.blueScore,
      redScore: snap.redScore,
      killLimit: snap.killLimit,
      roundNumber: snap.roundNumber ?? 1,
      roundsToWin: snap.roundsToWin ?? (resolvedMode === 'bomb' ? 5 : 1),
      timeRemainingSec: snap.timeRemaining,
      winner: snap.winner === '' ? null : snap.winner,
      winnerParticipantId: snap.winnerId || null,
      winnerName: snap.winnerName || null,
      bombState: snap.bombState ?? null,
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

    const localId =
      this.sessionMode === 'multiplayer' && this.mpSnapshot
        ? this.mpSnapshot.localPlayerId
        : 'player';
    const localTeam: TeamId =
      this.sessionMode === 'multiplayer' && this.mpSnapshot
        ? (this.mpSnapshot.players.find((p) => p.id === localId)?.team ?? 'blue')
        : 'blue';

    const rank = getRankSummary(this.xpTotal);
    const kb = this.settings.keybindings ?? DEFAULT_KEYBINDINGS;
    const killstreaks: KillstreakSlotState[] = [
      {
        id: 'uav',
        key: formatKeyCode(kb.streakUav),
        name: 'UAV Sweep',
        requiredKills: 3,
        unlocked: this.unlockedStreaks.uav,
        active: this.uavRemainingSec > 0,
        remainingSec: Math.ceil(this.uavRemainingSec),
      },
      {
        id: 'airstrike',
        key: formatKeyCode(kb.streakBarrage),
        name: 'Barrage',
        requiredKills: 5,
        unlocked: this.unlockedStreaks.airstrike,
        active: this.barrageShells.length > 0,
        remainingSec: 0,
      },
      {
        id: 'overdrive',
        key: formatKeyCode(kb.streakOverdrive),
        name: 'Overdrive',
        requiredKills: 7,
        unlocked: this.unlockedStreaks.overdrive,
        active: this.overdriveRemainingSec > 0,
        remainingSec: Math.ceil(this.overdriveRemainingSec),
      },
    ];

    const isGunSwitchLocked = !canSwitchGunImmediately(match.phase, this.playerIsAlive);
    const ffaIdx =
      match.mode === 'ffa'
        ? match.participants.findIndex((p) => p.id === localId)
        : -1;
    const ffaLeader = match.mode === 'ffa' ? match.participants[0] : undefined;

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
      selectedCharacterId: this.selectedCharacterId,
      equippedGunId: this.weapons.getEquippedGunId(),
      queuedGunId: this.weapons.getQueuedGunId(),
      knifeCharmId: this.weapons.getKnifeCharmId(),
      isGunSwitchLocked,
      gunLockMessage: isGunSwitchLocked ? GUN_LOCKED_WHILE_ALIVE_MESSAGE : null,
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
      minimap: this.buildMinimapState(),
      pings:
        match.phase === 'playing' || match.phase === 'paused'
          ? this.pingSystem.getHudMarkers(
              this.player.camera,
              this.engine.getRenderWidth(),
              this.engine.getRenderHeight()
            )
          : [],
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
      gameMode: match.mode,
      localTeam,
      bombSites:
        match.phase === 'playing' || match.phase === 'paused'
          ? this.buildBombSiteHudMarkers(match.bombState ?? null)
          : [],
      bombInteractPrompt: this.computeBombInteractPrompt(match, localId, localTeam),
      ffaRank: ffaIdx >= 0 ? ffaIdx + 1 : null,
      ffaLeaderName: ffaLeader ? ffaLeader.name : null,
      ffaLeaderKills: ffaLeader ? ffaLeader.kills : 0,
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
    if (this.initFallbackTimer !== null) {
      window.clearTimeout(this.initFallbackTimer);
      this.initFallbackTimer = null;
    }
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('webglcontextlost', this.onWebGLContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onWebGLContextRestored);

    this.resetCombatArcadeState(true);
    this.clearBombVisuals();
    if (this.showcaseRig) {
      this.showcaseRig.root.dispose();
      this.showcaseRig.bodyMat.dispose();
      this.showcaseRig.headMat.dispose();
      this.showcaseRig = null;
    }
    this.showcaseFillLight?.dispose();
    this.showcaseFillLight = null;
    this.showcaseRimLight?.dispose();
    this.showcaseRimLight = null;
    this.showcasePivot?.dispose();
    this.showcasePivot = null;
    this.showcasePalette?.dispose();
    this.showcasePalette = null;
    this.weapons.dispose();
    this.pingSystem.dispose();
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
