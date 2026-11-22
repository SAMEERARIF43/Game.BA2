import { HighlightReelState, KillHighlightClip } from './types';

export const HIGHLIGHT_DURATION_SEC = 5.0;
export const HIGHLIGHT_TIME_SCALE = 0.28;

export interface HighlightTimelineSample {
  progress: number;
  elapsedSec: number;
  durationSec: number;
  timeScale: number;
  slowMoElapsedSec: number;
  /** 0..1 progress of projectile flight (starts at 0.10, impacts at 0.48) */
  projectileProgress: number;
  /** 0..1 progress of post-impact collapse & orbit (0.48 -> 1.00) */
  impactProgress: number;
  hasFired: boolean;
  hasImpacted: boolean;
}

export interface HighlightVec3 {
  x: number;
  y: number;
  z: number;
}

export interface HighlightCameraSample {
  cameraPos: HighlightVec3;
  cameraTarget: HighlightVec3;
  muzzlePos: HighlightVec3;
  impactPos: HighlightVec3;
  projectilePos: HighlightVec3;
  aimYaw: number;
  aimPitch: number;
  fovScale: number;
}

export function createEmptyHighlightReelState(): HighlightReelState {
  return {
    available: false,
    isPlaying: false,
    finished: false,
    progress: 0,
    elapsedSec: 0,
    durationSec: HIGHLIGHT_DURATION_SEC,
    timeScale: HIGHLIGHT_TIME_SCALE,
    clip: null,
  };
}

export function resolveMvpHighlightClip(
  mvpId: string | null | undefined,
  clipsByKiller: ReadonlyMap<string, KillHighlightClip>,
  latestClip: KillHighlightClip | null
): KillHighlightClip | null {
  if (mvpId && clipsByKiller.has(mvpId)) {
    return clipsByKiller.get(mvpId) ?? null;
  }
  return latestClip;
}

export function evaluateHighlightTimeline(
  elapsedSec: number,
  durationSec = HIGHLIGHT_DURATION_SEC,
  timeScale = HIGHLIGHT_TIME_SCALE
): HighlightTimelineSample {
  const safeDuration = Math.max(0.5, durationSec);
  const clampedElapsed = Math.max(0, Math.min(safeDuration, elapsedSec));
  const progress = clampedElapsed / safeDuration;

  const fireStart = 0.1;
  const impactPoint = 0.48;
  const projectileProgress =
    progress <= fireStart
      ? 0
      : progress >= impactPoint
        ? 1
        : (progress - fireStart) / (impactPoint - fireStart);

  const impactProgress =
    progress <= impactPoint ? 0 : (progress - impactPoint) / (1 - impactPoint);

  return {
    progress,
    elapsedSec: clampedElapsed,
    durationSec: safeDuration,
    timeScale,
    slowMoElapsedSec: Math.round(clampedElapsed * timeScale * 100) / 100,
    projectileProgress,
    impactProgress,
    hasFired: progress >= fireStart,
    hasImpacted: progress >= impactPoint,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export function computeHighlightPoseVectors(
  clip: KillHighlightClip,
  timeline: HighlightTimelineSample
): HighlightCameraSample {
  let dx = clip.victimPos.x - clip.killerPos.x;
  let dy = clip.victimPos.y - clip.killerPos.y;
  let dz = clip.victimPos.z - clip.killerPos.z;
  let flatDist = Math.hypot(dx, dz);

  // Ensure non-degenerate facing if killer & victim collapsed on same spot
  if (flatDist < 1.2) {
    const yaw = Number.isFinite(clip.killerYaw) ? clip.killerYaw : 0;
    dx = Math.sin(yaw) * 4.5;
    dz = Math.cos(yaw) * 4.5;
    flatDist = 4.5;
  }

  const dirX = dx / flatDist;
  const dirZ = dz / flatDist;
  const rightX = dirZ;
  const rightZ = -dirX;
  const aimYaw = Math.atan2(dx, dz);

  const impactHeight = clip.headshot ? 1.56 : 1.18;
  const muzzleHeight = 1.42;

  const muzzlePos: HighlightVec3 = {
    x: clip.killerPos.x + dirX * 0.72 + rightX * 0.18,
    y: clip.killerPos.y + muzzleHeight,
    z: clip.killerPos.z + dirZ * 0.72 + rightZ * 0.18,
  };

  const impactPos: HighlightVec3 = {
    x: clip.victimPos.x,
    y: clip.victimPos.y + impactHeight,
    z: clip.victimPos.z,
  };

  const aimDy = impactPos.y - muzzlePos.y;
  const aimPitch = Math.max(-0.55, Math.min(0.55, -Math.atan2(aimDy, flatDist)));

  const projectilePos: HighlightVec3 = {
    x: lerp(muzzlePos.x, impactPos.x, timeline.projectileProgress),
    y: lerp(muzzlePos.y, impactPos.y, timeline.projectileProgress),
    z: lerp(muzzlePos.z, impactPos.z, timeline.projectileProgress),
  };

  let cameraPos: HighlightVec3;
  let cameraTarget: HighlightVec3;
  let fovScale = 0.86;

  if (!timeline.hasImpacted) {
    // Phase 1: Killer over-the-shoulder -> glides alongside the slow-mo tracer
    const chaseBlend = smoothstep(timeline.progress / 0.48);
    const killerShoulderPos: HighlightVec3 = {
      x: clip.killerPos.x - dirX * 2.1 + rightX * 0.95,
      y: clip.killerPos.y + 1.85,
      z: clip.killerPos.z - dirZ * 2.1 + rightZ * 0.95,
    };

    const bulletTrackPos: HighlightVec3 = {
      x: projectilePos.x - dirX * 1.45 + rightX * 1.15,
      y: projectilePos.y + 0.35,
      z: projectilePos.z - dirZ * 1.45 + rightZ * 1.15,
    };

    cameraPos = {
      x: lerp(killerShoulderPos.x, bulletTrackPos.x, chaseBlend),
      y: lerp(killerShoulderPos.y, bulletTrackPos.y, chaseBlend),
      z: lerp(killerShoulderPos.z, bulletTrackPos.z, chaseBlend),
    };

    cameraTarget = {
      x: lerp(impactPos.x, projectilePos.x, 0.35),
      y: lerp(impactPos.y, projectilePos.y, 0.35),
      z: lerp(impactPos.z, projectilePos.z, 0.35),
    };
    fovScale = lerp(0.88, 0.78, chaseBlend);
  } else {
    // Phase 2: Dramatic low-angle slow-motion orbit around victim's elimination
    const orbBlend = smoothstep(timeline.impactProgress);
    const entryAngle = Math.atan2(
      projectilePos.x - dirX * 1.45 + rightX * 1.15 - impactPos.x,
      projectilePos.z - dirZ * 1.45 + rightZ * 1.15 - impactPos.z
    );
    const orbitAngle = entryAngle + orbBlend * 0.95;
    const orbitRadius = lerp(2.2, 3.3, orbBlend);

    cameraPos = {
      x: impactPos.x + Math.sin(orbitAngle) * orbitRadius,
      y: clip.victimPos.y + lerp(1.5, 1.15, orbBlend),
      z: impactPos.z + Math.cos(orbitAngle) * orbitRadius,
    };

    cameraTarget = {
      x: impactPos.x,
      y: clip.victimPos.y + lerp(1.25, 0.72, orbBlend),
      z: impactPos.z,
    };
    fovScale = lerp(0.78, 0.92, orbBlend);
  }

  return {
    cameraPos,
    cameraTarget,
    muzzlePos,
    impactPos,
    projectilePos,
    aimYaw,
    aimPitch,
    fovScale,
  };
}
