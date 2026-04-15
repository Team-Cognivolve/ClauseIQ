import { useCallback, useEffect, useRef, useState } from 'react';

const TOKEN_STORAGE_KEY = 'clauseiq_github_copilot_token';

function readStoredToken() {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || data?.message || 'Request failed.');
  }

  return data;
}

export function useGitHubCopilot() {
  const [accessToken, setAccessToken] = useState(() => readStoredToken());
  const [isBackendConfigured, setIsBackendConfigured] = useState(false);
  const [backendError, setBackendError] = useState(null);
  const [deviceAuth, setDeviceAuth] = useState({
    status: 'idle',
    userCode: '',
    verificationUri: '',
    error: null,
  });

  const pollingTimeoutRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      try {
        const data = await fetchJson('/api/github-copilot/config');
        if (cancelled) return;

        setIsBackendConfigured(Boolean(data.enabled));
        setBackendError(data.enabled ? null : (data.error || 'GitHub Copilot is not configured on the server.'));
      } catch (error) {
        if (cancelled) return;
        setIsBackendConfigured(false);
        setBackendError(error.message || 'GitHub Copilot service is not available. Start the local API server.');
      }
    };

    loadConfig();

    return () => {
      cancelled = true;
      if (pollingTimeoutRef.current) {
        window.clearTimeout(pollingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (accessToken) {
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    } else {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }, [accessToken]);

  const pollForToken = useCallback(async (deviceCode, intervalMs) => {
    try {
      const data = await fetchJson('/api/github-copilot/device/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceCode }),
      });

      if (data.status === 'success') {
        setAccessToken(data.accessToken);
        setDeviceAuth({
          status: 'authenticated',
          userCode: '',
          verificationUri: '',
          error: null,
        });
        return;
      }

      if (data.status === 'pending') {
        pollingTimeoutRef.current = window.setTimeout(() => {
          pollForToken(deviceCode, data.intervalMs || intervalMs);
        }, data.intervalMs || intervalMs);
        return;
      }

      throw new Error(data.error || 'GitHub authorization failed.');
    } catch (error) {
      setDeviceAuth({
        status: 'error',
        userCode: '',
        verificationUri: '',
        error: error.message,
      });
    }
  }, []);

  const startAuth = useCallback(async () => {
    if (!isBackendConfigured) {
      setDeviceAuth({
        status: 'error',
        userCode: '',
        verificationUri: '',
        error: backendError || 'GitHub Copilot is not configured on the server.',
      });
      return;
    }

    if (pollingTimeoutRef.current) {
      window.clearTimeout(pollingTimeoutRef.current);
    }

    setDeviceAuth({
      status: 'starting',
      userCode: '',
      verificationUri: '',
      error: null,
    });

    try {
      const data = await fetchJson('/api/github-copilot/device/start', {
        method: 'POST',
      });

      setDeviceAuth({
        status: 'waiting',
        userCode: data.userCode,
        verificationUri: data.verificationUri,
        error: null,
      });

      window.open(data.verificationUri, '_blank', 'noopener,noreferrer');
      pollForToken(data.deviceCode, (data.interval || 5) * 1000);
    } catch (error) {
      setDeviceAuth({
        status: 'error',
        userCode: '',
        verificationUri: '',
        error: error.message,
      });
    }
  }, [backendError, isBackendConfigured, pollForToken]);

  const disconnect = useCallback(() => {
    if (pollingTimeoutRef.current) {
      window.clearTimeout(pollingTimeoutRef.current);
    }

    setAccessToken('');
    setDeviceAuth({
      status: 'idle',
      userCode: '',
      verificationUri: '',
      error: null,
    });
  }, []);

  const analyzeClause = useCallback(async (clause, modelName) => {
    if (!accessToken) {
      throw new Error('Authenticate with GitHub Copilot before analyzing clauses.');
    }

    if (!modelName || !modelName.trim()) {
      throw new Error('Enter a GitHub Copilot model name.');
    }

    const data = await fetchJson('/api/github-copilot/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken,
        model: modelName.trim(),
        clause,
      }),
    });

    return data.analysis;
  }, [accessToken]);

  return {
    analyzeClause,
    startAuth,
    disconnect,
    accessToken,
    isAuthenticated: Boolean(accessToken),
    isAuthorizing: deviceAuth.status === 'starting' || deviceAuth.status === 'waiting',
    isConfigured: isBackendConfigured,
    configurationError: backendError,
    deviceAuth,
  };
}
