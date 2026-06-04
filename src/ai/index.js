/**
 * ai/index.js — HuggingFace PublicAI chat completions
 *
 * Routes through PublicAI (free tier, supports Apertus):
 *   https://router.huggingface.co/publicai/v1/chat/completions
 *
 * Requires VITE_HF_API_KEY in .env.local
 */

const ENDPOINT = 'https://router.huggingface.co/publicai/v1/chat/completions';
const MODEL    = 'apertus-project/apertus'; // PublicAI-hosted Apertus

/**
 * Send a chat prompt and return the assistant's reply as a string.
 *
 * @param {string|Array<{role:string,content:string}>} prompt
 *   Either a plain string (treated as a user message) or a full messages array.
 * @param {{ model?: string, temperature?: number, max_tokens?: number }} [opts]
 * @returns {Promise<string>}
 */
export async function getAIResponse(prompt, opts = {}) {
  const apiKey = import.meta.env.VITE_HF_API_KEY;
  if (!apiKey || apiKey === 'your_huggingface_api_key') {
    throw new Error('[ai] No HF API key — set VITE_HF_API_KEY in .env.local');
  }

  const messages = typeof prompt === 'string'
    ? [{ role: 'user', content: prompt }]
    : prompt;

  const body = {
    model:       opts.model       ?? MODEL,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens:  opts.max_tokens  ?? 512,
  };

  const res = await fetch(ENDPOINT, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[ai] PublicAI request failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('[ai] Unexpected response shape from PublicAI');
  return content.trim();
}
