/**
 * rehearsal.js — Main rehearsal screen
 *
 * renderRehearsal(container, script, myCharacter, sceneIndex)
 *
 * Features:
 *  - Other characters' lines spoken aloud automatically
 *  - Manual mode: actor taps mic to speak their line
 *  - Hands-free mode: mic auto-starts after other character finishes,
 *    VAD stops it when actor goes silent — no buttons needed
 *  - Hint button: reveals first 4 words on demand
 *  - Word-diff feedback: "dropped 'I'm being'" instead of just showing both lines
 */

import { speak, stopSpeaking, getAvailableVoices, setVoice, setRate } from '../voice/speaker.js';
import { startListening, stopListening, startListeningHandsFree,
         isSupported as isMicSupported, isNativeSTT } from '../voice/listener.js';
import { checkLine } from '../ai/lineChecker.js';

// ── Mic SVG icon ─────────────────────────────────────────────────────────────
const MIC_SVG = `<svg width="16" height="20" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="4.5" y="0.75" width="7" height="11.5" rx="3.5" stroke="currentColor" stroke-width="1.25"/>
  <path d="M1 10C1 13.866 4.13401 17 8 17C11.866 17 15 13.866 15 10" stroke="currentColor" stroke-width="1.25" stroke-linecap="square"/>
  <line x1="8" y1="17" x2="8" y2="19.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="square"/>
  <line x1="5" y1="19.5" x2="11" y2="19.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="square"/>
</svg>`;

const STOP_SVG = `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="1" y="1" width="12" height="12"/>
</svg>`;

// ── Styles ────────────────────────────────────────────────────────────────────

const STYLES_ID = 'rehearsal-styles';

function injectStyles() {
  if (document.getElementById(STYLES_ID)) return;
  const style = document.createElement('style');
  style.id = STYLES_ID;
  style.textContent = `
    .rh-root {
      display: flex; flex-direction: column; min-height: 100dvh;
      background: var(--bg, #0b0b0d); color: var(--text, #edecea);
      font-family: 'DM Sans', system-ui, sans-serif;
    }

    /* ── Top bar ── */
    .rh-topbar {
      display: flex; align-items: center; gap: .75rem;
      padding: .85rem 1.75rem;
      background: var(--surface, #131315);
      border-bottom: 1px solid var(--border, #252528);
      flex-shrink: 0; flex-wrap: wrap;
    }
    .rh-back-btn {
      background: none; border: none; color: var(--text-2, #737378);
      cursor: pointer; font-size: .75rem; font-weight: 400;
      font-family: 'DM Sans', sans-serif; letter-spacing: .06em;
      text-transform: uppercase; padding: 0;
      transition: color .2s; white-space: nowrap;
    }
    .rh-back-btn:hover { color: var(--text, #edecea); }

    .rh-topbar-divider {
      width: 1px; height: 16px; background: var(--border, #252528); flex-shrink: 0;
    }

    .rh-scene-title {
      flex: 1; font-size: .82rem; font-weight: 400; letter-spacing: .04em;
      color: var(--text, #edecea);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
    }
    .rh-my-character-badge {
      font-size: .68rem; color: var(--text-2, #737378); white-space: nowrap;
      border: 1px solid var(--border, #252528);
      padding: .18rem .7rem; letter-spacing: .06em; text-transform: uppercase;
    }
    .rh-my-character-badge strong { color: var(--text, #edecea); font-weight: 500; }

    /* Speed */
    .rh-speed-wrap {
      display: flex; align-items: center; gap: .4rem;
      font-size: .68rem; color: var(--text-3, #3a3a40);
      letter-spacing: .04em; text-transform: uppercase;
    }
    .rh-speed-wrap input[type=range] {
      width: 64px; accent-color: var(--text, #edecea); cursor: pointer;
    }
    .rh-speed-label { min-width: 2.4rem; color: var(--text-2, #737378); font-size: .7rem; }

    /* Voice picker */
    .rh-voice-select {
      background: var(--surface, #131315); border: 1px solid var(--border, #252528);
      color: var(--text-2, #737378); padding: .26rem .5rem;
      font-size: .72rem; font-family: 'DM Sans', sans-serif; cursor: pointer; max-width: 140px;
    }
    .rh-voice-select:focus { outline: none; border-color: var(--border-hi, #3a3a40); }

    /* Control/toggle buttons */
    .rh-ctrl-btn, .rh-hf-btn {
      background: transparent; border: 1px solid var(--border, #252528);
      color: var(--text-2, #737378); padding: .3rem .8rem; cursor: pointer;
      font-size: .72rem; font-family: 'DM Sans', sans-serif;
      letter-spacing: .04em; text-transform: uppercase;
      transition: color .2s, border-color .2s; white-space: nowrap;
    }
    .rh-ctrl-btn:hover, .rh-hf-btn:hover { color: var(--text, #edecea); border-color: var(--border-hi, #3a3a40); }
    .rh-ctrl-btn:disabled { opacity: .3; cursor: default; }
    .rh-hf-btn.active { color: var(--text, #edecea); border-color: var(--text, #edecea); }

    /* ── Feed ── */
    .rh-feed {
      flex: 1; overflow-y: auto; padding: 2.5rem 1.75rem 9rem;
      display: flex; flex-direction: column; gap: 1.25rem; scroll-behavior: smooth;
      max-width: 780px; width: 100%; margin: 0 auto;
    }

    /* ── Line cards ── */
    .rh-line-card {
      padding: 1rem 1.25rem;
      max-width: 600px; width: 100%;
      opacity: 0; transform: translateY(8px);
      transition: opacity .3s ease, transform .3s ease;
    }
    .rh-line-card.visible { opacity: 1; transform: translateY(0); }
    .rh-line-card.other-char {
      background: var(--surface, #131315);
      border: 1px solid var(--border, #252528);
      border-left: 2px solid var(--border-hi, #3a3a40);
      align-self: flex-start;
    }
    .rh-line-card.my-char {
      background: var(--card, #1a1a1e);
      border: 1px solid var(--border, #252528);
      border-right: 2px solid var(--text, #edecea);
      align-self: flex-end;
    }
    .rh-line-card.action-line {
      background: transparent; border: none;
      align-self: center; text-align: center;
    }

    .rh-char-name {
      font-size: .62rem; font-weight: 500; letter-spacing: .1em;
      text-transform: uppercase; margin-bottom: .35rem;
    }
    .rh-line-card.other-char .rh-char-name { color: var(--text-2, #737378); }
    .rh-line-card.my-char .rh-char-name    { color: var(--text-2, #737378); }

    .rh-line-text {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 1.2rem; line-height: 1.6; color: var(--text, #edecea);
      font-weight: 400;
    }
    .rh-line-card.action-line .rh-line-text {
      font-family: 'DM Sans', sans-serif;
      font-size: .78rem; color: var(--text-3, #3a3a40);
      font-style: italic; letter-spacing: .04em;
    }
    .rh-line-card.other-char.speaking .rh-line-text { color: var(--text, #edecea); }
    .rh-paren {
      font-size: .78rem; color: var(--text-2, #737378);
      font-style: italic; margin-bottom: .3rem;
      font-family: 'DM Sans', sans-serif;
    }

    /* Speaking dots */
    .rh-speaking-dots { display: inline-flex; gap: 3px; vertical-align: middle; margin-left: 6px; }
    .rh-speaking-dots span {
      width: 4px; height: 4px; background: var(--text-2, #737378);
      animation: rh-bounce 1.2s infinite;
    }
    .rh-speaking-dots span:nth-child(2) { animation-delay: .2s; }
    .rh-speaking-dots span:nth-child(3) { animation-delay: .4s; }
    @keyframes rh-bounce {
      0%, 80%, 100% { transform: translateY(0); opacity: .3; }
      40%            { transform: translateY(-4px); opacity: 1; }
    }

    /* ── Mic area ── */
    .rh-mic-area {
      display: flex; flex-direction: column; align-items: flex-end; gap: .45rem;
      margin-top: .85rem;
    }
    .rh-mic-btn {
      background: var(--text, #edecea); border: none;
      width: 48px; height: 48px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: var(--bg, #0b0b0d);
      transition: background .2s, opacity .2s;
    }
    .rh-mic-btn:hover { background: var(--white, #ffffff); }
    .rh-mic-btn.listening {
      background: var(--red, #c0392b); color: #fff;
      animation: pulse-ring 1.6s infinite;
    }
    .rh-mic-btn:disabled { opacity: .25; cursor: default; animation: none; }
    .rh-mic-hint {
      font-size: .68rem; color: var(--text-3, #3a3a40);
      letter-spacing: .04em; text-transform: uppercase;
    }

    /* ── Hint button ── */
    .rh-hint-btn {
      background: transparent; border: 1px solid var(--border, #252528);
      color: var(--text-2, #737378); padding: .26rem .7rem; cursor: pointer;
      font-size: .7rem; font-family: 'DM Sans', sans-serif;
      letter-spacing: .05em; text-transform: uppercase;
      transition: color .2s, border-color .2s; align-self: flex-start;
    }
    .rh-hint-btn:hover { color: var(--text, #edecea); border-color: var(--border-hi, #3a3a40); }
    .rh-hint-btn:disabled { opacity: .6; cursor: default; }

    /* Hint-used flag */
    .rh-line-card.hint-used { border-left-color: var(--amber, #8a6a1e) !important; }
    .rh-line-card.my-char.hint-used { border-right-color: var(--amber, #8a6a1e) !important; }
    .rh-hint-used-badge {
      font-size: .65rem; color: var(--amber, #8a6a1e); margin-top: .35rem;
      letter-spacing: .06em; text-transform: uppercase;
    }

    /* ── Action buttons ── */
    .rh-line-actions { display: flex; gap: .4rem; margin-top: .6rem; flex-wrap: wrap; }
    .rh-action-btn {
      background: transparent; border: 1px solid var(--border, #252528);
      color: var(--text-2, #737378); padding: .26rem .7rem; cursor: pointer;
      font-size: .7rem; font-family: 'DM Sans', sans-serif;
      letter-spacing: .04em; text-transform: uppercase;
      transition: color .2s, border-color .2s;
    }
    .rh-action-btn:hover { color: var(--text, #edecea); border-color: var(--border-hi, #3a3a40); }

    /* ── Feedback ── */
    .rh-feedback {
      margin-top: .75rem; padding: .7rem 1rem;
      font-size: .82rem; line-height: 1.6; border-left: 2px solid;
    }
    .rh-feedback.perfect { background: rgba(26,92,53,.2);  border-color: #2a6b3f; color: #a3d9b1; }
    .rh-feedback.close   { background: rgba(138,106,30,.2); border-color: #8a6a1e; color: #d4b96a; }
    .rh-feedback.off     { background: rgba(192,57,43,.15); border-color: #c0392b; color: #e8a09a; }
    .rh-feedback.missed  { background: rgba(58,58,64,.2);   border-color: #3a3a40; color: #737378; }
    .rh-feedback .rh-fb-label   { font-weight: 600; margin-bottom: .25rem; letter-spacing: .04em; }
    .rh-feedback .rh-fb-note    { font-size: .78rem; color: #c9a84c; margin-bottom: .2rem; }
    .rh-feedback .rh-fb-said    { color: var(--text-2, #737378); font-style: italic; font-size: .8rem; }
    .rh-feedback .rh-fb-correct { color: var(--text, #edecea); margin-top: .3rem; font-size: .8rem; }

    /* ── Bottom bar ── */
    .rh-bottom-bar {
      position: fixed; bottom: 0; left: 0; right: 0;
      background: var(--surface, #131315); border-top: 1px solid var(--border, #252528);
      padding: .8rem 1.75rem;
      display: flex; gap: .75rem; justify-content: center; align-items: center; flex-wrap: wrap;
    }
    .rh-skip-btn, .rh-pause-btn {
      background: transparent; border: 1px solid var(--border, #252528);
      color: var(--text-2, #737378); padding: .45rem 1.2rem; cursor: pointer;
      font-family: 'DM Sans', sans-serif; font-size: .72rem; font-weight: 400;
      letter-spacing: .06em; text-transform: uppercase;
      transition: color .2s, border-color .2s;
    }
    .rh-skip-btn:hover, .rh-pause-btn:hover { color: var(--text, #edecea); border-color: var(--border-hi, #3a3a40); }
    .rh-skip-btn:disabled, .rh-pause-btn:disabled { opacity: .25; cursor: default; }
    .rh-pause-btn.paused { color: var(--text, #edecea); border-color: var(--text, #edecea); }
    .rh-kbd-hints {
      color: var(--text-3, #3a3a40); font-size: .65rem;
      display: flex; align-items: center; gap: .4rem; flex-wrap: wrap;
      letter-spacing: .04em;
    }
    .rh-kbd-hints kbd {
      border: 1px solid var(--border, #252528);
      padding: .08rem .35rem; font-family: 'DM Sans', sans-serif;
      font-size: .62rem; color: var(--text-3, #3a3a40);
    }

    /* ── Warnings ── */
    .rh-no-mic-warning {
      border-left: 2px solid #8a6a1e; background: rgba(138,106,30,.1);
      color: #d4b96a; padding: .7rem 1rem; font-size: .8rem; margin-bottom: 1rem;
    }

    /* ── Completion screen ── */
    .rh-completion {
      display: flex; flex-direction: column; align-items: center;
      justify-content: flex-start; text-align: center;
      padding: 4rem 2rem 6rem; gap: 2rem; flex: 1; overflow-y: auto;
    }
    .rh-completion-heading {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 2.2rem; font-weight: 400; color: var(--text, #edecea);
      letter-spacing: .06em;
    }
    .rh-completion-sub { font-size: .78rem; color: var(--text-3, #3a3a40); letter-spacing: .04em; margin-top: -1rem; }
    .rh-score-ring {
      width: 120px; height: 120px;
      border: 1px solid var(--border, #252528);
      display: flex; align-items: center; justify-content: center; flex-direction: column;
      position: relative;
    }
    .rh-score-ring::before {
      content: '';
      position: absolute; inset: -1px;
      background: conic-gradient(var(--text,#edecea) 0deg, transparent 0deg);
      mask: radial-gradient(farthest-side,transparent calc(100% - 2px),#000 calc(100% - 2px));
      -webkit-mask: radial-gradient(farthest-side,transparent calc(100% - 2px),#000 calc(100% - 2px));
    }
    .rh-score-ring-inner { position: relative; z-index: 1; }
    .rh-score-pct   {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 2.4rem; font-weight: 300; color: var(--text, #edecea); line-height: 1;
    }
    .rh-score-label {
      font-size: .6rem; color: var(--text-3, #3a3a40);
      letter-spacing: .1em; text-transform: uppercase; margin-top: .3rem;
    }
    .rh-grade-breakdown { display: flex; gap: .75rem; flex-wrap: wrap; justify-content: center; }
    .rh-grade-item {
      display: flex; flex-direction: column; align-items: center; gap: .2rem;
      border: 1px solid var(--border, #252528);
      padding: .75rem 1.1rem; min-width: 68px;
    }
    .rh-grade-count {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 2rem; font-weight: 300; line-height: 1;
    }
    .rh-grade-tag { font-size: .62rem; color: var(--text-3, #3a3a40); letter-spacing: .06em; text-transform: uppercase; }
    .rh-completion-btn {
      background: transparent; border: 1px solid var(--border-hi, #3a3a40);
      color: var(--text-2, #737378);
      padding: .6rem 1.75rem; cursor: pointer;
      font-family: 'DM Sans', sans-serif; font-size: .75rem; font-weight: 400;
      letter-spacing: .08em; text-transform: uppercase;
      transition: color .2s, border-color .2s;
    }
    .rh-completion-btn:hover { color: var(--text, #edecea); border-color: var(--text, #edecea); }
  `;
  document.head.appendChild(style);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scrollToCard(el) {
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
}

function showCard(card) {
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('visible')));
  scrollToCard(card);
}

function makeCard(type, charName, text, parenthetical) {
  const card = document.createElement('div');
  card.className = `rh-line-card ${type}`;
  if (charName) {
    const nameEl = document.createElement('div');
    nameEl.className = 'rh-char-name';
    nameEl.textContent = charName;
    card.appendChild(nameEl);
  }
  if (parenthetical) {
    const parenEl = document.createElement('div');
    parenEl.className = 'rh-paren';
    parenEl.textContent = parenthetical;
    card.appendChild(parenEl);
  }
  const textEl = document.createElement('div');
  textEl.className = 'rh-line-text';
  textEl.textContent = text;
  card.appendChild(textEl);
  return card;
}

// ── Word-diff feedback ────────────────────────────────────────────────────────

function lineDiffNote(spokenText, scriptText) {
  function norm(t) {
    return t.toLowerCase()
      .replace(/[-–—]/g, ' ').replace(/[''`´']/g, '')
      .replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  }
  const a = norm(spokenText).split(/\s+/).filter(Boolean);
  const b = norm(scriptText).split(/\s+/).filter(Boolean);
  if (!a.length || a.join(' ') === b.join(' ')) return null;

  // Build Levenshtein DP table
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);

  // Backtrack
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i-1] === b[j-1]) {
      i--; j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i-1][j-1] + 1) {
      ops.unshift({ type: 'sub', said: a[i-1], expected: b[j-1] });
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i-1][j] + 1) {
      ops.unshift({ type: 'extra', word: a[i-1] });
      i--;
    } else {
      ops.unshift({ type: 'missing', word: b[j-1] });
      j--;
    }
  }

  const missing = ops.filter(o => o.type === 'missing').map(o => o.word);
  const extra   = ops.filter(o => o.type === 'extra').map(o => o.word);
  const subs    = ops.filter(o => o.type === 'sub');

  const parts = [];
  if (missing.length) parts.push(`dropped "${missing.join(' ')}"`);
  if (subs.length <= 2) subs.forEach(s => parts.push(`said "${s.said}" not "${s.expected}"`));
  else if (subs.length > 2) parts.push('several word substitutions');
  if (extra.length) parts.push(`added "${extra.join(' ')}"`);
  return parts.length ? parts.join(' · ') : null;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function renderRehearsal(container, script, myCharacter, sceneIdxList) {
  // Accept either a single index (legacy) or an array.
  // Multi-scene looping will be wired up next — for now run the first scene.
  const sceneIndexArray = Array.isArray(sceneIdxList) ? sceneIdxList : [sceneIdxList];
  const sceneIndex = sceneIndexArray[0];

  injectStyles();
  stopSpeaking();
  stopListening();

  const scene = script.scenes[sceneIndex];

  // ── State ──────────────────────────────────────────────────────────────────
  let currentLineIndex = 0;
  let isPaused         = false;
  let isListening      = false;
  let isSpeakingLine   = false;
  let waitingForActor  = false;
  let handsFree        = false;
  let blindMode        = false;
  let resolveSkip      = null;
  let resolvePause     = null;
  let sessionAborted   = false;

  // ── DOM ────────────────────────────────────────────────────────────────────
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'rh-root';
  container.appendChild(root);

  // Top bar
  const topBar = document.createElement('div');
  topBar.className = 'rh-topbar';
  topBar.innerHTML = `
    <button class="rh-back-btn">Back</button>
    <div class="rh-topbar-divider"></div>
    <div class="rh-scene-title">${scene.heading}</div>
    <div class="rh-my-character-badge">Playing: <strong>${myCharacter}</strong></div>
    <div class="rh-topbar-divider"></div>
    <button class="rh-hf-btn" id="rh-hf-btn">Hands-free</button>
    <button class="rh-hf-btn" id="rh-blind-btn">Blind Mode</button>
    <button class="rh-ctrl-btn" id="rh-hear-line-btn" disabled>Hear Line</button>
    <div class="rh-topbar-divider"></div>
    <div class="rh-speed-wrap">
      <span>Slow</span>
      <input type="range" id="rh-speed" min="0.5" max="1.5" step="0.1" value="0.88" />
      <span>Fast</span>
      <span class="rh-speed-label" id="rh-speed-label">0.9×</span>
    </div>
    <select class="rh-voice-select" id="rh-voice-select" title="Reader voice">
      <option value="">Voice</option>
    </select>
  `;
  root.appendChild(topBar);

  // Feed
  const feed = document.createElement('div');
  feed.className = 'rh-feed';
  root.appendChild(feed);

  if (!isMicSupported()) {
    const warn = document.createElement('div');
    warn.className = 'rh-no-mic-warning';
    warn.innerHTML = 'Speech recognition unavailable in this browser. Use Skip to advance.';
    feed.appendChild(warn);
  } else if (!isNativeSTT()) {
    const info = document.createElement('div');
    info.className = 'rh-no-mic-warning';
    info.style.cssText = 'background:#1e3a5f;border-color:#1d4ed8;color:#93c5fd;';
    info.innerHTML = 'Firefox mode: tap the mic to start recording, then tap <strong>Stop</strong> when done. Or enable <strong>Hands-free</strong> for automatic silence detection.';
    feed.appendChild(info);
  }

  // Bottom bar
  const bottomBar = document.createElement('div');
  bottomBar.className = 'rh-bottom-bar';
  bottomBar.innerHTML = `
    <button class="rh-pause-btn" id="rh-pause-btn">Pause</button>
    <button class="rh-skip-btn" id="rh-skip-btn">Skip</button>
    <span class="rh-kbd-hints">
      <kbd>Space</kbd> mic &nbsp;
      <kbd>S</kbd> skip &nbsp;
      <kbd>H</kbd> hint &nbsp;
      <kbd>P</kbd> pause
    </span>
  `;
  root.appendChild(bottomBar);

  // ── Button refs ────────────────────────────────────────────────────────────
  const backBtn      = topBar.querySelector('.rh-back-btn');
  const hfBtn        = topBar.querySelector('#rh-hf-btn');
  const hearLineBtn  = topBar.querySelector('#rh-hear-line-btn');
  const voiceSelect  = topBar.querySelector('#rh-voice-select');
  const pauseBtn     = bottomBar.querySelector('#rh-pause-btn');
  const skipBtn      = bottomBar.querySelector('#rh-skip-btn');

  // ── Speed slider ────────────────────────────────────────────────────────────
  const speedSlider = topBar.querySelector('#rh-speed');
  const speedLabel  = topBar.querySelector('#rh-speed-label');
  speedSlider.addEventListener('input', () => {
    const val = parseFloat(speedSlider.value);
    setRate(val);
    speedLabel.textContent = val.toFixed(1) + '×';
  });

  // ── Voice picker ────────────────────────────────────────────────────────────
  // Populate asynchronously so it doesn't block render
  getAvailableVoices().then((voices) => {
    voices.forEach((v) => {
      const opt = document.createElement('option');
      opt.value       = v.name;
      opt.textContent = v.name.replace('Microsoft ', '').replace(' Online (Natural)', ' (Natural)').replace('Google ', '');
      voiceSelect.appendChild(opt);
    });
    // Pre-select the first (best) voice
    if (voices.length) {
      voiceSelect.value = voices[0].name;
      setVoice(voices[0]);
    }
  });
  voiceSelect.addEventListener('change', () => {
    if (!voiceSelect.value) return;
    getAvailableVoices().then((voices) => {
      const picked = voices.find((v) => v.name === voiceSelect.value);
      setVoice(picked ?? null);
    });
  });

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  // Space → mic (start/stop)  S → skip  H → hint  P → pause
  function onKey(e) {
    // Don't fire inside inputs / selects
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
        e.target.tagName === 'SELECT') return;

    const key = e.key.toLowerCase();

    if (key === ' ') {
      e.preventDefault(); // stop page scroll
      // Find the active mic button (not disabled) and click it
      const micBtn = feed.querySelector('.rh-mic-btn:not([disabled])');
      if (micBtn) micBtn.click();
      else if (isListening) stopBtn();   // if recording, stop it
      return;
    }
    if (key === 's') { skipBtn.click();  return; }
    if (key === 'p') { pauseBtn.click(); return; }
    if (key === 'h') {
      // Click the most recent un-used hint button
      const hints = [...feed.querySelectorAll('.rh-hint-btn:not([disabled])')];
      if (hints.length) hints[hints.length - 1].click();
      return;
    }
  }
  document.addEventListener('keydown', onKey);

  // Clean up listener when leaving rehearsal
  function removeKeyListener() { document.removeEventListener('keydown', onKey); }

  // Back
  backBtn.addEventListener('click', () => {
    sessionAborted = true;
    stopSpeaking(); stopListening();
    removeKeyListener();
    if (resolveSkip)  resolveSkip('back');
    if (resolvePause) resolvePause();
    container.dispatchEvent(new CustomEvent('rehearsal:back', { bubbles: true }));
  });

  // Hands-free toggle
  hfBtn.addEventListener('click', () => {
    handsFree = !handsFree;
    hfBtn.classList.toggle('active', handsFree);
    hfBtn.textContent = handsFree ? 'Hands-free: On' : 'Hands-free';
  });

  // Blind mode toggle
  const blindBtn = topBar.querySelector('#rh-blind-btn');
  blindBtn.addEventListener('click', () => {
    blindMode = !blindMode;
    blindBtn.classList.toggle('active', blindMode);
    blindBtn.textContent = blindMode ? 'Blind: On' : 'Blind Mode';
  });

  // Pause / Resume
  pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    if (isPaused) {
      pauseBtn.textContent = 'Resume';
      pauseBtn.classList.add('paused');
      stopSpeaking();
      if (isListening) stopListening();
    } else {
      pauseBtn.textContent = 'Pause';
      pauseBtn.classList.remove('paused');
      if (resolvePause) { const fn = resolvePause; resolvePause = null; fn(); }
    }
  });

  // Skip
  skipBtn.addEventListener('click', () => {
    stopSpeaking(); stopListening(); isListening = false;
    if (resolveSkip) { const fn = resolveSkip; resolveSkip = null; fn('skipped'); }
  });

  // Hear my line
  let currentMyLineText = null;
  hearLineBtn.addEventListener('click', async () => {
    if (!currentMyLineText || isSpeakingLine) return;
    stopListening();
    await speak(currentMyLineText);
  });

  // ── Async helpers ──────────────────────────────────────────────────────────

  async function waitIfPaused() {
    if (!isPaused) return;
    await new Promise((resolve) => { resolvePause = resolve; });
  }

  async function speakSkippable(text) {
    isSpeakingLine = true;
    await waitIfPaused();
    if (sessionAborted) { isSpeakingLine = false; return 'aborted'; }
    const skipPromise  = new Promise((resolve) => { resolveSkip = resolve; });
    const speakPromise = speak(text).then(() => 'done');
    const result = await Promise.race([speakPromise, skipPromise]);
    stopSpeaking();
    resolveSkip    = null;
    isSpeakingLine = false;
    return result;
  }

  async function listenSkippable(handsFreeModeOn) {
    await waitIfPaused();
    if (sessionAborted) return { transcript: '', skipped: true };
    isListening = true;
    const skipPromise  = new Promise((resolve) => { resolveSkip = (r) => resolve(r); });
    const listenFn     = handsFreeModeOn ? startListeningHandsFree : startListening;
    const listenPromise = listenFn().then((t) => ({ transcript: t, skipped: false }));
    let result;
    try {
      result = await Promise.race([
        listenPromise,
        skipPromise.then((r) => ({ transcript: '', skipped: true, reason: r })),
      ]);
    } catch (err) {
      result = { transcript: '', skipped: false, error: err.message };
    }
    stopListening();
    resolveSkip = null;
    isListening = false;
    return result;
  }

  // ── Completion screen ──────────────────────────────────────────────────────
  // allResults = [{ scene, scores: [{score, grade}] }]

  function showCompletion(allResults) {
    stopSpeaking();
    removeKeyListener();
    root.innerHTML = '';
    injectStyles();

    const allScores = allResults.flatMap((r) => r.scores);
    const myLines   = allScores.length;
    const totals    = { perfect: 0, close: 0, off: 0, missed: 0 };
    let   totalScore = 0;
    allScores.forEach(({ grade, score }) => {
      totals[grade] = (totals[grade] || 0) + 1;
      totalScore   += score;
    });
    const avgPct = myLines > 0 ? Math.round((totalScore / myLines) * 100) : 0;
    const isMulti = allResults.length > 1;

    // Per-scene breakdown (only shown for multi-scene runs)
    const sceneBreakdownHTML = isMulti ? `
      <div style="width:100%;max-width:480px;display:flex;flex-direction:column;gap:.5rem;margin-top:.5rem;">
        ${allResults.map(({ scene: s, scores: sc }) => {
          const pct = sc.length > 0
            ? Math.round(sc.reduce((a, b) => a + b.score, 0) / sc.length * 100) : 0;
          return `
            <div style="border:1px solid var(--border,#252528);padding:.65rem 1rem;">
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.5rem;">
                <span style="font-size:.82rem;color:var(--text,#edecea);">${s.heading}</span>
                <span style="font-size:.72rem;color:var(--text-3,#3a3a40);">${pct}% · ${sc.length} line${sc.length !== 1 ? 's' : ''}</span>
              </div>
              <div style="background:var(--border,#252528);height:2px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:${pct>=80?'#2a6b3f':pct>=55?'var(--amber,#8a6a1e)':'var(--red,#c0392b)'};transition:width .4s;"></div>
              </div>
            </div>`;
        }).join('')}
      </div>` : '';

    const heading = isMulti
      ? `${allResults.length} Scenes Complete!`
      : 'Scene Complete!';
    const subtitle = isMulti
      ? `${myLines} lines as ${myCharacter}`
      : `${myLines} line${myLines !== 1 ? 's' : ''} as ${myCharacter} in ${allResults[0]?.scene.heading ?? ''}`;

    // Study list — lines that needed a hint, were missed, or were off
    const studyLines = allScores.filter((s) => s.hintUsed || s.grade === 'missed' || s.grade === 'off');
    const studyListHTML = studyLines.length === 0 ? '' : `
      <div style="width:100%;max-width:480px;text-align:left;">
        <div style="font-size:.62rem;font-weight:500;color:var(--text-3,#3a3a40);letter-spacing:.14em;text-transform:uppercase;margin-bottom:.85rem;padding-bottom:.5rem;border-bottom:1px solid var(--border,#252528);">
          Lines to Study
        </div>
        <div style="display:flex;flex-direction:column;">
          ${studyLines.map((s) => `
            <div style="
              padding:.65rem 0 .65rem 1rem;font-size:.88rem;color:var(--text,#edecea);
              border-left:2px solid ${s.hintUsed ? 'var(--amber,#8a6a1e)' : s.grade === 'missed' ? 'var(--border-hi,#3a3a40)' : 'var(--red,#c0392b)'};
              border-bottom:1px solid var(--border,#252528);
              font-family:'Cormorant Garamond',Georgia,serif;font-size:1rem;
            ">
              "${s.text}"
            </div>
          `).join('')}
        </div>
      </div>`;

    const comp = document.createElement('div');
    comp.className = 'rh-completion';
    comp.innerHTML = `
      <div class="rh-completion-heading">${heading}</div>
      <div class="rh-completion-sub">${subtitle}</div>
      <div class="rh-score-ring" style="background:conic-gradient(var(--accent,#3b82f6) ${avgPct * 3.6}deg, var(--bg-elevated,#111827) 0deg);">
        <div class="rh-score-ring-inner">
          <div class="rh-score-pct">${avgPct}%</div>
          <div class="rh-score-label">OVERALL</div>
        </div>
      </div>
      <div class="rh-grade-breakdown">
        <div class="rh-grade-item">
          <span class="rh-grade-count" style="color:#86efac;">${totals.perfect}</span>
          <span class="rh-grade-tag" style="color:#2a6b3f;">Perfect</span>
        </div>
        <div class="rh-grade-item">
          <span class="rh-grade-count" style="color:#d4b96a;">${totals.close ?? 0}</span>
          <span class="rh-grade-tag">Close</span>
        </div>
        <div class="rh-grade-item">
          <span class="rh-grade-count" style="color:#e8a09a;">${totals.off ?? 0}</span>
          <span class="rh-grade-tag">Off</span>
        </div>
        <div class="rh-grade-item">
          <span class="rh-grade-count" style="color:#737378;">${totals.missed ?? 0}</span>
          <span class="rh-grade-tag">Missed</span>
        </div>
      </div>
      ${sceneBreakdownHTML}
      ${studyListHTML}
      <div style="display:flex;gap:.75rem;flex-wrap:wrap;justify-content:center;margin-top:.5rem;">
        <button class="rh-completion-btn" id="rh-again-btn">Rehearse Again</button>
        <button class="rh-completion-btn" id="rh-back-btn">Back to Script</button>
      </div>
    `;
    root.appendChild(comp);
    comp.querySelector('#rh-again-btn').addEventListener('click', () => {
      renderRehearsal(container, script, myCharacter, sceneIndexArray);
    });
    comp.querySelector('#rh-back-btn').addEventListener('click', () => {
      container.dispatchEvent(new CustomEvent('rehearsal:back', { bubbles: true }));
    });
  }

  // ── Per-scene rehearsal loop ───────────────────────────────────────────────
  // Returns array of { score, grade } for every actor line in the scene.

  async function runScene(sceneToRun) {
    const localScores = [];
    const beats = buildBeats(sceneToRun.lines, myCharacter);

    for (const beat of beats) {
      if (sessionAborted) break;
      await waitIfPaused();
      if (sessionAborted) break;

      currentLineIndex++;

      // ── Stage direction ──────────────────────────────────────────────────
      if (beat.type === 'action') {
        const card = makeCard('action-line', null, beat.text, null);
        feed.appendChild(card);
        showCard(card);
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }

      // ── Other character's line ────────────────────────────────────────────
      if (beat.type === 'other') {
        const card = makeCard('other-char', beat.character, beat.text, beat.parenthetical);
        feed.appendChild(card);
        showCard(card);

        const dots = document.createElement('span');
        dots.className = 'rh-speaking-dots';
        dots.innerHTML = '<span></span><span></span><span></span>';
        card.querySelector('.rh-line-text').appendChild(dots);
        card.classList.add('speaking');

        skipBtn.disabled   = false;
        hearLineBtn.disabled = true;
        currentMyLineText  = null;

        const result = await speakSkippable(beat.text);
        card.classList.remove('speaking');
        dots.remove();
        if (result === 'aborted') break;
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }

      // ── Actor's line ──────────────────────────────────────────────────────────
      if (beat.type === 'mine') {
        let hintUsed = false;
        currentMyLineText = beat.text;
        hearLineBtn.disabled = false;
        skipBtn.disabled     = false;
        waitingForActor      = true;

        const card   = makeCard('my-char', myCharacter, '', beat.parenthetical);
        const textEl = card.querySelector('.rh-line-text');
        textEl.style.color     = '#60a5fa';
        textEl.style.fontStyle = 'italic';

        const micArea = document.createElement('div');
        micArea.className = 'rh-mic-area';

        // Hint button — hidden in blind mode
        if (!blindMode) {
          const hintBtn = document.createElement('button');
          hintBtn.className   = 'rh-hint-btn';
          hintBtn.textContent = 'Hint';
          hintBtn.addEventListener('click', () => {
            const words = beat.text.split(/\s+/).slice(0, 2).join(' ');
            hintBtn.textContent = `"${words}…"`;
            hintBtn.disabled    = true;
            hintUsed            = true;
            card.classList.add('hint-used');
            const badge = document.createElement('div');
            badge.className   = 'rh-hint-used-badge';
            badge.textContent = 'Study this line';
            micArea.appendChild(badge);
          }, { once: true });
          micArea.appendChild(hintBtn);
        }

        let outerBreak = false;

        // ── Hands-free path (no retry) ───────────────────────────────────────
        if (handsFree) {
          const statusEl = document.createElement('div');
          statusEl.className   = 'rh-mic-hint';
          statusEl.textContent = 'getting ready…';
          textEl.textContent   = '(listening automatically…)';
          micArea.appendChild(statusEl);
          card.appendChild(micArea);
          feed.appendChild(card);
          showCard(card);

          await waitIfPaused();
          if (sessionAborted) { outerBreak = true; }
          else {
            // ── Hands-free retry loop ─────────────────────────────────────
            let hfRetrying = true;
            let hfFeedbackEl = null;

            while (hfRetrying && !sessionAborted) {
              hfRetrying = false;

              // Remove previous feedback card if retrying
              if (hfFeedbackEl) { hfFeedbackEl.remove(); hfFeedbackEl = null; }

              statusEl.textContent = 'getting ready…';
              textEl.textContent   = '(listening automatically…)';
              textEl.style.color   = '#60a5fa';
              textEl.style.fontStyle = 'italic';

              await new Promise((r) => setTimeout(r, 800));
              if (sessionAborted) break;

              statusEl.textContent = 'Listening...';
              const res  = await listenSkippable(true);
              const t    = res.transcript;
              const skip = res.skipped;
              statusEl.textContent = skip ? 'skipped' : 'checking…';

              waitingForActor      = false;
              hearLineBtn.disabled = true;
              currentMyLineText    = null;

              textEl.textContent     = beat.text;
              textEl.style.color     = '#e2e8f0';
              textEl.style.fontStyle = 'normal';

              if (skip) {
                localScores.push({ grade: 'missed', score: 0, text: beat.text, hintUsed });
                await new Promise((r) => setTimeout(r, 500));
                break;
              }

              const { score, grade } = await checkLine(t, beat.text);

              const feedback = document.createElement('div');
              feedback.className = `rh-feedback ${grade}`;
              const labels = { perfect: 'Perfect', close: 'Close', off: 'Off', missed: 'Missed' };
              let fbHTML = `<div class="rh-fb-label">${labels[grade]}</div>`;
              if (grade !== 'perfect') {
                const note = lineDiffNote(t || '', beat.text);
                if (note) fbHTML += `<div class="rh-fb-note">${note}</div>`;
                if (grade === 'close' || grade === 'off')
                  fbHTML += `<div class="rh-fb-said">You said: "${t || '(nothing)'}"</div>`;
                fbHTML += `<div class="rh-fb-correct">Script: "${beat.text}"</div>`;
              }
              feedback.innerHTML = fbHTML;
              card.appendChild(feedback);
              hfFeedbackEl = feedback;
              scrollToCard(feedback);

              if (grade !== 'perfect' && !sessionAborted) {
                // Read correct line aloud if missed
                if (grade === 'missed') {
                  await new Promise((r) => setTimeout(r, 400));
                  if (!sessionAborted) await speakSkippable(beat.text);
                } else {
                  await new Promise((r) => setTimeout(r, 600));
                }

                if (!sessionAborted) {
                  // Ask out loud whether to retry
                  statusEl.textContent = 'asking…';
                  await speakSkippable('Try that line again, or keep going?');

                  if (!sessionAborted) {
                    statusEl.textContent = 'Listening...';
                    const choice = await listenSkippable(true);
                    const answer = (choice.transcript || '').toLowerCase();

                    const wantsRetry = /\b(again|retry|redo|try|repeat|once more|one more)\b/i.test(answer);

                    if (wantsRetry && !sessionAborted) {
                      // Retry — show a brief status, then loop
                      statusEl.textContent = 'ok, try again…';
                      await new Promise((r) => setTimeout(r, 600));
                      hearLineBtn.disabled = false;
                      waitingForActor      = true;
                      currentMyLineText    = beat.text;
                      hfRetrying = true;
                      continue;
                    } else {
                      statusEl.textContent = 'moving on…';
                      await new Promise((r) => setTimeout(r, 500));
                    }
                  }
                }
              } else if (grade === 'perfect') {
                await new Promise((r) => setTimeout(r, 1500));
              }

              localScores.push({ score, grade, text: beat.text, hintUsed });
            } // end hfRetrying loop
          }

        // ── Manual path (with retry + blind mode) ────────────────────────────
        } else {
          card.appendChild(micArea);
          feed.appendChild(card);
          showCard(card);

          let retrying = true;
          while (retrying && !sessionAborted) {
            retrying = false;

            textEl.textContent = blindMode
              ? '(your line — speak from memory)'
              : '(your line — tap mic to speak)';

            const micBtn = document.createElement('button');
            micBtn.className = 'rh-mic-btn';
            micBtn.innerHTML = MIC_SVG;
            micBtn.title     = 'Tap to speak your line';
            if (!isMicSupported()) micBtn.disabled = true;

            const micHint = document.createElement('div');
            micHint.className   = 'rh-mic-hint';
            micHint.textContent = !isMicSupported()
              ? 'mic not supported'
              : !isNativeSTT() ? 'tap to record' : 'tap to speak';

            micArea.appendChild(micBtn);
            micArea.appendChild(micHint);

            // Wait for tap or skip
            let skipTriggered = false;
            const tapPromise = new Promise((resolve) => {
              micBtn.addEventListener('click', resolve, { once: true });
            });
            const skipForTapPromise = new Promise((resolve) => {
              resolveSkip = () => { skipTriggered = true; resolve(); };
            });
            await Promise.race([tapPromise, skipForTapPromise]);
            resolveSkip = null;
            if (sessionAborted) break;

            if (skipTriggered) {
              textEl.textContent     = beat.text;
              textEl.style.color     = '#94a3b8';
              textEl.style.fontStyle = 'normal';
              micBtn.disabled        = true;
              micHint.textContent    = 'skipped';
              waitingForActor        = false;
              hearLineBtn.disabled   = true;
              currentMyLineText      = null;
              localScores.push({ grade: 'missed', score: 0, text: beat.text, hintUsed });
              break;
            }

            micBtn.classList.add('listening');
            micBtn.innerHTML = STOP_SVG;
            micBtn.disabled  = true;

            let transcript  = '';
            let lineSkipped = false;

            if (!isNativeSTT()) {
              micHint.textContent = 'recording…';
              const stopRecBtn = document.createElement('button');
              stopRecBtn.className     = 'rh-action-btn';
              stopRecBtn.style.cssText = 'margin-top:.4rem;background:#7f1d1d;border-color:#991b1b;color:#fca5a5;';
              stopRecBtn.textContent   = 'Stop';
              micArea.appendChild(stopRecBtn);
              const listenPromise = listenSkippable(false);
              stopRecBtn.addEventListener('click', () => {
                stopRecBtn.disabled = true;
                micHint.textContent = 'transcribing…';
                stopListening();
              }, { once: true });
              const res   = await listenPromise;
              transcript  = res.transcript;
              lineSkipped = res.skipped;
              micArea.querySelector('.rh-action-btn')?.remove();
            } else {
              micHint.textContent = 'listening…';
              const res   = await listenSkippable(false);
              transcript  = res.transcript;
              lineSkipped = res.skipped;
            }

            micBtn.classList.remove('listening');
            micBtn.innerHTML = MIC_SVG;
            micBtn.disabled  = true;
            if (lineSkipped) micHint.textContent = 'skipped';

            waitingForActor      = false;
            hearLineBtn.disabled = true;
            currentMyLineText    = null;
            if (sessionAborted) break;

            textEl.textContent     = beat.text;
            textEl.style.color     = '#e2e8f0';
            textEl.style.fontStyle = 'normal';

            if (lineSkipped) {
              localScores.push({ grade: 'missed', score: 0, text: beat.text, hintUsed });
              break;
            }

            const { score, grade } = await checkLine(transcript, beat.text);

            const feedback = document.createElement('div');
            feedback.className = `rh-feedback ${grade}`;
            const labels = { perfect: 'Perfect', close: 'Close', off: 'Off', missed: 'Missed' };
            let fbHTML = `<div class="rh-fb-label">${labels[grade]}</div>`;
            if (grade !== 'perfect') {
              const note = lineDiffNote(transcript || '', beat.text);
              if (note) fbHTML += `<div class="rh-fb-note">${note}</div>`;
              if (grade === 'close' || grade === 'off')
                fbHTML += `<div class="rh-fb-said">You said: "${transcript || '(nothing)'}"</div>`;
              fbHTML += `<div class="rh-fb-correct">Script: "${beat.text}"</div>`;
            }
            feedback.innerHTML = fbHTML;

            card.appendChild(feedback);
            scrollToCard(feedback);

            // Retry available for anything that isn't perfect
            if (grade !== 'perfect') {
              const actions = document.createElement('div');
              actions.className = 'rh-line-actions';

              if (grade === 'missed') {
                const hearAgainBtn = document.createElement('button');
                hearAgainBtn.className   = 'rh-action-btn';
                hearAgainBtn.textContent = 'Hear again';
                hearAgainBtn.addEventListener('click', async () => {
                  hearAgainBtn.disabled = true;
                  await speak(beat.text);
                  hearAgainBtn.disabled = false;
                });
                actions.appendChild(hearAgainBtn);
              }

              const retryBtn = document.createElement('button');
              retryBtn.className     = 'rh-action-btn';
              retryBtn.textContent   = 'Try again';
              retryBtn.style.cssText = '';
              actions.appendChild(retryBtn);
              feedback.appendChild(actions);

              const shouldRetry = await new Promise((resolve) => {
                retryBtn.addEventListener('click', () => resolve(true), { once: true });
                const prevSkip = resolveSkip;
                resolveSkip = (r) => { resolve(false); if (prevSkip) prevSkip(r); };
              });
              resolveSkip = null;

              if (shouldRetry && !sessionAborted) {
                feedback.remove();
                micArea.innerHTML = '';
                if (hintUsed) {
                  const badge = document.createElement('div');
                  badge.className   = 'rh-hint-used-badge';
                  badge.textContent = 'Study this line';
                  micArea.appendChild(badge);
                }
                hearLineBtn.disabled = false;
                skipBtn.disabled     = false;
                waitingForActor      = true;
                currentMyLineText    = beat.text;
                retrying = true;
                continue;
              }
            }

            localScores.push({ score, grade, text: beat.text, hintUsed });
            await new Promise((r) => setTimeout(r, 400));
          } // end retry while
        } // end hands-free / manual

        if (outerBreak || sessionAborted) break;
      }
    }

    return localScores;
  }

  // ── Multi-scene orchestrator ───────────────────────────────────────────────

  async function runAllScenes() {
    const sceneTitle = topBar.querySelector('.rh-scene-title');
    const isMulti    = sceneIndexArray.length > 1;
    const allResults = [];

    for (let i = 0; i < sceneIndexArray.length; i++) {
      if (sessionAborted) break;

      const sceneToRun = script.scenes[sceneIndexArray[i]];

      // Update topbar title
      sceneTitle.textContent = isMulti
        ? `${sceneToRun.heading}  (${i + 1} / ${sceneIndexArray.length})`
        : sceneToRun.heading;

      // Between-scene transition card
      if (i > 0 && !sessionAborted) {
        const divider = document.createElement('div');
        divider.style.cssText = `
          display:flex; align-items:center; gap:.75rem;
          margin:.5rem 0; color:#334155; font-size:.8rem;
        `;
        divider.innerHTML = `
          <div style="flex:1;height:1px;background:#1e293b;"></div>
          <span style="color:#475569;white-space:nowrap;">
            ▶ Next: ${sceneToRun.heading}
          </span>
          <div style="flex:1;height:1px;background:#1e293b;"></div>
        `;
        feed.appendChild(divider);
        feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
        // Brief pause before starting next scene
        await new Promise((r) => setTimeout(r, 1800));
      }

      if (sessionAborted) break;
      const sceneScores = await runScene(sceneToRun);
      allResults.push({ scene: sceneToRun, scores: sceneScores });
    }

    if (!sessionAborted) showCompletion(allResults);
  }

  runAllScenes();
}

// ── Beat builder ──────────────────────────────────────────────────────────────

function buildBeats(lines, myCharacter) {
  const beats = [];
  let pendingParen     = null;
  let pendingCharacter = null;

  for (const line of lines) {
    if (line.type === 'character') {
      pendingCharacter = line.character || line.text.trim();
      pendingParen     = null;
      continue;
    }
    if (line.type === 'parenthetical') {
      pendingParen = line.text.trim();
      continue;
    }
    if (line.type === 'dialogue') {
      const char = pendingCharacter || line.character || '?';
      const isMe = char.toUpperCase() === myCharacter.toUpperCase();
      beats.push({
        type: isMe ? 'mine' : 'other',
        character: char,
        text: line.text.trim(),
        parenthetical: pendingParen || null,
      });
      pendingParen = null;
      continue;
    }
    if (line.type === 'action') {
      pendingCharacter = null;
      pendingParen     = null;
      const text = line.text.trim();
      if (text && text.length > 3) beats.push({ type: 'action', text });
      continue;
    }
  }

  return beats;
}
