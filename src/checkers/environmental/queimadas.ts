import { BaseChecker } from '../base.js';
import { CheckerCategory, CheckStatus, Severity } from '../../types/checker.js';
import { InputType, NormalizedInput } from '../../types/input.js';
import type { CheckerResult } from '../../types/checker.js';
import { db } from '../../db/client.js';
import { queimadasFocos } from '../../db/schema.js';
import { sql } from 'drizzle-orm';

/**
 * INPE Queimadas - Fire Hotspots Checker
 *
 * Verifica se existem focos de calor/queimadas detectados por satélites em propriedades rurais.
 * Utiliza dados do Programa Queimadas do INPE, atualizados diariamente.
 *
 * Data source: INPE - Instituto Nacional de Pesquisas Espaciais
 * Update frequency: Daily (dados dos últimos 90 dias)
 */
export class QueimadasChecker extends BaseChecker {
  metadata = {
    name: 'INPE Fire Hotspots',
    category: CheckerCategory.ENVIRONMENTAL,
    description: 'Verifica focos de calor/queimadas detectados por satélites (INPE)',
    dataSource: 'INPE - Programa Queimadas',
    priority: 8, // Alta prioridade - indicador em tempo real
    supportedInputTypes: [InputType.COORDINATES, InputType.CAR, InputType.ADDRESS]
  };

  config = {
    enabled: true,
    cacheTTL: 3600, // 1 hora (dados atualizados frequentemente)
    timeout: 8000
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    // Validate input has coordinates
    if (!input.coordinates) {
      return {
        status: CheckStatus.ERROR,
        message: 'Coordenadas não fornecidas para verificação de queimadas',
        executionTimeMs: 0,
        cached: false
      };
    }

    const { lat: latitude, lon: longitude } = input.coordinates;
    const buffer = 1000; // Default 1km buffer

    // Query fire hotspots within buffer distance (default 1km)
    // Use ST_DWithin for efficient spatial search with distance in meters
    const result = await db.execute(sql`
      SELECT
        id,
        latitude,
        longitude,
        date_time,
        satellite,
        municipality,
        state,
        biome,
        frp,
        ST_Distance(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
        ) as distance_meters
      FROM queimadas_focos
      WHERE ST_DWithin(
        geom::geography,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
        ${buffer}
      )
      AND date_time >= NOW() - INTERVAL '90 days'
      ORDER BY date_time DESC
      LIMIT 100
    `);

    const hotspots = result.rows || [];

    if (hotspots.length === 0) {
      return {
        status: CheckStatus.PASS,
        message: `Nenhum foco de queimada detectado nos últimos 90 dias (raio de ${buffer}m)`,
        details: {
          checked_area_meters: buffer,
          total_hotspots: 0
        },
        executionTimeMs: 0,
        cached: false
      };
    }

    const totalHotspots = hotspots.length;
    const mostRecentHotspot = hotspots[0];
    const last7Days = hotspots.filter((h: any) => {
      const daysAgo = (Date.now() - new Date(h.date_time).getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 7;
    });

    // Determine severity based on recency and quantity
    let severity = Severity.MEDIUM;
    let message = '';

    if (last7Days.length > 0) {
      severity = Severity.HIGH;
      message = `${totalHotspots} foco(s) de queimada detectado(s), sendo ${last7Days.length} nos últimos 7 dias`;
    } else {
      severity = Severity.MEDIUM;
      message = `${totalHotspots} foco(s) de queimada detectado(s) nos últimos 90 dias`;
    }

    // Calculate average FRP (Fire Radiative Power) if available
    const validFRP = hotspots.filter((h: any) => h.frp !== null);
    const avgFRP = validFRP.length > 0
      ? Math.round(validFRP.reduce((sum: number, h: any) => sum + h.frp, 0) / validFRP.length)
      : null;

    return {
      status: CheckStatus.FAIL,
      severity,
      message,
      details: {
        total_hotspots: totalHotspots,
        last_7_days: last7Days.length,
        checked_area_meters: buffer,
        most_recent: {
          date: mostRecentHotspot.date_time,
          distance_meters: Math.round(Number(mostRecentHotspot.distance_meters)),
          satellite: mostRecentHotspot.satellite,
          municipality: mostRecentHotspot.municipality,
          state: mostRecentHotspot.state,
          biome: mostRecentHotspot.biome,
          frp: mostRecentHotspot.frp
        },
        avg_frp: avgFRP,
        hotspots: hotspots.slice(0, 10).map((h: any) => ({
          date: h.date_time,
          distance_meters: Math.round(Number(h.distance_meters)),
          satellite: h.satellite,
          frp: h.frp
        }))
      },
      executionTimeMs: 0,
      cached: false
    };
  }
}

export default new QueimadasChecker();
