// components/ClauseIQ.jsx
import React, { useState, useEffect, useRef } from 'react';
import { usePDFExtractor } from '../hooks/usePDFExtractor';
import { useWebLLM }       from '../hooks/useWebLLM';
import { CATEGORY_DEFINITIONS, RAG_TOP_K, RAG_MIN_SCORE, buildFocusedPrompt } from '../utils/constants';
import { retrieveCategorySnippets, normalizeFinding, fallbackFindingsForCategory } from '../utils/rag';
import { UploadArea }       from './UploadArea';
import { ProgressIndicator } from './ProgressIndicator';
import { ResultsList }       from './ResultsList';

export function ClauseIQ() {
  const pdf = usePDFExtractor();
  const llm = useWebLLM();

  const [analyzing,     setAnalyzing]     = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [results,       setResults]       = useState(null);

  // Guard ref: ensures we never run two analyses for the same document
  const didAnalyse = useRef(false);

  // ─── Trigger analysis when PDF is ready AND model is loaded ─────────
  useEffect(() => {
    const canRun = pdf.status === 'done' && llm.modelState === 'ready' && !didAnalyse.current;
    if (!canRun) return;

    didAnalyse.current = true;

    (async () => {
      setAnalyzing(true);
      setAnalysisError(null);
      setResults(null);

      try {
        const allFindings = [];

        // Local RAG-like retrieval: per category, send only relevant snippets.
        for (const category of CATEGORY_DEFINITIONS) {
          const snippets = retrieveCategorySnippets(
            pdf.text,
            category,
            RAG_TOP_K,
            RAG_MIN_SCORE,
          );

          if (snippets.length === 0) {
            continue;
          }

          const prompt = buildFocusedPrompt(category.id, category.question, snippets);
          const categoryFindings = await llm.analyze(snippets.join('\n\n'), { userPrompt: prompt });
          let categoryAcceptedCount = 0;

          if (Array.isArray(categoryFindings)) {
            for (const raw of categoryFindings) {
              const normalized = normalizeFinding(raw, category.id);
              if (normalized) {
                allFindings.push(normalized);
                categoryAcceptedCount += 1;
              }
            }
          }

          // Deterministic fallback: if the model misses obvious candidates,
          // still emit a small number of conservative findings.
          if (categoryAcceptedCount === 0) {
            const fallback = fallbackFindingsForCategory(category.id, snippets, 1);
            allFindings.push(...fallback);
          }
        }

        // Deduplicate by first 80 chars of clause_text
        const seen   = new Set();
        const unique = allFindings.filter(r => {
          const key = (r.clause_text ?? '').slice(0, 80).toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        setResults(unique);
      } catch (err) {
        setAnalysisError(err.message);
      } finally {
        setAnalyzing(false);
      }
    })();
  }, [pdf.status, llm.modelState, pdf.text, pdf.pageCount, llm.analyze]);

  // ─── File selection ──────────────────────────────────────────────────
  const handleFileSelect = (file) => {
    didAnalyse.current = false; // allow a fresh analysis run
    setResults(null);
    setAnalysisError(null);
    pdf.extractText(file);
  };

  // ─── Derived flags ───────────────────────────────────────────────────
  const waitingForModel = pdf.status === 'done' && llm.modelState === 'loading';

  return (
    <div className="clauseiq">

      {/* ── Brand header ── */}
      <header className="brand">
        <div className="brand__lockup">
          <span className="brand__icon" aria-hidden>&#x2696;&#xFE0F;</span>
          <span className="brand__name">ClauseIQ</span>
        </div>
        <p className="brand__tagline">
          AI-powered contract red-flag detector &mdash; 100&thinsp;% private, runs in your browser
        </p>
      </header>

      {/* ── Model loading bar ── */}
      <ProgressIndicator modelState={llm.modelState} loadProgress={llm.loadProgress} />

      {/* ── Upload ── */}
      <UploadArea
        onFileSelect={handleFileSelect}
        status={pdf.status}
        error={pdf.error}
      />

      {/* ── Document metadata ── */}
      {pdf.status === 'done' && (
        <div className="doc-meta" aria-live="polite">
          <span className="doc-meta__pages">
            &#x1F4CB;&nbsp;{pdf.pageCount} page{pdf.pageCount !== 1 ? 's' : ''} extracted
          </span>
          {pdf.pageCount > 4 && (
            <span className="doc-meta__chip">Sliding-window analysis active</span>
          )}
        </div>
      )}

      {/* ── Waiting for model ── */}
      {waitingForModel && (
        <div className="waiting-banner" role="status">
          &#x23F3;&nbsp;Waiting for the AI model to finish loading before analysing…
        </div>
      )}

      {/* ── Analysis error ── */}
      {analysisError && (
        <div className="error-banner" role="alert">
          &#x26A0;&#xFE0F;&nbsp;Analysis error: {analysisError}
        </div>
      )}

      {/* ── Results ── */}
      <ResultsList results={results} analyzing={analyzing} />

    </div>
  );
}