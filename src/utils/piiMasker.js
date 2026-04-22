/**
 * piiMasker.js
 *
 * Utility module for masking Personally Identifiable Information (PII) in
 * contract text before it is sent to the local LLM, and for restoring named
 * entity placeholders in the LLM results for display.
 *
 * Rules:
 *  - Pure ES Module syntax — no CommonJS.
 *  - Zero external dependencies — vanilla JS regex only.
 *  - Defensive: never throws on null/undefined input.
 *  - All regex patterns are defined as named constants for readability.
 */

// ---------------------------------------------------------------------------
// Named regex constants
// ---------------------------------------------------------------------------

/** Standard RFC-5322-ish email address. */
const REGEX_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

/**
 * Indian phone numbers:
 *  - +91 xxxxxxxxxx  (with optional space/dash after country code)
 *  - 0xxxxxxxxxx     (STD prefix)
 *  - xxxxxxxxxx      (bare 10-digit starting with 6-9)
 *  - (xxx) xxx-xxxx  (US-style brackets - still scrub for safety)
 */
const REGEX_PHONE =
  /(?:\+91[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)?\d{5,}[\s-]?\d{4,5}(?!\d)/gi;

/**
 * Indian PAN card: 5 uppercase letters, 4 digits, 1 uppercase letter.
 * Word-boundary anchored so it doesn't match inside a longer string.
 */
const REGEX_PAN = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;

/**
 * Aadhaar: 12 consecutive digits, optionally grouped as XXXX XXXX XXXX.
 */
const REGEX_AADHAAR = /\b\d{4}[\s]?\d{4}[\s]?\d{4}\b/g;

/**
 * Indian passport: 1 letter followed by exactly 7 digits.
 */
const REGEX_PASSPORT = /\b[A-Z][0-9]{7}\b/gi;

/**
 * Currency amounts: ₹, INR, USD, $, € followed by digits (with optional commas/dots).
 */
const REGEX_CURRENCY = /(?:₹|INR|USD|\$|€)\s*[\d,]+(?:\.\d{1,2})?/gi;

/**
 * Dates in common Indian/international formats:
 *  - DD/MM/YYYY  or  DD-MM-YYYY
 *  - Month DD, YYYY  (e.g., January 1, 2024)
 *  - DD Month YYYY   (e.g., 1 January 2024)
 */
const REGEX_DATE =
  /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/gi;

/** http/https URLs. */
const REGEX_URL = /https?:\/\/[^\s"'<>)]+/gi;

// ---------------------------------------------------------------------------
// Placeholder labels used in maskedText
// ---------------------------------------------------------------------------

const PLACEHOLDER_EMAIL     = '[EMAIL]';
const PLACEHOLDER_PHONE     = '[PHONE]';
const PLACEHOLDER_PAN       = '[PAN]';
const PLACEHOLDER_AADHAAR   = '[AADHAAR]';
const PLACEHOLDER_PASSPORT  = '[PASSPORT]';
const PLACEHOLDER_PRICE     = '[PRICE]';
const PLACEHOLDER_DATE      = '[DATE]';
const PLACEHOLDER_URL       = '[URL]';
const PLACEHOLDER_CONTRACTOR = '[CONTRACTOR]';
const PLACEHOLDER_CLIENT    = '[CLIENT]';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a whole-word, case-insensitive regex for a literal name string.
 * Returns null if the name is empty/null/undefined.
 *
 * @param {string} name
 * @returns {RegExp|null}
 */
function buildNameRegex(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return null;

  // Escape any regex-special characters in the name.
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'gi');
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Masks PII in raw contract text so it can be safely sent to the LLM.
 *
 * Steps:
 *  1. Replace `userName` occurrences → [CONTRACTOR]
 *  2. Replace `companyName` occurrences → [CLIENT]
 *  3. Scrub regex-detected PII (email, phone, PAN, Aadhaar, passport,
 *     currency, dates, URLs) with labelled placeholders.
 *
 * @param {string} text        - Raw extracted contract text.
 * @param {string} [userName]  - The contractor / user's full name.
 * @param {string} [companyName] - The client / company name.
 * @returns {{ maskedText: string, maskMap: { CONTRACTOR: string, CLIENT: string } }}
 */
export function maskPII(text, userName, companyName) {
  // Defensive: return safe defaults for null/undefined input.
  let masked = String(text ?? '');

  // --- Step 1: Named entity replacement (before regex scrubbing to avoid
  //             accidentally masking names that look like email local-parts) ---

  const contractorRegex = buildNameRegex(userName);
  if (contractorRegex) {
    masked = masked.replace(contractorRegex, PLACEHOLDER_CONTRACTOR);
  }

  const clientRegex = buildNameRegex(companyName);
  if (clientRegex) {
    masked = masked.replace(clientRegex, PLACEHOLDER_CLIENT);
  }

  // --- Step 2: Regex-based PII scrubbing ---
  // Order matters: more-specific patterns first to prevent partial overlaps.

  // URLs before emails so "user@http://..." is handled correctly.
  masked = masked.replace(REGEX_URL, PLACEHOLDER_URL);
  masked = masked.replace(REGEX_EMAIL, PLACEHOLDER_EMAIL);

  // PAN before Aadhaar (PAN has letters, so it won't conflict with 12-digit
  // Aadhaar, but let's keep a deterministic order).
  masked = masked.replace(REGEX_PAN, PLACEHOLDER_PAN);
  masked = masked.replace(REGEX_AADHAAR, PLACEHOLDER_AADHAAR);
  masked = masked.replace(REGEX_PASSPORT, PLACEHOLDER_PASSPORT);

  masked = masked.replace(REGEX_CURRENCY, PLACEHOLDER_PRICE);
  masked = masked.replace(REGEX_DATE, PLACEHOLDER_DATE);
  masked = masked.replace(REGEX_PHONE, PLACEHOLDER_PHONE);

  // --- Step 3: Build maskMap ---
  const maskMap = {
    CONTRACTOR: String(userName ?? '').trim() || null,
    CLIENT: String(companyName ?? '').trim() || null,
  };

  return { maskedText: masked, maskMap };
}

/**
 * Replaces [CONTRACTOR] and [CLIENT] placeholders in a single LLM output
 * string with the real values stored in maskMap.
 *
 * PII-typed placeholders ([EMAIL], [PHONE], etc.) are intentionally left
 * as-is — the user does not need their own data reflected back.
 *
 * @param {string} resultText - A single string from LLM output (explanation, clauseType, etc.).
 * @param {{ CONTRACTOR: string|null, CLIENT: string|null }} maskMap - Map returned by maskPII.
 * @returns {string}
 */
export function demaskResult(resultText, maskMap) {
  let text = String(resultText ?? '');

  if (!maskMap || typeof maskMap !== 'object') return text;

  if (maskMap.CONTRACTOR) {
    text = text.replaceAll(PLACEHOLDER_CONTRACTOR, maskMap.CONTRACTOR);
  }

  if (maskMap.CLIENT) {
    text = text.replaceAll(PLACEHOLDER_CLIENT, maskMap.CLIENT);
  }

  return text;
}

/**
 * Batch-demasking for the full LLM results array.
 *
 * Runs demaskResult over `explanation`, `clause_type`, `negotiation`, and
 * every item in `concerns[]` (if present) for each result object.
 *
 * Does NOT mutate the original array.
 *
 * @param {Array<{
 *   clause_type?: string,
 *   risk_level?: string,
 *   explanation?: string,
 *   negotiation?: string,
 *   concerns?: string[],
 *   [key: string]: any
 * }>} resultsArray - Raw results from the LLM / analysis pipeline.
 * @param {{ CONTRACTOR: string|null, CLIENT: string|null }} maskMap - Map returned by maskPII.
 * @returns {Array} - New array with placeholders replaced.
 */
export function demaskResults(resultsArray, maskMap) {
  if (!Array.isArray(resultsArray)) return [];
  if (!maskMap || typeof maskMap !== 'object') return resultsArray.slice();

  return resultsArray.map((item) => {
    if (!item || typeof item !== 'object') return item;

    const demasked = { ...item };

    if (typeof demasked.clause_type === 'string') {
      demasked.clause_type = demaskResult(demasked.clause_type, maskMap);
    }

    if (typeof demasked.explanation === 'string') {
      demasked.explanation = demaskResult(demasked.explanation, maskMap);
    }

    if (typeof demasked.negotiation === 'string') {
      demasked.negotiation = demaskResult(demasked.negotiation, maskMap);
    }

    if (Array.isArray(demasked.concerns)) {
      demasked.concerns = demasked.concerns.map((concern) =>
        typeof concern === 'string' ? demaskResult(concern, maskMap) : concern,
      );
    }

    return demasked;
  });
}
