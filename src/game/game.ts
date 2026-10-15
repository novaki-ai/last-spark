// Core game orchestrator: simulation, spawning, combat, rendering.
import { Rng } from '../core/rng';
import { SpatialGrid } from '../core/grid';
import { Effects } from './effects';
import { Audio } from '../core/audio';
import { loadImage, despill, makeSpriteSet, type SpriteSet } from '../core/assets';
import {
  ENEMIES, STAGES, WEAPONS, PASSIVES, WEAPON_MAP, PASSIVE_MAP, saveMeta,
  type EnemyDef, type StageDef, type StatBlock, type MetaSave,
} from './data';

function saveMetaSafe(m: MetaSave) {
  saveMeta(m);
}
import { updateWeapons, makeWeapon, type WeaponState } from './weapons';
import { updateEnemy, updateBoss, BOSS_DEFS, type BossId } from './enemies';

export interface Enemy {
  uid: number;
  def: EnemyDef;
  x: number; y: number; vx: number; vy: number;
  hp: number; maxHp: number; r: number;
  speed: number; dmg: number; xpValue: number;
  elite: boolean;
  t: number; state: number; state2: number; tx: number; ty: number;
  kbx: number; kby: number;
  hitFlash: number; spawnT: number; orbCd: number; contactCd: number;
  slowMul: number; slowT: number; burnDps: number; burnT: number; burnTick: number;
  seedV: number; facing: number; dead: boolean;
  isBoss: boolean;
  boss: { phase: number; t: number; attackT: number; sub: number; tx: number; ty: number; summonT: number; taunted: boolean } | null;
}

export interface Proj {
  x: number; y: number; vx: number; vy: number; r: number; dmg: number;
  pierce: number; life: number; kind: string; homing: number; burn: boolean;
  chain: number; crit: boolean; boom: { dist: number; maxDist: number; returning: boolean } | null;
  aoeR?: number; seed: number; hitIds?: Set<number> | null;
}

export interface EShot {
  x: number; y: number; vx: number; vy: number; r: number; dmg: number; life: number; kind: string;
}

export interface Pickup {
  x: number; y: number; vx: number; vy: number; kind: 'xp' | 'hp' | 'magnet' | 'bomb' | 'chest' | 'shard';
  value: number; r: number; t: number; magnet: boolean;
}

export interface RunStats {
  kills: number; dmgDealt: number; dmgTaken: number; time: number; level: number;
  shardsEarned: number; stageReached: number;
}

interface PendingBeam {
  x: number; y: number; followPlayer: boolean; dmg: number; len: number; wid: number;
  dur: number; t: number; angle: number; sweep: number; hitIds: Set<number>;
}

export interface Player {
  x: number; y: number; vx: number; vy: number; r: number;
  hp: number; maxHp: number; level: number; xp: number; xpNext: number;
  weapons: WeaponState[];
  passives: { id: string; level: number }[];
  stats: StatBlock;
  facing: number; aimX: number; aimY: number;
  invulnT: number; dashT: number; dashCdT: number; dashX: number; dashY: number;
  alive: boolean; reviveUsed: boolean;
  walkT: number; tarSlowT: number;
}

export interface Offer {
  kind: 'weapon' | 'passive' | 'evo' | 'filler';
  id: string;      // weapon/passive id, or weapon id for evo
  name: string; icon: string; desc: string; tag: string;
  levelAfter: number; maxLevel: number; evo: boolean;
}

export interface GameHooks {
  onLevelUp(offers: Offer[]): void;
  onGameOver(stats: RunStats): void;
  onVictory(stats: RunStats): void;
  onStageTransition(stage: number): void; // 2 or 3: show story card then call game.beginStage
  onBossStart(name: string, title: string): void;
  onBanner(text: string, sub: string): void;
}

const BASE_SPEED = 205;
const ENEMY_CAP = 300;

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w = 1280; h = 720; dpr = 1; zoom = 1;
  rng: Rng = new Rng(1);
  fx = new Effects();
  audio = Audio;
  hooks!: GameHooks;
  meta!: MetaSave;
  settings = { screenShake: true, dmgNumbers: true };

  running = false;
  paused = false;
  frame = 0;
  time = 0;            // run time
  stageTime = 0;
  stageIdx = 0;        // 0-based index into STAGES
  stage: StageDef = STAGES[0];
  player!: Player;
  enemies: Enemy[] = [];
  projectiles: Proj[] = [];
  eshots: EShot[] = [];
  pickups: Pickup[] = [];
  pendingBeams: PendingBeam[] = [];
  grid = new SpatialGrid<Enemy>(48);
  camX = 0; camY = 0; shakeT = 0; shakeMag = 0; shakeX = 0; shakeY = 0;
  boss: Enemy | null = null;
  bossSpawned = false;
  stats: RunStats = { kills: 0, dmgDealt: 0, dmgTaken: 0, time: 0, level: 1, shardsEarned: 0, stageReached: 1 };
  spawnBudget = 0;
  surgeT = 62;
  xpCombo = 0;
  xpComboT = 0;
  eliteT = 85;
  pendingLevels = 0;
  invincible = false;
  gameOverT = -1;
  victoryT = -1;
  freezeT = 0;
  slowMoT = 0;
  levelupOpen = false;
  rerollsLeft = 0;
  private uidCounter = 1;

  // sprite caches
  sprites = new Map<string, SpriteSet>();
  spritesElite = new Map<string, SpriteSet>();
  flashSprites = new Map<string, HTMLCanvasElement>();
  playerSprite: SpriteSet | null = null;
  playerSpriteLit: SpriteSet | null = null;
  bgPatterns = new Map<string, CanvasPattern>();
  gemSprites: HTMLCanvasElement[] = [];
  private vignetteCanvas: HTMLCanvasElement | null = null;
  private vignetteStage = -1;
  private glowCanvas: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  async loadAssets() {
    const names = new Set<string>();
    for (const d of Object.values(ENEMIES)) names.add(d.sprite);
    for (const b of Object.values(BOSS_DEFS)) names.add(b.def.sprite);
    names.add('novaki-idle.png');
    names.add('novaki-lit.png');
    const bgs = ['bg-forest.png', 'bg-cellar.png', 'bg-storm.png'];

    await Promise.all([...names].map(async (n) => {
      const img = await loadImage(n);
      if (!img) return;
      const clean = despill(img);
      // find world height
      let worldH = 40;
      for (const d of Object.values(ENEMIES)) if (d.sprite === n) worldH = d.spriteH * 1.22;
      for (const b of Object.values(BOSS_DEFS)) if (b.def.sprite === n) worldH = b.def.spriteH;
      if (n === 'novaki-idle.png' || n === 'novaki-lit.png') worldH = 88;
      const set = makeSpriteSet(clean, worldH);
      this.sprites.set(n, set);
      // elite variant: bigger + purple tint
      const elite = makeSpriteSet(clean, worldH * 1.45, 'rgba(190,80,255,1)');
      this.spritesElite.set(n, elite);
      // white flash silhouette
      const flash = document.createElement('canvas');
      flash.width = set.normal.width;
      flash.height = set.normal.height;
      const fctx = flash.getContext('2d')!;
      fctx.drawImage(set.normal, 0, 0);
      fctx.globalCompositeOperation = 'source-in';
      fctx.fillStyle = '#ffffff';
      fctx.fillRect(0, 0, flash.width, flash.height);
      this.flashSprites.set(n, flash);
    }));
    this.playerSprite = this.sprites.get('novaki-idle.png') ?? null;
    this.playerSpriteLit = this.sprites.get('novaki-lit.png') ?? null;

    for (const bg of bgs) {
      const img = await loadImage(bg);
      if (img) {
        const pat = this.ctx.createPattern(img, 'repeat');
        if (pat) {
          pat.setTransform(new DOMMatrix().scale(1.6));
          this.bgPatterns.set(bg, pat);
        }
      }
    }

    // gem sprites (drawn in code, pre-rendered)
    const gemColors = ['#7fe3ff', '#4aa8ff', '#b07fff', '#ffd94e'];
    for (let i = 0; i < 4; i++) {
      const c = document.createElement('canvas');
      c.width = 20; c.height = 20;
      const cx = c.getContext('2d')!;
      cx.translate(10, 10);
      const r = 4 + i * 1.6;
      cx.fillStyle = gemColors[i];
      cx.strokeStyle = 'rgba(255,255,255,0.8)';
      cx.lineWidth = 1.5;
      cx.beginPath();
      cx.moveTo(0, -r - 2);
      cx.lineTo(r, 0);
      cx.lineTo(0, r + 2);
      cx.lineTo(-r, 0);
      cx.closePath();
      cx.fill(); cx.stroke();
      this.gemSprites.push(c);
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.w = w; this.h = h;
    this.zoom = Math.min(w, h) < 500 ? 0.8 : 1;
  }

  viewRadius(): number {
    return Math.hypot(this.w, this.h) / 2 / this.zoom;
  }

  // ---------------- run lifecycle ----------------
  startRun(seed: number) {
    this.rng = new Rng(seed);
    this.time = 0;
    this.frame = 0;
    this.stageIdx = 0;
    this.stage = STAGES[0];
    this.stageTime = 0;
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.eshots.length = 0;
    this.pickups.length = 0;
    this.pendingBeams.length = 0;
    this.fx.clear();
    this.boss = null;
    this.bossSpawned = false;
    this.spawnBudget = 2;
    this.surgeT = 62;
    this.eliteT = 85;
    this.pendingLevels = 0;
    this.gameOverT = -1;
    this.victoryT = -1;
    this.levelupOpen = false;
    this.uidCounter = 1;
    this.stats = { kills: 0, dmgDealt: 0, dmgTaken: 0, time: 0, level: 1, shardsEarned: 0, stageReached: 1 };
    this.rerollsLeft = this.meta.items['m_reroll'] ? 1 : 0;

    const startWeapon = this.meta.startWeapon && WEAPON_MAP.has(this.meta.startWeapon) ? this.meta.startWeapon : 'spark_toss';
    this.player = {
      x: 0, y: 0, vx: 0, vy: 0, r: 15,
      hp: 100, maxHp: 100, level: 1, xp: 0, xpNext: this.xpNeed(1),
      weapons: [makeWeapon(startWeapon)],
      passives: [],
      stats: this.baseStats(),
      facing: 1, aimX: 1, aimY: 0,
      invulnT: 0, dashT: 0, dashCdT: 0, dashX: 1, dashY: 0,
      alive: true, reviveUsed: false, walkT: 0, tarSlowT: 0,
    };
    this.recalcStats();
    this.player.hp = this.player.maxHp;
    this.camX = 0; this.camY = 0;
    this.running = true;
    this.paused = false;
    this.invincible = false;
    // starter pack of enemies nearby
    for (let i = 0; i < 5; i++) {
      const a = this.rng.angle();
      this.spawnEnemyAt('soot_imp', Math.cos(a) * 320, Math.sin(a) * 320, false);
    }
    // teaching drops: a few sparks + a cocoa near spawn
    this.dropPickup('xp', 90, -40, 3);
    this.dropPickup('xp', -110, 30, 3);
    this.dropPickup('xp', 40, 110, 3);
    this.dropPickup('hp', -60, -120, 0);
  }

  baseStats(): StatBlock {
    return {
      damageMul: 1, areaMul: 1, cooldownMul: 1, speedMul: 1, pickupMul: 1, xpMul: 1,
      critChance: 0.03, armor: 0, projectilesAdd: 0, maxHpAdd: 0, regen: 0,
    };
  }

  recalcStats() {
    const s = this.baseStats();
    const m = this.meta.items;
    s.maxHpAdd += 12 * (m['m_vigor'] ?? 0);
    s.damageMul *= 1 + 0.05 * (m['m_might'] ?? 0);
    s.speedMul *= 1 + 0.04 * (m['m_haste'] ?? 0);
    s.xpMul *= 1 + 0.08 * (m['m_greed'] ?? 0);
    s.pickupMul *= 1 + 0.15 * (m['m_pull'] ?? 0);
    s.armor += m['m_armor'] ?? 0;
    for (const p of this.player?.passives ?? []) {
      const def = PASSIVE_MAP.get(p.id);
      if (!def) continue;
      const part = def.apply(p.level);
      if (part.damageMul) s.damageMul *= part.damageMul;
      if (part.areaMul) s.areaMul *= part.areaMul;
      if (part.cooldownMul) s.cooldownMul *= part.cooldownMul;
      if (part.speedMul) s.speedMul *= part.speedMul;
      if (part.pickupMul) s.pickupMul *= part.pickupMul;
      if (part.xpMul) s.xpMul *= part.xpMul;
      if (part.critChance) s.critChance += part.critChance;
      if (part.armor) s.armor += part.armor;
      if (part.projectilesAdd) s.projectilesAdd += part.projectilesAdd;
      if (part.maxHpAdd) s.maxHpAdd += part.maxHpAdd;
      if (part.regen) s.regen += part.regen;
    }
    const prevMax = this.player?.maxHp ?? 100;
    this.player.stats = s;
    this.player.maxHp = 100 + s.maxHpAdd;
    if (this.player.maxHp > prevMax) this.player.hp += this.player.maxHp - prevMax;
    this.player.hp = Math.min(this.player.hp, this.player.maxHp);
  }

  xpNeed(level: number): number {
    return Math.floor(6 + level * 5 + Math.pow(level, 1.65));
  }

  // ---------------- helpers used by weapon/enemy systems ----------------
  rollCrit(bonus = 0): boolean {
    return this.rng.next() < this.player.stats.critChance + bonus;
  }

  aimAngle(): number {
    return Math.atan2(this.player.aimY, this.player.aimX);
  }

  nearestEnemy(x: number, y: number, maxR: number, salt = 0): Enemy | null {
    let best: Enemy | null = null;
    let bestD = maxR * maxR;
    // salt shifts preference so multi-shot picks different targets
    let idx = 0;
    const skip = Math.floor(salt);
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0.1) continue;
      const dx = e.x - x, dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        if (idx++ < skip) continue;
        bestD = d;
        best = e;
      }
    }
    if (!best && skip > 0) return this.nearestEnemy(x, y, maxR, 0);
    return best;
  }

  densestEnemy(maxR: number): Enemy | null {
    // sample up to 12 enemies, pick the one with most neighbors
    let best: Enemy | null = null;
    let bestN = 2;
    const n = this.enemies.length;
    if (n === 0) return null;
    for (let i = 0; i < 12; i++) {
      const e = this.enemies[(this.frame * 7 + i * 13) % n];
      if (!e || e.dead) continue;
      const dx = e.x - this.player.x, dy = e.y - this.player.y;
      if (dx * dx + dy * dy > maxR * maxR) continue;
      let count = 0;
      this.grid.query(e.x, e.y, 90, (o) => { if (!o.dead) count++; });
      if (count > bestN) { bestN = count; best = e; }
    }
    return best;
  }

  circleHit(x: number, y: number, r: number): Enemy[] {
    const out: Enemy[] = [];
    this.grid.query(x, y, r + 30, (e) => {
      if (e.dead) return;
      const dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy < (r + e.r) * (r + e.r)) out.push(e);
    });
    return out;
  }

  arcHit(x: number, y: number, angle: number, arc: number, range: number): Enemy[] {
    const out: Enemy[] = [];
    this.grid.query(x, y, range + 30, (e) => {
      if (e.dead) return;
      const dx = e.x - x, dy = e.y - y;
      const d = Math.hypot(dx, dy);
      if (d > range + e.r) return;
      let da = Math.atan2(dy, dx) - angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) <= arc / 2 + Math.atan2(e.r, Math.max(20, d))) out.push(e);
    });
    return out;
  }

  lineHit(x: number, y: number, angle: number, len: number, w: number, exclude?: Set<number>): Enemy[] {
    const out: Enemy[] = [];
    const cx = x + Math.cos(angle) * len / 2;
    const cy = y + Math.sin(angle) * len / 2;
    this.grid.query(cx, cy, len / 2 + 40, (e) => {
      if (e.dead || (exclude && exclude.has(e.uid))) return;
      const dx = e.x - x, dy = e.y - y;
      const proj = dx * Math.cos(angle) + dy * Math.sin(angle);
      const perp = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
      if (proj > -e.r && proj < len + e.r && perp < w / 2 + e.r) out.push(e);
    });
    return out;
  }

  pullEnemies(x: number, y: number, r: number, strength: number) {
    this.grid.query(x, y, r + 30, (e) => {
      if (e.dead || e.isBoss) return;
      const dx = x - e.x, dy = y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < r) {
        e.kbx += (dx / d) * strength;
        e.kby += (dy / d) * strength;
      }
    });
  }

  orbitHit(x: number, y: number, r: number, dmg: number, burn: boolean) {
    this.grid.query(x, y, r + 26, (e) => {
      if (e.dead || e.orbCd > 0) return;
      const dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy < (r + e.r) * (r + e.r)) {
        e.orbCd = 0.38;
        this.damageEnemy(e, dmg, this.rollCrit(), { burn });
      }
    });
  }

  fireProjectile(p: Proj) {
    if (this.projectiles.length > 420) return;
    p.hitIds = p.pierce > 0 ? new Set() : null;
    this.projectiles.push(p);
  }

  fireEShot(x: number, y: number, vx: number, vy: number, r: number, dmg: number, kind: string) {
    if (this.eshots.length > 300) return;
    this.eshots.push({ x, y, vx, vy, r, dmg, life: 6, kind });
  }

  shake(mag: number) {
    if (!this.settings.screenShake) return;
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = 0.4;
  }

  hurtPlayer(dmg: number, srcX: number, srcY: number) {
    const p = this.player;
    if (!p.alive || p.invulnT > 0 || p.dashT > 0 || this.invincible || this.stageClearT > 0 || this.victoryT > 0) return;
    const reduced = Math.max(1, dmg - p.stats.armor);
    p.hp -= reduced;
    p.invulnT = 0.65;
    this.stats.dmgTaken += reduced;
    this.audio.sfx('hurt');
    this.shake(7);
    this.fx.burst(p.x, p.y, 10, 180, '#ff5a4e', 4, 0);
    const dx = p.x - srcX, dy = p.y - srcY;
    const d = Math.hypot(dx, dy) || 1;
    p.vx += (dx / d) * 200;
    p.vy += (dy / d) * 200;
    if (p.hp <= 0) {
      if (this.meta.items['m_revive'] && !p.reviveUsed) {
        p.reviveUsed = true;
        p.hp = p.maxHp * 0.5;
        p.invulnT = 2.5;
        this.fx.ring(p.x, p.y, '#ffde59', 20, 500, 0.7);
        this.fx.text(p.x, p.y - 40, 'SECOND CHANCE!', '#ffde59');
        this.audio.sfx('levelup');
        // blast enemies away
        for (const e of this.circleHit(p.x, p.y, 260)) {
          const ex = e.x - p.x, ey = e.y - p.y;
          const ed = Math.hypot(ex, ey) || 1;
          e.kbx += (ex / ed) * 600;
          e.kby += (ey / ed) * 600;
          this.damageEnemy(e, 40, false, { noKnock: true });
        }
      } else {
        p.hp = 0;
        p.alive = false;
        this.gameOverT = 1.6;
        this.fx.burst(p.x, p.y, 40, 300, '#ff7b2e', 5, 4);
        this.fx.burst(p.x, p.y, 20, 160, '#333333', 6, 1);
        this.audio.stopVoice();
        this.audio.sfx('bomb');
        this.audio.playMusic('gameover');
        this.shake(14);
      }
    }
  }

  damageEnemy(e: Enemy, dmg: number, crit: boolean, opts: { kx?: number; ky?: number; burn?: boolean; slow?: number; silent?: boolean; noKnock?: boolean; pure?: boolean } = {}) {
    if (e.dead) return;
    // shielded enemies resist frontal damage
    if (e.def.behavior === 'shielded' && !opts.pure) {
      const toE = Math.atan2(e.y - this.player.y, e.x - this.player.x);
      let da = toE - Math.atan2(e.vy || (this.player.y - e.y), e.vx || (this.player.x - e.x));
      da = Math.abs(((da + Math.PI) % (Math.PI * 2)) - Math.PI);
      if (da < Math.PI * 0.55) dmg *= 0.35;
    }
    if (crit) dmg *= 2;
    e.hp -= dmg;
    e.hitFlash = 1;
    this.stats.dmgDealt += Math.max(0, Math.min(dmg, e.hp + dmg)); // count actual hp removed
    if (!opts.silent) {
      this.fx.dmg(e.x, e.y - e.r, dmg, crit);
      if (e.isBoss) this.audio.sfx('bosshit'); else this.audio.sfx('hit', { pitch: 0.8 + Math.min(0.6, 30 / (dmg + 10)) });
    }
    if (opts.kx || opts.ky) {
      const kr = e.isBoss ? 0.02 : e.elite ? 0.3 : 1;
      e.kbx += (opts.kx ?? 0) * kr;
      e.kby += (opts.ky ?? 0) * kr;
    }
    if (opts.burn) {
      e.burnDps = Math.max(e.burnDps, dmg * 0.35);
      e.burnT = 2;
      e.burnTick = Math.min(e.burnTick, 0.5);
    }
    if (opts.slow) {
      e.slowMul = Math.min(e.slowMul, 1 - opts.slow);
      e.slowT = Math.max(e.slowT, 1.4);
    }
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e: Enemy) {
    if (e.dead) return;
    e.dead = true;
    this.stats.kills++;
    const m = e.elite ? 1.6 : 1;
    this.fx.burst(e.x, e.y, e.isBoss ? 40 : e.elite ? 22 : 8, e.isBoss ? 320 : 160, e.isBoss ? '#ffde59' : '#ff9a4e', 4 * m, 4);
    if (!e.isBoss) this.audio.sfx('die', { pitch: e.elite ? 0.6 : 1 + this.rng.range(-0.15, 0.15) });
    if (e.elite && !e.isBoss) this.freezeT = Math.max(this.freezeT, 0.09);
    // kill milestones
    const k = this.stats.kills;
    const milestone = k === 100 ? 'WARMING UP!' : k === 300 ? 'ON FIRE!' : k === 600 ? 'BLAZING!' : k === 1000 ? 'INFERNO!' : k === 1500 ? 'THE DAMP REMEMBERS FEAR' : null;
    if (milestone) {
      this.fx.text(this.player.x, this.player.y - 46, milestone, '#ffde59');
      this.audio.sfx('chest');
    }

    if (e.isBoss) {
      this.onBossKilled(e);
      return;
    }

    // behavior-specific death effects
    if (e.def.behavior === 'splitter' && !e.elite) {
      for (let i = 0; i < 2; i++) {
        const a = this.rng.angle();
        const child = this.spawnEnemyAt('mini_slime', e.x + Math.cos(a) * 16, e.y + Math.sin(a) * 16, false);
        if (child) { child.spawnT = 0; }
      }
      this.audio.sfx('split');
    }
    if (e.def.behavior === 'exploder') {
      for (let i = 0; i < 3; i++) {
        const a = this.rng.angle();
        this.fireEShot(e.x, e.y, Math.cos(a) * 150, Math.sin(a) * 150, 7, e.def.shootDmg ?? 7, 'bubble');
      }
      this.fx.zone(e.x, e.y, 60, 0, 2.5, 'pool', true, 0);
    }

    // drops
    const xpVal = Math.round(e.xpValue * (e.elite ? 1 : 1));
    this.dropPickup('xp', e.x, e.y, xpVal);
    if (this.rng.chance(e.def.shardChance)) this.dropPickup('shard', e.x + this.rng.range(-14, 14), e.y + this.rng.range(-14, 14), e.elite ? 5 : 1);
    if (this.rng.chance(0.032)) this.dropPickup('hp', e.x, e.y, 0);
    if (this.rng.chance(0.005)) this.dropPickup('magnet', e.x, e.y, 0);
    if (this.rng.chance(0.004)) this.dropPickup('bomb', e.x, e.y, 0);
    if (e.elite) {
      this.dropPickup('chest', e.x, e.y, 0);
      for (let i = 0; i < 6; i++) this.dropPickup('shard', e.x + this.rng.range(-30, 30), e.y + this.rng.range(-30, 30), 1);
    }
  }

  dropPickup(kind: Pickup['kind'], x: number, y: number, value: number) {
    if (this.pickups.length > 420 && kind === 'xp') {
      // merge into nearest existing gem to stay under cap
      let best: Pickup | null = null;
      let bd = Infinity;
      for (const p of this.pickups) {
        if (p.kind !== 'xp') continue;
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      if (best) { best.value += value; return; }
    }
    const r = kind === 'xp' ? (value >= 25 ? 9 : value >= 5 ? 7 : 5) : kind === 'chest' ? 14 : 9;
    this.pickups.push({
      x, y, vx: this.rng.range(-30, 30), vy: this.rng.range(-30, 30),
      kind, value, r, t: 0, magnet: false,
    });
  }

  spawnEnemyAt(id: string, x: number, y: number, elite: boolean): Enemy | null {
    const def = ENEMIES[id];
    if (!def) return null;
    return this.spawnEnemy(def, x, y, elite);
  }

  spawnEnemy(def: EnemyDef, x: number, y: number, elite: boolean): Enemy {
    const timeMul = Math.min(1.65, 1 + (this.stageTime / 300) * 0.8);
    const hpMul = timeMul * (elite ? 9 : 1);
    const e: Enemy = {
      uid: this.uidCounter++,
      def, x, y, vx: 0, vy: 0,
      hp: def.hp * hpMul, maxHp: def.hp * hpMul, r: def.radius * (elite ? 1.35 : 1),
      speed: def.speed * (elite ? 0.92 : 1) * this.rng.range(0.9, 1.1),
      dmg: def.dmg * (1 + this.stageTime / 600) * (elite ? 1.5 : 1),
      xpValue: def.xp * (elite ? 12 : 1),
      elite,
      t: 0, state: 0, state2: this.rng.range(0.5, 2), tx: 0, ty: 0,
      kbx: 0, kby: 0,
      hitFlash: 0, spawnT: 0.35, orbCd: 0, contactCd: 0,
      slowMul: 1, slowT: 0, burnDps: 0, burnT: 0, burnTick: 0.5,
      seedV: this.rng.next(), facing: 1, dead: false,
      isBoss: false, boss: null,
    };
    this.enemies.push(e);
    return e;
  }

  spawnBoss(id: BossId) {
    const bd = BOSS_DEFS[id];
    const a = this.rng.angle();
    const d = this.viewRadius() * 0.75;
    const def = bd.def as unknown as EnemyDef;
    const e: Enemy = {
      uid: this.uidCounter++,
      def, x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d,
      vx: 0, vy: 0,
      hp: def.hp, maxHp: def.hp, r: def.radius,
      speed: def.speed, dmg: def.dmg, xpValue: 0,
      elite: false,
      t: 0, state: 0, state2: 0, tx: 0, ty: 0,
      kbx: 0, kby: 0,
      hitFlash: 0, spawnT: 0.8, orbCd: 0, contactCd: 0,
      slowMul: 1, slowT: 0, burnDps: 0, burnT: 0, burnTick: 0.5,
      seedV: this.rng.next(), facing: 1, dead: false,
      isBoss: true,
      boss: { phase: 0, t: 0, attackT: 2.2, sub: 0, tx: 0, ty: 0, summonT: 12, taunted: false },
    };
    this.enemies.push(e);
    this.boss = e;
    this.audio.playMusic(id === 'soakfather' ? 'finalboss' : 'boss');
    this.audio.sfx('bossroar');
    this.audio.playVoice(bd.voice);
    this.hooks.onBossStart(this.stage.bossName, this.stage.bossTitle);
    this.shake(8);
  }

  onBossKilled(e: Enemy) {
    const key = e.def.id.replace(/^boss_/, '') as BossId;
    const bd = BOSS_DEFS[key] ?? BOSS_DEFS.mossmaw;
    this.audio.playVoice(bd.deathVoice);
    this.audio.sfx('bomb');
    this.shake(16);
    this.fx.flashT = 0.35;
    this.fx.burst(e.x, e.y, 60, 420, '#ffde59', 6, 4);
    this.fx.ring(e.x, e.y, '#ffffff', 30, 700, 0.9);
    const shardReward = [60, 90, 130][this.stageIdx] ?? 60;
    for (let i = 0; i < 12; i++) {
      this.dropPickup('shard', e.x + this.rng.range(-70, 70), e.y + this.rng.range(-70, 70), Math.ceil(shardReward / 12));
    }
    for (let i = 0; i < 3; i++) this.dropPickup('hp', e.x + this.rng.range(-80, 80), e.y + this.rng.range(-80, 80), 0);
    this.dropPickup('chest', e.x, e.y, 0);
    this.boss = null;
    this.slowMoT = 0.6;

    // kill remaining normal enemies (convert to gems, no extra effects)
    for (const o of this.enemies) {
      if (!o.isBoss && !o.dead) {
        o.dead = true;
        this.stats.kills++;
        this.dropPickup('xp', o.x, o.y, o.xpValue);
        this.fx.burst(o.x, o.y, 5, 120, '#ff9a4e', 3, 4);
      }
    }
    this.eshots.length = 0;

    if (this.stageIdx >= 2) {
      this.victoryT = 2.6;
      this.audio.playMusic('victory');
    } else {
      this.victoryT = -1;
      this.gameOverT = -1;
      // stage clear: brief pause then transition
      this.stageClearT = 2.8;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.35);
      this.hooks.onBanner('STAGE CLEAR', this.stage.name + ' is safe');
      this.audio.playMusic(this.stage.music);
    }
  }

  stageClearT = -1;

  advanceStage() {
    this.stageIdx++;
    this.stage = STAGES[this.stageIdx];
    this.stageTime = 0;
    this.spawnBudget = 3;
    this.surgeT = 55;
    this.eliteT = 75;
    this.bossSpawned = false;
    this.stats.stageReached = this.stage.id;
    this.pickups.length = 0;
    this.eshots.length = 0;
    this.pendingBeams.length = 0;
    this.fx.clear();
    if (this.pendingLevels > 0 && !this.levelupOpen) this.openLevelUp();
    saveMetaSafe(this.meta);
  }
  grantXp(amount: number) {
    const p = this.player;
    p.xp += amount * p.stats.xpMul;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = this.xpNeed(p.level);
      this.pendingLevels++;
    }
    if (this.pendingLevels > 0 && !this.levelupOpen) {
      this.openLevelUp();
    }
  }

  openLevelUp() {
    // don't interrupt transitions/game-over sequences; pending levels reopen later
    if (this.stageClearT > 0 || this.victoryT > 0 || this.gameOverT > 0 || !this.player.alive) return;
    this.levelupOpen = true;
    this.fx.ring(this.player.x, this.player.y, '#ffde59', 16, 420, 0.55);
    this.fx.embers(this.player.x, this.player.y - 20, 10);
    this.rerollsLeft = this.meta.items['m_reroll'] ? 1 : 0;
    this.audio.sfx('levelup');
    if (this.rng.chance(0.25)) this.audio.playVoice('novaki-levelup');
    this.hooks.onLevelUp(this.generateOffers());
  }

  generateOffers(): Offer[] {
    const p = this.player;
    const pool: [number, Offer][] = [];
    const ownedW = new Set(p.weapons.map((w) => w.id));
    const ownedP = new Map(p.passives.map((x) => [x.id, x.level]));

    // evolutions first (high priority)
    for (const w of p.weapons) {
      const def = WEAPON_MAP.get(w.id)!;
      if (!w.evolved && w.level >= def.maxLevel && def.evoNeeds && (ownedP.get(def.evoNeeds) ?? 0) > 0) {
        pool.push([12, {
          kind: 'evo', id: w.id, name: def.evoName!, icon: def.evoIcon!, desc: def.evoDesc!,
          tag: 'EVOLUTION', levelAfter: w.level, maxLevel: def.maxLevel, evo: true,
        }]);
      }
    }
    // owned weapons upgrades
    for (const w of p.weapons) {
      const def = WEAPON_MAP.get(w.id)!;
      if (w.level < def.maxLevel) {
        pool.push([4, {
          kind: 'weapon', id: w.id, name: def.name, icon: def.icon, desc: def.desc,
          tag: `Level ${w.level + 1}`, levelAfter: w.level + 1, maxLevel: def.maxLevel, evo: false,
        }]);
      }
    }
    // owned passives upgrades
    for (const [id, lvl] of ownedP) {
      const def = PASSIVE_MAP.get(id)!;
      if (lvl < def.maxLevel) {
        pool.push([4, {
          kind: 'passive', id, name: def.name, icon: def.icon, desc: def.desc,
          tag: `Level ${lvl + 1}`, levelAfter: lvl + 1, maxLevel: def.maxLevel, evo: false,
        }]);
      }
    }
    // new items
    if (p.weapons.length < 5) {
      for (const def of WEAPONS) {
        if (!ownedW.has(def.id)) {
          pool.push([2.6, {
            kind: 'weapon', id: def.id, name: def.name, icon: def.icon, desc: def.desc,
            tag: 'NEW WEAPON', levelAfter: 1, maxLevel: def.maxLevel, evo: false,
          }]);
        }
      }
    }
    if (p.passives.length < 5) {
      for (const def of PASSIVES) {
        if (!ownedP.has(def.id)) {
          pool.push([2.2, {
            kind: 'passive', id: def.id, name: def.name, icon: def.icon, desc: def.desc,
            tag: 'NEW PASSIVE', levelAfter: 1, maxLevel: def.maxLevel, evo: false,
          }]);
        }
      }
    }
    if (pool.length === 0) {
      return [
        { kind: 'filler', id: 'heal', name: 'Hot Cocoa', icon: '☕', desc: 'Recover 40 HP right now.', tag: 'TOP UP', levelAfter: 0, maxLevel: 0, evo: false },
        { kind: 'filler', id: 'shards', name: 'Ember Cache', icon: '💠', desc: '+25 ember shards for the Forge.', tag: 'CURRENCY', levelAfter: 0, maxLevel: 0, evo: false },
        { kind: 'filler', id: 'blast', name: 'Flare Up', icon: '🔥', desc: 'Blast all nearby enemies for 120 damage.', tag: 'INSTANT', levelAfter: 0, maxLevel: 0, evo: false },
      ];
    }
    // pick 3 distinct
    const offers: Offer[] = [];
    const used = new Set<string>();
    for (let k = 0; k < 3 && pool.length > 0; k++) {
      const avail = pool.filter(([, o]) => !used.has(o.id + o.tag));
      if (avail.length === 0) break;
      const o = this.rng.weighted(avail);
      used.add(o.id + o.tag);
      offers.push(o);
    }
    return offers;
  }

  chooseOffer(o: Offer) {
    const p = this.player;
    if (o.kind === 'weapon') {
      const w = p.weapons.find((x) => x.id === o.id);
      if (w) w.level++;
      else p.weapons.push(makeWeapon(o.id));
    } else if (o.kind === 'passive') {
      const x = p.passives.find((q) => q.id === o.id);
      if (x) x.level++;
      else p.passives.push({ id: o.id, level: 1 });
      this.recalcStats();
    } else if (o.kind === 'evo') {
      const w = p.weapons.find((x) => x.id === o.id);
      if (w) { w.evolved = true; }
    } else if (o.kind === 'filler') {
      if (o.id === 'heal') { p.hp = Math.min(p.maxHp, p.hp + 40); this.audio.sfx('heal'); }
      if (o.id === 'shards') { this.meta.shards += 25; this.stats.shardsEarned += 25; }
      if (o.id === 'blast') {
        for (const e of this.circleHit(p.x, p.y, 300)) this.damageEnemy(e, 120, false, {});
        this.fx.ring(p.x, p.y, '#ff7b2e', 30, 600, 0.6);
        this.audio.sfx('nova');
      }
    }
    this.pendingLevels--;
    this.levelupOpen = false;
    if (this.pendingLevels > 0) {
      this.openLevelUp();
    }
  }

  // ---------------- spawning director ----------------
  updateSpawner(dt: number) {
    const st = this.stage;
    const table = st.waves;
    let rate = table[0][2];
    let comp = table[0][1];
    for (const row of table) {
      if (this.stageTime >= row[0]) { comp = row[1]; rate = row[2]; }
    }
    if (this.boss) rate *= 0.3;
    // anti-spiral: bound accumulation so an under-leveled player can recover
    const aliveNow = this.enemies.length;
    if (aliveNow > 180) rate *= 0.22;
    else if (aliveNow > 120) rate *= 0.5;
    else if (aliveNow > 80) rate *= 0.75;

    this.spawnBudget += rate * dt;
    const alive = this.enemies.length;
    if (alive < ENEMY_CAP) {
      let guard = 12;
      const cheapest = Math.min(...comp.map((c) => ENEMIES[c[1]].cost));
      while (this.spawnBudget >= cheapest && guard-- > 0 && this.enemies.length < ENEMY_CAP) {
        const id = this.rng.weighted(comp);
        const def = ENEMIES[id];
        if (this.spawnBudget < def.cost) break;
        this.spawnBudget -= def.cost;
        const a = this.rng.angle();
        const d = this.viewRadius() + this.rng.range(40, 200);
        this.spawnEnemy(def, this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, false);
      }
    }
    this.spawnBudget = Math.min(this.spawnBudget, 30);

    // surge events
    if (!this.boss) {
      this.surgeT -= dt;
      if (this.surgeT <= 0) {
        this.surgeT = 70;
        this.runSurge(comp);
      }
      this.eliteT -= dt;
      if (this.eliteT <= 0) {
        this.eliteT = 55;
        const id = this.rng.weighted(comp);
        const a = this.rng.angle();
        const d = this.viewRadius() + 120;
        const e = this.spawnEnemy(ENEMIES[id], this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, true);
        this.fx.ring(e.x, e.y, '#c86bff', 16, 200, 0.6);
        this.hooks.onBanner('ELITE', 'Something huge stalks the damp...');
      }
    }

    // boss trigger
    if (!this.bossSpawned && this.stageTime >= this.stage.duration) {
      this.bossSpawned = true;
      this.spawnBoss(this.stage.bossId as BossId);
    }
  }

  runSurge(comp: [number, string][]) {
    const pattern = this.rng.pick(['ring', 'wall', 'pack'] as const);
    const cheap = comp.filter(([, id]) => ENEMIES[id].cost <= 3);
    const id = cheap.length > 0 ? this.rng.weighted(cheap) : comp[0][1];
    const def = ENEMIES[id];
    const vr = this.viewRadius();
    if (pattern === 'ring') {
      const n = 26 + this.rng.int(0, 10);
      for (let i = 0; i < n; i++) {
        const a = (i * Math.PI * 2) / n;
        this.spawnEnemy(def, this.player.x + Math.cos(a) * (vr * 0.8), this.player.y + Math.sin(a) * (vr * 0.8), false);
      }
      this.hooks.onBanner('SURROUNDED!', 'They come from all sides');
    } else if (pattern === 'wall') {
      const a = this.rng.angle();
      const n = 22;
      for (let i = 0; i < n; i++) {
        const off = (i - n / 2) * 55;
        this.spawnEnemy(
          def,
          this.player.x + Math.cos(a) * vr * 0.85 + Math.cos(a + Math.PI / 2) * off,
          this.player.y + Math.sin(a) * vr * 0.85 + Math.sin(a + Math.PI / 2) * off,
          false,
        );
      }
      this.hooks.onBanner('THE TIDAL WALL', 'Hold the line');
    } else {
      const a = this.rng.angle();
      for (let i = 0; i < 18; i++) {
        this.spawnEnemy(def, this.player.x + Math.cos(a) * vr * 0.9 + this.rng.range(-90, 90), this.player.y + Math.sin(a) * vr * 0.9 + this.rng.range(-90, 90), false);
      }
      this.hooks.onBanner('WARBAND', 'A pack hunts together');
    }
    this.audio.sfx('bossroar');
  }

  // ---------------- per-tick update ----------------
  update(dt: number, moveX: number, moveY: number, dashPressed: boolean) {
    if (!this.running) return;
    if (this.freezeT > 0) { this.freezeT -= dt; return; }
    this.frame++;

    // delayed transitions run even while "paused" overlays show? No: only when not paused.
    if (this.gameOverT > 0) {
      this.gameOverT -= dt;
      this.fx.update(dt);
      if (this.gameOverT <= 0) {
        this.running = false;
        this.audio.playVoice('gameover');
        this.hooks.onGameOver({ ...this.stats, time: this.time, level: this.player.level });
      }
      return;
    }
    if (this.victoryT > 0) {
      this.victoryT -= dt;
      this.updateWorldLite(dt);
      if (this.victoryT <= 0) {
        this.running = false;
        this.audio.playVoice('novaki-victory');
        this.hooks.onVictory({ ...this.stats, time: this.time, level: this.player.level });
      }
      return;
    }
    if (this.stageClearT > 0) {
      this.stageClearT -= dt;
      this.updateWorldLite(dt);
      if (this.stageClearT <= 0) {
        this.stageClearT = -1;
        this.hooks.onStageTransition(this.stageIdx + 2); // stage number entering (2 or 3)
      }
      return;
    }

    this.time += dt;
    this.stageTime += dt;
    if (this.xpComboT > 0) { this.xpComboT -= dt; if (this.xpComboT <= 0) this.xpCombo = 0; }
    const p = this.player;

    // --- player movement ---
    const speed = BASE_SPEED * p.stats.speedMul;
    if (p.alive) {
      if (moveX !== 0 || moveY !== 0) {
        p.aimX = moveX; p.aimY = moveY;
        if (moveX !== 0) p.facing = moveX > 0 ? 1 : -1;
        p.walkT += dt;
      }
      // dash
      if (p.dashCdT > 0) p.dashCdT -= dt;
      if (dashPressed && p.dashCdT <= 0 && p.dashT <= 0) {
        p.dashT = 0.18;
        p.dashCdT = 1.5;
        const dl = Math.hypot(moveX, moveY);
        p.dashX = dl > 0.1 ? moveX / dl : p.facing;
        p.dashY = dl > 0.1 ? moveY / dl : 0;
        this.audio.sfx('dash');
        this.fx.burst(p.x, p.y, 8, 120, '#ffd97b', 4, 1);
      }
      if (p.dashT > 0) {
        p.dashT -= dt;
        p.vx = p.dashX * 720;
        p.vy = p.dashY * 720;
        if (this.frame % 2 === 0) this.fx.spawn(p.x, p.y, 0, 0, 0.3, 6, 'rgba(255,200,110,0.5)', 1);
      } else {
        // smooth accelerate toward input velocity
        const acc = 14;
        p.vx += (moveX * speed - p.vx) * Math.min(1, acc * dt);
        p.vy += (moveY * speed - p.vy) * Math.min(1, acc * dt);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.invulnT > 0) p.invulnT -= dt;
      if (p.stats.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.stats.regen * dt);
      // head smoke
      if (this.frame % 26 === 0) this.fx.smoke(p.x + p.facing * 3, p.y - 58, 3);
    }

    this.updateWorldLite(dt);
  }

  // world update shared by play + transition states (no player input / no spawner when clearing)
  updateWorldLite(dt: number) {
    const p = this.player;

    // rebuild grid
    this.grid.clear();
    for (const e of this.enemies) if (!e.dead) this.grid.insert(e);

    // weapons
    if (p.alive && this.stageClearT <= 0) updateWeapons(this, dt);

    // projectiles
    this.updateProjectiles(dt);

    // enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) {
        this.enemies[i] = this.enemies[this.enemies.length - 1];
        this.enemies.pop();
        continue;
      }
      if (e.isBoss) {
        if (e.spawnT > 0) e.spawnT -= dt;
        updateBoss(this, e, dt);
      } else updateEnemy(this, e, dt);
    }

    // separation (normal enemies only, sampled)
    this.separateEnemies();

    // contact damage
    if (p.alive && p.invulnT <= 0 && p.dashT <= 0 && !this.invincible) {
      this.grid.query(p.x, p.y, 64, (e) => {
        if (e.dead || e.contactCd > 0 || e.spawnT > 0) return;
        const dx = e.x - p.x, dy = e.y - p.y;
        if (dx * dx + dy * dy < (e.r + p.r) * (e.r + p.r)) {
          e.contactCd = 0.7;
          this.hurtPlayer(e.dmg, e.x, e.y);
        }
      });
      if (this.boss && !this.boss.dead) {
        const b = this.boss;
        const dx = b.x - p.x, dy = b.y - p.y;
        if (dx * dx + dy * dy < (b.r * 0.85 + p.r) * (b.r * 0.85 + p.r) && b.contactCd <= 0) {
          b.contactCd = 0.7;
          this.hurtPlayer(b.dmg, b.x, b.y);
        }
      }
    }

    // enemy shots
    for (let i = this.eshots.length - 1; i >= 0; i--) {
      const s = this.eshots[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      let dead = s.life <= 0;
      if (!dead && p.alive) {
        const dx = s.x - p.x, dy = s.y - p.y;
        if (dx * dx + dy * dy < (s.r + p.r) * (s.r + p.r)) {
          this.hurtPlayer(s.dmg, s.x, s.y);
          dead = true;
        }
      }
      if (dead) {
        this.fx.burst(s.x, s.y, 3, 60, eshotColor(s.kind), 2.5, 0);
        this.eshots[i] = this.eshots[this.eshots.length - 1];
        this.eshots.pop();
      }
    }

    // zones damage
    for (const z of this.fx.zones) {
      z.tickT -= dt;
      if (z.tickT > 0) continue;
      z.tickT = 0.25;
      if (z.hostile) {
        if (!p.alive || this.invincible || p.dashT > 0) continue;
        const dx = p.x - z.x, dy = p.y - z.y;
        if (dx * dx + dy * dy < (z.r + p.r * 0.5) * (z.r + p.r * 0.5)) {
          if (z.kind === 'tar') {
            p.tarSlowT = 0.5;
            this.hurtPlayer(z.dps * 0.25, z.x, z.y);
          } else if (z.dps > 0) {
            this.hurtPlayer(z.dps * 0.25, z.x, z.y);
          }
        }
      } else {
        this.grid.query(z.x, z.y, z.r + 20, (e) => {
          if (e.dead) return;
          const dx = e.x - z.x, dy = e.y - z.y;
          if (dx * dx + dy * dy < (z.r + e.r) * (z.r + e.r)) {
            this.damageEnemy(e, z.dps * 0.25, false, { silent: z.dps < 14, noKnock: true, pure: true });
            if (z.pull > 0 && !e.isBoss) {
              const d = Math.hypot(dx, dy) || 1;
              e.kbx += (-dx / d) * z.pull * 0.25;
              e.kby += (-dy / d) * z.pull * 0.25;
            }
          }
        });
      }
    }
    // tar slow on player
    if (p.tarSlowT > 0) {
      p.tarSlowT -= dt;
      p.vx *= 0.65;
      p.vy *= 0.65;
    }

    // pickups
    const magnetR = 130 * p.stats.pickupMul;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.t += dt;
      const dx = p.x - pk.x, dy = p.y - pk.y;
      const d2 = dx * dx + dy * dy;
      if (pk.kind === 'xp' && (pk.magnet || d2 < magnetR * magnetR)) {
        pk.magnet = true;
        const d = Math.sqrt(d2) || 1;
        const pull = 560 + Math.max(0, 260 - d) * 5;
        pk.vx = (dx / d) * pull;
        pk.vy = (dy / d) * pull;
      } else if (pk.kind !== 'xp' && d2 < (magnetR * 1.2) * (magnetR * 1.2)) {
        const d = Math.sqrt(d2) || 1;
        pk.vx = (dx / d) * 300;
        pk.vy = (dy / d) * 300;
      } else {
        pk.vx *= 1 - 3 * dt;
        pk.vy *= 1 - 3 * dt;
      }
      pk.x += pk.vx * dt;
      pk.y += pk.vy * dt;
      if (p.alive && d2 < (pk.r + p.r + 6) * (pk.r + p.r + 6)) {
        this.collectPickup(pk);
        this.pickups[i] = this.pickups[this.pickups.length - 1];
        this.pickups.pop();
      }
    }

    // fx
    this.fx.update(dt);
    this.updateWeather(dt);

    // spawner + boss
    if (this.stageClearT <= 0 && p.alive) this.updateSpawner(dt);

    // camera
    const camK = 1 - Math.pow(0.001, dt);
    this.camX += (p.x - this.camX) * camK;
    this.camY += (p.y - 10 - this.camY) * camK;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const m = this.shakeMag * (this.shakeT / 0.4);
      this.shakeX = (Math.random() - 0.5) * m * 2;
      this.shakeY = (Math.random() - 0.5) * m * 2;
      if (this.shakeT <= 0) this.shakeMag = 0;
    } else {
      this.shakeX = 0; this.shakeY = 0;
    }
  }

  collectPickup(pk: Pickup) {
    const p = this.player;
    switch (pk.kind) {
      case 'xp':
        this.grantXp(pk.value);
        this.xpCombo = Math.min(16, this.xpCombo + 1);
        this.xpComboT = 0.9;
        this.audio.sfx('xp', { pitch: 0.9 + this.xpCombo * 0.06 + Math.min(0.4, pk.value / 60) });
        break;
      case 'hp':
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.28);
        this.fx.text(p.x, p.y - 30, '+HP', '#7dff8a');
        this.fx.burst(p.x, p.y, 10, 120, '#7dff8a', 3, 4);
        this.audio.sfx('heal');
        break;
      case 'magnet':
        for (const o of this.pickups) if (o.kind === 'xp') o.magnet = true;
        this.fx.ring(p.x, p.y, '#7fe3ff', 20, 900, 0.8);
        this.audio.sfx('magnet');
        break;
      case 'bomb': {
        this.fx.flashT = 0.25;
        this.fx.ring(p.x, p.y, '#ffde59', 30, 1100, 0.9);
        this.shake(12);
        this.audio.sfx('bomb');
        for (const e of this.circleHit(p.x, p.y, 380)) {
          this.damageEnemy(e, e.isBoss ? 250 : 400, false, { pure: true });
        }
        break;
      }
      case 'chest': {
        this.audio.sfx('chest');
        this.fx.burst(p.x, p.y - 20, 24, 220, '#ffde59', 4, 4);
        // free random upgrade
        const offers = this.generateOffers();
        if (offers.length > 0 && offers[0].kind !== 'filler') {
          const o = this.rng.pick(offers);
          this.applyFreeUpgrade(o);
        } else {
          p.hp = Math.min(p.maxHp, p.hp + 30);
          this.meta.shards += 25;
          this.stats.shardsEarned += 25;
          this.fx.text(p.x, p.y - 40, '+25 shards', '#ffd94e');
        }
        break;
      }
      case 'shard':
        this.meta.shards += pk.value;
        this.stats.shardsEarned += pk.value;
        this.audio.sfx('xp', { pitch: 0.6 });
        this.fx.text(pk.x, pk.y - 8, `+${pk.value}`, '#ffd94e');
        break;
    }
  }

  applyFreeUpgrade(o: Offer) {
    const p = this.player;
    if (o.kind === 'weapon') {
      const w = p.weapons.find((x) => x.id === o.id);
      if (w) w.level++;
      else p.weapons.push(makeWeapon(o.id));
    } else if (o.kind === 'passive') {
      const x = p.passives.find((q) => q.id === o.id);
      if (x) x.level++;
      else p.passives.push({ id: o.id, level: 1 });
      this.recalcStats();
    } else if (o.kind === 'evo') {
      const w = p.weapons.find((x) => x.id === o.id);
      if (w) w.evolved = true;
    }
    this.fx.text(p.x, p.y - 40, `${o.name}!`, '#ffde59');
  }

  updateProjectiles(dt: number) {
    const p = this.player;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      let dead = pr.life <= 0;

      // homing
      if (pr.homing > 0 && !dead) {
        const t = this.nearestEnemy(pr.x, pr.y, 340, 0);
        if (t) {
          const want = Math.atan2(t.y - pr.y, t.x - pr.x);
          const cur = Math.atan2(pr.vy, pr.vx);
          let da = want - cur;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          const turn = pr.homing * dt;
          const na = cur + Math.max(-turn, Math.min(turn, da));
          const sp = Math.hypot(pr.vx, pr.vy);
          pr.vx = Math.cos(na) * sp;
          pr.vy = Math.sin(na) * sp;
        }
      }

      // boomerang return
      if (pr.boom && !dead) {
        pr.boom.dist += Math.hypot(pr.vx, pr.vy) * dt;
        if (!pr.boom.returning && pr.boom.dist >= pr.boom.maxDist) {
          pr.boom.returning = true;
        }
        if (pr.boom.returning) {
          const dx = p.x - pr.x, dy = p.y - pr.y;
          const d = Math.hypot(dx, dy) || 1;
          const sp = 460;
          pr.vx += ((dx / d) * sp - pr.vx) * Math.min(1, 10 * dt);
          pr.vy += ((dy / d) * sp - pr.vy) * Math.min(1, 10 * dt);
          if (d < 26) dead = true;
        }
      }

      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;

      // mortar shell explodes at end of life
      if (dead && pr.kind === 'shell' && pr.aoeR) {
        this.explode(pr.x, pr.y, pr.aoeR, pr.dmg, pr.crit);
        this.projectiles[i] = this.projectiles[this.projectiles.length - 1];
        this.projectiles.pop();
        continue;
      }

      // collide with enemies
      if (!dead) {
        let hit = false;
        this.grid.query(pr.x, pr.y, pr.r + 30, (e) => {
          if (hit || e.dead || e.spawnT > 0.12) return;
          if (pr.hitIds && pr.hitIds.has(e.uid)) return;
          const dx = e.x - pr.x, dy = e.y - pr.y;
          if (dx * dx + dy * dy < (pr.r + e.r) * (pr.r + e.r)) {
            if (pr.hitIds) pr.hitIds.add(e.uid);
            this.damageEnemy(e, pr.dmg, pr.crit, {
              kx: pr.vx * 0.12, ky: pr.vy * 0.12, burn: pr.burn,
            });
            if (pr.kind === 'spark' && pr.burn) {
              // wildfire: ignite ground
              this.fx.zone(pr.x, pr.y, 55 * this.player.stats.areaMul, 14 * this.player.stats.damageMul, 3, 'fire', false, 0);
            }
            if (pr.chain > 0) {
              // retarget to another enemy
              let next: Enemy | null = null;
              let bd = 180 * 180;
              this.grid.query(pr.x, pr.y, 200, (o) => {
                if (o.dead || o === e || (pr.hitIds && pr.hitIds.has(o.uid))) return;
                const d2 = (o.x - pr.x) ** 2 + (o.y - pr.y) ** 2;
                if (d2 < bd) { bd = d2; next = o; }
              });
              if (next) {
                const t: Enemy = next;
                const a = Math.atan2(t.y - pr.y, t.x - pr.x);
                const sp = Math.hypot(pr.vx, pr.vy);
                pr.vx = Math.cos(a) * sp;
                pr.vy = Math.sin(a) * sp;
                pr.chain--;
                pr.life = Math.max(pr.life, 0.8);
                return; // projectile continues
              }
            }
            if (pr.pierce > 0) {
              pr.pierce--;
              if (pr.pierce <= 0 && pr.kind !== 'rang') hit = true;
            } else {
              hit = true;
            }
          }
        });
        if (hit) dead = true;
      }

      // spark trail fx
      if ((pr.kind === 'spark' || pr.kind === 'cinder' || pr.kind === 'kindling') && this.frame % 2 === 0) {
        this.fx.spawn(pr.x, pr.y, 0, 0, 0.18, pr.r * 0.7, pr.kind === 'cinder' ? '#ffcf7e' : '#ff9a4e', 0);
      }

      if (dead) {
        if (pr.kind === 'spark' && pr.burn && pr.pierce <= 0) {
          this.fx.zone(pr.x, pr.y, 55 * this.player.stats.areaMul, 14 * this.player.stats.damageMul, 3, 'fire', false, 0);
        }
        this.projectiles[i] = this.projectiles[this.projectiles.length - 1];
        this.projectiles.pop();
      }
    }
  }

  explode(x: number, y: number, r: number, dmg: number, crit: boolean) {
    this.fx.burst(x, y, 20, 280, '#ffb14e', 5, 0);
    this.fx.burst(x, y, 10, 160, '#ff5a2e', 6, 4);
    this.fx.ring(x, y, '#ffcf7e', 12, r * 2.6, 0.4);
    this.audio.sfx('explosion');
    this.shake(3);
    for (const e of this.circleHit(x, y, r)) {
      this.damageEnemy(e, dmg, crit, { burn: true });
    }
  }

  separateEnemies() {
    // cheap pairwise separation via grid
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || e.isBoss) continue;
      this.grid.query(e.x, e.y, e.r + 20, (o) => {
        if (o === e || o.dead || o.uid <= e.uid) return;
        const dx = o.x - e.x, dy = o.y - e.y;
        const rr = (e.r + o.r) * 0.85;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (rr - d) / rr * 60;
          const ux = dx / d, uy = dy / d;
          const ow = o.isBoss ? 0 : 0.5;
          const ew = o.isBoss ? 1 : 0.5;
          e.x -= ux * push * ew * 0.016 * 60 / 60;
          e.y -= uy * push * ew * 0.016 * 60 / 60;
          o.x += ux * push * ow * 0.016 * 60 / 60;
          o.y += uy * push * ow * 0.016 * 60 / 60;
        }
      });
    }
  }

  // ambient stage weather (visual only)
  updateWeather(dt: number) {
    const vr = this.viewRadius();
    if (this.stage.id === 1) {
      // drifting spores
      if (this.frame % 5 === 0) {
        const x = this.camX + (Math.random() - 0.5) * vr * 1.6;
        const y = this.camY + (Math.random() - 0.5) * vr * 1.6;
        this.fx.spawn(x, y, 6 + Math.random() * 8, -4 - Math.random() * 8, 3.5, 1.6, 'rgba(180,230,150,0.30)', 0);
      }
    } else if (this.stage.id === 2) {
      // ceiling drips
      if (this.frame % 8 === 0) {
        const x = this.camX + (Math.random() - 0.5) * vr * 1.6;
        const y = this.camY + (Math.random() - 0.5) * vr * 1.6;
        this.fx.spawn(x, y, 0, 480, 0.9, 2, 'rgba(140,190,255,0.4)', 5);
      }
    } else {
      // driving rain
      for (let i = 0; i < 2; i++) {
        const x = this.camX + (Math.random() - 0.5) * vr * 1.8;
        const y = this.camY - vr * 0.6 + (Math.random() - 0.5) * vr;
        this.fx.spawn(x, y, -60, 640, 0.75, 2.2, 'rgba(150,190,255,0.32)', 5);
      }
      // occasional far lightning flash
      if (this.frame % 900 === 0 && Math.random() < 0.5) this.fx.flashT = Math.max(this.fx.flashT, 0.12);
    }
  }

  // ---------------- render ----------------
  render() {
    const ctx = this.ctx;
    const dpr = this.dpr, zoom = this.zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0c1016';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const camX = this.camX + this.shakeX;
    const camY = this.camY + this.shakeY;
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * (this.w / 2 - camX * zoom), dpr * (this.h / 2 - camY * zoom));

    // background
    const vx0 = camX - this.w / 2 / zoom - 40;
    const vy0 = camY - this.h / 2 / zoom - 40;
    const vx1 = camX + this.w / 2 / zoom + 40;
    const vy1 = camY + this.h / 2 / zoom + 40;
    const pat = this.bgPatterns.get(this.stage.bg);
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    } else {
      ctx.fillStyle = '#101a12';
      ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    }
    // stage tint wash
    ctx.fillStyle = this.stage.tint;
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    this.renderDecor(ctx, vx0, vy0, vx1, vy1);

    // world-space effects under entities
    this.fx.renderWorld(ctx);

    // pickups
    this.renderPickups(ctx);

    // enemies (shadows batched into one path first)
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.x < vx0 - 80 || e.x > vx1 + 80 || e.y < vy0 - 80 || e.y > vy1 + 80) continue;
      ctx.moveTo(e.x + e.r * 0.9, e.y + e.r * 0.75);
      ctx.ellipse(e.x, e.y + e.r * 0.75, e.r * 0.9, e.r * 0.35, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.x < vx0 - 80 || e.x > vx1 + 80 || e.y < vy0 - 80 || e.y > vy1 + 80) continue;
      this.renderEnemy(ctx, e);
    }

    // player
    if (this.player?.alive) this.renderPlayer(ctx, camX, camY);

    // projectiles
    this.renderProjectiles(ctx);

    // enemy shots
    for (const s of this.eshots) {
      ctx.fillStyle = eshotColor(s.kind);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(s.x - s.r * 0.25, s.y - s.r * 0.25, s.r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // overlay damage numbers
    this.fx.renderOverlay(ctx);

    // offscreen boss direction arrow (screen space)
    if (this.boss && !this.boss.dead) {
      const b = this.boss;
      const sx = (b.x - camX) * zoom + this.w / 2;
      const sy = (b.y - camY) * zoom + this.h / 2;
      const margin = 46;
      if (sx < -20 || sx > this.w + 20 || sy < -20 || sy > this.h + 20) {
        const cx = this.w / 2, cy = this.h / 2;
        const a = Math.atan2(sy - cy, sx - cx);
        const t = Math.min(
          Math.abs((cx - margin) / (Math.cos(a) || 1e-6)),
          Math.abs((cy - margin) / (Math.sin(a) || 1e-6)),
        );
        const px = cx + Math.cos(a) * t;
        const py = cy + Math.sin(a) * t;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(a);
        ctx.globalAlpha = 0.75 + Math.sin(this.time * 6) * 0.25;
        ctx.fillStyle = '#ff8d7a';
        ctx.beginPath();
        ctx.moveTo(14, 0); ctx.lineTo(-8, 9); ctx.lineTo(-3, 0); ctx.lineTo(-8, -9);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    // white flash
    if (this.fx.flashT > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = Math.min(1, this.fx.flashT * 3);
      ctx.fillStyle = '#fff8ea';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
    }

    // fog vignette in screen space (pre-rendered once per stage/resize)
    if (!this.vignetteCanvas || this.vignetteStage !== this.stage.id || this.vignetteCanvas.width !== this.canvas.width || this.vignetteCanvas.height !== this.canvas.height) {
      const c = document.createElement('canvas');
      c.width = this.canvas.width;
      c.height = this.canvas.height;
      const vctx = c.getContext('2d')!;
      const g = vctx.createRadialGradient(
        c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.32,
        c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.62,
      );
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, this.stage.fog);
      vctx.fillStyle = g;
      vctx.fillRect(0, 0, c.width, c.height);
      this.vignetteCanvas = c;
      this.vignetteStage = this.stage.id;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.vignetteCanvas, 0, 0);
  }

  private renderDecor(ctx: CanvasRenderingContext2D, vx0: number, vy0: number, vx1: number, vy1: number) {
    // deterministic per-cell decorations
    const cell = 130;
    const stage = this.stage.id;
    const x0 = Math.floor(vx0 / cell), x1 = Math.floor(vx1 / cell);
    const y0 = Math.floor(vy0 / cell), y1 = Math.floor(vy1 / cell);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        let hsh = (cx * 374761393 + cy * 668265263) | 0;
        hsh = (hsh ^ (hsh >> 13)) | 0;
        const rn = ((hsh * 1274126177) | 0) >>> 0;
        const px = cx * cell + (rn % cell);
        const py = cy * cell + ((rn >> 8) % cell);
        const kind = (rn >> 16) % 5;
        ctx.globalAlpha = 0.5;
        if (stage === 1) {
          if (kind === 0) { ctx.fillStyle = '#2e5232'; ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI * 2); ctx.fill(); }
          else if (kind === 1) { ctx.fillStyle = '#6a4a7a'; ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#8a6a9a'; ctx.beginPath(); ctx.arc(px, py - 3, 2.5, 0, Math.PI * 2); ctx.fill(); }
          else if (kind === 2) { ctx.fillStyle = '#274a2a'; ctx.fillRect(px, py, 18, 4); }
        } else if (stage === 2) {
          if (kind === 0) { ctx.fillStyle = 'rgba(90,140,200,0.25)'; ctx.beginPath(); ctx.ellipse(px, py, 20, 9, 0, 0, Math.PI * 2); ctx.fill(); }
          else if (kind === 1) { ctx.fillStyle = '#3a3230'; ctx.fillRect(px, py, 10, 6); }
        } else {
          if (kind === 0) { ctx.fillStyle = 'rgba(120,200,220,0.18)'; ctx.fillRect(px, py, 26, 3); }
          else if (kind === 1) { ctx.fillStyle = '#232a3d'; ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#3d4a6d'; ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  private renderPickups(ctx: CanvasRenderingContext2D) {
    for (const pk of this.pickups) {
      const bob = Math.sin(pk.t * 5) * 2;
      if (pk.kind === 'xp') {
        const tier = pk.value >= 100 ? 3 : pk.value >= 25 ? 2 : pk.value >= 5 ? 1 : 0;
        const spr = this.gemSprites[tier];
        ctx.drawImage(spr, pk.x - 10, pk.y - 10 + bob);
      } else if (pk.kind === 'hp') {
        ctx.font = '16px Georgia';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#7dff8a';
        ctx.fillText('☕', pk.x, pk.y + 5 + bob);
        // glow
        ctx.globalAlpha = 0.3 + Math.sin(pk.t * 4) * 0.15;
        ctx.fillStyle = '#7dff8a';
        ctx.beginPath(); ctx.arc(pk.x, pk.y + bob, 10, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (pk.kind === 'magnet') {
        ctx.font = '16px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText('🧲', pk.x, pk.y + 5 + bob);
      } else if (pk.kind === 'bomb') {
        ctx.font = '17px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText('💥', pk.x, pk.y + 5 + bob);
      } else if (pk.kind === 'chest') {
        ctx.fillStyle = '#7a4a1e';
        ctx.fillRect(pk.x - 11, pk.y - 8 + bob, 22, 16);
        ctx.fillStyle = '#a86a2e';
        ctx.fillRect(pk.x - 11, pk.y - 8 + bob, 22, 6);
        ctx.fillStyle = '#ffd94e';
        ctx.fillRect(pk.x - 2, pk.y - 8 + bob, 4, 16);
        ctx.strokeStyle = '#3a2208';
        ctx.strokeRect(pk.x - 11, pk.y - 8 + bob, 22, 16);
      } else if (pk.kind === 'shard') {
        ctx.save();
        ctx.translate(pk.x, pk.y + bob);
        ctx.rotate(pk.t * 2);
        ctx.fillStyle = '#ffd94e';
        ctx.beginPath();
        ctx.moveTo(0, -6); ctx.lineTo(4, 0); ctx.lineTo(0, 6); ctx.lineTo(-4, 0);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
  }

  private renderEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
    const set = (e.elite ? this.spritesElite.get(e.def.sprite) : this.sprites.get(e.def.sprite));
    const sprH = e.def.spriteH * (e.elite ? 1.45 : 1) * (e.isBoss ? 1 : 1);
    if (!set) {
      ctx.fillStyle = '#a55';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const scaleIn = e.spawnT > 0 ? 1 - e.spawnT / 0.35 : 1;
    const img = e.facing >= 0 ? set.normal : set.flipped;
    const w = set.w * scaleIn, h = set.h * scaleIn;
    const padX = (img.width - set.w) / 2 * scaleIn;
    const padY = (img.height - set.h) / 2 * scaleIn;
    const bob = Math.sin(e.t * 6 + e.seedV * 10) * 1.5;
    ctx.drawImage(img, e.x - w / 2 - padX, e.y - h * set.anchorY - padY + bob, img.width * scaleIn, img.height * scaleIn);
    if (e.hitFlash > 0) {
      const flash = this.flashSprites.get(e.def.sprite);
      if (flash) {
        ctx.globalAlpha = Math.min(1, e.hitFlash);
        ctx.drawImage(flash, e.x - w / 2 - padX, e.y - h * set.anchorY - padY + bob, img.width * scaleIn, img.height * scaleIn);
        ctx.globalAlpha = 1;
      }
    }
    if (e.burnT > 0 && this.frame % 4 === 0) {
      this.fx.spawn(e.x + (Math.random() - 0.5) * e.r, e.y - e.r, 0, -30, 0.3, 3, '#ff8a3e', 4);
    }
    // elite hp bar
    if (e.elite && e.hp < e.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - 18, e.y - e.r - 16, 36, 5);
      ctx.fillStyle = '#c86bff';
      ctx.fillRect(e.x - 17, e.y - e.r - 15, 34 * (e.hp / e.maxHp), 3);
    }
  }

  private renderPlayer(ctx: CanvasRenderingContext2D, _camX: number, _camY: number) {
    const p = this.player;
    const dashing = p.dashT > 0;
    const set = dashing && this.playerSpriteLit ? this.playerSpriteLit : this.playerSprite;
    if (!set) return;
    // warm hero glow — keeps the eye on Novaki (pre-rendered stamp)
    if (!this.glowCanvas) {
      const c = document.createElement('canvas');
      c.width = 340; c.height = 340;
      const gctx = c.getContext('2d')!;
      const g = gctx.createRadialGradient(170, 170, 10, 170, 170, 170);
      g.addColorStop(0, 'rgba(255,170,80,0.14)');
      g.addColorStop(1, 'rgba(255,170,80,0)');
      gctx.fillStyle = g;
      gctx.fillRect(0, 0, 340, 340);
      this.glowCanvas = c;
    }
    ctx.drawImage(this.glowCanvas, p.x - 170, p.y - 190);
    const img = p.facing >= 0 ? set.normal : set.flipped;
    // walk bob + lean
    const moving = Math.abs(p.vx) + Math.abs(p.vy) > 20;
    const bob = moving ? Math.sin(p.walkT * 13) * 2.4 : Math.sin(this.time * 2.2) * 1.2;
    const lean = moving ? (p.vx / 720) * 0.18 : 0;
    const padX = (img.width - set.w) / 2;
    const padY = (img.height - set.h) / 2;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 12, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(lean);
    const flash = p.invulnT > 0 && (this.frame % 6) < 3;
    if (flash) ctx.globalAlpha = 0.45;
    ctx.drawImage(img, -set.w / 2 - padX, -set.h * set.anchorY - padY, img.width, img.height);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private renderProjectiles(ctx: CanvasRenderingContext2D) {
    for (const pr of this.projectiles) {
      if (pr.kind === 'rang') {
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.rotate(Math.atan2(pr.vy, pr.vx) + this.time * 18);
        ctx.fillStyle = '#d8b06a';
        ctx.fillRect(-10, -2.5, 20, 5);
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(6, -2.5, 5, 5);
        ctx.fillStyle = '#ff8a3e';
        ctx.beginPath(); ctx.arc(9, 0, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (pr.kind === 'shell') {
        ctx.fillStyle = '#ffde59';
        ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff7b2e';
        ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r * 0.55, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = pr.kind === 'cinder' ? '#ffcf7e' : pr.kind === 'kindling' ? '#ffe9a0' : '#ff9a4e';
        ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r * 0.45, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}

function eshotColor(kind: string): string {
  switch (kind) {
    case 'spore': return '#d8c86a';
    case 'bubble': return '#6db4ff';
    case 'bolt': return '#cfe6ff';
    case 'dust': return '#b8a888';
    case 'drop': return '#8fb8ff';
    default: return '#d8c86a';
  }
}
