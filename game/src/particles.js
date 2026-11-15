// Particles, floating score text and screen shake: all feedback, no rules. The world
// feeds it events (bursts, hits, pickups) and it keeps the transient visuals.
export function createParticles(random = Math.random) {
  const parts = [];
  const texts = [];
  let shake = 0;

  function burst(x, y, color, count, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const s = speed * (0.3 + random() * 0.7);
      parts.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * (0.6 + random() * 0.4), maxLife: life,
        size: size * (0.6 + random() * 0.8), color,
      });
    }
  }

  function ring(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2;
      parts.push({ x, y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, life: 0.45, maxLife: 0.45, size: 5, color });
    }
  }

  function trail(x, y, color) {
    parts.push({ x, y, vx: 0, vy: 0, life: 0.3, maxLife: 0.3, size: 7, color });
  }

  function floatText(x, y, text, color) {
    texts.push({ x, y, text, color, life: 0.9, maxLife: 0.9 });
  }

  function addShake(amount) {
    shake = Math.min(16, shake + amount);
  }

  function step(dt) {
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
    for (let i = texts.length - 1; i >= 0; i -= 1) {
      const t = texts[i];
      t.life -= dt;
      t.y -= 42 * dt;
      if (t.life <= 0) texts.splice(i, 1);
    }
    shake = Math.max(0, shake - dt * 34);
  }

  function offset() {
    if (shake <= 0.1) return { x: 0, y: 0 };
    return {
      x: (random() * 2 - 1) * shake,
      y: (random() * 2 - 1) * shake,
    };
  }

  return { parts, texts, burst, ring, trail, floatText, addShake, step, offset };
}
