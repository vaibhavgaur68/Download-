/* ──────────────────────────────────────────────────────────────────────────────
   PULSE — game.js  (v3: dopamine-engineered)
   New systems:
     · THE BREAKTHROUGH  — live high-score crossing: gold flash, triumphant
                           arpeggio, persistent vignette, banner
     · THE PRESSURE RELEASE — level-up overhauled: bass shockwave boom,
                              5 expanding rings, spring-scale name, 150 particles
     · GOD MODE          — 8 consecutive perfects: comet trail, pulse vignette,
                           doubled multiplier, SFX cascade, broken on non-perfect
     · COMBO LIGHTNING   — zigzag bolts radiate from target at high combo
     · NEAR-MISS ZONE    — faint accent fill between goodWin bounds on approach
     · HEARTBEAT DOT     — center dot pulses at current ring speed
     · CHROMATIC ABER.   — CSS hue-rotate / saturate jolt on every miss
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

  const LEVELS = [
    {
      accent: '#00FFB2', name: 'VOID',    subtitle: 'nothing but static.',
      hitsNeeded: 8,  perfectWin: 9,  goodWin: 20,
      baseSpeed: 105, maxSpeed: 180,  speedStep: 9,
      behavior: 'normal', bgTint: [0, 0, 0, 1],
    },
    {
      accent: '#00D4FF', name: 'PULSE',   subtitle: 'feel the rhythm.',
      hitsNeeded: 10, perfectWin: 9,  goodWin: 18,
      baseSpeed: 130, maxSpeed: 220,  speedStep: 10,
      behavior: 'wave', bgTint: [0, 5, 12, 1],
    },
    {
      accent: '#FFD166', name: 'HEAT',    subtitle: 'temperature rising.',
      hitsNeeded: 12, perfectWin: 8,  goodWin: 17,
      baseSpeed: 155, maxSpeed: 260,  speedStep: 11,
      behavior: 'wave', bgTint: [8, 4, 0, 1],
    },
    {
      accent: '#FF6B35', name: 'CRIMSON', subtitle: 'blood in the signal.',
      hitsNeeded: 14, perfectWin: 7,  goodWin: 16,
      baseSpeed: 180, maxSpeed: 300,  speedStep: 12,
      behavior: 'stutter', bgTint: [10, 2, 0, 1],
    },
    {
      accent: '#B57BFF', name: 'ETHER',   subtitle: 'phase through reality.',
      hitsNeeded: 16, perfectWin: 7,  goodWin: 15,
      baseSpeed: 210, maxSpeed: 340,  speedStep: 12,
      behavior: 'ghost', bgTint: [5, 0, 12, 1],
    },
    {
      accent: '#FF2D55', name: 'ABYSS',   subtitle: 'stare long enough.',
      hitsNeeded: 18, perfectWin: 6,  goodWin: 13,
      baseSpeed: 250, maxSpeed: 390,  speedStep: 13,
      behavior: 'stutter', bgTint: [10, 0, 3, 1],
    },
    {
      accent: '#FFFFFF', name: 'GHOST',   subtitle: 'you are the signal.',
      hitsNeeded: 999, perfectWin: 5, goodWin: 12,
      baseSpeed: 290, maxSpeed: 460,  speedStep: 14,
      behavior: 'near-invisible', bgTint: [8, 8, 8, 1],
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
      tone(880,  'sine', 0.28, 0.008, 0.18);
      setTimeout(() => tone(1320, 'sine', 0.16, 0.008, 0.14), 55);
    },
    good()     { tone(660, 'sine',     0.22, 0.01, 0.18); },
    miss()     { tone(140, 'sawtooth', 0.30, 0.01, 0.22); },
    loseLife() {
      tone(220, 'sawtooth', 0.35, 0.01, 0.25);
      setTimeout(() => tone(165, 'sine', 0.2, 0.01, 0.2), 180);
    },
    over() {
      tone(220, 'sine', 0.28, 0.01, 0.22);
      setTimeout(() => tone(165, 'sine', 0.28, 0.01, 0.22), 220);
      setTimeout(() => tone(110, 'sine', 0.28, 0.01, 0.40), 440);
    },
    gainLife() { tone(990, 'sine', 0.18, 0.008, 0.2); },

    // ── PRESSURE RELEASE: earth-shake bass boom + ascending fanfare ──────────
    shockwaveBoom() {
      tone(41,  'sine',     0.70, 0.001, 0.50);
      tone(55,  'sine',     0.50, 0.001, 0.40);
      tone(82,  'sawtooth', 0.28, 0.002, 0.24);
    },
    levelFanfare() {
      setTimeout(() => tone(440,  'sine', 0.20, 0.01, 0.14), 220);
      setTimeout(() => tone(550,  'sine', 0.18, 0.01, 0.14), 330);
      setTimeout(() => tone(660,  'sine', 0.22, 0.01, 0.22), 450);
      setTimeout(() => tone(880,  'sine', 0.18, 0.01, 0.34), 610);
      setTimeout(() => tone(1100, 'sine', 0.14, 0.01, 0.44), 800);
    },

    // ── BREAKTHROUGH: low rumble → C major crown chord ───────────────────────
    breakthrough() {
      tone(80,   'sine', 0.45, 0.002, 0.32);          // ground rumble
      setTimeout(() => tone(523,  'sine', 0.24, 0.01, 0.20), 90);   // C5
      setTimeout(() => tone(659,  'sine', 0.22, 0.01, 0.20), 185);  // E5
      setTimeout(() => tone(784,  'sine', 0.22, 0.01, 0.20), 280);  // G5
      setTimeout(() => tone(1047, 'sine', 0.30, 0.01, 0.55), 420);  // C6 — the crown
    },

    // ── GOD MODE: power-up whoosh cascade ────────────────────────────────────
    godModeOn() {
      tone(110, 'sine', 0.30, 0.01, 0.14);
      tone(220, 'sine', 0.25, 0.04, 0.30);
      setTimeout(() => tone(440,  'sine', 0.22, 0.01, 0.36), 170);
      setTimeout(() => tone(880,  'sine', 0.18, 0.01, 0.46), 350);
      setTimeout(() => tone(1320, 'sine', 0.12, 0.01, 0.55), 540);
    },
    godModeOff() {
      tone(440, 'sawtooth', 0.18, 0.005, 0.10);
      setTimeout(() => tone(220, 'sine', 0.15, 0.005, 0.20), 80);
      setTimeout(() => tone(110, 'sine', 0.12, 0.005, 0.30), 160);
    },
  };

  // ── STATE ────────────────────────────────────────────────────────────────────

  let phase         = 'idle';
  let score         = 0;
  let combo         = 0;
  let hitCount      = 0;
  let levelHits     = 0;
  let levelIdx      = 0;
  let lives         = 3;
  let perfectStreak = 0;
  let speed         = LEVELS[0].baseSpeed;
  let highScore     = parseInt(localStorage.getItem('pulse_hs') || '0');

  let ring      = null;
  let parts     = [];
  let feedbacks = [];

  let flashA   = 0;
  let flashCol = '#fff';
  let shakeX   = 0, shakeY = 0;
  let idleT    = 0;

  let ceremony              = null;
  let ceremonyInputConsumed = false;

  let waveT         = 0;
  let stutterT      = 0;
  let stutterPaused = false;

  // ── DOPAMINE STATE ───────────────────────────────────────────────────────────

  // Breakthrough
  let breakthroughActive = false;
  let breakthroughT      = 0;

  // God Mode
  let godMode        = false;
  let godModeT       = 0;
  let godStreak      = 0;
  const GOD_THRESHOLD = 8;

  // Visual systems
  let ringTrail      = [];   // comet trail [{r, o}]
  let shockwaves     = [];   // expanding rings [{r, alpha, color, lw, speed}]
  let lightningBolts = [];   // zigzag sparks [{points, alpha, color}]
  let chromaT        = 0;    // chromatic aberration intensity
  let heartbeatT     = 0;    // center dot pulse phase

  const SPEED_PIPS = 9;

  // ── HELPERS ──────────────────────────────────────────────────────────────────

  function currentLevel() { return LEVELS[Math.min(levelIdx, LEVELS.length - 1)]; }

  function setAccent(hex) {
    document.documentElement.style.setProperty('--accent', hex);
  }

  function hexToRgb(hex) {
    return [
      parseInt(hex.slice(1,3), 16),
      parseInt(hex.slice(3,5), 16),
      parseInt(hex.slice(5,7), 16),
    ];
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

  // Level progress indicator (top-left)
  const levelProgressEl = document.getElementById('level-progress');
  const lpCurrentEl     = document.getElementById('lp-current');
  const lpBarFillEl     = document.getElementById('lp-bar-fill');
  const lpNextEl        = document.getElementById('lp-next');

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
    const lv    = currentLevel();
    const frac  = Math.min((speed - lv.baseSpeed) / Math.max(lv.maxSpeed - lv.baseSpeed, 1), 1);
    const level = Math.round(frac * SPEED_PIPS);
    [...speedBar.querySelectorAll('.speed-pip')].forEach((p, i) => {
      p.classList.toggle('active', i < level);
    });
  }

  function updateLivesUI() {
    lifePips.forEach((pip, i) => pip.classList.toggle('lost', i >= lives));
  }

  function updateLevelHud() {
    levelNameHud.textContent = currentLevel().name;
    updateLevelProgressHUD();
  }

  function updateLevelProgressHUD() {
    const lv     = currentLevel();
    const isLast = levelIdx >= LEVELS.length - 1;
    const nextLv = isLast ? lv : LEVELS[levelIdx + 1];

    lpCurrentEl.textContent      = lv.name;
    lpCurrentEl.style.color      = lv.accent;
    lpCurrentEl.style.textShadow = `0 0 14px ${lv.accent}`;

    const progress = isLast
      ? (levelHits % 30) / 30       // endless fill cycle on final level
      : Math.min(levelHits / lv.hitsNeeded, 1);
    lpBarFillEl.style.width      = (progress * 100) + '%';
    lpBarFillEl.style.background = lv.accent;
    lpBarFillEl.style.boxShadow  = `0 0 6px ${lv.accent}, 0 0 14px ${lv.accent}`;

    if (isLast) {
      lpNextEl.textContent = '∞ ENDLESS';
      lpNextEl.style.color = 'rgba(255,255,255,0.15)';
    } else {
      lpNextEl.textContent = '→ ' + nextLv.name;
      const [r, g, b]     = hexToRgb(nextLv.accent);
      lpNextEl.style.color = `rgba(${r},${g},${b},0.42)`;
    }
  }

  // ── GAME CONTROL ─────────────────────────────────────────────────────────────

  function startGame() {
    phase         = 'playing';
    score         = 0; combo = 0; hitCount = 0; levelHits = 0;
    levelIdx      = 0; lives = 3; perfectStreak = 0;
    parts         = []; feedbacks = [];
    flashA        = 0; shakeX = shakeY = 0;
    waveT         = 0; stutterT = 0; stutterPaused = false;
    ceremony      = null;

    // Reset dopamine systems
    breakthroughActive = false; breakthroughT = 0;
    godMode = false; godModeT = 0; godStreak = 0;
    ringTrail = []; shockwaves = []; lightningBolts = [];
    chromaT = 0; heartbeatT = 0;
    hudScoreEl.classList.remove('breakthrough', 'godmode');
    canvas.style.filter = '';

    const lv = currentLevel();
    speed = lv.baseSpeed;
    setAccent(lv.accent);

    startScreen.style.display = 'none';
    goScreen.className         = 'screen-hidden';
    hudEl.classList.remove('hidden');
    livesHudEl.classList.remove('hidden');
    levelHudEl.classList.remove('hidden');
    levelProgressEl.classList.remove('hidden');
    speedBar.classList.add('visible');

    bestValEl.textContent = highScore;
    updateHUD(); updatePips(); updateLivesUI(); updateLevelHud();
    spawnRing();
  }

  function endGame() {
    phase = 'gameover';
    ring  = null;
    SFX.over();

    if (godMode) { godMode = false; canvas.style.filter = ''; hudScoreEl.classList.remove('godmode'); }

    shakeX = 20; shakeY = 14;
    flashA = 0.55; flashCol = '#FF2D55';

    const newBest = score > highScore;
    if (newBest) { highScore = score; localStorage.setItem('pulse_hs', highScore); }

    finalScoreEl.textContent = score;
    finalBestEl.textContent  = highScore;
    finalLevelEl.textContent = currentLevel().name;
    finalLevelEl.style.color = currentLevel().accent;
    finalLevelEl.style.textShadow = `0 0 20px ${currentLevel().accent}`;
    newHsBadge.classList.toggle('hidden', !newBest);

    livesHudEl.classList.add('hidden');
    levelHudEl.classList.add('hidden');
    levelProgressEl.classList.add('hidden');
    speedBar.classList.remove('visible');

    setTimeout(() => { goScreen.className = ''; }, 650);
  }

  // ── LEVEL UP ─────────────────────────────────────────────────────────────────

  function triggerLevelUp() {
    levelIdx  = Math.min(levelIdx + 1, LEVELS.length - 1);
    levelHits = 0;

    const lv = LEVELS[levelIdx];
    speed = lv.baseSpeed;
    setAccent(lv.accent);
    updateLevelHud();
    updatePips();

    // Pop animation on level name + instant bar reset before fill
    lpBarFillEl.style.transition = 'none';
    lpBarFillEl.style.width = '0%';
    requestAnimationFrame(() => {
      lpBarFillEl.style.transition = '';
      updateLevelProgressHUD();
    });
    lpCurrentEl.classList.remove('level-pop');
    void lpCurrentEl.offsetWidth;
    lpCurrentEl.classList.add('level-pop');
    setTimeout(() => lpCurrentEl.classList.remove('level-pop'), 520);

    // Silence god mode — the level up is its own event
    if (godMode) {
      godMode = false; godStreak = 0;
      hudScoreEl.classList.remove('godmode');
      canvas.style.filter = '';
    }

    // ── THE PRESSURE RELEASE ─────────────────────────────────────────────────
    SFX.shockwaveBoom();
    SFX.levelFanfare();

    // Violent white flash + heavy shake
    flashA   = 0.85;
    flashCol = '#FFFFFF';
    shakeX   = 34; shakeY = 22;

    // 5 staggered shockwave rings in the new level's color
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        shockwaves.push({
          r:     targetRadius(),
          alpha: 0.78 - i * 0.06,
          color: lv.accent,
          lw:    3.2 - i * 0.45,
          spd:   390 + i * 70,
        });
      }, i * 78);
    }

    // Massive particle explosion
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    spawnLevelBurst(cx, cy, lv.accent);

    // Enter ceremony
    ceremony = { t: 0, level: lv };
    phase    = 'ceremony';
    ring     = null;
    ringTrail = [];
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
    ringTrail = [];
  }

  // ── BREAKTHROUGH ─────────────────────────────────────────────────────────────

  function checkBreakthrough() {
    if (breakthroughActive || highScore === 0) return;
    if (score > highScore) {
      breakthroughActive = true;
      breakthroughT      = 0;
      triggerBreakthrough();
    }
  }

  function triggerBreakthrough() {
    SFX.breakthrough();

    flashA   = 0.44;
    flashCol = '#FFD166';
    shakeX   = 24; shakeY = 16;

    hudScoreEl.classList.add('breakthrough');

    // Gold particle burst from HUD score area (top-center)
    const cx = canvas.width / 2;
    for (let i = 0; i < 45; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 2.5 + Math.random() * 6.5;
      parts.push({
        x: cx, y: 80,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 1,
        decay: 0.013 + Math.random() * 0.016,
        r:    1.8 + Math.random() * 3.2,
        color: '#FFD166',
      });
    }
  }

  // ── GOD MODE ─────────────────────────────────────────────────────────────────

  function activateGodMode() {
    godMode  = true;
    godModeT = 0;
    SFX.godModeOn();

    flashA   = 0.30;
    flashCol = '#FFFFFF';
    shakeX   = 15; shakeY = 10;

    hudScoreEl.classList.add('godmode');
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    pushFeedback('⚡ GOD MODE ⚡', '#FFFFFF', cx, cy - targetRadius() - 72);
  }

  function deactivateGodMode() {
    godMode = false;
    SFX.godModeOff();
    flashA = 0.14; flashCol = '#888888';
    hudScoreEl.classList.remove('godmode');
    canvas.style.filter = '';
    ringTrail = [];
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    pushFeedback('BROKEN', 'rgba(255,255,255,0.45)', cx, cy - targetRadius() - 72);
  }

  // ── TAP / HIT DETECTION ──────────────────────────────────────────────────────

  function onInput() {
    if (phase === 'idle')      { startGame(); return; }
    if (phase === 'gameover')  return;
    if (phase === 'ceremony')  {
      if (ceremony && ceremony.t > 0.4 && !ceremonyInputConsumed) {
        ceremonyInputConsumed = true;
        endCeremony();
      }
      return;
    }
    if (!ring) return;

    const lv   = currentLevel();
    const diff = Math.abs(ring.radius - targetRadius());

    if (diff <= lv.perfectWin)      registerHit('PERFECT', lv.accent, 10, true);
    else if (diff <= lv.goodWin)    registerHit('GOOD', '#FFD166', 5, false);
    else                            registerMiss();
  }

  function registerHit(label, color, basePoints, isPerfect) {
    if (isPerfect) {
      combo++; perfectStreak++; godStreak++;
    } else {
      combo         = Math.max(0, Math.floor(combo * 0.4));
      perfectStreak = 0;
      if (godMode) deactivateGodMode();
      godStreak = 0;
    }

    // Activate God Mode threshold
    if (!godMode && godStreak >= GOD_THRESHOLD) activateGodMode();

    // God Mode doubles the combo multiplier
    const baseMult   = 1 + Math.floor(combo / 3);
    const multiplier = godMode ? baseMult * 2 : baseMult;
    const pts        = basePoints * multiplier;
    score    += pts;
    hitCount++;
    levelHits++;

    checkBreakthrough();

    const lv = currentLevel();
    speed = Math.min(
      lv.baseSpeed + (levelHits * lv.speedStep * 0.5) + (hitCount * lv.speedStep * 0.5),
      lv.maxSpeed
    );

    // Life bonus at 5-perfect streak
    if (perfectStreak > 0 && perfectStreak % 5 === 0 && lives < 3) {
      lives++;
      updateLivesUI();
      lifePips[lives - 1].classList.add('gained');
      setTimeout(() => lifePips[lives - 1]?.classList.remove('gained'), 500);
      pushFeedback('♥ LIFE', '#FF2D55', canvas.width / 2, canvas.height / 2 - targetRadius() - 50);
      SFX.gainLife();
    }

    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    spawnBurst(cx, cy, color, isPerfect ? 30 : 14);
    pushFeedback(label, color, cx, cy - targetRadius() - 28);
    flashA   = isPerfect ? 0.12 : 0.06;
    flashCol = color;

    // Lightning bolts at high combo
    if (isPerfect && combo >= 5) spawnLightning(cx, cy);

    if (isPerfect) SFX.perfect(); else SFX.good();

    ring = null; ringTrail = [];
    updateHUD(); updatePips();

    hudScoreEl.classList.remove('bump');
    void hudScoreEl.offsetWidth;
    hudScoreEl.classList.add('bump');
    setTimeout(() => hudScoreEl.classList.remove('bump'), 120);

    if (levelHits >= lv.hitsNeeded && levelIdx < LEVELS.length - 1) {
      triggerLevelUp();
    } else {
      spawnRing();
    }
  }

  function registerMiss() {
    if (godMode) deactivateGodMode();
    godStreak = 0;

    // Chromatic aberration jolt
    chromaT = 0.58;

    lives--;
    updateLivesUI();

    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    pushFeedback('MISS', '#FF2D55', cx, cy - targetRadius() - 28);

    perfectStreak = 0; combo = 0;
    updateHUD();

    if (lives <= 0) {
      SFX.miss();
      endGame();
    } else {
      SFX.loseLife();
      shakeX = 18; shakeY = 11;
      flashA = 0.24; flashCol = '#FF2D55';
      ring = null; ringTrail = [];
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
        x:  fromEdge ? cx + Math.cos(angle) * tr : cx,
        y:  fromEdge ? cy + Math.sin(angle) * tr : cy,
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
    const tr    = targetRadius();
    const count = 150;   // substantially more than the original 60
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const spd   = 2.5 + Math.random() * 11;
      const layer = Math.random();
      parts.push({
        x:  cx + Math.cos(angle) * tr * (0.3 + layer * 0.9),
        y:  cy + Math.sin(angle) * tr * (0.3 + layer * 0.9),
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 1,
        decay: 0.005 + Math.random() * 0.011,
        r: 1.5 + Math.random() * 4.5,
        color,
      });
    }
  }

  // ── LIGHTNING ────────────────────────────────────────────────────────────────

  function spawnLightning(cx, cy) {
    const lv    = currentLevel();
    const tr    = targetRadius();
    const count = Math.min(2 + Math.floor((combo - 5) / 2), 7);

    for (let i = 0; i < count; i++) {
      const angle  = Math.random() * Math.PI * 2;
      const length = 42 + Math.random() * 64;
      const sx     = cx + Math.cos(angle) * tr;
      const sy     = cy + Math.sin(angle) * tr;
      const segs   = 3 + Math.floor(Math.random() * 3);
      const points = [{ x: sx, y: sy }];
      let x = sx, y = sy;

      for (let j = 0; j < segs; j++) {
        const perp = angle + Math.PI / 2;
        const dev  = (Math.random() - 0.5) * 22;
        x += Math.cos(angle) * (length / segs) + Math.cos(perp) * dev;
        y += Math.sin(angle) * (length / segs) + Math.sin(perp) * dev;
        points.push({ x, y });
      }
      lightningBolts.push({ points, alpha: 1, color: lv.accent });
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
    updateLevelProgressHUD();
  }

  // ── UPDATE ───────────────────────────────────────────────────────────────────

  function update(dt) {
    if (flashA > 0) flashA = Math.max(0, flashA - dt * 2.8);
    shakeX *= 0.74; shakeY *= 0.74;
    if (Math.abs(shakeX) < 0.05) shakeX = 0;
    if (Math.abs(shakeY) < 0.05) shakeY = 0;

    // Chromatic aberration — CSS filter approach for zero canvas overhead
    if (chromaT > 0) {
      chromaT = Math.max(0, chromaT - dt * 2.4);
      canvas.style.filter = chromaT > 0.01
        ? `hue-rotate(${Math.sin(chromaT * 20) * 24}deg) saturate(${1 + chromaT * 5.5})`
        : '';
      if (chromaT <= 0.01) canvas.style.filter = '';
    }

    // Particles
    parts = parts.filter(p => {
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.92; p.vy *= 0.92;
      p.life -= p.decay;
      return p.life > 0;
    });

    // Feedbacks
    feedbacks = feedbacks.filter(f => {
      f.y    += f.vy;
      f.alpha -= dt * 1.4;
      return f.alpha > 0;
    });

    // Shockwaves
    shockwaves = shockwaves.filter(s => {
      s.r     += s.spd * dt;
      s.alpha -= dt * 1.15;
      return s.alpha > 0;
    });

    // Lightning fade
    lightningBolts = lightningBolts.filter(b => {
      b.alpha -= dt * 5.5;
      return b.alpha > 0;
    });

    // Breakthrough timer
    if (breakthroughActive) breakthroughT += dt;

    // God Mode timer
    if (godMode) godModeT += dt;

    if (phase === 'idle') { idleT += dt; return; }

    if (phase === 'ceremony') {
      ceremony.t += dt;
      if (ceremony.t >= 2.4) endCeremony();
      return;
    }

    if (phase !== 'playing' || !ring) return;

    // Heartbeat pulse (only during active play)
    heartbeatT += dt * (speed / 85);

    const lv = currentLevel();
    waveT    += dt;
    stutterT += dt;

    let effectiveSpeed = speed;

    switch (lv.behavior) {
      case 'wave': {
        const wave = Math.sin(waveT * 3.5 + ring.waveOffset);
        effectiveSpeed = speed * (1 + wave * 0.25);
        break;
      }
      case 'stutter': {
        if (!stutterPaused) {
          if (stutterT > 0.28 + Math.random() * 0.15) { stutterPaused = true; stutterT = 0; }
        } else {
          effectiveSpeed = 0;
          if (stutterT > 0.10) {
            stutterPaused  = false; stutterT = 0;
            effectiveSpeed = speed * 2.2;
          }
        }
        break;
      }
      case 'ghost': {
        ring.opacity = 0.35 + 0.65 * Math.abs(Math.sin(waveT * 1.8 + ring.waveOffset));
        break;
      }
      case 'near-invisible': {
        const t = waveT * 2.1 + ring.waveOffset;
        ring.opacity = 0.12 + 0.25 * Math.max(0, Math.sin(t));
        break;
      }
      default: break;
    }

    ring.radius -= effectiveSpeed * dt;

    // Update God Mode comet trail
    if (godMode) {
      ringTrail.push({ r: ring.radius, o: ring.opacity ?? 1 });
      if (ringTrail.length > 18) ringTrail.shift();
    }

    // Auto-miss: passed through target zone
    if (ring.radius < targetRadius() - lv.goodWin - 6) registerMiss();
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
    circle(cx, cy, tr + 50 + beat * 40, `rgba(0,255,178,${0.08 + beat * 0.12})`, 1, 6);
    const beat2 = (Math.sin(idleT * Math.PI * 1.2 + Math.PI) + 1) / 2;
    circle(cx, cy, tr + 50 + beat2 * 40, `rgba(255,255,255,${0.05 + beat2 * 0.06})`, 1, 4);
  }

  // ── DRAW RING ────────────────────────────────────────────────────────────────

  function drawRing(cx, cy) {
    if (!ring) return;
    const lv   = currentLevel();
    const tr   = targetRadius();
    const absd = Math.abs(ring.radius - tr);
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

    const baseAlpha = ring.opacity ?? 1;
    const alpha = baseAlpha * (0.28 + prox * 0.72);
    const blur  = 4 + prox * 22;
    const lw    = 1.5 + prox * 2.5;

    // GOD MODE: comet trail (oldest→newest, increasing brightness)
    if (godMode && ringTrail.length > 0) {
      ringTrail.forEach((t, i) => {
        const frac   = (i + 1) / ringTrail.length;
        const talpha = frac * 0.52 * t.o;
        circle(cx, cy, t.r, `rgba(${ar},${ag},${ab},${talpha})`, 0.5 + frac * 2.5, 2 + frac * 20);
      });
    }

    circle(cx, cy, ring.radius, `rgba(${r},${g},${b},${alpha})`, lw, blur);
  }

  // ── DRAW TARGET ──────────────────────────────────────────────────────────────

  function drawTarget(cx, cy) {
    const lv = currentLevel();
    const tr = targetRadius();

    // Near-miss zone: faint fill illuminates as ring approaches goodWin bounds
    if (ring && phase === 'playing') {
      const absd     = Math.abs(ring.radius - tr);
      const zoneProx = Math.max(0, 1 - absd / (lv.goodWin * 2.4));
      if (zoneProx > 0) {
        const [ar, ag, ab] = hexToRgb(lv.accent);
        ctx.save();
        ctx.globalAlpha = zoneProx * 0.09;
        ctx.fillStyle   = `rgb(${ar},${ag},${ab})`;
        ctx.shadowColor = lv.accent;
        ctx.shadowBlur  = 14;
        ctx.beginPath();
        ctx.arc(cx, cy, tr + lv.goodWin, 0, Math.PI * 2);
        ctx.arc(cx, cy, Math.max(0, tr - lv.goodWin), 0, Math.PI * 2, true);
        ctx.fill('evenodd');
        ctx.restore();
      }
    }

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

  // ── DRAW PARTICLES & FEEDBACKS ───────────────────────────────────────────────

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

  // ── DRAW SHOCKWAVES ──────────────────────────────────────────────────────────

  function drawShockwaves(cx, cy) {
    shockwaves.forEach(s => {
      const [r, g, b] = hexToRgb(s.color);
      circle(
        cx + shakeX, cy + shakeY, s.r,
        `rgba(${r},${g},${b},${s.alpha})`,
        Math.max(0.2, s.lw * s.alpha * 2.2),
        22 * s.alpha
      );
    });
  }

  // ── DRAW LIGHTNING ───────────────────────────────────────────────────────────

  function drawLightning() {
    lightningBolts.forEach(bolt => {
      ctx.save();
      ctx.globalAlpha = bolt.alpha;
      ctx.strokeStyle = bolt.color;
      ctx.shadowColor = bolt.color;
      ctx.shadowBlur  = 16;
      ctx.lineWidth   = 1.5;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.beginPath();
      bolt.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x + shakeX, p.y + shakeY);
        else         ctx.lineTo(p.x + shakeX, p.y + shakeY);
      });
      ctx.stroke();
      ctx.restore();
    });
  }

  // ── DRAW BREAKTHROUGH BANNER ─────────────────────────────────────────────────

  function drawBreakthroughBanner(cx) {
    if (!breakthroughActive) return;
    const t = breakthroughT;
    if (t > 3.4) return;

    let prog;
    if      (t < 0.18) prog = t / 0.18;
    else if (t < 2.6)  prog = 1;
    else               prog = Math.max(0, 1 - (t - 2.6) / 0.40);
    if (prog <= 0) return;

    const bannerY = Math.max(140, Math.min(180, canvas.height * 0.28));
    const pulse   = 0.88 + 0.12 * Math.sin(t * 9.5);

    ctx.save();
    ctx.globalAlpha = prog * pulse;

    // Horizontal gradient bar
    const barH = 40;
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0,    'rgba(255,209,102,0)');
    grad.addColorStop(0.22, 'rgba(255,209,102,0.18)');
    grad.addColorStop(0.5,  'rgba(255,209,102,0.34)');
    grad.addColorStop(0.78, 'rgba(255,209,102,0.18)');
    grad.addColorStop(1,    'rgba(255,209,102,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, bannerY - barH / 2, canvas.width, barH);

    ctx.fillStyle   = '#FFD166';
    ctx.shadowColor = '#FFD166';
    ctx.shadowBlur  = 32;
    ctx.textAlign   = 'center';
    ctx.font        = '700 10px "IBM Plex Mono", monospace';
    ctx.letterSpacing = '0.48em';
    ctx.fillText('✦  NEW BEST  ✦', cx, bannerY + 4);
    ctx.restore();
  }

  // ── DRAW BREAKTHROUGH VIGNETTE (persistent gold edge glow) ───────────────────

  function drawBreakthroughVignette() {
    if (!breakthroughActive) return;
    const pulse  = 0.5 + 0.5 * Math.sin(breakthroughT * 2.8);
    const intens = 0.032 + pulse * 0.022;
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    const ss = Math.max(canvas.width, canvas.height);
    const grad = ctx.createRadialGradient(cx, cy, shortSide() * 0.35, cx, cy, ss * 0.72);
    grad.addColorStop(0, 'rgba(255,209,102,0)');
    grad.addColorStop(1, `rgba(255,209,102,${intens})`);
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // ── DRAW GOD MODE OVERLAY ────────────────────────────────────────────────────

  function drawGodModeOverlay() {
    if (!godMode) return;
    const lv       = currentLevel();
    const [r, g, b] = hexToRgb(lv.accent);
    const cx       = canvas.width  / 2;
    const cy       = canvas.height / 2;
    const pulse    = 0.5 + 0.5 * Math.sin(godModeT * 5.5);
    const intens   = 0.07 + pulse * 0.06;
    const ss       = Math.max(canvas.width, canvas.height);

    const grad = ctx.createRadialGradient(cx, cy, shortSide() * 0.22, cx, cy, ss * 0.72);
    grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},${intens})`);

    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Small "GOD" label, top-left, fades in
    const fadeIn = Math.min(godModeT * 4, 1);
    ctx.save();
    ctx.globalAlpha   = fadeIn * (0.45 + 0.55 * pulse);
    ctx.fillStyle     = lv.accent;
    ctx.shadowColor   = lv.accent;
    ctx.shadowBlur    = 18;
    ctx.textAlign     = 'left';
    ctx.font          = '700 8px "IBM Plex Mono", monospace';
    ctx.letterSpacing = '0.44em';
    ctx.fillText('GOD', 28, 94);
    ctx.restore();
  }

  // ── DRAW HEARTBEAT DOT ───────────────────────────────────────────────────────

  function drawHeartbeatDot(cx, cy) {
    if (phase === 'playing') {
      // Sharp pulse: positive half of sin, cubed for snappy attack
      const hb    = Math.pow(Math.max(0, Math.sin(heartbeatT * Math.PI * 2)), 3);
      const dotR  = 3 + hb * 4;
      const alpha = 0.62 + hb * 0.38;
      const blur  = 10 + hb * 22;
      dot(cx, cy, dotR, `rgba(255,255,255,${alpha})`, blur);
    } else {
      dot(cx, cy, 3, 'rgba(255,255,255,0.85)', 12);
    }
  }

  // ── DRAW CEREMONY ────────────────────────────────────────────────────────────

  function drawCeremony(cx, cy) {
    if (!ceremony) return;
    const t  = ceremony.t;
    const lv = ceremony.level;
    const [r, g, b] = hexToRgb(lv.accent);

    // Expanding accent rings (inherited from original, kept as atmosphere)
    for (let i = 0; i < 3; i++) {
      const delay = i * 0.18;
      const lt    = Math.max(0, t - delay);
      const ringR = targetRadius() + lt * 140;
      const alpha = Math.max(0, 0.7 - lt * 0.55);
      if (alpha > 0) circle(cx, cy, ringR, `rgba(${r},${g},${b},${alpha})`, 1.5 - i * 0.4, 12);
    }

    const nameAlpha = t < 0.3
      ? t / 0.3
      : t > 1.8 ? Math.max(0, 1 - (t - 1.8) / 0.4)
      : 1;

    if (nameAlpha > 0) {
      // Spring-scale: invisible during flash, then slams in with overshoot
      const sp    = Math.max(0, t - 0.3);
      const decay = Math.exp(-sp * 7);
      const osc   = Math.cos(sp * 14);
      const nameScale = sp <= 0 ? 0.001 : 1 + decay * osc * 0.5;

      ctx.save();
      ctx.globalAlpha = nameAlpha;
      ctx.translate(cx, cy - 18);
      ctx.scale(nameScale, nameScale);
      ctx.fillStyle     = lv.accent;
      ctx.shadowColor   = lv.accent;
      ctx.shadowBlur    = 40;
      ctx.textAlign     = 'center';
      const nameFontSize = Math.min(shortSide() * 0.09, 64);
      ctx.font          = `700 ${nameFontSize}px "IBM Plex Mono", monospace`;
      ctx.letterSpacing = '0.3em';
      ctx.fillText(lv.name, 0, 0);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha   = nameAlpha * 0.7;
      ctx.fillStyle     = '#ffffff';
      ctx.shadowColor   = lv.accent;
      ctx.shadowBlur    = 14;
      ctx.textAlign     = 'center';
      ctx.font          = `400 ${Math.min(shortSide() * 0.025, 16)}px "IBM Plex Mono", monospace`;
      ctx.letterSpacing = '0.2em';
      ctx.fillText(lv.subtitle, cx, cy + 18);
      ctx.restore();

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

    // Heartbeat micro-pulse on background luminance
    const lv = currentLevel();
    const [br, bg, bb] = lv.bgTint;
    const hbPulse = phase === 'playing'
      ? Math.pow(Math.max(0, Math.sin(heartbeatT * Math.PI * 2)), 3) * 5
      : 0;
    ctx.fillStyle = `rgb(${br + hbPulse},${bg + hbPulse},${bb + hbPulse})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();

    const cx = canvas.width  / 2 + shakeX;
    const cy = canvas.height / 2 + shakeY;

    // Persistent atmospheric overlays (unshaken, anchored to screen)
    drawBreakthroughVignette();
    drawGodModeOverlay();

    if (phase === 'idle')     drawIdle(cx, cy);
    if (phase === 'ceremony') drawCeremony(cx, cy);

    // Shockwaves sit behind the target
    drawShockwaves(cx, cy);

    drawTarget(cx, cy);
    if (phase !== 'ceremony') drawRing(cx, cy);
    drawParticles();
    drawLightning();

    drawHeartbeatDot(cx, cy);

    drawFeedbacks();

    // Breakthrough banner floats above everything else (no shake — it's UI)
    drawBreakthroughBanner(canvas.width / 2);

    // Screen flash overlay — always on top
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
