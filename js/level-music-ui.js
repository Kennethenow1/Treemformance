/**
 * In-level song picker — change track without leaving the level.
 */
(function initLevelMusicUi(global) {
  let sheet = null;
  let labelEl = null;

  function allTracks() {
    const tracks = [];
    global.MusicCatalog?.ALBUMS?.forEach((album) => {
      album.tracks.forEach((track) => {
        tracks.push({ ...track, albumName: album.name });
      });
    });
    return tracks;
  }

  function getActiveId() {
    return global.MusicCatalog?.getActiveTrackId?.() || "paper-petals";
  }

  function updateLabel() {
    if (!labelEl) return;
    const track = global.MusicCatalog?.getTrack?.(getActiveId());
    labelEl.textContent = track?.title || "Music";
  }

  function closeSheet() {
    if (!sheet) return;
    sheet.hidden = true;
    sheet.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-level-music-open", "is-level-music-opening");
  }

  function openSheet() {
    if (!sheet) return;
    renderTrackList();
    sheet.hidden = false;
    sheet.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-level-music-open");
    document.body.classList.remove("is-level-music-opening");
    sheet.querySelector(".level-music-sheet__close")?.focus();
  }

  function isSameTrackPlaying(trackId) {
    if (trackId !== getActiveId()) return false;
    return Boolean(
      global.TreeMusic?.isPlaying?.() || global.LevelAudio?.isActive?.()
    );
  }

  async function pickTrack(trackId) {
    if (!trackId) return;
    if (isSameTrackPlaying(trackId)) {
      global.LevelSfx?.playConfirm?.();
      updateLabel();
      closeSheet();
      return;
    }
    global.LevelSfx?.playConfirm?.();
    global.LevelAudio?.unlockSync?.();

    if (global.LevelMusic?.switchTrack) {
      await global.LevelMusic.switchTrack(trackId, { source: "level-picker" });
    } else if (global.TreeMusic?.playForLevelSync) {
      global.MusicCatalog?.setActiveTrackId?.(trackId);
      await global.TreeMusic.playForLevelSync(trackId, { restart: true, startAt: 0 });
      global.dispatchEvent(
        new CustomEvent("treemusic:play", { detail: { trackId, source: "level-picker" } })
      );
    }

    updateLabel();
    closeSheet();
  }

  function renderTrackList() {
    const list = sheet?.querySelector(".level-music-sheet__list");
    if (!list) return;

    const activeId = getActiveId();
    list.innerHTML = "";

    allTracks().forEach((track) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "level-music-sheet__track";
      if (track.id === activeId) btn.classList.add("is-active");

      const diff = track.difficulty
        ? `<span class="level-music-sheet__diff">${track.difficulty}</span>`
        : "";

      btn.innerHTML = `
        <span class="level-music-sheet__track-title">${track.title}</span>
        <span class="level-music-sheet__track-meta">${track.albumName}${diff}</span>
      `;
      btn.addEventListener("click", () => pickTrack(track.id));
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function mount() {
    if (!document.body.classList.contains("level-page")) return;
    const center = document.querySelector(".level-hud__center");
    if (!center || document.getElementById("level-music-btn")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "level-music-btn";
    btn.className = "level-hud__music";
    btn.setAttribute("aria-label", "Change song");
    btn.innerHTML =
      '<span class="level-hud__music-icon" aria-hidden="true">♪</span>' +
      '<span class="level-hud__music-label" id="level-music-label">Music</span>';
    center.appendChild(btn);
    labelEl = btn.querySelector("#level-music-label");

    sheet = document.createElement("div");
    sheet.id = "level-music-sheet";
    sheet.className = "level-music-sheet";
    sheet.hidden = true;
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-labelledby", "level-music-sheet-title");
    sheet.setAttribute("aria-hidden", "true");
    sheet.innerHTML = `
      <div class="level-music-sheet__backdrop" data-close="1" aria-hidden="true"></div>
      <div class="level-music-sheet__panel">
        <header class="level-music-sheet__head">
          <h2 class="level-music-sheet__title" id="level-music-sheet-title">Change song</h2>
          <button type="button" class="level-music-sheet__close" aria-label="Close">×</button>
        </header>
        <ul class="level-music-sheet__list"></ul>
      </div>
    `;
    document.body.appendChild(sheet);

    const clearOpeningGuard = () => {
      if (sheet?.hidden) {
        document.body.classList.remove("is-level-music-opening");
      }
    };

    btn.addEventListener(
      "pointerdown",
      (e) => {
        if (e.button !== 0 || !sheet?.hidden) return;
        document.body.classList.add("is-level-music-opening");
      },
      { capture: true }
    );
    btn.addEventListener("pointerup", clearOpeningGuard);
    btn.addEventListener("pointercancel", clearOpeningGuard);
    btn.addEventListener("click", openSheet);
    sheet.querySelector(".level-music-sheet__close")?.addEventListener("click", closeSheet);
    sheet.querySelector("[data-close]")?.addEventListener("click", closeSheet);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sheet && !sheet.hidden) closeSheet();
    });

    global.addEventListener("treemusic:play", updateLabel);
    updateLabel();
  }

  function boot() {
    mount();
    global.addEventListener("level:boot-ready", updateLabel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.LevelMusicUi = { open: openSheet, close: closeSheet, pickTrack };
})(window);
