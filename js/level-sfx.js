/**
 * Level UI & gameplay micro-SFX (Web Audio).
 */
(function initLevelSfx(global) {
  const MIN_INTERVAL_MS = 55;
  const FOCUS_PITCHES = [392, 440, 494, 523.25];

  let ctx = null;
  let lastPlayAt = 0;
  let uiWired = false;

  const canHover = global.matchMedia("(hover: hover) and (pointer: fine)");
  const reducedMotion = global.matchMedia("(prefers-reduced-motion: reduce)");
  const reducedSound = global.matchMedia("(prefers-reduced-motion: reduce)");

  function isEnabled() {
    return !reducedSound.matches;
  }

  function getContext() {
    if (ctx?.state === "closed") ctx = null;
    if (ctx) return ctx;
    const Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    return ctx;
  }

  function unlockSync() {
    const audio = getContext();
    if (!audio) return false;
    try {
      if (audio.state === "suspended") audio.resume();
      const buffer = audio.createBuffer(1, 1, audio.sampleRate);
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.connect(audio.destination);
      source.start(0);
      return true;
    } catch {
      return false;
    }
  }

  function canPlay() {
    return isEnabled() && ctx?.state === "running";
  }

  function throttled(fn) {
    const now = performance.now();
    if (now - lastPlayAt < MIN_INTERVAL_MS) return;
    lastPlayAt = now;
    fn();
  }

  function tone({ freq = 440, duration = 0.12, type = "sine", gain = 0.18, attack = 0.008, decay = 0.1 }) {
    if (!canPlay()) return;
    const audio = ctx;
    const t = audio.currentTime + 0.001;

    const master = audio.createGain();
    master.gain.setValueAtTime(0.0001, t);
    master.gain.exponentialRampToValueAtTime(gain, t + attack);
    master.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    master.connect(audio.destination);

    const osc = audio.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function noiseBurst({ duration = 0.04, gain = 0.12, freq = 900 }) {
    if (!canPlay()) return;
    const audio = ctx;
    const t = audio.currentTime + 0.001;
    const len = Math.floor(audio.sampleRate * duration);
    const buffer = audio.createBuffer(1, len, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const decay = 1 - i / len;
      data[i] = (Math.random() * 2 - 1) * decay * decay;
    }

    const source = audio.createBufferSource();
    source.buffer = buffer;

    const filter = audio.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(freq, t);
    filter.Q.setValueAtTime(1.2, t);

    const master = audio.createGain();
    master.gain.setValueAtTime(gain, t);
    master.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    source.connect(filter);
    filter.connect(master);
    master.connect(audio.destination);
    source.start(t);
    source.stop(t + duration + 0.01);
  }

  function playFocus(index = 0) {
    throttled(() => {
      const freq = FOCUS_PITCHES[index % FOCUS_PITCHES.length];
      tone({ freq, duration: 0.09, gain: 0.14, type: "triangle" });
      noiseBurst({ duration: 0.018, gain: 0.06, freq: freq * 2.2 });
    });
  }

  function playConfirm() {
    throttled(() => {
      tone({ freq: 261.63, duration: 0.16, gain: 0.2, type: "sine" });
      tone({ freq: 392, duration: 0.14, gain: 0.1, type: "triangle" });
      noiseBurst({ duration: 0.028, gain: 0.1, freq: 1200 });
    });
  }

  function playUi() {
    throttled(() => {
      tone({ freq: 329.63, duration: 0.11, gain: 0.15, type: "sine" });
      noiseBurst({ duration: 0.02, gain: 0.05, freq: 800 });
    });
  }

  function playGain(amount = 10) {
    throttled(() => {
      const amp = Math.min(0.22, 0.1 + amount * 0.004);
      tone({ freq: 523.25, duration: 0.14, gain: amp, type: "sine" });
      tone({ freq: 659.25, duration: 0.12, gain: amp * 0.55, type: "triangle" });
    });
  }

  function playDamage(amount = 10) {
    throttled(() => {
      const amp = Math.min(0.35, 0.14 + amount * 0.006);
      tone({ freq: 110, duration: 0.22, gain: amp, type: "sine" });
      tone({ freq: 73.42, duration: 0.18, gain: amp * 0.7, type: "triangle" });
      noiseBurst({ duration: 0.06, gain: amp * 0.85, freq: 320 });
    });
  }

  function playMiss() {
    throttled(() => {
      tone({ freq: 220, duration: 0.2, gain: 0.16, type: "sawtooth" });
      tone({ freq: 146.83, duration: 0.24, gain: 0.12, type: "sine" });
      noiseBurst({ duration: 0.045, gain: 0.14, freq: 500 });
    });
  }

  function playHit(tier = "good") {
    throttled(() => {
      if (tier === "perfect") {
        tone({ freq: 880, duration: 0.1, gain: 0.16, type: "sine" });
        tone({ freq: 1174.66, duration: 0.08, gain: 0.1, type: "triangle" });
      } else if (tier === "good") {
        tone({ freq: 659.25, duration: 0.09, gain: 0.13, type: "sine" });
      } else {
        tone({ freq: 523.25, duration: 0.08, gain: 0.1, type: "triangle" });
      }
    });
  }

  function wireUiHover() {
    if (uiWired) return;
    uiWired = true;

    document.addEventListener("mouseover", (event) => {
      if (!canHover.matches || reducedMotion.matches) return;
      const btn = event.target.closest?.(
        ".tutorial-modal__gotit, .goal-intro__gotit, .tutorial-nav__btn, .level-hud__menu, .level-hud__music, .level-music-sheet__track, .level-music-sheet__close"
      );
      if (!btn) return;
      const from = event.relatedTarget;
      if (from && btn.contains(from)) return;
      playUi();
    });
  }

  function attachGestureUnlock() {
    const opts = { passive: true, capture: true };
    const unlock = () => {
      unlockSync();
      global.MenuAudio?.unlock?.();
    };
    document.addEventListener("pointerdown", unlock, opts);
    document.addEventListener("keydown", unlock, opts);
  }

  function boot() {
    if (!document.body.classList.contains("level-page")) return;
    getContext();
    attachGestureUnlock();
    wireUiHover();
  }

  global.LevelSfx = {
    unlock: unlockSync,
    playFocus,
    playConfirm,
    playUi,
    playGain,
    playDamage,
    playMiss,
    playHit,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
