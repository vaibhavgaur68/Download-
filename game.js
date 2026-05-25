/* ──────────────────────────────────────────────────────────────────────────────
   PULSE — game.js  (v2: 7 levels · 3 lives · level ceremonies)
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

  // ── LEVEL DEFINITIONS ───────────────────────────────────────────────────────
  //
  //  accent     – hex color driving all glows / pips / UI
  //  name       – display name
  //  subtitle   – flavor text shown in ceremony
  //  hitsNeeded – hits to complete this level (progress-arc fills over these)
  //  perfectWin – ±px for PERFECT
  //  goodWin    – ±px for GOOD
  //  baseSpeed  – ring px/sec at start of level
  //  maxSpeed   – cap for this level
  //  speedStep  – px/sec added per hit
  //  behavior   – 'normal' | 'wave' | 'stutter' | 'ghost' | 'near-invisible'
  //  bgTint     – subtle canvas background shift [r,g,b,a]

  const LEVELS = [
    {
      accent: '#00FFB2', name: 'VOID',    subtitle: 'nothing but static.',
      hitsNeeded: 8,
      perfectWin: 9,  goodWin: 20,
      baseSpeed: 105, maxSpeed: 180, speedStep: 9,
      behavior: 'normal',
      bgTint: [0, 0, 0, 1],
    },
    {
      accent: '#00D4FF', name: 'PULSE',   subtitle: 'feel the rhythm.',
      hitsNeeded: 10,
      perfectWin: 9,  goodWin: 18,
      baseSpeed: 130, maxSpeed: 220, speedStep: 10,
      behavior: 'wave',
      bgTint: [0, 5, 12, 1],
    },
    {
      accent: '#FFD166', name: 'HEAT',    subtitle: 'temperature rising.',
      hitsNeeded: 12,
      perfectWin: 8,  goodWin: 17,
      baseSpeed: 155, maxSpeed: 260, speedStep: 11,
      behavior: 'wave',
      bgTint: [8, 4, 0, 1],
    },
    {
      accent: '#FF6B35', name: 'CRIMSON', subtitle: 'blood in the signal.',
      hitsNeeded: 14,
      perfectWin: 7,  goodWin: 16,
      baseSpeed: 180, maxSpeed: 300, speedStep: 12,
      behavior: 'stutter',
      bgTint: [10, 2, 0, 1],
    },
    {
      accent: '#B57BFF', name: 'ETHER',   subtitle: 'phase through reality.',
      hitsNeeded: 16,
      perfectWin: 7,  goodWin: 15,
      baseSpeed: 210, maxSpeed: 340, speedStep: 12,
      behavior: 'ghost',
      bgTint: [5, 0, 12, 1],
    },
    {
      accent: '#FF2D55', name: 'ABYSS',   subtitle: 'stare long enough.',
      hitsNeeded: 18,
      perfectWin: 6,  goodWin: 13,
      baseSpeed: 250, maxSpeed: 390, speedStep: 13,
      behavior: 'stutter',
      bgTint: [10, 0, 3, 1],
    },
    {
      accent: '#FFFFFF', name: 'GHOST',   subtitle: 'you are the signal.',
      hitsNeeded: 999,  // final level, no ceiling
      perfectWin: 5,  goodWin: 12,
      baseSpeed: 290, maxSpeed: 460, speedStep: 14,
      behavior: 'near-invisible',
      bgTint: [8, 8, 8, 1],
    },
  ];

  // ── AUDIO ENGINE ────────────────────────────────────────────────────────────

  let audioCtx = null;

  function ac() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, type, gainVal, attack, decay) {
    try {
      const a   = ac();
      const osc = a.createOscillator();
      const g   = a.createGain();
      osc.connect(g); g.connect(a.destination);
      osc.type = type; osc.frequency.value = freq;
      const t = a.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gainVal, t + attack);
      g.gain.exponentialRampToValueAtTime(0.001, t + attack + decay);
      osc.start(t); osc.stop(t + attack + decay + 0.05);
    } catch (_) {}
  }

  const SFX = {
    perfect() {
      tone(880, 'sine',     0.28, 0.008, 0.18);
      setTimeout(() => tone(1320, 'sine', 0.16, 0.008, 0.14), 55);
    },
    good()   { tone(660, 'sine',     0.22, 0.01,  0.18); },
    miss()   { tone(140, 'sawtooth', 0.30, 0.01,  0.22); },
    loseLife() {
      tone(220, 'sawtooth', 0.35, 0.01, 0.25);
      setTimeout(() => tone(165, 'sine', 0.2, 0.01, 0.2), 180);
    },
    over() {
      tone(220, 'sine', 0.28, 0.01, 0.22);
      setTimeout(() => tone(165, 'sine', 0.28, 0.01, 0.22), 220);
      setTimeout(() => tone(110, 'sine', 0.28, 0.01, 0.40), 440);
    },
    levelUp() {
      tone(440,  'sine', 0.20, 0.01, 0.12);
      setTimeout(() => tone(550, 'sine', 0.18, 0.01, 0.12), 100);
      setTimeout(() => tone(660, 'sine', 0.22, 0.01, 0.22), 200);
      setTimeout(() => tone(880, 'sine', 0.16, 0.01, 0.30), 340);
    },
    gainLife() { tone(990, 'sine', 0.18, 0.008, 0.2); },
  };

  // ── STATE ────────────────────────────────────────────────────────────────────

  let phase      = 'idle';   // idle | playing | ceremony | gameover
  let score      = 0;
  let combo      = 0;
  let hitCount   = 0;          // total hits this game
  let levelHits  = 0;          // hits within current level
  let levelIdx   = 0;
  let lives      = 3;
  let perfectStreak = 0;
  let speed      = LEVELS[0].baseSpeed;
  let highScore  = parseInt(localStorage.getItem('pulse_hs') || '0');

  let ring       = null;   // { radius, waveOffset, stutterTimer, opacity }
  let parts      = [];
  let feedbacks  = [];

  let flashA     = 0;
  let flashCol   = '#fff';
  let shakeX     = 0, shakeY = 0;
  let idleT      = 0;

  // Ceremony state
  let ceremony   = null;  // { t, level } — null when inactive
  let ceremonyInputConsumed = false;

  // Stutter / wave state
  let waveT      = 0;
  let stutterT   = 0;
  let stutterPaused = false;

  const SPEED_PIPS = 9;

  // ── ACCENT HELPER ────────────────────────────────────────────────────────────

  function currentLevel() { return LEVELS[Math.min(levelIdx, LEVELS.length - 1)]; }

  function setAccent(hex) {
    document.documentElement.style.setProperty('--accent', hex);
  }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return [r, g, b];
  }

  // ── UI REFS ──────────────────────────────────────────────────────────────────

  const hudEl        = document.getElementById('hud');
  const hudScoreEl   = document.getElementById('hud-score');
  const hudComboEl   = document.getElementById('hud-combo');
  const comboValEl   = document.getElementById('combo-val');
  const bestValEl    = document.getElementById('best-val');
  const startScreen  = document.getElementById('start-screen');
  const goScreen     = document.getElementById('gameover-screen');
  const finalScoreEl = document.getElementById('final-score');
  const finalBestEl  = document.getElementById('final-best');
  const finalLevelEl = document.getElementById('final-level');
  const newHsBadge   = document.getElementById('new-hs-badge');
  const livesHudEl   = document.getElementById('lives-hud');
  const levelHudEl   = document.getElementById('level-hud');
  const levelNameHud = document.getElementById('level-name-hud');

  const lifePips = [
    document.getElementById('life-0'),
    document.getElementById('life-1'),
    document.getElementById('life-2'),
  ];

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
    const lv   = currentLevel();
    const frac = Math.min((speed - lv.baseSpeed) / Math.max(lv.maxSpeed - lv.baseSpeed, 1), 1);
    const level = Math.round(frac * SPEED_PIPS);
    [...speedBar.querySelectorAll('.speed-pip')].forEach((p, i) => {
      p.classList.toggle('active', i < level);
    });
  }

  function updateLivesUI() {
    lifePips.forEach((pip, i) => {
      pip.classList.toggle('lost', i >= lives);
    });
  }

  function updateLevelHud() {
    const lv = currentLevel();
    levelNameHud.textContent = lv.name;
    // accent already set via setAccent
  }

  // ── GAME CONTROL ─────────────────────────────────────────────────────────────

  function startGame() {
    phase         = 'playing';
    score         = 0;
    combo         = 0;
    hitCount      = 0;
    levelHits     = 0;
    levelIdx      = 0;
    lives         = 3;
    perfectStreak = 0;
    parts         = [];
    feedbacks     = [];
    flashA        = 0;
    shakeX = shakeY = 0;
    waveT  = 0; stutterT = 0; stutterPaused = false;
    ceremony      = null;

    const lv = currentLevel();
    speed = lv.baseSpeed;
    setAccent(lv.accent);

    startScreen.style.display = 'none';
    goScreen.className         = 'screen-hidden';
    hudEl.classList.remove('hidden');
    livesHudEl.classList.remove('hidden');
    levelHudEl.classList.remove('hidden');
    speedBar.classList.add('visible');

    bestValEl.textContent = highScore;
    updateHUD();
    updatePips();
    updateLivesUI();
    updateLevelHud();
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
    finalLevelEl.textContent = currentLevel().name;
    finalLevelEl.style.color = currentLevel().accent;
    finalLevelEl.style.textShadow = `0 0 20px ${currentLevel().accent}`;
    newHsBadge.classList.toggle('hidden', !newBest);

    livesHudEl.classList.add('hidden');
    levelHudEl.classList.add('hidden');
    speedBar.classList.remove('visible');

    setTimeout(() => {
      goScreen.className = '';
    }, 650);
  }

  // ── LEVEL UP ────────────────────────────────────────────────────────────────

  function triggerLevelUp() {
    levelIdx  = Math.min(levelIdx + 1, LEVELS.length - 1);
    levelHits = 0;

    const lv = LEVELS[levelIdx];
    speed = lv.baseSpeed;   // reset speed to level base

    setAccent(lv.accent);
    updateLevelHud();
    updatePips();

    SFX.levelUp();

    // Big flash in level color
    const [r, g, b] = hexToRgb(lv.accent);
    flashA   = 0.22;
    flashCol = lv.accent;
    shakeX   = 6; shakeY = 4;

    // Spawn big particle burst
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    spawnLevelBurst(cx, cy, lv.accent);

    // Enter ceremony phase
    ceremony = { t: 0, level: lv };
    phase    = 'ceremony';
    ring     = null;
    ceremonyInputConsumed = false;
  }

  function endCeremony() {
    ceremony = null;
    phase    = 'playing';
    waveT    = 0; stutterT = 0; stutterPaused = false;
    spawnRing();
  }

  // ── RING SPAWN ───────────────────────────────────────────────────────────────

  function spawnRing() {
    ring = {
      radius:       spawnRadius(),
      waveOffset:   Math.random() * Math.PI * 2,
      stutterTimer: 0,
      opacity:      1,
    };
  }

  // ── TAP / HIT DETECTION ──────────────────────────────────────────────────────

  function onInput() {
    if (phase === 'idle') {
      startGame();
      return;
    }
    if (phase === 'gameover') return;
    if (phase === 'ceremony') {
      // Skip ceremony on tap after brief delay
      if (ceremony && ceremony.t > 0.4 && !ceremonyInputConsumed) {
        ceremonyInputConsumed = true;
        endCeremony();
      }
      return;
    }
    if (!ring) return;

    const lv   = currentLevel();
    const diff = Math.abs(ring.radius - targetRadius());

    if (diff <= lv.perfectWin) {
      registerHit('PERFECT', lv.accent, 10, true);
    } else if (diff <= lv.goodWin) {
      registerHit('GOOD', '#FFD166', 5, false);
    } else {
      registerMiss();
    }
  }

  function registerHit(label, color, basePoints, isPerfect) {
    if (isPerfect) {
      combo++;
      perfectStreak++;
    } else {
      combo         = Math.max(0, Math.floor(combo * 0.4));
      perfectStreak = 0;
    }

    const multiplier = 1 + Math.floor(combo / 3);
    const pts        = basePoints * multiplier;
    score    += pts;
    hitCount++;
    levelHits++;

    const lv  = currentLevel();
    speed = Math.min(lv.baseSpeed + (levelHits * lv.speedStep * 0.5) + (hitCount * lv.speedStep * 0.5), lv.maxSpeed);

    // Life bonus: 5-perfect streak
    if (perfectStreak > 0 && perfectStreak % 5 === 0 && lives < 3) {
      lives++;
      updateLivesUI();
      lifePips[lives - 1].classList.add('gained');
      setTimeout(() => lifePips[lives - 1]?.classList.remove('gained'), 500);
      pushFeedback('♥ LIFE', '#FF2D55', canvas.width / 2, canvas.height / 2 - targetRadius() - 50);
      SFX.gainLife();
    }

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

    hudScoreEl.classList.remove('bump');
    void hudScoreEl.offsetWidth;
    hudScoreEl.classList.add('bump');
    setTimeout(() => hudScoreEl.classList.remove('bump'), 120);

    // Check level completion
    if (levelHits >= lv.hitsNeeded && levelIdx < LEVELS.length - 1) {
      triggerLevelUp();
    } else {
      spawnRing();
    }
  }

  function registerMiss() {
    lives--;
    updateLivesUI();

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    pushFeedback('MISS', '#FF2D55', cx, cy - targetRadius() - 28);

    perfectStreak = 0;
    combo         = 0;
    updateHUD();

    if (lives <= 0) {
      SFX.miss();
      endGame();
    } else {
      SFX.loseLife();
      shakeX = 12; shakeY = 8;
      flashA = 0.18; flashCol = '#FF2D55';
      ring   = null;
      spawnRing();
    }
  }

  // ── PARTICLES ────────────────────────────────────────────────────────────────

  function spawnBurst(cx, cy, color, count) {
    const tr = targetRadius();
    for (let i = 0; i < count; i++) {
      const angle    = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const spd      = 3.5 + Math.random() * 5;
      const fromEdge = Math.random() < 0.6;
      parts.push({
        x: fromEdge ? cx + Math.cos(angle) * tr : cx,
        y: fromEdge ? cy + Math.sin(angle) * tr : cy,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 1,
        decay: 0.017 + Math.random() * 0.022,
        r: 1.2 + Math.random() * 2.8,
        color,
      });
    }
  }

  function spawnLevelBurst(cx, cy, color) {
    const tr = targetRadius();
    const count = 60;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const spd   = 2 + Math.random() * 7;
      const layer = Math.random();
      parts.push({
        x: cx + Math.cos(angle) * tr * (0.4 + layer * 0.7),
        y: cy + Math.sin(angle) * tr * (0.4 + layer * 0.7),
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 1,
        decay: 0.008 + Math.random() * 0.014,
        r: 1.5 + Math.random() * 3.5,
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
    if (flashA > 0) flashA = Math.max(0, flashA - dt * 3);
    shakeX *= 0.74; shakeY *= 0.74;
    if (Math.abs(shakeX) < 0.05) shakeX = 0;
    if (Math.abs(shakeY) < 0.05) shakeY = 0;

    parts = parts.filter(p => {
      p.x  += p.vx; p.y  += p.vy;
      p.vx *= 0.92; p.vy *= 0.92;
      p.life -= p.decay;
      return p.life > 0;
    });

    feedbacks = feedbacks.filter(f => {
      f.y    += f.vy;
      f.alpha -= dt * 1.4;
      return f.alpha > 0;
    });

    if (phase === 'idle') {
      idleT += dt;
      return;
    }

    // Ceremony phase: just tick timer
    if (phase === 'ceremony') {
      ceremony.t += dt;
      if (ceremony.t >= 2.4) endCeremony();  // auto-advance after 2.4 s
      return;
    }

    if (phase !== 'playing' || !ring) return;

    const lv = currentLevel();
    waveT    += dt;
    stutterT += dt;

    // ── Ring behavior per level ──────────────────────────────────────────────

    let effectiveSpeed = speed;

    switch (lv.behavior) {
      case 'wave': {
        // Speed oscillates ±25%
        const wave = Math.sin(waveT * 3.5 + ring.waveOffset);
        effectiveSpeed = speed * (1 + wave * 0.25);
        break;
      }
      case 'stutter': {
        // Briefly freeze then lurch
        if (!stutterPaused) {
          if (stutterT > 0.28 + Math.random() * 0.15) {
            stutterPaused = true;
            stutterT      = 0;
          }
        } else {
          effectiveSpeed = 0;
          if (stutterT > 0.10) {
            stutterPaused = false;
            stutterT      = 0;
            effectiveSpeed = speed * 2.2;  // lurch
          }
        }
        break;
      }
      case 'ghost': {
        // Opacity pulses — ring fades in and out
        ring.opacity = 0.35 + 0.65 * Math.abs(Math.sin(waveT * 1.8 + ring.waveOffset));
        break;
      }
      case 'near-invisible': {
        // Very low base opacity, brief ghost-flashes
        const t = waveT * 2.1 + ring.waveOffset;
        ring.opacity = 0.12 + 0.25 * Math.max(0, Math.sin(t));
        break;
      }
      default: break;
    }

    ring.radius -= effectiveSpeed * dt;

    // Auto-miss: passed through target zone completely
    const lv2 = currentLevel();
    if (ring.radius < targetRadius() - lv2.goodWin - 6) {
      registerMiss();
    }
  }

  // ── DRAW HELPERS ─────────────────────────────────────────────────────────────

  function circle(x, y, r, strokeColor, lineWidth, blur) {
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth   = lineWidth;
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur  = blur;
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
    const beat = (Math.sin(idleT * Math.PI * 1.2) + 1) / 2;
    const col  = '#00FFB2';

    const orbitR = tr + 50 + beat * 40;
    const orbitA = 0.08 + beat * 0.12;
    circle(cx, cy, orbitR, `rgba(0,255,178,${orbitA})`, 1, 6);

    const beat2  = (Math.sin(idleT * Math.PI * 1.2 + Math.PI) + 1) / 2;
    const orbitR2 = tr + 50 + beat2 * 40;
    circle(cx, cy, orbitR2, `rgba(255,255,255,${0.05 + beat2 * 0.06})`, 1, 4);
  }

  // ── DRAW RING ────────────────────────────────────────────────────────────────

  function drawRing(cx, cy) {
    if (!ring) return;
    const lv   = currentLevel();
    const tr   = targetRadius();
    const diff = ring.radius - tr;
    const absd = Math.abs(diff);
    const prox = Math.max(0, 1 - absd / 80);

    const [ar, ag, ab] = hexToRgb(lv.accent);

    let r, g, b;
    if (absd <= lv.perfectWin) {
      [r, g, b] = [ar, ag, ab];
    } else if (absd <= lv.goodWin) {
      const t = (absd - lv.perfectWin) / (lv.goodWin - lv.perfectWin);
      r = Math.floor(ar + t * (255 - ar));
      g = Math.floor(ag + t * (209 - ag));
      b = Math.floor(ab + t * (102 - ab));
    } else {
      r = 255; g = 255; b = 255;
    }

    const baseAlpha = ring.opacity !== undefined ? ring.opacity : 1;
    const alpha = baseAlpha * (0.28 + prox * 0.72);
    const blur  = 4 + prox * 22;
    const lw    = 1.5 + prox * 2.5;

    circle(cx, cy, ring.radius, `rgba(${r},${g},${b},${alpha})`, lw, blur);
  }

  // ── DRAW TARGET ──────────────────────────────────────────────────────────────

  function drawTarget(cx, cy) {
    const lv = currentLevel();
    const tr = targetRadius();

    circle(cx, cy, tr, 'rgba(255,255,255,0.06)', 8, 0);
    circle(cx, cy, tr, 'rgba(255,255,255,0.32)', 1.5, 10);

    const tickOuter = tr + lv.perfectWin + 3;
    const tickInner = tr - lv.perfectWin - 3;
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

  // ── DRAW PARTICLES ───────────────────────────────────────────────────────────

  function drawParticles() {
    parts.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.pow(p.life, 1.4);
      ctx.fillStyle   = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 8;
      ctx.beginPath();
      ctx.arc(p.x + shakeX, p.y + shakeY, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawFeedbacks() {
    feedbacks.forEach(f => {
      ctx.save();
      ctx.globalAlpha   = Math.max(0, f.alpha);
      ctx.fillStyle     = f.color;
      ctx.shadowColor   = f.color;
      ctx.shadowBlur    = 18;
      ctx.font          = '700 18px "IBM Plex Mono", monospace';
      ctx.textAlign     = 'center';
      ctx.letterSpacing = '0.14em';
      ctx.fillText(f.text, f.x + shakeX, f.y + shakeY);
      ctx.restore();
    });
  }

  // ── DRAW GRID ────────────────────────────────────────────────────────────────

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

  // ── DRAW LEVEL PROGRESS ARC ──────────────────────────────────────────────────

  function drawProgressArc(cx, cy) {
    if (phase !== 'playing') return;
    const lv = currentLevel();
    if (lv.hitsNeeded >= 999) return;  // final level — no cap to show

    const frac  = Math.min(levelHits / lv.hitsNeeded, 1);
    const tr    = targetRadius();
    const arcR  = tr - 18;
    const start = -Math.PI / 2;
    const end   = start + frac * Math.PI * 2;
    const [r, g, b] = hexToRgb(lv.accent);

    ctx.save();
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.10 + frac * 0.22})`;
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = lv.accent;
    ctx.shadowBlur  = 5;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, arcR, start, end);
    ctx.stroke();
    ctx.restore();
  }

  // ── DRAW SPEED ARC ───────────────────────────────────────────────────────────

  function drawSpeedArc(cx, cy) {
    if (phase !== 'playing') return;
    const lv   = currentLevel();
    const frac = Math.min((speed - lv.baseSpeed) / Math.max(lv.maxSpeed - lv.baseSpeed, 1), 1);
    if (frac <= 0) return;

    const tr    = targetRadius();
    const arcR  = tr + 36;
    const start = -Math.PI / 2;
    const end   = start + frac * Math.PI * 2;
    const [r, g, b] = hexToRgb(lv.accent);

    ctx.save();
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.12 + frac * 0.18})`;
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = lv.accent;
    ctx.shadowBlur  = 6;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, arcR, start, end);
    ctx.stroke();
    ctx.restore();
  }

  // ── DRAW CEREMONY ────────────────────────────────────────────────────────────

  function drawCeremony(cx, cy) {
    if (!ceremony) return;
    const t  = ceremony.t;
    const lv = ceremony.level;
    const [r, g, b] = hexToRgb(lv.accent);

    // Expanding ring animation
    for (let i = 0; i < 3; i++) {
      const delay = i * 0.18;
      const lt    = Math.max(0, t - delay);
      const ringR = targetRadius() + lt * 140;
      const alpha = Math.max(0, 0.7 - lt * 0.55);
      if (alpha > 0) {
        circle(cx, cy, ringR, `rgba(${r},${g},${b},${alpha})`, 1.5 - i * 0.4, 12);
      }
    }

    // Level name
    const nameAlpha = t < 0.3
      ? t / 0.3
      : t > 1.8 ? Math.max(0, 1 - (t - 1.8) / 0.4)
      : 1;

    if (nameAlpha > 0) {
      ctx.save();
      ctx.globalAlpha   = nameAlpha;
      ctx.fillStyle     = lv.accent;
      ctx.shadowColor   = lv.accent;
      ctx.shadowBlur    = 30;
      ctx.textAlign     = 'center';
      const nameFontSize = Math.min(shortSide() * 0.09, 64);
      ctx.font          = `700 ${nameFontSize}px "IBM Plex Mono", monospace`;
      ctx.letterSpacing = '0.3em';
      ctx.fillText(lv.name, cx, cy - 18);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha   = nameAlpha * 0.7;
      ctx.fillStyle     = '#ffffff';
      ctx.shadowColor   = lv.accent;
      ctx.shadowBlur    = 14;
      ctx.textAlign     = 'center';
      const subFontSize = Math.min(shortSide() * 0.025, 16);
      ctx.font          = `400 ${subFontSize}px "IBM Plex Mono", monospace`;
      ctx.letterSpacing = '0.2em';
      ctx.fillText(lv.subtitle, cx, cy + 18);
      ctx.restore();

      // Skip hint
      if (t > 0.6) {
        ctx.save();
        ctx.globalAlpha   = Math.min(nameAlpha * 0.5, (t - 0.6) * 1.5);
        ctx.fillStyle     = 'rgba(255,255,255,0.3)';
        ctx.textAlign     = 'center';
        ctx.font          = `400 10px "IBM Plex Mono", monospace`;
        ctx.letterSpacing = '0.2em';
        ctx.fillText('TAP TO CONTINUE', cx, cy + 50);
        ctx.restore();
      }
    }
  }

  // ── MAIN DRAW ────────────────────────────────────────────────────────────────

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Subtle tinted background per level
    const lv = currentLevel();
    const [br, bg, bb] = lv.bgTint;
    ctx.fillStyle = `rgb(${br},${bg},${bb})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();

    const cx = canvas.width  / 2 + shakeX;
    const cy = canvas.height / 2 + shakeY;

    if (phase === 'idle')      drawIdle(cx, cy);
    if (phase === 'playing')  { drawSpeedArc(cx, cy); drawProgressArc(cx, cy); }
    if (phase === 'ceremony')  drawCeremony(cx, cy);

    drawTarget(cx, cy);
    if (phase !== 'ceremony') drawRing(cx, cy);
    drawParticles();

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

  // ── INIT ─────────────────────────────────────────────────────────────────────

  bestValEl.textContent = highScore;

})();
