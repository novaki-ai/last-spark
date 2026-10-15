// All game content definitions: weapons, passives, enemies, stages, bosses, meta shop.

export interface WeaponDef {
  id: string;
  name: string;
  icon: string;
  kind: 'weapon';
  maxLevel: number;
  evoNeeds?: string; // passive id required for evolution
  evoId?: string;
  evoName?: string;
  evoIcon?: string;
  desc: string;
  evoDesc?: string;
}

export interface PassiveDef {
  id: string;
  name: string;
  icon: string;
  kind: 'passive';
  maxLevel: number;
  desc: string;
  apply: (level: number) => Partial<StatBlock>;
}

export interface StatBlock {
  damageMul: number;
  areaMul: number;
  cooldownMul: number;
  speedMul: number;
  pickupMul: number;
  xpMul: number;
  critChance: number;
  armor: number;
  projectilesAdd: number;
  maxHpAdd: number;
  regen: number;
}

export const WEAPONS: WeaponDef[] = [
  {
    id: 'spark_toss', name: 'Spark Toss', icon: '✨', kind: 'weapon', maxLevel: 5,
    evoNeeds: 'dry_wick', evoId: 'wildfire', evoName: 'Wildfire', evoIcon: '🔥',
    desc: 'Hurls a spark bolt at the nearest foe.',
    evoDesc: 'EVOLVED: 3 bolts that ignite the ground beneath your foes.',
  },
  {
    id: 'ember_orbit', name: 'Ember Orbit', icon: '🌀', kind: 'weapon', maxLevel: 5,
    evoNeeds: 'long_fuse', evoId: 'crown_of_cinders', evoName: 'Crown of Cinders', evoIcon: '👑',
    desc: 'Embers circle you, scorching all they touch.',
    evoDesc: 'EVOLVED: a blazing crown of five embers that sets enemies alight.',
  },
  {
    id: 'matcharang', name: 'Matcharang', icon: '🪃', kind: 'weapon', maxLevel: 5,
    evoNeeds: 'quick_strike', evoId: 'crossfire', evoName: 'Crossfire', evoIcon: '⚔️',
    desc: 'A burning matchstick that flies out and returns, piercing foes.',
    evoDesc: 'EVOLVED: three matcharangs in a deadly spread, thrown far more often.',
  },
  {
    id: 'flame_lash', name: 'Flame Lash', icon: '🔥', kind: 'weapon', maxLevel: 5,
    evoNeeds: 'sturdy_stick', evoId: 'inferno_scythe', evoName: 'Inferno Scythe', evoIcon: '💥',
    desc: 'A heavy whip of flame cracks in your facing direction.',
    evoDesc: 'EVOLVED: a full-circle scythe of inferno that burns everything.',
  },
  {
    id: 'smoke_ring', name: 'Smoke Ring', icon: '💨', kind: 'weapon', maxLevel: 5,
    evoNeeds: 'magnet_ash', evoId: 'ash_vortex', evoName: 'Ash Vortex', evoIcon: '🌪️',
    desc: 'A choking ring of smoke blasts outward, knocking foes back.',
    evoDesc: 'EVOLVED: drags enemies inward, then leaves a lingering vortex of ash.',
  },
  {
    id: 'cinder_bolts', name: 'Cinder Bolts', icon: '☄️', kind: 'weapon', maxLevel: 5,
    evoNeeds: 'lucky_ember', evoId: 'tracer_rounds', evoName: 'Tracer Rounds', evoIcon: '🎯',
    desc: 'Rapid-fire cinder bolts seek the nearest enemies.',
    evoDesc: 'EVOLVED: homing tracers with a far deadlier critical sting.',
  },
  {
    id: 'firework_mortar', name: 'Firework Mortar', icon: '🎆', kind: 'weapon', maxLevel: 5,
    evoNeeds: 'second_spark', evoId: 'grand_finale', evoName: 'Grand Finale', evoIcon: '🎇',
    desc: 'Lobs a firework that bursts over the thickest knot of foes.',
    evoDesc: 'EVOLVED: a triple grand finale with enormous bursts.',
  },
  {
    id: 'sun_lens', name: 'Sun Lens', icon: '🔆', kind: 'weapon', maxLevel: 5,
    evoNeeds: 'charred_core', evoId: 'solar_flare', evoName: 'Solar Flare', evoIcon: '🌞',
    desc: 'Focuses a beam of scorching light through your lens.',
    evoDesc: 'EVOLVED: the beam sweeps a full circle around you, searing all.',
  },
  {
    id: 'kindling_swarm', name: 'Kindling Swarm', icon: '🐝', kind: 'weapon', maxLevel: 5,
    evoNeeds: 'fleet_foot', evoId: 'firefly_storm', evoName: 'Firefly Storm', evoIcon: '✨',
    desc: 'Releases a swarm of homing kindling sparks.',
    evoDesc: 'EVOLVED: seven fireflies that chain hungrily between foes.',
  },
];

export const PASSIVES: PassiveDef[] = [
  { id: 'dry_wick', name: 'Dry Wick', icon: '🧨', kind: 'passive', maxLevel: 5,
    desc: '+8% damage per level. Bone-dry and ready to burn.',
    apply: (l) => ({ damageMul: 1 + 0.08 * l }) },
  { id: 'long_fuse', name: 'Long Fuse', icon: '📏', kind: 'passive', maxLevel: 5,
    desc: '+8% attack area per level. Slow burn, wide reach.',
    apply: (l) => ({ areaMul: 1 + 0.08 * l }) },
  { id: 'quick_strike', name: 'Quick Strike', icon: '⚡', kind: 'passive', maxLevel: 5,
    desc: 'Attacks recharge 5% faster per level.',
    apply: (l) => ({ cooldownMul: Math.pow(0.95, l) }) },
  { id: 'sturdy_stick', name: 'Sturdy Stick', icon: '🪵', kind: 'passive', maxLevel: 5,
    desc: '+20 max HP and +0.4 HP/s regen per level.',
    apply: (l) => ({ maxHpAdd: 20 * l, regen: 0.4 * l }) },
  { id: 'fleet_foot', name: 'Fleet Foot', icon: '👟', kind: 'passive', maxLevel: 5,
    desc: '+6% move speed per level.',
    apply: (l) => ({ speedMul: 1 + 0.06 * l }) },
  { id: 'magnet_ash', name: 'Magnet Ash', icon: '🧲', kind: 'passive', maxLevel: 5,
    desc: '+25% pickup radius per level. Ash draws to ash.',
    apply: (l) => ({ pickupMul: 1 + 0.25 * l }) },
  { id: 'lucky_ember', name: 'Lucky Ember', icon: '🍀', kind: 'passive', maxLevel: 5,
    desc: '+5% critical chance per level. Crits deal double damage.',
    apply: (l) => ({ critChance: 0.05 * l }) },
  { id: 'charred_core', name: 'Charred Core', icon: '🛡️', kind: 'passive', maxLevel: 5,
    desc: '+1 armor per level. A heart already burnt feels nothing.',
    apply: (l) => ({ armor: l }) },
  { id: 'warm_glow', name: 'Warm Glow', icon: '💡', kind: 'passive', maxLevel: 5,
    desc: '+10% experience gained per level.',
    apply: (l) => ({ xpMul: 1 + 0.1 * l }) },
  { id: 'second_spark', name: 'Second Spark', icon: '✌️', kind: 'passive', maxLevel: 2,
    desc: '+1 projectile for multi-shot weapons.',
    apply: (l) => ({ projectilesAdd: l }) },
];

export const WEAPON_MAP = new Map(WEAPONS.map((w) => [w.id, w]));
export const PASSIVE_MAP = new Map(PASSIVES.map((p) => [p.id, p]));

// ---------------- Enemies ----------------
export type EnemyBehavior =
  | 'chaser' | 'splitter' | 'charger' | 'spitter' | 'zigzag' | 'flyer'
  | 'orbiter' | 'exploder' | 'dasher' | 'tank' | 'teleporter' | 'sniper' | 'shielded';

export interface EnemyDef {
  id: string;
  name: string;
  sprite: string;
  hp: number;
  speed: number;
  dmg: number;
  xp: number;
  radius: number;      // collision radius (world px)
  spriteH: number;     // sprite height world px
  behavior: EnemyBehavior;
  cost: number;        // spawn budget cost
  shardChance: number;
  shootDmg?: number;
}

export const ENEMIES: Record<string, EnemyDef> = {
  soot_imp:    { id: 'soot_imp', name: 'Soot Imp', sprite: 'enemy-soot-imp.png', hp: 14, speed: 78, dmg: 5, xp: 1, radius: 13, spriteH: 34, behavior: 'chaser', cost: 1, shardChance: 0.06 },
  drip_slime:  { id: 'drip_slime', name: 'Drip Slime', sprite: 'enemy-drip-slime.png', hp: 26, speed: 46, dmg: 8, xp: 2, radius: 16, spriteH: 38, behavior: 'splitter', cost: 2, shardChance: 0.08 },
  mini_slime:  { id: 'mini_slime', name: 'Droplet', sprite: 'enemy-drip-slime.png', hp: 8, speed: 68, dmg: 4, xp: 1, radius: 10, spriteH: 24, behavior: 'chaser', cost: 0, shardChance: 0.03 },
  moss_beetle: { id: 'moss_beetle', name: 'Moss Beetle', sprite: 'enemy-moss-beetle.png', hp: 36, speed: 42, dmg: 10, xp: 3, radius: 17, spriteH: 40, behavior: 'charger', cost: 3, shardChance: 0.1 },
  spore_shroom:{ id: 'spore_shroom', name: 'Spore Shroom', sprite: 'enemy-spore-shroom.png', hp: 26, speed: 26, dmg: 6, xp: 3, radius: 15, spriteH: 42, behavior: 'spitter', cost: 3, shardChance: 0.1, shootDmg: 8 },
  dust_bunny:  { id: 'dust_bunny', name: 'Dust Bunny', sprite: 'enemy-dust-bunny.png', hp: 12, speed: 132, dmg: 5, xp: 1, radius: 12, spriteH: 30, behavior: 'zigzag', cost: 1.5, shardChance: 0.05 },
  moth:        { id: 'moth', name: 'Mildew Moth', sprite: 'enemy-moth.png', hp: 18, speed: 92, dmg: 6, xp: 2, radius: 14, spriteH: 40, behavior: 'flyer', cost: 2, shardChance: 0.07, shootDmg: 7 },
  rust_scarab: { id: 'rust_scarab', name: 'Rust Scarab', sprite: 'enemy-rust-scarab.png', hp: 72, speed: 56, dmg: 12, xp: 4, radius: 16, spriteH: 38, behavior: 'orbiter', cost: 4, shardChance: 0.12 },
  bubble_wisp: { id: 'bubble_wisp', name: 'Bubble Wisp', sprite: 'enemy-bubble-wisp.png', hp: 30, speed: 66, dmg: 8, xp: 3, radius: 14, spriteH: 38, behavior: 'exploder', cost: 3, shardChance: 0.1, shootDmg: 7 },
  eel:         { id: 'eel', name: 'Current Eel', sprite: 'enemy-eel.png', hp: 42, speed: 150, dmg: 10, xp: 3, radius: 13, spriteH: 40, behavior: 'dasher', cost: 3, shardChance: 0.1 },
  clog_glob:   { id: 'clog_glob', name: 'Clog Glob', sprite: 'enemy-clog-glob.png', hp: 130, speed: 30, dmg: 14, xp: 5, radius: 20, spriteH: 48, behavior: 'tank', cost: 5, shardChance: 0.16 },
  rain_wraith: { id: 'rain_wraith', name: 'Rain Wraith', sprite: 'enemy-rain-wraith.png', hp: 92, speed: 72, dmg: 14, xp: 5, radius: 15, spriteH: 52, behavior: 'teleporter', cost: 5, shardChance: 0.14 },
  storm_kite:  { id: 'storm_kite', name: 'Storm Kite', sprite: 'enemy-storm-kite.png', hp: 60, speed: 82, dmg: 10, xp: 4, radius: 14, spriteH: 44, behavior: 'sniper', cost: 4, shardChance: 0.12, shootDmg: 11 },
  hail_husk:   { id: 'hail_husk', name: 'Hail Husk', sprite: 'enemy-hail-husk.png', hp: 170, speed: 44, dmg: 16, xp: 6, radius: 19, spriteH: 50, behavior: 'shielded', cost: 6, shardChance: 0.18 },
};

// ---------------- Stages ----------------
export interface StageDef {
  id: number;
  name: string;
  sub: string;
  bg: string;
  music: 'stage1' | 'stage2' | 'stage3';
  tint: string;          // full-screen color wash
  duration: number;      // seconds until boss
  bossId: string;
  bossName: string;
  bossTitle: string;
  // timeline of composition: [fromTime, [ [weight, enemyId], ... ], spawnRate(per sec) ]
  waves: [number, [number, string][], number][];
  fog: string;           // vignette color
}

export const STAGES: StageDef[] = [
  {
    id: 1, name: 'Matchwood Thicket', sub: 'The damp creeps between the roots',
    bg: 'bg-forest.png', music: 'stage1', tint: 'rgba(8,26,14,0.16)', duration: 270,
    bossId: 'mossmaw', bossName: 'MOSSMAW', bossTitle: 'Glutton of the Thicket',
    fog: 'rgba(4,14,8,0.42)',
    waves: [
      [0,   [[10, 'soot_imp']], 0.8],
      [45,  [[9, 'soot_imp'], [4, 'drip_slime']], 1.1],
      [100, [[7, 'soot_imp'], [5, 'drip_slime'], [4, 'dust_bunny']], 1.4],
      [160, [[5, 'soot_imp'], [5, 'drip_slime'], [4, 'dust_bunny'], [4, 'moss_beetle'], [3, 'spore_shroom']], 1.8],
      [220, [[3, 'dust_bunny'], [5, 'moss_beetle'], [5, 'spore_shroom'], [5, 'moth'], [3, 'drip_slime']], 2.3],
    ],
  },
  {
    id: 2, name: 'The Flooded Cellar', sub: 'Black water remembers everything',
    bg: 'bg-cellar.png', music: 'stage2', tint: 'rgba(6,16,32,0.24)', duration: 300,
    bossId: 'captain_clog', bossName: 'CAPTAIN CLOG', bossTitle: 'King of the Pipes',
    fog: 'rgba(3,8,18,0.46)',
    waves: [
      [0,   [[8, 'drip_slime'], [6, 'rust_scarab'], [4, 'bubble_wisp']], 2.2],
      [50,  [[6, 'drip_slime'], [6, 'rust_scarab'], [5, 'bubble_wisp'], [4, 'eel']], 2.7],
      [110, [[5, 'rust_scarab'], [5, 'bubble_wisp'], [5, 'eel'], [4, 'spore_shroom']], 3.2],
      [180, [[4, 'eel'], [5, 'clog_glob'], [5, 'bubble_wisp'], [4, 'rust_scarab']], 3.8],
      [240, [[5, 'clog_glob'], [5, 'eel'], [5, 'rust_scarab'], [4, 'moth']], 4.4],
    ],
  },
  {
    id: 3, name: 'The Stormworks', sub: 'Where the rain is made',
    bg: 'bg-storm.png', music: 'stage3', tint: 'rgba(14,10,34,0.26)', duration: 330,
    bossId: 'soakfather', bossName: 'THE SOAKFATHER', bossTitle: 'Drowner of Suns',
    fog: 'rgba(8,6,22,0.5)',
    waves: [
      [0,   [[7, 'rain_wraith'], [6, 'storm_kite'], [5, 'eel']], 3.4],
      [60,  [[6, 'rain_wraith'], [6, 'storm_kite'], [5, 'hail_husk'], [4, 'bubble_wisp']], 4.0],
      [130, [[5, 'rain_wraith'], [5, 'storm_kite'], [6, 'hail_husk'], [5, 'clog_glob']], 4.7],
      [200, [[6, 'hail_husk'], [6, 'rain_wraith'], [6, 'storm_kite'], [4, 'eel']], 5.4],
      [260, [[7, 'hail_husk'], [7, 'rain_wraith'], [6, 'storm_kite'], [5, 'clog_glob']], 6.2],
    ],
  },
];

// ---------------- Meta progression ----------------
export interface MetaItemDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  maxLevel: number;
  cost: (level: number) => number; // cost to buy next level (level = currently owned)
}

export const META_ITEMS: MetaItemDef[] = [
  { id: 'm_vigor', name: 'Oak Heart', icon: '❤️', desc: '+12 max HP per level, forever.', maxLevel: 5, cost: (l) => 40 + 35 * l },
  { id: 'm_might', name: 'Kiln-Fired', icon: '⚔️', desc: '+5% damage per level, forever.', maxLevel: 5, cost: (l) => 50 + 40 * l },
  { id: 'm_haste', name: 'Quick Splinter', icon: '💨', desc: '+4% move speed per level, forever.', maxLevel: 5, cost: (l) => 45 + 35 * l },
  { id: 'm_greed', name: 'Ember Appetite', icon: '💠', desc: '+8% experience per level, forever.', maxLevel: 5, cost: (l) => 45 + 35 * l },
  { id: 'm_pull', name: 'Lodestone Ash', icon: '🧲', desc: '+15% pickup radius per level, forever.', maxLevel: 5, cost: (l) => 35 + 30 * l },
  { id: 'm_armor', name: 'Bark Skin', icon: '🛡️', desc: '+1 armor per level, forever.', maxLevel: 3, cost: (l) => 70 + 50 * l },
  { id: 'm_revive', name: 'Second Chance', icon: '🕊️', desc: 'Once per run, rise again at 50% HP.', maxLevel: 1, cost: () => 220 },
  { id: 'm_wpn_rang', name: 'Matcharang Training', icon: '🪃', desc: 'Unlock Matcharang as a starting weapon.', maxLevel: 1, cost: () => 120 },
  { id: 'm_wpn_ring', name: 'Smoke Signals', icon: '💨', desc: 'Unlock Smoke Ring as a starting weapon.', maxLevel: 1, cost: () => 120 },
  { id: 'm_reroll', name: 'Fickle Flame', icon: '🎲', desc: 'One free reroll at every level-up.', maxLevel: 1, cost: () => 150 },
];

// ---------------- Meta save ----------------
export interface MetaSave {
  shards: number;
  items: Record<string, number>;
  runs: number;
  wins: number;
  bestStage: number;
  bestTime: number;
  startWeapon: string;
}

export const META_KEY = 'novaki_last_spark_meta_v1';
export const SETTINGS_KEY = 'novaki_last_spark_settings_v1';

export interface Settings {
  musicVol: number;
  sfxVol: number;
  screenShake: boolean;
  dmgNumbers: boolean;
}

export function loadMeta(): MetaSave {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const m = JSON.parse(raw);
      return {
        shards: m.shards ?? 0,
        items: m.items ?? {},
        runs: m.runs ?? 0,
        wins: m.wins ?? 0,
        bestStage: m.bestStage ?? 0,
        bestTime: m.bestTime ?? 0,
        startWeapon: m.startWeapon ?? 'spark_toss',
      };
    }
  } catch { /* corrupted save -> fresh */ }
  return { shards: 0, items: {}, runs: 0, wins: 0, bestStage: 0, bestTime: 0, startWeapon: 'spark_toss' };
}

export function saveMeta(m: MetaSave) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* */ }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        musicVol: s.musicVol ?? 0.7,
        sfxVol: s.sfxVol ?? 0.8,
        screenShake: s.screenShake ?? true,
        dmgNumbers: s.dmgNumbers ?? true,
      };
    }
  } catch { /* */ }
  return { musicVol: 0.7, sfxVol: 0.8, screenShake: true, dmgNumbers: true };
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* */ }
}
