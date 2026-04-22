import React, { useMemo, useState } from 'react';
import { b2bApi } from '../api/b2bClient';
import './B2BAuthPage.css';

const initialForm = {
  name: '',
  companyName: '',
  industry: '',
  email: '',
  password: '',
};

export function B2BAuthPage({ onAuthSuccess, onBackToSelector }) {
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isSignUp = mode === 'signup';

  const title = useMemo(() => (
    isSignUp ? 'Create B2B workspace account' : 'Welcome back'
  ), [isSignUp]);

  const subtitle = useMemo(() => (
    isSignUp
      ? 'Set up your organization profile to run policy-based contract checks.'
      : 'Sign in to continue to your B2B compliance workspace.'
  ), [isSignUp]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function activateMode(nextMode) {
    if (nextMode === mode) return;
    setError('');
    setMode(nextMode);
  }

  async function submit(event) {
    event.preventDefault();
    setError('');

    if (!form.email.trim() || !form.password) {
      setError('Email and password are required.');
      return;
    }

    if (isSignUp) {
      if (!form.name.trim()) {
        setError('Contact name is required.');
        return;
      }

      if (!form.companyName.trim()) {
        setError('Company name is required.');
        return;
      }
    }

    setSubmitting(true);

    try {
      const payload = isSignUp
        ? {
          name: form.name.trim(),
          companyName: form.companyName.trim(),
          industry: form.industry.trim(),
          email: form.email.trim(),
          password: form.password,
        }
        : {
          email: form.email.trim(),
          password: form.password,
        };

      const result = isSignUp
        ? await b2bApi.signup(payload)
        : await b2bApi.login(payload);

      onAuthSuccess(result.user);
      setForm(initialForm);
    } catch (authError) {
      setError(authError.message || 'B2B authentication failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="b2b-auth-page">
      <section className="b2b-auth-panel b2b-auth-panel--form">
        <button type="button" className="b2b-auth-back" onClick={onBackToSelector}>
          <span aria-hidden>&larr;</span>
          <span>Back to product selector</span>
        </button>

        <div className="b2b-auth-brand b2b-auth-brand--mobile">
          <span className="b2b-auth-brand__icon" aria-hidden>
            <svg viewBox="0 0 24 24" className="b2b-auth-brand__icon-svg">
              <path d="M6 18h12M8.5 15.5l2.8-2.8m-1.2 5.3l5.7-5.7m-3.7-3.8l3.1 3.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="b2b-auth-brand__name">ClauseIQ B2B</span>
        </div>

        <div className="b2b-auth-card">
          <div className="b2b-auth-card__header">
            <h1 className="b2b-auth-title">{title}</h1>
            <p className="b2b-auth-subtitle">{subtitle}</p>
          </div>

          <div className="b2b-auth-toggle" role="tablist" aria-label="B2B authentication mode">
            <button
              type="button"
              className={`b2b-auth-toggle__btn ${!isSignUp ? 'b2b-auth-toggle__btn--active' : ''}`}
              onClick={() => activateMode('signin')}
              role="tab"
              aria-selected={!isSignUp}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`b2b-auth-toggle__btn ${isSignUp ? 'b2b-auth-toggle__btn--active' : ''}`}
              onClick={() => activateMode('signup')}
              role="tab"
              aria-selected={isSignUp}
            >
              Sign Up
            </button>
          </div>

          <form className="b2b-auth-form" onSubmit={submit}>
            {error && (
              <p className="b2b-auth-error" role="alert">
                <span aria-hidden>!</span> {error}
              </p>
            )}

            {isSignUp && (
              <>
                <label className="b2b-auth-field">
                  <span className="b2b-auth-field__label">Contact Name</span>
                  <input
                    className="b2b-auth-input"
                    name="name"
                    value={form.name}
                    onChange={updateField}
                    placeholder="Your full name"
                    autoComplete="name"
                  />
                </label>

                <label className="b2b-auth-field">
                  <span className="b2b-auth-field__label">Company Name</span>
                  <input
                    className="b2b-auth-input"
                    name="companyName"
                    value={form.companyName}
                    onChange={updateField}
                    placeholder="Acme Inc"
                    autoComplete="organization"
                  />
                </label>

                <label className="b2b-auth-field">
                  <span className="b2b-auth-field__label">Industry</span>
                  <input
                    className="b2b-auth-input"
                    name="industry"
                    value={form.industry}
                    onChange={updateField}
                    placeholder="SaaS, Healthcare, Fintech"
                  />
                </label>
              </>
            )}

            <label className="b2b-auth-field">
              <span className="b2b-auth-field__label">Work Email</span>
              <input
                className="b2b-auth-input"
                type="email"
                name="email"
                value={form.email}
                onChange={updateField}
                placeholder="name@company.com"
                autoComplete="email"
              />
            </label>

            <label className="b2b-auth-field">
              <div className="b2b-auth-field__meta">
                <span className="b2b-auth-field__label">Password</span>
                {!isSignUp && (
                  <button type="button" className="b2b-auth-inline-link">Forgot?</button>
                )}
              </div>
              <input
                className="b2b-auth-input"
                type="password"
                name="password"
                value={form.password}
                onChange={updateField}
                placeholder={isSignUp ? 'Create a strong password' : 'At least 8 characters'}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
              />
            </label>

            <button className="b2b-auth-submit" type="submit" disabled={submitting}>
              <span>
                {submitting
                  ? (isSignUp ? 'Creating account...' : 'Signing in...')
                  : (isSignUp ? 'Create B2B Account' : 'Sign In to Workspace')}
              </span>
            </button>

            <div className="b2b-auth-sso-divider" aria-hidden>
              <span>SSO</span>
            </div>

            <button type="button" className="b2b-auth-sso">
              Continue with SAML SSO
            </button>
          </form>
        </div>
      </section>

      <section className="b2b-auth-panel b2b-auth-panel--context" aria-hidden>
        <div className="b2b-auth-context__brand">
          <span className="b2b-auth-brand__icon" aria-hidden>
            <svg viewBox="0 0 24 24" className="b2b-auth-brand__icon-svg">
              <path d="M6 18h12M8.5 15.5l2.8-2.8m-1.2 5.3l5.7-5.7m-3.7-3.8l3.1 3.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="b2b-auth-brand__name">ClauseIQ B2B</span>
        </div>

        <div className="b2b-auth-context__content">
          <h2>Policy-Driven Contract Operations.</h2>
          <p>
            Give legal and procurement teams a shared B2B workspace to enforce internal
            policies, monitor partner obligations, and reduce review cycles.
          </p>

          <div className="b2b-auth-features">
            <div className="b2b-auth-feature">
              <span className="b2b-auth-feature__dot" aria-hidden>OK</span>
              <span>Company-level policy libraries and playbooks</span>
            </div>
            <div className="b2b-auth-feature">
              <span className="b2b-auth-feature__dot" aria-hidden>OK</span>
              <span>Cross-team reviews with role-based access</span>
            </div>
            <div className="b2b-auth-feature">
              <span className="b2b-auth-feature__dot" aria-hidden>OK</span>
              <span>Audit-ready logs for every contract decision</span>
            </div>
          </div>

          <blockquote className="b2b-auth-testimonial">
            <p>
              &quot;Our B2B legal operations team now standardizes reviews across regions
              while cutting turnaround time by nearly 35%.&quot;
            </p>
            <cite>Head of Legal Ops, Global Manufacturing Group</cite>
          </blockquote>
        </div>
      </section>
    </div>
  );
}
