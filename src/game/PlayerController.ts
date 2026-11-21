import {
  AbstractMesh,
  Mesh,
  MeshBuilder,
  Ray,
  Scene,
  UniversalCamera,
  Vector3,
} from '@babylonjs/core';
import {
  DEFAULT_KEYBINDINGS,
  KeybindingsConfig,
  validateKeybindings,
} from '../settings/keybindings';
import { AudioEngine } from './AudioEngine';
import type { ChatChannel } from '../multiplayer/chat';
import { PostSlideStance, SlideTriggerMode, Stance } from './types';

export interface PlayerInputCallbacks {
  onFirePress: () => void;
  onFireRelease: () => void;
  onSecondaryPress?: () => void;
  onAdsChange: (isAds: boolean) => void;
  onReload: () => void;
  onSelectSlot: (slot: 1 | 2) => void;
  onQuickMelee?: () => void;
  onDeadGunHotkey?: (gunIndex: number) => void;
  onCycleSlot?: (delta: 1 | -1) => void;
  onActivateKillstreak?: (slot: 4 | 5 | 6) => void; // F1, F2, F3
  onScoreboardChange: (open: boolean) => void;
  onPointerLockChange: (locked: boolean) => void;
  onFocusLost?: () => void;
  onCycleScopeMagnification?: () => void;
  onPing?: () => void;
  onOpenChat?: (channel: ChatChannel) => void;
}

const PLAYER_HALF_HEIGHT = 0.9;
const PLAYER_CROUCH_HALF_HEIGHT = 0.56;
const PLAYER_CROUCH_ELLIPSOID_OFFSET_Y = -(PLAYER_HALF_HEIGHT - PLAYER_CROUCH_HALF_HEIGHT);
const PLAYER_RADIUS = 0.42;
const STAND_EYE_OFFSET = 0.72;
const CROUCH_EYE_OFFSET = 0.14;
const SLIDE_EYE_OFFSET = -0.05;
const DEAD_EYE_OFFSET = -0.58;

const WALK_SPEED = 6.2;
const SPRINT_SPEED = 9.1;
const CROUCH_SPEED = 3.5;
const SLIDE_MIN_SPEED = SPRINT_SPEED * 0.62;
const SLIDE_BURST_SPEED = SPRINT_SPEED * 1.6;
const SLIDE_END_SPEED = CROUCH_SPEED * 1.15;
const SLIDE_DURATION_SEC = 0.75;
const SLIDE_COOLDOWN_SEC = 0.6;
const SLIDE_ROLL_RAD = (5 * Math.PI) / 180;
const SLIDE_FOV_BOOST_RAD = (5.2 * Math.PI) / 180;
const JUMP_BUFFER_SEC = 0.12;
const COYOTE_TIME_SEC = 0.12;
const ADS_SPEED_MULTIPLIER = 0.65;
const GROUND_ACCEL = 16.0;
const AIR_ACCEL = 9.0;
const GRAVITY = -23.5;
const JUMP_VELOCITY = 8.4;
const GROUND_RAY_OFFSETS = [
  new Vector3(0, 0, 0),
  new Vector3(0.26, 0, 0.26),
  new Vector3(-0.26, 0, 0.26),
  new Vector3(0.26, 0, -0.26),
  new Vector3(-0.26, 0, -0.26),
];

export class PlayerController {
  public readonly camera: UniversalCamera;
  public readonly collider: Mesh;

  private scene: Scene;
  private canvas: HTMLCanvasElement;
  private audio: AudioEngine;
  private callbacks: PlayerInputCallbacks;

  private keys = new Set<string>();
  private keybindings: KeybindingsConfig = { ...DEFAULT_KEYBINDINGS };
  private boundCodes = new Set<string>(Object.values(DEFAULT_KEYBINDINGS));
  private yaw = 0;
  private pitch = 0;
  private recoilPitch = 0;
  private recoilYaw = 0;

  private velocity = new Vector3(0, 0, 0);
  private readonly forwardDir = new Vector3();
  private readonly rightDir = new Vector3();
  private readonly wishDir = new Vector3();
  private readonly steeredDir = new Vector3();
  private readonly horizontalStep = new Vector3();
  private readonly verticalStep = new Vector3();
  private readonly deathLookVector = new Vector3();
  private readonly groundRays = GROUND_RAY_OFFSETS.map(
    () => new Ray(Vector3.Zero(), new Vector3(0, -1, 0), PLAYER_HALF_HEIGHT + 0.08)
  );
  private readonly standUpRay = new Ray(
    Vector3.Zero(),
    new Vector3(0, 1, 0),
    PLAYER_HALF_HEIGHT + 0.15
  );
  private readonly collisionPickPredicate = (mesh: AbstractMesh): boolean =>
    mesh !== this.collider && mesh.checkCollisions && mesh.isEnabled();
  private isGrounded = false;
  private jumpBufferTimer = 0;
  private coyoteTimer = 0;
  private isCrouching = false;
  private crouchToggled = false;
  private isSliding = false;
  private slideTimer = 0;
  private slideCooldown = 0;
  private slideJumpCarryTimer = 0;
  private slideRollDirection = 1;
  private slideDir = new Vector3(0, 0, 1);
  private slideTrigger: SlideTriggerMode = 'tap';
  private postSlideStance: PostSlideStance = 'stand';
  private jumpCancelsSlide = true;
  private slideCameraIntensity = 1.0;
  private prevSlideGroundY: number | null = null;
  private adsEnabled = true;
  private isAds = false;
  private currentEyeOffset = STAND_EYE_OFFSET;
  private currentRoll = 0;

  private sensitivity = 0.0021;
  private adsSensitivityMultiplier = 0.68;
  private invertY = false;
  private baseFovRad = (78 * Math.PI) / 180;
  private currentFovRad = (78 * Math.PI) / 180;
  private fovKick = 0;
  private lastAdsFovRatio = 0.74;

  private stepAccum = 0;
  private landDip = 0;
  private shakeIntensity = 0;
  private flinchPitch = 0;
  private flinchRoll = 0;
  private flinchYaw = 0;
  private screenShakeScale = 1.0;
  private moveSpeedMultiplier = 1.0;
  private weaponSpeedMultiplier = 1.0;
  private deathLookTarget: Vector3 | null = null;
  private isPointerLocked = false;
  private isFireHeld = false;
  private canControl = false;
  private isDead = false;
  private chatInputOpen = false;
  private chatTriggersEnabled = true;
  private orbitPreviewActive = true;
  private lastWheelTime = 0;

  constructor(
    scene: Scene,
    canvas: HTMLCanvasElement,
    audio: AudioEngine,
    callbacks: PlayerInputCallbacks
  ) {
    this.scene = scene;
    this.canvas = canvas;
    this.audio = audio;
    this.callbacks = callbacks;

    this.collider = MeshBuilder.CreateBox(
      'playerCollider',
      { width: PLAYER_RADIUS * 2, height: PLAYER_HALF_HEIGHT * 2, depth: PLAYER_RADIUS * 2 },
      this.scene
    );
    this.collider.position.set(0, PLAYER_HALF_HEIGHT + 0.05, -20);
    this.collider.isVisible = false;
    this.collider.isPickable = false;
    this.collider.checkCollisions = true;
    this.collider.ellipsoid = new Vector3(PLAYER_RADIUS, PLAYER_HALF_HEIGHT, PLAYER_RADIUS);
    this.collider.ellipsoidOffset = Vector3.Zero();

    this.camera = new UniversalCamera('fpsCamera', Vector3.Zero(), this.scene);
    this.camera.inputs.clear();
    this.camera.minZ = 0.05;
    this.camera.maxZ = 300;
    this.camera.fov = this.baseFovRad;

    this.syncCameraTransform();
    this.bindEvents();
  }

  public requestPointerLock(): void {
    this.audio.unlock();
    if (document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock();
    }
  }

  public exitPointerLock(): void {
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  public setChatTriggersEnabled(enabled: boolean): void {
    this.chatTriggersEnabled = enabled;
  }

  public setChatInputOpen(open: boolean): void {
    if (this.chatInputOpen === open) return;
    this.chatInputOpen = open;
    if (open) {
      this.clearHeldInputs();
    }
  }

  public isChatInputOpen(): boolean {
    return this.chatInputOpen;
  }

  public setCanControl(enabled: boolean): void {
    this.canControl = enabled;
    if (!enabled) {
      this.chatInputOpen = false;
      this.keys.clear();
      this.isFireHeld = false;
      this.isAds = false;
      this.isCrouching = false;
      this.crouchToggled = false;
      this.isSliding = false;
      this.slideTimer = 0;
      this.slideCooldown = 0;
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.slideJumpCarryTimer = 0;
      this.currentFovRad = this.baseFovRad;
      this.fovKick = 0;
      this.camera.fov = this.baseFovRad;
      this.currentEyeOffset = STAND_EYE_OFFSET;
      this.currentRoll = 0;
      this.landDip = 0;
      this.recoilPitch = 0;
      this.recoilYaw = 0;
      this.prevSlideGroundY = null;
      this.syncColliderStanceHeight();
      this.callbacks.onFireRelease();
      this.callbacks.onAdsChange(false);
      this.callbacks.onScoreboardChange(false);
      this.syncCameraTransform();
    }
  }

  public setOrbitPreview(active: boolean): void {
    this.orbitPreviewActive = active;
  }

  public updateOrbitCamera(target: Vector3, elapsedTime: number): void {
    const radius = 26;
    const angle = elapsedTime * 0.14;
    const camX = target.x + Math.sin(angle) * radius;
    const camZ = target.z + Math.cos(angle) * radius;
    const camY = target.y + 11.5;

    this.camera.position.set(camX, camY, camZ);
    this.camera.setTarget(target);
    this.camera.fov = this.baseFovRad;
  }

  public setDeadState(dead: boolean): void {
    this.isDead = dead;
    if (dead) {
      this.chatInputOpen = false;
      this.keys.clear();
      this.isFireHeld = false;
      this.isAds = false;
      this.isSliding = false;
      this.slideTimer = 0;
      this.crouchToggled = false;
      this.isCrouching = false;
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.slideJumpCarryTimer = 0;
      this.currentFovRad = this.baseFovRad;
      this.fovKick = 0;
      this.camera.fov = this.baseFovRad;
      this.currentRoll = 0;
      this.recoilPitch = 0;
      this.recoilYaw = 0;
      this.prevSlideGroundY = null;
      this.syncColliderStanceHeight();
      this.callbacks.onFireRelease();
      this.callbacks.onAdsChange(false);
      this.callbacks.onScoreboardChange(false);
    }
  }

  public spawnAt(pos: Vector3, yawRad: number): void {
    this.collider.position.set(pos.x, Math.max(PLAYER_HALF_HEIGHT + 0.05, pos.y), pos.z);
    this.velocity.setAll(0);
    this.yaw = yawRad;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.isAds = false;
    this.isFireHeld = false;
    this.chatInputOpen = false;
    this.keys.clear();
    this.isCrouching = false;
    this.crouchToggled = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.slideCooldown = 0;
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this.slideJumpCarryTimer = 0;
    this.isDead = false;
    this.deathLookTarget = null;
    this.isGrounded = false;
    this.currentFovRad = this.baseFovRad;
    this.fovKick = 0;
    this.camera.fov = this.baseFovRad;
    this.stepAccum = 0;
    this.landDip = 0;
    this.shakeIntensity = 0;
    this.flinchPitch = 0;
    this.flinchRoll = 0;
    this.flinchYaw = 0;
    this.currentEyeOffset = STAND_EYE_OFFSET;
    this.currentRoll = 0;
    this.prevSlideGroundY = null;
    this.syncColliderStanceHeight();
    this.callbacks.onFireRelease();
    this.callbacks.onAdsChange(false);
    this.callbacks.onScoreboardChange(false);
    this.syncCameraTransform();
  }

  public setMoveSpeedMultiplier(mult: number): void {
    this.moveSpeedMultiplier = Math.max(0.5, Math.min(1.8, mult));
  }

  public setWeaponSpeedMultiplier(mult: number): void {
    this.weaponSpeedMultiplier = Math.max(0.65, Math.min(1.4, mult));
  }

  public setDeathLookTarget(targetPos: Vector3 | null): void {
    this.deathLookTarget = targetPos ? targetPos.clone() : null;
  }

  public addCameraShake(amount: number): void {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return;
    const scaled = amount * this.screenShakeScale;
    if (scaled <= 0.0001) return;
    this.shakeIntensity = Math.min(0.25, this.shakeIntensity + scaled);
  }

  public setScreenShakeScale(rawScale: unknown): void {
    const storedScale = this.screenShakeScale;
    const currentShake = this.shakeIntensity;
    const currentPitch = this.flinchPitch;
    const currentRoll = this.flinchRoll;
    const currentYaw = this.flinchYaw;

    const storedScaleValid =
      typeof storedScale === 'number' &&
      Number.isFinite(storedScale) &&
      storedScale >= 0.0 &&
      storedScale <= 1.0;

    let candShake = 0.0;
    if (typeof currentShake === 'number' && Number.isFinite(currentShake) && currentShake > 0.0) {
      candShake = Math.min(0.25, currentShake);
    }

    const MAX_PITCH = 0.045;
    const MAX_ROLL = 0.030;
    const MAX_YAW = 0.018;
    const MAX_NORM = 0.050;
    const FLINCH_EPSILON = 0.0005;

    let candPitch = 0.0;
    let candRoll = 0.0;
    let candYaw = 0.0;

    if (
      typeof currentPitch === 'number' && Number.isFinite(currentPitch) &&
      typeof currentRoll === 'number' && Number.isFinite(currentRoll) &&
      typeof currentYaw === 'number' && Number.isFinite(currentYaw)
    ) {
      let p = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, currentPitch));
      let r = Math.max(-MAX_ROLL, Math.min(MAX_ROLL, currentRoll));
      let y = Math.max(-MAX_YAW, Math.min(MAX_YAW, currentYaw));

      const normSq = p * p + r * r + y * y;
      if (normSq > MAX_NORM * MAX_NORM) {
        const norm = Math.sqrt(normSq);
        if (Number.isFinite(norm) && norm > 0.00001) {
          const s = MAX_NORM / norm;
          p *= s;
          r *= s;
          y *= s;
        } else {
          p = 0.0;
          r = 0.0;
          y = 0.0;
        }
      }

      if (normSq < FLINCH_EPSILON * FLINCH_EPSILON) {
        p = 0.0;
        r = 0.0;
        y = 0.0;
      }

      candPitch = p;
      candRoll = r;
      candYaw = y;
    }

    let newScale = 0.0;
    if (typeof rawScale === 'number' && Number.isFinite(rawScale)) {
      newScale = Math.max(0.0, Math.min(1.0, rawScale));
    } else {
      newScale = 0.0;
    }

    let targetScale = newScale;
    let targetShake = 0.0;
    let targetPitch = 0.0;
    let targetRoll = 0.0;
    let targetYaw = 0.0;

    if (!storedScaleValid) {
      targetScale = newScale;
      targetShake = 0.0;
      targetPitch = 0.0;
      targetRoll = 0.0;
      targetYaw = 0.0;
    } else if (newScale <= 0.0001) {
      targetScale = newScale;
      targetShake = 0.0;
      targetPitch = 0.0;
      targetRoll = 0.0;
      targetYaw = 0.0;
    } else if (Math.abs(storedScale - newScale) < 0.0001) {
      targetScale = newScale;
      targetShake = candShake;
      targetPitch = candPitch;
      targetRoll = candRoll;
      targetYaw = candYaw;
    } else if (storedScale <= 0.0001) {
      targetScale = newScale;
      targetShake = 0.0;
      targetPitch = 0.0;
      targetRoll = 0.0;
      targetYaw = 0.0;
    } else {
      const ratio = newScale / storedScale;
      if (Number.isFinite(ratio) && ratio > 0.0) {
        if (candShake > 0.0) {
          const rebasedShake = candShake * ratio;
          targetShake = Number.isFinite(rebasedShake)
            ? Math.max(0.0, Math.min(0.25, rebasedShake))
            : 0.0;
        }

        let p = candPitch * ratio;
        let r = candRoll * ratio;
        let y = candYaw * ratio;

        if (Number.isFinite(p) && Number.isFinite(r) && Number.isFinite(y)) {
          p = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p));
          r = Math.max(-MAX_ROLL, Math.min(MAX_ROLL, r));
          y = Math.max(-MAX_YAW, Math.min(MAX_YAW, y));

          const normSq = p * p + r * r + y * y;
          if (normSq > MAX_NORM * MAX_NORM) {
            const norm = Math.sqrt(normSq);
            if (Number.isFinite(norm) && norm > 0.00001) {
              const s = MAX_NORM / norm;
              p *= s;
              r *= s;
              y *= s;
            } else {
              p = 0.0;
              r = 0.0;
              y = 0.0;
            }
          }

          if (normSq < FLINCH_EPSILON * FLINCH_EPSILON) {
            p = 0.0;
            r = 0.0;
            y = 0.0;
          }

          targetPitch = p;
          targetRoll = r;
          targetYaw = y;
        }
      }
      targetScale = newScale;
    }

    if (
      Number.isFinite(targetScale) && targetScale >= 0.0 && targetScale <= 1.0 &&
      Number.isFinite(targetShake) && targetShake >= 0.0 && targetShake <= 0.25 &&
      Number.isFinite(targetPitch) && Math.abs(targetPitch) <= MAX_PITCH &&
      Number.isFinite(targetRoll) && Math.abs(targetRoll) <= MAX_ROLL &&
      Number.isFinite(targetYaw) && Math.abs(targetYaw) <= MAX_YAW
    ) {
      this.screenShakeScale = targetScale;
      this.shakeIntensity = targetShake;
      this.flinchPitch = targetPitch;
      this.flinchRoll = targetRoll;
      this.flinchYaw = targetYaw;
    } else {
      this.screenShakeScale = Number.isFinite(newScale) ? Math.max(0.0, Math.min(1.0, newScale)) : 0.0;
      this.shakeIntensity = 0.0;
      this.flinchPitch = 0.0;
      this.flinchRoll = 0.0;
      this.flinchYaw = 0.0;
    }
  }

  public applyDamageImpact(
    damage: number,
    attackerPos: Vector3 | null,
    isHeadshot: unknown = false
  ): void {
    if (this.isDead || !this.canControl) return;
    if (typeof damage !== 'number' || !Number.isFinite(damage) || damage <= 0) return;

    const scale = this.screenShakeScale;
    if (scale <= 0.0001) return;

    const boundedDamage = Math.min(300, damage);
    const BASE_IMPULSE = 0.032;
    const dmgRatio = Math.max(0.35, Math.min(1.6, Math.sqrt(boundedDamage / 25.0)));
    const headshotMult = isHeadshot === true ? 1.35 : 1.0;
    const adsMult = this.isAds ? 0.4 : 1.0;
    const impulse = BASE_IMPULSE * dmgRatio * headshotMult * adsMult;

    let useFallback = true;
    let forwardAlign = 1.0;
    let rightAlign = 0.0;

    if (
      attackerPos &&
      typeof attackerPos.x === 'number' &&
      Number.isFinite(attackerPos.x) &&
      typeof attackerPos.z === 'number' &&
      Number.isFinite(attackerPos.z)
    ) {
      const pPos = this.collider.position;
      if (Number.isFinite(pPos.x) && Number.isFinite(pPos.z)) {
        const dx = attackerPos.x - pPos.x;
        const dz = attackerPos.z - pPos.z;

        if (Number.isFinite(dx) && Number.isFinite(dz) && Math.abs(dx) <= 2000 && Math.abs(dz) <= 2000) {
          const distSq = dx * dx + dz * dz;
          if (Number.isFinite(distSq) && distSq >= 0.01 && distSq <= 4000000) {
            const worldBearing = Math.atan2(dx, dz);
            if (Number.isFinite(worldBearing)) {
              let relBearing = worldBearing - this.yaw;
              relBearing = Math.atan2(Math.sin(relBearing), Math.cos(relBearing));
              if (Number.isFinite(relBearing)) {
                forwardAlign = Math.cos(relBearing);
                rightAlign = Math.sin(relBearing);
                useFallback = false;
              }
            }
          }
        }
      }
    }

    let dPitch = 0;
    let dRoll = 0;
    let dYaw = 0;

    if (useFallback) {
      dPitch = impulse;
      dRoll = 0;
      dYaw = 0;
    } else {
      dPitch = forwardAlign * impulse;
      dRoll = -rightAlign * (impulse * 0.65);
      dYaw = -rightAlign * (impulse * 0.35);
    }

    this.accumulateFlinch(dPitch * scale, dRoll * scale, dYaw * scale);
  }

  private accumulateFlinch(dPitch: number, dRoll: number, dYaw: number): void {
    const MAX_PITCH = 0.045;
    const MAX_ROLL = 0.030;
    const MAX_YAW = 0.018;
    const MAX_NORM = 0.05;
    const FLINCH_EPSILON = 0.0005;

    let curP = this.flinchPitch;
    let curR = this.flinchRoll;
    let curY = this.flinchYaw;

    if (!Number.isFinite(curP) || !Number.isFinite(curR) || !Number.isFinite(curY)) {
      curP = 0.0;
      curR = 0.0;
      curY = 0.0;
    } else {
      curP = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, curP));
      curR = Math.max(-MAX_ROLL, Math.min(MAX_ROLL, curR));
      curY = Math.max(-MAX_YAW, Math.min(MAX_YAW, curY));

      const curNormSq = curP * curP + curR * curR + curY * curY;
      if (curNormSq > MAX_NORM * MAX_NORM) {
        const curNorm = Math.sqrt(curNormSq);
        if (Number.isFinite(curNorm) && curNorm > 0.00001) {
          const s = MAX_NORM / curNorm;
          curP *= s;
          curR *= s;
          curY *= s;
        } else {
          curP = 0.0;
          curR = 0.0;
          curY = 0.0;
        }
      }
    }

    if (!Number.isFinite(dPitch) || !Number.isFinite(dRoll) || !Number.isFinite(dYaw)) {
      this.flinchPitch = curP;
      this.flinchRoll = curR;
      this.flinchYaw = curY;
      return;
    }

    let p = curP + dPitch;
    let r = curR + dRoll;
    let y = curY + dYaw;

    p = Number.isFinite(p) ? Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p)) : (dPitch > 0 ? MAX_PITCH : -MAX_PITCH);
    r = Number.isFinite(r) ? Math.max(-MAX_ROLL, Math.min(MAX_ROLL, r)) : (dRoll > 0 ? MAX_ROLL : -MAX_ROLL);
    y = Number.isFinite(y) ? Math.max(-MAX_YAW, Math.min(MAX_YAW, y)) : (dYaw > 0 ? MAX_YAW : -MAX_YAW);

    const normSq = p * p + r * r + y * y;
    if (Number.isFinite(normSq) && normSq > MAX_NORM * MAX_NORM) {
      const norm = Math.sqrt(normSq);
      if (Number.isFinite(norm) && norm > 0.00001) {
        const s = MAX_NORM / norm;
        p *= s;
        r *= s;
        y *= s;
      } else {
        p = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p));
        r = 0.0;
        y = 0.0;
      }
    }

    const finalNormSq = p * p + r * r + y * y;
    if (finalNormSq < FLINCH_EPSILON * FLINCH_EPSILON) {
      p = 0.0;
      r = 0.0;
      y = 0.0;
    }

    if (Number.isFinite(p) && Number.isFinite(r) && Number.isFinite(y)) {
      this.flinchPitch = p;
      this.flinchRoll = r;
      this.flinchYaw = y;
    } else {
      this.flinchPitch = 0.0;
      this.flinchRoll = 0.0;
      this.flinchYaw = 0.0;
    }
  }

  public setSensitivity(sens: number): void {
    this.sensitivity = Math.max(0.0005, Math.min(0.008, sens));
  }

  public setAdsSensitivityMultiplier(mult: number): void {
    this.adsSensitivityMultiplier = Math.max(0.3, Math.min(1.2, mult));
  }

  public setInvertY(invert: boolean): void {
    this.invertY = invert;
  }

  public setBaseFov(fovDeg: number): void {
    const clamped = Math.max(70, Math.min(110, fovDeg));
    this.baseFovRad = (clamped * Math.PI) / 180;
  }

  public setKeybindings(next: KeybindingsConfig): void {
    this.keybindings = validateKeybindings(next);
    this.boundCodes = new Set(Object.values(this.keybindings));
  }

  public setAdsEnabled(enabled: boolean): void {
    this.adsEnabled = enabled;
    if (!enabled && this.isAds) {
      this.isAds = false;
      this.callbacks.onAdsChange(false);
    }
  }

  public setSlideSettings(cfg: {
    slideTrigger?: SlideTriggerMode;
    postSlideStance?: PostSlideStance;
    jumpCancelsSlide?: boolean;
    slideCameraIntensity?: number;
  }): void {
    if (cfg.slideTrigger === 'tap' || cfg.slideTrigger === 'hold') {
      this.slideTrigger = cfg.slideTrigger;
    }
    if (cfg.postSlideStance === 'stand' || cfg.postSlideStance === 'crouch') {
      this.postSlideStance = cfg.postSlideStance;
    }
    if (typeof cfg.jumpCancelsSlide === 'boolean') {
      this.jumpCancelsSlide = cfg.jumpCancelsSlide;
    }
    if (typeof cfg.slideCameraIntensity === 'number' && Number.isFinite(cfg.slideCameraIntensity)) {
      this.slideCameraIntensity = Math.max(0, Math.min(1, cfg.slideCameraIntensity));
    }
  }

  public getSlideDebugState() {
    return {
      isSliding: this.isSliding,
      isCrouching: this.isCrouching,
      slideTimer: this.slideTimer,
      slideCooldown: this.slideCooldown,
      colliderHalfHeight: this.collider.ellipsoid.y,
      colliderEllipsoidOffsetY: this.collider.ellipsoidOffset.y,
      slideTrigger: this.slideTrigger,
      postSlideStance: this.postSlideStance,
      jumpCancelsSlide: this.jumpCancelsSlide,
      slideCameraIntensity: this.slideCameraIntensity,
    };
  }

  public addRecoil(pitchKick: number, yawKick: number): void {
    this.recoilPitch += pitchKick;
    this.recoilYaw += yawKick;
  }

  public addFovKick(amountRad: number): void {
    if (this.isDead || !this.canControl) return;
    if (typeof amountRad !== 'number' || !Number.isFinite(amountRad) || amountRad <= 0) return;
    this.fovKick = Math.min(0.055, this.fovKick + amountRad);
  }

  public resetTransientMotion(): void {
    this.fovKick = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.shakeIntensity = 0;
    this.flinchPitch = 0;
    this.flinchRoll = 0;
    this.flinchYaw = 0;
    this.landDip = 0;
    this.camera.fov = this.currentFovRad;
    this.syncCameraTransform();
  }

  public getLandDip(): number {
    return this.landDip;
  }

  public getStance(): Stance {
    if (this.isSliding) return 'slide';
    if (this.isCrouching) return 'crouch';
    if (this.isSprinting()) return 'sprint';
    return 'stand';
  }

  public getIsGrounded(): boolean {
    return this.isGrounded;
  }

  public getIsAds(): boolean {
    return this.adsEnabled && this.isAds && !this.isDead;
  }

  public getAdsBlend(): number {
    if (!this.adsEnabled || this.orbitPreviewActive || this.isDead) return 0;
    const denom = this.baseFovRad * (1 - this.lastAdsFovRatio);
    if (denom < 1e-5) return this.isAds ? 1 : 0;
    return Math.max(0, Math.min(1, (this.baseFovRad - this.currentFovRad) / denom));
  }

  public getLocalMoveAxes(out: { forward: number; right: number }): void {
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    out.forward = this.velocity.x * sinY + this.velocity.z * cosY;
    out.right = this.velocity.x * cosY - this.velocity.z * sinY;
  }

  public getIsFireHeld(): boolean {
    return (
      this.isFireHeld &&
      this.isPointerLocked &&
      this.canControl &&
      !this.isDead &&
      !this.chatInputOpen
    );
  }

  public getHorizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  public getHeadingDeg(): number {
    const deg = ((this.yaw * 180) / Math.PI) % 360;
    return deg < 0 ? deg + 360 : deg;
  }

  public getYawRad(): number {
    return this.yaw;
  }

  public getIsPointerLocked(): boolean {
    return this.isPointerLocked;
  }

  public getEyePosition(): Vector3 {
    return this.camera.globalPosition.clone();
  }

  public update(dt: number, targetAdsFovRatio: number): void {
    if (this.orbitPreviewActive) return;

    const clampedDt = Math.min(dt, 0.05);

    const recoilDecay = Math.exp(-12 * clampedDt);
    this.recoilPitch *= recoilDecay;
    this.recoilYaw *= recoilDecay;

    const activeInput =
      this.isPointerLocked && this.canControl && !this.isDead && !this.chatInputOpen;

    let forwardInput = 0;
    let strafeInput = 0;
    if (activeInput) {
      if (this.keys.has(this.keybindings.moveForward)) forwardInput += 1;
      if (this.keys.has(this.keybindings.moveBackward)) forwardInput -= 1;
      if (this.keys.has(this.keybindings.moveRight)) strafeInput += 1;
      if (this.keys.has(this.keybindings.moveLeft)) strafeInput -= 1;
    }

    this.forwardDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.rightDir.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.wishDir.set(
      this.forwardDir.x * forwardInput + this.rightDir.x * strafeInput,
      0,
      this.forwardDir.z * forwardInput + this.rightDir.z * strafeInput
    );
    if (this.wishDir.lengthSquared() > 0.0001) {
      this.wishDir.normalize();
    }

    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - clampedDt);
    }
    if (this.isGrounded) {
      this.coyoteTimer = COYOTE_TIME_SEC;
    } else if (this.coyoteTimer > 0) {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - clampedDt);
    }

    if (!this.isSliding && this.slideCooldown > 0) {
      this.slideCooldown = Math.max(0, this.slideCooldown - clampedDt);
    }

    if (this.isSliding) {
      if (!activeInput) {
        this.endSlide(false);
      } else if (this.slideTrigger === 'hold' && !this.isCrouchHeld()) {
        this.endSlide(false);
      } else {
        this.slideTimer -= clampedDt;
        if (this.isGrounded && this.prevSlideGroundY !== null) {
          const slopeDeltaY = this.collider.position.y - this.prevSlideGroundY;
          if (slopeDeltaY < -0.002) {
            // Downhill extends momentum slightly
            this.slideTimer = Math.min(
              SLIDE_DURATION_SEC,
              this.slideTimer + Math.min(0.025, -slopeDeltaY * 1.6)
            );
          } else if (slopeDeltaY > 0.002) {
            // Uphill applies stronger friction decay
            this.slideTimer = Math.max(0, this.slideTimer - Math.min(0.035, slopeDeltaY * 2.4));
          }
        }
        this.prevSlideGroundY = this.collider.position.y;

        // Allow optional jump-cancel mid-slide while preserving forward momentum
        const wantsJump = this.jumpCancelsSlide && activeInput && this.jumpBufferTimer > 0;
        const canJump = this.isGrounded || this.coyoteTimer > 0;
        if (wantsJump && canJump) {
          this.velocity.y = JUMP_VELOCITY;
          this.isGrounded = false;
          this.coyoteTimer = 0;
          this.jumpBufferTimer = 0;
          this.slideJumpCarryTimer = 0.22;
          this.audio.playJump();
          this.endSlide(false);
        } else if (this.slideTimer <= 0) {
          this.endSlide(this.postSlideStance === 'crouch' || this.isCrouchHeld());
        }
      }
    } else {
      this.prevSlideGroundY = null;
    }

    let sprinting = false;
    if (this.isSliding) {
      const progress = 1 - Math.max(0, this.slideTimer) / SLIDE_DURATION_SEC;
      const frictionCurve = Math.pow(1 - progress, 1.35);
      const slideSpeed = SLIDE_END_SPEED + (SLIDE_BURST_SPEED - SLIDE_END_SPEED) * frictionCurve;

      // Subtle lateral steering while locked into slide momentum
      this.steeredDir.copyFrom(this.slideDir);
      if (this.wishDir.lengthSquared() > 0.0001) {
        this.steeredDir.x += this.rightDir.x * strafeInput * 0.22;
        this.steeredDir.z += this.rightDir.z * strafeInput * 0.22;
        this.steeredDir.normalize();
      }
      const blend = 1 - Math.exp(-18 * clampedDt);
      this.velocity.x += (this.steeredDir.x * slideSpeed - this.velocity.x) * blend;
      this.velocity.z += (this.steeredDir.z * slideSpeed - this.velocity.z) * blend;
    } else {
      const wantCrouch =
        activeInput && (this.keys.has(this.keybindings.crouchHold) || this.crouchToggled);
      if (!wantCrouch && this.isCrouching) {
        if (this.canStandUp()) {
          this.isCrouching = false;
        }
      } else if (wantCrouch) {
        this.isCrouching = true;
      }

      sprinting = this.isSprinting() && !this.isCrouching && !this.getIsAds() && forwardInput > 0;
      let targetSpeed = WALK_SPEED;
      if (this.isCrouching) {
        targetSpeed = CROUCH_SPEED;
      } else if (sprinting) {
        targetSpeed = SPRINT_SPEED;
      }
      if (this.getIsAds()) {
        targetSpeed *= ADS_SPEED_MULTIPLIER;
      }
      targetSpeed *= this.moveSpeedMultiplier * this.weaponSpeedMultiplier;

      const targetVelX = activeInput ? this.wishDir.x * targetSpeed : 0;
      const targetVelZ = activeInput ? this.wishDir.z * targetSpeed : 0;
      const accel = this.isGrounded ? GROUND_ACCEL : AIR_ACCEL;
      const carryingSlideJump = !this.isGrounded && this.slideJumpCarryTimer > 0;
      const blend = 1 - Math.exp(-accel * (carryingSlideJump ? 0.2 : 1) * clampedDt);

      this.velocity.x += (targetVelX - this.velocity.x) * blend;
      this.velocity.z += (targetVelZ - this.velocity.z) * blend;
      if (carryingSlideJump) {
        this.slideJumpCarryTimer = Math.max(0, this.slideJumpCarryTimer - clampedDt);
      }

      const wantsJump = activeInput && this.jumpBufferTimer > 0;
      const canJump = this.isGrounded || this.coyoteTimer > 0;
      if (wantsJump && canJump && this.velocity.y <= 1.0) {
        this.velocity.y = JUMP_VELOCITY;
        this.isGrounded = false;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
        this.audio.playJump();
      }
    }

    this.syncColliderStanceHeight();

    this.velocity.y += GRAVITY * clampedDt;

    this.collider.computeWorldMatrix(true);
    this.horizontalStep.set(this.velocity.x * clampedDt, 0, this.velocity.z * clampedDt);
    this.collider.moveWithCollisions(this.horizontalStep);

    this.collider.computeWorldMatrix(true);
    const prevY = this.collider.position.y;
    const preImpactVy = this.velocity.y;
    this.verticalStep.set(0, this.velocity.y * clampedDt, 0);
    this.collider.moveWithCollisions(this.verticalStep);

    const actualDeltaY = this.collider.position.y - prevY;
    const intendedDeltaY = this.verticalStep.y;

    if (intendedDeltaY > 0 && actualDeltaY < intendedDeltaY * 0.45) {
      this.velocity.y = 0;
    }

    const groundedByRay = this.checkGroundRay();
    const stoppedFalling = intendedDeltaY < 0 && Math.abs(actualDeltaY - intendedDeltaY) > 0.0015;

    if ((stoppedFalling || groundedByRay) && this.velocity.y <= 0) {
      if (!this.isGrounded && preImpactVy < -4.2) {
        this.landDip = Math.min(0.14, Math.abs(preImpactVy) * 0.011);
        this.audio.playLand(Math.abs(preImpactVy));
      }
      this.isGrounded = true;
      this.velocity.y = -0.35;
    } else {
      this.isGrounded = false;
    }

    const targetEye = this.isDead
      ? DEAD_EYE_OFFSET
      : this.isSliding
        ? SLIDE_EYE_OFFSET
        : this.isCrouching
          ? CROUCH_EYE_OFFSET
          : STAND_EYE_OFFSET;
    const eyeLerpRate = this.isSliding ? 18 : 14;
    this.currentEyeOffset += (targetEye - this.currentEyeOffset) * (1 - Math.exp(-eyeLerpRate * clampedDt));
    this.landDip *= Math.exp(-12 * clampedDt);

    if (strafeInput !== 0 && this.isSliding) {
      this.slideRollDirection = Math.sign(strafeInput);
    }
    const targetRoll = this.isDead
      ? 0.28
      : this.isSliding
        ? SLIDE_ROLL_RAD * this.slideCameraIntensity * this.slideRollDirection
        : 0;
    this.currentRoll += (targetRoll - this.currentRoll) * (1 - Math.exp(-14 * clampedDt));

    const horizSpeed = this.getHorizontalSpeed();
    if (this.isGrounded && !this.isSliding && horizSpeed > 1.4 && activeInput) {
      this.stepAccum += horizSpeed * clampedDt;
      const strideLength = sprinting ? 2.55 : this.isCrouching ? 1.75 : 2.05;
      if (this.stepAccum >= strideLength) {
        this.stepAccum = 0;
        this.audio.playFootstep(sprinting, this.isCrouching);
      }
    } else {
      this.stepAccum = 0;
    }

    this.shakeIntensity *= Math.exp(-8 * clampedDt);

    const flinchDecay = Math.exp(-26 * clampedDt);
    this.flinchPitch *= flinchDecay;
    this.flinchRoll *= flinchDecay;
    this.flinchYaw *= flinchDecay;

    if (Math.abs(this.flinchPitch) < 0.0005) {
      this.flinchPitch = 0.0;
    }
    if (Math.abs(this.flinchRoll) < 0.0005) {
      this.flinchRoll = 0.0;
    }
    if (Math.abs(this.flinchYaw) < 0.0005) {
      this.flinchYaw = 0.0;
    }

    const flinchNormSq =
      this.flinchPitch * this.flinchPitch +
      this.flinchRoll * this.flinchRoll +
      this.flinchYaw * this.flinchYaw;
    if (flinchNormSq < 0.0005 * 0.0005) {
      this.flinchPitch = 0.0;
      this.flinchRoll = 0.0;
      this.flinchYaw = 0.0;
    }

    if (this.isDead && this.deathLookTarget) {
      this.deathLookVector
        .copyFrom(this.deathLookTarget)
        .subtractInPlace(this.camera.position);
      const flatDist = Math.hypot(this.deathLookVector.x, this.deathLookVector.z);
      if (flatDist > 0.2) {
        const targetYaw = Math.atan2(this.deathLookVector.x, this.deathLookVector.z);
        const targetPitch = Math.atan2(-this.deathLookVector.y + 1.25, flatDist);
        let yawDiff = ((targetYaw - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        const trackBlend = 1 - Math.exp(-6 * clampedDt);
        this.yaw += yawDiff * trackBlend;
        this.pitch += (Math.max(-1.2, Math.min(1.2, targetPitch)) - this.pitch) * trackBlend;
      }
    }

    this.lastAdsFovRatio = targetAdsFovRatio;
    const effectiveAds = this.getIsAds();
    let desiredFov = effectiveAds
      ? this.baseFovRad * targetAdsFovRatio
      : this.baseFovRad;
    if (!effectiveAds && this.isSliding && !this.isDead && this.slideCameraIntensity > 0) {
      const progress = 1 - Math.max(0, this.slideTimer) / SLIDE_DURATION_SEC;
      const slideBoost = SLIDE_FOV_BOOST_RAD * this.slideCameraIntensity * (1 - progress * 0.45);
      desiredFov += slideBoost;
    }
    const zoomDepth = 1 - Math.max(0.08, Math.min(1, targetAdsFovRatio));
    const fovRate = effectiveAds ? 9.5 + zoomDepth * 4.5 : 13.5;
    this.currentFovRad += (desiredFov - this.currentFovRad) * (1 - Math.exp(-fovRate * clampedDt));
    this.fovKick *= Math.exp(-18 * clampedDt);
    if (this.fovKick < 0.0001) {
      this.fovKick = 0;
    }
    this.camera.fov = this.currentFovRad + this.fovKick;

    this.syncCameraTransform();
  }

  private isCrouchHeld(): boolean {
    return (
      this.keys.has(this.keybindings.crouchHold) ||
      this.keys.has(this.keybindings.crouchToggle)
    );
  }

  private syncColliderStanceHeight(): void {
    const lowProfile = !this.isDead && (this.isSliding || this.isCrouching);
    const targetHalfY = lowProfile ? PLAYER_CROUCH_HALF_HEIGHT : PLAYER_HALF_HEIGHT;
    const targetOffsetY = lowProfile ? PLAYER_CROUCH_ELLIPSOID_OFFSET_Y : 0;
    this.collider.ellipsoid.y = targetHalfY;
    this.collider.ellipsoidOffset.y = targetOffsetY;
  }

  private tryStartSlide(): boolean {
    if (
      this.isDead ||
      !this.isGrounded ||
      this.isSliding ||
      this.slideCooldown > 0 ||
      this.isCrouching ||
      this.getIsAds() ||
      !this.isSprinting() ||
      this.getHorizontalSpeed() < SLIDE_MIN_SPEED
    ) {
      return false;
    }

    this.forwardDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.rightDir.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.forwardDir.x += this.rightDir.x * (this.keys.has(this.keybindings.moveRight) ? 0.28 : 0);
    this.forwardDir.z += this.rightDir.z * (this.keys.has(this.keybindings.moveRight) ? 0.28 : 0);
    this.forwardDir.x -= this.rightDir.x * (this.keys.has(this.keybindings.moveLeft) ? 0.28 : 0);
    this.forwardDir.z -= this.rightDir.z * (this.keys.has(this.keybindings.moveLeft) ? 0.28 : 0);
    if (this.forwardDir.lengthSquared() > 0.0001) {
      this.forwardDir.normalize();
    }

    this.slideDir.copyFrom(this.forwardDir);
    this.slideRollDirection = this.keys.has(this.keybindings.moveLeft) ? -1 : 1;
    this.velocity.x = this.forwardDir.x * SLIDE_BURST_SPEED;
    this.velocity.z = this.forwardDir.z * SLIDE_BURST_SPEED;

    this.isSliding = true;
    this.slideTimer = SLIDE_DURATION_SEC;
    this.prevSlideGroundY = this.collider.position.y;
    this.crouchToggled = false;
    this.isCrouching = false;
    this.syncColliderStanceHeight();
    this.audio.playSlide();
    return true;
  }

  private endSlide(keepCrouch: boolean): void {
    this.isSliding = false;
    this.slideTimer = 0;
    this.prevSlideGroundY = null;
    this.slideCooldown = SLIDE_COOLDOWN_SEC;
    if (keepCrouch || !this.canStandUp()) {
      this.isCrouching = true;
      if (keepCrouch && !this.keys.has(this.keybindings.crouchHold)) {
        this.crouchToggled = true;
      }
    } else {
      this.isCrouching = false;
      this.crouchToggled = false;
    }
    this.syncColliderStanceHeight();
  }

  private isSprintHeld(): boolean {
    return (
      this.keys.has(this.keybindings.sprint) ||
      (this.keybindings.sprint === 'ShiftLeft' &&
        !this.boundCodes.has('ShiftRight') &&
        this.keys.has('ShiftRight'))
    );
  }

  private isSprintKey(code: string): boolean {
    return (
      code === this.keybindings.sprint ||
      (this.keybindings.sprint === 'ShiftLeft' &&
        !this.boundCodes.has('ShiftRight') &&
        code === 'ShiftRight')
    );
  }

  private isQuickMeleeKey(code: string): boolean {
    return (
      code === this.keybindings.quickMelee ||
      (this.keybindings.quickMelee === 'KeyV' &&
        !this.boundCodes.has('KeyF') &&
        code === 'KeyF')
    );
  }

  private isSprinting(): boolean {
    return (
      this.isPointerLocked &&
      this.canControl &&
      !this.isDead &&
      !this.chatInputOpen &&
      this.isSprintHeld() &&
      this.keys.has(this.keybindings.moveForward)
    );
  }

  private checkGroundRay(): boolean {
    for (let i = 0; i < this.groundRays.length; i++) {
      const ray = this.groundRays[i];
      ray.origin.copyFrom(this.collider.position).addInPlace(GROUND_RAY_OFFSETS[i]);
      const hit = this.scene.pickWithRay(
        ray,
        this.collisionPickPredicate
      );
      if (hit?.hit) {
        return true;
      }
    }
    return false;
  }

  private canStandUp(): boolean {
    this.standUpRay.origin.copyFrom(this.collider.position);
    const hit = this.scene.pickWithRay(
      this.standUpRay,
      this.collisionPickPredicate
    );
    return !hit?.hit;
  }

  private syncCameraTransform(): void {
    const shakeX = this.shakeIntensity > 0.002 ? (Math.random() - 0.5) * this.shakeIntensity : 0;
    const shakeY = this.shakeIntensity > 0.002 ? (Math.random() - 0.5) * this.shakeIntensity : 0;
    this.camera.position.set(
      this.collider.position.x + shakeX,
      this.collider.position.y + this.currentEyeOffset - this.landDip + shakeY,
      this.collider.position.z
    );
    const effectivePitch = Math.max(
      -1.48,
      Math.min(1.48, this.pitch - this.recoilPitch - this.flinchPitch)
    );
    const effectiveYaw = this.yaw + this.recoilYaw + this.flinchYaw;
    this.camera.rotation.set(
      effectivePitch,
      effectiveYaw,
      this.currentRoll + this.flinchRoll
    );
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.isPointerLocked || !this.canControl || this.chatInputOpen) return;

    if (
      !this.isDead &&
      !e.repeat &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      this.chatTriggersEnabled &&
      this.callbacks.onOpenChat
    ) {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        this.setChatInputOpen(true);
        this.callbacks.onOpenChat('all');
        return;
      }
      if (e.code === 'KeyT' && !this.boundCodes.has('KeyT')) {
        e.preventDefault();
        this.setChatInputOpen(true);
        this.callbacks.onOpenChat('all');
        return;
      }
      if (e.code === 'KeyY' && !this.boundCodes.has('KeyY')) {
        e.preventDefault();
        this.setChatInputOpen(true);
        this.callbacks.onOpenChat('team');
        return;
      }
    }

    const kb = this.keybindings;

    if (
      e.code === kb.jump ||
      e.code === kb.scoreboard ||
      e.code === kb.streakUav ||
      e.code === kb.streakBarrage ||
      e.code === kb.streakOverdrive ||
      e.code === 'Space' ||
      e.code === 'Tab' ||
      e.code === 'F1' ||
      e.code === 'F2' ||
      e.code === 'F3'
    ) {
      e.preventDefault();
    }

    this.keys.add(e.code);

    if (e.code === kb.jump && !e.repeat) {
      this.jumpBufferTimer = JUMP_BUFFER_SEC;
    }

    if (e.code === kb.scoreboard && !e.repeat) {
      this.callbacks.onScoreboardChange(true);
      return;
    }

    if (this.isDead) {
      if (!e.repeat) {
        if (e.code === 'Digit1') this.callbacks.onDeadGunHotkey?.(1);
        else if (e.code === 'Digit2') this.callbacks.onDeadGunHotkey?.(2);
        else if (e.code === 'Digit3') this.callbacks.onDeadGunHotkey?.(3);
        else if (e.code === 'Digit4') this.callbacks.onDeadGunHotkey?.(4);
        else if (e.code === 'Digit5') this.callbacks.onDeadGunHotkey?.(5);
      }
      return;
    }

    if ((e.code === kb.crouchToggle || e.code === kb.crouchHold) && !e.repeat) {
      const slid = this.tryStartSlide();
      if (!slid && e.code === kb.crouchToggle && !this.isSliding) {
        this.crouchToggled = !this.crouchToggled;
      }
    } else if (this.isSprintKey(e.code) && this.crouchToggled && this.canStandUp()) {
      this.crouchToggled = false;
    } else if (e.code === kb.reload && !e.repeat) {
      this.callbacks.onReload();
    } else if (e.code === kb.slotGun && !e.repeat) {
      this.callbacks.onSelectSlot(1);
    } else if (e.code === kb.slotKnife && !e.repeat) {
      this.callbacks.onSelectSlot(2);
    } else if (this.isQuickMeleeKey(e.code) && !e.repeat) {
      this.callbacks.onQuickMelee?.();
    } else if (e.code === kb.streakUav && !e.repeat) {
      this.callbacks.onActivateKillstreak?.(4);
    } else if (e.code === kb.streakBarrage && !e.repeat) {
      this.callbacks.onActivateKillstreak?.(5);
    } else if (e.code === kb.streakOverdrive && !e.repeat) {
      this.callbacks.onActivateKillstreak?.(6);
    } else if (e.code === kb.cycleOptic && !e.repeat) {
      this.callbacks.onCycleScopeMagnification?.();
    } else if (e.code === kb.ping && !e.repeat) {
      this.callbacks.onPing?.();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
    if (e.code === this.keybindings.scoreboard) {
      this.callbacks.onScoreboardChange(false);
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isPointerLocked || !this.canControl || this.isDead || this.chatInputOpen) return;
    const adsMix = this.getAdsBlend();
    const adsMult = 1 + (this.adsSensitivityMultiplier - 1) * adsMix;
    const opticalScale = Math.max(0.2, this.currentFovRad / this.baseFovRad);
    const sens = this.sensitivity * adsMult * opticalScale;
    this.yaw += e.movementX * sens;
    const verticalDirection = this.invertY ? -1 : 1;
    this.pitch = Math.max(
      -1.46,
      Math.min(1.46, this.pitch + e.movementY * sens * verticalDirection)
    );
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.canControl || this.chatInputOpen) return;

    if (!this.isPointerLocked) {
      if (e.target === this.canvas) {
        this.requestPointerLock();
      }
      return;
    }

    if (this.isDead) return;

    if (e.button === 0) {
      this.isFireHeld = true;
      this.callbacks.onFirePress();
    } else if (e.button === 1) {
      e.preventDefault();
      this.callbacks.onPing?.();
    } else if (e.button === 2) {
      if (this.adsEnabled) {
        this.isAds = true;
        this.callbacks.onAdsChange(true);
      }
      this.callbacks.onSecondaryPress?.();
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.isFireHeld = false;
      this.callbacks.onFireRelease();
    } else if (e.button === 2) {
      if (this.isAds) {
        this.isAds = false;
        this.callbacks.onAdsChange(false);
      }
    }
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.isPointerLocked || !this.canControl || this.isDead || this.chatInputOpen) return;
    if (Math.abs(e.deltaY) < 1) return;
    e.preventDefault();
    const now = performance.now();
    if (now - this.lastWheelTime < 120) return;
    this.lastWheelTime = now;
    const delta: 1 | -1 = e.deltaY > 0 ? 1 : -1;
    this.callbacks.onCycleSlot?.(delta);
  };

  private onPointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.canvas;
    this.isPointerLocked = locked;
    if (!locked) {
      this.keys.clear();
      this.isFireHeld = false;
      this.isAds = false;
      this.callbacks.onFireRelease();
      this.callbacks.onAdsChange(false);
      this.callbacks.onScoreboardChange(false);
    }
    this.callbacks.onPointerLockChange(locked);
  };

  private clearHeldInputs(): void {
    this.keys.clear();
    this.isFireHeld = false;
    this.isAds = false;
    this.isCrouching = false;
    this.crouchToggled = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this.slideJumpCarryTimer = 0;
    this.currentRoll = 0;
    this.callbacks.onFireRelease();
    this.callbacks.onAdsChange(false);
    this.callbacks.onScoreboardChange(false);
  }

  private onWindowBlur = (): void => {
    this.chatInputOpen = false;
    this.clearHeldInputs();
    this.callbacks.onFocusLost?.();
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.chatInputOpen = false;
      this.clearHeldInputs();
      this.exitPointerLock();
      this.callbacks.onFocusLost?.();
    }
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    this.collider.dispose();
    this.camera.dispose();
  }
}
