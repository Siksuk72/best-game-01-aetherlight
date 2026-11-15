// All sound is synthesised with WebAudio: no audio files, no network. The context is
// created on the first user gesture (browsers forbid sound before one) and stays silent
// in screenshot mode, where no gesture ever happens.
const MUSIC_NOTES = [220.0, 261.63, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = 0;
  let noteIndex = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.07;
      musicGain.connect(master);
      return true;
    } catch {
      return false;
    }
  }

  /** Call from any user gesture; safe to call repeatedly. */
  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
  }

  const sfx = {
    shoot() { tone(880, 0.07, 'square', 0.05, 440); },
    hit() { noise(0.06, 0.12, 2400); },
    kill() { tone(320, 0.16, 'sawtooth', 0.09, 70); noise(0.12, 0.1, 1200); },
    shard() { tone(1320, 0.09, 'sine', 0.07, 1980); },
    hurt() { tone(140, 0.22, 'sawtooth', 0.14, 55); noise(0.15, 0.12, 700); },
    dash() { noise(0.14, 0.1, 3200); tone(520, 0.12, 'sine', 0.06, 1040); },
    levelup() {
      tone(523.25, 0.12, 'triangle', 0.1);
      setTimeout(() => tone(659.25, 0.12, 'triangle', 0.1), 90);
      setTimeout(() => tone(783.99, 0.22, 'triangle', 0.12), 180);
    },
    wave() { tone(392, 0.3, 'triangle', 0.1, 523.25); },
    boss() { tone(98, 0.7, 'sawtooth', 0.16, 49); noise(0.5, 0.1, 400); },
    victory() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'triangle', 0.12), i * 140));
    },
    defeat() {
      [392, 329.63, 261.63, 196].forEach((f, i) => setTimeout(() => tone(f, 0.4, 'triangle', 0.1), i * 170));
    },
    click() { tone(660, 0.05, 'sine', 0.07); },
  };

  /** A slow generative pad: one soft pluck every beat from a pentatonic ladder. */
  function startMusic() {
    if (!ensure() || musicTimer) return;
    musicTimer = window.setInterval(() => {
      if (muted || !ctx) return;
      noteIndex = (noteIndex + (Math.random() < 0.7 ? 1 : 2)) % MUSIC_NOTES.length;
      const f = MUSIC_NOTES[noteIndex];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f / 2;
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.5, t + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      osc.connect(gain);
      gain.connect(musicGain);
      osc.start(t);
      osc.stop(t + 2.3);
    }, 620);
  }

  function toggleMute() {
    muted = !muted;
    return muted;
  }

  return { unlock, sfx, startMusic, toggleMute, isMuted: () => muted };
}
