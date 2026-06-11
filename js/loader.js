/**
 * Loading screen for TREEFORMANCE.
 *
 * Shows the full ASCII background (same density as the main menu), preloads
 * fonts/styles/scripts/audio from preload-manifest.js, then sends the player
 * to index.html.
 */
(function initLoader() {
  const PRELOAD_KEY = "treeformance-preload-done";
  const MIN_SHOW_MS = 1400;

  const FRAMES = [
    "   ♪ · ∴ · ♫   ",
    "  ░▒▓ TREEFORMANCE ▓▒░ ",
    "  · ♩ · · · ♪ · ",
    " ╱╲ loading beats ╱╲ ",
  ];

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const manifest = window.TREEFORMANCE_PRELOAD || {};

  let frameIndex = 0;
  let frameTimer = null;
  let asciiViz = null;
  let startedAt = performance.now();

  const els = {
    root: null,
    ascii: null,
    bar: null,
    status: null,
    pct: null,
    canvas: null,
  };

  function cacheElements() {
    els.root = document.querySelector(".loader");
    els.ascii = document.getElementById("loader-ascii");
    els.bar = document.getElementById("loader-bar");
    els.status = document.getElementById("loader-status");
    els.pct = document.getElementById("loader-pct");
    els.canvas = document.getElementById("loader-viz");
  }

  function setProgress(ratio, label) {
    const pct = Math.min(100, Math.round(ratio * 100));
    if (els.bar) els.bar.style.width = `${pct}%`;
    if (els.pct) els.pct.textContent = `${pct}%`;
    if (els.status && label) els.status.textContent = label;
  }

  // --- Asset preload helpers (fire-and-forget on error so loading never hangs) ---

  function loadStyle(href) {
    return new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => resolve();
      document.head.appendChild(link);
    });
  }

  function loadScript(src) {
    return new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "script";
      link.href = src;
      link.onload = () => resolve();
      link.onerror = () => resolve();
      document.head.appendChild(link);
    });
  }

  function loadFont(href) {
    return new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => resolve();
      document.head.appendChild(link);
    });
  }

  function loadAudio(src) {
    return new Promise((resolve) => {
      const audio = new Audio();
      const finish = () => resolve();
      audio.addEventListener("canplaythrough", finish, { once: true });
      audio.addEventListener("error", finish, { once: true });
      audio.preload = "auto";
      audio.src = src;
      try {
        audio.load();
      } catch {
        finish();
      }
      window.setTimeout(finish, 8000);
    });
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = src;
    });
  }

  async function preloadAll(onStep) {
    const jobs = [];

    (manifest.styles || []).forEach((href) => {
      jobs.push({ label: "Styles", run: () => loadStyle(href) });
    });
    (manifest.fonts || []).forEach((href) => {
      jobs.push({ label: "Fonts", run: () => loadFont(href) });
    });
    (manifest.scripts || []).forEach((src) => {
      jobs.push({ label: "Scripts", run: () => loadScript(src) });
    });
    (manifest.audio || []).forEach((src) => {
      const name = src.split("/").pop() || "audio";
      jobs.push({ label: `Audio: ${name}`, run: () => loadAudio(src) });
    });
    (manifest.images || []).forEach((src) => {
      jobs.push({ label: "Images", run: () => loadImage(src) });
    });

    if (!jobs.length) return;

    let done = 0;
    for (const job of jobs) {
      onStep(done / jobs.length, job.label);
      await job.run();
      done += 1;
      onStep(done / jobs.length, job.label);
    }
  }

  /** Full-screen reactive ASCII (menu quality, not the lighter in-level version). */
  function startAsciiField() {
    if (!els.canvas || !window.AsciiBg) return;

    asciiViz = AsciiBg.mount(els.canvas, { variant: "menu" });
    asciiViz?.start();
  }

  /** Small cycling label under the logo. */
  function startAsciiCycle() {
    if (!els.ascii) return;
    const step = () => {
      frameIndex = (frameIndex + 1) % FRAMES.length;
      els.ascii.textContent = FRAMES[frameIndex];
    };
    step();
    if (!reducedMotion.matches) {
      frameTimer = window.setInterval(step, 420);
    }
  }

  function finishLoading() {
    try {
      sessionStorage.setItem(PRELOAD_KEY, "1");
    } catch {
      // Storage may be blocked in private mode.
    }
    if (els.root) els.root.classList.add("is-done");
    if (els.status) els.status.textContent = "Ready. Entering menu…";
    asciiViz?.stop?.();
    window.setTimeout(() => {
      window.location.replace("index.html");
    }, 320);
  }

  async function boot() {
    cacheElements();
    startAsciiField();
    startAsciiCycle();

    setProgress(0, "Warming up…");

    await preloadAll((ratio, label) => {
      setProgress(ratio, label);
    });

    const elapsed = performance.now() - startedAt;
    const wait = Math.max(0, MIN_SHOW_MS - elapsed);
    setProgress(1, "All set");
    window.setTimeout(finishLoading, wait);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
