import React, { useState, useEffect, useRef } from 'react';
import { usePDFExtractor } from '../hooks/usePDFExtractor';
import { useWebLLM } from '../hooks/useWebLLM';
import {
  buildClauseAnalysisPrompt,
  detectRiskByPattern,
  generateFallbackAnalysis,
  MAX_CONCURRENT_ANALYSES,
} from '../utils/constants';
import {
  extractClauses,
  filterSubstantiveClauses,
  batchClauses,
  normalizeClauseAnalysis,
  validateAndEnrichAnalysis,
} from '../utils/rag';
import { UploadArea } from './UploadArea';
import { ProgressIndicator } from './ProgressIndicator';
import { ResultsList } from './ResultsList';

export function ClauseIQ() {
  const pdf = usePDFExtractor();
  const llm = useWebLLM();

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [results, setResults] = useState(null);

  // Guard ref: ensures we never run two analyses for the same document
  const didAnalyse = useRef(false);

  // ============================================================
  // UNIVERSAL CLAUSE ANALYSIS - No Category Constraints
  // ============================================================

  useEffect(() => {
    const canRun = pdf.status === 'done' && llm.modelState === 'ready' && !didAnalyse.current;
    if (!canRun) return;

    didAnalyse.current = true;

    (async () => {
      setAnalyzing(true);
      setAnalysisError(null);
      setResults(null);

      try {
        // Step 1: Extract all clauses using structural parsing
        const allClauses = extractClauses(pdf.text);

        // Step 2: Filter to get only substantive clauses (remove boilerplate)
        const substantiveClauses = filterSubstantiveClauses(allClauses);

        if (substantiveClauses.length === 0) {
          setAnalysisError('No substantial clauses found in the contract.');
          return;
        }

        // Step 3: Batch clauses for processing (8 per batch for optimal throughput)
        const clauseBatches = batchClauses(substantiveClauses, 8);

        // Step 4: Process batches in parallel (limited concurrency to avoid overload)
        const processBatch = async (batch, batchIndex) => {
          // Step 4a: Pre-scan batch with pattern detection
          const patternResults = batch.map(clause => ({
            clause,
            patterns: detectRiskByPattern(clause.cleanText || clause.text),
          }));

          // Step 4b: Build LLM prompt for this batch
          const userPrompt = buildClauseAnalysisPrompt(batch);

          // Step 4c: Send to LLM for analysis
          let llmAnalyses = [];
          try {
            const llmResponse = await llm.analyze(pdf.text, { userPrompt });

            // Parse and normalize LLM response
            if (Array.isArray(llmResponse)) {
              llmAnalyses = llmResponse
                .map((item, index) => normalizeClauseAnalysis(item, batch[index]))
                .filter(item => item !== null);
            }
          } catch (err) {
            console.warn(`LLM analysis failed for batch ${batchIndex + 1}:`, err);
          }

          // Step 4d: Validate, enrich, or fallback for each clause
          const batchAnalyses = [];
          for (let i = 0; i < batch.length; i++) {
            const clause = batch[i];
            const patternResult = patternResults[i].patterns;

            let finalAnalysis;

            if (llmAnalyses[i]) {
              // LLM succeeded - validate and enrich with pattern detection
              finalAnalysis = validateAndEnrichAnalysis(
                llmAnalyses[i],
                clause,
                patternResult
              );
            } else {
              // LLM failed - use pattern-based fallback
              finalAnalysis = generateFallbackAnalysis(clause, patternResult);
            }

            // Only include clauses with actual concerns or Medium/High risk
            if (
              finalAnalysis.risk_level !== 'Low' ||
              finalAnalysis.concerns.length > 0
            ) {
              batchAnalyses.push(finalAnalysis);
            }
          }

          return batchAnalyses;
        };

        // Helper function for parallel batch processing with concurrency limit
        const processWithConcurrency = async (batches, concurrency) => {
          const results = [];
          for (let i = 0; i < batches.length; i += concurrency) {
            const chunk = batches.slice(i, i + concurrency);
            const batchPromises = chunk.map((batch, offset) =>
              processBatch(batch, i + offset)
            );
            const chunkResults = await Promise.all(batchPromises);
            results.push(...chunkResults.flat());
          }
          return results;
        };

        const allAnalyses = await processWithConcurrency(clauseBatches, MAX_CONCURRENT_ANALYSES);

        // Step 5: Deduplicate by clause text (first 100 chars)
        const seen = new Set();
        const unique = allAnalyses.filter(analysis => {
          const key = (analysis.clause_text ?? '').slice(0, 100).toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Step 6: Sort by risk level (High → Medium → Low)
        const sorted = unique.sort((a, b) => {
          const riskOrder = { High: 0, Medium: 1, Low: 2 };
          return riskOrder[a.risk_level] - riskOrder[b.risk_level];
        });

        setResults(sorted);
      } catch (err) {
        setAnalysisError(err.message);
      } finally {
        setAnalyzing(false);
      }
    })();
  }, [pdf.status, llm.modelState, pdf.text, llm.analyze]);

  // ============================================================
  // FILE HANDLING
  // ============================================================

  const handleFileSelect = (file) => {
    didAnalyse.current = false; // allow a fresh analysis run
    setResults(null);
    setAnalysisError(null);
    pdf.extractText(file);
  };

  // ============================================================
  // DERIVED STATE
  // ============================================================

  const waitingForModel = pdf.status === 'done' && llm.modelState === 'loading';

  return (
    <div className="clauseiq">
      {/* Brand Header */}
      <header className="brand">
        <div className="brand__lockup">
          <span className="brand__icon" aria-hidden>
            &#x2696;&#xFE0F;
          </span>
          <span className="brand__name">ClauseIQ</span>
        </div>
        <p className="brand__tagline">
          AI-powered contract red-flag detector &mdash; 100&thinsp;% private, runs in your browser
        </p>
      </header>

      {/* Model Loading Progress */}
      <ProgressIndicator modelState={llm.modelState} loadProgress={llm.loadProgress} />

      {/* File Upload */}
      <UploadArea onFileSelect={handleFileSelect} status={pdf.status} error={pdf.error} />

      {/* Document Metadata */}
      {pdf.status === 'done' && (
        <div className="doc-meta" aria-live="polite">
          <span className="doc-meta__pages">
            &#x1F4CB;&nbsp;{pdf.pageCount} page{pdf.pageCount !== 1 ? 's' : ''} extracted
          </span>
          {pdf.pageCount > 4 && (
            <span className="doc-meta__chip">Structural clause extraction active</span>
          )}
        </div>
      )}

      {/* Waiting for Model */}
      {waitingForModel && (
        <div className="waiting-banner" role="status">
          &#x23F3;&nbsp;Waiting for the AI model to finish loading before analysing…
        </div>
      )}

      {/* Analysis Error */}
      {analysisError && (
        <div className="error-banner" role="alert">
          &#x26A0;&#xFE0F;&nbsp;Analysis error: {analysisError}
        </div>
      )}

      {/* Results */}
      <ResultsList results={results} analyzing={analyzing} />
    </div>
  );
}