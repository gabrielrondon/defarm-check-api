import { BaseChecker } from '../base.js';
import {
  CheckerCategory,
  CheckStatus,
  CheckerResult,
  CheckerMetadata,
  CheckerConfig,
  Severity
} from '../../types/checker.js';
import { NormalizedInput, InputType } from '../../types/input.js';
import { logger } from '../../utils/logger.js';
import { db } from '../../db/client.js';
import { ibamaEmbargoes } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

export class IbamaEmbargoesChecker extends BaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'IBAMA Embargoes',
    category: CheckerCategory.ENVIRONMENTAL,
    description: 'Verifica embargos ambientais do IBAMA por CPF/CNPJ ou coordenadas',
    priority: 9,
    supportedInputTypes: [InputType.CNPJ, InputType.CPF, InputType.COORDINATES]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 604800, // 7 dias (dados atualizados diariamente, mas estáveis)
    timeout: 3000 // 3s (queries de documento são rápidas: P95 ~10ms)
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    logger.debug({ input: input.value }, 'Checking IBAMA embargoes');

    try {
      // Route to appropriate check method based on input type
      if (input.type === InputType.COORDINATES) {
        return await this.checkByCoordinates(input);
      } else if (input.type === InputType.CNPJ || input.type === InputType.CPF) {
        return await this.checkByDocument(input);
      }

      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'Input type not supported for IBAMA embargoes check',
        executionTimeMs: 0,
        cached: false
      };
    } catch (err) {
      throw new Error(`Failed to check IBAMA embargoes: ${(err as Error).message}`);
    }
  }

  /**
   * Check IBAMA embargoes by CPF/CNPJ
   */
  private async checkByDocument(input: NormalizedInput): Promise<CheckerResult> {
    try {
      // Query banco de dados
      const results = await db
        .select()
        .from(ibamaEmbargoes)
        .where(eq(ibamaEmbargoes.document, input.value))
        .limit(1);

      const record = results[0];

      if (record) {
        // Calcular severidade baseada em área embargada
        let severity: Severity = Severity.HIGH;
        if (record.totalAreaHa > 1000) {
          severity = Severity.CRITICAL;
        } else if (record.totalAreaHa < 100) {
          severity = Severity.MEDIUM;
        }

        const embargosList = record.embargos as any[];

        return {
          status: CheckStatus.FAIL,
          severity,
          message: `${record.embargoCount} active embargo(s) found - ${record.totalAreaHa.toFixed(2)}ha embargoed`,
          details: {
            name: record.name,
            type: record.type,
            embargoCount: record.embargoCount,
            totalArea_ha: record.totalAreaHa,
            embargos: embargosList.slice(0, 5), // Limitar a 5 para não sobrecarregar
            hasMore: record.embargoCount > 5,
            recommendation: `CRITICAL: ${record.embargoCount} active environmental embargo(s) from IBAMA. Property has ${record.totalAreaHa.toFixed(2)} hectares under embargo. Compliance review required immediately.`
          },
          evidence: {
            dataSource: 'IBAMA - Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renováveis',
            url: 'https://servicos.ibama.gov.br/ctf/publico/areasembargadas/',
            lastUpdate: '2026-01-28',
            raw: {
              document: record.document,
              documentFormatted: record.documentFormatted,
              type: record.type,
              name: record.name,
              embargoCount: record.embargoCount,
              totalArea_ha: record.totalAreaHa,
              embargos: embargosList
            }
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      return {
        status: CheckStatus.PASS,
        message: 'No active IBAMA embargoes found',
        details: {
          source: 'IBAMA - Embargos Ambientais',
          checkedAt: new Date().toISOString()
        },
        evidence: {
          dataSource: 'IBAMA',
          url: 'https://servicos.ibama.gov.br/ctf/publico/areasembargadas/',
          lastUpdate: '2026-01-28'
        },
        executionTimeMs: 0,
        cached: false
      };
    } catch (err) {
      throw new Error(`Failed to check IBAMA embargoes by document: ${(err as Error).message}`);
    }
  }

  /**
   * Check IBAMA embargoes by coordinates (spatial search in JSONB)
   */
  private async checkByCoordinates(input: NormalizedInput): Promise<CheckerResult> {
    if (!input.coordinates) {
      throw new Error('Coordinates required for IBAMA embargoes spatial check');
    }

    const { lat, lon } = input.coordinates;
    const bufferKm = 5; // 5km search radius

    try {
      // Query: Find embargoes within buffer distance
      // Uses JSONB operations to search coordinates in embargo array
      const results = await db.execute(sql`
        SELECT
          document,
          name,
          type,
          embargo_count,
          total_area_ha,
          embargos,
          (
            SELECT jsonb_agg(embargo)
            FROM jsonb_array_elements(embargos) as embargo
            WHERE (
              111.32 * SQRT(
                POW(CAST(embargo->'coordinates'->>'lat' AS FLOAT) - ${lat}, 2) +
                POW(CAST(embargo->'coordinates'->>'lon' AS FLOAT) - ${lon}, 2)
              )
            ) <= ${bufferKm}
          ) as nearby_embargos,
          (
            SELECT MIN(
              111.32 * SQRT(
                POW(CAST(embargo->'coordinates'->>'lat' AS FLOAT) - ${lat}, 2) +
                POW(CAST(embargo->'coordinates'->>'lon' AS FLOAT) - ${lon}, 2)
              )
            )
            FROM jsonb_array_elements(embargos) as embargo
          ) as min_distance_km
        FROM ibama_embargoes
        WHERE (
          SELECT COUNT(*)
          FROM jsonb_array_elements(embargos) as embargo
          WHERE (
            111.32 * SQRT(
              POW(CAST(embargo->'coordinates'->>'lat' AS FLOAT) - ${lat}, 2) +
              POW(CAST(embargo->'coordinates'->>'lon' AS FLOAT) - ${lon}, 2)
            )
          ) <= ${bufferKm}
        ) > 0
        ORDER BY min_distance_km ASC
        LIMIT 10
      `);

      if (!results.rows || results.rows.length === 0) {
        return {
          status: CheckStatus.PASS,
          message: `No IBAMA embargoes found within ${bufferKm}km`,
          details: {
            coordinates: { lat, lon },
            searchRadius_km: bufferKm,
            source: 'IBAMA - Embargos Ambientais'
          },
          evidence: {
            dataSource: 'IBAMA',
            url: 'https://servicos.ibama.gov.br/ctf/publico/areasembargadas/',
            lastUpdate: '2026-01-28'
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      // Process results
      const nearbyRecords = results.rows as any[];
      const totalRecords = nearbyRecords.length;
      const closestRecord = nearbyRecords[0];
      const nearbyEmbargos = closestRecord.nearby_embargos || [];
      const totalNearbyEmbargos = nearbyEmbargos.length;
      const minDistanceKm = Number(closestRecord.min_distance_km || 0);

      // Calculate total embargoed area nearby
      const totalAreaHa = nearbyEmbargos.reduce(
        (sum: number, e: any) => sum + (Number(e.area_ha) || 0),
        0
      );

      // Determine severity
      let severity: Severity = Severity.HIGH;
      if (minDistanceKm < 1) {
        severity = Severity.CRITICAL; // Very close (<1km)
      } else if (minDistanceKm < 2 || totalAreaHa > 500) {
        severity = Severity.HIGH;
      } else {
        severity = Severity.MEDIUM;
      }

      return {
        status: CheckStatus.FAIL,
        severity,
        message: `${totalNearbyEmbargos} IBAMA embargo(s) found within ${bufferKm}km (closest: ${minDistanceKm.toFixed(2)}km)`,
        details: {
          coordinates: { lat, lon },
          searchRadius_km: bufferKm,
          totalEmbargos: totalNearbyEmbargos,
          totalAffectedPeople: totalRecords,
          closestEmbargo: {
            distance_km: Number(minDistanceKm.toFixed(2)),
            name: closestRecord.name,
            document: closestRecord.document
          },
          totalArea_ha: Number(totalAreaHa.toFixed(2)),
          embargos: nearbyEmbargos.slice(0, 5).map((e: any) => ({
            embargoNumber: e.embargoNumber,
            date: e.date,
            area_ha: Number(e.area_ha),
            municipality: e.municipality,
            state: e.state,
            description: e.description?.substring(0, 150) + '...'
          })),
          hasMore: totalNearbyEmbargos > 5,
          recommendation: `${severity}: ${totalNearbyEmbargos} active environmental embargo(s) found within ${bufferKm}km. Closest is ${minDistanceKm.toFixed(2)}km away. Total embargoed area: ${totalAreaHa.toFixed(2)}ha. Environmental compliance review recommended.`
        },
        evidence: {
          dataSource: 'IBAMA - Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renováveis',
          url: 'https://servicos.ibama.gov.br/ctf/publico/areasembargadas/',
          lastUpdate: '2026-01-28'
        },
        executionTimeMs: 0,
        cached: false
      };
    } catch (err) {
      throw new Error(`Failed to check IBAMA embargoes by coordinates: ${(err as Error).message}`);
    }
  }
}

export default new IbamaEmbargoesChecker();
