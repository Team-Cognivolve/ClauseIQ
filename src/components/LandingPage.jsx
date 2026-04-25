import React from 'react';
import './LandingPage.css';
import forbiddenIcon from '../assets/icon1.svg';
import lightbulbIcon from '../assets/icon2.svg';
import loginIcon from '../assets/icon3.svg';

const pricingPlans = [
  {
    title: 'Free Plan',
    price: 'INR 0',
    period: '',
    description: 'Best for first-time users who review only a few contracts.',
    features: [
      '3 contract reviews total',
      '1 jurisdiction check total',
      'No card required',
      'Full contract workflow access',
    ],
    limitations: 'After free quota, continue using wallet pricing.',
    buttonText: 'Start Free',
    highlight: false,
  },
  {
    title: 'PAYG Wallet',
    price: 'INR 99',
    period: 'minimum top-up',
    description: 'Pay only when you use the platform, ideal for low monthly volume.',
    features: [
      'Wallet validity: 6 months',
      'Domestic contract review: INR 19',
      'Jurisdiction add-on (triggered only): INR 15',
      'Cross-border effective charge: INR 34',
    ],
    limitations: 'Charges apply per review based on usage.',
    buttonText: 'Use PAYG',
    highlight: true,
  },
  {
    title: 'Light Membership',
    price: 'INR 99',
    period: '/month',
    description: 'For repeat users who want lower overage pricing every month.',
    features: [
      'Includes 3 reviews per month',
      'Additional domestic review: INR 15',
      'Jurisdiction add-on: INR 12',
      'Designed for recurring freelancers and teams',
    ],
    limitations: 'Use PAYG alongside membership for variable volume.',
    buttonText: 'Start Membership',
    highlight: false,
  },
];

function PricingCard({ plan, onClick, featured }) {
  return (
    <div className={`pricing-card ${featured ? 'pricing-card--featured' : ''}`}>
      {featured && <div className="pricing-card__badge">Most Popular</div>}
      <h3 className="pricing-card__title">{plan.title}</h3>
      <div className="pricing-card__price">
        <span className="pricing-card__amount">{plan.price}</span>
        {plan.period && <span className="pricing-card__period">{plan.period}</span>}
      </div>
      <p className="pricing-card__description">{plan.description}</p>
      <button className="pricing-card__button" onClick={onClick || (() => null)}>
        {plan.buttonText}
      </button>
      <div className="pricing-card__features">
        <h4 className="pricing-card__features-title">Features</h4>
        <ul className="pricing-card__features-list">
          {plan.features.map((feature, idx) => (
            <li key={idx} className="pricing-card__feature-item">
              <span className="pricing-card__feature-icon">✓</span>
              {feature}
            </li>
          ))}
        </ul>
      </div>
      <div className="pricing-card__limitation">
        <p><strong>Note:</strong> {plan.limitations}</p>
      </div>
    </div>
  );
}

export function LandingPage({ onEnterApp }) {
  return (
    <div className="landing">
      {/* Top Navigation Bar */}
      <nav className="landing-nav">
        <div className="landing-nav__container">
          <div className="landing-nav__logo">ClauseIQ</div>
          <ul className="landing-nav__links">
            <li><a href="#product">Solutions</a></li>
            <li><a href="#intelligence">Intelligence</a></li>
            <li><a href="#company">Compliance</a></li>
            <li><a href="#pricing">Pricing</a></li>
          </ul>
          <div className="landing-nav__actions">
            <button type="button" className="landing-nav__signin" onClick={onEnterApp}>Sign In</button>
            <button className="landing-nav__cta" onClick={onEnterApp}>Get Started</button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero__content">
          <div className="hero__pill" aria-label="feature-introduction">
            <span className="hero__pill-icon" aria-hidden>⚡</span>
            Introducing AI-Powered Risk Scoring
          </div>

          <h1 className="hero__headline">
            Surgical Precision for
            <span className="hero__headline-accent">Modern Contract Intelligence.</span>
          </h1>

          <p className="hero__description">
            ClauseIQ automates the extraction, analysis, and risk scoring of
            complex legal agreements. Built for high-stakes environments
            where accuracy is non-negotiable.
          </p>

          <div className="hero__ctas">
            <button className="hero__cta-primary" onClick={onEnterApp}>
              Start Free Trial <span aria-hidden>→</span>
            </button>
            <a href="#intelligence" className="hero__cta-link">
              View Documentation
            </a>
          </div>
        </div>

        {/* Document Preview */}
        <div className="hero__preview-card">
          <div className="preview-card__topbar">
            <div className="preview-card__dots" aria-hidden>
              <span />
              <span />
              <span />
            </div>
            <span className="preview-card__filename">Master_Services_Agreement_v4.pdf</span>
          </div>
          <div className="preview-card__content">
            <div className="preview-card__title-row">
              <h3 className="preview-card__title">Indemnification Clause</h3>
              <span className="preview-card__risk">
                <span aria-hidden>⚠</span> High Risk
              </span>
            </div>

            <p className="preview-card__clause">
              Provider shall indemnify, defend, and hold harmless Client from and against any
              and all claims, <mark>damages, liabilities, costs, and expenses (including reasonable</mark>
              <mark>attorneys&apos; fees)</mark> arising out of or related to...
            </p>

            <div className="preview-card__analysis">
              <span className="preview-card__label">ANALYSIS</span>
              <span className="preview-card__value">Missing standard liability cap. Recommended limitation to 12 months fees.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats" id="product">
        <div className="stats__container">
          <div className="stat-item">
            <span className="stat-item__value">90%</span>
            <span className="stat-item__label">FASTER REVIEWS</span>
          </div>
          <div className="stat-item">
            <span className="stat-item__value">10k+</span>
            <span className="stat-item__label">CONTRACTS ANALYZED</span>
          </div>
          <div className="stat-item">
            <span className="stat-item__value">99.9%</span>
            <span className="stat-item__label">EXTRACTION ACCURACY</span>
          </div>
          <div className="stat-item">
            <span className="stat-item__value">SOC2</span>
            <span className="stat-item__label">CERTIFIED SECURITY</span>
          </div>
        </div>
      </section>

      {/* Intelligence Layer Section */}
      <section className="intelligence" id="intelligence">
        <div className="intelligence__container">
          <div className="intelligence__header">
            <span className="intelligence__eyebrow">INTELLIGENCE LAYER</span>
            <h2 className="intelligence__title">
              Every clause, decoded.<br />
              Every risk, quantified.
            </h2>
          </div>

          <div className="intelligence__cards">
            <div className="intel-card intel-card--alt-1">
              <span className="intel-card__layer">CORE LAYER 01</span>
              <div className="intel-card__icon">
                <img src={forbiddenIcon} alt="" />
              </div>
              <h3 className="intel-card__title">Critical Exposure</h3>
              <p className="intel-card__description">
                Instantly surface unlimited liability, broad indemnification, and uncapped risk provisions
                that require immediate attention.
              </p>
              <div className="intel-card__activity">
                <div className="activity-scanner">
                  <span className="activity-scanner__label">SCANNING LIABILITY</span>
                  <div className="activity-scanner__bar">
                    <div className="activity-scanner__fill" style={{ width: '75%' }}></div>
                  </div>
                  <span className="activity-scanner__result">75% RISK DETECTED</span>
                </div>
              </div>
            </div>

            <div className="intel-card intel-card--alt-2">
              <span className="intel-card__layer">CORE LAYER 02</span>
              <div className="intel-card__icon">
                <img src={lightbulbIcon} alt="" />
              </div>
              <h3 className="intel-card__title">Optimal Suggestions</h3>
              <p className="intel-card__description">
                Receive actionable redline recommendations backed by market-standard language and
                negotiation precedent.
              </p>
              <div className="intel-card__activity">
                <div className="activity-suggestion">
                  <span className="activity-suggestion__quote">"Replace 'without limitation' with 'capped at annual fees paid in the preceding 12 months'..."</span>
                </div>
              </div>
            </div>

            <div className="intel-card intel-card--alt-1">
              <span className="intel-card__layer">CORE LAYER 03</span>
              <div className="intel-card__icon">
                <img src={loginIcon} alt="" />
              </div>
              <h3 className="intel-card__title">Precedent Match</h3>
              <p className="intel-card__description">
                Cross-reference against millions of executed agreements to benchmark terms against
                industry standards.
              </p>
              <div className="intel-card__activity">
                <div className="activity-chart">
                  <span className="activity-chart__label">MARKET NORM INDEX</span>
                  <div className="activity-chart__bars">
                    <div className="activity-chart__bar" style={{ height: '40%' }}></div>
                    <div className="activity-chart__bar" style={{ height: '65%' }}></div>
                    <div className="activity-chart__bar activity-chart__bar--active" style={{ height: '85%' }}></div>
                    <div className="activity-chart__bar" style={{ height: '55%' }}></div>
                    <div className="activity-chart__bar" style={{ height: '70%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Curation Principle Section */}
      <section className="curation" id="company">
        <div className="curation__container">
          <div className="curation__content">
            <span className="curation__eyebrow">THE CURATION PRINCIPLE</span>
            <h2 className="curation__title">
              Built for the legal mind.
            </h2>
            <p className="curation__description">
              ClauseIQ is designed around how elite legal professionals actually work.
              No learning curve. No compromise.
            </p>

            <ul className="curation__list">
              <li className="curation__item">
                <span className="curation__number">01</span>
                <div className="curation__item-content">
                  <h4>API-Backed Analysis</h4>
                  <p>Contracts are parsed in the browser, then analyzed through GitHub Copilot via the local backend service.</p>
                </div>
              </li>
              <li className="curation__item">
                <span className="curation__number">02</span>
                <div className="curation__item-content">
                  <h4>Hybrid Intelligence</h4>
                  <p>Combines AI analysis with 21 expert-validated risk patterns for unmatched accuracy.</p>
                </div>
              </li>
              <li className="curation__item">
                <span className="curation__number">03</span>
                <div className="curation__item-content">
                  <h4>Instant Results</h4>
                  <p>Fast clause-by-clause analysis with structured API responses and fallback risk heuristics.</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="pricing" id="pricing">
        <div className="pricing__container">
          <div className="pricing__header">
            <h2 className="pricing__title">Pricing Designed for India-First Adoption</h2>
            <p className="pricing__subtitle">B2C uses Free + PAYG + optional membership. B2B remains subscription-led.</p>
          </div>
          <div className="pricing__grid">
            <PricingCard plan={pricingPlans[0]} onClick={onEnterApp} />
            <PricingCard plan={pricingPlans[1]} onClick={onEnterApp} featured />
            <PricingCard plan={pricingPlans[2]} onClick={onEnterApp} />
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="final-cta">
        <div className="final-cta__container">
          <h2 className="final-cta__title">
            Transform how you review contracts.
          </h2>
          <p className="final-cta__description">
            Join forward-thinking legal teams who are already using ClauseIQ to
            accelerate contract review and reduce risk exposure.
          </p>
          <button className="final-cta__button" onClick={onEnterApp}>
            Start Analyzing
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer__bottom">
          <span className="landing-footer__logo-left">CLAUSEIQ</span>
          <p>© 2026 CLAUSEIQ SYSTEMS. PRECISION COMPLIANCE ENGINEERING.</p>
          <div className="landing-footer__links">
            <a href="#">PRIVACY POLICY</a>
            <a href="#">TERMS OF SERVICE</a>
            <a href="#">SECURITY</a>
            <a href="#">CONTACT</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
