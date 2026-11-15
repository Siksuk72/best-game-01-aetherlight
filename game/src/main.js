// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between six screens: title, play, level-up, paused, game over
// and victory.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|boss|victory (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { BEST_KEY, SHOT_SEEDS, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_OVER, EVENT_WIN } from './world.js';
import { createParticles } from './particles.js';
import { createAudio } from './audio.js';
import {
  ACTION_CONFIRM, ACTION_DASH, ACTION_LEVEL_1, ACTION_LEVEL_2, ACTION_LEVEL_3,
  ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput,
} from './input.js';
import {
  CARD_RECTS, SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY,
  SCREEN_TITLE, SCREEN_VICTORY, createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam)
  ? seedParam
  : (SHOT_SEEDS[shot] ?? Math.floor(Math.random() * 4294967296));

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const fx = createParticles(createRandom(seed ^ 0x9e3779b9));
const audio = createAudio();
// The world's sound hooks: no-ops until the first gesture unlocks audio.
const sfx = {
  shoot: () => audio.sfx.shoot(),
  hit: () => audio.sfx.hit(),
  kill: () => audio.sfx.kill(),
  shard: () => audio.sfx.shard(),
  hurt: () => audio.sfx.hurt(),
  dash: () => audio.sfx.dash(),
  levelup: () => audio.sfx.levelup(),
  wave: () => audio.sfx.wave(),
  boss: () => audio.sfx.boss(),
  victory: () => audio.sfx.victory(),
  defeat: () => audio.sfx.defeat(),
  click: () => audio.sfx.click(),
};
const world = createWorld(createRandom(seed), fx, sfx);
const renderer = createRenderer(canvas);
// Read-only handle for debugging and play-testing (no writes, no network).
window.__aether = { get state() { return world.state; } };

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, fx, world.state.time);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let simTime = 0;
  let dashQueued = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    audio.startMusic();
    world.reset();
    accumulator = 0;
    simTime = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Defend the lantern through 10 waves.');
  }

  function endGame(won) {
    screen = won ? SCREEN_VICTORY : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won
      ? `Victory. Dawn returns. Score ${world.state.score}.`
      : `Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function cardAt(x, y) {
    for (let i = 0; i < CARD_RECTS.length; i += 1) {
      const r = CARD_RECTS[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
    return -1;
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame();
      return;
    }
    if (screen === SCREEN_OVER || screen === SCREEN_VICTORY) {
      if (actions & (ACTION_CONFIRM | ACTION_RESTART)) startGame();
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) { screen = SCREEN_PLAY; announce('Playing.'); }
      else if (actions & ACTION_RESTART) startGame();
      return;
    }
    if (screen === SCREEN_LEVELUP) {
      let pick = -1;
      if (actions & ACTION_LEVEL_1) pick = 0;
      else if (actions & ACTION_LEVEL_2) pick = 1;
      else if (actions & ACTION_LEVEL_3) pick = 2;
      else if (input.takeClick()) pick = cardAt(input.mouse.x, input.mouse.y);
      if (pick >= 0 && world.state.levelUp && pick < world.state.levelUp.length) {
        world.step(STEP, { mx: 0, my: 0, aimX: 0, aimY: 0, firing: false, dash: false, choose: pick });
        if (!world.state.levelUp) {
          screen = SCREEN_PLAY;
          announce('Boon chosen. Keep fighting.');
        }
      }
      return;
    }
    // SCREEN_PLAY
    if (actions & ACTION_DASH) dashQueued = true;
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & ACTION_RESTART) {
      startGame();
    }
  }

  function stepWorld() {
    const dir = input.direction();
    const inputState = {
      mx: dir.x, my: dir.y,
      aimX: input.mouse.x, aimY: input.mouse.y,
      firing: input.mouse.down, dash: dashQueued, choose: -1,
    };
    dashQueued = false;
    const events = world.step(STEP, inputState);
    simTime += STEP;
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_OVER) endGame(false);
    else if (world.state.levelUp) {
      screen = SCREEN_LEVELUP;
      announce(`Level ${world.state.player.level}. Choose a boon.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE) {
      // The title lives over a slowly simmering arena.
      while (accumulator >= STEP) {
        world.step(STEP, { mx: 0, my: 0, aimX: 640, aimY: 200, firing: false, dash: false, choose: -1 });
        accumulator -= STEP;
        if (world.state.over || world.state.won) world.reset();
      }
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        stepWorld();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, fx, simTime);
  }

  // Leaving the tab pauses a running game rather than letting glooms close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Aetherlight, the last lantern. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
