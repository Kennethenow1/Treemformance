(function initLevelModal() {
  const modal = document.getElementById("tutorial-modal");
  const gotItBtn = document.getElementById("tutorial-gotit");

  if (!modal || !gotItBtn) return;

  function wrapTutorialScrollPanels() {
    document.querySelectorAll(".tutorial-modal__panel").forEach((panel) => {
      if (panel.querySelector(":scope > .tutorial-modal__scroll")) return;

      const scroll = document.createElement("div");
      scroll.className = "tutorial-modal__scroll";
      while (panel.firstChild) scroll.appendChild(panel.firstChild);
      panel.appendChild(scroll);

      const syncScrollFade = () => {
        panel.classList.toggle("is-scrolled", scroll.scrollTop > 6);
        panel.classList.toggle(
          "is-scrollable",
          scroll.scrollHeight > scroll.clientHeight + 4
        );
      };

      scroll.addEventListener("scroll", syncScrollFade, { passive: true });
      requestAnimationFrame(syncScrollFade);
      window.addEventListener("resize", syncScrollFade, { passive: true });
    });
  }

  function openModal() {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.remove("is-playing");
    gotItBtn.focus();
  }

  async function closeModal() {
    window.LevelSfx?.playConfirm?.();
    window.LevelAudio?.unlockSync?.();
    if (!window.TreeMusic?.isPlaying?.()) {
      await window.LevelMusic?.beginLevelFromGesture?.();
    }
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.add("is-playing");
    document.dispatchEvent(new CustomEvent("level:start"));
  }

  gotItBtn.addEventListener("click", () => {
    closeModal();
  });

  if (window.LevelChoiceInput?.attachDualKeyConfirm) {
    window.LevelChoiceInput.attachDualKeyConfirm({
      getIsActive: () => modal.classList.contains("is-open"),
      onConfirm: closeModal,
    });
  }

  document.querySelectorAll(".tutorial-modal").forEach((tutorialModal) => {
    if (tutorialModal === modal) return;
    const trigger = tutorialModal.querySelector(".tutorial-modal__gotit");
    if (!trigger) return;

    window.LevelChoiceInput?.attachDualKeyConfirm?.({
      getIsActive: () =>
        tutorialModal.classList.contains("is-open") && !tutorialModal.hidden,
      onConfirm: () => {
        if (trigger.tagName === "A" && trigger.href) {
          window.location.href = trigger.href;
        } else {
          trigger.click();
        }
      },
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });

  function mountTutorialTree() {
    const stage = document.getElementById("tutorial-tree-stage");
    if (!stage || !window.TreeMap) return;

    const script = document.querySelector('script[src*="level-5.js"]')
      ? "level5"
      : document.querySelector('script[src*="level-4.js"]')
        ? "level4"
        : document.querySelector('script[src*="level-3.js"]')
          ? "level3"
          : document.querySelector('script[src*="level-2.js"]')
            ? "level2"
            : "level1";
    requestAnimationFrame(() => {
      const map = TreeMap.mountTutorial(stage, script);
      requestAnimationFrame(() => {
        map?.resize();
        map?.panToFit?.({ duration: 0, padding: 40 });
      });
    });
  }

  async function init() {
    wrapTutorialScrollPanels();
    mountTutorialTree();

    const bootReady = window.LevelBoot?.whenReady?.() ?? Promise.resolve();
    const bootTimeout = new Promise((resolve) => {
      window.setTimeout(resolve, 10000);
    });
    await Promise.race([bootReady, bootTimeout]);

    document.documentElement.classList.remove("is-level-booting");
    document.getElementById("level-boot")?.remove();
    openModal();
  }

  init();
})();
