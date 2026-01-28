// API Error Response
export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: any;
}

// Health Check Response
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  version: string;
  services: {
    database: 'ok' | 'down';
    redis: 'ok' | 'down';
  };
}

// Source Status Response
export interface SourceStatus {
  name: string;
  category: string;
  enabled: boolean;
  lastUpdate?: string;
  status: 'operational' | 'degraded' | 'down';
  description: string;
}
