import { CheckStatus, Severity } from '../types/checker.js';
import { L2Insights, L2DimensionScore } from '../types/insights.js';
import { CheckSummary, SourceResult } from '../types/verdict.js';
import { L2_DIMENSION_WEIGHTS, L2_FAIL_PENALTY } from '../config/insights.js';

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getFailPenalty(severity?: Severity): number {
  if (!severity) return 20;
  return L2_FAIL_PENALTY[severity] ?? 20;
}

function scoreForCategory(results: SourceResult[], category: string): number {
  const scoped = results.filter(r => r.category === category);
  if (scoped.length === 0) return 100;

  let score = 100;
  for (const result of scoped) {
    if (result.status === CheckStatus.FAIL) {
      score -= getFailPenalty(result.severity);
    } else if (result.status === CheckStatus.WARNING) {
      score -= Math.round(getFailPenalty(result.severity) * 0.5);
    } else if (result.status === CheckStatus.ERROR) {
      score -= 10;
    }
  }

  return clampScore(score);
}

function scoreDataQuality(results: SourceResult[], summary: CheckSummary): number {
  const total = Math.max(1, results.length);
  const errorRatePenalty = (summary.errors / total) * 60;
  const notApplicablePenalty = (summary.notApplicable / total) * 20;

  const applicable = results.filter(r => r.status !== CheckStatus.NOT_APPLICABLE);
  const missingEvidence = applicable.filter(r => !r.evidence).length;
  const evidencePenalty = applicable.length > 0
    ? (missingEvidence / applicable.length) * 20
    : 0;

  return clampScore(100 - errorRatePenalty - notApplicablePenalty - evidencePenalty);
}

export function deriveL2Insights(results: SourceResult[], summary: CheckSummary): L2Insights {
  const dimensions: L2DimensionScore[] = [
    {
      id: 'environmental_risk_index',
      label: 'Environmental Risk Index',
      score: scoreForCategory(results, 'environmental'),
      weight: L2_DIMENSION_WEIGHTS.environmental,
      rationale: 'Penaliza FAIL/WARNING em fontes ambientais.'
    },
    {
      id: 'social_risk_index',
      label: 'Social Risk Index',
      score: scoreForCategory(results, 'social'),
      weight: L2_DIMENSION_WEIGHTS.social,
      rationale: 'Penaliza FAIL/WARNING em fontes sociais.'
    },
    {
      id: 'legal_risk_index',
      label: 'Legal Risk Index',
      score: scoreForCategory(results, 'legal'),
      weight: L2_DIMENSION_WEIGHTS.legal,
      rationale: 'Penaliza FAIL/WARNING em fontes legais.'
    },
    {
      id: 'data_quality_index',
      label: 'Data Quality Index',
      score: scoreDataQuality(results, summary),
      weight: L2_DIMENSION_WEIGHTS.dataQuality,
      rationale: 'Combina erros de execução, não aplicabilidade e ausência de evidência.'
    }
  ];

  return {
    version: '1.0.0',
    dimensions
  };
}
