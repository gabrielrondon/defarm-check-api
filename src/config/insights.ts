import { Severity } from '../types/checker.js';

export const L2_FAIL_PENALTY: Record<Severity, number> = {
  [Severity.CRITICAL]: 40,
  [Severity.HIGH]: 25,
  [Severity.MEDIUM]: 15,
  [Severity.LOW]: 8
};

export const L2_DIMENSION_WEIGHTS = {
  environmental: 0.4,
  social: 0.2,
  legal: 0.25,
  dataQuality: 0.15
};

export const L3_TREND_LABEL_THRESHOLDS = {
  improvingDelta: 5,
  deterioratingDelta: -5
};

export const L3_EMPTY_SNAPSHOT_ALERT_DAYS = parseInt(
  process.env.L3_EMPTY_SNAPSHOT_ALERT_DAYS || '3',
  10
);
