import React, { useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { ClauseIQ } from './components/ClauseIQ';
import './App.css';

export default function App() {
  const [showAnalysis, setShowAnalysis] = useState(false);

  if (!showAnalysis) {
    return <LandingPage onEnterApp={() => setShowAnalysis(true)} />;
  }

  return <ClauseIQ />;
}
