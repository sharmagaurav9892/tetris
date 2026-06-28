# Tetris

A modern Tetris built in the same emerald style as the sibling Snake game. 10×20 board, 7-bag random, ghost preview, next-piece panel, and a Top-3 leaderboard — pure HTML / CSS / JS, no server, no build step.

## Quick start

Just open `index.html` in a browser.

If you prefer serving it locally (some browsers restrict `file://` for things like fonts), any one-liner static server works:

```bash
python3 -m http.server 3000
# then open http://localhost:3000
```

## Scoring

| Lines cleared | Base points |
| ------------- | ----------- |
| 1 (Single)    | 100         |
| 2 (Double)    | 300         |
| 3 (Triple)    | 500         |
| 4 (Tetris)    | 800         |

Each clear is multiplied by `(level + 1)`. The level increases every 10 lines, and gravity speeds up with it: `tickMs = max(50, 1000 − level × 80)`.

## How scores are stored

Everything is persisted in this browser's `localStorage`:

| Key | What |
| --- | ---- |
| `tetris.leaderboard` | The Top 3 leaderboard. |
| `tetris.player` | Your current player name on this device. |

Clearing site data (or the **Clear** button in the leaderboard) wipes scores.

## Controls

| Key                          | Action      |
| ---------------------------- | ----------- |
| `←` `→`                      | Move        |
| `↓`                          | Soft drop   |
| `↑`                          | Rotate CW   |
| `Space`                      | Hard drop   |
| `P`                          | Pause       |
| `R`                          | Restart     |
| **Change** (top right)       | Switch player |
| **Clear** (leaderboard head) | Wipe Top 3  |

Touch devices show a D-pad: `↺` rotates, `▼` hard-drops, and the circular emerald button on the left pauses/resumes.

## Files

```
tetris/
├── index.html       # Markup
├── styles.css       # Theme
├── game.js          # Game loop, rendering, input, leaderboard
└── README.md
```
