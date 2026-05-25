/**
 * speaker.js — Web Speech API text-to-speech wrapper
 */

let currentUtterance = null;
let selectedVoice    = null;
let _rate            = 0.88;   // default; overridden by the speed slider

/** Set the playback rate for all subsequent speak() calls (0.5 – 1.5). */
export function setRate(rate) { _rate = Math.max(0.5, Math.min(1.5, rate)); }

/** Load voices and pick the most natural-sounding en-US voice available. */
function pickVoice() {
  if (selectedVoice) return selectedVoice;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;

  // Tier 1 — neural / online voices (sound human, streamed from OS)
  // Look for any en-US voice whose name contains "Natural" or "Online"
  const neural = voices.find(
    (v) => v.lang?.startsWith('en') && /natural|online/i.test(v.name)
  );
  if (neural) { selectedVoice = neural; return neural; }

  // Tier 2 — known high-quality voices by name (roughly best → decent)
  const preferred = [
    'Google US English',
    'Google UK English Female',
    'Google UK English Male',
    'Microsoft Aria Online (Natural)',  // Windows neural
    'Microsoft Guy Online (Natural)',
    'Microsoft Zira Desktop',           // OK Windows fallback
    'Samantha',                         // macOS
    'Alex',                             // macOS
    'Karen',                            // macOS Australian
    'Daniel',                           // macOS British
  ];
  for (const name of preferred) {
    const v = voices.find((v) => v.name === name);
    if (v) { selectedVoice = v; return v; }
  }

  // Tier 3 — avoid robot-sounding "eSpeak" / "espeak" voices
  const enUS = voices.find(
    (v) => v.lang === 'en-US' && !/espeak/i.test(v.name)
  );
  if (enUS) { selectedVoice = enUS; return enUS; }

  // Last resort
  selectedVoice = voices[0];
  return selectedVoice;
}

/** Ensure voices are loaded (they load async in some browsers). */
function waitForVoices() {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) { resolve(voices); return; }
    speechSynthesis.addEventListener('voiceschanged', () => resolve(speechSynthesis.getVoices()), { once: true });
  });
}

/**
 * Speak `text` aloud.
 * @param {string} text
 * @param {{ rate?: number, pitch?: number, voice?: SpeechSynthesisVoice|null }} options
 * @returns {Promise<void>} Resolves when speaking ends, rejects on error.
 */
export async function speak(text, options = {}) {
  stopSpeaking();

  await waitForVoices();

  const { rate = _rate, pitch = 1.0, voice = null } = options;

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.voice = voice ?? pickVoice();
    utterance.lang = 'en-US';

    utterance.onend = () => {
      currentUtterance = null;
      resolve();
    };
    utterance.onerror = (e) => {
      currentUtterance = null;
      // 'interrupted' happens when stopSpeaking() is called — treat as resolved
      if (e.error === 'interrupted' || e.error === 'canceled') {
        resolve();
      } else {
        reject(new Error(`Speech error: ${e.error}`));
      }
    };

    currentUtterance = utterance;
    speechSynthesis.speak(utterance);
  });
}

/**
 * Returns all English voices sorted: neural/online first, then Google,
 * then other en-US, then other en-*, excluding eSpeak robots.
 * @returns {Promise<SpeechSynthesisVoice[]>}
 */
export async function getAvailableVoices() {
  await waitForVoices();
  return speechSynthesis.getVoices()
    .filter((v) => v.lang?.startsWith('en') && !/espeak/i.test(v.name))
    .sort((a, b) => {
      const score = (v) => {
        if (/natural|online|neural/i.test(v.name)) return 0;
        if (/google/i.test(v.name))                return 1;
        if (v.lang === 'en-US')                    return 2;
        return 3;
      };
      return score(a) - score(b);
    });
}

/**
 * Override the voice used for all subsequent speak() calls.
 * Pass null to revert to auto-selection.
 * @param {SpeechSynthesisVoice|null} voice
 */
export function setVoice(voice) {
  selectedVoice = voice;
}

/** Immediately stop any current speech. */
export function stopSpeaking() {
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
  }
  currentUtterance = null;
}

/** Returns true if speech synthesis is currently active. */
export function isSpeaking() {
  return speechSynthesis.speaking;
}
