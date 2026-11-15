// The boons offered on level-up. Each one has an id, a name, a short description, a
// glyph drawn by the renderer, a cap on how many times it can stack, and an apply()
// that mutates the player's stats. The world picks three distinct ones the player
// has not maxed out yet.
import { shuffled } from './random.js';

export const BOONS = [
  {
    id: 'damage', name: 'Ember Rounds', glyph: 'flame',
    desc: '+25% bolt damage', max: 5,
    apply: (s) => { s.damageMul *= 1.25; },
  },
  {
    id: 'rapid', name: 'Quickening', glyph: 'bolt',
    desc: '+18% fire rate', max: 5,
    apply: (s) => { s.fireRateMul *= 1.18; },
  },
  {
    id: 'multishot', name: 'Twin Light', glyph: 'split',
    desc: '+1 bolt per shot', max: 3,
    apply: (s) => { s.shots += 1; },
  },
  {
    id: 'pierce', name: 'Starlance', glyph: 'arrow',
    desc: 'Bolts pierce +1 foe', max: 3,
    apply: (s) => { s.pierce += 1; },
  },
  {
    id: 'swift', name: 'Windstep', glyph: 'boot',
    desc: '+12% move speed', max: 4,
    apply: (s) => { s.speedMul *= 1.12; },
  },
  {
    id: 'heart', name: 'Lantern Heart', glyph: 'heart',
    desc: '+25 max HP, heal 25', max: 4,
    apply: (s, p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); },
  },
  {
    id: 'magnet', name: 'Shard Pull', glyph: 'magnet',
    desc: '+60% shard magnet', max: 3,
    apply: (s) => { s.magnetMul *= 1.6; },
  },
  {
    id: 'dash', name: 'Flicker Dash', glyph: 'dash',
    desc: 'Dash recharges 30% faster', max: 3,
    apply: (s) => { s.dashCdMul *= 0.7; },
  },
  {
    id: 'crit', name: 'Lucky Star', glyph: 'star',
    desc: '+12% critical chance (x2 damage)', max: 4,
    apply: (s) => { s.crit += 0.12; },
  },
  {
    id: 'regen', name: 'Dawn Mend', glyph: 'leaf',
    desc: 'Regenerate 1.2 HP per second', max: 3,
    apply: (s) => { s.regen += 1.2; },
  },
  {
    id: 'orbit', name: 'Guardian Wisp', glyph: 'orbit',
    desc: '+1 orbiting wisp that burns foes', max: 3,
    apply: (s) => { s.orbits += 1; },
  },
  {
    id: 'ward', name: 'Aegis Ward', glyph: 'shield',
    desc: 'Block one hit every 18s', max: 2,
    apply: (s) => { s.ward = true; s.wardCd = Math.min(s.wardCd || 18, 18); },
  },
];

/** A fresh stats object: multipliers the boons stack onto. */
export function baseStats() {
  return {
    damageMul: 1, fireRateMul: 1, shots: 1, pierce: 0,
    speedMul: 1, magnetMul: 1, dashCdMul: 1, crit: 0.05,
    regen: 0, orbits: 0, ward: false, wardCd: 0,
  };
}

/** Three distinct boons the player can still take, in seeded-random order. */
export function rollChoices(random, taken) {
  const pool = BOONS.filter((b) => (taken[b.id] || 0) < b.max);
  return shuffled(random, pool).slice(0, 3);
}
