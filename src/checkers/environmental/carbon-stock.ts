/**
 * Carbon Stock Estimation Checker
 *
 * Estima estoque de carbono e biomassa acima do solo (AGB) via cobertura de árvores
 * MODIS MOD44B (Vegetation Continuous Fields, 250m, anual).
 *
 * Metodologia:
 *  - MOD44B.Percent_Tree_Cover → % cobertura arbórea (0-100)
 *  - Conversão para AGB (Mg/ha) usando fatores bioma-específicos
 *  - Carbono equivalente = AGB × 0.47 (fator biomassa → carbono)
 *  - CO2 equivalente = Carbono × 3.67 (fator C → CO2)
 *
 * Benchmarks por bioma (Mg/ha, floresta madura):
 *  - Amazônia:        ~200-300 Mg/ha AGB
 *  - Cerrado:         ~50-100  Mg/ha AGB
 *  - Mata Atlântica:  ~150-250 Mg/ha AGB
 *  - Caatinga:        ~30-70   Mg/ha AGB
 *  - Pampa/Pantanal:  ~20-60   Mg/ha AGB
 *
 * Resultado é informativo (INFO) — não gera FAIL, apenas contextualiza
 * o potencial de carbono/REDD+ da propriedade.
 *
 * API: https://modis.ornl.gov/rst/api/v1/MOD44B/subset
 * Sem autenticação necessária.
 *
 * Docs: docs/SATELLITE_IMAGERY_ROADMAP.md
 */

import { SatelliteBaseChecker } from '../satellite-base.js';
import {
  CheckerCategory,
  CheckerResult,
  CheckerMetadata,
  CheckerConfig,
  CheckStatus,
  Severity
} from '../../types/checker.js';
import { NormalizedInput, InputType } from '../../types/input.js';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';

const ORNL_DAAC_BASE = 'https://modis.ornl.gov/rst/api/v1';

// AGB conversion factor (Mg/ha per 1% tree cover), biome-specific
// Based on average forest biomass density / 100
const BIOME_AGB_FACTOR: Record<string, { name: string; factorMgHaPerPct: number; maxForestAGB: number }> = {
  amazon:         { name: 'Amazônia',         factorMgHaPerPct: 2.5,  maxForestAGB: 280 },
  cerrado:        { name: 'Cerrado',          factorMgHaPerPct: 0.9,  maxForestAGB: 90  },
  caatinga:       { name: 'Caatinga',         factorMgHaPerPct: 0.5,  maxForestAGB: 55  },
  mata_atlantica: { name: 'Mata Atlântica',   factorMgHaPerPct: 2.0,  maxForestAGB: 220 },
  pampa:          { name: 'Pampa',            factorMgHaPerPct: 0.4,  maxForestAGB: 45  },
  pantanal:       { name: 'Pantanal',         factorMgHaPerPct: 0.6,  maxForestAGB: 65  }
};

function detectBiome(lat: number, lon: number): string {
  if (lat > -4  && lat < 5   && lon > -74 && lon < -44) return 'amazon';
  if (lat > -12 && lat < 0   && lon > -60 && lon < -44) return 'amazon';
  if (lat > -18 && lat < -4  && lon > -74 && lon < -44) return 'amazon';
  if (lat < -29 && lat > -34 && lon > -58 && lon < -49) return 'pampa';
  if (lat < -17 && lat > -22 && lon > -59 && lon < -54) return 'pantanal';
  if (lat > -8  && lat < 0   && lon > -46 && lon < -36) return 'caatinga';
  if (lat > -12 && lat < -4  && lon > -44 && lon < -36) return 'caatinga';
  if (lat > -18 && lat < -8  && lon > -46 && lon < -36) return 'caatinga';
  if (lat < -23 && lat > -35 && lon > -54 && lon < -40) return 'mata_atlantica';
  if (lat < -15 && lat > -25 && lon > -52 && lon < -40) return 'mata_atlantica';
  return 'cerrado';
}

interface TreeCoverYear {
  year: number;
  tree_cover_pct: number;
}

export class CarbonStockChecker extends SatelliteBaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'Carbon Stock Estimation (MODIS VCF)',
    category: CheckerCategory.ENVIRONMENTAL,
    description:
      'Estima estoque de carbono e biomassa (AGB) via cobertura arbórea MODIS MOD44B ' +
      '(Vegetation Continuous Fields, 250m, 5 anos). Útil para mercado de carbono, REDD+ e financiamento verde.',
    priority: 1,
    supportedInputTypes: [InputType.COORDINATES, InputType.CAR]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 86400 * 30, // 30 days
    timeout: 15000
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    if (input.type === InputType.COORDINATES) {
      return this.checkByCoordinates(input);
    }
    if (input.type === InputType.CAR) {
      return this.checkByCAR(input);
    }
    return {
      status: CheckStatus.NOT_APPLICABLE,
      message: 'Input type not supported. Use COORDINATES or CAR.',
      executionTimeMs: 0,
      cached: false
    };
  }

  private async checkByCoordinates(input: NormalizedInput): Promise<CheckerResult> {
    if (!input.coordinates) throw new Error('Coordinates required');
    const { lat, lon } = input.coordinates;
    const treeCover = await this.fetchTreeCover(lat, lon);
    return this.estimateCarbon(treeCover, { lat, lon }, null);
  }

  private async checkByCAR(input: NormalizedInput): Promise<CheckerResult> {
    const carCode = input.value;
    const rows = await db.execute<{ lat: number; lon: number; area_ha: number | null }>(sql`
      SELECT ST_Y(ST_Centroid(geometry)) AS lat, ST_X(ST_Centroid(geometry)) AS lon, area_ha
      FROM car_registrations WHERE car_number = ${carCode} LIMIT 1
    `);
    const car = rows.rows?.[0];
    if (!car?.lat) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: `CAR ${carCode} not found in local database`,
        details: { car_number: carCode },
        executionTimeMs: 0,
        cached: false
      };
    }
    const treeCover = await this.fetchTreeCover(car.lat, car.lon);
    return this.estimateCarbon(treeCover, { lat: car.lat, lon: car.lon }, carCode, car.area_ha ?? undefined);
  }

  private async fetchTreeCover(lat: number, lon: number): Promise<TreeCoverYear[]> {
    const currentYear = new Date().getFullYear();
    const startYear   = currentYear - 5;

    const url = new URL(`${ORNL_DAAC_BASE}/MOD44B/subset`);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('band', 'Percent_Tree_Cover');
    url.searchParams.set('startDate', `A${startYear}001`);
    url.searchParams.set('endDate',   `A${currentYear - 1}001`);
    url.searchParams.set('kmAboveBelow', '0');
    url.searchParams.set('kmLeftRight',  '0');

    logger.debug({ lat, lon, url: url.toString() }, 'ORNL DAAC MOD44B tree cover request');

    try {
      const response = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json', 'User-Agent': 'DeFarm-Check-API/2.5' },
        signal: AbortSignal.timeout(this.config.timeout ?? 15000)
      });
      if (!response.ok) return [];

      const data = await response.json() as {
        subset?: Array<{ calendar_date: string; data: number[] }>;
      };

      const FILL_VALUE = 200; // MOD44B fill value
      return (data.subset ?? [])
        .filter(s => s.data[0] !== undefined && s.data[0] < FILL_VALUE)
        .map(s => ({
          year:           parseInt(s.calendar_date.split('-')[0]),
          tree_cover_pct: s.data[0]
        }));
    } catch (err) {
      logger.warn({ err, lat, lon }, 'MOD44B tree cover request failed');
      return [];
    }
  }

  private estimateCarbon(
    treeCoverData: TreeCoverYear[],
    location: { lat: number; lon: number },
    carCode: string | null,
    propertyAreaHa?: number
  ): CheckerResult {
    if (treeCoverData.length === 0) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'No tree cover data available for this location',
        details: { ...(carCode ? { car_number: carCode } : { coordinates: location }) },
        executionTimeMs: 0,
        cached: false
      };
    }

    const biomeKey  = detectBiome(location.lat, location.lon);
    const biomeInfo = BIOME_AGB_FACTOR[biomeKey];

    const latest        = treeCoverData[treeCoverData.length - 1];
    const earliest      = treeCoverData[0];
    const treeCoverPct  = latest.tree_cover_pct;

    // Estimate AGB using biome-specific factor (Mg/ha)
    const estimatedAGB    = Math.min(treeCoverPct * biomeInfo.factorMgHaPerPct, biomeInfo.maxForestAGB);
    const carbonMgHa      = estimatedAGB * 0.47;   // biomass to carbon conversion
    const co2eqMgHa       = carbonMgHa * 3.67;     // carbon to CO2 equivalent

    // Property-level totals if area is known
    const totalCarbonMg   = propertyAreaHa ? carbonMgHa * propertyAreaHa : null;
    const totalCo2eqMg    = propertyAreaHa ? co2eqMgHa * propertyAreaHa : null;

    // Tree cover trend
    const treeCoverChange = latest.tree_cover_pct - earliest.tree_cover_pct;

    // Classification of carbon potential
    const carbonPotential =
      estimatedAGB >= biomeInfo.maxForestAGB * 0.8  ? 'HIGH — near-mature forest' :
      estimatedAGB >= biomeInfo.maxForestAGB * 0.5  ? 'MODERATE — secondary forest or dense savanna' :
      estimatedAGB >= biomeInfo.maxForestAGB * 0.2  ? 'LOW — open vegetation, degraded forest or pasture' :
      'VERY LOW — sparse vegetation, pasture or bare soil';

    const evidence = {
      dataSource: 'NASA MODIS MOD44B — Vegetation Continuous Fields (250m, annual)',
      url: 'https://modis.ornl.gov/',
      lastUpdate: new Date().toISOString().split('T')[0]
    };

    const details: Record<string, unknown> = {
      ...(carCode ? { car_number: carCode } : { coordinates: location }),
      biome:                    biomeInfo.name,
      tree_cover_pct:           treeCoverPct,
      tree_cover_change_pct:    parseFloat(treeCoverChange.toFixed(1)),
      estimated_agb_mg_ha:      parseFloat(estimatedAGB.toFixed(1)),
      estimated_carbon_mg_ha:   parseFloat(carbonMgHa.toFixed(1)),
      estimated_co2eq_mg_ha:    parseFloat(co2eqMgHa.toFixed(1)),
      carbon_potential:         carbonPotential,
      ...(propertyAreaHa ? {
        property_area_ha:       propertyAreaHa,
        total_carbon_mg:        totalCarbonMg != null ? parseFloat(totalCarbonMg.toFixed(0)) : null,
        total_co2eq_mg:         totalCo2eqMg  != null ? parseFloat(totalCo2eqMg.toFixed(0)) : null
      } : {}),
      tree_cover_by_year:       treeCoverData,
      years_analyzed:           treeCoverData.length,
      methodology:
        'Tree cover % from MODIS MOD44B VCF (250m). AGB estimated using biome-specific factor ' +
        `(${biomeInfo.factorMgHaPerPct} Mg/ha per 1% tree cover for ${biomeInfo.name}). ` +
        'Carbon = AGB × 0.47. CO2eq = Carbon × 3.67. For reference only — not a formal carbon audit.'
    };

    // Carbon stock is informational — always PASS but with rich details
    // FAIL only if tree cover declined severely (possible deforestation signal)
    if (treeCoverChange <= -20 && treeCoverData.length >= 3) {
      return {
        status: CheckStatus.FAIL,
        severity: Severity.HIGH,
        message:
          `Significant tree cover loss: ${treeCoverChange.toFixed(1)}% decline over analysis period ` +
          `(now: ${treeCoverPct}% → ~${estimatedAGB.toFixed(0)} Mg AGB/ha in ${biomeInfo.name}).`,
        details: {
          ...details,
          recommendation:
            'Severe reduction in tree cover detected. Cross-check with PRODES/DETER deforestation ' +
            'alerts and MapBiomas Land Use Conversion History checker.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    if (treeCoverChange <= -10 && treeCoverData.length >= 3) {
      return {
        status: CheckStatus.WARNING,
        severity: Severity.MEDIUM,
        message:
          `Tree cover declining: ${treeCoverChange.toFixed(1)}% loss over analysis period ` +
          `(now: ${treeCoverPct}%). Estimated AGB: ${estimatedAGB.toFixed(0)} Mg/ha.`,
        details,
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    const trend = treeCoverChange > 5 ? ` (recovering: +${treeCoverChange.toFixed(1)}%)` :
                  treeCoverChange < -3 ? ` (slight decline: ${treeCoverChange.toFixed(1)}%)` : '';

    return {
      status: CheckStatus.PASS,
      message:
        `Carbon stock estimate: ${estimatedAGB.toFixed(0)} Mg AGB/ha, ${co2eqMgHa.toFixed(0)} Mg CO2eq/ha ` +
        `(${treeCoverPct}% tree cover, ${biomeInfo.name})${trend}. ${carbonPotential}.`,
      details,
      evidence,
      executionTimeMs: 0,
      cached: false
    };
  }
}

export default new CarbonStockChecker();
