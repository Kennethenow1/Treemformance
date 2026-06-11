/**
 * Assets the loading screen fetches before index.html opens.
 *
 * Edit this list when you add new global scripts, styles, or audio tracks.
 * Version query strings (?v=) should match the values in index.html / level pages.
 */
window.TREEFORMANCE_PRELOAD = {
  styles: [
    "css/tokens.css",
    "css/menu.css?v=11",
    "css/music.css?v=7",
    "css/sync-calibration.css?v=2",
    "css/settings.css?v=3",
  ],
  scripts: [
    "js/menu.js?v=3",
    "js/music-catalog.js?v=6",
    "js/beatmaps-data.js?v=5",
    "js/beatmaps.js?v=15",
    "js/music-app.js?v=18",
    "js/ascii-bg.js?v=6",
    "js/menu-bg.js?v=6",
    "js/sync-calibration.js?v=5",
    "js/menu-audio.js?v=7",
    "js/control-settings.js?v=1",
    "js/settings-bg.js?v=1",
  ],
  audio: [
    "audio/paper-petals.mp3",
    "audio/paper-moon-echo.mp3",
    "audio/paper-moon-echo-ii.mp3",
    "audio/paper-moon-echo-iii.mp3",
  ],
  fonts: [
    "https://fonts.googleapis.com/css2?family=Titan+One&display=swap",
  ],
};
