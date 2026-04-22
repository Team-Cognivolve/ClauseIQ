import process from 'node:process';
import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { CopilotClient, approveAll } from '@github/copilot-sdk';
import {
  extractJSON,
  normalizeApiPayload,
} from '../src/utils/analysisPayload.js';
import {
  detectRiskByPattern,
  generateFallbackAnalysis,
  SYSTEM_PROMPT,
  buildClauseAnalysisPrompt,
} from '../src/utils/constants.js';
import {
  extractClauses,
  filterSubstantiveClauses,
  normalizeClauseAnalysis,
  validateAndEnrichAnalysis,
} from '../src/utils/rag.js';

const app = express();
const port = Number(process.env.COPILOT_SERVER_PORT || 8787);
const githubClientId = String(process.env.GITHUB_COPILOT_CLIENT_ID || '').trim();
const githubDeviceScope = String(process.env.GITHUB_COPILOT_DEVICE_SCOPE || 'read:user').trim();
const mongoUri = String(process.env.MONGODB_URI || '').trim();
const jwtSecret = String(process.env.JWT_SECRET || '').trim();
const tavilyApiKey = String(process.env.TAVILY_API_KEY || '').trim();
const jwtCookieName = 'clauseiq_auth';
const b2bJwtCookieName = 'clauseiq_b2b_auth';
const clientCache = new Map();
const JURISDICTION_CONTEXT_TTL_MS = 30 * 60 * 1000;
const JURISDICTION_PAIR_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const jurisdictionContextStore = new Map();
const jurisdictionPairCache = new Map();

const COUNTRY_ALIASES = new Map([
  ['india', 'India'],
  ['indian', 'India'],
  ['united states', 'United States'],
  ['usa', 'United States'],
  ['u.s.a', 'United States'],
  ['us', 'United States'],
  ['u.s.', 'United States'],
  ['america', 'United States'],
  ['california', 'United States'],
  ['new york', 'United States'],
  ['delaware', 'United States'],
  ['texas', 'United States'],
  ['canada', 'Canada'],
  ['ontario', 'Canada'],
  ['britain', 'United Kingdom'],
  ['uk', 'United Kingdom'],
  ['u.k.', 'United Kingdom'],
  ['united kingdom', 'United Kingdom'],
  ['england', 'United Kingdom'],
  ['wales', 'United Kingdom'],
  ['scotland', 'United Kingdom'],
  ['ireland', 'Ireland'],
  ['australia', 'Australia'],
  ['new zealand', 'New Zealand'],
  ['singapore', 'Singapore'],
  ['japan', 'Japan'],
  ['china', 'China'],
  ['people\'s republic of china', 'China'],
  ['prc', 'China'],
  ['south korea', 'South Korea'],
  ['republic of korea', 'South Korea'],
  ['korea, republic of', 'South Korea'],
  ['germany', 'Germany'],
  ['france', 'France'],
  ['spain', 'Spain'],
  ['italy', 'Italy'],
  ['switzerland', 'Switzerland'],
  ['netherlands', 'Netherlands'],
  ['sweden', 'Sweden'],
  ['norway', 'Norway'],
  ['denmark', 'Denmark'],
  ['belgium', 'Belgium'],
  ['austria', 'Austria'],
  ['brazil', 'Brazil'],
  ['mexico', 'Mexico'],
  ['saudi arabia', 'Saudi Arabia'],
  ['ksa', 'Saudi Arabia'],
  ['south africa', 'South Africa'],
  ['united arab emirates', 'United Arab Emirates'],
  ['uae', 'United Arab Emirates'],
]);

const JURISDICTION_TOPIC_LABELS = {
  nonCompete: 'non-compete',
  paymentNotice: 'payment and notice',
  taxCompliance: 'tax and compliance',
};

const COUNTRY_GOVERNMENT_DOMAINS = new Map([
  ['united states', [
    'dol.gov',
    'irs.gov',
    'ecfr.gov',
    'federalregister.gov',
    'justice.gov',
    'congress.gov',
    'nlrb.gov',
    'eeoc.gov',
    'uscourts.gov',
  ]],
  ['india', [
    'labour.gov.in',
    'incometax.gov.in',
    'cbdt.gov.in',
    'egazette.gov.in',
    'legislative.gov.in',
    'epfindia.gov.in',
    'indiacode.nic.in',
  ]],
  ['singapore', [
    'mom.gov.sg',
    'iras.gov.sg',
    'statutes.agc.gov.sg',
    'mof.gov.sg',
    'mlaw.gov.sg',
    'go.gov.sg',
  ]],
  ['united kingdom', [
    'gov.uk',
    'legislation.gov.uk',
    'hmrc.gov.uk',
    'acas.org.uk',
  ]],
  ['canada', [
    'canada.ca',
    'justice.gc.ca',
    'laws-lois.justice.gc.ca',
    'cra-arc.gc.ca',
    'gazette.gc.ca',
  ]],
  ['australia', [
    'fairwork.gov.au',
    'ato.gov.au',
    'legislation.gov.au',
    'fwc.gov.au',
  ]],
  ['new zealand', [
    'employment.govt.nz',
    'ird.govt.nz',
    'legislation.govt.nz',
    'mbie.govt.nz',
  ]],
  ['china', [
    'gov.cn',
    'mohrss.gov.cn',
    'chinatax.gov.cn',
    'npc.gov.cn',
  ]],
  ['south korea', [
    'moel.go.kr',
    'nts.go.kr',
    'law.go.kr',
    'moef.go.kr',
  ]],
  ['germany', [
    'gesetze-im-internet.de',
    'bundesregierung.de',
    'bmj.de',
    'zoll.de',
    'arbeitsagentur.de',
  ]],
  ['france', [
    'legifrance.gouv.fr',
    'travail-emploi.gouv.fr',
    'impots.gouv.fr',
  ]],
  ['spain', [
    'boe.es',
    'mites.gob.es',
    'hacienda.gob.es',
    'agenciatributaria.gob.es',
  ]],
  ['italy', [
    'gazzettaufficiale.it',
    'lavoro.gov.it',
    'agenziaentrate.gov.it',
    'normattiva.it',
  ]],
  ['switzerland', [
    'admin.ch',
    'seco.admin.ch',
    'estv.admin.ch',
  ]],
  ['netherlands', [
    'government.nl',
    'rijksoverheid.nl',
    'belastingdienst.nl',
  ]],
  ['sweden', [
    'regeringen.se',
    'riksdagen.se',
    'skatteverket.se',
    'av.se',
  ]],
  ['norway', [
    'regjeringen.no',
    'lovdata.no',
    'skatteetaten.no',
    'arbeidstilsynet.no',
  ]],
  ['denmark', [
    'retsinformation.dk',
    'skat.dk',
    'bm.dk',
    'workindenmark.dk',
  ]],
  ['belgium', [
    'belgium.be',
    'fin.belgium.be',
    'emploi.belgique.be',
    'ejustice.just.fgov.be',
  ]],
  ['austria', [
    'ris.bka.gv.at',
    'bmf.gv.at',
    'oesterreich.gv.at',
  ]],
  ['ireland', [
    'gov.ie',
    'revenue.ie',
    'workplacerelations.ie',
  ]],
  ['brazil', [
    'gov.br',
    'planalto.gov.br',
    'receitafederal.gov.br',
    'camara.leg.br',
  ]],
  ['mexico', [
    'gob.mx',
    'sat.gob.mx',
    'diputados.gob.mx',
    'dof.gob.mx',
  ]],
  ['saudi arabia', [
    'gov.sa',
    'mhrsd.gov.sa',
    'zatca.gov.sa',
  ]],
  ['south africa', [
    'gov.za',
    'labour.gov.za',
    'sars.gov.za',
    'justice.gov.za',
  ]],
  ['united arab emirates', [
    'u.ae',
    'mohre.gov.ae',
    'tax.gov.ae',
    'moj.gov.ae',
  ]],
  ['japan', [
    'mhlw.go.jp',
    'nta.go.jp',
    'elaws.e-gov.go.jp',
    'mof.go.jp',
  ]],
]);

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

const b2bUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 255 },
    passwordHash: { type: String, required: true },
    companyName: { type: String, required: true, trim: true, maxlength: 160 },
    industry: { type: String, default: '', trim: true, maxlength: 160 },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const B2BUser = mongoose.models.B2BUser || mongoose.model('B2BUser', b2bUserSchema);
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
const B2B_POLICY_TYPES = ['freelancers', 'employees', 'vendors'];
const B2B_POLICY_TYPE_SET = new Set(B2B_POLICY_TYPES);

const companyProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
    companyName: { type: String, default: '', trim: true, maxlength: 160 },
    industry: { type: String, default: '', trim: true, maxlength: 160 },
    defaultPolicyNotes: { type: String, default: '', trim: true, maxlength: 4000 },
  },
  { timestamps: true },
);

const policyChunkSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true, min: 0 },
    text: { type: String, required: true, default: '', maxlength: 2000 },
  },
  { _id: false },
);

const b2bPolicySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    policyId: { type: String, required: true, trim: true, maxlength: 120 },
    policyType: { type: String, required: true, enum: B2B_POLICY_TYPES },
    fileName: { type: String, required: true, trim: true, maxlength: 260 },
    chunksStored: { type: Number, required: true, min: 1, max: 1000 },
    estimatedTokensStored: { type: Number, required: true, min: 1, max: 500000 },
    summary: { type: String, default: '', maxlength: 400 },
    chunks: { type: [policyChunkSchema], default: [] },
  },
  { timestamps: true },
);

b2bPolicySchema.index({ userId: 1, policyType: 1, createdAt: -1 });
b2bPolicySchema.index({ userId: 1, policyId: 1 }, { unique: true });

const b2bReviewSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    reviewId: { type: String, required: true, trim: true, maxlength: 120 },
    fileName: { type: String, required: true, trim: true, maxlength: 260 },
    policyType: { type: String, required: true, enum: B2B_POLICY_TYPES },
    contractSketch: { type: Object, required: true },
    clauseEvidenceMap: { type: Object, required: true },
    analysis: { type: Object, required: true },
    contractExcerpt: { type: String, default: '', maxlength: 12000 },
  },
  { timestamps: true },
);

b2bReviewSchema.index({ userId: 1, reviewId: 1 }, { unique: true });
b2bReviewSchema.index({ userId: 1, createdAt: -1 });

const CompanyProfile = mongoose.models.CompanyProfile || mongoose.model('CompanyProfile', companyProfileSchema);
const B2BPolicy = mongoose.models.B2BPolicy || mongoose.model('B2BPolicy', b2bPolicySchema);
const B2BReview = mongoose.models.B2BReview || mongoose.model('B2BReview', b2bReviewSchema);
const b2bUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

function sanitizeText(input) {
  return String(input || '')
    .split('\0').join('')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ *\n */g, '\n')
    .trim();
}

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

function chunkText(text, chunkSize = 900, overlap = 150) {
  const cleaned = sanitizeText(text);
  if (!cleaned) return [];

  const chunks = [];
  let start = 0;

  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    chunks.push(cleaned.slice(start, end));
    if (end === cleaned.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

function createEphemeralId(prefix = 'ctx') {
  return globalThis.crypto?.randomUUID?.()
    || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeLocationText(value) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toCountry(locationText) {
  const location = normalizeLocationText(locationText).toLowerCase();
  if (!location) return '';

  for (const [alias, country] of COUNTRY_ALIASES.entries()) {
    if (location === alias || location.includes(` ${alias}`) || location.includes(`${alias} `) || location.includes(`, ${alias}`)) {
      return country;
    }
  }

  const cleaned = location
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (COUNTRY_ALIASES.has(cleaned)) {
    return COUNTRY_ALIASES.get(cleaned);
  }

  return '';
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return fallback;
}

function normalizeCountryCandidate(value) {
  const normalized = normalizeLocationText(value);
  if (!normalized) return '';

  const mapped = toCountry(normalized);
  if (mapped) return mapped;

  const cleaned = normalized
    .replace(/\b(the|republic\s+of|federal\s+republic\s+of|state\s+of|states\s+of|kingdom\s+of|islamic\s+republic\s+of|democratic\s+republic\s+of)\b/gi, ' ')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  return cleaned
    .split(' ')
    .map((part) => (part.length <= 3
      ? part.toUpperCase()
      : `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`))
    .join(' ');
}

function buildCountryComparisonKey(value) {
  const normalized = normalizeCountryCandidate(value).toLowerCase();
  if (!normalized) return '';

  return normalized
    .replace(/\b(the|republic|federal|democratic|kingdom|state|states|islamic|of|and)\b/g, ' ')
    .replace(/[^a-z]/g, '');
}

function areCountriesEquivalent(leftCountry, rightCountry) {
  const leftKey = buildCountryComparisonKey(leftCountry);
  const rightKey = buildCountryComparisonKey(rightCountry);

  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;

  return leftKey.length >= 6
    && rightKey.length >= 6
    && (leftKey.includes(rightKey) || rightKey.includes(leftKey));
}

function buildClauseCorpusForJurisdiction(contractText) {
  const clauses = filterSubstantiveClauses(extractClauses(contractText));
  if (clauses.length === 0) {
    return sanitizeText(contractText).slice(0, 140000);
  }

  return clauses
    .map((clause, index) => {
      const clauseText = safeTrimmedString(clause?.cleanText || clause?.text || '', '', 2200);
      return `Clause ${index + 1}: ${clauseText}`;
    })
    .join('\n\n')
    .slice(0, 140000);
}

async function extractGoverningLawSignalWithAI({ accessToken, model, contractText }) {
  const clauseCorpus = buildClauseCorpusForJurisdiction(contractText);
  if (!clauseCorpus) {
    return {
      location: '',
      country: '',
      source: 'ai',
      evidence: '',
    };
  }

  const prompt = [
    'Extract the governing law jurisdiction country from these contract clauses.',
    'Return ONLY minified JSON with exactly these keys: {"location":"","country":""}.',
    'Rules:',
    '- location: the exact governing-law place text if present.',
    '- country: country name only (for example: India, United States, Singapore).',
    '- If governing law is missing, return empty strings.',
    '',
    'Contract clauses:',
    clauseCorpus,
  ].join('\n');

  const raw = await runCopilotPrompt({ accessToken, model, prompt });
  const parsed = normalizeApiPayload(extractJSON(raw)) || {};

  const location = normalizeLocationText(
    parsed.location || parsed.governingLaw || parsed.governing_law || parsed.jurisdiction || '',
  );
  const country = normalizeCountryCandidate(
    parsed.country || parsed.governingCountry || parsed.governing_country || location,
  );

  return {
    location: location || country,
    country,
    source: 'ai',
    evidence: safeTrimmedString(raw, '', 260),
  };
}

function cleanupJurisdictionCaches() {
  const now = Date.now();

  for (const [id, context] of jurisdictionContextStore.entries()) {
    if (now - context.createdAt > JURISDICTION_CONTEXT_TTL_MS) {
      jurisdictionContextStore.delete(id);
    }
  }

  for (const [key, item] of jurisdictionPairCache.entries()) {
    if (now - item.createdAt > JURISDICTION_PAIR_CACHE_TTL_MS) {
      jurisdictionPairCache.delete(key);
    }
  }
}

function getJurisdictionContext(contextId) {
  if (!contextId) return null;
  cleanupJurisdictionCaches();
  return jurisdictionContextStore.get(contextId) || null;
}

function detectJurisdictionTopic(clause) {
  const text = String(clause?.cleanText || clause?.text || '').toLowerCase();
  if (!text) return '';

  if (/(non[-\s]?compete|non[-\s]?solicit|restrict\s+competition|restraint\s+of\s+trade)/i.test(text)) {
    return 'nonCompete';
  }

  if (/(payment|invoice|fee|compensation|net\s+\d+|notice\s+period|termination\s+notice|late\s+fee)/i.test(text)) {
    return 'paymentNotice';
  }

  if (/(tax|withholding|tds|compliance|deduct\w*\s+tax|social\s+security|statutory)/i.test(text)) {
    return 'taxCompliance';
  }

  return '';
}

function buildJurisdictionPromptBlock(context, topic) {
  if (!context || !topic) return '';

  const summary = context.summaries?.[topic];
  if (!summary?.text) return '';

  const topicLabel = JURISDICTION_TOPIC_LABELS[topic] || topic;

  return [
    'Jurisdiction context (only for this clause if relevant):',
    `- Governing law country: ${context.governingCountry}`,
    `- Freelancer residence country: ${context.freelancerCountry}`,
    `- ${topicLabel} summary: ${summary.text}`,
    summary.referenceUrl ? `- Reference: ${summary.referenceUrl}` : '',
    'Ignore this context if it does not apply to the clause.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildJurisdictionPairKey(governingCountry, freelancerCountry) {
  return `${String(governingCountry || '').toLowerCase()}::${String(freelancerCountry || '').toLowerCase()}`;
}

function normalizeHost(value) {
  return String(value || '').trim().toLowerCase().replace(/^www\./, '');
}

function getGovernmentDomainsForCountry(country) {
  const key = String(country || '').trim().toLowerCase();
  const domains = COUNTRY_GOVERNMENT_DOMAINS.get(key) || [];
  return domains.map((domain) => normalizeHost(domain)).filter(Boolean);
}

function isAllowedGovernmentDomain(hostname, allowedDomains) {
  if (!hostname || !Array.isArray(allowedDomains) || allowedDomains.length === 0) return false;

  return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function isGovernmentLikeHostname(hostname) {
  if (!hostname) return false;

  return (
    /(^|\.)gov\.[a-z]{2,}$/i.test(hostname)
    || /(^|\.)govt\.[a-z]{2,}$/i.test(hostname)
    || /(^|\.)gouv\.fr$/i.test(hostname)
    || /(^|\.)gc\.ca$/i.test(hostname)
    || hostname === 'canada.ca'
    || hostname.endsWith('.canada.ca')
    || hostname === 'gov.ie'
    || hostname.endsWith('.gov.ie')
    || hostname === 'government.nl'
    || hostname.endsWith('.government.nl')
    || hostname === 'rijksoverheid.nl'
    || hostname.endsWith('.rijksoverheid.nl')
    || hostname === 'u.ae'
    || hostname.endsWith('.u.ae')
    || hostname === 'go.jp'
    || hostname.endsWith('.go.jp')
  );
}

function isOfficialGovernmentUrl(url, allowedDomains = []) {
  const value = String(url || '').trim();
  if (!value) return false;

  try {
    const parsed = new URL(value);
    const hostname = normalizeHost(parsed.hostname);
    if (!hostname) return false;

    if (isAllowedGovernmentDomain(hostname, allowedDomains)) {
      return true;
    }

    return isGovernmentLikeHostname(hostname);
  } catch {
    return false;
  }
}

async function searchTavily(query, options = {}) {
  const allowedDomains = [...new Set(
    (Array.isArray(options?.allowedDomains) ? options.allowedDomains : [])
      .map((domain) => normalizeHost(domain))
      .filter(Boolean),
  )];

  const runSearch = async (includeDomains = []) => {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query,
        search_depth: 'advanced',
        max_results: 16,
        include_answer: false,
        include_images: false,
        ...(includeDomains.length > 0 ? { include_domains: includeDomains } : {}),
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = data?.detail || data?.error || 'Tavily request failed.';
      throw new Error(message);
    }

    const items = Array.isArray(data?.results) ? data.results : [];
    return items
      .map((item) => ({
        title: safeTrimmedString(item?.title, '', 180),
        url: safeTrimmedString(item?.url, '', 500),
        content: safeTrimmedString(item?.content, '', 800),
      }))
      .filter((item) => isOfficialGovernmentUrl(item.url, includeDomains))
      .slice(0, 5);
  };

  if (allowedDomains.length > 0) {
    const strict = await runSearch(allowedDomains);
    if (strict.length > 0) {
      return strict;
    }
  }

  return runSearch([]);
}

function summarizeJurisdictionResearch(results, fallbackTitle) {
  const top = Array.isArray(results)
    ? results.slice(0, 5).map((item) => ({
      title: safeTrimmedString(item?.title, '', 180),
      url: safeTrimmedString(item?.url, '', 500),
      snippet: safeTrimmedString(item?.content, '', 260),
    }))
    : [];
  const snippets = top
    .map((item) => item.snippet)
    .filter(Boolean);

  const text = snippets.length
    ? snippets.join(' ')
    : `No specific ${fallbackTitle} guidance was found in the quick legal scout.`;

  return {
    text,
    referenceUrl: safeTrimmedString(top[0]?.url, '', 500),
    sources: top,
  };
}

async function getOrCreateJurisdictionSummary({ governingCountry, freelancerCountry }) {
  cleanupJurisdictionCaches();

  const pairKey = buildJurisdictionPairKey(governingCountry, freelancerCountry);
  const cached = jurisdictionPairCache.get(pairKey);
  if (cached && Date.now() - cached.createdAt <= JURISDICTION_PAIR_CACHE_TTL_MS) {
    return {
      summaries: cached.summaries,
      insights: Array.isArray(cached.insights) ? cached.insights : [],
      cacheHit: true,
    };
  }

  const governingGovernmentDomains = getGovernmentDomainsForCountry(governingCountry);
  const freelancerGovernmentDomains = getGovernmentDomainsForCountry(freelancerCountry);
  const combinedGovernmentDomains = [...new Set([...governingGovernmentDomains, ...freelancerGovernmentDomains])];

  const nonCompeteQuery = `Official government guidance on enforceability of non-compete clauses for independent contractors in ${governingCountry} 2026.`;
  const paymentNoticeQuery = `Official government rules on minimum notice period and payment protections for freelancers in ${governingCountry}.`;
  const taxComplianceQuery = `Official government tax authority guidance on withholding tax requirements for payments from ${freelancerCountry} to independent contractors in ${governingCountry}.`;

  const [nonCompeteResults, paymentNoticeResults, taxComplianceResults] = await Promise.all([
    searchTavily(nonCompeteQuery, { allowedDomains: governingGovernmentDomains }),
    searchTavily(paymentNoticeQuery, { allowedDomains: governingGovernmentDomains }),
    searchTavily(taxComplianceQuery, { allowedDomains: combinedGovernmentDomains }),
  ]);

  const summaries = {
    nonCompete: summarizeJurisdictionResearch(nonCompeteResults, 'non-compete'),
    paymentNotice: summarizeJurisdictionResearch(paymentNoticeResults, 'payment/notice'),
    taxCompliance: summarizeJurisdictionResearch(taxComplianceResults, 'tax/compliance'),
  };

  const insights = [
    {
      topic: 'nonCompete',
      label: 'Non-compete',
      query: nonCompeteQuery,
      summary: summaries.nonCompete.text,
      sources: summaries.nonCompete.sources || [],
    },
    {
      topic: 'paymentNotice',
      label: 'Payment and Notice',
      query: paymentNoticeQuery,
      summary: summaries.paymentNotice.text,
      sources: summaries.paymentNotice.sources || [],
    },
    {
      topic: 'taxCompliance',
      label: 'Tax and Compliance',
      query: taxComplianceQuery,
      summary: summaries.taxCompliance.text,
      sources: summaries.taxCompliance.sources || [],
    },
  ];

  jurisdictionPairCache.set(pairKey, {
    createdAt: Date.now(),
    summaries,
    insights,
  });

  return { summaries, insights, cacheHit: false };
}

function resolveCopilotContext(req) {
  const accessToken = safeTrimmedString(
    req.body?.accessToken || req.headers['x-copilot-token'],
    '',
    300,
  );
  const model = safeTrimmedString(req.body?.model || req.headers['x-copilot-model'], '', 120);

  if (!accessToken) {
    return { error: 'Missing GitHub Copilot access token. Connect Copilot in the workspace first.' };
  }

  if (!model) {
    return { error: 'Missing GitHub Copilot model name.' };
  }

  return { accessToken, model };
}

async function runCopilotPrompt({ accessToken, model, prompt }) {
  const client = getClient(accessToken);
  const session = await client.createSession({
    model,
    onPermissionRequest: approveAll,
  });

  try {
    const response = await session.sendAndWait({ prompt });
    return String(response?.data?.content ?? '').trim();
  } finally {
    await session.disconnect().catch(() => null);
  }
}

async function extractTextFromPdfBuffer(buffer) {
  const parsed = await pdfParse(buffer);
  return sanitizeText(parsed?.text || '');
}

function normalizePolicyType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return B2B_POLICY_TYPE_SET.has(normalized) ? normalized : '';
}

function toPolicyListResponse(policies) {
  const grouped = {
    freelancers: [],
    employees: [],
    vendors: [],
  };

  for (const policy of policies) {
    if (!grouped[policy.policyType]) continue;

    grouped[policy.policyType].push({
      id: policy.policyId,
      fileName: policy.fileName,
      chunksStored: policy.chunksStored,
      estimatedTokensStored: policy.estimatedTokensStored,
      summary: policy.summary,
      uploadedAt: policy.createdAt,
    });
  }

  return grouped;
}

function scoreEvidenceForClause(clauseText, chunks) {
  const terms = String(clauseText || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4);
  const uniqueTerms = [...new Set(terms)].slice(0, 24);

  return chunks
    .map((chunk) => {
      const hay = String(chunk.text || '').toLowerCase();
      let hitCount = 0;

      for (const term of uniqueTerms) {
        if (hay.includes(term)) hitCount += 1;
      }

      const score = uniqueTerms.length ? hitCount / uniqueTerms.length : 0;
      return {
        score,
        text: chunk.text,
        fileName: chunk.fileName,
        chunkIndex: chunk.chunkIndex,
      };
    })
    .filter((item) => item.score >= 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function buildB2BClausePrompt({ policyType, profile, clause, evidence }) {
  const evidenceText = evidence.length
    ? evidence
      .map((item, index) => `Evidence ${index + 1} (${item.fileName}#${item.chunkIndex}): ${item.text}`)
      .join('\n\n')
    : 'No direct policy evidence found.';

  return [
    'You are a policy compliance reviewer for outgoing contracts.',
    'Assess exactly one contract clause against company policy evidence.',
    'Return ONLY JSON with this schema:',
    '{',
    '  "status": "OK" | "VIOLATION" | "NEEDS_REVIEW",',
    '  "severity": "LOW" | "MEDIUM" | "HIGH",',
    '  "reasoning": "2-4 concise sentences",',
    '  "violatedPolicy": "optional short title",',
    '  "suggestedFix": "optional 1-2 sentence actionable rewrite guidance"',
    '}',
    '',
    `Policy type: ${policyType}`,
    `Company: ${profile?.companyName || 'Unknown company'}`,
    `Industry: ${profile?.industry || 'Unknown'}`,
    `Default policy notes: ${profile?.defaultPolicyNotes || 'None'}`,
    '',
    `Clause ID: ${clause.id}`,
    `Clause text: ${clause.cleanText || clause.text}`,
    '',
    'Policy evidence:',
    evidenceText,
  ].join('\n');
}

function normalizeClauseDecision(raw, fallbackRiskLevel) {
  const parsed = normalizeApiPayload(extractJSON(raw)) || {};
  const statusText = String(parsed.status || '').toUpperCase();
  const severityText = String(parsed.severity || '').toUpperCase();

  const status = ['OK', 'VIOLATION', 'NEEDS_REVIEW'].includes(statusText)
    ? statusText
    : (fallbackRiskLevel === 'High' ? 'VIOLATION' : (fallbackRiskLevel === 'Medium' ? 'NEEDS_REVIEW' : 'OK'));
  const severity = ['LOW', 'MEDIUM', 'HIGH'].includes(severityText)
    ? severityText
    : (fallbackRiskLevel === 'High' ? 'HIGH' : (fallbackRiskLevel === 'Medium' ? 'MEDIUM' : 'LOW'));

  return {
    status,
    severity,
    reasoning: safeTrimmedString(parsed.reasoning, 'Policy check completed.', 600),
    violatedPolicy: safeTrimmedString(parsed.violatedPolicy, '', 180),
    suggestedFix: safeTrimmedString(parsed.suggestedFix, '', 500),
  };
}

async function analyzeClauseForB2B({ accessToken, model, clause, policyType, profile, evidence }) {
  const patternResult = detectRiskByPattern(clause.cleanText || clause.text || '');

  try {
    const raw = await runCopilotPrompt({
      accessToken,
      model,
      prompt: buildB2BClausePrompt({ policyType, profile, clause, evidence }),
    });

    const decision = normalizeClauseDecision(raw, patternResult.level);
    const normalizedClassic = normalizeClauseAnalysis(
      {
        clause_text: clause.cleanText || clause.text,
        clause_type: clause.header || 'General Provision',
        risk_level: decision.severity === 'HIGH' ? 'High' : (decision.severity === 'MEDIUM' ? 'Medium' : 'Low'),
        explanation: decision.reasoning,
        negotiation: decision.suggestedFix,
      },
      clause,
    );

    const enriched = normalizedClassic
      ? validateAndEnrichAnalysis(normalizedClassic, clause, patternResult)
      : { ...generateFallbackAnalysis(clause, patternResult), _clauseId: clause.id };

    return {
      clauseId: clause.id,
      status: decision.status,
      severity: decision.severity,
      evidenceCount: evidence.length,
      reasoning: enriched.explanation,
      violatedPolicy: decision.violatedPolicy,
      suggestedFix: enriched.negotiation || decision.suggestedFix,
      riskLevel: enriched.risk_level,
      clauseType: enriched.clause_type,
    };
  } catch {
    const fallback = generateFallbackAnalysis(clause, patternResult);
    return {
      clauseId: clause.id,
      status: patternResult.level === 'High' ? 'VIOLATION' : (patternResult.level === 'Medium' ? 'NEEDS_REVIEW' : 'OK'),
      severity: patternResult.level === 'High' ? 'HIGH' : (patternResult.level === 'Medium' ? 'MEDIUM' : 'LOW'),
      evidenceCount: evidence.length,
      reasoning: fallback.explanation,
      violatedPolicy: '',
      suggestedFix: fallback.negotiation,
      riskLevel: fallback.risk_level,
      clauseType: fallback.clause_type,
    };
  }
}

function buildReviewSummary({ fileName, policyType, assessments, violations }) {
  const highCount = assessments.filter((item) => item.severity === 'HIGH').length;
  const mediumCount = assessments.filter((item) => item.severity === 'MEDIUM').length;
  const lowCount = assessments.filter((item) => item.severity === 'LOW').length;
  const overallRisk = highCount > 0 ? 'HIGH' : (mediumCount > 0 ? 'MEDIUM' : 'LOW');
  const verdict = highCount > 0 ? 'HIGH_RISK' : (violations.length > 0 ? 'CHANGES_REQUIRED' : 'APPROVED');

  return {
    verdict,
    overallRisk,
    clausesReviewed: assessments.length,
    clausesFlagged: violations.length,
    severityCounts: {
      high: highCount,
      medium: mediumCount,
      low: lowCount,
    },
    confidence: assessments.length ? 0.81 : 0.5,
    executiveSummary: `Policy scan completed for ${fileName}. ${violations.length} clause(s) require attention for ${policyType} policy alignment.`,
  };
}

function toB2BReviewListItem(review) {
  return {
    id: review.reviewId,
    fileName: review.fileName,
    policyType: review.policyType,
    verdict: review.analysis?.verdict || 'UNKNOWN',
    createdAt: review.createdAt,
  };
}

function toB2BReviewResponse(review) {
  return {
    id: review.reviewId,
    fileName: review.fileName,
    policyType: review.policyType,
    contractSketch: review.contractSketch,
    clauseEvidenceMap: review.clauseEvidenceMap,
    analysis: review.analysis,
    contractExcerpt: review.contractExcerpt,
    createdAt: review.createdAt,
  };
}

const B2B_CHAT_REFUSAL = 'I can only assist with questions related to your uploaded policy documents and reviewed contracts in this B2B workspace. Please ask a compliance question based on those documents.';
const B2B_CHAT_SCOPE_KEYWORDS = [
  'policy', 'contract', 'clause', 'compliance', 'violation', 'review', 'risk',
  'freelancer', 'employee', 'vendor', 'agreement', 'obligation', 'termination',
  'liability', 'indemnity', 'confidentiality', 'ip', 'payment', 'governing law',
  'recommendation', 'citation',
];

function isB2BChatOutOfScope(question, review) {
  const q = String(question || '').toLowerCase();
  if (!q) return true;

  if (B2B_CHAT_SCOPE_KEYWORDS.some((keyword) => q.includes(keyword))) {
    return false;
  }

  const referenceText = [
    review?.fileName,
    review?.policyType,
    review?.analysis?.executiveSummary,
    ...((review?.analysis?.violations || []).map((item) => item?.title || '')),
  ]
    .map((item) => String(item || '').toLowerCase())
    .join(' ');

  const terms = q
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4)
    .slice(0, 20);

  const overlap = terms.filter((word) => referenceText.includes(word)).length;
  return overlap === 0;
}

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

function signB2BAuthToken(userId) {
  return jwt.sign({ sub: userId, scope: 'b2b' }, jwtSecret, {
    expiresIn: '7d',
    issuer: 'clauseiq-b2b',
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

function setB2BAuthCookie(res, token) {
  res.cookie(b2bJwtCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearB2BAuthCookie(res) {
  res.clearCookie(b2bJwtCookieName, {
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

async function requireB2BAuth(req, res, next) {
  const token = req.cookies?.[b2bJwtCookieName];
  if (!token) {
    return jsonError(res, 401, 'B2B authentication required.');
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    if (payload?.scope !== 'b2b') {
      return jsonError(res, 401, 'Invalid B2B auth session.');
    }

    const user = await B2BUser.findById(payload.sub)
      .select('_id name email companyName industry createdAt lastLoginAt')
      .lean();

    if (!user) {
      return jsonError(res, 401, 'Invalid B2B auth session.');
    }

    req.b2bAuthUser = user;
    return next();
  } catch {
    return jsonError(res, 401, 'Invalid B2B auth session.');
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

app.post('/api/b2b/auth/signup', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const companyName = String(req.body?.companyName || '').trim();
  const industry = String(req.body?.industry || '').trim();

  if (!name) {
    return jsonError(res, 400, 'Name is required.');
  }

  if (!companyName) {
    return jsonError(res, 400, 'Company name is required.');
  }

  if (!email || !email.includes('@')) {
    return jsonError(res, 400, 'Valid email is required.');
  }

  if (!validatePassword(password)) {
    return jsonError(res, 400, 'Password must be at least 8 characters long.');
  }

  try {
    const existing = await B2BUser.findOne({ email }).select('_id').lean();
    if (existing) {
      return jsonError(res, 409, 'An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await B2BUser.create({
      name,
      email,
      passwordHash,
      companyName,
      industry,
      lastLoginAt: new Date(),
    });

    await CompanyProfile.findOneAndUpdate(
      { userId: created._id },
      {
        $set: {
          companyName,
          industry,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    const token = signB2BAuthToken(created._id.toString());
    setB2BAuthCookie(res, token);

    return res.status(201).json({
      user: {
        id: created._id,
        name: created.name,
        email: created.email,
        companyName: created.companyName,
        industry: created.industry,
        createdAt: created.createdAt,
        lastLoginAt: created.lastLoginAt,
      },
    });
  } catch (error) {
    return jsonError(res, 500, error.message || 'Failed to create B2B account.');
  }
});

app.post('/api/b2b/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return jsonError(res, 400, 'Email and password are required.');
  }

  try {
    const user = await B2BUser.findOne({ email });
    if (!user) {
      return jsonError(res, 401, 'Invalid email or password.');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return jsonError(res, 401, 'Invalid email or password.');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signB2BAuthToken(user._id.toString());
    setB2BAuthCookie(res, token);

    return res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        companyName: user.companyName,
        industry: user.industry,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (error) {
    return jsonError(res, 500, error.message || 'Failed to sign in.');
  }
});

app.post('/api/b2b/auth/logout', (_req, res) => {
  clearB2BAuthCookie(res);
  return res.json({ ok: true });
});

app.get('/api/b2b/auth/me', requireB2BAuth, (req, res) => {
  return res.json({ user: req.b2bAuthUser });
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
        returnDocument: 'after',
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

app.get('/api/b2b/company/profile', requireB2BAuth, async (req, res) => {
  try {
    const profile = await CompanyProfile.findOne({ userId: req.b2bAuthUser._id }).lean();

    if (!profile) {
      return res.json({
        profile: {
          companyName: '',
          industry: '',
          defaultPolicyNotes: '',
          updatedAt: null,
        },
      });
    }

    return res.json({
      profile: {
        companyName: profile.companyName || '',
        industry: profile.industry || '',
        defaultPolicyNotes: profile.defaultPolicyNotes || '',
        updatedAt: profile.updatedAt,
      },
    });
  } catch (error) {
    return jsonError(res, 500, error.message || 'Failed to load company profile.');
  }
});

app.post('/api/b2b/company/profile', requireB2BAuth, async (req, res) => {
  try {
    const payload = {
      companyName: safeTrimmedString(req.body?.companyName, '', 160),
      industry: safeTrimmedString(req.body?.industry, '', 160),
      defaultPolicyNotes: safeTrimmedString(req.body?.defaultPolicyNotes, '', 4000),
    };

    const profile = await CompanyProfile.findOneAndUpdate(
      { userId: req.b2bAuthUser._id },
      { $set: payload },
      {
        upsert: true,
        returnDocument: 'after',
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ).lean();

    return res.json({
      profile: {
        companyName: profile.companyName || '',
        industry: profile.industry || '',
        defaultPolicyNotes: profile.defaultPolicyNotes || '',
        updatedAt: profile.updatedAt,
      },
    });
  } catch (error) {
    return jsonError(res, 500, error.message || 'Failed to update company profile.');
  }
});

app.get('/api/b2b/policies/list', requireB2BAuth, async (req, res) => {
  try {
    const policies = await B2BPolicy.find({ userId: req.b2bAuthUser._id })
      .sort({ createdAt: -1 })
      .select('policyId policyType fileName chunksStored estimatedTokensStored summary createdAt')
      .lean();

    return res.json({ policies: toPolicyListResponse(policies) });
  } catch (error) {
    return jsonError(res, 500, error.message || 'Failed to load policies.');
  }
});

app.post('/api/b2b/policies/upload', requireB2BAuth, b2bUpload.single('policyPdf'), async (req, res) => {
  const policyType = normalizePolicyType(req.body?.policyType);
  if (!policyType) {
    return jsonError(res, 400, `policyType must be one of ${B2B_POLICY_TYPES.join(', ')}`);
  }

  if (!req.file) {
    return jsonError(res, 400, 'Upload policyPdf (PDF file).');
  }

  try {
    const text = await extractTextFromPdfBuffer(req.file.buffer);
    if (!text || text.length < 40) {
      return jsonError(res, 400, 'Could not extract enough text from PDF.');
    }

    const chunks = chunkText(text, 900, 150).slice(0, 400);
    if (!chunks.length) {
      return jsonError(res, 400, 'No readable text chunks found in the PDF.');
    }

    const policy = await B2BPolicy.create({
      userId: req.b2bAuthUser._id,
      policyId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      policyType,
      fileName: safeTrimmedString(req.file.originalname, 'policy.pdf', 260),
      chunksStored: chunks.length,
      estimatedTokensStored: chunks.reduce((sum, item) => sum + estimateTokens(item), 0),
      summary: safeTrimmedString(chunks[0], '', 220),
      chunks: chunks.map((item, index) => ({ index, text: safeTrimmedString(item, '', 2000) })),
    });

    return res.status(201).json({
      message: 'Policy uploaded and indexed in MongoDB.',
      policy: {
        id: policy.policyId,
        fileName: policy.fileName,
        chunksStored: policy.chunksStored,
        estimatedTokensStored: policy.estimatedTokensStored,
        summary: policy.summary,
        uploadedAt: policy.createdAt,
      },
    });
  } catch (error) {
    return jsonError(res, 500, error.message || 'Failed to upload policy.');
  }
});

app.get('/api/b2b/review/list', requireB2BAuth, async (req, res) => {
  try {
    const reviews = await B2BReview.find({ userId: req.b2bAuthUser._id })
      .sort({ createdAt: -1 })
      .select('reviewId fileName policyType analysis.verdict createdAt')
      .lean();

    return res.json({ reviews: reviews.map(toB2BReviewListItem) });
  } catch (error) {
    return jsonError(res, 500, error.message || 'Failed to load reviews.');
  }
});

app.post('/api/b2b/review/upload-contract', requireB2BAuth, b2bUpload.single('contractPdf'), async (req, res) => {
  const policyType = normalizePolicyType(req.body?.policyType);
  if (!policyType) {
    return jsonError(res, 400, `policyType must be one of ${B2B_POLICY_TYPES.join(', ')}`);
  }

  if (!req.file) {
    return jsonError(res, 400, 'Upload contractPdf (PDF file).');
  }

  const copilotContext = resolveCopilotContext(req);
  if (copilotContext.error) {
    return jsonError(res, 400, copilotContext.error);
  }

  try {
    const policies = await B2BPolicy.find({ userId: req.b2bAuthUser._id, policyType })
      .sort({ createdAt: -1 })
      .select('fileName chunks')
      .lean();

    if (!policies.length) {
      return jsonError(res, 400, `Upload at least one ${policyType} policy first.`);
    }

    const profile = await CompanyProfile.findOne({ userId: req.b2bAuthUser._id }).lean();
    const contractText = await extractTextFromPdfBuffer(req.file.buffer);

    if (!contractText || contractText.length < 80) {
      return jsonError(res, 400, 'Could not extract enough text from contract.');
    }

    const extracted = filterSubstantiveClauses(extractClauses(contractText)).slice(0, 80);
    if (!extracted.length) {
      return jsonError(res, 400, 'No substantial clauses were detected in this contract.');
    }

    const policyChunks = policies.flatMap((policy) => (
      Array.isArray(policy.chunks)
        ? policy.chunks.map((chunk) => ({
          fileName: policy.fileName,
          chunkIndex: chunk.index,
          text: chunk.text,
        }))
        : []
    ));

    const clauseEvidenceMap = {};
    const clauseAssessments = [];
    const violations = [];

    for (const clause of extracted) {
      const evidence = scoreEvidenceForClause(clause.cleanText || clause.text, policyChunks);
      clauseEvidenceMap[clause.id] = evidence;

      const assessment = await analyzeClauseForB2B({
        accessToken: copilotContext.accessToken,
        model: copilotContext.model,
        clause,
        policyType,
        profile,
        evidence,
      });

      clauseAssessments.push(assessment);

      if (assessment.status === 'VIOLATION' || assessment.status === 'NEEDS_REVIEW') {
        violations.push({
          clauseId: clause.id,
          severity: assessment.severity,
          title: assessment.violatedPolicy || `${assessment.clauseType} review required`,
          rationale: assessment.reasoning,
          recommendation: assessment.suggestedFix,
        });
      }
    }

    const analysisSummary = buildReviewSummary({
      fileName: req.file.originalname,
      policyType,
      assessments: clauseAssessments,
      violations,
    });

    const review = await B2BReview.create({
      userId: req.b2bAuthUser._id,
      reviewId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      fileName: safeTrimmedString(req.file.originalname, 'contract.pdf', 260),
      policyType,
      contractSketch: {
        summary: `${extracted.length} clauses extracted for compliance review.`,
        clauses: extracted.map((clause) => ({
          id: clause.id,
          text: clause.cleanText || clause.text,
        })),
        keyTerms: [],
        missingInformation: [],
        clauseCount: extracted.length,
        extractionMode: 'structural-parser',
      },
      clauseEvidenceMap,
      analysis: {
        ...analysisSummary,
        clauseAssessments,
        violations,
      },
      contractExcerpt: safeTrimmedString(contractText.slice(0, 9000), '', 12000),
    });

    return res.status(201).json({
      review: toB2BReviewResponse(review.toObject()),
    });
  } catch (error) {
    return jsonError(res, 500, error.message || 'Failed to analyze contract.');
  }
});

app.get('/api/b2b/review/:reviewId', requireB2BAuth, async (req, res) => {
  try {
    const review = await B2BReview.findOne({
      userId: req.b2bAuthUser._id,
      reviewId: req.params.reviewId,
    }).lean();

    if (!review) {
      return jsonError(res, 404, 'Review not found.');
    }

    return res.json({ review: toB2BReviewResponse(review) });
  } catch (error) {
    return jsonError(res, 500, error.message || 'Failed to load review details.');
  }
});

app.post('/api/b2b/chat/ask', requireB2BAuth, async (req, res) => {
  const reviewId = safeTrimmedString(req.body?.reviewId, '', 120);
  const question = safeTrimmedString(req.body?.question, '', 1200);

  if (!reviewId || !question) {
    return jsonError(res, 400, 'reviewId and question are required.');
  }

  const copilotContext = resolveCopilotContext(req);
  if (copilotContext.error) {
    return jsonError(res, 400, copilotContext.error);
  }

  try {
    const review = await B2BReview.findOne({
      userId: req.b2bAuthUser._id,
      reviewId,
    }).lean();

    if (!review) {
      return jsonError(res, 404, 'Review not found.');
    }

    if (isB2BChatOutOfScope(question, review)) {
      return res.json({
        answer: B2B_CHAT_REFUSAL,
        citations: [],
      });
    }

    const citations = [];
    const clauseEvidenceMap = review.clauseEvidenceMap || {};
    for (const [clauseId, items] of Object.entries(clauseEvidenceMap)) {
      const first = Array.isArray(items) ? items.slice(0, 1) : [];
      for (const item of first) {
        citations.push({
          clauseId,
          fileName: item.fileName,
          chunkIndex: item.chunkIndex,
          score: item.score,
          text: safeTrimmedString(item.text, '', 360),
        });
      }
      if (citations.length >= 10) break;
    }

    const prompt = [
      'You are a legal contract compliance assistant.',
      'Answer the user question using only the review context and policy citations.',
      `If the user asks anything outside that scope, reply exactly with: "${B2B_CHAT_REFUSAL}"`,
      'Respond in concise bullet points, practical and plain-English.',
      '',
      `Question: ${question}`,
      '',
      `Review file: ${review.fileName}`,
      `Policy type: ${review.policyType}`,
      `Verdict: ${review.analysis?.verdict || 'UNKNOWN'}`,
      `Executive summary: ${review.analysis?.executiveSummary || 'N/A'}`,
      '',
      'Key violations:',
      JSON.stringify(review.analysis?.violations || [], null, 2),
      '',
      'Policy citations:',
      JSON.stringify(citations, null, 2),
    ].join('\n');

    const answer = await runCopilotPrompt({
      accessToken: copilotContext.accessToken,
      model: copilotContext.model,
      prompt,
    });

    return res.json({
      answer,
      citations,
    });
  } catch (error) {
    return jsonError(res, 500, error.message || 'Failed to answer question.');
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

app.post('/api/github-copilot/jurisdiction-scout', requireAuth, async (req, res) => {
  const copilotContext = resolveCopilotContext(req);
  if (copilotContext.error) {
    return jsonError(res, 400, copilotContext.error);
  }

  const contractText = safeTrimmedString(req.body?.contractText, '', 400000);
  const useJurisdiction = parseBoolean(req.body?.useJurisdiction, true);
  const providedResidence = safeTrimmedString(req.body?.freelancerResidence, '', 180);

  if (!useJurisdiction) {
    return res.json({
      triggered: false,
      status: 'skipped',
      contextId: null,
      message: 'Jurisdiction scout is disabled for this run.',
    });
  }

  if (!contractText || contractText.length < 80) {
    return jsonError(res, 400, 'Contract text is required for jurisdiction scouting.');
  }

  const freelancerLocation = normalizeLocationText(providedResidence);
  if (!freelancerLocation) {
    return res.json({
      triggered: false,
      status: 'skipped',
      contextId: null,
      message: 'Jurisdiction scout skipped: freelancer residence is required when jurisdiction is enabled.',
    });
  }

  const freelancerCountry = normalizeCountryCandidate(freelancerLocation);
  const freelancerSignal = {
    location: freelancerLocation,
    country: freelancerCountry,
    source: 'user',
    evidence: '',
  };

  if (!freelancerSignal.country) {
    return res.json({
      triggered: false,
      status: 'skipped',
      contextId: null,
      message: 'Jurisdiction scout skipped: freelancer residence country could not be mapped.',
      freelancerResidence: {
        location: freelancerSignal.location,
        country: freelancerSignal.country || '',
        source: freelancerSignal.source,
      },
    });
  }

  let governingLaw;
  try {
    governingLaw = await extractGoverningLawSignalWithAI({
      accessToken: copilotContext.accessToken,
      model: copilotContext.model,
      contractText,
    });
  } catch (error) {
    return jsonError(res, 500, error.message || 'Failed to extract governing-law country.');
  }

  if (!governingLaw?.country) {
    return res.json({
      triggered: false,
      status: 'skipped',
      contextId: null,
      message: 'Jurisdiction scout skipped: AI could not confidently extract governing-law country.',
      governingLaw: {
        location: governingLaw?.location || '',
        country: governingLaw?.country || '',
      },
      freelancerResidence: {
        location: freelancerSignal.location,
        country: freelancerSignal.country,
        source: freelancerSignal.source,
      },
    });
  }

  if (areCountriesEquivalent(governingLaw.country, freelancerSignal.country)) {
    return res.json({
      triggered: false,
      status: 'skipped',
      contextId: null,
      message: 'Jurisdiction scout skipped: governing law and freelancer residence are in the same country.',
      governingLaw: {
        location: governingLaw.location,
        country: governingLaw.country,
      },
      freelancerResidence: {
        location: freelancerSignal.location,
        country: freelancerSignal.country,
        source: freelancerSignal.source,
      },
    });
  }

  if (!tavilyApiKey) {
    return res.json({
      triggered: false,
      status: 'skipped',
      contextId: null,
      message: 'Jurisdiction scout skipped: TAVILY_API_KEY is not configured on the server.',
      governingLaw: {
        location: governingLaw.location,
        country: governingLaw.country,
      },
      freelancerResidence: {
        location: freelancerSignal.location,
        country: freelancerSignal.country,
        source: freelancerSignal.source,
      },
    });
  }

  try {
    const summaryResponse = await getOrCreateJurisdictionSummary({
      governingCountry: governingLaw.country,
      freelancerCountry: freelancerSignal.country,
    });

    const contextId = createEphemeralId('jur');
    jurisdictionContextStore.set(contextId, {
      id: contextId,
      createdAt: Date.now(),
      governingLawLocation: governingLaw.location,
      governingCountry: governingLaw.country,
      freelancerLocation: freelancerSignal.location,
      freelancerCountry: freelancerSignal.country,
      summaries: summaryResponse.summaries,
    });

    return res.json({
      triggered: true,
      status: 'triggered',
      contextId,
      message: 'Jurisdiction scout triggered: cross-border mismatch detected and legal context prepared.',
      cacheHit: summaryResponse.cacheHit,
      jurisdictionInsights: summaryResponse.insights,
      governingLaw: {
        location: governingLaw.location,
        country: governingLaw.country,
      },
      freelancerResidence: {
        location: freelancerSignal.location,
        country: freelancerSignal.country,
        source: freelancerSignal.source,
      },
    });
  } catch (error) {
    return jsonError(res, 500, error.message || 'Jurisdiction scout failed.');
  }
});

app.post('/api/github-copilot/analyze', requireAuth, async (req, res) => {
  const accessToken = String(req.body?.accessToken || '').trim();
  const model = String(req.body?.model || '').trim();
  const clause = req.body?.clause;
  const jurisdictionContextId = safeTrimmedString(req.body?.jurisdictionContextId, '', 120);

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
    const jurisdictionContext = getJurisdictionContext(jurisdictionContextId);
    const jurisdictionTopic = detectJurisdictionTopic(clause);
    const jurisdictionPromptBlock = buildJurisdictionPromptBlock(jurisdictionContext, jurisdictionTopic);

    const prompt = `${SYSTEM_PROMPT}\n\n${jurisdictionPromptBlock ? `${jurisdictionPromptBlock}\n\n` : ''}${buildClauseAnalysisPrompt(clause)}`;
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
