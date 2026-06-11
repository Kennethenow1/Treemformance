/**
 * Per-level colorways — smooth shift on load and between tutorial levels.
 */
(function initLevelTheme(global) {
  const STORAGE_KEY = "treeformance-level-theme";

  const THEMES = {
    1: {
      bg: "#f8f7fc",
      stage: "#e8e5f2",
      accent: "#7a72a8",
      accentSoft: "#d8d2ec",
      panel: "rgba(255, 255, 255, 0.9)",
      ink: "#14101f",
      shadow: "#2a2440",
      glyph: "#1a1428",
    },
    2: {
      bg: "#f5faf7",
      stage: "#dceee6",
      accent: "#5a9a82",
      accentSoft: "#c5e4d8",
      panel: "rgba(255, 255, 255, 0.9)",
      ink: "#0f1a16",
      shadow: "#1e3d32",
      glyph: "#122820",
    },
    3: {
      bg: "#fdf8f2",
      stage: "#f0e4d4",
      accent: "#c4864a",
      accentSoft: "#ecd9c0",
      panel: "rgba(255, 255, 255, 0.91)",
      ink: "#1f1408",
      shadow: "#4a3020",
      glyph: "#2a1c10",
    },
    4: {
      bg: "#f6f9fc",
      stage: "#dce8f2",
      accent: "#5a82a8",
      accentSoft: "#c0d8ec",
      panel: "rgba(255, 255, 255, 0.91)",
      ink: "#0c1420",
      shadow: "#1e3048",
      glyph: "#101c2a",
    },
    5: {
      bg: "#faf6fc",
      stage: "#e8dcf2",
      accent: "#8a62b0",
      accentSoft: "#d4c0e8",
      panel: "rgba(255, 255, 255, 0.91)",
      ink: "#180c24",
      shadow: "#3a2850",
      glyph: "#201030",
    },
  };

  function detectLevelId() {
    const fromClass = document.body.className.match(/level-page--(\d)/);
    if (fromClass) return fromClass[1];
    const fromPath = global.location?.pathname?.match(/level-(\d)/i);
    if (fromPath) return fromPath[1];
    return "1";
  }

  function applyTheme(theme, { animate = true } = {}) {
    const root = document.documentElement;
    if (animate) {
      document.body.classList.add("is-level-theme-shift");
    }

    root.style.setProperty("--level-bg", theme.bg);
    root.style.setProperty("--level-stage-bg", theme.stage);
    root.style.setProperty("--level-accent", theme.accent);
    root.style.setProperty("--level-accent-soft", theme.accentSoft);
    root.style.setProperty("--level-panel-bg", theme.panel);
    root.style.setProperty("--level-ink", theme.ink);
    root.style.setProperty("--level-shadow", theme.shadow);
    root.style.setProperty("--level-glyph", theme.glyph);

    root.style.setProperty("--color-bg", theme.bg);
    root.style.setProperty("--color-ink", theme.ink);
    root.style.setProperty("--color-grey-light", theme.accentSoft);
    root.style.setProperty("--color-grey-mid", theme.accent);

    try {
      global.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    } catch {
      // Ignore blocked storage
    }

    if (animate) {
      global.setTimeout(() => {
        document.body.classList.remove("is-level-theme-shift");
      }, 1600);
    }
  }

  function boot() {
    if (!document.body.classList.contains("level-page")) return;

    const levelId = detectLevelId();
    const theme = THEMES[levelId] || THEMES[1];

    let prev = null;
    try {
      prev = JSON.parse(global.sessionStorage.getItem(STORAGE_KEY) || "null");
    } catch {
      prev = null;
    }

    if (prev && prev.bg !== theme.bg) {
      applyTheme(prev, { animate: false });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => applyTheme(theme, { animate: true }));
      });
    } else {
      applyTheme(theme, { animate: true });
    }

    document.body.dataset.levelTheme = levelId;
  }

  global.LevelTheme = {
    apply(levelId) {
      applyTheme(THEMES[levelId] || THEMES[1], { animate: true });
    },
    nudgeHue(step = 1) {
      const id = detectLevelId();
      const keys = Object.keys(THEMES);
      const idx = Math.max(0, keys.indexOf(id) + step);
      applyTheme(THEMES[keys[idx % keys.length]] || THEMES[1], { animate: true });
    },
  };

  document.addEventListener("level:build-step", () => {
    document.body.classList.add("is-level-step-pulse");
    global.setTimeout(() => {
      document.body.classList.remove("is-level-step-pulse");
    }, 1500);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
