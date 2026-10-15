// Weapon systems: auto-firing weapons, orbits, novas, beams, mortars, homing swarms.
import type { Game } from './game';
import { WEAPON_MAP } from './data';

export interface WeaponState {
  id: string;
  level: number;
  evolved: boolean;
  cd: number;       // time until next fire
  angle: number;    // orbit angle / misc
  burst: number;    // shots left in current burst
  burstT: number;
}

export function makeWeapon(id: string): WeaponState {
  return { id, level: 1, evolved: false, cd: 0.4, angle: 0, burst: 0, burstT: 0 };
}

// level scaling helper: interpolate table
function lv(table: number[], level: number): number {
  return table[Math.min(level, table.length) - 1];
}

const DMG: Record<string, number[]> = {
  spark_toss: [16, 20, 24, 28, 32],
  ember_orbit: [10, 13, 16, 20, 24],
  matcharang: [16, 20, 25, 30, 36],
  flame_lash: [22, 28, 35, 43, 52],
  smoke_ring: [9, 12, 15, 18, 22],
  cinder_bolts: [8, 10, 12, 14, 16],
  firework_mortar: [26, 34, 42, 51, 60],
  sun_lens: [30, 38, 46, 55, 66],
  kindling_swarm: [9, 12, 14, 17, 20],
};
const CD: Record<string, number[]> = {
  spark_toss: [0.8, 0.75, 0.7, 0.65, 0.6],
  ember_orbit: [0, 0, 0, 0, 0],
  matcharang: [2.2, 2.05, 1.9, 1.75, 1.6],
  flame_lash: [1.6, 1.48, 1.36, 1.24, 1.1],
  smoke_ring: [3.0, 2.8, 2.6, 2.4, 2.2],
  cinder_bolts: [0.55, 0.51, 0.47, 0.42, 0.38],
  firework_mortar: [2.8, 2.6, 2.4, 2.2, 2.0],
  sun_lens: [3.2, 3.0, 2.8, 2.6, 2.4],
  kindling_swarm: [1.8, 1.65, 1.5, 1.4, 1.3],
};

export function weaponIcon(w: WeaponState): string {
  const def = WEAPON_MAP.get(w.id)!;
  return w.evolved ? def.evoIcon! : def.icon;
}
export function weaponName(w: WeaponState): string {
  const def = WEAPON_MAP.get(w.id)!;
  return w.evolved ? def.evoName! : def.name;
}

export function updateWeapons(g: Game, dt: number) {
  const p = g.player;
  for (const w of p.weapons) {
    const area = p.stats.areaMul;
    switch (w.id) {
      case 'spark_toss': {
        w.cd -= dt;
        if (w.cd <= 0) {
          const base = lv(CD.spark_toss, w.level) * p.stats.cooldownMul;
          w.cd = w.evolved ? base * 0.85 : base;
          const count = w.evolved ? 3 : 1 + (w.level >= 3 ? 1 : 0) + (w.level >= 5 ? 1 : 0) + p.stats.projectilesAdd;
          const dmg = (w.evolved ? 38 : lv(DMG.spark_toss, w.level)) * p.stats.damageMul;
          for (let i = 0; i < count; i++) {
            const t = g.nearestEnemy(p.x, p.y, 700, i * 0.35);
            if (!t) break;
            const a = Math.atan2(t.y - p.y, t.x - p.x) + g.rng.range(-0.08, 0.08);
            g.fireProjectile({
              x: p.x, y: p.y - 12, vx: Math.cos(a) * 400, vy: Math.sin(a) * 400,
              r: 6 * area, dmg, pierce: w.evolved ? 1 : (w.level >= 5 ? 1 : 0),
              life: 1.6, kind: 'spark', homing: 0, burn: w.evolved, chain: 0,
              crit: g.rollCrit(), boom: null, seed: g.rng.next(),
            });
          }
          Audio_sfx(g, 'shoot');
        }
        break;
      }
      case 'cinder_bolts': {
        w.cd -= dt;
        if (w.cd <= 0) {
          const base = lv(CD.cinder_bolts, w.level) * p.stats.cooldownMul;
          w.cd = base;
          const count = (w.evolved ? 4 : 2 + (w.level >= 3 ? 1 : 0) + (w.level >= 5 ? 1 : 0)) + p.stats.projectilesAdd;
          const dmg = (w.evolved ? 20 : lv(DMG.cinder_bolts, w.level)) * p.stats.damageMul;
          for (let i = 0; i < count; i++) {
            const t = g.nearestEnemy(p.x, p.y, 640, i * 0.9);
            if (!t) break;
            const a = Math.atan2(t.y - p.y, t.x - p.x) + g.rng.range(-0.12, 0.12);
            g.fireProjectile({
              x: p.x, y: p.y - 12, vx: Math.cos(a) * 540, vy: Math.sin(a) * 540,
              r: 4.5 * area, dmg, pierce: 0, life: 1.3, kind: 'cinder',
              homing: w.evolved ? 2.6 : 0, burn: false, chain: 0,
              crit: g.rollCrit(w.evolved ? 0.25 : 0), boom: null, seed: g.rng.next(),
            });
          }
          Audio_sfx(g, 'shoot', 1.3);
        }
        break;
      }
      case 'matcharang': {
        w.cd -= dt;
        if (w.cd <= 0) {
          const base = lv(CD.matcharang, w.level) * p.stats.cooldownMul;
          w.cd = w.evolved ? base * 0.72 : base;
          const count = (w.evolved ? 3 : 1 + (w.level >= 4 ? 1 : 0)) + p.stats.projectilesAdd;
          const dmg = (w.evolved ? 42 : lv(DMG.matcharang, w.level)) * p.stats.damageMul;
          const aimA = g.aimAngle();
          for (let i = 0; i < count; i++) {
            const spread = count > 1 ? (i - (count - 1) / 2) * 0.35 : 0;
            const a = aimA + spread;
            g.fireProjectile({
              x: p.x, y: p.y - 10, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430,
              r: 10 * area, dmg, pierce: 999, life: 3.2, kind: 'rang',
              homing: 0, burn: w.evolved, chain: 0,
              crit: g.rollCrit(), boom: { dist: 0, maxDist: (w.evolved ? 320 : 260) * area, returning: false },
              seed: g.rng.next(),
            });
          }
          Audio_sfx(g, 'whip');
        }
        break;
      }
      case 'flame_lash': {
        w.cd -= dt;
        if (w.cd <= 0) {
          w.cd = lv(CD.flame_lash, w.level) * p.stats.cooldownMul * (w.evolved ? 0.85 : 1);
          const range = (w.evolved ? 170 : lv([0, 110, 120, 130, 140, 150], w.level)) * area;
          const arc = w.evolved ? Math.PI * 2 : 1.9;
          const dmg = (w.evolved ? 70 : lv(DMG.flame_lash, w.level)) * p.stats.damageMul;
          const a = g.aimAngle();
          const hits = g.arcHit(p.x, p.y, a, arc, range);
          for (const e of hits) {
            g.damageEnemy(e, dmg, g.rollCrit(), { kx: Math.cos(a) * 260, ky: Math.sin(a) * 260, burn: w.evolved || w.level >= 5 });
          }
          const slashA = w.evolved ? a - Math.PI / 2 : a;
          g.fx.slash(p.x, p.y, slashA, arc, range, w.evolved ? '#ff7b2e' : '#ffb14e');
          g.fx.burst(p.x + Math.cos(a) * range * 0.7, p.y + Math.sin(a) * range * 0.7, 6, 120, '#ff9a4e', 3, 4);
          Audio_sfx(g, 'whip');
        }
        break;
      }
      case 'smoke_ring': {
        w.cd -= dt;
        if (w.cd <= 0) {
          w.cd = lv(CD.smoke_ring, w.level) * p.stats.cooldownMul * (w.evolved ? 0.85 : 1);
          const r = (w.evolved ? 190 : lv([0, 95, 110, 125, 138, 150], w.level)) * area;
          const dmg = (w.evolved ? 34 : lv(DMG.smoke_ring, w.level)) * p.stats.damageMul;
          if (w.evolved) {
            // pull inward first, then blast after a beat
            g.pullEnemies(p.x, p.y, r * 1.3, 320);
            const px = p.x, py = p.y;
            g.fx.telegraph(px, py, r * 0.5, 0.35, () => {
              const hits = g.circleHit(px, py, r);
              for (const e of hits) {
                const dx = e.x - px, dy = e.y - py;
                const d = Math.hypot(dx, dy) || 1;
                g.damageEnemy(e, dmg, g.rollCrit(), { kx: dx / d * 420, ky: dy / d * 420, slow: 0.45 });
              }
              g.fx.zone(px, py, r * 0.8, 12 * p.stats.damageMul, 3, 'vortex', false, 60);
              g.fx.ring(px, py, '#c8c8d8', 20, r * 3.2, 0.45);
            });
          } else {
            const hits = g.circleHit(p.x, p.y, r);
            for (const e of hits) {
              const dx = e.x - p.x, dy = e.y - p.y;
              const d = Math.hypot(dx, dy) || 1;
              g.damageEnemy(e, dmg, g.rollCrit(), { kx: dx / d * 380, ky: dy / d * 380, slow: 0.35 });
            }
            g.fx.ring(p.x, p.y, '#c8c8d8', 16, r * 3.4, 0.4);
          }
          Audio_sfx(g, 'nova');
        }
        break;
      }
      case 'ember_orbit': {
        const count = (w.evolved ? 5 : 2 + (w.level >= 3 ? 1 : 0) + (w.level >= 5 ? 1 : 0)) + (p.stats.projectilesAdd > 0 ? 1 : 0);
        const orbR = (w.evolved ? 112 : lv([0, 70, 76, 82, 86, 92], w.level)) * area;
        const dmg = (w.evolved ? 34 : lv(DMG.ember_orbit, w.level)) * p.stats.damageMul;
        const speed = w.evolved ? 3.4 : 2.7;
        w.angle += dt * speed;
        for (let i = 0; i < count; i++) {
          const a = w.angle + (i * Math.PI * 2) / count;
          const ox = p.x + Math.cos(a) * orbR;
          const oy = p.y + Math.sin(a) * orbR * 0.9;
          // collide
          g.orbitHit(ox, oy, 16 * area, dmg, w.evolved);
          if (g.frame % 3 === 0) {
            g.fx.spawn(ox, oy, 0, -8, 0.28, 4.5, w.evolved ? '#ffde59' : '#ff9a4e', 0);
          }
        }
        break;
      }
      case 'firework_mortar': {
        w.cd -= dt;
        if (w.cd <= 0) {
          w.cd = lv(CD.firework_mortar, w.level) * p.stats.cooldownMul * (w.evolved ? 0.8 : 1);
          const shells = (w.evolved ? 3 : 1 + (w.level >= 4 ? 1 : 0)) + p.stats.projectilesAdd;
          const r = (w.evolved ? 150 : lv([0, 95, 105, 115, 125, 135], w.level)) * area;
          const dmg = (w.evolved ? 85 : lv(DMG.firework_mortar, w.level)) * p.stats.damageMul;
          for (let i = 0; i < shells; i++) {
            const t = g.densestEnemy(620) ?? g.nearestEnemy(p.x, p.y, 620, Math.random() * 3);
            if (!t) break;
            const tx = t.x + g.rng.range(-30, 30) * i;
            const ty = t.y + g.rng.range(-30, 30) * i;
            const d = Math.hypot(tx - p.x, ty - p.y);
            const travel = Math.min(0.85, d / 620);
            g.fireProjectile({
              x: p.x, y: p.y - 14, vx: (tx - p.x) / travel, vy: (ty - p.y) / travel,
              r: 7, dmg, pierce: 999, life: travel, kind: 'shell', homing: 0, burn: false, chain: 0,
              crit: g.rollCrit(), boom: null, aoeR: r, seed: g.rng.next(),
            });
          }
          Audio_sfx(g, 'shoot', 0.7);
        }
        break;
      }
      case 'sun_lens': {
        w.cd -= dt;
        if (w.cd <= 0) {
          w.cd = lv(CD.sun_lens, w.level) * p.stats.cooldownMul * (w.evolved ? 0.8 : 1);
          const len = (w.evolved ? 300 : lv([0, 380, 420, 450, 490, 520], w.level)) * area;
          const wid = (w.evolved ? 44 : 30) * area;
          const dmg = (w.evolved ? 90 : lv(DMG.sun_lens, w.level)) * p.stats.damageMul;
          if (w.evolved) {
            const hitIds = new Set<number>();
            g.fx.beam(p.x, p.y, g.rng.angle(), len, wid, '#ffe9a0', 1.0, Math.PI * 2 / 1.0, hitIds);
            g.pendingBeams.push({ x: 0, y: 0, followPlayer: true, dmg, len, wid, dur: 1.0, t: 0, angle: 0, sweep: Math.PI * 2, hitIds });
            g.shake(4);
          } else {
            const t = g.nearestEnemy(p.x, p.y, 700, 0);
            if (t) {
              const a = Math.atan2(t.y - p.y, t.x - p.x);
              const hits = g.lineHit(p.x, p.y, a, len, wid);
              for (const e of hits) g.damageEnemy(e, dmg, g.rollCrit(), { burn: true });
              g.fx.beam(p.x, p.y, a, len, wid, '#ffe9a0', 0.35);
              g.shake(2.5);
            } else {
              w.cd = 0.2; // retry soon
              break;
            }
          }
          Audio_sfx(g, 'lightning');
        }
        break;
      }
      case 'kindling_swarm': {
        w.cd -= dt;
        if (w.cd <= 0) {
          w.cd = lv(CD.kindling_swarm, w.level) * p.stats.cooldownMul * (w.evolved ? 0.8 : 1);
          const count = (w.evolved ? 7 : 3 + (w.level >= 3 ? 1 : 0) + (w.level >= 5 ? 1 : 0)) + p.stats.projectilesAdd;
          const dmg = (w.evolved ? 26 : lv(DMG.kindling_swarm, w.level)) * p.stats.damageMul;
          for (let i = 0; i < count; i++) {
            const a = g.rng.angle();
            g.fireProjectile({
              x: p.x, y: p.y - 12, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240,
              r: 5 * area, dmg, pierce: 0, life: 2.4, kind: 'kindling',
              homing: 3.6, burn: false, chain: w.evolved ? 3 : (w.level >= 5 ? 1 : 0),
              crit: g.rollCrit(), boom: null, seed: g.rng.next(),
            });
          }
          Audio_sfx(g, 'shoot', 0.85);
        }
        break;
      }
    }
  }

  // rotating beams that follow the player (solar flare)
  const pb = g.pendingBeams;
  for (let i = pb.length - 1; i >= 0; i--) {
    const b = pb[i];
    b.t += dt;
    b.angle += b.sweep * dt;
    if (b.t >= b.dur) { pb.splice(i, 1); continue; }
    if (b.followPlayer) { b.x = g.player.x; b.y = g.player.y; }
    const hits = g.lineHit(b.x, b.y, b.angle, b.len, b.wid, b.hitIds);
    for (const e of hits) {
      b.hitIds.add(e.uid);
      g.damageEnemy(e, b.dmg, g.rollCrit(), { burn: true });
    }
  }
}

function Audio_sfx(g: Game, name: string, pitch = 1) {
  g.audio.sfx(name, { pitch });
}
