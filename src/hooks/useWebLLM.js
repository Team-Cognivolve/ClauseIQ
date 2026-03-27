import { useState, useEffect, useRef, useCallback } from 'react';
import { MODEL_ID, SYSTEM_PROMPT, ANALYSIS_TIMEOUT_MS } from '../utils/constants';

/**
 * Manages the WebLLM engine inside a dedicated Web Worker.
 *
 * modelState: 'idle' | 'loading' | 'ready' | 'error'
 * loadProgress: { percent: number (0-100), text: string }
 */
export function useWebLLM() {
  const [modelState, setModelState] = useState('idle');
  const [loadProgress, setLoadProgress] = useState({ percent: 0, text: '' });
  const [loadError, setLoadError] = useState(null);

  const workerRef  = useRef(null);
  const pendingRef = useRef(new Map()); // requestId → { resolve, reject }
  const reqCounter = useRef(0);

  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/llm.worker.js', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    worker.onmessage = ({ data }) => {
      const { type, payload } = data;

      if (type === 'progress') {
        setModelState('loading');
        setLoadProgress({
          percent: Math.round((payload.progress ?? 0) * 100),
          text: payload.text ?? '',
        });
      }

      if (type === 'loaded') {
        setModelState('ready');
        setLoadProgress({ percent: 100, text: 'Model ready' });
      }

      if (type === 'error') {
        setModelState('error');
        setLoadError(payload.message);
      }

      if (type === 'analyzeResult') {
        const pending = pendingRef.current.get(payload.requestId);
        if (pending) {
          pending.resolve(payload.result);
          pendingRef.current.delete(payload.requestId);
        }
      }

      if (type === 'analyzeError') {
        const pending = pendingRef.current.get(payload.requestId);
        if (pending) {
          pending.reject(new Error(payload.message));
          pendingRef.current.delete(payload.requestId);
        }
      }
    };

    worker.onerror = (e) => {
      setModelState('error');
      setLoadError(e.message ?? 'Worker crashed');
    };

    setModelState('loading');
    worker.postMessage({ type: 'load', payload: { modelId: MODEL_ID } });

    return () => {
      worker.terminate();
      pendingRef.current.forEach(({ reject }) =>
        reject(new Error('Worker terminated')),
      );
      pendingRef.current.clear();
    };
  }, []);

  /** Send a text chunk to the worker and receive a parsed JSON array of findings. */
  const analyze = useCallback((text, options = {}) => {
    const { userPrompt } = options;
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        return reject(new Error('Worker not initialised'));
      }
      const requestId = `req_${++reqCounter.current}`;
      pendingRef.current.set(requestId, { resolve, reject });

      // Safety timeout per chunk (longer on CPU-only devices).
      const timer = setTimeout(() => {
        if (pendingRef.current.has(requestId)) {
          pendingRef.current.get(requestId).reject(
            new Error('Analysis timed out. Try a shorter contract or a smaller model.'),
          );
          pendingRef.current.delete(requestId);
        }
      }, ANALYSIS_TIMEOUT_MS);

      // Wrap resolve/reject so we also clear the timer
      const orig = pendingRef.current.get(requestId);
      pendingRef.current.set(requestId, {
        resolve: (v) => { clearTimeout(timer); orig.resolve(v); },
        reject:  (e) => { clearTimeout(timer); orig.reject(e); },
      });

      workerRef.current.postMessage({
        type: 'analyze',
        payload: { requestId, text, systemPrompt: SYSTEM_PROMPT, userPrompt },
      });
    });
  }, []);

  return { modelState, loadProgress, loadError, analyze };
}