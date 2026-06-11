(function initGameSettingsPage() {
  const root = document.querySelector("[data-settings-root]");
  if (!root || !window.ControlSettings) return;

  const toggle = root.querySelector(".scheme-toggle");
  const buttons = [...root.querySelectorAll("[data-scheme]")];
  const glyphEls = {
    up: root.querySelector("[data-glyph-up]"),
    down: root.querySelector("[data-glyph-down]"),
    left: root.querySelector("[data-glyph-left]"),
    right: root.querySelector("[data-glyph-right]"),
  };
  const choiceNav = root.querySelector("[data-choice-nav]");
  const choiceConfirm = root.querySelector("[data-choice-confirm]");
  const choiceNote = root.querySelector("[data-choice-note]");

  function syncUi() {
    const id = ControlSettings.getSchemeId();
    const glyphs = ControlSettings.getGlyphs();
    const hint = ControlSettings.getChoiceHint();

    buttons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.scheme === id);
      btn.setAttribute("aria-pressed", btn.dataset.scheme === id ? "true" : "false");
    });

    if (glyphEls.up) glyphEls.up.textContent = glyphs.up;
    if (glyphEls.down) glyphEls.down.textContent = glyphs.down;
    if (glyphEls.left) glyphEls.left.textContent = glyphs.left;
    if (glyphEls.right) glyphEls.right.textContent = glyphs.right;

    if (choiceNav) {
      choiceNav.innerHTML = "";
      if (id === "wasd") {
        choiceNav.append(document.createTextNode("Move between options "));
        ["W", "S"].forEach((key) => {
          const kbd = document.createElement("kbd");
          kbd.textContent = key;
          choiceNav.appendChild(kbd);
          choiceNav.appendChild(document.createTextNode(" "));
        });
      } else {
        choiceNav.append(document.createTextNode("Move between options "));
        ["↑", "↓"].forEach((key) => {
          const kbd = document.createElement("kbd");
          kbd.textContent = key;
          choiceNav.appendChild(kbd);
          choiceNav.appendChild(document.createTextNode(" "));
        });
      }
    }

    if (choiceConfirm) {
      choiceConfirm.innerHTML = "";
      choiceConfirm.append(document.createTextNode("Confirm your pick — hold "));
      const keys = id === "wasd" ? ["A", "D"] : ["←", "→"];
      keys.forEach((key, i) => {
        if (i > 0) {
          choiceConfirm.appendChild(document.createTextNode(" and "));
        }
        const kbd = document.createElement("kbd");
        kbd.textContent = key;
        choiceConfirm.appendChild(kbd);
      });
      choiceConfirm.appendChild(document.createTextNode(" together"));
    }

    if (choiceNote) {
      choiceNote.textContent =
        id === "wasd"
          ? "W and S switch cards. Press A and D at the same time to lock in your choice."
          : "Arrow up and down switch cards. Press left and right arrows together to lock in your choice.";
    }

    root.dataset.scheme = id;
  }

  toggle?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-scheme]");
    if (!btn) return;
    ControlSettings.setSchemeId(btn.dataset.scheme);
    syncUi();
  });

  window.addEventListener("control-scheme:change", syncUi);
  syncUi();
})();
