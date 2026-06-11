/**
 * Shared music-reactive ASCII background.
 *
 * Used on the loading screen, main menu, and (lighter) in levels.
 * Call AsciiBg.mount(canvas, { variant: "menu" | "level" | "level-subtle" }).
 */
(function initAsciiBg(global) {
  const GLYPHS = ["·", "˙", "•", "○", "♩", "♪", "♫", "♬", "░", "▒"];
  const BAND_COUNT = 10;
  const PITCH_BANDS = [2, 4, 6, 8];

  // menu = full density. level-subtle = fewer glyphs, used during gameplay.
  const VARIANT_CFG = {
    menu: { cell: 13, stride: 1, baseAlpha: 0.16, energyScale: 0.48, maxFps: 60, fancy: true },
    level: { cell: 22, stride: 2, baseAlpha: 0.08, energyScale: 0.26, maxFps: 28, fancy: false },
    "level-subtle": { cell: 30, stride: 2, baseAlpha: 0.055, energyScale: 0.18, maxFps: 22, fancy: false },
  };

  function mount(canvas, options = {}) {
    const reducedMotion = global.matchMedia("(prefers-reduced-motion: reduce)");
    const variant = options.variant || "menu";
    const sizeMode = options.sizeMode || "viewport";
    const sizeRoot = options.container || canvas.parentElement;
    let glyphColor = options.glyphColor || "#000";

    let ctx = null;
    let particles = [];
    let frame = null;
    let width = 0;
    let height = 0;
    let resizeObserver = null;

    let analyser = null;
    let analyserData = null;
    let audioCtx = null;
    let analyserLinked = false;

    let globalPulse = 0;
    let destroyed = false;
    let paused = false;
    let lastDrawTime = 0;

    const cfg = () => VARIANT_CFG[variant] || VARIANT_CFG.menu;

    function isRhythmActive() {
      const seq = global.document.getElementById("level-sequence");
      return Boolean(seq && !seq.hidden);
    }

    function buildGrid() {
      particles = [];
      const { cell, stride } = cfg();
      const cols = Math.max(1, Math.ceil(width / cell) + 1);
      const rows = Math.max(1, Math.ceil(height / cell) + 1);

      for (let row = 0; row < rows; row += stride) {
        for (let col = 0; col < cols; col += stride) {
          const band = Math.min(
            BAND_COUNT - 1,
            Math.floor((row / Math.max(1, rows - 1)) * BAND_COUNT)
          );

          particles.push({
            col,
            row,
            x: col * cell + cell * 0.5,
            y: row * cell + cell * 0.82,
            phase: Math.random() * Math.PI * 2,
            wobble: 0.6 + Math.random() * 0.9,
            band,
            spark: 0,
            glyphSeed: Math.floor(Math.random() * GLYPHS.length),
          });
        }
      }
    }

    function measureSize() {
      if (sizeMode === "container" && sizeRoot) {
        const rect = sizeRoot.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return { w: rect.width, h: rect.height };
        }
      }
      const vv = global.visualViewport;
      return {
        w: Math.ceil(vv?.width ?? global.innerWidth),
        h: Math.ceil(vv?.height ?? global.innerHeight),
      };
    }

    function resize() {
      if (!canvas || !ctx || destroyed) return false;

      const { w, h } = measureSize();
      if (!w || !h) return false;

      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      const nextW = Math.floor(w);
      const nextH = Math.floor(h);

      if (nextW === width && nextH === height && particles.length) {
        return true;
      }

      width = nextW;
      height = nextH;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildGrid();
      return true;
    }

    function unlockVizAudio() {
      try {
        const Ctx = global.AudioContext || global.webkitAudioContext;
        if (!Ctx) return false;

        audioCtx = audioCtx || new Ctx();
        if (audioCtx.state === "suspended") {
          audioCtx.resume();
        }

        const buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.start(0);
        return true;
      } catch {
        return false;
      }
    }

    function ensureAnalyser() {
      if (analyserLinked) return analyser;

      const audio = global.TreeMusic?.audio;
      if (!audio?.src) return null;

      try {
        const Ctx = global.AudioContext || global.webkitAudioContext;
        if (!Ctx) return null;

        audioCtx = audioCtx || new Ctx();
        if (audioCtx.state !== "running") {
          audioCtx.resume().catch(() => {});
          return null;
        }

        const source = audioCtx.createMediaElementSource(audio);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.78;
        analyserData = new Uint8Array(analyser.frequencyBinCount);

        source.connect(analyser);
        analyser.connect(audioCtx.destination);
        analyserLinked = true;
        return analyser;
      } catch {
        return analyser;
      }
    }

    function isMusicPlaying() {
      return Boolean(global.TreeMusic?.isPlaying?.() || global.LevelAudio?.isAudible?.());
    }

    function idleBands(t) {
      const bands = new Array(BAND_COUNT).fill(0);
      for (let b = 0; b < BAND_COUNT; b++) {
        bands[b] =
          0.24 +
          Math.max(0, Math.sin(t * 1.7 + b * 0.48) * 0.18) +
          Math.max(0, Math.sin(t * 3.1 - b * 0.22) * 0.1);
      }
      return bands;
    }

    function readBands(t) {
      if (!isMusicPlaying()) {
        return idleBands(t);
      }

      const bands = new Array(BAND_COUNT).fill(0);
      const node = ensureAnalyser();
      if (node && analyserData) {
        node.getByteFrequencyData(analyserData);
        const slice = Math.floor(analyserData.length / BAND_COUNT);
        for (let b = 0; b < BAND_COUNT; b++) {
          let sum = 0;
          const start = b * slice;
          const end = Math.min(analyserData.length, start + slice);
          for (let i = start; i < end; i++) sum += analyserData[i];
          bands[b] = sum / ((end - start) * 255);
        }
        return bands;
      }

      for (let b = 0; b < BAND_COUNT; b++) {
        bands[b] =
          0.18 +
          Math.max(0, Math.sin(t * 2.8 + b * 0.55) * 0.14) +
          Math.max(0, Math.sin(t * 5.2 - b * 0.3) * 0.08);
      }
      return bands;
    }

    function readGlobalEnergy(bands, t) {
      if (!isMusicPlaying()) {
        return 0.44 + Math.sin(t * 0.9) * 0.12;
      }
      let sum = 0;
      for (let i = 0; i < bands.length; i++) sum += bands[i];
      return sum / bands.length;
    }

    function pulseSparkAtBand(center, radius, amount, strength = 1) {
      for (const p of particles) {
        const dist = Math.abs(p.band - center);
        if (dist <= radius) {
          p.spark = Math.min(amount, p.spark + (amount - dist * 0.2) * strength);
        }
      }
    }

    function pulseTone(pitchIndex, strength = 1) {
      const center = PITCH_BANDS[pitchIndex] ?? PITCH_BANDS[0];
      globalPulse = Math.min(1.5, globalPulse + 0.65 * strength);
      if (cfg().fancy) {
        pulseSparkAtBand(center, 2, 1.5, strength);
      }
    }

    function pulseLane(_laneKey, bandIndex, strength = 1) {
      if (isRhythmActive()) return;
      globalPulse = Math.min(1.75, globalPulse + 0.95 * strength);
      const center = bandIndex ?? 5;
      pulseSparkAtBand(center, 3, 1.65, strength);
      pulseTone(center, strength * 0.55);
    }

    function glyphForEnergy(energy, seed) {
      const idx = Math.max(
        0,
        Math.min(
          GLYPHS.length - 1,
          Math.floor(Math.max(0, energy) * GLYPHS.length * 0.92 + (seed || 0) * 0.08)
        )
      );
      return GLYPHS[idx] ?? GLYPHS[0];
    }

    function draw(time) {
      if (!ctx || !width || !height) return;

      const t = time * 0.001;
      const profile = cfg();
      const bands = readBands(t);
      const globalEnergy = readGlobalEnergy(bands, t);
      const playing = isMusicPlaying();

      ctx.clearRect(0, 0, width, height);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${profile.cell - 1}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
      ctx.fillStyle = glyphColor;

      globalPulse *= 0.9;

      const baseAlpha = profile.baseAlpha;
      const energyScale = profile.fancy && playing ? 0.48 : profile.energyScale;

      for (const p of particles) {
        const bandE = bands[p.band] ?? 0;
        const idle = 0.5 + 0.5 * Math.sin(t * p.wobble + p.phase);
        const wave = profile.fancy
          ? Math.sin(t * 1.6 + p.col * 0.22 + p.row * 0.11) * 0.14
          : 0;
        const energy = Math.max(
          0,
          Math.min(
            1.35,
            idle * 0.42 + bandE * 0.95 + globalEnergy * 0.5 + p.spark + globalPulse * 0.35 + wave
          )
        );

        const alpha = baseAlpha + energy * energyScale;
        ctx.globalAlpha = Math.min(0.85, alpha);

        if (profile.fancy) {
          const scale = 1 + energy * 0.12;
          const jitterX = Math.sin(t * 2.4 + p.phase) * energy * 0.6;
          const jitterY = Math.cos(t * 2.1 + p.phase * 1.3) * energy * 0.45;
          ctx.save();
          ctx.translate(p.x + jitterX, p.y + jitterY);
          ctx.scale(scale, scale);
          ctx.fillText(glyphForEnergy(energy, p.glyphSeed), 0, 0);
          ctx.restore();
        } else {
          ctx.fillText(glyphForEnergy(energy, p.glyphSeed), p.x, p.y);
        }

        p.spark *= 0.86;
        if (p.spark < 0.008) p.spark = 0;
      }

      ctx.globalAlpha = 1;
    }

    function tick(time) {
      frame = null;
      if (!ctx || destroyed || reducedMotion.matches || paused) return;

      // During piano tiles, skip drawing so rhythm stays smooth.
      if (variant !== "menu" && isRhythmActive()) {
        frame = global.requestAnimationFrame(tick);
        return;
      }

      const minDelta = 1000 / cfg().maxFps;
      if (time - lastDrawTime < minDelta) {
        frame = global.requestAnimationFrame(tick);
        return;
      }
      lastDrawTime = time;

      draw(time);
      frame = global.requestAnimationFrame(tick);
    }

    function start() {
      if (destroyed || reducedMotion.matches) return;
      resize();
      if (!frame) {
        frame = global.requestAnimationFrame(tick);
      }
    }

    function stop() {
      if (frame) {
        global.cancelAnimationFrame(frame);
        frame = null;
      }
    }

    function setPaused(value) {
      paused = Boolean(value);
      if (paused) stop();
      else if (!reducedMotion.matches) start();
    }

    function drawStatic() {
      resize();
      draw(performance.now());
    }

    function onLayoutChange() {
      if (destroyed) return;
      resize();
      if (reducedMotion.matches) {
        drawStatic();
        return;
      }
      start();
    }

    function destroy() {
      destroyed = true;
      stop();
      resizeObserver?.disconnect();
      resizeObserver = null;
      global.removeEventListener("resize", onLayoutChange);
      global.removeEventListener("treemusic:play", onMusicPlay);
      reducedMotion.removeEventListener("change", onMotionChange);
    }

    function onMusicPlay() {
      unlockVizAudio();
      ensureAnalyser();
      start();
    }

    function onMotionChange() {
      if (reducedMotion.matches) {
        stop();
        drawStatic();
      } else {
        start();
      }
    }

    ctx = canvas.getContext("2d");
    if (!ctx) return null;

    global.addEventListener("resize", onLayoutChange, { passive: true });
    global.addEventListener("treemusic:play", onMusicPlay);
    reducedMotion.addEventListener("change", onMotionChange);

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(onLayoutChange);
      resizeObserver.observe(sizeRoot || document.documentElement);
    }

    if (reducedMotion.matches) {
      drawStatic();
    } else {
      onLayoutChange();
      global.requestAnimationFrame(onLayoutChange);
      global.addEventListener("load", onLayoutChange, { once: true });
    }

    return {
      unlockVizAudio,
      pulseTone,
      pulseLane,
      start,
      stop,
      setPaused,
      resize: onLayoutChange,
      destroy,
    };
  }

  global.AsciiBg = { mount };
})(window);
