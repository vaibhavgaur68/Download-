/* ──────────────────────────────────────────────────────────────────────────────
   PULSE — game.js
   One ring. One tap. No second chances.
────────────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // ── CANVAS SETUP ────────────────────────────────────────────────────────────

  const canvas = document.getElementById('canvas');
  const ctx    = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // ── RESPONSIVE MEASUREMENTS ─────────────────────────────────────────────────

  function shortSide()    { return Math.min(canvas.width, canvas.height); }
  function targetRadius() { return Math.min(shortSide() * 0.21, 105); }
  function spawnRadius()  { return shortSide() * 0.44; }

  const PERFECT_WIN  = 9;   // ±px around target radius = PERFECT
  const GOOD_WIN     = 20;  // ±px = GOOD
  const BASE_SPEED   = 105; // px / sec
  const MAX_SPEED    = 430;
  const SPEED_STEP   = 11;  // added px/sec per successful hit

  // ── AUDIO ENGINE ────────────────────────────────────────────────────────────

  let audioCtx = null;

  function ac() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, type, gainVal, attack, decay) {
    try {
      const ctx   = ac();
      const osc   = ctx.createOscillator();
      const gain  = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(gainVal, t + attack);
      gain.gain.exponentialRampToValueAtTime(0.001, t + attack + decay);
      osc.start(t);
      osc.stop(t + attack + decay + 0.05);
    } catch (_) {}
  }

  const SFX = {
    perfect() {
      tone(880, 'sine',     0.28, 0.008, 0.18);
      setTimeout(() => tone(1320, 'sine', 0.16, 0.008, 0.14), 55);
    },
    good()    { tone(660, 'sine',     0.22, 0.01,  0.18); },
    miss()    { tone(110, 'sawtooth', 0.35, 0.01,  0.25); },
    over()    {
      tone(220, 'sine', 0.28, 0.01, 0.22);
      setTimeout(() => tone(165, 'sine', 0.28, 0.01, 0.22), 220);
      setTimeout(() => tone(110, 'sine', 0.28, 0.01, 0.40), 440);
    },
  };

  // ── STATE ────────────────────────────────────────────────────────────────────

  let phase    = 'idle';  // idle | playing | gameover
  let score    = 0;
  let combo    = 0;
  let hitCount = 0;
  let speed    = BASE_SPEED;
  let highScore= parseInt(localStorage.getItem('pulse_hs') || '0');

  let ring     = null;   // { radius }
  let parts    = [];     // particles
  let feedbacks= [];     // { text, color, x, y, alpha, vy }

  let flashA   = 0;
  let flashCol = '#fff';
  let shakeX   = 0, shakeY = 0;
  let idleT    = 0;    // idle animation time

  // Speed level: 0–9 pips
  const SPEED_PIPS = 9;

  // ── UI REFS ──────────────────────────────────────────────────────────────────

  const hudEl         = document.getElementById('hud');
  const hudScoreEl    = document.getElementById('hud-score');
  const hudComboEl    = document.getElementById('hud-combo');
  const comboValEl    = document.getElementById('combo-val');
  const bestValEl     = document.getElementById('best-val');
  const startScreen   = document.getElementById('start-screen');
  const goScreen      = document.getElementById('gameover-screen');
  const finalScoreEl  = document.getElementById('final-score');
  const finalBestEl   = document.getElementById('final-best');
  const newHsBadge    = document.getElementById('new-hs-badge');

  // ── SPEED PIPS ───────────────────────────────────────────────────────────────

  const speedBar = document.createElement('div');
  speedBar.id = 'speed-bar';
  for (let i = 0; i < SPEED_PIPS; i++) {
    const pip = document.createElement('div');
    pip.className = 'speed-pip';
    speedBar.appendChild(pip);
  }
  document.body.appendChild(speedBar);

  function updatePips() {
    const level = Math.min(Math.floor((speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED) * SPEED_PIPS), SPEED_PIPS);
    [...speedBar.querySelectorAll('.speed-pip')].forEach((p, i) => {
      p.classList.toggle('active', i < level);
    });
  }

  // ── GAME CONTROL ─────────────────────────────────────────────────────────────

  function startGame() {
    phase    = 'playing';
    score    = 0;
    combo    = 0;
    hitCount = 0;
    speed    = BASE_SPEED;
    parts    = [];
    feedbacks= [];
    flashA   = 0;
    shakeX   = shakeY = 0;

    startScreen.style.display    = 'none';
    goScreen.className            = 'screen-hidden';
    hudEl.classList.remove('hidden');
    speedBar.classList.add('visible');

    bestValEl.textContent = highScore;
    updateHUD();
    updatePips();
    spawnRing();
  }

  function endGame() {
    phase = 'gameover';
    ring  = null;

    SFX.over();

    shakeX = 20; shakeY = 14;
    flashA = 0.55; flashCol = '#FF2D55';

    const newBest = score > highScore;
    if (newBest) {
      highScore = score;
      localStorage.setItem('pulse_hs', highScore);
    }

    finalScoreEl.textContent = score;
    finalBestEl.textContent  = highScore;
    newHsBadge.classList.toggle('hidden', !newBest);

    setTimeout(() => {
      goScreen.className = '';   // show with animation
    }, 650);
  }

  // ── RING ─────────────────────────────────────────────────────────────────────

  function spawnRing() {
    ring = { radius: spawnRadius() };
  }

  // ── TAP / HIT DETECTION ──────────────────────────────────────────────────────

  function onInput() {
    if (phase === 'idle') {
      startGame();
      return;
    }
    if (phase === 'gameover') return;
    if (!ring) return;

    const diff = Math.abs(ring.radius - targetRadius());

    if (diff <= PERFECT_WIN) {
      registerHit('PERFECT', '#00FFB2', 10, true);
    } else if (diff <= GOOD_WIN) {
      registerHit('GOOD', '#FFD166', 5, false);
    } else {
      registerMiss();
    }
  }

  function registerHit(label, color, basePoints, isPerfect) {
    if (isPerfect) {
      combo++;
    } else {
      combo = Math.max(0, Math.floor(combo * 0.4));
    }

    const multiplier = 1 + Math.floor(combo / 3);
    const pts        = basePoints * multiplier;
    score  += pts;
    hitCount++;
    speed   = Math.min(BASE_SPEED + hitCount * SPEED_STEP, MAX_SPEED);

    // Effects
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    spawnBurst(cx, cy, color, isPerfect ? 30 : 14);
    pushFeedback(label, color, cx, cy - targetRadius() - 28);
    flashA   = isPerfect ? 0.12 : 0.06;
    flashCol = color;

    if (isPerfect) SFX.perfect(); else SFX.good();

    ring = null;
    updateHUD();
    updatePips();
    spawnRing();

    // Score bump animation
    hudScoreEl.classList.remove('bump');
    void hudScoreEl.offsetWidth;
    hudScoreEl.classList.add('bump');
    setTimeout(() => hudScoreEl.classList.remove('bump'), 120);
  }

  function registerMiss() {
    pushFeedback('MISS', '#FF2D55', canvas.width / 2, canvas.height / 2 - targetRadius() - 28);
    SFX.miss();
    endGame();
  }

  // ── PARTICLES ────────────────────────────────────────────────────────────────

  function spawnBurst(cx, cy, color, count) {
    const tr = targetRadius();
    for (let i = 0; i < count; i++) {
      const angle   = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const spd     = 3.5 + Math.random() * 5;
      const fromEdge = Math.random() < 0.6;
      parts.push({
        x:     fromEdge ? cx + Math.cos(angle) * tr : cx,
        y:     fromEdge ? cy + Math.sin(angle) * tr : cy,
        vx:    Math.cos(angle) * spd,
        vy:    Math.sin(angle) * spd,
        life:  1,
        decay: 0.017 + Math.random() * 0.022,
        r:     1.2 + Math.random() * 2.8,
        color,
      });
    }
  }

  function spawnBurstAt(cx, cy, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 1.5 + Math.random() * 3;
      parts.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 1,
        decay: 0.025 + Math.random() * 0.025,
        r: 1 + Math.random() * 2,
        color,
      });
    }
  }

  // ── FLOATING FEEDBACK TEXT ───────────────────────────────────────────────────

  function pushFeedback(text, color, x, y) {
    feedbacks.push({ text, color, x, y, alpha: 1, vy: -0.6 });
  }

  // ── HUD ──────────────────────────────────────────────────────────────────────

  function updateHUD() {
    hudScoreEl.textContent = score;
    bestValEl.textContent  = highScore;

    if (combo >= 2) {
      comboValEl.textContent = combo;
      hudComboEl.classList.remove('hidden');
    } else {
      hudComboEl.classList.add('hidden');
    }
  }

  // ── UPDATE ───────────────────────────────────────────────────────────────────

  function update(dt) {
    // Always decay effects
    if (flashA > 0) flashA = Math.max(0, flashA - dt * 3);
    shakeX *= 0.74; shakeY *= 0.74;
    if (Math.abs(shakeX) < 0.05) shakeX = 0;
    if (Math.abs(shakeY) < 0.05) shakeY = 0;

    // Particles
    parts = parts.filter(p => {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= p.decay;
      return p.life > 0;
    });

    // Feedback text
    feedbacks = feedbacks.filter(f => {
      f.y     += f.vy;
      f.alpha -= dt * 1.4;
      return f.alpha > 0;
    });

    if (phase === 'idle') {
      idleT += dt;
      return;
    }

    if (phase !== 'playing' || !ring) return;

    // Shrink ring
    ring.radius -= speed * dt;

    // Auto-miss: ring passed through target zone completely
    if (ring.radius < targetRadius() - GOOD_WIN - 6) {
      registerMiss();
      endGame();
    }
  }

  // ── DRAW HELPERS ─────────────────────────────────────────────────────────────

  function circle(x, y, r, strokeColor, lineWidth, blur) {
    ctx.save();
    ctx.strokeStyle  = strokeColor;
    ctx.lineWidth    = lineWidth;
    ctx.shadowColor  = strokeColor;
    ctx.shadowBlur   = blur;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(r, 0), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function dot(x, y, r, color, blur) {
    ctx.save();
    ctx.fillStyle   = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = blur;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── DRAW IDLE ────────────────────────────────────────────────────────────────

  function drawIdle(cx, cy) {
    const tr   = targetRadius();
    const beat = (Math.sin(idleT * Math.PI * 1.2) + 1) / 2; // 0–1

    // Ambient orbiting ring
    const orbitR = tr + 50 + beat * 40;
    const orbitA = 0.08 + beat * 0.12;
    circle(cx, cy, orbitR, `rgba(0,255,178,${orbitA})`, 1, 6);

    // Second ambient ring, offset phase
    const beat2  = (Math.sin(idleT * Math.PI * 1.2 + Math.PI) + 1) / 2;
    const orbitR2 = tr + 50 + beat2 * 40;
    circle(cx, cy, orbitR2, `rgba(255,255,255,${0.05 + beat2 * 0.06})`, 1, 4);
  }

  // ── DRAW PLAYING ─────────────────────────────────────────────────────────────

  function drawRing(cx, cy) {
    if (!ring) return;
    const tr   = targetRadius();
    const diff = ring.radius - tr;
    const absd = Math.abs(diff);
    const prox = Math.max(0, 1 - absd / 80);

    let r, g, b;
    if (absd <= PERFECT_WIN) {
      [r, g, b] = [0, 255, 178];
    } else if (absd <= GOOD_WIN) {
      const t = (absd - PERFECT_WIN) / (GOOD_WIN - PERFECT_WIN);
      r = Math.floor(t * 255);
      g = Math.floor(255 - t * 55);
      b = Math.floor((1 - t) * 178);
    } else {
      r = 255; g = 255; b = 255;
    }

    const alpha   = 0.28 + prox * 0.72;
    const blur    = 4 + prox * 22;
    const lw      = 1.5 + prox * 2.5;

    circle(cx, cy, ring.radius, `rgba(${r},${g},${b},${alpha})`, lw, blur);
  }

  // ── DRAW TARGET ──────────────────────────────────────────────────────────────

  function drawTarget(cx, cy) {
    const tr = targetRadius();

    // Outer glow ring (very subtle)
    circle(cx, cy, tr, 'rgba(255,255,255,0.06)', 8, 0);

    // Main target ring
    circle(cx, cy, tr, 'rgba(255,255,255,0.32)', 1.5, 10);

    // Perfect-zone tick marks at 4 compass points
    const tickOuter = tr + PERFECT_WIN + 3;
    const tickInner = tr - PERFECT_WIN - 3;
    const angles    = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = 'rgba(255,255,255,0.15)';
    ctx.shadowBlur  = 5;
    angles.forEach(a => {
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * tickInner, cy + Math.sin(a) * tickInner);
      ctx.lineTo(cx + Math.cos(a) * tickOuter, cy + Math.sin(a) * tickOuter);
      ctx.stroke();
    });
    ctx.restore();
  }

  // ── DRAW PARTICLES + FEEDBACK ────────────────────────────────────────────────

  function drawParticles() {
    parts.forEach(p => {
      ctx.save();
      ctx.globalAlpha  = Math.pow(p.life, 1.4);
      ctx.fillStyle    = p.color;
      ctx.shadowColor  = p.color;
      ctx.shadowBlur   = 8;
      ctx.beginPath();
      ctx.arc(p.x + shakeX, p.y + shakeY, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawFeedbacks() {
    feedbacks.forEach(f => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.alpha);
      ctx.fillStyle   = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur  = 18;
      ctx.font        = '700 18px "IBM Plex Mono", monospace';
      ctx.textAlign   = 'center';
      ctx.letterSpacing = '0.14em';
      ctx.fillText(f.text, f.x + shakeX, f.y + shakeY);
      ctx.restore();
    });
  }

  // ── DRAW SUBTLE GRID ─────────────────────────────────────────────────────────

  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth   = 1;
    const step = 64;
    for (let x = 0; x < canvas.width; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    ctx.restore();
  }

  // ── DRAW SPEED ARC ───────────────────────────────────────────────────────────

  function drawSpeedArc(cx, cy) {
    if (phase !== 'playing') return;
    const frac = (speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
    if (frac <= 0) return;

    const tr    = targetRadius();
    const arcR  = tr + 36;
    const start = -Math.PI / 2;
    const end   = start + frac * Math.PI * 2;

    ctx.save();
    ctx.strokeStyle = `rgba(0,255,178,${0.12 + frac * 0.18})`;
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = '#00FFB2';
    ctx.shadowBlur  = 6;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, arcR, start, end);
    ctx.stroke();
    ctx.restore();
  }

  // ── MAIN DRAW ────────────────────────────────────────────────────────────────

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();

    const cx = canvas.width  / 2 + shakeX;
    const cy = canvas.height / 2 + shakeY;

    if (phase === 'idle')    drawIdle(cx, cy);
    if (phase === 'playing') drawSpeedArc(cx, cy);

    drawTarget(cx, cy);
    drawRing(cx, cy);
    drawParticles();

    // Center dot
    dot(cx, cy, 3, 'rgba(255,255,255,0.85)', 12);

    drawFeedbacks();

    // Screen flash overlay
    if (flashA > 0) {
      ctx.save();
      ctx.globalAlpha = flashA;
      ctx.fillStyle   = flashCol;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
  }

  // ── GAME LOOP ────────────────────────────────────────────────────────────────

  let lastT = 0;

  function loop(ts) {
    const dt = Math.min((ts - lastT) / 1000, 0.05);
    lastT = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  // ── EVENTS ───────────────────────────────────────────────────────────────────

  function handleInput() { onInput(); }

  canvas.addEventListener('click',      handleInput);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); handleInput(); }, { passive: false });

  document.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); handleInput(); }
  });

  document.getElementById('start-btn').addEventListener('click', e => {
    e.stopPropagation(); startGame();
  });

  document.getElementById('retry-btn').addEventListener('click', e => {
    e.stopPropagation(); startGame();
  });

  // ── INIT ──────────────────────────────────────────────────────────────────────

  bestValEl.textContent = highScore;

})();
