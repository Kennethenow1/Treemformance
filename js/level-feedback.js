/**
 * Shared score / damage visual + audio feedback for levels.
 */
(function initLevelFeedback(global) {
  const reducedMotion = global.matchMedia("(prefers-reduced-motion: reduce)");

  function pulseClass(el, className, ms = 500) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    global.setTimeout(() => el.classList.remove(className), reducedMotion.matches ? 120 : ms);
  }

  function applyDelta({ delta, scoreEl, bleedEl, levelGame, choicePressure }) {
    if (!scoreEl || !delta) return;

    scoreEl.classList.remove("is-bump-up", "is-bump-down", "is-damage-flash");
    void scoreEl.offsetWidth;

    const scoreBox = scoreEl.closest(".level-hud__score");
    const pressure = choicePressure || document.getElementById("choice-pressure");

    if (delta < 0) {
      const amount = Math.abs(delta);
      scoreEl.classList.add("is-bump-down", "is-damage-flash");
      pulseClass(scoreBox, "is-score-hurt", 520);
      pulseClass(levelGame, "is-damage-shake", 480);
      pulseClass(bleedEl, "is-active", reducedMotion.matches ? 400 : 550);
      pulseClass(pressure, "is-damage-pulse", 400);
      global.LevelSfx?.playDamage?.(amount);
    } else if (delta > 0) {
      scoreEl.classList.add("is-bump-up");
      pulseClass(scoreBox, "is-score-heal", 380);
      global.LevelSfx?.playGain?.(delta);
    }
  }

  function onJudge(tier) {
    if (tier === "miss") global.LevelSfx?.playMiss?.();
    else if (tier === "perfect" || tier === "good" || tier === "ok") {
      global.LevelSfx?.playHit?.(tier);
    }
  }

  function onCardFocus(index = 0) {
    global.LevelSfx?.playFocus?.(index);
  }

  function onCardConfirm() {
    global.LevelSfx?.playConfirm?.();
  }

  function onLaneHit(key, strength = 1) {
    global.document.dispatchEvent(
      new CustomEvent("level:lane-hit", { detail: { key, strength } })
    );
  }

  /** Rhythm wrong-key penalty — score tick only, no bleed / screen shake */
  function applyRhythmPenalty({ delta, scoreEl }) {
    if (!scoreEl || !delta) return;

    scoreEl.classList.remove("is-bump-up", "is-damage-flash");
    void scoreEl.offsetWidth;

    if (delta < 0) {
      scoreEl.classList.add("is-bump-down");
      pulseClass(scoreEl.closest(".level-hud__score"), "is-score-hurt", 260);
    }
  }

  function onRhythmHit({ tier = "good", stageEl, hitzoneEl, receptorEl } = {}) {
    if (receptorEl) {
      receptorEl.classList.remove("is-hit-flash", "is-pressed");
      void receptorEl.offsetWidth;
      receptorEl.classList.add("is-hit-flash");
      global.setTimeout(() => receptorEl.classList.remove("is-hit-flash"), 200);
    }

    pulseClass(hitzoneEl, "is-rhythm-vibe", reducedMotion.matches ? 120 : 220);
    pulseClass(stageEl, "is-rhythm-vibe", reducedMotion.matches ? 120 : 240);

    if (tier === "perfect") {
      pulseClass(stageEl, "is-rhythm-perfect", reducedMotion.matches ? 100 : 180);
    }
  }

  function onRhythmMiss({ stageEl, hitzoneEl } = {}) {
    pulseClass(hitzoneEl, "is-rhythm-miss", reducedMotion.matches ? 140 : 300);
    pulseClass(stageEl, "is-rhythm-miss", reducedMotion.matches ? 140 : 320);
  }

  global.LevelFeedback = {
    applyDelta,
    applyRhythmPenalty,
    onJudge,
    onCardFocus,
    onCardConfirm,
    onLaneHit,
    onRhythmHit,
    onRhythmMiss,
  };
})(window);
