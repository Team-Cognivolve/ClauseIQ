import React from 'react';
import './ProductSelector.css';

export function ProductSelector({ onChooseClauseIQ, onChooseB2B, onBackToLanding }) {
  return (
    <div className="product-selector">
      <section className="product-selector__panel">
        <button type="button" className="product-selector__back" onClick={onBackToLanding}>
          <span aria-hidden>←</span> Back to landing
        </button>

        <p className="product-selector__eyebrow">Choose Your Workspace</p>
        <h1 className="product-selector__title">What do you want to do today?</h1>
        <p className="product-selector__subtitle">Select one path to continue with a dedicated login and workflow.</p>

        <div className="product-selector__grid">
          <article className="product-selector__card">
            <h2>ClauseIQ Contract Review</h2>
            <p>Individual contract analysis, clause-level risks, and negotiation insights.</p>
            <button type="button" onClick={onChooseClauseIQ}>Continue to ClauseIQ</button>
          </article>

          <article className="product-selector__card">
            <h2>B2B Compliance Workspace</h2>
            <p>Company policies, outgoing contract checks, and compliance review with evidence.</p>
            <button type="button" onClick={onChooseB2B}>Continue to B2B</button>
          </article>
        </div>
      </section>
    </div>
  );
}
