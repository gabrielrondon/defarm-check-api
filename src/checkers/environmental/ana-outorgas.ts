/**
 * ANA Water Use Permits Checker
 *
 * Verifica autorizações de uso de recursos hídricos concedidas pela ANA
 *
 * Data Source: Agência Nacional de Águas e Saneamento Básico (ANA)
 * Coverage: Federal water bodies (rios de domínio da União)
 * Update Frequency: Continuous
 *
 * LIMITATION: Dataset does not include CPF/CNPJ fields.
 * This checker only supports COORDINATES and CAR input types.
 */

import { BaseChecker } from '../base.js';
import { CheckerMetadata, CheckerConfig, CheckerResult, CheckerCategory, CheckStatus, Severity } from '../../types/checker.js';
import { NormalizedInput, InputType } from '../../types/input.js';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export class AnaOutorgasChecker extends BaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'ANA Water Use Permits',
    category: CheckerCategory.ENVIRONMENTAL,
    description: 'Verifica autorizações de uso de recursos hídricos (outorgas) em rios federais (ANA)',
    priority: 6, // Lower priority - coordinate-based only
    supportedInputTypes: [InputType.COORDINATES, InputType.CAR, InputType.ADDRESS]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 86400, // 24 hours
    timeout: 10000
  };

  /**
   * Check by coordinates - finds nearby water use permits
   */
  async checkByCoordinates(input: NormalizedInput): Promise<CheckerResult> {
    if (!input.coordinates) {
      return {
        status: CheckStatus.ERROR,
        message: 'Missing coordinates for ANA check',
        executionTimeMs: 0,
        cached: false
      };
    }

    const { lat, lon } = input.coordinates;
    const radiusMeters = 5000; // 5km search radius

    // Find outorgas within radius
    const result = await db.execute(sql`
      SELECT
        codigo_cnarh,
        nome_requerente,
        corpo_hidrico,
        regiao_hidrografica,
        finalidade_principal,
        tipo_interferencia,
        categoria,
        resolucao,
        data_vencimento,
        volume_anual_m3,
        ST_Distance(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography
        ) as distance_meters
      FROM ana_outorgas
      WHERE
        ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
        AND data_vencimento IS NOT NULL
      ORDER BY distance_meters
      LIMIT 50
    `);

    const outorgas = result.rows;

    if (outorgas.length === 0) {
      return {
        status: CheckStatus.PASS,
        message: 'Nenhuma outorga de recursos hídricos encontrada em raio de 5km',
        executionTimeMs: 0,
        cached: false
      };
    }

    // Separate valid and expired
    const now = new Date();
    const valid = outorgas.filter((o: any) => new Date(o.data_vencimento) > now);
    const expired = outorgas.filter((o: any) => new Date(o.data_vencimento) <= now);

    // Calculate total authorized volume
    const totalVolume = outorgas.reduce((sum: number, o: any) => sum + (Number(o.volume_anual_m3) || 0), 0);

    const details = {
      outorgas_total: outorgas.length,
      outorgas_validas: valid.length,
      outorgas_vencidas: expired.length,
      volume_total_m3_ano: totalVolume,
      search_radius_m: radiusMeters,
      finalidades: [...new Set(outorgas.map((o: any) => o.finalidade_principal))],
      corpos_hidricos: [...new Set(outorgas.map((o: any) => o.corpo_hidrico))],
      outorgas_proximas: outorgas.slice(0, 10).map((o: any) => ({
        codigo_cnarh: o.codigo_cnarh,
        requerente: o.nome_requerente,
        corpo_hidrico: o.corpo_hidrico,
        finalidade: o.finalidade_principal,
        categoria: o.categoria,
        vencimento: o.data_vencimento,
        volume_m3_ano: o.volume_anual_m3,
        distancia_m: Math.round(Number(o.distance_meters))
      }))
    };

    const message = valid.length > 0
      ? `${valid.length} outorga(s) de recursos hídricos válida(s) encontrada(s) em raio de 5km`
      : `${expired.length} outorga(s) vencida(s) encontrada(s) em raio de 5km (nenhuma válida)`;

    // INFO - having water permits is not a violation
    // User can verify if permit is valid for intended use
    return {
      status: CheckStatus.PASS,
      message,
      details,
      evidence: {
        dataSource: 'Agência Nacional de Águas e Saneamento Básico (ANA)',
        url: 'https://dadosabertos.ana.gov.br/'
      },
      executionTimeMs: 0,
      cached: false
    };
  }

  /**
   * Check by CAR code - extracts coordinates from CAR and checks for outorgas
   */
  async checkByCAR(input: NormalizedInput): Promise<CheckerResult> {
    if (!input.value) {
      return {
        status: CheckStatus.ERROR,
        message: 'Missing CAR code',
        executionTimeMs: 0,
        cached: false
      };
    }

    // Get CAR coordinates
    const carResult = await db.execute(sql`
      SELECT
        ST_Y(ST_Centroid(geom::geometry)) as lat,
        ST_X(ST_Centroid(geom::geometry)) as lon
      FROM car_registrations
      WHERE car_number = ${input.value}
      AND geom IS NOT NULL
      LIMIT 1
    `);

    if (carResult.rows.length === 0) {
      return {
        status: CheckStatus.ERROR,
        message: 'CAR coordinates not found - unable to check water permits',
        executionTimeMs: 0,
        cached: false
      };
    }

    const coordinates = carResult.rows[0] as { lat: number; lon: number };

    // Reuse coordinates check
    const coordInput: NormalizedInput = {
      ...input,
      type: InputType.COORDINATES,
      coordinates
    };

    return await this.checkByCoordinates(coordInput);
  }

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    if (input.type === InputType.COORDINATES) {
      return await this.checkByCoordinates(input);
    } else if (input.type === InputType.CAR) {
      return await this.checkByCAR(input);
    }

    return {
      status: CheckStatus.NOT_APPLICABLE,
      message: 'ANA outorgas check requires coordinates or CAR code (CPF/CNPJ not supported)',
      executionTimeMs: 0,
      cached: false
    };
  }
}

export default new AnaOutorgasChecker();
