import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SharedArrayBuffer is required by WebLLM.
// COOP + COEP headers enable it in the browser.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Let Vite skip trying to pre-bundle these large packages
    exclude: ['@mlc-ai/web-llm'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
});
