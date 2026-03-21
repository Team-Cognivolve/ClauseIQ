# ClauseIQ

ClauseIQ is a client-side contract risk checker.

You upload a PDF, the app extracts text in the browser, and a local WebLLM model flags risky clauses.
No contract content is sent to a backend.

## What this project does

- Extracts text from uploaded PDF files with pdfjs-dist.
- Detects OCR-needed/scanned pages when text is missing.
- Loads a local LLM with @mlc-ai/web-llm in a Web Worker.
- Shows model download/loading progress in the UI.
- Analyzes common freelancer red-flag categories:
	- Non-Compete
	- Liability
	- IP Transfer
	- Termination
- Uses local retrieval + focused prompts to improve output quality.

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

4. Local analysis
- ClauseIQ runs category-by-category analysis.
- rag.js retrieves likely relevant snippets for each category.
- A focused prompt is built per category and sent to the worker.
- The worker calls engine.chat.completions.create and returns JSON findings.
- Results are normalized, deduplicated, sorted by risk, and shown in ResultsList.

## Key files

- src/components/ClauseIQ.jsx
	- Main orchestration and analysis lifecycle.
- src/hooks/usePDFExtractor.js
	- PDF parsing, per-page extraction, OCR-needed detection.
- src/hooks/useWebLLM.js
	- Worker lifecycle, progress tracking, request/response API.
- src/workers/llm.worker.js
	- Model loading, inference, robust JSON extraction.
- src/utils/constants.js
	- Model config, prompts, thresholds, categories.
- src/utils/rag.js
	- Lightweight local retrieval and fallback logic.

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
