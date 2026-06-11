# TREEFORMANCE Documentation Index

**New here?** Start with [README.md](README.md) for setup and folder layout.

A web rhythm game about building tree data structures (binary trees, forests, and more). This index lists all project markdown files and what each one covers.

---

## Project Overview

**TREEFORMANCE** blends rhythm-game timing with computer-science tree construction. Players place nodes, grow branches, and assemble structures — binary trees first — in sync with music.

**Concept art:** `Game Homepage pic.png`

---

## Documentation Files

| File | About |
|------|-------|
| [`README.md`](./README.md) | **Setup and sharing.** How to run locally and project overview. |
| [`index.md`](./index.md) | **This file.** Master index of all project documentation. |
| [`docs/STRUCTURE.md`](./docs/STRUCTURE.md) | **Code map.** Folders and JavaScript modules. |
| [`style.md`](./style.md) | **Visual style guide.** Full analysis of the homepage concept art — color palette, typography, tree node design, background layers, layout, CSS tokens, and do/don't rules for building the UI. |
| [`components.md`](./components.md) | **Component library.** Includes the **Level Game Shell** — canonical HUD / stage / footer format to reuse for every level. |

## Web App

| File | About |
|------|-------|
| [`index.html`](./index.html) | **Main menu.** Left-aligned squircle buttons over the concept art background — Tutorial, Documentation, Level 1. |
| [`css/menu.css`](./css/menu.css) | Menu layout, background image, button animations (entrance + squish hover). |
| [`js/menu-audio.js`](./js/menu-audio.js) | Procedural hover sound effects (Web Audio API, autoplay-safe). |
| [`tutorial.html`](./tutorial.html) | Redirects to `level-1.html` (tutorial is now an in-level popup). |
| [`level-1.html`](./level-1.html) | **Level 1.** Full game screen — tutorial popup always shows, then 5-node beat placement. |
| [`js/level-1.js`](./js/level-1.js) | Level 1 gameplay — space to place nodes, beat pulse, progress. |
| [`css/tokens.css`](./css/tokens.css) | Shared design tokens (colors, fonts, node sizes). |
| [`css/tree.css`](./css/tree.css) | SVG tree diagram and node component styles. |
| [`css/tutorial.css`](./css/tutorial.css) | Tutorial layout, progress indicator, callouts. |
| [`css/level.css`](./css/level.css) | Level page + tutorial modal overlay styles. |
| [`js/level-modal.js`](./js/level-modal.js) | Got it button, modal open/close, session skip. |
| [`documentation.html`](./documentation.html) | Links to project docs (`style.md`, `index.md`). |

---

## Reading Order

1. **`index.md`** (here) — orient yourself
2. **`style.md`** — understand how the game should look and feel before writing UI code

---

## Planned Documentation

These files do not exist yet. Add them as the project grows, then update this index.

| File (planned) | Intended purpose |
|----------------|------------------|
| `game-design.md` | Core loop, win/lose conditions, difficulty progression, scoring |
| `mechanics.md` | Tree operations (insert, traverse), rhythm input mapping, beat windows |
| `architecture.md` | Tech stack, folder structure, module boundaries, data flow |
| `audio.md` | Music format, beat detection, sync strategy, Web Audio setup |
| `levels.md` | Level definitions, tree templates, song pairings |
| `api.md` | Internal APIs, state shape, event contracts (if applicable) |

---

## Assets

| Asset | Description |
|-------|-------------|
| `Game Homepage pic.png` | Splash / homepage concept art. Monochrome binary-tree + rhythm aesthetic. Analyzed in `style.md`. |

---

## Quick Links

- Visual identity → [`style.md`](./style.md)
- Concept image → [`Game Homepage pic.png`](./Game%20Homepage%20pic.png)

---

*Add a row to the **Documentation Files** table whenever a new `.md` file is created.*
