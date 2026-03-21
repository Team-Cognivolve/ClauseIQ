// utils/rag.js

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
