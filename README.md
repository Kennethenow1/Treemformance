# TREEFORMANCE

A browser rhythm game about building binary trees in time with the music. Pick numbers, play arrow-key patterns, and grow a tree toward a goal shape.

No build step. Plain HTML, CSS, and JavaScript.

## Quick start

You need a **local web server**. Opening files directly from the disk (`file://`) often blocks audio.

### Python (Mac, Linux, Windows with Python installed)

```bash
cd "/path/to/this folder"
python3 -m http.server 8080
```

Open in your browser:

**http://localhost:8080/loading.html**

The loading screen warms up assets, then sends you to the main menu. On repeat visits in the same tab, `index.html` may skip the loader.

### Node (if you have npm)

```bash
npx --yes serve .
```

Open the URL it prints, then add `/loading.html`.

## How to play

1. **Menu** (`index.html`): Tutorial, levels, music player, settings.
2. **Levels** (`level-1.html` through `level-5.html`): Read the in-level tutorial, pick card answers, then hit arrow keys on the beat.
3. **Settings** (`game-settings.html`): Input bindings and audio latency calibration.

### Controls (default)

| Input | Action |
|-------|--------|
| Up / Down | Move between choice cards |
| Left + Right together | Confirm card |
| Arrow keys | Rhythm tiles during piano phase |

## Project layout

```
├── loading.html          Entry screen (full ASCII + preload)
├── index.html            Main menu
├── level-1.html … 5      Playable levels
├── game-settings.html    Controls and sync
├── css/                  Stylesheets
├── js/                   Game logic
├── audio/                MP3 tracks (see note below)
├── docs/                 Extra level and design notes
├── style.md              Visual style reference
├── components.md         UI component catalog
└── index.md              Documentation index
```

See [docs/STRUCTURE.md](docs/STRUCTURE.md) for how the JavaScript modules fit together.

## Audio files

The game expects MP3 files under `audio/` (see `js/preload-manifest.js`). If tracks are missing, the menu and levels still run; rhythm may fall back to procedural audio where supported.

## GitHub

Repository: [github.com/Kennethenow1/Treemformance](https://github.com/Kennethenow1/Treemformance)

```bash
git clone https://github.com/Kennethenow1/Treemformance.git
cd Treemformance
python3 -m http.server 8080
```

## Documentation

- [Documentation index](index.md)
- [Visual style guide](style.md)
- [Component library](components.md)
- [Folder and module map](docs/STRUCTURE.md)

## Tech notes

- Trees rendered with D3 (`js/vendor/d3.min.js`, `js/tree-d3.js`).
- Music and SFX use the Web Audio API.
- In-level ASCII background is intentionally lighter than the menu/loader for performance.

## License

Add your license before a public release.
