/**
 * Rhythm timing for all levels.
 *
 * Tile Y position is driven by getMusicTimeMs(), not frame delta,
 * so tiles stay in sync even if the tab hiccups briefly.
 */
(function initLevelMusic(global) {
  const HIT_WINDOW_MS = 140;
  const JUDGE_MS = {
    perfect: 42,
    good: 78,
    ok: 115,
  };

  const rhythmTrackHooks = new Set();
  let nextBeatIndex = 0;
  let activeTrackId = null;
  let enabled = true;
  let levelMusicStarted = false;
  let playbackStarting = false;
  let gestureHooked = false;
  let switchInFlight = null;
  const TRACK_SWITCH_TIMEOUT_MS = 4500;
  const ENSURE_PLAY_TIMEOUT_MS = 3500;
  let rhythmGeneration = 0;
  let rhythmNotifyFrame = null;
  let currentScroll = {
    approachMs: 1200,
    minNoteGapMs: 1200,
    minLeadMs: 1500,
    minPrepMs: 300,
    hitLatencyMs: 28,
    difficulty: "normal",
    difficultyLabel: "Normal",
  };

  function isReady() {
    return enabled && global.TreeMusic && global.Beatmaps && global.MusicCatalog;
  }

  /** Gameplay clock — stable heard-audio time (latency snapshotted at play start). */
  function getMusicTimeMs() {
    if (global.TreeMusic?.getSongTimeMs) {
      return global.TreeMusic.getSongTimeMs();
    }
    if (global.TreeMusic?.getHeardTimeMs) {
      return global.TreeMusic.getHeardTimeMs();
    }
    if (!global.TreeMusic?.getCurrentTime) return 0;
    return global.TreeMusic.getCurrentTime() * 1000;
  }

  /** Raw buffer position — only for placing notes on beatmap peaks. */
  function getPlaybackTimeMs() {
    if (global.TreeMusic?.getPlaybackTimeMs) {
      return global.TreeMusic.getPlaybackTimeMs();
    }
    return getMusicTimeMs();
  }

  function getJudgmentTimeMs() {
    return getMusicTimeMs();
  }

  function refreshScrollConfig(trackId) {
    const id = trackId || activeTrackId || global.MusicCatalog?.getActiveTrackId?.();
    if (!global.Beatmaps?.getScrollConfig) return currentScroll;
    currentScroll = global.Beatmaps.getScrollConfig(id);
    return currentScroll;
  }

  function getScrollParams() {
    return { ...currentScroll };
  }

  function getApproachMs() {
    return currentScroll.approachMs;
  }

  function buildFallbackNotes(pathEntries) {
    const { approachMs, minNoteGapMs, minLeadMs } = currentScroll;
    const gapMs = minNoteGapMs;
    const chartStartMs = getPlaybackTimeMs() || 0;

    return pathEntries.map((entry, i) => {
      const songTimeMs = chartStartMs + minLeadMs + i * gapMs;
      return makeNote(entry, i, songTimeMs, chartStartMs, approachMs);
    });
  }

  function makeNote(entry, id, songTimeMs, chartBuiltMs, approachMs) {
    return {
      id,
      key: entry.type === "chord" ? entry.keys[0] : entry.key,
      keys: entry.type === "chord" ? entry.keys : null,
      type: entry.type || "tap",
      holdMs: entry.holdMs || 0,
      songTimeMs,
      hitTime: songTimeMs - chartBuiltMs,
      approachMs,
      chartBuiltMs,
      judged: false,
      missed: false,
      holding: false,
      beatFlashed: false,
      chordPressed: entry.type === "chord" ? {} : null,
      el: null,
      els: null,
    };
  }

  /**
   * Map path entries onto real amplitude peaks from the active song.
   */
  function buildSyncedNotes(pathEntries, options = {}) {
    if (!pathEntries?.length) return [];

    const trackId = activeTrackId || global.MusicCatalog.getActiveTrackId();
    refreshScrollConfig(trackId);

    const approachMs = options.approachMs ?? currentScroll.approachMs;
    const chartBuiltMs = getPlaybackTimeMs();

    if (!isReady()) {
      return buildFallbackNotes(pathEntries);
    }

    const assigned = global.Beatmaps.assignChartToPeaks(
      trackId,
      chartBuiltMs,
      pathEntries.length
    );

    if (!assigned.times.length) {
      return buildFallbackNotes(pathEntries);
    }

    const notes = [];
    for (let i = 0; i < pathEntries.length; i += 1) {
      let songTimeMs = assigned.times[i];
      if (songTimeMs == null) {
        const prev = notes[i - 1]?.songTimeMs ?? chartBuiltMs;
        const gap = currentScroll.minNoteGapMs;
        songTimeMs = prev + gap;
      }
      notes.push(makeNote(pathEntries[i], i, songTimeMs, chartBuiltMs, approachMs));
    }

    nextBeatIndex = assigned.nextBeatIdx;
    return notes;
  }

  async function startPlayback({ resume, timeSec } = {}) {
    if (!isReady()) return false;

    activeTrackId = global.MusicCatalog.getActiveTrackId();
    refreshScrollConfig(activeTrackId);

    const startAt = resume && timeSec > 0.5 ? timeSec : 0;
    const restart = !resume || startAt <= 0.5;

    const ok = await global.TreeMusic.playForLevelSync(activeTrackId, { restart, startAt });
    if (!ok) {
      enabled = false;
      levelMusicStarted = false;
      return false;
    }

    levelMusicStarted = true;
    nextBeatIndex = global.Beatmaps.findBeatIndexAt(activeTrackId, getPlaybackTimeMs());
    return true;
  }

  async function beginLevelFromGesture() {
    if (!isReady()) return false;
    if (playbackStarting) return levelMusicStarted && global.TreeMusic.isPlaying();
    if (levelMusicStarted && global.TreeMusic.isPlaying()) return true;

    playbackStarting = true;
    try {
      global.LevelAudio?.unlockSync?.();

      const handoff = global.MusicCatalog.readLevelHandoff();
      if (handoff.queue?.length) {
        global.TreeMusic?.applyQueueHandoff?.(handoff);
      }

      const resume = handoff.timeSec > 0.5 && handoff.wantMusic;
      const ok = await startPlayback({ resume, timeSec: handoff.timeSec });
      if (ok) {
        global.MusicCatalog.clearLevelHandoff();
      }
      return ok;
    } finally {
      playbackStarting = false;
    }
  }

  async function tryAutoResumeOnLoad() {
    if (!isReady()) return false;
    const handoff = global.MusicCatalog.readLevelHandoff();
    if (!handoff?.wantMusic) return false;
    return beginLevelFromGesture();
  }

  function installGestureStart() {
    if (gestureHooked) return;
    gestureHooked = true;

    const onGesture = () => {
      if (document.body.classList.contains("is-level-music-open")) return;
      if (switchInFlight) return;
      if (levelMusicStarted && global.TreeMusic?.isPlaying?.()) return;
      global.LevelAudio?.unlockSync?.();
      beginLevelFromGesture();
    };

    document.addEventListener("pointerdown", onGesture, { capture: true });
    document.addEventListener("keydown", onGesture, { capture: true });
  }

  function raceTimeout(promise, ms) {
    if (!promise) return Promise.resolve();
    return Promise.race([
      promise,
      new Promise((resolve) => global.setTimeout(resolve, ms)),
    ]);
  }

  async function waitForTrackSwitch() {
    if (!switchInFlight) return;
    const pending = switchInFlight;
    try {
      await raceTimeout(pending, TRACK_SWITCH_TIMEOUT_MS);
    } catch {
      // Superseded switch
    }
    if (switchInFlight === pending) {
      switchInFlight = null;
    }
  }

  async function ensurePlaying() {
    if (!isReady()) return;
    await waitForTrackSwitch();
    if (!activeTrackId) activeTrackId = global.MusicCatalog.getActiveTrackId();
    refreshScrollConfig(activeTrackId);

    if (global.TreeMusic.isPlaying()) return;

    if (global.LevelAudio?.isActive?.() && global.LevelAudio.isAudible?.()) return;

    if (global.LevelAudio?.resumeContextOnly) {
      await raceTimeout(global.LevelAudio.resumeContextOnly(), ENSURE_PLAY_TIMEOUT_MS);
    }

    if (global.TreeMusic.isPlaying()) return;

    if (levelMusicStarted && global.TreeMusic.resumeLevelAudio) {
      await raceTimeout(global.TreeMusic.resumeLevelAudio(), ENSURE_PLAY_TIMEOUT_MS);
    }
  }

  /**
   * Mid-level song change — stop all clocks, play one track, notify rhythm once.
   */
  async function switchTrack(trackId, { source = "level-picker" } = {}) {
    if (!isReady()) return false;

    const id = trackId || global.MusicCatalog.getActiveTrackId();
    if (!id) return false;

    await waitForTrackSwitch();

    const job = (async () => {
      global.MusicCatalog.setActiveTrackId(id);
      activeTrackId = id;
      refreshScrollConfig(id);

      global.LevelAudio?.stop?.();
      if (global.TreeMusic?.pause) {
        global.TreeMusic.pause();
      }

      const ok = await global.TreeMusic.playForLevelSync(id, { restart: true, startAt: 0 });
      if (!ok) return false;

      levelMusicStarted = true;
      nextBeatIndex = global.Beatmaps.findBeatIndexAt(id, getPlaybackTimeMs());

      global.dispatchEvent(
        new CustomEvent("treemusic:play", {
          detail: { trackId: id, source, midLevelSwitch: true },
        })
      );

      return true;
    })();

    switchInFlight = job;
    try {
      return await job;
    } finally {
      if (switchInFlight === job) switchInFlight = null;
    }
  }

  function isRhythmGenerationCurrent(gen) {
    return gen === rhythmGeneration;
  }

  function notifyRhythmTrackHooks(trackId) {
    rhythmGeneration += 1;
    const gen = rhythmGeneration;
    const id = trackId || activeTrackId;

    if (rhythmNotifyFrame) {
      cancelAnimationFrame(rhythmNotifyFrame);
      rhythmNotifyFrame = null;
    }

    rhythmNotifyFrame = requestAnimationFrame(() => {
      rhythmNotifyFrame = null;
      if (gen !== rhythmGeneration) return;
      rhythmTrackHooks.forEach((fn) => {
        try {
          fn(id, gen);
        } catch {
          // Ignore hook errors during live track swap
        }
      });
    });
  }

  function getNoteTimingErrorMs(note) {
    return getJudgmentTimeMs() - note.songTimeMs;
  }

  function getJudgeTierFromErrorMs(errorMs) {
    const abs = Math.abs(errorMs);
    if (abs <= JUDGE_MS.perfect) return "perfect";
    if (abs <= JUDGE_MS.good) return "good";
    if (abs <= JUDGE_MS.ok) return "ok";
    return null;
  }

  function isNoteInWindow(note) {
    if (note.judged || note.missed) return false;
    return getJudgeTierFromErrorMs(getNoteTimingErrorMs(note)) !== null;
  }

  function getTileTargets(note) {
    const targets = [];
    if (note?.el) targets.push(note.el);
    if (note?.els) targets.push(...Object.values(note.els));
    return targets.filter(Boolean);
  }

  function isNoteScrolling(note) {
    return getTileTargets(note).length > 0 && !note.judged && !note.missed;
  }

  function getTileTopPx(note, hitLineY, tileHeight, approachMs) {
    const scrollMs = approachMs ?? note.approachMs ?? currentScroll.approachMs;
    const musicMs = getMusicTimeMs();
    const spawnMs = note.songTimeMs - scrollMs;
    const startY = -tileHeight;
    const endY = hitLineY - tileHeight;

    if (musicMs < spawnMs) return startY;

    if (musicMs <= note.songTimeMs) {
      const span = Math.max(scrollMs, note.songTimeMs - spawnMs);
      const progress = Math.min(1, Math.max(0, (musicMs - spawnMs) / span));
      return startY + progress * (endY - startY);
    }

    return endY;
  }

  function setTileTransform(note, topPx) {
    const y = Math.round(topPx * 100) / 100;
    getTileTargets(note).forEach((el) => {
      el.style.top = "0";
      el.style.transform = `translate3d(0, ${y}px, 0)`;
    });
    note._tileY = y;
  }

  function applyTilePosition(note, hitLineY, tileHeight) {
    if (!isNoteScrolling(note)) return;
    setTileTransform(note, getTileTopPx(note, hitLineY, tileHeight));
  }

  function freezeTilePosition(note, hitLineY, tileHeight) {
    if (!note) return;
    const top = hitLineY - tileHeight;
    setTileTransform(note, top);
  }

  function resetTileMotion(note) {
    if (!note) return;
    note._tileY = undefined;
  }

  function shouldMissNote(note) {
    if (note.judged || note.missed) return false;
    return getJudgmentTimeMs() > note.songTimeMs + HIT_WINDOW_MS;
  }

  function shouldPulseBeat(note) {
    if (note.judged || note.missed || note.beatFlashed) return false;
    return getJudgmentTimeMs() >= note.songTimeMs - 20;
  }

  function markBeatFlashed(note) {
    note.beatFlashed = true;
  }

  function getActiveTrackTitle() {
    const track = global.MusicCatalog?.getTrack(activeTrackId || global.MusicCatalog?.getActiveTrackId());
    return track?.title ?? "";
  }

  function getActiveTrackLabel() {
    const title = getActiveTrackTitle();
    if (!title) return "";
    if (currentScroll.difficulty === "hard") return `${title} · Hard`;
    if (currentScroll.difficulty === "medium") return `${title} · Medium`;
    if (currentScroll.difficulty === "easy") return `${title} · Easy`;
    return title;
  }

  function onTrackAdvanced(trackId, { notifyRhythm = true } = {}) {
    const id = trackId || global.MusicCatalog?.getActiveTrackId?.();
    if (!id) return;
    activeTrackId = id;
    refreshScrollConfig(id);
    nextBeatIndex = global.Beatmaps?.findBeatIndexAt?.(id, getPlaybackTimeMs()) ?? 0;
    if (notifyRhythm) notifyRhythmTrackHooks(id);
  }

  function onRhythmTrackChange(fn) {
    if (typeof fn !== "function") return () => {};
    rhythmTrackHooks.add(fn);
    return () => rhythmTrackHooks.delete(fn);
  }

  function installTrackChangeListener() {
    global.addEventListener("treemusic:play", (event) => {
      onTrackAdvanced(event.detail?.trackId);
    });
    global.addEventListener("treemusic:ended", () => {
      // Keep last active track / scroll config until the next play event.
    });
  }

  async function boot() {
    const onLevel = document.getElementById("level-game") || document.getElementById("tutorial-modal");
    installTrackChangeListener();
    if (!onLevel) return;

    refreshScrollConfig(global.MusicCatalog?.getActiveTrackId?.());
    installGestureStart();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      boot();
    });
  } else {
    boot();
  }

  global.LevelMusic = {
    beginLevelFromGesture,
    tryAutoResumeOnLoad,
    switchTrack,
    waitForTrackSwitch,
    ensurePlaying,
    isRhythmGenerationCurrent,
    buildSyncedNotes,
    getScrollParams,
    getApproachMs,
    getActiveTrackTitle,
    getActiveTrackLabel,
    getMusicTimeMs,
    getNoteTimingErrorMs,
    getJudgeTierFromErrorMs,
    isNoteInWindow,
    getTileTopPx,
    getTileTargets,
    isNoteScrolling,
    applyTilePosition,
    freezeTilePosition,
    resetTileMotion,
    shouldMissNote,
    shouldPulseBeat,
    markBeatFlashed,
    isReady,
    hasStarted: () => levelMusicStarted,
    onTrackAdvanced,
    onRhythmTrackChange,
    JUDGE_MS,
    HIT_WINDOW_MS,
  };
})(window);
