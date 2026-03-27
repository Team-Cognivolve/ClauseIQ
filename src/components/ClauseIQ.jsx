import React, { useState, useEffect, useRef } from 'react';
import { usePDFExtractor } from '../hooks/usePDFExtractor';
import { useWebLLM } from '../hooks/useWebLLM';
import {
  buildClauseAnalysisPrompt,
  detectRiskByPattern,
  generateFallbackAnalysis,
  MAX_CONCURRENT_ANALYSES,
  MODEL_LABEL,
  MODEL_SIZE_LABEL,
} from '../utils/constants';
import {
  extractClauses,
  filterSubstantiveClauses,
  batchClauses,
  normalizeClauseAnalysis,
  validateAndEnrichAnalysis,
} from '../utils/rag';
import './ClauseIQ.css';

export function ClauseIQ() {
  const pdf = usePDFExtractor();
  const llm = useWebLLM();

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [results, setResults] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  const inputRef = useRef(null);
  const didAnalyse = useRef(false);

  // Calculate risk scores from results
  const calculateRiskScores = () => {
    if (!results || !Array.isArray(results) || results.length === 0) {
      return { overall: 0, high: 0, medium: 0, low: 0, highCount: 0, mediumCount: 0, lowCount: 0 };
    }

    const high = results.filter(r => r.risk_level === 'High').length;
    const medium = results.filter(r => r.risk_level === 'Medium').length;
    const low = results.filter(r => r.risk_level === 'Low').length;
    const total = results.length;

    // Calculate percentages
    const highPct = Math.round((high / total) * 100);
    const mediumPct = Math.round((medium / total) * 100);
    const lowPct = Math.round((low / total) * 100);

    // Overall risk score (higher = more risky, 0-100 scale)
    // Weight: High=100, Medium=50, Low=10
    const overallScore = Math.round(((high * 100) + (medium * 50) + (low * 10)) / total);

    return {
      overall: overallScore,
      high: highPct,
      medium: mediumPct,
      low: lowPct,
      highCount: high,
      mediumCount: medium,
      lowCount: low
    };
  };

  const riskScores = calculateRiskScores();

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
        const allClauses = extractClauses(pdf.text);
        const substantiveClauses = filterSubstantiveClauses(allClauses);

        if (substantiveClauses.length === 0) {
          setAnalysisError('No substantial clauses found in the contract.');
          return;
        }

        const clauseBatches = batchClauses(substantiveClauses, 8);

        const processBatch = async (batch, batchIndex) => {
          const patternResults = batch.map(clause => ({
            clause,
            patterns: detectRiskByPattern(clause.cleanText || clause.text),
          }));

          const userPrompt = buildClauseAnalysisPrompt(batch);

          let llmAnalyses = [];
          try {
            const llmResponse = await llm.analyze('', { userPrompt });

            if (Array.isArray(llmResponse)) {
              llmAnalyses = llmResponse
                .map((item, index) => normalizeClauseAnalysis(item, batch[index]))
                .filter(item => item !== null);
            }
          } catch (err) {
            console.warn(`LLM analysis failed for batch ${batchIndex + 1}:`, err);
          }

          const batchAnalyses = [];
          for (let i = 0; i < batch.length; i++) {
            const clause = batch[i];
            const patternResult = patternResults[i].patterns;

            let finalAnalysis;

            if (llmAnalyses[i]) {
              finalAnalysis = validateAndEnrichAnalysis(
                llmAnalyses[i],
                clause,
                patternResult
              );
            } else {
              finalAnalysis = generateFallbackAnalysis(clause, patternResult);
            }

            if (
              finalAnalysis.risk_level !== 'Low' ||
              (finalAnalysis.negotiation && finalAnalysis.negotiation.trim())
            ) {
              batchAnalyses.push(finalAnalysis);
            }
          }

          return batchAnalyses;
        };

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

        const seen = new Set();
        const unique = allAnalyses.filter(analysis => {
          const key = (analysis.clause_text ?? '').slice(0, 100).toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

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
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('Only PDF files are accepted.');
      return;
    }
    didAnalyse.current = false;
    setResults(null);
    setAnalysisError(null);
    setSelectedFile(file);
    pdf.extractText(file);
  };

  const handleAuditClick = () => {
    inputRef.current?.click();
  };

  const handleFileChange = (e) => {
    handleFileSelect(e.target.files[0]);
    e.target.value = '';
  };

  // ============================================================
  // DERIVED STATE
  // ============================================================

  const isModelLoading = llm.modelState === 'loading';
  const isModelReady = llm.modelState === 'ready';
  const isModelError = llm.modelState === 'error';
  const isExtracting = pdf.status === 'extracting';
  const isPdfDone = pdf.status === 'done';
  const hasResults = results && Array.isArray(results) && results.length > 0;
  const { percent = 0, text = '' } = llm.loadProgress || {};

  // Get risk health label
  const getRiskHealthLabel = () => {
    if (!hasResults) return 'No Data';
    if (riskScores.overall >= 70) return 'High Risk';
    if (riskScores.overall >= 40) return 'Medium Risk';
    return 'Low Risk';
  };

  const getRiskHealthColor = () => {
    if (!hasResults) return '#5A6159';
    if (riskScores.overall >= 70) return '#9E422C';
    if (riskScores.overall >= 40) return '#D97706';
    return '#5F614A';
  };

  return (
    <div className="analysis-page">
      {/* Top Navigation */}
      <nav className="analysis-nav">
        <div className="analysis-nav__container">
          <div className="analysis-nav__logo">ClauseIQ</div>
        </div>
      </nav>

      <div className="analysis-content">
        {/* Left Panel - Risk Score */}
        <aside className="analysis-sidebar">
          <div className="risk-panel">
            <h2 className="risk-panel__title">Risk Score Health</h2>

            {/* Circular Gauge */}
            <div className="risk-gauge">
              <svg className="risk-gauge__svg" viewBox="0 0 200 200">
                {/* Background circle */}
                <circle
                  className="risk-gauge__bg"
                  cx="100"
                  cy="100"
                  r="85"
                  fill="none"
                  stroke="#E5E1D6"
                  strokeWidth="12"
                />
                {/* Progress circle */}
                <circle
                  className="risk-gauge__progress"
                  cx="100"
                  cy="100"
                  r="85"
                  fill="none"
                  stroke={getRiskHealthColor()}
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${(hasResults ? riskScores.overall : 0) * 5.34} 534`}
                  transform="rotate(-90 100 100)"
                />
              </svg>
              <div className="risk-gauge__center">
                <span className="risk-gauge__value">{hasResults ? riskScores.overall : '--'}</span>
                <span className="risk-gauge__label">{getRiskHealthLabel()}</span>
              </div>
            </div>

            {/* Risk Bars */}
            <div className="risk-bars">
              <div className="risk-bar">
                <div className="risk-bar__header">
                  <span className="risk-bar__label">High Risk</span>
                  <span className="risk-bar__value">{hasResults ? `${riskScores.high}%` : '--'}</span>
                </div>
                <div className="risk-bar__track">
                  <div
                    className="risk-bar__fill risk-bar__fill--high"
                    style={{ width: hasResults ? `${riskScores.high}%` : '0%' }}
                  />
                </div>
                <span className="risk-bar__count">{hasResults ? `${riskScores.highCount} clauses` : ''}</span>
              </div>

              <div className="risk-bar">
                <div className="risk-bar__header">
                  <span className="risk-bar__label">Medium Risk</span>
                  <span className="risk-bar__value">{hasResults ? `${riskScores.medium}%` : '--'}</span>
                </div>
                <div className="risk-bar__track">
                  <div
                    className="risk-bar__fill risk-bar__fill--medium"
                    style={{ width: hasResults ? `${riskScores.medium}%` : '0%' }}
                  />
                </div>
                <span className="risk-bar__count">{hasResults ? `${riskScores.mediumCount} clauses` : ''}</span>
              </div>

              <div className="risk-bar">
                <div className="risk-bar__header">
                  <span className="risk-bar__label">Low Risk</span>
                  <span className="risk-bar__value">{hasResults ? `${riskScores.low}%` : '--'}</span>
                </div>
                <div className="risk-bar__track">
                  <div
                    className="risk-bar__fill risk-bar__fill--low"
                    style={{ width: hasResults ? `${riskScores.low}%` : '0%' }}
                  />
                </div>
                <span className="risk-bar__count">{hasResults ? `${riskScores.lowCount} clauses` : ''}</span>
              </div>
            </div>

            {/* Audit Button */}
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button className="audit-btn" onClick={handleAuditClick} disabled={isExtracting}>
              {isExtracting ? 'Extracting...' : 'Audit Files'}
            </button>

            {selectedFile && (
              <div className="selected-file">
                <span className="selected-file__icon">PDF</span>
                <span className="selected-file__name">{selectedFile.name}</span>
              </div>
            )}
          </div>
        </aside>

        {/* Right Panel - Main Content */}
        <main className="analysis-main">
          {/* Model Loading Section */}
          {isModelLoading && (
            <div className="model-loader-card">
              <div className="model-loader-card__header">
                <span className="model-loader-card__status">INITIALIZING AI</span>
                <span className="model-loader-card__name">{MODEL_LABEL}</span>
              </div>
              <div className="model-loader-card__progress">
                <div className="model-loader-card__track">
                  <div
                    className="model-loader-card__fill"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="model-loader-card__meta">
                  <span className="model-loader-card__text">{text || 'Starting...'}</span>
                  <span className="model-loader-card__pct">{percent}%</span>
                </div>
              </div>
              <p className="model-loader-card__note">
                Downloading {MODEL_SIZE_LABEL} of model weights to your browser cache.
                Subsequent visits will be instant - everything runs 100% locally.
              </p>
            </div>
          )}

          {/* Model Error */}
          {isModelError && (
            <div className="error-card">
              <span className="error-card__icon">!</span>
              <span className="error-card__text">Model failed to load. Try refreshing the page.</span>
            </div>
          )}

          {/* Model Ready Status */}
          {isModelReady && !isPdfDone && !analyzing && !hasResults && (
            <div className="ready-card">
              <div className="ready-card__icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
              </div>
              <h3 className="ready-card__title">AI Model Ready</h3>
              <p className="ready-card__text">
                Upload a PDF contract using the "Audit Files" button to begin analysis.
              </p>
            </div>
          )}

          {/* Extracting State */}
          {isExtracting && (
            <div className="status-card">
              <div className="status-card__spinner" />
              <span className="status-card__text">Extracting text from PDF...</span>
            </div>
          )}

          {/* Waiting for Model */}
          {isPdfDone && isModelLoading && (
            <div className="status-card status-card--waiting">
              <div className="status-card__spinner" />
              <span className="status-card__text">
                Waiting for the AI model to finish loading before analysing...
              </span>
            </div>
          )}

          {/* Analyzing State */}
          {analyzing && (
            <div className="status-card status-card--analyzing">
              <div className="status-card__spinner" />
              <span className="status-card__text">Analysing contract for red flags...</span>
            </div>
          )}

          {/* Analysis Error */}
          {analysisError && (
            <div className="error-card">
              <span className="error-card__icon">!</span>
              <span className="error-card__text">Analysis error: {analysisError}</span>
            </div>
          )}

          {/* Results Section */}
          {hasResults && (
            <div className="clauses-section">
              <div className="clauses-header">
                <h2 className="clauses-header__title">Analysis Complete</h2>
                <div className="clauses-header__summary">
                  {riskScores.highCount > 0 && (
                    <span className="summary-badge summary-badge--high">
                      {riskScores.highCount} High Risk
                    </span>
                  )}
                  {riskScores.mediumCount > 0 && (
                    <span className="summary-badge summary-badge--medium">
                      {riskScores.mediumCount} Medium Risk
                    </span>
                  )}
                  {riskScores.lowCount > 0 && (
                    <span className="summary-badge summary-badge--low">
                      {riskScores.lowCount} Low Risk
                    </span>
                  )}
                </div>
              </div>

              <div className="clauses-list">
                {results.map((item, idx) => (
                  <ClauseCard key={`${item.clause_type}-${idx}`} item={item} index={idx} />
                ))}
              </div>
            </div>
          )}

          {/* No Results */}
          {results && Array.isArray(results) && results.length === 0 && (
            <div className="no-issues-card">
              <div className="no-issues-card__icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
              </div>
              <h3 className="no-issues-card__title">No Concerns Found</h3>
              <p className="no-issues-card__text">
                No concerning clauses were identified in this contract.
                Consider having a qualified solicitor review it before signing.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// Clause Card Component
function ClauseCard({ item, index }) {
  const [open, setOpen] = useState(false);

  const riskConfig = {
    High: { cls: 'clause-card--high', label: 'High Risk' },
    Medium: { cls: 'clause-card--medium', label: 'Medium Risk' },
    Low: { cls: 'clause-card--low', label: 'Low Risk' },
  };

  const risk = riskConfig[item.risk_level] || riskConfig.Medium;

  return (
    <article className={`clause-card ${risk.cls}`}>
      <button
        className="clause-card__header"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <div className="clause-card__badges">
          <span className={`clause-badge clause-badge--${item.risk_level.toLowerCase()}`}>
            {risk.label}
          </span>
          <span className="clause-type">{item.clause_type}</span>
        </div>
        <span className="clause-card__chevron">{open ? '\u25B2' : '\u25BC'}</span>
      </button>

      <blockquote className="clause-card__excerpt">
        "{item.clause_text}"
      </blockquote>

      {open && (
        <div className="clause-card__detail">
          <div className="detail-section">
            <h4 className="detail-section__heading">What This Means</h4>
            <p>{item.explanation}</p>
          </div>

          {item.negotiation && String(item.negotiation).trim() && (
            <div className="detail-section detail-section--suggestion">
              <h4 className="detail-section__heading">Negotiation</h4>
              <p>{item.negotiation}</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
