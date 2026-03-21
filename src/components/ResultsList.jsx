// components/ResultsList.jsx
import React, { useState } from 'react';

const RISK = {
  High:   { cls: 'risk--high',   icon: '\uD83D\uDEA8', label: 'High Risk' },
  Medium: { cls: 'risk--medium', icon: '\u26A0\uFE0F',  label: 'Medium Risk' },
};

const CATEGORIES = {
  'NON-COMPETE': 'Non-Compete',
  LIABILITY:     'Liability',
  IP_TRANSFER:   'IP Transfer',
  TERMINATION:   'Termination',
};

function ResultCard({ item, index }) {
  const [open, setOpen] = useState(false);
  const risk  = RISK[item.risk_level] ?? RISK.Medium;
  const label = CATEGORIES[item.category] ?? item.category;

  return (
    <article className={`result-card ${item.risk_level === 'High' ? 'result-card--high' : 'result-card--medium'}`}>
      {/* Header row – always visible */}
      <button
        className="result-card__header"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <div className="result-card__badges">
          <span className={`risk-badge ${risk.cls}`}>
            {risk.icon} {risk.label}
          </span>
          <span className="category-badge">{label}</span>
        </div>
        <span className="result-card__chevron" aria-hidden>
          {open ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {/* Clause excerpt – always visible */}
      <blockquote className="result-card__excerpt">
        &ldquo;{item.clause_text}&rdquo;
      </blockquote>

      {/* Expandable detail */}
      {open && (
        <div className="result-card__detail">
          <div className="detail-block">
            <h4 className="detail-block__heading">Why it&rsquo;s risky</h4>
            <p>{item.explanation}</p>
          </div>
          <div className="detail-block detail-block--suggestion">
            <h4 className="detail-block__heading">💡 Suggestion</h4>
            <p>{item.suggestion}</p>
          </div>
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

  const high   = results.filter(r => r.risk_level === 'High');
  const medium = results.filter(r => r.risk_level === 'Medium');
  const sorted = [...high, ...medium];

  return (
    <section className="results" aria-live="polite">
      <div className="results__header">
        <h2 className="results__title">Analysis Complete</h2>
        <div className="results__summary">
          {high.length   > 0 && <span className="summary-pill summary-pill--high">{high.length} High Risk</span>}
          {medium.length > 0 && <span className="summary-pill summary-pill--medium">{medium.length} Medium Risk</span>}
          {sorted.length === 0 && <span className="summary-pill summary-pill--clean">✓ No red flags</span>}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="no-issues">
          <p>🎉 No red-flag clauses were identified in this contract.</p>
          <p>Consider having a qualified solicitor review it before signing.</p>
        </div>
      ) : (
        <div className="results__list">
          {sorted.map((item, idx) => (
            <ResultCard key={`${item.category}-${idx}`} item={item} index={idx} />
          ))}
        </div>
      )}
    </section>
  );
}