// Universal Clause Analysis Worker - WebLLM Integration
// Analyzes contract clauses using local LLM (privacy-first approach)

import { CreateMLCEngine } from '@mlc-ai/web-llm';
import { INFERENCE_MAX_TOKENS } from '../utils/constants';

let engine = null;
let loadError = null;

// ENGINE INITIALIZATION

/**
 * Initialize WebLLM engine with progress tracking
 * @param {string} modelId - MLC model identifier (e.g., 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC')
 */
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

// JSON EXTRACTION & PARSING

/**
 * Robust JSON extraction from LLM output
 * Handles various formatting issues from small language models:
 * - Markdown code fences (```json ... ```)
 * - Preamble/trailing text
 * - Single objects vs arrays
 * - Whitespace/formatting issues
 *
 * @param {string} raw - Raw LLM output text
 * @returns {Array|Object|null} Parsed JSON or null if extraction fails
 */
function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') return null;

  // 1. Direct parse - cleanest case
  try {
    return JSON.parse(raw.trim());
  } catch (_) {}

  // 2. Markdown code fence: ```json ... ``` or ``` ... ```
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch (_) {}
  }

  // 3. Find first complete JSON array [...]
  const arrMatch = raw.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]);
    } catch (_) {}
  }

  // 4. Find first complete JSON object {...} and wrap in array
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const obj = JSON.parse(objMatch[0]);
      return Array.isArray(obj) ? obj : [obj];
    } catch (_) {}
  }

  // 5. All strategies failed
  return null;
}

// CLAUSE ANALYSIS

/**
 * Analyze contract clauses using WebLLM
 * Universal analysis - no predefined categories, detects ALL clause types
 *
 * Expected output schema per clause:
 * {
 *   clause_text: string,
 *   clause_type: string,
 *   risk_level: "High" | "Medium" | "Low",
 *   explanation: string,
 *   concerns: string[]
 * }
 *
 * @param {string} requestId - Unique ID for request tracking
 * @param {string} text - Contract text or formatted clause batch
 * @param {string} systemPrompt - System prompt defining analysis behavior
 * @param {string} userPrompt - Optional user prompt (uses default if not provided)
 */
async function analyzeChunk(requestId, text, systemPrompt, userPrompt) {
  if (!engine) {
    self.postMessage({
      type: 'analyzeError',
      payload: {
        requestId,
        message: loadError || 'Model not loaded yet. Please wait for initialization.',
      },
    });
    return;
  }

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: userPrompt || (
          `Analyze the following contract text and return ONLY the JSON array of clause analyses:\n\n` +
          `CONTRACT TEXT:\n${text}`
        ),
      },
    ];

    const reply = await engine.chat.completions.create({
      messages,
      temperature: 0.1, // Low temperature for consistent, deterministic JSON output
      max_tokens: INFERENCE_MAX_TOKENS,
    });

    const content = reply.choices[0]?.message?.content ?? '';
    const parsed = extractJSON(content);

    if (parsed === null) {
      // JSON extraction failed - return empty array with error flag
      // This allows graceful degradation to pattern-based fallback
      self.postMessage({
        type: 'analyzeResult',
        payload: {
          requestId,
          result: [],
          parseError: true,
          rawResponse: content.substring(0, 500), // First 500 chars for debugging
        },
      });
      return;
    }

    // Ensure result is always an array
    const resultArray = Array.isArray(parsed) ? parsed : [parsed];

    self.postMessage({
      type: 'analyzeResult',
      payload: { requestId, result: resultArray },
    });
  } catch (err) {
    self.postMessage({
      type: 'analyzeError',
      payload: { requestId, message: err.message },
    });
  }
}

// MESSAGE ROUTER

/**
 * Worker message handler
 * Supported message types:
 * - 'load': Initialize WebLLM engine with specified model
 * - 'analyze': Analyze contract text and return clause risk assessments
 */
self.addEventListener('message', ({ data }) => {
  const { type, payload } = data;
  switch (type) {
    case 'load':
      loadEngine(payload.modelId);
      break;
    case 'analyze':
      analyzeChunk(
        payload.requestId,
        payload.text,
        payload.systemPrompt,
        payload.userPrompt
      );
      break;
    default:
      console.warn(`Unknown message type: ${type}`);
  }
});