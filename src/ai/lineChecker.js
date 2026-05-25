/**
 * lineChecker.js — Line accuracy scoring
 *
 * Primary:  In-browser sentence similarity via transformers.js
 *           (Xenova/all-MiniLM-L6-v2, ~23 MB, cached after first load)
 * Fallback: Word-level Levenshtein distance
 *
 * Both the HF Inference REST API and the HF SDK v4 fail from the browser:
 * the sentence-similarity endpoint has no CORS headers for POST requests.
 * Running the model locally via WASM avoids all network calls and CORS entirely.
 */

// @huggingface/transformers is imported dynamically the first time a line is
// checked — this prevents WASM initialisation from blocking the main thread
// during page load and breaking the file-upload dialog.

let _extractor     = null;
let _extractorLoad = null;
let _cosSim        = null;

function loadExtractor() {
  if (_extractor)     return Promise.resolve(_extractor);
  if (_extractorLoad) return _extractorLoad;

  console.log('[lineChecker] Loading sentence similarity model (first time only)…');
  _extractorLoad = import(/* @vite-ignore */ '@huggingface/transformers').then(({ pipeline, cos_sim }) => {
    _cosSim = cos_sim;
    return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
  }).then((e) => {
    _extractor     = e;
    _extractorLoad = null;
    console.log('[lineChecker] Similarity model ready');
    return e;
  }).catch((err) => {
    _extractorLoad = null;
    console.warn('[lineChecker] Failed to load similarity model:', err.message);
    throw err;
  });

  return _extractorLoad;
}

async function semanticSimilarity(a, b) {
  const extractor = await loadExtractor();
  const [embA, embB] = await Promise.all([
    extractor(a, { pooling: 'mean', normalize: true }),
    extractor(b, { pooling: 'mean', normalize: true }),
  ]);
  return Math.max(0, Math.min(1, _cosSim(embA.data, embB.data)));
}

// Model loads lazily on first checkLine() call — no eager pre-warm to avoid
// blocking the main thread during WASM compilation at startup.

// ── Text normalisation ────────────────────────────────────────────────────────

function normalise(text) {
  return text
    .toLowerCase()
    .replace(/[-–—]/g, ' ')
    .replace(/[''`´']/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Word-level fallback scoring ───────────────────────────────────────────────

function wordLevenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function wordScore(spoken, script) {
  const a = normalise(spoken).split(/\s+/).filter(Boolean);
  const b = normalise(script).split(/\s+/).filter(Boolean);
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const dist = wordLevenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

// ── Grade from score ──────────────────────────────────────────────────────────

function gradeScore(score) {
  if (score >= 0.82) return 'perfect';
  if (score >= 0.60) return 'close';
  if (score >= 0.38) return 'off';
  return 'missed';
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Compare the actor's spoken line to the script line.
 *
 * @param {string} spokenText
 * @param {string} scriptText
 * @returns {Promise<{ score: number, grade: 'perfect'|'close'|'off'|'missed' }>}
 */
export async function checkLine(spokenText, scriptText) {
  if (!spokenText || !spokenText.trim()) {
    return { score: 0, grade: 'missed' };
  }

  const normSpoken = normalise(spokenText);
  const normScript = normalise(scriptText);

  if (!normSpoken) return { score: 0, grade: 'missed' };

  console.log('[lineChecker] spoken :', JSON.stringify(normSpoken));
  console.log('[lineChecker] script :', JSON.stringify(normScript));

  if (normSpoken === normScript) {
    console.log('[lineChecker] exact match → perfect');
    return { score: 1, grade: 'perfect' };
  }

  // In-browser semantic similarity (no network, no CORS)
  try {
    const score = await semanticSimilarity(normScript, normSpoken);
    console.log(`[lineChecker] semantic score: ${score.toFixed(3)} → ${gradeScore(score)}`);
    return { score, grade: gradeScore(score) };
  } catch (err) {
    console.warn('[lineChecker] Semantic similarity failed:', err.message);
  }

  // Word-level fallback
  const score = wordScore(normSpoken, normScript);
  console.log(`[lineChecker] word score: ${score.toFixed(3)} → ${gradeScore(score)}`);
  return { score, grade: gradeScore(score) };
}
