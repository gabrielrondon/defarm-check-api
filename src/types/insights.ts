export type IndicatorDirection = 'HIGHER_IS_WORSE' | 'LOWER_IS_WORSE' | 'NEUTRAL';

export interface L1Indicator {
  id: string;
  name: string;
  value: number | string | boolean | null;
  unit?: string;
  direction?: IndicatorDirection;
  confidence?: number; // 0..1
  source?: string;
}

export interface L2DimensionScore {
  id: string;
  label: string;
  score: number; // 0..100
  weight?: number;
  rationale?: string;
}

export interface L2Insights {
  version: string;
  dimensions: L2DimensionScore[];
}

export interface L3Signal {
  id: string;
  label: string;
  value: string | number | boolean | null;
  horizon?: '7d' | '30d' | '90d';
  confidence?: number; // 0..1
}

export interface L3Insights {
  version: string;
  signals: L3Signal[];
}

export interface CheckInsights {
  l2?: L2Insights;
  l3?: L3Insights;
}
