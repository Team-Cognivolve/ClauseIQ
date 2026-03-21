// utils/chunker.js

/**
 * Splits contract text into overlapping word-based chunks for the LLM context window.
 * Overlap preserves sentence context across chunk boundaries.
 *
 * @param {string} text       – Full extracted contract text
 * @param {number} maxWords   – Target words per chunk (default 1800 ≈ ~2 400 tokens)
 * @param {number} overlapWords – Words to repeat from previous chunk (default 150)
 * @returns {string[]}
 */
export function splitIntoChunks(text, maxWords = 1800, overlapWords = 150) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return [text];

  const chunks = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + maxWords, words.length);
    chunks.push(words.slice(start, end).join(' '));
    if (end === words.length) break;
    start += maxWords - overlapWords;
  }

  return chunks;
}

/**
 * Rough page estimate based on average 350 words per page.
 * @param {string} text
 * @returns {number}
 */
export function estimatePageCount(text) {
  return Math.max(1, Math.ceil(text.split(/\s+/).filter(Boolean).length / 350));
}