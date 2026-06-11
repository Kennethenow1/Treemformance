/**
 * Piano tile visuals and rhythm session timing.
 *
 * - breathThenBegin: short "Get ready" pause after a card pick (all levels)
 * - armSession: build the note chart after audio is ready so tiles fall from the top
 * - updateTilePositions: move tiles each frame using the music clock
 */
(function initLevelTiles(global) {
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

  /** Short calm after a choice — piano visible, lanes empty, then begin rhythm. */
  async function breathThenBegin({
    playWindow,
    phaseCheck,
    setPrompt,
    promptAfter,
    reducedMotion = false,
    breathMs = SEQUENCE_BREATH_MS,
    beforeBegin,
    begin,
  } = {}) {
    if (beforeBegin) {
      await Promise.resolve(beforeBegin());
    }
    if (phaseCheck && !phaseCheck()) return;

    playWindow?.classList.add("is-sequence-breath");
    setPrompt?.("Get ready…");

    const waitMs = reducedMotion ? Math.round(breathMs * 0.62) : breathMs;
    await new Promise((resolve) => global.setTimeout(resolve, waitMs));

    playWindow?.classList.remove("is-sequence-breath");
    if (phaseCheck && !phaseCheck()) return;

    if (promptAfter != null) setPrompt?.(promptAfter);
    return begin?.();
  }

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

  /**
   * Ensure audio is ready, then build the chart so note times match "now".
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
  } = {}) {
    stopTileRush?.();
    clearTiles?.();

    await global.LevelMusic?.waitForTrackSwitch?.();
    await global.LevelMusic?.ensurePlaying?.();

    if (phaseCheck && !phaseCheck()) return null;

    applyTimingGuide?.();
    cacheTileDom?.();

    const notes = buildChart?.() || [];
    onNotes?.(notes);
    spawnTileElements?.();

    await measureStage(measureHitLine);
    if (phaseCheck && !phaseCheck()) return notes;

    updateTilePositions?.();
    beginLoop?.();
    return notes;
  }

  function bindRhythmTrackSwap({ getPhase, stopTileRush, clearTiles, startTileRush, setPrompt, getSongLabel }) {
    if (!global.LevelMusic?.onRhythmTrackChange) return () => {};

    return global.LevelMusic.onRhythmTrackChange((trackId, gen) => {
      if (getPhase() !== "sequence") return;

      stopTileRush?.();
      clearTiles?.();

      const song = getSongLabel?.() || global.LevelMusic?.getActiveTrackLabel?.();
      if (setPrompt) {
        setPrompt(song ? `Tap on the beat — ${song}` : "Tap on the beat!");
      }

      global.requestAnimationFrame(() => {
        if (!global.LevelMusic?.isRhythmGenerationCurrent?.(gen)) return;
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
    breathThenBegin,
    armSession,
    bindRhythmTrackSwap,
    SEQUENCE_BREATH_MS,
  };
})(window);
