(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Configuration (logical units: the world is always WIDTH x HEIGHT, the canvas
  // is scaled to fit the screen). Speeds are per second, so gameplay is
  // independent of the display refresh rate.
  // ---------------------------------------------------------------------------
  var WIDTH = 400;
  var HEIGHT = 640;
  var GROUND_HEIGHT = 90;
  var GROUND_Y = HEIGHT - GROUND_HEIGHT;

  var GRAVITY = 1500;          // px/s^2
  var FLAP_VELOCITY = -460;    // px/s
  var MAX_FALL_SPEED = 720;    // px/s
  var SCROLL_SPEED = 160;      // px/s

  var BIRD_X = 110;
  var BIRD_RADIUS = 15;

  var PIPE_WIDTH = 70;
  var PIPE_CAP_HEIGHT = 24;
  var PIPE_CAP_OVERHANG = 4;
  var GAP_MIN = 145;
  var GAP_MAX = 185;
  var GAP_MARGIN = 60;         // min distance from gap to ceiling / ground
  var SPACING_MIN = 205;       // horizontal distance between pipe pairs
  var SPACING_MAX = 255;
  var FIRST_PIPE_X = WIDTH + 120;

  var FIXED_STEP = 1 / 120;    // simulation step (s)
  var MAX_FRAME_TIME = 0.25;   // ignore huge gaps (tab switch, debugger)
  var RESTART_DELAY = 0.5;     // s before game-over screen accepts input

  var STORAGE_KEY = 'flapppybird.highScore';

  // ---------------------------------------------------------------------------
  // Canvas setup
  // ---------------------------------------------------------------------------
  var canvas = document.getElementById('game');
  if (!canvas || !canvas.getContext) {
    return;
  }
  var ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  var viewScale = 1;

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    var availW = window.innerWidth;
    var availH = window.innerHeight;
    var scale = Math.min(availW / WIDTH, availH / HEIGHT);
    var cssW = Math.floor(WIDTH * scale);
    var cssH = Math.floor(HEIGHT * scale);

    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    viewScale = canvas.width / WIDTH;
  }

  // ---------------------------------------------------------------------------
  // High score persistence (localStorage may be unavailable, e.g. file:// in
  // some privacy modes, so every access is guarded).
  // ---------------------------------------------------------------------------
  function loadHighScore() {
    try {
      var value = parseInt(window.localStorage.getItem(STORAGE_KEY), 10);
      return isFinite(value) && value > 0 ? value : 0;
    } catch (e) {
      return 0;
    }
  }

  function saveHighScore(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch (e) {
      // Storage unavailable or full: keep the in-memory value only.
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function circleRectCollide(cx, cy, r, rx, ry, rw, rh) {
    var nx = clamp(cx, rx, rx + rw);
    var ny = clamp(cy, ry, ry + rh);
    var dx = cx - nx;
    var dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  var state = 'start';  // 'start' | 'playing' | 'over'
  var bird;
  var pipes;
  var nextSpacing;
  var score;
  var highScore = loadHighScore();
  var isNewBest = false;
  var groundOffset = 0;
  var clouds = [];
  var elapsed = 0;      // total time, used for idle animations
  var overTimer = 0;
  var flash = 0;

  function makeClouds() {
    clouds = [];
    for (var i = 0; i < 5; i++) {
      clouds.push({
        x: rand(0, WIDTH),
        y: rand(30, GROUND_Y * 0.55),
        size: rand(18, 34),
        speed: rand(0.15, 0.35)
      });
    }
  }

  function createPipe(x) {
    var gap = rand(GAP_MIN, GAP_MAX);
    var top = rand(GAP_MARGIN, GROUND_Y - GAP_MARGIN - gap);
    return { x: x, gapTop: top, gapBottom: top + gap, passed: false };
  }

  function reset() {
    bird = { y: GROUND_Y * 0.45, vy: 0, rotation: 0, wing: 0 };
    pipes = [createPipe(FIRST_PIPE_X)];
    nextSpacing = rand(SPACING_MIN, SPACING_MAX);
    score = 0;
    isNewBest = false;
    overTimer = 0;
    flash = 0;
    makeClouds();
  }

  function flap() {
    bird.vy = FLAP_VELOCITY;
    bird.wing = 1;
  }

  function startGame() {
    reset();
    state = 'playing';
    flap();
  }

  function gameOver() {
    state = 'over';
    overTimer = 0;
    flash = 1;
    if (score > highScore) {
      highScore = score;
      isNewBest = true;
      saveHighScore(highScore);
    }
  }

  function handleInput() {
    if (state === 'start') {
      startGame();
    } else if (state === 'playing') {
      flap();
    } else if (state === 'over' && overTimer >= RESTART_DELAY) {
      startGame();
    }
  }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------
  function update(dt) {
    elapsed += dt;
    bird.wing = Math.max(0, bird.wing - dt * 4);
    flash = Math.max(0, flash - dt * 3);

    if (state === 'start') {
      bird.y = GROUND_Y * 0.45 + Math.sin(elapsed * 3) * 8;
      bird.rotation = 0;
      scrollScenery(dt);
      return;
    }

    if (state === 'over') {
      overTimer += dt;
      // Let the bird drop to the ground after a crash.
      if (bird.y + BIRD_RADIUS < GROUND_Y) {
        bird.vy = Math.min(bird.vy + GRAVITY * dt, MAX_FALL_SPEED);
        bird.y = Math.min(bird.y + bird.vy * dt, GROUND_Y - BIRD_RADIUS);
        bird.rotation = Math.min(bird.rotation + dt * 8, Math.PI / 2);
      }
      return;
    }

    // Playing
    scrollScenery(dt);

    bird.vy = Math.min(bird.vy + GRAVITY * dt, MAX_FALL_SPEED);
    bird.y += bird.vy * dt;
    bird.rotation = clamp(bird.vy / 600, -0.45, Math.PI / 2.2);

    // Move pipes, spawn new ones and drop off-screen ones.
    for (var i = 0; i < pipes.length; i++) {
      pipes[i].x -= SCROLL_SPEED * dt;
    }
    var last = pipes[pipes.length - 1];
    if (last.x <= WIDTH + PIPE_CAP_OVERHANG - nextSpacing) {
      pipes.push(createPipe(last.x + nextSpacing));
      nextSpacing = rand(SPACING_MIN, SPACING_MAX);
    }
    while (pipes.length && pipes[0].x + PIPE_WIDTH + PIPE_CAP_OVERHANG < 0) {
      pipes.shift();
    }

    // Scoring
    for (var j = 0; j < pipes.length; j++) {
      var p = pipes[j];
      if (!p.passed && p.x + PIPE_WIDTH < BIRD_X) {
        p.passed = true;
        score++;
      }
    }

    // Collisions: ceiling, ground, pipes.
    if (bird.y - BIRD_RADIUS <= 0) {
      bird.y = BIRD_RADIUS;
      gameOver();
      return;
    }
    if (bird.y + BIRD_RADIUS >= GROUND_Y) {
      bird.y = GROUND_Y - BIRD_RADIUS;
      gameOver();
      return;
    }
    var r = BIRD_RADIUS - 2; // slightly forgiving hitbox
    for (var k = 0; k < pipes.length; k++) {
      var pp = pipes[k];
      var px = pp.x - PIPE_CAP_OVERHANG;
      var pw = PIPE_WIDTH + PIPE_CAP_OVERHANG * 2;
      if (circleRectCollide(BIRD_X, bird.y, r, px, 0, pw, pp.gapTop) ||
          circleRectCollide(BIRD_X, bird.y, r, px, pp.gapBottom, pw, GROUND_Y - pp.gapBottom)) {
        gameOver();
        return;
      }
    }
  }

  function scrollScenery(dt) {
    groundOffset = (groundOffset + SCROLL_SPEED * dt) % 24;
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      c.x -= SCROLL_SPEED * c.speed * dt;
      if (c.x < -c.size * 3) {
        c.x = WIDTH + c.size * 3;
        c.y = rand(30, GROUND_Y * 0.55);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function drawBackground() {
    var sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, '#4ec0ca');
    sky.addColorStop(1, '#a8e4e9');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, GROUND_Y);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.size, 0, Math.PI * 2);
      ctx.arc(c.x + c.size, c.y + c.size * 0.2, c.size * 0.8, 0, Math.PI * 2);
      ctx.arc(c.x - c.size, c.y + c.size * 0.25, c.size * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Distant hills
    ctx.fillStyle = '#7fd17f';
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    for (var x = 0; x <= WIDTH; x += 20) {
      ctx.lineTo(x, GROUND_Y - 30 - Math.sin(x * 0.03) * 12 - Math.sin(x * 0.011) * 10);
    }
    ctx.lineTo(WIDTH, GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }

  function drawPipe(x, y, h, capAtBottom) {
    if (h <= 0) {
      return;
    }
    var body = ctx.createLinearGradient(x, 0, x + PIPE_WIDTH, 0);
    body.addColorStop(0, '#5fb83a');
    body.addColorStop(0.4, '#9be15d');
    body.addColorStop(1, '#3f8a24');
    ctx.fillStyle = body;
    ctx.fillRect(x, y, PIPE_WIDTH, h);
    ctx.strokeStyle = '#2d5e1a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y, PIPE_WIDTH - 2, h);

    var capX = x - PIPE_CAP_OVERHANG;
    var capW = PIPE_WIDTH + PIPE_CAP_OVERHANG * 2;
    var capH = Math.min(PIPE_CAP_HEIGHT, h);
    var capY = capAtBottom ? y + h - capH : y;
    ctx.fillStyle = body;
    ctx.fillRect(capX, capY, capW, capH);
    ctx.strokeRect(capX + 1, capY + 1, capW - 2, capH - 2);
  }

  function drawPipes() {
    for (var i = 0; i < pipes.length; i++) {
      var p = pipes[i];
      drawPipe(p.x, 0, p.gapTop, true);
      drawPipe(p.x, p.gapBottom, GROUND_Y - p.gapBottom, false);
    }
  }

  function drawGround() {
    ctx.fillStyle = '#ded895';
    ctx.fillRect(0, GROUND_Y, WIDTH, GROUND_HEIGHT);
    ctx.fillStyle = '#73bf2e';
    ctx.fillRect(0, GROUND_Y, WIDTH, 16);

    ctx.fillStyle = '#5a9e22';
    for (var x = -groundOffset; x < WIDTH; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 16);
      ctx.lineTo(x + 12, GROUND_Y);
      ctx.lineTo(x + 24, GROUND_Y);
      ctx.lineTo(x + 12, GROUND_Y + 16);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#543847';
    ctx.fillRect(0, GROUND_Y, WIDTH, 2);
    ctx.fillStyle = '#c9c17a';
    ctx.fillRect(0, GROUND_Y + 16, WIDTH, 3);
  }

  function drawBird() {
    ctx.save();
    ctx.translate(BIRD_X, bird.y);
    ctx.rotate(bird.rotation);

    // Body
    ctx.fillStyle = '#f8d43a';
    ctx.strokeStyle = '#543847';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, BIRD_RADIUS + 3, BIRD_RADIUS, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Wing (flaps up after each flap, idles with a gentle beat)
    var wingLift = state === 'start' ? Math.sin(elapsed * 12) * 0.5 + 0.5 : bird.wing;
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.ellipse(-6, 3 - wingLift * 6, 8, 5 + wingLift * 1.5, -0.3 - wingLift * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(8, -6, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(10, -6, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = '#f37a3a';
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(25, 3);
    ctx.lineTo(12, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function drawText(text, x, y, size, align) {
    ctx.font = 'bold ' + size + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size / 7);
    ctx.strokeStyle = '#543847';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, y);
  }

  function drawPanel(x, y, w, h) {
    ctx.fillStyle = '#ded895';
    ctx.strokeStyle = '#543847';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, 12);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.fill();
    ctx.stroke();
  }

  function drawHud() {
    if (state === 'playing') {
      drawText(String(score), WIDTH / 2, 70, 52);
      return;
    }

    if (state === 'start') {
      drawText('Flappy Bird', WIDTH / 2, 140, 48);
      var pulse = 0.6 + 0.4 * Math.sin(elapsed * 4);
      ctx.globalAlpha = pulse;
      drawText('Press Space, click or tap', WIDTH / 2, GROUND_Y * 0.45 + 80, 22);
      ctx.globalAlpha = 1;
      if (highScore > 0) {
        drawText('Best: ' + highScore, WIDTH / 2, GROUND_Y - 40, 22);
      }
      return;
    }

    // Game over
    drawText('Game Over', WIDTH / 2, 150, 48);
    var pw = 240;
    var ph = 150;
    var px = (WIDTH - pw) / 2;
    var py = 200;
    drawPanel(px, py, pw, ph);
    drawText('Score', px + 70, py + 40, 20);
    drawText(String(score), px + 70, py + 90, 40);
    drawText('Best', px + pw - 70, py + 40, 20);
    drawText(String(highScore), px + pw - 70, py + 90, 40);
    if (isNewBest) {
      drawText('New best!', WIDTH / 2, py + ph - 14, 16);
    }
    if (overTimer >= RESTART_DELAY) {
      var a = 0.6 + 0.4 * Math.sin(elapsed * 4);
      ctx.globalAlpha = a;
      drawText('Space, click or tap to restart', WIDTH / 2, py + ph + 50, 20);
      ctx.globalAlpha = 1;
    }
  }

  function render() {
    ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
    drawBackground();
    if (state !== 'start') {
      drawPipes();
    }
    drawGround();
    drawBird();
    drawHud();

    if (flash > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, ' + (flash * 0.8).toFixed(3) + ')';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }

  // ---------------------------------------------------------------------------
  // Main loop: fixed-timestep simulation driven by requestAnimationFrame so the
  // game behaves identically at 30, 60, 120 or 144 Hz.
  // ---------------------------------------------------------------------------
  var lastTime = null;
  var accumulator = 0;

  function frame(now) {
    if (lastTime === null) {
      lastTime = now;
    }
    var frameTime = Math.min((now - lastTime) / 1000, MAX_FRAME_TIME);
    lastTime = now;
    if (frameTime > 0) {
      accumulator += frameTime;
    }
    while (accumulator >= FIXED_STEP) {
      update(FIXED_STEP);
      accumulator -= FIXED_STEP;
    }
    render();
    window.requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.key === ' ' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (!e.repeat) {
        handleInput();
      }
    }
  });

  function onPointer(e) {
    if (e.button !== undefined && e.button !== 0) {
      return;
    }
    e.preventDefault();
    canvas.focus();
    handleInput();
  }

  if (window.PointerEvent) {
    canvas.addEventListener('pointerdown', onPointer);
  } else {
    canvas.addEventListener('mousedown', onPointer);
    canvas.addEventListener('touchstart', onPointer, { passive: false });
  }

  // Avoid a giant catch-up step when returning to a hidden tab.
  document.addEventListener('visibilitychange', function () {
    lastTime = null;
    accumulator = 0;
  });

  window.addEventListener('resize', resize);

  resize();
  reset();
  window.requestAnimationFrame(frame);
})();
