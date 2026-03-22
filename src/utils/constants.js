// Low-spec default model for CPU-only laptops.
// If you want better quality and have more RAM, move up to Qwen2.5-1.5B.
export const MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
export const MODEL_LABEL = 'Qwen2.5-1.5B';
export const MODEL_SIZE_LABEL = '~1.5 GB';

// Conservative settings for 4 GB RAM devices.
export const CHUNK_WORDS = 900;
export const CHUNK_OVERLAP = 100;
export const INFERENCE_MAX_TOKENS = 512;
export const ANALYSIS_TIMEOUT_MS = 20000; // 20 seconds per batch (reduced from 420s)
export const RAG_TOP_K = 14;
export const RAG_MIN_SCORE = 1;
export const MAX_CONCURRENT_ANALYSES = 10; // Process 10 batches in parallel

// HEURISTIC RISK PATTERNS - Pattern Matching for Risk Detection

/**
 * Regex patterns for identifying high-risk clause characteristics
 * Used as fallback and validation for LLM analysis
 */
export const RISK_PATTERNS = {
  HIGH: {
    unlimitedLiability: {
      pattern: /(unlimited|without\s+limit|no\s+limit|infinite)\s+(liability|damages|exposure|obligation)/i,
      concern: 'Unlimited liability exposure',
      type: 'Liability',
    },
    allClaims: {
      pattern: /(any\s+and\s+all|all\s+claims|all\s+losses|all\s+damages|all\s+liabilities)/i,
      concern: 'Broad indemnification scope',
      type: 'Indemnification',
    },
    workForHire: {
      pattern: /(work\s+for\s+hire|made\s+for\s+hire|work-for-hire)/i,
      concern: 'Automatic IP transfer regardless of payment',
      type: 'Intellectual Property',
    },
    ipTransferBeforePayment: {
      pattern: /(upon\s+creation|immediately\s+upon|automatically\s+transfer|irrevocably\s+assign|vests\s+in\s+client)/i,
      concern: 'IP transfer before payment',
      type: 'Intellectual Property',
    },
    terminateForConvenience: {
      pattern: /(terminate\s+for\s+convenience|terminate\s+at\s+any\s+time|cancel\s+at\s+will|without\s+cause)/i,
      concern: 'Client can terminate without cause',
      type: 'Termination',
    },
    noCompensationOnTermination: {
      pattern: /(no\s+further\s+liability|no\s+compensation|no\s+payment|without\s+payment).*?(termination|cancel)/i,
      concern: 'No compensation for early termination',
      type: 'Termination',
    },
    longNonCompete: {
      pattern: /(12\s*months|24\s*months|two\s+years|one\s+year).*?(non-compete|non\s+compete|not\s+compete|restrict.*compet)/i,
      concern: 'Extended non-compete period',
      type: 'Non-Compete',
    },
    broadNonCompete: {
      pattern: /(worldwide|globally|any\s+jurisdiction|any\s+location|entire\s+industry).*?(non-compete|restrict)/i,
      concern: 'Overly broad geographic or industry restriction',
      type: 'Non-Compete',
    },
    unilateralChange: {
      pattern: /(may\s+change|reserve\s+the\s+right\s+to\s+modify|at\s+its\s+sole\s+discretion|without\s+notice).*?(terms|agreement|rate|fee)/i,
      concern: 'Unilateral modification rights',
      type: 'Amendment',
    },
    autoRenewal: {
      pattern: /(automatically\s+renew|auto-renew|automatic\s+renewal).*?(unless|until\s+notified|prior\s+to)/i,
      concern: 'Automatic renewal with notice requirements',
      type: 'Term and Renewal',
    },
  },

  MEDIUM: {
    consequentialDamages: {
      pattern: /(consequential|indirect|incidental|punitive|special)\s+damages/i,
      concern: 'Exposure to consequential damages',
      type: 'Liability',
    },
    oneSidedIndemnity: {
      pattern: /contractor\s+(shall|will|agrees\s+to)\s+(indemnify|defend|hold\s+harmless)/i,
      concern: 'One-sided indemnification obligation',
      type: 'Indemnification',
    },
    broadConfidentiality: {
      pattern: /(all\s+information|any\s+information).*?(confidential|proprietary)/i,
      concern: 'Overly broad confidentiality definition',
      type: 'Confidentiality',
    },
    vagueScope: {
      pattern: /(as\s+needed|as\s+required|from\s+time\s+to\s+time|such\s+other\s+services)/i,
      concern: 'Vague or unlimited scope of work',
      type: 'Scope of Work',
    },
    latePaymentNoInterest: {
      pattern: /(payment\s+due|invoice\s+due|net\s+\d+)(?!.*(interest|late\s+fee|penalty))/i,
      concern: 'No late payment penalties specified',
      type: 'Payment Terms',
    },
    unilateralDispute: {
      pattern: /(client|company)\s+shall\s+determine.*?(dispute|claim|interpretation)/i,
      concern: 'Client has unilateral dispute resolution power',
      type: 'Dispute Resolution',
    },
    assignmentRestriction: {
      pattern: /contractor.*?(may\s+not|cannot|shall\s+not).*?assign/i,
      concern: 'Contractor cannot assign contract',
      type: 'Assignment',
    },
  },

  LOW: {
    cappedLiability: {
      pattern: /(liability.*?capped|limited\s+to|not\s+exceed).*(fees|amount\s+paid)/i,
      type: 'Liability',
    },
    mutualConfidentiality: {
      pattern: /(mutual|both\s+parties|each\s+party).*?(confidential|non-disclosure)/i,
      type: 'Confidentiality',
    },
    reasonableNotice: {
      pattern: /(30|60|90)\s+days.*?notice.*?terminat/i,
      type: 'Termination',
    },
    paymentOnCompletion: {
      pattern: /(upon\s+completion|after\s+delivery|following\s+acceptance).*?payment/i,
      type: 'Payment Terms',
    },
  },
};

/**
 * Detect risk level of a clause using heuristic pattern matching
 * @param {string} clauseText - The clause text to analyze
 * @returns {{level: string, matches: Array, score: number}}
 */
export function detectRiskByPattern(clauseText) {
  if (!clauseText || typeof clauseText !== 'string') {
    return { level: 'Low', matches: [], score: 0 };
  }

  const matches = [];
  let highScore = 0;
  let mediumScore = 0;

  // Check HIGH risk patterns
  for (const [key, pattern] of Object.entries(RISK_PATTERNS.HIGH)) {
    if (pattern.pattern.test(clauseText)) {
      matches.push({
        level: 'High',
        concern: pattern.concern,
        type: pattern.type,
        pattern: key,
      });
      highScore += 3;
    }
  }

  // Check MEDIUM risk patterns
  for (const [key, pattern] of Object.entries(RISK_PATTERNS.MEDIUM)) {
    if (pattern.pattern.test(clauseText)) {
      matches.push({
        level: 'Medium',
        concern: pattern.concern,
        type: pattern.type,
        pattern: key,
      });
      mediumScore += 2;
    }
  }

  // Check LOW risk patterns (positive signals)
  let lowScore = 0;
  for (const [key, pattern] of Object.entries(RISK_PATTERNS.LOW)) {
    if (pattern.pattern.test(clauseText)) {
      lowScore += 1;
    }
  }

  // Determine overall risk level
  let level = 'Low';
  let score = 0;

  if (highScore > 0) {
    level = 'High';
    score = highScore;
  } else if (mediumScore > 0) {
    level = 'Medium';
    score = mediumScore;
  } else if (lowScore > 0) {
    level = 'Low';
    score = -lowScore; // Negative score indicates favorable
  }

  return { level, matches, score };
}

/**
 * Generate fallback analysis when LLM fails or returns invalid data
 * @param {Object} clause - Clause object with text and header
 * @param {Object} patternResult - Result from detectRiskByPattern
 * @returns {Object} Fallback analysis object
 */
export function generateFallbackAnalysis(clause, patternResult) {
  const concerns = patternResult.matches.map(m => m.concern);

  // Determine clause type from pattern matches or header
  let clauseType = 'General Provision';
  if (patternResult.matches.length > 0) {
    clauseType = patternResult.matches[0].type;
  } else if (clause.header) {
    clauseType = clause.header;
  }

  // Generate explanation based on risk level
  let explanation = '';
  if (patternResult.level === 'High') {
    explanation = `This clause contains language that may create significant risk or unfair obligations. ${concerns.length > 0 ? 'Specific concerns have been identified.' : 'Careful review is recommended.'}`;
  } else if (patternResult.level === 'Medium') {
    explanation = `This clause may require clarification or negotiation. While not immediately problematic, it could lead to issues in certain situations.`;
  } else {
    explanation = `This clause appears to follow standard industry practices and does not present obvious risks.`;
  }

  return {
    clause_text: clause.cleanText || clause.text,
    clause_type: clauseType,
    risk_level: patternResult.level,
    explanation,
    concerns,
  };
}

export const SYSTEM_PROMPT = `You are an expert contract analysis AI specializing in identifying and assessing risks in legal agreements.

TASK: Analyze the provided contract clauses and assess each one for potential risks, fairness, and implications.

For EACH clause provided, return a JSON object with the following structure:
{
  "clause_text": "<exact verbatim text of the clause being analyzed>",
  "clause_type": "<descriptive name of what this clause covers, e.g., 'Payment Terms', 'Confidentiality', 'Intellectual Property Rights', 'Liability Cap', 'Non-Compete Restriction', etc.>",
  "risk_level": "High" | "Medium" | "Low",
  "explanation": "<clear, plain-language description of what this clause means and its practical implications>",
  "concerns": ["<specific issue 1>", "<specific issue 2>", ...] or []
}

RISK LEVEL CRITERIA:
- High: Heavily one-sided terms, creates unlimited liability/exposure, severely restricts rights, unfair compensation/IP terms, or could cause significant harm
- Medium: Potentially problematic in certain situations, ambiguous language, minor imbalance, or requires negotiation for clarity
- Low: Standard industry practice, balanced terms, or favorable to both parties

CONCERNS FIELD:
List specific red flags or issues with the clause. Examples:
- "Unlimited liability exposure"
- "No compensation for early termination"
- "Overly broad non-compete (24 months, worldwide)"
- "IP transfer before payment"
- "One-sided indemnification"
- "No cap on damages"
- "Vague termination conditions"
If the clause is fair and balanced, return empty array: []

OUTPUT FORMAT:
Return ONLY a valid JSON array containing one object per clause analyzed.
Example: [{"clause_text": "...", "clause_type": "...", "risk_level": "...", "explanation": "...", "concerns": [...]}, ...]

If no clauses are provided or none need analysis, return empty array: []

CRITICAL RULES:
1. Output ONLY the JSON array - no preamble, no markdown code fences, no commentary
2. Use EXACT text from the provided clauses - do NOT invent or modify clause text
3. Be thorough but concise in explanations (2-4 sentences)
4. Clause types should be descriptive and specific (not generic labels)
5. Focus on practical business and legal risks from a contractor/service provider perspective
6. If a clause has multiple concerning aspects, list all in the concerns array`;

/**
 * Build analysis prompt for a batch of clauses
 * @param {Array<{text: string, header: string|null}>} clauses - Array of clause objects
 * @returns {string} - Formatted prompt for LLM
 */
export function buildClauseAnalysisPrompt(clauses) {
  if (!Array.isArray(clauses) || clauses.length === 0) {
    return 'No clauses provided for analysis.';
  }

  const clauseTexts = clauses
    .map((clause, index) => {
      const header = clause.header ? `[${clause.header}]\n` : '';
      return `CLAUSE ${index + 1}:\n${header}${clause.cleanText || clause.text}`;
    })
    .join('\n\n---\n\n');

  return `Analyze the following contract clauses:\n\n${clauseTexts}\n\nProvide risk assessment for each clause in JSON array format.`;
}