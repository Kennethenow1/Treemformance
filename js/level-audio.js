/**
 * Level playback — Web Audio master clock with stable latency compensation.
 * Snapshots output latency once per play session (it can change after warm-up).
 */
(function initLevelAudio(global) {
  const LOOKAHEAD_SEC = 0.06;
  const DEFAULT_FEEL_DELAY_MS = 0;
  const DEFAULT_USER_SYNC_MS = -42;
  const SYNC_OFFSET_KEY = "treeformance-sync-offset-ms";

  let ctx = null;
  let gain = null;
  let source = null;
  const bufferCache = new Map();

  let active = false;
  let trackId = null;
  let volume = 0.55;
  let startCtxTime = 0;
  let startOffsetSec = 0;
  let pauseOffsetSec = 0;
  let paused = true;
  let ended = false;
  let playSession = 0;
  /** Frozen when playback starts — do not re-read every frame (browser reports drift). */
  let latencyCompensationMs = 0;
  let onPlaybackEnded = null;
  let playInFlight = null;

  function getUserSyncOffsetMs() {
    try {
      const raw = localStorage.getItem(SYNC_OFFSET_KEY);
      if (raw != null) return Number.parseInt(raw, 10) || 0;
    } catch {
      // Ignore blocked storage
    }
    return DEFAULT_USER_SYNC_MS;
  }

  function setUserSyncOffsetMs(ms) {
    try {
      localStorage.setItem(SYNC_OFFSET_KEY, String(Math.round(ms)));
    } catch {
      // Ignore blocked storage
    }
  }

  function measureLatencyMs() {
    if (!ctx) return 0;
    return Math.round(((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000);
  }

  function createContext() {
    if (ctx?.state === "closed") ctx = null;
    if (ctx) return ctx;

    const Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return null;

    ctx = new Ctx({ latencyHint: "interactive" });
    gain = ctx.createGain();
    gain.gain.value = volume;
    gain.connect(ctx.destination);
    return ctx;
  }

  function unlockSync() {
    const audioCtx = createContext();
    if (!audioCtx) return false;
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return true;
  }

  async function ensureContext() {
    const audioCtx = createContext();
    if (!audioCtx) return null;
    if (audioCtx.state === "suspended") {
      await Promise.race([
        audioCtx.resume(),
        new Promise((resolve) => global.setTimeout(resolve, 2000)),
      ]);
    }
    return audioCtx;
  }

  function stopSource() {
    if (!source) return;
    try {
      source.stop(0);
    } catch {
      // Already stopped
    }
    try {
      source.disconnect();
    } catch {
      // Ignore
    }
    source = null;
  }

  function handleEnded() {
    const finishedTrackId = trackId;
    ended = true;
    paused = true;
    active = false;
    source = null;
    if (onPlaybackEnded) {
      try {
        onPlaybackEnded(finishedTrackId);
      } catch {
        // Ignore listener errors
      }
    }
  }

  function setOnPlaybackEnded(fn) {
    onPlaybackEnded = typeof fn === "function" ? fn : null;
  }

  function hasStartedPlayback() {
    return Boolean(ctx && active && !paused && ctx.currentTime >= startCtxTime);
  }

  /** Raw buffer position — beatmap / chart placement coordinates. */
  function getPlaybackTimeMs() {
    if (!active || paused || !ctx) return pauseOffsetSec * 1000;
    if (ctx.currentTime < startCtxTime) return startOffsetSec * 1000;
    const elapsed = ctx.currentTime - startCtxTime;
    return Math.max(0, (startOffsetSec + elapsed) * 1000);
  }

  /**
   * Gameplay clock — what the player hears.
   * Latency is snapshotted once per play() so it cannot drift mid-session.
   */
  function getSongTimeMs() {
    const playbackMs = getPlaybackTimeMs();
    const latencyMs = hasStartedPlayback() ? latencyCompensationMs : 0;
    return Math.max(
      0,
      playbackMs - latencyMs - DEFAULT_FEEL_DELAY_MS + getUserSyncOffsetMs()
    );
  }

  function isAudible() {
    return (
      active &&
      !paused &&
      !ended &&
      source &&
      ctx?.state === "running" &&
      hasStartedPlayback()
    );
  }

  async function loadBuffer(track) {
    if (!track?.src) return null;
    if (bufferCache.has(track.id)) return bufferCache.get(track.id);

    const audioCtx = await ensureContext();
    if (!audioCtx) return null;

    const res = await fetch(track.src);
    const data = await res.arrayBuffer();
    const buf = await audioCtx.decodeAudioData(data.slice(0));
    bufferCache.set(track.id, buf);
    return buf;
  }

  async function preload(track) {
    return loadBuffer(track);
  }

  async function play(track, { restart = true, startAt = 0 } = {}) {
    if (playInFlight) {
      try {
        await playInFlight;
      } catch {
        // Superseded play — continue with new request
      }
    }

    const run = async () => {
      const audioCtx = await ensureContext();
      if (!audioCtx || !track) return false;

      const buffer = await loadBuffer(track);
      if (!buffer) return false;

      stopSource();
      ended = false;
      playSession += 1;
      const session = playSession;

      const offset = restart ? 0 : Math.max(0, Math.min(startAt, buffer.duration - 0.05));
      startCtxTime = audioCtx.currentTime + LOOKAHEAD_SEC;
      startOffsetSec = offset;
      pauseOffsetSec = offset;
      paused = false;
      active = true;
      trackId = track.id;

      latencyCompensationMs = measureLatencyMs();

      source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.onended = handleEnded;
      source.start(startCtxTime, offset);

      gain.gain.value = volume;

      await new Promise((resolve) => {
        let frames = 0;
        const waitUntilRunning = () => {
          if (session !== playSession) {
            resolve();
            return;
          }
          frames += 1;
          if (
            (audioCtx.state === "running" && audioCtx.currentTime >= startCtxTime) ||
            frames > 90
          ) {
            resolve();
            return;
          }
          requestAnimationFrame(waitUntilRunning);
        };
        requestAnimationFrame(waitUntilRunning);
      });

      return session === playSession;
    };

    playInFlight = run();
    try {
      return await playInFlight;
    } finally {
      if (playInFlight === run) playInFlight = null;
    }
  }

  function pause() {
    if (!active || paused || !ctx) return;
    if (ctx.currentTime >= startCtxTime) {
      pauseOffsetSec = startOffsetSec + (ctx.currentTime - startCtxTime);
    } else {
      pauseOffsetSec = startOffsetSec;
    }
    stopSource();
    paused = true;
  }

  async function resume() {
    if (playInFlight) return playInFlight;
    if (!active || !paused || ended) return false;
    const track = global.MusicCatalog?.getTrack(trackId);
    if (!track) return false;
    return play(track, { restart: false, startAt: pauseOffsetSec });
  }

  async function resumeContextOnly() {
    const audioCtx = await ensureContext();
    return Boolean(audioCtx && audioCtx.state === "running");
  }

  function stop() {
    playSession += 1;
    stopSource();
    active = false;
    paused = true;
    pauseOffsetSec = 0;
    trackId = null;
    ended = false;
    latencyCompensationMs = 0;
    playInFlight = null;
  }

  function isPlaying() {
    return isAudible();
  }

  function isActive() {
    return active;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (gain) gain.gain.value = volume;
  }

  function installLifecycleHandlers() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || !active || paused || ended) return;
      if (ctx?.state === "suspended") {
        ctx.resume().catch(() => {});
      }
    });
  }

  installLifecycleHandlers();

  global.LevelAudio = {
    play,
    pause,
    resume,
    resumeContextOnly,
    stop,
    preload,
    loadBuffer,
    ensureContext,
    unlockSync,
    getPlaybackTimeMs,
    getSongTimeMs,
    getHeardTimeMs: getSongTimeMs,
    getLatencyCompensationMs: () => latencyCompensationMs,
    getUserSyncOffsetMs,
    setUserSyncOffsetMs,
    isPlaying,
    isAudible,
    isActive,
    setVolume,
    setOnPlaybackEnded,
  };
})(window);
