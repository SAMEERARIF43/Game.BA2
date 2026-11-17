import {
  Mesh,
  MeshBuilder,
  Ray,
  Scene,
  UniversalCamera,
  Vector3,
} from '@babylonjs/core';
import { AudioEngine } from './AudioEngine';
import { Stance } from './types';

export interface PlayerInputCallbacks {
  onFirePress: () => void;
  onFireRelease: () => void;
  onAdsChange: (isAds: boolean) => void;
  onReload: () => void;
  onSelectSlot: (slot: 1 | 2 | 3 | 4) => void;
  onActivateKillstreak?: (slot: 4 | 5 | 6) => void; // F1, F2, F3
  onScoreboardChange: (open: boolean) => void;
  onPointerLockChange: (locked: boolean) => void;
  onFocusLost?: () => void;
  onCycleScopeMagnification?: () => void;
}

const PLAYER_HALF_HEIGHT = 0.9;
const PLAYER_RADIUS = 0.42;
const STAND_EYE_OFFSET = 0.72;
const CROUCH_EYE_OFFSET = 0.14;
const SLIDE_EYE_OFFSET = -0.05;
const DEAD_EYE_OFFSET = -0.58;

const WALK_SPEED = 6.2;
const SPRINT_SPEED = 9.1;
const CROUCH_SPEED = 3.5;
const SLIDE_BURST_SPEED = SPRINT_SPEED * 1.6;
const SLIDE_END_SPEED = CROUCH_SPEED * 1.15;
const SLIDE_DURATION_SEC = 0.65;
const SLIDE_COOLDOWN_SEC = 0.5;
const SLIDE_ROLL_RAD = (5 * Math.PI) / 180;
const ADS_SPEED_MULTIPLIER = 0.65;
const GROUND_ACCEL = 16.0;
const AIR_ACCEL = 4.5;
const GRAVITY = -23.5;
const JUMP_VELOCITY = 8.4;

export class PlayerController {
  public readonly camera: UniversalCamera;
  public readonly collider: Mesh;

  private scene: Scene;
  private canvas: HTMLCanvasElement;
  private audio: AudioEngine;
  private callbacks: PlayerInputCallbacks;

  private keys = new Set<string>();
  private yaw = 0;
  private pitch = 0;
  private recoilPitch = 0;
  private recoilYaw = 0;

  private velocity = new Vector3(0, 0, 0);
  private isGrounded = false;
  private isCrouching = false;
  private crouchToggled = false;
  private isSliding = false;
  private slideTimer = 0;
  private slideCooldown = 0;
  private slideDir = new Vector3(0, 0, 1);
  private isAds = false;
  private currentEyeOffset = STAND_EYE_OFFSET;
  private currentRoll = 0;

  private sensitivity = 0.0021;
  private adsSensitivityMultiplier = 0.68;
  private baseFovRad = (78 * Math.PI) / 180;
  private currentFovRad = (78 * Math.PI) / 180;

  private stepAccum = 0;
  private landDip = 0;
  private shakeIntensity = 0;
  private flinchPitch = 0;
  private flinchRoll = 0;
  private flinchYaw = 0;
  private screenShakeScale = 1.0;
  private moveSpeedMultiplier = 1.0;
  private deathLookTarget: Vector3 | null = null;
  private isPointerLocked = false;
  private isFireHeld = false;
  private canControl = false;
  private isDead = false;
  private orbitPreviewActive = true;

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

  public setCanControl(enabled: boolean): void {
    this.canControl = enabled;
    if (!enabled) {
      this.keys.clear();
      this.isFireHeld = false;
      this.isAds = false;
      this.isSliding = false;
      this.slideTimer = 0;
      this.callbacks.onFireRelease();
      this.callbacks.onAdsChange(false);
      this.callbacks.onScoreboardChange(false);
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
      this.keys.clear();
      this.isFireHeld = false;
      this.isAds = false;
      this.isSliding = false;
      this.slideTimer = 0;
      this.callbacks.onFireRelease();
      this.callbacks.onAdsChange(false);
    }
  }

  public spawnAt(pos: Vector3, yawRad: number): void {
    this.collider.position.set(pos.x, Math.max(PLAYER_HALF_HEIGHT + 0.05, pos.y), pos.z);
    this.velocity.setAll(0);
    this.yaw = yawRad;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.isCrouching = false;
    this.crouchToggled = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.slideCooldown = 0;
    this.isDead = false;
    this.deathLookTarget = null;
    this.shakeIntensity = 0;
    this.currentEyeOffset = STAND_EYE_OFFSET;
    this.currentRoll = 0;
    this.syncCameraTransform();
  }

  public setMoveSpeedMultiplier(mult: number): void {
    this.moveSpeedMultiplier = Math.max(0.5, Math.min(1.8, mult));
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
    let newScale = 1.0;
    if (typeof rawScale === 'number' && Number.isFinite(rawScale)) {
      newScale = Math.max(0.0, Math.min(1.0, rawScale));
    } else if (rawScale === null || rawScale === undefined) {
      newScale = 1.0;
    }

    let shakeValid = true;
    if (!Number.isFinite(this.shakeIntensity) || this.shakeIntensity < 0) {
      this.shakeIntensity = 0.0;
      shakeValid = false;
    } else if (this.shakeIntensity > 0.25) {
      this.shakeIntensity = 0.25;
    }

    let flinchValid = true;
    if (
      !Number.isFinite(this.flinchPitch) ||
      !Number.isFinite(this.flinchRoll) ||
      !Number.isFinite(this.flinchYaw)
    ) {
      this.flinchPitch = 0.0;
      this.flinchRoll = 0.0;
      this.flinchYaw = 0.0;
      flinchValid = false;
    } else {
      this.flinchPitch = Math.max(-0.045, Math.min(0.045, this.flinchPitch));
      this.flinchRoll = Math.max(-0.030, Math.min(0.030, this.flinchRoll));
      this.flinchYaw = Math.max(-0.018, Math.min(0.018, this.flinchYaw));

      const curNormSq =
        this.flinchPitch * this.flinchPitch +
        this.flinchRoll * this.flinchRoll +
        this.flinchYaw * this.flinchYaw;
      if (curNormSq > 0.05 * 0.05) {
        const curNorm = Math.sqrt(curNormSq);
        if (Number.isFinite(curNorm) && curNorm > 0.00001) {
          const s = 0.05 / curNorm;
          this.flinchPitch *= s;
          this.flinchRoll *= s;
          this.flinchYaw *= s;
        } else {
          this.flinchPitch = 0.0;
          this.flinchRoll = 0.0;
          this.flinchYaw = 0.0;
          flinchValid = false;
        }
      }
    }

    const storedScale = this.screenShakeScale;
    const storedScaleValid =
      typeof storedScale === 'number' &&
      Number.isFinite(storedScale) &&
      storedScale >= 0.0 &&
      storedScale <= 1.0;

    if (!storedScaleValid) {
      this.shakeIntensity = 0.0;
      this.flinchPitch = 0.0;
      this.flinchRoll = 0.0;
      this.flinchYaw = 0.0;
      this.screenShakeScale = newScale;
      return;
    }

    if (Math.abs(storedScale - newScale) < 0.0001) {
      this.screenShakeScale = newScale;
      return;
    }

    const oldScale = storedScale;
    this.screenShakeScale = newScale;

    if (this.screenShakeScale <= 0.0001) {
      this.shakeIntensity = 0.0;
      this.flinchPitch = 0.0;
      this.flinchRoll = 0.0;
      this.flinchYaw = 0.0;
      return;
    }

    if (oldScale > 0.0001) {
      const ratio = this.screenShakeScale / oldScale;
      if (Number.isFinite(ratio) && ratio > 0) {
        if (shakeValid && this.shakeIntensity > 0) {
          const rebasedShake = this.shakeIntensity * ratio;
          this.shakeIntensity = Number.isFinite(rebasedShake)
            ? Math.max(0.0, Math.min(0.25, rebasedShake))
            : 0.0;
        }

        if (flinchValid) {
          let p = this.flinchPitch * ratio;
          let r = this.flinchRoll * ratio;
          let y = this.flinchYaw * ratio;

          const MAX_PITCH = 0.045;
          const MAX_ROLL = 0.030;
          const MAX_YAW = 0.018;
          const MAX_NORM = 0.05;

          p = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p));
          r = Math.max(-MAX_ROLL, Math.min(MAX_ROLL, r));
          y = Math.max(-MAX_YAW, Math.min(MAX_YAW, y));

          const normSq = p * p + r * r + y * y;
          if (normSq > MAX_NORM * MAX_NORM) {
            const norm = Math.sqrt(normSq);
            if (norm > 0.00001) {
              const s = MAX_NORM / norm;
              p *= s;
              r *= s;
              y *= s;
            }
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
      }
    } else {
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

  public setBaseFov(fovDeg: number): void {
    const clamped = Math.max(70, Math.min(110, fovDeg));
    this.baseFovRad = (clamped * Math.PI) / 180;
  }

  public addRecoil(pitchKick: number, yawKick: number): void {
    this.recoilPitch += pitchKick;
    this.recoilYaw += yawKick;
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
    return this.isAds && !this.isDead;
  }

  public getIsFireHeld(): boolean {
    return this.isFireHeld && this.isPointerLocked && this.canControl && !this.isDead;
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

    const activeInput = this.isPointerLocked && this.canControl && !this.isDead;

    let forwardInput = 0;
    let strafeInput = 0;
    if (activeInput) {
      if (this.keys.has('KeyW')) forwardInput += 1;
      if (this.keys.has('KeyS')) forwardInput -= 1;
      if (this.keys.has('KeyD')) strafeInput += 1;
      if (this.keys.has('KeyA')) strafeInput -= 1;
    }

    const forwardDir = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const rightDir = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const wishDir = forwardDir.scale(forwardInput).addInPlace(rightDir.scale(strafeInput));
    if (wishDir.lengthSquared() > 0.0001) {
      wishDir.normalize();
    }

    if (!this.isSliding && this.slideCooldown > 0) {
      this.slideCooldown = Math.max(0, this.slideCooldown - clampedDt);
    }

    if (this.isSliding) {
      if (!activeInput) {
        this.endSlide(false);
      } else {
        this.slideTimer -= clampedDt;

        // Allow jump-cancel mid-slide while preserving forward momentum
        if (this.keys.has('Space') && this.isGrounded) {
          this.velocity.y = JUMP_VELOCITY;
          this.isGrounded = false;
          this.audio.playJump();
          this.endSlide(false);
        } else if (this.slideTimer <= 0) {
          this.endSlide(this.keys.has('ControlLeft'));
        }
      }
    }

    let sprinting = false;
    if (this.isSliding) {
      const progress = 1 - Math.max(0, this.slideTimer) / SLIDE_DURATION_SEC;
      const frictionCurve = Math.pow(1 - progress, 1.35);
      const slideSpeed = SLIDE_END_SPEED + (SLIDE_BURST_SPEED - SLIDE_END_SPEED) * frictionCurve;

      // Subtle lateral steering while locked into slide momentum
      const steeredDir = this.slideDir.clone();
      if (wishDir.lengthSquared() > 0.0001) {
        steeredDir.addInPlace(rightDir.scale(strafeInput * 0.22));
        steeredDir.normalize();
      }
      const blend = 1 - Math.exp(-18 * clampedDt);
      this.velocity.x += (steeredDir.x * slideSpeed - this.velocity.x) * blend;
      this.velocity.z += (steeredDir.z * slideSpeed - this.velocity.z) * blend;
    } else {
      const wantCrouch = activeInput && (this.keys.has('ControlLeft') || this.crouchToggled);
      if (!wantCrouch && this.isCrouching) {
        if (this.canStandUp()) {
          this.isCrouching = false;
        }
      } else if (wantCrouch) {
        this.isCrouching = true;
      }

      sprinting = this.isSprinting() && !this.isCrouching && !this.isAds && forwardInput > 0;
      let targetSpeed = WALK_SPEED;
      if (this.isCrouching) {
        targetSpeed = CROUCH_SPEED;
      } else if (sprinting) {
        targetSpeed = SPRINT_SPEED;
      }
      if (this.isAds) {
        targetSpeed *= ADS_SPEED_MULTIPLIER;
      }
      targetSpeed *= this.moveSpeedMultiplier;

      const targetVelX = activeInput ? wishDir.x * targetSpeed : 0;
      const targetVelZ = activeInput ? wishDir.z * targetSpeed : 0;
      const accel = this.isGrounded ? GROUND_ACCEL : AIR_ACCEL;
      const blend = 1 - Math.exp(-accel * clampedDt);

      this.velocity.x += (targetVelX - this.velocity.x) * blend;
      this.velocity.z += (targetVelZ - this.velocity.z) * blend;

      if (activeInput && this.keys.has('Space') && this.isGrounded) {
        this.velocity.y = JUMP_VELOCITY;
        this.isGrounded = false;
        this.audio.playJump();
      }
    }

    this.velocity.y += GRAVITY * clampedDt;

    const horizStep = new Vector3(this.velocity.x * clampedDt, 0, this.velocity.z * clampedDt);
    this.collider.moveWithCollisions(horizStep);

    const prevY = this.collider.position.y;
    const preImpactVy = this.velocity.y;
    const vertStep = new Vector3(0, this.velocity.y * clampedDt, 0);
    this.collider.moveWithCollisions(vertStep);

    const actualDeltaY = this.collider.position.y - prevY;
    const intendedDeltaY = vertStep.y;

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

    const targetRoll = this.isDead ? 0.28 : this.isSliding ? SLIDE_ROLL_RAD : 0;
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

    if (this.isDead && this.deathLookTarget) {
      const toKiller = this.deathLookTarget.subtract(this.camera.position);
      const flatDist = Math.hypot(toKiller.x, toKiller.z);
      if (flatDist > 0.2) {
        const targetYaw = Math.atan2(toKiller.x, toKiller.z);
        const targetPitch = Math.atan2(-toKiller.y + 1.25, flatDist);
        let yawDiff = ((targetYaw - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        const trackBlend = 1 - Math.exp(-6 * clampedDt);
        this.yaw += yawDiff * trackBlend;
        this.pitch += (Math.max(-1.2, Math.min(1.2, targetPitch)) - this.pitch) * trackBlend;
      }
    }

    const desiredFov =
      this.isAds && !this.isDead ? this.baseFovRad * targetAdsFovRatio : this.baseFovRad;
    this.currentFovRad += (desiredFov - this.currentFovRad) * (1 - Math.exp(-16 * clampedDt));
    this.camera.fov = this.currentFovRad;

    this.syncCameraTransform();
  }

  private tryStartSlide(): boolean {
    if (
      this.isDead ||
      !this.isGrounded ||
      this.isSliding ||
      this.slideCooldown > 0 ||
      this.isCrouching ||
      this.isAds ||
      !this.isSprinting()
    ) {
      return false;
    }

    const dir = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const rightDir = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    if (this.keys.has('KeyD')) dir.addInPlace(rightDir.scale(0.28));
    if (this.keys.has('KeyA')) dir.addInPlace(rightDir.scale(-0.28));
    if (dir.lengthSquared() > 0.0001) {
      dir.normalize();
    }

    this.slideDir.copyFrom(dir);
    this.velocity.x = dir.x * SLIDE_BURST_SPEED;
    this.velocity.z = dir.z * SLIDE_BURST_SPEED;

    this.isSliding = true;
    this.slideTimer = SLIDE_DURATION_SEC;
    this.crouchToggled = false;
    this.isCrouching = false;
    this.audio.playSlide();
    return true;
  }

  private endSlide(keepCrouchIfHeld: boolean): void {
    this.isSliding = false;
    this.slideTimer = 0;
    this.slideCooldown = SLIDE_COOLDOWN_SEC;
    if (keepCrouchIfHeld || !this.canStandUp()) {
      this.isCrouching = true;
    }
  }

  private isSprinting(): boolean {
    return (
      this.isPointerLocked &&
      this.canControl &&
      !this.isDead &&
      (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) &&
      this.keys.has('KeyW')
    );
  }

  private checkGroundRay(): boolean {
    const offsets = [
      new Vector3(0, 0, 0),
      new Vector3(0.26, 0, 0.26),
      new Vector3(-0.26, 0, 0.26),
      new Vector3(0.26, 0, -0.26),
      new Vector3(-0.26, 0, -0.26),
    ];

    for (const offset of offsets) {
      const origin = this.collider.position.add(offset);
      const ray = new Ray(origin, new Vector3(0, -1, 0), PLAYER_HALF_HEIGHT + 0.08);
      const hit = this.scene.pickWithRay(
        ray,
        (mesh) => mesh !== this.collider && mesh.checkCollisions && mesh.isEnabled()
      );
      if (hit?.hit) {
        return true;
      }
    }
    return false;
  }

  private canStandUp(): boolean {
    const ray = new Ray(this.collider.position, new Vector3(0, 1, 0), PLAYER_HALF_HEIGHT + 0.15);
    const hit = this.scene.pickWithRay(
      ray,
      (mesh) => mesh !== this.collider && mesh.checkCollisions && mesh.isEnabled()
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
    const effectivePitch = Math.max(-1.48, Math.min(1.48, this.pitch - this.recoilPitch));
    const effectiveYaw = this.yaw + this.recoilYaw;
    this.camera.rotation.set(effectivePitch, effectiveYaw, this.currentRoll);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.isPointerLocked || !this.canControl) return;

    if (
      e.code === 'Space' ||
      e.code === 'Tab' ||
      e.code === 'F1' ||
      e.code === 'F2' ||
      e.code === 'F3'
    ) {
      e.preventDefault();
    }

    this.keys.add(e.code);

    if (e.code === 'Tab' && !e.repeat) {
      this.callbacks.onScoreboardChange(true);
      return;
    }

    if (this.isDead) return;

    if ((e.code === 'KeyC' || e.code === 'ControlLeft') && !e.repeat) {
      const slid = this.tryStartSlide();
      if (!slid && e.code === 'KeyC' && !this.isSliding) {
        this.crouchToggled = !this.crouchToggled;
      }
    } else if (
      (e.code === 'ShiftLeft' || e.code === 'ShiftRight') &&
      this.crouchToggled &&
      this.canStandUp()
    ) {
      this.crouchToggled = false;
    } else if (e.code === 'KeyR' && !e.repeat) {
      this.callbacks.onReload();
    } else if (e.code === 'Digit1' && !e.repeat) {
      this.callbacks.onSelectSlot(1);
    } else if (e.code === 'Digit2' && !e.repeat) {
      this.callbacks.onSelectSlot(2);
    } else if (e.code === 'Digit3' && !e.repeat) {
      this.callbacks.onSelectSlot(3);
    } else if (e.code === 'Digit4' && !e.repeat) {
      this.callbacks.onSelectSlot(4);
    } else if ((e.code === 'F1' || e.code === 'Digit5') && !e.repeat) {
      this.callbacks.onActivateKillstreak?.(4);
    } else if ((e.code === 'F2' || e.code === 'Digit6') && !e.repeat) {
      this.callbacks.onActivateKillstreak?.(5);
    } else if ((e.code === 'F3' || e.code === 'Digit7') && !e.repeat) {
      this.callbacks.onActivateKillstreak?.(6);
    } else if (e.code === 'KeyB' && !e.repeat) {
      this.callbacks.onCycleScopeMagnification?.();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
    if (e.code === 'Tab') {
      this.callbacks.onScoreboardChange(false);
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isPointerLocked || !this.canControl || this.isDead) return;
    const sens = this.isAds ? this.sensitivity * this.adsSensitivityMultiplier : this.sensitivity;
    this.yaw += e.movementX * sens;
    this.pitch = Math.max(-1.46, Math.min(1.46, this.pitch + e.movementY * sens));
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.canControl) return;

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
    } else if (e.button === 2) {
      this.isAds = true;
      this.callbacks.onAdsChange(true);
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.isFireHeld = false;
      this.callbacks.onFireRelease();
    } else if (e.button === 2) {
      this.isAds = false;
      this.callbacks.onAdsChange(false);
    }
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
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
    this.callbacks.onFireRelease();
    this.callbacks.onAdsChange(false);
    this.callbacks.onScoreboardChange(false);
  }

  private onWindowBlur = (): void => {
    this.clearHeldInputs();
    this.callbacks.onFocusLost?.();
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
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
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.collider.dispose();
    this.camera.dispose();
  }
}
