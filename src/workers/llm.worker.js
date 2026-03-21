// workers/llm.worker.js
import { CreateMLCEngine } from '@mlc-ai/web-llm';
import { INFERENCE_MAX_TOKENS } from '../utils/constants';

let engine = null;
let loadError = null;

// ─── Engine Bootstrap ────────────────────────────────────────────────────────
async function loadEngine(modelId) {
  try {
    engine = await CreateMLCEngine(modelId, {
      initProgressCallback: ({ progress = 0, text = '' } = {}) => {
        self.postMessage({
          type: 'progress',
          payload: { progress, text },
        });
      },
    });
    self.postMessage({ type: 'loaded' });
  } catch (err) {
    loadError = err.message;
    self.postMessage({ type: 'error', payload: { message: err.message } });
  }
}

// ─── Robust JSON Extraction ──────────────────────────────────────────────────
// Tries several strategies so that minor model formatting quirks don't fail
// the whole analysis.
function extractJSON(raw) {
  // 1. Direct parse
  try { return JSON.parse(raw.trim()); } catch (_) {}

  // 2. Fenced markdown block  ```json ... ``` or ``` ... ```
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch (_) {}
  }

  // 3. First [...] array in the string
  const arrMatch = raw.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch (_) {}
  }

  // 4. First {...} object – wrap in array
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const obj = JSON.parse(objMatch[0]);
      return Array.isArray(obj) ? obj : [obj];
    } catch (_) {}
  }

  return null; // give up
}

// ─── Analysis ────────────────────────────────────────────────────────────────
async function analyzeChunk(requestId, text, systemPrompt, userPrompt) {
  if (!engine) {
    self.postMessage({
      type: 'analyzeError',
      payload: { requestId, message: loadError || 'Model not loaded yet.' },
    });
    return;
  }

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: userPrompt || (
          `Analyse the following contract text and return ONLY the JSON array:\n\n` +
          `CONTRACT TEXT:\n${text}`
        ),
      },
    ];

    const reply = await engine.chat.completions.create({
      messages,
      temperature: 0.1,   // low temp = deterministic JSON
      max_tokens: INFERENCE_MAX_TOKENS,
    });

    const content = reply.choices[0]?.message?.content ?? '';
    const parsed = extractJSON(content);

    if (parsed === null) {
      // Return empty array rather than crashing – better UX
      self.postMessage({
        type: 'analyzeResult',
        payload: { requestId, result: [], parseError: true, rawResponse: content },
      });
      return;
    }

    self.postMessage({
      type: 'analyzeResult',
      payload: { requestId, result: Array.isArray(parsed) ? parsed : [parsed] },
    });
  } catch (err) {
    self.postMessage({
      type: 'analyzeError',
      payload: { requestId, message: err.message },
    });
  }
}

// ─── Message Router ──────────────────────────────────────────────────────────
self.addEventListener('message', ({ data }) => {
  const { type, payload } = data;
  switch (type) {
    case 'load':    loadEngine(payload.modelId); break;
    case 'analyze': analyzeChunk(payload.requestId, payload.text, payload.systemPrompt, payload.userPrompt); break;
  }
});