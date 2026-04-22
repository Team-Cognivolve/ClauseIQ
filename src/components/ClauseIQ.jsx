import React, { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
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
const FREELANCER_RESIDENCE_STORAGE_KEY = 'clauseiq_freelancer_residence';
const JURISDICTION_ENABLED_STORAGE_KEY = 'clauseiq_use_jurisdiction';
const HISTORY_STORAGE_KEY = 'clauseiq_analysis_history_v1';
const HISTORY_LIMIT = 50;
const MENU_VIEW = {
  WORKSPACE: 'workspace',
  HISTORY: 'history',
  HISTORY_DETAIL: 'history-detail',
};
const HISTORY_RISK_FILTERS = ['All', 'High', 'Medium', 'Low'];

function createInitialJurisdictionStatus() {
  return {
    status: 'idle',
    triggered: false,
    contextId: '',
    message: 'Jurisdiction scout has not run for this contract yet.',
  };
}

function readSessionValue(key, fallback = '') {
  if (typeof window === 'undefined') return fallback;
  return window.sessionStorage.getItem(key) || fallback;
}

function readSessionBoolean(key, fallback = false) {
  if (typeof window === 'undefined') return fallback;

  const stored = window.sessionStorage.getItem(key);
  if (stored === null) return fallback;
  return stored === 'true';
}

async function fetchHistoryFromServer() {
  const response = await fetch('/api/history', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to load history from server.');
  }

  const payload = await response.json().catch(() => null);
  return Array.isArray(payload?.entries) ? payload.entries : [];
}

async function saveHistoryToServer(entry) {
  const response = await fetch('/api/history', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ entry }),
  });

  if (!response.ok) {
    throw new Error('Failed to save history to server.');
  }
}

function getHistoryUserKey(userId) {
  return userId ? `user:${userId}` : 'user:anonymous';
}

function readHistoryEntries(userId) {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return [];
    const entries = parsed[getHistoryUserKey(userId)];
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function writeHistoryEntries(userId, entries) {
  if (typeof window === 'undefined') return;

  let parsed = {};
  try {
    parsed = JSON.parse(window.localStorage.getItem(HISTORY_STORAGE_KEY) || '{}');
  } catch {
    parsed = {};
  }

  parsed[getHistoryUserKey(userId)] = entries;
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(parsed));
}

function getOverallRisk(summary) {
  if ((summary?.high || 0) > 0) return 'High';
  if ((summary?.medium || 0) > 0) return 'Medium';
  return 'Low';
}

function formatRelativeTime(isoTime) {
  const ts = new Date(isoTime).getTime();
  if (!Number.isFinite(ts)) return 'Unknown';

  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes <= 0) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;

  return new Date(isoTime).toLocaleDateString();
}

function buildReportFileName(fileName) {
  const normalizedBaseName = String(fileName || 'contract')
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return `${normalizedBaseName || 'contract'}-analysis-report.pdf`;
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

export function ClauseIQ({ onSignOut, onBackToLanding, user }) {
  const pdf = usePDFExtractor();
  const githubCopilot = useGitHubCopilot();
  const {
    analyzeClause: analyzeCopilotClause,
    prepareJurisdictionContext,
    configurationError: copilotConfigurationError,
    isAuthenticated: isCopilotAuthenticated,
    isAuthorizing: isCopilotAuthorizing,
    isConfigured: isCopilotConfigured,
    deviceAuth: copilotDeviceAuth,
    startAuth: startCopilotAuth,
    disconnect: disconnectCopilot,
  } = githubCopilot;

  const [copilotModel, setCopilotModel] = useState(() => readSessionValue(COPILOT_MODEL_STORAGE_KEY, DEFAULT_COPILOT_MODEL));
  const [freelancerResidence, setFreelancerResidence] = useState(() => readSessionValue(FREELANCER_RESIDENCE_STORAGE_KEY, ''));
  const [isJurisdictionEnabled, setIsJurisdictionEnabled] = useState(() => readSessionBoolean(JURISDICTION_ENABLED_STORAGE_KEY, true));
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ processed: 0, total: 0 });
  const [analysisError, setAnalysisError] = useState(null);
  const [jurisdictionStatus, setJurisdictionStatus] = useState(() => createInitialJurisdictionStatus());
  const [results, setResults] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [activeView, setActiveView] = useState(MENU_VIEW.WORKSPACE);
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyRiskFilter, setHistoryRiskFilter] = useState('All');
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const inputRef = useRef(null);
  const didAnalyse = useRef(false);
  const activeRunId = useRef(0);
  const savedRunId = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(COPILOT_MODEL_STORAGE_KEY, copilotModel);
  }, [copilotModel]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(FREELANCER_RESIDENCE_STORAGE_KEY, freelancerResidence);
  }, [freelancerResidence]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(JURISDICTION_ENABLED_STORAGE_KEY, String(isJurisdictionEnabled));
  }, [isJurisdictionEnabled]);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      const localEntries = readHistoryEntries(user?.id);

      try {
        const serverEntries = await fetchHistoryFromServer();
        if (cancelled) return;
        setAnalysisHistory(serverEntries);
        setSelectedHistoryId(serverEntries[0]?.id || null);
      } catch {
        if (cancelled) return;
        setAnalysisHistory(localEntries);
        setSelectedHistoryId(localEntries[0]?.id || null);
      } finally {
        if (!cancelled) {
          setHistoryReady(true);
        }
      }
    };

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!historyReady) return;
    writeHistoryEntries(user?.id, analysisHistory);
  }, [analysisHistory, historyReady, user?.id]);

  useEffect(() => {
    didAnalyse.current = false;
    if (pdf.status === 'done') {
      setResults(null);
      setAnalysisError(null);
      setJurisdictionStatus(createInitialJurisdictionStatus());
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
        const shouldRunJurisdictionScout = canUseCopilot && isJurisdictionEnabled;
        let jurisdictionContextId = '';

        if (shouldRunJurisdictionScout) {
          if (!cancelled) {
            setJurisdictionStatus({
              status: 'running',
              triggered: false,
              contextId: '',
              message: 'Jurisdiction scout is checking governing law and freelancer residence.',
            });
          }

          try {
            const scout = await prepareJurisdictionContext({
              contractText: pdf.text,
              freelancerResidence,
              modelName: copilotModel.trim(),
              useJurisdiction: true,
            });

            jurisdictionContextId = String(scout?.contextId || '').trim();

            if (!cancelled) {
              setJurisdictionStatus({
                status: scout?.triggered ? 'triggered' : 'skipped',
                triggered: Boolean(scout?.triggered),
                contextId: jurisdictionContextId,
                message: scout?.message || (scout?.triggered
                  ? 'Jurisdiction scout triggered for cross-border review.'
                  : 'Jurisdiction scout skipped for this contract.'),
              });
            }
          } catch (error) {
            if (!cancelled) {
              setJurisdictionStatus({
                status: 'error',
                triggered: false,
                contextId: '',
                message: error.message || 'Jurisdiction scout failed. Continuing with standard analysis.',
              });
            }
          }
        } else if (!cancelled) {
          if (!isJurisdictionEnabled) {
            setJurisdictionStatus({
              status: 'skipped',
              triggered: false,
              contextId: '',
              message: 'Jurisdiction scout is disabled. Running standard clause analysis workflow.',
            });
          } else {
            setJurisdictionStatus({
              status: 'skipped',
              triggered: false,
              contextId: '',
              message: 'Jurisdiction scout skipped because GitHub Copilot is not connected.',
            });
          }
        }

        const processClause = async (clause, index) => {
          const patternResult = detectRiskByPattern(clause.cleanText || clause.text);

          if (canUseCopilot) {
            try {
              const apiResponse = await analyzeCopilotClause(clause, copilotModel.trim(), {
                jurisdictionContextId,
              });
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
  }, [
    analyzeCopilotClause,
    copilotModel,
    freelancerResidence,
    isJurisdictionEnabled,
    isCopilotAuthenticated,
    isCopilotConfigured,
    pdf.status,
    pdf.text,
    prepareJurisdictionContext,
  ]);

  const handleFileSelect = (file) => {
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Only PDF files are accepted.');
      return;
    }

    didAnalyse.current = false;
    activeRunId.current += 1;
    savedRunId.current = null;
    setResults(null);
    setAnalysisError(null);
    setJurisdictionStatus(createInitialJurisdictionStatus());
    setSelectedFile(file);
    setActiveView(MENU_VIEW.WORKSPACE);
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

  const handleDownloadReport = () => {
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 42;
      const contentWidth = pageWidth - (margin * 2);
      let cursorY = margin;

      const writeBlock = (text, options = {}) => {
        const {
          fontSize = 11,
          fontStyle = 'normal',
          lineHeight = 15,
          spacingAfter = 8,
        } = options;

        const normalizedText = String(text || '').trim();
        if (!normalizedText) return;

        doc.setFont('helvetica', fontStyle);
        doc.setFontSize(fontSize);

        const lines = doc.splitTextToSize(normalizedText, contentWidth);
        lines.forEach((line) => {
          if (cursorY + lineHeight > pageHeight - margin) {
            doc.addPage();
            cursorY = margin;
          }
          doc.text(line, margin, cursorY);
          cursorY += lineHeight;
        });

        cursorY += spacingAfter;
      };

      const reportTime = new Date().toLocaleString();
      writeBlock('ClauseIQ Contract Analysis Report', {
        fontSize: 19,
        fontStyle: 'bold',
        lineHeight: 23,
        spacingAfter: 10,
      });
      writeBlock(`Contract: ${selectedFile?.name || 'Uploaded contract'}`, { fontStyle: 'bold', spacingAfter: 4 });
      writeBlock(`Generated: ${reportTime}`, { spacingAfter: 14 });

      writeBlock('Risk Summary', {
        fontSize: 15,
        fontStyle: 'bold',
        lineHeight: 19,
        spacingAfter: 6,
      });
      writeBlock(`High Risk: ${riskCounts.high}`, { spacingAfter: 3 });
      writeBlock(`Medium Risk: ${riskCounts.medium}`, { spacingAfter: 3 });
      writeBlock(`Low Risk: ${riskCounts.low}`, { spacingAfter: 14 });

      writeBlock('Key Insights', {
        fontSize: 15,
        fontStyle: 'bold',
        lineHeight: 19,
        spacingAfter: 6,
      });
      if (keyInsights.length === 0) {
        writeBlock('No key insights were generated for this document.', { spacingAfter: 12 });
      } else {
        keyInsights.forEach((insight, index) => {
          writeBlock(`${index + 1}. ${insight.title}`, { fontStyle: 'bold', spacingAfter: 3 });
          writeBlock(insight.detail, { spacingAfter: 10 });
        });
      }

      writeBlock('Risk Analysis', {
        fontSize: 15,
        fontStyle: 'bold',
        lineHeight: 19,
        spacingAfter: 6,
      });
      if (!Array.isArray(results) || results.length === 0) {
        writeBlock('No concerning clauses were identified in this contract.', { spacingAfter: 0 });
      } else {
        results.forEach((item, index) => {
          writeBlock(`${index + 1}. ${item.clause_type || 'General Clause'} (${item.risk_level || 'Medium'} Risk)`, {
            fontStyle: 'bold',
            spacingAfter: 3,
          });
          writeBlock(`Explanation: ${item.explanation || 'Not available.'}`, { spacingAfter: 3 });
          if (item.negotiation?.trim()) {
            writeBlock(`Negotiation: ${item.negotiation}`, { spacingAfter: 3 });
          }
          writeBlock(`Clause: ${item.clause_text || 'Not available.'}`, { spacingAfter: 10 });
        });
      }

      doc.save(buildReportFileName(selectedFile?.name));
    } catch (error) {
      console.error('Failed to generate report PDF:', error);
      alert('Unable to generate the report PDF. Please try again.');
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
  const canDownloadReport = isPdfDone && !analyzing && Boolean(selectedFile) && Array.isArray(results);

  useEffect(() => {
    const canSave =
      isPdfDone &&
      !analyzing &&
      Boolean(selectedFile) &&
      Array.isArray(results);

    if (!canSave) return;

    const runId = activeRunId.current;
    if (!runId || savedRunId.current === runId) return;

    const safeResults = results.map((item, index) => ({
      _clauseId: item?._clauseId || `${runId}-${index}`,
      clause_type: String(item?.clause_type || 'General Clause'),
      clause_text: String(item?.clause_text || ''),
      explanation: String(item?.explanation || ''),
      negotiation: String(item?.negotiation || ''),
      risk_level: ['High', 'Medium', 'Low'].includes(item?.risk_level) ? item.risk_level : 'Medium',
    }));

    const summary = {
      high: safeResults.filter((result) => result.risk_level === 'High').length,
      medium: safeResults.filter((result) => result.risk_level === 'Medium').length,
      low: safeResults.filter((result) => result.risk_level === 'Low').length,
    };

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fileName: selectedFile.name,
      analyzedAt: new Date().toISOString(),
      summary: {
        ...summary,
        overallRisk: getOverallRisk(summary),
      },
      results: safeResults,
      insights: keyInsights,
    };

    setAnalysisHistory((previous) => [entry, ...previous].slice(0, HISTORY_LIMIT));
    setSelectedHistoryId(entry.id);
    savedRunId.current = runId;

    saveHistoryToServer(entry).catch((error) => {
      console.error('Failed to persist history entry to server:', error);
    });
  }, [analyzing, isPdfDone, keyInsights, results, selectedFile]);

  const analyzedHistory = useMemo(
    () => analysisHistory.filter((item) => Array.isArray(item?.results)),
    [analysisHistory],
  );

  const historyStats = useMemo(() => ({
    total: analyzedHistory.length,
    high: analyzedHistory.filter((item) => item.summary?.overallRisk === 'High').length,
    medium: analyzedHistory.filter((item) => item.summary?.overallRisk === 'Medium').length,
    low: analyzedHistory.filter((item) => item.summary?.overallRisk === 'Low').length,
  }), [analyzedHistory]);

  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    return analyzedHistory.filter((item) => {
      const matchesQuery = !query || String(item.fileName || '').toLowerCase().includes(query);
      const matchesRisk = historyRiskFilter === 'All' || item.summary?.overallRisk === historyRiskFilter;
      return matchesQuery && matchesRisk;
    });
  }, [analyzedHistory, historyRiskFilter, historySearch]);

  useEffect(() => {
    if (filteredHistory.length === 0) {
      setSelectedHistoryId(null);
      return;
    }
    if (!filteredHistory.some((item) => item.id === selectedHistoryId)) {
      setSelectedHistoryId(filteredHistory[0].id);
    }
  }, [filteredHistory, selectedHistoryId]);

  const selectedHistoryEntry = useMemo(
    () => analyzedHistory.find((item) => item.id === selectedHistoryId) || null,
    [analyzedHistory, selectedHistoryId],
  );

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

      <label className="copilot-auth-card__label" htmlFor="freelancer-residence-input">Freelancer Residence</label>
      <div className="copilot-auth-card__residence-row">
        <input
          id="freelancer-residence-input"
          className="copilot-auth-card__input"
          type="text"
          value={freelancerResidence}
          onChange={(event) => setFreelancerResidence(event.target.value)}
          placeholder="e.g. India, Singapore, California, USA"
        />

        <label className="copilot-auth-card__toggle" htmlFor="jurisdiction-toggle-input">
          <input
            id="jurisdiction-toggle-input"
            type="checkbox"
            checked={isJurisdictionEnabled}
            onChange={(event) => setIsJurisdictionEnabled(event.target.checked)}
          />
          <span>Use Jurisdiction</span>
        </label>
      </div>

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

  const renderHistoryView = () => (
    <section className="workspace-history-view">
      <header className="workspace-header">
        <h1 className="workspace-header__title">Review History</h1>
        <p className="workspace-header__subtitle">Access your previous contract reviews and reopen the full analysis</p>
      </header>

      <section className="history-stats-grid">
        <article className="history-stat-card">
          <p className="history-stat-card__label">Total Reviews</p>
          <p className="history-stat-card__value">{historyStats.total}</p>
        </article>
        <article className="history-stat-card history-stat-card--high">
          <p className="history-stat-card__label">High Risk</p>
          <p className="history-stat-card__value">{historyStats.high}</p>
        </article>
        <article className="history-stat-card history-stat-card--medium">
          <p className="history-stat-card__label">Medium Risk</p>
          <p className="history-stat-card__value">{historyStats.medium}</p>
        </article>
        <article className="history-stat-card history-stat-card--low">
          <p className="history-stat-card__label">Low Risk</p>
          <p className="history-stat-card__value">{historyStats.low}</p>
        </article>
      </section>

      <section className="history-toolbar">
        <input
          type="search"
          className="history-toolbar__search"
          placeholder="Search contracts..."
          value={historySearch}
          onChange={(event) => setHistorySearch(event.target.value)}
        />
        <div className="history-toolbar__filters">
          {HISTORY_RISK_FILTERS.map((filter) => (
            <button
              type="button"
              key={filter}
              className={`history-filter-btn ${historyRiskFilter === filter ? 'history-filter-btn--active' : ''}`}
              onClick={() => setHistoryRiskFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
      </section>

      {filteredHistory.length === 0 ? (
        <div className="no-issues-card">
          <h3 className="no-issues-card__title">No Reviews Yet</h3>
          <p className="no-issues-card__text">Analyze a PDF from Workspace to build your review history.</p>
        </div>
      ) : (
        <div className="history-list">
          {filteredHistory.map((entry) => (
            <button
              type="button"
              key={entry.id}
              className={`history-item ${selectedHistoryId === entry.id ? 'history-item--active' : ''}`}
              onClick={() => {
                setSelectedHistoryId(entry.id);
                setActiveView(MENU_VIEW.HISTORY_DETAIL);
              }}
            >
              <div className="history-item__main">
                <p className="history-item__name">{entry.fileName}</p>
                <div className="history-item__meta">
                  <span className="history-item__time">{formatRelativeTime(entry.analyzedAt)}</span>
                  <span className={`history-item__risk history-item__risk--${String(entry.summary?.overallRisk || 'Low').toLowerCase()}`}>
                    {entry.summary?.overallRisk || 'Low'} Risk
                  </span>
                </div>
                <div className="history-item__counts">
                  <span className="history-item__count history-item__count--high">H {entry.summary?.high || 0}</span>
                  <span className="history-item__count history-item__count--medium">M {entry.summary?.medium || 0}</span>
                  <span className="history-item__count history-item__count--low">L {entry.summary?.low || 0}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

    </section>
  );

  const renderHistoryDetailView = () => {
    if (!selectedHistoryEntry) {
      return (
        <section className="workspace-history-view">
          <header className="workspace-header">
            <h1 className="workspace-header__title">Review Details</h1>
            <p className="workspace-header__subtitle">The selected analysis could not be found.</p>
          </header>
          <button type="button" className="history-detail__back" onClick={() => setActiveView(MENU_VIEW.HISTORY)}>
            Back to History
          </button>
        </section>
      );
    }

    return (
      <section className="workspace-history-view history-detail-page">
        <header className="workspace-header">
          <h1 className="workspace-header__title">Review Details</h1>
          <p className="workspace-header__subtitle">Clause-level analysis for this contract</p>
        </header>

        <button type="button" className="history-detail__back" onClick={() => setActiveView(MENU_VIEW.HISTORY)}>
          Back to History
        </button>

        <section className="file-summary-card">
          <div className="file-summary-card__head">
            <div>
              <h2 className="file-summary-card__name">{selectedHistoryEntry.fileName}</h2>
              <p className="file-summary-card__meta">Analyzed {formatRelativeTime(selectedHistoryEntry.analyzedAt)}</p>
            </div>
          </div>

          <div className="risk-count-grid">
            <div className="risk-count risk-count--high">
              <span className="risk-count__label">High Risk</span>
              <strong className="risk-count__value">{selectedHistoryEntry.summary?.high || 0}</strong>
            </div>
            <div className="risk-count risk-count--medium">
              <span className="risk-count__label">Medium Risk</span>
              <strong className="risk-count__value">{selectedHistoryEntry.summary?.medium || 0}</strong>
            </div>
            <div className="risk-count risk-count--low">
              <span className="risk-count__label">Low Risk</span>
              <strong className="risk-count__value">{selectedHistoryEntry.summary?.low || 0}</strong>
            </div>
          </div>
        </section>

        {Array.isArray(selectedHistoryEntry.results) && selectedHistoryEntry.results.length > 0 ? (
          <section className="risk-analysis-section">
            <h2 className="risk-analysis-section__title">Risk Analysis</h2>
            <div className="clauses-list">
              {selectedHistoryEntry.results.map((item, index) => (
                <ClauseCard key={item._clauseId || `${item.clause_type}-${index}`} item={item} />
              ))}
            </div>
          </section>
        ) : (
          <div className="no-issues-card">
            <h3 className="no-issues-card__title">No Concerns Found</h3>
            <p className="no-issues-card__text">No concerning clauses were identified in this contract.</p>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="workspace-page">
      <aside className="workspace-sidebar">
        <div className="workspace-brand">
          <button type="button" className="workspace-brand__name" onClick={handleBrandClick}>
            ClauseIQ
          </button>
        </div>

        <div className="workspace-menu">
          <button
            type="button"
            className={`workspace-menu__item ${activeView === MENU_VIEW.WORKSPACE ? 'workspace-menu__item--active' : ''}`}
            onClick={() => setActiveView(MENU_VIEW.WORKSPACE)}
          >
            Workspace
          </button>
          <button
            type="button"
            className={`workspace-menu__item ${[MENU_VIEW.HISTORY, MENU_VIEW.HISTORY_DETAIL].includes(activeView) ? 'workspace-menu__item--active' : ''}`}
            onClick={() => setActiveView(MENU_VIEW.HISTORY)}
          >
            History
          </button>
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

      <main className={`workspace-content ${activeView === MENU_VIEW.WORKSPACE && hasUploadedFile ? 'workspace-content--uploaded' : ''}`}>
        {activeView === MENU_VIEW.HISTORY ? renderHistoryView() : activeView === MENU_VIEW.HISTORY_DETAIL ? renderHistoryDetailView() : !hasUploadedFile ? (
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

              {jurisdictionStatus.status !== 'idle' && (
                <div className={`jurisdiction-banner jurisdiction-banner--${jurisdictionStatus.status}`}>
                  <p className="jurisdiction-banner__title">Jurisdiction Scout</p>
                  <p className="jurisdiction-banner__text">{jurisdictionStatus.message}</p>
                </div>
              )}

              {isExtracting && <div className="analysis-status">Extracting text from PDF...</div>}

              {analyzing && (
                <div className="analysis-status">
                  Analyzing contract for risk clauses... ({analysisProgress.processed}/{analysisProgress.total})
                </div>
              )}

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

                {canDownloadReport && (
                  <button
                    type="button"
                    className="insights-card__download-btn"
                    onClick={handleDownloadReport}
                  >
                    Download Report (PDF)
                  </button>
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
