(function initLevel5() {
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
  const SCORE_GOAL_PICK = 12;
  const SCORE_WRONG_LANE = -12;
  const SCORE_PERFECT = 25;
  const SCORE_GOOD = 15;
  const SCORE_OK = 5;
  const TILE_APPROACH_MS = 1300;
  const TILE_GAP_MS = 600;
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

  const GOAL_TREE = TreeOptimal.LEVEL5_GOAL;
  const NUMBER_POOL = TreeOptimal.LEVEL5_POOL;
  const GOAL_ORDER = TreeOptimal.LEVEL5_GOAL_ORDER;
  const GOAL_PAN_IDS = TreeOptimal.collectGoalPanIds(GOAL_TREE);
  const TOTAL_STEPS = NUMBER_POOL.length;
  const GAME_LAYOUT = TreeMap.SLANT_GAME_LAYOUT_L5;
  const INTRO_LAYOUT = { ...GAME_LAYOUT, padX: 68, padY: 60 };
  const COMPARE_LAYOUT = { ...GAME_LAYOUT, padX: 68, padY: 60, camera: false };

  /** Per-step question mode: l3 = free pick, l2 = left/right with penalty */
  const L5_QUESTION_MODES = [
    "l3", "l2", "l2", "l3", "l2", "l3", "l2", "l3", "l2", "l2", "l3",
  ];
  const L5_PLAY_CHART_MIN = 9;
  const L5_PLAY_CHART_MAX = 13;

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
  const goalStage = document.getElementById("level-goal-stage");
  const goalIntroEl = document.getElementById("goal-intro");
  const goalIntroStage = document.getElementById("goal-intro-stage");
  const goalIntroHint = document.getElementById("goal-intro-hint");
  const goalIntroGotIt = document.getElementById("goal-intro-gotit");
  const compareModal = document.getElementById("compare-modal");
  const compareLede = document.getElementById("compare-lede");
  const compareIssues = document.getElementById("compare-issues");
  const compareYoursStage = document.getElementById("compare-yours-stage");
  const compareGoalStage = document.getElementById("compare-goal-stage");
  const compareMatchPct = document.getElementById("compare-match-pct");
  const compareMatchFill = document.getElementById("compare-match-fill");
  const compareScoreBefore = document.getElementById("compare-score-before");
  const comparePenaltyRow = document.getElementById("compare-penalty-row");
  const comparePenaltyEl = document.getElementById("compare-penalty");
  const compareScoreFinal = document.getElementById("compare-score-final");
  const compareActions = document.getElementById("compare-actions");
  const numberPoolChips = document.getElementById("number-pool-chips");
  let treeMap = null;
  let goalMap = null;
  let playerTree = null;
  let chosenValue = null;
  let remaining = new Set(NUMBER_POOL);
  let currentChoices = null;
  let insertPreview = null;
  let pendingEdge = null;
  let compareYoursMap = null;
  let compareGoalMap = null;

  function ensureTree() {
    if (!treeStage || !window.d3 || !window.TreeMap) return null;
    if (!treeMap) {
      treeMap = TreeMap.mount(treeStage, {
        data: { id: "pending", value: "?", children: [] },
        mode: "build",
        showAll: true,
        layout: GAME_LAYOUT,
      });
    }
    return treeMap;
  }

  function ensureGoalTree() {
    if (!goalStage || !window.d3 || !window.TreeMap) return null;
    if (!goalMap) {
      const data = TreeOptimal.goalStructureHierarchy(GOAL_TREE);
      goalMap = TreeMap.mountGoalStructure(goalStage, data, GAME_LAYOUT);
    }
    return goalMap;
  }

  function initNumberPool() {
    if (!numberPoolChips) return;
    numberPoolChips.innerHTML = "";
    NUMBER_POOL.forEach((n) => {
      const li = document.createElement("li");
      li.className = "number-pool__chip";
      li.dataset.value = String(n);
      li.innerHTML = `<span class="number-pool__chip-num">${n}</span><span class="number-pool__chip-cross" aria-hidden="true"></span>`;
      numberPoolChips.appendChild(li);
    });
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
  }

  function getStepEdge() {
    return pendingEdge;
  }

  function getCameraFocusIds(pending) {
    if (!pending) return [];
    if (pending.parentId) return [pending.parentId, "pending"];
    return ["pending"];
  }

  async function panTreeCamera(tree, pending = null) {
    if (!tree?.ensureVisible) return;
    await tree.ensureVisible({
      duration: prefersReducedMotion ? 0 : 320,
      padding: 52,
      focusNodeIds: getCameraFocusIds(pending),
    });
  }

  async function panGoalCamera() {
    const goal = ensureGoalTree();
    if (!goal?.panToFit) return;
    goal.resize();
    await goal.panToFit({
      duration: prefersReducedMotion ? 0 : 280,
      padding: 20,
    });
  }

  function showInsertPreview(forValue) {
    if (forValue == null) {
      pendingEdge = null;
      insertPreview = null;
      syncTreeDisplay(null);
      return;
    }

    const preview = TreeOptimal.getInsertPreview(playerTree, forValue);
    insertPreview = preview;
    pendingEdge = preview.parentId ? `${preview.parentId}-pending` : null;
    syncTreeDisplay(forValue);
  }

  function syncTreeDisplay(forValue) {
    const tree = ensureTree();
    if (!tree) return;

    const opts = { showAll: true, layout: GAME_LAYOUT };
    let pending = null;

    if (forValue != null) {
      const p = TreeOptimal.getInsertPreview(playerTree, forValue);
      if (p.childId === "pending") {
        pending = { parentId: p.parentId, side: p.side };
      }
    }

    if (!playerTree && forValue != null) {
      tree.reloadData({ id: "pending", value: "?", children: [] }, opts);
      tree.showPendingBranch(null, "pending");
      const emptyPending = { parentId: null, side: null };
      requestAnimationFrame(() => {
        panTreeCamera(tree, emptyPending);
        panGoalCamera();
      });
      return;
    }

    const hData = TreeOptimal.toHierarchy(playerTree, pending);
    if (!hData) return;

    tree.reloadData(hData, opts);

    if (pending?.parentId) {
      tree.showPendingBranch(pending.parentId, "pending");
    } else if (pending && pending.parentId === null) {
      tree.showPendingBranch(null, "pending");
    }

    requestAnimationFrame(() => {
      panTreeCamera(tree, pending);
      panGoalCamera();
    });
  }

  function waitForGoalIntroDismiss() {
    return (
      LevelChoiceInput?.waitForConfirmOrClick?.({
        getIsActive: () => goalIntroEl?.classList.contains("is-open"),
        clickTarget: goalIntroGotIt,
      }) ?? Promise.resolve()
    );
  }

  async function runGoalIntro() {
    if (!goalIntroEl || !goalIntroStage) return;

    playWindow?.classList.add("is-goal-pending");
    levelGame?.classList.add("is-goal-pending");
    goalIntroEl.hidden = false;
    goalIntroEl.classList.add("is-open");
    if (goalIntroHint) goalIntroHint.textContent = "Watch the shape…";

    const goalData = TreeOptimal.goalStructureHierarchy(GOAL_TREE);
    goalIntroStage.innerHTML = "";
    await new Promise((r) => requestAnimationFrame(r));
    const introMap = TreeMap.mountGoalStructure(goalIntroStage, goalData, INTRO_LAYOUT);
    introMap?.resize();
    await introMap?.panToFit({ duration: 0, padding: 48 });

    let dismissed = false;
    const dismissPromise = waitForGoalIntroDismiss().then(() => {
      dismissed = true;
    });

    await delay(prefersReducedMotion ? 100 : 350);

    const tourLoop = (async () => {
      while (!dismissed) {
        if (goalIntroHint) goalIntroHint.textContent = "Full goal shape…";
        introMap?.highlightNode(null);
        await introMap?.panToFit({
          duration: prefersReducedMotion ? 0 : 650,
          padding: 48,
        });
        if (dismissed) break;
        await delay(prefersReducedMotion ? 200 : 500);

        if (goalIntroHint) goalIntroHint.textContent = "Following each branch…";
        for (const id of GOAL_PAN_IDS) {
          if (dismissed) break;
          introMap?.highlightNode(id);
          await introMap?.ensureVisible({
            duration: prefersReducedMotion ? 0 : 500,
            padding: 56,
            focusNodeIds: [id],
          });
          await delay(prefersReducedMotion ? 60 : 400);
        }

        introMap?.highlightNode(null);
        if (dismissed) break;

        if (goalIntroHint) goalIntroHint.textContent = "Click Got it when you're ready";
        await introMap?.panToFit({
          duration: prefersReducedMotion ? 0 : 650,
          padding: 48,
        });
        if (dismissed) break;
        await delay(prefersReducedMotion ? 400 : 900);
      }
    })();

    await dismissPromise;
    await tourLoop.catch(() => {});

    introMap?.highlightNode(null);
    if (goalIntroHint) goalIntroHint.textContent = "Let's build…";
    goalIntroEl.classList.add("is-leaving");
    await delay(prefersReducedMotion ? 180 : 750);

    goalIntroEl.classList.remove("is-open", "is-leaving");
    goalIntroEl.hidden = true;
    goalIntroStage.innerHTML = "";
    playWindow?.classList.remove("is-goal-pending");
    levelGame?.classList.remove("is-goal-pending");

    const goal = ensureGoalTree();
    goal?.resize();
    await goal?.panToFit({ duration: prefersReducedMotion ? 0 : 480, padding: 32 });
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
  let compareResult = null;

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
    return TreeOptimal.formatInsertPathDisplay(chart);
  }

  function insertChartForValue(value) {
    return TreeOptimal.getInsertChart(playerTree, value);
  }

  function playChartForValue(value) {
    return TreeOptimal.extendInsertChart(
      insertChartForValue(value),
      L5_PLAY_CHART_MIN,
      L5_PLAY_CHART_MAX
    );
  }

  function initTreeState() {
    TreeOptimal.resetIds();
    playerTree = null;
    chosenValue = null;
    remaining = new Set(NUMBER_POOL);
    currentChoices = null;
    insertPreview = null;
    pendingEdge = null;
    compareResult = null;
    resetNumberPool();
    ensureTree()?.clearMismatches();
    syncTreeDisplay(null);
  }

  function getGoalPick() {
    return GOAL_ORDER.find((n) => remaining.has(n)) ?? [...remaining][0];
  }

  function pickPoolWrong(correct) {
    if (TreeOptimal.pickDistinctSlotWrong) {
      const wrong = TreeOptimal.pickDistinctSlotWrong(playerTree, correct, remaining);
      if (wrong != null && wrong !== correct) return wrong;
    }
    const options = [...remaining].filter((n) => n !== correct);
    if (options.length === 0) {
      return NUMBER_POOL.find((n) => n !== correct) ?? correct;
    }
    return options[Math.floor(Math.random() * options.length)];
  }

  function getQuestionMode() {
    if (!playerTree) return "l3";
    return L5_QUESTION_MODES[stepIndex] ?? (stepIndex % 2 === 0 ? "l3" : "l2");
  }

  function prepareChoices() {
    const goalPick = getGoalPick();
    const mode = getQuestionMode();

    if (mode === "l3") {
      const altPick = [...remaining].find((n) => n !== goalPick) ?? goalPick;
      currentChoices = { goalPick, altPick, mode: "l3" };
      return currentChoices;
    }

    const wrongPick = pickPoolWrong(goalPick);
    currentChoices = { goalPick, wrongPick, mode: "l2" };
    return currentChoices;
  }

  function advanceBuildOnHit() {
    if (!chosenValue) return;

    const total = tileNotes.length;
    const hitIndex = tileNotes.filter((n) => n.judged).length - 1;
    const tree = ensureTree();
    if (!tree) return;

    const edge = getStepEdge();

    if (!edge) {
      if (hitIndex >= total - 1) revealCurrentNode(false);
      return;
    }

    if (total <= 1) {
      tree.setLinkProgress(edge, 1);
      revealCurrentNode(false);
      return;
    }

    if (hitIndex < total - 1) {
      tree.setLinkProgress(edge, (hitIndex + 1) / (total - 1));
      return;
    }

    tree.setLinkProgress(edge, 1);
    revealCurrentNode(false);
  }

  function revealCurrentNode(auto = false) {
    if (nodePlacedThisStep || chosenValue == null) return;

    const result = TreeOptimal.bstInsert(playerTree, chosenValue);
    playerTree = result.tree;
    remaining.delete(chosenValue);
    crossOutNumber(chosenValue);
    pendingEdge = null;
    insertPreview = null;
    nodePlacedThisStep = true;
    syncTreeDisplay(null);
  }

  function setupQuestionCards() {
    const choices = prepareChoices();

    if (choices.mode === "l3") {
      const { goalPick, altPick } = choices;
      const goalSeq = insertChartForValue(goalPick);
      const altSeq = insertChartForValue(altPick);

      if (questionTitle) {
        if (!playerTree) {
          questionTitle.innerHTML = "Which number <strong>starts</strong> your tree?";
        } else {
          questionTitle.innerHTML = "Which number do you place <strong>next</strong>?";
        }
      }

      const goalOnLeft = Math.random() < 0.5;
      const goalCard = goalOnLeft ? cardLeft : cardRight;
      const altCard = goalOnLeft ? cardRight : cardLeft;

      goalCard.querySelector(".upgrade-card__value").textContent = goalPick;
      goalCard.querySelector(".upgrade-card__effect").textContent = "goal path";
      goalCard.querySelector(".upgrade-card__seq").textContent = formatSeq(goalSeq);
      goalCard.dataset.correct = "";
      goalCard.dataset.goal = "true";
      goalCard.dataset.value = String(goalPick);
      goalCard.dataset.mode = "l3";

      altCard.querySelector(".upgrade-card__value").textContent = altPick;
      altCard.querySelector(".upgrade-card__effect").textContent = "still fits";
      altCard.querySelector(".upgrade-card__seq").textContent = formatSeq(altSeq);
      altCard.dataset.correct = "";
      altCard.dataset.goal = "false";
      altCard.dataset.value = String(altPick);
      altCard.dataset.mode = "l3";
      return;
    }

    const { goalPick, wrongPick } = choices;
    const slot = TreeOptimal.getInsertLabel(playerTree, goalPick);
    const wrongSlot = TreeOptimal.getInsertLabel(playerTree, wrongPick);
    const goalSeq = insertChartForValue(goalPick);
    const wrongSeq = formatSeq([...insertChartForValue(wrongPick)].reverse());

    if (questionTitle) {
      questionTitle.innerHTML =
        `What number goes <strong>${slot}</strong>?`;
    }

    const correctOnLeft = Math.random() < 0.5;
    const correctCard = correctOnLeft ? cardLeft : cardRight;
    const wrongCard = correctOnLeft ? cardRight : cardLeft;

    correctCard.querySelector(".upgrade-card__value").textContent = goalPick;
    correctCard.querySelector(".upgrade-card__effect").textContent = slot;
    correctCard.querySelector(".upgrade-card__seq").textContent = formatSeq(goalSeq);
    correctCard.dataset.correct = "true";
    correctCard.dataset.goal = "true";
    correctCard.dataset.value = String(goalPick);
    correctCard.dataset.mode = "l2";

    wrongCard.querySelector(".upgrade-card__value").textContent = wrongPick;
    wrongCard.querySelector(".upgrade-card__effect").textContent = wrongSlot;
    wrongCard.querySelector(".upgrade-card__seq").textContent = wrongSeq;
    wrongCard.dataset.correct = "false";
    wrongCard.dataset.goal = "false";
    wrongCard.dataset.value = String(wrongPick);
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

  function getJudgeScoreFromError(errorMs) {
    const tier = LevelMusic.getJudgeTierFromErrorMs(errorMs);
    if (tier === "perfect") return SCORE_PERFECT;
    if (tier === "good") return SCORE_GOOD;
    if (tier === "ok") return SCORE_OK;
    return null;
  }

  function hasHittableNote() {
    return tileNotes.some((n) => LevelMusic.isNoteInWindow(n));
  }

  function buildTileChart() {
    const chart = chosenValue != null ? playChartForValue(chosenValue) : [];
    return LevelMusic.buildSyncedNotes(chart);
  }

  function spawnTileElements() {
    tileNotes.forEach((note) => {
      if (note.type === "chord" && note.keys) {
        note.els = {};
        note.keys.forEach((key) => {
          const container = laneTilesEls[key];
          if (!container) return;
          const el = document.createElement("div");
          el.className = "tile-note tile-note--chord";
          el.dataset.noteId = String(note.id);
          el.setAttribute("aria-hidden", "true");
          container.appendChild(el);
          note.els[key] = el;
        });
        return;
      }

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
    LevelMusic.applyTilePosition(note, hitLineY, getTileHeight(note));
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

  function findHittableChord(key) {
    let best = null;
    let bestAbs = Infinity;

    tileNotes.forEach((note) => {
      if (note.judged || note.missed || note.type !== "chord" || !note.keys?.includes(key)) return;
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

  function findHittableNote(key) {
    let best = null;
    let bestAbs = Infinity;

    tileNotes.forEach((note) => {
      if (note.judged || note.missed || note.type === "chord" || note.key !== key) return;
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

  function judgeChordNote(note) {
    const pts = getJudgeScoreFromError(LevelMusic.getNoteTimingErrorMs(note));
    if (pts === null) return false;

    const judge = JUDGE_TEXT[pts];
    note.judged = true;
    LevelTiles?.beginHitVisual?.(note, {
      hitLineY,
      getTileHeight,
      keys: note.keys,
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
    const tree = ensureTree();
    const edge = getStepEdge();
    const buildProgress = edge ? tree?.linkState[edge]?.progress || 0 : 1;

    if (buildProgress < 1 && edge && tree) {
      setPrompt("Finishing branch…");
      await delay(prefersReducedMotion ? 150 : 320);
      tree.setLinkProgress(edge, 1);
    }

    if (!nodePlacedThisStep) {
      if (misses > 0) setPrompt("Placing node…");
      await delay(prefersReducedMotion ? 150 : misses > 0 ? 400 : 0);
      revealCurrentNode(misses > 0);
    }

    stepIndex += 1;
    document.dispatchEvent(new CustomEvent("level:build-step", { detail: { step: stepIndex } }));
    chosenValue = null;
    pendingEdge = null;

    if (sequenceEl) sequenceEl.hidden = true;

    if (stepIndex < TOTAL_STEPS) {
      await delay(prefersReducedMotion ? STEP_GAP_MS * 0.4 : STEP_GAP_MS);
      startBuildStep();
      return;
    }

    phase = "done";
    await runTreeComparison();
  }

  function mountCompareTrees() {
    if (compareYoursStage) compareYoursStage.innerHTML = "";
    if (compareGoalStage) compareGoalStage.innerHTML = "";
    compareYoursMap = null;
    compareGoalMap = null;

    const playerData = TreeOptimal.toHierarchy(playerTree, null);
    const goalData = TreeOptimal.goalToHierarchy(GOAL_TREE);

    if (compareYoursStage && playerData) {
      compareYoursMap = TreeMap.mount(compareYoursStage, {
        data: playerData,
        mode: "build",
        showAll: true,
        layout: COMPARE_LAYOUT,
      });
      compareYoursMap?.reloadData(playerData, { showAll: true, layout: COMPARE_LAYOUT });
      compareYoursMap?.prepareCompareHidden();
    }

    if (compareGoalStage && goalData) {
      compareGoalMap = TreeMap.mount(compareGoalStage, {
        data: goalData,
        mode: "build",
        showAll: true,
        layout: COMPARE_LAYOUT,
      });
      compareGoalMap?.reloadData(goalData, { showAll: true, layout: COMPARE_LAYOUT });
      compareGoalMap?.prepareCompareHidden();
    }

    requestAnimationFrame(() => {
      compareYoursMap?.resize();
      compareGoalMap?.resize();
    });
  }

  async function animateCompareReveal(slots, result) {
    if (compareIssues) compareIssues.innerHTML = "";

    const slotDelay = prefersReducedMotion ? 90 : 420;
    const playerReveal = TreeOptimal.collectPlayerRevealSlots(playerTree);
    const mismatchByPlayerId = new Map();

    for (const slot of slots) {
      if (slot.playerId) mismatchByPlayerId.set(slot.playerId, !slot.match);
    }

    const steps = Math.max(slots.length, playerReveal.length);

    for (let i = 0; i < steps; i++) {
      const gSlot = slots[i];
      const pSlot = playerReveal[i];

      if (gSlot) {
        compareGoalMap?.revealCompareNode(gSlot.goalId, gSlot.goalValue);
      }

      if (pSlot) {
        const mismatch = mismatchByPlayerId.has(pSlot.playerId)
          ? mismatchByPlayerId.get(pSlot.playerId)
          : true;
        compareYoursMap?.revealCompareNode(pSlot.playerId, pSlot.playerValue, { mismatch });
      }

      let line = null;
      if (gSlot) {
        if (!gSlot.playerId) {
          line = `Missing node — goal wanted ${gSlot.goalValue}`;
        } else if (!gSlot.match) {
          line = `Node has ${gSlot.playerValue} — goal wanted ${gSlot.goalValue}`;
        }
      }

      if (line && compareIssues) {
        const li = document.createElement("li");
        li.classList.add("is-mismatch");
        li.textContent = line;
        compareIssues.appendChild(li);
        await delay(prefersReducedMotion ? 25 : 50);
        li.classList.add("is-show");
      }

      await delay(slotDelay);
    }

    const extraIssue = result.issues.find((issue) => issue.type === "extra");
    if (extraIssue && compareIssues) {
      const li = document.createElement("li");
      li.classList.add("is-mismatch");
      li.textContent = issueText(extraIssue);
      compareIssues.appendChild(li);
      await delay(prefersReducedMotion ? 30 : 60);
      li.classList.add("is-show");
      await delay(prefersReducedMotion ? 80 : 280);
    }

    if (result.issues.length === 0 && compareIssues) {
      const li = document.createElement("li");
      li.classList.add("is-ok");
      li.textContent = "Perfect — every node matches the goal.";
      compareIssues.appendChild(li);
      li.classList.add("is-show");
      await delay(prefersReducedMotion ? 80 : 280);
    }

    compareGoalMap?.lockCompareReveal();
    compareYoursMap?.lockCompareReveal();
  }

  function issueText(issue) {
    if (issue.type === "wrong") {
      return `Node has ${issue.got} — goal wanted ${issue.expected}`;
    }
    if (issue.type === "missing") {
      return `Missing node — goal wanted ${issue.expected}`;
    }
    if (issue.type === "extra") {
      return `${issue.count} extra node(s) in your tree`;
    }
    return "";
  }

  async function animateMatchMeter(matchPct) {
    const pct = Math.max(0, Math.min(100, matchPct));
    const tier = pct >= 100 ? "perfect" : pct >= 60 ? "mid" : "low";

    if (compareMatchPct) {
      compareMatchPct.classList.remove("is-low", "is-mid", "is-perfect");
      compareMatchPct.classList.add(`is-${tier}`);
    }
    if (compareMatchFill) {
      compareMatchFill.classList.remove("is-low", "is-perfect");
      if (tier === "low") compareMatchFill.classList.add("is-low");
      if (tier === "perfect") compareMatchFill.classList.add("is-perfect");
    }

    if (prefersReducedMotion) {
      if (compareMatchPct) compareMatchPct.textContent = `${pct}%`;
      if (compareMatchFill) compareMatchFill.style.width = `${pct}%`;
      return;
    }

    const duration = 1100;
    const start = performance.now();

    await new Promise((resolve) => {
      function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - (1 - t) ** 3;
        const current = Math.round(pct * eased);
        if (compareMatchPct) compareMatchPct.textContent = `${current}%`;
        if (compareMatchFill) compareMatchFill.style.width = `${current}%`;
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
  }

  async function animateScoreTally(scoreBefore, penalty) {
    const finalScore = Math.max(0, scoreBefore - penalty);

    if (compareScoreBefore) compareScoreBefore.textContent = String(scoreBefore);
    if (compareScoreFinal) compareScoreFinal.textContent = String(scoreBefore);

    if (penalty <= 0) {
      if (compareLede) compareLede.textContent = "Perfect structure match!";
      if (compareScoreFinal) compareScoreFinal.textContent = String(finalScore);
      return;
    }

    if (compareLede) compareLede.textContent = "Calculating structure penalty…";

    await delay(prefersReducedMotion ? 200 : 450);

    if (comparePenaltyRow) {
      comparePenaltyRow.hidden = false;
      comparePenaltyRow.classList.add("is-show");
    }
    if (comparePenaltyEl) comparePenaltyEl.textContent = `−${penalty}`;

    await delay(prefersReducedMotion ? 150 : 350);

    const steps = prefersReducedMotion ? 1 : 12;
    for (let i = 1; i <= steps; i += 1) {
      const current = Math.round(scoreBefore - (penalty * i) / steps);
      if (compareScoreFinal) {
        compareScoreFinal.textContent = String(current);
        compareScoreFinal.classList.remove("is-ticking");
        void compareScoreFinal.offsetWidth;
        compareScoreFinal.classList.add("is-ticking");
      }
      await delay(prefersReducedMotion ? 0 : 55);
    }

    if (compareScoreFinal) compareScoreFinal.textContent = String(finalScore);
    if (compareLede) {
      compareLede.textContent = `Structure differed — −${penalty} points applied.`;
    }

    updateScore(-penalty);
  }

  async function runComparePresentation(result, penalty, scoreBefore) {
    if (!compareModal) return;

    compareModal.removeAttribute("hidden");
    compareModal.classList.add("is-open", "is-animating");

    if (compareActions) {
      compareActions.hidden = true;
      compareActions.classList.remove("is-show");
    }
    if (comparePenaltyRow) {
      comparePenaltyRow.hidden = true;
      comparePenaltyRow.classList.remove("is-show");
    }
    if (compareMatchFill) compareMatchFill.style.width = "0%";
    if (compareMatchPct) compareMatchPct.textContent = "0%";
    if (compareLede) compareLede.textContent = "Comparing your tree to the goal…";

    mountCompareTrees();
    await delay(prefersReducedMotion ? 200 : 600);

    const slots = TreeOptimal.collectCompareSlots(GOAL_TREE, playerTree);
    await animateCompareReveal(slots, result);

    const matchPct = Math.round((result.matches / result.goalCount) * 100);
    await animateMatchMeter(matchPct);
    await animateScoreTally(scoreBefore, penalty);

    if (compareActions) {
      compareActions.hidden = false;
      compareActions.classList.add("is-show");
    }

    compareModal.classList.remove("is-animating");
    setPrompt(`Final score ${Math.max(0, scoreBefore - penalty)}`);
  }

  async function runTreeComparison() {
    setPrompt("Checking against goal tree…");
    await delay(prefersReducedMotion ? 350 : 650);

    compareResult = TreeOptimal.compareTrees(playerTree, GOAL_TREE);
    const penalty = TreeOptimal.scorePenalty(compareResult);
    const scoreBefore = score;

    await runComparePresentation(compareResult, penalty, scoreBefore);
  }

  function applyChoicePressure(_now, urgency) {
    LevelChoiceFx?.applyPressure?.(choicePressureEl, urgency, prefersReducedMotion);
  }

  function clearChoicePressure() {
    LevelChoiceFx?.clearPressure?.(choicePressureEl, levelGame);
    document.body.classList.remove("is-choice-pressure");
  }

  function stopChoiceTimer({ keepVignette = false } = {}) {
    if (choiceFrame) {
      cancelAnimationFrame(choiceFrame);
      choiceFrame = null;
    }
    if (choiceTimerEl) {
      choiceTimerEl.hidden = true;
      choiceTimerEl.setAttribute("aria-hidden", "true");
    }
    if (choiceFillEl) choiceFillEl.style.width = keepVignette ? "0%" : "100%";

    if (keepVignette) {
      document.body.classList.add("is-choice-pressure");
      LevelChoiceFx?.holdPressureAtEnd?.(choicePressureEl, prefersReducedMotion);
    } else {
      clearChoicePressure();
    }
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

  function resetCards() {
    LevelChoiceFx?.clearCardFx?.(cards);
    cards.forEach((c) => {
      c.disabled = false;
      c.hidden = false;
      c.classList.remove(
        "is-correct", "is-wrong",
        "is-crossed", "is-vanishing", "is-auto-picked"
      );
      delete c.dataset.mode;
      delete c.dataset.correct;
      delete c.dataset.goal;
    });
    choiceNav.resetFocus();
  }

  function lockCards() {
    cards.forEach((c) => { c.disabled = true; });
  }

  function getCorrectCard() {
    return document.querySelector('.upgrade-card[data-correct="true"]');
  }

  function crossWrongCards() {
    cards.filter((c) => c.dataset.correct !== "true").forEach((c) => c.classList.add("is-crossed"));
  }

  function playL3PickFeedback(pickedCard) {
    cards.forEach((c) => c.classList.remove("is-crossed"));
    LevelChoiceFx?.confirmChoice?.(pickedCard, cards);
  }

  function handleL3Pick(card) {
    chosenValue = Number(card.dataset.value);
    const isGoalPick = card.dataset.goal === "true";
    playL3PickFeedback(card);
    if (isGoalPick) updateScore(SCORE_GOAL_PICK);
    setPrompt(`Placing ${chosenValue}…`);
    const feedbackMs = prefersReducedMotion ? 280 : 520;
    advanceAfterChoice(`Placing ${chosenValue}…`, feedbackMs);
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

    choiceLocked = true;
    stopChoiceTimer({ keepVignette: true });
    lockCards();

    if (currentChoices?.mode === "l2") {
      const goalPick = getGoalPick();
      updateScore(SCORE_WRONG_CARD);
      crossWrongCards();
      chosenValue = goalPick;
      setPrompt(`Time's up — placing ${goalPick}`);
      setTimeout(() => {
        autoSelectCorrect();
        advanceAfterChoice(`Placing ${chosenValue}…`, 620);
      }, 450);
    } else {
      chosenValue = currentChoices?.altPick ?? getGoalPick();
      const picked = cards.find((c) => Number(c.dataset.value) === chosenValue);
      if (picked) playL3PickFeedback(picked);
      setPrompt(`Time's up — auto-picked ${chosenValue}`);
      const feedbackMs = prefersReducedMotion ? 280 : 520;
      setTimeout(() => {
        advanceAfterChoice(`Placing ${chosenValue}…`, feedbackMs);
      }, prefersReducedMotion ? 80 : 200);
    }
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
    if (remaining.size < 2) return;

    phase = "question";
    resetCards();
    setupQuestionCards();
    if (currentChoices?.mode === "l2") {
      showInsertPreview(getGoalPick());
    } else {
      syncTreeDisplay(null);
    }
    questionEl.hidden = false;
    playWindow?.classList.add("is-question");
    sequenceEl.hidden = true;
    setPrompt(`${choiceHint()} · ${remaining.size} left in pool`);
    startChoiceTimer();
    TreeMap.scheduleResize?.(ensureTree(), ensureGoalTree());
  }

  function hideQuestion() {
    stopChoiceTimer();
    choiceNav.resetHeld();
    questionEl.hidden = true;
    playWindow?.classList.remove("is-question");
  }

  function startBuildStep() {
    if (stepIndex >= TOTAL_STEPS) return;

    if (remaining.size === 1) {
      chosenValue = [...remaining][0];
      showInsertPreview(chosenValue);
      setPrompt(`Last number — placing ${chosenValue}…`);
      setTimeout(() => startSequence(), prefersReducedMotion ? 200 : 500);
      return;
    }

    if (remaining.size < 2) return;

    chosenValue = null;
    pendingEdge = null;
    showQuestion();
  }

  function onCardPick(card) {
    if (phase !== "question" || choiceLocked) return;

    choiceLocked = true;
    stopChoiceTimer();
    lockCards();
    LevelChoiceFx?.confirmChoice?.(card, cards);

    const mode = card.dataset.mode;

    if (mode === "l2") {
      const isCorrect = card.dataset.correct === "true";

      if (isCorrect) {
        chosenValue = Number(card.dataset.value);
        updateScore(SCORE_CORRECT_CARD);
        crossWrongCards();
        card.classList.add("is-correct");
        setPrompt(`Placing ${chosenValue}…`);
        setTimeout(() => {
          advanceAfterChoice(`Placing ${chosenValue}…`, 680);
        }, 400);
        return;
      }

      const goalPick = getGoalPick();
      updateScore(SCORE_WRONG_CARD);
      card.classList.add("is-wrong");
      chosenValue = goalPick;
      setPrompt(`Wrong — ${goalPick} belongs here`);

      setTimeout(() => { card.classList.add("is-vanishing"); }, 380);
      setTimeout(() => {
        card.hidden = true;
        autoSelectCorrect();
        advanceAfterChoice(`Placing ${chosenValue}…`, 620);
      }, 950);
      return;
    }

    if (mode === "l3") {
      handleL3Pick(card);
      return;
    }

    handleL3Pick(card);
  }

  function startSequence() {
    phase = "sequence";
    hideQuestion();

    const preview = TreeOptimal.getInsertPreview(playerTree, chosenValue);
    pendingEdge = preview.parentId ? `${preview.parentId}-pending` : null;
    syncTreeDisplay(chosenValue);

    if (sequenceEl) {
      sequenceEl.hidden = false;
      sequenceEl.removeAttribute("hidden");
    }
    const song = LevelMusic?.getActiveTrackLabel?.();
    const promptAfter = song
      ? `Tap on the beat — two-key chords count as one hit · ${chosenValue} · ${song}`
      : `Tap on the beat — place ${chosenValue}`;
    LevelTiles?.breathThenBegin?.({
      playWindow,
      phaseCheck: () => phase === "sequence",
      setPrompt,
      promptAfter,
      reducedMotion: prefersReducedMotion,
      beforeBegin: () => panGoalCamera(),
      begin: () => startTileRush(),
    });
  }

  function onSequenceKeyDown(key) {
    if (phase !== "sequence" || !LANE_KEYS.includes(key)) return;

    if (activeHold?.key === key) return;

    const chordNote = findHittableChord(key);
    if (chordNote) {
      if (!chordNote.chordPressed[key]) {
        chordNote.chordPressed[key] = true;
        flashReceptor(key);
      }
      if (chordNote.keys.every((k) => chordNote.chordPressed[k])) {
        judgeChordNote(chordNote);
      }
      return;
    }

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

  document.addEventListener("level:start", async () => {
    score = SCORE_START;
    stepIndex = 0;
    if (scoreEl) scoreEl.textContent = score;
    playWindow?.classList.add("is-split");
    initNumberPool();
    initTreeState();
    setPrompt("");
    await runGoalIntro();
    ensureTree()?.resize();
    await ensureTree()?.ensureVisible({ duration: prefersReducedMotion ? 0 : 350, padding: 60 });
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
    ensureGoalTree();
    requestAnimationFrame(() => {
      ensureTree()?.resize();
      panGoalCamera();
    });
  });

  let goalPanTimer = null;
  window.addEventListener("resize", () => {
    if (goalPanTimer) clearTimeout(goalPanTimer);
    goalPanTimer = setTimeout(() => {
      ensureTree()?.resize();
      panGoalCamera();
    }, 120);
  });
})();
