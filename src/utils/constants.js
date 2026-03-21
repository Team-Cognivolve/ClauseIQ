// utils/constants.js

// Low-spec default model for CPU-only laptops.
// If you want better quality and have more RAM, move up to Qwen2.5-1.5B.
export const MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
export const MODEL_LABEL = 'Qwen2.5-1.5B';
export const MODEL_SIZE_LABEL = '~1.5 GB';

// Conservative settings for 4 GB RAM devices.
export const CHUNK_WORDS = 900;
export const CHUNK_OVERLAP = 100;
export const INFERENCE_MAX_TOKENS = 512;
export const ANALYSIS_TIMEOUT_MS = 420000;
export const RAG_TOP_K = 14;
export const RAG_MIN_SCORE = 1;

export const CATEGORY_DEFINITIONS = [
  {
    id: 'NON-COMPETE',
    question: 'Is there a post-termination work restriction or client/solicit ban?',
    keywords: [
      'non-compete', 'non compete', 'compete', 'restriction', 'restrict',
      'post-termination', 'after termination', 'solicit', 'solicitation',
      'customer', 'client', 'employee', '12 months', '24 months',
      'non-solicit', 'non solicit', 'engage', 'directly or indirectly',
    ],
  },
  {
    id: 'LIABILITY',
    question: 'Is liability unlimited, one-sided, or disproportionate?',
    keywords: [
      'liability', 'liable', 'indemnity', 'indemnify', 'damages',
      'consequential', 'indirect', 'unlimited', 'without limit',
      'defend and hold harmless', 'all losses', 'all claims',
      'hold harmless', 'at its sole discretion', 'any and all',
    ],
  },
  {
    id: 'IP_TRANSFER',
    question: 'Does IP ownership transfer before full payment?',
    keywords: [
      'intellectual property', 'ip', 'work product', 'ownership', 'assign',
      'assignment', 'rights', 'title', 'interest', 'transfer',
      'upon creation', 'made for hire', 'work for hire', 'before payment',
      'irrevocably assigns', 'vests in client', 'exclusive property',
    ],
  },
  {
    id: 'TERMINATION',
    question: 'Can client terminate without paying for completed work?',
    keywords: [
      'terminate', 'termination', 'cancel', 'cancellation', 'without cause',
      'for convenience', 'notice', 'payment', 'fees due', 'services rendered',
      'no further liability', 'refund', 'work performed', 'kill fee',
      'immediate termination', 'terminate at any time', 'already performed',
    ],
  },
];

export function buildFocusedPrompt(categoryId, question, snippets) {
  const joined = snippets.map((s, i) => `(${i + 1}) ${s}`).join('\n\n');
  return `Category focus: ${categoryId}
Question: ${question}

Potentially relevant clauses (retrieved locally):
${joined || 'No strong matches found.'}

Task:
- Only return findings for category ${categoryId}.
- Use only quoted text from the snippets.
- If no risky clause is present, return [] for this category.
- Return JSON array only.`;
}

export const SYSTEM_PROMPT = `You are a professional legal risk analyst specialising in freelance and contractor agreements.
Analyse the supplied contract text and identify ALL potentially harmful clauses across these exact categories:

1. NON-COMPETE  – Any clause that restricts the contractor from working in the same field or with competitors after the contract ends.
2. LIABILITY    – Any clause that exposes the contractor to unlimited, disproportionate, or one-sided financial liability.
3. IP_TRANSFER  – Any clause that transfers intellectual-property ownership to the client before, or independent of, full payment.
4. TERMINATION  – Any clause that allows the client to terminate without compensating the contractor for work already completed or in progress.

Return ONLY a valid JSON array. Each identified issue must strictly follow this schema:
{
  "category":    "NON-COMPETE" | "LIABILITY" | "IP_TRANSFER" | "TERMINATION",
  "clause_text": "<exact verbatim excerpt from the contract that contains the problem>",
  "risk_level":  "High" | "Medium",
  "explanation": "<concise explanation of why this clause is harmful to the contractor>",
  "suggestion":  "<specific rewording or negotiation tactic to neutralise the risk>"
}

If no red flags are found, return an empty array: []

CRITICAL RULES:
- Output ONLY the JSON array. No preamble, no markdown fences, no trailing commentary.
- Do NOT invent clauses that are not present in the text.
- If a sentence qualifies under multiple categories, create one entry per category.`;