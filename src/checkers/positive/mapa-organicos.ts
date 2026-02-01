#!/usr/bin/env tsx
/**
 * MAPA Orgânicos Checker - Verifica certificação orgânica no CNPO
 *
 * Fonte: MAPA - Cadastro Nacional de Produtores Orgânicos (CNPO)
 * Tipo: POSITIVO (presença na lista é BOM ✅)
 *
 * Verifica se produtor/empresa possui certificação orgânica ativa
 */

import { BaseChecker } from '../base.js';
import {
  CheckerCategory,
  CheckerResult,
  CheckerMetadata,
  CheckerConfig,
  CheckStatus
} from '../../types/checker.js';
import { NormalizedInput, InputType } from '../../types/input.js';
import { db } from '../../db/client.js';
import { mapaOrganicos } from '../../db/schema.js';
import { eq, ilike, and } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';

export class MapaOrganicosChecker extends BaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'MAPA Organic Certification',
    category: CheckerCategory.POSITIVE,
    description: 'Verifica certificação orgânica no Cadastro Nacional de Produtores Orgânicos (CNPO/MAPA)',
    priority: 8, // High priority for positive indicator
    supportedInputTypes: [InputType.CNPJ, InputType.CPF, InputType.NAME]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 86400, // 24 hours (data updated every 10 days)
    timeout: 8000 // 8 seconds (name searches can be slower)
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    logger.debug({ input: input.value }, 'Checking MAPA organic certification');

    try {
      let certifications: any[] = [];

      if (input.type === InputType.CNPJ || input.type === InputType.CPF) {
        // Search by document (note: most documents are masked)
        certifications = await db
          .select()
          .from(mapaOrganicos)
          .where(
            and(
              eq(mapaOrganicos.document, input.value),
              eq(mapaOrganicos.status, 'ATIVO')
            )
          )
          .limit(10);
      } else if (input.type === InputType.NAME) {
        // Search by producer name (case-insensitive partial match)
        certifications = await db
          .select()
          .from(mapaOrganicos)
          .where(
            and(
              ilike(mapaOrganicos.producerName, `%${input.value}%`),
              eq(mapaOrganicos.status, 'ATIVO')
            )
          )
          .limit(10);
      }

      if (certifications.length === 0) {
        return {
          status: CheckStatus.NOT_APPLICABLE,
          message: 'Not found in organic producers registry',
          details: {
            searchType: input.type,
            searchValue: input.value,
            note: 'Absence does not indicate irregularity - only that there is no organic certification registered in CNPO/MAPA',
            source: 'MAPA/CNPO'
          },
          evidence: {
            dataSource: 'MAPA - Cadastro Nacional de Produtores Orgânicos',
            url: 'https://www.gov.br/agricultura/pt-br/assuntos/sustentabilidade/organicos/cadastro-nacional-de-produtores-organicos-cnpo',
            lastUpdate: '2026-01-21'
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      // POSITIVE indicator - certification found!
      return {
        status: CheckStatus.PASS,
        message: `✅ Active organic certification found (${certifications.length} record${certifications.length > 1 ? 's' : ''})`,
        details: {
          totalCertifications: certifications.length,
          certifications: certifications.map(cert => ({
            producerName: cert.producerName,
            entityType: cert.entityType,
            entityName: cert.entityName,
            state: cert.state,
            city: cert.city,
            country: cert.country,
            scope: cert.scope?.substring(0, 200), // Limit length
            activities: cert.activities?.substring(0, 300), // Limit length
            contact: cert.contact,
            status: cert.status,
            updatedAt: cert.updatedAt
          })),
          source: 'MAPA/CNPO',
          note: 'Valid and active organic certification'
        },
        evidence: {
          dataSource: 'MAPA - Cadastro Nacional de Produtores Orgânicos',
          url: 'https://www.gov.br/agricultura/pt-br/assuntos/sustentabilidade/organicos/cadastro-nacional-de-produtores-organicos-cnpo',
          lastUpdate: '2026-01-21',
          raw: certifications[0]
        },
        executionTimeMs: 0,
        cached: false
      };

    } catch (err) {
      throw new Error(`Failed to check MAPA organic certification: ${(err as Error).message}`);
    }
  }
}

export default new MapaOrganicosChecker();
