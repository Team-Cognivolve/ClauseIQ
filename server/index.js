import process from 'node:process';
import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { CopilotClient, approveAll } from '@github/copilot-sdk';
import {
  extractJSON,
  normalizeApiPayload,
} from '../src/utils/analysisPayload.js';
import {
  SYSTEM_PROMPT,
  buildClauseAnalysisPrompt,
} from '../src/utils/constants.js';

const app = express();
const port = Number(process.env.COPILOT_SERVER_PORT || 8787);
const githubClientId = String(process.env.GITHUB_COPILOT_CLIENT_ID || '').trim();
const githubDeviceScope = String(process.env.GITHUB_COPILOT_DEVICE_SCOPE || 'read:user').trim();
const clientCache = new Map();

function isConfiguredGitHubClientId(value) {
  if (!value) return false;

  const normalized = value.toLowerCase();
  if (normalized === 'your_github_oauth_app_client_id_here') return false;
  if (normalized.includes('your_') && normalized.includes('_here')) return false;
  if (normalized.includes('client_id') && normalized.includes('here')) return false;

  return true;
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

function buildDevicePayload(extra = {}) {
  const payload = new URLSearchParams({
    client_id: githubClientId,
    ...extra,
  });

  if (githubDeviceScope) {
    payload.set('scope', githubDeviceScope);
  }

  return payload;
}

function getClient(token) {
  if (clientCache.has(token)) {
    return clientCache.get(token);
  }

  const client = new CopilotClient({
    githubToken: token,
    useLoggedInUser: false,
    logLevel: 'error',
  });

  clientCache.set(token, client);
  return client;
}

async function stopAllClients() {
  const stopPromises = Array.from(clientCache.values()).map(async (client) => {
    try {
      await client.stop();
    } catch {
      return null;
    }
    return null;
  });

  await Promise.all(stopPromises);
  clientCache.clear();
}

app.get('/api/github-copilot/config', (_req, res) => {
  if (!isConfiguredGitHubClientId(githubClientId)) {
    return jsonError(
      res,
      500,
      'Invalid GITHUB_COPILOT_CLIENT_ID. Set it to your real GitHub OAuth App client ID in .env.',
    );
  }

  return res.json({
    enabled: true,
    verificationUri: 'https://github.com/login/device',
  });
});

app.post('/api/github-copilot/device/start', async (_req, res) => {
  if (!isConfiguredGitHubClientId(githubClientId)) {
    return jsonError(
      res,
      500,
      'Invalid GITHUB_COPILOT_CLIENT_ID. Set it to your real GitHub OAuth App client ID in .env.',
    );
  }

  try {
    const response = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: buildDevicePayload(),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return jsonError(res, response.status, data?.error_description || 'Failed to start GitHub device authorization.');
    }

    return res.json({
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresIn: data.expires_in,
      interval: data.interval,
    });
  } catch (error) {
    return jsonError(res, 500, error.message || 'Failed to reach GitHub device authorization.');
  }
});

app.post('/api/github-copilot/device/poll', async (req, res) => {
  const deviceCode = String(req.body?.deviceCode || '').trim();

  if (!isConfiguredGitHubClientId(githubClientId)) {
    return jsonError(res, 500, 'Invalid GITHUB_COPILOT_CLIENT_ID.');
  }

  if (!deviceCode) {
    return jsonError(res, 400, 'Missing deviceCode.');
  }

  try {
    const payload = new URLSearchParams({
      client_id: githubClientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload,
    });

    const data = await response.json().catch(() => null);

    if (data?.access_token) {
      return res.json({
        status: 'success',
        accessToken: data.access_token,
        tokenType: data.token_type,
        scope: data.scope,
      });
    }

    if (data?.error === 'authorization_pending') {
      return res.json({ status: 'pending', intervalMs: 5000 });
    }

    if (data?.error === 'slow_down') {
      return res.json({ status: 'pending', intervalMs: 10000 });
    }

    return jsonError(res, 400, data?.error_description || data?.error || 'GitHub authorization failed.');
  } catch (error) {
    return jsonError(res, 500, error.message || 'Failed to poll GitHub authorization.');
  }
});

app.post('/api/github-copilot/analyze', async (req, res) => {
  const accessToken = String(req.body?.accessToken || '').trim();
  const model = String(req.body?.model || '').trim();
  const clause = req.body?.clause;

  if (!accessToken) {
    return jsonError(res, 400, 'Missing GitHub access token.');
  }

  if (!model) {
    return jsonError(res, 400, 'Missing GitHub Copilot model name.');
  }

  if (!clause || typeof clause !== 'object') {
    return jsonError(res, 400, 'Missing clause payload.');
  }

  const client = getClient(accessToken);
  const session = await client.createSession({
    model,
    onPermissionRequest: approveAll,
  });

  try {
    const prompt = `${SYSTEM_PROMPT}\n\n${buildClauseAnalysisPrompt(clause)}`;
    const response = await session.sendAndWait({ prompt });
    const content = response?.data?.content ?? '';
    const parsed = normalizeApiPayload(extractJSON(content));

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return jsonError(res, 502, 'GitHub Copilot returned an invalid analysis payload.');
    }

    return res.json({ analysis: parsed });
  } catch (error) {
    return jsonError(res, 500, error.message || 'GitHub Copilot analysis failed.');
  } finally {
    await session.disconnect().catch(() => null);
  }
});

const shutdown = async () => {
  await stopAllClients();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen(port, () => {
  console.log(`ClauseIQ Copilot server listening on http://127.0.0.1:${port}`);
});
