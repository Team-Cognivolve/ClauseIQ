import React, { useMemo, useState } from 'react';
import './AuthPage.css';

const initialForm = {
  name: '',
  email: '',
  password: '',
};

export function AuthPage({ onAuthSuccess, onBackToLanding }) {
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isSignUp = mode === 'signup';

  const heading = useMemo(() => (
    isSignUp ? 'Create account' : 'Welcome back'
  ), [isSignUp]);

  const subtitle = useMemo(() => (
    isSignUp
      ? 'Sign up to continue to ClauseIQ.'
      : 'Sign in to continue to ClauseIQ.'
  ), [isSignUp]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const toggleMode = () => {
    setMode((previous) => (previous === 'signin' ? 'signup' : 'signin'));
    setError('');
  };

  const activateMode = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setError('');
  };

  const submitAuth = async (event) => {
    event.preventDefault();
    setError('');

    if (!form.email.trim() || !form.password) {
      setError('Email and password are required.');
      return;
    }

    if (isSignUp && !form.name.trim()) {
      setError('Name is required for sign up.');
      return;
    }

    setSubmitting(true);

    try {
      const endpoint = isSignUp ? '/api/auth/signup' : '/api/auth/login';
      const payload = isSignUp
        ? { name: form.name.trim(), email: form.email.trim(), password: form.password }
        : { email: form.email.trim(), password: form.password };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Authentication failed.');
      }

      setForm(initialForm);
      onAuthSuccess(data.user);
    } catch (authError) {
      setError(authError.message || 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-panel auth-panel--form">
        <button type="button" className="auth-back-link" onClick={onBackToLanding}>
          <span aria-hidden>←</span>
          <span>Back to workspace</span>
        </button>

        <div className="auth-brand auth-brand--mobile">
          <span className="auth-brand__icon" aria-hidden>
            <svg viewBox="0 0 24 24" className="auth-brand__icon-svg">
              <path d="M5 19h14M7 16l4-4m-2 7l7-7m-5-5l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="auth-brand__name">ClauseIQ</span>
        </div>

        <div className="auth-card">
          <div className="auth-card__header">
            <h1 className="auth-title">{heading}</h1>
            <p className="auth-subtitle">{subtitle}</p>
          </div>

          <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={`auth-toggle__btn ${!isSignUp ? 'auth-toggle__btn--active' : ''}`}
              onClick={() => activateMode('signin')}
              role="tab"
              aria-selected={!isSignUp}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-toggle__btn ${isSignUp ? 'auth-toggle__btn--active' : ''}`}
              onClick={() => activateMode('signup')}
              role="tab"
              aria-selected={isSignUp}
            >
              Sign Up
            </button>
          </div>

          <form className="auth-form" onSubmit={submitAuth}>
            {error && (
              <p className="auth-error" role="alert">
                <span aria-hidden>●</span> {error}
              </p>
            )}

            {isSignUp && (
              <label className="auth-field">
                <span className="auth-field__label">Full Name</span>
                <input
                  className="auth-input"
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={updateField}
                  placeholder="Jane Doe"
                  autoComplete="name"
                />
              </label>
            )}

            <label className="auth-field">
              <span className="auth-field__label">Email</span>
              <div className="auth-input-wrap">
                <span className="auth-input-icon" aria-hidden>✉</span>
                <input
                  className="auth-input"
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={updateField}
                  placeholder="name@company.com"
                  autoComplete="email"
                />
              </div>
            </label>

            <label className="auth-field">
              <div className="auth-field__meta">
                <span className="auth-field__label">Password</span>
                {!isSignUp && (
                  <button type="button" className="auth-inline-link">Forgot?</button>
                )}
              </div>
              <div className="auth-input-wrap">
                <span className="auth-input-icon" aria-hidden>•</span>
                <input
                  className="auth-input"
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={updateField}
                  placeholder={isSignUp ? 'Create a strong password' : '••••••••'}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                />
              </div>
            </label>

            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting && <span className="auth-spinner" aria-hidden />}
              <span>
                {submitting
                  ? (isSignUp ? 'Creating account...' : 'Authenticating...')
                  : (isSignUp ? 'Create Account' : 'Sign In')}
              </span>
            </button>
          </form>

          <p className="auth-terms">
            By proceeding, you agree to our <a href="#">Terms of Service</a> and{' '}
            <a href="#">Privacy Policy</a>.
          </p>

        </div>
      </section>

      <section className="auth-panel auth-panel--context" aria-hidden>
        <div className="auth-context__brand">
          <span className="auth-brand__icon" aria-hidden>
            <svg viewBox="0 0 24 24" className="auth-brand__icon-svg">
              <path d="M5 19h14M7 16l4-4m-2 7l7-7m-5-5l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="auth-brand__name">ClauseIQ</span>
        </div>

        <div className="auth-context__content">
          <h2>Precision Compliance Engineering.</h2>
          <p>
            Join top legal teams using ClauseIQ to automate contract analysis,
            mitigate risk, and streamline complex policy compliance.
          </p>

          <div className="auth-features">
            <div className="auth-feature">
              <span className="auth-feature__dot" aria-hidden>✓</span>
              <span>Surgical precision clause extraction</span>
            </div>
            <div className="auth-feature">
              <span className="auth-feature__dot" aria-hidden>✓</span>
              <span>Real-time risk scoring</span>
            </div>
            <div className="auth-feature">
              <span className="auth-feature__dot" aria-hidden>✓</span>
              <span>Enterprise-grade security</span>
            </div>
          </div>

          <blockquote className="auth-testimonial">
            <p>
              &quot;ClauseIQ reduced our contract review cycle by 40% while maintaining
              the rigorous standards our partners demand.&quot;
            </p>
            <cite>— General Counsel, Fortune 500 Firm</cite>
          </blockquote>
        </div>
      </section>
    </div>
  );
}
