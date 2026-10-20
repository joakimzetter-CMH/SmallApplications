# Flapppybird

A small, dependency-free Flappy Bird clone built with an HTML5 canvas and plain JavaScript.

## Run

Open `index.html` in any modern browser. You don't need a build step, a server or any dependencies.

To serve it locally instead (optional):

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Controls

- **Space**, **click** or **tap**: flap, start a run, or restart after game over.

## Features

- One level, with pipes whose gap size, gap position and spacing are randomized fresh on every run.
- Gravity and flap physics on a fixed timestep, driven by `requestAnimationFrame` with delta time, so speed is the same at any refresh rate.
- Collision with pipes, the ground and the ceiling.
- Live score, plus a high score saved in `localStorage`.
- Start screen and game-over screen.
- A responsive canvas that scales to fit any screen and stays sharp on high-DPI displays.

## Files

- `index.html`: page markup and the canvas
- `style.css`: layout and responsive scaling
- `game.js`: game loop, physics, rendering and input
