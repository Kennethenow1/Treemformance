# Level 5 — Grand Build & Match

Level 5 extends Level 4 with a **12-node BST**, balanced **L2/L3** card mix, **chord rhythm inputs** (two keys at once), and truncated path display on cards.

See `docs/LEVEL4.md` for shared pitfalls (slant layout, camera, compare modal, L2 vs L3 rules).

---

## Goal Tree

**Pool:** `[2, 5, 10, 15, 20, 30, 42, 48, 55, 68, 72, 80]`

```
           42
         /    \
       20      68
      /  \    /  \
    10   30  55  80
   / \      /   /
  5  15    48 72
 /
2
```

**Insert order:** `[42, 20, 10, 5, 2, 15, 30, 68, 55, 48, 80, 72]`

Defined in `js/tree-optimal.js` as `LEVEL5_GOAL`, `LEVEL5_POOL`, `LEVEL5_GOAL_ORDER`.

---

## Question schedule (`L5_QUESTION_MODES`)

11 questions + 1 auto-placed number:

```
l3, l2, l2, l3, l2, l3, l2, l3, l2, l2, l3
```

5 free picks · 6 directional quizzes — slightly L2-heavy for challenge.

---

## Play chart length

Cards show the **core insert path** (`getInsertChart`). Gameplay loops that pattern to **9–13 beats** via `extendInsertChart()` so each choice feels like a full piano phrase while reinforcing the same BST route.

---

## Chord inputs

`TreeOptimal.getInsertChart()` merges each **direction + descend** pair into one beat:

| Raw path | Chart beat |
|----------|------------|
| `←` then `↓` | chord `←+↓` |
| `→` then `↓` | chord `→+↓` |
| lone `↓` or final `←`/`→` | single tap |

Gameplay: both keys must be pressed while the chord tiles are in the hit window.

---

## Card path display

`TreeOptimal.formatInsertPathDisplay(chart, 4)`:

- ≤4 beats → full string, e.g. `←+↓ ←+↓ →+↓`
- \>4 beats → first 4 + ` .....`, e.g. `←+↓ ←+↓ ←+↓ ←+↓ .....`

---

## Layout

`TreeMap.SLANT_GAME_LAYOUT_L5` — `slantDx: 80`, `slantDy: 58` (12 nodes, 5 deep). Layout uses cross-depth overlap pass — see `LEVEL4.md` pitfalls.

---

## Files

| File | Role |
|------|------|
| `level-5.html` | Page shell |
| `js/level-5.js` | Gameplay + chord tile logic |
| `js/tree-optimal.js` | `LEVEL5_*`, `getInsertChart`, `formatInsertPathDisplay` |
| `js/tree-d3.js` | `SLANT_GAME_LAYOUT_L5`, `TUTORIAL_L5_DATA` |
