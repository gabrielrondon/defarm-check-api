import { BaseChecker } from './base.js';
import { logger } from '../utils/logger.js';

class CheckerRegistry {
  private checkers: Map<string, BaseChecker> = new Map();

  // Registra um checker
  register(checker: BaseChecker): void {
    const name = checker.metadata.name;

    if (this.checkers.has(name)) {
      logger.warn({ name }, 'Checker already registered, replacing');
    }

    this.checkers.set(name, checker);
    logger.info({ name, category: checker.metadata.category }, 'Checker registered');
  }

  // Busca um checker por nome
  get(name: string): BaseChecker | undefined {
    return this.checkers.get(name);
  }

  // Lista todos os checkers
  getAll(): BaseChecker[] {
    return Array.from(this.checkers.values());
  }

  // Lista checkers por categoria
  getByCategory(category: string): BaseChecker[] {
    return this.getAll().filter(c => c.metadata.category === category);
  }

  // Lista checkers ativos
  getActive(): BaseChecker[] {
    return this.getAll()
      .filter(c => c.config.enabled)
      .sort((a, b) => b.metadata.priority - a.metadata.priority);
  }

  // Lista checkers aplicáveis a um input
  getApplicable(inputType: string): BaseChecker[] {
    return this.getActive().filter(c =>
      c.metadata.supportedInputTypes.includes(inputType)
    );
  }
}

export const checkerRegistry = new CheckerRegistry();
