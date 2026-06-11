/**
 * Full-density ASCII background on the main menu (index.html).
 * Button hovers pulse nearby glyphs through AsciiBg.pulseTone.
 */
(function initMenuBg() {
  function boot() {
    const canvas = document.getElementById("menu-viz");
    if (!canvas || !window.AsciiBg) return;

    const viz = AsciiBg.mount(canvas, { variant: "menu" });
    if (!viz) return;

    document.addEventListener("menu-tone", (event) => {
      viz.pulseTone(event.detail?.index ?? 0, 1);
      viz.start();
    });

    document.querySelectorAll(".menu .btn").forEach((btn, index) => {
      btn.addEventListener("mouseenter", () => viz.pulseTone(index, 0.75));
    });

    window.MenuBg = {
      unlockVizAudio: viz.unlockVizAudio,
      pulseTone: viz.pulseTone,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
