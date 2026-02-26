import { describe, expect, it } from 'vitest';
import { CheckStatus } from '../types/checker.js';
import { SourceResult } from '../types/verdict.js';
import { deriveCompositeSources } from './derived-source-orchestrator.js';

function src(name: string, status: CheckStatus): SourceResult {
  return {
    name,
    category: 'environmental',
    sourceType: 'direct',
    status,
    message: 'golden',
    executionTimeMs: 1,
    cached: false
  };
}

describe('derived rules golden cases', () => {
  const cases: Array<{
    name: string;
    input: SourceResult[];
    expectedRuleIds: string[];
  }> = [
    {
      name: 'prodes + deter high risk',
      input: [
        src('PRODES Deforestation', CheckStatus.FAIL),
        src('DETER Real-Time Alerts', CheckStatus.WARNING),
        src('CAR - Cadastro Ambiental Rural', CheckStatus.PASS)
      ],
      expectedRuleIds: ['cross_deforestation_escalation_v1']
    },
    {
      name: 'ibama + car + prodes',
      input: [
        src('IBAMA Embargoes', CheckStatus.FAIL),
        src('CAR - Cadastro Ambiental Rural', CheckStatus.FAIL),
        src('PRODES Deforestation', CheckStatus.WARNING)
      ],
      expectedRuleIds: [
        'cross_car_compliance_watch_v1',
        'cross_embargoed_car_escalation_v1',
        'cross_embargoed_deforestation_persistence_v1'
      ]
    },
    {
      name: 'mapbiomas + deter confirmed activity',
      input: [
        src('MapBiomas Validated Deforestation', CheckStatus.FAIL),
        src('DETER Real-Time Alerts', CheckStatus.FAIL)
      ],
      expectedRuleIds: ['cross_confirmed_active_deforestation_v1']
    },
    {
      name: 'no risky statuses',
      input: [
        src('PRODES Deforestation', CheckStatus.PASS),
        src('DETER Real-Time Alerts', CheckStatus.PASS),
        src('IBAMA Embargoes', CheckStatus.PASS)
      ],
      expectedRuleIds: []
    }
  ];

  it.each(cases)('$name', ({ input, expectedRuleIds }) => {
    const derived = deriveCompositeSources(input);
    const actualRuleIds = derived
      .map((r) => String((r.details as any)?.ruleId))
      .sort();

    expect(actualRuleIds).toEqual([...expectedRuleIds].sort());
    expect(derived.every((r) => r.sourceType === 'derived')).toBe(true);
  });
});

