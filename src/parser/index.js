import { extractStructuredLines, extractPagesFromFile } from './pdfParser.js';
import { parseScript } from './scriptParser.js';

export { extractPagesFromFile, extractStructuredLines } from './pdfParser.js';
export { parseScript } from './scriptParser.js';

/**
 * All-in-one pipeline for a standard stage play PDF:
 *   1. Extract structured lines (text + X/Y positions) from PDF
 *   2. Parse into scenes / characters
 *
 * Throws a user-friendly error if the PDF is not a supported format.
 *
 * @param {File} file
 * @param {(msg: string) => void} [onStatus]
 * @returns {Promise<{ characters: string[], scenes: object[], detectionMethod: string }>}
 */
export async function parseScriptFile(file, onStatus) {
  onStatus?.(`📄 Reading "${file.name}"…`);
  const structuredPages = await extractStructuredLines(file);

  const totalLines = structuredPages.reduce((n, p) => n + p.lines.length, 0);
  onStatus?.(`📝 ${totalLines} lines across ${structuredPages.length} pages — parsing…`);

  const script = parseScript(structuredPages);
  return script;
}
