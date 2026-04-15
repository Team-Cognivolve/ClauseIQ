// Clause Extraction & Universal Analysis - Structural Parsing for Contract Analysis

/**
 * Regex patterns for identifying clause boundaries in contracts
 */
const CLAUSE_PATTERNS = {
  // Numbered sections: 1., 1.1, 1.1.1, etc.
  numberedSection: /^(\d+\.)+\s*/,

  // Article/Section headers: Article 1, Section 2.3, ARTICLE I, etc.
  articleSection: /^(article|section|clause|part|schedule|exhibit|appendix|annex)\s+[\dIVXivx]+\.?\s*/i,

  // Lettered sections: (a), (b), (i), (ii), a., b., etc.
  letteredSection: /^(\([a-z]\)|\([ivx]+\)|[a-z]\.\s)/i,

  // All caps headers (common in legal docs): CONFIDENTIALITY, LIMITATION OF LIABILITY
  allCapsHeader: /^[A-Z][A-Z\s]{4,}[A-Z](?:\.|:)?\s*/,

  // Definitions pattern: "Term" means...
  definitionPattern: /^[""][^""]+[""]\s+(means|shall mean|refers to)/i,
};

/**
 * Common legal section headers to identify clause types
 */
const LEGAL_HEADERS = [
  'definitions', 'interpretation', 'term', 'duration', 'scope', 'services',
  'payment', 'fees', 'compensation', 'invoice', 'expenses',
  'confidential', 'proprietary', 'non-disclosure', 'nda',
  'intellectual property', 'ip', 'ownership', 'work product', 'copyright',
  'warranty', 'warranties', 'representation', 'guarantees',
  'indemnification', 'indemnity', 'hold harmless',
  'limitation of liability', 'liability', 'damages',
  'termination', 'cancellation', 'expiration',
  'non-compete', 'non-solicitation', 'restrictive covenant',
  'dispute', 'arbitration', 'mediation', 'governing law', 'jurisdiction',
  'force majeure', 'assignment', 'amendment', 'waiver', 'severability',
  'notice', 'entire agreement', 'survival', 'insurance', 'audit',
];

/**
 * Extract all clauses from contract text using structural parsing
 * @param {string} text - The full contract text
 * @returns {Array<{id: string, text: string, header: string|null}>}
 */
export function extractClauses(text) {
  if (!text || typeof text !== 'string') return [];

  const clauses = [];
  let clauseId = 0;

  // Normalize text: handle different line endings and multiple spaces
  const normalizedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ') // Collapse multiple spaces
    .replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines

  // Split by potential clause boundaries
  const segments = splitByClauseBoundaries(normalizedText);

  for (const segment of segments) {
    const trimmed = segment.trim();

    // Skip very short segments
    if (!trimmed || trimmed.length < 30) continue;

    // Skip segments that are just headers with no content
    if (trimmed.split(' ').length < 8) continue;

    // Extract header if present
    const headerInfo = extractHeader(trimmed);

    clauseId++;
    clauses.push({
      id: `clause-${clauseId}`,
      text: trimmed,
      header: headerInfo.header,
      cleanText: headerInfo.body,
    });
  }

  // Don't merge clauses - keep them separate for better granularity
  return clauses;
}

/**
 * Split text by clause boundaries (numbered sections, headers, paragraphs)
 */
function splitByClauseBoundaries(text) {
  const segments = [];

  // Comprehensive split patterns for legal clauses
  const splitPatterns = [
    // Numbered sections: 1. 2. 3. or 1.1, 1.2, etc.
    /(?=\n\s*\d+\.\d*\s+[A-Z])/g,
    // Article/Section headers
    /(?=\n\s*(?:article|section|clause|part)\s+[\dIVXivx]+\.?\s)/gi,
    // ALL CAPS headers on their own line
    /(?=\n\s*[A-Z][A-Z\s]{3,}[A-Z](?:\s*[.:])?\s*\n)/g,
    // Lettered sub-sections
    /(?=\n\s*\([a-z]\)\s)/gi,
    // Roman numeral sections
    /(?=\n\s*\([ivx]+\)\s)/gi,
  ];

  // Try each split pattern
  let parts = [text];

  for (const pattern of splitPatterns) {
    const newParts = [];
    for (const part of parts) {
      const splitResult = part.split(pattern);
      newParts.push(...splitResult);
    }
    parts = newParts;
  }

  // If still not enough splits, try double newlines
  if (parts.length < 5) {
    const newParts = [];
    for (const part of parts) {
      if (part.length > 800) {
        const subParts = part.split(/\n{2,}/);
        newParts.push(...subParts);
      } else {
        newParts.push(part);
      }
    }
    parts = newParts;
  }

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // If segment is still too long, split further
    if (trimmed.length > 800) {
      const subParts = splitLongSegment(trimmed);
      segments.push(...subParts);
    } else {
      segments.push(trimmed);
    }
  }

  return segments;
}

/**
 * Split long segments into smaller logical units
 */
function splitLongSegment(text) {
  const parts = [];
  const maxLength = 600;

  // Try splitting by sub-sections (a), (b), etc.
  const subSectionPattern = /(?=\n\s*\([a-z]\)\s)/gi;
  let subParts = text.split(subSectionPattern);

  if (subParts.length > 1) {
    // Recursively check if sub-parts are still too long
    for (const subPart of subParts) {
      const trimmed = subPart.trim();
      if (trimmed.length > maxLength) {
        parts.push(...splitBySentences(trimmed, maxLength));
      } else if (trimmed.length >= 20) {
        parts.push(trimmed);
      }
    }
    return parts;
  }

  // Try splitting by semicolons (common in legal lists)
  const semicolonParts = text.split(/;\s*(?=\n|[A-Z])/);
  if (semicolonParts.length > 2) {
    for (const part of semicolonParts) {
      const trimmed = part.trim();
      if (trimmed.length >= 20 && trimmed.length <= maxLength) {
        parts.push(trimmed);
      } else if (trimmed.length > maxLength) {
        parts.push(...splitBySentences(trimmed, maxLength));
      }
    }
    if (parts.length > 1) return parts;
  }

  // Fall back to splitting by sentences
  return splitBySentences(text, maxLength);
}

/**
 * Split text by sentences, grouping into chunks of max length
 */
function splitBySentences(text, maxLength = 600) {
  const parts = [];

  // Split by sentence endings followed by space and capital letter
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  let current = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    if ((current + ' ' + trimmedSentence).length <= maxLength) {
      current += (current ? ' ' : '') + trimmedSentence;
    } else {
      if (current) parts.push(current.trim());

      // If single sentence is too long, just add it anyway
      if (trimmedSentence.length > maxLength) {
        parts.push(trimmedSentence);
        current = '';
      } else {
        current = trimmedSentence;
      }
    }
  }

  if (current) parts.push(current.trim());

  return parts.length > 0 ? parts : [text];
}

/**
 * Extract header/title from a clause segment
 */
function extractHeader(text) {
  const lines = text.split('\n');
  const firstLine = lines[0].trim();

  // Check if first line looks like a header
  const isHeader = (
    CLAUSE_PATTERNS.allCapsHeader.test(firstLine) ||
    CLAUSE_PATTERNS.articleSection.test(firstLine) ||
    (firstLine.length < 100 && LEGAL_HEADERS.some(h =>
      firstLine.toLowerCase().includes(h)
    ))
  );

  if (isHeader && lines.length > 1) {
    return {
      header: firstLine.replace(/[.:]\s*$/, '').trim(),
      body: lines.slice(1).join('\n').trim() || firstLine,
    };
  }

  // Try to extract inline header (e.g., "5.1 Confidentiality. The parties agree...")
  const inlineMatch = firstLine.match(/^(?:(\d+\.)+\s*)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[.:]\s*/);
  if (inlineMatch) {
    return {
      header: inlineMatch[2],
      body: text.replace(inlineMatch[0], '').trim() || text,
    };
  }

  return { header: null, body: text };
}

/**
 * Merge clauses that were incorrectly split
 */
function mergeSplitClauses(clauses) {
  const merged = [];
  let i = 0;

  while (i < clauses.length) {
    const current = clauses[i];

    // If current clause is very short and next one has no header, merge them
    if (
      current.cleanText.length < 100 &&
      i + 1 < clauses.length &&
      !clauses[i + 1].header
    ) {
      const next = clauses[i + 1];
      merged.push({
        id: current.id,
        text: current.text + '\n\n' + next.text,
        header: current.header,
        cleanText: current.cleanText + ' ' + next.cleanText,
      });
      i += 2;
    } else {
      merged.push(current);
      i++;
    }
  }

  return merged;
}

/**
 * Filter clauses to get only substantive contract clauses
 * Removes boilerplate headers, signature blocks, etc.
 */
export function filterSubstantiveClauses(clauses) {
  const boilerplatePatterns = [
    /^(signature|witness|executed|in witness whereof)/i,
    /^(page|date|by|name|title|address):/i,
    /^\[.*\]$/, // Placeholder brackets
    /^_{5,}$/, // Signature lines
  ];

  return clauses.filter(clause => {
    // Defensive check: ensure clause exists and has text
    if (!clause || typeof clause !== 'object') return false;

    const text = clause.cleanText || clause.text;

    // Defensive check: ensure text is a valid string
    if (!text || typeof text !== 'string') return false;

    // Must have minimum content
    if (text.length < 30) return false;

    // Skip boilerplate
    if (boilerplatePatterns.some(p => p.test(text))) return false;

    // Must contain actual sentences (not just headers)
    if (!text.includes(' ') || text.split(' ').length < 5) return false;

    return true;
  });
}

// UNIVERSAL CLAUSE ANALYSIS - New Schema Support

/**
 * Normalize and validate clause analysis from LLM output
 * Supports schema: clause_type, risk_level (High/Medium/Low), negotiation string
 * @param {Object} item - Raw analysis object from LLM
 * @param {Object} originalClause - Original clause object for fallback
 * @returns {Object|null} Normalized analysis or null if invalid
 */
export function normalizeClauseAnalysis(item, originalClause = null) {
  if (!item || typeof item !== 'object') return null;

  // Validate clause_text
  const clauseText = String(item.clause_text || '').trim();
  if (!clauseText) return null;

  // Normalize risk_level (must be High, Medium, or Low)
  const riskStr = String(item.risk_level || 'Low').toLowerCase();
  let riskLevel = 'Low';
  if (riskStr.includes('high')) {
    riskLevel = 'High';
  } else if (riskStr.includes('medium') || riskStr.includes('med')) {
    riskLevel = 'Medium';
  }

  // Normalize clause_type
  let clauseType = String(item.clause_type || '').trim();
  if (!clauseType && originalClause?.header) {
    clauseType = originalClause.header;
  }
  if (!clauseType) {
    clauseType = 'General Provision';
  }

  // Normalize negotiation (string field)
  let negotiation = '';
  if (typeof item.negotiation === 'string') {
    negotiation = item.negotiation.trim();
  } else if (Array.isArray(item.concerns) && item.concerns.length > 0) {
    // Backwards compatibility: convert concerns array to negotiation suggestion
    const concernsList = item.concerns.map(c => String(c).trim()).filter(c => c.length > 0);
    if (concernsList.length > 0) {
      negotiation = `I would like to discuss: ${concernsList.join(', ').toLowerCase()}. Can we find more balanced terms?`;
    }
  }

  // Normalize explanation
  const explanation = String(item.explanation || '').trim();
  if (!explanation) return null;

  return {
    clause_text: clauseText,
    clause_type: clauseType,
    risk_level: riskLevel,
    explanation,
    negotiation,
  };
}

/**
 * Validate and enrich LLM analysis with pattern detection
 * Combines LLM output with heuristic pattern matching
 * @param {Object} llmAnalysis - Analysis from LLM (already normalized)
 * @param {Object} clause - Original clause object
 * @param {Object} patternResult - Result from detectRiskByPattern (from constants.js)
 * @returns {Object} Enriched analysis
 */
export function validateAndEnrichAnalysis(llmAnalysis, clause, patternResult) {
  // Start with LLM analysis
  const enriched = { ...llmAnalysis };

  // If pattern detection found higher risk, elevate it
  if (patternResult.level === 'High' && enriched.risk_level !== 'High') {
    enriched.risk_level = 'High';
  } else if (patternResult.level === 'Medium' && enriched.risk_level === 'Low') {
    enriched.risk_level = 'Medium';
  }

  // If pattern detected issues but LLM didn't provide negotiation, generate one
  if (patternResult.matches && patternResult.matches.length > 0 && !enriched.negotiation) {
    const concerns = patternResult.matches.map(m => m.concern);
    enriched.negotiation = `I would like to address: ${concerns.join(', ').toLowerCase()}. Can we discuss alternative terms?`;
  }

  // If LLM provided a generic clause_type but pattern has more specific type, use pattern type
  if (
    enriched.clause_type === 'General Provision' &&
    patternResult.matches &&
    patternResult.matches.length > 0
  ) {
    enriched.clause_type = patternResult.matches[0].type;
  }

  return enriched;
}

/**
 * Parse LLM JSON response and normalize all findings
 * @param {string} llmResponse - Raw response from LLM
 * @param {Array} clauses - Original clause objects
 * @returns {Array} Array of normalized analysis objects
 */
export function parseLLMResponse(llmResponse, clauses = []) {
  if (!llmResponse || typeof llmResponse !== 'string') {
    return [];
  }

  // Try to extract JSON from response (handle markdown fences)
  let jsonStr = llmResponse.trim();

  // Remove markdown code fences if present
  jsonStr = jsonStr.replace(/^```json?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

  // Remove any leading/trailing text
  const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      return [];
    }

    // Normalize each item
    return parsed
      .map((item, index) => {
        const originalClause = clauses[index] || null;
        return normalizeClauseAnalysis(item, originalClause);
      })
      .filter(item => item !== null);
  } catch (error) {
    console.error('Failed to parse LLM response:', error);
    return [];
  }
}

/**
 * Batch clauses for LLM processing
 * Groups clauses into optimal batches for analysis
 * @param {Array} clauses - Array of clause objects
 * @param {number} batchSize - Number of clauses per batch
 * @returns {Array<Array>} Array of clause batches
 */
export function batchClauses(clauses, batchSize = 5) {
  if (!Array.isArray(clauses) || clauses.length === 0) {
    return [];
  }

  // Filter out any invalid clauses before batching
  const validClauses = clauses.filter(c => c && typeof c === 'object' && (c.text || c.cleanText));

  const batches = [];
  for (let i = 0; i < validClauses.length; i += batchSize) {
    batches.push(validClauses.slice(i, i + batchSize));
  }

  return batches;
}
