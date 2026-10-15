// Boot, main loop, screen orchestration, and the NOVAKI_QA interface.
import { Game, type Offer } from './game/game';
import { UI } from './ui/screens';
import { Input } from './core/input';
import { Audio } from './core/audio';
import { loadMeta, saveMeta, loadSettings, STAGES } from './game/data';
import type { BossId } from './game/enemies';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
const ui = new UI();
const input = new Input();

const meta = loadMeta();
const settings = loadSettings();
game.meta = meta;
game.settings = { screenShake: settings.screenShake, dmgNumbers: settings.dmgNumbers };
game.fx.dmgNumbersEnabled = settings.dmgNumbers;
Audio.musicVolume = settings.musicVol;
Audio.sfxVolume = settings.sfxVol;

let mode: 'menu' | 'story-intro' | 'run' | 'story-transition' | 'story-ending' | 'over' = 'menu';

// ---------------- hooks ----------------
game.hooks = {
  onLevelUp(offers) {
    ui.showLevelUp(offers, game.rerollsLeft);
  },
  onGameOver(stats) {
    meta.runs += 0; // counted at start
    meta.bestStage = Math.max(meta.bestStage, stats.stageReached);
    saveMeta(meta);
    mode = 'over';
    ui.showGameOver(stats, meta);
  },
  onVictory(stats) {
    meta.wins += 1;
    meta.bestStage = 3;
    meta.bestTime = meta.bestTime === 0 ? stats.time : Math.min(meta.bestTime, stats.time);
    saveMeta(meta);
    mode = 'story-ending';
    ui.showStory([
      { img: 'story-ending.png', text: 'And with one small, stubborn flame, Novaki lit the Great Hearth.', voice: 'ending1' },
      { img: 'story-ending.png', text: 'The Damp hissed, and shrank, and was gone. The house was warm again. All of it — because of one… last… spark.', voice: 'ending2' },
    ], false);
  },
  onStageTransition(stageNumber) {
    mode = 'story-transition';
    const postVoice = stageNumber === 2 ? 'post1' : 'post2';
    const stageVoice = stageNumber === 2 ? 'stage2' : 'stage3';
    const bgImg = stageNumber === 2 ? 'bg-cellar.png' : 'bg-storm.png';
    const nextStage = STAGES[stageNumber - 1];
    ui.showStory([
      { text: stageNumber === 2 ? 'The thicket falls silent. Below, the water waits.' : 'The pipes run dry. Above, the storm rages on.', voice: postVoice },
      { img: bgImg, text: stageNumber === 2 ? 'Below the floorboards, the pipes weep black water. Something down there has been drinking the dark for years.' : 'High above the house, the Soakfather turns his great wheel, and the rain never ends. Go. End it.', voice: stageVoice },
    ]);
    // stash which stage we're entering
    pendingStage = stageNumber;
  },
  onBossStart(name, title) {
    ui.showBanner(name, title, 3200);
  },
  onBanner(text, sub) {
    ui.showBanner(text, sub);
  },
};

let pendingStage = 2;

ui.init({
  onStartRun() {
    // from menu/gameover/victory: show intro story, then run
    meta.runs += 1;
    saveMeta(meta);
    mode = 'story-intro';
    ui.showStory([
      { img: 'story-intro.png', text: 'In the cupboard under the stairs, in a box of one hundred matches, only one remained unstruck. His name… was Novaki.', voice: 'intro1' },
      { img: 'keyart-menu.png', text: 'But the Damp is rising. It has drowned the cellar, swallowed the garden of crumbs, and now it comes for the last warm thing in the house.', voice: 'intro2' },
      { img: 'novaki-idle.png', text: 'Novaki does not run from the wet. Novaki <b style="color:var(--amber)">burns</b>.', voice: 'intro3' },
    ]);
  },
  onResume() {
    ui.show('playing');
  },
  onQuitToMenu() {
    game.running = false;
    mode = 'menu';
    Audio.stopVoice();
    Audio.playMusic('menu');
    ui.show('menu');
  },
  onChooseOffer(o: Offer) {
    game.chooseOffer(o);
    if (!game.levelupOpen) ui.show('playing');
  },
  onStoryDone() {
    if (mode === 'story-intro') {
      beginRun(Math.floor(Math.random() * 2 ** 31));
    } else if (mode === 'story-transition') {
      game.advanceStage();
      Audio.playMusic(game.stage.music);
      ui.showBanner(game.stage.name.toUpperCase(), game.stage.sub, 3000);
      ui.show('playing');
      mode = 'run';
    } else if (mode === 'story-ending') {
      mode = 'over';
      ui.showVictory({ ...game.stats, time: game.time, level: game.player.level }, meta);
    }
  },
  getSettings: () => settings,
  getMeta: () => meta,
});
ui.setGame(game);

function beginRun(seed: number) {
  game.startRun(seed);
  mode = 'run';
  ui.show('playing');
  Audio.stopVoice();
  Audio.playMusic(game.stage.music);
  Audio.playVoice('novaki-start');
  ui.showBanner(game.stage.name.toUpperCase(), game.stage.sub, 3000);
}

// ---------------- input wiring ----------------
input.setGestureHandler(() => {
  Audio.unlock();
});
input.attachTouchUI(
  document.getElementById('joystick')!,
  document.getElementById('joystick-knob')!,
  document.getElementById('btn-dash')!,
  document.getElementById('touch-ui')!,
);

window.addEventListener('resize', () => game.resize());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ui.current === 'playing') ui.showPause();
});

// ---------------- main loop ----------------
const STEP = 1 / 60;
let acc = 0;
let last = performance.now();

function frame(now: number) {
  requestAnimationFrame(frame);
  const rawDt = Math.min(0.25, (now - last) / 1000);
  last = now;
  input.update();

  // global keys
  if (input.consumePause()) {
    if (ui.current === 'playing') ui.showPause();
    else if (ui.current === 'paused') ui.show('playing');
  }
  if (ui.current === 'story' && input.consumeConfirm()) {
    ui.advanceStoryByKey();
  } else {
    input.consumeConfirm();
  }
  const dash = input.consumeDash();

  if (ui.current === 'playing' || (ui.current === 'levelup' && false)) {
    acc += rawDt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      game.update(STEP, input.moveX, input.moveY, dash && steps === 0);
      acc -= STEP;
      steps++;
    }
    if (steps === 5) acc = 0;
  } else {
    acc = 0;
  }

  game.render();
  if (ui.current === 'playing' || ui.current === 'paused' || ui.current === 'levelup') {
    ui.updateHUD(game);
  }
}

// ---------------- boot ----------------
async function boot() {
  ui.show('loading');
  game.resize();
  await game.loadAssets();
  ui.show('menu');
  Audio.playMusic('menu'); // queued until first user gesture unlocks audio
  requestAnimationFrame(frame);
}
void boot();

// ---------------- QA interface ----------------
interface QAState {
  screen: string;
  stage: number;
  time: number;
  player: { x: number; y: number; hp: number; maxHp: number; level: number; xp: number };
  enemies: number;
  bossActive: boolean;
  upgrades: string[];
  meta: { currency: number; unlocks: string[]; runs: number; wins: number };
}

(window as unknown as { NOVAKI_QA: object }).NOVAKI_QA = {
  state(): QAState {
    const p = game.player;
    const upgrades: string[] = [];
    if (p) {
      for (const w of p.weapons) {
        upgrades.push(w.id);
        if (w.evolved) upgrades.push(w.id + '_evo');
      }
      for (const x of p.passives) upgrades.push(x.id);
    }
    return {
      screen: ui.current,
      stage: game.stage?.id ?? 1,
      time: game.time,
      player: p ? {
        x: Math.round(p.x), y: Math.round(p.y),
        hp: Math.round(p.hp), maxHp: Math.round(p.maxHp),
        level: p.level, xp: Math.round(p.xp),
      } : { x: 0, y: 0, hp: 0, maxHp: 0, level: 0, xp: 0 },
      enemies: game.enemies.filter((e) => !e.dead).length,
      bossActive: !!game.boss && !game.boss.dead,
      upgrades,
      meta: {
        currency: meta.shards,
        unlocks: Object.keys(meta.items).filter((k) => (meta.items[k] ?? 0) > 0),
        runs: meta.runs,
        wins: meta.wins,
      },
    };
  },
  start(options: { seed?: number } = {}) {
    Audio.unlock();
    const seed = typeof options.seed === 'number' ? options.seed : Math.floor(Math.random() * 2 ** 31);
    meta.runs += 1;
    saveMeta(meta);
    beginRun(seed);
  },
  setInvincible(on: boolean) {
    game.invincible = !!on;
  },
  addXp(amount: number) {
    game.grantXp(Number(amount) || 0);
  },
  chooseUpgrade(index: number) {
    if (ui.current !== 'levelup') return;
    const offers = (ui as unknown as { levelupOffers: Offer[] }).levelupOffers;
    const i = Math.max(0, Math.min(offers.length - 1, index | 0));
    const o = offers[i];
    if (o) {
      game.chooseOffer(o);
      if (!game.levelupOpen) ui.show('playing');
    }
  },
  skipTo(stage: number, point: 'start' | 'boss') {
    if (!game.running) beginRun(Math.floor(Math.random() * 2 ** 31));
    const idx = Math.max(0, Math.min(2, (stage | 0) - 1));
    game.stageIdx = idx;
    game.stage = STAGES[idx];
    game.stageTime = 0;
    game.enemies.length = 0;
    game.eshots.length = 0;
    game.pickups.length = 0;
    game.pendingBeams.length = 0;
    game.fx.clear();
    game.boss = null;
    game.bossSpawned = false;
    game.stats.stageReached = game.stage.id;
    Audio.playMusic(game.stage.music);
    if (point === 'boss') {
      game.stageTime = game.stage.duration;
      game.bossSpawned = true;
      game.spawnBoss(game.stage.bossId as BossId);
    }
    ui.show('playing');
  },
  killBoss() {
    if (game.boss && !game.boss.dead) {
      game.damageEnemy(game.boss, game.boss.hp + 100000, false, { pure: true, silent: true });
    }
  },
  spawnEnemies(count: number) {
    const comp = game.stage.waves[game.stage.waves.length - 1][1];
    for (let i = 0; i < count; i++) {
      const id = game.rng.weighted(comp);
      const a = Math.random() * Math.PI * 2;
      const d = 260 + Math.random() * 380;
      game.spawnEnemyAt(id, game.player.x + Math.cos(a) * d, game.player.y + Math.sin(a) * d, false);
    }
  },
};
