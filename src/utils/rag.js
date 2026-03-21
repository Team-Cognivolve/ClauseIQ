// CLAUSE EXTRACTION - Structural Parsing for Contract Analysis

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

function splitIntoCandidateClauses(text) {
  if (!text || typeof text !== 'string') return [];

  // Keep paragraph boundaries first (important for legal sections),
  // then split long paragraphs into sentence-like units.
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const candidates = [];
  for (const para of paragraphs) {
    if (para.length <= 1000) {
      candidates.push(para);
      continue;
    }

    const sentences = para
      .split(/(?<=[.;:])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const sentence of sentences) {
      candidates.push(sentence);
    }
  }

  return candidates.filter((s) => s.length >= 30 && s.length <= 1200);
}

function scoreClause(clause, keywords) {
  const lower = clause.toLowerCase();
  let score = 0;

  for (const kw of keywords) {
    const k = kw.toLowerCase();
    if (lower.includes(k)) {
      // Multi-word terms are stronger legal signals.
      score += k.includes(' ') ? 3 : 2;
    }
  }

  // Boost for legally risky intensity terms.
  if (/(unlimited|without\s+limit|all\s+claims|for\s+convenience|made\s+for\s+hire)/i.test(clause)) {
    score += 2;
  }

  return score;
}

export function retrieveCategorySnippets(text, category, topK = 10, minScore = 2) {
  const clauses = splitIntoCandidateClauses(text);
  const ranked = clauses
    .map((clause) => ({ clause, score: scoreClause(clause, category.keywords) }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => x.clause);

  return ranked;
}

export function normalizeFinding(item, fallbackCategory) {
  if (!item || typeof item !== 'object') return null;

  const category = String(item.category || fallbackCategory || '').toUpperCase().replace(/\s+/g, '_');
  const risk = String(item.risk_level || 'Medium').toLowerCase();

  const normalized = {
    category: ['NON-COMPETE', 'LIABILITY', 'IP_TRANSFER', 'TERMINATION'].includes(category)
      ? category
      : fallbackCategory,
    clause_text: String(item.clause_text || '').trim(),
    risk_level: risk.includes('high') ? 'High' : 'Medium',
    explanation: String(item.explanation || '').trim(),
    suggestion: String(item.suggestion || '').trim(),
  };

  if (!normalized.clause_text || !normalized.explanation || !normalized.suggestion) {
    return null;
  }

  return normalized;
}

function heuristicRiskLevel(categoryId, clause) {
  const c = clause.toLowerCase();
  if (categoryId === 'LIABILITY' && /(unlimited|without\s+limit|any\s+and\s+all|all\s+claims)/i.test(c)) return 'High';
  if (categoryId === 'IP_TRANSFER' && /(upon\s+creation|irrevocably\s+assign|work\s+for\s+hire)/i.test(c)) return 'High';
  if (categoryId === 'TERMINATION' && /(for\s+convenience|terminate\s+at\s+any\s+time|no\s+further\s+liability)/i.test(c)) return 'High';
  if (categoryId === 'NON-COMPETE' && /(12\s*months|24\s*months|post-termination|after\s+termination)/i.test(c)) return 'High';
  return 'Medium';
}

function heuristicSuggestion(categoryId) {
  if (categoryId === 'NON-COMPETE') {
    return 'Limit any restriction to direct competitors, narrow geography, and a short duration (for example 3-6 months).';
  }
  if (categoryId === 'LIABILITY') {
    return 'Cap liability to fees paid under this agreement and exclude indirect/consequential damages.';
  }
  if (categoryId === 'IP_TRANSFER') {
    return 'Make IP transfer conditional on full payment, with a temporary license until payment clears.';
  }
  return 'Require payment for all completed and in-progress work, plus a reasonable notice period or termination fee.';
}

function heuristicExplanation(categoryId) {
  if (categoryId === 'NON-COMPETE') {
    return 'This clause may block your ability to earn from similar clients after the contract ends.';
  }
  if (categoryId === 'LIABILITY') {
    return 'This language can expose you to one-sided or uncapped financial risk.';
  }
  if (categoryId === 'IP_TRANSFER') {
    return 'Ownership appears to transfer before payment, which weakens your leverage if invoices are delayed.';
  }
  return 'This termination language may let the client stop work without paying for effort already delivered.';
}

export function fallbackFindingsForCategory(categoryId, snippets, limit = 2) {
  if (!Array.isArray(snippets) || snippets.length === 0) return [];

  return snippets.slice(0, limit).map((clause) => ({
    category: categoryId,
    clause_text: clause,
    risk_level: heuristicRiskLevel(categoryId, clause),
    explanation: heuristicExplanation(categoryId),
    suggestion: heuristicSuggestion(categoryId),
  }));
}
