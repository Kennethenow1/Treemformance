# Project structure

This file explains how the repo is organized for anyone opening the code.

## Pages (root)

| File | Role |
|------|------|
| `loading.html` | First visit preload screen. Full ASCII background. |
| `index.html` | Main menu. Redirects to loader if not warmed up. |
| `level-1.html` | Tutorial / first level |
| `level-2.html` | Second tutorial beat |
| `level-3.html` … `level-5.html` | Tree-building levels with number pool |
| `game-settings.html` | Key bindings and latency calibration |
| `tutorial.html` | Redirect to level 1 |

## CSS (`css/`)

| File | Role |
|------|------|
| `tokens.css` | Colors, fonts, shared variables |
| `menu.css` | Main menu layout |
| `level.css` | Level HUD, choices, piano tiles, ASCII zones |
| `tree.css` | SVG tree nodes and edges |
| `loader.css` | Loading screen |
| `music.css` | In-menu music player |
| `settings.css` | Settings page |

## Core JavaScript (`js/`)

### Boot and shell

| File | Role |
|------|------|
| `loader.js` | Preload flow, full ASCII on loading page |
| `preload-manifest.js` | List of assets to warm-cache |
| `menu.js` | Menu interactions |
| `menu-bg.js` | Menu ASCII field |
| `ascii-bg.js` | Shared ASCII canvas renderer (menu vs level quality) |
| `level-ascii-bg.js` | Hooks ASCII into level pages |

### Levels

| File | Role |
|------|------|
| `level-1.js` … `level-5.js` | Per-level game flow |
| `level-modal.js` | Tutorial popup open/close |
| `level-boot.js` | Brief boot overlay on level entry |
| `level-theme.js` | Per-level color themes |
| `level-choice-fx.js` | Choice card animations and bridge to piano |
| `level-choice-input.js` | Arrow-key navigation on cards |
| `level-tiles.js` | Falling tiles, breath pause, session start |
| `level-music.js` | Audio clock sync for rhythm |
| `level-music-ui.js` | In-level song picker |
| `level-audio.js` | Web Audio context helpers |
| `level-feedback.js` | Score pop, screen shake |
| `level-sfx.js` | Short sound effects |

### Trees and charts

| File | Role |
|------|------|
| `tree-d3.js` | D3 tree mount, layout, animations |
| `tree-optimal.js` | Goal trees, insert paths, scoring |
| `beatmaps.js` | Map rhythm charts to song peaks |
| `beatmaps-data.js` | Per-song peak data |

### Music app

| File | Role |
|------|------|
| `music-catalog.js` | Track list and handoff between pages |
| `music-app.js` | Menu music player UI and engine |

### Settings

| File | Role |
|------|------|
| `control-settings.js` | Saved key bindings |
| `sync-calibration.js` | Tap latency calibration |
| `game-settings.js` | Settings page wiring |

## Other folders

| Folder | Role |
|--------|------|
| `audio/` | Song MP3 files |
| `scripts/` | Offline beat analysis tools |
| `docs/` | Extra markdown (level notes) |

## Typical level flow

1. Player closes tutorial modal (`level-modal.js`).
2. Countdown, then choice question (`level-choice-input.js`, `level-choice-fx.js`).
3. Short breath pause (`level-tiles.js`), then piano tiles (`level-tiles.js`, `level-music.js`).
4. Tree updates (`tree-d3.js`, `tree-optimal.js`).
