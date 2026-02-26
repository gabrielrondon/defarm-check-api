import { CheckerCategory, CheckerResult } from './checker.js';
import { NormalizedInput } from './input.js';
import { SourceResult } from './verdict.js';

export interface SourceDescriptor {
  name: string;
  category: CheckerCategory;
  supportedInputTypes: string[];
  supportedCountries?: string[];
}

export interface SourceHandler {
  descriptor: SourceDescriptor;
  canHandle(input: NormalizedInput): boolean;
  fetch(input: NormalizedInput): Promise<CheckerResult>;
  interpret(result: CheckerResult): SourceResult;
}

