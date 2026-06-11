/**
 * Piano tile visuals and rhythm session timing.
 *
 * - breathThenBegin: short "Get ready" pause after a card pick (all levels)
 * - prepLayout: measure lanes only, no chart (safe during breath)
 * - armSession: build the note chart after audio is ready so tiles fall from the top
 * - updateTilePositions: move tiles each frame using the music clock
 */
(function initLevelTiles(global) {
  let sessionLock = false;

  function isSessionLocked() {
    return sessionLock;
  }

  function isBreathActive() {
    return Boolean(global.document.querySelector(".play-window.is-sequence-breath"));
  }

  function setNotesArming(notes, arming) {
    (notes || []).forEach((note) => {
      global.LevelMusic?.getTileTargets?.(note).forEach((el) => {
        el.classList.toggle("tile-note--arming", arming);
      });
    });
  }

  function playSlam(note) {
    global.LevelMusic?.getTileTargets?.(note).forEach((el) => {
      el.classList.remove("is-miss", "is-miss-out");
      void el.offsetWidth;
      el.classList.add("is-slam");
    });
  }

  function playMissOut(note) {
    global.LevelMusic?.getTileTargets?.(note).forEach((el) => {
      el.classList.remove("is-slam");
      void el.offsetWidth;
      el.classList.add("is-miss", "is-miss-out");
    });
  }

  function removeNoteElements(note, delayMs = 220) {
    global.setTimeout(() => {
      global.LevelMusic?.getTileTargets?.(note).forEach((el) => el.remove());
      global.LevelMusic?.resetTileMotion?.(note);
    }, delayMs);
  }

  function updateTilePositions(notes, hitLineY, getTileHeight) {
    notes.forEach((note) => {
      if (!global.LevelMusic?.isNoteScrolling?.(note)) return;
      global.LevelMusic.applyTilePosition(note, hitLineY, getTileHeight(note));
    });
  }

  function freezeAtHitLine(note, hitLineY, getTileHeight) {
    global.LevelMusic?.freezeTilePosition?.(note, hitLineY, getTileHeight(note));
  }

  function markNoteMissed(note, { hitLineY, getTileHeight, showJudge, tileStage, tileHitzone }) {
    if (note.judged || note.missed) return;
    note.missed = true;
    freezeAtHitLine(note, hitLineY, getTileHeight);
    playMissOut(note);
    showJudge?.("Miss", "miss");
    global.LevelFeedback?.onRhythmMiss?.({ stageEl: tileStage, hitzoneEl: tileHitzone });
    removeNoteElements(note, 400);
  }

  function pulseHitFeedback({ key, tier, receptorEls, tileStage, tileHitzone }) {
    const rec = receptorEls?.[key];
    global.LevelFeedback?.onRhythmHit?.({
      tier: tier || "good",
      stageEl: tileStage,
      hitzoneEl: tileHitzone,
      receptorEl: rec,
    });
    if (key) global.LevelFeedback?.onLaneHit?.(key, tier === "perfect" ? 1 : 0.85);
  }

  function beginHitVisual(note, { hitLineY, getTileHeight, key, keys, tier, receptorEls, tileStage, tileHitzone }) {
    freezeAtHitLine(note, hitLineY, getTileHeight);
    playSlam(note);
    const lanes = keys?.length ? keys : key ? [key] : [];
    pulseHitFeedback({
      key: lanes[0],
      tier,
      receptorEls,
      tileStage,
      tileHitzone,
    });
    lanes.slice(1).forEach((laneKey) => {
      const rec = receptorEls?.[laneKey];
      if (rec) {
        rec.classList.remove("is-hit-flash", "is-pressed");
        void rec.offsetWidth;
        rec.classList.add("is-hit-flash");
        global.setTimeout(() => rec.classList.remove("is-hit-flash"), 200);
      }
      global.LevelFeedback?.onLaneHit?.(laneKey, 0.85);
    });
    removeNoteElements(note, 220);
  }

  const SEQUENCE_BREATH_MS = 650;

  async function measureStage(measureHitLine) {
    return new Promise((resolve) => {
      global.requestAnimationFrame(() => {
        measureHitLine?.();
        global.requestAnimationFrame(() => {
          measureHitLine?.();
          resolve();
        });
      });
    });
  }

  /** Layout only: empty lanes, no chart. Safe while "Get ready" is on screen. */
  async function prepLayout({
    stopTileRush,
    clearTiles,
    applyTimingGuide,
    cacheTileDom,
    measureHitLine,
  } = {}) {
    stopTileRush?.();
    clearTiles?.();
    applyTimingGuide?.();
    cacheTileDom?.();
    await measureStage(measureHitLine);
  }

  /**
   * Short calm after a choice: prep lanes during breath, then call begin (armSession).
   */
  async function breathThenBegin({
    playWindow,
    phaseCheck,
    setPrompt,
    promptAfter,
    reducedMotion = false,
    breathMs = SEQUENCE_BREATH_MS,
    beforeBegin,
    prepDuringBreath,
    begin,
  } = {}) {
    if (beforeBegin) {
      await Promise.resolve(beforeBegin());
    }
    if (phaseCheck && !phaseCheck()) return;

    playWindow?.classList.add("is-sequence-breath");
    setPrompt?.("Get ready…");

    if (prepDuringBreath) {
      await Promise.resolve(prepDuringBreath());
    }
    if (phaseCheck && !phaseCheck()) {
      playWindow?.classList.remove("is-sequence-breath");
      return;
    }

    const waitMs = reducedMotion ? Math.round(breathMs * 0.62) : breathMs;
    await new Promise((resolve) => global.setTimeout(resolve, waitMs));

    playWindow?.classList.remove("is-sequence-breath");
    if (phaseCheck && !phaseCheck()) return;

    if (promptAfter != null) setPrompt?.(promptAfter);
    return begin?.();
  }

  /**
   * Ensure audio is ready, then build the chart so note times match "now".
   * Tiles stay hidden until positioned to avoid a one-frame flash.
   */
  async function armSession({
    phaseCheck,
    stopTileRush,
    clearTiles,
    applyTimingGuide,
    cacheTileDom,
    buildChart,
    onNotes,
    spawnTileElements,
    measureHitLine,
    updateTilePositions,
    beginLoop,
    skipPrep = false,
  } = {}) {
    if (sessionLock) return null;
    sessionLock = true;

    try {
      stopTileRush?.();
      clearTiles?.();

      await global.LevelMusic?.waitForTrackSwitch?.();
      await global.LevelMusic?.ensurePlaying?.();

      if (phaseCheck && !phaseCheck()) return null;

      if (!skipPrep) {
        applyTimingGuide?.();
        cacheTileDom?.();
      }

      const notes = buildChart?.() || [];
      onNotes?.(notes);
      spawnTileElements?.();
      setNotesArming(notes, true);

      await measureStage(measureHitLine);
      if (phaseCheck && !phaseCheck()) return notes;

      updateTilePositions?.();
      setNotesArming(notes, false);
      beginLoop?.();
      return notes;
    } finally {
      sessionLock = false;
    }
  }

  function bindRhythmTrackSwap({
    getPhase,
    canArm,
    stopTileRush,
    clearTiles,
    startTileRush,
    setPrompt,
    getSongLabel,
  }) {
    if (!global.LevelMusic?.onRhythmTrackChange) return () => {};

    return global.LevelMusic.onRhythmTrackChange((trackId, gen) => {
      if (getPhase() !== "sequence") return;
      if (sessionLock || isBreathActive()) return;
      if (canArm && !canArm()) return;

      stopTileRush?.();
      clearTiles?.();

      const song = getSongLabel?.() || global.LevelMusic?.getActiveTrackLabel?.();
      if (setPrompt) {
        setPrompt(song ? `Tap on the beat — ${song}` : "Tap on the beat!");
      }

      global.requestAnimationFrame(() => {
        if (!global.LevelMusic?.isRhythmGenerationCurrent?.(gen)) return;
        if (sessionLock || isBreathActive()) return;
        if (canArm && !canArm()) return;
        startTileRush?.();
      });
    });
  }

  global.LevelTiles = {
    updateTilePositions,
    freezeAtHitLine,
    markNoteMissed,
    pulseHitFeedback,
    beginHitVisual,
    playSlam,
    playMissOut,
    removeNoteElements,
    measureStage,
    prepLayout,
    breathThenBegin,
    armSession,
    bindRhythmTrackSwap,
    isSessionLocked,
    SEQUENCE_BREATH_MS,
  };
})(window);
