import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { ClauseIQ } from './components/ClauseIQ';
import { AuthPage } from './components/AuthPage';
import { ProductSelector } from './components/ProductSelector';
import { B2BAuthPage } from './components/B2BAuthPage';
import { B2BWorkspace } from './components/B2BWorkspace';
import { b2bApi } from './api/b2bClient';
import './App.css';

function normalizePath(pathname) {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  return path;
}

function resolveRoute(pathname) {
  const path = normalizePath(pathname);

  if (path === '/') return 'landing';
  if (path === '/choose') return 'selector';
  if (path === '/clauseiq' || path === '/clauseiq/auth') return 'clauseiq-auth';
  if (path === '/clauseiq/app') return 'clauseiq-app';
  if (path === '/b2b' || path === '/b2b/auth') return 'b2b-auth';
  if (path === '/b2b/app') return 'b2b-app';

  return 'landing';
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => normalizePath(window.location.pathname));
  const [authChecking, setAuthChecking] = useState(true);
  const [clauseiqUser, setClauseiqUser] = useState(null);
  const [b2bUser, setB2BUser] = useState(null);

  const route = useMemo(() => resolveRoute(currentPath), [currentPath]);

  const navigate = useCallback((path, options = {}) => {
    const normalized = normalizePath(path);
    if (options.replace) {
      window.history.replaceState({}, '', normalized);
    } else {
      window.history.pushState({}, '', normalized);
    }

    setCurrentPath(normalized);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(normalizePath(window.location.pathname));
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      try {
        const [clauseiqResponse, b2bResponse] = await Promise.all([
          fetch('/api/auth/me', { credentials: 'include' }),
          b2bApi.me().catch(() => null),
        ]);

        const clauseiqData = clauseiqResponse?.ok
          ? await clauseiqResponse.json().catch(() => null)
          : null;

        if (cancelled) return;

        setClauseiqUser(clauseiqData?.user || null);
        setB2BUser(b2bResponse?.user || null);
      } catch {
        if (cancelled) return;
        setClauseiqUser(null);
        setB2BUser(null);
      } finally {
        if (!cancelled) {
          setAuthChecking(false);
        }
      }
    };

    checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleClauseIQSignOut = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Even if logout API fails, clear local app state.
    } finally {
      setClauseiqUser(null);
      navigate('/clauseiq/auth', { replace: true });
    }
  };

  const handleB2BSignOut = async () => {
    try {
      await b2bApi.logout();
    } catch {
      // Even if logout API fails, clear local app state.
    } finally {
      setB2BUser(null);
      navigate('/b2b/auth', { replace: true });
    }
  };

  if (authChecking) {
    return (
      <div className="app-session-check">
        <p>Preparing your workspace...</p>
      </div>
    );
  }

  if (route === 'landing') {
    return <LandingPage onEnterApp={() => navigate('/choose')} />;
  }

  if (route === 'selector') {
    return (
      <ProductSelector
        onBackToLanding={() => navigate('/')}
        onChooseClauseIQ={() => navigate('/clauseiq/auth')}
        onChooseB2B={() => navigate('/b2b/auth')}
      />
    );
  }

  if (route === 'clauseiq-auth') {
    if (clauseiqUser) {
      navigate('/clauseiq/app', { replace: true });
      return null;
    }

    return <AuthPage onAuthSuccess={(user) => {
      setClauseiqUser(user || null);
      navigate('/clauseiq/app', { replace: true });
    }} onBackToLanding={() => navigate('/choose')} />;
  }

  if (route === 'clauseiq-app') {
    if (!clauseiqUser) {
      navigate('/clauseiq/auth', { replace: true });
      return null;
    }

    return <ClauseIQ onSignOut={handleClauseIQSignOut} onBackToLanding={() => navigate('/choose')} user={clauseiqUser} />;
  }

  if (route === 'b2b-auth') {
    if (b2bUser) {
      navigate('/b2b/app', { replace: true });
      return null;
    }

    return <B2BAuthPage onAuthSuccess={(user) => {
      setB2BUser(user || null);
      navigate('/b2b/app', { replace: true });
    }} onBackToSelector={() => navigate('/choose')} />;
  }

  if (route === 'b2b-app') {
    if (!b2bUser) {
      navigate('/b2b/auth', { replace: true });
      return null;
    }

    return <B2BWorkspace onSignOut={handleB2BSignOut} user={b2bUser} />;
  }

  navigate('/', { replace: true });
  return null;
}
