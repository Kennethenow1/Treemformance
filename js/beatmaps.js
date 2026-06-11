/**
 * Per-song beatmaps — drum chart hits + scroll/difficulty config.
 * Peak data: js/beatmaps-data.js (run: node scripts/analyze-beats.js)
 */
(function initBeatmaps(global) {
  const DIFFICULTY = {
    easy: {
      label: "Easy",
      approachMs: 680,
      minNoteGapMs: 480,
      hitLatencyMs: 0,
      minPrepMs: 180,
      chartBeatStep: 1,
    },
    normal: {
      label: "Normal",
      approachMs: 700,
      minNoteGapMs: 500,
      hitLatencyMs: 0,
      minPrepMs: 180,
      chartBeatStep: 1,
    },
    medium: {
      label: "Medium",
      approachMs: 580,
      minNoteGapMs: 420,
      hitLatencyMs: 0,
      minPrepMs: 160,
      chartBeatStep: 1,
    },
    hard: {
      label: "Hard",
      approachMs: 460,
      minNoteGapMs: 360,
      hitLatencyMs: 0,
      minPrepMs: 140,
      chartBeatStep: 1,
    },
  };

  const TRACK_META = {
    "paper-petals": { difficulty: "easy", playbackOffsetMs: 0 },
    "paper-moon-echo": { difficulty: "hard", playbackOffsetMs: 0 },
    "paper-moon-echo-ii": { difficulty: "hard", playbackOffsetMs: 0 },
    "paper-moon-echo-iii": { difficulty: "medium", playbackOffsetMs: 0 },
  };

  function getDifficultyConfig(key) {
    return DIFFICULTY[key] || DIFFICULTY.normal;
  }

  function getAnalyzedData(trackId) {
    return global.BeatmapData?.[trackId] || null;
  }

  function applyPlaybackOffset(hits, offsetMs) {
    if (!offsetMs) return hits;
    return hits.map((t) => t + offsetMs);
  }

  function materializeBeatmap(trackId) {
    const catalog = global.MusicCatalog?.getTrack(trackId);
    const meta = TRACK_META[trackId] || {};
    const analyzed = getAnalyzedData(trackId);
    const diffKey = meta.difficulty || catalog?.difficulty || "normal";
    const diff = getDifficultyConfig(diffKey);
    const playbackOffset = meta.playbackOffsetMs || 0;

    if (analyzed?.hits?.length) {
      const map = {
        trackId,
        bpm: analyzed.bpm || 96,
        offsetMs: analyzed.offsetMs || analyzed.hits[0] || 0,
        difficulty: diffKey,
        difficultyLabel: diff.label,
        approachMs: diff.approachMs,
        minNoteGapMs: diff.minNoteGapMs,
        hitLatencyMs: diff.hitLatencyMs,
        minPrepMs: diff.minPrepMs,
        chartBeatStep: diff.chartBeatStep,
        hits: applyPlaybackOffset(analyzed.hits, playbackOffset),
        source: analyzed.source || "drums",
        chartMode: analyzed.chartMode || "groove",
      };
      return map;
    }

    const bpm = 96;
    const offsetMs = 2200;
    const duration = catalog?.duration || 180;
    const quarter = 60000 / bpm;
    const beatStep = diff.chartBeatStep || 1;
    const hits = [];
    let beat = 0;
    for (let t = offsetMs; t < duration * 1000 - 400; t += quarter, beat += 1) {
      if (beat % beatStep === 0) hits.push(Math.round(t));
    }

    return {
      trackId,
      bpm,
      offsetMs,
      difficulty: diffKey,
      difficultyLabel: diff.label,
      approachMs: diff.approachMs,
      minNoteGapMs: diff.minNoteGapMs,
      hitLatencyMs: diff.hitLatencyMs,
      minPrepMs: diff.minPrepMs,
      chartBeatStep: diff.chartBeatStep,
      hits,
      source: "grid",
      chartMode: "grid",
    };
  }

  function getBeatmap(trackId) {
    return materializeBeatmap(trackId);
  }

  function getHardHits(trackId) {
    return getBeatmap(trackId).hits;
  }

  function getScrollConfig(trackId) {
    const map = getBeatmap(trackId);
    return {
      approachMs: map.approachMs,
      minNoteGapMs: map.minNoteGapMs,
      minLeadMs: map.approachMs + map.minPrepMs,
      minPrepMs: map.minPrepMs,
      hitLatencyMs: map.hitLatencyMs,
      difficulty: map.difficulty,
      difficultyLabel: map.difficultyLabel,
      bpm: map.bpm,
      chartBeatStep: map.chartBeatStep,
    };
  }

  function getDifficultyLabel(trackId) {
    return getBeatmap(trackId).difficultyLabel;
  }

  function findBeatIndexAt(trackId, timeMs) {
    const hits = getHardHits(trackId);
    let i = 0;
    while (i < hits.length && hits[i] < timeMs) i += 1;
    return i;
  }

  function findNextAssignableBeat(trackId, beatIdx, minTimeMs) {
    const hits = getHardHits(trackId);
    let i = Math.max(0, beatIdx);
    while (i < hits.length && hits[i] < minTimeMs) i += 1;
    return i;
  }

  function estimateBeatMsFromHits(hits, chartBeatStep = 1) {
    if (hits.length < 3) return (60000 / 96) * chartBeatStep;
    const gaps = [];
    for (let i = 1; i < Math.min(hits.length, 48); i += 1) {
      gaps.push(hits[i] - hits[i - 1]);
    }
    const musical = gaps.filter((g) => g >= 350 && g <= 2400);
    const use = musical.length >= 3 ? musical : gaps;
    use.sort((a, b) => a - b);
    const median = use[Math.floor(use.length / 2)] || 700;
    return median * chartBeatStep;
  }

  /**
   * Pick best drum hit near target — prefers on-beat peaks, always returns a real hit.
   */
  function pickChartPeak(hits, startIdx, minTargetMs, map) {
    const fallbackIdx = findNextAssignableBeat(map.trackId, startIdx, minTargetMs);
    if (fallbackIdx >= hits.length) return null;

    const beatMs = estimateBeatMsFromHits(hits, map.chartBeatStep || 1);
    const anchor = hits[0] || map.offsetMs || 0;
    const idealGrid = anchor + Math.round((minTargetMs - anchor) / beatMs) * beatMs;
    const searchEnd = minTargetMs + Math.max(map.minNoteGapMs * 0.55, beatMs * 0.65);

    let best = null;
    let bestScore = Infinity;

    for (let i = startIdx; i < hits.length && hits[i] <= searchEnd; i += 1) {
      if (hits[i] < minTargetMs - 120) continue;
      const gridDist = Math.abs(hits[i] - idealGrid);
      const lateDist = Math.max(0, minTargetMs - hits[i]) * 0.25;
      const score = gridDist + lateDist;
      if (score < bestScore) {
        bestScore = score;
        best = { time: hits[i], idx: i };
      }
    }

    if (best) return best;
    return { time: hits[fallbackIdx], idx: fallbackIdx };
  }

  /**
   * Map chart arrows onto drum downbeats from the active song.
   */
  function assignChartToPeaks(trackId, chartStartMs, noteCount) {
    const map = getBeatmap(trackId);
    const hits = map.hits;
    const times = [];
    let idx = findBeatIndexAt(trackId, chartStartMs);

    for (let n = 0; n < noteCount; n += 1) {
      const minTarget =
        n === 0
          ? chartStartMs + map.approachMs
          : times[n - 1] + map.minNoteGapMs;

      const picked = pickChartPeak(hits, idx, minTarget, map);
      if (!picked) break;

      times.push(picked.time);
      idx = picked.idx + 1;
    }

    return { times, nextBeatIdx: idx };
  }

  global.Beatmaps = {
    DIFFICULTY,
    getBeatmap,
    getHardHits,
    getScrollConfig,
    getDifficultyLabel,
    findBeatIndexAt,
    findNextAssignableBeat,
    assignChartToPeaks,
  };
})(window);
