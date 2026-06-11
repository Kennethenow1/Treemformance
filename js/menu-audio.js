/**
 * Procedural menu hover sounds via Web Audio API.
 * Safari-safe: sync unlock in gesture handlers, no async resume on hover.
 */
(function initMenuAudio() {
  const MIN_INTERVAL_MS = 90;
  const PRIMED_KEY = "treeformance-audio-primed";
  // G3 · B3 · D4 — low warm major triad, each button steps up the chord
  const PITCHES = [196.0, 246.94, 293.66, 392.0];
  const DETUNES = [0, 6, -4, 5];

  let ctx = null;
  let lastPlayAt = 0;
  let buttonsBound = false;
  let isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function isEnabled() {
    return canHover.matches && !reducedMotion.matches;
  }

  function isRunning() {
    return ctx && ctx.state === "running";
  }

  function wasPrimedThisSession() {
    try {
      return sessionStorage.getItem(PRIMED_KEY) === "1";
    } catch {
      return false;
    }
  }

  function markPrimed() {
    try {
      sessionStorage.setItem(PRIMED_KEY, "1");
    } catch {
      // Ignore blocked storage
    }
  }

  function getContext() {
    if (ctx?.state === "closed") ctx = null;
    if (ctx) return ctx;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    ctx = new Ctx();
    return ctx;
  }

  /** Must run synchronously inside a user-gesture handler (Safari requirement). */
  function unlockSync() {
    const audio = getContext();
    if (!audio) return false;

    try {
      if (audio.state === "suspended") {
        audio.resume();
      }

      // Silent buffer primes Safari/WebKit audio in the gesture call stack
      const buffer = audio.createBuffer(1, 1, audio.sampleRate);
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.connect(audio.destination);
      source.start(0);

      if (audio.state === "running") {
        markPrimed();
        return true;
      }

      // resume() is async in some builds — still mark primed so we retry on hover
      markPrimed();
      return true;
    } catch {
      return false;
    }
  }

  function onUserGesture() {
    unlockSync();
  }

  function attachGestureUnlock() {
    const opts = { passive: true, capture: true };
    document.addEventListener("pointerdown", onUserGesture, opts);
    document.addEventListener("touchstart", onUserGesture, opts);
    document.addEventListener("keydown", onUserGesture, opts);
    document.addEventListener("click", onUserGesture, opts);
  }

  function playTone(pitchIndex) {
    const audio = getContext();
    if (!audio || audio.state !== "running") return;

    const freq = PITCHES[pitchIndex] ?? PITCHES[0];
    const detune = DETUNES[pitchIndex] ?? 0;
    const t = audio.currentTime + 0.001;
    const duration = 0.2;

    try {
      const master = audio.createGain();
      master.gain.setValueAtTime(0.0001, t);
      master.gain.exponentialRampToValueAtTime(0.75, t + 0.01);
      master.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      master.connect(audio.destination);

      const filter = audio.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2400, t);
      filter.frequency.exponentialRampToValueAtTime(700, t + duration * 0.75);
      filter.Q.setValueAtTime(0.8, t);
      filter.connect(master);

      // Layer 1 — filtered noise transient ("thock")
      const noiseLength = Math.floor(audio.sampleRate * 0.035);
      const noiseBuffer = audio.createBuffer(1, noiseLength, audio.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLength; i++) {
        const decay = 1 - i / noiseLength;
        noiseData[i] = (Math.random() * 2 - 1) * decay * decay;
      }

      const noise = audio.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseFilter = audio.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.setValueAtTime(freq * 2.8, t);
      noiseFilter.Q.setValueAtTime(1.4, t);
      const noiseGain = audio.createGain();
      noiseGain.gain.setValueAtTime(0.0001, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.42, t + 0.0015);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(filter);
      noise.start(t);
      noise.stop(t + 0.035);

      // Layer 2 — dual detuned sines, pitch drops into place ("bloom")
      for (const cents of [0, detune]) {
        const body = audio.createOscillator();
        const bodyGain = audio.createGain();
        body.type = "sine";
        body.detune.setValueAtTime(cents, t);
        body.frequency.setValueAtTime(freq * 1.28, t);
        body.frequency.exponentialRampToValueAtTime(Math.max(freq, 20), t + 0.08);
        body.frequency.exponentialRampToValueAtTime(Math.max(freq * 0.97, 20), t + duration);
        bodyGain.gain.setValueAtTime(0.0001, t);
        bodyGain.gain.exponentialRampToValueAtTime(0.2, t + 0.014);
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + duration * 0.92);
        body.connect(bodyGain);
        bodyGain.connect(filter);
        body.start(t);
        body.stop(t + duration + 0.05);
      }

      // Layer 3 — sub weight one octave down
      const sub = audio.createOscillator();
      const subGain = audio.createGain();
      sub.type = "sine";
      sub.frequency.setValueAtTime(freq * 0.5, t);
      subGain.gain.setValueAtTime(0.0001, t);
      subGain.gain.exponentialRampToValueAtTime(0.14, t + 0.018);
      subGain.gain.exponentialRampToValueAtTime(0.0001, t + duration * 0.55);
      sub.connect(subGain);
      subGain.connect(filter);
      sub.start(t);
      sub.stop(t + duration);

      // Layer 4 — soft overtone tail for shimmer
      const shimmer = audio.createOscillator();
      const shimmerGain = audio.createGain();
      shimmer.type = "triangle";
      shimmer.frequency.setValueAtTime(freq * 2, t);
      shimmer.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.5, 20), t + 0.06);
      shimmerGain.gain.setValueAtTime(0.0001, t);
      shimmerGain.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
      shimmerGain.gain.exponentialRampToValueAtTime(0.0001, t + duration * 0.45);
      shimmer.connect(shimmerGain);
      shimmerGain.connect(filter);
      shimmer.start(t);
      shimmer.stop(t + duration * 0.5);
    } catch {
      // Stay silent
    }
  }

  function playHoverTone(pitchIndex) {
    if (!isEnabled()) return;

    const now = performance.now();
    if (now - lastPlayAt < MIN_INTERVAL_MS) return;

    // Safari: never await resume here — hover is not a user gesture
    if (!isRunning()) return;

    lastPlayAt = now;
    playTone(pitchIndex);
    document.dispatchEvent(
      new CustomEvent("menu-tone", {
        detail: {
          index: pitchIndex,
          freq: PITCHES[pitchIndex] ?? PITCHES[0],
        },
      })
    );
  }

  function getPitchForElement(el) {
    const scope =
      el.closest("#music-phone, #music-picker, .settings, .menu") || document.body;
    const selector =
      ".menu .btn, .menu-group__toggle, #music-open, .menu-music-pill, " +
      "#music-phone button, #music-picker button, " +
      ".settings-page button, .settings-page a.settings__back";
    const buttons = [...scope.querySelectorAll(selector)];
    const idx = buttons.indexOf(el);
    if (idx >= 0) return idx % PITCHES.length;

    let hash = 0;
    const key = `${el.tagName}:${el.className}`;
    for (let i = 0; i < key.length; i++) hash = (hash + key.charCodeAt(i)) % PITCHES.length;
    return hash;
  }

  function bindInteractiveAudio() {
    if (buttonsBound) return;
    buttonsBound = true;

    document.addEventListener("mouseover", (event) => {
      const btn = event.target.closest?.(
        ".menu .btn, .menu-group__toggle, #music-open, .menu-music-pill, " +
          "#music-phone button, #music-picker button, " +
          ".settings-page button, .settings-page a.settings__back"
      );
      if (!btn || btn.disabled) return;
      const from = event.relatedTarget;
      if (from && btn.contains(from)) return;
      playHoverTone(getPitchForElement(btn));
    });
  }

  function bindButtons() {
    bindInteractiveAudio();
  }

  function ensureButtonsVisible(force) {
    document.querySelectorAll(".menu .btn, .menu-group__toggle, #music-open").forEach((btn) => {
      if (force) {
        btn.classList.add("is-ready");
        return;
      }

      btn.addEventListener("animationend", () => {
        btn.classList.add("is-ready");
      }, { once: true });

      // Safari bfcache sometimes never fires animationend
      setTimeout(() => btn.classList.add("is-ready"), 1200);
    });
  }

  function onPageShow(event) {
    lastPlayAt = 0;

    if (event.persisted) {
      ensureButtonsVisible(true);
      // Don't close the context on Safari — recreate only if dead
      if (!ctx || ctx.state === "closed") {
        getContext();
      }
      // Audio will re-unlock on next click/tap
      if (wasPrimedThisSession() && isSafari) {
        attachGestureUnlock();
      }
    }
  }

  window.MenuAudio = {
    unlock: unlockSync,
    playTone: playHoverTone,
    isEnabled,
  };

  function boot() {
    getContext();
    bindButtons();
    attachGestureUnlock();
    ensureButtonsVisible(false);

    // Non-Safari: try resuming if primed (Chrome allows this)
    if (wasPrimedThisSession() && !isSafari && ctx?.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  }

  canHover.addEventListener("change", () => {
    if (!isEnabled()) lastPlayAt = 0;
  });

  reducedMotion.addEventListener("change", () => {
    if (!isEnabled()) lastPlayAt = 0;
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && isRunning()) return;
    if (!document.hidden && wasPrimedThisSession() && !isSafari && ctx?.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  });

  window.addEventListener("pageshow", onPageShow);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
