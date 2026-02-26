import { describe, expect, it } from 'vitest';
import { CheckStatus } from '../types/checker.js';
import { SourceResult } from '../types/verdict.js';
import { deriveCompositeSources } from './derived-source-orchestrator.js';

function source(name: string, status: CheckStatus): SourceResult {
  return {
    name,
    category: 'environmental',
    sourceType: 'direct',
    status,
    message: 'test',
    executionTimeMs: 1,
    cached: false
  };
}

describe('deriveCompositeSources', () => {
  it('creates deforestation escalation when PRODES and DETER are risky', () => {
    const input: SourceResult[] = [
      source('PRODES Deforestation', CheckStatus.FAIL),
      source('DETER Real-Time Alerts', CheckStatus.WARNING)
    ];

    const derived = deriveCompositeSources(input);
    expect(derived.some((r) => r.name === 'Cross Source: Deforestation Escalation')).toBe(true);
    expect(derived.every((r) => r.sourceType === 'derived')).toBe(true);
  });

  it('creates CAR compliance watch when CAR and deforestation indicators are risky', () => {
    const input: SourceResult[] = [
      source('CAR Registry', CheckStatus.FAIL),
      source('PRODES Deforestation', CheckStatus.WARNING)
    ];

    const derived = deriveCompositeSources(input);
    expect(derived.some((r) => r.name === 'Cross Source: CAR Compliance Watch')).toBe(true);
  });

  it('creates embargoed CAR escalation when IBAMA and CAR are both risky', () => {
    const input: SourceResult[] = [
      source('IBAMA Embargoes', CheckStatus.FAIL),
      source('CAR - Cadastro Ambiental Rural', CheckStatus.WARNING)
    ];

    const derived = deriveCompositeSources(input);
    expect(derived.some((r) => r.name === 'Cross Source: Embargoed CAR Escalation')).toBe(true);
  });

  it('creates active fire pressure when Queimadas and DETER are both risky', () => {
    const input: SourceResult[] = [
      source('INPE Fire Hotspots', CheckStatus.WARNING),
      source('DETER Real-Time Alerts', CheckStatus.FAIL)
    ];

    const derived = deriveCompositeSources(input);
    expect(derived.some((r) => r.name === 'Cross Source: Active Fire Pressure')).toBe(true);
  });

  it('returns empty when no cross-risk pattern exists', () => {
    const input: SourceResult[] = [
      source('CAR Registry', CheckStatus.PASS),
      source('PRODES Deforestation', CheckStatus.PASS),
      source('DETER Real-Time Alerts', CheckStatus.PASS)
    ];

    expect(deriveCompositeSources(input)).toEqual([]);
  });
});
