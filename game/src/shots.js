// The screenshot scenes behind ?shot=start|play|boss|victory. Each one plays the real
// rules forward from a fresh world for a fixed amount of simulated time, steered by a
// simple autopilot (kite away from the nearest glooms, chase starshards, always fire
// at the closest foe, dash when cornered, take the best boon on offer), so each frame
// is what a real game looks like and the same seed always gives the same frame.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 42;
const BOSS_LIMIT_SECONDS = 420;
const END_LIMIT_SECONDS = 600;

/** Boons the autopilot prefers, best first. */
const PICK_ORDER = ['multishot', 'damage', 'rapid', 'pierce', 'heart', 'crit', 'orbit', 'swift', 'magnet', 'regen', 'dash', 'ward'];

function nearestEnemy(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = e; }
  }
  return { enemy: best, dist: Math.sqrt(bestD) };
}

function nearestShard(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const s of state.shards) {
    const dx = s.x - p.x;
    const dy = s.y - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = s; }
  }
  return { shard: best, dist: Math.sqrt(bestD) };
}

/** The autopilot's input for one step: move, aim, fire, dash, or a boon choice.
 * `centerPull` (0 = off) draws the keeper back toward the lantern's ring, which keeps
 * a staged scene composed instead of hugging a corner. */
export function autopilot(state, centerPull = 0, centerRadius = 300) {
  const p = state.player;
  if (state.levelUp) {
    let pick = 0;
    let bestRank = Infinity;
    state.levelUp.forEach((boon, i) => {
      const rank = PICK_ORDER.indexOf(boon.id);
      if (rank >= 0 && rank < bestRank) { bestRank = rank; pick = i; }
    });
    return { mx: 0, my: 0, aimX: p.x, aimY: p.y - 100, firing: false, dash: false, choose: pick };
  }
  let mx = 0;
  let my = 0;
  const { enemy, dist } = nearestEnemy(state);
  // Flee everything close, harder the closer it is.
  for (const e of state.enemies) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 240) {
      const w = (240 - d) / 240;
      mx += (dx / d) * w * 2.4;
      my += (dy / d) * w * 2.4;
    }
  }
  // Sidestep incoming gloom orbs.
  let orbNear = false;
  for (const b of state.ebullets) {
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 130) {
      orbNear = true;
      const w = (130 - d) / 130;
      // Step perpendicular to the orb's flight, away from its path.
      const bl = Math.hypot(b.vx, b.vy) || 1;
      mx += (-b.vy / bl) * w * 2.0;
      my += (b.vx / bl) * w * 2.0;
    }
  }
  // Chase the nearest shard when the way is reasonably clear.
  const { shard, dist: shardDist } = nearestShard(state);
  if (shard && shardDist < 260 && (!enemy || dist > 170)) {
    mx += ((shard.x - p.x) / shardDist) * 0.8;
    my += ((shard.y - p.y) / shardDist) * 0.8;
  }
  // Stay off the walls.
  const margin = 130;
  if (p.x < margin) mx += (margin - p.x) / margin;
  if (p.x > FIELD.width - margin) mx -= (p.x - (FIELD.width - margin)) / margin;
  if (p.y < margin) my += (margin - p.y) / margin;
  if (p.y > FIELD.height - margin) my -= (p.y - (FIELD.height - margin)) / margin;
  // Drift back toward the lantern's ring when staging a composed scene.
  if (centerPull > 0) {
    const dc = Math.hypot(p.x - FIELD.cx, p.y - FIELD.cy) || 1;
    if (dc > centerRadius) {
      mx += ((FIELD.cx - p.x) / dc) * centerPull;
      my += ((FIELD.cy - p.y) / dc) * centerPull;
    }
  }
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  // Aim with a lead: foes run at the player, so shoot where they will be.
  let aimX = p.x;
  let aimY = p.y - 100;
  if (enemy) {
    const ex = enemy.x - p.x;
    const ey = enemy.y - p.y;
    const ed = Math.hypot(ex, ey) || 1;
    const flight = ed / 660;
    aimX = enemy.x + (ex / ed) * enemy.speed * flight;
    aimY = enemy.y + (ey / ed) * enemy.speed * flight;
  }
  const dash = (enemy !== null && dist < 85 && p.dashCd <= 0) || (orbNear && p.dashCd <= 0 && dist < 130);
  return { mx, my, aimX, aimY, firing: enemy !== null, dash, choose: -1 };
}

/**
 * Set `world` to the named scene (start, play, boss or victory; any other name is
 * start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'boss' && name !== 'victory') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { mx: 0, my: 0, aimX: 640, aimY: 200, firing: false, dash: false, choose: -1 });
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const limit = name === 'victory' ? END_LIMIT_SECONDS : name === 'boss' ? BOSS_LIMIT_SECONDS : 75;
  // The boss and play scenes steer the keeper around the lantern so the frame stays composed.
  const pull = name === 'boss' ? 1.6 : name === 'play' ? 0.7 : 0;
  const radius = name === 'boss' ? 260 : 300;
  let events = 0;
  for (let i = 0; i < limit / STEP; i += 1) {
    events = world.step(STEP, autopilot(world.state, pull, radius));
    // The play shot wants a busy, well-composed frame: a crowd mid-fight, keeper near the action.
    if (name === 'play' && world.state.time >= 35 && world.state.phase === 'fight' && world.state.enemies.length >= 9) {
      const p = world.state.player;
      if (Math.hypot(p.x - FIELD.cx, p.y - FIELD.cy) < 320) break;
    }
    if (name === 'play' && world.state.time >= 80) break;
    if (name === 'boss') {
      const boss = world.state.boss;
      if (boss && boss.type === 'sovereign') {
        // Frame the boss near the middle, not half off the edge.
        const dc = Math.hypot(boss.x - FIELD.cx, boss.y - FIELD.cy);
        if (boss.hp < boss.maxHp * 0.85 && dc < 420) break;
        if (boss.hp < boss.maxHp * 0.55) break;
      }
    }
    if (events & (EVENT_OVER | EVENT_WIN)) break;
  }
  if (world.state.won) return { screen: SCREEN_VICTORY, best: world.state.score };
  if (world.state.over) return { screen: SCREEN_OVER, best: world.state.score };
  return { screen: SCREEN_PLAY, best: world.state.score };
}
