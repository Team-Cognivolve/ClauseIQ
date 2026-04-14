import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePDFExtractor } from '../hooks/usePDFExtractor';
import { useGitHubCopilot } from '../hooks/useGitHubCopilot';
import {
  detectRiskByPattern,
  generateFallbackAnalysis,
  MAX_CONCURRENT_ANALYSES,
} from '../utils/constants';
import {
  extractClauses,
  filterSubstantiveClauses,
  normalizeClauseAnalysis,
  validateAndEnrichAnalysis,
} from '../utils/rag';
import './ClauseIQ.css';

const COPILOT_MODEL_STORAGE_KEY = 'clauseiq_github_copilot_model';

function readSessionValue(key, fallback = '') {
  if (typeof window === 'undefined') return fallback;
  return window.sessionStorage.getItem(key) || fallback;
}

export function ClauseIQ() {
  const pdf = usePDFExtractor();
  const githubCopilot = useGitHubCopilot();
  const {
    analyzeClause: analyzeCopilotClause,
    configurationError: copilotConfigurationError,
    isAuthenticated: isCopilotAuthenticated,
    isConfigured: isCopilotConfigured,
  } = githubCopilot;

  const [copilotModel, setCopilotModel] = useState(() => readSessionValue(COPILOT_MODEL_STORAGE_KEY, ''));
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ processed: 0, total: 0 });
  const [analysisError, setAnalysisError] = useState(null);
  const [results, setResults] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  const inputRef = useRef(null);
  const didAnalyse = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(COPILOT_MODEL_STORAGE_KEY, copilotModel);
  }, [copilotModel]);

  useEffect(() => {
    didAnalyse.current = false;
    if (pdf.status === 'done') {
      setResults(null);
      setAnalysisError(null);
    }
  }, [copilotModel, isCopilotAuthenticated, pdf.status]);

  const activeProvider = useMemo(() => ({
    key: 'github-copilot',
    label: 'GitHub Copilot',
    modelName: copilotModel.trim() || 'Model required',
    isConfigured: isCopilotConfigured && isCopilotAuthenticated && Boolean(copilotModel.trim()),
    configurationError:
      copilotConfigurationError ||
      (!isCopilotAuthenticated
        ? 'Authenticate with GitHub Copilot to continue.'
        : (!copilotModel.trim() ? 'Type a GitHub Copilot model name to continue.' : null)),
    analyzeClause: (clause) => analyzeCopilotClause(clause, copilotModel.trim()),
  }), [
    analyzeCopilotClause,
    copilotModel,
    copilotConfigurationError,
    isCopilotAuthenticated,
    isCopilotConfigured,
  ]);

  useEffect(() => {
    const canRun = pdf.status === 'done' && !!pdf.text && activeProvider.isConfigured && !didAnalyse.current;
    if (!canRun) return;

    didAnalyse.current = true;
    let cancelled = false;

    (async () => {
      setAnalyzing(true);
      setAnalysisProgress({ processed: 0, total: 0 });
      setAnalysisError(null);
      setResults(null);

      try {
        if (!activeProvider.isConfigured) {
          throw new Error(activeProvider.configurationError || `${activeProvider.label} is not configured.`);
        }

        const allClauses = extractClauses(pdf.text);
        const substantiveClauses = filterSubstantiveClauses(allClauses);
        setAnalysisProgress({ processed: 0, total: substantiveClauses.length });

        if (substantiveClauses.length === 0) {
          setAnalysisError('No substantial clauses found in the contract.');
          return;
        }

        const processClause = async (clause, index) => {
          const patternResult = detectRiskByPattern(clause.cleanText || clause.text);

          try {
            const apiResponse = await activeProvider.analyzeClause(clause);
            const normalized = normalizeClauseAnalysis(apiResponse, clause);

            if (normalized) {
              const validated = validateAndEnrichAnalysis(normalized, clause, patternResult);
              return { ...validated, _clauseId: clause.id };
            }
          } catch (error) {
            console.warn(`${activeProvider.label} analysis failed for clause ${index + 1}:`, error);
          }

          return { ...generateFallbackAnalysis(clause, patternResult), _clauseId: clause.id };
        };

        const seen = new Set();
        const riskOrder = { High: 0, Medium: 1, Low: 2 };
        const totalClauses = substantiveClauses.length;
        let nextIndex = 0;
        let visibleCount = 0;

        const maybePublishAnalysis = (analysis) => {
          const shouldShow = (
            analysis.risk_level !== 'Low' ||
            (analysis.negotiation && analysis.negotiation.trim())
          );

          if (!shouldShow) return;

          const key = (analysis.clause_text ?? '').slice(0, 100).toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          visibleCount += 1;

          if (cancelled) return;

          setResults((previous) => {
            const existing = Array.isArray(previous) ? previous : [];
            const next = [...existing, analysis].sort((a, b) => riskOrder[a.risk_level] - riskOrder[b.risk_level]);
            return next;
          });
        };

        const runWorker = async () => {
          while (nextIndex < substantiveClauses.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;

            const analysis = await processClause(substantiveClauses[currentIndex], currentIndex);
            maybePublishAnalysis(analysis);

            if (!cancelled) {
              setAnalysisProgress((previous) => ({
                ...previous,
                processed: Math.min(previous.processed + 1, totalClauses),
              }));
            }
          }
        };

        const workerCount = Math.min(MAX_CONCURRENT_ANALYSES, substantiveClauses.length);
        await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

        if (!cancelled && visibleCount === 0) {
          setResults([]);
        }
      } catch (error) {
        if (!cancelled) {
          setAnalysisError(error.message);
        }
      } finally {
        if (!cancelled) {
          setAnalyzing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeProvider, pdf.status, pdf.text]);

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

  const handleFileChange = (event) => {
    handleFileSelect(event.target.files[0]);
    event.target.value = '';
  };

  const calculateRiskScores = () => {
    if (!results || !Array.isArray(results) || results.length === 0) {
      return { overall: 0, high: 0, medium: 0, low: 0, highCount: 0, mediumCount: 0, lowCount: 0 };
    }

    const high = results.filter((result) => result.risk_level === 'High').length;
    const medium = results.filter((result) => result.risk_level === 'Medium').length;
    const low = results.filter((result) => result.risk_level === 'Low').length;
    const total = results.length;

    return {
      overall: Math.round(((high * 100) + (medium * 50) + (low * 10)) / total),
      high: Math.round((high / total) * 100),
      medium: Math.round((medium / total) * 100),
      low: Math.round((low / total) * 100),
      highCount: high,
      mediumCount: medium,
      lowCount: low,
    };
  };

  const riskScores = calculateRiskScores();
  const isExtracting = pdf.status === 'extracting';
  const isPdfDone = pdf.status === 'done';
  const hasResults = Array.isArray(results) && results.length > 0;

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

  const renderGitHubCopilotControls = () => (
    <div className="provider-card__section">
      <label className="provider-card__label" htmlFor="copilot-model">GitHub Copilot Model</label>
      <input
        id="copilot-model"
        className="provider-card__input"
        type="text"
        value={copilotModel}
        onChange={(event) => setCopilotModel(event.target.value)}
        placeholder="e.g. gpt-4.1"
      />

      {githubCopilot.isAuthenticated ? (
        <div className="provider-status provider-status--success">
          <span>GitHub Copilot is authenticated for this browser session.</span>
          <button type="button" className="provider-inline-btn" onClick={githubCopilot.disconnect}>
            Disconnect
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="provider-auth-btn"
            onClick={githubCopilot.startAuth}
            disabled={!githubCopilot.isConfigured || githubCopilot.isAuthorizing}
          >
            {githubCopilot.isAuthorizing ? 'Waiting for GitHub...' : 'Connect GitHub Copilot'}
          </button>

          {githubCopilot.deviceAuth.status === 'waiting' && (
            <div className="device-auth-card">
              <span className="device-auth-card__label">Enter this code on GitHub</span>
              <span className="device-auth-card__code">{githubCopilot.deviceAuth.userCode}</span>
              <a
                className="device-auth-card__link"
                href={githubCopilot.deviceAuth.verificationUri}
                target="_blank"
                rel="noreferrer"
              >
                Open github.com/login/device
              </a>
            </div>
          )}
        </>
      )}

      {githubCopilot.deviceAuth.error && (
        <p className="provider-card__error">{githubCopilot.deviceAuth.error}</p>
      )}
    </div>
  );

  return (
    <div className="analysis-page">
      <nav className="analysis-nav">
        <div className="analysis-nav__container">
          <div className="analysis-nav__logo">ClauseIQ</div>
        </div>
      </nav>

      <div className="analysis-content">
        <aside className="analysis-sidebar">
          <div className="risk-panel">
            <h2 className="risk-panel__title">Risk Score Health</h2>

            <div className="risk-gauge">
              <svg className="risk-gauge__svg" viewBox="0 0 200 200">
                <circle
                  className="risk-gauge__bg"
                  cx="100"
                  cy="100"
                  r="85"
                  fill="none"
                  stroke="#E5E1D6"
                  strokeWidth="12"
                />
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

            <section className="provider-card">
              <div className="provider-card__header">
                <h3 className="provider-card__title">AI Provider</h3>
                <span className="provider-card__active">GitHub Copilot</span>
              </div>

              {renderGitHubCopilotControls()}

              {activeProvider.configurationError && (
                <p className="provider-card__error">{activeProvider.configurationError}</p>
              )}
            </section>

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

        <main className="analysis-main">
          {!activeProvider.isConfigured && activeProvider.configurationError && (
            <div className="error-card">
              <span className="error-card__icon">!</span>
              <span className="error-card__text">{activeProvider.configurationError}</span>
            </div>
          )}

          {!isPdfDone && !analyzing && !hasResults && (
            <div className="ready-card">
              <div className="ready-card__icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
              </div>
              <h3 className="ready-card__title">Provider Ready</h3>
              <p className="ready-card__text">
                Upload a PDF contract to analyze clauses with
                <strong> {activeProvider.label}</strong>
                {' '}using
                <strong> {activeProvider.modelName}</strong>.
              </p>
            </div>
          )}

          {isExtracting && (
            <div className="status-card">
              <div className="status-card__spinner" />
              <span className="status-card__text">Extracting text from PDF...</span>
            </div>
          )}

          {analyzing && (
            <div className="status-card status-card--analyzing">
              <div className="status-card__spinner" />
              <span className="status-card__text">
                Analysing clauses with {activeProvider.label}... ({analysisProgress.processed}/{analysisProgress.total})
              </span>
            </div>
          )}

          {pdf.error && isPdfDone && (
            <div className="error-card">
              <span className="error-card__icon">!</span>
              <span className="error-card__text">{pdf.error}</span>
            </div>
          )}

          {analysisError && (
            <div className="error-card">
              <span className="error-card__icon">!</span>
              <span className="error-card__text">Analysis error: {analysisError}</span>
            </div>
          )}

          {hasResults && (
            <div className="clauses-section">
              <div className="clauses-header">
                <h2 className="clauses-header__title">{analyzing ? 'Analysis In Progress' : 'Analysis Complete'}</h2>
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
                  <ClauseCard key={item._clauseId || `${item.clause_type}-${idx}`} item={item} />
                ))}
              </div>
            </div>
          )}

          {Array.isArray(results) && results.length === 0 && (
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

function ClauseCard({ item }) {
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
        onClick={() => setOpen((value) => !value)}
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
        &ldquo;
        <TypingText as="span" text={item.clause_text} className="typing-inline" speed={10} />
        &rdquo;
      </blockquote>

      {open && (
        <div className="clause-card__detail">
          <div className="detail-section">
            <h4 className="detail-section__heading">What This Means</h4>
            <TypingText text={item.explanation} speed={14} />
          </div>

          {item.negotiation && String(item.negotiation).trim() && (
            <div className="detail-section detail-section--suggestion">
              <h4 className="detail-section__heading">Negotiation</h4>
              <TypingText text={item.negotiation} speed={14} />
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function TypingText({ text, className = '', as: asTag = 'p', speed = 16 }) {
  const safeText = String(text || '');
  const [visibleChars, setVisibleChars] = useState(0);

  useEffect(() => {
    setVisibleChars(0);

    if (!safeText) return undefined;

    const tickMs = Math.max(8, speed);
    const step = Math.max(1, Math.ceil(safeText.length / 80));
    let current = 0;

    const timer = window.setInterval(() => {
      current = Math.min(current + step, safeText.length);
      setVisibleChars(current);

      if (current >= safeText.length) {
        window.clearInterval(timer);
      }
    }, tickMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [safeText, speed]);

  const done = visibleChars >= safeText.length;
  const shownText = safeText.slice(0, visibleChars);

  return React.createElement(
    asTag,
    { className },
    <>
      {shownText}
      {!done && <span className="typing-caret" aria-hidden>|</span>}
    </>,
  );
}
