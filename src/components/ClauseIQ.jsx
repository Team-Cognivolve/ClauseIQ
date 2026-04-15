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

const DEFAULT_COPILOT_MODEL = 'gpt-4.1';
const COPILOT_MODEL_STORAGE_KEY = 'clauseiq_github_copilot_model';

function readSessionValue(key, fallback = '') {
  if (typeof window === 'undefined') return fallback;
  return window.sessionStorage.getItem(key) || fallback;
}

const DOCUMENT_TOPICS = [
  { title: 'Payment Terms', initials: 'PT', keywords: ['payment', 'invoice', 'net ', 'fee', 'billing'] },
  { title: 'Contract Duration', initials: 'CD', keywords: ['term', 'duration', 'renew', 'expiration', 'effective date'] },
  { title: 'Termination', initials: 'TR', keywords: ['terminate', 'termination', 'notice period', 'breach'] },
  { title: 'Liability', initials: 'LB', keywords: ['liability', 'damages', 'indemn', 'cap'] },
  { title: 'Confidentiality', initials: 'CF', keywords: ['confidential', 'non-disclosure', 'nda'] },
  { title: 'Intellectual Property', initials: 'IP', keywords: ['intellectual property', 'ip', 'ownership', 'license'] },
  { title: 'Dispute Resolution', initials: 'DR', keywords: ['dispute', 'arbitration', 'jurisdiction', 'governing law'] },
];

function buildDocumentInsights(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 40);

  if (sentences.length === 0) return [];

  const pickedSentenceIndexes = new Set();
  const insights = [];

  for (const topic of DOCUMENT_TOPICS) {
    if (insights.length >= 4) break;

    const matchIndex = sentences.findIndex((sentence, index) => {
      if (pickedSentenceIndexes.has(index)) return false;
      const lowered = sentence.toLowerCase();
      return topic.keywords.some((keyword) => lowered.includes(keyword));
    });

    if (matchIndex === -1) continue;

    pickedSentenceIndexes.add(matchIndex);
    insights.push({
      title: topic.title,
      initials: topic.initials,
      detail: sentences[matchIndex],
    });
  }

  for (let index = 0; insights.length < 4 && index < sentences.length; index += 1) {
    if (pickedSentenceIndexes.has(index)) continue;

    insights.push({
      title: `Key Point ${insights.length + 1}`,
      initials: `K${insights.length + 1}`,
      detail: sentences[index],
    });
  }

  return insights;
}

export function ClauseIQ({ onSignOut, onBackToLanding }) {
  const pdf = usePDFExtractor();
  const githubCopilot = useGitHubCopilot();
  const {
    analyzeClause: analyzeCopilotClause,
    configurationError: copilotConfigurationError,
    isAuthenticated: isCopilotAuthenticated,
    isAuthorizing: isCopilotAuthorizing,
    isConfigured: isCopilotConfigured,
    deviceAuth: copilotDeviceAuth,
    startAuth: startCopilotAuth,
    disconnect: disconnectCopilot,
  } = githubCopilot;

  const [copilotModel, setCopilotModel] = useState(() => readSessionValue(COPILOT_MODEL_STORAGE_KEY, DEFAULT_COPILOT_MODEL));
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ processed: 0, total: 0 });
  const [analysisError, setAnalysisError] = useState(null);
  const [results, setResults] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

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
  }, [pdf.status]);

  useEffect(() => {
    const canRun = pdf.status === 'done' && !!pdf.text && !didAnalyse.current;
    if (!canRun) return;

    didAnalyse.current = true;
    let cancelled = false;

    (async () => {
      setAnalyzing(true);
      setAnalysisProgress({ processed: 0, total: 0 });
      setAnalysisError(null);
      setResults(null);

      try {
        const allClauses = extractClauses(pdf.text);
        const substantiveClauses = filterSubstantiveClauses(allClauses);
        setAnalysisProgress({ processed: 0, total: substantiveClauses.length });

        if (substantiveClauses.length === 0) {
          setAnalysisError('No substantial clauses found in the contract.');
          return;
        }

        const canUseCopilot = isCopilotConfigured && isCopilotAuthenticated && Boolean(copilotModel.trim());

        const processClause = async (clause, index) => {
          const patternResult = detectRiskByPattern(clause.cleanText || clause.text);

          if (canUseCopilot) {
            try {
              const apiResponse = await analyzeCopilotClause(clause, copilotModel.trim());
              const normalized = normalizeClauseAnalysis(apiResponse, clause);

              if (normalized) {
                const validated = validateAndEnrichAnalysis(normalized, clause, patternResult);
                return { ...validated, _clauseId: clause.id };
              }
            } catch (error) {
              console.warn(`Copilot analysis failed for clause ${index + 1}:`, error);
            }
          }

          return { ...generateFallbackAnalysis(clause, patternResult), _clauseId: clause.id };
        };

        const seen = new Set();
        const riskOrder = { High: 0, Medium: 1, Low: 2 };
        const totalClauses = substantiveClauses.length;
        let nextIndex = 0;
        let visibleCount = 0;

        const maybePublishAnalysis = (analysis) => {
          const shouldShow = analysis.risk_level !== 'Low' || (analysis.negotiation && analysis.negotiation.trim());
          if (!shouldShow) return;

          const key = (analysis.clause_text ?? '').slice(0, 100).toLowerCase();
          if (seen.has(key)) return;

          seen.add(key);
          visibleCount += 1;

          if (cancelled) return;

          setResults((previous) => {
            const existing = Array.isArray(previous) ? previous : [];
            return [...existing, analysis].sort((a, b) => riskOrder[a.risk_level] - riskOrder[b.risk_level]);
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
          setAnalysisError(error.message || 'Failed to complete analysis.');
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
  }, [analyzeCopilotClause, copilotModel, isCopilotAuthenticated, isCopilotConfigured, pdf.status, pdf.text]);

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

  const handleFileChange = (event) => {
    handleFileSelect(event.target.files[0]);
    event.target.value = '';
  };

  const triggerFilePicker = () => {
    if (pdf.status === 'extracting') return;
    inputRef.current?.click();
  };

  const handleSignOutClick = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    try {
      if (typeof onSignOut === 'function') {
        await onSignOut();
      } else {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
        });
        window.location.reload();
      }
    } catch (error) {
      console.error('Sign out failed:', error);
      setIsSigningOut(false);
    }
  };

  const handleBrandClick = () => {
    if (typeof onBackToLanding === 'function') {
      onBackToLanding();
    }
  };

  const riskCounts = useMemo(() => {
    if (!Array.isArray(results) || results.length === 0) {
      return { high: 0, medium: 0, low: 0 };
    }

    return {
      high: results.filter((result) => result.risk_level === 'High').length,
      medium: results.filter((result) => result.risk_level === 'Medium').length,
      low: results.filter((result) => result.risk_level === 'Low').length,
    };
  }, [results]);

  const keyInsights = useMemo(() => buildDocumentInsights(pdf.text), [pdf.text]);

  const hasUploadedFile = Boolean(selectedFile);
  const hasResults = Array.isArray(results) && results.length > 0;
  const isExtracting = pdf.status === 'extracting';
  const isPdfDone = pdf.status === 'done';

  const renderUploadBox = () => (
    <div
      className={`upload-dropzone ${isDraggingUpload ? 'upload-dropzone--dragging' : ''}`}
      onClick={triggerFilePicker}
      onDrop={(event) => {
        event.preventDefault();
        setIsDraggingUpload(false);
        handleFileSelect(event.dataTransfer.files[0]);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!isDraggingUpload) {
          setIsDraggingUpload(true);
        }
      }}
      onDragLeave={() => setIsDraggingUpload(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          triggerFilePicker();
        }
      }}
      aria-label="Upload contract"
    >
      <div className="upload-dropzone__icon" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 16V4" />
          <path d="M7 9l5-5 5 5" />
          <path d="M20 16.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3.5" />
        </svg>
      </div>

      <h3 className="upload-dropzone__title">Drop your contract here</h3>
      <p className="upload-dropzone__subtitle">or click to browse files</p>
      <p className="upload-dropzone__support">Supports PDF up to 10MB</p>
    </div>
  );

  const renderCopilotAuthCard = () => (
    <section className="copilot-auth-card">
      <div className="copilot-auth-card__header">
        <h2 className="copilot-auth-card__title">GitHub Copilot</h2>
        <span className={`copilot-auth-card__state ${isCopilotAuthenticated ? 'copilot-auth-card__state--ok' : ''}`}>
          {isCopilotAuthenticated ? 'Connected' : 'Not Connected'}
        </span>
      </div>

      <label className="copilot-auth-card__label" htmlFor="copilot-model-input">Model</label>
      <input
        id="copilot-model-input"
        className="copilot-auth-card__input"
        type="text"
        value={copilotModel}
        onChange={(event) => setCopilotModel(event.target.value)}
        placeholder={DEFAULT_COPILOT_MODEL}
      />

      {isCopilotAuthenticated ? (
        <div className="copilot-auth-card__row">
          <p className="copilot-auth-card__text">Authenticated for this browser session.</p>
          <button
            type="button"
            className="copilot-auth-card__btn copilot-auth-card__btn--secondary"
            onClick={disconnectCopilot}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="copilot-auth-card__btn"
          onClick={startCopilotAuth}
          disabled={!isCopilotConfigured || isCopilotAuthorizing}
        >
          {isCopilotAuthorizing ? 'Waiting for GitHub...' : 'Connect GitHub Copilot'}
        </button>
      )}

      {copilotDeviceAuth.status === 'waiting' && (
        <div className="copilot-auth-device">
          <span className="copilot-auth-device__label">Enter this code on GitHub</span>
          <span className="copilot-auth-device__code">{copilotDeviceAuth.userCode}</span>
          <a
            className="copilot-auth-device__link"
            href={copilotDeviceAuth.verificationUri}
            target="_blank"
            rel="noreferrer"
          >
            Open github.com/login/device
          </a>
        </div>
      )}

      {copilotConfigurationError && (
        <p className="copilot-auth-card__error">{copilotConfigurationError}</p>
      )}

      {copilotDeviceAuth.error && (
        <p className="copilot-auth-card__error">{copilotDeviceAuth.error}</p>
      )}

      {!isCopilotAuthenticated && !copilotConfigurationError && (
        <p className="copilot-auth-card__hint">You can still upload and review with fallback analysis if not connected.</p>
      )}
    </section>
  );

  return (
    <div className="workspace-page">
      <aside className="workspace-sidebar">
        <div className="workspace-brand">
          <button type="button" className="workspace-brand__name" onClick={handleBrandClick}>
            ClauseIQ
          </button>
        </div>

        <div className="workspace-menu">
          <button type="button" className="workspace-menu__item workspace-menu__item--active">Workspace</button>
          <button type="button" className="workspace-menu__item">History</button>
        </div>

        <div className="workspace-sidebar__spacer" />

        <div className="workspace-menu workspace-menu--footer">
          <button type="button" className="workspace-menu__item">Settings</button>
          <button
            type="button"
            className="workspace-menu__item"
            onClick={handleSignOutClick}
            disabled={isSigningOut}
          >
            {isSigningOut ? 'Signing Out...' : 'Sign Out'}
          </button>
        </div>
      </aside>

      <main className={`workspace-content ${hasUploadedFile ? 'workspace-content--uploaded' : ''}`}>
        {!hasUploadedFile ? (
          <section className="workspace-upload-view">
            <header className="workspace-header">
              <h1 className="workspace-header__title">Contract Review</h1>
              <p className="workspace-header__subtitle">Upload your contract to get instant AI-powered analysis</p>
            </header>

            {renderUploadBox()}

            {pdf.error && (
              <div className="analysis-alert analysis-alert--error">
                <span>{pdf.error}</span>
              </div>
            )}

            {renderCopilotAuthCard()}
          </section>
        ) : (
          <>
            <section className="workspace-center-pane">
              <header className="workspace-header">
                <h1 className="workspace-header__title">Contract Review</h1>
                <p className="workspace-header__subtitle">Upload your contract to get instant AI-powered analysis</p>
              </header>

              <section className="file-summary-card">
                <div className="file-summary-card__head">
                  <div>
                    <h2 className="file-summary-card__name">{selectedFile?.name}</h2>
                    <p className="file-summary-card__meta">
                      {isExtracting
                        ? 'Extracting text...'
                        : (analyzing
                          ? `Analyzing clauses (${analysisProgress.processed}/${analysisProgress.total})`
                          : 'Analyzed just now')}
                    </p>
                  </div>
                </div>

                <div className="risk-count-grid">
                  <div className="risk-count risk-count--high">
                    <span className="risk-count__label">High Risk</span>
                    <strong className="risk-count__value">{riskCounts.high}</strong>
                  </div>

                  <div className="risk-count risk-count--medium">
                    <span className="risk-count__label">Medium Risk</span>
                    <strong className="risk-count__value">{riskCounts.medium}</strong>
                  </div>

                  <div className="risk-count risk-count--low">
                    <span className="risk-count__label">Low Risk</span>
                    <strong className="risk-count__value">{riskCounts.low}</strong>
                  </div>
                </div>
              </section>

              {pdf.error && <div className="analysis-alert analysis-alert--warning">{pdf.error}</div>}

              {analysisError && <div className="analysis-alert analysis-alert--error">Analysis error: {analysisError}</div>}

              {isExtracting && <div className="analysis-status">Extracting text from PDF...</div>}

              {analyzing && <div className="analysis-status">Analyzing contract for risk clauses...</div>}

              {hasResults && (
                <section className="risk-analysis-section">
                  <h2 className="risk-analysis-section__title">Risk Analysis</h2>
                  <div className="clauses-list">
                    {results.map((item, index) => (
                      <ClauseCard key={item._clauseId || `${item.clause_type}-${index}`} item={item} />
                    ))}
                  </div>
                </section>
              )}

              {isPdfDone && !analyzing && Array.isArray(results) && results.length === 0 && (
                <div className="no-issues-card">
                  <h3 className="no-issues-card__title">No Concerns Found</h3>
                  <p className="no-issues-card__text">No concerning clauses were identified in this contract.</p>
                </div>
              )}
            </section>

            <aside className="workspace-right-pane">
              <section className="insights-card">
                <h2 className="insights-card__title">Key Insights</h2>

                {isExtracting && (
                  <p className="insights-card__empty">Key insights will appear once extraction finishes.</p>
                )}

                {isPdfDone && keyInsights.length === 0 && (
                  <p className="insights-card__empty">No key insights could be generated from this document.</p>
                )}

                {keyInsights.length > 0 && (
                  <div className="insights-list">
                    {keyInsights.map((insight, index) => (
                      <InsightItem key={`${insight.title}-${index}`} insight={insight} />
                    ))}
                  </div>
                )}
              </section>
            </aside>
          </>
        )}
      </main>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}

function InsightItem({ insight }) {
  const [open, setOpen] = useState(false);

  return (
    <article className={`insight-item ${open ? 'insight-item--open' : ''}`}>
      <button type="button" className="insight-item__trigger" onClick={() => setOpen((value) => !value)}>
        <div className="insight-item__heading">
          <span className="insight-item__initials">{insight.initials}</span>
          <h3 className="insight-item__title">{insight.title}</h3>
        </div>
        <span className="insight-item__chevron">{open ? '▼' : '▶'}</span>
      </button>

      {open && <p className="insight-item__detail">{insight.detail}</p>}
    </article>
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
        type="button"
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
