import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { b2bApi } from '../api/b2bClient';
import { useGitHubCopilot } from '../hooks/useGitHubCopilot';
import chatbotIcon from '../assets/chatbot.png';
import './B2BWorkspace.css';

const POLICY_TYPES = ['freelancers', 'employees', 'vendors'];
const COPILOT_MODEL_STORAGE_KEY = 'clauseiq_github_copilot_model';

function readStoredModel() {
  if (typeof window === 'undefined') return 'gpt-4.1';
  return window.sessionStorage.getItem(COPILOT_MODEL_STORAGE_KEY) || 'gpt-4.1';
}

function b2bUserLabel(user) {
  const company = String(user?.companyName || '').trim();
  const email = String(user?.email || '').trim();
  return company || email || 'B2B Workspace';
}

export function B2BWorkspace({ user, onSignOut }) {
  const copilot = useGitHubCopilot();
  const [model, setModel] = useState(() => readStoredModel());
  const [activeTab, setActiveTab] = useState('home');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  const [profile, setProfile] = useState({ companyName: '', industry: '', defaultPolicyNotes: '' });
  const [policies, setPolicies] = useState({ freelancers: [], employees: [], vendors: [] });
  const [policyType, setPolicyType] = useState('freelancers');
  const [policyFile, setPolicyFile] = useState(null);
  const [isPolicyDragActive, setIsPolicyDragActive] = useState(false);

  const [contractFile, setContractFile] = useState(null);
  const [isContractDragActive, setIsContractDragActive] = useState(false);
  const [reviewType, setReviewType] = useState('freelancers');
  const [currentReview, setCurrentReview] = useState(null);
  const [selectedClauseId, setSelectedClauseId] = useState('');

  const [reviews, setReviews] = useState([]);
  const [selectedReviewId, setSelectedReviewId] = useState('');
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatLog, setChatLog] = useState([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);

  const copilotReady = copilot.isConfigured && copilot.isAuthenticated && Boolean(model.trim());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(COPILOT_MODEL_STORAGE_KEY, model);
  }, [model]);

  const selectedClause = useMemo(() => {
    const clauses = currentReview?.contractSketch?.clauses || [];
    return clauses.find((item) => item.id === selectedClauseId) || clauses[0] || null;
  }, [currentReview, selectedClauseId]);

  const clauseAssessment = useMemo(() => {
    const all = currentReview?.analysis?.clauseAssessments || [];
    if (!selectedClause) return null;
    return all.find((item) => item.clauseId === selectedClause.id) || null;
  }, [currentReview, selectedClause]);

  const clauseViolations = useMemo(() => {
    const all = currentReview?.analysis?.violations || [];
    if (!selectedClause) return [];
    return all.filter((item) => item.clauseId === selectedClause.id);
  }, [currentReview, selectedClause]);

  const loadProfileAndPolicies = useCallback(async () => {
    try {
      const [profileRes, policyRes] = await Promise.all([b2bApi.getProfile(), b2bApi.listPolicies()]);
      setProfile(profileRes.profile || { companyName: '', industry: '', defaultPolicyNotes: '' });
      setPolicies(policyRes.policies || { freelancers: [], employees: [], vendors: [] });
    } catch (loadError) {
      setError(loadError.message || 'Failed to load b2b workspace data.');
    }
  }, []);

  const loadReviews = useCallback(async () => {
    try {
      const response = await b2bApi.listReviews();
      setReviews(response.reviews || []);
      if (!selectedReviewId && response.reviews?.[0]?.id) {
        setSelectedReviewId(response.reviews[0].id);
      }
    } catch (loadError) {
      setError(loadError.message || 'Failed to load reviews.');
    }
  }, [selectedReviewId]);

  useEffect(() => {
    loadProfileAndPolicies();
    loadReviews();
  }, [loadProfileAndPolicies, loadReviews]);

  useEffect(() => {
    async function loadReviewDetails() {
      if (!selectedReviewId) return;
      try {
        const response = await b2bApi.getReview(selectedReviewId);
        setCurrentReview(response.review || null);
        setSelectedClauseId(response.review?.contractSketch?.clauses?.[0]?.id || '');
      } catch (reviewError) {
        setError(reviewError.message || 'Failed to load review details.');
      }
    }

    loadReviewDetails();
  }, [selectedReviewId]);

  useEffect(() => {
    if (status !== 'Review completed.') return undefined;

    const timeoutId = setTimeout(() => {
      setStatus((current) => (current === 'Review completed.' ? '' : current));
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [status]);

  useEffect(() => {
    if (!isAnalyzing) return undefined;

    const intervalId = setInterval(() => {
      setAnalysisProgress((current) => {
        if (current >= 92) return 92;
        const nextStep = Math.max(1, Math.round((96 - current) / 8));
        return Math.min(92, current + nextStep);
      });
    }, 320);

    return () => clearInterval(intervalId);
  }, [isAnalyzing]);

  async function handleSaveProfile(event) {
    event.preventDefault();
    setStatus('Saving profile...');
    setError('');

    try {
      const response = await b2bApi.saveProfile(profile);
      setProfile(response.profile || profile);
      setStatus('Profile updated.');
    } catch (saveError) {
      setStatus('');
      setError(saveError.message || 'Failed to save profile.');
    }
  }

  async function handlePolicyUpload(event) {
    event.preventDefault();
    if (!policyFile) {
      setError('Choose a policy PDF first.');
      return;
    }

    setStatus('Uploading policy...');
    setError('');

    try {
      const formData = new FormData();
      formData.append('policyType', policyType);
      formData.append('policyPdf', policyFile);
      await b2bApi.uploadPolicy(formData);
      setPolicyFile(null);
      setStatus('Policy uploaded and indexed in MongoDB.');
      await loadProfileAndPolicies();
    } catch (uploadError) {
      setStatus('');
      setError(uploadError.message || 'Policy upload failed.');
    }
  }

  function handlePolicyFileChange(event) {
    const nextFile = event.target.files?.[0] || null;
    setPolicyFile(nextFile);
  }

  function handlePolicyDrop(event) {
    event.preventDefault();
    setIsPolicyDragActive(false);
    const nextFile = event.dataTransfer?.files?.[0] || null;
    if (nextFile) {
      setPolicyFile(nextFile);
    }
  }

  function handleContractFileChange(event) {
    const nextFile = event.target.files?.[0] || null;
    setContractFile(nextFile);
  }

  function handleContractDrop(event) {
    event.preventDefault();
    setIsContractDragActive(false);
    const nextFile = event.dataTransfer?.files?.[0] || null;
    if (nextFile) {
      setContractFile(nextFile);
    }
  }

  async function handleAnalyzeContract(event) {
    event.preventDefault();
    if (!contractFile) {
      setError('Choose a contract PDF first.');
      return;
    }

    if (!copilotReady) {
      setError('Connect GitHub Copilot and set a model before running B2B analysis.');
      return;
    }

    setStatus('Running policy-compliance review...');
    setError('');
    setIsAnalyzing(true);
    setAnalysisProgress(10);

    try {
      const formData = new FormData();
      formData.append('policyType', reviewType);
      formData.append('contractPdf', contractFile);
      formData.append('accessToken', copilot.accessToken);
      formData.append('model', model.trim());

      const response = await b2bApi.uploadContract(formData, {
        accessToken: copilot.accessToken,
        model: model.trim(),
      });

      const review = response.review;
      setCurrentReview(review);
      setSelectedReviewId(review?.id || '');
      setSelectedClauseId(review?.contractSketch?.clauses?.[0]?.id || '');
      setAnalysisProgress(100);
      setStatus('Review completed.');
      await loadReviews();
      setActiveTab('review');
      setTimeout(() => {
        setIsAnalyzing(false);
        setAnalysisProgress(0);
      }, 500);
    } catch (analysisError) {
      setIsAnalyzing(false);
      setAnalysisProgress(0);
      setStatus('');
      setError(analysisError.message || 'Contract analysis failed.');
    }
  }

  async function handleAskQuestion(event) {
    event.preventDefault();
    const targetReviewId = selectedReviewId || currentReview?.id || reviews?.[0]?.id || '';
    if (!targetReviewId || !chatQuestion.trim()) return;

    if (!copilotReady) {
      setError('Connect GitHub Copilot before asking follow-up questions.');
      return;
    }

    const userText = chatQuestion.trim();
    setChatQuestion('');
    setChatLog((prev) => [...prev, { role: 'user', text: userText }]);
    setChatBusy(true);

    try {
      const response = await b2bApi.askQuestion({ reviewId: targetReviewId, question: userText }, {
        accessToken: copilot.accessToken,
        model: model.trim(),
      });
      setChatLog((prev) => [...prev, { role: 'assistant', text: response.answer, citations: response.citations || [] }]);
    } catch (chatError) {
      setError(chatError.message || 'Failed to ask question.');
    } finally {
      setChatBusy(false);
    }
  }

  async function handleSignOutClick() {
    if (isSigningOut || typeof onSignOut !== 'function') return;
    setIsSigningOut(true);
    try {
      await onSignOut();
    } catch {
      setIsSigningOut(false);
    }
  }

  function handleNewAnalysis() {
    setContractFile(null);
    setCurrentReview(null);
    setSelectedReviewId('');
    setSelectedClauseId('');
    setStatus('');
    setError('');
    setIsAnalyzing(false);
    setAnalysisProgress(0);
    setActiveTab('review');
  }

  const renderCopilotSettingsCard = () => (
    <article className="b2b-card b2b-settings-card">
      <div className="b2b-copilot-card__header">
        <h3>GitHub Copilot</h3>
        <span className={`b2b-copilot-state ${copilot.isAuthenticated ? 'b2b-copilot-state--ok' : ''}`}>
          {copilot.isAuthenticated ? 'Connected' : 'Not Connected'}
        </span>
      </div>

      <label className="b2b-copilot-label" htmlFor="b2b-copilot-model-input">Model</label>
      <input
        id="b2b-copilot-model-input"
        className="b2b-copilot-input"
        type="text"
        value={model}
        onChange={(event) => setModel(event.target.value)}
        placeholder="gpt-4.1"
      />

      {copilot.isAuthenticated ? (
        <div className="b2b-copilot-row">
          <p className="b2b-copilot-text">Authenticated for this browser session.</p>
          <button
            type="button"
            className="b2b-copilot-btn b2b-copilot-btn--secondary"
            onClick={copilot.disconnect}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="b2b-copilot-btn"
          onClick={copilot.startAuth}
          disabled={!copilot.isConfigured || copilot.isAuthorizing}
        >
          {copilot.isAuthorizing ? 'Waiting for GitHub...' : 'Connect GitHub Copilot'}
        </button>
      )}

      {copilot.deviceAuth.status === 'waiting' && (
        <div className="b2b-copilot-device">
          <span className="b2b-copilot-device__label">Enter this 8-digit code on GitHub</span>
          <span className="b2b-copilot-device__code">{copilot.deviceAuth.userCode}</span>
          <a
            className="b2b-copilot-device__link"
            href={copilot.deviceAuth.verificationUri}
            target="_blank"
            rel="noreferrer"
          >
            Open github.com/login/device
          </a>
        </div>
      )}

      {copilot.configurationError && (
        <p className="b2b-copilot-error">{copilot.configurationError}</p>
      )}

      {copilot.deviceAuth.error && (
        <p className="b2b-copilot-error">{copilot.deviceAuth.error}</p>
      )}

      {!copilot.isAuthenticated && !copilot.configurationError && (
        <p className="b2b-copilot-hint">You can still upload and review with fallback analysis if not connected.</p>
      )}
    </article>
  );

  return (
    <div className="b2b-shell">
      <aside className="b2b-toolbar">
        <div className="b2b-toolbar__brand">
          <button type="button" className="b2b-toolbar__brand-btn">
            ClauseIQ B2B
          </button>
        </div>

        <button type="button" className="b2b-toolbar__new-analysis" onClick={handleNewAnalysis}>
          + New Analysis
        </button>

        <div className="b2b-toolbar__tabs">
          <button type="button" className={activeTab === 'home' ? 'active' : ''} onClick={() => setActiveTab('home')}>Workspace</button>
          <button type="button" className={activeTab === 'policy' ? 'active' : ''} onClick={() => setActiveTab('policy')}>Policies</button>
          <button type="button" className={activeTab === 'review' ? 'active' : ''} onClick={() => setActiveTab('review')}>Analysis</button>
        </div>

        <div className="b2b-toolbar__spacer" />

        <div className="b2b-toolbar__footer">
          <button type="button" className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}>Settings</button>
          <button type="button" onClick={handleSignOutClick} disabled={isSigningOut}>
            {isSigningOut ? 'Signing Out...' : 'Sign Out'}
          </button>
        </div>
      </aside>

      <main className="b2b-main">
        {(status || error) && (
          <section className="b2b-status">
            {status && <p className="ok">{status}</p>}
            {error && <p className="err">{error}</p>}
            {isAnalyzing && (
              <>
                <div
                  className="b2b-progress"
                  role="progressbar"
                  aria-label="B2B contract analysis progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={analysisProgress}
                >
                  <div className="b2b-progress__bar" style={{ width: `${analysisProgress}%` }} />
                </div>
                <p className="b2b-progress__text">Analyzing contract... {analysisProgress}%</p>
              </>
            )}
          </section>
        )}

        {activeTab === 'home' && (
          <section className="b2b-grid b2b-home">
          <article className="b2b-card">
            <h2>B2B Policy Compliance</h2>
            <p>
              Upload policy PDFs, analyze outgoing contracts against your internal rules, and use Copilot-based
              follow-up Q&A on saved reviews.
            </p>
            <ul>
              <li>Storage: MongoDB (profile, policies, reviews).</li>
              <li>Analysis model: GitHub Copilot models only.</li>
              <li>Auth: Same root ClauseIQ session and cookies.</li>
            </ul>
          </article>

          <article className="b2b-card">
            <h3>Snapshot</h3>
            <p>{b2bUserLabel(user)}</p>
            <p>Policies: {(policies.freelancers?.length || 0) + (policies.employees?.length || 0) + (policies.vendors?.length || 0)}</p>
            <p>Reviews: {reviews.length}</p>
            <p>Copilot: {copilotReady ? 'Connected' : 'Not ready'}</p>
          </article>

          <article className="b2b-card b2b-home__quick-analyze">
            <h3>Quick Analyze</h3>
            <form className="b2b-stack" onSubmit={handleAnalyzeContract}>
              <label>
                Contract Type
                <select value={reviewType} onChange={(event) => setReviewType(event.target.value)}>
                  {POLICY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <div className="b2b-field">
                <span>Contract PDF</span>
                <div
                  className={`b2b-dropbox ${isContractDragActive ? 'is-dragging' : ''}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsContractDragActive(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setIsContractDragActive(false);
                  }}
                  onDrop={handleContractDrop}
                >
                  <input
                    id="b2b-contract-file"
                    className="b2b-dropbox__input"
                    type="file"
                    accept="application/pdf"
                    onChange={handleContractFileChange}
                  />
                  <div className="b2b-dropbox__label">
                    <span className="b2b-dropbox__title">Drop contract PDF here</span>
                    <span className="b2b-dropbox__meta">or click to browse</span>
                    <span className="b2b-dropbox__file">{contractFile?.name || 'No file selected'}</span>
                  </div>
                </div>
              </div>
              <button type="submit" disabled={isAnalyzing}>{isAnalyzing ? 'Analyzing...' : 'Analyze Contract'}</button>
            </form>
          </article>
          </section>
        )}

        {activeTab === 'settings' && (
          <section className="b2b-grid">
            <article className="b2b-card b2b-span-all">
              <h2>Settings</h2>
              <p>Manage your B2B workspace configuration and Copilot connection.</p>
            </article>
            {renderCopilotSettingsCard()}
          </section>
        )}

        {activeTab === 'policy' && (
          <section className="b2b-grid">
          <article className="b2b-card">
            <h3>Company Profile</h3>
            <form className="b2b-stack" onSubmit={handleSaveProfile}>
              <label>
                Company Name
                <input
                  value={profile.companyName || ''}
                  onChange={(event) => setProfile((prev) => ({ ...prev, companyName: event.target.value }))}
                />
              </label>
              <label>
                Industry
                <input
                  value={profile.industry || ''}
                  onChange={(event) => setProfile((prev) => ({ ...prev, industry: event.target.value }))}
                />
              </label>
              <label>
                Default Policy Notes
                <textarea
                  rows={4}
                  value={profile.defaultPolicyNotes || ''}
                  onChange={(event) => setProfile((prev) => ({ ...prev, defaultPolicyNotes: event.target.value }))}
                />
              </label>
              <button type="submit">Save Profile</button>
            </form>
          </article>

          <article className="b2b-card">
            <h3>Upload Policy</h3>
            <form className="b2b-stack" onSubmit={handlePolicyUpload}>
              <label>
                Policy Type
                <select value={policyType} onChange={(event) => setPolicyType(event.target.value)}>
                  {POLICY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <div className="b2b-field">
                <span>PDF File</span>
                <div
                  className={`b2b-dropbox ${isPolicyDragActive ? 'is-dragging' : ''}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsPolicyDragActive(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setIsPolicyDragActive(false);
                  }}
                  onDrop={handlePolicyDrop}
                >
                  <input
                    id="b2b-policy-file"
                    className="b2b-dropbox__input"
                    type="file"
                    accept="application/pdf"
                    onChange={handlePolicyFileChange}
                  />
                  <div className="b2b-dropbox__label">
                    <span className="b2b-dropbox__title">Drop policy PDF here</span>
                    <span className="b2b-dropbox__meta">or click to browse</span>
                    <span className="b2b-dropbox__file">{policyFile?.name || 'No file selected'}</span>
                  </div>
                </div>
              </div>
              <button type="submit">Upload Policy</button>
            </form>
          </article>

          <article className="b2b-card b2b-span-2">
            <h3>Policy Library</h3>
            <div className="b2b-policy-grid">
              {POLICY_TYPES.map((type) => (
                <div key={type} className="b2b-policy-col">
                  <h4>{type}</h4>
                  {(policies[type] || []).length ? (
                    <ul>
                      {policies[type].map((policy) => (
                        <li key={policy.id}>
                          <strong>{policy.fileName}</strong>
                          <span>{policy.chunksStored} chunks</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No policies yet.</p>
                  )}
                </div>
              ))}
            </div>
          </article>
          </section>
        )}

        {activeTab === 'review' && (
          <section className="b2b-grid">
          <article className="b2b-card b2b-span-2">
            <h3>Review Results</h3>
            {!currentReview ? (
              <p className="muted">Run a contract analysis to view findings.</p>
            ) : (
              <div className="b2b-review-layout">
                <div className="b2b-clause-list">
                  {(currentReview.contractSketch?.clauses || []).map((clause) => {
                    const active = clause.id === (selectedClause?.id || clause.id);
                    return (
                      <button key={clause.id} type="button" className={active ? 'active' : ''} onClick={() => setSelectedClauseId(clause.id)}>
                        <strong>{clause.id}</strong>
                        <p>{clause.text}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="b2b-clause-detail">
                  {selectedClause ? (
                    <>
                      <h4>{selectedClause.id}</h4>
                      <p>{selectedClause.text}</p>
                      <div className="pill-row">
                        <span className="pill">{clauseAssessment?.status || 'UNKNOWN'}</span>
                        <span className="pill">{clauseAssessment?.severity || 'LOW'}</span>
                      </div>
                      <p>{clauseAssessment?.reasoning || 'No assessment available.'}</p>
                      {!!clauseViolations.length && (
                        <ul>
                          {clauseViolations.map((item, index) => (
                            <li key={`${item.clauseId}-${index}`}>
                              <strong>{item.title}</strong>: {item.rationale}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className="muted">Select a clause to inspect findings.</p>
                  )}
                </div>
              </div>
            )}
          </article>
          </section>
        )}

        <button
          type="button"
          className={`b2b-chat-fab ${isChatOpen ? 'is-hidden' : ''}`}
          onClick={() => setIsChatOpen((prev) => !prev)}
          aria-label={isChatOpen ? 'Close chat' : 'Open chat'}
          aria-expanded={isChatOpen}
          aria-controls="b2b-chat-drawer"
        >
          <img src={chatbotIcon} alt="" aria-hidden="true" />
        </button>

        <aside className={`b2b-chat-drawer ${isChatOpen ? 'is-open' : ''}`} id="b2b-chat-drawer" aria-hidden={!isChatOpen}>
            <header className="b2b-chat-drawer__header">
              <h3>B2B Compliance Chat</h3>
              <button type="button" onClick={() => setIsChatOpen(false)} aria-label="Close chatbot">X</button>
            </header>

            <label className="b2b-chat-drawer__field">
              <span>Review Context</span>
              <select value={selectedReviewId} onChange={(event) => setSelectedReviewId(event.target.value)}>
                <option value="">Select review</option>
                {reviews.map((review) => (
                  <option value={review.id} key={review.id}>{review.fileName} ({review.verdict})</option>
                ))}
              </select>
            </label>

            <div className="b2b-chat-log">
              {chatLog.length === 0 && !chatBusy && (
                <p className="muted">Ask about uploaded policies and reviewed contracts.</p>
              )}

              {chatLog.map((entry, index) => (
                <div key={index} className={`msg ${entry.role}`}>
                  <p>{entry.text}</p>
                  {entry.citations?.length > 0 && (
                    <small>
                      {(() => {
                        const uniqueSourceFiles = Array.from(
                          new Set(
                            entry.citations
                              .map((item) => String(item?.fileName || '').trim())
                              .filter(Boolean),
                          ),
                        );
                        const label = uniqueSourceFiles.length === 1 ? 'PDF' : 'PDFs';
                        return `Sources (${uniqueSourceFiles.length} ${label}): ${uniqueSourceFiles.join(', ')}`;
                      })()}
                    </small>
                  )}
                </div>
              ))}

              {chatBusy && (
                <div className="msg assistant thinking" aria-live="polite" aria-label="Chatbot is thinking">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              )}
            </div>

            <form className="b2b-chat-drawer__composer" onSubmit={handleAskQuestion}>
              <textarea
                rows={3}
                value={chatQuestion}
                onChange={(event) => setChatQuestion(event.target.value)}
                placeholder="Ask about policy checks, violations, clauses, or recommendations..."
              />
              <button type="submit" disabled={chatBusy}>Send</button>
            </form>
          </aside>
      </main>
    </div>
  );
}
