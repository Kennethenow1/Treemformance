/**
 * Rhythm lane input — receptor taps + wrong-input streak scoring.
 */
(function initLevelInput(global) {
  const WRONG_STREAK_LIMIT = 3;
  const WRONG_STREAK_BONUS = -18;

  function wireReceptorTaps() {
    const receptors = document.getElementById("tile-receptors");
    if (!receptors || receptors.dataset.inputWired === "1") return;
    receptors.dataset.inputWired = "1";

    receptors.querySelectorAll(".tile-receptor").forEach((rec) => {
      rec.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const code = rec.dataset.key;
        if (!code) return;
        document.dispatchEvent(
          new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true })
        );
      });
    });
  }

  function createWrongLaneHandler({
    getNotes,
    updateScore,
    penalizeWrong,
    showJudge,
    flashReceptor,
    lanePenalty,
    streakPenalty = WRONG_STREAK_BONUS,
    stageEl,
    hitzoneEl,
  }) {
    let streak = 0;

    function applyPenalty(amount) {
      if (typeof penalizeWrong === "function") {
        penalizeWrong(amount);
        return;
      }
      updateScore?.(amount);
    }

    return {
      reset() {
        streak = 0;
      },
      handle(key) {
        const notes = getNotes?.() || [];
        if (!notes.some((n) => !n.judged && !n.missed)) return false;

        streak += 1;
        flashReceptor?.(key);
        applyPenalty(lanePenalty);
        global.LevelFeedback?.onRhythmMiss?.({ stageEl, hitzoneEl });
        showJudge("Wrong!", "miss");

        if (streak >= WRONG_STREAK_LIMIT) {
          applyPenalty(streakPenalty);
          streak = 0;
          showJudge("3 wrong!", "miss");
        }
        return true;
      },
    };
  }

  function boot() {
    wireReceptorTaps();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.LevelInput = {
    wireReceptorTaps,
    createWrongLaneHandler,
    WRONG_STREAK_LIMIT,
  };
})(window);
