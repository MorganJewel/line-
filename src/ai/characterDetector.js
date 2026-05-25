/**
 * characterDetector.js
 *
 * Two-stage AI character detection:
 *
 *   Stage 1 — Collect heuristic candidates (all-caps short lines) from the
 *              script, then validate each one using HF zero-shot classification
 *              (facebook/bart-large-mnli).  Free tier, browser-safe, no CORS issues.
 *
 *   Stage 2 — Fallback: if Stage 1 fails, return empty Set so scriptParser
 *              uses its own built-in heuristic detection instead.
 *
 * Zero-shot classification asks: is this string a "character name" or a
 * "stage direction"?  Far more accurate than regex alone.
 */

import { HfInference } from '@huggingface/inference';

const ZSC_MODEL    = 'facebook/bart-large-mnli'; // free tier, CORS-safe
const LABELS       = ['character name', 'stage direction', 'action line', 'song lyric'];
const MAX_PAGES    = 5;
const MAX_CHARS    = 5000;

// Same rules as scriptParser — keep in sync
const SCENE_RE       = /^\s*(INT\b|EXT\b|INT\.\/EXT\b|I\/E\b|SCENE(?=[^A-Za-z]|$)|ACT(?=[^A-Za-z]|$)|PART\s+(\d+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)|CHAPTER\s+\d+)/i;
const ALL_CAPS_RE    = /^[A-Z][A-Z\s\-'0-9]{0,50}$/; // removed .!?,() — those aren't in real names
const PAREN_RE       = /^\s*\(.*\)\s*$/;
const NOISE_WORDS    = new Set([
  'CUT TO','FADE IN','FADE OUT','FADE TO','DISSOLVE TO','SMASH CUT','TITLE CARD',
  'TITLE','SUPER','CONTINUED','THE END','BLACKOUT','LIGHTS UP','LIGHTS DOWN',
  'MUSIC','SONG','DANCE','SILENCE','PAUSE','BEAT','MORE','INSERT','INTERCUT',
]);
const IMPERATIVE_VERBS = new Set([
  'BRAID','COME','GO','STOP','LOOK','TAKE','GIVE','PUT','GET','MAKE','BRING',
  'HOLD','STAY','WAIT','RUN','WALK','MOVE','TURN','OPEN','CLOSE','PICK','DROP',
  'PULL','PUSH','SIT','STAND','ENTER','EXIT','SING','DANCE','BYE','HEY','OH',
  'NO','YES','OK','OKAY',
]);

/**
 * @param {string[]} pageTexts
 * @param {(msg: string) => void} [onStatus]
 * @returns {Promise<Set<string>>}
 */
export async function detectCharactersWithAI(pageTexts, onStatus) {
  const apiKey = import.meta.env.VITE_HF_API_KEY;

  if (!apiKey || apiKey === 'your_huggingface_api_key') {
    console.warn('[characterDetector] No HF API key — skipping AI detection.');
    return new Set();
  }

  // ── Build candidate pool from raw text ───────────────────────────────────
  const text  = pageTexts.slice(0, MAX_PAGES).join('\n').slice(0, MAX_CHARS);
  const lines = text.split('\n').map(l => l.trim());
  const candidates = [...new Set(
    lines.filter(l => isRawCandidate(l)).map(l => l.replace(/\s*\(.*?\)\s*$/, '').trim().toUpperCase())
  )];

  if (candidates.length === 0) {
    console.warn('[characterDetector] No all-caps candidates found.');
    return new Set();
  }

  onStatus?.(`🤖 AI classifying ${candidates.length} candidates…`);
  console.log('[characterDetector] candidates to classify:', candidates);

  const hf = new HfInference(apiKey);
  const confirmed = new Set();

  // Classify in batches of 5 to avoid overloading
  for (let i = 0; i < candidates.length; i += 5) {
    const batch = candidates.slice(i, i + 5);
    await Promise.all(
      batch.map(async (name) => {
        try {
          const raw = await hf.zeroShotClassification({
            model: ZSC_MODEL,
            inputs: name,
            parameters: { candidate_labels: LABELS },
          });
          // The library can return either a plain object {labels, scores}
          // or an array [{labels, scores}] depending on the API version / input type.
          // Normalise to always work with the plain object.
          const result = Array.isArray(raw) ? raw[0] : raw;
          if (!result?.labels?.[0]) {
            console.warn(`[characterDetector] unexpected ZSC shape for "${name}":`, raw);
            return;
          }
          const top = result.labels[0];
          console.log(`[characterDetector] "${name}" → ${top} (${(result.scores[0] * 100).toFixed(1)}%)`);
          if (top === 'character name') confirmed.add(name);
        } catch (err) {
          console.warn(`[characterDetector] ZSC failed for "${name}":`, err.message);
        }
      })
    );
  }

  if (confirmed.size > 0) {
    console.log('[characterDetector] AI confirmed:', [...confirmed]);
    return confirmed;
  }

  console.warn('[characterDetector] ZSC returned no character names — using heuristics.');
  return new Set();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isRawCandidate(t) {
  if (!t || t.length < 3) return false;   // ← was 2; "CC", "OK" etc. not useful
  if (!ALL_CAPS_RE.test(t)) return false;
  if (SCENE_RE.test(t)) return false;
  if (PAREN_RE.test(t)) return false;
  if (/[!?]/.test(t)) return false;
  if (/[.!?,;:]$/.test(t)) return false;
  const clean = t.replace(/\s*\(.*?\)\s*$/, '').trim().toUpperCase();
  const words = clean.split(/\s+/);
  // 1–3 words: most real character names fit here.
  // "CLASSICAL GREEK TRAGEDY" = 3 words but we also guard against
  // adjective-noun-noun patterns by checking the word count limit more strictly.
  if (words.length > 3) return false;   // ← was 4
  // Single-letter initials are not character names ("A", "I", etc.)
  if (words.length === 1 && words[0].length === 1) return false;
  const firstWord = words[0];
  if (IMPERATIVE_VERBS.has(firstWord)) return false;
  if (NOISE_WORDS.has(clean)) return false;
  return true;
}
