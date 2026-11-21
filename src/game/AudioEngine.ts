import { MapId } from '../maps/types';
import { WeaponId } from './types';

export type AmbientEnvironment = 'menu' | MapId;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private ambientNoiseBuffer: AudioBuffer | null = null;

  private masterVolume = 0.65;
  private sfxVolume = 0.85;
  private musicVolume = 0.35;
  private muted = false;

  private ambientEnv: AmbientEnvironment = 'menu';
  private ambientStarted = false;
  private ambientNoiseSrc: AudioBufferSourceNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;
  private ambientNoiseGain: GainNode | null = null;
  private ambientOscA: OscillatorNode | null = null;
  private ambientOscB: OscillatorNode | null = null;
  private ambientOscGain: GainNode | null = null;

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.masterGain);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx, 0.4);
      this.ambientNoiseBuffer = this.createNoiseBuffer(this.ctx, 2.5);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    if (!this.ambientStarted && this.ctx && this.musicGain && this.ambientNoiseBuffer) {
      this.startAmbientLoop();
    }
  }

  public setVolumes(
    masterVolume: number,
    sfxVolume: number,
    musicVolume: number,
    muted: boolean
  ): void {
    this.masterVolume = Math.max(0, Math.min(1, masterVolume));
    this.sfxVolume = Math.max(0, Math.min(1, sfxVolume));
    this.musicVolume = Math.max(0, Math.min(1, musicVolume));
    this.muted = muted;

    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, t, 0.02);
    }
    if (this.sfxGain) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVolume, t, 0.02);
    }
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(this.musicVolume, t, 0.03);
    }
  }

  public setAmbientEnvironment(env: AmbientEnvironment): void {
    this.ambientEnv = env;
    this.applyAmbientProfile();
  }

  private getPitchVariance(range = 0.035): number {
    return 1 + (Math.random() * 2 - 1) * range;
  }

  public playGunshot(weaponId: WeaponId): void {
    if (weaponId === 'knife') {
      this.playKnifeSlash();
      return;
    }

    this.unlock();
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.muted) return;

    const now = this.ctx.currentTime;
    const p = this.getPitchVariance(0.035);

    if (weaponId === 'shotgun') {
      // Heavy 12-gauge blast + chambered pump-action rack at +220ms
      this.triggerNoiseBurst(now, 0.22, 1180 * p, 0.52, 0.96);
      this.triggerTone(now, 138 * p, 34 * p, 0.18, 'triangle', 0.82);
      this.triggerTone(now, 240 * p, 58 * p, 0.09, 'sawtooth', 0.36);
      this.triggerTone(now + 0.22, 520 * p, 780 * p, 0.04, 'triangle', 0.18);
      this.triggerTone(now + 0.28, 760 * p, 480 * p, 0.045, 'square', 0.14);
    } else if (weaponId === 'ak47') {
      // Heavy 7.62mm supersonic crack + deep metallic bolt punch
      this.triggerNoiseBurst(now, 0.16, 1620 * p, 0.68, 0.88);
      this.triggerTone(now, 152 * p, 39 * p, 0.13, 'triangle', 0.72);
      this.triggerTone(now, 285 * p, 95 * p, 0.06, 'sawtooth', 0.3);
    } else if (weaponId === 'smg') {
      // Fast tight 9mm vector submachine snap
      this.triggerNoiseBurst(now, 0.075, 1320 * p, 1.35, 0.56);
      this.triggerTone(now, 175 * p, 64 * p, 0.06, 'triangle', 0.44);
    } else if (weaponId === 'sniper') {
      // High-caliber .50 BMG sniper blast: explosive crack + sub-bass shockwave
      this.triggerNoiseBurst(now, 0.26, 2100 * p, 0.65, 0.92);
      this.triggerTone(now, 115 * p, 28 * p, 0.3, 'triangle', 0.82);
      this.triggerTone(now, 260 * p, 52 * p, 0.16, 'sawtooth', 0.42);
    } else {
      // Crisp tactical .45 ACP sidearm snap
      this.triggerNoiseBurst(now, 0.13, 1780 * p, 0.95, 0.74);
      this.triggerTone(now, 205 * p, 54 * p, 0.1, 'sawtooth', 0.42);
    }
  }

  public playKnifeSlash(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.muted) return;

    const now = this.ctx.currentTime;
    const p = this.getPitchVariance(0.05);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(620 * p, now);
    filter.frequency.exponentialRampToValueAtTime(2800 * p, now + 0.09);
    filter.frequency.exponentialRampToValueAtTime(750 * p, now + 0.18);
    filter.Q.setValueAtTime(1.8, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.02, now);
    gain.gain.linearRampToValueAtTime(0.38, now + 0.045);
    gain.gain.exponentialRampToValueAtTime(0.002, now + 0.19);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.21);

    this.triggerTone(now + 0.02, 1650 * p, 920 * p, 0.06, 'triangle', 0.08);
  }

  public playKnifeHit(hitTarget: boolean): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.muted) return;

    const now = this.ctx.currentTime;
    const p = this.getPitchVariance(0.04);

    if (hitTarget) {
      // Visceral close-quarters blade impact + low chest thud
      this.triggerNoiseBurst(now, 0.08, 1450 * p, 1.1, 0.48);
      this.triggerTone(now, 190 * p, 48 * p, 0.09, 'triangle', 0.56);
      this.triggerTone(now, 920 * p, 420 * p, 0.05, 'sawtooth', 0.2);
    } else {
      // Metallic spark scrape against cover/concrete
      this.triggerNoiseBurst(now, 0.06, 2400 * p, 1.8, 0.3);
      this.triggerTone(now, 2150 * p, 1180 * p, 0.08, 'triangle', 0.24);
    }
  }

  public playPlayerHurt(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const p = this.getPitchVariance(0.04);
    // Ballistic blunt trauma impact + sharp visceral breath intake
    this.triggerNoiseBurst(now, 0.11, 420 * p, 1.25, 0.38);
    this.triggerTone(now, 320 * p, 110 * p, 0.10, 'triangle', 0.32);
    this.triggerTone(now + 0.02, 140 * p, 45 * p, 0.14, 'sine', 0.45);
  }

  public playDryFire(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    this.triggerTone(now, 1950, 900, 0.028, 'square', 0.18);
  }

  public playReloadStart(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    // Magazine release latch click + slide out
    this.triggerTone(now, 480, 260, 0.05, 'triangle', 0.24);
    this.triggerTone(now + 0.085, 720, 520, 0.035, 'square', 0.12);
  }

  public playReloadMagIn(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    // Crisp magazine seat thud + lock click
    this.triggerTone(now, 240, 110, 0.055, 'triangle', 0.25);
    this.triggerTone(now + 0.035, 1120, 860, 0.03, 'square', 0.14);
  }

  public playReloadComplete(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    // Bolt / slide rack snap
    this.triggerTone(now, 560, 780, 0.045, 'triangle', 0.24);
    this.triggerTone(now + 0.07, 980, 1360, 0.045, 'square', 0.19);
  }

  public playHitMarker(headshot: boolean): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    const p = this.getPitchVariance(headshot ? 0.02 : 0.03);
    if (headshot) {
      // Crisp metallic headshot ping chime
      this.triggerTone(now, 1950 * p, 2550 * p, 0.07, 'sine', 0.38);
      this.triggerTone(now + 0.02, 2750 * p, 3150 * p, 0.085, 'triangle', 0.26);
    } else {
      // Tactical body hitmarker thud + tick
      this.triggerTone(now, 1180 * p, 760 * p, 0.035, 'triangle', 0.24);
      this.triggerTone(now, 180 * p, 68 * p, 0.055, 'sine', 0.32);
    }
  }

  public playKillConfirmation(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    // Resonant elimination confirm chime (punchy mid-bass into high crystalline bell chime)
    this.triggerTone(now, 260, 440, 0.08, 'triangle', 0.32);
    this.triggerTone(now + 0.04, 780, 1180, 0.12, 'sine', 0.36);
    this.triggerTone(now + 0.08, 1480, 1920, 0.16, 'sine', 0.28);
  }

  public playWeaponEquip(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    this.triggerNoiseBurst(now, 0.04, 380, 1.2, 0.14);
    this.triggerTone(now + 0.025, 480, 720, 0.035, 'triangle', 0.18);
  }

  public playUiClick(variant: 'click' | 'toggle' = 'click'): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted || this.masterVolume <= 0 || this.sfxVolume <= 0) {
      return;
    }
    const now = this.ctx.currentTime;
    if (variant === 'toggle') {
      this.triggerTone(now, 680, 960, 0.032, 'triangle', 0.12);
      this.triggerTone(now + 0.024, 960, 1180, 0.028, 'sine', 0.09);
    } else {
      this.triggerTone(now, 880, 620, 0.026, 'triangle', 0.11);
    }
  }

  public playLowAmmoWarning(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    this.triggerTone(now, 840, 620, 0.025, 'triangle', 0.15);
  }

  public playHeartbeatPulse(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    this.triggerTone(now, 68, 38, 0.12, 'sine', 0.38);
    this.triggerTone(now + 0.14, 62, 34, 0.10, 'sine', 0.32);
  }

  public playFootstep(sprinting: boolean, crouching = false): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const pitch = (crouching ? 165 : 210) + Math.random() * 55;
    const gain = crouching ? 0.08 : sprinting ? 0.24 : 0.15;
    this.triggerNoiseBurst(now, 0.055, pitch, 1.15, gain);
    this.triggerTone(now, 92, 48, 0.04, 'sine', gain * 0.7);
  }

  public playJump(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    this.triggerNoiseBurst(now, 0.075, 340, 1.0, 0.17);
    this.triggerTone(now, 140, 190, 0.06, 'sine', 0.12);
  }

  public playLand(impactStrength: number): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const gain = Math.min(0.42, Math.max(0.12, impactStrength * 0.042));
    this.triggerNoiseBurst(now, 0.095, 215, 0.9, gain);
    this.triggerTone(now, 95, 40, 0.085, 'sine', gain * 0.95);
  }

  public playSlide(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || !this.ambientNoiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;

    // Swept gravel/concrete skid noise on sfxGain
    const src = this.ctx.createBufferSource();
    src.buffer = this.ambientNoiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1150, now);
    filter.frequency.exponentialRampToValueAtTime(340, now + 0.56);
    filter.Q.setValueAtTime(1.1, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.002, now + 0.58);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    src.start(now);
    src.stop(now + 0.6);

    // Subtle gear/boot friction low thump
    this.triggerTone(now, 125, 52, 0.14, 'triangle', 0.22);
  }

  public playKillstreakReady(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    this.triggerTone(now, 660, 880, 0.09, 'triangle', 0.24);
    this.triggerTone(now + 0.09, 880, 1175, 0.12, 'sine', 0.26);
  }

  public playUavSweep(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    this.triggerTone(now, 1340, 980, 0.14, 'sine', 0.12);
  }

  public playAirstrikeIncoming(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || !this.ambientNoiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.ambientNoiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1450, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + 0.72);
    filter.Q.setValueAtTime(2.6, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.002, now + 0.75);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.78);
  }

  public playExplosion(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || !this.ambientNoiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.ambientNoiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(680, now);
    filter.frequency.exponentialRampToValueAtTime(95, now + 0.65);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.002, now + 0.7);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.72);

    this.triggerTone(now, 110, 32, 0.38, 'triangle', 0.45);
  }

  public playOverdriveActivate(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    this.triggerTone(now, 220, 660, 0.24, 'sawtooth', 0.16);
    this.triggerTone(now + 0.08, 440, 880, 0.28, 'sine', 0.22);
  }

  public playPing(isEnemy: boolean): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    if (isEnemy) {
      // Sharp two-tone hostile spot alert
      this.triggerTone(now, 1480, 1760, 0.055, 'triangle', 0.26);
      this.triggerTone(now + 0.065, 1760, 1320, 0.08, 'sine', 0.24);
    } else {
      // Clean tactical waypoint blip
      this.triggerTone(now, 1040, 1380, 0.065, 'sine', 0.2);
      this.triggerTone(now + 0.05, 1380, 1560, 0.05, 'triangle', 0.12);
    }
  }

  private startAmbientLoop(): void {
    if (!this.ctx || !this.musicGain || !this.ambientNoiseBuffer || this.ambientStarted) return;
    this.ambientStarted = true;

    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = this.ambientNoiseBuffer;
    noiseSrc.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 320;
    filter.Q.value = 0.75;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.value = 0.05;

    noiseSrc.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.musicGain);
    noiseSrc.start();

    const oscA = this.ctx.createOscillator();
    oscA.type = 'sine';
    oscA.frequency.value = 65;

    const oscB = this.ctx.createOscillator();
    oscB.type = 'triangle';
    oscB.frequency.value = 97.5;

    const oscGain = this.ctx.createGain();
    oscGain.gain.value = 0.04;

    oscA.connect(oscGain);
    oscB.connect(oscGain);
    oscGain.connect(this.musicGain);
    oscA.start();
    oscB.start();

    this.ambientNoiseSrc = noiseSrc;
    this.ambientFilter = filter;
    this.ambientNoiseGain = noiseGain;
    this.ambientOscA = oscA;
    this.ambientOscB = oscB;
    this.ambientOscGain = oscGain;

    this.applyAmbientProfile();
  }

  private applyAmbientProfile(): void {
    if (!this.ctx || !this.ambientFilter || !this.ambientNoiseGain || !this.ambientOscA || !this.ambientOscB || !this.ambientOscGain) {
      return;
    }

    const t = this.ctx.currentTime;
    let noiseFreq = 320;
    let noiseQ = 0.8;
    let noiseLevel = 0.045;
    let oscAFreq = 65;
    let oscBFreq = 97.5;
    let oscLevel = 0.035;

    switch (this.ambientEnv) {
      case 'menu':
        noiseFreq = 240;
        noiseQ = 0.9;
        noiseLevel = 0.03;
        oscAFreq = 65;
        oscBFreq = 97.5;
        oscLevel = 0.055;
        break;
      case 'urban':
        noiseFreq = 260;
        noiseQ = 0.7;
        noiseLevel = 0.065;
        oscAFreq = 58;
        oscBFreq = 87;
        oscLevel = 0.02;
        break;
      case 'desert':
        noiseFreq = 460;
        noiseQ = 1.2;
        noiseLevel = 0.085;
        oscAFreq = 73;
        oscBFreq = 110;
        oscLevel = 0.015;
        break;
      case 'industrial':
        noiseFreq = 310;
        noiseQ = 1.5;
        noiseLevel = 0.055;
        oscAFreq = 55;
        oscBFreq = 110;
        oscLevel = 0.045;
        break;
      case 'forest':
        noiseFreq = 620;
        noiseQ = 0.65;
        noiseLevel = 0.065;
        oscAFreq = 82;
        oscBFreq = 123;
        oscLevel = 0.012;
        break;
    }

    this.ambientFilter.frequency.setTargetAtTime(noiseFreq, t, 0.25);
    this.ambientFilter.Q.setTargetAtTime(noiseQ, t, 0.25);
    this.ambientNoiseGain.gain.setTargetAtTime(noiseLevel, t, 0.25);
    this.ambientOscA.frequency.setTargetAtTime(oscAFreq, t, 0.25);
    this.ambientOscB.frequency.setTargetAtTime(oscBFreq, t, 0.25);
    this.ambientOscGain.gain.setTargetAtTime(oscLevel, t, 0.25);
  }

  private triggerNoiseBurst(
    startTime: number,
    duration: number,
    filterFreq: number,
    q: number,
    peakGain: number
  ): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, startTime);
    filter.Q.setValueAtTime(q, startTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(peakGain, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    src.start(startTime);
    src.stop(startTime + duration + 0.01);
  }

  private triggerTone(
    startTime: number,
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    peakGain: number
  ): void {
    if (!this.ctx || !this.sfxGain) return;

    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), startTime + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(peakGain, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  private createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public dispose(): void {
    try {
      this.ambientNoiseSrc?.stop();
      this.ambientOscA?.stop();
      this.ambientOscB?.stop();
    } catch {
      // Ignore already stopped sources
    }
    this.ambientNoiseSrc = null;
    this.ambientOscA = null;
    this.ambientOscB = null;
    this.ambientStarted = false;

    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
      this.sfxGain = null;
      this.musicGain = null;
    }
  }
}
