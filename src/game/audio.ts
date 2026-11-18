/**
 * Procedural Web Audio synthesizer for weight-scaled gameplay SFX.
 * Zero external audio assets required.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private stepTimer = 0;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.38, this.ctx.currentTime, 0.02);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.38;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public unlock(): void {
    this.ensureContext();
  }

  public updateFootsteps(dt: number, speed: number, grounded: boolean): void {
    if (!grounded || speed < 2.2) {
      this.stepTimer = 0.06;
      return;
    }
    const interval = Math.max(0.055, 0.14 - speed * 0.003);
    this.stepTimer -= dt;
    if (this.stepTimer <= 0) {
      this.stepTimer = interval;
      this.playEnginePulse(Math.min(1, speed / 22));
    }
  }

  private playEnginePulse(intensity: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    const baseFreq = 58 + intensity * 64 + Math.random() * 6;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.88, now + 0.05);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260 + intensity * 380;

    gain.gain.setValueAtTime(0.045 * (0.35 + intensity * 0.65), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playJump(isDouble = false): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isDouble ? 'sine' : 'triangle';
    const startFreq = isDouble ? 340 : 210;
    const endFreq = isDouble ? 680 : 460;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.14);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playLand(impactSpeed: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const weight = Math.min(1, Math.max(0.2, impactSpeed / 22));
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110 + weight * 40, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.12);
    gain.gain.setValueAtTime(0.28 * weight, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playDash(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    // Noise burst for thruster surge
    const bufferSize = Math.floor(ctx.sampleRate * 0.18);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(240, now + 0.18);
    filter.Q.value = 1.6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);
  }

  public playBoostPad(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    [330, 495, 660, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const t = now + idx * 0.035;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.35, t + 0.12);
      gain.gain.setValueAtTime(0.11, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }

  public playWallBump(speed: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const weight = Math.min(1, Math.max(0.15, speed / 18));
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.09);
    gain.gain.setValueAtTime(0.14 * weight, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playOrbPickup(combo: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const semitone = Math.min(12, combo);
    const freq = 523.25 * Math.pow(2, semitone / 12);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.09);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  public playCheckpoint(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.055;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  }

  public playDamage(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.linearRampToValueAtTime(62, now + 0.26);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.29);
  }

  public playVictory(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.085;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.46);
    });
  }
}
