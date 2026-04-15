import React, { useEffect, useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { ClauseIQ } from './components/ClauseIQ';
import { AuthPage } from './components/AuthPage';
import './App.css';

export default function App() {
  const [screen, setScreen] = useState('landing');
  const [authChecking, setAuthChecking] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
        });

        if (!response.ok) {
          if (!cancelled) {
            setUser(null);
            setScreen('landing');
          }
          return;
        }

        const data = await response.json().catch(() => null);
        if (!cancelled && data?.user) {
          setUser(data.user);
          setScreen('analysis');
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setScreen('landing');
        }
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

  const handleEnterApp = () => {
    if (user) {
      setScreen('analysis');
      return;
    }

    setScreen('auth');
  };

  const handleAuthSuccess = (authenticatedUser) => {
    setUser(authenticatedUser || null);
    setScreen('analysis');
  };

  const handleBackToLanding = () => {
    setScreen('landing');
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Even if logout API fails, clear local app state.
    } finally {
      setUser(null);
      setScreen('auth');
    }
  };

  if (authChecking) {
    return (
      <div className="app-session-check">
        <p>Preparing your workspace...</p>
      </div>
    );
  }

  if (screen === 'landing') {
    return <LandingPage onEnterApp={handleEnterApp} />;
  }

  if (screen === 'auth' || !user) {
    return <AuthPage onAuthSuccess={handleAuthSuccess} onBackToLanding={handleBackToLanding} />;
  }

  return <ClauseIQ onSignOut={handleSignOut} onBackToLanding={handleBackToLanding} user={user} />;
}
