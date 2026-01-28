// Categorias de checkers
export enum CheckerCategory {
  ENVIRONMENTAL = 'environmental',
  SOCIAL = 'social',
  LEGAL = 'legal'
}

// Status do resultado
export enum CheckStatus {
  PASS = 'PASS',
  FAIL = 'FAIL',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  NOT_APPLICABLE = 'NOT_APPLICABLE'
}

// Severidade (quando status = FAIL ou WARNING)
export enum Severity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

// Evidence structure
export interface Evidence {
  dataSource: string;
  url?: string;
  lastUpdate?: string;
  raw?: any;
}

// Resultado de um checker
export interface CheckerResult {
  status: CheckStatus;
  severity?: Severity;
  message: string;
  details?: Record<string, any>;
  evidence?: Evidence;
  executionTimeMs: number;
  cached: boolean;
}

// Configuração de um checker
export interface CheckerConfig {
  enabled: boolean;
  cacheTTL: number;
  timeout: number;
  apiKey?: string;
  endpoint?: string;
  [key: string]: any;
}

// Metadados do checker
export interface CheckerMetadata {
  name: string;
  category: CheckerCategory;
  description: string;
  priority: number; // 1-10
  supportedInputTypes: string[];
}
