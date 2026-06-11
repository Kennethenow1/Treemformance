/**
 * Control scheme — arrow keys or WASD (persisted in localStorage).
 */
(function initControlSettings(global) {
  const STORAGE_KEY = "treeformance-control-scheme";
  const LANE_KEYS = ["ArrowLeft", "ArrowDown", "ArrowUp", "ArrowRight"];

  const SCHEMES = {
    arrows: {
      id: "arrows",
      label: "Arrow keys",
      choice: {
        up: "ArrowUp",
        down: "ArrowDown",
        confirmA: "ArrowLeft",
        confirmB: "ArrowRight",
      },
      glyphs: { left: "←", down: "↓", up: "↑", right: "→" },
      choiceHint: "↑ ↓ move · ← + → together to confirm",
    },
    wasd: {
      id: "wasd",
      label: "WASD",
      choice: {
        up: "KeyW",
        down: "KeyS",
        confirmA: "KeyA",
        confirmB: "KeyD",
      },
      glyphs: { left: "A", down: "S", up: "W", right: "D" },
      choiceHint: "W S move · A + D together to confirm",
    },
  };

  const WASD_TO_LANE = {
    KeyW: "ArrowUp",
    KeyA: "ArrowLeft",
    KeyS: "ArrowDown",
    KeyD: "ArrowRight",
  };

  function readSchemeId() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SCHEMES[stored]) return stored;
    } catch {
      // Ignore blocked storage
    }
    return "arrows";
  }

  let activeSchemeId = readSchemeId();

  function getScheme() {
    return SCHEMES[activeSchemeId] ?? SCHEMES.arrows;
  }

  function getSchemeId() {
    return activeSchemeId;
  }

  function setSchemeId(id) {
    if (!SCHEMES[id] || id === activeSchemeId) return activeSchemeId;
    activeSchemeId = id;
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Ignore blocked storage
    }
    global.dispatchEvent(
      new CustomEvent("control-scheme:change", { detail: { id: activeSchemeId } })
    );
    return activeSchemeId;
  }

  function toLaneCode(code) {
    if (!code) return null;
    if (LANE_KEYS.includes(code)) return code;
    if (activeSchemeId === "wasd" && WASD_TO_LANE[code]) return WASD_TO_LANE[code];
    return null;
  }

  function getChoiceKeys() {
    return getScheme().choice;
  }

  function getChoiceHint() {
    return getScheme().choiceHint;
  }

  function getGlyphs() {
    return { ...getScheme().glyphs };
  }

  function getLaneKeys() {
    return LANE_KEYS;
  }

  function syncChoiceHints() {
    const hint = getChoiceHint();
    document.querySelectorAll("[data-choice-hint]").forEach((el) => {
      el.textContent = hint;
    });
  }

  global.addEventListener("control-scheme:change", syncChoiceHints);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncChoiceHints);
  } else {
    syncChoiceHints();
  }

  global.ControlSettings = {
    SCHEMES,
    LANE_KEYS,
    getSchemeId,
    getScheme,
    setSchemeId,
    toLaneCode,
    getChoiceKeys,
    getChoiceHint,
    getGlyphs,
    getLaneKeys,
    syncChoiceHints,
  };
})(window);
