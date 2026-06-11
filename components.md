# TREEFORMANCE — Component Library

> Machine-readable catalog of reusable UI building blocks. Pair with [`style.md`](./style.md) for visual rules.

An AI system should use this file to recreate screens consistently: import the listed CSS, copy HTML patterns, and respect state classes.

---

## Design Tokens

Defined in `css/tokens.css` and extended in `css/menu.css`.

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg` | `#ffffff` | Page / node fill |
| `--color-ink` | `#000000` | Borders, text, edges |
| `--color-grey-mid` | `#b0b0b0` | Shadows, secondary lines |
| `--color-grey-light` | `#e8e8e8` | Decorative backgrounds |
| `--color-grey-ghost` | `#cccccc` | Ghost node borders |
| `--font-display` | `"Titan One", sans-serif` | Headings, logo, nav |
| `--font-ui` | `system-ui, sans-serif` | Body copy, labels |
| `--node-size` | `48px` | Default node diameter |
| `--node-size-root` | `52px` | Root node diameter |
| `--node-border` | `3px solid #000` | Active node ring (matches button borders) |
| `--node-shadow-offset` | `3px 3px` | Solid black offset behind each node |
| `--edge-width` | `3px` | Tree branch stroke |

---

## File Map

| File | Contains |
|------|----------|
| `css/tokens.css` | Shared CSS variables |
| `css/menu.css` | Main menu, `.btn`, `.stage` |
| `css/page.css` | Sub-page shell (back link, headings) |
| `css/tree.css` | Tree diagram + node components |
| `css/tutorial.css` | Tutorial layout, progress, callouts |
| `css/level.css` | **Level Game Shell** — HUD, stage, footer, modal (reuse for every level) |
| `js/menu-audio.js` | Hover sound (menu only) |
| `js/level-modal.js` | Tutorial popup — always opens, fires `level:start` on dismiss |
| `js/level-1.js` | Level 1 gameplay logic (clone per level as `level-N.js`) |
| `level-1.html` | **Canonical level page** — copy this structure for Level 2, 3, etc. |

**Typical sub-page imports:**
```html
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/page.css">
<link rel="stylesheet" href="css/tree.css">
<!-- + tutorial.css or level.css as needed -->
```

---

## Level Game Shell — Canonical Format ⭐

> **This is the standard layout for every level and tutorial entry in TREEFORMANCE.**
> Reference implementation: [`level-1.html`](./level-1.html). Reuse this shell elsewhere — only the tree data, tutorial copy, and per-level JS change.

Visual styling may evolve to match the full game, but the **structural format is fixed**:

```
┌──────────────────────────────────────────────────────────┐
│  LEVEL HUD  [←]  Level N                    PTS  100    │  ← .level-hud
├──────────────────────────────────────────────────────────┤
│                                                          │
│   ┌─────────────────┐    ┌─────────────────────────┐    │
│   │  LEFT PANEL     │    │      TREE ARENA         │    │  ← .level-stage
│   │  (cards OR      │    │  .tree-diagram--game    │    │     .play-window
│   │   sequence)     │    │  always on the right    │    │
│   └─────────────────┘    └─────────────────────────┘    │
│        .play-window__left       .play-window__right      │
│                                                          │
├──────────────────────────────────────────────────────────┤
│       Match the sequence…                                │  ← .level-footer
│       ████░░░░░░  timing bar (sequence phase only)       │
└──────────────────────────────────────────────────────────┘

     [ TutorialModal overlays on load ]
     [ Got it → dismisses → level:start → countdown → question ]
```

### Play window — left / right split ⭐

The play arena is a **two-column grid**, not a centered overlay. This is the canonical layout for every level.

| Column | Class | Contents |
|--------|-------|----------|
| **Left** | `.play-window__left` | `CardPicker` (question) **or** `LevelSequence` (rhythm) — never both at once |
| **Right** | `.play-window__right` | `TreeArena` (`.tree-diagram--game`) — always visible during play |

### Level play components — what they are

| Component | CSS / ID | What it is |
|-----------|----------|------------|
| **PlayWindow** | `.play-window` `#play-window` | The 2-column play area inside `.level-stage`. Left slot swaps between question cards and sequence panels; right slot always shows the tree. |
| **CardPicker** | `.reward-popup` `#level-question` | The left-panel choice window. Shows a question title + two `UpgradeCard` options. Each card bundles an answer and its arrow sequence. Not an overlay — sits in-flow beside the tree. |
| **UpgradeCard** | `.upgrade-card` | A single pickable card inside `CardPicker`. Displays answer value + sequence preview. `data-correct="true/false"` drives scoring. States: `.is-correct`, `.is-wrong`. |
| **TileRush** | `.tile-rush` inside `#level-sequence` | Piano-tiles rhythm panel — 4 arrow lanes, falling tiles, hit line, receptor buttons. Tap or hold on the line. Hidden until sequence phase. |
| **TreeArena** | `.tree-diagram--game` | The right-panel tree diagram. Bordered play field showing the level's binary tree. Always visible once countdown ends. |
| **LevelCountdown** | `.level-countdown` `#level-countdown` | Full-screen 3-2-1-GO overlay between tutorial dismiss and first question. |
| **TimingBar** | `.timing-bar` `#timing-bar` | Footer sweep bar during sequence phase. Center hit = most points. |
| **LevelBleed** | `.level-bleed` `#level-bleed` | Full-screen red flash on wrong card or wrong key. |
| **ChoiceTimer** | `.choice-timer` `#choice-timer` | Fixed top depletion bar during `CardPicker` phase. Runs ~9s (tutorial). Timeout → wrong crossed, correct auto-picked. |
| **ChoicePressure** | `.choice-pressure` `#choice-pressure` | Engulfing border vignette — dark creeps inward from screen edges as bar drains (`--vignette-hole` shrinks). Center stays clear until edges close in. |

**Phase visibility** (controlled by `hidden` attribute + level JS):

| Phase | Left panel | Right panel | `.play-window` state |
|-------|------------|-------------|----------------------|
| Countdown | empty (hidden) | tree centered full-width | single column via `:has()` rule |
| Question | `CardPicker` + `ChoiceTimer` | `TreeArena` | `.is-question` + `body.is-choice-pressure` |
| Sequence | `LevelSequence` | `TreeArena` | normal |
| Done | `LevelSequence` (last state) | `TreeArena` | normal |

**Critical CSS rules** (in `css/level.css`):

1. **Grid columns use `minmax(0, …)`** — prevents left-panel content from overflowing into the tree column.
2. **`[hidden]` needs explicit `display: none !important`** — `.level-sequence { display: flex }` otherwise overrides the HTML `hidden` attribute and panels leak through during the question phase.
3. **`.play-window.is-question .level-sequence { display: none !important }`** — sequence never shows while cards are active.
4. **Tree-only mode** — when no visible children in `.play-window__left`, grid collapses to one column and tree centers (`max-width: 28rem`).

```html
<div class="play-window" id="play-window">
  <div class="play-window__left">
    <div class="reward-popup" id="level-question" hidden>…cards…</div>
    <div class="level-sequence" id="level-sequence" hidden>…panels…</div>
  </div>
  <div class="play-window__right">
    <figure class="tree-diagram tree-diagram--game">…</figure>
  </div>
</div>
```

### Layer stack (always in this order)

| Layer | Component | Required |
|-------|-----------|----------|
| 1 | `TutorialModal` | Yes — shows every visit before play |
| 2 | `.level-game` grid shell | Yes |
| 3 | `.level-hud` | Yes — menu, badge, PTS score |
| 4 | `.level-countdown` | Yes — 3-2-1-GO overlay before question |
| 5 | `.level-stage` → `.play-window` | Yes — left panel + right tree |
| 6 | `.level-footer` | Yes — prompt + timing bar |

### Per-level vs shared (what to copy vs reuse)

| Reuse as-is | Customize per level |
|-------------|----------------------|
| `css/level.css`, `css/tree.css`, `css/tokens.css` | Tutorial modal copy + demo tree |
| `js/level-modal.js` | `js/level-N.js` gameplay logic |
| HTML shell structure below | SVG tree layout, node values, `data-value` attrs |
| HUD / footer / arena classes | Level badge text, node count, beat timing |

### Required imports (every level page)

```html
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/tree.css">
<link rel="stylesheet" href="css/tutorial.css">
<link rel="stylesheet" href="css/level.css">
<script src="js/level-modal.js" defer></script>
<script src="js/level-N.js" defer></script>
```

### JS event contract

| Event | Fired by | Listened by | When |
|-------|----------|-------------|------|
| `level:start` | `level-modal.js` (Got it / Escape) | `level-N.js` | Modal dismissed, gameplay begins |

Level JS should listen for `level:start` — do **not** auto-start on page load.

### Cloning checklist for Level 2+

1. Copy `level-1.html` → `level-2.html`
2. Update title, HUD badge, node count, tutorial copy
3. Replace SVG tree (ghost nodes + `data-value` on each)
4. Copy `js/level-1.js` → `js/level-2.js`; update `NODE_ORDER`, beat timing
5. Link from menu / level select
6. Keep `TutorialModal` + `.level-game` + `.play-window` left/right split **unchanged**
7. Only one left-panel child visible per phase — use `hidden` + `.is-question` (see Play window section)

### Node states in play arena

| Class | Meaning |
|-------|---------|
| `.tree-node--ghost` | Not yet placed — dashed border, grey label |
| `.tree-node--placed` | Placed on beat — solid outline, shadow, pop-in animation |

---

## 1. `Stage` (Homepage Layout)

**Purpose:** Full-viewport split between white menu column and artwork background.

```html
<div class="stage">
  <main class="menu">
    <nav class="btns" aria-label="Main menu">…</nav>
  </main>
</div>
```

| Class | Role |
|-------|------|
| `.stage` | Grid shell; background image anchored `right center`, `auto 100%` height |
| `.menu` | Left column; solid `--color-bg`; holds navigation |
| `.btns` | Vertical flex column of menu buttons |

**Responsive:** ≤768px stacks menu below artwork (`background-size: cover`).

---

## 2. `Btn` (Menu Button)

**Purpose:** Primary navigation control on the homepage.

```html
<a class="btn" href="tutorial.html"><span>Label</span></a>
```

| Part | Rule |
|------|------|
| Outer `.btn` | Flex container; fixed width via `--btn-width` |
| Inner `span` | Visual pill; black fill, white text; squircle `border-radius: 20px` |
| Hover | Black stays; white inset ring; `squish-hover` animation |
| Active | Press down; shadow collapses |

**Do not** use `.btn` inside tutorials — use `.tutorial-nav__btn` instead.

---

## 3. `Page` (Sub-page Shell)

**Purpose:** Scrollable content pages (tutorial, docs, levels).

```html
<body class="subpage">
  <main class="page">…</main>
</body>
```

| Class | Role |
|-------|------|
| `body.subpage` | Disables homepage background; `overflow: auto` |
| `.page` | Centered column, `max-width: 40rem`, vertical padding |
| `.back-link` | Titan One link back to menu |

---

## 4. `TreeDiagram` (SVG Binary Tree)

**Purpose:** Render a top-down binary tree with styled nodes and edges. Matches the menu button visual language — thick black outlines, solid offset shadow, white fill.

**Reference implementation:** `level-1.html` (level tree) — tutorial popup uses same tree with 4 nodes

```html
<figure class="tree-diagram" aria-label="Binary tree with four nodes">
  <div class="tree-diagram__stage">
    <svg class="tree-diagram__svg" viewBox="0 0 360 280" preserveAspectRatio="xMidYMid meet" role="img">
      <title>Binary tree with four nodes</title>
      <desc>Describe the tree structure here.</desc>

      <!-- 1. Edges FIRST (behind nodes) -->
      <g class="tree-edges">
        <line class="tree-edge" x1="…" y1="…" x2="…" y2="…"/>
      </g>

      <!-- 2. Nodes SECOND (on top of edges) -->
      <g class="tree-nodes">
        <g class="tree-node tree-node--root tree-node--highlight" transform="translate(cx, cy)">
          <circle class="tree-node__ring" r="38"/>
          <circle class="tree-node__shadow" r="26" cx="3" cy="3"/>
          <circle class="tree-node__circle" r="26"/>
          <text class="tree-node__label" text-anchor="middle" dy="0.35em">8</text>
        </g>
        <!-- repeat for each node -->
      </g>
    </svg>
  </div>
  <figcaption class="tree-diagram__caption">Caption text here.</figcaption>
</figure>
```

### Container (`.tree-diagram`)

| Property | Value | Notes |
|----------|-------|-------|
| Background | `--color-grey-light` | Same grey as `.callout` |
| Border | `4px solid` left edge in `--color-ink` | Matches callout left accent |
| Border-radius | `0 20px 20px 0` | Rounded on right side only |
| Box-shadow | `4px 4px 0 rgba(0,0,0,0.06)` | Subtle depth |
| Stage aspect-ratio | `9 / 7` | Keeps tree proportional at any width |
| Stage max-width | `24rem` | Centered in container |

### 4a. `TreeEdge`

```html
<line class="tree-edge" x1="160" y1="62" x2="118" y2="120"/>
```

| Class | State | Appearance |
|-------|-------|--------------|
| `.tree-edge` | active | Solid black, **3px**, `stroke-linecap: round` |
| `.tree-edge--ghost` | placeholder | `stroke-dasharray: 6 5`, `--color-grey-ghost` |

**Edge positioning rules (critical):**
1. Draw edges in a `<g class="tree-edges">` **before** `<g class="tree-nodes">` so lines sit behind circles.
2. Lines must connect from the **perimeter** of the parent circle to the **perimeter** of the child circle — never center-to-center (causes overlap through nodes).
3. For a parent with two children, use **two separate start points** offset left/right on the parent bottom (e.g. root at x=180: left edge starts x=160, right edge starts x=200).
4. End each line at the top perimeter of the child circle (child_cy − child_r).

**Edge endpoint formula:**
```
start_y = parent_cy + parent_r
end_y   = child_cy  − child_r
start_x = offset from parent_cx toward child_cx (≈15–20px from center)
end_x   = child_cx (or slightly adjusted toward parent)
```

### 4b. `TreeNode`

Each node is a `<g>` group with `transform="translate(cx, cy)"`. Three circles stacked, then a text label.

```html
<g class="tree-node" transform="translate(100, 140)">
  <circle class="tree-node__shadow" r="24" cx="3" cy="3"/>
  <circle class="tree-node__circle" r="24"/>
  <text class="tree-node__label" text-anchor="middle" dy="0.35em">4</text>
</g>
```

**Layer order inside each node group (bottom → top):**
1. `.tree-node__ring` — highlight pulse ring (only on `--highlight` nodes)
2. `.tree-node__shadow` — solid black fill, offset `cx="3" cy="3"` (button box-shadow)
3. `.tree-node__circle` — white fill, thick black stroke (the visible node)
4. `.tree-node__label` — centered text

| Class / Modifier | Appearance |
|------------------|--------------|
| `.tree-node__circle` | White fill, **3px** black stroke |
| `.tree-node--root .tree-node__circle` | **3.5px** stroke, `r` = 26 (vs 24) |
| `.tree-node__shadow` | Solid `--color-ink` fill, offset 3px down-right |
| `.tree-node__label` | `--font-display` (Titan One), 16px, weight 700 |
| `.tree-node--root .tree-node__label` | 18px |
| `.tree-node--highlight .tree-node__ring` | Grey ring, `r` ≈ node_r + 12; pulsing animation |
| `.tree-node--ghost .tree-node__circle` | Transparent fill, dashed `--color-grey-ghost` border |
| `.tree-node--ghost .tree-node__shadow` | Hidden (`display: none`) |

### 4c. Layout Constants

| Constant | Value | Usage |
|----------|-------|-------|
| Node radius (default) | `24` | Standard nodes |
| Node radius (root) | `26` | Root emphasis |
| Shadow offset | `cx="3" cy="3"` | Matches button `4px 4px 0` shadow |
| Vertical gap between levels | `~98px` center-to-center | Between level 0→1 and 1→2 |
| Horizontal spread (level 1) | `±80px` from center | Children of root |
| Highlight ring radius | `node_r + 12` | Breathing room around node |
| viewBox | `0 0 360 280` | Adjust width/height to fit tree |

### 4d. Example — 4-node tree (canonical reference)

```
      8
     / \
    4   12
   /
  2
```

| Node | cx | cy | r | Modifiers |
|------|----|----|---|-----------|
| 8 | 180 | 42 | 26 | `--root`, `--highlight` |
| 4 | 100 | 140 | 24 | — |
| 12 | 260 | 140 | 24 | — |
| 2 | 60 | 232 | 24 | — |

| Edge | x1 | y1 | x2 | y2 | Notes |
|------|----|----|----|----|-------|
| 8→4 | 160 | 62 | 118 | 120 | Left branch from root |
| 8→12 | 200 | 62 | 242 | 120 | Right branch from root |
| 4→2 | 82 | 160 | 72 | 210 | Left child descent |

> y1 ≈ parent_cy + parent_r (bottom of parent). y2 ≈ child_cy − child_r (top of child). Offset x1 slightly from parent center toward each child.

### 4e. Building a New Tree — Checklist

1. Place node centers (`cx`, `cy`) top-down with consistent vertical gaps.
2. Compute edge endpoints using perimeter formulas above.
3. Set `viewBox` to fit all nodes with ~20px padding on every side.
4. Wrap SVG in `.tree-diagram__stage` for responsive scaling.
5. Draw `<g class="tree-edges">` before `<g class="tree-nodes">`.
6. Every node gets shadow + circle + label (ring only if highlighted).
7. Import `css/tree.css` — no inline styles needed.

---

## 5. `TutorialProgress`

**Purpose:** Step indicator (e.g. 1 / 3).

```html
<p class="tutorial-progress" aria-label="Tutorial step 1 of 3">
  <span class="tutorial-progress__current">1</span>
  <span class="tutorial-progress__sep">/</span>
  <span class="tutorial-progress__total">3</span>
</p>
```

---

## 6. `TutorialHeader`

```html
<header class="tutorial-header">
  <p class="tutorial-progress">…</p>
  <h1 class="tutorial-header__title">What is a Node?</h1>
  <p class="tutorial-header__lede">Body intro paragraph.</p>
</header>
```

| Class | Typography |
|-------|------------|
| `.tutorial-header__title` | `--font-display`, ~2rem |
| `.tutorial-header__lede` | `--font-ui`, 1.05rem, `#444` |

---

## 7. `Callout`

**Purpose:** Point at a diagram element or explain a term.

```html
<aside class="callout callout--node">
  <span class="callout__tag">Node</span>
  <p class="callout__text">A node is a single circle in the tree. It holds a value.</p>
</aside>
```

| Modifier | Use |
|----------|-----|
| `.callout--node` | Left border accent; explains node concept |
| `.callout__tag` | Small uppercase label |

---

## 8. `TutorialNav`

**Purpose:** Previous / Next within tutorial series.

```html
<nav class="tutorial-nav" aria-label="Tutorial navigation">
  <a class="tutorial-nav__btn tutorial-nav__btn--ghost" href="index.html">← Menu</a>
  <a class="tutorial-nav__btn" href="tutorial-2.html">Next →</a>
</nav>
```

| Class | Appearance |
|-------|------------|
| `.tutorial-nav__btn` | Black pill, white text; matches menu button language |
| `.tutorial-nav__btn--ghost` | White fill, black border |

---

## 9. `TutorialModal` (Level Intro Popup)

**Purpose:** Overlay tutorial content on a level before gameplay starts. Dismissed via **Got it** button.

**Reference implementation:** `level-1.html` + `js/level-modal.js`

```html
<div class="tutorial-modal is-open" id="tutorial-modal" role="dialog"
     aria-modal="true" aria-labelledby="tutorial-title" aria-hidden="false">
  <div class="tutorial-modal__backdrop" aria-hidden="true"></div>
  <div class="tutorial-modal__panel">
    <header class="tutorial-header">…</header>
    <aside class="callout callout--node">…</aside>
    <figure class="tree-diagram">…4-node demo tree…</figure>
    <div class="tutorial-modal__actions">
      <button type="button" class="tutorial-modal__gotit" id="tutorial-gotit">Got it</button>
    </div>
  </div>
</div>
```

| Class | Role |
|-------|------|
| `.tutorial-modal` | Fixed fullscreen overlay; hidden by default |
| `.tutorial-modal.is-open` | Visible state (opacity + visibility) |
| `.tutorial-modal__backdrop` | Frosted white scrim (`backdrop-filter: blur`) |
| `.tutorial-modal__panel` | White card; **3px black border**, `8px 8px 0` shadow, `border-radius: 20px` |
| `.tutorial-modal__gotit` | Primary dismiss button — matches `.tutorial-nav__btn` / menu button style |
| `body.level-page` | Locks scroll while modal is open |
| `body.level-page.is-playing` | Scroll enabled after dismiss |

**JS behaviour (`level-modal.js`):**
- Opens automatically on **every** visit (Tutorial and Level 1 both land here)
- **Got it** or `Escape` closes modal, fires `level:start` event to begin gameplay

**Reuse pattern:** Modal is always the first child of `<body class="level-page">`. `.level-game` sits behind it and is visible once modal closes.

---

## 10. `LevelGame` (Gameplay Shell)

**Purpose:** Full-screen game level — part of the **Level Game Shell** (see above). Do not invent new layouts; extend this.

**Reference:** `level-1.html` + `js/level-1.js`

```html
<body class="level-page">
  <!-- 1. TutorialModal (section 9) — always present -->
  <div class="level-bleed" id="level-bleed" aria-hidden="true"></div>

  <div class="level-game">
    <header class="level-hud">
      <a class="level-hud__menu" href="index.html" aria-label="Back to menu">←</a>
      <div class="level-hud__center">
        <span class="level-hud__badge">Level 1</span>
      </div>
      <div class="level-hud__score" id="level-score" aria-live="polite">
        <span class="level-hud__score-label">PTS</span>
        <span class="level-hud__score-value" id="score-value">100</span>
      </div>
    </header>

    <div class="level-countdown" id="level-countdown" aria-hidden="true">
      <span class="level-countdown__num" id="countdown-num">3</span>
    </div>

    <div class="level-stage">
      <div class="play-window" id="play-window">
        <div class="play-window__left">
          <div class="reward-popup" id="level-question" role="dialog" hidden>…</div>
          <div class="level-sequence" id="level-sequence" hidden>…</div>
        </div>
        <div class="play-window__right">
          <figure class="tree-diagram tree-diagram--game">…5-node tree…</figure>
        </div>
      </div>
    </div>

    <footer class="level-footer">
      <p class="level-prompt" id="level-prompt">Click Got it to start</p>
      <div class="timing-bar" id="timing-bar" hidden>…</div>
    </footer>
  </div>
</body>
```

### 10a. Shell regions

| Region | Class | Role |
|--------|-------|------|
| **HUD** | `.level-hud` | 3-column bar: menu btn, level badge, PTS score |
| **Menu btn** | `.level-hud__menu` | Squircle back link — 3px border, offset shadow (matches `.btn` language) |
| **Badge** | `.level-hud__badge` | Titan One level name |
| **Score** | `.level-hud__score` | PTS counter; `.is-bump-up` / `.is-bump-down` on change |
| **Countdown** | `.level-countdown` | Full-screen 3-2-1-GO before question phase |
| **Stage** | `.level-stage` | Flex-centered; dot-grid background |
| **Play window** | `.play-window` | 2-column grid — left panel + right tree (`max-width: 54rem`) |
| **Left panel** | `.play-window__left` | Hosts `CardPicker` or `LevelSequence` (mutually exclusive) |
| **Right panel** | `.play-window__right` | Hosts `.tree-diagram--game` — always visible |
| **Arena** | `.tree-diagram--game` | 3px border, `6px 6px 0` shadow, `border-radius: 20px` |
| **Footer** | `.level-footer` | 3px top border; prompt + timing bar |
| **Prompt** | `.level-prompt` | Current instruction (updates via level JS) |
| **Timing bar** | `.timing-bar` | Sweeping indicator during sequence phase only |
| **Bleed** | `.level-bleed` | Red screen flash on wrong answer / wrong key |

### 10b. `PlayWindow` — split layout

**CSS class:** `.play-window` · **ID:** `#play-window`

**What it is:** The main play area — a 2-column grid inside `.level-stage`. Left column swaps between `CardPicker` and `LevelSequence`; right column always shows `TreeArena`.

| Class | Role |
|-------|------|
| `.play-window` | CSS grid: `minmax(0, 1fr) minmax(0, 1.2fr)` with `gap: clamp(1.25rem, 3vw, 2rem)` |
| `.play-window__left` | Flex column; holds exactly one visible child during play |
| `.play-window__right` | Tree arena; stretches to match left panel height |
| `.play-window.is-question` | Question phase — sequence forcibly hidden while cards are showing |

**Responsive:** ≤640px stacks to single column (left panel on top, tree below).

**Do not** use absolute positioning or full-screen overlays for the card picker — it is an in-flow left column panel.

### 10c. `CardPicker` — choice window (left panel)

**CSS class:** `.reward-popup` · **ID:** `#level-question`

**What it is:** The left-panel question UI. Shows a title and two roguelike-style `UpgradeCard` buttons side by side in a vertical stack. Player picks one card to answer the question and unlock a sequence. Lives in-flow inside `.play-window__left` — never a fullscreen overlay.

```html
<div class="reward-popup" id="level-question" role="dialog" aria-modal="true"
     aria-labelledby="reward-title" hidden>
  <div class="reward-popup__panel">
    <header class="reward-popup__banner">
      <h2 class="reward-popup__title" id="reward-title">How many nodes in this tree?</h2>
    </header>
    <div class="reward-popup__cards">
      <button type="button" class="upgrade-card" data-answer="5" data-correct="true">…</button>
      <button type="button" class="upgrade-card" data-answer="4" data-correct="false">…</button>
    </div>
    <p class="reward-popup__hint">Pick a card to continue</p>
  </div>
</div>
```

| Class | Role |
|-------|------|
| `.reward-popup` | In-flow left column container; `width: 100%` |
| `.reward-popup[hidden]` | `display: none !important` |
| `.reward-popup__panel` | Bordered card shell — 3px border, `6px 6px 0` shadow |
| `.reward-popup__title` | Question text (Titan One) |
| `.reward-popup__cards` | Vertical stack of two `UpgradeCard` buttons |
| `.reward-popup__hint` | Footer instruction line |

### 10c-ii. `UpgradeCard` — pickable answer card

**CSS class:** `.upgrade-card`

**What it is:** One option inside `CardPicker`. Shows an answer value and the arrow sequence tied to that pick. Clicking triggers scoring and either advances to sequence (correct) or retries (wrong).

| Class | Role |
|-------|------|
| `.upgrade-card` | Full-width button; horizontal inner layout (answer + divider + sequence) |
| `.upgrade-card__type` / `__effect` | Small uppercase labels ("Answer", "Sequence") |
| `.upgrade-card__value` | Large answer number |
| `.upgrade-card__seq` | Arrow sequence preview (↑ ↓ ← →) |
| `.upgrade-card.is-correct` | Black fill on chosen correct card |
| `.upgrade-card.is-wrong` | Shake on wrong pick before vanish |
| `.upgrade-card.is-crossed` | Thick X draws over wrong option (game outline style) |
| `.upgrade-card.is-vanishing` | Wrong pick fades out after bleed |
| `.upgrade-card.is-auto-picked` | Correct card auto-selected with pop-in (timeout / wrong pick) |
| `.upgrade-card__cross` | X overlay element inside card |

**Resolution rules (always advances to sequence with correct answer):**
- **Correct pick** → wrong card crossed, correct highlighted → sequence
- **Wrong pick** → bleed, wrong card vanishes, correct auto-picked → sequence
- **Timeout** → wrong card crossed, correct auto-picked → sequence

**JS show/hide pattern:**

```javascript
function showQuestion() {
  questionEl.hidden = false;
  sequenceEl.hidden = true;
  playWindow.classList.add("is-question");
  startChoiceTimer();   // top bar drains; shake + darken escalate
}

function hideQuestion() {
  stopChoiceTimer();    // clears bar, overlay, and shake
  questionEl.hidden = true;
  playWindow.classList.remove("is-question");
}
```

### 10c-iii. `ChoiceTimer` — timed card pick

**CSS classes:** `.choice-timer`, `.choice-pressure` · **IDs:** `#choice-timer`, `#choice-pressure`

**What it is:** Urgency system during the question phase. A black bar fixed to the top of the screen drains over ~9 seconds (Level 1 tutorial). As it empties, the **screen border slowly turns dark and creeps inward** — like being engulfed — while the center stays clear until the edges close in. No flash/pulse/shake.

**Epilepsy-safe defaults:** Engulf is geometric (shrinking clear hole), not full-screen opacity pulse. No screen shake, no strobing. Honors `prefers-reduced-motion: reduce` (stops sooner, ~14% hole min).

| Class | Role |
|-------|------|
| `.choice-timer` | Fixed top bar; `hidden` until question phase |
| `.choice-timer__fill` | Black fill; width driven by `requestAnimationFrame` |
| `.choice-pressure` | Radial engulf vignette — `--vignette-hole` shrinks from ~68% → ~4% as timer drains |
| `body.is-choice-pressure` | Active during choice timer |

**Timeout:** −25 PTS, bleed, wrong card crossed, correct auto-picked → sequence (no retry loop).

**JS:** `startChoiceTimer()` on `showQuestion()`, `stopChoiceTimer()` on pick or `hideQuestion()`. Wrong pick restarts timer after 800ms.

### 10d. `TileRush` — piano tiles rhythm (left panel)

**CSS classes:** `.level-sequence`, `.tile-rush` · **ID:** `#level-sequence`

**What it is:** The left-panel rhythm game after a correct card pick. Four lanes (← ↓ ↑ →) with tiles falling toward a hit line. Receptor buttons at the bottom match each lane. Player taps (or holds) the arrow key when the tile reaches the line. Timing judged by tile position — no footer sweep bar.

```html
<div class="level-sequence" id="level-sequence" hidden>
  <div class="tile-rush" id="tile-rush">
    <div class="tile-rush__stage" id="tile-stage">
      <div class="tile-rush__lanes" id="tile-lanes">…4 lanes…</div>
      <div class="tile-rush__hitline"></div>
    </div>
    <div class="tile-rush__receptors" id="tile-receptors">…← ↓ ↑ →…</div>
  </div>
</div>
```

| Class | Role |
|-------|------|
| `.tile-lane` | One arrow column; tiles fall inside `.tile-lane__tiles` |
| `.tile-note` | Falling tile — white fill, 3px border, offset shadow |
| `.tile-note--hold` | Taller striped tile for hold notes |
| `.tile-rush__hitline` | Thick black line — judge zone |
| `.tile-receptor` | Bottom button per lane; `.is-pressed` / `.is-lit` on hit |

**Chart format (`SEQUENCE_CHART` in level JS):** `{ key, type: "tap"|"hold", holdMs? }` per note.

**Piano tiles behaviour:** Plain black blocks fall in the matching lane. Tap row at bottom (← ↓ ↑ →). Judge popup shows **Perfect!**, **Good!**, **OK**, or **Miss**. Misses are fine — song continues, no restart.

**JS:** `startTileRush()` spawns chart, animates with `requestAnimationFrame`. All notes judged or missed → level done.

### 10e. Gameplay flow (level JS pattern)

```javascript
document.addEventListener("level:start", () => {
  runCountdown();          // 3-2-1-GO → showQuestion()
});

function showQuestion() {
  questionEl.hidden = false;
  sequenceEl.hidden = true;           // critical
  playWindow.classList.add("is-question");
  startChoiceTimer();
}

function startSequence() {
  hideQuestion();
  sequenceEl.hidden = false;        // only after correct card
  timingBar.hidden = false;
}

document.addEventListener("keydown", (e) => {
  if (phase === "sequence") { onSequenceKey(e.code); }
});
```

**Level 1 flow:** Tutorial → countdown → question (cards left, tree right) → sequence (panels left, tree right) → done.

**Scoring:** Correct card +30, wrong card −25, wrong key −15, timing bar +25 / +15 / +5.

### 10f. Example — 5-node level tree (Level 1 data)

```
      8
     / \
    4   12
   / \
  2   6
```

| Node | cx | cy | r |
|------|----|----|---|
| 8 | 180 | 42 | 26 |
| 4 | 100 | 140 | 24 |
| 12 | 260 | 140 | 24 |
| 2 | 55 | 232 | 24 |
| 6 | 145 | 232 | 24 |

| Edge | x1 | y1 | x2 | y2 |
|------|----|----|----|----|
| 8→4 | 160 | 68 | 118 | 116 |
| 8→12 | 200 | 68 | 242 | 116 |
| 4→2 | 82 | 164 | 72 | 208 |
| 4→6 | 118 | 164 | 132 | 208 |

---

## 11. `WaveformBand` (Decorative, optional)

**Purpose:** Subtle rhythm motif behind trees (from style guide).

```html
<div class="waveform-band" aria-hidden="true"></div>
```

Grey dot pattern via CSS `radial-gradient` background; low opacity (~15%).

---

## Composition Recipes

### Level page — use this every time ⭐

```
body.level-page
  .tutorial-modal.is-open
    .tutorial-modal__panel
      .tutorial-header + .callout + .tree-diagram (demo) + Got it
  .level-bleed
  .level-game
    .level-hud (menu + badge + PTS score)
    .level-countdown
    .level-stage > .play-window
      .play-window__left
        .reward-popup#level-question (CardPicker — hidden until question)
        .level-sequence#level-sequence (hidden until sequence)
      .play-window__right > .tree-diagram--game > .level-tree
    .level-footer (prompt + timing-bar)
```

### Homepage

```
.stage
  .menu > .btns > .btn × n
```

---

## Accessibility Checklist

- Tree: `aria-label` on `<figure>`; SVG `role="img"`
- Progress: `aria-label="Tutorial step X of Y"`
- Decorative waveform: `aria-hidden="true"`
- Focus states on all interactive elements
- Body text minimum contrast AA on white

---

## Adding a New Component

1. Implement CSS in `css/<name>.css`
2. Add a section here with HTML snippet, classes, states
3. Update [`index.md`](./index.md) file map
4. Cross-reference [`style.md`](./style.md) if visual rules change

---

*Last updated: ChoiceTimer — top depletion bar with escalating shake/darken during card pick*
