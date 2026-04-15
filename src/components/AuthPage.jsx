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
    isSignUp ? 'Create Your Account' : 'Welcome Back'
  ), [isSignUp]);

  const subtitle = useMemo(() => (
    isSignUp
      ? 'Sign up to securely review your contracts with ClauseIQ.'
      : 'Sign in to continue reviewing your contracts.'
  ), [isSignUp]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const toggleMode = () => {
    setMode((previous) => (previous === 'signin' ? 'signup' : 'signin'));
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
          <span aria-hidden>←</span> Back to home
        </button>

        <div className="auth-brand">
          <span className="auth-brand__name">ClauseIQ</span>
        </div>

        <h1 className="auth-title">{heading}</h1>
        <p className="auth-subtitle">{subtitle}</p>

        <form className="auth-form" onSubmit={submitAuth}>
          {isSignUp && (
            <label className="auth-field">
              <span className="auth-field__label">Full Name</span>
              <input
                className="auth-input"
                type="text"
                name="name"
                value={form.name}
                onChange={updateField}
                placeholder="Your name"
                autoComplete="name"
              />
            </label>
          )}

          <label className="auth-field">
            <span className="auth-field__label">Email Address</span>
            <input
              className="auth-input"
              type="email"
              name="email"
              value={form.email}
              onChange={updateField}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <label className="auth-field">
            <span className="auth-field__label">Password</span>
            <input
              className="auth-input"
              type="password"
              name="password"
              value={form.password}
              onChange={updateField}
              placeholder="At least 8 characters"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting
              ? (isSignUp ? 'Creating account...' : 'Signing in...')
              : (isSignUp ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <p className="auth-switch">
          {isSignUp ? 'Already have an account?' : 'Do not have an account?'}
          {' '}
          <button type="button" className="auth-switch__btn" onClick={toggleMode}>
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </section>

      <section className="auth-panel auth-panel--context" aria-hidden>
        <div className="auth-context__content">
          <h2>Review Contracts with Confidence</h2>
          <p>
            Store your profile securely, continue from where you left off, and keep your contract analysis
            workflow private and protected.
          </p>

          <div className="auth-metrics">
            <div className="auth-metric">
              <span className="auth-metric__value">50,000+</span>
              <span className="auth-metric__label">Contracts Reviewed</span>
            </div>
            <div className="auth-metric">
              <span className="auth-metric__value">$2,400</span>
              <span className="auth-metric__label">Avg. Negotiation Impact</span>
            </div>
            <div className="auth-metric">
              <span className="auth-metric__value">4.9/5</span>
              <span className="auth-metric__label">User Satisfaction</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
