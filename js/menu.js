(function initMenu() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");

  function readSpringProfile(btn) {
    const style = getComputedStyle(btn);
    return {
      tiltX: parseFloat(style.getPropertyValue("--tilt-strength-x")) || 12,
      tiltY: parseFloat(style.getPropertyValue("--tilt-strength-y")) || 16,
      lift: parseFloat(style.getPropertyValue("--lift")) || -5,
    };
  }

  function bindButtonTilt() {
    if (!canHover.matches || reducedMotion.matches) return;

    document.querySelectorAll(".menu .btn").forEach((btn) => {
      if (btn.dataset.tiltBound === "1") return;
      btn.dataset.tiltBound = "1";

      const profile = readSpringProfile(btn);

      btn.addEventListener("mousemove", (event) => {
        const rect = btn.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width - 0.5;
        const py = (event.clientY - rect.top) / rect.height - 0.5;

        btn.style.setProperty("--tilt-y", `${px * profile.tiltY}deg`);
        btn.style.setProperty("--tilt-x", `${-py * profile.tiltX}deg`);
        btn.style.setProperty("--lift-x", `${profile.lift * 0.65}px`);
        btn.style.setProperty("--lift-y", `${profile.lift}px`);
        btn.classList.add("is-hot");
      });

      btn.addEventListener("mouseleave", () => {
        btn.style.setProperty("--tilt-x", "0deg");
        btn.style.setProperty("--tilt-y", "0deg");
        btn.style.setProperty("--lift-x", "0px");
        btn.style.setProperty("--lift-y", "0px");
        btn.classList.remove("is-hot");
      });
    });
  }

  function boot() {
    bindButtonTilt();
  }

  canHover.addEventListener("change", bindButtonTilt);
  reducedMotion.addEventListener("change", bindButtonTilt);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
