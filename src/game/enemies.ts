// Enemy behaviors + boss state machines.
import type { Game, Enemy } from './game';
import { ENEMIES } from './data';

export function updateEnemy(g: Game, e: Enemy, dt: number) {
  const p = g.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  e.t += dt;

  if (e.hitFlash > 0) e.hitFlash -= dt * 6;
  if (e.spawnT > 0) e.spawnT -= dt;
  if (e.orbCd > 0) e.orbCd -= dt;
  if (e.contactCd > 0) e.contactCd -= dt;
  if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowMul = 1; }
  if (e.burnT > 0) {
    e.burnT -= dt;
    e.burnTick -= dt;
    if (e.burnTick <= 0) {
      e.burnTick = 0.5;
      g.damageEnemy(e, e.burnDps * 0.5, false, { silent: true, noKnock: true, pure: true });
      g.fx.spawn(e.x, e.y - e.r, 0, -26, 0.3, 3.5, '#ff8a3e', 4);
      if (e.dead) return;
    }
  }

  const spd = e.speed * e.slowMul;

  switch (e.def.behavior) {
    case 'chaser':
    case 'splitter':
    case 'tank': {
      e.vx = nx * spd;
      e.vy = ny * spd;
      if (e.def.behavior === 'tank') {
        e.state -= dt;
        if (e.state <= 0) {
          e.state = 3.2;
          g.fx.zone(e.x, e.y, 34, 3, 4, 'tar', true, 0);
        }
      }
      break;
    }
    case 'zigzag': {
      const wob = Math.sin(e.t * 5 + e.seedV * 10);
      e.vx = (nx + -ny * wob * 0.9) * spd;
      e.vy = (ny + nx * wob * 0.9) * spd;
      break;
    }
    case 'flyer': {
      const wob = Math.sin(e.t * 3.2 + e.seedV * 8);
      const keep = dist < 130 ? -0.6 : 1;
      e.vx = (nx * keep + -ny * wob * 0.8) * spd;
      e.vy = (ny * keep + nx * wob * 0.8) * spd;
      e.state -= dt;
      if (e.state <= 0 && dist < 420) {
        e.state = 3.4 + e.seedV;
        g.fireEShot(e.x, e.y, nx * 190, ny * 190, 7, e.dmg + 1, 'dust');
        g.audio.sfx('enemyshot', { pitch: 1.4 });
      }
      break;
    }
    case 'charger': {
      if (e.state === 0) {
        e.vx = nx * spd; e.vy = ny * spd;
        e.state2 -= dt;
        if (e.state2 <= 0 && dist < 340) {
          e.state = 1; e.t = 0;
          e.tx = nx; e.ty = ny;
          e.vx = 0; e.vy = 0;
        }
      } else if (e.state === 1) { // windup
        e.vx *= 0.85; e.vy *= 0.85;
        if (e.t > 0.55) { e.state = 2; e.t = 0; g.audio.sfx('telegraph'); }
      } else if (e.state === 2) { // dash
        e.vx = e.tx * spd * 4.4;
        e.vy = e.ty * spd * 4.4;
        if (e.t > 0.42) { e.state = 0; e.state2 = 3.6 + g.rng.range(0, 1.2); }
      }
      break;
    }
    case 'spitter': {
      if (dist > 260) { e.vx = nx * spd; e.vy = ny * spd; }
      else if (dist < 170) { e.vx = -nx * spd * 0.8; e.vy = -ny * spd * 0.8; }
      else { e.vx = -ny * spd * 0.4; e.vy = nx * spd * 0.4; }
      e.state -= dt;
      if (e.state <= 0 && dist < 460) {
        e.state = 2.7 + e.seedV * 0.5;
        g.fireEShot(e.x, e.y - 10, nx * 150, ny * 150, 8, e.def.shootDmg ?? 8, 'spore');
        g.audio.sfx('enemyshot');
      }
      break;
    }
    case 'orbiter': {
      if (e.state === 0) {
        if (dist > 185) { e.vx = nx * spd; e.vy = ny * spd; }
        else {
          // orbit tangentially
          const dir = e.seedV > 0.5 ? 1 : -1;
          e.vx = -ny * dir * spd * 1.2;
          e.vy = nx * dir * spd * 1.2;
          e.state2 -= dt;
          if (e.state2 <= 0) { e.state = 1; e.t = 0; e.tx = nx; e.ty = ny; }
        }
      } else { // lunge
        e.vx = e.tx * spd * 3.6;
        e.vy = e.ty * spd * 3.6;
        if (e.t > 0.5) { e.state = 0; e.state2 = 4.2 + g.rng.range(0, 1.5); }
      }
      break;
    }
    case 'exploder': {
      const wob = Math.sin(e.t * 2 + e.seedV * 9) * 0.5;
      e.vx = (nx + -ny * wob) * spd;
      e.vy = (ny + nx * wob) * spd;
      break;
    }
    case 'dasher': {
      if (e.state === 0) { // circle at range
        if (dist > 300) { e.vx = nx * spd; e.vy = ny * spd; }
        else {
          e.vx = -ny * spd;
          e.vy = nx * spd;
          e.state2 -= dt;
          if (e.state2 <= 0) { e.state = 1; e.t = 0; e.tx = nx; e.ty = ny; g.audio.sfx('telegraph'); }
        }
      } else if (e.state === 1) { // aim lock
        e.vx *= 0.8; e.vy *= 0.8;
        e.tx = nx; e.ty = ny;
        if (e.t > 0.45) { e.state = 2; e.t = 0; }
      } else { // dash through
        e.vx = e.tx * spd * 2.8;
        e.vy = e.ty * spd * 2.8;
        if (e.t > 0.65) { e.state = 0; e.state2 = 1.1 + g.rng.range(0, 0.8); }
      }
      break;
    }
    case 'teleporter': {
      e.vx = nx * spd; e.vy = ny * spd;
      e.state -= dt;
      if (e.state <= 0) {
        e.state = 4.5 + g.rng.range(0, 1);
        // teleport near player
        const a = g.rng.angle();
        const d = 150 + g.rng.range(0, 80);
        g.fx.burst(e.x, e.y, 8, 90, '#9ecfff', 3, 1);
        e.x = p.x + Math.cos(a) * d;
        e.y = p.y + Math.sin(a) * d;
        e.vx = 0; e.vy = 0;
        e.spawnT = 0.35;
        g.fx.burst(e.x, e.y, 8, 90, '#9ecfff', 3, 1);
        // swipe shortly after arriving
        const ex = e, swipeDmg = e.dmg * 1.4;
        g.fx.telegraph(ex.x, ex.y, 52, 0.5, () => {
          const ddx = g.player.x - ex.x, ddy = g.player.y - ex.y;
          if (Math.hypot(ddx, ddy) < 58 + g.player.r) g.hurtPlayer(swipeDmg, ex.x, ex.y);
        });
      }
      break;
    }
    case 'sniper': {
      if (dist > 320) { e.vx = nx * spd; e.vy = ny * spd; }
      else if (dist < 230) { e.vx = -nx * spd; e.vy = -ny * spd; }
      else { e.vx = -ny * spd * 0.6; e.vy = nx * spd * 0.6; }
      e.state -= dt;
      if (e.state <= 0 && dist < 520) {
        e.state = 3.1 + e.seedV * 0.6;
        const bx = e.x, by = e.y;
        g.fx.telegraphLine(bx, by, Math.atan2(ny, nx), dist + 60, 8, 0.5, () => {
          const ddx = g.player.x - bx, ddy = g.player.y - by;
          const d = Math.hypot(ddx, ddy) || 1;
          g.fireEShot(bx, by, ddx / d * 420, ddy / d * 420, 6, e.def.shootDmg ?? 10, 'bolt');
          g.audio.sfx('lightning');
        });
      }
      break;
    }
    case 'shielded': {
      e.vx = nx * spd;
      e.vy = ny * spd;
      break;
    }
  }

  // knockback decay
  e.x += (e.vx + e.kbx) * dt;
  e.y += (e.vy + e.kby) * dt;
  e.kbx *= 1 - 8 * dt;
  e.kby *= 1 - 8 * dt;

  if (Math.abs(e.vx) > 4) e.facing = e.vx > 0 ? 1 : -1;
}

// ---------------- Boss controllers ----------------
export function updateBoss(g: Game, e: Enemy, dt: number) {
  const p = g.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  e.t += dt;
  if (e.hitFlash > 0) e.hitFlash -= dt * 6;
  if (e.contactCd > 0) e.contactCd -= dt;

  const b = e.boss!;
  b.attackT -= dt;
  const hpP = e.hp / e.maxHp;

  if (e.def.id === 'boss_mossmaw') {
    const enraged = hpP < 0.35;
    if (enraged && !b.taunted) { b.taunted = true; g.audio.sfx('bossroar'); g.shake(6); g.hooks.onBanner('MOSSMAW RAGES', 'The thicket shakes'); }
    const spdMul = enraged ? 1.4 : 1;
    // movement: slow stalk unless charging
    if (b.phase === 0) {
      e.vx = nx * e.speed * spdMul; e.vy = ny * e.speed * spdMul;
      if (b.attackT <= 0) {
        const roll = g.rng.next();
        if (roll < 0.34 && dist < 420) { b.phase = 1; b.t = 0; b.tx = nx; b.ty = ny; g.audio.sfx('telegraph'); }
        else if (roll < 0.67) { b.phase = 2; b.t = 0; b.sub = 0; }
        else { b.phase = 3; b.t = 0; }
      }
    } else if (b.phase === 1) { // charge windup then dash
      e.vx *= 0.8; e.vy *= 0.8;
      if (b.t < 0.6) { b.tx = nx; b.ty = ny; }
      if (b.t > 0.7) {
        e.vx = b.tx * 470; e.vy = b.ty * 470;
        if (b.t > 1.25) { b.phase = 0; b.attackT = 2.6 - (1 - hpP) * 1.1; }
      }
    } else if (b.phase === 2) { // spore rings x3
      e.vx = nx * e.speed * 0.4; e.vy = ny * e.speed * 0.4;
      if (b.t > 0.5 + b.sub * 0.55) {
        b.sub++;
        const n = 10 + Math.round((1 - hpP) * 6);
        const off = g.rng.angle();
        for (let i = 0; i < n; i++) {
          const a = off + (i * Math.PI * 2) / n;
          g.fireEShot(e.x, e.y, Math.cos(a) * 170, Math.sin(a) * 170, 8, 9, 'spore');
        }
        g.audio.sfx('enemyshot');
        if (b.sub >= 3) { b.phase = 0; b.attackT = 3.2 - (1 - hpP) * 1.2; }
      }
    } else if (b.phase === 3) { // slam jump to player
      e.vx = 0; e.vy = 0;
      if (b.sub === 0) {
        b.sub = 1;
        b.tx = p.x; b.ty = p.y;
        const bx = b.tx, by = b.ty;
        g.fx.telegraph(bx, by, 130, 0.9, () => {
          g.shake(10);
          g.audio.sfx('explosion');
          g.fx.burst(bx, by, 26, 260, '#7fae4e', 5, 0);
          g.fx.ring(bx, by, '#9fd65e', 20, 320, 0.5);
          const dd = Math.hypot(g.player.x - bx, g.player.y - by);
          if (dd < 130 + g.player.r) g.hurtPlayer(22, bx, by);
        });
      }
      // hop visually: move to target over 0.9s
      const k = Math.min(1, b.t / 0.9);
      e.x = e.x + (b.tx - e.x) * k * 0.2;
      e.y = e.y + (b.ty - e.y) * k * 0.2;
      if (b.t > 1.0) { b.phase = 0; b.attackT = 2.4 - (1 - hpP) * 0.9; }
    }
    b.summonT -= dt;
    if (b.summonT <= 0) {
      b.summonT = 18;
      for (let i = 0; i < 4; i++) g.spawnEnemyAt('soot_imp', e.x + g.rng.range(-80, 80), e.y + g.rng.range(-80, 80), false);
      g.fx.burst(e.x, e.y, 14, 160, '#7fae4e', 4, 0);
    }
  } else if (e.def.id === 'boss_clog') {
    const enraged = hpP < 0.35;
    if (enraged && !b.taunted) { b.taunted = true; g.audio.sfx('bossroar'); g.shake(6); g.hooks.onBanner('CLOG OVERFLOWS', 'The pipes burst'); }
    const spdMul = enraged ? 1.35 : 1;
    if (b.phase === 0) {
      e.vx = nx * e.speed * spdMul; e.vy = ny * e.speed * spdMul;
      if (b.attackT <= 0) {
        const roll = g.rng.next();
        if (roll < 0.3) { b.phase = 1; b.t = 0; b.sub = 0; }
        else if (roll < 0.62) { b.phase = 2; b.t = 0; b.sub = 0; }
        else { b.phase = 3; b.t = 0; b.sub = 0; }
      }
    } else if (b.phase === 1) { // triple jet streams
      e.vx *= 0.9; e.vy *= 0.9;
      if (b.t > 0.4 + b.sub * 0.5) {
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        const bx = e.x, by = e.y, jetDmg = 16;
        g.fx.telegraphLine(bx, by, a, 620, 46, 0.65, () => {
          g.audio.sfx('lightning');
          g.fx.beam(bx, by, a, 620, 46, '#7ec8ff', 0.4);
          // damage along the line
          const ddx = g.player.x - bx, ddy = g.player.y - by;
          const proj = ddx * Math.cos(a) + ddy * Math.sin(a);
          const perp = Math.abs(-ddx * Math.sin(a) + ddy * Math.cos(a));
          if (proj > 0 && proj < 620 && perp < 23 + g.player.r) g.hurtPlayer(jetDmg, bx, by);
          for (let i = 0; i < 10; i++) {
            g.fx.spawn(bx + Math.cos(a) * 60 * i, by + Math.sin(a) * 60 * i, 0, -20, 0.4, 4, '#9ecfff', 0);
          }
        });
        g.audio.sfx('telegraph');
        b.sub++;
        if (b.sub >= 3) { b.phase = 0; b.attackT = 3.0 - (1 - hpP) * 1.2; }
      }
    } else if (b.phase === 2) { // bubble bombs
      e.vx = nx * e.speed * 0.5; e.vy = ny * e.speed * 0.5;
      if (b.t > 0.3 + b.sub * 0.28) {
        b.sub++;
        const a = g.rng.angle();
        const d = g.rng.range(60, 220);
        const bx = p.x + Math.cos(a) * d, by = p.y + Math.sin(a) * d;
        const poolDmg = 14;
        g.fx.telegraph(bx, by, 70, 0.85, () => {
          g.audio.sfx('explosion');
          g.fx.burst(bx, by, 16, 200, '#6db4ff', 5, 0);
          g.fx.zone(bx, by, 62, 6, 3.5, 'pool', true, 0);
          if (Math.hypot(g.player.x - bx, g.player.y - by) < 70 + g.player.r) g.hurtPlayer(poolDmg, bx, by);
        });
        if (b.sub >= 5) { b.phase = 0; b.attackT = 3.4 - (1 - hpP) * 1.3; }
      }
    } else if (b.phase === 3) { // whirlpool pull + radial
      e.vx = 0; e.vy = 0;
      if (b.t < 1.4) {
        // pull player gently toward the boss (nx/ny points boss->player)
        const pull = 130;
        if (g.player.dashT <= 0) {
          g.player.x -= nx * pull * dt;
          g.player.y -= ny * pull * dt;
        }
        if (g.frame % 6 === 0) g.fx.spawn(e.x + g.rng.range(-70, 70), e.y + g.rng.range(-70, 70), -nx * 60, -ny * 60, 0.5, 4, '#6db4ff', 0);
      } else if (b.sub === 0) {
        b.sub = 1;
        const n = 14 + Math.round((1 - hpP) * 8);
        for (let i = 0; i < n; i++) {
          const a = (i * Math.PI * 2) / n;
          g.fireEShot(e.x, e.y, Math.cos(a) * 230, Math.sin(a) * 230, 8, 11, 'bubble');
        }
        g.audio.sfx('nova');
        g.shake(6);
      }
      if (b.t > 1.8) { b.phase = 0; b.attackT = 3.6 - (1 - hpP) * 1.2; }
    }
    b.summonT -= dt;
    if (b.summonT <= 0) {
      b.summonT = 16;
      for (let i = 0; i < 3; i++) g.spawnEnemyAt('drip_slime', e.x + g.rng.range(-90, 90), e.y + g.rng.range(-90, 90), false);
    }
  } else if (e.def.id === 'boss_soakfather') {
    const enrage = hpP < 0.3;
    if (enrage && !b.taunted) { b.taunted = true; g.audio.playVoice('soak-taunt'); g.hooks.onBanner('THE STORM PEAKS', 'The Soakfather rages'); }
    const spdMul = enrage ? 1.5 : 1;
    if (b.phase === 0) {
      // drifts menacingly, keeps ~200 range
      const keep = dist > 240 ? 1 : dist < 150 ? -0.5 : 0.15;
      e.vx = nx * e.speed * keep * spdMul;
      e.vy = ny * e.speed * keep * spdMul;
      if (b.attackT <= 0) {
        const roll = g.rng.next();
        if (roll < 0.3) { b.phase = 1; b.t = 0; b.sub = 0; }
        else if (roll < 0.58) { b.phase = 2; b.t = 0; b.sub = 0; b.tx = p.x; b.ty = p.y; }
        else if (roll < 0.82) { b.phase = 3; b.t = 0; b.sub = 0; }
        else { b.phase = 4; b.t = 0; }
      }
    } else if (b.phase === 1) { // rain barrage: targeted drops
      e.vx = nx * e.speed * 0.3; e.vy = ny * e.speed * 0.3;
      if (b.t > 0.25 + b.sub * 0.16) {
        b.sub++;
        const a = g.rng.angle();
        const d = g.rng.range(0, 130);
        const bx = p.x + Math.cos(a) * d, by = p.y + Math.sin(a) * d;
        g.fx.telegraph(bx, by, 34, 0.7, () => {
          g.fx.burst(bx, by, 10, 170, '#8fb8ff', 4, 0);
          g.audio.sfx('hit');
          if (Math.hypot(g.player.x - bx, g.player.y - by) < 34 + g.player.r) g.hurtPlayer(13, bx, by);
        });
        if (b.sub >= (enrage ? 14 : 9)) { b.phase = 0; b.attackT = 2.6 - (1 - hpP) * 1.0; }
      }
    } else if (b.phase === 2) { // triple lightning strike on player
      e.vx *= 0.9; e.vy *= 0.9;
      if (b.t > 0.5 + b.sub * 0.75) {
        b.sub++;
        const bx = g.player.x, by = g.player.y;
        g.fx.telegraph(bx, by, 52, 0.68, () => {
          g.audio.sfx('lightning');
          g.shake(5);
          g.fx.beam(bx - 60, by - 420, Math.atan2(420, 60), 430, 26, '#cfe6ff', 0.3);
          g.fx.burst(bx, by, 18, 240, '#cfe6ff', 4, 0);
          if (Math.hypot(g.player.x - bx, g.player.y - by) < 52 + g.player.r) g.hurtPlayer(20, bx, by);
        });
        g.audio.sfx('telegraph');
        if (b.sub >= 3) { b.phase = 0; b.attackT = 3.0 - (1 - hpP) * 1.2; }
      }
    } else if (b.phase === 3) { // radial burst x2
      e.vx = 0; e.vy = 0;
      if (b.t > 0.6 + b.sub * 0.7) {
        b.sub++;
        const n = 18 + Math.round((1 - hpP) * 10);
        const off = g.rng.angle();
        for (let i = 0; i < n; i++) {
          const a = off + (i * Math.PI * 2) / n;
          g.fireEShot(e.x, e.y, Math.cos(a) * 200, Math.sin(a) * 200, 8, 12, 'drop');
        }
        g.audio.sfx('enemyshot');
        if (b.sub >= (enrage ? 3 : 2)) { b.phase = 0; b.attackT = 3.2 - (1 - hpP) * 1.2; }
      }
    } else if (b.phase === 4) { // summon wraiths
      e.vx = nx * e.speed * 0.5; e.vy = ny * e.speed * 0.5;
      if (b.t > 0.5) {
        for (let i = 0; i < 2; i++) g.spawnEnemyAt('rain_wraith', e.x + g.rng.range(-120, 120), e.y + g.rng.range(-120, 120), false);
        g.fx.burst(e.x, e.y, 20, 200, '#8fb8ff', 5, 1);
        b.phase = 0; b.attackT = 4.5;
      }
    }
  }

  e.x += e.vx * dt;
  e.y += e.vy * dt;
  if (Math.abs(e.vx) > 4) e.facing = e.vx > 0 ? 1 : -1;
  b.t += dt;
}

export const BOSS_DEFS = {
  mossmaw: {
    base: ENEMIES.moss_beetle,
    def: {
      id: 'boss_mossmaw', name: 'Mossmaw', sprite: 'boss-mossmaw.png',
      hp: 1600, speed: 52, dmg: 14, xp: 0, radius: 54, spriteH: 130,
      behavior: 'chaser' as const, cost: 0, shardChance: 1,
    },
    voice: 'mossmaw-intro', deathVoice: 'mossmaw-death',
  },
  captain_clog: {
    base: ENEMIES.clog_glob,
    def: {
      id: 'boss_clog', name: 'Captain Clog', sprite: 'boss-clog.png',
      hp: 2900, speed: 40, dmg: 18, xp: 0, radius: 60, spriteH: 145,
      behavior: 'chaser' as const, cost: 0, shardChance: 1,
    },
    voice: 'clog-intro', deathVoice: 'clog-death',
  },
  soakfather: {
    base: ENEMIES.rain_wraith,
    def: {
      id: 'boss_soakfather', name: 'The Soakfather', sprite: 'boss-soakfather.png',
      hp: 5200, speed: 58, dmg: 22, xp: 0, radius: 64, spriteH: 165,
      behavior: 'chaser' as const, cost: 0, shardChance: 1,
    },
    voice: 'soak-intro', deathVoice: 'soak-death',
  },
} as const;

export type BossId = keyof typeof BOSS_DEFS;
