// components/UploadArea.jsx
import React, { useRef, useState, useCallback } from 'react';

export function UploadArea({ onFileSelect, status, error }) {
  const inputRef   = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('Only PDF files are accepted.');
      return;
    }
    onFileSelect(file);
  }, [onFileSelect]);

  const handleChange = (e) => {
    handleFile(e.target.files[0]);
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const isExtracting = status === 'extracting';
  const isDone       = status === 'done';

  let icon = '📄';
  if (isExtracting) icon = '⏳';
  if (isDone)       icon = '✅';

  return (
    <div
      className={[
        'upload-area',
        dragging    ? 'upload-area--dragging' : '',
        isExtracting? 'upload-area--loading'  : '',
        isDone      ? 'upload-area--done'     : '',
      ].join(' ')}
      onClick={() => !isExtracting && inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && !isExtracting && inputRef.current?.click()}
      aria-label="Upload a PDF contract"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleChange}
        disabled={isExtracting}
        style={{ display: 'none' }}
      />

      <span className="upload-icon" aria-hidden>{icon}</span>

      <div className="upload-copy">
        {isExtracting ? (
          <span className="upload-copy__primary">Extracting text from PDF…</span>
        ) : isDone ? (
          <span className="upload-copy__primary">PDF loaded &mdash; drop or click to replace</span>
        ) : (
          <>
            <span className="upload-copy__primary">Drop your contract PDF here</span>
            <span className="upload-copy__secondary">or click to browse</span>
          </>
        )}
      </div>

      {error && (
        <p className="upload-error" role="alert">{error}</p>
      )}
    </div>
  );
}