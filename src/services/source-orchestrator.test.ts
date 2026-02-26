import { describe, expect, it, vi } from 'vitest';
import { CheckStatus, CheckerCategory } from '../types/checker.js';
import { Country, InputType, NormalizedInput } from '../types/input.js';
import { SourceHandler } from '../types/source.js';
import { SourceOrchestrator } from './source-orchestrator.js';

function mockInput(type: InputType, country: Country = Country.BRAZIL): NormalizedInput {
  return {
    type,
    value: '123',
    originalValue: '123',
    country
  };
}

function makeHandler(config: {
  name: string;
  category: CheckerCategory;
  inputTypes: InputType[];
  countries?: Country[];
}): SourceHandler {
  return {
    descriptor: {
      name: config.name,
      category: config.category,
      supportedInputTypes: config.inputTypes,
      supportedCountries: config.countries
    },
    canHandle: (input) => {
      const typeOk = config.inputTypes.includes(input.type);
      const countries = config.countries || [Country.BRAZIL];
      return typeOk && countries.includes(input.country);
    },
    fetch: vi.fn(async () => ({
      status: CheckStatus.PASS,
      message: 'ok',
      executionTimeMs: 1,
      cached: false
    })),
    interpret: (result) => ({
      name: config.name,
      category: config.category,
      sourceType: 'direct',
      ...result
    })
  };
}

describe('SourceOrchestrator', () => {
  it('selects sources by input compatibility', () => {
    const handlers: SourceHandler[] = [
      makeHandler({
        name: 'IBAMA Embargoes',
        category: CheckerCategory.ENVIRONMENTAL,
        inputTypes: [InputType.CPF, InputType.CNPJ]
      }),
      makeHandler({
        name: 'DETER Real-Time Alerts',
        category: CheckerCategory.ENVIRONMENTAL,
        inputTypes: [InputType.COORDINATES]
      }),
      makeHandler({
        name: 'CAR Registry',
        category: CheckerCategory.ENVIRONMENTAL,
        inputTypes: [InputType.CAR]
      })
    ];

    const orchestrator = new SourceOrchestrator(handlers);
    const selected = orchestrator.selectApplicable(mockInput(InputType.CAR));
    expect(selected.map((h) => h.descriptor.name)).toEqual(['CAR Registry']);
  });

  it('supports filtering by source name and category', async () => {
    const handlers: SourceHandler[] = [
      makeHandler({
        name: 'IBAMA Embargoes',
        category: CheckerCategory.ENVIRONMENTAL,
        inputTypes: [InputType.CPF, InputType.CNPJ]
      }),
      makeHandler({
        name: 'CGU Sanctions',
        category: CheckerCategory.LEGAL,
        inputTypes: [InputType.CPF, InputType.CNPJ]
      })
    ];

    const orchestrator = new SourceOrchestrator(handlers);
    const input = mockInput(InputType.CPF);

    const byName = await orchestrator.execute(input, ['CGU Sanctions']);
    expect(byName).toHaveLength(1);
    expect(byName[0].name).toBe('CGU Sanctions');

    const byCategory = await orchestrator.execute(input, ['legal']);
    expect(byCategory).toHaveLength(1);
    expect(byCategory[0].category).toBe(CheckerCategory.LEGAL);
  });

  it('executes selected sources and returns normalized output', async () => {
    const handlers: SourceHandler[] = [
      makeHandler({
        name: 'DETER Real-Time Alerts',
        category: CheckerCategory.ENVIRONMENTAL,
        inputTypes: [InputType.COORDINATES]
      })
    ];

    const orchestrator = new SourceOrchestrator(handlers);
    const output = await orchestrator.execute(mockInput(InputType.COORDINATES), ['all']);

    expect(output).toHaveLength(1);
    expect(output[0]).toMatchObject({
      name: 'DETER Real-Time Alerts',
      category: CheckerCategory.ENVIRONMENTAL,
      sourceType: 'direct',
      status: CheckStatus.PASS
    });
  });
});
