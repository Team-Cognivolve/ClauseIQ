import process from 'node:process';
import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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
const mongoUri = String(process.env.MONGODB_URI || '').trim();
const jwtSecret = String(process.env.JWT_SECRET || '').trim();
const jwtCookieName = 'clauseiq_auth';
const clientCache = new Map();

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 255 },
    passwordHash: { type: String, required: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const User = mongoose.models.User || mongoose.model('User', userSchema);
const HISTORY_LIMIT = 50;
const HISTORY_RISK_LEVELS = new Set(['High', 'Medium', 'Low']);

const reviewHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    entryId: { type: String, required: true, trim: true, maxlength: 80 },
    fileName: { type: String, required: true, trim: true, maxlength: 260 },
    analyzedAt: { type: Date, required: true },
    summary: {
      high: { type: Number, required: true, min: 0 },
      medium: { type: Number, required: true, min: 0 },
      low: { type: Number, required: true, min: 0 },
      overallRisk: { type: String, required: true, enum: ['High', 'Medium', 'Low'] },
    },
    results: [
      {
        _clauseId: { type: String, default: '' },
        clause_type: { type: String, required: true, default: 'General Clause' },
        clause_text: { type: String, default: '' },
        explanation: { type: String, default: '' },
        negotiation: { type: String, default: '' },
        risk_level: { type: String, required: true, enum: ['High', 'Medium', 'Low'] },
      },
    ],
  },
  { timestamps: true },
);

reviewHistorySchema.index({ userId: 1, entryId: 1 }, { unique: true });

const ReviewHistory = mongoose.models.ReviewHistory || mongoose.model('ReviewHistory', reviewHistorySchema);

function safeTrimmedString(value, fallback = '', maxLength = 5000) {
  const normalized = String(value ?? fallback).trim();
  return normalized.slice(0, maxLength);
}

function toNonNegativeNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function normalizeRiskLevel(value, fallback = 'Medium') {
  return HISTORY_RISK_LEVELS.has(value) ? value : fallback;
}

function sanitizeHistoryEntry(input) {
  const entry = input && typeof input === 'object' ? input : null;
  if (!entry) return null;

  const entryId = safeTrimmedString(entry.id, '', 80);
  const fileName = safeTrimmedString(entry.fileName, '', 260);
  const analyzedAtRaw = new Date(entry.analyzedAt);
  const analyzedAt = Number.isNaN(analyzedAtRaw.getTime()) ? null : analyzedAtRaw;
  const summaryInput = entry.summary && typeof entry.summary === 'object' ? entry.summary : null;
  const resultsInput = Array.isArray(entry.results) ? entry.results : null;

  if (!entryId || !fileName || !analyzedAt || !summaryInput || !resultsInput) {
    return null;
  }

  const high = toNonNegativeNumber(summaryInput.high);
  const medium = toNonNegativeNumber(summaryInput.medium);
  const low = toNonNegativeNumber(summaryInput.low);
  const overallRisk = normalizeRiskLevel(summaryInput.overallRisk, high > 0 ? 'High' : (medium > 0 ? 'Medium' : 'Low'));

  const results = resultsInput.slice(0, 300).map((item, index) => {
    const riskLevel = normalizeRiskLevel(item?.risk_level, 'Medium');
    return {
      _clauseId: safeTrimmedString(item?._clauseId, `${entryId}-${index}`, 80),
      clause_type: safeTrimmedString(item?.clause_type, 'General Clause', 160),
      clause_text: safeTrimmedString(item?.clause_text, '', 20000),
      explanation: safeTrimmedString(item?.explanation, '', 20000),
      negotiation: safeTrimmedString(item?.negotiation, '', 20000),
      risk_level: riskLevel,
    };
  });

  return {
    entryId,
    fileName,
    analyzedAt,
    summary: {
      high,
      medium,
      low,
      overallRisk,
    },
    results,
  };
}

function toHistoryResponse(doc) {
  return {
    id: doc.entryId,
    fileName: doc.fileName,
    analyzedAt: doc.analyzedAt,
    summary: doc.summary,
    results: doc.results,
  };
}

function isConfiguredGitHubClientId(value) {
  if (!value) return false;

  const normalized = value.toLowerCase();
  if (normalized === 'your_github_oauth_app_client_id_here') return false;
  if (normalized.includes('your_') && normalized.includes('_here')) return false;
  if (normalized.includes('client_id') && normalized.includes('here')) return false;

  return true;
}

function isConfiguredMongoUri(value) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  if (normalized.includes('your_mongodb_uri_here')) return false;
  if (normalized.includes('<db_password>')) return false;
  return normalized.startsWith('mongodb://') || normalized.startsWith('mongodb+srv://');
}

function isConfiguredJwtSecret(value) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return !normalized.includes('your_jwt_secret_here') && value.length >= 16;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validatePassword(value) {
  return typeof value === 'string' && value.length >= 8;
}

function signAuthToken(userId) {
  return jwt.sign({ sub: userId }, jwtSecret, {
    expiresIn: '7d',
    issuer: 'clauseiq',
  });
}

function setAuthCookie(res, token) {
  res.cookie(jwtCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie(jwtCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}

async function requireAuth(req, res, next) {
  const token = req.cookies?.[jwtCookieName];
  if (!token) {
    return jsonError(res, 401, 'Authentication required.');
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await User.findById(payload.sub).select('_id name email createdAt lastLoginAt').lean();
    if (!user) {
      return jsonError(res, 401, 'Invalid auth session.');
    }

    req.authUser = user;
    return next();
  } catch {
    return jsonError(res, 401, 'Invalid auth session.');
  }
}

async function connectMongo() {
  if (!isConfiguredMongoUri(mongoUri)) {
    throw new Error('Invalid MONGODB_URI. Set your MongoDB Atlas connection string in .env.');
  }

  if (!isConfiguredJwtSecret(jwtSecret)) {
    throw new Error('Invalid JWT_SECRET. Set a strong secret with at least 16 characters in .env.');
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });
}

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));

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

app.post('/api/auth/signup', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!name) {
    return jsonError(res, 400, 'Name is required.');
  }

  if (!email || !email.includes('@')) {
    return jsonError(res, 400, 'Valid email is required.');
  }

  if (!validatePassword(password)) {
    return jsonError(res, 400, 'Password must be at least 8 characters long.');
  }

  try {
    const existing = await User.findOne({ email }).select('_id').lean();
    if (existing) {
      return jsonError(res, 409, 'An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await User.create({
      name,
      email,
      passwordHash,
      lastLoginAt: new Date(),
    });

    const token = signAuthToken(created._id.toString());
    setAuthCookie(res, token);

    return res.status(201).json({
      user: {
        id: created._id,
        name: created.name,
        email: created.email,
        createdAt: created.createdAt,
        lastLoginAt: created.lastLoginAt,
      },
    });
  } catch (error) {
    return jsonError(res, 500, error.message || 'Failed to create account.');
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return jsonError(res, 400, 'Email and password are required.');
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return jsonError(res, 401, 'Invalid email or password.');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return jsonError(res, 401, 'Invalid email or password.');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signAuthToken(user._id.toString());
    setAuthCookie(res, token);

    return res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (error) {
    return jsonError(res, 500, error.message || 'Failed to sign in.');
  }
});

app.post('/api/auth/logout', (_req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  return res.json({ user: req.authUser });
});

app.get('/api/history', requireAuth, async (req, res) => {
  try {
    const entries = await ReviewHistory.find({ userId: req.authUser._id })
      .sort({ analyzedAt: -1 })
      .limit(HISTORY_LIMIT)
      .lean();

    return res.json({
      entries: entries.map(toHistoryResponse),
    });
  } catch (error) {
    return jsonError(res, 500, error.message || 'Failed to load review history.');
  }
});

app.post('/api/history', requireAuth, async (req, res) => {
  const sanitized = sanitizeHistoryEntry(req.body?.entry);
  if (!sanitized) {
    return jsonError(res, 400, 'Invalid history entry payload.');
  }

  try {
    const saved = await ReviewHistory.findOneAndUpdate(
      {
        userId: req.authUser._id,
        entryId: sanitized.entryId,
      },
      {
        $set: sanitized,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ).lean();

    return res.status(201).json({
      entry: toHistoryResponse(saved),
    });
  } catch (error) {
    return jsonError(res, 500, error.message || 'Failed to save review history.');
  }
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

app.post('/api/github-copilot/analyze', requireAuth, async (req, res) => {
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
  await mongoose.disconnect().catch(() => null);
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

connectMongo()
  .then(() => {
    app.listen(port, () => {
      console.log(`ClauseIQ Copilot server listening on http://127.0.0.1:${port}`);
    });
  })
  .catch((error) => {
    console.error(error.message || 'Failed to start ClauseIQ server.');
    process.exit(1);
  });
