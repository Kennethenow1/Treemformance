/**
 * Wires the shared ASCII field into level pages.
 *
 * Uses the lighter "level-subtle" variant so piano tiles and choices stay smooth.
 * Listens for lane hits to pulse glyphs near the matching frequency band.
 */
(function initLevelAsciiBg() {
  if (!document.body.classList.contains("level-page")) return;

  const LANE_BAND = {
    ArrowLeft: 2,
    ArrowDown: 4,
    ArrowUp: 6,
    ArrowRight: 8,
  };

  const mounts = [];

  function ensureCanvas(host, className) {
    if (!host) return null;
    const existing = host.querySelector(`canvas.${className}`);
    if (existing) return existing;

    host.classList.add("level-ascii-zone");
    const canvas = document.createElement("canvas");
    canvas.className = `ascii-viz ascii-viz--region ${className}`;
    canvas.setAttribute("aria-hidden", "true");
    host.insertBefore(canvas, host.firstChild);
    return canvas;
  }

  function mountZone(host, className, variant) {
    const canvas = ensureCanvas(host, className);
    if (!canvas || !window.AsciiBg) return null;
    return AsciiBg.mount(canvas, {
      variant,
      sizeMode: "container",
      container: host,
      glyphColor: getComputedStyle(document.documentElement)
        .getPropertyValue("--level-glyph")
        .trim() || "#000",
    });
  }

  function pulseAll(fn) {
    mounts.forEach((viz) => {
      if (typeof fn === "function") fn(viz);
    });
  }

  function pulseLane(laneKey, strength = 1) {
    const band = LANE_BAND[laneKey] ?? 5;
    pulseAll((viz) => viz?.pulseLane?.(laneKey, band, strength));
  }

  function boot() {
    if (!window.AsciiBg) return;

    const shell = document.querySelector(".level-game");

    const shellViz = mountZone(shell, "ascii-viz--shell", "level-subtle");

    [shellViz].filter(Boolean).forEach((v) => mounts.push(v));

    const kick = () => mounts.forEach((viz) => viz?.start?.());

    document.addEventListener("level:start", kick);
    window.addEventListener("treemusic:play", kick);
    document.addEventListener("level:lane-hit", (event) => {
      pulseLane(event.detail?.key, event.detail?.strength ?? 1);
    });

    kick();
  }

  window.LevelAsciiBg = { pulseLane };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
