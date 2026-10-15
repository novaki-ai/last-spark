// Pooled visual effects: particles, damage numbers, slashes, beams, telegraphs, ground zones.
export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number;
  color: string; kind: number; grow: number; drag: number;
}
// kinds: 0 dot, 1 smoke (rises, fades), 2 spark (gravity-less streak dot), 3 ring (expanding), 4 ember (rises, wobbles)

export interface DmgNum {
  x: number; y: number; vy: number; life: number;
  text: string; crit: boolean; color: string;
}

export interface Slash {
  x: number; y: number; angle: number; arc: number; range: number;
  t: number; dur: number; color: string;
}

export interface Beam {
  x: number; y: number; angle: number; len: number; w: number;
  t: number; dur: number; color: string; sweep: number; // angular velocity rad/s
  hitIds: Set<number> | null;
}

export interface Zone {
  x: number; y: number; r: number; dps: number; life: number; maxLife: number;
  kind: 'fire' | 'vortex' | 'tar' | 'pool' | 'jet';
  hostile: boolean; pull: number; tickT: number; seed: number;
}

export interface Telegraph {
  x: number; y: number; r: number; t: number; dur: number;
  kind: 'circle' | 'line'; angle: number; len: number; w: number;
  fire: (() => void) | null;
}

const PMAX = 900;
const DMAX = 120;

export class Effects {
  particles: Particle[] = [];
  dmgNums: DmgNum[] = [];
  slashes: Slash[] = [];
  beams: Beam[] = [];
  zones: Zone[] = [];
  telegraphs: Telegraph[] = [];
  flashT = 0; // full-screen white flash timer
  dmgNumbersEnabled = true;

  clear() {
    this.particles.length = 0;
    this.dmgNums.length = 0;
    this.slashes.length = 0;
    this.beams.length = 0;
    this.zones.length = 0;
    this.telegraphs.length = 0;
    this.flashT = 0;
  }

  spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, kind = 0, grow = 0, drag = 0) {
    if (this.particles.length >= PMAX) return;
    this.particles.push({ x, y, vx, vy, life, maxLife: life, size, color, kind, grow, drag });
  }

  burst(x: number, y: number, n: number, speed: number, color: string, size = 3, kind = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.3 + Math.random() * 0.35, size * (0.6 + Math.random() * 0.8), color, kind);
    }
  }

  ring(x: number, y: number, color: string, startSize: number, grow: number, life = 0.4) {
    this.spawn(x, y, 0, 0, life, startSize, color, 3, grow);
  }

  smoke(x: number, y: number, size = 4) {
    this.spawn(x, y, (Math.random() - 0.5) * 14, -22 - Math.random() * 18, 0.9 + Math.random() * 0.7, size, 'rgba(200,200,200,0.5)', 1, 6);
  }

  embers(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      this.spawn(
        x + (Math.random() - 0.5) * 16, y + (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 30, -30 - Math.random() * 40,
        0.5 + Math.random() * 0.5, 2 + Math.random() * 2.5,
        Math.random() < 0.5 ? '#ffb14e' : '#ff7b2e', 4,
      );
    }
  }

  dmg(x: number, y: number, amount: number, crit: boolean, color?: string) {
    if (!this.dmgNumbersEnabled) return;
    if (this.dmgNums.length >= DMAX) this.dmgNums.shift();
    const text = amount >= 1000 ? `${(amount / 1000).toFixed(1)}k` : `${Math.round(amount)}`;
    this.dmgNums.push({
      x: x + (Math.random() - 0.5) * 14, y: y - 10, vy: -52, life: 0.7,
      text, crit, color: color ?? (crit ? '#ffde59' : '#ffffff'),
    });
  }

  text(x: number, y: number, text: string, color: string) {
    if (this.dmgNums.length >= DMAX) this.dmgNums.shift();
    this.dmgNums.push({ x, y: y - 10, vy: -40, life: 1.1, text, crit: false, color });
  }

  slash(x: number, y: number, angle: number, arc: number, range: number, color: string, dur = 0.18) {
    this.slashes.push({ x, y, angle, arc, range, t: 0, dur, color });
  }

  beam(x: number, y: number, angle: number, len: number, w: number, color: string, dur: number, sweep = 0, hitIds: Set<number> | null = null) {
    this.beams.push({ x, y, angle, len, w, t: 0, dur, color, sweep, hitIds });
  }

  zone(x: number, y: number, r: number, dps: number, life: number, kind: Zone['kind'], hostile: boolean, pull = 0) {
    this.zones.push({ x, y, r, dps, life, maxLife: life, kind, hostile, pull, tickT: 0, seed: Math.random() * 100 });
  }

  telegraph(x: number, y: number, r: number, dur: number, fire: () => void) {
    this.telegraphs.push({ x, y, r, t: 0, dur, kind: 'circle', angle: 0, len: 0, w: 0, fire });
  }

  telegraphLine(x: number, y: number, angle: number, len: number, w: number, dur: number, fire: () => void) {
    this.telegraphs.push({ x, y, r: 0, t: 0, dur, kind: 'line', angle, len, w, fire });
  }

  update(dt: number) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
      if (p.kind === 3) p.size += p.grow * dt;
      if (p.grow && p.kind !== 3) p.size += p.grow * dt;
    }
    for (let i = this.dmgNums.length - 1; i >= 0; i--) {
      const d = this.dmgNums[i];
      d.life -= dt;
      d.y += d.vy * dt;
      d.vy *= 1 - 2.4 * dt;
      if (d.life <= 0) { this.dmgNums[i] = this.dmgNums[this.dmgNums.length - 1]; this.dmgNums.pop(); }
    }
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.t += dt;
      if (s.t >= s.dur) { this.slashes[i] = this.slashes[this.slashes.length - 1]; this.slashes.pop(); }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      b.angle += b.sweep * dt;
      if (b.t >= b.dur) { this.beams[i] = this.beams[this.beams.length - 1]; this.beams.pop(); }
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.life -= dt;
      if (z.life <= 0) { this.zones[i] = this.zones[this.zones.length - 1]; this.zones.pop(); }
    }
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i];
      t.t += dt;
      if (t.t >= t.dur) {
        const f = t.fire;
        this.telegraphs[i] = this.telegraphs[this.telegraphs.length - 1];
        this.telegraphs.pop();
        if (f) f();
      }
    }
    if (this.flashT > 0) this.flashT -= dt;
  }

  renderWorld(ctx: CanvasRenderingContext2D) {
    // zones (under everything else drawn after bg)
    for (const z of this.zones) {
      const fadeIn = Math.min(1, (z.maxLife - z.life) * 4);
      const fadeOut = Math.min(1, z.life * 2);
      const a = fadeIn * fadeOut;
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      if (z.kind === 'fire') {
        ctx.fillStyle = 'rgba(255,110,40,0.30)';
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,190,80,0.22)';
        const wob = Math.sin(z.seed + z.life * 9) * z.r * 0.06;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r * 0.7 + wob, 0, Math.PI * 2); ctx.fill();
      } else if (z.kind === 'vortex') {
        ctx.strokeStyle = 'rgba(190,190,210,0.5)';
        ctx.lineWidth = 3;
        const rot = z.life * 3;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.r * (0.4 + k * 0.3), rot + k, rot + k + Math.PI * 1.2);
          ctx.stroke();
        }
      } else if (z.kind === 'tar') {
        ctx.fillStyle = 'rgba(40,28,16,0.55)';
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
      } else if (z.kind === 'pool') {
        ctx.fillStyle = 'rgba(60,120,200,0.35)';
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(120,190,255,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r * 0.85, 0, Math.PI * 2); ctx.stroke();
      } else if (z.kind === 'jet') {
        ctx.fillStyle = 'rgba(140,200,255,0.4)';
        ctx.fillRect(z.x - z.r, z.y - z.r, z.r * 2, z.r * 2);
      }
      ctx.globalAlpha = 1;
    }

    // telegraphs
    for (const t of this.telegraphs) {
      const p = t.t / t.dur;
      if (t.kind === 'circle') {
        ctx.globalAlpha = 0.16 + p * 0.2;
        ctx.fillStyle = '#ff4030';
        ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.5 + p * 0.5;
        ctx.strokeStyle = '#ff6a50';
        ctx.lineWidth = 2 + p * 2;
        ctx.beginPath(); ctx.arc(t.x, t.y, t.r * (1 - p * 0.15), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.arc(t.x, t.y, Math.max(2, t.r * p * 0.2), 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.angle);
        ctx.globalAlpha = 0.14 + p * 0.22;
        ctx.fillStyle = '#ff4030';
        ctx.fillRect(0, -t.w / 2, t.len, t.w);
        ctx.globalAlpha = 0.4 + p * 0.5;
        ctx.strokeStyle = '#ff6a50';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, -t.w / 2, t.len, t.w);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // slashes
    for (const s of this.slashes) {
      const p = s.t / s.dur;
      ctx.globalAlpha = (1 - p) * 0.85;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 14 * (1 - p) + 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.range * (0.6 + p * 0.4), s.angle - s.arc / 2, s.angle + s.arc / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // beams
    for (const b of this.beams) {
      const p = b.t / b.dur;
      const a = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      ctx.globalAlpha = a * 0.9;
      const grad = ctx.createLinearGradient(0, 0, b.len, 0);
      grad.addColorStop(0, b.color);
      grad.addColorStop(1, 'rgba(255,255,255,0.05)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, -b.w / 2, b.len, b.w);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(0, -b.w / 6, b.len, b.w / 3);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // particles
    for (const p of this.particles) {
      const lifeP = p.life / p.maxLife;
      if (p.kind === 3) {
        ctx.globalAlpha = lifeP * 0.8;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.globalAlpha = p.kind === 1 ? lifeP * 0.5 : lifeP;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.size * (p.kind === 1 ? (2 - lifeP) : lifeP)), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    // damage numbers (world space, drawn last)
    ctx.textAlign = 'center';
    for (const d of this.dmgNums) {
      const a = Math.min(1, d.life * 2.5);
      ctx.globalAlpha = a;
      ctx.font = d.crit ? 'bold 19px Georgia, serif' : 'bold 13px Georgia, serif';
      ctx.fillStyle = '#1a0f08';
      ctx.fillText(d.text, d.x + 1, d.y + 1);
      ctx.fillStyle = d.color;
      ctx.fillText(d.text, d.x, d.y);
    }
    ctx.globalAlpha = 1;
  }
}
