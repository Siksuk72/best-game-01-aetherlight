// The game's rules and state, with no drawing and no browser in it: the lantern-keeper,
// the shadow kinds, waves, shards, level-ups and the boss fights. step() advances one
// fixed step and returns what happened as bit flags, so the caller can react without the
// world knowing about screens or sound. Nothing here allocates after createWorld returns
// except short-lived spawn and death events.
import {
  ENEMIES, FIELD, PLAYER, SCALING, SHARD, STEP, WAVES,
  spawnInterval, waveComposition, xpForLevel,
} from './config.js';
import { baseStats, rollChoices } from './upgrades.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_WIN = 4;
export const EVENT_LEVELUP = 8;
export const EVENT_WAVE = 16;

const TAU = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random, fx, sfx) {
  const state = {
    time: 0, wave: 0, phase: 'banner', phaseT: WAVES.bannerSeconds,
    bannerText: 'WAVE 1', bannerSub: 'The glooms are coming',
    score: 0, kills: 0, shotsFired: 0, shotsHit: 0, damageDealt: 0,
    over: false, won: false, levelUp: null, boss: null,
    player: null, enemies: [], bullets: [], ebullets: [], shards: [],
    spawnQueue: [], spawnTimer: 0, stats: null, taken: null,
  };

  function reset() {
    state.time = 0;
    state.wave = 0;
    state.phase = 'banner';
    state.phaseT = WAVES.bannerSeconds;
    state.bannerText = 'WAVE 1';
    state.bannerSub = 'The glooms are coming';
    state.score = 0;
    state.kills = 0;
    state.shotsFired = 0;
    state.shotsHit = 0;
    state.damageDealt = 0;
    state.over = false;
    state.won = false;
    state.levelUp = null;
    state.boss = null;
    state.enemies.length = 0;
    state.bullets.length = 0;
    state.ebullets.length = 0;
    state.shards.length = 0;
    state.spawnQueue.length = 0;
    state.spawnTimer = 0;
    state.stats = baseStats();
    state.taken = {};
    state.player = {
      x: FIELD.cx, y: FIELD.cy + 120, vx: 0, vy: 0,
      hp: PLAYER.maxHp, maxHp: PLAYER.maxHp,
      level: 1, xp: 0, xpNext: xpForLevel(1),
      aimX: FIELD.cx, aimY: FIELD.cy - 100, firing: false,
      fireCd: 0, dashCd: 0, dashTime: 0, dashX: 0, dashY: 1,
      invuln: 0, wardCd: 0, orbitAngle: 0, orbitTick: 0, flash: 0,
    };
  }

  function spawnPoint() {
    // A point on a random arena edge, kept away from the player so nothing appears on top of them.
    for (let tries = 0; tries < 8; tries += 1) {
      const edge = Math.floor(random() * 4);
      let x = 0;
      let y = 0;
      if (edge === 0) { x = random() * FIELD.width; y = -24; }
      else if (edge === 1) { x = FIELD.width + 24; y = random() * FIELD.height; }
      else if (edge === 2) { x = random() * FIELD.width; y = FIELD.height + 24; }
      else { x = -24; y = random() * FIELD.height; }
      const p = state.player;
      if (dist2(x, y, p.x, p.y) > 340 * 340) return { x, y };
    }
    return { x: -24, y: random() * FIELD.height };
  }

  function spawnEnemy(type) {
    const def = ENEMIES[type];
    const wave = Math.max(1, state.wave);
    const elite = wave >= 3 && random() < 0.08 && type !== 'herald' && type !== 'sovereign';
    const pos = spawnPoint();
    const enemy = {
      type, def, elite,
      x: pos.x, y: pos.y,
      hp: def.hp * (1 + SCALING.hpPerWave * (wave - 1)) * (elite ? SCALING.eliteHp : 1),
      maxHp: 0,
      speed: def.speed * (1 + SCALING.speedPerWave * (wave - 1)) * (elite ? SCALING.eliteSpeed : 1),
      radius: def.radius * (elite ? 1.25 : 1),
      damage: def.damage,
      touchCd: 0, shootCd: 1.5 + random() * 1.5, flash: 0, t: random() * TAU,
      phase: 0, summoned: false, enraged: 0,
    };
    enemy.maxHp = enemy.hp;
    state.enemies.push(enemy);
    if (type === 'herald' || type === 'sovereign') state.boss = enemy;
    return enemy;
  }

  function startWave(n) {
    state.wave = n;
    state.phase = 'fight';
    const comp = waveComposition(n);
    state.spawnQueue.length = 0;
    for (const entry of comp) {
      for (let i = 0; i < entry.count; i += 1) state.spawnQueue.push(entry.type);
    }
    // Shuffle the queue so kinds arrive mixed, bosses last.
    for (let i = state.spawnQueue.length - 1; i > 0; i -= 1) {
      if (state.spawnQueue[i] === 'herald' || state.spawnQueue[i] === 'sovereign') continue;
      const j = Math.floor(random() * (i + 1));
      const tmp = state.spawnQueue[i];
      state.spawnQueue[i] = state.spawnQueue[j];
      state.spawnQueue[j] = tmp;
    }
    state.spawnQueue.sort((a, b) => {
      const bossA = a === 'herald' || a === 'sovereign' ? 1 : 0;
      const bossB = b === 'herald' || b === 'sovereign' ? 1 : 0;
      return bossA - bossB;
    });
    state.spawnTimer = 0.4;
    if (n === 5 || n === 10) sfx.boss();
    else sfx.wave();
  }

  function dropShards(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * TAU;
      const d = 8 + random() * 26;
      state.shards.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: 0, vy: 0, t: random() * TAU, life: SHARD.life });
    }
  }

  function killEnemy(index) {
    const e = state.enemies[index];
    state.enemies.splice(index, 1);
    state.kills += 1;
    state.score += e.def.score * (e.elite ? 2 : 1);
    const shards = e.def.shards * (e.elite ? 2 : 1);
    dropShards(e.x, e.y, shards);
    fx.burst(e.x, e.y, e.def.color, e.type === 'brute' ? 22 : 12, 220, 0.6, 5);
    fx.ring(e.x, e.y, '#ffffff', 8);
    fx.addShake(e.type === 'brute' || e.type === 'herald' || e.type === 'sovereign' ? 7 : 2);
    sfx.kill();
    if (e.type === 'herald' || e.type === 'sovereign') {
      state.boss = null;
      fx.burst(e.x, e.y, '#ffd94d', 40, 380, 1.0, 7);
      fx.addShake(12);
    }
  }

  function damagePlayer(amount, fromX, fromY) {
    const p = state.player;
    if (p.invuln > 0 || p.dashTime > 0) return false;
    if (state.stats.ward && state.stats.wardCd <= 0) {
      state.stats.wardCd = 18;
      fx.ring(p.x, p.y, '#7ef0ff', 14);
      fx.floatText(p.x, p.y - 30, 'WARDED', '#7ef0ff');
      sfx.hit();
      return false;
    }
    p.hp -= amount;
    p.invuln = PLAYER.invulnAfterHit;
    p.flash = 0.25;
    const dx = p.x - fromX;
    const dy = p.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    p.x += (dx / len) * 14;
    p.y += (dy / len) * 14;
    fx.burst(p.x, p.y, '#ff6b81', 14, 240, 0.5, 5);
    fx.addShake(6);
    sfx.hurt();
    return true;
  }

  function fireBullet() {
    const p = state.player;
    const s = state.stats;
    const baseAngle = Math.atan2(p.aimY - p.y, p.aimX - p.x);
    for (let i = 0; i < s.shots; i += 1) {
      const spread = (i - (s.shots - 1) / 2) * 0.11;
      const a = baseAngle + spread;
      state.bullets.push({
        x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22,
        vx: Math.cos(a) * PLAYER.bulletSpeed, vy: Math.sin(a) * PLAYER.bulletSpeed,
        damage: PLAYER.bulletDamage * s.damageMul, pierce: s.pierce,
        radius: PLAYER.bulletRadius, life: 1.1, crit: false, hit: false,
      });
    }
    state.shotsFired += 1;
    sfx.shoot();
  }

  function fireEnemyOrb(e, speed, count, offsetAngle) {
    const p = state.player;
    const base = Math.atan2(p.y - e.y, p.x - e.x);
    for (let i = 0; i < count; i += 1) {
      const a = count === 1 ? base : offsetAngle + (i / count) * TAU;
      state.ebullets.push({
        x: e.x + Math.cos(a) * (e.radius + 6), y: e.y + Math.sin(a) * (e.radius + 6),
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        damage: e.def.damage, radius: 8, life: 5,
      });
    }
  }

  function chooseBoon(index) {
    const choices = state.levelUp;
    if (!choices || index < 0 || index >= choices.length) return;
    const boon = choices[index];
    boon.apply(state.stats, state.player);
    state.taken[boon.id] = (state.taken[boon.id] || 0) + 1;
    state.levelUp = null;
    sfx.click();
  }

  function gainXp(value) {
    const p = state.player;
    p.xp += value;
    if (p.xp < p.xpNext) return 0;
    p.xp -= p.xpNext;
    p.level += 1;
    p.xpNext = xpForLevel(p.level);
    state.levelUp = rollChoices(random, state.taken);
    sfx.levelup();
    fx.ring(p.x, p.y, '#ffd94d', 18);
    return EVENT_LEVELUP;
  }

  function updatePlayer(dt, input) {
    const p = state.player;
    const s = state.stats;
    p.fireCd -= dt;
    p.dashCd -= dt;
    p.invuln -= dt;
    p.flash -= dt;
    if (s.ward) s.wardCd -= dt;
    if (s.regen > 0) p.hp = Math.min(p.maxHp, p.hp + s.regen * dt);
    p.aimX = input.aimX;
    p.aimY = input.aimY;

    if (input.dash && p.dashCd <= 0 && p.dashTime <= 0) {
      const mx = input.mx;
      const my = input.my;
      const len = Math.hypot(mx, my);
      if (len > 0.01) { p.dashX = mx / len; p.dashY = my / len; }
      else { p.dashX = Math.cos(Math.atan2(p.aimY - p.y, p.aimX - p.x)); p.dashY = Math.sin(Math.atan2(p.aimY - p.y, p.aimX - p.x)); }
      p.dashTime = PLAYER.dashTime;
      p.dashCd = PLAYER.dashCooldown * s.dashCdMul;
      fx.burst(p.x, p.y, '#7ef0ff', 10, 180, 0.35, 4);
      sfx.dash();
    }

    let speed = PLAYER.speed * s.speedMul;
    if (p.dashTime > 0) {
      p.dashTime -= dt;
      p.vx = p.dashX * PLAYER.dashSpeed;
      p.vy = p.dashY * PLAYER.dashSpeed;
    } else {
      p.vx = input.mx * speed;
      p.vy = input.my * speed;
    }
    p.x = Math.min(FIELD.width - 24, Math.max(24, p.x + p.vx * dt));
    p.y = Math.min(FIELD.height - 24, Math.max(24, p.y + p.vy * dt));

    if (input.firing && p.fireCd <= 0) {
      p.fireCd = 1 / (PLAYER.fireRate * s.fireRateMul);
      fireBullet();
    }

    // Orbiting wisps burn whatever they touch.
    if (s.orbits > 0) {
      p.orbitAngle += dt * 2.6;
      p.orbitTick -= dt;
      if (p.orbitTick <= 0) {
        p.orbitTick = 0.35;
        for (let w = 0; w < s.orbits; w += 1) {
          const a = p.orbitAngle + (w / s.orbits) * TAU;
          const wx = p.x + Math.cos(a) * 58;
          const wy = p.y + Math.sin(a) * 58;
          for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
            const e = state.enemies[i];
            const rr = e.radius + 18;
            if (dist2(wx, wy, e.x, e.y) < rr * rr) {
              e.hp -= 14 * s.damageMul;
              e.flash = 0.12;
              if (e.hp <= 0) killEnemy(i);
            }
          }
        }
      }
    }
  }

  function updateEnemies(dt) {
    const p = state.player;
    for (let i = 0; i < state.enemies.length; i += 1) {
      const e = state.enemies[i];
      e.t += dt;
      e.touchCd -= dt;
      e.shootCd -= dt;
      e.flash -= dt;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      let mx = ux;
      let my = uy;
      if (e.type === 'wraith') {
        const wob = Math.sin(e.t * 5) * 0.7;
        mx = ux + -uy * wob;
        my = uy + ux * wob;
        const ml = Math.hypot(mx, my) || 1;
        mx /= ml;
        my /= ml;
      } else if (e.type === 'spitter') {
        if (d > 290) { /* approach */ }
        else if (d < 210) { mx = -ux; my = -uy; }
        else { mx = -uy; my = ux; }
        if (e.shootCd <= 0 && d < 560) {
          e.shootCd = 2.3;
          fireEnemyOrb(e, 230, 1, 0);
          sfx.hit();
        }
      } else if (e.type === 'herald' || e.type === 'sovereign') {
        const boss = e.type === 'sovereign';
        if (!e.summoned && e.hp < e.maxHp * 0.5) {
          e.summoned = true;
          for (let k = 0; k < (boss ? 3 : 2); k += 1) spawnEnemy(boss ? 'wraith' : 'mote');
          fx.ring(e.x, e.y, e.def.color, 16);
        }
        if (boss && e.enraged === 0 && e.hp < e.maxHp * 0.66) { e.enraged = 1; e.speed *= 1.25; }
        if (boss && e.enraged === 1 && e.hp < e.maxHp * 0.33) { e.enraged = 2; e.speed *= 1.2; }
        e.phase += dt;
        const burstEvery = boss ? 3.6 : 4.2;
        if (e.phase >= burstEvery) {
          e.phase = 0;
          fireEnemyOrb(e, 210, boss ? 14 : 10, random() * TAU);
          fx.ring(e.x, e.y, e.def.color, 12);
          sfx.boss();
        }
      }
      e.x += mx * e.speed * dt;
      e.y += my * e.speed * dt;
      e.x = Math.min(FIELD.width + 40, Math.max(-40, e.x));
      e.y = Math.min(FIELD.height + 40, Math.max(-40, e.y));

      // Touch damage.
      const rr = e.radius + PLAYER.radius - 2;
      if (dist2(e.x, e.y, p.x, p.y) < rr * rr) {
        if (damagePlayer(e.damage, e.x, e.y)) e.touchCd = 0.7;
      }
    }
    // Gentle separation so the swarm does not stack into one blob.
    for (let i = 0; i < state.enemies.length; i += 1) {
      for (let j = i + 1; j < state.enemies.length; j += 1) {
        const a = state.enemies[i];
        const b = state.enemies[j];
        const rr = a.radius + b.radius;
        const d2 = dist2(a.x, a.y, b.x, b.y);
        if (d2 < rr * rr && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (rr - d) / 2;
          const nx = (b.x - a.x) / d;
          const ny = (b.y - a.y) / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  function updateBullets(dt) {
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      let dead = b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20;
      if (!dead) {
        for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
          const e = state.enemies[j];
          const rr = e.radius + b.radius;
          if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
            const crit = random() < state.stats.crit;
            const dmg = b.damage * (crit ? 2 : 1);
            e.hp -= dmg;
            e.flash = 0.1;
            state.damageDealt += dmg;
            if (!b.hit) { b.hit = true; state.shotsHit += 1; }
            fx.burst(b.x, b.y, '#ffd94d', 4, 140, 0.25, 3);
            if (crit) fx.floatText(e.x, e.y - e.radius - 6, String(Math.round(dmg)), '#ffd94d');
            if (e.hp <= 0) killEnemy(j);
            if (b.pierce > 0) { b.pierce -= 1; }
            else { dead = true; }
            break;
          }
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
    for (let i = state.ebullets.length - 1; i >= 0; i -= 1) {
      const b = state.ebullets[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const p = state.player;
      const rr = b.radius + PLAYER.radius - 4;
      let dead = b.life <= 0 || b.x < -30 || b.x > FIELD.width + 30 || b.y < -30 || b.y > FIELD.height + 30;
      if (!dead && dist2(b.x, b.y, p.x, p.y) < rr * rr) {
        damagePlayer(b.damage, b.x - b.vx * 0.1, b.y - b.vy * 0.1);
        dead = true;
      }
      if (dead) state.ebullets.splice(i, 1);
    }
  }

  function updateShards(dt) {
    const p = state.player;
    const magnetR = PLAYER.magnet * state.stats.magnetMul;
    let events = 0;
    for (let i = state.shards.length - 1; i >= 0; i -= 1) {
      const s = state.shards[i];
      s.life -= dt;
      s.t += dt;
      if (s.life <= 0) { state.shards.splice(i, 1); continue; }
      const d2 = dist2(s.x, s.y, p.x, p.y);
      if (d2 < magnetR * magnetR) {
        const d = Math.sqrt(d2) || 1;
        const pull = SHARD.magnetSpeed * (1.6 - d / magnetR);
        s.x += ((p.x - s.x) / d) * pull * dt;
        s.y += ((p.y - s.y) / d) * pull * dt;
      }
      if (d2 < PLAYER.pickupRadius * PLAYER.pickupRadius) {
        state.shards.splice(i, 1);
        fx.burst(s.x, s.y, '#7ef0ff', 3, 90, 0.25, 3);
        sfx.shard();
        events |= gainXp(SHARD.value);
      }
    }
    return events;
  }

  function step(dt, input) {
    if (state.over || state.won) {
      fx.step(dt);
      return state.won ? EVENT_WIN : EVENT_OVER;
    }
    fx.step(dt);
    state.time += dt;
    if (state.levelUp) {
      if (input && input.choose >= 0) chooseBoon(input.choose);
      return 0;
    }
    let events = 0;
    if (state.phase === 'banner') {
      state.phaseT -= dt;
      if (state.phaseT <= 0) startWave(state.wave + 1);
      return 0;
    }
    // Fight phase.
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        state.spawnTimer = spawnInterval(Math.max(1, state.wave));
        spawnEnemy(state.spawnQueue.shift());
      }
    }
    updatePlayer(dt, input);
    updateEnemies(dt);
    updateBullets(dt);
    events |= updateShards(dt);
    if (state.player.hp <= 0) {
      state.over = true;
      fx.burst(state.player.x, state.player.y, '#ffe9a8', 40, 320, 1.0, 6);
      fx.addShake(14);
      sfx.defeat();
      return EVENT_OVER;
    }
    if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
      state.score += 50 + state.wave * 25;
      if (state.wave >= WAVES.count) {
        state.won = true;
        sfx.victory();
        return EVENT_WIN;
      }
      state.phase = 'banner';
      state.phaseT = WAVES.bannerSeconds;
      state.bannerText = `WAVE ${state.wave + 1}`;
      state.bannerSub = state.wave + 1 === 5 ? 'Something huge stirs in the dark' : state.wave + 1 === 10 ? 'The Gloom Sovereign comes' : 'The glooms are coming';
      events |= EVENT_WAVE;
    }
    return events;
  }

  reset();
  return { state, reset, step, chooseBoon };
}
