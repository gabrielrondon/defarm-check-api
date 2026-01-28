import { CheckerResult } from './checker';

// Veredito final
export enum Verdict {
  COMPLIANT = 'COMPLIANT',
  NON_COMPLIANT = 'NON_COMPLIANT',
  PARTIAL = 'PARTIAL',
  UNKNOWN = 'UNKNOWN'
}

// Sumário dos resultados
export interface CheckSummary {
  totalCheckers: number;
  passed: number;
  failed: number;
  warnings: number;
  errors: number;
  notApplicable: number;
}

// Metadados da execução
export interface CheckMetadata {
  processingTimeMs: number;
  cacheHitRate: number;
  apiVersion: string;
  timestamp: string;
}

// Resultado do check (source individual)
export interface SourceResult extends CheckerResult {
  name: string;
  category: string;
}

// Resposta completa do check
export interface CheckResponse {
  checkId: string;
  input: {
    type: string;
    value: string | any;
  };
  timestamp: string;
  verdict: Verdict;
  score: number; // 0-100
  sources: SourceResult[];
  summary: CheckSummary;
  metadata: CheckMetadata;
}
