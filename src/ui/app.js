import { maybeShowTutorial, showTutorial } from './tutorial.js';

let _pendingScript = null;

// ── Styles ────────────────────────────────────────────────────────────────────

const APP_STYLES_ID = 'app-styles';

function injectAppStyles() {
  if (document.getElementById(APP_STYLES_ID)) return;
  const s = document.createElement('style');
  s.id = APP_STYLES_ID;
  s.textContent = `
    .app-shell {
      display: flex; flex-direction: column; align-items: center;
      padding: 5rem 2rem 7rem;
      min-height: 100dvh;
    }
    .app-content { width: 100%; max-width: 680px; }

    /* ── Header ── */
    .app-header {
      text-align: center;
      margin-bottom: 4.5rem;
      position: relative;
      animation: fadeUp .6s ease both;
    }
    .app-logo {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: clamp(2.4rem, 6vw, 3.6rem);
      font-weight: 400;
      letter-spacing: .22em;
      color: var(--text);
      line-height: 1;
      text-transform: uppercase;
    }
    .app-logo em {
      font-style: italic;
      font-weight: 300;
      color: var(--text-2);
    }
    .app-tagline {
      font-size: .65rem;
      font-weight: 400;
      letter-spacing: .38em;
      color: var(--text-3);
      text-transform: uppercase;
      margin-top: .85rem;
    }
    .app-help-btn {
      position: absolute; top: 4px; right: 0;
      width: 26px; height: 26px;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-3);
      cursor: pointer;
      font-family: 'DM Sans', sans-serif;
      font-size: .72rem; font-weight: 500;
      display: flex; align-items: center; justify-content: center;
      transition: color .2s, border-color .2s;
    }
    .app-help-btn:hover { color: var(--text-2); border-color: var(--border-hi); }

    /* ── Upload zone ── */
    .upload-zone {
      border: 1px solid var(--border);
      padding: 3.5rem 2.5rem;
      text-align: center;
      cursor: pointer;
      background: transparent;
      transition: border-color .25s, background .25s;
      animation: fadeUp .6s .12s ease both;
    }
    .upload-zone:hover, .upload-zone.drag-over {
      border-color: var(--border-hi);
      background: var(--surface);
    }
    .upload-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 1.5rem;
      font-weight: 400;
      letter-spacing: .06em;
      color: var(--text);
      margin-bottom: .6rem;
    }
    .upload-sub {
      font-size: .8rem;
      color: var(--text-2);
      line-height: 1.75;
      margin-bottom: 2rem;
      max-width: 380px;
      margin-left: auto; margin-right: auto;
    }
    .upload-sub strong { color: var(--text); font-weight: 500; }
    .upload-btn-wrap { position: relative; display: inline-block; }
    .upload-btn {
      background: transparent;
      color: var(--text-2);
      border: 1px solid var(--border-hi);
      padding: .55rem 1.6rem;
      font-family: 'DM Sans', sans-serif;
      font-size: .8rem;
      font-weight: 400;
      letter-spacing: .08em;
      text-transform: uppercase;
      cursor: pointer;
      transition: color .2s, border-color .2s, background .2s;
      position: relative; z-index: 1;
    }
    .upload-btn:hover {
      color: var(--text); border-color: var(--text);
      background: rgba(255,255,255,.04);
    }
    .upload-input {
      position: absolute; inset: 0; width: 100%; height: 100%;
      opacity: 0; cursor: pointer; z-index: 2;
    }
    .upload-tip {
      font-size: .72rem; color: var(--text-3);
      margin-top: 1.25rem; letter-spacing: .02em;
    }
    .upload-tip strong { color: var(--text-2); font-weight: 400; }

    /* Format hint */
    .format-hint { margin-top: 1.75rem; }
    .format-hint summary {
      cursor: pointer; color: var(--text-3); font-size: .72rem;
      text-align: center; letter-spacing: .06em; text-transform: uppercase;
      user-select: none; list-style: none; transition: color .2s;
    }
    .format-hint summary:hover { color: var(--text-2); }
    .format-hint summary::-webkit-details-marker { display: none; }
    .format-hint pre {
      margin-top: 1rem; padding: 1.25rem 1.5rem;
      background: var(--surface); border: 1px solid var(--border);
      font-size: .74rem; color: var(--text-2); line-height: 1.9;
      text-align: left; white-space: pre; overflow-x: auto;
    }

    /* ── Status ── */
    .app-status {
      min-height: 1.5rem; margin-top: 1.25rem;
      font-size: .78rem; color: var(--text-2);
      letter-spacing: .02em;
      animation: fadeIn .3s ease both;
    }

    /* ── Script info ── */
    .script-info { margin-top: 2.75rem; animation: fadeUp .4s ease both; }
    .info-section { margin-bottom: 2rem; }
    .info-label {
      font-size: .62rem; font-weight: 500; letter-spacing: .14em;
      color: var(--text-3); text-transform: uppercase;
      margin-bottom: .75rem; padding-bottom: .55rem;
      border-bottom: 1px solid var(--border);
    }
    .char-pills { display: flex; flex-wrap: wrap; gap: .35rem; }
    .char-pill {
      border: 1px solid var(--border); color: var(--text-2);
      padding: .2rem .75rem;
      font-size: .75rem; letter-spacing: .04em;
    }
    .scene-list-info { display: flex; flex-direction: column; }
    .scene-list-item {
      display: flex; align-items: baseline; gap: .75rem;
      font-size: .85rem; padding: .45rem 0;
      border-bottom: 1px solid var(--border);
    }
    .scene-list-item:last-child { border-bottom: none; }
    .scene-list-item .scene-num {
      font-size: .65rem; color: var(--text-3); flex-shrink: 0;
      width: 1.25rem; font-variant-numeric: tabular-nums;
    }
    .scene-list-item .scene-name { color: var(--text); font-weight: 400; flex: 1; }
    .scene-list-item .scene-count { font-size: .72rem; color: var(--text-3); }

    /* ── Rehearsal selector ── */
    .rehearsal-selector {
      margin-top: 3rem; padding-top: 2.5rem;
      border-top: 1px solid var(--border);
      animation: fadeUp .4s .05s ease both;
    }
    .selector-heading {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 1.6rem; font-weight: 400;
      color: var(--text); margin-bottom: .3rem; letter-spacing: .04em;
    }
    .selector-sub {
      font-size: .78rem; color: var(--text-3); margin-bottom: 2.25rem;
      letter-spacing: .02em;
    }
    .selector-label {
      font-size: .62rem; font-weight: 500; letter-spacing: .14em;
      color: var(--text-3); text-transform: uppercase;
      margin-bottom: .65rem; display: block;
    }

    /* Character chips */
    .char-selector { display: flex; flex-wrap: wrap; gap: .35rem; margin-bottom: 2.25rem; }
    .char-chip {
      border: 1px solid var(--border); color: var(--text-2);
      padding: .35rem .95rem;
      cursor: pointer; font-size: .8rem; font-weight: 400;
      font-family: 'DM Sans', sans-serif; letter-spacing: .04em;
      background: transparent;
      transition: color .2s, border-color .2s, background .2s;
    }
    .char-chip:hover { color: var(--text); border-color: var(--border-hi); }
    .char-chip.active {
      color: var(--bg); background: var(--text); border-color: var(--text);
    }

    /* Scene multi-select */
    .scene-selector-wrap { margin-bottom: 2.25rem; }
    .scene-select-all-row { display: flex; justify-content: flex-end; margin-bottom: .6rem; }
    .scene-all-btn {
      background: none; border: none; color: var(--text-3);
      cursor: pointer; font-size: .7rem; font-family: 'DM Sans', sans-serif;
      letter-spacing: .05em; text-transform: uppercase;
      transition: color .2s; padding: 0;
    }
    .scene-all-btn:hover { color: var(--text-2); }
    .scene-rows { display: flex; flex-direction: column; }
    .scene-row {
      display: flex; align-items: center; gap: .65rem;
      border-bottom: 1px solid var(--border);
      padding: .7rem .15rem; cursor: pointer;
      transition: background .15s;
    }
    .scene-row:first-child { border-top: 1px solid var(--border); }
    .scene-row:hover { background: var(--surface); }
    .scene-row.selected { background: var(--surface); }
    .scene-row-check {
      width: 14px; height: 14px; flex-shrink: 0;
      border: 1px solid var(--border-hi);
      display: flex; align-items: center; justify-content: center;
      font-size: .55rem; color: var(--bg);
      transition: background .15s, border-color .15s;
    }
    .scene-row.selected .scene-row-check {
      background: var(--text); border-color: var(--text);
    }
    .scene-row-name { flex: 1; font-size: .88rem; color: var(--text); }
    .scene-row-count { font-size: .72rem; color: var(--text-3); }

    /* Start button */
    .start-btn {
      width: 100%; padding: .9rem;
      background: var(--text); color: var(--bg);
      border: none;
      font-family: 'DM Sans', sans-serif;
      font-size: .8rem; font-weight: 500;
      letter-spacing: .1em; text-transform: uppercase;
      cursor: pointer;
      transition: opacity .2s, background .2s;
      margin-top: .5rem;
    }
    .start-btn:hover:not(:disabled) { background: var(--white); }
    .start-btn:disabled { opacity: .25; cursor: default; }
  `;
  document.head.appendChild(s);
}

// ── Main export ────────────────────────────────────────────────────────────────

export function renderApp(container) {
  injectAppStyles();

  container.innerHTML = `
    <div class="app-shell">
      <div class="app-content">

        <header class="app-header">
          <div class="app-logo">Line <em>Runner</em></div>
          <div class="app-tagline">AI Rehearsal Partner</div>
          <button class="app-help-btn" id="help-btn" title="Open tutorial">?</button>
        </header>

        <section class="upload-zone" id="upload-section">
          <div class="upload-title">Upload Your Script</div>
          <p class="upload-sub">
            Drop a PDF here or browse to choose a file.<br>
            Supports standard stage-play format with character names in
            <strong>ALL CAPS</strong> on their own line.
            Must be a <strong>text-based PDF</strong>, not a scan.
          </p>
          <div class="upload-btn-wrap" id="browse-wrap">
            <button class="upload-btn" id="browse-btn">Browse Files</button>
            <input class="upload-input" id="pdf-input" type="file" />
          </div>
          <p class="upload-tip">
            If the dialog freezes, <strong>drag your PDF</strong> directly onto this area.
          </p>

          <details class="format-hint">
            <summary>Show expected format</summary>
            <pre>ACT ONE
SCENE 1

A living room. Evening.

ELEANOR
    I can't believe you said that.

MARK
    (quietly)
    Neither can I.

or with colons:

ELEANOR: I can't believe you said that.
MARK: (quietly) Neither can I.</pre>
          </details>
        </section>

        <div class="app-status" id="status"></div>

        <section id="results" style="display:none;">
          <div class="script-info">
            <div class="info-section">
              <div class="info-label">Characters</div>
              <div class="char-pills" id="character-list"></div>
            </div>
            <div class="info-section">
              <div class="info-label">Scenes</div>
              <div class="scene-list-info" id="scene-list"></div>
            </div>
          </div>

          <div class="rehearsal-selector" id="rehearsal-selector">
            <div class="selector-heading">Start Rehearsal</div>
            <div class="selector-sub">Choose your character and scenes, then start.</div>

            <label class="selector-label">I am playing</label>
            <div class="char-selector" id="char-selector"></div>

            <label class="selector-label">Rehearse scenes</label>
            <div class="scene-selector-wrap">
              <div class="scene-select-all-row">
                <button class="scene-all-btn" id="select-all-btn">Select All</button>
              </div>
              <div class="scene-rows" id="scene-selector"></div>
            </div>

            <button class="start-btn" id="start-rehearsal-btn" disabled>
              Start Rehearsal
            </button>
          </div>
        </section>

      </div>
    </div>
  `;

  const input         = container.querySelector('#pdf-input');
  const browseBtn     = container.querySelector('#browse-btn');
  const uploadSection = container.querySelector('#upload-section');
  const status        = container.querySelector('#status');
  const startBtn      = container.querySelector('#start-rehearsal-btn');

  maybeShowTutorial();
  container.querySelector('#help-btn').addEventListener('click', () => showTutorial());

  // ── File picker ─────────────────────────────────────────────────────────────
  // Always use the transparent overlaid input — no accept filter (avoids the
  // Windows PDF shell-extension crash) and no showOpenFilePicker (can silently
  // fail in some browser configs). The input sits z-index:2 over the button so
  // clicks land on it naturally; the button click also triggers it as a fallback.
  browseBtn.addEventListener('click', () => input.click());

  // ── State ────────────────────────────────────────────────────────────────────
  let currentScript        = null;
  let selectedCharacter    = null;
  let selectedSceneIndices = new Set();

  function updateStartBtn() {
    const ready = selectedCharacter !== null && selectedSceneIndices.size > 0;
    const n = selectedSceneIndices.size;
    startBtn.disabled    = !ready;
    startBtn.textContent = n > 1 ? `Start · ${n} Scenes` : 'Start Rehearsal';
  }

  // ── Restore from back-navigation ─────────────────────────────────────────────
  const scriptToRestore = _pendingScript;
  _pendingScript = null;
  if (scriptToRestore) {
    currentScript = scriptToRestore;
    renderResults(scriptToRestore);
    renderSelector(scriptToRestore);
    status.textContent = 'Script loaded. Select a character and scene to rehearse again.';
  }

  function isPDF(file) {
    return file?.type === 'application/pdf' || file?.name?.toLowerCase().endsWith('.pdf');
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────────
  uploadSection.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadSection.classList.add('drag-over');
  });
  uploadSection.addEventListener('dragleave', () => uploadSection.classList.remove('drag-over'));
  uploadSection.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadSection.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!isPDF(file)) { status.textContent = 'Please drop a PDF file.'; return; }
    handleFile(file);
  });
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    if (!isPDF(file)) { status.textContent = 'Please choose a PDF file.'; return; }
    handleFile(file);
  });

  // ── File handling ─────────────────────────────────────────────────────────────
  async function handleFile(file) {
    container.querySelector('#results').style.display = 'none';
    selectedCharacter = null;
    selectedSceneIndices.clear();
    status.textContent = `Loading "${file.name}"...`;

    try {
      const { parseScriptFile } = await import('../parser/index.js');
      const script = await parseScriptFile(file, (msg) => { status.textContent = msg; });
      currentScript = script;
      renderResults(script);
      renderSelector(script);

      const method = script.detectionMethod ?? (script.aiUsed ? 'ai' : 'heuristic');
      const baseMethod  = method.replace(/\+.*$/, '');
      const blockSplit  = method.includes('+block-split');
      const methodLabel = {
        'same-line-split':    'same-line format',
        'dialogue-precursor': 'dialogue precursor',
        'x-position':         'position analysis',
        'ai':                 'AI',
        'frequency-heuristic':'heuristic',
      }[baseMethod] ?? baseMethod;
      const sceneNote = blockSplit ? ' (scenes inferred from structure)' : '';
      status.textContent =
        `${script.scenes.length} scene${script.scenes.length !== 1 ? 's' : ''}, ${script.characters.length} character${script.characters.length !== 1 ? 's' : ''} — ${methodLabel}${sceneNote}`;
    } catch (err) {
      console.error(err);
      status.innerHTML = err.message
        .split('\n')
        .map((line, i) => i === 0
          ? `<strong style="color:var(--text);">${line}</strong>`
          : `<span style="color:var(--text-3); font-size:.78rem;">${line}</span>`)
        .join('<br>');
    }
  }

  // ── Render character + scene info ─────────────────────────────────────────────
  function renderResults({ characters, scenes }) {
    const charList  = container.querySelector('#character-list');
    const sceneList = container.querySelector('#scene-list');

    charList.innerHTML = characters.map((c) =>
      `<span class="char-pill">${c}</span>`
    ).join('');

    sceneList.innerHTML = scenes.map((s, i) => `
      <div class="scene-list-item">
        <span class="scene-num">${i + 1}</span>
        <span class="scene-name">${s.heading}</span>
        <span class="scene-count">${s.lines.filter((l) => l.type === 'dialogue').length} lines</span>
      </div>
    `).join('');

    const resultsEl = container.querySelector('#results');
    if (resultsEl) resultsEl.style.display = 'block';
  }

  // ── Render rehearsal selector ─────────────────────────────────────────────────
  function renderSelector({ characters, scenes }) {
    const charSelector = container.querySelector('#char-selector');
    const sceneRows    = container.querySelector('#scene-selector');
    const selectAllBtn = container.querySelector('#select-all-btn');

    charSelector.innerHTML = '';
    characters.forEach((char) => {
      const btn = document.createElement('button');
      btn.className   = 'char-chip';
      btn.textContent = char;
      btn.addEventListener('click', () => {
        selectedCharacter = char;
        charSelector.querySelectorAll('.char-chip').forEach((b) => {
          b.classList.toggle('active', b.textContent === char);
        });
        updateStartBtn();
      });
      charSelector.appendChild(btn);
    });

    sceneRows.innerHTML = '';
    selectedSceneIndices.clear();

    selectAllBtn.textContent = 'Select All';
    selectAllBtn.onclick = () => {
      const selectingAll = selectedSceneIndices.size < scenes.length;
      selectedSceneIndices.clear();
      if (selectingAll) scenes.forEach((_, i) => selectedSceneIndices.add(i));
      sceneRows.querySelectorAll('.scene-row').forEach((row, i) => {
        const sel = selectedSceneIndices.has(i);
        row.classList.toggle('selected', sel);
        row.querySelector('.scene-row-check').textContent = sel ? '×' : '';
        row.querySelector('.scene-row-check').style.transform = sel ? 'rotate(45deg)' : '';
      });
      selectAllBtn.textContent = selectedSceneIndices.size === scenes.length ? 'Deselect All' : 'Select All';
      updateStartBtn();
    };

    scenes.forEach((scene, idx) => {
      const row = document.createElement('div');
      row.className = 'scene-row';
      const lineCount = scene.lines.filter((l) => l.type === 'dialogue').length;
      row.innerHTML = `
        <span class="scene-row-check"></span>
        <span class="scene-row-name">${scene.heading}</span>
        <span class="scene-row-count">${lineCount} lines</span>
      `;
      row.addEventListener('click', () => {
        const check = row.querySelector('.scene-row-check');
        if (selectedSceneIndices.has(idx)) {
          selectedSceneIndices.delete(idx);
          row.classList.remove('selected');
          check.textContent = '';
          check.style.transform = '';
        } else {
          selectedSceneIndices.add(idx);
          row.classList.add('selected');
          check.textContent = '×';
          check.style.transform = 'rotate(45deg)';
        }
        selectAllBtn.textContent = selectedSceneIndices.size === scenes.length ? 'Deselect All' : 'Select All';
        updateStartBtn();
      });
      sceneRows.appendChild(row);
    });

    updateStartBtn();
  }

  // ── Start Rehearsal ───────────────────────────────────────────────────────────
  startBtn.addEventListener('click', () => {
    if (!currentScript || selectedCharacter === null || selectedSceneIndices.size === 0) return;
    const sceneIdxList = [...selectedSceneIndices].sort((a, b) => a - b);
    launchRehearsal(currentScript, selectedCharacter, sceneIdxList);
  });

  async function launchRehearsal(script, character, sceneIdxList) {
    container.innerHTML = '';
    const { renderRehearsal } = await import('./rehearsal.js');
    renderRehearsal(container, script, character, sceneIdxList);
    container.addEventListener('rehearsal:back', () => {
      _pendingScript = script;
      renderApp(container);
    }, { once: true });
  }
}
