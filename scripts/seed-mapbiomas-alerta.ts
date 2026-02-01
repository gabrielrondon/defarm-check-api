#!/usr/bin/env tsx
/**
 * Script para processar e inserir alertas MapBiomas no banco
 *
 * Processa: data/mapbiomas_alerta.json
 *
 * Uso:
 *   npm run seed:mapbiomas-alerta
 */

import fs from 'fs/promises';
import path from 'path';
import { db } from '../src/db/client.js';
import { mapbiomasAlerta } from '../src/db/schema.js';
import { sql } from 'drizzle-orm';
import { createLogger, format, transports } from 'winston';

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.colorize(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const ts = new Date(timestamp).toISOString().replace('T', ' ').slice(0, -5);
      const metaStr = Object.keys(meta).length ? '\n    ' + JSON.stringify(meta, null, 2) : '';
      return `[${ts}] ${level}: ${message}${metaStr}`;
    })
  ),
  transports: [new transports.Console()]
});

const DATA_DIR = path.join(process.cwd(), 'data');

// Map state names to UF codes
const STATE_TO_UF: Record<string, string> = {
  'ACRE': 'AC',
  'ALAGOAS': 'AL',
  'AMAPÁ': 'AP',
  'AMAZONAS': 'AM',
  'BAHIA': 'BA',
  'CEARÁ': 'CE',
  'DISTRITO FEDERAL': 'DF',
  'ESPÍRITO SANTO': 'ES',
  'GOIÁS': 'GO',
  'MARANHÃO': 'MA',
  'MATO GROSSO': 'MT',
  'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG',
  'PARÁ': 'PA',
  'PARAÍBA': 'PB',
  'PARANÁ': 'PR',
  'PERNAMBUCO': 'PE',
  'PIAUÍ': 'PI',
  'RIO DE JANEIRO': 'RJ',
  'RIO GRANDE DO NORTE': 'RN',
  'RIO GRANDE DO SUL': 'RS',
  'RONDÔNIA': 'RO',
  'RORAIMA': 'RR',
  'SANTA CATARINA': 'SC',
  'SÃO PAULO': 'SP',
  'SERGIPE': 'SE',
  'TOCANTINS': 'TO'
};

/**
 * Mapeia alert do MapBiomas para schema do banco
 */
function mapAlert(alert: any): any {
  if (!alert.alertCode || !alert.areaHa) {
    return null;
  }

  // Parse deforestation classes (can be array)
  let deforestationClass = '';
  if (Array.isArray(alert.deforestationClasses)) {
    deforestationClass = alert.deforestationClasses[0] || '';
  } else if (typeof alert.deforestationClasses === 'string') {
    deforestationClass = alert.deforestationClasses;
  }

  // Parse sources
  let source = 'MapBiomas Alerta';
  if (Array.isArray(alert.sources) && alert.sources.length > 0) {
    source = alert.sources[0];
  } else if (typeof alert.sources === 'string') {
    source = alert.sources;
  }

  // Parse CAR codes
  let carCodes: string[] = [];
  if (alert.ruralPropertiesCodes) {
    if (Array.isArray(alert.ruralPropertiesCodes)) {
      carCodes = alert.ruralPropertiesCodes;
    } else if (typeof alert.ruralPropertiesCodes === 'string') {
      carCodes = [alert.ruralPropertiesCodes];
    }
  }

  // Handle crossed fields (can be arrays or null)
  const state = Array.isArray(alert.crossedStates) && alert.crossedStates.length > 0
    ? alert.crossedStates[0] : null;
  const municipality = Array.isArray(alert.crossedCities) && alert.crossedCities.length > 0
    ? alert.crossedCities[0] : null;
  const biome = Array.isArray(alert.crossedBiomes) && alert.crossedBiomes.length > 0
    ? alert.crossedBiomes[0] : null;

  const hasIndigenousLand = Array.isArray(alert.crossedIndigenousLands) && alert.crossedIndigenousLands.length > 0;
  const hasConservationUnit = Array.isArray(alert.crossedConservationUnits) && alert.crossedConservationUnits.length > 0;

  // Map state name to UF code
  const stateUF = state ? STATE_TO_UF[state.toUpperCase()] || state.substring(0, 2) : null;

  return {
    alertCode: String(alert.alertCode).trim(),
    areaHa: Math.round(Number(alert.areaHa) || 0),
    detectedAt: alert.detectedAt,
    publishedAt: alert.publishedAt,
    state: stateUF,
    municipality: municipality ? municipality.substring(0, 255) : null,
    biome: biome ? biome.substring(0, 50) : null,
    deforestationClass: deforestationClass.substring(0, 100) || null,
    deforestationSpeed: alert.deforestationSpeed || null,
    source: source.substring(0, 50),
    statusName: alert.statusName || 'published',
    indigenousLand: hasIndigenousLand,
    conservationUnit: hasConservationUnit,
    embargoedArea: false, // Will need to check CAR intersection manually
    authorizedArea: false, // Will need to check CAR intersection manually
    carCodes: carCodes.length > 0 ? carCodes : null,
    carIntersectionCount: carCodes.length,
    sourceData: 'MapBiomas Alerta',
    geometryWkt: alert.geometryWkt || null
  };
}

async function main() {
  logger.info('='.repeat(60));
  logger.info('MapBiomas Alerta - Seed Database');
  logger.info('='.repeat(60));

  const filePath = path.join(DATA_DIR, 'mapbiomas_alerta.json');

  try {
    // Read JSON file
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const alerts = JSON.parse(fileContent);

    logger.info(`Parsed ${alerts.length} MapBiomas alerts`);

    // Map and filter records
    const mapped = alerts.map(mapAlert).filter(Boolean);
    logger.info(`Mapped ${mapped.length} valid alerts`);

    // Deduplicate by alert_code (keep first occurrence)
    const seen = new Set<string>();
    const deduplicated = mapped.filter(alert => {
      if (seen.has(alert.alertCode)) {
        return false;
      }
      seen.add(alert.alertCode);
      return true;
    });

    const duplicatesRemoved = mapped.length - deduplicated.length;
    if (duplicatesRemoved > 0) {
      logger.info(`Removed ${duplicatesRemoved} duplicate alert codes`);
    }
    logger.info(`Final count: ${deduplicated.length} unique alerts`);

    if (deduplicated.length === 0) {
      logger.warn('No valid records to insert');
      return;
    }

    // Clear old data first
    await db.execute(sql`TRUNCATE TABLE mapbiomas_alerta`);
    logger.info('✅ Cleared old MapBiomas alert data');

    // Insert in batches of 500
    const batchSize = 500;
    let inserted = 0;
    let geometriesUpdated = 0;

    for (let i = 0; i < deduplicated.length; i += batchSize) {
      const batch = deduplicated.slice(i, i + batchSize);

      // Separate geometry from other fields
      const recordsWithoutGeom = batch.map(({ geometryWkt, ...rest }) => rest);

      // Insert records without geometry first
      const insertedRecords = await db.insert(mapbiomasAlerta)
        .values(recordsWithoutGeom)
        .returning({ id: mapbiomasAlerta.id, alertCode: mapbiomasAlerta.alertCode });

      inserted += insertedRecords.length;

      // Update geometries separately (PostGIS conversion)
      for (let j = 0; j < batch.length; j++) {
        const record = batch[j];
        const insertedRecord = insertedRecords[j];

        if (record.geometryWkt && insertedRecord) {
          try {
            await db.execute(sql`
              UPDATE mapbiomas_alerta
              SET geom = ST_GeomFromText(${record.geometryWkt}, 4326)
              WHERE id = ${insertedRecord.id}
            `);
            geometriesUpdated++;
          } catch (err: any) {
            logger.warn(`Failed to update geometry for alert ${record.alertCode}: ${err.message}`);
          }
        }
      }

      logger.info(`Inserted ${inserted}/${deduplicated.length} alerts (${geometriesUpdated} geometries)`);
    }

    // Get statistics
    const stats = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT state) as states,
        COUNT(DISTINCT biome) as biomes,
        SUM(area_ha) as total_area_ha,
        COUNT(CASE WHEN embargoed_area = true THEN 1 END) as embargoed_count,
        COUNT(CASE WHEN indigenous_land = true THEN 1 END) as indigenous_land_count,
        COUNT(CASE WHEN conservation_unit = true THEN 1 END) as conservation_unit_count,
        AVG(area_ha) as avg_area_ha,
        MAX(area_ha) as max_area_ha
      FROM mapbiomas_alerta
    `);

    const row: any = stats.rows[0];

    logger.info('='.repeat(60));
    logger.info('Seed Summary:');
    logger.info(`  Total alerts: ${row.total}`);
    logger.info(`  Total area: ${Number(row.total_area_ha).toLocaleString()} ha`);
    logger.info(`  Average area: ${Math.round(Number(row.avg_area_ha))} ha`);
    logger.info(`  Max area: ${Number(row.max_area_ha).toLocaleString()} ha`);
    logger.info(`  States: ${row.states}`);
    logger.info(`  Biomes: ${row.biomes}`);
    logger.info(`  In embargoed areas: ${row.embargoed_count}`);
    logger.info(`  In indigenous lands: ${row.indigenous_land_count}`);
    logger.info(`  In conservation units: ${row.conservation_unit_count}`);
    logger.info(`  Geometries updated: ${geometriesUpdated}`);
    logger.info('='.repeat(60));
    logger.info('✅ Seed completed successfully');

  } catch (error: any) {
    if (error.code === 'ENOENT') {
      logger.error('File not found: mapbiomas_alerta.json');
      logger.error('Please run: npm run data:mapbiomas-alerta');
      process.exit(1);
    }
    throw error;
  }
}

main()
  .catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$client.end();
  });
