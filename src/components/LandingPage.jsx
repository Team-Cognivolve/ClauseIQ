import React from 'react';
import './LandingPage.css';
import forbiddenIcon from '../assets/icon1.svg';
import lightbulbIcon from '../assets/icon2.svg';
import loginIcon from '../assets/icon3.svg';

const pricingPlans = [
  {
    title: "Free",
    price: "₹0",
    description: "Perfect for students and first-time interns.",
    features: [
      "On-device WebLLM Analysis",
      "Clause Extraction",
      "Basic Negotiation Tips",
      "Export Results (PDF/Text)",
      "100% Privacy (Zero-Egress)",
    ],
    limitations: "Slower processing, 5-page PDF limit",
    buttonText: "Get Started",
    highlight: false
  },
  {
    title: "Developer",
    price: "₹499",
    description: "For power users who want speed and depth.",
    features: [
      "Everything in Free",
      "Bring Your Own API Key (BYOK)",
      "Interactive Contract Chatbot",
      "Visual 'Red Flag' Overlay",
      "Automatic PII Masking/Demasking",
    ],
    limitations: "Unlimited pages (based on your API)",
    buttonText: "Go Pro",
    highlight: true
  },
  {
    title: "Premium",
    price: "₹999",
    description: "The ultimate legal shield for professionals.",
    features: [
      "Everything in Developer",
      "Premium LLM Access (Claude/Gemini Pro)",
      "Multi-Contract Comparison",
      "Multi-lingual Support",
      "Jurisdiction & Compliance Check",
    ],
    limitations: "Priority Processing",
    buttonText: "Upgrade to Premium",
    highlight: false
  }
];

function PricingCard({ plan, onClick, featured }) {
  return (
    <div className={`pricing-card ${featured ? 'pricing-card--featured' : ''}`}>
      {featured && <div className="pricing-card__badge">Recommended</div>}
      <h3 className="pricing-card__title">{plan.title}</h3>
      <div className="pricing-card__price">
        <span className="pricing-card__amount">{plan.price}</span>
        {plan.price !== "₹0" && <span className="pricing-card__period">/month</span>}
      </div>
      <p className="pricing-card__description">{plan.description}</p>
      <button className="pricing-card__button" onClick={onClick}>
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
            <li><a href="#product">PRODUCT</a></li>
            <li><a href="#intelligence">INTELLIGENCE</a></li>
            <li><a href="#pricing">PRICING</a></li>
            <li><a href="#company">COMPANY</a></li>
          </ul>
          <button className="landing-nav__cta" onClick={onEnterApp}>
            GET STARTED
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero__content">
          <h1 className="hero__headline">
            Legal expertise, <span className="hero__headline-accent">quantified.</span>
          </h1>
          <p className="hero__description">
            ClauseIQ delivers institutional-grade contract intelligence. Our proprietary risk engine
            processes complex legal documents with the precision of a senior partner and the speed of
            modern infrastructure.
          </p>
          <div className="hero__ctas">
            <button className="hero__cta-primary" onClick={onEnterApp}>
              TRY IT NOW
            </button>
            <a href="#intelligence" className="hero__cta-link">
              EXPLORE METHOD <span className="hero__cta-arrow">↗</span>
            </a>
          </div>
        </div>

        {/* Glass Card Preview */}
        <div className="hero__preview-card">
          <div className="preview-card__header">
            <span className="preview-card__badge">CRITICAL EXPOSURE</span>
            <span className="preview-card__risk">High Risk</span>
          </div>
          <div className="preview-card__content">
            <p className="preview-card__clause">
              "The indemnifying party shall defend, indemnify, and hold harmless..."
            </p>
            <div className="preview-card__analysis">
              <span className="preview-card__label">Liability Cap</span>
              <span className="preview-card__value">Unlimited</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats" id="product">
        <div className="stats__container">
          <div className="stat-item">
            <span className="stat-item__value">&lt;10s</span>
            <span className="stat-item__label">Analysis Speed</span>
            <span className="stat-item__sublabel">Average processing time</span>
          </div>
          <div className="stat-item">
            <span className="stat-item__value">99.8%</span>
            <span className="stat-item__label">Accuracy Rate</span>
            <span className="stat-item__sublabel">Clause identification</span>
          </div>
          <div className="stat-item">
            <span className="stat-item__value">50M+</span>
            <span className="stat-item__label">Precedents</span>
            <span className="stat-item__sublabel">Legal document corpus</span>
          </div>
          <div className="stat-item stat-item--highlight">
            <span className="stat-item__value">Elite</span>
            <span className="stat-item__label">Trust Index</span>
            <span className="stat-item__sublabel">Industry benchmark</span>
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
                  <h4>Privacy-First Architecture</h4>
                  <p>All processing happens locally in your browser. Your documents never leave your device.</p>
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
                  <p>Complete clause analysis in under 2 seconds. No waiting, no API calls.</p>
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
            <h2 className="pricing__title">Simple, Transparent Pricing</h2>
            <p className="pricing__subtitle">Choose the plan that works for you</p>
          </div>
          <div className="pricing__grid">
            <PricingCard plan={pricingPlans[0]} onClick={onEnterApp} />
            <PricingCard plan={pricingPlans[1]} featured />
            <PricingCard plan={pricingPlans[2]} />
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
          <p>2026 ClauseIQ. All rights Reserved.</p>
          <span className="landing-footer__logo-right">ClauseIQ</span>
        </div>
      </footer>
    </div>
  );
}
