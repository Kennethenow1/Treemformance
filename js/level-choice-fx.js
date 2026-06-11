/**
 * Choice card visuals and the handoff to the piano phase.
 *
 * Level 1 uses transitionToSequence (exit animation + bridge popup + breath).
 * Other levels use breathThenBegin from level-tiles.js after the card confirms.
 */
(function initLevelChoiceFx(global) {
  const PREP_TIMEOUT_MS = 5000;

  function applyPressure(el, urgency, reducedMotion) {
    if (!el) return;
    const holeStart = reducedMotion ? 86 : 92;
    const holeEnd = reducedMotion ? 62 : 56;
    const hole = holeStart - urgency * (holeStart - holeEnd);
    el.hidden = false;
    el.style.setProperty("--vignette-hole", `${hole}%`);
  }

  function holdPressureAtEnd(el, reducedMotion) {
    applyPressure(el, 1, reducedMotion);
  }

  function clearPressure(el, levelGame) {
    if (el) {
      el.hidden = true;
      el.style.removeProperty("--vignette-hole");
    }
    if (levelGame) levelGame.style.transform = "";
  }

  function confirmChoice(card, cards) {
    if (!card || !cards?.length) return;

    const playWindow = card.closest(".play-window");
    playWindow?.classList.remove("is-choice-locking");
    void playWindow?.offsetWidth;
    playWindow?.classList.add("is-choice-locking");
    global.setTimeout(() => playWindow?.classList.remove("is-choice-locking"), 500);

    cards.forEach((c, i) => {
      c.classList.remove("is-focused");
      if (c !== card) {
        c.style.setProperty("--choice-dismiss-delay", `${i * 55}ms`);
        c.classList.add("is-choice-dismissed");
      } else {
        c.style.removeProperty("--choice-dismiss-delay");
      }
    });
    card.classList.add("is-choice-confirmed");
  }

  function clearCardFx(cards) {
    if (!cards?.length) return;
    const playWindow = cards[0]?.closest(".play-window");
    playWindow?.classList.remove(
      "is-choice-locking",
      "is-choice-exiting",
      "is-sequence-prep",
      "is-sequence-reveal"
    );
    cards.forEach((c) => {
      c.classList.remove("is-focused", "is-choice-confirmed", "is-choice-dismissed");
      c.style.removeProperty("--choice-dismiss-delay");
    });
  }

  function delay(ms) {
    return new Promise((resolve) => global.setTimeout(resolve, ms));
  }

  function cleanupTransition(playWindow, bridge, choicePressureEl, levelGame) {
    hideBridge(bridge);
    playWindow?.classList.remove(
      "is-choice-exiting",
      "is-sequence-prep",
      "is-sequence-reveal"
    );
    clearPressure(choicePressureEl, levelGame);
  }

  function ensureBridge(host) {
    let bridge = global.document.getElementById("sequence-bridge");
    if (bridge) return bridge;

    bridge = global.document.createElement("div");
    bridge.id = "sequence-bridge";
    bridge.className = "sequence-bridge";
    bridge.hidden = true;
    bridge.setAttribute("aria-hidden", "true");
    bridge.innerHTML = `
      <div class="sequence-bridge__backdrop" aria-hidden="true"></div>
      <div class="sequence-bridge__panel" role="dialog" aria-modal="true" aria-labelledby="sequence-bridge-title">
        <span class="sequence-bridge__tag">Rhythm</span>
        <h2 class="sequence-bridge__title" id="sequence-bridge-title">Match the sequence</h2>
        <p class="sequence-bridge__seq" id="sequence-bridge-seq"></p>
        <p class="sequence-bridge__lede" id="sequence-bridge-lede">Tap the arrows on the beat</p>
        <div class="sequence-bridge__pulse" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    (host || global.document.body).appendChild(bridge);
    return bridge;
  }

  function hideBridge(bridge) {
    if (!bridge) return;
    bridge.classList.remove("is-open", "is-leaving");
    bridge.hidden = true;
    bridge.setAttribute("aria-hidden", "true");
  }

  /**
   * Choice exits → bridge popup → prep piano off-screen → smooth reveal.
   */
  async function transitionToSequence({
    playWindow,
    questionEl,
    sequenceEl,
    choicePressureEl,
    levelGame,
    reducedMotion = false,
    bridgeTitle = "Match the sequence",
    bridgeSeq = "",
    bridgeLede = "Get ready…",
    onSwap,
    onPrep,
    onReveal,
  } = {}) {
    const exitMs = reducedMotion ? 120 : 220;
    const bridgeHoldMs = reducedMotion ? 280 : 460;
    const revealMs = reducedMotion ? 140 : 260;

    const bridge = ensureBridge(levelGame);

    try {
      clearPressure(choicePressureEl, levelGame);
      global.document.body.classList.remove("is-choice-pressure");

      playWindow?.classList.add("is-choice-exiting");
      await delay(exitMs);

      if (questionEl) questionEl.hidden = true;
      playWindow?.classList.remove("is-question", "is-choice-exiting");

      const titleEl = bridge.querySelector("#sequence-bridge-title");
      const seqEl = bridge.querySelector("#sequence-bridge-seq");
      const ledeEl = bridge.querySelector("#sequence-bridge-lede");

      if (titleEl) titleEl.textContent = bridgeTitle;
      if (seqEl) {
        seqEl.textContent = bridgeSeq;
        seqEl.hidden = !bridgeSeq;
      }
      if (ledeEl) ledeEl.textContent = bridgeLede;

      bridge.hidden = false;
      bridge.setAttribute("aria-hidden", "false");
      void bridge.offsetWidth;
      bridge.classList.add("is-open");

      if (sequenceEl) {
        sequenceEl.hidden = false;
        sequenceEl.removeAttribute("hidden");
      }
      playWindow?.classList.add("is-sequence-prep");

      onSwap?.();
      if (onPrep) {
        await Promise.race([
          Promise.resolve(onPrep()),
          delay(PREP_TIMEOUT_MS),
        ]);
      }

      await delay(bridgeHoldMs);

      bridge.classList.add("is-leaving");
      bridge.classList.remove("is-open");
      playWindow?.classList.remove("is-sequence-prep");
      playWindow?.classList.add("is-sequence-reveal");

      // Wait for breath + chart arm so tiles do not flash then vanish on cleanup.
      await Promise.resolve(onReveal?.());

      await delay(revealMs);
    } finally {
      cleanupTransition(playWindow, bridge, choicePressureEl, levelGame);
    }
  }

  global.LevelChoiceFx = {
    applyPressure,
    holdPressureAtEnd,
    clearPressure,
    confirmChoice,
    clearCardFx,
    transitionToSequence,
  };
})(window);
