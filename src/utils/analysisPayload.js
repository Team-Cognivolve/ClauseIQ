export function extractMessageContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item?.type === 'text') {
          return item.text ?? '';
        }

        return '';
      })
      .join('')
      .trim();
  }

  return '';
}

export function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') return null;

  const direct = safeJsonParse(raw.trim());
  if (direct) {
    return direct;
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    const parsedFence = safeJsonParse(fenced[1].trim());
    if (parsedFence) {
      return parsedFence;
    }
  }

  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    const parsedArray = safeJsonParse(arrayMatch[0]);
    if (parsedArray) {
      return parsedArray;
    }
  }

  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    const parsedObject = safeJsonParse(objectMatch[0]);
    if (parsedObject) {
      return parsedObject;
    }
  }

  return null;
}

export function normalizeApiPayload(parsed) {
  if (!parsed) return null;

  if (Array.isArray(parsed)) {
    return parsed[0] ?? null;
  }

  if (typeof parsed !== 'object') {
    return null;
  }

  if (parsed.clause_text || parsed.clause_type || parsed.risk_level) {
    return parsed;
  }

  const nestedCandidate =
    parsed.result ||
    parsed.analysis ||
    parsed.clause ||
    parsed.data ||
    (Array.isArray(parsed.results) ? parsed.results[0] : null) ||
    (Array.isArray(parsed.analyses) ? parsed.analyses[0] : null);

  if (nestedCandidate && typeof nestedCandidate === 'object') {
    return nestedCandidate;
  }

  return parsed;
}
