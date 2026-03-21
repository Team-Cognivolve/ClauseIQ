// components/ResultsList.jsx
import React, { useState } from 'react';

// Risk level configuration with icons and styles
const RISK = {
  High: { cls: 'risk--high', icon: '🚨', label: 'High Risk' },
  Medium: { cls: 'risk--medium', icon: '⚠️', label: 'Medium Risk' },
  Low: { cls: 'risk--low', icon: 'ℹ️', label: 'Low Risk' },
};

function ResultCard({ item, index }) {
  const [open, setOpen] = useState(false);
  const risk = RISK[item.risk_level] ?? RISK.Medium;

  return (
    <article
      className={`result-card result-card--${item.risk_level.toLowerCase()}`}
      aria-labelledby={`result-${index}-heading`}
    >
      {/* Header row – always visible */}
      <button
        className="result-card__header"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={`result-${index}-details`}
        id={`result-${index}-heading`}
      >
        <div className="result-card__badges">
          <span className={`risk-badge ${risk.cls}`}>
            {risk.icon} {risk.label}
          </span>
          <span className="clause-type-badge">{item.clause_type}</span>
        </div>
        <span className="result-card__chevron" aria-hidden>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {/* Clause excerpt – always visible */}
      <blockquote className="result-card__excerpt">
        &ldquo;{item.clause_text}&rdquo;
      </blockquote>

      {/* Expandable detail */}
      {open && (
        <div className="result-card__detail" id={`result-${index}-details`}>
          <div className="detail-block">
            <h4 className="detail-block__heading">What this means</h4>
            <p>{item.explanation}</p>
          </div>

          {/* Concerns section - only show if there are concerns */}
          {item.concerns && item.concerns.length > 0 && (
            <div className="detail-block detail-block--concerns">
              <h4 className="detail-block__heading">
                🔍 Specific Concerns
              </h4>
              <ul className="concerns-list">
                {item.concerns.map((concern, idx) => (
                  <li key={idx} className="concern-item">
                    {concern}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function ResultsList({ results, analyzing }) {
  if (analyzing) {
    return (
      <section className="results" aria-live="polite">
        <div className="analyzing-banner">
          <span className="spinner" aria-hidden />
          <span>Analysing contract for red flags… this may take a couple of minutes.</span>
        </div>
      </section>
    );
  }

  if (!results) return null;

  // Group results by risk level
  const high = results.filter(r => r.risk_level === 'High');
  const medium = results.filter(r => r.risk_level === 'Medium');
  const low = results.filter(r => r.risk_level === 'Low');

  // Results are already sorted by risk level from ClauseIQ component
  const hasIssues = results.length > 0;

  return (
    <section className="results" aria-live="polite">
      <div className="results__header">
        <h2 className="results__title">Analysis Complete</h2>
        <div className="results__summary">
          {high.length > 0 && (
            <span className="summary-pill summary-pill--high">
              {high.length} High Risk
            </span>
          )}
          {medium.length > 0 && (
            <span className="summary-pill summary-pill--medium">
              {medium.length} Medium Risk
            </span>
          )}
          {low.length > 0 && (
            <span className="summary-pill summary-pill--low">
              {low.length} Low Risk
            </span>
          )}
          {!hasIssues && (
            <span className="summary-pill summary-pill--clean">✓ No concerns found</span>
          )}
        </div>
      </div>

      {!hasIssues ? (
        <div className="no-issues">
          <p>🎉 No concerning clauses were identified in this contract.</p>
          <p>Consider having a qualified solicitor review it before signing.</p>
        </div>
      ) : (
        <div className="results__list">
          {results.map((item, idx) => (
            <ResultCard
              key={`${item.clause_type}-${idx}`}
              item={item}
              index={idx}
            />
          ))}
        </div>
      )}
    </section>
  );
}