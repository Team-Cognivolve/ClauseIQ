import React from 'react';
import { MODEL_LABEL, MODEL_SIZE_LABEL } from '../utils/constants';

export function ProgressIndicator({ modelState, loadProgress }) {
  if (modelState === 'idle' || modelState === 'ready') return null;

  const isError = modelState === 'error';
  const { percent = 0, text = '' } = loadProgress;

  return (
    <div className={`model-loader ${isError ? 'model-loader--error' : ''}`} role="status">
      <div className="model-loader__header">
        {isError ? (
          <span>Model failed to load. Try refreshing the page.</span>
        ) : (
          <span>
            Initialising AI -{' '}
            <span className="model-loader__name">{MODEL_LABEL}</span>
          </span>
        )}
      </div>

      {!isError && (
        <>
          <div className="progress-track" aria-hidden>
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>

          <div className="progress-meta">
            <span className="progress-meta__text" title={text}>{text || 'Starting...'}</span>
            <span className="progress-meta__pct">{percent}%</span>
          </div>

          <p className="model-loader__note">
            Downloading {MODEL_SIZE_LABEL} of model weights to your browser cache.
            Subsequent visits will be instant - everything runs 100% locally.
          </p>
        </>
      )}
    </div>
  );
}