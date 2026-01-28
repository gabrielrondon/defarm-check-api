import { CheckStatus, Severity } from '../types/checker.js';
import { Verdict, CheckSummary, SourceResult } from '../types/verdict.js';

// Pesos por severidade para cálculo do score
const SEVERITY_WEIGHTS = {
  [Severity.CRITICAL]: 1.0,
  [Severity.HIGH]: 0.75,
  [Severity.MEDIUM]: 0.5,
  [Severity.LOW]: 0.25
};

// Calcula o score (0-100) baseado nos resultados
export function calculateScore(results: SourceResult[]): number {
  const applicableResults = results.filter(
    r => r.status !== CheckStatus.NOT_APPLICABLE && r.status !== CheckStatus.ERROR
  );

  if (applicableResults.length === 0) {
    return 0;
  }

  let totalWeight = 0;
  let weightedScore = 0;

  for (const result of applicableResults) {
    let weight = 1.0;

    if (result.status === CheckStatus.FAIL && result.severity) {
      weight = SEVERITY_WEIGHTS[result.severity] || 1.0;
    }

    totalWeight += weight;

    if (result.status === CheckStatus.PASS) {
      weightedScore += weight * 100;
    } else if (result.status === CheckStatus.WARNING) {
      weightedScore += weight * 50;
    }
    // FAIL contribui 0
  }

  return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
}

// Determina o veredito final
export function determineVerdict(results: SourceResult[]): Verdict {
  const applicableResults = results.filter(
    r => r.status !== CheckStatus.NOT_APPLICABLE && r.status !== CheckStatus.ERROR
  );

  if (applicableResults.length === 0) {
    return Verdict.UNKNOWN;
  }

  const hasCriticalFail = applicableResults.some(
    r => r.status === CheckStatus.FAIL && r.severity === Severity.CRITICAL
  );

  if (hasCriticalFail) {
    return Verdict.NON_COMPLIANT;
  }

  const hasAnyFail = applicableResults.some(r => r.status === CheckStatus.FAIL);
  const hasWarning = applicableResults.some(r => r.status === CheckStatus.WARNING);

  if (hasAnyFail) {
    return hasWarning ? Verdict.NON_COMPLIANT : Verdict.NON_COMPLIANT;
  }

  if (hasWarning) {
    return Verdict.PARTIAL;
  }

  const allPass = applicableResults.every(r => r.status === CheckStatus.PASS);
  return allPass ? Verdict.COMPLIANT : Verdict.PARTIAL;
}

// Gera sumário dos resultados
export function generateSummary(results: SourceResult[]): CheckSummary {
  return {
    totalCheckers: results.length,
    passed: results.filter(r => r.status === CheckStatus.PASS).length,
    failed: results.filter(r => r.status === CheckStatus.FAIL).length,
    warnings: results.filter(r => r.status === CheckStatus.WARNING).length,
    errors: results.filter(r => r.status === CheckStatus.ERROR).length,
    notApplicable: results.filter(r => r.status === CheckStatus.NOT_APPLICABLE).length
  };
}

// Calcula taxa de cache hit
export function calculateCacheHitRate(results: SourceResult[]): number {
  const applicableResults = results.filter(
    r => r.status !== CheckStatus.NOT_APPLICABLE
  );

  if (applicableResults.length === 0) {
    return 0;
  }

  const cacheHits = applicableResults.filter(r => r.cached).length;
  return cacheHits / applicableResults.length;
}
