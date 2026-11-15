// All drawing: the arena, the lantern, every creature, the HUD and every screen.
// The renderer only reads state; it never changes a rule. The logical field is
// 1280x720 and is scaled to fit the window, letterboxed.
import { ENEMIES, FIELD, PALETTE, FONT, PLAYER, WAVES } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_LEVELUP = 2;
export const SCREEN_PAUSED = 3;
export const SCREEN_OVER = 4;
export const SCREEN_VICTORY = 5;

const STARS = (() => {
  const r = createRandom(99);
  const list = [];
  for (let i = 0; i < 110; i += 1) {
    list.push({ x: r() * FIELD.width, y: r() * FIELD.height, s: 0.6 + r() * 1.8, tw: r() * Math.PI * 2 });
  }
  return list;
})();

/** The three level-up cards, in logical coordinates, for click hit-testing. */
export const CARD_RECTS = [
  { x: 170, y: 250, w: 280, h: 220 },
  { x: 500, y: 250, w: 280, h: 220 },
  { x: 830, y: 250, w: 280, h: 220 },
];

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }

  function glowCircle(x, y, r, color, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  function drawBackground(time) {
    const g = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    g.addColorStop(0, PALETTE.skyTop);
    g.addColorStop(1, PALETTE.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.fillStyle = '#ffffff';
    for (const s of STARS) {
      ctx.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(time * 1.4 + s.tw));
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    // Arena ring and floor glow.
    ctx.strokeStyle = PALETTE.arenaRing;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.8;
    circle(FIELD.cx, FIELD.cy, 330);
    ctx.stroke();
    ctx.globalAlpha = 1;
    glowCircle(FIELD.cx, FIELD.cy, 340, '#4a2f8f', 0.16);
    // Faint rune ticks around the ring.
    ctx.strokeStyle = '#5b4a9e';
    ctx.lineWidth = 2;
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      const x1 = FIELD.cx + Math.cos(a) * 322;
      const y1 = FIELD.cy + Math.sin(a) * 322;
      const x2 = FIELD.cx + Math.cos(a) * 330;
      const y2 = FIELD.cy + Math.sin(a) * 330;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  function drawLantern(time) {
    const pulse = 0.85 + 0.15 * Math.sin(time * 2.2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowCircle(FIELD.cx, FIELD.cy, 150 * pulse, '#ff9d3c', 0.28);
    glowCircle(FIELD.cx, FIELD.cy, 70, '#ffd97a', 0.5);
    ctx.restore();
    // The lantern itself: a little brass cage holding the last flame.
    ctx.fillStyle = '#3a2b12';
    ctx.fillRect(FIELD.cx - 26, FIELD.cy - 30, 52, 60);
    ctx.fillStyle = '#6b4d1f';
    ctx.fillRect(FIELD.cx - 30, FIELD.cy - 36, 60, 8);
    ctx.fillRect(FIELD.cx - 30, FIELD.cy + 28, 60, 8);
    ctx.fillStyle = PALETTE.lanternCore;
    const flick = 1 + 0.08 * Math.sin(time * 7) + 0.05 * Math.sin(time * 13);
    circle(FIELD.cx, FIELD.cy, 15 * flick);
    ctx.fill();
    ctx.fillStyle = '#fff6d8';
    circle(FIELD.cx, FIELD.cy, 7 * flick);
    ctx.fill();
  }

  function drawShard(s, time) {
    const bob = Math.sin(time * 3 + s.t * 6) * 3;
    const blink = 0.6 + 0.4 * Math.sin(time * 5 + s.t * 9);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowCircle(s.x, s.y + bob, 14, '#7ef0ff', 0.35 * blink);
    ctx.restore();
    ctx.save();
    ctx.translate(s.x, s.y + bob);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PALETTE.shard;
    ctx.globalAlpha = blink;
    ctx.fillRect(-4.5, -4.5, 9, 9);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawEnemy(e, time) {
    const flash = e.flash > 0;
    // Bosses flash a tinted pink, not white: a full-white boss reads as a blank moon.
    const col = flash ? (e.type === 'herald' || e.type === 'sovereign' ? '#ffb3c0' : '#ffffff') : e.def.color;
    ctx.save();
    if (e.elite) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glowCircle(e.x, e.y, e.radius + 22, '#ffd94d', 0.3);
      ctx.restore();
    }
    ctx.translate(e.x, e.y);
    const wob = Math.sin(e.t * 4) * 0.06;
    if (e.type === 'mote') {
      ctx.fillStyle = col;
      circle(0, 0, e.radius);
      ctx.fill();
      ctx.fillStyle = '#1a0b2e';
      circle(-4, -3, 3.2);
      ctx.fill();
      circle(4, -3, 3.2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      circle(-3, -4, 1.2);
      ctx.fill();
      circle(5, -4, 1.2);
      ctx.fill();
    } else if (e.type === 'crawler') {
      ctx.rotate(wob);
      ctx.fillStyle = col;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        const px = Math.cos(a) * e.radius;
        const py = Math.sin(a) * e.radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffe9a8';
      circle(-5, -4, 3);
      ctx.fill();
      circle(5, -4, 3);
      ctx.fill();
    } else if (e.type === 'wraith') {
      ctx.rotate(Math.PI / 4 + Math.sin(e.t * 3) * 0.2);
      ctx.fillStyle = col;
      const r = e.radius;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.8, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.rotate(-Math.PI / 4 - Math.sin(e.t * 3) * 0.2);
      ctx.fillStyle = '#fff';
      circle(-4, -2, 2.4);
      ctx.fill();
      circle(4, -2, 2.4);
      ctx.fill();
    } else if (e.type === 'spitter') {
      ctx.fillStyle = col;
      circle(0, 0, e.radius);
      ctx.fill();
      ctx.fillStyle = '#12351f';
      circle(0, 4, e.radius * 0.45);
      ctx.fill();
      ctx.fillStyle = '#a9f5c3';
      circle(-6, -6, 3.4);
      ctx.fill();
      circle(6, -6, 3.4);
      ctx.fill();
      if (e.shootCd < 0.5) {
        ctx.strokeStyle = '#a9f5c3';
        ctx.lineWidth = 2;
        circle(0, 0, e.radius + 6 + (0.5 - e.shootCd) * 10);
        ctx.stroke();
      }
    } else if (e.type === 'brute') {
      ctx.fillStyle = col;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2 + e.t * 0.4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * e.radius * 0.7, Math.sin(a) * e.radius * 0.7);
        ctx.lineTo(Math.cos(a) * e.radius * 1.25, Math.sin(a) * e.radius * 1.25);
        ctx.lineTo(Math.cos(a + 0.35) * e.radius * 0.7, Math.sin(a + 0.35) * e.radius * 0.7);
        ctx.closePath();
        ctx.fill();
      }
      circle(0, 0, e.radius * 0.85);
      ctx.fill();
      ctx.fillStyle = '#ffd94d';
      circle(-8, -6, 4);
      ctx.fill();
      circle(8, -6, 4);
      ctx.fill();
      ctx.fillStyle = '#4d0f0f';
      ctx.fillRect(-10, 8, 20, 4);
    } else {
      // Bosses: a crowned shadow with a burning core.
      ctx.fillStyle = col;
      circle(0, 0, e.radius);
      ctx.fill();
      ctx.fillStyle = '#ffd94d';
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * 16 - 8, -e.radius + 6);
        ctx.lineTo(i * 16, -e.radius - 16);
        ctx.lineTo(i * 16 + 8, -e.radius + 6);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#fff';
      circle(-14, -8, 5);
      ctx.fill();
      circle(14, -8, 5);
      ctx.fill();
      ctx.fillStyle = '#1a0b2e';
      circle(-14, -8, 2.4);
      ctx.fill();
      circle(14, -8, 2.4);
      ctx.fill();
    }
    ctx.restore();
    // Health bar for hurt or big foes.
    if (e.hp < e.maxHp && (e.elite || e.maxHp > 60 || e.type === 'herald' || e.type === 'sovereign')) {
      const w = e.radius * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 14, w, 5);
      ctx.fillStyle = e.elite ? '#ffd94d' : '#ff6b81';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 14, w * Math.max(0, e.hp / e.maxHp), 5);
    }
  }

  function drawPlayer(p, stats, time) {
    const blink = p.invuln > 0 && Math.floor(time * 16) % 2 === 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowCircle(p.x, p.y, 64, '#ffd97a', 0.4);
    ctx.restore();
    if (p.dashTime > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#7ef0ff';
      circle(p.x - p.dashX * 30, p.y - p.dashY * 30, 12);
      ctx.fill();
      ctx.restore();
    }
    if (blink) return;
    // Orbiting wisps.
    if (stats.orbits > 0) {
      for (let w = 0; w < stats.orbits; w += 1) {
        const a = p.orbitAngle + (w / stats.orbits) * Math.PI * 2;
        const wx = p.x + Math.cos(a) * 58;
        const wy = p.y + Math.sin(a) * 58;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        glowCircle(wx, wy, 18, '#ffd94d', 0.5);
        ctx.restore();
        ctx.fillStyle = '#ffe9a8';
        circle(wx, wy, 6);
        ctx.fill();
      }
    }
    // The keeper: a little flame wisp with a bright core.
    const flick = 1 + 0.1 * Math.sin(time * 9);
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 20 * flick);
    ctx.quadraticCurveTo(p.x + 13, p.y - 2, p.x + 9, p.y + 10);
    ctx.quadraticCurveTo(p.x, p.y + 16, p.x - 9, p.y + 10);
    ctx.quadraticCurveTo(p.x - 13, p.y - 2, p.x, p.y - 20 * flick);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.playerCore;
    circle(p.x, p.y + 2, 7);
    ctx.fill();
    ctx.fillStyle = '#1a0b2e';
    circle(p.x - 3, p.y, 1.8);
    ctx.fill();
    circle(p.x + 3, p.y, 1.8);
    ctx.fill();
    if (stats.ward && stats.wardCd <= 0) {
      ctx.strokeStyle = '#7ef0ff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(time * 4);
      circle(p.x, p.y, 26);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawBullets(state) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of state.bullets) {
      glowCircle(b.x, b.y, 16, '#ffd94d', 0.55);
      ctx.fillStyle = '#fff3c4';
      circle(b.x, b.y, 5);
      ctx.fill();
    }
    for (const b of state.ebullets) {
      glowCircle(b.x, b.y, 18, '#e05cd6', 0.5);
      ctx.fillStyle = '#f2a6ec';
      circle(b.x, b.y, 6);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles(fx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of fx.parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      circle(p.x, p.y, p.size * (0.5 + 0.5 * (p.life / p.maxLife)));
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = `700 15px ${FONT}`;
    for (const t of fx.texts) {
      ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function bar(x, y, w, h, frac, fill, back) {
    ctx.fillStyle = back;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function drawHud(state, best) {
    const p = state.player;
    // XP bar across the top.
    bar(0, 0, FIELD.width, 8, p.xp / p.xpNext, PALETTE.xp, '#1c1440');
    // Top-left: HP and level.
    ctx.textAlign = 'left';
    ctx.font = `700 20px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(`HP  ${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`, 20, 44);
    bar(20, 54, 240, 14, p.hp / p.maxHp, PALETTE.hp, PALETTE.hpBack);
    ctx.font = `700 18px ${FONT}`;
    ctx.fillStyle = PALETTE.xp;
    ctx.fillText(`LEVEL ${p.level}`, 20, 96);
    // Top-centre: wave, score, timer.
    ctx.textAlign = 'center';
    ctx.font = `800 26px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(`WAVE ${Math.max(1, state.wave)} / ${WAVES.count}`, FIELD.cx, 40);
    ctx.font = `700 18px ${FONT}`;
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(`SCORE ${state.score}`, FIELD.cx, 66);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 15px ${FONT}`;
    const mins = Math.floor(state.time / 60);
    const secs = Math.floor(state.time % 60);
    ctx.fillText(`${mins}:${String(secs).padStart(2, '0')}   KILLS ${state.kills}   BEST ${Math.max(best, state.score)}`, FIELD.cx, 88);
    // Bottom-left: dash cooldown.
    const dashFrac = 1 - Math.max(0, p.dashCd) / (PLAYER.dashCooldown * state.stats.dashCdMul);
    ctx.textAlign = 'left';
    ctx.font = `700 15px ${FONT}`;
    ctx.fillStyle = dashFrac >= 1 ? '#7ef0ff' : PALETTE.muted;
    ctx.fillText(dashFrac >= 1 ? 'DASH READY  [SHIFT]' : 'DASH CHARGING', 20, FIELD.height - 40);
    bar(20, FIELD.height - 32, 120, 8, dashFrac, '#7ef0ff', '#1c1440');
    // Bottom-right: controls hint.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 14px ${FONT}`;
    ctx.fillText('WASD move · Mouse aim · Hold click to fire · SHIFT dash · P pause · M mute', FIELD.width - 20, FIELD.height - 20);
    // Boss bar.
    if (state.boss) {
      const b = state.boss;
      const name = b.type === 'sovereign' ? 'THE GLOOM SOVEREIGN' : 'THE GLOOM HERALD';
      ctx.textAlign = 'center';
      ctx.font = `800 18px ${FONT}`;
      ctx.fillStyle = '#ff9fb0';
      ctx.fillText(name, FIELD.cx, 122);
      bar(FIELD.cx - 220, 130, 440, 12, b.hp / b.maxHp, '#ff5e78', '#3a1420');
    }
    // Wave banner.
    if (state.phase === 'banner') {
      const a = Math.min(1, state.phaseT > WAVES.bannerSeconds - 0.4 ? (WAVES.bannerSeconds - state.phaseT) / 0.4 : state.phaseT / 0.6);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.textAlign = 'center';
      ctx.font = `900 54px ${FONT}`;
      ctx.fillStyle = PALETTE.text;
      ctx.shadowColor = '#7b5cff';
      ctx.shadowBlur = 24;
      ctx.fillText(state.bannerText, FIELD.cx, 300);
      ctx.shadowBlur = 0;
      ctx.font = `600 20px ${FONT}`;
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText(state.bannerSub, FIELD.cx, 336);
      ctx.restore();
    }
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  function drawGlyph(glyph, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    const s = size;
    if (glyph === 'flame') {
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.8, -s * 0.1, s * 0.5, s * 0.5);
      ctx.quadraticCurveTo(0, s * 0.9, -s * 0.5, s * 0.5);
      ctx.quadraticCurveTo(-s * 0.8, -s * 0.1, 0, -s);
      ctx.fill();
    } else if (glyph === 'bolt') {
      ctx.beginPath();
      ctx.moveTo(s * 0.2, -s);
      ctx.lineTo(-s * 0.5, s * 0.1);
      ctx.lineTo(-s * 0.05, s * 0.1);
      ctx.lineTo(-s * 0.2, s);
      ctx.lineTo(s * 0.5, -s * 0.1);
      ctx.lineTo(s * 0.05, -s * 0.1);
      ctx.closePath();
      ctx.fill();
    } else if (glyph === 'split') {
      ctx.beginPath();
      ctx.moveTo(0, s * 0.8);
      ctx.lineTo(0, -s * 0.4);
      ctx.moveTo(0, -s * 0.4);
      ctx.lineTo(-s * 0.6, -s);
      ctx.moveTo(0, -s * 0.4);
      ctx.lineTo(s * 0.6, -s);
      ctx.stroke();
    } else if (glyph === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(-s, s * 0.6);
      ctx.lineTo(s * 0.6, -s);
      ctx.moveTo(s * 0.6, -s);
      ctx.lineTo(s * 0.6, -s * 0.2);
      ctx.moveTo(s * 0.6, -s);
      ctx.lineTo(-s * 0.2, -s);
      ctx.stroke();
    } else if (glyph === 'boot') {
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, -s);
      ctx.lineTo(-s * 0.5, s * 0.4);
      ctx.lineTo(s * 0.7, s * 0.4);
      ctx.lineTo(s * 0.7, s * 0.8);
      ctx.lineTo(-s * 0.8, s * 0.8);
      ctx.lineTo(-s * 0.8, -s);
      ctx.closePath();
      ctx.stroke();
    } else if (glyph === 'heart') {
      ctx.beginPath();
      ctx.moveTo(0, s * 0.8);
      ctx.quadraticCurveTo(-s * 1.1, -s * 0.1, -s * 0.5, -s * 0.6);
      ctx.quadraticCurveTo(0, -s * 0.9, 0, -s * 0.4);
      ctx.quadraticCurveTo(0, -s * 0.9, s * 0.5, -s * 0.6);
      ctx.quadraticCurveTo(s * 1.1, -s * 0.1, 0, s * 0.8);
      ctx.fill();
    } else if (glyph === 'magnet') {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.8, Math.PI, 0);
      ctx.lineTo(s * 0.8, s * 0.5);
      ctx.lineTo(s * 0.4, s * 0.5);
      ctx.lineTo(s * 0.4, 0);
      ctx.arc(0, 0, s * 0.4, 0, Math.PI, true);
      ctx.lineTo(-s * 0.4, s * 0.5);
      ctx.lineTo(-s * 0.8, s * 0.5);
      ctx.closePath();
      ctx.stroke();
    } else if (glyph === 'dash') {
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.8 + i * s * 0.5, -s * 0.5 + i * s * 0.5);
        ctx.lineTo(s * 0.2 + i * s * 0.3, -s * 0.5 + i * s * 0.5);
        ctx.stroke();
      }
    } else if (glyph === 'star') {
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? s : s * 0.45;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    } else if (glyph === 'leaf') {
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.9, -s * 0.2, 0, s);
      ctx.quadraticCurveTo(-s * 0.9, -s * 0.2, 0, -s);
      ctx.fill();
    } else if (glyph === 'orbit') {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s * 0.8, 0, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (glyph === 'shield') {
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.8, -s * 0.5);
      ctx.lineTo(s * 0.8, s * 0.2);
      ctx.quadraticCurveTo(s * 0.8, s * 0.8, 0, s);
      ctx.quadraticCurveTo(-s * 0.8, s * 0.8, -s * 0.8, s * 0.2);
      ctx.lineTo(-s * 0.8, -s * 0.5);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTitle(state, best) {
    ctx.fillStyle = 'rgba(8, 6, 24, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = '#ff9d3c';
    ctx.shadowBlur = 34;
    ctx.fillStyle = '#ffe9a8';
    ctx.font = `900 84px ${FONT}`;
    ctx.fillText('AETHERLIGHT', FIELD.cx, 210);
    ctx.restore();
    ctx.fillStyle = '#ffd94d';
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText('— The Last Lantern —', FIELD.cx, 252);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 20px ${FONT}`;
    ctx.fillText('The glooms are coming for the last flame. Keep it burning.', FIELD.cx, 296);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 17px ${FONT}`;
    ctx.fillText('Defend the lantern through 10 waves. Slay the Gloom Sovereign and dawn returns.', FIELD.cx, 326);
    panel(FIELD.cx - 300, 360, 600, 132);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText('WASD / Arrows — move        Mouse — aim', FIELD.cx, 392);
    ctx.fillText('Hold Click — fire light bolts        SHIFT — dash', FIELD.cx, 422);
    ctx.fillText('Collect starshards · Level up · Choose boons · P pause · M mute', FIELD.cx, 452);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `800 24px ${FONT}`;
    ctx.fillText(best > 0 ? `BEST SCORE  ${best}    ·    Press SPACE or click to begin` : 'Press SPACE or click to begin', FIELD.cx, 540);
  }

  function drawLevelUp(state) {
    ctx.fillStyle = 'rgba(8, 6, 24, 0.62)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd94d';
    ctx.font = `900 44px ${FONT}`;
    ctx.fillText(`LEVEL ${state.player.level} — CHOOSE A BOON`, FIELD.cx, 200);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText('Click a card, or press 1, 2 or 3', FIELD.cx, 228);
    state.levelUp.forEach((boon, i) => {
      const r = CARD_RECTS[i];
      panel(r.x, r.y, r.w, r.h);
      drawGlyph(boon.glyph, r.x + r.w / 2, r.y + 52, 26, '#ffd94d');
      ctx.fillStyle = PALETTE.text;
      ctx.font = `800 22px ${FONT}`;
      ctx.fillText(boon.name, r.x + r.w / 2, r.y + 118);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `600 16px ${FONT}`;
      ctx.fillText(boon.desc, r.x + r.w / 2, r.y + 148);
      const owned = state.taken[boon.id] || 0;
      ctx.fillStyle = '#7ef0ff';
      ctx.font = `700 14px ${FONT}`;
      ctx.fillText(owned > 0 ? `Owned ×${owned}   ·   press ${i + 1}` : `press ${i + 1}`, r.x + r.w / 2, r.y + 186);
    });
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(8, 6, 24, 0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `900 52px ${FONT}`;
    ctx.fillText('PAUSED', FIELD.cx, 330);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 19px ${FONT}`;
    ctx.fillText('Press P or SPACE to keep fighting · R to restart', FIELD.cx, 372);
  }

  function drawStats(state, best, lines) {
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 22px ${FONT}`;
    let y = 400;
    for (const line of lines) {
      ctx.fillText(line, FIELD.cx, y);
      y += 34;
    }
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `800 24px ${FONT}`;
    ctx.fillText(`BEST SCORE  ${Math.max(best, state.score)}`, FIELD.cx, y + 8);
  }

  function drawOver(state, best) {
    ctx.fillStyle = 'rgba(16, 4, 12, 0.66)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = '#ff5e78';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ff8fa3';
    ctx.font = `900 64px ${FONT}`;
    ctx.fillText('THE LIGHT FADES', FIELD.cx, 250);
    ctx.restore();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 20px ${FONT}`;
    ctx.fillText(`The glooms take the lantern on wave ${Math.max(1, state.wave)}.`, FIELD.cx, 292);
    const mins = Math.floor(state.time / 60);
    const secs = Math.floor(state.time % 60);
    drawStats(state, best, [
      `SCORE  ${state.score}      LEVEL  ${state.player.level}      KILLS  ${state.kills}`,
      `SURVIVED  ${mins}:${String(secs).padStart(2, '0')}      SHOTS  ${state.shotsFired}      ACCURACY  ${state.shotsFired ? Math.round((state.shotsHit / state.shotsFired) * 100) : 0}%`,
    ]);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `800 24px ${FONT}`;
    ctx.fillText('Press R or click to try again', FIELD.cx, 540);
  }

  function drawVictory(state, best) {
    ctx.fillStyle = 'rgba(10, 14, 6, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = '#ffd94d';
    ctx.shadowBlur = 34;
    ctx.fillStyle = '#ffe9a8';
    ctx.font = `900 72px ${FONT}`;
    ctx.fillText('DAWN RETURNS', FIELD.cx, 250);
    ctx.restore();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 21px ${FONT}`;
    ctx.fillText('The Gloom Sovereign is gone. The lantern burns bright, and morning comes.', FIELD.cx, 296);
    const mins = Math.floor(state.time / 60);
    const secs = Math.floor(state.time % 60);
    drawStats(state, best, [
      `SCORE  ${state.score}      LEVEL  ${state.player.level}      KILLS  ${state.kills}`,
      `CLEARED IN  ${mins}:${String(secs).padStart(2, '0')}      SHOTS  ${state.shotsFired}      ACCURACY  ${state.shotsFired ? Math.round((state.shotsHit / state.shotsFired) * 100) : 0}%`,
    ]);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `800 24px ${FONT}`;
    ctx.fillText('Press R or click to play again', FIELD.cx, 540);
  }

  function draw(state, screen, best, fx, time) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05030f';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    const offX = (window.innerWidth - FIELD.width * (scale / dpr)) / 2;
    const offY = (window.innerHeight - FIELD.height * (scale / dpr)) / 2;
    ctx.setTransform(scale, 0, 0, scale, offX * dpr, offY * dpr);
    const shake = fx.offset();
    ctx.translate(shake.x, shake.y);

    drawBackground(time);
    drawLantern(time);
    for (const s of state.shards) drawShard(s, time);
    for (const e of state.enemies) drawEnemy(e, time);
    if (!state.over) drawPlayer(state.player, state.stats, time);
    drawBullets(state);
    drawParticles(fx);

    if (screen === SCREEN_PLAY || screen === SCREEN_LEVELUP || screen === SCREEN_PAUSED) drawHud(state, best);
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_LEVELUP) drawLevelUp(state);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, best);
    else if (screen === SCREEN_VICTORY) drawVictory(state, best);

    // Hurt vignette.
    if (state.player && state.player.flash > 0) {
      ctx.fillStyle = `rgba(255, 40, 70, ${Math.min(0.28, state.player.flash)})`;
      ctx.fillRect(-20, -20, FIELD.width + 40, FIELD.height + 40);
    }
  }

  return { draw, drawGlyph };
}
