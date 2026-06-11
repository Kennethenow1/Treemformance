/**
 * Settings page — full-viewport music-reactive ASCII field (softer, diagonal drift).
 */
(function initSettingsBg() {
  const GLYPHS = ["░", "▒", "▓", "·", "∷", "∴", "╱", "╲", "◇", "◆", "▹", "▾", "♩", "♪"];
  const CELL = 15;
  const BAND_COUNT = 12;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let canvas = null;
  let ctx = null;
  let particles = [];
  let frame = null;
  let width = 0;
  let height = 0;

  let analyser = null;
  let analyserData = null;
  let audioCtx = null;
  let analyserLinked = false;

  let globalPulse = 0;
  let driftPhase = 0;

  function buildGrid() {
    particles = [];
    const stagger = CELL * 0.5;
    const cols = Math.ceil(width / CELL) + 2;
    const rows = Math.ceil(height / CELL) + 2;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const offsetX = row % 2 === 0 ? 0 : stagger;
        const x = col * CELL + offsetX;
        const y = row * CELL * 0.86;
        const normY = y / Math.max(1, height);
        const band = Math.min(BAND_COUNT - 1, Math.floor(normY * BAND_COUNT));

        particles.push({
          x,
          y,
          col,
          row,
          band,
          phase: Math.random() * Math.PI * 2,
          drift: 0.35 + Math.random() * 0.75,
          glyphSeed: Math.floor(Math.random() * GLYPHS.length),
          spark: 0,
          hue: 248 + Math.random() * 28,
        });
      }
    }
  }

  function resize() {
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildGrid();
  }

  function ensureAnalyser() {
    if (analyserLinked) return analyser;
    const audio = window.TreeMusic?.audio;
    if (!audio?.src) return null;

    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;

      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }

      const source = audioCtx.createMediaElementSource(audio);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      analyserData = new Uint8Array(analyser.frequencyBinCount);

      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      analyserLinked = true;
      return analyser;
    } catch {
      return analyser;
    }
  }

  function readBands() {
    const bands = new Array(BAND_COUNT).fill(0);
    const playing = window.TreeMusic?.isPlaying?.();
    if (!playing) return bands;

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

    const t = performance.now() * 0.001;
    for (let b = 0; b < BAND_COUNT; b++) {
      bands[b] =
        0.14 +
        Math.max(0, Math.sin(t * 2.2 + b * 0.48) * 0.12) +
        Math.max(0, Math.sin(t * 4.6 - b * 0.35) * 0.06);
    }
    return bands;
  }

  function readGlobalEnergy(bands) {
    if (!window.TreeMusic?.isPlaying?.()) {
      return 0.1 + Math.sin(performance.now() * 0.001 * 0.7) * 0.03;
    }
    let sum = 0;
    for (let i = 0; i < bands.length; i++) sum += bands[i];
    return sum / bands.length;
  }

  function pulseAtBand(center, strength = 1) {
    globalPulse = Math.min(1.2, globalPulse + 0.5 * strength);
    for (const p of particles) {
      const dist = Math.abs(p.band - center);
      if (dist <= 3) {
        p.spark = Math.min(1.35, p.spark + (1 - dist * 0.22) * strength);
      }
    }
  }

  function pulseRipple(xNorm, yNorm, strength = 1) {
    globalPulse = Math.min(1.2, globalPulse + 0.35 * strength);
    for (const p of particles) {
      const dx = p.x / width - xNorm;
      const dy = p.y / height - yNorm;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.22) {
        p.spark = Math.min(1.35, p.spark + (1 - dist / 0.22) * strength);
      }
    }
  }

  function glyphForEnergy(energy, seed) {
    const idx = Math.min(
      GLYPHS.length - 1,
      Math.floor(energy * GLYPHS.length * 0.88 + seed * 0.12)
    );
    return GLYPHS[idx];
  }

  function colorForParticle(p, energy, playing) {
    const sat = playing ? 18 + energy * 32 : 8 + energy * 10;
    const light = playing ? 58 + energy * 22 : 72 + energy * 8;
    const hue = p.hue + (playing ? energy * 18 : 0);
    return `hsl(${hue} ${sat}% ${light}%)`;
  }

  function draw(time) {
    const t = time * 0.001;
    const bands = readBands();
    const global = readGlobalEnergy(bands);
    const playing = window.TreeMusic?.isPlaying?.();

    driftPhase += playing ? 0.004 + global * 0.012 : 0.0015;

    ctx.clearRect(0, 0, width, height);

    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, playing ? "rgba(248, 244, 255, 0.55)" : "rgba(252, 252, 254, 0.4)");
    grad.addColorStop(0.5, playing ? "rgba(236, 230, 248, 0.35)" : "rgba(248, 248, 252, 0.25)");
    grad.addColorStop(1, playing ? "rgba(224, 218, 240, 0.45)" : "rgba(244, 244, 248, 0.35)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${CELL - 2}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

    globalPulse *= 0.91;

    for (const p of particles) {
      const bandE = bands[p.band] ?? 0;
      const idle = 0.5 + 0.5 * Math.sin(t * p.drift + p.phase);
      const wave =
        Math.sin(t * 1.1 + p.col * 0.18 - p.row * 0.09 + driftPhase * 3) * 0.07;
      const energy = Math.min(
        1.25,
        idle * 0.18 + bandE * 0.88 + global * 0.38 + p.spark + globalPulse * 0.28 + wave
      );

      const driftX = Math.sin(driftPhase + p.phase) * (playing ? 2.2 : 0.8);
      const driftY = Math.cos(driftPhase * 0.85 + p.phase * 1.2) * (playing ? 1.6 : 0.5);
      const jitterX = Math.sin(t * 1.8 + p.phase) * energy * 0.45;
      const jitterY = Math.cos(t * 1.5 + p.phase * 1.1) * energy * 0.35;

      const alpha = playing ? 0.04 + energy * 0.42 : 0.025 + energy * 0.22;
      const scale = 1 + energy * (playing ? 0.14 : 0.06);

      ctx.save();
      ctx.globalAlpha = Math.min(0.65, alpha);
      ctx.fillStyle = colorForParticle(p, energy, playing);
      ctx.translate(p.x + driftX + jitterX, p.y + driftY + jitterY);
      ctx.scale(scale, scale);
      ctx.fillText(glyphForEnergy(energy, p.glyphSeed), 0, 0);
      ctx.restore();

      p.spark *= 0.87;
      if (p.spark < 0.006) p.spark = 0;
    }
  }

  function tick(time) {
    if (!ctx || reducedMotion.matches) return;
    draw(time);
    frame = requestAnimationFrame(tick);
  }

  function start() {
    if (reducedMotion.matches || frame) return;
    resize();
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  }

  function drawStatic() {
    if (!ctx) return;
    resize();
    draw(0);
  }

  function bindEvents() {
    window.addEventListener("treemusic:play", () => {
      ensureAnalyser();
      pulseAtBand(4, 0.9);
      start();
    });

    window.addEventListener("resize", () => {
      resize();
      if (reducedMotion.matches) drawStatic();
    });

    reducedMotion.addEventListener("change", () => {
      if (reducedMotion.matches) {
        stop();
        drawStatic();
      } else {
        start();
      }
    });

    document.addEventListener("menu-tone", (event) => {
      pulseAtBand(3 + (event.detail?.index ?? 0), 0.65);
      start();
    });

    document.querySelectorAll(".scheme-toggle__btn").forEach((btn, index) => {
      btn.addEventListener("click", () => {
        pulseRipple(0.5, 0.38 + index * 0.08, 1.1);
        start();
      });
      btn.addEventListener("mouseenter", () => {
        pulseAtBand(3 + index, 0.55);
        start();
      });
    });

    document.querySelectorAll(".settings-card").forEach((card, index) => {
      card.addEventListener("mouseenter", () => {
        pulseAtBand(2 + index * 2, 0.45);
        start();
      });
    });

    document.querySelector(".settings__back")?.addEventListener("mouseenter", () => {
      pulseAtBand(1, 0.5);
      start();
    });
  }

  function boot() {
    canvas = document.getElementById("settings-viz");
    if (!canvas) return;

    ctx = canvas.getContext("2d");
    bindEvents();

    if (reducedMotion.matches) {
      drawStatic();
      return;
    }

    start();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
