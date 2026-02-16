/**
 * DICOSE Rural Registry Checker - Uruguay
 *
 * Fonte: DICOSE - División de Contralor de Semovientes (MGAP)
 * Cobertura: Censo pecuário nacional anual (todos os estabelecimentos rurais)
 *
 * O que verifica:
 * - Se produtor/propriedade tem declaração DICOSE válida
 * - Área explorada em hectares
 * - Tipo de atividade (bovinos, ovinos, agricultura, etc)
 * - Status da declaração (válida/irregular)
 *
 * Uso:
 * - Similar ao CAR brasileiro
 * - Verifica se propriedade rural está registrada
 * - Valida compliance com declarações anuais obrigatórias
 *
 * Legal:
 * - Declaração obrigatória para todos os estabelecimentos rurais
 * - Base para políticas públicas e controle sanitário
 * - Dados atualizados anualmente (publicado em Março)
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
import { dicoseRegistrations } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

export class DICOSERuralChecker extends BaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'DICOSE Rural Registry',
    category: CheckerCategory.ENVIRONMENTAL,
    description: 'Verifica se produtor tem registro DICOSE válido (cadastro rural uruguaio)',
    priority: 7,
    supportedInputTypes: [InputType.RUC, InputType.CI],
    supportedCountries: [Country.URUGUAY]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 2592000,  // 30 dias (dados anuais)
    timeout: 3000  // 3s (query simples por documento)
  };

  /**
   * Check se RUC/CI tem declaração DICOSE válida
   */
  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    logger.debug({ input: input.value, country: input.country }, 'Checking DICOSE rural registry');

    try {
      // Query banco de dados - buscar declaração mais recente
      const results = await db
        .select()
        .from(dicoseRegistrations)
        .where(and(
          eq(dicoseRegistrations.producerDocument, input.value),
          eq(dicoseRegistrations.country, input.country)
        ))
        .orderBy(desc(dicoseRegistrations.year))
        .limit(1);

      const registration = results[0];

      if (!registration) {
        // Nenhuma declaração DICOSE encontrada - WARNING
        return {
          status: CheckStatus.WARNING,
          severity: Severity.MEDIUM,
          message: 'No DICOSE declaration found for this producer',
          details: {
            document: input.value,
            documentType: input.type,
            source: 'DICOSE - División de Contralor de Semovientes',
            recommendation: 'MEDIUM RISK: Producer does not have livestock/rural property declaration in DICOSE registry. This may indicate: (1) No rural activity, (2) Missing mandatory declaration, or (3) Recent establishment not yet declared.',
            legalFramework: 'Decreto 89/996 - Declaración obligatoria de existencias ganaderas',
            regulatoryBody: 'DICOSE - MGAP'
          },
          evidence: {
            dataSource: 'DICOSE (Uruguay)',
            url: 'https://www.gub.uy/ministerio-ganaderia-agricultura-pesca/datos-y-estadisticas/datos/datos-preliminares-basados-declaracion-jurada-existencias-dicose',
            lastUpdate: new Date().getFullYear().toString()
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      // Verificar se declaração é recente (últimos 2 anos)
      const currentYear = new Date().getFullYear();
      const isRecent = (currentYear - registration.year) <= 2;

      if (!isRecent) {
        // Declaração muito antiga - WARNING
        return {
          status: CheckStatus.WARNING,
          severity: Severity.MEDIUM,
          message: `DICOSE declaration found but outdated (last: ${registration.year})`,
          details: {
            establishmentId: registration.establishmentId,
            producerName: registration.producerName,
            lastDeclarationYear: registration.year,
            department: registration.department,
            areaHa: registration.areaHa,
            activity: registration.activity,
            yearsOld: currentYear - registration.year,
            source: 'DICOSE - División de Contralor de Semovientes',
            recommendation: `MEDIUM RISK: Last declaration was ${currentYear - registration.year} years ago (${registration.year}). Rural producers must declare annually. Outdated declaration may indicate inactive property or non-compliance.`,
            legalFramework: 'Decreto 89/996 - Declaración anual obligatoria'
          },
          evidence: {
            dataSource: 'DICOSE (Uruguay)',
            url: 'https://catalogodatos.gub.uy/dataset/mgap-datos-preliminares-basados-en-la-declaracion-jurada-de-existencias-dicose-snig-2024',
            lastUpdate: registration.year.toString()
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      // Declaração válida e recente - PASS
      const livestockSummary = this.summarizeLivestock(registration.livestockCount);
      const landUseSummary = this.summarizeLandUse(registration.landUse);

      return {
        status: CheckStatus.PASS,
        message: `Valid DICOSE declaration found (${registration.year})`,
        details: {
          establishmentId: registration.establishmentId,
          producerName: registration.producerName,
          year: registration.year,
          department: registration.department,
          section: registration.section,
          areaHa: registration.areaHa,
          activity: registration.activity,
          declarationStatus: registration.declarationStatus,
          livestockSummary,
          landUseSummary,
          source: 'DICOSE - División de Contralor de Semovientes'
        },
        evidence: {
          dataSource: 'DICOSE (Uruguay)',
          url: 'https://catalogodatos.gub.uy/dataset/mgap-datos-preliminares-basados-en-la-declaracion-jurada-de-existencias-dicose-snig-2024',
          lastUpdate: registration.year.toString()
        },
        executionTimeMs: 0,
        cached: false
      };
    } catch (err) {
      logger.error({ err }, 'Error checking DICOSE rural registry');
      throw err;
    }
  }

  /**
   * Resume contagem de gado em formato legível
   */
  private summarizeLivestock(livestockCount: any): string {
    if (!livestockCount || typeof livestockCount !== 'object') {
      return 'No livestock data';
    }

    const species = [];
    if (livestockCount.bovinos > 0) species.push(`${livestockCount.bovinos} bovinos`);
    if (livestockCount.ovinos > 0) species.push(`${livestockCount.ovinos} ovinos`);
    if (livestockCount.equinos > 0) species.push(`${livestockCount.equinos} equinos`);
    if (livestockCount.porcinos > 0) species.push(`${livestockCount.porcinos} porcinos`);
    if (livestockCount.caprinos > 0) species.push(`${livestockCount.caprinos} caprinos`);

    return species.length > 0 ? species.join(', ') : 'No livestock declared';
  }

  /**
   * Resume uso do solo em formato legível
   */
  private summarizeLandUse(landUse: any): string {
    if (!landUse || typeof landUse !== 'object') {
      return 'No land use data';
    }

    const uses = [];
    if (landUse.pastos > 0) uses.push(`${landUse.pastos} ha pastos`);
    if (landUse.agricultura > 0) uses.push(`${landUse.agricultura} ha agricultura`);
    if (landUse.forestacion > 0) uses.push(`${landUse.forestacion} ha forestación`);

    return uses.length > 0 ? uses.join(', ') : 'No land use data';
  }
}

export default new DICOSERuralChecker();
