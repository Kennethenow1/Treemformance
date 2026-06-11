# TREEFORMANCE — Visual Style Guide

> Reference image: `Game Homepage pic.png`

This document captures the visual language of the TREEFORMANCE concept art so the web game can be built with a consistent look and feel.

---

## 1. Core Identity

| Attribute | Value |
|-----------|-------|
| **Game title** | TREEFORMANCE (portmanteau of *Tree* + *Performance*) |
| **Aesthetic** | Tech-minimalist, clean edu-game |
| **Theme fusion** | Computer science (binary trees) + music (rhythm / sound) |
| **Mood** | Precise, playful, modern, high-contrast |

The game should feel like a learning tool and a rhythm game at once — geometric and structured, but with musical energy underneath.

---

## 2. Color Palette

Strictly **monochrome**. No accent colors in the base design.

| Role | Color | Hex (approx.) | Usage |
|------|-------|---------------|-------|
| Background | White | `#FFFFFF` | Page canvas, node fill |
| Primary ink | Black | `#000000` | Title, node borders, tree edges, solid UI |
| Shadow / depth | Mid grey | `#9E9E9E` – `#BDBDBD` | Title drop shadow, secondary depth |
| Decorative | Light grey | `#E0E0E0` – `#F5F5F5` | Waveform dots, dial ticks, particles |
| Ghost / placeholder | Light grey + dashed | `#CCCCCC` border | Unbuilt tree nodes, future slots |

### Rules
- Keep backgrounds white or near-white; avoid dark mode unless explicitly designed later.
- Use grey only for atmosphere (background layers), never for primary interactive elements.
- Interactive nodes and text stay black-on-white for maximum readability.

---

## 3. Typography

### Title / Display
- **Font character:** Bold, rounded sans-serif — friendly but solid (similar to Nunito, Varela Round, or Baloo 2).
- **Case:** All caps for the logo (`TREEFORMANCE`).
- **Effect:** Sticker / button pop-out:
  - Fill: solid black
  - Outline: thick white stroke (~3–4px)
  - Shadow: soft grey drop shadow offset slightly down-right
- **CSS approach:** `text-stroke`, layered `text-shadow`, or SVG text with stroke.

### Body / UI
- Clean geometric sans-serif (Inter, DM Sans, or system-ui).
- High contrast: black text on white, or white text on black buttons.
- Numbers inside tree nodes: centered, medium weight, legible at small sizes.

### Hierarchy
1. Logo / title — largest, heaviest, decorative
2. Node values — medium, functional
3. Labels, scores, hints — small, regular weight

---

## 4. Tree Graphics (Core Game Element)

### Node — Active / Built
- **Shape:** Circle (`border-radius: 50%`)
- **Fill:** White
- **Border:** Thin solid black (~1–2px)
- **Content:** Centered number or label in black
- **Size:** Consistent within a level; root slightly larger optional

### Node — Ghost / Placeholder (To Be Built)
- **Shape:** Circle, same size as active nodes
- **Border:** Dashed light grey (`border: 2px dashed #CCC`)
- **Fill:** Transparent or very faint grey
- **Connector:** Dashed vertical line from parent to ghost node
- **Meaning:** Next insertion point, rhythm target, or player prompt

### Edges / Branches
- **Active:** Solid black lines, 1–2px, straight (not curved)
- **Ghost:** Dashed grey lines matching ghost nodes
- **Layout:** Classic top-down binary tree; balanced spacing

### Example Tree (from concept art)
```
        8
       / \
      4   12
     / \  / \
    2  6 10 14
   ·  ·  ·  ·   ← ghost level (dashed)
```

### Animation Opportunities
- Nodes **pulse** or **scale in** on beat when placed correctly
- Ghost nodes **fade in/out** or **blink** to the rhythm
- Edges **draw themselves** left-to-right or top-to-bottom in sync with music
- Correct placement: brief white flash or outline glow (still monochrome)

---

## 5. Background & Decorative Layers

These sit **behind** the tree and title — low opacity, non-interactive.

### Circular Dial / Gauge
- Large faint circle behind the tree root and title
- Thin tick marks, dashed radial lines, small dots
- Reads as: compass, clock face, radar, or metronome dial
- Opacity: ~15–25%
- Can rotate slowly or tick on beat

### Audio Waveform
- Horizontal band of small grey dots forming an equalizer / waveform
- Runs through or behind the tree midsection
- Should **react to music** (amplitude-driven height or density)
- Color: light grey dots on white — subtle, never competing with the tree

### Music Note Icon
- Small black circle with white eighth-note (♪) inside
- Positioned above the title, centered on the dial
- Use for: branding, menu icon, or rhythm-indicator badge

### Particles / Sparkles
- Sparse four-pointed stars and tiny dots
- Light grey, scattered around the main graphic
- Optional subtle drift or twinkle on beat hits

### Composition
- **Visual weight is on the right** — tree, title, and decorations cluster right-of-center
- **Left side stays open** — reserve for menus, score, instructions, or mode selection
- Web layout: consider a two-column shell (nav/content left, game stage right)

---

## 6. UI / UX Principles

| Principle | Implementation |
|-----------|----------------|
| **Clarity** | One focal point at a time (tree, then feedback) |
| **Geometry** | Circles, straight lines, radial symmetry — no organic blobs |
| **Contrast** | Black and white for all actionable UI |
| **Depth** | Layered backgrounds at low opacity; foreground stays flat |
| **Feedback** | Beat-synced motion > decorative animation |
| **Education** | Show tree structure explicitly; ghost nodes teach "where next" |

### Buttons & Controls
- Circular or pill-shaped buttons matching node aesthetic
- Black fill + white text, or white fill + black border
- Hover: invert or slight scale; Active: press-in shadow removal

### Rhythm Feedback (suggested, on-brand)
- **Perfect:** node snaps in, crisp pulse
- **Good:** node appears with softer pulse
- **Miss:** ghost node shakes or flashes dashed border red-free — use grey fade or strikethrough instead to stay monochrome

---

## 7. Layout Reference (Web)

```
┌─────────────────────────────────────────────────────┐
│  [open space]          │   ♪  TREEFORMANCE          │
│                        │      ╭ dial ring ╮         │
│  Menu / Score /        │         (8)                │
│  Instructions          │        / \                 │
│                        │       4   12               │
│                        │      / \  / \              │
│                        │     2  6 10 14             │
│                        │    ·  ·  ·  ·              │
│                        │   ~~~ waveform ~~~         │
└─────────────────────────────────────────────────────┘
```

- **Desktop:** ~40% left panel (UI), ~60% right (game stage)
- **Mobile:** Stack vertically; tree stage on top, controls below

---

## 8. Technical Implementation Notes

### Recommended stack
- **Tree rendering:** SVG (crisp at any scale, easy dashed lines) or HTML + CSS positioned nodes
- **Background layers:** SVG overlays or a `<canvas>` layer for waveform + particles
- **Title:** SVG text or styled HTML with stroke/shadow
- **Beat sync:** Web Audio API `AnalyserNode` driving waveform and pulse CSS variables

### CSS Tokens (starter)
```css
:root {
  --color-bg: #FFFFFF;
  --color-ink: #000000;
  --color-grey-light: #E8E8E8;
  --color-grey-mid: #B0B0B0;
  --color-grey-ghost: #CCCCCC;

  --node-size: 48px;
  --node-border: 2px solid var(--color-ink);
  --node-ghost-border: 2px dashed var(--color-grey-ghost);

  --font-display: "Nunito", "Varela Round", system-ui, sans-serif;
  --font-ui: "Inter", "DM Sans", system-ui, sans-serif;

  --title-stroke: 3px #FFFFFF;
  --title-shadow: 2px 3px 0 var(--color-grey-mid);
}
```

### Asset checklist
- [ ] Logo wordmark (SVG with stroke + shadow)
- [ ] Node circle component (active + ghost states)
- [ ] Edge line component (solid + dashed)
- [ ] Dial ring SVG (background)
- [ ] Music note badge icon
- [ ] Waveform dot pattern (static SVG + dynamic canvas variant)
- [ ] Particle/star sprite (optional)

---

## 9. Do / Don't

| Do | Don't |
|----|-------|
| Keep palette monochrome | Add neon, gradients, or color-coded lanes |
| Use dashed lines for "not yet built" | Use red/green success-fail colors (unless adding an accessible mode later) |
| Animate to the beat | Add busy, unrelated particle effects |
| Leave breathing room on the left | Center everything — crowds the layout |
| Make tree structure readable | Hide structure behind heavy decoration |
| Use circles and straight edges | Use skeuomorphic or 3D tree metaphors (real bark/leaves) |

---

## 10. Accessibility Considerations (future)

- Monochrome is elegant but can fail contrast for grey decorative elements — keep interactive elements at WCAG AA contrast.
- Rhythm games benefit from **visual + audio** cues; consider optional beat click or screen pulse for hearing-impaired players.
- Ghost nodes should also be indicated by **shape or icon**, not color alone.

---

*Last updated from concept art analysis — `Game Homepage pic.png`*
