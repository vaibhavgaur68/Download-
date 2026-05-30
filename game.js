/* ──────────────────────────────────────────────────────────────────────────────
   PULSE — game.js  (v4: the vreth classification engine)
   Story: Earth 2031. The Vreth occupation. Every human must be tested.
   This machine reads your neural reflexes and assigns your caste.
   Systems:
     · LORE INTRO        — typewriter crawl before game starts
     · RANK SYSTEM       — each level clears earns a caste title
     · CEREMONY REWRITE  — level-up shows rank promotion + alien verdict
     · GAMEOVER VERDICT  — cold alien sentence with rank earned
     · NEURAL OVERDRIVE  — God Mode renamed to Vreth term
     · SIGNAL ANOMALY    — Breakthrough renamed to Vreth detection event
────────────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // ── LORE & RANK DATA ────────────────────────────────────────────────────────

  const LORE = {
    intro: [
      'EARTH. 2031.',
      'THE VRETH ARRIVED WITHOUT WARNING.',
      'NO WAR. NO NEGOTIATION.',
      'JUST SILENCE — THEN OCCUPATION.',
      'THEY DO NOT KILL.',
      'THEY SORT.',
      'EVERY HUMAN WILL BE TESTED.',
      'THIS MACHINE READS WHAT IS UNDERNEATH.',
      'YOUR RESULT DETERMINES YOUR FATE.',
      'THERE IS NO APPEAL.',
      'BEGIN.',
    ],

    // Rank earned after clearing each level (index = levelIdx cleared)
    ranks: [
      {
        title:    'CITIZEN',
        alien:    'SUBJECT LOGGED. BASELINE COGNITION CONFIRMED.',
        desc:     'Managed human. Basic rations. Supervised housing.',
        color:    '#FF8C00',
      },
      {
        title:    'OPERATOR',
        alien:    'NEURAL EFFICIENCY: ACCEPTABLE. ASSIGNING INFRASTRUCTURE ROLE.',
        desc:     'Runs human-facing systems. Transport. Supply chains. Some autonomy.',
        color:    '#FFD700',
      },
      {
        title:    'SPECIALIST',
        alien:    'REACTION INDEX EXCEEDS BASELINE BY 340%. FLAGGING FOR TECHNICAL DIVISION.',
        desc:     'Operates Vreth machinery. Reflex speed of a pre-occupation F1 pilot.',
        color:    '#FFD700',
      },
      {
        title:    'SENTINEL',
        alien:    'COMBAT COGNITION THRESHOLD REACHED. AUTHORIZING ENFORCEMENT CLEARANCE.',
        desc:     'Controls other humans on behalf of the Vreth. Armed. Feared.',
        color:    '#FF4500',
      },
      {
        title:    'ARCHITECT',
        alien:    'ANOMALOUS SPATIAL PROCESSING DETECTED. ELEVATED CLEARANCE GRANTED.',
        desc:     'Designs occupied city infrastructure. Significant privilege. Significant burden.',
        color:    '#FF2200',
      },
      {
        title:    'PRIME',
        alien:    'SPECIMEN EXHIBITS NEAR-VRETH COGNITIVE SIGNATURES. INNER COUNCIL NOTIFIED.',
        desc:     'Direct Vreth liaison. Humanity\'s most dangerous minds — working for the enemy.',
        color:    '#CC0000',
      },
      {
        title:    'ASCENDANT',
        alien:    'CLASSIFICATION FAILURE. NO EXISTING CASTE APPLIES. ESCALATING TO HIGH COMMAND.',
        desc:     'Unclassified. The Vreth have never seen a score this high. Something else is being decided.',
        color:    '#FFF4E0',
      },
    ],

    // Drone rank — for those who fail level 1
    drone: {
      title:    'DRONE',
      alien:    'COGNITIVE SCORE: INSUFFICIENT. ASSIGNING TO LABOR DIVISION.',
      desc:     'Slave labor. Mining. Waste processing. No rights.',
      color:    '#444444',
    },

    // Alien commentary during level ceremonies (indexed by new levelIdx)
    ceremonyLines: [
      'INITIATING PHASE 2. INCREASING NEURAL PRESSURE.',            // entering FLAME
      'THERMAL THRESHOLD BREACH. COGNITIVE LOAD AMPLIFIED.',        // entering HEAT
      'SUBJECT IS ADAPTING. DEPLOYING PATTERN DISRUPTION.',         // entering BLAZE
      'RESISTANCE NOTED. ESCALATING TO INFERNO PROTOCOL.',          // entering INFERNO
      'UNPRECEDENTED ENDURANCE. FORGE SEQUENCE ACTIVATED.',         // entering FORGE
      'ALL KNOWN PARAMETERS EXCEEDED. PLASMA FIELD ENGAGED.',       // entering PLASMA
    ],

    // God Mode — Vreth term
    neuralOverdrive: 'NEURAL OVERDRIVE',

    // Breakthrough — Vreth detection
    signalAnomaly:   '✦ SIGNAL ANOMALY ✦',
  };

  // ── CANVAS SETUP ────────────────────────────────────────────────────────────

  const canvas = document.getElementById('canvas');
  const ctx    = canvas.getContext('2d');

  // Offscreen grid cache — must be declared before resize() is called below
  let gridCache      = null;
  let gridCacheDirty = true;

  // Gradient / hex caches — also declared before resize() to avoid TDZ errors
  const _hexRgbCache = {};
  let   _breakthroughGrad = null;
  let   _godModeGrad      = null;
  let   _godModeGradColor = null;
  let   _bannerGrad       = null;
  let   _bannerGradW      = 0;
  let   _bgFillStyle      = '';
  let   _bgFillKey        = -1;
  let   _bgFillLv         = -1;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    gridCacheDirty    = true;
    _breakthroughGrad = null;
    _godModeGrad      = null;
    _bannerGrad       = null;
    _bannerGradW      = 0;
    _bgFillKey        = -1;
    _bgFillLv         = -1;
  }
  window.addEventListener('resize', resize);
  resize();

  // ── PERFORMANCE TIER ─────────────────────────────────────────────────────────
  // Detect low-end / mobile: reduce particles, shadowBlur, skip grid & trail
  const isMobile  = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 600;
  const PERF_LOW  = isMobile || (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 4);
  const MAX_PARTS = PERF_LOW ? 30  : 180;
  const MAX_BOLTS = PERF_LOW ? 3   : 7;
  const TRAIL_LEN = PERF_LOW ? 8   : 18;
  const BLUR_MULT = PERF_LOW ? 0.4 : 1.0;   // scale all shadowBlur values

  // At level 3+ every GPU compositing pass from shadowBlur stalls the frame.
  // liveBlur() returns 0 above that threshold so arcs stroke without a blur pass.
  function liveBlur(blur) {
    if (PERF_LOW)      return 0;
    if (levelIdx >= 2) return 0;
    return blur * BLUR_MULT;
  }

  // ── RESPONSIVE MEASUREMENTS ─────────────────────────────────────────────────

  function shortSide()    { return Math.min(canvas.width, canvas.height); }
  function targetRadius() {
    const base = isMobile ? 0.24 : 0.21;
    return Math.min(shortSide() * base, 115);
  }
  function spawnRadius()  { return shortSide() * (isMobile ? 0.48 : 0.44); }
  // Normalise all pixel-speed values to a 600 px reference short-side so the
  // game plays at identical timing on every screen size.
  function screenScale()  { return shortSide() / 600; }

  // ── LEVEL DEFINITIONS ───────────────────────────────────────────────────────

  const LEVELS = [
    {
      accent: '#FF6B00', name: 'EMBER',   subtitle: 'the first spark.',
      hitsNeeded: 8,  perfectWin: 9,  goodWin: 20,
      baseSpeed: 105, maxSpeed: 180,  speedStep: 9,
      behavior: 'normal', bgTint: [8, 2, 0, 1],
    },
    {
      accent: '#FF8C00', name: 'FLAME',   subtitle: 'heat is rising.',
      hitsNeeded: 10, perfectWin: 9,  goodWin: 18,
      baseSpeed: 130, maxSpeed: 220,  speedStep: 10,
      behavior: 'wave', bgTint: [12, 4, 0, 1],
    },
    {
      accent: '#FFD700', name: 'HEAT',    subtitle: 'temperature critical.',
      hitsNeeded: 12, perfectWin: 8,  goodWin: 17,
      baseSpeed: 155, maxSpeed: 260,  speedStep: 11,
      behavior: 'wave', bgTint: [16, 8, 0, 1],
    },
    {
      accent: '#FF4500', name: 'BLAZE',   subtitle: 'burning out of control.',
      hitsNeeded: 14, perfectWin: 7,  goodWin: 16,
      baseSpeed: 180, maxSpeed: 300,  speedStep: 12,
      behavior: 'stutter', bgTint: [18, 3, 0, 1],
    },
    {
      accent: '#FF2200', name: 'INFERNO', subtitle: 'no way back.',
      hitsNeeded: 16, perfectWin: 7,  goodWin: 15,
      baseSpeed: 210, maxSpeed: 340,  speedStep: 12,
      behavior: 'ghost', bgTint: [20, 2, 0, 1],
    },
    {
      accent: '#CC0000', name: 'FORGE',   subtitle: 'pressure becomes power.',
      hitsNeeded: 18, perfectWin: 6,  goodWin: 13,
      baseSpeed: 250, maxSpeed: 390,  speedStep: 13,
      behavior: 'stutter', bgTint: [18, 0, 0, 1],
    },
    {
      accent: '#FFF4E0', name: 'PLASMA',  subtitle: 'beyond the flame.',
      hitsNeeded: 999, perfectWin: 5, goodWin: 12,
      baseSpeed: 290, maxSpeed: 460,  speedStep: 14,
      behavior: 'near-invisible', bgTint: [22, 12, 6, 1],
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

  let phase         = 'intro';   // starts with lore intro now
  let score         = 0;
  let combo         = 0;
  let hitCount      = 0;
  let levelHits     = 0;
  let levelIdx      = 0;
  let lives         = 3;
  let perfectStreak = 0;
  let speed         = LEVELS[0].baseSpeed;
  let highScore     = parseInt(localStorage.getItem('pulse_hs') || '0');
  // Highest rank index ever reached (-1 = never finished a level, 0 = DRONE achieved, etc.)
  // We store the rankKey string so it survives LEVELS array changes
  let highRankIdx   = parseInt(localStorage.getItem('pulse_hr') || '-1');

  // Lore intro state
  let introLineIdx  = 0;
  let introCharIdx  = 0;
  let introT        = 0;
  let introDisplayLines = [];   // lines fully typed so far
  let introDone     = false;
  let introSkipped  = false;

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
  // ringTrail replaced by a fixed circular buffer — zero heap allocation per frame.
  // _trailR / _trailO store radius and opacity values; _trailHead is the write pointer.
  const _trailR    = new Float32Array(TRAIL_LEN);
  const _trailO    = new Float32Array(TRAIL_LEN);
  let   _trailHead = 0;
  let   _trailSize = 0;   // valid entries (ramps up to TRAIL_LEN, then stays there)
  // Legacy alias kept so spawnRing / triggerLevelUp / deactivateGodMode can still
  // call "clearTrail()" without a refactor — we just reset the counters instead.
  const ringTrail  = { get length() { return _trailSize; } };
  let shockwaves     = [];   // expanding rings [{r, alpha, color, lw, speed}]
  let lightningBolts = [];   // zigzag sparks [{points, alpha, color}]
  let chromaT        = 0;    // chromatic aberration intensity
  let heartbeatT     = 0;    // center dot pulse phase

  const SPEED_PIPS = 9;

  // ── HELPERS ──────────────────────────────────────────────────────────────────

  function currentLevel() { return LEVELS[Math.min(levelIdx, LEVELS.length - 1)]; }

  // Trail buffer helpers — used instead of array push/shift/slice
  function clearTrail()              { _trailHead = 0; _trailSize = 0; }
  function pushTrail(r, o) {
    _trailR[_trailHead] = r;
    _trailO[_trailHead] = o;
    _trailHead = (_trailHead + 1) % TRAIL_LEN;
    if (_trailSize < TRAIL_LEN) _trailSize++;
  }

  function setAccent(hex) {
    document.documentElement.style.setProperty('--accent', hex);
  }

  function hexToRgb(hex) {
    if (_hexRgbCache[hex]) return _hexRgbCache[hex];
    const v = [
      parseInt(hex.slice(1,3), 16),
      parseInt(hex.slice(3,5), 16),
      parseInt(hex.slice(5,7), 16),
    ];
    _hexRgbCache[hex] = v;
    return v;
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
  const levelMapEl   = document.getElementById('level-map');

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
    lifePips.forEach((heart, i) => {
      const wasLost = heart.classList.contains('lost');
      const isLost  = i >= lives;
      if (!wasLost && isLost) {
        // just lost this heart
        heart.classList.add('losing');
        setTimeout(() => {
          heart.classList.remove('losing');
          heart.classList.add('lost');
        }, 400);
      } else if (wasLost && !isLost) {
        // heart regained
        heart.classList.remove('lost');
        heart.classList.add('gained');
        setTimeout(() => heart.classList.remove('gained'), 560);
      }
    });
  }

  function updateLevelHud() {
    updateLevelMap();
  }

  // ── LEVEL MAP ────────────────────────────────────────────────────────────────

  let _levelMapDirty    = false;
  let _levelMapLastTime = 0;

  function updateLevelMap() {
    _levelMapDirty = true;
  }

  function buildLevelMap() {
    if (!levelMapEl) return;
    levelMapEl.innerHTML = '';

    // Compact windowed map: shows a 5-slot window around current level
    // We build static DOM; flushLevelMap updates content + styles dynamically
    // Slots: [prev-2] [prev-1] [CURRENT] [next-1] [next-2]
    // Only current + next-1 are clearly legible; rest are ghost/blurred

    for (let slot = 0; slot < 5; slot++) {
      const node = document.createElement('div');
      node.className = 'lm-slot';
      node.id = `lmslot-${slot}`;

      const dot = document.createElement('div');
      dot.className = 'lm-dot';
      dot.id = `lmdot-${slot}`;

      const namEl = document.createElement('div');
      namEl.className = 'lm-sname';
      namEl.id = `lmsname-${slot}`;

      const prog = document.createElement('div');
      prog.className = 'lm-prog';
      prog.id = `lmprog-${slot}`;
      const progFill = document.createElement('div');
      progFill.className = 'lm-prog-fill';
      progFill.id = `lmprogfill-${slot}`;
      prog.appendChild(progFill);

      node.appendChild(dot);
      node.appendChild(namEl);
      node.appendChild(prog);
      levelMapEl.appendChild(node);
    }

    _levelMapDirty = true;
  }

  function flushLevelMap(now) {
    if (!_levelMapDirty) return;
    if (now - _levelMapLastTime < 100) return;
    _levelMapLastTime = now;
    _levelMapDirty    = false;

    if (!levelMapEl) return;
    const lv     = currentLevel();
    const isLast = levelIdx >= LEVELS.length - 1;

    // Window: slots 0-4 map to levelIdx offsets [-2, -1, 0, +1, +2]
    for (let slot = 0; slot < 5; slot++) {
      const offset   = slot - 2;          // -2 .. +2
      const lvI      = levelIdx + offset;
      const dot      = document.getElementById(`lmdot-${slot}`);
      const namEl    = document.getElementById(`lmsname-${slot}`);
      const progFill = document.getElementById(`lmprogfill-${slot}`);
      const slotEl   = document.getElementById(`lmslot-${slot}`);

      if (!dot || !namEl || !progFill || !slotEl) continue;

      const isCurrent = offset === 0;
      const isNext    = offset === 1;
      const isPrev    = offset === -1;
      const isGhost   = Math.abs(offset) >= 2;

      if (lvI < 0 || lvI >= LEVELS.length) {
        // Out of range — hide slot
        slotEl.style.opacity = '0';
        slotEl.style.visibility = 'hidden';
        continue;
      }

      slotEl.style.visibility = 'visible';
      const lvDef = LEVELS[lvI];

      // Opacity tiers
      if (isCurrent)    slotEl.style.opacity = '1';
      else if (isNext)  slotEl.style.opacity = '0.45';
      else if (isPrev)  slotEl.style.opacity = '0.25';
      else              slotEl.style.opacity = '0.10';

      // Dot color + glow
      if (isCurrent) {
        dot.style.background  = lvDef.accent;
        dot.style.boxShadow   = `0 0 6px ${lvDef.accent}, 0 0 12px ${lvDef.accent}60`;
        dot.style.transform   = 'scale(1.0)';
      } else if (lvI < levelIdx) {
        // Completed level
        dot.style.background  = lvDef.accent;
        dot.style.boxShadow   = `0 0 3px ${lvDef.accent}50`;
        dot.style.transform   = 'scale(0.65)';
      } else {
        // Future level
        dot.style.background  = 'rgba(0,255,178,0.12)';
        dot.style.boxShadow   = 'none';
        dot.style.transform   = isNext ? 'scale(0.72)' : 'scale(0.55)';
      }

      // Name
      namEl.textContent = lvDef.name;
      if (isCurrent) {
        namEl.style.color      = lvDef.accent;
        namEl.style.textShadow = `0 0 6px ${lvDef.accent}`;
      } else {
        namEl.style.color      = 'rgba(0,255,178,0.5)';
        namEl.style.textShadow = 'none';
      }

      // Progress fill — horizontal bar, width grows left→right
      if (isCurrent) {
        const prog = isLast
          ? (levelHits % 30) / 30
          : Math.min(levelHits / lv.hitsNeeded, 1);
        progFill.style.width      = (prog * 100) + '%';
        progFill.style.height     = '100%';
        progFill.style.background = lv.accent;
        progFill.style.boxShadow  = `0 0 4px ${lv.accent}`;
        progFill.style.opacity    = '1';
      } else if (lvI < levelIdx) {
        progFill.style.width      = '100%';
        progFill.style.height     = '100%';
        progFill.style.background = lvDef.accent;
        progFill.style.boxShadow  = 'none';
        progFill.style.opacity    = '0.5';
      } else {
        progFill.style.width     = '0%';
        progFill.style.boxShadow = 'none';
      }
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
    clearTrail(); shockwaves = []; lightningBolts = [];
    chromaT = 0; heartbeatT = 0;
    hudScoreEl.classList.remove('breakthrough', 'godmode');
    canvas.style.filter = '';

    const lv = currentLevel();
    speed = lv.baseSpeed;
    setAccent(lv.accent);

    // Remove verdict overlay if present
    const ovl = document.getElementById('vreth-overlay');
    if (ovl) ovl.remove();
    matrixActive = false;
    if (matrixRaf) { cancelAnimationFrame(matrixRaf); matrixRaf = null; }

    startScreen.style.display = 'none';
    goScreen.className         = 'screen-hidden';
    hudEl.classList.remove('hidden');
    livesHudEl.classList.remove('hidden');
    buildLevelMap();
    levelMapEl.classList.remove('hidden');
    speedBar.classList.add('visible');

    bestValEl.textContent = highScore;
    lifePips.forEach(h => { h.classList.remove('lost','gained','losing'); });
    updateHUD(); updatePips(); updateLivesUI(); updateLevelHud();
    spawnRing();
  }

  // ── MATRIX VERDICT SEQUENCE ──────────────────────────────────────────────────

  let matrixRaf    = null;   // animation frame handle for matrix
  let matrixActive = false;

  function runVerdictSequence(rankEarned, score, highScore, newBest) {
    // ── Phase 1: blackout flash ──────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.id = 'vreth-overlay';
    overlay.style.cssText = [
      'position:fixed','inset:0','z-index:999',
      'background:#000','display:flex','flex-direction:column',
      'align-items:center','justify-content:center',
      'font-family:"Press Start 2P",monospace',
      'overflow:hidden','opacity:0',
      'transition:opacity 0.18s ease',
    ].join(';');
    document.body.appendChild(overlay);

    // Force reflow then fade in to black
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });

    // ── Phase 2: Matrix rain canvas ──────────────────────────────────────────
    const matCanvas = document.createElement('canvas');
    matCanvas.style.cssText = 'position:absolute;inset:0;opacity:0;transition:opacity 0.4s ease;';
    overlay.appendChild(matCanvas);

    // ── Phase 3: Analysis text panel ─────────────────────────────────────────
    const analysisEl = document.createElement('div');
    analysisEl.style.cssText = [
      'position:relative','z-index:2','text-align:left',
      'width:min(420px,88vw)','padding:0 8px',
      'color:#00FFB2','font-size:clamp(0.26rem,1.2vw,0.34rem)',
      'letter-spacing:0.12em','line-height:2.4',
    ].join(';');
    overlay.appendChild(analysisEl);

    // ── Build analysis lines ──────────────────────────────────────────────────
    const analysisLines = [
      { text: '> VRETH CLASSIFICATION ENGINE v7.3.1',  delay: 0,    color: '#00FFB2' },
      { text: '> SCANNING NEURAL SIGNATURE...',         delay: 320,  color: '#00FFB2' },
      { text: `> RAW REFLEX INDEX: ${score}`,           delay: 780,  color: '#00CFFF' },
      { text: `> PEAK RECORDED:    ${highScore}`,       delay: 1080, color: '#00CFFF' },
      { text: '> CROSS-REF AGAINST 8.1B SUBJECTS...',  delay: 1400, color: '#00FFB2' },
      { text: '> PATTERN MATCH COMPLETE.',              delay: 2000, color: '#00FFB2' },
      { text: '> ASSIGNING CASTE...',                   delay: 2450, color: '#FFD700' },
    ];

    // ── Start matrix rain after 300 ms ───────────────────────────────────────
    setTimeout(() => {
      matCanvas.style.opacity = '0.22';
      const mctx = matCanvas.getContext('2d');
      matCanvas.width  = window.innerWidth;
      matCanvas.height = window.innerHeight;

      const cols    = Math.floor(matCanvas.width / 14);
      const drops   = Array.from({ length: cols }, () => Math.random() * -80);
      const CHARS   = 'VRETH01ΨΦΩ∑⟁▓░▒∂∇◈⟐⬡⬢01101001ABCDEF'.split('');
      matrixActive  = true;

      function matrixFrame() {
        if (!matrixActive) return;
        mctx.fillStyle = 'rgba(0,0,0,0.13)';
        mctx.fillRect(0, 0, matCanvas.width, matCanvas.height);
        mctx.font = '13px "Press Start 2P", monospace';
        drops.forEach((y, i) => {
          const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
          const bright = Math.random() > 0.92;
          mctx.fillStyle = bright ? '#FFFFFF' : '#00FFB2';
          mctx.globalAlpha = bright ? 0.95 : 0.55 + Math.random() * 0.3;
          mctx.fillText(ch, i * 14, y * 14);
          mctx.globalAlpha = 1;
          if (y * 14 > matCanvas.height && Math.random() > 0.96) drops[i] = 0;
          drops[i] += 0.6;
        });
        matrixRaf = requestAnimationFrame(matrixFrame);
      }
      matrixFrame();
    }, 300);

    // ── Typewrite analysis lines ──────────────────────────────────────────────
    analysisLines.forEach(({ text, delay, color }) => {
      setTimeout(() => {
        const line = document.createElement('div');
        line.style.color = color;
        line.style.whiteSpace = 'pre';
        analysisEl.appendChild(line);

        let i = 0;
        const iv = setInterval(() => {
          line.textContent = text.slice(0, ++i);
          if (i >= text.length) clearInterval(iv);
        }, 22);

        // Play subtle tick sound
        try {
          const a = ac();
          const o = a.createOscillator();
          const g = a.createGain();
          o.connect(g); g.connect(a.destination);
          o.type = 'square'; o.frequency.value = 120 + Math.random() * 60;
          const t = a.currentTime;
          g.gain.setValueAtTime(0.04, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
          o.start(t); o.stop(t + 0.07);
        } catch (_) {}
      }, delay);
    });

    // ── Phase 4: Verdict reveal after analysis ────────────────────────────────
    const VERDICT_DELAY = 3200;

    setTimeout(() => {
      // Stop matrix rain, fade out
      matrixActive = false;
      if (matrixRaf) { cancelAnimationFrame(matrixRaf); matrixRaf = null; }
      matCanvas.style.opacity = '0';

      // Clear analysis, show verdict
      analysisEl.innerHTML = '';
      analysisEl.style.textAlign = 'center';
      analysisEl.style.width = '100%';

      // SUBJECT CLASSIFIED header
      const header = document.createElement('div');
      header.style.cssText = [
        `color:#00FFB2`,
        'font-size:clamp(0.28rem,1.1vw,0.36rem)',
        'letter-spacing:0.35em',
        'margin-bottom:18px',
        'text-shadow:0 0 12px #00FFB2',
        'animation:vFlicker 2s steps(2) infinite',
      ].join(';');
      header.textContent = '── SUBJECT CLASSIFIED ──';
      analysisEl.appendChild(header);

      // Score
      const scoreLabel = document.createElement('div');
      scoreLabel.style.cssText = 'color:rgba(0,255,178,0.5);font-size:clamp(0.26rem,1vw,0.32rem);letter-spacing:0.28em;margin-bottom:4px;';
      scoreLabel.textContent = 'NEURAL SCORE';
      analysisEl.appendChild(scoreLabel);

      const scoreBig = document.createElement('div');
      scoreBig.style.cssText = [
        'color:#FFF4E0',
        'font-size:clamp(2.4rem,10vw,5rem)',
        'text-shadow:4px 4px 0 #FF4500,8px 8px 0 rgba(255,69,0,0.35)',
        'line-height:1',
        'margin-bottom:6px',
      ].join(';');
      scoreBig.textContent = score;
      analysisEl.appendChild(scoreBig);

      if (newBest) {
        const badge = document.createElement('div');
        badge.style.cssText = 'color:#FFD700;font-size:0.36rem;letter-spacing:0.18em;margin-bottom:10px;text-shadow:0 0 14px #FFD700;';
        badge.textContent = '★ SIGNAL ANOMALY ★';
        analysisEl.appendChild(badge);
      }

      // Divider
      const div1 = document.createElement('div');
      div1.style.cssText = 'width:40px;height:1px;background:rgba(0,255,178,0.25);margin:10px auto;';
      analysisEl.appendChild(div1);

      // Rank title — big, alien, coloured
      const rankLabel = document.createElement('div');
      rankLabel.style.cssText = 'color:rgba(0,255,178,0.45);font-size:clamp(0.26rem,1vw,0.32rem);letter-spacing:0.30em;margin-bottom:6px;';
      rankLabel.textContent = 'CASTE ASSIGNED';
      analysisEl.appendChild(rankLabel);

      const rankTitle = document.createElement('div');
      rankTitle.style.cssText = [
        `color:${rankEarned.color}`,
        'font-size:clamp(1.1rem,4.5vw,2.2rem)',
        'letter-spacing:0.22em',
        `text-shadow:3px 3px 0 rgba(0,0,0,0.8),0 0 30px ${rankEarned.color}`,
        'margin-bottom:8px',
        'animation:rankReveal 0.6s steps(8) ease-out',
      ].join(';');
      rankTitle.textContent = rankEarned.title;
      analysisEl.appendChild(rankTitle);

      // Alien verdict — typewritten
      const verdictText = document.createElement('div');
      verdictText.style.cssText = [
        'color:rgba(0,255,178,0.45)',
        'font-size:clamp(0.22rem,0.9vw,0.30rem)',
        'letter-spacing:0.08em',
        'max-width:320px',
        'margin:0 auto 16px',
        'line-height:2.2',
        'animation:verdictIn 1s steps(24) ease-out',
      ].join(';');
      verdictText.textContent = rankEarned.alien;
      analysisEl.appendChild(verdictText);

      // Divider
      const div2 = document.createElement('div');
      div2.style.cssText = 'width:40px;height:1px;background:rgba(0,255,178,0.20);margin:8px auto 16px;';
      analysisEl.appendChild(div2);

      // Retry button
      const btn = document.createElement('button');
      btn.style.cssText = [
        'font-family:"Press Start 2P",monospace',
        'font-size:0.44rem',
        'letter-spacing:0.14em',
        'color:#080200',
        'background:#FFF4E0',
        'border:none',
        'padding:14px 28px',
        'cursor:pointer',
        'margin-top:6px',
        'box-shadow:4px 4px 0 #FF4500,8px 8px 0 rgba(255,69,0,0.35)',
        'position:relative',
        'min-height:48px',
        'min-width:160px',
      ].join(';');
      btn.textContent = 'RETEST SUBJECT';
      btn.addEventListener('click', () => {
        matrixActive = false;
        if (matrixRaf) { cancelAnimationFrame(matrixRaf); matrixRaf = null; }
        overlay.remove();
        startGame();
      });
      // hover style via JS since we can't use a stylesheet here easily
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#FF8C00';
        btn.style.boxShadow  = '4px 4px 0 #CC5500,8px 8px 0 rgba(255,69,0,0.5),0 0 30px rgba(255,140,0,0.4)';
        btn.style.transform  = 'translate(-1px,-1px)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = '#FFF4E0';
        btn.style.boxShadow  = '4px 4px 0 #FF4500,8px 8px 0 rgba(255,69,0,0.35)';
        btn.style.transform  = '';
      });
      btn.addEventListener('mousedown',  () => { btn.style.transform = 'translate(4px,4px)'; btn.style.boxShadow = 'none'; });
      btn.addEventListener('mouseup',    () => { btn.style.transform = ''; });
      analysisEl.appendChild(btn);

      // Inject keyframe styles once
      if (!document.getElementById('vreth-verdict-styles')) {
        const st = document.createElement('style');
        st.id = 'vreth-verdict-styles';
        st.textContent = `
          @keyframes vFlicker {
            0%,88%,92%,96%,100%{opacity:1}
            90%,94%{opacity:0.25}
          }
          @keyframes rankReveal {
            from{clip-path:inset(0 100% 0 0);opacity:0}
            to{clip-path:inset(0 0% 0 0);opacity:1}
          }
          @keyframes verdictIn {
            from{clip-path:inset(0 100% 0 0)}
            to{clip-path:inset(0 0% 0 0)}
          }
        `;
        document.head.appendChild(st);
      }

      // Update the hidden goScreen too (so retry from original btn still works)
      document.getElementById('final-score').textContent = score;
      document.getElementById('final-best').textContent  = highScore;

    }, VERDICT_DELAY);
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

    const rankEarned = levelIdx === 0
      ? LORE.drone
      : LORE.ranks[Math.min(levelIdx - 1, LORE.ranks.length - 1)];

    // Persist highest rank: drone = index -1 special, ranks start at 0
    const earnedRankIdx = levelIdx === 0 ? -1 : Math.min(levelIdx - 1, LORE.ranks.length - 1);
    if (earnedRankIdx > highRankIdx) {
      highRankIdx = earnedRankIdx;
      localStorage.setItem('pulse_hr', highRankIdx);
    }

    livesHudEl.classList.add('hidden');
    levelMapEl.classList.add('hidden');
    speedBar.classList.remove('visible');
    hudEl.classList.add('hidden');

    // Remove any pre-existing overlay from a previous round
    const old = document.getElementById('vreth-overlay');
    if (old) old.remove();

    // Short delay so the red death flash registers first, then sequence begins
    setTimeout(() => runVerdictSequence(rankEarned, score, highScore, newBest), 420);
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
    clearTrail();
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
      age:          0,   // frames alive — prevents false auto-miss on first tick
    };
    clearTrail();
    // Reset flashCol so any residual red tint from a previous miss/game-over
    // can't bleed into the first frame of the new ring.
    flashCol = '#ffffff';
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
    pushFeedback(LORE.neuralOverdrive, '#FFFFFF', cx, cy - targetRadius() - 72);
  }

  function deactivateGodMode() {
    godMode = false;
    SFX.godModeOff();
    flashA = 0.14; flashCol = '#888888';
    hudScoreEl.classList.remove('godmode');
    canvas.style.filter = '';
    clearTrail();
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    pushFeedback('BROKEN', 'rgba(255,255,255,0.45)', cx, cy - targetRadius() - 72);
  }

  // ── TAP / HIT DETECTION ──────────────────────────────────────────────────────

  function onInput() {
    if (phase === 'intro') {
      if (!introDone) {
        // Skip to end of typing
        introDisplayLines = [...LORE.intro];
        introDone  = true;
        // Compress remaining time so auto-transition fires soon
        const typingDuration = LORE.intro.reduce((s, l) => s + l.length, 0) / 28;
        introT = typingDuration;
      } else {
        // Already done — go to idle immediately
        phase = 'idle';
        startScreen.style.display = '';
      }
      return;
    }
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
    const sc   = screenScale();

    if (diff <= lv.perfectWin * sc)   registerHit('PERFECT', lv.accent, 10, true);
    else if (diff <= lv.goodWin * sc) registerHit('GOOD', '#FFD166', 5, false);
    else                               registerMiss();
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
    pushFeedback(label, color, cx, cy - targetRadius() - 28);
    flashA   = isPerfect ? 0.12 : 0.06;
    flashCol = color;

    // Lightning bolts at high combo
    if (isPerfect && combo >= 5) spawnLightning(cx, cy);

    if (isPerfect) SFX.perfect(); else SFX.good();

    ring = null; clearTrail();
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
      ring = null; clearTrail();
      spawnRing();
    }
  }

  // ── PARTICLES ────────────────────────────────────────────────────────────────

  function spawnBurst(cx, cy, color, count) {
    const tr  = targetRadius();
    // Reduce particle count at high speed to maintain frame rate
    const cap = speed > 280 ? Math.min(MAX_PARTS, 40) : MAX_PARTS;
    const n   = Math.min(count, cap - parts.length);
    for (let i = 0; i < n; i++) {
      const angle    = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
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
    // Fewer long-lived particles at high levels to avoid draw-budget stacking
    const count = PERF_LOW ? 40 : (levelIdx >= 3 ? 55 : 150);
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
        decay: (levelIdx >= 3 ? 0.018 : 0.005) + Math.random() * 0.011,
        r: 1.5 + Math.random() * 4.5,
        color,
      });
    }
  }

  // ── LIGHTNING ────────────────────────────────────────────────────────────────

  function spawnLightning(cx, cy) {
    const lv    = currentLevel();
    const tr    = targetRadius();
    const count = Math.min(2 + Math.floor((combo - 5) / 2), MAX_BOLTS);

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

    // Show best rank ever reached
    const bestRankEl = document.getElementById('best-rank-val');
    if (bestRankEl) {
      if (highRankIdx === -1) {
        bestRankEl.textContent = '—';
        bestRankEl.style.color = 'rgba(255,244,224,0.18)';
      } else {
        const br = LORE.ranks[highRankIdx];
        bestRankEl.textContent = br.title;
        bestRankEl.style.color = br.color;
      }
    }

    if (combo >= 2) {
      comboValEl.textContent = combo;
      hudComboEl.classList.remove('hidden');
    } else {
      hudComboEl.classList.add('hidden');
    }
    updateLevelMap();
  }

  // ── UPDATE ───────────────────────────────────────────────────────────────────

  function update(dt) {
    // ── LORE INTRO UPDATE ──────────────────────────────────────────────────────
    if (phase === 'intro') {
      introT += dt;
      if (!introDone) {
        const CHARS_PER_SEC = 28;
        const totalChars = LORE.intro.reduce((s, l) => s + l.length, 0);
        const elapsed    = introT * CHARS_PER_SEC;
        let   charBudget = Math.floor(elapsed);
        let   lineI = 0, charI = 0;

        for (let i = 0; i < LORE.intro.length; i++) {
          if (charBudget <= 0) break;
          const take = Math.min(charBudget, LORE.intro[i].length);
          charBudget -= take;
          lineI = i;
          charI = take;
        }

        // Rebuild display lines
        introDisplayLines = [];
        for (let i = 0; i < lineI; i++) introDisplayLines.push(LORE.intro[i]);
        if (charI > 0) introDisplayLines.push(LORE.intro[lineI].slice(0, charI));

        if (lineI >= LORE.intro.length - 1 && charI >= LORE.intro[LORE.intro.length - 1].length) {
          introDone = true;
        }
      } else {
        // After typing done, wait 1.8s then auto-transition to idle
        if (introT > (LORE.intro.reduce((s, l) => s + l.length, 0) / 28) + 1.8) {
          phase = 'idle';
          startScreen.style.display = '';
        }
      }
      return;
    }

    if (flashA > 0) flashA = Math.max(0, flashA - dt * 2.8);
    shakeX *= 0.74; shakeY *= 0.74;
    if (Math.abs(shakeX) < 0.05) shakeX = 0;
    if (Math.abs(shakeY) < 0.05) shakeY = 0;

    // Chromatic aberration — draw as canvas overlay, no CSS filter (avoids GPU composite)
    if (chromaT > 0) {
      chromaT = Math.max(0, chromaT - dt * 2.4);
    }

    // Particles — update in-place to avoid per-frame array allocation
    let pi = parts.length;
    while (pi--) {
      const p = parts[pi];
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.92; p.vy *= 0.92;
      p.life -= p.decay;
      if (p.life <= 0) parts.splice(pi, 1);
    }

    // Feedbacks — in-place
    let fi = feedbacks.length;
    while (fi--) {
      const f = feedbacks[fi];
      f.y    += f.vy;
      f.alpha -= dt * 1.4;
      if (f.alpha <= 0) feedbacks.splice(fi, 1);
    }

    // Shockwaves — in-place
    let si = shockwaves.length;
    while (si--) {
      const s = shockwaves[si];
      s.r     += s.spd * dt;
      s.alpha -= dt * 1.15;
      if (s.alpha <= 0) shockwaves.splice(si, 1);
    }

    // Lightning fade — in-place
    let li = lightningBolts.length;
    while (li--) {
      lightningBolts[li].alpha -= dt * 5.5;
      if (lightningBolts[li].alpha <= 0) lightningBolts.splice(li, 1);
    }

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

    ring.radius -= effectiveSpeed * screenScale() * dt;
    ring.age    += 1;

    // Update God Mode comet trail — circular buffer write, no heap allocation
    if (godMode) {
      pushTrail(ring.radius, ring.opacity ?? 1);
    }

    // Auto-miss: passed through target zone.
    // age > 2 guard prevents a large first-frame dt from instantly overshooting.
    if (ring.age > 2 && ring.radius < targetRadius() - (lv.goodWin + 6) * screenScale()) registerMiss();
  }

  // ── DRAW HELPERS ─────────────────────────────────────────────────────────────

  function circle(x, y, r, strokeColor, lineWidth, blur) {
    const lb = liveBlur(blur);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth   = lineWidth;
    if (lb > 0) { ctx.shadowColor = strokeColor; ctx.shadowBlur = lb; }
    ctx.beginPath();
    ctx.arc(x, y, Math.max(r, 0), 0, Math.PI * 2);
    ctx.stroke();
    if (lb > 0) ctx.shadowBlur = 0;
  }

  function dot(x, y, r, color, blur) {
    const lb = liveBlur(blur);
    ctx.fillStyle = color;
    if (lb > 0) { ctx.shadowColor = color; ctx.shadowBlur = lb; }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (lb > 0) ctx.shadowBlur = 0;
  }

  // ── DRAW LORE INTRO ──────────────────────────────────────────────────────────

  function drawLoreIntro() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#080200';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid();

    const cx        = canvas.width / 2;
    const lineH     = Math.min(shortSide() * 0.045, 22);
    const fontSize  = Math.min(shortSide() * 0.018, 9);
    const totalH    = introDisplayLines.length * lineH;
    const startY    = canvas.height / 2 - totalH / 2;

    ctx.save();
    ctx.textAlign     = 'center';
    ctx.font          = `400 ${fontSize}px "Press Start 2P", monospace`;
    ctx.letterSpacing = '0.12em';

    introDisplayLines.forEach((line, i) => {
      const isLast = i === introDisplayLines.length - 1;
      // Last line currently typing: pulse opacity
      const alpha = isLast && !introDone
        ? 0.55 + 0.45 * Math.sin(introT * 8)
        : (i < introDisplayLines.length - 1 ? 1 : 0.9);
      // Color: last line = accent, rest fade from dim to white
      const frac = i / Math.max(introDisplayLines.length - 1, 1);
      const col  = i === introDisplayLines.length - 1 && introDone
        ? '#FF8C00'
        : `rgba(255, ${180 + Math.floor(frac * 60)}, ${120 + Math.floor(frac * 100)}, ${alpha})`;

      ctx.fillStyle   = col;
      ctx.shadowColor = col;
      ctx.shadowBlur  = isLast ? 14 : 4;
      ctx.globalAlpha = alpha;
      ctx.fillText(line, cx, startY + i * lineH);
    });

    // Typing cursor on current line
    if (!introDone && introDisplayLines.length > 0) {
      const curLine = introDisplayLines[introDisplayLines.length - 1];
      const blink   = Math.sin(introT * 10) > 0;
      if (blink) {
        const tw  = ctx.measureText(curLine).width;
        const cx2 = cx + tw / 2 + 4;
        const cy2 = startY + (introDisplayLines.length - 1) * lineH;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle   = '#FF8C00';
        ctx.fillRect(cx2, cy2 - fontSize, 6, fontSize + 2);
      }
    }

    // Skip hint
    if (introT > 1.2) {
      ctx.globalAlpha   = 0.2 + 0.12 * Math.sin(introT * 2.5);
      ctx.fillStyle     = 'rgba(255,244,224,0.5)';
      ctx.shadowBlur    = 0;
      ctx.font          = `400 ${Math.min(fontSize * 0.7, 6)}px "Press Start 2P", monospace`;
      ctx.letterSpacing = '0.18em';
      ctx.fillText('TAP TO SKIP', cx, canvas.height - 40);
    }

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
    const sc   = screenScale();
    const absd = Math.abs(ring.radius - tr);
    const prox = Math.max(0, 1 - absd / (80 * sc));
    const [ar, ag, ab] = hexToRgb(lv.accent);

    let r, g, b;
    if (absd <= lv.perfectWin * sc) {
      [r, g, b] = [ar, ag, ab];
    } else if (absd <= lv.goodWin * sc) {
      const t = (absd - lv.perfectWin * sc) / ((lv.goodWin - lv.perfectWin) * sc);
      r = Math.floor(ar + t * (255 - ar));
      g = Math.floor(ag + t * (209 - ag));
      b = Math.floor(ab + t * (102 - ab));
    } else {
      r = 255; g = 255; b = 255;
    }

    const baseAlpha = ring.opacity ?? 1;
    // Quantise alpha to 8 buckets so the rgba string stays cache-friendly
    const alpha = Math.round(baseAlpha * (0.28 + prox * 0.72) * 8) / 8;
    const blur  = 4 + prox * 22;
    const lw    = 1.5 + prox * 2.5;

    // GOD MODE: comet trail — single save/restore, NO shadowBlur ever
    if (godMode && _trailSize > 0) {
      const visLen = levelIdx >= 2 ? Math.ceil(_trailSize * 0.4) : _trailSize;
      ctx.save();
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = `rgb(${ar},${ag},${ab})`;
      // Read the last `visLen` entries from the circular buffer (oldest first)
      for (let i = 0; i < visLen; i++) {
        const idx   = (_trailHead - visLen + i + TRAIL_LEN) % TRAIL_LEN;
        const frac  = (i + 1) / visLen;
        ctx.globalAlpha = frac * 0.45 * _trailO[idx];
        ctx.lineWidth   = 0.5 + frac * 2.0;
        ctx.beginPath();
        ctx.arc(cx, cy, _trailR[idx], 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
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
      const sc       = screenScale();
      const zoneProx = Math.max(0, 1 - absd / (lv.goodWin * sc * 2.4));
      if (zoneProx > 0) {
        const [ar, ag, ab] = hexToRgb(lv.accent);
        ctx.globalAlpha = zoneProx * 0.09;
        ctx.fillStyle   = `rgb(${ar},${ag},${ab})`;
        ctx.beginPath();
        ctx.arc(cx, cy, tr + lv.goodWin, 0, Math.PI * 2);
        ctx.arc(cx, cy, Math.max(0, tr - lv.goodWin), 0, Math.PI * 2, true);
        ctx.fill('evenodd');
        ctx.globalAlpha = 1;
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
    ctx.shadowBlur  = liveBlur(5);
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
    if (parts.length === 0) return;
    const useShadow = !PERF_LOW && levelIdx < 2;
    ctx.save();
    ctx.shadowBlur = 0;
    let lastColor = null;
    let lastAlpha = -1;
    parts.forEach(p => {
      // Quantise alpha to 32 buckets to minimise ctx.globalAlpha writes
      const rawA     = Math.pow(p.life, 1.4);
      if (rawA < 0.02) return;                     // skip invisible particles
      const quantA   = Math.round(rawA * 32) / 32;
      if (quantA !== lastAlpha) {
        ctx.globalAlpha = quantA;
        lastAlpha = quantA;
      }
      if (p.color !== lastColor) {
        ctx.fillStyle = p.color;
        if (useShadow) { ctx.shadowColor = p.color; ctx.shadowBlur = 5; }
        lastColor = p.color;
      }
      const sz = p.r * 2;
      ctx.fillRect(
        Math.round(p.x + shakeX - p.r),
        Math.round(p.y + shakeY - p.r),
        Math.round(sz), Math.round(sz)
      );
    });
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawFeedbacks() {
    if (feedbacks.length === 0) return;
    ctx.save();
    ctx.font          = '400 9px "Press Start 2P", monospace';
    ctx.textAlign     = 'center';
    ctx.letterSpacing = '0.06em';
    ctx.shadowBlur    = 0;
    feedbacks.forEach(f => {
      ctx.globalAlpha = Math.max(0, f.alpha);
      ctx.fillStyle   = f.color;
      ctx.fillText(f.text, f.x + shakeX, f.y + shakeY);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── DRAW GRID ────────────────────────────────────────────────────────────────
  // Grid is static — render once to an offscreen canvas and blit every frame.
  // On iPad (PERF_LOW) we skip the grid entirely.
  // On desktop we still blit every frame since the background clears the canvas,
  // but we skip the expensive offscreen-canvas REBUILD when the size hasn't changed.

  function drawGrid() {
    if (PERF_LOW) return;

    if (gridCacheDirty || !gridCache ||
        gridCache.width !== canvas.width || gridCache.height !== canvas.height) {
      gridCache        = document.createElement('canvas');
      gridCache.width  = canvas.width;
      gridCache.height = canvas.height;
      const gctx = gridCache.getContext('2d');
      const step    = 48;
      const bigStep = step * 4;

      // Minor grid — all lines in a single path
      gctx.strokeStyle = 'rgba(255,140,0,0.04)';
      gctx.lineWidth   = 1;
      gctx.beginPath();
      for (let x = 0; x < canvas.width;  x += step) { gctx.moveTo(x, 0); gctx.lineTo(x, canvas.height); }
      for (let y = 0; y < canvas.height; y += step) { gctx.moveTo(0, y); gctx.lineTo(canvas.width, y);  }
      gctx.stroke();

      // Major grid — single path
      gctx.strokeStyle = 'rgba(255,140,0,0.07)';
      gctx.beginPath();
      for (let x = 0; x < canvas.width;  x += bigStep) { gctx.moveTo(x, 0); gctx.lineTo(x, canvas.height); }
      for (let y = 0; y < canvas.height; y += bigStep) { gctx.moveTo(0, y); gctx.lineTo(canvas.width, y);  }
      gctx.stroke();

      gridCacheDirty = false;
    }

    ctx.drawImage(gridCache, 0, 0);
  }

  // ── DRAW SHOCKWAVES ──────────────────────────────────────────────────────────

  function drawShockwaves(cx, cy) {
    if (shockwaves.length === 0) return;
    const scx = cx + shakeX, scy = cy + shakeY;
    // Batch: group by color, no shadowBlur (too expensive at level 3+)
    ctx.save();
    shockwaves.forEach(s => {
      const [r, g, b] = hexToRgb(s.color);
      ctx.globalAlpha = s.alpha;
      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.lineWidth   = Math.max(0.2, s.lw * s.alpha * 2.2);
      ctx.beginPath();
      ctx.arc(scx, scy, Math.max(0, s.r), 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── DRAW LIGHTNING ───────────────────────────────────────────────────────────

  function drawLightning() {
    if (lightningBolts.length === 0) return;
    ctx.save();
    ctx.lineWidth   = 1.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.shadowBlur  = 0;
    lightningBolts.forEach(bolt => {
      ctx.globalAlpha = bolt.alpha;
      ctx.strokeStyle = bolt.color;
      ctx.beginPath();
      bolt.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x + shakeX, p.y + shakeY);
        else         ctx.lineTo(p.x + shakeX, p.y + shakeY);
      });
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.restore();
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

    // Horizontal gradient bar — reuse if canvas width unchanged
    const barH = 40;
    if (!_bannerGrad || _bannerGradW !== canvas.width) {
      _bannerGrad  = ctx.createLinearGradient(0, 0, canvas.width, 0);
      _bannerGrad.addColorStop(0,    'rgba(255,209,102,0)');
      _bannerGrad.addColorStop(0.22, 'rgba(255,209,102,0.18)');
      _bannerGrad.addColorStop(0.5,  'rgba(255,209,102,0.34)');
      _bannerGrad.addColorStop(0.78, 'rgba(255,209,102,0.18)');
      _bannerGrad.addColorStop(1,    'rgba(255,209,102,0)');
      _bannerGradW = canvas.width;
    }
    ctx.fillStyle = _bannerGrad;
    ctx.fillRect(0, bannerY - barH / 2, canvas.width, barH);

    ctx.fillStyle   = '#FFD166';
    ctx.shadowColor = '#FFD166';
    ctx.shadowBlur  = levelIdx >= 2 ? 0 : 32;
    ctx.textAlign   = 'center';
    ctx.font        = '400 7px "Press Start 2P", monospace';
    ctx.letterSpacing = '0.28em';
    ctx.fillText(LORE.signalAnomaly, cx, bannerY + 4);
    ctx.restore();
  }

  // ── DRAW BREAKTHROUGH VIGNETTE (persistent gold edge glow) ───────────────────

  function drawBreakthroughVignette() {
    if (!breakthroughActive || PERF_LOW) return;
    const pulse  = 0.5 + 0.5 * Math.sin(breakthroughT * 2.8);
    const intens = 0.032 + pulse * 0.022;
    const alpha  = intens / 0.054;
    if (alpha < 0.01) return;   // skip imperceptibly faint frames
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    const ss = Math.max(canvas.width, canvas.height);
    // Create gradient once per game session; recreate only if canvas resized
    if (!_breakthroughGrad ||
        _breakthroughGrad._w !== canvas.width || _breakthroughGrad._h !== canvas.height) {
      _breakthroughGrad = ctx.createRadialGradient(cx, cy, shortSide() * 0.35, cx, cy, ss * 0.72);
      _breakthroughGrad.addColorStop(0, 'rgba(255,209,102,0)');
      _breakthroughGrad.addColorStop(1, 'rgba(255,209,102,0.054)');  // fixed stop; alpha scaled via globalAlpha
      _breakthroughGrad._w = canvas.width;
      _breakthroughGrad._h = canvas.height;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = _breakthroughGrad;
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

    if (!PERF_LOW) {
      const intens     = 0.07 + pulse * 0.06;
      const alpha      = intens / 0.13;
      if (alpha >= 0.01) {
        const ss         = Math.max(canvas.width, canvas.height);
        const accentKey  = lv.accent;
        // Rebuild gradient only when accent color or canvas size changes
        if (!_godModeGrad || _godModeGradColor !== accentKey ||
            _godModeGrad._w !== canvas.width || _godModeGrad._h !== canvas.height) {
          _godModeGrad = ctx.createRadialGradient(cx, cy, shortSide() * 0.22, cx, cy, ss * 0.72);
          _godModeGrad.addColorStop(0, `rgba(${r},${g},${b},0)`);
          _godModeGrad.addColorStop(1, `rgba(${r},${g},${b},0.13)`);  // fixed; scale via globalAlpha
          _godModeGrad._w    = canvas.width;
          _godModeGrad._h    = canvas.height;
          _godModeGradColor  = accentKey;
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = _godModeGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
    }

    // "GOD" label always shown
    const fadeIn = Math.min(godModeT * 4, 1);
    ctx.save();
    ctx.globalAlpha   = fadeIn * (0.45 + 0.55 * pulse);
    ctx.fillStyle     = lv.accent;
    ctx.shadowColor   = lv.accent;
    ctx.shadowBlur    = levelIdx >= 2 ? 0 : 18 * BLUR_MULT;
    ctx.textAlign     = 'left';
    ctx.font          = '400 6px "Press Start 2P", monospace';
    ctx.letterSpacing = '0.28em';
    ctx.fillText('N.O.', 28, 94);
    ctx.restore();
  }

  // ── DRAW HEARTBEAT DOT ───────────────────────────────────────────────────────

  function drawHeartbeatDot(cx, cy) {
    if (phase === 'playing') {
      const hb    = Math.pow(Math.max(0, Math.sin(heartbeatT * Math.PI * 2)), 3);
      const dotR  = 3 + hb * 4;
      const alpha = 0.62 + hb * 0.38;
      const blur  = levelIdx >= 2 ? 0 : (10 + hb * 22);
      dot(cx, cy, dotR, `rgba(255,255,255,${alpha})`, blur);
    } else {
      dot(cx, cy, 3, 'rgba(255,255,255,0.85)', levelIdx >= 2 ? 0 : 12);
    }
  }

  // ── DRAW CEREMONY ────────────────────────────────────────────────────────────

  function drawCeremony(cx, cy) {
    if (!ceremony) return;
    const t  = ceremony.t;
    const lv = ceremony.level;
    const [r, g, b] = hexToRgb(lv.accent);

    // Expanding accent rings (atmosphere)
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
      // Spring-scale for level name
      const sp    = Math.max(0, t - 0.3);
      const decay = Math.exp(-sp * 7);
      const osc   = Math.cos(sp * 14);
      const nameScale = sp <= 0 ? 0.001 : 1 + decay * osc * 0.5;

      // ── RANK EARNED label ────────────────────────────────────────────────────
      // levelIdx already advanced — rank is at levelIdx - 1 (just cleared)
      const rankIdx  = Math.min(levelIdx - 1, LORE.ranks.length - 1);
      const rank     = rankIdx >= 0 ? LORE.ranks[rankIdx] : null;

      if (rank) {
        // "RANK ASSIGNED" micro label
        ctx.save();
        ctx.globalAlpha   = nameAlpha * 0.55;
        ctx.fillStyle     = 'rgba(255,255,255,0.5)';
        ctx.textAlign     = 'center';
        ctx.font          = `400 5px "Press Start 2P", monospace`;
        ctx.letterSpacing = '0.28em';
        ctx.fillText('RANK ASSIGNED', cx, cy - 62);
        ctx.restore();

        // Rank title — spring scaled, accent colored
        ctx.save();
        ctx.globalAlpha = nameAlpha;
        ctx.translate(cx, cy - 28);
        ctx.scale(nameScale, nameScale);
        ctx.fillStyle     = rank.color;
        ctx.shadowColor   = rank.color;
        ctx.shadowBlur    = levelIdx >= 2 ? 0 : 40;
        ctx.textAlign     = 'center';
        const rankFontSize = Math.min(shortSide() * 0.052, 36);
        ctx.font          = `400 ${rankFontSize}px "Press Start 2P", monospace`;
        ctx.letterSpacing = '0.18em';
        ctx.fillText(rank.title, 0, 0);
        ctx.restore();

        // Rank desc line
        ctx.save();
        ctx.globalAlpha   = nameAlpha * 0.65;
        ctx.fillStyle     = '#ffffff';
        ctx.shadowColor   = rank.color;
        ctx.shadowBlur    = levelIdx >= 2 ? 0 : 10;
        ctx.textAlign     = 'center';
        ctx.font          = `400 ${Math.min(shortSide() * 0.014, 8)}px "Press Start 2P", monospace`;
        ctx.letterSpacing = '0.08em';
        ctx.fillText(rank.desc, cx, cy + 14);
        ctx.restore();
      }

      // ── Alien commentary line ─────────────────────────────────────────────────
      const alienLine = LORE.ceremonyLines[Math.min(levelIdx - 1, LORE.ceremonyLines.length - 1)];
      if (alienLine && t > 0.5) {
        const alienAlpha = Math.min(nameAlpha * 0.7, (t - 0.5) * 1.2);
        ctx.save();
        ctx.globalAlpha   = alienAlpha;
        ctx.fillStyle     = lv.accent;
        ctx.shadowColor   = lv.accent;
        ctx.shadowBlur    = levelIdx >= 2 ? 0 : 8;
        ctx.textAlign     = 'center';
        ctx.font          = `400 ${Math.min(shortSide() * 0.012, 7)}px "Press Start 2P", monospace`;
        ctx.letterSpacing = '0.06em';
        // Wrap long alien line into two halves
        const half = Math.ceil(alienLine.length / 2);
        const line1 = alienLine.slice(0, half);
        const line2 = alienLine.slice(half);
        ctx.fillText(line1, cx, cy + 38);
        ctx.fillText(line2, cx, cy + 52);
        ctx.restore();
      }

      // ── Level name (top, small) ───────────────────────────────────────────────
      ctx.save();
      ctx.globalAlpha   = nameAlpha * 0.28;
      ctx.fillStyle     = lv.accent;
      ctx.textAlign     = 'center';
      ctx.font          = `400 ${Math.min(shortSide() * 0.016, 9)}px "Press Start 2P", monospace`;
      ctx.letterSpacing = '0.22em';
      ctx.fillText(`— ${lv.name} —`, cx, cy - 82);
      ctx.restore();

      // TAP TO CONTINUE
      if (t > 0.6) {
        ctx.save();
        ctx.globalAlpha   = Math.min(nameAlpha * 0.5, (t - 0.6) * 1.5);
        ctx.fillStyle     = 'rgba(255,255,255,0.3)';
        ctx.textAlign     = 'center';
        ctx.font          = `400 7px "Press Start 2P", monospace`;
        ctx.letterSpacing = '0.12em';
        ctx.fillText('TAP TO CONTINUE', cx, cy + 80);
        ctx.restore();
      }
    }
  }

  // ── IDLE TITLE CANVAS — subtle scanner behind the start screen ──────────────

  let idleScanT = 0;

  function drawIdleBackground() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#080200';
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;
    const maxR = Math.max(W, H) * 0.72;
    idleScanT += 0.004;

    // Three concentric faint arcs that breathe
    for (let i = 0; i < 3; i++) {
      const phi = idleScanT + i * 0.9;
      const r   = maxR * (0.18 + i * 0.22) * (0.88 + 0.12 * Math.sin(phi * 0.7));
      const a   = 0.022 + 0.012 * Math.sin(phi * 1.1);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0,255,178,${a})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // Single slow sweep wedge
    const sweepAngle = idleScanT * 0.6;
    const sweepLen   = maxR * 0.55;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(sweepAngle);
    const sweepGrad = ctx.createLinearGradient(0, 0, sweepLen, 0);
    sweepGrad.addColorStop(0,   'rgba(0,255,178,0.0)');
    sweepGrad.addColorStop(0.6, 'rgba(0,255,178,0.07)');
    sweepGrad.addColorStop(1,   'rgba(0,255,178,0.02)');
    ctx.fillStyle = sweepGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, sweepLen, -0.08, 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ── MAIN DRAW ────────────────────────────────────────────────────────────────

  function draw() {
    // Lore intro is fully self-contained
    if (phase === 'intro') { drawLoreIntro(); return; }

    // Idle = start screen is visible; draw clean black + subtle scanner only
    if (phase === 'idle') { drawIdleBackground(); return; }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Heartbeat micro-pulse on background luminance
    const lv = currentLevel();
    const [br, bg, bb] = lv.bgTint;
    const hbPulse = phase === 'playing'
      ? Math.pow(Math.max(0, Math.sin(heartbeatT * Math.PI * 2)), 3) * 5
      : 0;
    // Quantise hbPulse to 6 integer buckets so the rgb string is only rebuilt
    // ~6 times per heartbeat cycle instead of on every pixel-perfect float change.
    const hbQ = Math.round(hbPulse);
    if (_bgFillKey !== hbQ || _bgFillLv !== levelIdx) {
      _bgFillStyle = `rgb(${br + hbQ},${bg + hbQ},${bb + hbQ})`;
      _bgFillKey   = hbQ;
      _bgFillLv    = levelIdx;
    }
    ctx.fillStyle = _bgFillStyle;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();

    const cx = canvas.width  / 2 + shakeX;
    const cy = canvas.height / 2 + shakeY;

    // Persistent atmospheric overlays (unshaken, anchored to screen)
    drawBreakthroughVignette();
    drawGodModeOverlay();

    if (phase === 'ceremony') drawCeremony(cx, cy);

    // Shockwaves sit behind the target
    drawShockwaves(cx, cy);

    drawTarget(cx, cy);
    if (phase !== 'ceremony') drawRing(cx, cy);
    drawParticles();
    drawLightning();

    drawHeartbeatDot(cx, cy);

    drawFeedbacks();

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
    const rawDt = (ts - lastT) / 1000;
    lastT = ts;
    // Tighter dt cap at high speed: large frame gaps cause the ring to jump
    // past the target zone in one tick, triggering false auto-misses (red flash).
    const speedFactor = ring ? Math.min(speed / 150, 1) : 0;
    const dtCap = 0.05 - speedFactor * 0.03;   // 50ms at low speed → 20ms at max speed
    const dt = Math.min(rawDt, dtCap);
    update(dt);
    flushLevelMap(ts);
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

  // Initialise best rank display
  const _initRankEl = document.getElementById('best-rank-val');
  if (_initRankEl) {
    if (highRankIdx >= 0 && highRankIdx < LORE.ranks.length) {
      const _ir = LORE.ranks[highRankIdx];
      _initRankEl.textContent = _ir.title;
      _initRankEl.style.color = _ir.color;
    } else {
      _initRankEl.textContent = '—';
      _initRankEl.style.color = 'rgba(255,244,224,0.18)';
    }
  }

  // Start screen hidden until lore intro finishes
  startScreen.style.display = 'none';

})();
