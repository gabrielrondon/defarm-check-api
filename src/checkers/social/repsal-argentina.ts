/**
 * REPSAL Argentina Checker
 *
 * Verifica se um CUIT/CUIL aparece no Registro Público de Empleadores con
 * Sanciones Laborales (REPSAL) — o equivalente argentino da Lista Suja
 * do Trabalho Escravo do Brasil.
 *
 * Criado pela Ley 26.940 para registrar empregadores com infrações trabalhistas ativas.
 * Tipos de infração: trabalho infantil, trabalho não registrado, trata de personas, etc.
 *
 * Fonte: http://repsal.trabajo.gob.ar
 * Auth: Nenhuma (dados públicos; endpoint pode ser restrito a IPs argentinos)
 *
 * Estratégia: seed local via script (scripts/seed-repsal-argentina.ts).
 * Se tabela vazia → NOT_APPLICABLE (dados não carregados).
 */

import { BaseChecker } from '../base.js';
import {
  CheckerCategory,
  CheckStatus,
  CheckerResult,
  CheckerMetadata,
  CheckerConfig,
  Severity
} from '../../types/checker.js';
import { NormalizedInput, InputType, Country } from '../../types/input.js';
import { logger } from '../../utils/logger.js';
import { db } from '../../db/client.js';
import { repsalSanciones } from '../../db/schema.js';
import { eq, and, count } from 'drizzle-orm';

export class RepsalArgentinaChecker extends BaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'REPSAL - Sanciones Laborales (Argentina)',
    category: CheckerCategory.SOCIAL,
    description:
      'Verifica se CUIT/CUIL está no REPSAL — Registro Público de Empleadores ' +
      'con Sanciones Laborales (Argentina). Análogo à Lista Suja do Trabalho ' +
      'Escravo. Cobre: trabalho não registrado, trabalho infantil, trata de personas.',
    priority: 9,
    supportedInputTypes: [InputType.CUIT, InputType.CUIL],
    supportedCountries: [Country.ARGENTINA]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 86400, // 24h (REPSAL atualiza continuamente conforme regularizações)
    timeout: 3000
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    logger.debug({ cuit: input.value }, 'Checking REPSAL Argentina');

    // Verificar se há dados na tabela (graceful fallback se não seedado)
    const [{ value: totalRows }] = await db
      .select({ value: count() })
      .from(repsalSanciones)
      .where(eq(repsalSanciones.country, 'AR'));

    if (totalRows === 0) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'REPSAL data not loaded. Run scripts/seed-repsal-argentina.ts to populate.',
        details: {
          source: 'REPSAL - Ministerio de Trabajo, Empleo y Seguridad Social (Argentina)',
          note: 'Endpoint may require Argentine IP for download. See seed script for instructions.'
        },
        evidence: {
          dataSource: 'REPSAL',
          url: 'https://www.argentina.gob.ar/trabajo/repsal'
        },
        executionTimeMs: 0,
        cached: false
      };
    }

    try {
      const results = await db
        .select()
        .from(repsalSanciones)
        .where(and(
          eq(repsalSanciones.cuit, input.value),
          eq(repsalSanciones.country, 'AR')
        ))
        .limit(1);

      const record = results[0];

      if (record) {
        return {
          status: CheckStatus.FAIL,
          severity: Severity.HIGH,
          message: `Found in REPSAL (Argentine labor sanctions registry): ${record.razonSocial}`,
          details: {
            cuit: record.cuit,
            razonSocial: record.razonSocial,
            tipoInfraccion: record.tipoInfraccion,
            provincia: record.provincia,
            localidad: record.localidad,
            actividad: record.actividad,
            organismoSancionador: record.organismoSancionador,
            fechaIngreso: record.fechaIngreso,
            finPublicacion: record.finPublicacion,
            numeroExpediente: record.numeroExpediente,
            source: 'REPSAL - Ministerio de Trabajo, Empleo y Seguridad Social (Argentina)',
            recommendation:
              'Entity has active labor sanctions in Argentina. Review employment compliance before any commercial relationship.'
          },
          evidence: {
            dataSource: 'REPSAL - Registro Público de Empleadores con Sanciones Laborales',
            url: 'https://www.argentina.gob.ar/trabajo/repsal',
            lastUpdate: record.createdAt.toISOString().split('T')[0]
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      return {
        status: CheckStatus.PASS,
        message: 'Not found in REPSAL (Argentine labor sanctions registry)',
        details: {
          source: 'REPSAL - Ministerio de Trabajo, Empleo y Seguridad Social (Argentina)',
          totalRecordsChecked: Number(totalRows)
        },
        evidence: {
          dataSource: 'REPSAL - Registro Público de Empleadores con Sanciones Laborales',
          url: 'https://www.argentina.gob.ar/trabajo/repsal'
        },
        executionTimeMs: 0,
        cached: false
      };
    } catch (err) {
      throw new Error(`Failed to check REPSAL Argentina: ${(err as Error).message}`);
    }
  }
}

export default new RepsalArgentinaChecker();
