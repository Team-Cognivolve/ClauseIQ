import React, { useState } from 'react';

// Risk level configuration with styles (no emojis for professional look)
const RISK = {
  High: { cls: 'risk--high', label: 'High Risk' },
  Medium: { cls: 'risk--medium', label: 'Medium Risk' },
  Low: { cls: 'risk--low', label: 'Low Risk' },
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
            {risk.label}
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
            <h4 className="detail-block__heading">What This Means</h4>
            <p>{item.explanation}</p>
          </div>

          {/* Negotiation section - only show if there is negotiation advice */}
          {item.negotiation && String(item.negotiation).trim() && (
            <div className="detail-block detail-block--suggestion">
              <h4 className="detail-block__heading">
                Negotiation
              </h4>
              <p>{item.negotiation}</p>
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
          <span>Analysing contract for red flags...</span>
        </div>
      </section>
    );
  }

  if (!results || !Array.isArray(results)) return null;

  // Filter out any invalid results and group by risk level
  const validResults = results.filter(r => r && typeof r === 'object' && r.risk_level);
  const high = validResults.filter(r => r.risk_level === 'High');
  const medium = validResults.filter(r => r.risk_level === 'Medium');
  const low = validResults.filter(r => r.risk_level === 'Low');

  // Results are already sorted by risk level from ClauseIQ component
  const hasIssues = validResults.length > 0;

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
            <span className="summary-pill summary-pill--clean">No concerns found</span>
          )}
        </div>
      </div>

      {!hasIssues ? (
        <div className="no-issues">
          <p>No concerning clauses were identified in this contract.</p>
          <p>Consider having a qualified solicitor review it before signing.</p>
        </div>
      ) : (
        <div className="results__list">
          {validResults.map((item, idx) => (
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