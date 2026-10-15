// DOM overlay screens: menu, settings, how-to, forge (meta), pause, level-up, story, game over, victory.
import type { Game, Offer, RunStats } from '../game/game';
import { META_ITEMS, STAGES, saveMeta, saveSettings, type MetaSave, type Settings } from '../game/data';
import { weaponIcon, weaponName } from '../game/weapons';
import { Audio } from '../core/audio';
import { imageUrl } from '../core/assets';

export type ScreenName =
  | 'loading' | 'menu' | 'playing' | 'paused' | 'levelup' | 'gameover'
  | 'victory' | 'settings' | 'howto' | 'forge' | 'story';

export interface UIHooks {
  onStartRun(): void;
  onResume(): void;
  onQuitToMenu(): void;
  onChooseOffer(o: Offer): void;
  onStoryDone(): void;
  getSettings(): Settings;
  getMeta(): MetaSave;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

export class UI {
  overlay = $('#overlay');
  banner = $('#banner');
  hud = $('#hud');
  current: ScreenName = 'loading';
  private hooks!: UIHooks;
  private game: Game | null = null;
  private returnTo: ScreenName = 'menu';
  private storyQueue: { img?: string; text: string; voice?: string }[] = [];
  private storyIdx = 0;
  private levelupOffers: Offer[] = [];
  private hudTick = 0;

  init(hooks: UIHooks) {
    this.hooks = hooks;
    $('#btn-pause').addEventListener('click', () => {
      if (this.current === 'playing') this.showPause();
    });
  }

  setGame(g: Game) {
    this.game = g;
  }

  hideOverlay() {
    this.overlay.className = '';
    this.overlay.innerHTML = '';
  }

  show(name: ScreenName) {
    this.current = name;
    this.hud.classList.toggle('hidden', !(name === 'playing' || name === 'paused' || name === 'levelup'));
    if (name === 'playing') {
      this.hideOverlay();
      return;
    }
    this.overlay.className = 'active';
    switch (name) {
      case 'loading': this.renderLoading(); break;
      case 'menu': this.renderMenu(); break;
      case 'settings': this.renderSettings(); break;
      case 'howto': this.renderHowto(); break;
      case 'forge': this.renderForge(); break;
      case 'paused': this.renderPause(); break;
      case 'gameover': break;
      case 'victory': break;
    }
  }

  private el(html: string): HTMLElement {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d.firstElementChild as HTMLElement;
  }

  private sfxClick() {
    Audio.unlock();
    Audio.sfx('ui');
  }

  // ---------- loading ----------
  renderLoading() {
    this.overlay.innerHTML = '';
    const s = this.el(`<div class="screen dim"><div class="title-logo"><span class="big">LAST SPARK</span></div><div class="subtitle">striking…</div></div>`);
    this.overlay.appendChild(s);
  }

  // ---------- main menu ----------
  renderMenu() {
    this.overlay.innerHTML = '';
    const meta = this.hooks.getMeta();
    const art = imageUrl('keyart-menu.png');
    const embers = Array.from({ length: 18 }, (_, i) =>
      `<i class="menu-ember" style="left:${(i * 53 + 7) % 97}%; animation-delay:${(i * 0.83) % 6}s; animation-duration:${5 + (i % 5)}s"></i>`).join('');
    const s = this.el(`
      <div class="screen">
        <div class="menu-art" style="${art ? `background-image:url('${art}')` : ''}"></div>
        <div class="menu-embers">${embers}</div>
        <div class="title-logo"><span class="small">NOVAKI</span><span class="big">LAST SPARK</span></div>
        <div class="subtitle">The Damp is rising. One match remains.</div>
        <div class="menu-col">
          <button class="btn primary" id="m-play">▶ &nbsp;Strike a Run</button>
          <button class="btn" id="m-forge">🔥 &nbsp;The Forge &nbsp;<span style="color:var(--amber)">◆ ${meta.shards}</span></button>
          <button class="btn" id="m-howto">📖 &nbsp;How to Play</button>
          <button class="btn" id="m-settings">⚙ &nbsp;Settings</button>
        </div>
        <div class="subtitle" style="margin-top:10px">runs ${meta.runs} · victories ${meta.wins}${meta.wins > 0 ? ' · best ' + fmtTime(meta.bestTime) : ''}</div>
      </div>`);
    this.overlay.appendChild(s);
    s.querySelector('#m-play')!.addEventListener('click', () => { this.sfxClick(); this.hooks.onStartRun(); });
    s.querySelector('#m-forge')!.addEventListener('click', () => { this.sfxClick(); this.returnTo = 'menu'; this.show('forge'); });
    s.querySelector('#m-howto')!.addEventListener('click', () => { this.sfxClick(); this.returnTo = 'menu'; this.show('howto'); });
    s.querySelector('#m-settings')!.addEventListener('click', () => { this.sfxClick(); this.returnTo = 'menu'; this.show('settings'); });
  }

  // ---------- settings ----------
  renderSettings() {
    this.overlay.innerHTML = '';
    const st = this.hooks.getSettings();
    const s = this.el(`
      <div class="screen dim">
        <h2 class="screen-title">Settings</h2>
        <div class="panel">
          <div class="setting-row"><span>Music volume</span><input type="range" id="s-music" min="0" max="100" value="${Math.round(st.musicVol * 100)}"></div>
          <div class="setting-row"><span>Sound volume</span><input type="range" id="s-sfx" min="0" max="100" value="${Math.round(st.sfxVol * 100)}"></div>
          <div class="setting-row"><span>Screen shake</span><div class="toggle ${st.screenShake ? 'on' : ''}" id="s-shake"></div></div>
          <div class="setting-row"><span>Damage numbers</span><div class="toggle ${st.dmgNumbers ? 'on' : ''}" id="s-dmg"></div></div>
          <button class="btn" id="s-back">Back</button>
        </div>
      </div>`);
    this.overlay.appendChild(s);
    const music = s.querySelector<HTMLInputElement>('#s-music')!;
    const sfx = s.querySelector<HTMLInputElement>('#s-sfx')!;
    music.addEventListener('input', () => {
      st.musicVol = Number(music.value) / 100;
      Audio.musicVolume = st.musicVol;
      Audio.applyVolumes();
      saveSettings(st);
    });
    sfx.addEventListener('input', () => {
      st.sfxVol = Number(sfx.value) / 100;
      Audio.sfxVolume = st.sfxVol;
      Audio.applyVolumes();
      saveSettings(st);
      Audio.sfx('ui');
    });
    const wireToggle = (id: string, get: boolean, set: (v: boolean) => void) => {
      const t = s.querySelector(id)!;
      t.addEventListener('click', () => {
        const on = !get;
        set(on);
        t.classList.toggle('on', on);
        saveSettings(st);
        this.sfxClick();
      });
    };
    wireToggle('#s-shake', st.screenShake, (v) => { st.screenShake = v; if (this.game) this.game.settings.screenShake = v; });
    wireToggle('#s-dmg', st.dmgNumbers, (v) => { st.dmgNumbers = v; if (this.game) this.game.fx.dmgNumbersEnabled = v; });
    s.querySelector('#s-back')!.addEventListener('click', () => { this.sfxClick(); this.show(this.returnTo); });
  }

  // ---------- how to play ----------
  renderHowto() {
    this.overlay.innerHTML = '';
    const s = this.el(`
      <div class="screen dim">
        <h2 class="screen-title">How to Play</h2>
        <div class="panel">
          <p style="margin-bottom:12px;font-style:italic;opacity:.85">Novaki attacks on his own — your job is to <b>not die</b>. Kite the horde, gather sparks, and grow warm enough to out-burn the Damp.</p>
          <div class="howto-grid">
            <span><span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span> / <span class="kbd">↑</span><span class="kbd">←</span><span class="kbd">↓</span><span class="kbd">→</span></span><span>Move</span>
            <span><span class="kbd">Space</span> / <span class="kbd">Shift</span></span><span>Dash (brief invulnerability)</span>
            <span><span class="kbd">Esc</span> / <span class="kbd">P</span></span><span>Pause</span>
            <span>🎮 Gamepad</span><span>Left stick to move, <b>A</b> to dash, <b>Start</b> to pause</span>
            <span>📱 Touch</span><span>Left half = joystick, button = dash</span>
          </div>
          <p style="margin-top:14px;opacity:.85;font-size:14px">
            ◆ <b>Sparks</b> (blue gems) level you up — pick 1 of 3 upgrades.<br>
            ◆ Weapons at max level + their partner passive <b>evolve</b>.<br>
            ◆ Elites drop <b>chests</b> with free upgrades. Bosses guard each stage.<br>
            ◆ <b>Ember shards</b> ◆ are forever: spend them in the Forge between runs.<br>
            ◆ Beat all three bosses to light the Great Hearth. A full run takes ~20 minutes.
          </p>
          <button class="btn" id="h-back">Back</button>
        </div>
      </div>`);
    this.overlay.appendChild(s);
    s.querySelector('#h-back')!.addEventListener('click', () => { this.sfxClick(); this.show(this.returnTo); });
  }

  // ---------- forge (meta progression) ----------
  renderForge() {
    this.overlay.innerHTML = '';
    const meta = this.hooks.getMeta();
    const items = META_ITEMS.map((it) => {
      const owned = meta.items[it.id] ?? 0;
      const maxed = owned >= it.maxLevel;
      const cost = maxed ? 0 : it.cost(owned);
      const pips = Array.from({ length: it.maxLevel }, (_, i) => `<i class="${i < owned ? 'f' : ''}" style="display:inline-block;width:14px;height:5px;border-radius:3px;background:${i < owned ? 'var(--amber)' : 'rgba(255,255,255,.18)'};margin-right:3px"></i>`).join('');
      return `
        <div class="shop-item ${maxed ? 'maxed' : ''}">
          <div class="si-top"><span class="si-name">${it.icon} ${it.name}</span><span>${pips}</span></div>
          <div class="si-desc">${it.desc}</div>
          <button class="btn small si-buy" data-id="${it.id}" ${maxed || meta.shards < cost ? 'disabled' : ''}>
            ${maxed ? 'MAXED' : `◆ ${cost}`}
          </button>
        </div>`;
    }).join('');
    const startOpts = ['spark_toss'];
    if (meta.items['m_wpn_rang']) startOpts.push('matcharang');
    if (meta.items['m_wpn_ring']) startOpts.push('smoke_ring');
    const startSelect = startOpts.map((id) => {
      const name = id === 'spark_toss' ? '✨ Spark Toss' : id === 'matcharang' ? '🪃 Matcharang' : '💨 Smoke Ring';
      return `<option value="${id}" ${meta.startWeapon === id ? 'selected' : ''}>${name}</option>`;
    }).join('');
    const s = this.el(`
      <div class="screen dim">
        <h2 class="screen-title">The Forge</h2>
        <div class="currency-row"><span>Ember shards:</span><span class="shards">◆ ${meta.shards}</span></div>
        <div class="shop-grid">${items}</div>
        <div class="panel" style="margin-top:6px;padding:14px 18px;display:flex;align-items:center;gap:14px;justify-content:space-between">
          <span>Starting weapon</span>
          <select id="f-start" style="font-family:inherit;font-size:15px;padding:8px 10px;background:#241c14;color:var(--paper);border:1px solid var(--panel-edge);border-radius:8px">${startSelect}</select>
        </div>
        <button class="btn" id="f-back" style="max-width:340px">Back</button>
      </div>`);
    this.overlay.appendChild(s);
    s.querySelectorAll<HTMLButtonElement>('.si-buy').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id!;
        const it = META_ITEMS.find((x) => x.id === id)!;
        const owned = meta.items[id] ?? 0;
        const cost = it.cost(owned);
        if (meta.shards >= cost && owned < it.maxLevel) {
          meta.shards -= cost;
          meta.items[id] = owned + 1;
          saveMeta(meta);
          Audio.sfx('chest');
          this.renderForge();
        }
      });
    });
    s.querySelector('#f-start')!.addEventListener('change', (e) => {
      meta.startWeapon = (e.target as HTMLSelectElement).value;
      saveMeta(meta);
      this.sfxClick();
    });
    s.querySelector('#f-back')!.addEventListener('click', () => { this.sfxClick(); this.show(this.returnTo); });
  }

  // ---------- pause ----------
  renderPause() {
    this.overlay.innerHTML = '';
    const s = this.el(`
      <div class="screen dim">
        <h2 class="screen-title">Paused</h2>
        <div class="menu-col">
          <button class="btn primary" id="p-resume">Resume</button>
          <button class="btn" id="p-settings">Settings</button>
          <button class="btn" id="p-quit">Abandon Run</button>
        </div>
      </div>`);
    this.overlay.appendChild(s);
    s.querySelector('#p-resume')!.addEventListener('click', () => { this.sfxClick(); this.hooks.onResume(); });
    s.querySelector('#p-settings')!.addEventListener('click', () => { this.sfxClick(); this.returnTo = 'paused'; this.show('settings'); });
    s.querySelector('#p-quit')!.addEventListener('click', () => { this.sfxClick(); this.hooks.onQuitToMenu(); });
  }

  showPause() {
    if (this.current !== 'playing') return;
    Audio.sfx('pause');
    this.show('paused');
  }

  // ---------- level up ----------
  showLevelUp(offers: Offer[], rerolls: number) {
    this.levelupOffers = offers;
    this.show('levelup');
    this.overlay.innerHTML = '';
    const cards = offers.map((o, i) => {
      const pips = o.maxLevel > 0 ? Array.from({ length: o.maxLevel }, (_, k) => `<i class="${k < o.levelAfter ? 'f' : ''}"></i>`).join('') : '';
      return `
        <button class="card ${o.evo ? 'evo' : ''} ${o.tag.includes('NEW') ? 'new-item' : ''}" data-i="${i}">
          <div class="tag">${o.tag}</div>
          <div class="icon">${o.icon}</div>
          <div class="name">${o.name}</div>
          <div class="desc">${o.desc}</div>
          <div class="pips">${pips}</div>
        </button>`;
    }).join('');
    const s = this.el(`
      <div class="screen dim" style="justify-content:center">
        <h2 class="screen-title">Level Up!</h2>
        <div id="levelup-cards">${cards}</div>
        ${rerolls > 0 ? '<button class="btn small" id="lv-reroll">🎲 Reroll (1)</button>' : ''}
      </div>`);
    this.overlay.appendChild(s);
    s.querySelectorAll<HTMLButtonElement>('.card').forEach((c) => {
      c.addEventListener('click', () => {
        const i = Number(c.dataset.i);
        Audio.sfx('chest');
        this.hooks.onChooseOffer(this.levelupOffers[i]);
      });
    });
    s.querySelector('#lv-reroll')?.addEventListener('click', () => {
      if (this.game) {
        Audio.sfx('ui');
        this.game.rerollsLeft--;
        this.showLevelUp(this.game.generateOffers(), this.game.rerollsLeft);
      }
    });
  }

  // ---------- story slides ----------
  showStory(slides: { img?: string; text: string; voice?: string }[], skippable = true) {
    this.storyQueue = slides;
    this.storyIdx = 0;
    this.show('story');
    this.renderStorySlide(skippable);
  }

  private renderStorySlide(skippable: boolean) {
    this.overlay.innerHTML = '';
    const slide = this.storyQueue[this.storyIdx];
    const img = slide.img ? imageUrl(slide.img) : undefined;
    const s = this.el(`
      <div class="screen dim" style="background-color:rgba(5,8,12,.88)">
        ${img ? `<img class="story-img" src="${img}" alt="">` : ''}
        <div class="story-text">${slide.text}</div>
        <div class="story-hint">${this.storyIdx < this.storyQueue.length - 1 ? 'click / enter to continue' : 'click / enter'}</div>
        ${skippable ? '<button class="btn small" id="st-skip" style="position:absolute;top:18px;right:18px">Skip →</button>' : ''}
      </div>`);
    this.overlay.appendChild(s);
    if (slide.voice) Audio.playVoice(slide.voice);
    const advance = () => {
      this.sfxClick();
      this.storyIdx++;
      if (this.storyIdx >= this.storyQueue.length) {
        Audio.stopVoice();
        this.hooks.onStoryDone();
      } else {
        this.renderStorySlide(skippable);
      }
    };
    s.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'st-skip') return;
      advance();
    });
    s.querySelector('#st-skip')?.addEventListener('click', () => {
      this.sfxClick();
      Audio.stopVoice();
      this.hooks.onStoryDone();
    });
    (s as HTMLElement).tabIndex = 0;
    (s as HTMLElement).focus();
    s.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); }
    });
  }

  advanceStoryByKey() {
    if (this.current === 'story') {
      const btn = this.overlay.querySelector('.screen');
      if (btn) {
        this.storyIdx++;
        if (this.storyIdx >= this.storyQueue.length) {
          Audio.stopVoice();
          this.hooks.onStoryDone();
        } else {
          this.renderStorySlide(true);
        }
      }
    }
  }

  // ---------- game over / victory ----------
  showGameOver(stats: RunStats, meta: MetaSave, newBest = false) {
    this.show('gameover');
    this.overlay.innerHTML = '';
    const s = this.el(`
      <div class="screen dim">
        <h2 class="screen-title" style="color:#ff8d7a">The Flame Gutters…</h2>
        <div class="subtitle">…but a match is never truly out.</div>
        ${newBest ? '<div class="subtitle" style="color:var(--amber);font-style:normal;letter-spacing:.2em">★ NEW BEST RUN ★</div>' : ''}
        <div class="panel">
          <div class="stats-grid">
            <span class="k">Reached</span><span class="v">${STAGES[stats.stageReached - 1]?.name ?? '—'}</span>
            <span class="k">Survived</span><span class="v">${fmtTime(stats.time)}</span>
            <span class="k">Level</span><span class="v">${stats.level}</span>
            <span class="k">Kills</span><span class="v">${stats.kills}</span>
            <span class="k">Damage dealt</span><span class="v">${Math.round(stats.dmgDealt)}</span>
            <span class="k">Damage taken</span><span class="v">${Math.round(stats.dmgTaken)}</span>
            <span class="k">Ember shards</span><span class="v" style="color:var(--amber)">◆ +${stats.shardsEarned}</span>
          </div>
          <button class="btn primary" id="g-retry">Strike Again</button>
          <button class="btn" id="g-menu">Back to Menu</button>
        </div>
      </div>`);
    this.overlay.appendChild(s);
    s.querySelector('#g-retry')!.addEventListener('click', () => { this.sfxClick(); this.hooks.onStartRun(); });
    s.querySelector('#g-menu')!.addEventListener('click', () => { this.sfxClick(); this.hooks.onQuitToMenu(); });
  }

  showVictory(stats: RunStats, meta: MetaSave, newBest = false) {
    this.show('victory');
    this.overlay.innerHTML = '';
    const s = this.el(`
      <div class="screen dim">
        <div class="title-logo"><span class="small">THE GREAT HEARTH IS LIT</span><span class="big">VICTORY</span></div>
        <div class="subtitle">The house is warm again — all because of one last spark.</div>
        ${newBest ? '<div class="subtitle" style="color:var(--amber);font-style:normal;letter-spacing:.2em">★ NEW BEST TIME ★</div>' : ''}
        <div class="panel">
          <div class="stats-grid">
            <span class="k">Run time</span><span class="v">${fmtTime(stats.time)}</span>
            <span class="k">Level</span><span class="v">${stats.level}</span>
            <span class="k">Kills</span><span class="v">${stats.kills}</span>
            <span class="k">Damage dealt</span><span class="v">${Math.round(stats.dmgDealt)}</span>
            <span class="k">Damage taken</span><span class="v">${Math.round(stats.dmgTaken)}</span>
            <span class="k">Ember shards</span><span class="v" style="color:var(--amber)">◆ +${stats.shardsEarned}</span>
            <span class="k">Victories</span><span class="v">${meta.wins}</span>
          </div>
          <button class="btn primary" id="v-again">Burn Again</button>
          <button class="btn" id="v-menu">Back to Menu</button>
        </div>
      </div>`);
    this.overlay.appendChild(s);
    s.querySelector('#v-again')!.addEventListener('click', () => { this.sfxClick(); this.hooks.onStartRun(); });
    s.querySelector('#v-menu')!.addEventListener('click', () => { this.sfxClick(); this.hooks.onQuitToMenu(); });
  }

  // ---------- banner ----------
  showBanner(text: string, sub = '', duration = 2800) {
    this.banner.innerHTML = `<div class="b-kicker">${sub}</div><div class="b-name">${text}</div>`;
    this.banner.classList.remove('hidden', 'show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    setTimeout(() => this.banner.classList.add('hidden'), duration);
  }

  showTutorial(isTouch: boolean) {
    const el = document.getElementById('tutorial-hint')!;
    el.innerHTML = isTouch
      ? 'Drag the <b>left side</b> of the screen to move — Novaki fights on his own.<br>Tap <b>DASH</b> to dodge through danger. Grab the blue sparks to level up!'
      : 'Move with <b>WASD</b> or <b>arrow keys</b> — Novaki fights on his own.<br><b>Space</b> to dash through danger. Grab the blue sparks to level up!';
    el.classList.remove('hidden');
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.classList.add('hidden'), 1100); }, 9000);
  }

  // ---------- HUD ----------
  updateHUD(g: Game) {
    this.hudTick++;
    const p = g.player;
    if (!p) return;
    const hpF = $('#hp-fill');
    hpF.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
    $('#hp-text').textContent = `${Math.ceil(Math.max(0, p.hp))} / ${Math.round(p.maxHp)}`;
    $('#xp-fill').style.width = `${Math.min(100, (p.xp / p.xpNext) * 100)}%`;
    $('#level-badge').textContent = `${p.level}`;
    $('#timer').textContent = fmtTime(g.time);
    $('#stage-label').textContent = `Stage ${g.stage.id} — ${g.stage.name}`;
    $('#kill-count').textContent = `${g.stats.kills} kills`;
    const dashF = $('#dash-fill');
    const dashP = p.dashCdT <= 0 ? 1 : 1 - p.dashCdT / 1.5;
    dashF.style.width = `${dashP * 100}%`;
    // weapon slots (rebuild rarely)
    if (this.hudTick % 20 === 1) {
      const wrap = $('#weapon-slots');
      const sig = p.weapons.map((w) => w.id + w.level + (w.evolved ? 'E' : '')).join('|') + '::' + p.passives.map((x) => x.id + x.level).join('|');
      if (wrap.dataset.sig !== sig) {
        wrap.dataset.sig = sig;
        wrap.innerHTML =
          p.weapons.map((w) => `<div class="wslot ${w.evolved ? 'evo' : ''}" title="${weaponName(w)}">${weaponIcon(w)}<span class="lv">${w.evolved ? 'EVO' : w.level}</span></div>`).join('') +
          p.passives.map((x) => {
            const def = PASSIVE_ICON(x.id);
            return `<div class="wslot" style="border-color:rgba(140,200,255,.35)" title="${x.id}">${def}<span class="lv">${x.level}</span></div>`;
          }).join('');
      }
    }
    // boss bar
    const bw = $('#boss-bar-wrap');
    if (g.boss && !g.boss.dead) {
      bw.classList.remove('hidden');
      $('#boss-name').textContent = `${g.stage.bossName} — ${g.stage.bossTitle}`;
      $('#boss-fill').style.width = `${Math.max(0, (g.boss.hp / g.boss.maxHp) * 100)}%`;
    } else {
      bw.classList.add('hidden');
    }
    // low hp warning
    $('#lowhp').classList.toggle('on', p.alive && p.hp / p.maxHp < 0.3);
  }
}

function PASSIVE_ICON(id: string): string {
  const map: Record<string, string> = {
    dry_wick: '🧨', long_fuse: '📏', quick_strike: '⚡', sturdy_stick: '🪵', fleet_foot: '👟',
    magnet_ash: '🧲', lucky_ember: '🍀', charred_core: '🛡️', warm_glow: '💡', second_spark: '✌️',
  };
  return map[id] ?? '❔';
}

export function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
