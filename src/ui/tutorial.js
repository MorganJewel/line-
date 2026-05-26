/**
 * tutorial.js - First-launch walkthrough overlay for Line Runner
 *
 * Usage:
 *   import { showTutorial, maybeShowTutorial } from './tutorial.js';
 *
 *   maybeShowTutorial()  → shows only if user hasn't seen it yet
 *   showTutorial()       → always shows (triggered by the ? button)
 */

const SEEN_KEY = 'linerunner_tutorial_seen';

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  {
    icon: '01',
    title: 'Welcome to Line Runner',
    body: `
      <p>Line Runner is your personal AI rehearsal partner.</p>
      <p>It reads the other characters' lines aloud, listens to yours, and gives you instant feedback so you can run scenes anywhere, any time.</p>
      <p style="color:#64748b; font-size:.88rem; margin-top:.75rem;">This quick walkthrough will get you up to speed in about a minute.</p>
    `,
  },
  {
    icon: '02',
    title: 'Upload your script',
    body: `
      <p>Click <strong>Choose PDF</strong> or drag your script PDF onto the upload box.</p>
      <div class="tut-demo-box">
        <div class="tut-demo-upload">
          <span style="font-size:.68rem; letter-spacing:.12em; text-transform:uppercase; color:var(--text-3,#3a3a40);">Drop PDF here</span>
          <span style="font-size:.8rem; color:var(--text-2,#737378);">or use <em>Browse Files</em></span>
        </div>
      </div>
      <p style="color:#64748b; font-size:.85rem; margin-top:.75rem;">
        Line Runner supports standard stage-play format. Character names in
        <strong style="color:#93c5fd;">ALL CAPS</strong> on their own line (or followed by a colon).
        The file must be a <em>text-based</em> PDF, not a scan.
      </p>
    `,
  },
  {
    icon: '03',
    title: 'Pick your character',
    body: `
      <p>After the script loads, Line Runner lists every character it found.</p>
      <div class="tut-demo-box" style="justify-content:center; gap:.5rem; flex-wrap:wrap;">
        <span class="tut-chip tut-chip-active">ELEANOR</span>
        <span class="tut-chip">MARK</span>
        <span class="tut-chip">DETECTIVE</span>
      </div>
      <p>Click your character's chip — it turns blue to confirm your choice.</p>
      <p style="color:#64748b; font-size:.85rem; margin-top:.5rem;">
        Only <em>your</em> lines will be scored. All other lines are spoken aloud by the reader voice.
      </p>
    `,
  },
  {
    icon: '04',
    title: 'Choose your scenes',
    body: `
      <p>Tick one or more scenes from the list, or hit <strong>Select All</strong> to run the entire script.</p>
      <div class="tut-demo-box" style="flex-direction:column; gap:.35rem; align-items:stretch;">
        <div class="tut-scene-row tut-scene-active">
          <span class="tut-check">✓</span>
          <span style="flex:1; color:#93c5fd; font-weight:600;">ACT ONE / SCENE 1</span>
          <span style="color:#475569; font-size:.8rem;">12 lines</span>
        </div>
        <div class="tut-scene-row">
          <span class="tut-check-empty"></span>
          <span style="flex:1; color:#93c5fd; font-weight:600;">ACT ONE / SCENE 2</span>
          <span style="color:#475569; font-size:.8rem;">8 lines</span>
        </div>
      </div>
      <p style="margin-top:.5rem;">When you're ready, press <strong>Start Rehearsal</strong>.</p>
    `,
  },
  {
    icon: '05',
    title: 'Speak your lines',
    body: `
      <p>During rehearsal, other characters' lines are read aloud automatically.</p>
      <p>When it's <em>your</em> turn, tap the mic button and deliver your line:</p>
      <div class="tut-demo-box" style="gap:1rem;">
        <div class="tut-mic-btn" style="color:var(--bg,#0b0b0d);">
          <svg width="16" height="20" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4.5" y="0.75" width="7" height="11.5" rx="3.5" stroke="currentColor" stroke-width="1.25"/>
            <path d="M1 10C1 13.866 4.13401 17 8 17C11.866 17 15 13.866 15 10" stroke="currentColor" stroke-width="1.25" stroke-linecap="square"/>
            <line x1="8" y1="17" x2="8" y2="19.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="square"/>
            <line x1="5" y1="19.5" x2="11" y2="19.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="square"/>
          </svg>
        </div>
        <div style="text-align:left;">
          <div style="font-size:.85rem; color:#e2e8f0; margin-bottom:.35rem;">Tap to speak your line</div>
          <div style="font-size:.78rem; color:#64748b;">Chrome/Edge auto-detect silence.<br>Firefox: tap <strong>⏹ Stop</strong> when done.</div>
        </div>
      </div>
      <p style="color:#64748b; font-size:.85rem; margin-top:.5rem;">
        <strong style="color:#94a3b8;">Keyboard shortcuts:</strong>
        <kbd>Space</kbd> mic &nbsp;
        <kbd>S</kbd> skip &nbsp;
        <kbd>H</kbd> hint &nbsp;
        <kbd>P</kbd> pause
      </p>
    `,
  },
  {
    icon: '06',
    title: 'Hands-free mode',
    body: `
      <p>Turn on <strong>Hands-free</strong> in the top bar for a completely button-free experience:</p>
      <ul style="padding-left:1.2rem; line-height:1.9; color:#cbd5e1;">
        <li>The mic starts automatically after each cue line</li>
        <li>Voice-activity detection stops it when you go silent</li>
        <li>If you miss a line, you'll be asked aloud: <em>"Try that line again, or keep going?"</em> Just say <em>"again"</em> or <em>"keep going"</em></li>
      </ul>
      <p style="font-size:.85rem;">Also try <strong>Blind Mode</strong>, which hides your lines so you are working purely from memory.</p>
    `,
  },
  {
    icon: '07',
    title: 'Feedback and scoring',
    body: `
      <p>After each line you get colour-coded feedback:</p>
      <div style="display:flex; flex-direction:column; gap:.4rem; margin:.5rem 0;">
        <div class="tut-fb tut-fb-perfect"><strong>Perfect</strong> - spot on</div>
        <div class="tut-fb tut-fb-close"><strong>Close</strong> - minor wording differences</div>
        <div class="tut-fb tut-fb-off"><strong>Off</strong> - significant differences</div>
        <div class="tut-fb tut-fb-missed"><strong>Missed</strong> - nothing heard or skipped</div>
      </div>
      <p style="font-size:.85rem;">At the end of each session you get an overall score, a per-scene breakdown for multi-scene runs, and a <strong>Lines to Study</strong> list.</p>
    `,
  },
  {
    icon: '08',
    title: 'Hints and extras',
    body: `
      <ul style="padding-left:1.2rem; line-height:2; color:#cbd5e1;">
        <li><strong>Hint</strong> - reveals the first two words of your line. Lines where you used a hint are flagged for later study.</li>
        <li><strong>Try again</strong> - retry any line you were not happy with (manual mode).</li>
        <li><strong>Speed slider</strong> - slow the reader down or speed it up.</li>
        <li><strong>Voice picker</strong> - choose the reader voice that suits you best.</li>
        <li><strong>Pause</strong> - freezes everything mid-scene.</li>
        <li><strong>Rehearse Again</strong> - restart the same scenes after the summary screen.</li>
      </ul>
      <p style="color:#64748b; font-size:.85rem; margin-top:.5rem;">You can re-open this tutorial anytime with the <strong>?</strong> button on the main page.</p>
    `,
  },
];

// ── Styles ────────────────────────────────────────────────────────────────────

const STYLES_ID = 'tut-styles';

function injectStyles() {
  if (document.getElementById(STYLES_ID)) return;
  const s = document.createElement('style');
  s.id = STYLES_ID;
  s.textContent = `
    /* Overlay */
    #tut-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,.72);
      display: flex; align-items: center; justify-content: center;
      padding: 1rem;
      animation: tut-fade-in .2s ease;
    }
    @keyframes tut-fade-in { from { opacity: 0; } to { opacity: 1; } }

    /* Card */
    #tut-card {
      background: var(--surface, #131315);
      border: 1px solid var(--border, #252528);
      padding: 2rem 2rem 1.5rem;
      max-width: 520px;
      width: 100%;
      box-shadow: 0 32px 80px rgba(0,0,0,.7);
      display: flex;
      flex-direction: column;
      gap: 1rem;
      max-height: 90dvh;
      overflow-y: auto;
      animation: tut-slide-up .25s ease;
    }
    @keyframes tut-slide-up {
      from { opacity: 0; transform: translateY(20px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* Header */
    #tut-card .tut-icon  {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 1rem; font-weight: 300; letter-spacing: .2em;
      color: var(--text-3, #3a3a40); text-align: center;
    }
    #tut-card .tut-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 1.5rem; font-weight: 400; letter-spacing: .04em;
      color: var(--text, #edecea); text-align: center;
    }
    #tut-card .tut-body  {
      font-size: .9rem; color: var(--text-2, #94a3b8); line-height: 1.7;
    }
    #tut-card .tut-body p { margin: 0 0 .6rem; }
    #tut-card .tut-body p:last-child { margin-bottom: 0; }
    #tut-card .tut-body strong { color: var(--text-1, #f0f4ff); }
    #tut-card .tut-body kbd {
      background: var(--bg-base, #07090f);
      border: 1px solid var(--border-mid, #243356);
      padding: .1rem .35rem;
      font-size: .78rem; color: var(--text-2, #94a3b8);
      font-family: inherit;
    }

    /* Progress dots */
    #tut-dots {
      display: flex; justify-content: center; gap: .45rem; margin-top: .1rem;
    }
    .tut-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--border-hi, #2d4270); transition: background .2s, transform .2s;
    }
    .tut-dot.active {
      background: var(--accent, #3b82f6); transform: scale(1.3);
    }

    /* Nav buttons */
    #tut-nav {
      display: flex; gap: .5rem; justify-content: flex-end; align-items: center;
      margin-top: .25rem; padding-top: .75rem;
      border-top: 1px solid var(--border, #1a2744);
    }
    #tut-skip-btn {
      background: none; border: none; color: var(--text-3, #4b6080);
      cursor: pointer; font-size: .8rem; padding: .3rem .4rem;
      transition: color .15s; margin-right: auto; font-family: inherit;
    }
    #tut-skip-btn:hover { color: var(--text-2, #94a3b8); }
    .tut-nav-btn {
      background: var(--bg-elevated, #111827);
      border: 1px solid var(--border-mid, #243356);
      color: var(--text-1, #f0f4ff);
      padding: .42rem 1rem;
      cursor: pointer; font-size: .85rem; font-weight: 600; font-family: inherit;
      transition: background .15s, border-color .15s;
    }
    .tut-nav-btn:hover { background: var(--bg-card, #141e32); border-color: var(--border-hi, #2d4270); }
    .tut-nav-btn.primary {
      background: var(--accent, #3b82f6); border-color: transparent; color: #fff;
      box-shadow: 0 4px 16px rgba(59,130,246,.25);
    }
    .tut-nav-btn.primary:hover { background: var(--accent-hover, #2563eb); }

    /* Demo components used in step bodies */
    .tut-demo-box {
      display: flex; align-items: center;
      background: var(--bg-base, #07090f);
      border: 1px solid var(--border, #1a2744);
      padding: .85rem 1rem; margin: .6rem 0;
    }
    .tut-demo-upload {
      display: flex; flex-direction: column; align-items: center;
      gap: .4rem; color: var(--text-3, #4b6080); font-size: .85rem; width: 100%;
    }
    .tut-chip {
      background: var(--bg-elevated, #111827);
      border: 1px solid var(--border-mid, #243356);
      color: var(--text-1, #f0f4ff);
      padding: .28rem .85rem; font-size: .85rem;
    }
    .tut-chip-active {
      background: var(--accent-dim, #1e3a6e);
      border-color: var(--accent, #3b82f6); color: #fff; font-weight: 600;
    }
    .tut-scene-row {
      display: flex; align-items: center; gap: .6rem;
      background: var(--bg-surface, #0d1424);
      border: 1px solid var(--border, #1a2744);
      padding: .45rem .85rem; font-size: .85rem;
    }
    .tut-scene-active {
      background: rgba(29,78,216,.1) !important;
      border-color: rgba(59,130,246,.35) !important;
    }
    .tut-check {
      width: 16px; height: 16px; flex-shrink: 0;
      background: var(--accent, #3b82f6);
      border: 2px solid var(--accent, #3b82f6); color: #fff;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: .6rem;
    }
    .tut-check-empty {
      width: 16px; height: 16px; flex-shrink: 0;
      border: 2px solid var(--border-hi, #2d4270); display: inline-block;
    }
    .tut-mic-btn {
      width: 48px; height: 48px;
      background: var(--text, #edecea);
      display: flex; align-items: center;
      justify-content: center; flex-shrink: 0;
    }
    .tut-fb {
      padding: .45rem .8rem; font-size: .83rem;
    }
    .tut-fb-perfect { background: rgba(20,83,45,.6);  border: 1px solid rgba(22,101,52,.8);  color: #86efac; }
    .tut-fb-close   { background: rgba(113,63,18,.6); border: 1px solid rgba(146,64,14,.8);  color: #fde68a; }
    .tut-fb-off     { background: rgba(127,29,29,.6); border: 1px solid rgba(153,27,27,.8);  color: #fca5a5; }
    .tut-fb-missed  { background: rgba(28,25,23,.6);  border: 1px solid rgba(68,64,60,.8);   color: #a8a29e; }
  `;
  document.head.appendChild(s);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Show the tutorial only if the user hasn't seen it before.
 * Returns a Promise that resolves when the tutorial is dismissed.
 */
export function maybeShowTutorial() {
  if (localStorage.getItem(SEEN_KEY)) return Promise.resolve();
  return showTutorial();
}

/**
 * Always show the tutorial (used by the ? help button).
 * Returns a Promise that resolves when dismissed.
 */
export function showTutorial() {
  return new Promise((resolve) => {
    injectStyles();

    let step = 0;

    // ── Overlay ──
    const overlay = document.createElement('div');
    overlay.id = 'tut-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Line Runner tutorial');

    // Close on backdrop click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) dismiss();
    });

    // ── Card ──
    const card = document.createElement('div');
    card.id = 'tut-card';
    overlay.appendChild(card);

    function render() {
      const s = STEPS[step];
      const isLast = step === STEPS.length - 1;
      const isFirst = step === 0;

      card.innerHTML = `
        <div class="tut-icon">${s.icon}</div>
        <div class="tut-title">${s.title}</div>
        <div class="tut-body">${s.body}</div>
        <div id="tut-dots">
          ${STEPS.map((_, i) => `<div class="tut-dot${i === step ? ' active' : ''}"></div>`).join('')}
        </div>
        <div id="tut-nav">
          <button id="tut-skip-btn">${isLast ? '' : 'Skip tutorial'}</button>
          ${!isFirst ? `<button class="tut-nav-btn" id="tut-prev-btn">Back</button>` : ''}
          <button class="tut-nav-btn primary" id="tut-next-btn">
            ${isLast ? 'Get started' : 'Next'}
          </button>
        </div>
      `;

      card.querySelector('#tut-next-btn').addEventListener('click', () => {
        if (isLast) { dismiss(); } else { step++; render(); }
      });
      const prevBtn = card.querySelector('#tut-prev-btn');
      if (prevBtn) prevBtn.addEventListener('click', () => { step--; render(); });
      card.querySelector('#tut-skip-btn').addEventListener('click', dismiss);
    }

    function dismiss() {
      document.removeEventListener('keydown', onKey);
      localStorage.setItem(SEEN_KEY, '1');
      overlay.style.animation = 'tut-fade-in .15s ease reverse forwards';
      setTimeout(() => {
        overlay.remove();
        resolve();
      }, 150);
    }

    // Keyboard nav
    function onKey(e) {
      if (e.key === 'Escape')       { dismiss(); return; }
      if (e.key === 'ArrowRight') {
        if (step < STEPS.length - 1) { step++; render(); }
        else dismiss();
      }
      if (e.key === 'ArrowLeft' && step > 0) { step--; render(); }
    }
    document.addEventListener('keydown', onKey);

    render();
    document.body.appendChild(overlay);

    // Focus the next button for keyboard accessibility
    setTimeout(() => card.querySelector('#tut-next-btn')?.focus(), 50);
  });
}
