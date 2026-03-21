import { useState, useCallback } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * @typedef {Object} PDFState
 * @property {string|null}  text      - Full extracted text (all pages joined)
 * @property {string[]}     pages     - Per-page text array
 * @property {number}       pageCount - Total pages in the PDF
 * @property {'idle'|'extracting'|'done'|'error'} status
 * @property {string|null}  error     - Error or warning message
 */

/** @returns {PDFState & { extractText: (File) => Promise<void>, reset: () => void }} */
export function usePDFExtractor() {
  const [state, setState] = useState({
    text: null,
    pages: [],
    pageCount: 0,
    status: 'idle',
    error: null,
  });

  const extractText = useCallback(async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setState(s => ({ ...s, status: 'error', error: 'Only PDF files are accepted.' }));
      return;
    }

    setState({ text: null, pages: [], pageCount: 0, status: 'extracting', error: null });

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      const pageTexts = [];
      const emptyPageNums = [];

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const raw = content.items
          .map(item => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (!raw) emptyPageNums.push(i);
        pageTexts.push(raw);
      }

      // If every single page is empty, the PDF is likely a scanned image.
      if (emptyPageNums.length === numPages) {
        setState(s => ({
          ...s,
          status: 'error',
          error:
            'This PDF contains no selectable text. It appears to be a scanned image. ' +
            'Please use a text-based PDF (not a scan).',
        }));
        return;
      }

      const fullText = pageTexts.filter(Boolean).join('\n\n');
      const warning =
        emptyPageNums.length > 0
          ? `Note: page${emptyPageNums.length > 1 ? 's' : ''} ${emptyPageNums.join(', ')} had no extractable text (possibly images or graphics).`
          : null;

      setState({
        text: fullText,
        pages: pageTexts,
        pageCount: numPages,
        status: 'done',
        error: warning,
      });
    } catch (err) {
      setState(s => ({ ...s, status: 'error', error: `PDF extraction failed: ${err.message}` }));
    }
  }, []);

  const reset = useCallback(() => {
    setState({ text: null, pages: [], pageCount: 0, status: 'idle', error: null });
  }, []);

  return { ...state, extractText, reset };
}