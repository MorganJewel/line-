/**
 * scriptParser.js
 *
 * Parses a standard stage play script.
 *
 * SUPPORTED FORMATS
 * ─────────────────
 * Format A — separate-line cue (most common):
 *
 *   ELEANOR
 *       I can't believe you said that.
 *
 *   MARK
 *       (quietly) Neither can I.
 *
 * Format B — same-line colon cue (published scripts):
 *
 *   ELEANOR: I can't believe you said that.
 *   MARK: (quietly) Neither can I.
 *
 * Both formats can coexist in the same script.
 * Scene / Act headings are detected automatically.
 */

// ── Patterns ──────────────────────────────────────────────────────────────────

const SCENE_RE = /^\s*(INT\b|EXT\b|INT\.\/EXT\b|I\/E\b|SCENE(?=[^A-Za-z]|$)|ACT(?=[^A-Za-z]|$)|PART\s+\S|CHAPTER\s+\d)/i;
const PAREN_RE = /^\s*\(.*\)\s*$/;

// Words that look like ALL-CAPS names but are never characters
const NOISE = new Set([
  'CUT TO','FADE IN','FADE OUT','FADE TO','DISSOLVE TO','SMASH CUT',
  'THE END','BLACKOUT','LIGHTS UP','LIGHTS DOWN','LIGHTS OUT','LIGHTS FADE',
  'MUSIC','SONG','SILENCE','PAUSE','BEAT','CONTINUED','MORE',
  'END OF ACT','END OF SCENE','CURTAIN','INTERMISSION','EPILOGUE','PROLOGUE',
  'VOICE OVER','SOUND','SOUND FX',
]);

// Boilerplate / metadata lines to strip before parsing
const METADATA_RE = [
  /^\d+\.?\s*$/,              // bare page numbers
  /all rights reserved/i,
  /copyright\s*©/i,
  /samuel french/i,
  /dramatists play service/i,
  /dramatic publishing/i,
  /performance rights/i,
  /printed in the u\.s/i,
  /^isbn\b/i,
];

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {Array<{pageNum:number, lines:Array<{text:string,x:number,allCaps:boolean}>}>} structuredPages
 * @returns {{ characters: string[], scenes: object[], detectionMethod: string }}
 */
export function parseScript(structuredPages) {
  // 1. Flatten all pages into one line list and strip boilerplate
  const raw = structuredPages
    .flatMap(p => p.lines)
    .filter(l => !l.text.trim() || !METADATA_RE.some(re => re.test(l.text.trim())));

  console.log('[scriptParser] total lines:', raw.length);
  console.log('[scriptParser] sample:', raw.slice(0, 8).map(l => `[x:${Math.round(l.x)}] "${l.text}"`));

  // Measure where dialogue typically sits in this PDF so we can use x-position
  // as a reliable stage-direction signal (anything far left of dialogue = SD).
  const dialogueX = computeDialogueX(raw);
  console.log('[scriptParser] dialogue x threshold:', dialogueX);

  // 2. Pre-process: expand same-line cues and detect lone-colon cues
  const { lines, splitNames } = preprocess(raw);

  // 3. Detect character names via dialogue-precursor method
  //    (the line immediately before a dialogue line is the character cue)
  const precursorNames = findPrecursorNames(lines);

  // 4. Pick detection method
  let knownNames;
  let detectionMethod;

  if (splitNames.size > 0) {
    // Same-line colon format — names are certain, picked up during preprocess
    knownNames      = splitNames;
    detectionMethod = 'same-line-split';
  } else if (precursorNames.size > 0) {
    knownNames      = precursorNames;
    detectionMethod = 'dialogue-precursor';
  } else {
    knownNames      = new Set();
    detectionMethod = 'none';
  }

  console.log('[scriptParser] method:', detectionMethod, '| names:', [...knownNames]);

  // 5. Validate — if we found nothing, tell the user clearly
  if (knownNames.size === 0) {
    throw new Error(
      'No character names found in this script.\n\n' +
      'Line Runner expects a standard stage play format:\n' +
      '  • Character names in ALL CAPS on their own line, OR\n' +
      '  • CHARACTER NAME: followed by dialogue on the same line\n\n' +
      'Make sure your PDF was created digitally (not scanned).'
    );
  }

  // 6. Full parse pass
  const scenes       = [];
  let currentScene   = null;
  let lastCharacter  = null;
  let expectDialogue = false;
  let prevWasBlank   = true;

  for (const line of lines) {
    const t = line.text.trim();

    if (!t) {
      expectDialogue = false;
      prevWasBlank   = true;
      continue;
    }

    // Scene heading?
    if (SCENE_RE.test(t) || (prevWasBlank && isLocationHeading(t, knownNames))) {
      currentScene = { heading: t, lines: [] };
      scenes.push(currentScene);
      lastCharacter = null; expectDialogue = false; prevWasBlank = false;
      continue;
    }

    prevWasBlank = false;

    // Ensure we have a scene bucket
    if (!currentScene) {
      currentScene = { heading: '(OPENING)', lines: [] };
      scenes.push(currentScene);
    }

    // Parenthetical
    if (PAREN_RE.test(t)) {
      currentScene.lines.push({ type: 'parenthetical', character: lastCharacter, text: t });
      continue;
    }

    // Character cue (check BEFORE dialogue so a known name always starts a new speech)
    const cleaned = normName(t);
    if (knownNames.has(cleaned)) {
      lastCharacter  = cleaned;
      expectDialogue = true;
      currentScene.lines.push({ type: 'character', character: lastCharacter, text: t });
      continue;
    }

    // Dialogue — but first check if this line is actually a stage direction
    // that appears without a blank line separator (common in test scripts).
    // A line breaks out of dialogue mode if it:
    //   (a) starts with a lowercase letter  → clearly descriptive, not speech
    //   (b) looks like "Character verb…"    → e.g. "Eleanor crosses to the window."
    if (expectDialogue && isStageDirection(t, line.x, knownNames, dialogueX)) {
      expectDialogue = false;
      lastCharacter  = null;
      currentScene.lines.push({ type: 'action', character: null, text: t });
      continue;
    }

    if (expectDialogue) {
      // Merge wrapped continuation lines into the previous dialogue entry.
      // In PDF-extracted scripts, a long speech is often split across multiple
      // visual lines with no blank between them — they should be one line.
      const prev = currentScene.lines[currentScene.lines.length - 1];
      if (prev && prev.type === 'dialogue' && prev.character === lastCharacter) {
        prev.text += ' ' + t;
      } else {
        currentScene.lines.push({ type: 'dialogue', character: lastCharacter, text: t });
      }
      continue;
    }

    // Action / stage direction
    lastCharacter = null;
    currentScene.lines.push({ type: 'action', character: null, text: t });
  }

  const characters = deduplicateNames(scenes);

  if (characters.length === 0) {
    throw new Error(
      'Characters were detected but no dialogue was found.\n\n' +
      'Please check that your PDF is a complete stage play script.'
    );
  }

  console.log('[scriptParser] scenes:', scenes.length, '| characters:', characters);
  return { characters, scenes, detectionMethod };
}

// ── Pre-processing ────────────────────────────────────────────────────────────

/**
 * Walk the raw line list and:
 *   1. Expand same-line colon cues  "ELEANOR: Hi."  →  "ELEANOR" + "Hi."
 *   2. Detect lone colon cues       "ELEANOR:"      →  "ELEANOR"  (name captured)
 *   3. Collect guaranteed character names in `splitNames`
 */
function preprocess(lines) {
  const result     = [];
  const splitNames = new Set();

  for (const line of lines) {
    const t = line.text.trim();
    if (!t) { result.push(line); continue; }

    // ── Lone colon cue: "ELEANOR:" ───────────────────────────────────────────
    const loneM = t.match(/^([A-Z][A-Z0-9\s\-']{0,30}):$/);
    if (loneM) {
      const name  = loneM[1].trim();
      const words = name.split(/\s+/);
      if (words.length <= 4 && name.length >= 2 && !NOISE.has(name) && !SCENE_RE.test(name)) {
        splitNames.add(normName(name));
        result.push({ ...line, text: name }); // strip the colon
        continue;
      }
    }

    // ── Same-line colon cue: "ELEANOR: Hi there." ────────────────────────────
    const sameM = t.match(/^([A-Z][A-Z0-9\s\-']{0,30}):\s+(\(.*?\)\s*)?(.+)$/);
    if (sameM) {
      const [, rawName, rawParen, rawDialogue] = sameM;
      const name  = rawName.trim();
      const words = name.split(/\s+/);
      if (
        words.length <= 4 && name.length >= 2 &&
        !NOISE.has(name) && !SCENE_RE.test(name) &&
        rawDialogue.trim().length >= 1
      ) {
        splitNames.add(normName(name));
        result.push({ ...line, text: name });
        if (rawParen) result.push({ ...line, text: rawParen.trim() });
        result.push({ ...line, text: rawDialogue.trim() });
        continue;
      }
    }

    result.push(line);
  }

  return { lines: result, splitNames };
}

// ── X-position dialogue threshold ────────────────────────────────────────────

/**
 * Scan the raw line list and estimate the x-position of dialogue.
 *
 * Strategy: ALL-CAPS short lines are very likely character cues. The next
 * non-blank, non-all-caps line after a cue is very likely dialogue. We
 * collect those x-values and take the median. The median represents where
 * dialogue normally sits in this PDF.
 *
 * If the minimum x found is close to the median (< 15 pts apart), x-position
 * isn't a reliable discriminator for this script (e.g. same-line colon format,
 * or a monospaced flat layout) — return null to fall back to text heuristics.
 *
 * @param {Array<{text:string, x:number, allCaps:boolean}>} lines
 * @returns {number|null} median dialogue x, or null if not reliable
 */
function computeDialogueX(lines) {
  const postCueX = [];

  for (let i = 0; i < lines.length; i++) {
    const curr = lines[i];
    if (!curr.text.trim()) continue;
    // Accept bold all-caps lines OR plain all-caps short lines as cue candidates
    const isCue = curr.allCaps && (curr.bold || curr.text.trim().split(/\s+/).length <= 3);
    if (!isCue) continue;
    if (curr.text.trim().split(/\s+/).length > 5) continue; // too long to be a cue

    // Walk forward past blank lines to find the next real line
    let j = i + 1;
    while (j < lines.length && !lines[j].text.trim()) j++;
    if (j >= lines.length) continue;

    const next = lines[j];
    // Skip if the next line is also all-caps (scene heading followed by scene heading, etc.)
    if (next.allCaps || next.x <= 0) continue;

    postCueX.push(next.x);
  }

  if (postCueX.length < 3) return null;

  const sorted = [...postCueX].sort((a, b) => a - b);
  const median  = sorted[Math.floor(sorted.length / 2)];

  // Sanity: median must be a plausible page x-coordinate
  if (median < 10) return null;

  return median;
}

// ── Dialogue-precursor detection ──────────────────────────────────────────────

/**
 * The universal rule: a character cue ALWAYS immediately precedes dialogue.
 * Find lines that look like dialogue, look at what came just before, and
 * count how often each candidate appears as a precursor.
 *
 * Names that appear as a precursor ≥ 2 times are confirmed characters.
 */
function findPrecursorNames(lines) {
  const count = new Map();

  for (let i = 1; i < lines.length; i++) {
    if (!isDialogue(lines[i].text)) continue;

    // Walk back past any blank lines
    let j = i - 1;
    while (j >= 0 && !lines[j].text.trim()) j--;
    if (j < 0) continue;

    const prevLine = lines[j];
    const prev = prevLine.text.trim();
    if (!isNameCandidate(prev, prevLine.bold)) continue;

    const name = normName(prev);
    if (!name) continue; // parentheticals like "(whispering)" normalise to ""
    count.set(name, (count.get(name) ?? 0) + 1);
  }

  return new Set(
    [...count.entries()]
      .filter(([, n]) => n >= 2)
      .map(([name]) => name)
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Decide whether a line that follows a character cue is actually a stage
 * direction masquerading as dialogue (common when there is no blank-line gap).
 *
 * Returns true when any of these hold:
 *   (a) Starts with a lowercase letter → descriptive prose, never speech
 *   (b) Normalises to a NOISE word  (PAUSE, BEAT, SILENCE, MUSIC, etc.)
 *   (c) Starts with a word that only ever opens a stage direction
 *       (Lights, Sound, Music, Pause, Silence, Beat, Blackout …)
 *   (d) Starts with a known character name followed by ANY stage-direction verb
 *       → "Eleanor crosses the room." / "MARK exits." / "She sits down."
 */
function isStageDirection(text, lineX, knownNames, dialogueX) {
  const t = text.trim();
  if (!t) return false;

  // (a) x-position: if we know where dialogue sits in this PDF, anything
  //     significantly to the left of that is a stage direction — regardless
  //     of its content. This is the most reliable signal across all formats.
  if (dialogueX !== null && lineX < dialogueX - 20) return true;

  // (b) Lowercase start → always descriptive, never speech
  if (/^[a-z]/.test(t)) return true;

  // (c) Whole line is a NOISE token (e.g. "Pause." → normName → "PAUSE")
  if (NOISE.has(normName(t))) return true;

  // (c) Starts with a word that NEVER begins a line of dialogue
  const SD_OPENER = /^(lights?\b|sound\b|music\b|pause\b|silence\b|beat\b|blackout\b|darkness\b|curtain\b|spotlight\b|thunder\b|thunder\b)/i;
  if (SD_OPENER.test(t)) return true;

  // (d) Known character name + ANY recognised stage-direction verb
  //     Verb list is intentionally broad — covers enter/exit, movement,
  //     physical actions, and common blocking verbs.
  const SD_VERB = /^(enters?|exits?|crosses?|moves?|walks?|runs?|goes?\b|comes?\b|sits?\s*(down)?\b|stands?\s*(up)?\b|rises?|turns?|steps?\s*(forward|back|aside|to|toward)?\b|approaches?|retreats?|backs?\s*(away|up)?\b|kneels?|crouches?|bows?|embraces?|hugs?|kisses?|slaps?|grabs?|pushes?|pulls?|throws?|drops?|catches?|reaches?|points?|gestures?|motions?|looks?\b|glances?|stares?|gazes?|picks?\b|puts?\b|leans?\s*(back|forward|in|over)?\b|rushes?|hurries?|stumbles?|falls?\s*(down)?\b|collapses?|freezes?|pauses?\b|hesitates?|sighs?|laughs?|cries?|weeps?|smiles?|frowns?|nods?|shakes?\s+head\b|shrugs?|pours?\b|gets?\b|gives?\b|takes?\b|hands?\b|drinks?\b|watches?\b|opens?\b|closes?\b|sets?\b|places?\b|holds?\b|lifts?\b|checks?\b|reads?\b|writes?\b|refills?\b)\b/i;

  for (const name of knownNames) {
    const lcT    = t.toLowerCase();
    const lcName = name.toLowerCase();
    let afterName = null;

    if (lcT.startsWith(lcName + ' ') || lcT.startsWith(lcName + "'")) {
      afterName = t.slice(name.length).trim();
    } else {
      // Also try title-case variant: "ELEANOR" → "Eleanor"
      const titleName = name
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      if (t.startsWith(titleName + ' ') || t.startsWith(titleName + "'")) {
        afterName = t.slice(titleName.length).trim();
      }
    }

    if (afterName !== null && SD_VERB.test(afterName)) return true;
  }

  // (e) Third-person pronoun + stage-direction verb.
  // "She turns away." / "He exits." / "They look at each other." are stage
  // directions even when the pronoun is not a named character in knownNames.
  const PRONOUN_RE = /^(he|she|they|it)\s+/i;
  if (PRONOUN_RE.test(t)) {
    const afterPronoun = t.replace(PRONOUN_RE, '');
    if (SD_VERB.test(afterPronoun)) return true;
  }

  // (f) Single blocking verb used as a bare direction: "Pauses." "Sighs." etc.
  // These look like dialogue because they start with an uppercase letter and
  // are too short to trigger other heuristics.
  if (/^(pauses?|sighs?|laughs?|cries?|weeps?|hesitates?|freezes?|nods?|shrugs?|smiles?|frowns?|groans?|gasps?|scoffs?|chuckles?)[.!]?\s*$/i.test(t)) {
    return true;
  }

  return false;
}

/** Normalise a raw name string to a clean uppercase key */
function normName(text) {
  return text
    .replace(/\s*\(.*?\)\s*$/, '')  // strip (V.O.) / (CONT'D) suffixes
    .replace(/:+$/, '')              // strip trailing colon
    .replace(/[^A-Za-z0-9\s\-']/g, '') // strip OCR noise / punctuation
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** A line looks like dialogue if it is mixed-case (at least one word). */
function isDialogue(text) {
  const t = text.trim();
  if (!t) return false;
  if (SCENE_RE.test(t) || PAREN_RE.test(t)) return false;
  const letters = t.replace(/[^a-zA-Z]/g, '');
  // Must have letters and not be all-caps (stage headings, names, etc.)
  return letters.length > 0 && letters !== letters.toUpperCase();
}

/**
 * A line could be a character name: short, mostly letters, no terminal punctuation.
 * Passing `bold=true` relaxes the check — bold all-caps lines in standard play
 * format are almost always character cues.
 */
function isNameCandidate(text, bold = false) {
  const t = text.trim().replace(/:+$/, '');
  if (PAREN_RE.test(t)) return false; // "(whispering)" etc. are never character names
  if (t.length < 2 || t.length > 50) return false;
  if (t.split(/\s+/).length > 5) return false;
  if (/[!?]/.test(t)) return false;
  if (/[.?,;]$/.test(t)) return false;
  if (/^\d+$/.test(t)) return false;
  if (!/[a-zA-Z]/.test(t)) return false;
  if (NOISE.has(t.toUpperCase())) return false;
  // Bold all-caps: definitely a character cue in standard play format
  if (bold) return true;
  return true;
}

/**
 * Detect ALL-CAPS location headings used as scene markers in stage plays.
 * e.g. "THE LIVING ROOM. MORNING." — only triggered when preceded by a blank line.
 */
function isLocationHeading(text, knownNames) {
  const t = text.trim();
  if (!t) return false;
  const letters = t.replace(/[^a-zA-Z]/g, '');
  if (!letters || letters !== letters.toUpperCase()) return false;
  if (t.split(/\s+/).length > 10) return false;
  if (knownNames.has(normName(t))) return false;
  if (NOISE.has(t.toUpperCase())) return false;
  if (/^(FADE|CUT|DISSOLVE|BLACKOUT|LIGHTS|CURTAIN|SOUND|MUSIC)/.test(t)) return false;

  const PLACE = /\b(ROOM|HOUSE|STREET|PARK|OFFICE|HOSPITAL|KITCHEN|BEDROOM|BATHROOM|OUTSIDE|INSIDE|GARDEN|HALL|CHURCH|CAR|SCHOOL|BAR|RESTAURANT|APARTMENT|STUDIO|THEATER|THEATRE|YARD|PORCH|FIELD|WOODS|CITY|TOWN|HOTEL|HOME|STAGE|LOBBY|ALLEY|BRIDGE|BEACH)\b/;
  const TIME  = /\b(NIGHT|DAY|MORNING|EVENING|AFTERNOON|DAWN|DUSK|LATER|CONTINUOUS|MOMENTS LATER|YEARS LATER)\b/;
  return PLACE.test(t) || TIME.test(t);
}

// ── Deduplicate character names ───────────────────────────────────────────────

/**
 * Collect all names that actually appeared as character cues in the parse,
 * then merge near-duplicate spellings (OCR variants) using edit distance.
 */
function deduplicateNames(scenes) {
  const freq = new Map();
  for (const scene of scenes)
    for (const line of scene.lines)
      if (line.type === 'character' && line.character?.length >= 2)
        freq.set(line.character, (freq.get(line.character) ?? 0) + 1);

  // Sort by frequency so the most-common spelling wins
  const byFreq = [...freq.keys()].sort((a, b) => freq.get(b) - freq.get(a));

  const kept = [];
  for (const name of byFreq) {
    const isDupe = kept.some(k => {
      if (Math.abs(k.length - name.length) > 2) return false;
      return levenshtein(k, name) <= Math.max(1, Math.floor(name.length / 6));
    });
    if (!isDupe) kept.push(name);
  }

  return kept.sort();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}
