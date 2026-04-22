# ClauseIQ

AI-assisted contract auditing with PDF extraction, clause parsing, and GitHub Copilot analysis.

ClauseIQ is a React + Vite app for reviewing contracts. Users upload a PDF, ClauseIQ extracts text with `pdfjs-dist`, splits the document into clauses, and analyzes each clause through a local GitHub Copilot backend.

## How It Works

1. Upload a PDF contract.
2. Extract text page by page in the browser.
3. Split content into substantive clauses.
4. Connect GitHub Copilot via device login.
5. Enter a Copilot model name in the UI.
6. Analyze clauses concurrently and stream results as each clause finishes.
7. Show risk score summary and clause cards with typing animation.

Result shape for each clause:

- `clause_text`
- `clause_type`
- `risk_level`
- `explanation`
- `negotiation`

## Architecture

- Frontend: React 19 + Vite 6
- Backend: Express 5 local service for GitHub Copilot auth and analysis
- PDF extraction: `pdfjs-dist`
- Copilot integration: `@github/copilot-sdk` and `@github/copilot`

## Environment Variables

Create `.env` in the project root:

```bash
GITHUB_COPILOT_CLIENT_ID=your_github_oauth_app_client_id_here
GITHUB_COPILOT_DEVICE_SCOPE=read:user
COPILOT_SERVER_PORT=8787
MONGODB_URI=your_mongodb_uri_here
JWT_SECRET=your_jwt_secret_here
TAVILY_API_KEY=your_tavily_api_key_here
```

Notes:

- `GITHUB_COPILOT_CLIENT_ID` is required for device flow.
- The GitHub OAuth app must support device authorization.
- `MONGODB_URI` must be a valid MongoDB Atlas connection string.
- `JWT_SECRET` should be a strong secret (minimum 16 characters).
- `TAVILY_API_KEY` enables jurisdiction scout research for cross-border ClauseIQ reviews.
- Copilot model names are entered in the frontend, not in `.env`.

## Jurisdiction Awareness (ClauseIQ Only)

ClauseIQ includes an optional jurisdiction scout before clause analysis for freelancer-style contracts.

1. Governing law is extracted from the uploaded contract.
2. Freelancer residence is taken from the UI field (or inferred from contract text when missing).
3. If countries differ, ClauseIQ runs Tavily searches and stores a short-lived context ID.
4. During clause analysis, only relevant context is injected for non-compete, payment/notice, and tax/compliance clauses.

Notes:

- This flow is scoped to ClauseIQ contract review endpoints.
- B2B policy review and chat endpoints are unchanged.

## Local Development

```bash
npm install
npm run dev
```

`npm run dev` starts both:

- Vite frontend
- Copilot backend (`http://127.0.0.1:8787` by default)

## Project Structure

```text
clauseIQ/
  server/
    index.js
  src/
    components/
      ClauseIQ.jsx
      LandingPage.jsx
    hooks/
      useGitHubCopilot.js
      usePDFExtractor.js
    utils/
      analysisPayload.js
      constants.js
      rag.js
    App.jsx
    main.jsx
  .env.example
  package.json
  vite.config.js
```

## Key Files

- `src/components/ClauseIQ.jsx`: upload, extraction lifecycle, Copilot analysis orchestration, streamed results UI.
- `src/hooks/useGitHubCopilot.js`: Copilot auth state, device flow, backend calls.
- `server/index.js`: auth endpoints and Copilot SDK analysis endpoint.
- `src/utils/rag.js`: clause extraction, normalization, enrichment helpers.
- `src/utils/constants.js`: prompts, concurrency settings, risk heuristics.

## Verification

```bash
npm run lint
npm run build
```

## Important Notes

- Analysis is GitHub Copilot-only.
- `npm run preview` serves only frontend build output and does not run the backend.
