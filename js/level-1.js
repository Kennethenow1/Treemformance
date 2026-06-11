(function initLevel1() {
  const CORRECT_ANSWER = 5;
  const LANE_KEYS = ["ArrowLeft", "ArrowDown", "ArrowUp", "ArrowRight"];
  const SCORE_START = 100;
  const SCORE_CORRECT_CARD = 30;
  const SCORE_WRONG_CARD = -25;
  const SCORE_WRONG_LANE = -12;
  const SCORE_PERFECT = 25;
  const SCORE_GOOD = 15;
  const SCORE_OK = 5;

  const SEQUENCE_CHART = [
    { key: "ArrowUp", type: "tap" },
    { key: "ArrowUp", type: "tap" },
    { key: "ArrowDown", type: "tap" },
    { key: "ArrowLeft", type: "tap" },
    { key: "ArrowRight", type: "tap" },
  ];
  const TILE_APPROACH_MS = 1300;
  const TILE_GAP_MS = 680;
  const TILE_HEIGHT = 44;
  const JUDGE_PERFECT = 14;
  const JUDGE_GOOD = 28;
  const JUDGE_OK = 44;
  const HIT_WINDOW_MS = 140;
  const JUDGE_TEXT = {
    [SCORE_PERFECT]: { text: "Perfect!", tier: "perfect" },
    [SCORE_GOOD]: { text: "Good!", tier: "good" },
    [SCORE_OK]: { text: "OK", tier: "ok" },
  };
  const CHOICE_DURATION_MS = 9000;
  const SEQUENCE_BREATH_MS = 650;
  const ASYNC_STEP_TIMEOUT_MS = 6000;
  const TREE_AUTO_FILL_MS = 400;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const countdownEl = document.getElementById("level-countdown");
  const countdownNum = document.getElementById("countdown-num");
  const questionEl = document.getElementById("level-question");
  const playWindow = document.getElementById("play-window");
  const levelGame = document.getElementById("level-game");
  const sequenceEl = document.getElementById("level-sequence");
  const tileStage = document.getElementById("tile-stage");
  const tileLanes = document.getElementById("tile-lanes");
  const tileReceptors = document.getElementById("tile-receptors");
  const tileJudge = document.getElementById("tile-judge");
  const promptEl = document.getElementById("level-prompt");
  const scoreEl = document.getElementById("score-value");
  const bleedEl = document.getElementById("level-bleed");
  const choiceTimerEl = document.getElementById("choice-timer");
  const choiceFillEl = document.getElementById("choice-timer-fill");
  const choicePressureEl = document.getElementById("choice-pressure");
  const tileHitzone = tileStage?.querySelector(".tile-rush__hitzone");
  const cards = document.querySelectorAll(".upgrade-card");
  function choiceHint() {
    return LevelChoiceInput?.getChoiceHint?.() ?? "↑ ↓ move · ← + → together to confirm";
  }

  function laneCodeFromEvent(e) {
    return ControlSettings?.toLaneCode?.(e.code) ?? e.code;
  }
  const choiceNav = LevelChoiceInput?.createNavigator?.({
    cards,
    getIsActive: () => phase === "question" && !choiceLocked,
    onPick: (card) => onCardPick(card),
  }) || { wire() {}, resetFocus() {}, resetHeld() {} };
  choiceNav.wire();
  const treeStage = document.getElementById("level-tree-stage");
  let treeMap = null;

  function ensureTree() {
    if (treeMap) return treeMap;
    if (!treeStage || !window.d3 || !window.TreeMap) return null;
    treeMap = TreeMap.mount(treeStage, {
      data: TreeMap.LEVEL1_DATA,
      mode: "fill",
      showAll: true,
    });
    return treeMap;
  }

  if (!countdownEl || !questionEl) return;

  let score = SCORE_START;
  const wrongLane = LevelInput?.createWrongLaneHandler?.({
    getNotes: () => tileNotes,
    showJudge,
    flashReceptor,
    lanePenalty: SCORE_WRONG_LANE,
    stageEl: tileStage,
    hitzoneEl: tileHitzone,
    penalizeWrong: (delta) => {
      score = Math.max(0, score + delta);
      if (scoreEl) scoreEl.textContent = score;
      LevelFeedback?.applyRhythmPenalty?.({ delta, scoreEl });
    },
  }) || { handle() { return false; }, reset() {} };
  let phase = "idle";
  let tileNotes = [];
  let tileFrame = null;
  let hitLineY = 0;
  let laneTilesEls = {};
  let receptorEls = {};
  let activeHold = null;
  let treeFillIndex = 0;
  let choiceFrame = null;
  let choiceStart = 0;
  let choiceLocked = false;
  let sequenceTransitioning = false;
  let sequenceArming = false;

  function setPrompt(text) {
    if (promptEl) promptEl.textContent = text;
  }

  function updateScore(delta) {
    score = Math.max(0, score + delta);
    if (scoreEl) {
      scoreEl.textContent = score;
      LevelFeedback?.applyDelta?.({ delta, scoreEl, bleedEl, levelGame });
    }
  }

  function cacheTileDom() {
    if (!tileLanes || !tileReceptors) return;
    laneTilesEls = {};
    receptorEls = {};
    tileLanes.querySelectorAll(".tile-lane").forEach((lane) => {
      laneTilesEls[lane.dataset.key] = lane.querySelector(".tile-lane__tiles");
    });
    tileReceptors.querySelectorAll(".tile-receptor").forEach((rec) => {
      receptorEls[rec.dataset.key] = rec;
    });
  }

  function measureHitLine() {
    const lane = tileLanes?.querySelector(".tile-lane");
    const tilesContainer = lane?.querySelector(".tile-lane__tiles");
    const hitline = tileStage?.querySelector(".tile-rush__hitline");
    if (!tilesContainer || !hitline) return 0;
    const containerRect = tilesContainer.getBoundingClientRect();
    const lineRect = hitline.getBoundingClientRect();
    hitLineY = lineRect.top - containerRect.top;
    return hitLineY;
  }

  function getTileHeight(note) {
    if (note?.el) return note.el.offsetHeight;
    return note?.type === "hold" ? 80 : TILE_HEIGHT;
  }

  function showJudge(text, tier) {
    if (tileJudge) {
      tileJudge.classList.remove("is-show");
      void tileJudge.offsetWidth;
      tileJudge.textContent = text;
      tileJudge.className = `tile-rush__judge tile-rush__judge--${tier}`;
      requestAnimationFrame(() => tileJudge.classList.add("is-show"));
    }
    setPrompt(text);
    LevelFeedback?.onJudge?.(tier);
  }

  function resetTreeForRhythm() {
    treeFillIndex = 0;
    ensureTree()?.setRhythmGhosts();
  }

  function restoreTreeForQuestion() {
    treeFillIndex = 0;
    ensureTree()?.showAllForQuestion();
  }

  function fillTreeNode({ auto = false } = {}) {
    const tree = ensureTree();
    if (!tree || treeFillIndex >= tree.fillCount) return false;
    tree.placeFillIndex(treeFillIndex, { auto });
    treeFillIndex += 1;
    return true;
  }

  async function completeMissingTreeNodes() {
    const fillDelay = prefersReducedMotion ? 100 : TREE_AUTO_FILL_MS;
    const tree = ensureTree();
    if (!tree) return;
    while (treeFillIndex < tree.fillCount) {
      fillTreeNode({ auto: true });
      await delay(fillDelay);
    }
  }

  function showTutorialBridge() {
    const bridge = document.getElementById("tutorial-bridge");
    if (!bridge) return;
    bridge.hidden = false;
    bridge.classList.add("is-open");
    bridge.setAttribute("aria-hidden", "false");
    document.body.classList.remove("is-playing");
    const continueBtn = document.getElementById("tutorial-continue");
    continueBtn?.focus();
  }

  async function finishSequence(hits, misses) {
    const tree = ensureTree();
    const hasGaps = tree && treeFillIndex < tree.fillCount;
    if (hasGaps) {
      setPrompt(misses > 0 ? "Completing missed nodes…" : "Completing tree…");
      await completeMissingTreeNodes();
    }
    phase = "done";
    setPrompt(`Tutorial complete — ${hits} hit, ${misses} missed · score ${score}`);
    await delay(prefersReducedMotion ? 400 : 900);
    showTutorialBridge();
  }

  function pulseHitFeedback(key, tier = "good") {
    LevelTiles?.pulseHitFeedback?.({ key, tier, receptorEls, tileStage, tileHitzone });
  }

  function hasHittableNote() {
    return tileNotes.some((n) => LevelMusic.isNoteInWindow(n));
  }

  function getJudgeScoreFromError(errorMs) {
    const tier = LevelMusic.getJudgeTierFromErrorMs(errorMs);
    if (tier === "perfect") return SCORE_PERFECT;
    if (tier === "good") return SCORE_GOOD;
    if (tier === "ok") return SCORE_OK;
    return null;
  }

  function buildTileChart() {
    return LevelMusic.buildSyncedNotes(SEQUENCE_CHART);
  }

  function spawnTileElements() {
    tileNotes.forEach((note) => {
      const container = laneTilesEls[note.key];
      if (!container) return;
      const el = document.createElement("div");
      el.className = `tile-note${note.type === "hold" ? " tile-note--hold" : ""}`;
      el.dataset.noteId = String(note.id);
      el.setAttribute("aria-hidden", "true");
      container.appendChild(el);
      note.el = el;
    });
  }

  function clearTiles() {
    tileNotes = [];
    activeHold = null;
    Object.values(laneTilesEls).forEach((c) => { if (c) c.innerHTML = ""; });
    Object.values(receptorEls).forEach((r) => {
      r.classList.remove("is-pressed", "is-hit-flash");
    });
    if (tileJudge) tileJudge.className = "tile-rush__judge";
    if (tileHitzone) tileHitzone.classList.remove("is-lit", "is-beat");
  }

  function updateTilePositions() {
    LevelTiles?.updateTilePositions?.(tileNotes, hitLineY, getTileHeight);
  }

  function pulseNoteBeat(note) {
    LevelMusic.markBeatFlashed(note);
    if (hitLineY > 0) {
      LevelMusic.applyTilePosition(note, hitLineY, getTileHeight(note));
    }
    if (tileHitzone && !note.judged) {
      tileHitzone.classList.remove("is-beat");
      void tileHitzone.offsetWidth;
      tileHitzone.classList.add("is-beat");
      setTimeout(() => tileHitzone.classList.remove("is-beat"), 100);
    }
  }

  function flashReceptor(key) {
    LevelFeedback?.onLaneHit?.(key, 0.85);
    const rec = receptorEls[key];
    if (!rec) return;
    rec.classList.add("is-pressed");
    setTimeout(() => rec.classList.remove("is-pressed"), 100);
  }

  function findHittableNote(key) {
    let best = null;
    let bestAbs = Infinity;

    tileNotes.forEach((note) => {
      if (note.judged || note.missed || note.key !== key) return;
      const errorMs = LevelMusic.getNoteTimingErrorMs(note);
      const pts = getJudgeScoreFromError(errorMs);
      const abs = Math.abs(errorMs);
      if (pts !== null && abs < bestAbs) {
        bestAbs = abs;
        best = note;
      }
    });

    return best;
  }

  function judgeNote(note) {
    const pts = getJudgeScoreFromError(LevelMusic.getNoteTimingErrorMs(note));
    if (pts === null) return false;

    const judge = JUDGE_TEXT[pts];
    note.judged = true;
    LevelTiles?.beginHitVisual?.(note, {
      hitLineY,
      getTileHeight,
      key: note.key,
      tier: judge.tier,
      receptorEls,
      tileStage,
      tileHitzone,
    });
    updateScore(pts);
    fillTreeNode();
    showJudge(judge.text, judge.tier);
    wrongLane.reset();
    return true;
  }

  function markNoteMissed(note) {
    LevelTiles?.markNoteMissed?.(note, {
      hitLineY,
      getTileHeight,
      showJudge,
      tileStage,
      tileHitzone,
    });
  }

  function allNotesResolved() {
    return tileNotes.length > 0 && tileNotes.every((n) => n.judged || n.missed);
  }

  function tileLoop() {
    if (phase !== "sequence") return;

    if (hitLineY < 40) measureHitLine();

    tileNotes.forEach((note) => {
      if (LevelMusic.shouldMissNote(note)) {
        markNoteMissed(note);
      } else if (LevelMusic.shouldPulseBeat(note)) {
        pulseNoteBeat(note);
      }
    });

    updateTilePositions();

    if (allNotesResolved()) {
      const hits = tileNotes.filter((n) => n.judged).length;
      const misses = tileNotes.filter((n) => n.missed).length;
      phase = "sequence-ending";
      stopTileRush();
      finishSequence(hits, misses);
      return;
    }

    tileFrame = requestAnimationFrame(tileLoop);
  }

  function applyTimingGuide() {
    if (!tileStage) return;
    tileStage.classList.add("tile-rush__stage--easy");
    tileStage.style.setProperty("--judge-perfect", `${JUDGE_PERFECT}px`);
    tileStage.style.setProperty("--judge-good", `${JUDGE_GOOD}px`);
    tileStage.style.setProperty("--judge-ok", `${JUDGE_OK}px`);
  }

  function clearTimingGuide() {
    tileStage?.classList.remove("tile-rush__stage--easy");
  }

  function stopTileRush() {
    if (tileFrame) {
      cancelAnimationFrame(tileFrame);
      tileFrame = null;
    }
    clearTimingGuide();
  }

  function formatSequenceLabel() {
    const glyphs = {
      ArrowUp: "↑",
      ArrowDown: "↓",
      ArrowLeft: "←",
      ArrowRight: "→",
    };
    return SEQUENCE_CHART.map((step) => glyphs[step.key] || "").join(" ");
  }

  async function measureTileStage() {
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        measureHitLine();
        requestAnimationFrame(() => {
          measureHitLine();
          resolve();
        });
      });
    });
  }

  /** Layout only — used while bridge popup is up (no chart / no scrolling yet). */
  async function prepTileRushLayout() {
    stopTileRush();
    clearTiles();
    applyTimingGuide();
    cacheTileDom();
    await measureTileStage();
  }

  /** Build chart from *now* so the first tile isn't already halfway down. */
  async function armAndStartTileRush() {
    await withTimeout(LevelMusic?.ensurePlaying?.(), ASYNC_STEP_TIMEOUT_MS);
    await withTimeout(LevelMusic?.waitForTrackSwitch?.(), ASYNC_STEP_TIMEOUT_MS);
    tileNotes = buildTileChart();
    spawnTileElements();
    await measureTileStage();
    updateTilePositions();
    beginTileRushLoop();
  }

  async function startTileRush() {
    stopTileRush();
    clearTiles();
    await LevelMusic?.waitForTrackSwitch?.();
    await LevelMusic?.ensurePlaying?.();
    applyTimingGuide();
    cacheTileDom();
    tileNotes = buildTileChart();
    spawnTileElements();
    await measureTileStage();
    updateTilePositions();
    beginTileRushLoop();
  }

  function beginTileRushLoop() {
    if (phase !== "sequence" || tileFrame) return;
    tileFrame = requestAnimationFrame(tileLoop);
  }

  async function scheduleSequenceStart() {
    if (sequenceArming || phase !== "sequence") return;
    sequenceArming = true;
    playWindow?.classList.add("is-sequence-breath");
    setPrompt("Get ready…");

    try {
      await delay(prefersReducedMotion ? 480 : SEQUENCE_BREATH_MS);
      if (phase !== "sequence") return;
      try {
        await withTimeout(armAndStartTileRush(), ASYNC_STEP_TIMEOUT_MS);
      } catch {
        LevelAudio?.unlockSync?.();
        await withTimeout(LevelMusic?.ensurePlaying?.(), 2500);
        tileNotes = buildTileChart();
        spawnTileElements();
        await measureTileStage();
        updateTilePositions();
        beginTileRushLoop();
      }
      const song = LevelMusic?.getActiveTrackLabel?.();
      setPrompt(song ? `Tap on the beat — ${song}` : "Tap on the beat!");
    } finally {
      playWindow?.classList.remove("is-sequence-breath");
      sequenceArming = false;
    }
  }

  function resumeAfterBackground() {
    if (document.visibilityState !== "visible") return;
    LevelAudio?.unlockSync?.();
    if (phase === "sequence" && !tileFrame && tileNotes.length) {
      beginTileRushLoop();
    }
  }

  function applyChoicePressure(_now, urgency) {
    LevelChoiceFx?.applyPressure?.(choicePressureEl, urgency, prefersReducedMotion);
  }

  function clearChoicePressure() {
    LevelChoiceFx?.clearPressure?.(choicePressureEl, levelGame);
    document.body.classList.remove("is-choice-pressure");
  }

  function stopChoiceTimer() {
    if (choiceFrame) {
      cancelAnimationFrame(choiceFrame);
      choiceFrame = null;
    }
    if (choiceTimerEl) {
      choiceTimerEl.hidden = true;
      choiceTimerEl.setAttribute("aria-hidden", "true");
    }
    if (choiceFillEl) choiceFillEl.style.width = "100%";
    clearChoicePressure();
  }

  function startChoiceTimer() {
    stopChoiceTimer();
    if (phase !== "question") return;

    choiceLocked = false;
    choiceStart = performance.now();

    if (choiceTimerEl) {
      choiceTimerEl.hidden = false;
      choiceTimerEl.setAttribute("aria-hidden", "false");
    }
    if (choiceFillEl) choiceFillEl.style.width = "100%";
    document.body.classList.add("is-choice-pressure");
    LevelChoiceFx?.applyPressure?.(choicePressureEl, 0, prefersReducedMotion);

    function tick(now) {
      if (phase !== "question" || choiceLocked) return;

      const elapsed = now - choiceStart;
      const remaining = Math.max(0, 1 - elapsed / CHOICE_DURATION_MS);
      const urgency = 1 - remaining;

      if (choiceFillEl) {
        choiceFillEl.style.width = `${remaining * 100}%`;
      }
      applyChoicePressure(now, urgency);

      if (remaining <= 0) {
        onChoiceTimeout();
        return;
      }

      choiceFrame = requestAnimationFrame(tick);
    }

    choiceFrame = requestAnimationFrame(tick);
  }

  function getCorrectCard() {
    return document.querySelector('.upgrade-card[data-correct="true"]');
  }

  function getWrongCards() {
    return [...cards].filter((c) => c.dataset.correct !== "true");
  }

  function resetCards() {
    LevelChoiceFx?.clearCardFx?.(cards);
    cards.forEach((c) => {
      c.disabled = false;
      c.hidden = false;
      c.classList.remove(
        "is-correct", "is-wrong", "is-crossed", "is-vanishing", "is-auto-picked"
      );
    });
    choiceNav.resetFocus();
  }

  function lockCards() {
    cards.forEach((c) => { c.disabled = true; });
  }

  function crossWrongCards() {
    getWrongCards().forEach((c) => c.classList.add("is-crossed"));
  }

  function autoSelectCorrect() {
    const correct = getCorrectCard();
    if (!correct) return;
    correct.classList.add("is-auto-picked");
    setTimeout(() => correct.classList.add("is-correct"), 520);
  }

  function advanceAfterChoice(prompt, delay = 580) {
    setPrompt(prompt);
    setTimeout(() => {
      if (phase === "sequence" || phase === "done" || sequenceTransitioning) return;
      choiceLocked = false;
      startSequence();
    }, delay);
  }

  function onChoiceTimeout() {
    if (phase !== "question" || choiceLocked) return;

    choiceLocked = true;
    stopChoiceTimer();
    lockCards();
    updateScore(SCORE_WRONG_CARD);
    crossWrongCards();
    setPrompt("Time's up…");
    setTimeout(() => {
      autoSelectCorrect();
      advanceAfterChoice("Correct answer chosen — match the sequence…", 1100);
    }, 450);
  }

  async function runCountdown() {
    phase = "countdown";
    countdownEl.setAttribute("aria-hidden", "false");
    countdownEl.classList.add("is-active");

    for (const n of [3, 2, 1]) {
      countdownNum.textContent = n;
      countdownNum.classList.remove("is-pop");
      void countdownNum.offsetWidth;
      countdownNum.classList.add("is-pop");
      await delay(850);
    }

    countdownNum.textContent = "GO";
    countdownNum.classList.remove("is-pop");
    void countdownNum.offsetWidth;
    countdownNum.classList.add("is-pop");
    await delay(500);

    countdownEl.classList.remove("is-active");
    countdownEl.setAttribute("aria-hidden", "true");
    showQuestion();
  }

  function showQuestion() {
    phase = "question";
    restoreTreeForQuestion();
    resetCards();
    questionEl.hidden = false;
    playWindow?.classList.add("is-question");
    sequenceEl.hidden = true;
    setPrompt(choiceHint());
    startChoiceTimer();
    TreeMap.scheduleResize?.(ensureTree());
  }

  function hideQuestion() {
    stopChoiceTimer();
    choiceNav.resetHeld();
    questionEl.hidden = true;
    playWindow?.classList.remove("is-question");
  }

  function onCardPick(card) {
    if (phase !== "question" || choiceLocked) return;

    choiceLocked = true;
    stopChoiceTimer();
    lockCards();
    LevelChoiceFx?.confirmChoice?.(card, cards);

    const isCorrect = card.dataset.correct === "true";

    if (isCorrect) {
      updateScore(SCORE_CORRECT_CARD);
      crossWrongCards();
      card.classList.add("is-correct");
      advanceAfterChoice("Correct! Match the sequence…", 380);
      return;
    }

    updateScore(SCORE_WRONG_CARD);
    card.classList.add("is-wrong");
    setPrompt("Wrong!");

    setTimeout(() => {
      card.classList.add("is-vanishing");
    }, 380);

    setTimeout(() => {
      card.hidden = true;
      autoSelectCorrect();
      advanceAfterChoice("Correct answer chosen — match the sequence…", 1100);
    }, 950);
  }

  async function startSequence() {
    if (phase === "sequence" || sequenceTransitioning) return;
    sequenceTransitioning = true;

    stopChoiceTimer();
    choiceNav.resetHeld();

    try {
      await LevelChoiceFx?.transitionToSequence?.({
        playWindow,
        questionEl,
        sequenceEl,
        choicePressureEl,
        levelGame,
        reducedMotion: prefersReducedMotion,
        bridgeTitle: "Match the sequence",
        bridgeSeq: formatSequenceLabel(),
        bridgeLede: "Get ready — tap on the beat",
        onSwap: () => {
          phase = "sequence";
          resetTreeForRhythm();
          TreeMap.scheduleResize?.(ensureTree());
        },
        onPrep: () => prepTileRushLayout(),
        onReveal: () => scheduleSequenceStart(),
      });
    } finally {
      sequenceTransitioning = false;
    }
  }

  function onSequenceKeyDown(key) {
    if (phase !== "sequence" || !LANE_KEYS.includes(key)) return;

    if (activeHold?.key === key) return;

    const note = findHittableNote(key);
    if (!note) {
      wrongLane.handle(key);
      return;
    }

    if (note.type === "hold") {
      flashReceptor(key);
      note.holding = true;
      activeHold = note;
      return;
    }

    judgeNote(note);
  }

  function onSequenceKeyUp(key) {
    if (phase !== "sequence" || !activeHold || activeHold.key !== key) return;

    const note = activeHold;
    const pts = getJudgeScoreFromError(LevelMusic.getNoteTimingErrorMs(note)) || SCORE_OK;

    const judge = JUDGE_TEXT[pts] || { text: "OK", tier: "ok" };
    note.judged = true;
    note.holding = false;
    activeHold = null;
    LevelTiles?.beginHitVisual?.(note, {
      hitLineY,
      getTileHeight,
      key: note.key,
      tier: judge.tier,
      receptorEls,
      tileStage,
      tileHitzone,
    });
    updateScore(pts);
    fillTreeNode();
    showJudge(judge.text, judge.tier);
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function withTimeout(promise, ms) {
    const op = promise ?? Promise.resolve();
    return Promise.race([
      op,
      delay(ms).then(() => Promise.reject(new Error("timeout"))),
    ]);
  }

  document.addEventListener("level:start", () => {
    score = SCORE_START;
    if (scoreEl) scoreEl.textContent = score;
    ensureTree()?.resize();
    setPrompt("");
    runCountdown();
  });

  document.addEventListener("keydown", (e) => {
    const code = laneCodeFromEvent(e);
    if (phase === "sequence" && LANE_KEYS.includes(code)) {
      e.preventDefault();
      onSequenceKeyDown(code);
    }
  });

  document.addEventListener("keyup", (e) => {
    const code = laneCodeFromEvent(e);
    if (phase === "sequence" && LANE_KEYS.includes(code)) {
      e.preventDefault();
      onSequenceKeyUp(code);
    }
  });

  document.addEventListener("visibilitychange", resumeAfterBackground);
  window.addEventListener("pageshow", resumeAfterBackground);

  LevelTiles?.bindRhythmTrackSwap?.({
    getPhase: () => phase,
    stopTileRush,
    clearTiles,
    startTileRush,
    setPrompt,
    getSongLabel: () => LevelMusic?.getActiveTrackLabel?.(),
  });

  requestAnimationFrame(() => {
    ensureTree();
    requestAnimationFrame(() => ensureTree()?.resize());
  });
})();
