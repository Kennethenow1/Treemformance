# Level 4 — Build & Match (Reference for AI)

Level 4 merges **Level 2** (directional card quiz) and **Level 3** (dynamic BST building + goal compare) into one level. Use this document when creating, debugging, or extending Level 4.

---

## Concept

Players build a **binary search tree** from a number pool by picking cards and tapping rhythm tiles. A **goal tree** is shown as a sidebar reference. At the end, a **compare modal** reveals both trees slot-by-slot and applies a structure penalty.

Level 4 teaches:
1. **BST placement rules** (left = smaller, right = larger) via L2-style questions
2. **Strategic ordering** via L3-style free-choice questions
3. **Structure awareness** via the goal reference and end comparison

---

## Goal Tree (Level 4)

**Pool:** `[3, 7, 9, 11, 14, 18, 22]` (7 numbers)

**Goal BST** (valid BST, 7 nodes):

```
        14
       /  \
      9    22
     / \   /
    7  11 18
   /
  3
```

**Insert order that builds the goal** (`LEVEL4_GOAL_ORDER`):

```
[14, 9, 22, 7, 11, 18, 3]
```

Defined in `js/tree-optimal.js` as `LEVEL4_GOAL`, `LEVEL4_POOL`, `LEVEL4_GOAL_ORDER`.

---

## Two Question Mechanics

Level 4 alternates between two card-pick modes. The schedule is in `L4_QUESTION_MODES` inside `js/level-4.js`.

| Step | Mode | Question style | Behavior |
|------|------|----------------|----------|
| 1 | `l3` | "Which number **starts** your tree?" | Free pick — either card is placed |
| 2 | `l2` | "What number goes **left of 9**?" | Correct vs wrong — penalty on wrong |
| 3 | `l2` | "What number goes **right of 14**?" | Correct vs wrong |
| 4 | `l3` | "Which number do you place **next**?" | Free pick |
| 5 | `l2` | Directional slot question | Correct vs wrong |
| 6 | `l3` | Free pick | Free pick |
| 7 | — | Last number auto-placed | No question |

### L2 mechanic (`mode: "l2"`)

Copied from Level 2. Requires an existing player tree.

- **Question:** `What number goes <strong>left of 9</strong>?` (from `TreeOptimal.getInsertLabel`)
- **Cards:** goal-path number (correct) vs random wrong from pool
- **Tree preview:** dashed `?` node + highlighted parent (`showInsertPreview(goalPick)`)
- **Wrong pick:** `SCORE_WRONG_CARD` (-25), bleed, auto-correct to goal number
- **Correct pick:** `SCORE_CORRECT_CARD` (+30)
- **Timeout:** auto-picks goal number with penalty
- **Card data:** `dataset.correct = "true"|"false"`, `dataset.mode = "l2"`

### L3 mechanic (`mode: "l3"`)

Copied from Level 3.

- **Question:** "Which number starts your tree?" (no tree) or "Which number do you place **next**?" (tree exists)
- **Cards:** goal-path number vs alternate from pool — both valid
- **No wrong answer** — player's pick is always placed
- **Goal-path bonus:** `SCORE_GOAL_PICK` (+12) if they pick the goal card
- **No cross-out** on the other card — both choices are valid; only the picked card gets `is-picked`
- **Timeout:** auto-picks alternate (no penalty), no cross-out on either card
- **Card data:** `dataset.goal = "true"|"false"`, `dataset.mode = "l3"`

### Choosing the mode

```javascript
const L4_QUESTION_MODES = ["l3", "l2", "l2", "l3", "l2", "l3"];

function getQuestionMode() {
  if (!playerTree) return "l3";
  return L4_QUESTION_MODES[stepIndex] ?? (stepIndex % 2 === 0 ? "l3" : "l2");
}
```

Adjust `L4_QUESTION_MODES` to change the mix. First pick is always L3 (no tree yet).

---

## Gameplay Flow

```
Goal intro popup (pan tour of goal shape, loops until Got it)
  → Countdown 3-2-1-GO
  → For each of 7 numbers:
      if 2+ remaining in pool → showQuestion() (L2 or L3)
      if 1 remaining → auto-place last number
      → startSequence() (rhythm tiles)
      → revealCurrentNode() (BST insert chosen value)
      → stepIndex++
  → runTreeComparison() (compare modal)
```

### Key state variables (`level-4.js`)

| Variable | Purpose |
|----------|---------|
| `playerTree` | BST built so far (from `TreeOptimal.bstInsert`) |
| `remaining` | `Set` of numbers not yet placed |
| `chosenValue` | Number picked this step |
| `currentChoices` | `{ goalPick, altPick/wrongPick, mode }` |
| `insertPreview` | `{ parentId, childId, side }` for pending slot |
| `pendingEdge` | Edge key like `"p2-pending"` for tile animation |
| `stepIndex` | 0-based step counter |

---

## File Map

| File | Role |
|------|------|
| `level-4.html` | Page shell, 3-column layout (cards \| your tree \| goal) |
| `js/level-4.js` | All gameplay: questions, tiles, compare, camera |
| `js/tree-optimal.js` | BST insert, goal data, compare, hierarchy |
| `js/tree-d3.js` | D3 renderer, slant layout, smart camera |
| `css/level.css` | `body.level-page--4` layout, compare modal |
| `js/level-modal.js` | Tutorial mount for L4 |

---

## Tree Rendering

### Layout

Level 4 uses **slant layout** (`TreeMap.SLANT_GAME_LAYOUT_L4`), NOT d3.tree. Slant gives diagonal parent→child edges like Level 2.

```javascript
TreeMap.SLANT_GAME_LAYOUT_L4 = {
  type: "slant",
  slantDx: 78,   // horizontal leaf spacing
  slantDy: 64,   // vertical depth spacing
  padX: 56,
  padY: 48,
  camera: true,
};
```

**Layout algorithm** (`tree-d3.js` → `_layoutSlant`):

1. **Pure diagonal slant** — every child is placed at `(parent.x ± slantDx, parent.y + slantDy)`.
2. **Overlap resolver** — spreads colliding same-depth nodes apart symmetrically (`_shiftSubtree`).
3. **Diagonal enforcement** — after every overlap pass, `_enforceDiagonalEdges` ensures every parent→child edge has at least `slantDx * 0.62` horizontal offset. This prevents overlap fixes from collapsing edges to vertical.
4. Both passes loop until stable — no vertical or horizontal edges.

**Never use d3.tree for Level 4 gameplay** — it produces wide horizontal spreads and cramped vertical stacks.

### Hierarchy format

Player tree → D3 data via `TreeOptimal.toHierarchy(playerTree, pendingPreview)`.

Every child **must** have `branch: "left"` or `branch: "right"` for slant layout to work:

```javascript
{ id: "p2", value: 9, children: [
  { id: "pending", value: "?", branch: "left", children: [] }
]}
```

Pending preview is injected when showing where the next number will go.

### Pending branch preview (L2 questions)

```javascript
showInsertPreview(goalPick);
// → syncTreeDisplay(goalPick)
// → toHierarchy(playerTree, { parentId, side })
// → tree.showPendingBranch(parentId, "pending")
```

Shows dashed line + `?` ghost node at the goal-path insert slot. Only during L2 questions.

---

## Smart Camera (no user drag)

Camera is automatic via `tree.ensureVisible({ focusNodeIds })`.

**Rules:**
- Tree outgrows frame → zoom out to fit (correct aspect ratio)
- Tree still fits → gently pan toward focus nodes (parent + pending slot)
- Never zooms in when tree already fits

```javascript
async function panTreeCamera(tree, pending = null) {
  await tree.ensureVisible({
    duration: 320,
    padding: 52,
    focusNodeIds: pending?.parentId
      ? [pending.parentId, "pending"]
      : pending ? ["pending"] : [],
  });
}
```

Called after every `syncTreeDisplay`. Do **not** add drag-to-pan — use smart auto-pan only.

Compare modal uses `COMPARE_LAYOUT` with `camera: false` (static fit).

---

## Goal Sidebar

```javascript
goalMap = TreeMap.mountGoalStructure(goalStage, goalData, GAME_LAYOUT);
```

Shows goal shape with `?` ghosts. Does not mutate during play. Reference only.

---

## End Compare Modal

Triggered by `runTreeComparison()` when all 7 numbers are placed.

1. `TreeOptimal.compareTrees(playerTree, GOAL_TREE)` — structural walk
2. Side-by-side trees in compare modal
3. **Dual-track reveal:** goal in goal preorder, player in player preorder
4. Match meter + issue list + structure penalty (`penaltyPerIssue: 18`)
5. Play-field tree is **not** mutated during compare

---

## Scoring

| Event | Points |
|-------|--------|
| Start | 100 |
| L2 correct card | +30 |
| L2 wrong card | -25 |
| L3 goal-path pick | +12 |
| L3 alt pick | 0 |
| L2 timeout | -25 (auto goal) |
| L3 timeout | 0 (auto alt) |
| Rhythm perfect/good/ok | +25 / +15 / +5 |
| Wrong lane | -12 |
| Structure penalty (end) | -18 per mismatch/missing, -18 per extra node |

---

## 3-Column Layout

```
┌─────────────┬──────────────────┬────────────┐
│  Cards /    │   YOUR TREE      │   GOAL     │
│  Tiles      │   (build mode)   │   (ghost)  │
└─────────────┴──────────────────┴────────────┘
```

CSS: `body.level-page--4` in `css/level.css`. Grid: `0.9fr | 1.35fr | 0.5fr`.

During questions, cards column shows two upgrade cards. During sequence, tile rush appears.

---

## Creating a New Level 4 Variant

1. **Define goal** in `tree-optimal.js`:
   - `LEVEL4_GOAL` — nested `{ value, left?, right? }`
   - `LEVEL4_POOL` — array of all numbers
   - `LEVEL4_GOAL_ORDER` — BST insert order that builds the goal

2. **Validate goal** — `LEVEL4_GOAL_ORDER` must produce `LEVEL4_GOAL` when inserted in order via `bstInsert`.

3. **Adjust question mix** — edit `L4_QUESTION_MODES` array (length = pool size - 1).

4. **Tune layout** — if tree has 8+ nodes, increase `slantDx` in `SLANT_GAME_LAYOUT_L4`. Never switch to d3.tree.

5. **Update tutorial** — `TreeMap.TUTORIAL_L4_DATA` + `TUTORIAL_L4_LAYOUT` (slant, not d3.tree) in `tree-d3.js`, mount in `level-modal.js`.

6. **Cache-bust** — bump `?v=` on script/link tags in `level-4.html`.

---

## Things to Avoid

Read this before changing Level 4. These are recurring mistakes that have broken the level before.

### Tree layout

| Do NOT | Why | Do instead |
|--------|-----|------------|
| Use `d3.tree` for gameplay, goal sidebar, intro, **or tutorial** | Produces wide horizontal spreads and overlapping nodes in modals | `SLANT_GAME_LAYOUT_L4` / `TUTORIAL_L4_LAYOUT` with `type: "slant"` |
| Omit `branch: "left"` / `branch: "right"` on hierarchy children | Slant layout cannot place nodes diagonally | Always set via `toHierarchy` / `goalStructureHierarchy` |
| Fix cousin overlaps by shifting only the two colliding nodes | Diagonal enforcement pulls them back together (e.g. nodes 11 & 18 overlap) | `_subtreeSeparationRoot` — shift parent subtrees apart on cousin collision |
| Fix overlaps by only shifting nodes on the same row right | Collapses child onto parent's x → **vertical edge** | Use `_resolveSlantOverlaps` + `_enforceDiagonalEdges` loop in `_layoutSlant` |
| Use leaf-centering or tidy-tree x positions without diagonal enforcement | Single-child chains become perfectly vertical | Pure slant assign: `child.x = parent.x ± slantDx`, `child.y = parent.y + slantDy` |
| Share a different layout between goal sidebar and player tree | Goal looks good, play tree looks wrong | Same `GAME_LAYOUT` everywhere in-game |

### Camera

| Do NOT | Why | Do instead |
|--------|-----|------------|
| Use `panToNode` with low `scale` (e.g. 0.42–0.55) in gameplay | Zooms in too hard, nodes appear stacked/overlapping | `ensureVisible({ focusNodeIds })` — pans gently, never zooms in when tree fits |
| Use `panToNode` in the **goal intro popup** | Small stage + aggressive zoom = overlapping nodes | `panToFit` on mount, then `ensureVisible` per highlighted node during tour |
| Add drag-to-pan on the SVG | User cannot drag; feels broken | Smart auto-pan only (`ensureVisible` after each `syncTreeDisplay`) |
| Mount intro tree before the stage has layout size | Container width 0 → wrong viewBox, cramped render | `requestAnimationFrame` then mount, then immediate `panToFit({ duration: 0 })` |
| Forget to call `panToFit` when intro opens | First frame shows unscaled tree, nodes overlap visually | `await introMap.panToFit({ duration: 0, padding: 48 })` right after mount |

### L2 vs L3 question mechanics

| Do NOT | Why | Do instead |
|--------|-----|------------|
| Use L2 penalties on L3 questions | "Which do you place next?" has no wrong answer | Branch on `card.dataset.mode` — L2 only for `mode === "l2"` |
| Auto-correct to goal number on L3 pick | Player chose a valid number; it must be placed | `handleL3Pick` — always `chosenValue = card.dataset.value` |
| Cross out the other card on L3 pick (`is-crossed`) | Both cards are valid choices; cross-out implies wrong | Only `is-picked` on chosen card; no `is-crossed` on the other |
| Cross out on L3 timeout | Same as above | Auto-pick alt, highlight picked card only |
| Use L2 for every step after the first | Level 4 must teach both mechanics | Follow `L4_QUESTION_MODES` schedule |
| Use L3 question text on L2 steps ("place next") | L2 asks about **slot** ("left of 9") | `getInsertLabel` for L2; "place next" / "starts tree" for L3 |
| Skip pending branch preview on L2 questions | Player can't see where the number goes | `showInsertPreview(getGoalPick())` when `mode === "l2"` |
| Show pending preview on L3 questions | No specific slot — player chooses freely | `syncTreeDisplay(null)` for L3 |

### Compare modal

| Do NOT | Why | Do instead |
|--------|-----|------------|
| Reveal player tree in **goal** preorder | Nodes jump around spatially when structures differ | `collectPlayerRevealSlots` for player; `collectCompareSlots` for goal |
| Batch-reveal leftover player nodes at the end | Jarring all-at-once pop | Player preorder loop covers all nodes |
| Call `markMismatches` on the play-field tree | Tree changes during compare; confuses player | Mismatch styling only on compare modal copies |
| Use a different layout for compare than gameplay | Inconsistent node positions | `COMPARE_LAYOUT = { ...GAME_LAYOUT, camera: false }` |
| Hide compare trees when animation ends | Trees disappear after analysis | Keep modal cards visible via `is-open` CSS |

### Scoring & flow

| Do NOT | Why | Do instead |
|--------|-----|------------|
| Penalize L3 alt pick | Valid strategic choice | `SCORE_GOAL_PICK` (+12) only when goal card chosen; 0 otherwise |
| Hide question before cross-out animation finishes (L2) | Player misses feedback | `advanceAfterChoice` delay ≥ 1000ms for L2 |
| Mutate `playerTree` during compare setup | Corrupts final state | Read-only compare on copies mounted in modal |

---

## Goal Intro Popup

Separate from in-game goal sidebar — easy to break if copied wrong.

```javascript
const INTRO_LAYOUT = { ...GAME_LAYOUT, padX: 64, padY: 56 };

// Mount sequence (level-4.js → runGoalIntro)
await requestAnimationFrame(...);
const introMap = TreeMap.mountGoalStructure(goalIntroStage, goalData, INTRO_LAYOUT);
introMap.resize();
await introMap.panToFit({ duration: 0, padding: 48 });

// Tour: panToFit + ensureVisible per node — NEVER panToNode with scale < 1
```

Intro stage CSS: `goal-intro__stage` needs enough height (`clamp(16rem, 46vh, 22rem)`) for 7 nodes.

---

## Common Bugs & Fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Cousin nodes overlapping (peanut shape) | Node-only overlap fix fights diagonal enforcement | `_subtreeSeparationRoot` shifts parent branches apart |
| Diagonal overlap across depths (e.g. g30 vs g48) | Same-row pass only checks equal `y` | `_resolveCrossDepthOverlaps` + `_pairSeparationRoots` |
| Vertical edge between nodes | Overlap shift collapsed child to `parent.x` | `_enforceDiagonalEdges` after overlap pass |
| Horizontal edge at same depth | d3.tree or missing branch tags | Slant layout + branch on every child |
| Goal intro nodes overlapping | `panToNode` zoom or no initial `panToFit` | Fit on mount; tour uses `ensureVisible` only |
| In-game goal OK, intro bad | Different tour code or mount before layout | Use `INTRO_LAYOUT` + rAF + `panToFit(0)` |
| Other card crossed on L3 pick | `crossUnpickedCards` / `is-crossed` on L3 | L3: `is-picked` only, no cross-out |
| Wrong number placed | L2 handler on L3 card | Check `dataset.mode === "l3"` |
| Compare player tree jumps | Goal-order reveal on player side | `collectPlayerRevealSlots` |
| Camera zooms/jumps during play | `panToNode` in `syncTreeDisplay` | `ensureVisible` + `focusNodeIds` only |

---

## Dependencies

- `d3.min.js` — hierarchy, tree layout (not used for L4 slant)
- `tree-optimal.js` — BST logic, goal data, compare
- `tree-d3.js` — `TreeMap` renderer, layouts, camera
- `level-modal.js` — tutorial overlay
- `css/tokens.css`, `css/tree.css`, `css/level.css` — styling per `style.md`

---

## Checklist for AI Implementing Changes

- [ ] Both L2 and L3 mechanics work with correct question text and scoring
- [ ] `L4_QUESTION_MODES` gives a good mix across all steps
- [ ] L2 questions show pending branch preview (dashed `?` + parent highlight)
- [ ] L3 picks always place the chosen number (no auto-correct, no cross-out on other card)
- [ ] L2 wrong pick: cross-out + penalty; L3 pick: `is-picked` only
- [ ] Slant layout used in-game; compare uses same spacing, `camera: false`
- [ ] No vertical edges — diagonal enforcement active in `_layoutSlant`
- [ ] `branch: "left"|"right"` on all hierarchy children
- [ ] Smart camera: `ensureVisible` only in play (no `panToNode` zoom, no drag)
- [ ] Goal intro: `panToFit` on mount, tour uses `ensureVisible` not `panToNode`
- [ ] Compare modal: dual-track reveal, play tree not mutated
- [ ] Cache-bust params updated in `level-4.html`

---

## Cache-Bust Reminder

After editing any of these files, bump `?v=` in `level-4.html`:

- `js/tree-d3.js`
- `js/tree-optimal.js`
- `js/level-4.js`
- `css/level.css`
