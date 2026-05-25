/**
 * listener.js — Speech-to-text wrapper
 *
 * Supports two modes automatically:
 *
 *  1. NATIVE (Chrome / Edge)
 *     Uses the Web Speech API (SpeechRecognition). Auto-detects silence,
 *     so startListening() resolves on its own.
 *
 *  2. FALLBACK (Firefox and other browsers)
 *     Uses MediaRecorder + in-browser Whisper (transformers.js).
 *     Manual mode:    recording runs until stopListening() is called.
 *     Hands-free mode: VAD (voice-activity detection) stops recording
 *                      automatically after sustained silence.
 */

// @huggingface/transformers is imported dynamically inside loadTranscriber() so
// WASM initialisation never runs at module-load time — keeps the page responsive.

// ── Detect native STT support ─────────────────────────────────────────────────

const SpeechRecognition =
  (typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;

// ── Module-level state ────────────────────────────────────────────────────────

let activeRecognition = null;   // Web Speech API session
let activeRecorder    = null;   // MediaRecorder session
let recorderResolve   = null;   // resolve() for the active fallback promise
let recorderStream    = null;   // MediaStream to release on stop

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * True when the Web Speech API is available (Chrome / Edge).
 * false → MediaRecorder + Whisper fallback will be used instead.
 */
export function isNativeSTT() {
  return SpeechRecognition !== null;
}

/**
 * True when *any* speech input method is available.
 */
export function isSupported() {
  return SpeechRecognition !== null || typeof MediaRecorder !== 'undefined';
}

/**
 * Manual listening — caller must call stopListening() to end (fallback mode).
 * Native mode auto-detects silence.
 * @returns {Promise<string>}
 */
export function startListening() {
  stopListening();
  if (isNativeSTT())                       return _startNative();
  if (typeof MediaRecorder !== 'undefined') return _startFallback();
  return Promise.reject(new Error(
    'Speech recognition is not supported in this browser. ' +
    'Please use Chrome, Edge, or Firefox.'
  ));
}

/**
 * Hands-free listening — auto-stops on silence (both native and fallback).
 * Native mode: already silence-detecting.
 * Fallback:    VAD via AudioContext AnalyserNode.
 * @returns {Promise<string>}
 */
export function startListeningHandsFree() {
  stopListening();
  if (isNativeSTT())                       return _startNative();
  if (typeof MediaRecorder !== 'undefined') return _startFallbackVAD();
  return Promise.reject(new Error(
    'Speech recognition is not supported in this browser. ' +
    'Please use Chrome, Edge, or Firefox.'
  ));
}

/**
 * Stop the current listening session.
 * Native  → cancels the SpeechRecognition session.
 * Fallback → stops the MediaRecorder; onstop handler transcribes and resolves.
 */
export function stopListening() {
  if (activeRecognition) {
    try { activeRecognition.stop(); } catch (_) {}
    activeRecognition = null;
  }
  if (activeRecorder && activeRecorder.state !== 'inactive') {
    try { activeRecorder.stop(); } catch (_) {}
  }
}

// ── Native implementation (Chrome / Edge) ────────────────────────────────────

function _startNative() {
  return new Promise((resolve, reject) => {
    const recognition = new SpeechRecognition();
    activeRecognition = recognition;
    let settled = false;

    const settle = (val, isReject = false) => {
      if (settled) return;
      settled = true;
      activeRecognition = null;
      isReject ? reject(val) : resolve(val);
    };

    recognition.continuous      = false;
    recognition.interimResults  = false;
    recognition.lang            = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => settle(e.results[0]?.[0]?.transcript?.trim() ?? '');

    recognition.onerror = (e) => {
      switch (e.error) {
        case 'not-allowed':
        case 'permission-denied':
          settle(new Error('Microphone access was denied.'), true); break;
        case 'no-speech':
        case 'aborted':
          settle(''); break;
        case 'network':
          settle(new Error('Network error during speech recognition.'), true); break;
        default:
          settle(new Error(`Speech recognition error: ${e.error}`), true);
      }
    };

    recognition.onend = () => settle('');

    try {
      recognition.start();
    } catch (err) {
      activeRecognition = null;
      reject(new Error(`Could not start speech recognition: ${err.message}`));
    }
  });
}

// ── In-browser Whisper via transformers.js ────────────────────────────────────
// Model: Xenova/whisper-tiny.en (~40 MB, cached after first download).

let _transcriber     = null;
let _transcriberLoad = null;

function loadTranscriber() {
  if (_transcriber)     return Promise.resolve(_transcriber);
  if (_transcriberLoad) return _transcriberLoad;

  console.log('[listener] Loading in-browser Whisper model (first time only)…');
  _transcriberLoad = import(/* @vite-ignore */ '@huggingface/transformers').then(({ pipeline }) =>
    pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', { quantized: true })
  ).then((t) => {
    _transcriber     = t;
    _transcriberLoad = null;
    console.log('[listener] Whisper model ready');
    return t;
  }).catch((err) => {
    _transcriberLoad = null;
    console.warn('[listener] Failed to load Whisper model:', err.message);
    throw err;
  });

  return _transcriberLoad;
}

async function transcribeBlob(blob) {
  let t;
  try { t = await loadTranscriber(); } catch { return ''; }

  const url = URL.createObjectURL(blob);
  try {
    const result = await t(url); // No language/task — English-only model
    const text = (result?.text ?? '').trim();
    console.log('[listener] Whisper transcript:', JSON.stringify(text));
    return text;
  } catch (err) {
    console.warn('[listener] Whisper inference failed:', err.message);
    return '';
  } finally {
    URL.revokeObjectURL(url);
  }
}

// No eager pre-warm — Whisper loads the first time startListening() is called.
// This keeps the page fully responsive until the actor actually taps the mic.

// ── Fallback: manual MediaRecorder ───────────────────────────────────────────

function _startFallback() {
  return new Promise(async (resolve) => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl:  true,
          channelCount:     1,     // mono is better for speech recognition
        },
      });
    } catch {
      resolve('');
      return;
    }

    recorderStream  = stream;
    recorderResolve = resolve;

    const chunks   = [];
    const recorder = new MediaRecorder(stream);
    activeRecorder = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      activeRecorder  = null;
      recorderStream  = null;
      const res       = recorderResolve;
      recorderResolve = null;
      if (!res) return;
      if (chunks.length === 0) { res(''); return; }
      res(await transcribeBlob(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })));
    };

    recorder.start();
  });
}

// ── Fallback: hands-free MediaRecorder with VAD ──────────────────────────────
// Uses AudioContext AnalyserNode to detect speech, then auto-stops after
// sustained silence so the actor never needs to press a button.

function _startFallbackVAD() {
  return new Promise(async (resolve) => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl:  true,
          channelCount:     1,     // mono is better for speech recognition
        },
      });
    } catch {
      resolve('');
      return;
    }

    recorderStream  = stream;
    recorderResolve = resolve;

    const chunks   = [];
    const recorder = new MediaRecorder(stream);
    activeRecorder = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      activeRecorder  = null;
      recorderStream  = null;
      const res       = recorderResolve;
      recorderResolve = null;
      if (!res) return;
      if (chunks.length === 0) { res(''); return; }
      res(await transcribeBlob(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })));
    };

    recorder.start();

    // ── Voice-activity detection ──────────────────────────────────────────────
    try {
      const audioCtx = new AudioContext();
      const source   = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const buf = new Uint8Array(analyser.frequencyBinCount);

      const SPEECH_RMS   = 15;    // RMS above this = speech detected
      const SILENCE_RMS  = 8;     // RMS below this = silence
      const MIN_SPEECH   = 500;   // ms of speech before we start counting silence
      const SILENCE_STOP = 1500;  // ms of silence after speech → auto-stop
      const MAX_RECORD   = 12000; // hard cap regardless

      let speechStart  = null;
      let silenceStart = null;
      const startedAt  = Date.now();

      const vadId = setInterval(() => {
        if (!activeRecorder || activeRecorder.state === 'inactive') {
          clearInterval(vadId);
          audioCtx.close().catch(() => {});
          return;
        }

        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) { const d = v - 128; sum += d * d; }
        const rms = Math.sqrt(sum / buf.length);
        const now = Date.now();

        // Hard cap
        if (now - startedAt > MAX_RECORD) {
          clearInterval(vadId);
          audioCtx.close().catch(() => {});
          if (activeRecorder?.state !== 'inactive') try { activeRecorder.stop(); } catch {}
          return;
        }

        if (rms > SPEECH_RMS) {
          if (!speechStart) speechStart = now;
          silenceStart = null;
        } else if (rms < SILENCE_RMS && speechStart && (now - speechStart) > MIN_SPEECH) {
          if (!silenceStart) silenceStart = now;
          if (now - silenceStart > SILENCE_STOP) {
            clearInterval(vadId);
            audioCtx.close().catch(() => {});
            if (activeRecorder?.state !== 'inactive') try { activeRecorder.stop(); } catch {}
          }
        }
      }, 100);

    } catch (err) {
      // VAD unavailable — fall back to a hard 10-second cap
      console.warn('[listener] VAD setup failed, using time cap:', err.message);
      setTimeout(() => {
        if (activeRecorder?.state !== 'inactive') try { activeRecorder.stop(); } catch {}
      }, 10000);
    }
  });
}
