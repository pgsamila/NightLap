/**
 * Synthesizer Audio Engine using Web Audio API
 * Generates dynamic engine sounds, RPM revving, tire skidding squeal, and gear shifts.
 * Completely self-contained with zero external audio assets.
 */
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isInitialized = false;

    // Nodes
    this.masterGain = null;
    this.engineGain = null;
    this.osc1 = null;
    this.osc2 = null;
    this.engineFilter = null;

    this.skidGain = null;
    this.skidFilter = null;
    this.skidSource = null;
  }

  init() {
    if (this.isInitialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // --- Engine Synthesizer ---
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(0.25, this.ctx.currentTime);

      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.setValueAtTime(450, this.ctx.currentTime);
      this.engineFilter.Q.setValueAtTime(3.5, this.ctx.currentTime);

      // Dual sawtooth oscillators for aggressive sportscar engine rumble
      this.osc1 = this.ctx.createOscillator();
      this.osc1.type = 'sawtooth';
      this.osc1.frequency.setValueAtTime(45, this.ctx.currentTime);

      this.osc2 = this.ctx.createOscillator();
      this.osc2.type = 'triangle';
      this.osc2.frequency.setValueAtTime(45.5, this.ctx.currentTime);

      // Subtle distortion wave shaper for exhaust rasp
      const distortion = this.ctx.createWaveShaper();
      distortion.curve = this.makeDistortionCurve(20);

      this.osc1.connect(distortion);
      this.osc2.connect(distortion);
      distortion.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);

      this.osc1.start();
      this.osc2.start();

      // --- Tire Skid Synthesizer (Filtered White Noise) ---
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      this.skidSource = this.ctx.createBufferSource();
      this.skidSource.buffer = noiseBuffer;
      this.skidSource.loop = true;

      this.skidFilter = this.ctx.createBiquadFilter();
      this.skidFilter.type = 'bandpass';
      this.skidFilter.frequency.setValueAtTime(1100, this.ctx.currentTime);
      this.skidFilter.Q.setValueAtTime(2.0, this.ctx.currentTime);

      this.skidGain = this.ctx.createGain();
      this.skidGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      this.skidSource.connect(this.skidFilter);
      this.skidFilter.connect(this.skidGain);
      this.skidGain.connect(this.masterGain);

      this.skidSource.start();

      // --- High-Speed Aerodynamic Wind Rush Synthesizer ---
      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'lowpass';
      this.windFilter.frequency.setValueAtTime(350, this.ctx.currentTime);
      this.windFilter.Q.setValueAtTime(1.2, this.ctx.currentTime);

      this.windGain = this.ctx.createGain();
      this.windGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      this.skidSource.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.masterGain);

      this.isInitialized = true;
    } catch (e) {
      console.warn('Web Audio initialization error:', e);
    }
  }

  makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  update(rpm, throttle, slipAmount, speedKmh = 0) {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const t = this.ctx.currentTime;

    // Pitch engine oscillators with RPM: 950 RPM -> ~40 Hz, 7500 RPM -> ~340 Hz
    const fundamentalFreq = 35 + (rpm / 7500) * 300;
    this.osc1.frequency.setTargetAtTime(fundamentalFreq, t, 0.04);
    this.osc2.frequency.setTargetAtTime(fundamentalFreq * 1.5, t, 0.04);

    // Open lowpass filter wider under throttle
    const cutoff = 450 + (rpm / 7500) * 1400 + (throttle ? 900 : 0);
    this.engineFilter.frequency.setTargetAtTime(cutoff, t, 0.05);

    // Engine volume
    const vol = 0.18 + (rpm / 7500) * 0.28 + (throttle ? 0.16 : 0);
    this.engineGain.gain.setTargetAtTime(vol, t, 0.04);

    // Tire squeal based on lateral slip
    const skidVol = Math.min(0.35, Math.max(0, (slipAmount - 0.2) * 0.8));
    this.skidGain.gain.setTargetAtTime(skidVol, t, 0.05);

    // Aerodynamic wind rushing noise building smoothly above 50 km/h
    if (this.windGain && this.windFilter) {
      const windVol = Math.min(0.28, Math.max(0, (speedKmh - 50) / 180) * 0.28);
      this.windGain.gain.setTargetAtTime(windVol, t, 0.08);
      const windCutoff = 300 + Math.min(1200, (speedKmh / 200) * 1200);
      this.windFilter.frequency.setTargetAtTime(windCutoff, t, 0.08);
    }
  }

  playShiftSound() {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;
    try {
      const t = this.ctx.currentTime;
      // Quick exhaust pop / clutch clunk
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.12);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.13);
    } catch (_) {}
  }

  playCountdownBeep() {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t); // A5 racing start beep

      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.16);
    } catch (_) {}
  }

  playGoTone() {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;
    try {
      const t = this.ctx.currentTime;
      // Dual high frequency launch chime (A6 + C#7 chord)
      [1760, 2200].forEach(freq => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.45, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t);
        osc.stop(t + 0.52);
      });
    } catch (_) {}
  }

  pause() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.5, this.ctx.currentTime);
    }
    return this.isMuted;
  }
}
