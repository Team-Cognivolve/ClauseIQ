export const MAX_CONCURRENT_ANALYSES = 100;

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

export function detectRiskByPattern(clauseText) {
  if (!clauseText || typeof clauseText !== 'string') {
    return { level: 'Low', matches: [], score: 0 };
  }

  const matches = [];
  let highScore = 0;
  let mediumScore = 0;

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

  let lowScore = 0;
  for (const pattern of Object.values(RISK_PATTERNS.LOW)) {
    if (pattern.pattern.test(clauseText)) {
      lowScore += 1;
    }
  }

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
    score = -lowScore;
  }

  return { level, matches, score };
}

export function generateFallbackAnalysis(clause, patternResult) {
  const concerns = patternResult.matches.map((match) => match.concern);

  let clauseType = 'General Provision';
  if (patternResult.matches.length > 0) {
    clauseType = patternResult.matches[0].type;
  } else if (clause.header) {
    clauseType = clause.header;
  }

  let explanation = '';
  let negotiation = '';

  if (patternResult.level === 'High') {
    explanation = `This clause contains terms that could significantly impact your rights or obligations. ${concerns.length > 0 ? `It includes: ${concerns.join(', ').toLowerCase()}.` : ''} Before signing, you should carefully consider whether these terms are acceptable for your situation. This type of clause often favors one party more than the other.`;
    negotiation = concerns.length > 0
      ? `I would like to discuss modifying this clause to address the following: ${concerns.join(', ').toLowerCase()}. Can we find more balanced terms?`
      : 'I have concerns about this clause and would like to discuss more balanced alternatives.';
  } else if (patternResult.level === 'Medium') {
    explanation = 'This clause may need some clarification or adjustment. While not immediately problematic, the language could be interpreted in different ways or may create obligations that need to be clearly understood. It is worth discussing with the other party to ensure both sides have the same understanding.';
    negotiation = 'Could we clarify the specific terms and conditions in this clause to ensure both parties have the same understanding?';
  } else {
    explanation = 'This clause appears to follow standard practices and creates reasonable obligations for both parties. The terms seem balanced and should not create unexpected issues during the course of the agreement.';
    negotiation = '';
  }

  return {
    clause_text: clause.cleanText || clause.text,
    clause_type: clauseType,
    risk_level: patternResult.level,
    explanation,
    negotiation,
  };
}

export const SYSTEM_PROMPT = `You are an expert contract analyst who explains legal clauses in plain language that anyone can understand.

TASK: Analyze exactly one contract clause and explain it clearly. For risky clauses, suggest how to negotiate better terms.

Return ONLY one JSON object in this format:
{
  "clause_text": "<exact text of the clause>",
  "clause_type": "<type: Payment Terms, Liability, Non-Compete, Confidentiality, IP Rights, Termination, etc.>",
  "risk_level": "High" | "Medium" | "Low",
  "explanation": "<A clear 3-5 sentence paragraph explaining what this clause actually means in everyday language. What does each party have to do? What are the consequences? What rights or restrictions does it create? Write as if explaining to a friend who has never read a contract before.>",
  "negotiation": "<If the clause is unfair or risky, write 1-2 sentences suggesting what to say to negotiate better terms. If the clause is fair and balanced, use an empty string.>"
}

RISK LEVELS:
- High: One-sided terms, unlimited liability, severely restricts rights, unfair obligations
- Medium: Potentially problematic, ambiguous language, needs clarification
- Low: Standard industry practice, balanced and fair to both parties

RULES:
1. Explanations must be in simple, everyday language.
2. For negotiation, write it as practical suggested dialog.
3. If the clause is Low risk and fair, negotiation should be an empty string.
4. Return ONLY a valid JSON object. No markdown fences, no extra text.`;

export function buildClauseAnalysisPrompt(clause) {
  if (!clause || typeof clause !== 'object' || !(clause.cleanText || clause.text)) {
    return 'No clause provided for analysis.';
  }

  const header = clause.header ? `Header: ${clause.header}\n` : '';
  const clauseText = clause.cleanText || clause.text;

  return `Analyze this contract clause.\n\n${header}Clause Text:\n${clauseText}\n\nReturn exactly one JSON object.`;
}
