/**
 * Level entry loader — preloads audio and waits for playback before showing the level.
 */
(function initLevelBoot(global) {
  const MIN_SHOW_MS = 700;
  const MUSIC_WAIT_MS = 4500;
  const MAX_BOOT_MS = 9000;
  const PRELOAD_TIMEOUT_MS = 5000;
  const POLL_MS = 60;
  const GLYPHS = ["░", "▒", "▓", "·", "♩", "♪", "♫"];
  const FRAMES = [
    "  ░▒▓ syncing beats ▓▒░  ",
    "   · ♩ · · · ♪ ·   ",
    "  ╱╲ loading level ╱╲  ",
  ];

  const reducedMotion = global.matchMedia("(prefers-reduced-motion: reduce)");

  let readyPromise = null;
  let frameIndex = 0;
  let frameTimer = null;
  let animFrame = null;
  let canvas = null;
  let ctx = null;
  let bootViz = null;

  function isOnLevelPage() {
    return (
      document.body.classList.contains("level-page") &&
      (document.getElementById("level-game") || document.getElementById("tutorial-modal"))
    );
  }

  function isMusicAudible() {
    return Boolean(global.TreeMusic?.isPlaying?.() || global.LevelAudio?.isAudible?.());
  }

  function wantsMusic() {
    try {
      const handoff = global.MusicCatalog?.readLevelHandoff?.();
      if (!handoff?.wantMusic) return false;
      if (handoff.timeSec > 0.3) return true;
      if (handoff.queue?.length) return true;
      if (global.TreeMusic?.isPlaying?.()) return true;
      return false;
    } catch {
      return false;
    }
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function withTimeout(promise, ms, fallback = null) {
    return Promise.race([
      promise,
      delay(ms).then(() => fallback),
    ]);
  }

  function forceDismissBoot() {
    document.documentElement.classList.remove("is-level-booting");
    const boot = document.getElementById("level-boot");
    if (boot) {
      boot.classList.add("is-leaving");
      boot.setAttribute("aria-busy", "false");
      window.setTimeout(() => boot.remove(), 120);
    }
    stopCanvas();
  }

  function setProgress(el, ratio, label) {
    const bar = el?.querySelector(".level-boot__bar");
    const status = el?.querySelector(".level-boot__status");
    if (bar) bar.style.width = `${Math.min(100, Math.round(ratio * 100))}%`;
    if (status && label) status.textContent = label;
  }

  function injectOverlay() {
    if (document.getElementById("level-boot")) return document.getElementById("level-boot");

    document.documentElement.classList.add("is-level-booting");

    const modal = document.getElementById("tutorial-modal");
    if (modal?.classList.contains("is-open")) {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
    }

    const boot = document.createElement("div");
    boot.id = "level-boot";
    boot.className = "level-boot is-active";
    boot.setAttribute("role", "status");
    boot.setAttribute("aria-live", "polite");
    boot.setAttribute("aria-busy", "true");
    boot.innerHTML = `
      <canvas class="level-boot__viz" id="level-boot-viz" aria-hidden="true"></canvas>
      <div class="level-boot__inner">
        <p class="level-boot__brand">TREEFORMANCE</p>
        <pre class="level-boot__ascii" id="level-boot-ascii" aria-hidden="true">  ░▒▓ syncing beats ▓▒░  </pre>
        <p class="level-boot__spinner" aria-hidden="true">◐ ◓ ◑ ◒</p>
        <div class="level-boot__bar-wrap" aria-hidden="true">
          <div class="level-boot__bar"></div>
        </div>
        <p class="level-boot__status">Loading level…</p>
      </div>
    `;
    document.body.appendChild(boot);
    return boot;
  }

  function startAsciiCycle(asciiEl) {
    if (!asciiEl) return;
    const step = () => {
      frameIndex = (frameIndex + 1) % FRAMES.length;
      asciiEl.textContent = FRAMES[frameIndex];
    };
    step();
    if (!reducedMotion.matches) {
      frameTimer = window.setInterval(step, 420);
    }
  }

  function viewportSize() {
    const vv = global.visualViewport;
    return {
      w: Math.ceil(vv?.width ?? global.innerWidth),
      h: Math.ceil(vv?.height ?? global.innerHeight),
    };
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const { w, h } = viewportSize();
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawBg(time) {
    if (!ctx) return;
    const t = time * 0.001;
    const { w, h } = viewportSize();
    const cell = 14;
    const rowStep = cell * 0.82;
    const cols = Math.ceil(w / cell) + 2;
    const rows = Math.ceil(h / rowStep) + 2;

    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${cell - 2}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

    for (let row = 0; row < rows; row += 1) {
      const y = row * rowStep + cell * 0.5;
      if (y < -cell || y > h + cell) continue;

      for (let col = 0; col < cols; col += 1) {
        const x = col * cell + (row % 2 ? cell * 0.5 : 0);
        const wave = Math.sin(t * 1.5 + col * 0.2 + row * 0.12);
        const energy = 0.2 + Math.max(0, wave) * 0.3;
        const glyph = GLYPHS[(col + row + Math.floor(t * 2.5)) % GLYPHS.length];
        ctx.globalAlpha = 0.03 + energy * 0.2;
        ctx.fillStyle = energy > 0.35 ? "#000" : "#999";
        ctx.fillText(glyph, x, y);
      }
    }
    ctx.globalAlpha = 1;
  }

  function startCanvas() {
    canvas = document.getElementById("level-boot-viz");
    if (!canvas) return;

    if (global.AsciiBg) {
      bootViz = global.AsciiBg.mount(canvas, {
        variant: "level",
        sizeMode: "viewport",
        glyphColor:
          getComputedStyle(document.documentElement).getPropertyValue("--level-glyph").trim() ||
          "#000",
      });
      bootViz?.start?.();
      const onResize = () => bootViz?.resize?.();
      global.addEventListener("resize", onResize, { passive: true });
      global.visualViewport?.addEventListener("resize", onResize, { passive: true });
      return;
    }

    ctx = canvas.getContext("2d");
    if (!ctx || reducedMotion.matches) return;

    resizeCanvas();
    const tick = (time) => {
      drawBg(time);
      animFrame = requestAnimationFrame(tick);
    };
    animFrame = requestAnimationFrame(tick);
    const onResize = () => resizeCanvas();
    global.addEventListener("resize", onResize, { passive: true });
    global.visualViewport?.addEventListener("resize", onResize, { passive: true });
  }

  function stopCanvas() {
    bootViz?.stop?.();
    bootViz = null;
    if (animFrame) cancelAnimationFrame(animFrame);
    animFrame = null;
    if (frameTimer) window.clearInterval(frameTimer);
    frameTimer = null;
  }

  async function preloadTrack() {
    const trackId = global.MusicCatalog?.getActiveTrackId?.();
    const track = global.MusicCatalog?.getTrack?.(trackId);
    if (!track) return false;
    try {
      const loaded = await withTimeout(
        global.LevelAudio?.preload?.(track) ?? Promise.resolve(null),
        PRELOAD_TIMEOUT_MS,
        null
      );
      return Boolean(loaded);
    } catch {
      return false;
    }
  }

  async function waitForMusicPlayback(bootEl, musicExpected) {
    if (!musicExpected) return false;

    setProgress(bootEl, 0.35, "Starting music… (tap to continue)");

    let started = await global.LevelMusic?.tryAutoResumeOnLoad?.();
    if (started && isMusicAudible()) return true;

    const deadline = performance.now() + MUSIC_WAIT_MS;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(ok);
      };

      const onGesture = async () => {
        global.LevelAudio?.unlockSync?.();
        await global.LevelMusic?.beginLevelFromGesture?.();
        if (isMusicAudible()) finish(true);
      };

      const poll = window.setInterval(() => {
        if (isMusicAudible()) {
          finish(true);
          return;
        }
        if (performance.now() >= deadline) {
          finish(isMusicAudible());
        }
      }, POLL_MS);

      const timeout = window.setTimeout(() => finish(isMusicAudible()), MUSIC_WAIT_MS);

      function cleanup() {
        window.clearInterval(poll);
        window.clearTimeout(timeout);
        document.removeEventListener("pointerdown", onGesture, { capture: true });
        document.removeEventListener("keydown", onGesture, { capture: true });
      }

      document.addEventListener("pointerdown", onGesture, { capture: true });
      document.addEventListener("keydown", onGesture, { capture: true });
    });
  }

  async function runBoot() {
    if (!isOnLevelPage()) return;

    const startedAt = performance.now();
    let bootEl = null;
    const bootGuard = window.setTimeout(forceDismissBoot, MAX_BOOT_MS);

    try {
    bootEl = injectOverlay();
    const asciiEl = bootEl.querySelector("#level-boot-ascii");
    startAsciiCycle(asciiEl);
    startCanvas();

    const musicExpected = wantsMusic();
    setProgress(bootEl, 0.08, musicExpected ? "Loading track…" : "Preparing level…");

    await preloadTrack();
    setProgress(bootEl, 0.22, musicExpected ? "Syncing audio…" : "Almost ready…");

    if (musicExpected) {
      await waitForMusicPlayback(bootEl, true);
      setProgress(bootEl, 0.92, isMusicAudible() ? "Music ready" : "Ready");
    } else {
      setProgress(bootEl, 0.75, "Ready");
    }

    const elapsed = performance.now() - startedAt;
    await delay(Math.max(0, MIN_SHOW_MS - elapsed));
    setProgress(bootEl, 1, "Let's go");

    stopCanvas();
    bootEl.classList.add("is-leaving");
    bootEl.setAttribute("aria-busy", "false");
    document.documentElement.classList.remove("is-level-booting");

    await delay(380);
    bootEl.remove();
    } finally {
      window.clearTimeout(bootGuard);
      document.documentElement.classList.remove("is-level-booting");
      document.getElementById("level-boot")?.remove();
      stopCanvas();
    }

    global.dispatchEvent(new CustomEvent("level:boot-ready"));
  }

  function whenReady() {
    if (!readyPromise) {
      readyPromise = runBoot();
    }
    return readyPromise;
  }

  global.LevelBoot = { whenReady };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", whenReady);
  } else {
    whenReady();
  }
})(window);
