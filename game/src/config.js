// AETHERLIGHT — The Last Lantern. Every tuning number and colour in one place.
// The arena is a fixed 1280x720 logical field; the renderer scales it to the window,
// so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720, cx: 640, cy: 360, lanternR: 46 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Seconds between waves, and the wave that ends the game in victory. */
export const WAVES = { count: 10, bannerSeconds: 3, bossWaves: [5, 10] };

export const PLAYER = {
  radius: 16,
  speed: 305,
  maxHp: 100,
  fireRate: 4.6, // shots per second
  bulletSpeed: 660,
  bulletDamage: 14,
  bulletRadius: 6,
  magnet: 120,
  dashSpeed: 980,
  dashTime: 0.18,
  dashCooldown: 2.4,
  invulnAfterHit: 0.9,
  pickupRadius: 34,
};

/** Enemy kinds. speed in px/s, hp base (grows with wave), damage on touch, score, shards. */
export const ENEMIES = {
  mote:    { hp: 12,  speed: 178, radius: 12, damage: 8,  score: 10, shards: 1, color: '#b678f2' },
  crawler: { hp: 26,  speed: 112, radius: 17, damage: 10, score: 15, shards: 1, color: '#8a5cf6' },
  wraith:  { hp: 20,  speed: 238, radius: 13, damage: 12, score: 25, shards: 2, color: '#e05cd6' },
  spitter: { hp: 34,  speed: 96,  radius: 16, damage: 8,  score: 30, shards: 2, color: '#6ee7a0' },
  brute:   { hp: 110, speed: 68,  radius: 30, damage: 18, score: 50, shards: 5, color: '#f26d6d' },
  herald:  { hp: 550, speed: 82,  radius: 44, damage: 22, score: 400, shards: 18, color: '#ff9f43' },
  sovereign: { hp: 1300, speed: 74, radius: 58, damage: 26, score: 1500, shards: 40, color: '#ff5e78' },
};

/** Enemy hp and speed grow a little every wave, so the pressure never plateaus. */
export const SCALING = { hpPerWave: 0.07, speedPerWave: 0.02, eliteHp: 2.2, eliteSpeed: 1.12 };

/** How many of each kind a wave fields, before the wave's extra motes. */
export function waveComposition(n) {
  const list = [];
  const add = (type, count) => { if (count > 0) list.push({ type, count }); };
  add('mote', 4 + n * 2);
  add('crawler', 3 + n);
  if (n >= 2) add('wraith', 1 + Math.floor(n / 2));
  if (n >= 3) add('spitter', 1 + Math.floor((n - 1) / 2));
  if (n >= 4) add('brute', Math.floor((n - 2) / 2));
  if (n === 5) add('herald', 1);
  if (n === 10) add('sovereign', 1);
  return list;
}

/** Seconds between spawns inside a wave (faster as waves climb). */
export function spawnInterval(n) {
  return Math.max(0.22, 0.7 - n * 0.04);
}

export const SHARD = { value: 1, magnetSpeed: 520, life: 25 };

/** XP needed to reach the next level (level is 1-based, before the level-up). */
export function xpForLevel(level) {
  return 8 + level * 6;
}

export const PALETTE = {
  skyTop: '#0b1026',
  skyBottom: '#1a1033',
  arenaRing: '#3b2d6b',
  floorGlow: '#241a4d',
  lanternCore: '#ffd97a',
  lanternGlow: '#ff9d3c',
  player: '#ffe9a8',
  playerCore: '#fff6d8',
  bullet: '#ffd94d',
  shard: '#7ef0ff',
  text: '#f4efff',
  muted: '#a99fd0',
  panel: 'rgba(16, 12, 38, 0.82)',
  panelEdge: '#6b5aa8',
  hp: '#ff6b81',
  hpBack: '#3a2440',
  xp: '#7ef0ff',
  danger: '#ff5e78',
  gold: '#ffd94d',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'aetherlight.best';

/** Fixed seeds for the four screenshot scenes, so every render matches. */
export const SHOT_SEEDS = { start: 11, play: 23, boss: 37, victory: 41 };
