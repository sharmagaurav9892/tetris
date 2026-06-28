/* =====================================================================
 * Tetris
 * Arrow keys to move/rotate, Space to hard drop, P to pause, R to restart.
 * 7-bag random, basic wall-kick, next-piece preview, line clear scoring.
 * ===================================================================== */

(() => {
  "use strict";

  // -------------------- Config --------------------
  const COLS = 10;
  const ROWS = 20;
  const MAX_LEADERS = 3;
  const LINES_PER_LEVEL = 10;
  const LINE_SCORE = { 1: 100, 2: 300, 3: 500, 4: 800 };

  const COLORS = {
    boardBg: "#0b0e13",
    grid:    "rgba(255, 255, 255, 0.04)",
    ghost:   "rgba(255, 255, 255, 0.10)",
    I: "#22c1c9",
    O: "#f0b429",
    T: "#b481ff",
    S: "#22c997",
    Z: "#e5484d",
    J: "#4cb1ff",
    L: "#ff9f43",
  };

  const LS_KEYS = {
    name: "tetris.player",
    leaderboard: "tetris.leaderboard",
  };

  const PLAY_ICON  = "\u25B6";
  const PAUSE_ICON = "\u275A\u275A";

  // Each shape is a square matrix; cells with non-zero values are filled.
  const SHAPES = {
    I: [
      [0,0,0,0],
      [1,1,1,1],
      [0,0,0,0],
      [0,0,0,0],
    ],
    O: [
      [1,1],
      [1,1],
    ],
    T: [
      [0,1,0],
      [1,1,1],
      [0,0,0],
    ],
    S: [
      [0,1,1],
      [1,1,0],
      [0,0,0],
    ],
    Z: [
      [1,1,0],
      [0,1,1],
      [0,0,0],
    ],
    J: [
      [1,0,0],
      [1,1,1],
      [0,0,0],
    ],
    L: [
      [0,0,1],
      [1,1,1],
      [0,0,0],
    ],
  };
  const TYPES = ["I", "O", "T", "S", "Z", "J", "L"];

  // -------------------- DOM --------------------
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const nextCanvas = document.getElementById("nextCanvas");
  const nextCtx = nextCanvas.getContext("2d");

  const els = {
    scoreValue: document.getElementById("scoreValue"),
    levelValue: document.getElementById("levelValue"),
    linesValue: document.getElementById("linesValue"),
    playerName: document.getElementById("playerName"),
    changePlayerBtn: document.getElementById("changePlayerBtn"),

    overlayStart:  document.getElementById("overlayStart"),
    overlayPaused: document.getElementById("overlayPaused"),
    overlayOver:   document.getElementById("overlayOver"),
    overScore: document.getElementById("overScore"),
    overBest:  document.getElementById("overBest"),
    overTitle: document.getElementById("overTitle"),
    overMsg:   document.getElementById("overMsg"),
    playAgainBtn: document.getElementById("playAgainBtn"),

    leaderboardList: document.getElementById("leaderboardList"),
    resetScoresBtn: document.getElementById("resetScoresBtn"),

    nameModal: document.getElementById("nameModal"),
    nameForm:  document.getElementById("nameForm"),
    nameInput: document.getElementById("nameInput"),
    nameCancelBtn: document.getElementById("nameCancelBtn"),

    touchPause: document.getElementById("touchPause"),
    touchUp:    document.getElementById("touchUp"),
    touchDown:  document.getElementById("touchDown"),
    touchLeft:  document.getElementById("touchLeft"),
    touchRight: document.getElementById("touchRight"),
  };

  // -------------------- State --------------------
  /** @typedef {{type:string, matrix:number[][], x:number, y:number}} Piece */
  /** @typedef {"idle"|"playing"|"paused"|"over"} GameState */

  const state = {
    /** @type {GameState} */ status: "idle",
    board: /** @type {string[][]} */ (createBoard()),
    /** @type {Piece|null} */ piece: null,
    /** @type {string|null} */ nextType: null,
    /** @type {string[]} */ bag: [],
    score: 0,
    lines: 0,
    level: 1,
    tickMs: 1000 - 80,
    lastTick: 0,
    lastFrame: 0,
    flashUntil: 0,
    shake: 0,
    player: "",
    leaders: /** @type {{name:string, score:number, at:number}[]} */ ([]),
  };

  function createBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(""));
  }

  // -------------------- Audio (tiny synth) --------------------
  /** @type {AudioContext|null} */
  let audio = null;
  function ensureAudio() {
    if (!audio) {
      try { audio = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (_) { audio = null; }
    }
    if (audio && audio.state === "suspended") audio.resume();
  }
  function beep(freq = 660, dur = 0.08, type = "triangle", gain = 0.04) {
    if (!audio) return;
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  const sfx = {
    move()      { beep(280, 0.03, "square", 0.025); },
    rotate()    { beep(520, 0.05, "square", 0.03); },
    lock()      { beep(120, 0.10, "sawtooth", 0.05); },
    lineClear(n){
      const notes = [523, 659, 784, 1046];
      const gain = n === 4 ? 0.06 : 0.045;
      notes.slice(0, Math.min(4, n + 1)).forEach((f, i) => setTimeout(() => beep(f, 0.10, "triangle", gain), i * 60));
      if (n === 4) setTimeout(() => beep(1318, 0.18, "triangle", 0.06), 240);
    },
    levelUp()   { [659, 880, 1175].forEach((f, i) => setTimeout(() => beep(f, 0.10), i * 80)); },
    pause()     { beep(440, 0.05); },
    resume()    { beep(660, 0.05); },
    gameOver()  { [440, 330, 220, 165].forEach((f, i) => setTimeout(() => beep(f, 0.16, "sawtooth", 0.05), i * 110)); },
    high()      { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.09), i * 90)); },
  };

  // -------------------- Storage --------------------
  function loadPlayer() {
    try { return localStorage.getItem(LS_KEYS.name) || ""; }
    catch (_) { return ""; }
  }
  function savePlayer(name) {
    try { localStorage.setItem(LS_KEYS.name, name); } catch (_) {}
  }
  function loadLeadersLocal() {
    try {
      const raw = localStorage.getItem(LS_KEYS.leaderboard);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .filter(e => e && typeof e.score === "number" && typeof e.name === "string")
        .slice(0, MAX_LEADERS);
    } catch (_) { return []; }
  }
  function saveLeadersLocal(list) {
    try { localStorage.setItem(LS_KEYS.leaderboard, JSON.stringify(list.slice(0, MAX_LEADERS))); }
    catch (_) {}
  }
  function setLeaders(list) {
    state.leaders = (list || []).slice(0, MAX_LEADERS);
    saveLeadersLocal(state.leaders);
    renderLeaderboard();
  }

  // -------------------- 7-bag --------------------
  function refillBag() {
    const bag = TYPES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    state.bag.push(...bag);
  }
  function drawNextType() {
    if (state.bag.length === 0) refillBag();
    return state.bag.shift();
  }

  // -------------------- Pieces --------------------
  function makePiece(type) {
    const matrix = SHAPES[type].map(row => row.slice());
    const w = matrix[0].length;
    const x = Math.floor((COLS - w) / 2);
    return { type, matrix, x, y: 0 };
  }

  function rotateMatrixCW(m) {
    const n = m.length;
    const out = Array.from({ length: n }, () => Array(n).fill(0));
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) out[c][n - 1 - r] = m[r][c];
    }
    return out;
  }

  function collides(piece, board) {
    const { matrix, x, y } = piece;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const bx = x + c;
        const by = y + r;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && board[by][bx]) return true;
      }
    }
    return false;
  }

  function mergePiece(piece, board) {
    const { matrix, x, y, type } = piece;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c] && y + r >= 0) board[y + r][x + c] = type;
      }
    }
  }

  function tryMove(dx, dy) {
    if (!state.piece) return false;
    const trial = { ...state.piece, x: state.piece.x + dx, y: state.piece.y + dy };
    if (!collides(trial, state.board)) {
      state.piece = trial;
      return true;
    }
    return false;
  }

  function tryRotate() {
    if (!state.piece) return false;
    if (state.piece.type === "O") return false;
    const rotated = rotateMatrixCW(state.piece.matrix);
    const kicks = [0, -1, 1, -2, 2];
    for (const dx of kicks) {
      const trial = { ...state.piece, matrix: rotated, x: state.piece.x + dx };
      if (!collides(trial, state.board)) {
        state.piece = trial;
        return true;
      }
    }
    return false;
  }

  function ghostY(piece) {
    let g = piece.y;
    while (!collides({ ...piece, y: g + 1 }, state.board)) g++;
    return g;
  }

  function hardDrop() {
    if (!state.piece) return;
    const gy = ghostY(state.piece);
    state.piece.y = gy;
    lockPiece();
  }

  function softDrop() {
    if (!tryMove(0, 1)) lockPiece();
    state.lastTick = performance.now();
  }

  function lockPiece() {
    if (!state.piece) return;
    mergePiece(state.piece, state.board);
    sfx.lock();
    state.shake = 120;
    const cleared = clearLines();
    if (cleared > 0) {
      const gain = (LINE_SCORE[cleared] || 0) * (state.level + 1);
      state.score += gain;
      state.lines += cleared;
      sfx.lineClear(cleared);
      state.flashUntil = performance.now() + 220;
      bumpStat(els.scoreValue.parentElement);
      bumpStat(els.linesValue.parentElement);
      const newLevel = 1 + Math.floor(state.lines / LINES_PER_LEVEL);
      if (newLevel > state.level) {
        state.level = newLevel;
        state.tickMs = Math.max(50, 1000 - state.level * 80);
        sfx.levelUp();
        bumpStat(els.levelValue.parentElement);
      }
      updateHud();
    }
    spawnNext();
  }

  function clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (state.board[r].every(cell => cell)) {
        state.board.splice(r, 1);
        state.board.unshift(Array(COLS).fill(""));
        cleared++;
        r++;
      }
    }
    return cleared;
  }

  function spawnNext() {
    const t = state.nextType || drawNextType();
    state.nextType = drawNextType();
    const p = makePiece(t);
    if (collides(p, state.board)) {
      state.piece = p;
      endGame();
      return;
    }
    state.piece = p;
    drawNextPreview();
  }

  // -------------------- Game lifecycle --------------------
  function resetGame() {
    state.board = createBoard();
    state.bag.length = 0;
    state.nextType = null;
    state.score = 0;
    state.lines = 0;
    state.level = 1;
    state.tickMs = Math.max(50, 1000 - state.level * 80);
    state.shake = 0;
    state.flashUntil = 0;
    spawnNext();
    updateHud();
  }

  function startGame() {
    if (state.status === "playing") return;
    if (state.status === "over" || state.status === "idle") resetGame();
    state.status = "playing";
    state.lastTick = performance.now();
    hideAllOverlays();
    updateTouchPauseIcon();
  }

  function pauseGame() {
    if (state.status !== "playing") return;
    state.status = "paused";
    showOverlay("paused");
    sfx.pause();
    updateTouchPauseIcon();
  }
  function resumeGame() {
    if (state.status !== "paused") return;
    state.status = "playing";
    state.lastTick = performance.now();
    hideOverlay("paused");
    sfx.resume();
    updateTouchPauseIcon();
  }
  function togglePause() {
    if (state.status === "idle" || state.status === "over") startGame();
    else if (state.status === "playing") pauseGame();
    else if (state.status === "paused") resumeGame();
  }

  function endGame() {
    state.status = "over";
    state.shake = 320;
    sfx.gameOver();
    updateTouchPauseIcon();

    const topBefore = getTopScore();
    submitToLeaderboard(state.player, state.score);
    const topAfter = getTopScore();
    const isHigh = state.score > 0 && topAfter > topBefore && topAfter === state.score;
    if (isHigh) setTimeout(() => sfx.high(), 500);

    els.overScore.textContent = String(state.score);
    els.overBest.textContent = String(topAfter);
    els.overTitle.textContent = pickGameOverTitle(state.score, state.lines, isHigh);
    els.overMsg.innerHTML = isHigh
      ? `New high score! Press <span class="kbd">Space</span> or <span class="kbd">R</span> to play again.`
      : `Press <span class="kbd">Space</span> or <span class="kbd">R</span> to play again.`;
    showOverlay("over");
    renderLeaderboard();
  }

  function pickGameOverTitle(score, lines, isHigh) {
    if (isHigh)        return "New high score!";
    if (lines === 0)   return "Blocked out fast.";
    if (lines < 5)     return "A modest stack.";
    if (lines < 15)    return "Solid clearing.";
    if (lines < 30)    return "Now you're stacking!";
    if (lines < 60)    return "Tetris artist.";
    return "Legendary stacker.";
  }

  function bumpStat(node) {
    if (!node) return;
    node.classList.remove("stat--bump");
    void node.offsetWidth;
    node.classList.add("stat--bump");
  }

  // -------------------- Loop --------------------
  function loop(now) {
    state.lastFrame = now;

    if (state.status === "playing") {
      if (now - state.lastTick > 1500) state.lastTick = now;
      let safety = 4;
      while (state.status === "playing" && now - state.lastTick >= state.tickMs && safety-- > 0) {
        state.lastTick += state.tickMs;
        if (!tryMove(0, 1)) lockPiece();
      }
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - 16);
    draw(now);
    requestAnimationFrame(loop);
  }

  // -------------------- Rendering --------------------
  function cellSize() { return canvas.width / COLS; }

  function draw(now) {
    const w = canvas.width;
    const h = canvas.height;
    const cs = cellSize();

    let ox = 0, oy = 0;
    if (state.shake > 0) {
      const mag = Math.min(6, state.shake / 60);
      ox = (Math.random() - 0.5) * mag;
      oy = (Math.random() - 0.5) * mag;
    }

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.translate(ox, oy);

    ctx.fillStyle = COLORS.boardBg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) {
      const p = c * cs;
      ctx.moveTo(p + 0.5, 0);
      ctx.lineTo(p + 0.5, h);
    }
    for (let r = 1; r < ROWS; r++) {
      const p = r * cs;
      ctx.moveTo(0, p + 0.5);
      ctx.lineTo(w, p + 0.5);
    }
    ctx.stroke();

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = state.board[r][c];
        if (cell) drawBlock(ctx, c * cs, r * cs, cs, COLORS[cell]);
      }
    }

    if (state.piece && state.status !== "over") {
      const ghostYpos = ghostY(state.piece);
      drawPieceCells(ctx, state.piece.matrix, state.piece.x, ghostYpos, cs, null, true);
      drawPieceCells(ctx, state.piece.matrix, state.piece.x, state.piece.y, cs, COLORS[state.piece.type], false);
    }

    if (now < state.flashUntil) {
      const k = (state.flashUntil - now) / 220;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.12 * k})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }

  function drawPieceCells(c2d, matrix, px, py, cs, color, ghost) {
    for (let r = 0; r < matrix.length; r++) {
      for (let col = 0; col < matrix[r].length; col++) {
        if (!matrix[r][col]) continue;
        const x = (px + col) * cs;
        const y = (py + r) * cs;
        if (ghost) drawGhostBlock(c2d, x, y, cs);
        else drawBlock(c2d, x, y, cs, color);
      }
    }
  }

  function drawBlock(c2d, x, y, cs, color) {
    const pad = Math.max(1, cs * 0.06);
    c2d.fillStyle = color;
    c2d.fillRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2);

    c2d.fillStyle = "rgba(255, 255, 255, 0.22)";
    c2d.fillRect(x + pad, y + pad, cs - pad * 2, Math.max(1.5, cs * 0.12));
    c2d.fillRect(x + pad, y + pad, Math.max(1.5, cs * 0.12), cs - pad * 2);

    c2d.fillStyle = "rgba(0, 0, 0, 0.28)";
    c2d.fillRect(x + pad, y + cs - pad - Math.max(1.5, cs * 0.10), cs - pad * 2, Math.max(1.5, cs * 0.10));
    c2d.fillRect(x + cs - pad - Math.max(1.5, cs * 0.10), y + pad, Math.max(1.5, cs * 0.10), cs - pad * 2);
  }

  function drawGhostBlock(c2d, x, y, cs) {
    const pad = Math.max(1, cs * 0.06);
    c2d.fillStyle = COLORS.ghost;
    c2d.fillRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2);
    c2d.strokeStyle = "rgba(255,255,255,0.18)";
    c2d.lineWidth = 1;
    c2d.strokeRect(x + pad + 0.5, y + pad + 0.5, cs - pad * 2 - 1, cs - pad * 2 - 1);
  }

  function drawNextPreview() {
    if (!state.nextType) return;
    const m = SHAPES[state.nextType];
    const w = nextCanvas.width;
    const h = nextCanvas.height;
    nextCtx.clearRect(0, 0, w, h);
    nextCtx.fillStyle = "transparent";

    const size = m.length;
    const cs = Math.floor(Math.min(w, h) / 5);
    // Compute visible bounding box so we center the piece nicely.
    let minR = size, maxR = -1, minC = size, maxC = -1;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (m[r][c]) {
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
        }
      }
    }
    const pieceW = (maxC - minC + 1) * cs;
    const pieceH = (maxR - minR + 1) * cs;
    const ox = Math.floor((w - pieceW) / 2) - minC * cs;
    const oy = Math.floor((h - pieceH) / 2) - minR * cs;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (m[r][c]) drawBlock(nextCtx, ox + c * cs, oy + r * cs, cs, COLORS[state.nextType]);
      }
    }
  }

  // -------------------- HUD --------------------
  function updateHud() {
    els.scoreValue.textContent = String(state.score);
    els.levelValue.textContent = String(state.level);
    els.linesValue.textContent = String(state.lines);
    els.playerName.textContent = state.player || "Guest";
  }
  function getTopScore() {
    return state.leaders.length ? state.leaders[0].score : 0;
  }
  function showOverlay(which) {
    if (which === "start")  els.overlayStart.classList.remove("hidden");
    if (which === "paused") els.overlayPaused.classList.remove("hidden");
    if (which === "over")   els.overlayOver.classList.remove("hidden");
  }
  function hideOverlay(which) {
    if (which === "start")  els.overlayStart.classList.add("hidden");
    if (which === "paused") els.overlayPaused.classList.add("hidden");
    if (which === "over")   els.overlayOver.classList.add("hidden");
  }
  function hideAllOverlays() {
    hideOverlay("start"); hideOverlay("paused"); hideOverlay("over");
  }
  function updateTouchPauseIcon() {
    if (!els.touchPause) return;
    const playing = state.status === "playing";
    els.touchPause.textContent = playing ? PAUSE_ICON : PLAY_ICON;
    els.touchPause.setAttribute("aria-label", playing ? "Pause" : "Play");
  }

  // -------------------- Leaderboard --------------------
  function submitToLeaderboard(name, score) {
    if (!name || score <= 0) return;
    const merged = state.leaders.concat([{ name, score, at: Date.now() }]);
    merged.sort((a, b) => b.score - a.score || a.at - b.at);
    setLeaders(merged);
  }
  function renderLeaderboard() {
    const list = state.leaders;
    els.leaderboardList.innerHTML = "";
    if (!list.length) {
      const li = document.createElement("li");
      li.className = "leaderboard__empty";
      li.textContent = "No scores yet.";
      els.leaderboardList.appendChild(li);
      return;
    }
    list.forEach((entry, idx) => {
      const li = document.createElement("li");
      if (entry.name === state.player) li.classList.add("you");
      li.innerHTML = `
        <span class="lb-rank">${idx + 1}</span>
        <span class="lb-name">${escapeHtml(entry.name)}</span>
        <span class="lb-score">${entry.score}</span>
      `;
      els.leaderboardList.appendChild(li);
    });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // -------------------- Input --------------------
  function onMoveAttempt(action) {
    if (state.status === "idle" || state.status === "over") {
      startGame();
      return;
    }
    if (state.status !== "playing") return;
    if (action === "left")  { if (tryMove(-1, 0)) sfx.move(); }
    if (action === "right") { if (tryMove( 1, 0)) sfx.move(); }
    if (action === "down")  { softDrop(); sfx.move(); }
    if (action === "rotate"){ if (tryRotate()) sfx.rotate(); }
    if (action === "hard")  { hardDrop(); }
  }

  function onKeyDown(e) {
    if (document.activeElement === els.nameInput) return;
    const k = e.key;
    if (k === "ArrowLeft") {
      e.preventDefault(); ensureAudio(); onMoveAttempt("left");
    } else if (k === "ArrowRight") {
      e.preventDefault(); ensureAudio(); onMoveAttempt("right");
    } else if (k === "ArrowDown") {
      e.preventDefault(); ensureAudio(); onMoveAttempt("down");
    } else if (k === "ArrowUp") {
      e.preventDefault(); ensureAudio(); onMoveAttempt("rotate");
    } else if (k === " " || k === "Spacebar") {
      e.preventDefault(); ensureAudio();
      if (state.status === "idle" || state.status === "over") startGame();
      else if (state.status === "playing") hardDrop();
      else if (state.status === "paused") resumeGame();
    } else if (k === "p" || k === "P") {
      e.preventDefault(); ensureAudio(); togglePause();
    } else if (k === "r" || k === "R") {
      e.preventDefault(); ensureAudio();
      resetGame();
      state.status = "playing";
      state.lastTick = performance.now();
      hideAllOverlays();
      updateTouchPauseIcon();
    }
  }

  function bindTouchControls() {
    const map = [
      [els.touchLeft,  "left"],
      [els.touchRight, "right"],
      [els.touchUp,    "rotate"],
      [els.touchDown,  "hard"],
    ];
    for (const [btn, action] of map) {
      if (!btn) continue;
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        ensureAudio();
        onMoveAttempt(action);
      });
      btn.addEventListener("click", (e) => e.preventDefault());
    }
    if (els.touchPause) {
      els.touchPause.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        ensureAudio();
        togglePause();
        updateTouchPauseIcon();
      });
      els.touchPause.addEventListener("click", (e) => e.preventDefault());
    }
  }

  // -------------------- Name modal --------------------
  let wasPlayingBeforeModal = false;
  function openNameModal(canCancel) {
    els.nameModal.classList.remove("hidden");
    els.nameModal.setAttribute("aria-hidden", "false");
    els.nameInput.value = state.player || "";
    wasPlayingBeforeModal = state.status === "playing";
    if (wasPlayingBeforeModal) pauseGame();
    if (canCancel) els.nameCancelBtn.classList.remove("hidden");
    else els.nameCancelBtn.classList.add("hidden");
    setTimeout(() => { els.nameInput.focus(); els.nameInput.select(); }, 30);
  }
  function closeNameModal() {
    els.nameModal.classList.add("hidden");
    els.nameModal.setAttribute("aria-hidden", "true");
  }

  els.nameForm.addEventListener("submit", e => {
    e.preventDefault();
    const clean = els.nameInput.value.trim().replace(/\s+/g, " ").slice(0, 14);
    if (!clean) return;
    state.player = clean;
    savePlayer(clean);
    updateHud();
    renderLeaderboard();
    closeNameModal();
  });

  els.nameCancelBtn.addEventListener("click", () => {
    if (!state.player) return;
    closeNameModal();
  });

  els.changePlayerBtn.addEventListener("click", e => {
    e.stopPropagation();
    openNameModal(true);
  });

  els.playAgainBtn.addEventListener("click", () => startGame());

  els.resetScoresBtn.addEventListener("click", () => {
    if (confirm("Clear the Top 3 leaderboard?")) setLeaders([]);
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !els.nameModal.classList.contains("hidden") && state.player) {
      closeNameModal();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.status === "playing") pauseGame();
  });

  // -------------------- DPI / resize --------------------
  function fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // [fit-board] Desktop: fit the board into the stage's available area so it
    // never overflows and the footer stays visible. Touch keeps CSS sizing.
    if (!document.documentElement.classList.contains("is-touch")) {
      const _wrap = canvas.parentElement;
      const _stage = _wrap.parentElement;
      const _cs = getComputedStyle(_wrap);
      const _gap = parseFloat(getComputedStyle(_stage).rowGap) || 0;
      const _wr = _wrap.getBoundingClientRect();
      let _budget = _stage.clientHeight;
      for (const _sib of _stage.children) {
        if (_sib === _wrap) continue;
        const _r = _sib.getBoundingClientRect();
        if (_r.top >= _wr.bottom - 2) _budget -= _r.height + _gap;
      }
      const _availW = _wrap.clientWidth
        - parseFloat(_cs.paddingLeft) - parseFloat(_cs.paddingRight);
      const _availH = _budget
        - parseFloat(_cs.paddingTop) - parseFloat(_cs.paddingBottom)
        - parseFloat(_cs.borderTopWidth) - parseFloat(_cs.borderBottomWidth);
      if (_availW > 0 && _availH > 0) {
        let _cw = _availW, _ch = _cw * (600 / 300);
        if (_ch > _availH) { _ch = _availH; _cw = _ch * (300 / 600); }
        canvas.style.width = Math.floor(_cw) + "px";
        canvas.style.height = Math.floor(_ch) + "px";
      }
    } else {
      canvas.style.width = "";
      canvas.style.height = "";
    }
    const rect = canvas.getBoundingClientRect();
    // Snap canvas width so each cell is whole pixels.
    const targetW = Math.round(rect.width * dpr);
    const snappedW = Math.max(COLS * 14, Math.floor(targetW / COLS) * COLS);
    const snappedH = snappedW * (ROWS / COLS);
    if (canvas.width !== snappedW) {
      canvas.width = snappedW;
      canvas.height = snappedH;
    }
    // Next-piece preview also benefits from DPR scaling.
    const nrect = nextCanvas.getBoundingClientRect();
    const nT = Math.max(80, Math.round(Math.min(nrect.width, nrect.height) * dpr));
    if (nextCanvas.width !== nT) {
      nextCanvas.width = nT;
      nextCanvas.height = nT;
      drawNextPreview();
    }
  }
  window.addEventListener("resize", fitCanvas);

  // -------------------- Init --------------------
  function init() {
    document.addEventListener("keydown", onKeyDown);
    bindTouchControls();

    state.player = loadPlayer();

    fitCanvas();
    resetGame();
    drawNextPreview();

    state.leaders = loadLeadersLocal();
    renderLeaderboard();
    updateHud();
    updateTouchPauseIcon();

    showOverlay("start");

    if (!state.player) openNameModal(false);

    requestAnimationFrame(t => {
      state.lastFrame = t;
      loop(t);
    });
  }

  init();
})();
