(function initLevel2() {
  const LANE_KEYS = ["ArrowLeft", "ArrowDown", "ArrowUp", "ArrowRight"];
  const KEY_ARROW = {
    ArrowLeft: "←",
    ArrowDown: "↓",
    ArrowUp: "↑",
    ArrowRight: "→",
  };
  const SCORE_START = 100;
  const SCORE_CORRECT_CARD = 30;
  const SCORE_WRONG_CARD = -25;
  const SCORE_WRONG_LANE = -12;
  const SCORE_PERFECT = 25;
  const SCORE_GOOD = 15;
  const SCORE_OK = 5;
  const TILE_APPROACH_MS = 1300;
  const TILE_GAP_MS = 680;
  const TILE_HEIGHT = 44;
  const JUDGE_PERFECT = 14;
  const JUDGE_GOOD = 28;
  const JUDGE_OK = 44;
  const HIT_WINDOW_MS = 140;
  const CHOICE_DURATION_MS = 9000;
  const STEP_GAP_MS = 900;
  const JUDGE_TEXT = {
    [SCORE_PERFECT]: { text: "Perfect!", tier: "perfect" },
    [SCORE_GOOD]: { text: "Good!", tier: "good" },
    [SCORE_OK]: { text: "OK", tier: "ok" },
  };
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const NUMBER_POOL = [2, 5, 6, 8, 12];
  const PLACEABLE = [5, 12, 2, 6];

  const BUILD_STEPS = [
    {
      parentNode: "root",
      targetNode: "5",
      edge: "root-5",
      parentValue: 8,
      sideLabel: "left",
      correct: 5,
      sequence: [
        { key: "ArrowLeft", type: "tap" },
        { key: "ArrowDown", type: "tap" },
      ],
    },
    {
      parentNode: "root",
      targetNode: "12",
      edge: "root-12",
      parentValue: 8,
      sideLabel: "right",
      correct: 12,
      sequence: [
        { key: "ArrowRight", type: "tap" },
        { key: "ArrowUp", type: "tap" },
        { key: "ArrowRight", type: "tap" },
      ],
    },
    {
      parentNode: "5",
      targetNode: "2",
      edge: "5-2",
      parentValue: 5,
      sideLabel: "left",
      correct: 2,
      sequence: [
        { key: "ArrowLeft", type: "tap" },
        { key: "ArrowLeft", type: "tap" },
        { key: "ArrowDown", type: "tap" },
        { key: "ArrowLeft", type: "tap" },
      ],
    },
    {
      parentNode: "5",
      targetNode: "6",
      edge: "5-6",
      parentValue: 5,
      sideLabel: "right",
      correct: 6,
      sequence: [
        { key: "ArrowRight", type: "tap" },
        { key: "ArrowDown", type: "tap" },
      ],
    },
  ];

  const countdownEl = document.getElementById("level-countdown");
  const countdownNum = document.getElementById("countdown-num");
  const questionEl = document.getElementById("level-question");
  const questionTitle = document.getElementById("reward-title");
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
  const cardLeft = document.getElementById("card-left");
  const cardRight = document.getElementById("card-right");
  const cards = [cardLeft, cardRight].filter(Boolean);
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
  const numberPoolChips = document.getElementById("number-pool-chips");
  let treeMap = null;
  let remaining = new Set(PLACEABLE);

  function ensureTree() {
    if (treeMap) return treeMap;
    if (!treeStage || !window.d3 || !window.TreeMap) return null;
    treeMap = TreeMap.mount(treeStage, {
      data: TreeMap.LEVEL2_DATA,
      mode: "build",
      visibleIds: ["root"],
    });
    return treeMap;
  }

  if (!countdownEl || !questionEl || cards.length < 2) return;

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
  let stepIndex = 0;
  let tileNotes = [];
  let tileFrame = null;
  let hitLineY = 0;
  let laneTilesEls = {};
  let receptorEls = {};
  let activeHold = null;
  let choiceFrame = null;
  let choiceStart = 0;
  let choiceLocked = false;
  let nodePlacedThisStep = false;

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

  function formatSeq(chart) {
    return chart.map((entry) => KEY_ARROW[entry.key] || "").join(" ");
  }

  function initNumberPool() {
    if (!numberPoolChips) return;
    numberPoolChips.innerHTML = "";
    NUMBER_POOL.forEach((n) => {
      const li = document.createElement("li");
      li.className = "number-pool__chip";
      li.dataset.value = String(n);
      li.innerHTML =
        `<span class="number-pool__chip-num">${n}</span><span class="number-pool__chip-cross" aria-hidden="true"></span>`;
      numberPoolChips.appendChild(li);
    });
    crossOutNumber(8);
  }

  function crossOutNumber(value) {
    const chip = numberPoolChips?.querySelector(`[data-value="${value}"]`);
    if (!chip || chip.classList.contains("is-used")) return;
    chip.classList.add("is-used");
  }

  function resetNumberPool() {
    numberPoolChips?.querySelectorAll(".number-pool__chip").forEach((chip) => {
      chip.classList.remove("is-used");
    });
    crossOutNumber(8);
  }

  function initTreeState() {
    remaining = new Set(PLACEABLE);
    resetNumberPool();
    ensureTree()?.resetBuild();
  }

  function showPendingBranch(step) {
    ensureTree()?.showPendingBranch(step.parentNode, step.targetNode);
  }

  function advanceBuildOnHit() {
    const step = BUILD_STEPS[stepIndex];
    if (!step) return;

    const total = step.sequence.length;
    const hitIndex = tileNotes.filter((n) => n.judged).length - 1;

    const tree = ensureTree();
    if (!tree) return;

    if (total <= 1) {
      tree.setLinkProgress(step.edge, 1);
      revealCurrentNode(false);
      return;
    }

    if (hitIndex < total - 1) {
      tree.setLinkProgress(step.edge, (hitIndex + 1) / (total - 1));
      return;
    }

    tree.setLinkProgress(step.edge, 1);
    revealCurrentNode(false);
  }

  function revealCurrentNode(auto = false) {
    const step = BUILD_STEPS[stepIndex];
    const tree = ensureTree();
    if (!step || nodePlacedThisStep || !tree) return;

    tree.setLinkProgress(step.edge, 1);
    tree.unhighlight(step.parentNode);
    tree.placeNode(step.targetNode, { auto, label: step.correct });
    remaining.delete(step.correct);
    crossOutNumber(step.correct);
    nodePlacedThisStep = true;
  }

  function getLevel2PlayerTree() {
    if (!window.TreeOptimal) return null;
    let tree = null;
    const values = [8];
    for (let i = 0; i < stepIndex; i++) {
      values.push(BUILD_STEPS[i].correct);
    }
    for (const value of values) {
      tree = TreeOptimal.bstInsert(tree, value).tree;
    }
    return tree;
  }

  function pickPoolWrong(correct) {
    const tree = getLevel2PlayerTree();
    if (tree && window.TreeOptimal?.pickDistinctSlotWrong) {
      const wrong = TreeOptimal.pickDistinctSlotWrong(tree, correct, remaining);
      if (wrong !== correct) return wrong;
    }

    const options = [...remaining].filter((n) => n !== correct);
    if (options.length) {
      return options[Math.floor(Math.random() * options.length)];
    }
    return NUMBER_POOL.find((n) => n !== correct && n !== 8) ?? correct;
  }

  function setupQuestionCards(step) {
    const tree = getLevel2PlayerTree();
    let wrong = pickPoolWrong(step.correct);
    if (wrong === step.correct) {
      wrong = NUMBER_POOL.find((n) => n !== step.correct && n !== 8) ?? step.correct;
    }
    const correctLabel =
      tree && window.TreeOptimal
        ? TreeOptimal.getInsertLabel(tree, step.correct)
        : `${step.sideLabel} of ${step.parentValue}`;
    const wrongLabel =
      tree && window.TreeOptimal && wrong !== step.correct
        ? TreeOptimal.getInsertLabel(tree, wrong)
        : "different branch";

    if (questionTitle) {
      questionTitle.innerHTML = `What number goes <strong>${correctLabel}</strong>?`;
    }

    const correctOnLeft = Math.random() < 0.5;
    const correctCard = correctOnLeft ? cardLeft : cardRight;
    const wrongCard = correctOnLeft ? cardRight : cardLeft;
    const wrongSeq = formatSeq([...step.sequence].reverse());

    correctCard.querySelector(".upgrade-card__value").textContent = step.correct;
    correctCard.querySelector(".upgrade-card__effect").textContent = correctLabel;
    correctCard.querySelector(".upgrade-card__seq").textContent = formatSeq(step.sequence);
    correctCard.dataset.correct = "true";
    correctCard.dataset.value = String(step.correct);
    correctCard.dataset.mode = "l2";

    wrongCard.querySelector(".upgrade-card__value").textContent = wrong;
    wrongCard.querySelector(".upgrade-card__effect").textContent = wrongLabel;
    wrongCard.querySelector(".upgrade-card__seq").textContent = wrongSeq;
    wrongCard.dataset.correct = "false";
    wrongCard.dataset.value = String(wrong);
    wrongCard.dataset.mode = "l2";
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
    const step = BUILD_STEPS[stepIndex];
    const chart = step?.sequence || [];
    return LevelMusic.buildSyncedNotes(chart);
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
    wrongLane.reset();
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
    showJudge(judge.text, judge.tier);
    wrongLane.reset();
    advanceBuildOnHit();
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

  function pulseHitFeedback(key, tier = "good") {
    LevelTiles?.pulseHitFeedback?.({ key, tier, receptorEls, tileStage, tileHitzone });
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

  async function startTileRush() {
    nodePlacedThisStep = false;
    await LevelTiles?.armSession?.({
      phaseCheck: () => phase === "sequence",
      stopTileRush,
      clearTiles,
      applyTimingGuide,
      cacheTileDom,
      buildChart: buildTileChart,
      onNotes: (notes) => { tileNotes = notes; },
      spawnTileElements,
      measureHitLine,
      updateTilePositions,
      beginLoop: () => {
        tileFrame = requestAnimationFrame(tileLoop);
      },
    });
  }

  async function finishSequence(hits, misses) {
    const step = BUILD_STEPS[stepIndex];
    const tree = ensureTree();
    const buildProgress = tree?.linkState[step?.edge]?.progress || 0;

    if (buildProgress < 1 && step?.edge && tree) {
      setPrompt("Finishing branch…");
      await delay(prefersReducedMotion ? 150 : 320);
      tree.setLinkProgress(step.edge, 1);
    }

    if (!nodePlacedThisStep) {
      if (misses > 0) setPrompt("Placing node…");
      await delay(prefersReducedMotion ? 150 : misses > 0 ? 400 : 0);
      revealCurrentNode(misses > 0);
    }

    stepIndex += 1;
    document.dispatchEvent(new CustomEvent("level:build-step", { detail: { step: stepIndex } }));

    if (sequenceEl) sequenceEl.hidden = true;

    if (stepIndex < BUILD_STEPS.length) {
      await delay(prefersReducedMotion ? STEP_GAP_MS * 0.4 : STEP_GAP_MS);
      startBuildStep();
      return;
    }

    phase = "done";
    setPrompt(`Tutorial complete — score ${score}`);
    await delay(prefersReducedMotion ? 400 : 900);
    showTutorialBridge();
  }

  function showTutorialBridge() {
    const bridge = document.getElementById("tutorial-bridge");
    if (!bridge) return;
    bridge.hidden = false;
    bridge.classList.add("is-open");
    bridge.setAttribute("aria-hidden", "false");
    document.body.classList.remove("is-playing");
    document.getElementById("tutorial-continue")?.focus();
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
    return cards.filter((c) => c.dataset.correct !== "true");
  }

  function resetCards() {
    LevelChoiceFx?.clearCardFx?.(cards);
    cards.forEach((c) => {
      c.disabled = false;
      c.hidden = false;
      c.classList.remove(
        "is-correct", "is-wrong", "is-crossed", "is-vanishing", "is-auto-picked"
      );
      delete c.dataset.correct;
      delete c.dataset.value;
      delete c.dataset.mode;
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
      if (phase === "sequence" || phase === "done") return;
      choiceLocked = false;
      startSequence();
    }, delay);
  }

  function onChoiceTimeout() {
    if (phase !== "question" || choiceLocked) return;

    const step = BUILD_STEPS[stepIndex];
    choiceLocked = true;
    stopChoiceTimer();
    lockCards();
    updateScore(SCORE_WRONG_CARD);
    crossWrongCards();
    setPrompt("Time's up…");
    setTimeout(() => {
      autoSelectCorrect();
      advanceAfterChoice(`Building ${step.correct}…`, 1100);
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
    startBuildStep();
  }

  function showQuestion() {
    const step = BUILD_STEPS[stepIndex];
    if (!step) return;

    phase = "question";
    resetCards();
    setupQuestionCards(step);
    questionEl.hidden = false;
    playWindow?.classList.add("is-question");
    sequenceEl.hidden = true;
    setPrompt(`${choiceHint()} · ${remaining.size} left in pool`);
    startChoiceTimer();
    TreeMap.scheduleResize?.(ensureTree());
  }

  function hideQuestion() {
    stopChoiceTimer();
    choiceNav.resetHeld();
    questionEl.hidden = true;
    playWindow?.classList.remove("is-question");
  }

  function startBuildStep() {
    if (stepIndex >= BUILD_STEPS.length) return;

    if (remaining.size === 1) {
      const step = BUILD_STEPS[stepIndex];
      showPendingBranch(step);
      setPrompt(`Placing ${step.correct}…`);
      setTimeout(() => startSequence(), prefersReducedMotion ? 200 : 500);
      return;
    }

    showPendingBranch(BUILD_STEPS[stepIndex]);
    showQuestion();
  }

  function onCardPick(card) {
    if (phase !== "question" || choiceLocked) return;

    const step = BUILD_STEPS[stepIndex];
    choiceLocked = true;
    stopChoiceTimer();
    lockCards();
    LevelChoiceFx?.confirmChoice?.(card, cards);

    const isCorrect = card.dataset.correct === "true";

    if (isCorrect) {
      updateScore(SCORE_CORRECT_CARD);
      crossWrongCards();
      card.classList.add("is-correct");
      advanceAfterChoice(`Building ${step.correct}…`, 720);
      return;
    }

    updateScore(SCORE_WRONG_CARD);
    card.classList.add("is-wrong");
    setPrompt(`Wrong — ${step.correct} belongs here`);

    setTimeout(() => {
      card.classList.add("is-vanishing");
    }, 380);

    setTimeout(() => {
      card.hidden = true;
      autoSelectCorrect();
      advanceAfterChoice(`Building ${step.correct}…`, 1100);
    }, 950);
  }

  function startSequence() {
    const step = BUILD_STEPS[stepIndex];
    phase = "sequence";
    hideQuestion();
    if (sequenceEl) {
      sequenceEl.hidden = false;
      sequenceEl.removeAttribute("hidden");
    }
    const song = LevelMusic?.getActiveTrackLabel?.();
    const promptAfter = song
      ? `Tap on the beat — place ${step.correct} · ${song}`
      : `Tap on the beat — place ${step.correct}`;
    LevelTiles?.breathThenBegin?.({
      playWindow,
      phaseCheck: () => phase === "sequence",
      setPrompt,
      promptAfter,
      reducedMotion: prefersReducedMotion,
      begin: () => startTileRush(),
    });
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
    showJudge(judge.text, judge.tier);
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  document.addEventListener("level:start", () => {
    score = SCORE_START;
    stepIndex = 0;
    if (scoreEl) scoreEl.textContent = score;
    initNumberPool();
    ensureTree()?.resize();
    initTreeState();
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

  LevelTiles?.bindRhythmTrackSwap?.({
    getPhase: () => phase,
    stopTileRush,
    clearTiles,
    startTileRush,
    setPrompt,
    getSongLabel: () => LevelMusic?.getActiveTrackLabel?.(),
  });

  initNumberPool();
  requestAnimationFrame(() => {
    ensureTree();
    requestAnimationFrame(() => ensureTree()?.resize());
  });
})();
