/**
 * Beat sync calibration — slider + tile mini-game (phone Sync tab).
 */
(function initSyncCalibration(global) {
  const STORAGE_KEY = "treeformance-sync-offset-ms";
  const DEFAULT_OFFSET_MS = -42;
  const MIN_MS = -80;
  const MAX_MS = 80;
  const TEST_BPM = 120;

  const GAME_BPM = 120;
  const BEAT_INTERVAL_MS = Math.round(60000 / GAME_BPM);
  const APPROACH_MS = 900;
  const LEAD_MS = 1600;
  const TILE_HEIGHT = 44;
  const JUDGE_PERFECT = 14;
  const JUDGE_GOOD = 28;
  const JUDGE_OK = 44;
  const MAX_BEATS = 48;

  let testTimer = null;
  let testCtx = null;
  let testNextAt = 0;

  let gameRunning = false;
  let gameRaf = 0;
  let gameStartCtxTime = 0;
  let gameLatencyMs = 0;
  let gameBeatIndex = 0;
  let gameBeatState = { judged: false, missed: false, flashed: false };
  let gameNextSchedule = 0;
  let gameScheduled = new Set();
  let gameTapErrors = [];
  let gameUi = null;

  function readOffsetMs() {
    if (global.LevelAudio?.getUserSyncOffsetMs) {
      return global.LevelAudio.getUserSyncOffsetMs();
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw != null) return Number.parseInt(raw, 10) || 0;
    } catch {
      // Ignore blocked storage
    }
    return DEFAULT_OFFSET_MS;
  }

  function writeOffsetMs(ms) {
    const clamped = Math.max(MIN_MS, Math.min(MAX_MS, Math.round(ms)));
    if (global.LevelAudio?.setUserSyncOffsetMs) {
      global.LevelAudio.setUserSyncOffsetMs(clamped);
    } else {
      try {
        localStorage.setItem(STORAGE_KEY, String(clamped));
      } catch {
        // Ignore blocked storage
      }
    }
    global.dispatchEvent(
      new CustomEvent("sync-calibration:change", { detail: { ms: clamped } })
    );
    return clamped;
  }

  function formatOffset(ms) {
    if (ms === 0) return "0 ms";
    return ms > 0 ? `+${ms} ms` : `${ms} ms`;
  }

  function ensureTestContext() {
    if (testCtx?.state === "closed") testCtx = null;
    if (testCtx) return testCtx;
    const Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return null;
    testCtx = new Ctx({ latencyHint: "interactive" });
    return testCtx;
  }

  function playClickAt(ctx, when) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(when);
    gain.gain.setValueAtTime(0.12, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.06);
    osc.stop(when + 0.07);
  }

  function playTestClick() {
    const ctx = ensureTestContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    playClickAt(ctx, ctx.currentTime + 0.02);
  }

  function stopTestBeats() {
    if (testTimer) {
      clearInterval(testTimer);
      testTimer = null;
    }
    testNextAt = 0;
  }

  function startTestBeats(onPulse) {
    stopTestBeats();
    const intervalMs = Math.round(60000 / TEST_BPM);
    playTestClick();
    onPulse?.();

    testTimer = setInterval(() => {
      playTestClick();
      onPulse?.();
    }, intervalMs);
  }

  function beatSongMs(index) {
    return LEAD_MS + index * BEAT_INTERVAL_MS;
  }

  function getGamePlaybackMs() {
    if (!testCtx || !gameRunning) return 0;
    return Math.max(0, (testCtx.currentTime - gameStartCtxTime) * 1000);
  }

  function getGameSongTimeMs() {
    return getGamePlaybackMs() - gameLatencyMs + readOffsetMs();
  }

  function judgeTierFromError(errorMs) {
    const abs = Math.abs(errorMs);
    if (abs <= JUDGE_PERFECT) return "perfect";
    if (abs <= JUDGE_GOOD) return "good";
    if (abs <= JUDGE_OK) return "ok";
    return errorMs < 0 ? "early" : "late";
  }

  function judgeLabel(tier) {
    if (tier === "perfect") return "Perfect!";
    if (tier === "good") return "Good";
    if (tier === "ok") return "OK";
    if (tier === "early") return "Early!";
    return "Late!";
  }

  function getTileTopPx(beatMs, hitLineY) {
    const musicMs = getGameSongTimeMs();
    const spawnMs = beatMs - APPROACH_MS;
    const startY = -TILE_HEIGHT;
    const endY = hitLineY - TILE_HEIGHT;

    if (musicMs < spawnMs) return startY;
    if (musicMs <= beatMs) {
      const progress = Math.min(1, Math.max(0, (musicMs - spawnMs) / APPROACH_MS));
      return startY + progress * (endY - startY);
    }
    return endY;
  }

  function scheduleGameBeat(index) {
    if (!testCtx || gameScheduled.has(index)) return;
    const beatMs = beatSongMs(index);
    const when = gameStartCtxTime + (beatMs + gameLatencyMs) / 1000;
    if (when < testCtx.currentTime - 0.02) return;
    gameScheduled.add(index);
    playClickAt(testCtx, when);
  }

  function updateAvgHint() {
    if (!gameUi?.avgEl) return;
    if (gameTapErrors.length < 2) {
      gameUi.avgEl.textContent = "Tap when the tile hits the line — adjust slider until hits feel Perfect.";
      gameUi.avgEl.className = "sync-cal-game__avg";
      return;
    }

    const avg = Math.round(
      gameTapErrors.reduce((sum, n) => sum + n, 0) / gameTapErrors.length
    );
    let hint = `Avg tap: ${avg > 0 ? "+" : ""}${avg} ms`;
    let cls = "sync-cal-game__avg";

    if (avg > 18) {
      hint += " — try dragging Earlier";
      cls += " sync-cal-game__avg--late";
    } else if (avg < -18) {
      hint += " — try dragging Later";
      cls += " sync-cal-game__avg--early";
    } else {
      hint += " — nice, keep going!";
      cls += " sync-cal-game__avg--good";
    }

    gameUi.avgEl.textContent = hint;
    gameUi.avgEl.className = cls;
  }

  function showJudge(text, tier) {
    if (!gameUi?.judgeEl) return;
    gameUi.judgeEl.textContent = text;
    gameUi.judgeEl.className = `sync-cal-game__judge sync-cal-game__judge--${tier}`;
    gameUi.judgeEl.hidden = false;
    clearTimeout(gameUi.judgeTimer);
    gameUi.judgeTimer = setTimeout(() => {
      if (gameUi?.judgeEl) gameUi.judgeEl.hidden = true;
    }, 520);
  }

  function flashReceptor() {
    if (!gameUi?.receptor) return;
    gameUi.receptor.classList.add("is-hit-flash");
    clearTimeout(gameUi.receptorTimer);
    gameUi.receptorTimer = setTimeout(() => {
      gameUi?.receptor?.classList.remove("is-hit-flash");
    }, 180);
  }

  function pulseHitline() {
    if (!gameUi?.hitzone) return;
    gameUi.hitzone.classList.add("is-beat");
    clearTimeout(gameUi.hitlineTimer);
    gameUi.hitlineTimer = setTimeout(() => {
      gameUi?.hitzone?.classList.remove("is-beat");
    }, 120);
  }

  function advanceBeat() {
    gameBeatIndex += 1;
    if (gameUi?.tileEl) {
      gameUi.tileEl.classList.remove("is-miss", "is-slam");
      gameUi.tileEl.hidden = gameBeatIndex >= MAX_BEATS;
    }
  }

  function handleMiss() {
    if (!gameUi?.tileEl) return;
    gameUi.tileEl.classList.add("is-miss");
    showJudge("Miss", "miss");
    advanceBeat();
  }

  function handleTap() {
    if (!gameRunning || !gameUi) return;

    const beatMs = beatSongMs(gameBeatIndex);
    const errorMs = getGameSongTimeMs() - beatMs;
    const tier = judgeTierFromError(errorMs);

    if (tier === "early" || tier === "late") {
      showJudge(judgeLabel(tier), tier);
      flashReceptor();
      return;
    }

    gameTapErrors.push(errorMs);
    if (gameTapErrors.length > 10) gameTapErrors.shift();
    updateAvgHint();

    gameBeatState.judged = true;
    showJudge(judgeLabel(tier), tier);
    flashReceptor();
    gameUi.tileEl?.classList.add("is-slam");
    setTimeout(advanceBeat, 160);
  }

  function gameTick() {
    if (!gameRunning || !gameUi) return;

    const songMs = getGameSongTimeMs();
    const beatMs = beatSongMs(gameBeatIndex);

    while (
      gameNextSchedule < MAX_BEATS &&
      beatSongMs(gameNextSchedule) <= songMs + 2400
    ) {
      scheduleGameBeat(gameNextSchedule);
      gameNextSchedule += 1;
    }

    if (gameBeatIndex < MAX_BEATS && gameUi.tileEl) {
      const hitLineY = gameUi.hitLineY || 0;
      const top = getTileTopPx(beatMs, hitLineY);
      gameUi.tileEl.style.top = `${top}px`;

      if (
        !gameBeatState.flashed &&
        songMs >= beatMs - 20 &&
        songMs < beatMs + 40
      ) {
        gameBeatState.flashed = true;
        pulseHitline();
      }

      if (!gameBeatState.judged && !gameBeatState.missed && songMs > beatMs + JUDGE_OK) {
        handleMiss();
      }
    } else if (gameBeatIndex >= MAX_BEATS) {
      stopSyncGame();
      showJudge("Done — save your offset!", "good");
      if (gameUi.playBtn) {
        gameUi.playBtn.classList.remove("is-active");
        gameUi.playBtn.textContent = "Play again";
      }
      return;
    }

    gameRaf = requestAnimationFrame(gameTick);
  }

  function pauseBackgroundMusic() {
    global.TreeMusic?.pauseForSyncCalibration?.();
  }

  function resumeBackgroundMusic() {
    global.TreeMusic?.resumeAfterSyncCalibration?.();
  }

  function stopSyncGame({ resumeMusic = true } = {}) {
    const wasRunning = gameRunning;
    gameRunning = false;
    if (gameRaf) {
      cancelAnimationFrame(gameRaf);
      gameRaf = 0;
    }
    gameScheduled.clear();
    gameNextSchedule = 0;
    gameBeatIndex = 0;
    gameBeatState = { judged: false, missed: false, flashed: false };
    gameTapErrors = [];
    if (gameUi?.hitzone) gameUi.hitzone.classList.remove("is-beat");
    if (gameUi?.tileEl) {
      gameUi.tileEl.classList.remove("is-miss", "is-slam");
      gameUi.tileEl.hidden = false;
    }
    if (gameUi?.playBtn && !gameRunning) {
      gameUi.playBtn.classList.remove("is-active");
      gameUi.playBtn.textContent = "Start calibration";
    }
    updateAvgHint();
    if (wasRunning && resumeMusic) resumeBackgroundMusic();
  }

  async function startSyncGame() {
    stopTestBeats();
    stopSyncGame({ resumeMusic: false });

    pauseBackgroundMusic();

    const ctx = ensureTestContext();
    if (!ctx) return;
    if (ctx.state === "suspended") await ctx.resume();

    gameLatencyMs = Math.round(((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000);
    gameStartCtxTime = ctx.currentTime + 0.1;
    gameBeatIndex = 0;
    gameBeatState = { judged: false, missed: false, flashed: false };
    gameNextSchedule = 0;
    gameScheduled = new Set();
    gameTapErrors = [];
    gameRunning = true;

    if (gameUi?.playBtn) {
      gameUi.playBtn.classList.add("is-active");
      gameUi.playBtn.textContent = "Stop";
    }
    if (gameUi?.judgeEl) gameUi.judgeEl.hidden = true;
    updateAvgHint();

    gameRaf = requestAnimationFrame(gameTick);
  }

  function mountSliderBlock(root, options = {}) {
    const compact = Boolean(options.compact);
    const withTest = options.withTest !== false && !compact;

    root.innerHTML += `
      <div class="sync-cal__head">
        <span class="sync-cal__title">Beat sync</span>
        <span class="sync-cal__value" data-sync-value>0 ms</span>
      </div>
      <p class="sync-cal__hint">
        Tiles feel <strong>early</strong>? Drag toward <strong>Later</strong>.
        Feel <strong>late</strong>? Drag toward <strong>Earlier</strong>.
      </p>
      <div class="sync-cal__labels">
        <span>Later</span>
        <span>Earlier</span>
      </div>
      <input
        type="range"
        class="sync-cal__slider"
        min="${MIN_MS}"
        max="${MAX_MS}"
        step="1"
        value="-42"
        aria-label="Beat sync offset"
        data-sync-slider
      >
      <div class="sync-cal__actions">
        <button type="button" class="sync-cal__btn" data-sync-reset>Reset</button>
        ${
          withTest
            ? '<button type="button" class="sync-cal__btn" data-sync-test>Test beats</button>'
            : ""
        }
      </div>
      ${withTest ? '<div class="sync-cal__pulse" hidden data-sync-pulse><span class="sync-cal__pulse-dot"></span></div>' : ""}
    `;

    const slider = root.querySelector("[data-sync-slider]");
    const valueEl = root.querySelector("[data-sync-value]");
    const resetBtn = root.querySelector("[data-sync-reset]");
    const testBtn = root.querySelector("[data-sync-test]");
    const pulseWrap = root.querySelector("[data-sync-pulse]");
    const pulseDot = root.querySelector(".sync-cal__pulse-dot");

    function refresh(ms = readOffsetMs()) {
      const clamped = writeOffsetMs(ms);
      slider.value = String(clamped);
      valueEl.textContent = formatOffset(clamped);
      return clamped;
    }

    refresh(readOffsetMs());

    slider.addEventListener("input", () => {
      const ms = Number.parseInt(slider.value, 10) || 0;
      valueEl.textContent = formatOffset(ms);
      writeOffsetMs(ms);
    });

    resetBtn.addEventListener("click", () => {
      refresh(DEFAULT_OFFSET_MS);
    });

    if (testBtn && pulseWrap && pulseDot) {
      testBtn.addEventListener("click", () => {
        const running = Boolean(testTimer);
        stopTestBeats();
        testBtn.classList.remove("is-active");
        pulseWrap.hidden = true;

        if (running) return;

        testBtn.classList.add("is-active");
        pulseWrap.hidden = false;
        startTestBeats(() => {
          pulseDot.classList.remove("is-hit");
          void pulseDot.offsetWidth;
          pulseDot.classList.add("is-hit");
        });
      });
    }

    return { refresh };
  }

  function mount(container, options = {}) {
    if (!container || container.querySelector(".sync-cal")) return null;

    const compact = Boolean(options.compact);
    const root = document.createElement("div");
    root.className = `sync-cal${compact ? " sync-cal--compact" : " sync-cal--full"}`;
    container.appendChild(root);
    const controls = mountSliderBlock(root, options);

    return {
      refresh: controls.refresh,
      destroy() {
        stopTestBeats();
        root.remove();
      },
    };
  }

  function mountSyncGame(container) {
    if (!container || container.querySelector(".sync-cal-game")) return null;

    const root = document.createElement("div");
    root.className = "sync-cal-game";
    root.innerHTML = `
      <div class="sync-cal-game__head">
        <h3 class="sync-cal-game__title">Sync</h3>
        <p class="sync-cal-game__intro">
          Tap <strong>↓</strong> when the tile hits the line with the beat.
          Drag the slider until hits feel <strong>Perfect</strong>.
        </p>
      </div>
      <div class="sync-cal-game__stage" data-sync-stage>
        <div class="sync-cal-game__lanes">
          <div class="sync-cal-game__lane">
            <div class="sync-cal-game__tiles" data-sync-tiles>
              <div class="sync-cal-game__tile" data-sync-tile></div>
            </div>
          </div>
        </div>
        <div class="sync-cal-game__hitzone" data-sync-hitzone>
          <div class="sync-cal-game__hitline"></div>
          <button type="button" class="sync-cal-game__receptor" data-sync-receptor aria-label="Tap on beat">↓</button>
        </div>
        <div class="sync-cal-game__judge" data-sync-judge hidden>Perfect!</div>
      </div>
      <p class="sync-cal-game__avg" data-sync-avg>
        Tap when the tile hits the line — adjust slider until hits feel Perfect.
      </p>
      <div class="sync-cal sync-cal--full" data-sync-controls></div>
      <div class="sync-cal-game__play-row">
        <button type="button" class="sync-cal-game__play" data-sync-play>Start calibration</button>
      </div>
    `;
    container.appendChild(root);

    const controlsWrap = root.querySelector("[data-sync-controls]");
    mountSliderBlock(controlsWrap, { compact: false, withTest: false });

    const stage = root.querySelector("[data-sync-stage]");
    const lane = root.querySelector(".sync-cal-game__lane");
    const tileEl = root.querySelector("[data-sync-tile]");
    const hitzone = root.querySelector("[data-sync-hitzone]");
    const receptor = root.querySelector("[data-sync-receptor]");
    const judgeEl = root.querySelector("[data-sync-judge]");
    const avgEl = root.querySelector("[data-sync-avg]");
    const playBtn = root.querySelector("[data-sync-play]");

    function measureHitLine() {
      if (!lane) return 0;
      return lane.clientHeight;
    }

    let hitLineY = measureHitLine();
    gameUi = {
      stage,
      lane,
      tileEl,
      hitzone,
      receptor,
      judgeEl,
      avgEl,
      playBtn,
      hitLineY,
      judgeTimer: 0,
      receptorTimer: 0,
      hitlineTimer: 0,
    };

    const onResize = () => {
      hitLineY = measureHitLine();
      if (gameUi) gameUi.hitLineY = hitLineY;
    };
    global.addEventListener("resize", onResize);

    function onTap(e) {
      e.preventDefault();
      receptor.classList.add("is-pressed");
      handleTap();
      setTimeout(() => receptor.classList.remove("is-pressed"), 100);
    }

    receptor.addEventListener("pointerdown", onTap);
    hitzone.addEventListener("pointerdown", (e) => {
      if (e.target === receptor) return;
      onTap(e);
    });

    playBtn.addEventListener("click", () => {
      if (gameRunning) {
        stopSyncGame();
        playBtn.classList.remove("is-active");
        playBtn.textContent = "Start calibration";
        return;
      }
      hitLineY = measureHitLine();
      gameUi.hitLineY = hitLineY;
      startSyncGame();
    });

    return {
      destroy() {
        stopSyncGame();
        global.removeEventListener("resize", onResize);
        gameUi = null;
        root.remove();
      },
    };
  }

  function mountMenuView() {
    const view = document.getElementById("music-view-sync");
    if (!view || view.dataset.syncMounted === "1") return;
    view.dataset.syncMounted = "1";
    mountSyncGame(view);
  }

  function boot() {
    mountMenuView();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.SyncCalibration = {
    readOffsetMs,
    writeOffsetMs,
    mount,
    mountSyncGame,
    stopTestBeats,
    stopSyncGame,
  };
})(window);
