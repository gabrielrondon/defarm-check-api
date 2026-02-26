import { BaseChecker } from '../checkers/base.js';
import { CheckerResult } from '../types/checker.js';
import { Country, NormalizedInput } from '../types/input.js';
import { SourceResult } from '../types/verdict.js';
import { SourceHandler } from '../types/source.js';

export class CheckerSourceAdapter implements SourceHandler {
  constructor(private readonly checker: BaseChecker) {}

  get descriptor() {
    return {
      name: this.checker.metadata.name,
      category: this.checker.metadata.category,
      supportedInputTypes: this.checker.metadata.supportedInputTypes,
      supportedCountries: this.checker.metadata.supportedCountries
    };
  }

  canHandle(input: NormalizedInput): boolean {
    if (!this.descriptor.supportedInputTypes.includes(input.type)) return false;
    const countries = this.descriptor.supportedCountries || [Country.BRAZIL];
    return countries.includes(input.country);
  }

  async fetch(input: NormalizedInput): Promise<CheckerResult> {
    return this.checker.check(input);
  }

  interpret(result: CheckerResult): SourceResult {
    return {
      name: this.descriptor.name,
      category: this.descriptor.category,
      sourceType: 'direct',
      ...result
    };
  }
}

export class SourceOrchestrator {
  constructor(private readonly handlers: SourceHandler[]) {}

  selectApplicable(input: NormalizedInput, sources?: string[]): SourceHandler[] {
    return this.handlers.filter((handler) => {
      if (!handler.canHandle(input)) return false;
      if (!sources || sources.length === 0 || sources.includes('all')) return true;
      return (
        sources.includes(handler.descriptor.name) ||
        sources.includes(handler.descriptor.category)
      );
    });
  }

  async execute(input: NormalizedInput, sources?: string[]): Promise<SourceResult[]> {
    const applicable = this.selectApplicable(input, sources);
    const results = await Promise.all(
      applicable.map(async (handler) => {
        const raw = await handler.fetch(input);
        return handler.interpret(raw);
      })
    );
    return results;
  }
}
