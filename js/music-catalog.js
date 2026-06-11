/**
 * Shared track catalog for menu player + level rhythm sync.
 */
(function initMusicCatalog(global) {
  const ACTIVE_TRACK_KEY = "treeformance-active-track";
  const WANT_MUSIC_KEY = "treeformance-want-music";
  const MUSIC_TIME_KEY = "treeformance-music-time";
  const QUEUE_HANDOFF_KEY = "treeformance-music-queue-handoff";

  const ALBUMS = [
    {
      id: "paper-moon",
      name: "Paper Moon",
      artist: "Treeformance",
      color: "#1a1a1a",
      glyph: "☾",
      tracks: [
        {
          id: "paper-petals",
          title: "Paper Petals",
          src: "audio/paper-petals.mp3",
          duration: 159,
          difficulty: "easy",
        },
        {
          id: "paper-moon-echo",
          title: "Paper Moon Echo",
          src: "audio/paper-moon-echo.mp3",
          duration: 233,
          difficulty: "hard",
        },
        {
          id: "paper-moon-echo-ii",
          title: "Paper Moon Echo II",
          src: "audio/paper-moon-echo-ii.mp3",
          duration: 248,
          difficulty: "hard",
        },
        {
          id: "paper-moon-echo-iii",
          title: "Paper Moon Echo III",
          src: "audio/paper-moon-echo-iii.mp3",
          duration: 252,
          difficulty: "medium",
        },
      ],
    },
  ];

  const TRACK_BY_ID = new Map();
  const ALBUM_BY_ID = new Map();

  ALBUMS.forEach((album) => {
    ALBUM_BY_ID.set(album.id, album);
    album.tracks.forEach((track) => {
      TRACK_BY_ID.set(track.id, {
        ...track,
        albumId: album.id,
        albumName: album.name,
        albumColor: album.color,
      });
    });
  });

  function getTrack(id) {
    return TRACK_BY_ID.get(id) || null;
  }

  function getDefaultTrackId() {
    return "paper-petals";
  }

  function getActiveTrackId() {
    try {
      const stored = localStorage.getItem(ACTIVE_TRACK_KEY);
      if (stored && TRACK_BY_ID.has(stored)) return stored;
    } catch {
      // Ignore blocked storage
    }
    return getDefaultTrackId();
  }

  function setActiveTrackId(id) {
    if (!TRACK_BY_ID.has(id)) return;
    try {
      localStorage.setItem(ACTIVE_TRACK_KEY, id);
    } catch {
      // Ignore blocked storage
    }
  }

  function saveLevelHandoff({ playing, trackId, timeSec, queue, queueIndex, queueContext }) {
    try {
      sessionStorage.setItem(WANT_MUSIC_KEY, playing ? "1" : "0");
      if (trackId) setActiveTrackId(trackId);
      if (playing && Number.isFinite(timeSec) && timeSec > 0) {
        sessionStorage.setItem(MUSIC_TIME_KEY, String(timeSec));
      } else {
        sessionStorage.removeItem(MUSIC_TIME_KEY);
      }
      if (Array.isArray(queue) && queue.length) {
        sessionStorage.setItem(
          QUEUE_HANDOFF_KEY,
          JSON.stringify({ queue, queueIndex, queueContext })
        );
      }
    } catch {
      // Ignore blocked storage
    }
  }

  function readLevelHandoff() {
    try {
      const wantMusic = sessionStorage.getItem(WANT_MUSIC_KEY) !== "0";
      const timeRaw = sessionStorage.getItem(MUSIC_TIME_KEY);
      const timeSec = timeRaw ? parseFloat(timeRaw) : 0;
      let queue = [];
      let queueIndex = 0;
      let queueContext = "single";
      const queueRaw = sessionStorage.getItem(QUEUE_HANDOFF_KEY);
      if (queueRaw) {
        const parsed = JSON.parse(queueRaw);
        if (Array.isArray(parsed?.queue)) {
          queue = parsed.queue.filter((id) => TRACK_BY_ID.has(id));
          queueIndex = Math.max(0, Math.min(parsed.queueIndex ?? 0, Math.max(0, queue.length - 1)));
          queueContext =
            parsed.queueContext === "album" || parsed.queueContext === "playlist"
              ? parsed.queueContext
              : "single";
        }
      }
      return {
        wantMusic,
        timeSec: Number.isFinite(timeSec) ? timeSec : 0,
        queue,
        queueIndex,
        queueContext,
      };
    } catch {
      return { wantMusic: true, timeSec: 0, queue: [], queueIndex: 0, queueContext: "single" };
    }
  }

  function clearLevelHandoff() {
    try {
      sessionStorage.removeItem(WANT_MUSIC_KEY);
      sessionStorage.removeItem(MUSIC_TIME_KEY);
      sessionStorage.removeItem(QUEUE_HANDOFF_KEY);
    } catch {
      // Ignore blocked storage
    }
  }

  global.MusicCatalog = {
    ALBUMS,
    TRACK_BY_ID,
    ALBUM_BY_ID,
    getTrack,
    getDefaultTrackId,
    getActiveTrackId,
    setActiveTrackId,
    saveLevelHandoff,
    readLevelHandoff,
    clearLevelHandoff,
    ACTIVE_TRACK_KEY,
  };
})(window);
