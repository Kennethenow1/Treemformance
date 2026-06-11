/**
 * TREEFORMANCE — Phone-style music player
 * Albums, playlists (localStorage), MP3 playback.
 */
(function initMusicApp(global) {
  const STORAGE_KEY = "treeformance-music";
  const QUEUE_SESSION_KEY = "treeformance-playback-queue";
  const PROGRESS_TICK_MS = 250;

  const ALBUMS = global.MusicCatalog?.ALBUMS ?? [];
  const TRACK_BY_ID = global.MusicCatalog?.TRACK_BY_ID ?? new Map();
  const ALBUM_BY_ID = global.MusicCatalog?.ALBUM_BY_ID ?? new Map();

  /* ---- MP3 playback engine ---- */

  class Mp3Engine {
    constructor() {
      this.audio = new Audio();
      this.audio.preload = "metadata";
      this.volume = 0.55;
      this.track = null;
      this.onEnded = null;
      this.audio.volume = this.volume;

      this.audio.addEventListener("ended", () => {
        this.onEnded?.();
      });
    }

    async unlock() {
      return true;
    }

    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, v));
      this.audio.volume = this.volume;
    }

    stop() {
      this.audio.pause();
      this.audio.currentTime = 0;
    }

    pause() {
      this.audio.pause();
    }

    async play(track, { restart = true } = {}) {
      if (!track?.src) return;

      if (this.track?.id !== track.id) {
        this.audio.src = track.src;
        this.track = track;
      }

      this.audio.volume = this.volume;
      if (restart) this.audio.currentTime = 0;
      await this.audio.play();
    }

    async resume() {
      if (!this.audio.src) return;
      await this.audio.play();
    }

    getProgress() {
      const dur = this.audio.duration;
      if (!dur || !Number.isFinite(dur)) {
        const track = this.track;
        if (track?.duration) return this.audio.currentTime / track.duration;
        return 0;
      }
      return this.audio.currentTime / dur;
    }

    isPlaying() {
      return !this.audio.paused && !this.audio.ended;
    }

    hasActiveTrack() {
      return Boolean(this.track && this.audio.src);
    }
  }

  /* ---- Playlist storage ---- */

  function normalizeState(raw) {
    const fallback = { playlists: [], volume: 0.55 };
    if (!raw || typeof raw !== "object") return { ...fallback };

    const playlists = Array.isArray(raw.playlists)
      ? raw.playlists
          .filter((pl) => pl && typeof pl.name === "string" && pl.name.trim())
          .map((pl) => ({
            id: typeof pl.id === "string" && pl.id ? pl.id : uid(),
            name: pl.name.trim(),
            trackIds: Array.isArray(pl.trackIds)
              ? pl.trackIds.filter((id) => TRACK_BY_ID.has(id))
              : [],
          }))
      : [];

    const volume =
      typeof raw.volume === "number" && Number.isFinite(raw.volume)
        ? Math.max(0, Math.min(1, raw.volume))
        : 0.55;

    return { playlists, volume };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeState(JSON.parse(raw));
    } catch {
      // Ignore corrupt storage
    }
    return normalizeState(null);
  }

  function saveState(nextState) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(nextState)));
      return true;
    } catch {
      return false;
    }
  }

  function ensurePlaylists() {
    if (!Array.isArray(state.playlists)) {
      state = normalizeState(state);
    }
    return state.playlists;
  }

  function uid() {
    return `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  /* ---- Player queue ---- */

  const engine = new Mp3Engine();

  function bindMenuOnEnded() {
    engine.onEnded = () => {
      if (queue.length > 1) {
        playNext();
        return;
      }
      stopProgressTimer();
      updatePlayerUI();
      showMiniPill(false);
    };
  }

  bindMenuOnEnded();
  let state = loadState();
  let queue = [];
  let queueIndex = 0;
  let currentTrackId = null;
  let levelMode = false;
  let progressTimer = null;
  let activeAlbumId = null;
  let activePlaylistId = null;
  let pickerTrackId = null;
  let pausedForSyncCalibration = false;

  function getCurrentTrack() {
    return currentTrackId ? TRACK_BY_ID.get(currentTrackId) : null;
  }

  function getTrackDifficultyLabel(trackId) {
    const track = TRACK_BY_ID.get(trackId);
    if (track?.difficulty === "easy") return "Easy";
    if (track?.difficulty === "hard") return "Hard";
    if (track?.difficulty === "medium") return "Medium";
    if (track?.difficulty === "normal") return "Normal";
    return global.Beatmaps?.getDifficultyLabel?.(trackId) || "";
  }

  function getTrackDifficultyBadge(trackId) {
    const label = getTrackDifficultyLabel(trackId);
    if (!label || label === "Normal") return "";
    const slug = label.toLowerCase().replace(/\s+/g, "-");
    return `<span class="music-track__diff music-track__diff--${slug}" aria-label="Difficulty: ${label}">${label}</span>`;
  }

  function clearMusicPickHint() {
    document.querySelector(".music-first-pick")?.remove();
  }

  function showMusicPickHint() {
    if (!els.viewAlbums) return;
    let hint = els.viewAlbums.querySelector(".music-first-pick");
    if (!hint) {
      hint = document.createElement("p");
      hint.className = "music-first-pick";
      els.viewAlbums.insertBefore(hint, els.viewAlbums.firstChild);
    }
    hint.textContent = pendingResume
      ? "Your song is ready — tap anywhere to resume, or pick a track below."
      : "Pick a song from an album to get started.";
  }

  async function prepareAudioElement(audio, track) {
    if (track?.src) {
      const target = new URL(track.src, window.location.href).href;
      if (!audio.src || audio.src !== target) {
        audio.src = track.src;
      }
    }
    if (!audio.src) return false;

    if (audio.readyState >= 3) return true;

    return new Promise((resolve) => {
      const finish = () => resolve(audio.readyState >= 2);
      if (audio.readyState >= 2) {
        finish();
        return;
      }

      const onReady = () => {
        cleanup();
        finish();
      };
      const onError = () => {
        cleanup();
        resolve(false);
      };
      const cleanup = () => {
        audio.removeEventListener("canplaythrough", onReady);
        audio.removeEventListener("loadeddata", onReady);
        audio.removeEventListener("error", onError);
        window.clearTimeout(timer);
      };

      audio.addEventListener("canplaythrough", onReady, { once: true });
      audio.addEventListener("loadeddata", onReady, { once: true });
      audio.addEventListener("error", onError, { once: true });
      const timer = window.setTimeout(onReady, 12000);

      try {
        audio.load();
      } catch {
        onError();
      }
    });
  }

  function persistPlaybackIntent(playing) {
    persistQueue();
    global.MusicCatalog?.saveLevelHandoff({
      playing,
      trackId: currentTrackId || global.MusicCatalog?.getActiveTrackId?.(),
      timeSec: playing ? getLevelTimeSec() : engine.audio.currentTime || 0,
      queue,
      queueIndex,
      queueContext,
    });
  }

  function persistQueue() {
    try {
      sessionStorage.setItem(
        QUEUE_SESSION_KEY,
        JSON.stringify({
          queue,
          queueIndex,
          queueContext,
          currentTrackId,
        })
      );
    } catch {
      // Ignore blocked storage
    }
  }

  function applyQueueHandoff({ queue: ids, queueIndex: index, queueContext: context } = {}) {
    if (!Array.isArray(ids) || !ids.length) return;
    setQueue(ids, index ?? 0, context || "single");
  }

  function restoreQueue() {
    try {
      const raw = sessionStorage.getItem(QUEUE_SESSION_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.queue) || !data.queue.length) return;

      const ids = data.queue.filter((id) => TRACK_BY_ID.has(id));
      if (!ids.length) return;

      queue = ids;
      queueIndex = Math.max(0, Math.min(data.queueIndex ?? 0, ids.length - 1));
      queueContext =
        data.queueContext === "album" || data.queueContext === "playlist"
          ? data.queueContext
          : "single";

      if (data.currentTrackId && TRACK_BY_ID.has(data.currentTrackId)) {
        currentTrackId = data.currentTrackId;
      }
    } catch {
      // Ignore corrupt storage
    }
  }

  function setQueue(trackIds, startIndex = 0, context = "single") {
    queue = trackIds.filter((id) => TRACK_BY_ID.has(id));
    queueIndex = Math.max(0, Math.min(startIndex, Math.max(0, queue.length - 1)));
    queueContext =
      context === "album" || context === "playlist" ? context : "single";
    persistQueue();
  }

  function shouldAutoAdvanceQueue() {
    return (
      (queueContext === "album" || queueContext === "playlist") &&
      queue.length > 1 &&
      queueIndex < queue.length - 1
    );
  }

  function dispatchTrackPlay(trackId) {
    global.MusicCatalog?.setActiveTrackId(trackId);
    global.dispatchEvent(
      new CustomEvent("treemusic:play", {
        detail: {
          trackId,
          queueContext,
          queueIndex,
          queueLength: queue.length,
        },
      })
    );
  }

  function preloadNextInQueue() {
    if (!shouldAutoAdvanceQueue()) return;
    const nextId = queue[queueIndex + 1];
    const nextTrack = nextId ? TRACK_BY_ID.get(nextId) : null;
    if (!nextTrack?.src) return;

    const linkId = "music-preload-next";
    let link = document.getElementById(linkId);
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "preload";
      link.as = "audio";
      document.head.appendChild(link);
    }
    link.href = nextTrack.src;
  }

  function exitLevelPlayback() {
    if (!levelMode) return;
    levelMode = false;
    global.LevelAudio?.stop?.();
  }

  function unlockPlaybackFromGesture() {
    global.MenuAudio?.unlockSync?.();
    global.MenuBg?.unlockVizAudio?.();
  }

  async function playTrackId(trackId) {
    const track = TRACK_BY_ID.get(trackId);
    if (!track) return false;

    const onLevel = document.body.classList.contains("level-page");
    if (onLevel) {
      currentTrackId = trackId;
      if (!queue.includes(trackId)) {
        setQueue([trackId], 0, "single");
      } else {
        queueIndex = queue.indexOf(trackId);
        persistQueue();
      }
      unlockPlaybackFromGesture();
      global.LevelAudio?.unlockSync?.();
      if (global.LevelMusic?.switchTrack) {
        const ok = await global.LevelMusic.switchTrack(trackId, { source: "menu-player" });
        if (els.playerTrack) updatePlayerUI();
        return ok;
      }
      const ok = await playForLevelSync(trackId, { restart: true, startAt: 0 });
      if (ok) dispatchTrackPlay(trackId);
      if (els.playerTrack) updatePlayerUI();
      return ok;
    }

    unlockPlaybackFromGesture();
    exitLevelPlayback();
    currentTrackId = trackId;

    if (!queue.includes(trackId)) {
      setQueue([trackId], 0, "single");
    } else {
      queueIndex = queue.indexOf(trackId);
      persistQueue();
    }

    bindMenuOnEnded();

    if (engine.track?.id !== track.id) {
      engine.audio.src = track.src;
      engine.track = track;
    }
    engine.audio.volume = engine.volume;

    const ready = await prepareAudioElement(engine.audio, track);
    if (!ready) {
      pendingResume = { trackId, timeSec: 0 };
      installResumeGesture();
      updatePlayerUI();
      return false;
    }

    try {
      await engine.audio.play();
    } catch {
      pendingResume = { trackId, timeSec: 0 };
      installResumeGesture();
      updatePlayerUI();
      return false;
    }

    dispatchTrackPlay(trackId);
    clearMusicPickHint();
    pendingResume = null;
    persistPlaybackIntent(true);
    updatePlayerUI();
    updateTrackHighlights();
    showMiniPill(true);
    startProgressTimer();
    preloadNextInQueue();
    persistQueue();
    return true;
  }

  async function playQueueAt(index, { wrap = false } = {}) {
    if (!queue.length) return;
    const last = queue.length - 1;
    let nextIndex = index;

    if (wrap) {
      nextIndex = ((index % queue.length) + queue.length) % queue.length;
    } else {
      nextIndex = Math.max(0, Math.min(index, last));
    }

    queueIndex = nextIndex;
    persistQueue();
    await playTrackId(queue[queueIndex]);
  }

  async function handleMenuTrackEnded() {
    if (shouldAutoAdvanceQueue()) {
      await playQueueAt(queueIndex + 1, { wrap: false });
      return;
    }

    stopProgressTimer();
    updatePlayerUI();
    showMiniPill(false);
    global.dispatchEvent(
      new CustomEvent("treemusic:ended", {
        detail: {
          trackId: currentTrackId,
          queueContext,
          queueIndex,
          queueLength: queue.length,
        },
      })
    );
  }

  function pauseForSyncCalibration() {
    const menuPlaying = engine.isPlaying();
    const levelPlaying = Boolean(levelMode && global.LevelAudio?.isPlaying?.());
    pausedForSyncCalibration = menuPlaying || levelPlaying;

    if (levelPlaying) global.LevelAudio?.pause?.();
    if (menuPlaying) {
      engine.pause();
      stopProgressTimer();
      updatePlayerUI();
      showMiniPill(false);
    }
  }

  function resumeAfterSyncCalibration() {
    if (!pausedForSyncCalibration) return;
    pausedForSyncCalibration = false;

    if (levelMode && global.LevelAudio?.isActive?.() && !global.LevelAudio?.isPlaying?.()) {
      global.LevelAudio.resume().catch(() => {});
      return;
    }

    if (
      engine.hasActiveTrack() &&
      engine.audio.currentTime > 0 &&
      !engine.audio.ended
    ) {
      engine
        .resume()
        .then(() => {
          startProgressTimer();
          updatePlayerUI();
          showMiniPill(true);
        })
        .catch(() => {});
    }
  }

  function togglePlayPause() {
    if (engine.isPlaying()) {
      engine.pause();
      stopProgressTimer();
      updatePlayerUI();
      showMiniPill(false);
      persistPlaybackIntent(false);
      global.dispatchEvent(new CustomEvent("treemusic:pause"));
      return;
    }

    unlockPlaybackFromGesture();

    if (currentTrackId && engine.hasActiveTrack() && engine.audio.currentTime > 0 && !engine.audio.ended) {
      engine.resume().then(() => {
        dispatchTrackPlay(currentTrackId);
        startProgressTimer();
        updatePlayerUI();
        showMiniPill(true);
        persistPlaybackIntent(true);
      }).catch(() => {});
      return;
    }

    if (currentTrackId) {
      playTrackId(currentTrackId);
    } else if (queue.length) {
      playQueueAt(queueIndex);
    }
  }

  function playNext() {
    if (!queue.length) return;
    playQueueAt(queueIndex + 1);
  }

  function playPrev() {
    if (!queue.length) return;
    const progress = engine.getProgress();
    if (progress > 0.12) {
      playTrackId(queue[queueIndex]);
      return;
    }
    playQueueAt(queueIndex - 1);
  }

  function createPlaylist(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;

    const playlist = { id: uid(), name: trimmed, trackIds: [] };
    ensurePlaylists().push(playlist);
    if (!saveState(state)) return null;
    return playlist;
  }

  function addToPlaylist(playlistId, trackId) {
    const pl = ensurePlaylists().find((p) => p.id === playlistId);
    if (!pl || !TRACK_BY_ID.has(trackId)) return false;
    if (!pl.trackIds.includes(trackId)) pl.trackIds.push(trackId);
    return saveState(state);
  }

  function removeFromPlaylist(playlistId, trackId) {
    const pl = ensurePlaylists().find((p) => p.id === playlistId);
    if (!pl) return;
    pl.trackIds = pl.trackIds.filter((id) => id !== trackId);
    saveState(state);
  }

  function deletePlaylist(playlistId) {
    if (activePlaylistId === playlistId) {
      activePlaylistId = null;
      if (queueContext === "playlist") queueContext = "single";
    }
    state.playlists = ensurePlaylists().filter((p) => p.id !== playlistId);
    saveState(state);
  }

  function handleDeletePlaylist(playlistId) {
    deletePlaylist(playlistId);
    renderPlaylists();
    activePlaylistId = null;
    showView("playlists");
    setTab("playlists");
  }

  function clearPlaylistCreateError() {
    els.playlistCreateInput?.classList.remove("is-error");
    if (els.playlistCreateError) {
      els.playlistCreateError.hidden = true;
      els.playlistCreateError.textContent = "";
    }
  }

  function showPlaylistCreateError(message) {
    els.playlistCreateInput?.classList.add("is-error");
    if (els.playlistCreateError) {
      els.playlistCreateError.textContent = message;
      els.playlistCreateError.hidden = false;
    }
  }

  /* ---- UI ---- */

  const els = {};

  function cacheElements() {
    els.phone = document.getElementById("music-phone");
    els.openBtn = document.getElementById("music-open");
    els.closeBtn = document.getElementById("music-close");
    els.miniPill = document.getElementById("music-mini-pill");
    els.tabs = document.querySelectorAll("[data-music-tab]");
    els.viewAlbums = document.getElementById("music-view-albums");
    els.viewAlbumDetail = document.getElementById("music-view-album-detail");
    els.viewPlaylists = document.getElementById("music-view-playlists");
    els.viewPlaylistDetail = document.getElementById("music-view-playlist-detail");
    els.viewSync = document.getElementById("music-view-sync");
    els.albumGrid = document.getElementById("music-album-grid");
    els.albumDetailTitle = document.getElementById("music-album-detail-title");
    els.trackList = document.getElementById("music-track-list");
    els.playlistList = document.getElementById("music-playlist-list");
    els.playlistDetailTitle = document.getElementById("music-playlist-detail-title");
    els.playlistTrackList = document.getElementById("music-playlist-track-list");
    els.playlistCreateInput = document.getElementById("music-playlist-name");
    els.playlistCreateBtn = document.getElementById("music-playlist-create");
    els.playlistCreateError = document.getElementById("music-playlist-create-error");
    els.playerArt = document.getElementById("music-player-art");
    els.playerTrack = document.getElementById("music-player-track");
    els.playerDiff = document.getElementById("music-player-diff");
    els.playerAlbum = document.getElementById("music-player-album");
    els.playerProgress = document.getElementById("music-player-progress");
    els.playBtn = document.getElementById("music-play-btn");
    els.prevBtn = document.getElementById("music-prev-btn");
    els.nextBtn = document.getElementById("music-next-btn");
    els.picker = document.getElementById("music-picker");
    els.pickerTitle = document.getElementById("music-picker-title");
    els.pickerList = document.getElementById("music-picker-list");
    els.backAlbum = document.getElementById("music-back-album");
    els.backPlaylist = document.getElementById("music-back-playlist");
    els.clock = document.getElementById("music-clock");
  }

  function formatDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function showView(name) {
    const views = {
      albums: els.viewAlbums,
      albumDetail: els.viewAlbumDetail,
      playlists: els.viewPlaylists,
      playlistDetail: els.viewPlaylistDetail,
      sync: els.viewSync,
    };
    Object.values(views).forEach((v) => { if (v) v.hidden = true; });
    if (views[name]) views[name].hidden = false;
  }

  function setTab(tabName) {
    els.tabs?.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.musicTab === tabName);
    });
  }

  function renderAlbums() {
    if (!els.albumGrid) return;
    els.albumGrid.innerHTML = "";

    ALBUMS.forEach((album) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "music-album";
      btn.innerHTML = `
        <div class="music-album__cover" style="background:${album.color}">
          <span class="music-album__glyph">${album.glyph}</span>
        </div>
        <div class="music-album__meta">
          <span class="music-album__name">${album.name}</span>
          <span class="music-album__artist">${album.artist}</span>
        </div>
      `;
      btn.addEventListener("click", () => openAlbum(album.id));
      els.albumGrid.appendChild(btn);
    });
  }

  function openAlbum(albumId) {
    const album = ALBUM_BY_ID.get(albumId);
    if (!album) return;
    activeAlbumId = albumId;
    if (els.albumDetailTitle) els.albumDetailTitle.textContent = album.name;
    if (!els.trackList) return;

    els.trackList.innerHTML = "";
    album.tracks.forEach((track, i) => {
      const li = document.createElement("li");
      li.className = "music-track";
      li.dataset.trackId = track.id;
      li.innerHTML = `
        <button type="button" class="music-track__play" aria-label="Play ${track.title}">▶</button>
        <div class="music-track__info">
          <span class="music-track__name-row">
            <span class="music-track__name">${track.title}</span>
            ${getTrackDifficultyBadge(track.id)}
          </span>
          <span class="music-track__dur">${formatDuration(track.duration)}</span>
        </div>
        <button type="button" class="music-track__add" aria-label="Add to playlist">+</button>
      `;

      li.querySelector(".music-track__play").addEventListener("click", () => {
        setQueue(
          album.tracks.map((t) => t.id),
          i,
          "album"
        );
        playTrackId(track.id);
      });

      li.querySelector(".music-track__add").addEventListener("click", () => {
        openPicker(track.id);
      });

      els.trackList.appendChild(li);
    });

    showView("albumDetail");
    updateTrackHighlights();
  }

  function renderPlaylists() {
    if (!els.playlistList) return;
    els.playlistList.innerHTML = "";
    const playlists = ensurePlaylists();

    if (!playlists.length) {
      els.playlistList.innerHTML = '<p class="music-empty">No playlists yet — create one above, then add songs from any album.</p>';
      return;
    }

    playlists.forEach((pl) => {
      const row = document.createElement("div");
      row.className = "music-playlist-row";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "music-playlist-card";
      btn.innerHTML = `
        <span class="music-playlist-card__icon">♫</span>
        <span>
          <span class="music-playlist-card__name">${pl.name}</span>
          <span class="music-playlist-card__count">${pl.trackIds.length} song${pl.trackIds.length === 1 ? "" : "s"}</span>
        </span>
      `;
      btn.addEventListener("click", () => openPlaylist(pl.id));

      const del = document.createElement("button");
      del.type = "button";
      del.className = "music-playlist-card__delete";
      del.setAttribute("aria-label", `Delete playlist ${pl.name}`);
      del.textContent = "×";
      del.addEventListener("click", (event) => {
        event.stopPropagation();
        handleDeletePlaylist(pl.id);
      });

      row.append(btn, del);
      els.playlistList.appendChild(row);
    });
  }

  function openPlaylist(playlistId) {
    const pl = ensurePlaylists().find((p) => p.id === playlistId);
    if (!pl) return;
    activePlaylistId = playlistId;
    if (els.playlistDetailTitle) els.playlistDetailTitle.textContent = pl.name;
    if (!els.playlistTrackList) return;

    els.playlistTrackList.innerHTML = "";

    if (!pl.trackIds.length) {
      const empty = document.createElement("li");
      empty.className = "music-playlist-empty";
      empty.innerHTML = '<p class="music-empty">Empty playlist — browse Albums and tap + on any song.</p>';
      els.playlistTrackList.appendChild(empty);

      const actions = document.createElement("li");
      actions.className = "music-playlist-actions";
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "music-playlist-delete";
      deleteBtn.textContent = "Delete playlist";
      deleteBtn.addEventListener("click", () => handleDeletePlaylist(playlistId));
      actions.appendChild(deleteBtn);
      els.playlistTrackList.appendChild(actions);

      showView("playlistDetail");
      setTab("playlists");
      return;
    }

    pl.trackIds.forEach((trackId, i) => {
      const track = TRACK_BY_ID.get(trackId);
      if (!track) return;

      const li = document.createElement("li");
      li.className = "music-track";
      li.dataset.trackId = trackId;
      li.innerHTML = `
        <button type="button" class="music-track__play" aria-label="Play">▶</button>
        <div class="music-track__info">
          <span class="music-track__name-row">
            <span class="music-track__name">${track.title}</span>
            ${getTrackDifficultyBadge(trackId)}
          </span>
          <span class="music-track__dur">${track.albumName}</span>
        </div>
        <button type="button" class="music-track__add" aria-label="Remove">×</button>
      `;

      li.querySelector(".music-track__play").addEventListener("click", () => {
        setQueue(pl.trackIds, i, "playlist");
        playTrackId(trackId);
      });

      li.querySelector(".music-track__add").addEventListener("click", () => {
        removeFromPlaylist(playlistId, trackId);
        openPlaylist(playlistId);
        renderPlaylists();
      });

      els.playlistTrackList.appendChild(li);
    });

    const playLi = document.createElement("li");
    playLi.className = "music-playlist-actions";
    const playAll = document.createElement("button");
    playAll.type = "button";
    playAll.className = "music-playlist-create__btn music-playlist-create__btn--wide";
    playAll.textContent = "Play playlist";
    playAll.addEventListener("click", () => {
      setQueue(pl.trackIds, 0, "playlist");
      playTrackId(pl.trackIds[0]);
    });
    playLi.appendChild(playAll);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "music-playlist-delete";
    deleteBtn.textContent = "Delete playlist";
    deleteBtn.addEventListener("click", () => handleDeletePlaylist(playlistId));
    playLi.appendChild(deleteBtn);

    els.playlistTrackList.appendChild(playLi);

    showView("playlistDetail");
    setTab("playlists");
    updateTrackHighlights();
  }

  function openPicker(trackId) {
    pickerTrackId = trackId;
    const track = TRACK_BY_ID.get(trackId);
    if (!track || !els.picker) return;

    if (els.pickerTitle) {
      els.pickerTitle.textContent = `Add "${track.title}" to…`;
    }

    if (els.pickerList) {
      els.pickerList.innerHTML = "";

      const playlists = ensurePlaylists();
      if (!playlists.length) {
        els.pickerList.innerHTML = '<li><p class="music-empty">Create a playlist first.</p></li>';
      } else {
        playlists.forEach((pl) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "music-picker__item";
          btn.textContent = pl.name;
          btn.addEventListener("click", () => {
            addToPlaylist(pl.id, trackId);
            closePicker();
            renderPlaylists();
          });
          const li = document.createElement("li");
          li.appendChild(btn);
          els.pickerList.appendChild(li);
        });
      }
    }

    els.picker.hidden = false;
    requestAnimationFrame(() => els.picker.classList.add("is-open"));
  }

  function closePicker() {
    if (!els.picker) return;
    els.picker.classList.remove("is-open");
    setTimeout(() => {
      els.picker.hidden = true;
      pickerTrackId = null;
    }, 280);
  }

  function updateTrackHighlights() {
    document.querySelectorAll(".music-track").forEach((row) => {
      row.classList.toggle("is-playing", row.dataset.trackId === currentTrackId && engine.isPlaying());
    });
  }

  function updatePlayerUI() {
    const track = getCurrentTrack();
    const playing = engine.isPlaying();

    if (els.playBtn) els.playBtn.textContent = playing ? "❚❚" : "▶";
    if (els.playerTrack) {
      els.playerTrack.textContent = track ? track.title : "Nothing playing";
    }
    if (els.playerDiff) {
      els.playerDiff.innerHTML = track ? getTrackDifficultyBadge(track.id) : "";
      els.playerDiff.hidden = !track || !getTrackDifficultyLabel(track.id) || getTrackDifficultyLabel(track.id) === "Normal";
    }
    if (els.playerAlbum) els.playerAlbum.textContent = track ? track.albumName : "Pick a song";
    if (els.playerArt) {
      els.playerArt.textContent = track ? "♪" : "—";
      els.playerArt.style.background = track?.albumColor || "var(--color-grey-mid)";
    }

    if (els.miniPill && track) {
      const label = els.miniPill.querySelector(".menu-music-pill__label");
      const art = els.miniPill.querySelector(".menu-music-pill__art");
      if (label) label.textContent = track.title;
      if (art) art.style.background = track.albumColor;
    }

    updateTrackHighlights();
  }

  function showMiniPill(visible) {
    if (!els.miniPill) return;
    const track = getCurrentTrack();
    if (!visible || !track || !engine.isPlaying()) {
      els.miniPill.hidden = true;
      els.miniPill.classList.remove("is-playing");
      return;
    }
    els.miniPill.hidden = false;
    els.miniPill.classList.add("is-playing");
    updatePlayerUI();
  }

  function startProgressTimer() {
    stopProgressTimer();
    progressTimer = setInterval(() => {
      if (!engine.isPlaying()) return;
      const p = engine.getProgress();
      if (els.playerProgress) els.playerProgress.style.width = `${Math.min(100, p * 100)}%`;
    }, PROGRESS_TICK_MS);
  }

  function stopProgressTimer() {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    if (els.playerProgress) els.playerProgress.style.width = "0%";
  }

  function openPhone() {
    if (!els.phone) return;
    unlockPlaybackFromGesture();
    els.phone.hidden = false;
    requestAnimationFrame(() => els.phone.classList.add("is-open"));
    engine.unlock();
    updateClock();
    renderAlbums();
    renderPlaylists();
    setTab("albums");
    if (activeAlbumId) openAlbum(activeAlbumId);
    else showView("albums");
    if (!engine.isPlaying()) showMusicPickHint();
    updatePlayerUI();
  }

  function maybeShowMusicPickerWhenIdle() {
    if (!els.phone || engine.isPlaying()) return;
    showMusicPickHint();
    if (pendingResume) installResumeGesture();
    window.setTimeout(() => openPhone(), 450);
  }

  function closePhone() {
    if (!els.phone) return;
    global.SyncCalibration?.stopSyncGame?.();
    global.SyncCalibration?.stopTestBeats?.();
    els.phone.classList.remove("is-open");
    closePicker();
    setTimeout(() => {
      els.phone.hidden = true;
    }, 350);
  }

  function updateClock() {
    if (!els.clock) return;
    const now = new Date();
    els.clock.textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function bindEvents() {
    els.openBtn?.addEventListener("click", openPhone);
    els.closeBtn?.addEventListener("click", closePhone);
    els.phone?.querySelector(".music-phone__backdrop")?.addEventListener("click", closePhone);
    els.miniPill?.addEventListener("click", openPhone);

    els.tabs?.forEach((tab) => {
      tab.addEventListener("click", () => {
        const name = tab.dataset.musicTab;
        if (name !== "sync") {
          global.SyncCalibration?.stopSyncGame?.();
        }
        setTab(name);
        if (name === "albums") {
          if (activeAlbumId) openAlbum(activeAlbumId);
          else showView("albums");
        }
        if (name === "playlists") {
          renderPlaylists();
          if (activePlaylistId) openPlaylist(activePlaylistId);
          else showView("playlists");
        }
        if (name === "sync") {
          showView("sync");
        }
      });
    });

    els.backAlbum?.addEventListener("click", () => {
      activeAlbumId = null;
      showView("albums");
    });

    els.backPlaylist?.addEventListener("click", () => {
      activePlaylistId = null;
      renderPlaylists();
      showView("playlists");
    });

    els.playBtn?.addEventListener("click", togglePlayPause);
    els.prevBtn?.addEventListener("click", playPrev);
    els.nextBtn?.addEventListener("click", playNext);

    function handleCreatePlaylist() {
      clearPlaylistCreateError();
      const name = els.playlistCreateInput?.value || "";
      let pl = null;
      try {
        pl = createPlaylist(name);
      } catch (err) {
        console.error("Playlist create failed:", err);
        showPlaylistCreateError("Could not create playlist — try again.");
        return;
      }

      if (!pl) {
        showPlaylistCreateError("Enter a playlist name.");
        els.playlistCreateInput?.focus();
        return;
      }

      if (els.playlistCreateInput) els.playlistCreateInput.value = "";
      renderPlaylists();
      openPlaylist(pl.id);
    }

    els.playlistCreateBtn?.addEventListener("click", handleCreatePlaylist);

    els.playlistCreateInput?.addEventListener("input", () => {
      clearPlaylistCreateError();
    });

    els.playlistCreateInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleCreatePlaylist();
      }
    });

    els.picker?.querySelector(".music-picker__backdrop")?.addEventListener("click", closePicker);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && els.picker && !els.picker.hidden) {
        closePicker();
        return;
      }
      if (e.key === "Escape" && els.phone && !els.phone.hidden) {
        closePhone();
      }
    });

    setInterval(updateClock, 30000);
  }

  async function playForLevel(trackId, { restart = true, startAt = 0 } = {}) {
    playForLevelSync(trackId, { restart, startAt });
  }

  function preloadLevelTrack() {
    const id = global.MusicCatalog?.getActiveTrackId?.() || "paper-petals";
    const track = TRACK_BY_ID.get(id);
    if (!track) return;

    currentTrackId = currentTrackId || id;
    global.LevelAudio?.preload?.(track);
    global.LevelAudio?.setVolume?.(engine.volume);

    if (engine.track?.id !== track.id) {
      engine.audio.src = track.src;
      engine.track = track;
    }

    engine.audio.preload = "auto";
    try {
      engine.audio.load();
    } catch {
      // Ignore load errors on unsupported browsers
    }
  }

  function getLevelTimeSec() {
    if (global.LevelAudio?.isActive?.()) {
      return global.LevelAudio.getPlaybackTimeMs() / 1000;
    }
    return engine.audio.currentTime || 0;
  }

  function getSongTimeMs() {
    if (levelMode && global.LevelAudio?.isActive?.()) {
      return global.LevelAudio.getSongTimeMs();
    }
    return (engine.audio.currentTime || 0) * 1000;
  }

  function getHeardTimeMs() {
    return getSongTimeMs();
  }

  function getPlaybackTimeMs() {
    if (levelMode && global.LevelAudio?.isActive?.()) {
      return global.LevelAudio.getPlaybackTimeMs();
    }
    return (engine.audio.currentTime || 0) * 1000;
  }

  /** Must run inside a user-gesture handler (Got it, tap, etc.). */
  async function playForLevelSync(trackId, { restart = true, startAt = 0 } = {}) {
    const id = trackId || global.MusicCatalog?.getActiveTrackId?.() || "paper-petals";
    const track = TRACK_BY_ID.get(id);
    if (!track) return false;

    currentTrackId = id;
    global.MusicCatalog?.setActiveTrackId(id);
    engine.onEnded = null;
    engine.stop();

    levelMode = true;
    global.LevelAudio?.setVolume?.(engine.volume);

    if (global.LevelAudio) {
      global.LevelAudio.stop();
      return global.LevelAudio.play(track, { restart, startAt });
    }

    if (engine.track?.id !== track.id) {
      engine.audio.src = track.src;
      engine.track = track;
    }

    engine.audio.volume = engine.volume;

    const targetTime = restart ? 0 : Math.max(0, startAt);
    const applySeek = () => {
      try {
        engine.audio.currentTime = targetTime;
      } catch {
        // Metadata may not be ready yet on first load
      }
    };

    if (engine.audio.readyState >= 1) {
      applySeek();
    } else {
      engine.audio.addEventListener("loadedmetadata", applySeek, { once: true });
    }

    const playPromise = engine.audio.play();
    if (playPromise?.catch) playPromise.catch(() => {});
    return true;
  }

  async function resumeLevelAudio() {
    if (!levelMode || !global.LevelAudio) return false;
    if (global.LevelAudio.isPlaying()) return true;
    if (global.LevelAudio.isActive?.() && !global.LevelAudio.isAudible?.()) {
      return global.LevelAudio.resume();
    }
    await global.LevelAudio.resumeContextOnly?.();
    return global.LevelAudio.isPlaying();
  }

  function saveLevelHandoffFromNav() {
    const menuPlaying = engine.isPlaying();
    const levelPlaying = global.LevelAudio?.isPlaying?.();
    const playing = menuPlaying || levelPlaying;
    persistQueue();
    global.MusicCatalog?.saveLevelHandoff({
      playing,
      trackId: currentTrackId || global.MusicCatalog?.getActiveTrackId?.(),
      timeSec: playing ? getLevelTimeSec() : 0,
      queue,
      queueIndex,
      queueContext,
    });
  }

  let pendingResume = null;
  let resumeGestureHooked = false;

  function installResumeGesture() {
    if (resumeGestureHooked || !pendingResume) return;
    resumeGestureHooked = true;

    const onGesture = () => {
      unlockPlaybackFromGesture();
      document.removeEventListener("pointerdown", onGesture, { capture: true });
      document.removeEventListener("keydown", onGesture, { capture: true });
      resumeGestureHooked = false;
      const job = pendingResume;
      pendingResume = null;
      if (job) resumeTrackAt(job.trackId, job.timeSec);
    };

    document.addEventListener("pointerdown", onGesture, { capture: true });
    document.addEventListener("keydown", onGesture, { capture: true });
  }

  async function resumeTrackAt(trackId, timeSec = 0) {
    const track = TRACK_BY_ID.get(trackId);
    if (!track) return false;

    exitLevelPlayback();
    currentTrackId = trackId;
    global.MusicCatalog?.setActiveTrackId(trackId);

    if (engine.track?.id !== track.id) {
      engine.audio.src = track.src;
      engine.track = track;
    }

    engine.audio.volume = engine.volume;

    const ready = await prepareAudioElement(engine.audio, track);
    if (!ready) {
      pendingResume = { trackId, timeSec: Math.max(0, timeSec) };
      installResumeGesture();
      updatePlayerUI();
      return false;
    }

    const targetTime = Math.max(0, timeSec);
    const applySeek = () => {
      try {
        engine.audio.currentTime = targetTime;
      } catch {
        // Metadata may not be ready yet on first load
      }
    };

    applySeek();

    bindMenuOnEnded();
    unlockPlaybackFromGesture();

    try {
      await engine.audio.play();
      dispatchTrackPlay(trackId);
      startProgressTimer();
      updatePlayerUI();
      showMiniPill(true);
      preloadNextInQueue();
      persistQueue();
      pendingResume = null;
      clearMusicPickHint();
      persistPlaybackIntent(true);
      return true;
    } catch {
      pendingResume = { trackId, timeSec: targetTime };
      installResumeGesture();
      updatePlayerUI();
      return false;
    }
  }

  async function tryResumeFromHandoff() {
    if (document.body.classList.contains("level-page")) return false;

    const handoff = global.MusicCatalog?.readLevelHandoff?.();
    if (!handoff) return false;

    if (handoff.queue?.length) {
      applyQueueHandoff(handoff);
    }

    const trackId =
      global.MusicCatalog?.getActiveTrackId?.() ||
      currentTrackId ||
      handoff.queue?.[handoff.queueIndex];

    if (!trackId || !TRACK_BY_ID.has(trackId)) return false;

    currentTrackId = trackId;

    if (!handoff.wantMusic) {
      const track = TRACK_BY_ID.get(trackId);
      if (track && engine.track?.id !== track.id) {
        engine.audio.src = track.src;
        engine.track = track;
      }
      if (els.phone) updatePlayerUI();
      return false;
    }

    const timeSec = handoff.timeSec > 0.5 ? handoff.timeSec : 0;
    return resumeTrackAt(trackId, timeSec);
  }

  function isInternalNavLink(link) {
    if (!link?.href || link.target === "_blank" || link.hasAttribute("download")) return false;
    try {
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return false;
      return (
        url.pathname !== window.location.pathname ||
        url.search !== window.location.search ||
        url.hash !== window.location.hash
      );
    } catch {
      return false;
    }
  }

  function wireNavigationHandoff() {
    document.addEventListener(
      "click",
      (e) => {
        const link = e.target.closest?.("a[href]");
        if (!link || !isInternalNavLink(link)) return;
        saveLevelHandoffFromNav();
      },
      { capture: true }
    );

    window.addEventListener("pagehide", saveLevelHandoffFromNav);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveLevelHandoffFromNav();
    });
  }

  function wirePageShowResume() {
    window.addEventListener("pageshow", () => {
      if (!els.phone || engine.isPlaying()) return;
      tryResumeFromHandoff().then(() => {
        if (!engine.isPlaying() && pendingResume) installResumeGesture();
      });
    });
  }

  global.TreeMusic = {
    play: playTrackId,
    playForLevel,
    playForLevelSync,
    resumeLevelAudio,
    pause: () => {
      pausedForSyncCalibration = false;
      if (levelMode) global.LevelAudio?.pause?.();
      engine.pause();
      stopProgressTimer();
      updatePlayerUI();
      showMiniPill(false);
      persistPlaybackIntent(false);
    },
    pauseForSyncCalibration,
    resumeAfterSyncCalibration,
    getCurrentTime: () => getLevelTimeSec(),
    getSongTimeMs,
    getHeardTimeMs,
    getPlaybackTimeMs,
    getCurrentTrackId: () => currentTrackId,
    getActiveTrackId: () => global.MusicCatalog?.getActiveTrackId?.() || currentTrackId,
    isPlaying: () => {
      if (levelMode && global.LevelAudio?.isActive?.()) return true;
      return engine.isPlaying() || Boolean(global.LevelAudio?.isPlaying?.());
    },
    getAlbums: () => ALBUMS,
    getPlaylists: () => ensurePlaylists(),
    getQueue: () => ({ queue: [...queue], queueIndex, queueContext }),
    applyQueueHandoff,
    get audio() {
      return engine.audio;
    },
  };

  async function bootMenu() {
    bindEvents();
    renderPlaylists();
    updatePlayerUI();
    updateClock();
    wirePageShowResume();

    await tryResumeFromHandoff();

    if (!engine.isPlaying()) {
      maybeShowMusicPickerWhenIdle();
    }
  }

  async function boot() {
    cacheElements();
    engine.setVolume(state.volume ?? 0.55);
    restoreQueue();
    wireNavigationHandoff();

    if (document.body.classList.contains("level-page")) {
      preloadLevelTrack();
      return;
    }

    if (!els.phone) {
      preloadLevelTrack();
      await tryResumeFromHandoff();
      return;
    }
    await bootMenu();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
