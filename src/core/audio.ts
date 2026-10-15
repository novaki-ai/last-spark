// WebAudio: music (looped Lyria clips), voice lines, and code-synthesized SFX.
import { audioUrl } from './assets';

export type MusicKey =
  | 'menu' | 'stage1' | 'stage2' | 'stage3' | 'boss' | 'finalboss' | 'victory' | 'gameover';

class AudioSys {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private voiceGain!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private currentMusic: { src: AudioBufferSourceNode; gain: GainNode; key: string } | null = null;
  private pendingMusic: string | null = null;
  musicVolume = 0.7;
  sfxVolume = 0.8;
  private lastSfx = new Map<string, number>();
  private unlocked = false;

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this.voiceGain = this.ctx.createGain();
    this.voiceGain.connect(this.master);
    this.applyVolumes();
    this.preload();
  }

  unlock() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.unlocked = true;
    if (this.pendingMusic) {
      this.playMusic(this.pendingMusic as MusicKey);
      this.pendingMusic = null;
    }
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.musicGain.gain.value = this.musicVolume * 0.85;
    this.sfxGain.gain.value = this.sfxVolume;
    this.voiceGain.gain.value = Math.min(1, this.sfxVolume * 1.25 + 0.1);
  }

  private async preload() {
    // decode all audio clips up-front (small files, local)
    const names: string[] = [];
    for (let i = 0; i < 40; i++) names.push('');
    const wanted = [
      'mus-menu', 'mus-stage1', 'mus-stage2', 'mus-stage3', 'mus-boss', 'mus-finalboss',
      'mus-victory', 'mus-gameover',
      'vox-intro1', 'vox-intro2', 'vox-intro3', 'vox-stage2', 'vox-stage3',
      'vox-post1', 'vox-post2', 'vox-ending1', 'vox-ending2', 'vox-gameover',
      'vox-mossmaw-intro', 'vox-mossmaw-death', 'vox-clog-intro', 'vox-clog-death',
      'vox-soak-intro', 'vox-soak-taunt', 'vox-soak-death',
      'vox-novaki-start', 'vox-novaki-levelup', 'vox-novaki-victory',
    ];
    await Promise.all(wanted.map(async (n) => {
      const url = audioUrl(n + '.ogg');
      if (!url) return;
      try {
        const res = await fetch(url);
        const ab = await res.arrayBuffer();
        const buf = await this.ctx!.decodeAudioData(ab);
        this.buffers.set(n, buf);
      } catch { /* missing clip is non-fatal */ }
    }));
  }

  playMusic(key: MusicKey, fade = 1.0) {
    if (!this.ctx || !this.unlocked) {
      this.pendingMusic = key;
      return;
    }
    if (this.currentMusic?.key === key) return;
    const buf = this.buffers.get('mus-' + key);
    const now = this.ctx.currentTime;
    if (this.currentMusic) {
      const old = this.currentMusic;
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + fade);
      setTimeout(() => { try { old.src.stop(); } catch { /* */ } }, fade * 1000 + 60);
      this.currentMusic = null;
    }
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(1, now + fade);
    src.connect(g);
    g.connect(this.musicGain);
    src.start();
    this.currentMusic = { src, gain: g, key };
  }

  stopMusic(fade = 0.6) {
    if (!this.ctx || !this.currentMusic) return;
    const now = this.ctx.currentTime;
    const old = this.currentMusic;
    old.gain.gain.setValueAtTime(old.gain.gain.value, now);
    old.gain.gain.linearRampToValueAtTime(0, now + fade);
    setTimeout(() => { try { old.src.stop(); } catch { /* */ } }, fade * 1000 + 60);
    this.currentMusic = null;
  }

  private voiceSrc: AudioBufferSourceNode | null = null;

  playVoice(name: string) {
    if (!this.ctx || !this.unlocked) return;
    const buf = this.buffers.get('vox-' + name);
    if (!buf) return;
    this.stopVoice();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.voiceGain);
    src.start();
    this.voiceSrc = src;
    // duck music while speaking
    const now = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(this.musicVolume * 0.3, now + 0.25);
    src.onended = () => {
      if (this.voiceSrc === src) this.voiceSrc = null;
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
      this.musicGain.gain.linearRampToValueAtTime(this.musicVolume * 0.85, t + 0.8);
    };
  }

  stopVoice() {
    if (this.voiceSrc) {
      try { this.voiceSrc.stop(); } catch { /* */ }
      this.voiceSrc = null;
    }
  }

  // ---------------- Synthesized SFX ----------------
  private canPlay(id: string, minGap: number): boolean {
    if (!this.ctx || !this.unlocked) return false;
    const now = performance.now();
    const last = this.lastSfx.get(id) ?? 0;
    if (now - last < minGap) return false;
    this.lastSfx.set(id, now);
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide !== 0) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol: number, filterFreq: number, type: BiquadFilterType = 'lowpass', delay = 0, slideTo = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filterFreq, t0);
    if (slideTo > 0) f.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(t0);
  }

  sfx(name: string, opt: { pitch?: number } = {}) {
    const p = opt.pitch ?? 1;
    switch (name) {
      case 'shoot':
        if (this.canPlay('shoot', 45)) this.tone(620 * p, 0.09, 'square', 0.05, -260 * p);
        break;
      case 'whip':
        if (this.canPlay('whip', 90)) this.noise(0.14, 0.14, 2600, 'bandpass', 0, 700);
        break;
      case 'hit':
        if (this.canPlay('hit', 35)) this.noise(0.06, 0.1, 1800 * p, 'bandpass');
        break;
      case 'die':
        if (this.canPlay('die', 55)) { this.noise(0.16, 0.13, 900 * p, 'lowpass', 0, 220); this.tone(190 * p, 0.14, 'triangle', 0.06, -90 * p); }
        break;
      case 'xp':
        if (this.canPlay('xp', 50)) this.tone(880 * p, 0.07, 'sine', 0.05, 160 * p);
        break;
      case 'hurt':
        if (this.canPlay('hurt', 180)) { this.tone(170, 0.22, 'sawtooth', 0.16, -70); this.noise(0.18, 0.12, 500); }
        break;
      case 'dash':
        if (this.canPlay('dash', 150)) this.noise(0.16, 0.13, 1200, 'bandpass', 0, 3000);
        break;
      case 'levelup':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.09, 0, i * 0.07));
        break;
      case 'chest':
        [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'square', 0.05, 0, i * 0.06));
        break;
      case 'nova':
        if (this.canPlay('nova', 120)) { this.noise(0.3, 0.16, 600, 'lowpass', 0, 120); this.tone(120, 0.3, 'sine', 0.14, -50); }
        break;
      case 'explosion':
        if (this.canPlay('explosion', 90)) { this.noise(0.4, 0.2, 900, 'lowpass', 0, 140); this.tone(90, 0.35, 'sine', 0.16, -40); }
        break;
      case 'bossroar':
        this.tone(70, 0.9, 'sawtooth', 0.22, 30);
        this.noise(0.8, 0.16, 300, 'lowpass');
        break;
      case 'bosshit':
        if (this.canPlay('bosshit', 100)) this.tone(140, 0.12, 'square', 0.09, -40);
        break;
      case 'ui':
        if (this.canPlay('ui', 40)) this.tone(700, 0.06, 'sine', 0.06, 120);
        break;
      case 'pause':
        this.tone(440, 0.12, 'sine', 0.08, -160);
        break;
      case 'heal':
        [523, 784].forEach((f, i) => this.tone(f, 0.2, 'sine', 0.07, 0, i * 0.08));
        break;
      case 'magnet':
        this.tone(1200, 0.25, 'sine', 0.08, -700);
        break;
      case 'bomb':
        this.noise(0.7, 0.28, 700, 'lowpass', 0, 90);
        this.tone(60, 0.6, 'sine', 0.22, -25);
        break;
      case 'telegraph':
        if (this.canPlay('telegraph', 200)) this.tone(330, 0.14, 'square', 0.05, 0);
        break;
      case 'lightning':
        if (this.canPlay('lightning', 80)) { this.noise(0.22, 0.2, 4000, 'highpass'); this.tone(180, 0.18, 'sawtooth', 0.08, -120); }
        break;
      case 'enemyshot':
        if (this.canPlay('enemyshot', 90)) this.tone(300 * p, 0.1, 'square', 0.04, 80 * p);
        break;
      case 'split':
        if (this.canPlay('split', 80)) this.tone(500, 0.12, 'triangle', 0.07, 260);
        break;
    }
  }
}

export const Audio = new AudioSys();
