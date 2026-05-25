/**
 * pdfParser.js
 *
 * Extracts structured text from a standard stage play PDF.
 *
 * SUPPORTED FORMAT:
 *   Text-based PDFs produced by word processors or script software
 *   (Final Draft, Highland, Word, Google Docs, etc.).
 *   Character names must be ALL CAPS on their own line (or followed by a colon).
 *   Scanned / image-only PDFs are NOT supported — they have no text layer.
 *
 * Exports:
 *   extractStructuredLines(file) → StructuredPage[]
 *
 * StructuredPage = { pageNum: number, lines: StructuredLine[] }
 * StructuredLine = { text: string, x: number, allCaps: boolean }
 */

import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// A page must have at least this many text items AND characters to count as
// a real text page (not a cover image or blank divider page).
const MIN_ITEMS = 3;
const MIN_CHARS = 10;

// Group Y coordinates into buckets this many points wide to merge
// words that sit on the same baseline despite slight jitter.
const Y_BUCKET = 3;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract structured lines from a standard stage play PDF.
 * Throws a user-friendly error if the file has no readable text.
 *
 * @param {File} file
 * @returns {Promise<StructuredPage[]>}
 */
export async function extractStructuredLines(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const result   = [];
  let totalItems = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const raw  = await getRawItems(page);
    totalItems += raw.length;

    if (i <= 2) {
      const preview = raw.map(r => r.str).join(' ').slice(0, 200);
      console.log(`[pdfParser] page ${i}: ${raw.length} items | ${preview}`);
    }

    // Skip pages that are blank or image-only (cover art, scene photos, etc.)
    const pageText = raw.map(r => r.str).join('').trim();
    if (raw.length < MIN_ITEMS || pageText.length < MIN_CHARS) {
      console.log(`[pdfParser] page ${i}: skipped (image/blank — ${raw.length} items)`);
      continue;
    }

    result.push({ pageNum: i, lines: buildStructuredLines(raw) });
  }

  // If we found almost no text across the whole PDF it's a scanned/image file
  if (totalItems < 20) {
    throw new Error(
      'This PDF has no readable text layer.\n\n' +
      'Line Runner only supports text-based stage play PDFs — ' +
      'files created in Final Draft, Highland, Word, Google Docs, etc.\n\n' +
      'Scanned or image-only PDFs (photographed scripts, photocopied plays) ' +
      'are not supported. Please use a digital script file.'
    );
  }

  return result;
}

/**
 * Backward-compatible plain-text extraction.
 * @param {File} file
 * @returns {Promise<string[]>}
 */
export async function extractPagesFromFile(file) {
  const structured = await extractStructuredLines(file);
  return structured.map(p => p.lines.map(l => l.text).join('\n'));
}

// ── Internals ─────────────────────────────────────────────────────────────────

async function getRawItems(page) {
  const content = await page.getTextContent();
  return content.items
    .filter(item => 'str' in item && item.str.trim() !== '')
    .map(item => ({
      str:  item.str,
      x:    item.transform[4],
      y:    item.transform[5],
      bold: /bold/i.test(item.fontName ?? ''),
    }));
}

/**
 * Group raw PDF text items into visual lines.
 *
 * PDF.js returns individual words (or even character runs) as separate items.
 * We bucket them by Y coordinate so items on the same baseline become one line,
 * then sort left-to-right within each line.
 *
 * Also inserts synthetic blank lines when the vertical gap between two lines
 * is more than 1.8× the median line spacing — this restores paragraph breaks
 * that PDF.js silently drops.
 */
function buildStructuredLines(items) {
  // Bucket by Y (rounded to nearest Y_BUCKET points)
  const buckets = new Map();
  for (const { x, y, str, bold } of items) {
    const key = Math.round(y / Y_BUCKET) * Y_BUCKET;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ x, str, bold });
  }

  // Sort top-to-bottom (PDF Y=0 is at bottom, so higher Y = higher on page)
  const rows = [...buckets.entries()].sort(([ya], [yb]) => yb - ya);

  // Compute median line spacing for blank-line inference
  const yVals     = rows.map(([y]) => y);
  const gaps      = yVals.slice(0, -1).map((y, i) => y - yVals[i + 1]);
  const medianGap = gaps.length
    ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
    : 14;

  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    // Insert a synthetic blank line when the gap is suspiciously large
    if (i > 0 && yVals[i - 1] - yVals[i] > medianGap * 1.8) {
      lines.push({ text: '', x: 0, allCaps: false });
    }

    const [, words] = rows[i];
    words.sort((a, b) => a.x - b.x);
    const text = words.map(w => w.str).join(' ').trim();
    if (text) {
      const letters = text.replace(/[^a-zA-Z]/g, '');
      const allCaps = letters.length > 0 && letters === letters.toUpperCase();
      const bold    = words.some(w => w.bold);
      lines.push({ text, x: words[0].x, allCaps, bold });
    }
  }

  return lines;
}
