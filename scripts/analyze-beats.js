#!/usr/bin/env node
/**
 * Extract chart hits from isolated drum stems.
 * Hard = kick downbeats only. Medium/Normal = kick-led groove.
 * Usage: node scripts/analyze-beats.js
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const AUDIO_DIR = path.join(ROOT, "audio");
const SAMPLE_RATE = 22050;
const WINDOW = 1024;
const HOP = 512;
const MP3_PREROLL_MS = 23;

const TRACKS = [
  {
    id: "paper-petals",
    file: "paper-petals.mp3",
    difficulty: "normal",
    minGapMs: 1100,
    chartMode: "groove",
  },
  {
    id: "paper-moon-echo",
    file: "paper-moon-echo.mp3",
    difficulty: "hard",
    minGapMs: 680,
    chartMode: "kick-only",
  },
  {
    id: "paper-moon-echo-ii",
    file: "paper-moon-echo-ii.mp3",
    difficulty: "hard",
    minGapMs: 680,
    chartMode: "kick-only",
  },
  {
    id: "paper-moon-echo-iii",
    file: "paper-moon-echo-iii.mp3",
    difficulty: "medium",
    minGapMs: 880,
    chartMode: "groove",
  },
];

const KICK_FILTER =
  "highpass=f=38,lowpass=f=155,acompressor=threshold=0.02:ratio=14:attack=1:release=110:makeup=6";

const SNARE_FILTER =
  "highpass=f=175,lowpass=f=4800,acompressor=threshold=0.04:ratio=10:attack=1:release=45:makeup=5";

function decodeMp3(filePath, filter) {
  const buf = execFileSync(
    "ffmpeg",
    [
      "-i", filePath,
      "-af", filter,
      "-ac", "1",
      "-ar", String(SAMPLE_RATE),
      "-f", "s16le",
      "-acodec", "pcm_s16le",
      "pipe:1",
    ],
    { encoding: "buffer", maxBuffer: 1024 * 1024 * 80, stdio: ["ignore", "pipe", "ignore"] }
  );
  return new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
}

function buildFrames(samples) {
  const frames = [];
  for (let i = 0; i + WINDOW <= samples.length; i += HOP) {
    let sum = 0;
    for (let j = 0; j < WINDOW; j += 1) {
      const s = samples[i + j] / 32768;
      sum += s * s;
    }
    frames.push({
      t: (i / SAMPLE_RATE) * 1000,
      rms: Math.sqrt(sum / WINDOW),
    });
  }
  return frames;
}

function smooth(frames, radius = 2) {
  return frames.map((frame, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(frames.length - 1, i + radius); j += 1) {
      sum += frames[j].rms;
      count += 1;
    }
    return { t: frame.t, rms: sum / count };
  });
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(sorted.length - 1, Math.max(0, idx))];
}

function pickDrumPeaks(frames, { minGapMs, sensitivity = 0.68, boost = 1.25 }) {
  const energies = frames.map((f) => f.rms);
  const median = percentile(energies, 0.5);
  const hits = [];
  let lastHit = -Infinity;

  for (let i = 2; i < frames.length - 2; i += 1) {
    const cur = frames[i];
    const local = energies.slice(Math.max(0, i - 24), Math.min(energies.length, i + 24));
    const threshold = Math.max(
      median * boost,
      percentile(local, sensitivity) * 1.05
    );

    const isPeak =
      cur.rms > frames[i - 1].rms &&
      cur.rms >= frames[i + 1].rms &&
      cur.rms >= frames[i - 2].rms &&
      cur.rms >= frames[i + 2].rms &&
      cur.rms >= threshold;

    if (!isPeak) continue;

    if (cur.t - lastHit < minGapMs) {
      const lastIdx = hits.length
        ? frames.findIndex((f) => Math.abs(f.t - hits[hits.length - 1]) < 1)
        : -1;
      const lastEnergy = lastIdx >= 0 ? energies[lastIdx] : 0;
      if (cur.rms > lastEnergy) {
        hits[hits.length - 1] = Math.round(cur.t);
        lastHit = cur.t;
      }
      continue;
    }

    hits.push(Math.round(cur.t));
    lastHit = cur.t;
  }

  return hits;
}

function drumOnsetPeaks(frames, { minGapMs, fluxPercentile = 0.86 }) {
  const flux = frames.map((frame, i) => {
    if (i === 0) return { t: frame.t, flux: 0 };
    const cur = Math.log1p(frame.rms * 120);
    const prev = Math.log1p(frames[i - 1].rms * 120);
    return { t: frame.t, flux: Math.max(0, cur - prev) };
  });

  const values = flux.map((f) => f.flux);
  const threshold = percentile(values, fluxPercentile);
  const hits = [];
  let lastHit = -Infinity;

  for (let i = 2; i < flux.length - 2; i += 1) {
    const cur = flux[i];
    if (cur.flux < threshold) continue;
    if (!(cur.flux >= flux[i - 1].flux && cur.flux >= flux[i + 1].flux)) continue;
    if (cur.t - lastHit < minGapMs) continue;
    hits.push(Math.round(cur.t));
    lastHit = cur.t;
  }

  return hits;
}

function dedupeHits(hits, minGapMs) {
  const sorted = [...hits].sort((a, b) => a - b);
  const out = [];
  sorted.forEach((t) => {
    if (!out.length || t - out[out.length - 1] >= minGapMs) out.push(t);
  });
  return out;
}

function mergeKickSnare(kickHits, snareHits, minGapMs) {
  const tagged = [
    ...kickHits.map((t) => ({ t, kind: "kick" })),
    ...snareHits.map((t) => ({ t, kind: "snare" })),
  ].sort((a, b) => a.t - b.t);

  const out = [];
  tagged.forEach((hit) => {
    if (!out.length) {
      out.push(hit);
      return;
    }
    const prev = out[out.length - 1];
    const gap = hit.t - prev.t;
    if (gap < 100) {
      if (hit.kind === "kick" && prev.kind === "snare") out[out.length - 1] = hit;
      return;
    }
    if (gap < minGapMs) {
      if (hit.kind === "kick" && prev.kind === "snare") out[out.length - 1] = hit;
      return;
    }
    out.push(hit);
  });
  return out.map((h) => h.t);
}

/** Snap raw hits onto a musical beat grid — drops off-beat detections. */
function snapToBeatGrid(hits, bpm, { minGapMs, beatStep = 1 }) {
  if (hits.length < 4 || !bpm) return hits;

  const beatMs = (60000 / bpm) * beatStep;
  const start = hits[0];
  const end = hits[hits.length - 1];
  const snapped = [];
  let hitIdx = 0;

  for (let grid = start; grid <= end + beatMs; grid += beatMs) {
    const winStart = grid - beatMs * 0.32;
    const winEnd = grid + beatMs * 0.32;

    while (hitIdx < hits.length && hits[hitIdx] < winStart) hitIdx += 1;

    let best = null;
    let bestDist = Infinity;
    for (let i = hitIdx; i < hits.length && hits[i] <= winEnd; i += 1) {
      const dist = Math.abs(hits[i] - grid);
      if (dist < bestDist) {
        bestDist = dist;
        best = hits[i];
      }
    }

    if (best == null) continue;
    if (snapped.length && best - snapped[snapped.length - 1] < minGapMs * 0.8) continue;
    snapped.push(best);
  }

  return snapped.length >= 4 ? snapped : hits;
}

function estimateBpm(hits) {
  if (hits.length < 4) return 96;
  const gaps = [];
  for (let i = 1; i < Math.min(hits.length, 80); i += 1) gaps.push(hits[i] - hits[i - 1]);
  const musical = gaps.filter((g) => g >= 350 && g <= 2400);
  const use = musical.length >= 3 ? musical : gaps;
  use.sort((a, b) => a - b);
  const medianGap = use[Math.floor(use.length / 2)] || 700;
  return medianGap > 0 ? Math.round(60000 / medianGap) : 96;
}

function analyzeTrack(track) {
  const filePath = path.join(AUDIO_DIR, track.file);
  const kick = smooth(buildFrames(decodeMp3(filePath, KICK_FILTER)));
  const snare = smooth(buildFrames(decodeMp3(filePath, SNARE_FILTER)));

  const kickPeaks = pickDrumPeaks(kick, {
    minGapMs: track.minGapMs,
    sensitivity: 0.62,
    boost: 1.2,
  });
  const kickOnsets = drumOnsetPeaks(kick, {
    minGapMs: Math.round(track.minGapMs * 0.92),
    fluxPercentile: 0.88,
  });

  let rawHits;
  if (track.chartMode === "kick-only") {
    rawHits = dedupeHits([...kickPeaks, ...kickOnsets], track.minGapMs);
  } else {
    const snarePeaks = pickDrumPeaks(snare, {
      minGapMs: Math.round(track.minGapMs * 0.75),
      sensitivity: 0.7,
      boost: 1.28,
    });
    const snareOnsets = drumOnsetPeaks(snare, {
      minGapMs: Math.round(track.minGapMs * 0.7),
      fluxPercentile: 0.87,
    });
    const kickAll = dedupeHits([...kickPeaks, ...kickOnsets], Math.round(track.minGapMs * 0.9));
    const snareAll = dedupeHits([...snarePeaks, ...snareOnsets], Math.round(track.minGapMs * 0.65));
    rawHits = mergeKickSnare(kickAll, snareAll, track.minGapMs);
  }

  const bpm = estimateBpm(rawHits);
  const beatStep = track.difficulty === "normal" ? 2 : 1;
  const hits = snapToBeatGrid(rawHits, bpm, {
    minGapMs: track.minGapMs,
    beatStep,
  }).map((t) => t + MP3_PREROLL_MS);

  const durationSec = kick.length * HOP / SAMPLE_RATE;
  return {
    id: track.id,
    difficulty: track.difficulty,
    chartMode: track.chartMode,
    durationSec: Math.round(durationSec),
    offsetMs: hits[0] ?? 0,
    bpm,
    hitCount: hits.length,
    rawCount: rawHits.length,
    kickCount: kickPeaks.length,
    hits,
  };
}

const results = TRACKS.map(analyzeTrack);
const outPath = path.join(ROOT, "js", "beatmaps-data.js");

const fileBody = `/**
 * Auto-generated beatmaps — run: node scripts/analyze-beats.js
 * Chart hits = kick downbeats snapped to song grid (hard = kick-only).
 */
(function initBeatmapData(global) {
  global.BeatmapData = ${JSON.stringify(
    Object.fromEntries(results.map((r) => [r.id, {
      offsetMs: r.offsetMs,
      bpm: r.bpm,
      source: "drums",
      chartMode: r.chartMode,
      hits: r.hits,
    }])),
    null,
    2
  )};
})(typeof window !== "undefined" ? window : global);
`;

fs.writeFileSync(outPath, fileBody);
console.log(JSON.stringify(results.map((r) => ({
  id: r.id,
  chartMode: r.chartMode,
  hitCount: r.hitCount,
  rawCount: r.rawCount,
  kickCount: r.kickCount,
  bpm: r.bpm,
  offsetMs: r.offsetMs,
  firstHits: r.hits.slice(0, 12),
  gaps: r.hits.slice(1, 10).map((t, i) => t - r.hits[i]),
})), null, 2));
