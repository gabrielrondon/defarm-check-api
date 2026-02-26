import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../api/server.js';

describe('L3 Insights Routes - Integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return L3 snapshots with filters', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/insights/l3?country=BR&horizon=30&limit=5'
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('country');
      expect(data[0]).toHaveProperty('horizonDays');
      expect(data[0]).toHaveProperty('trendLabel');
    }
  });

  it('should return empty array when fromDate is in the far future', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/insights/l3?country=BR&fromDate=2100-01-01'
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it('should return portfolio summary', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/insights/l3/portfolio?country=BR&horizon=30'
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data).toHaveProperty('auditQueueSize');
    expect(data).toHaveProperty('generatedAt');
    expect(data).toHaveProperty('snapshot');
  });

  it('should return audit queue suggestions', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/insights/l3/audit-queue?country=BR&limit=10'
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('checkId');
      expect(data[0]).toHaveProperty('priority');
      expect(data[0]).toHaveProperty('reason');
    }
  });

  it('should return derived rule metrics', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/insights/derived-rules?country=BR&limit=10'
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('ruleId');
      expect(data[0]).toHaveProperty('ruleName');
      expect(data[0]).toHaveProperty('triggerCount');
    }
  });
});
