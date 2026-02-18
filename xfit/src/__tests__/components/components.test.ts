/**
 * Component Tests - ErrorBoundary, MeasurementCard, AccuracyIndicator
 */

import React from 'react';

// Verify components export correctly
describe('Component Exports', () => {
  it('ErrorBoundary should be importable', () => {
    const { ErrorBoundary } = require('../../components/ErrorBoundary');
    expect(ErrorBoundary).toBeDefined();
  });

  it('MeasurementCard should be importable', () => {
    const { MeasurementCard, MeasurementRow } = require('../../components/MeasurementCard');
    expect(MeasurementCard).toBeDefined();
    expect(MeasurementRow).toBeDefined();
  });

  it('AccuracyIndicator components should be importable', () => {
    const { AccuracyBadge, AccuracyReportCard } = require('../../components/AccuracyIndicator');
    expect(AccuracyBadge).toBeDefined();
    expect(AccuracyReportCard).toBeDefined();
  });

  it('LoadingOverlay should be importable', () => {
    const { LoadingOverlay } = require('../../components/LoadingOverlay');
    expect(LoadingOverlay).toBeDefined();
  });

  it('CaptureGuide should be importable', () => {
    const { CaptureGuide } = require('../../components/CaptureGuide');
    expect(CaptureGuide).toBeDefined();
  });
});

/**
 * Navigation Types
 */
describe('Navigation Types', () => {
  it('should export type definitions', () => {
    const types = require('../../types/navigation');
    expect(types).toBeDefined();
  });
});
