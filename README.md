# ClauseIQ
> **The on-device auditor that de-codes your contracts, not your privacy.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![AI: WebLLM](https://img.shields.io/badge/AI-WebLLM-blueviolet)](https://webllm.mlc.ai/)
[![Hardware: WebGPU](https://img.shields.io/badge/Acceleration-WebGPU-green)](https://developer.chrome.com/docs/web-platform/webgpu/)

**ClauseIQ** is a privacy-first, local-scale AI platform designed to audit freelance contracts for predatory "red flags." It is a zero-knowledge, on-device auditor that reveals hidden risks and generates negotiation power without a single byte of data ever leaving the user's machine.
This platform will also be localized to offer **multilingual capabilities** and follow up with laws/clauses that are **jurisdiction** specific.


**Your data never leaves your machine.** No cloud. No API logs. No privacy leaks.

---

## Tech Stack Used

- **Frontend Framework**: React 19
- **Build Tool**: Vite 6
- **Language**: JavaScript (ES Modules)
- **AI Inference (On-Device)**: @mlc-ai/web-llm (WebLLM) with Qwen2.5-1.5B
- **Browser Acceleration**: WebGPU
- **Document Processing**: pdfjs-dist
- **Concurrency**: Web Workers (`src/workers/llm.worker.js`)
- **Code Quality**: ESLint 9
- **Deployment**: Vercel (`vercel.json`)

---

## ✨ Key Features

- 🔒 **100% Privacy-First**: All processing happens locally in your browser
- 🤖 **Universal Clause Analysis**: Detects unlimited clause types (not just 4 predefined categories)
- 🎯 **Hybrid Intelligence**: Combines LLM reasoning with 21 heuristic risk patterns
- 📊 **Three-Tier Risk Assessment**: High, Medium, and Low risk classification
- 🧠 **Qwen2.5-1.5B Model**: Balanced accuracy and performance for mid-range hardware
- 🔍 **Structural Extraction**: Intelligent parsing of numbered sections, headers, and legal formatting
- ⚡ **Graceful Fallback**: Pattern-based analysis when LLM encounters issues
- 🌍 **Multilingual Support** (Coming Soon): Localized for multiple jurisdictions

---

## What this project does

- Extracts text from uploaded PDF files with pdfjs-dist.
- Detects OCR-needed/scanned pages when text is missing.
- Loads a local LLM (Qwen2.5-1.5B) with @mlc-ai/web-llm in a Web Worker.
- Shows model download/loading progress in the UI.
- **Universal clause analysis**: Detects ALL clause types (not limited to predefined categories)
- **Hybrid LLM + Pattern Matching**: Combines AI analysis with 21 heuristic risk patterns
- **Three-tier risk assessment**: High, Medium, and Low risk levels
- Structural clause extraction using regex patterns for numbered sections, headers, and legal formatting
- Privacy-first: 100% client-side processing with no data leaving your device

## Project structure

```text
clauseiq/
	public/
	src/
		assets/
		components/
			ClauseIQ.jsx
			UploadArea.jsx
			ProgressIndicator.jsx
			ResultsList.jsx
		hooks/
			usePDFExtractor.js
			useWebLLM.js
		utils/
			constants.js
			chunker.js
			rag.js
		workers/
			llm.worker.js
		App.jsx
		App.css
		index.css
		main.jsx
	index.html
	package.json
	vite.config.js
	eslint.config.js
```

## How it works

1. Upload
- The user drops/selects a PDF in UploadArea.
- ClauseIQ starts extraction through usePDFExtractor.

2. PDF extraction
- usePDFExtractor reads pages with pdfjs-dist.
- Text is captured page by page, then merged.
- If pages have no text, the app warns that scanned/image content is not fully supported.

3. Model initialization
- useWebLLM creates a dedicated worker (llm.worker.js).
- The worker loads a local model and emits progress events.
- The UI displays a progress bar from 0 to 100.
- Model files are cached by WebLLM in browser storage, so repeat visits are faster.

4. Universal clause analysis
- ClauseIQ extracts ALL clauses using structural parsing (numbered sections, headers, legal formatting).
- Substantive clauses are filtered (removes boilerplate like signatures, headers).
- Clauses are batched (5 per batch) for optimal processing.
- Each batch undergoes hybrid analysis:
  - **Pattern pre-scan**: 21 heuristic patterns detect high/medium/low risk indicators
  - **LLM analysis**: Local model analyzes clause meaning, risk level, and concerns
  - **Validation & enrichment**: LLM output is validated and enriched with pattern matches
  - **Graceful fallback**: If LLM fails, pattern-based analysis is used
- Results include:
  - Dynamic clause types (e.g., "Payment Terms", "IP Rights", "Confidentiality")
  - Risk level (High/Medium/Low)
  - Plain-language explanation
  - Specific concerns array
- Results are deduplicated, sorted by risk level, and displayed in ResultsList.

## Key files

- src/components/ClauseIQ.jsx
	- Main orchestration: clause extraction, batching, hybrid analysis lifecycle
- src/hooks/usePDFExtractor.js
	- PDF parsing, per-page extraction, OCR-needed detection
- src/hooks/useWebLLM.js
	- Worker lifecycle, progress tracking, request/response API
- src/workers/llm.worker.js
	- Model loading (Qwen2.5-1.5B), inference, robust JSON extraction
- src/utils/constants.js
	- Model config, universal prompts, 21 heuristic risk patterns, helper functions
- src/utils/rag.js
	- Structural clause extraction, universal analysis functions, validation & enrichment

## Run locally

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Notes

- Everything runs in-browser on the client machine.
- No server-side API is required.
- First model load can take time depending on device/network.
- You can switch models in src/utils/constants.js if you want a different speed/quality tradeoff.

