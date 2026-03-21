// utils/rag.js
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

  // Normalize text: handle different line endings
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split by potential clause boundaries
  const segments = splitByClauseBoundaries(normalizedText);

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed || trimmed.length < 20) continue;

    // Skip very short segments that are likely headers only
    if (trimmed.length < 50 && !trimmed.includes(' ')) continue;

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

  // Merge very short consecutive clauses that might be split incorrectly
  return mergeSplitClauses(clauses);
}

/**
 * Split text by clause boundaries (numbered sections, headers, paragraphs)
 */
function splitByClauseBoundaries(text) {
  const segments = [];

  // Primary split: Look for numbered sections and article headers
  const primaryPattern = /(?=(?:^|\n)(?:\d+\.)+\s)|(?=(?:^|\n)(?:article|section|clause)\s+[\dIVXivx]+)/gi;

  let parts = text.split(primaryPattern);

  // If primary split didn't produce good results, fall back to paragraph split
  if (parts.length < 3) {
    parts = text.split(/\n{2,}/);
  }

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // If segment is very long, try to split further
    if (trimmed.length > 2000) {
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

  // Try splitting by sub-sections (a), (b), etc.
  const subSectionPattern = /(?=\n\s*\([a-z]\)\s)/gi;
  let subParts = text.split(subSectionPattern);

  if (subParts.length > 1) {
    return subParts.map(p => p.trim()).filter(p => p.length >= 20);
  }

  // Fall back to splitting by sentences at reasonable boundaries
  const sentences = text.split(/(?<=[.;])\s+(?=[A-Z])/);
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length < 1500) {
      current += (current ? ' ' : '') + sentence;
    } else {
      if (current) parts.push(current.trim());
      current = sentence;
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
    const text = clause.cleanText || clause.text;

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
 * Supports new schema: clause_type, risk_level (High/Medium/Low), concerns array
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

  // Normalize concerns array
  let concerns = [];
  if (Array.isArray(item.concerns)) {
    concerns = item.concerns
      .map(c => String(c).trim())
      .filter(c => c.length > 0);
  } else if (typeof item.concerns === 'string' && item.concerns.trim()) {
    concerns = [item.concerns.trim()];
  }

  // Normalize explanation
  const explanation = String(item.explanation || '').trim();
  if (!explanation) return null;

  return {
    clause_text: clauseText,
    clause_type: clauseType,
    risk_level: riskLevel,
    explanation,
    concerns,
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

  // Merge pattern-detected concerns with LLM concerns
  if (patternResult.matches && patternResult.matches.length > 0) {
    const patternConcerns = patternResult.matches.map(m => m.concern);
    const allConcerns = [...new Set([...enriched.concerns, ...patternConcerns])];
    enriched.concerns = allConcerns;
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

  const batches = [];
  for (let i = 0; i < clauses.length; i += batchSize) {
    batches.push(clauses.slice(i, i + batchSize));
  }

  return batches;
}
