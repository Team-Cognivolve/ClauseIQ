import React from 'react';
import './ProductSelector.css';

export function ProductSelector({ onChooseClauseIQ, onChooseB2B, onBackToLanding }) {
  const options = [
    {
      key: 'clauseiq',
      title: 'ClauseIQ Contract Review',
      description:
        'Surgical analysis for individual contracts. Instantly identify risks, deviations, and non-standard clauses against your legal playbook.',
      idealFor: 'Legal Counsel, Procurement',
      onSelect: onChooseClauseIQ,
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="product-selector__icon-svg">
          <path d="M6 3h9l4 4v14H6V3zm8 1.5V8h3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 11h6M9 14h6M9 17h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      key: 'b2b',
      title: 'B2B Compliance Workspace',
      description:
        "Enterprise-grade policy management. Monitor, enforce, and audit compliance across your entire organization's documentation architecture.",
      idealFor: 'Compliance Officers, Operations',
      onSelect: onChooseB2B,
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="product-selector__icon-svg">
          <path d="M5 19h14M7 16l4-4m-2 7l7-7m-5-5l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  return (
    <div className="product-selector">
      <main className="product-selector__main">
        <button type="button" className="product-selector__back" onClick={onBackToLanding}>
          <span aria-hidden>←</span>
          <span>Back to landing</span>
        </button>

        <header className="product-selector__header">
          <h1 className="product-selector__title">Select your workspace</h1>
          <p className="product-selector__subtitle">
            Choose the precision toolset that matches your compliance requirements.
          </p>
        </header>

        <section className="product-selector__grid" aria-label="Workspace choices">
          {options.map((option) => (
            <article key={option.key} className="product-selector__card">
              <div className="product-selector__card-head">
                <span className="product-selector__icon-box">{option.icon}</span>
                <h2>{option.title}</h2>
              </div>

              <p className="product-selector__description">{option.description}</p>

              <div className="product-selector__footer">
                <div className="product-selector__ideal">
                  <span className="product-selector__ideal-label">Ideal for</span>
                  <span className="product-selector__ideal-value">{option.idealFor}</span>
                </div>
                <button
                  type="button"
                  className="product-selector__continue"
                  onClick={option.onSelect}
                >
                  Continue <span aria-hidden>→</span>
                </button>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
