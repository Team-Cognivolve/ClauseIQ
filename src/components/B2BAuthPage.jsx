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
    isSignUp ? 'Create B2B Workspace Account' : 'Sign In To B2B Workspace'
  ), [isSignUp]);

  const subtitle = useMemo(() => (
    isSignUp
      ? 'Set up your organization profile and run policy-based contract compliance checks.'
      : 'Continue with your B2B compliance workspace.'
  ), [isSignUp]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function toggleMode() {
    setError('');
    setMode((prev) => (prev === 'signin' ? 'signup' : 'signin'));
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
    <div className="b2b-auth">
      <section className="b2b-auth__panel">
        <button type="button" className="b2b-auth__back" onClick={onBackToSelector}>
          <span aria-hidden>←</span> Back
        </button>

        <p className="b2b-auth__eyebrow">B2B Compliance</p>
        <h1 className="b2b-auth__title">{title}</h1>
        <p className="b2b-auth__subtitle">{subtitle}</p>

        <form className="b2b-auth__form" onSubmit={submit}>
          {isSignUp && (
            <>
              <label>
                <span>Contact Name</span>
                <input name="name" value={form.name} onChange={updateField} placeholder="Your full name" />
              </label>

              <label>
                <span>Company Name</span>
                <input name="companyName" value={form.companyName} onChange={updateField} placeholder="Acme Pvt Ltd" />
              </label>

              <label>
                <span>Industry</span>
                <input name="industry" value={form.industry} onChange={updateField} placeholder="SaaS, Healthcare, Fintech" />
              </label>
            </>
          )}

          <label>
            <span>Work Email</span>
            <input type="email" name="email" value={form.email} onChange={updateField} placeholder="you@company.com" />
          </label>

          <label>
            <span>Password</span>
            <input type="password" name="password" value={form.password} onChange={updateField} placeholder="At least 8 characters" />
          </label>

          {error && <p className="b2b-auth__error">{error}</p>}

          <button type="submit" disabled={submitting}>
            {submitting
              ? (isSignUp ? 'Creating account...' : 'Signing in...')
              : (isSignUp ? 'Create B2B Account' : 'Sign In')}
          </button>
        </form>

        <p className="b2b-auth__switch">
          {isSignUp ? 'Already have an account?' : 'Need a B2B account?'}
          {' '}
          <button type="button" onClick={toggleMode}>{isSignUp ? 'Sign In' : 'Sign Up'}</button>
        </p>
      </section>
    </div>
  );
}
