#!/usr/bin/env tsx
/**
 * Script para fazer seed de Áreas Protegidas SNAP (Uruguay) no PostgreSQL + PostGIS
 *
 * Uso:
 *   npm run seed:snap-areas -- data/uruguay/snap_areas.json
 *   npm run seed:snap-areas -- data/uruguay/snap_areas.json --clean
 */

import fs from 'fs/promises';
import { db } from '../src/db/client.js';
import { sql } from 'drizzle-orm';
import { createLogger, format, transports } from 'winston';
import path from 'path';

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

interface SNAPArea {
  name: string;
  category?: string;
  areaHa?: number;
  department?: string;
  municipality?: string;
  legalStatus?: string;
  establishedDate?: string;
  geometry: any;  // GeoJSON geometry
}

interface GeoJSONFeature {
  type: string;
  properties: Record<string, any>;
  geometry: any;
}

interface GeoJSONFeatureCollection {
  type: string;
  features: GeoJSONFeature[];
}

async function seedSnapAreas(filepath?: string, clean: boolean = false) {
  // Default file path
  const defaultPath = path.join(process.cwd(), 'data', 'uruguay', 'snap_areas.json');
  const file = filepath || defaultPath;

  logger.info('Seeding SNAP protected areas to database', { filepath: file, clean });

  // Ler arquivo GeoJSON
  const content = await fs.readFile(file, 'utf-8');
  const geojson: GeoJSONFeatureCollection = JSON.parse(content);

  if (!geojson.features || !Array.isArray(geojson.features)) {
    throw new Error('Invalid GeoJSON format: expected FeatureCollection');
  }

  const areas = geojson.features;

  logger.info('SNAP areas loaded from file', { count: areas.length });

  if (areas.length === 0) {
    logger.warn('No SNAP areas to seed');
    return;
  }

  // Limpar tabela se --clean
  if (clean) {
    logger.info('Clearing existing SNAP areas (--clean flag)');
    await db.execute(sql`TRUNCATE TABLE snap_areas_uruguay CASCADE`);
  }

  // Contar registros existentes
  const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM snap_areas_uruguay`);
  const existingCount = parseInt(countResult.rows[0].count);
  logger.info(`Existing SNAP areas in database: ${existingCount}`);

  // Insert all individually (geometries can be large)
  let inserted = 0;
  let failed = 0;
  const total = areas.length;

  logger.info('Inserting SNAP areas individually', { total });

  for (let i = 0; i < total; i++) {
    const feature = areas[i];
    const props = feature.properties;

    try {
      // Normalizar campos (nomes de campos podem variar no shapefile)
      const name = props.name || props.nombre || props.NAME || props.NOMBRE || `Área Protegida ${i + 1}`;
      const category = props.category || props.categoria || props.CATEGORY || props.CATEGORIA || 'Unknown';
      const department = props.department || props.departamento || props.DEPARTMENT || props.DEPARTAMENTO || null;
      const municipality = props.municipality || props.municipio || props.MUNICIPALITY || props.MUNICIPIO || null;
      const legalStatus = props.legal_status || props.estado_legal || props.LEGAL_STATUS || null;
      const establishedDate = props.established_date || props.fecha_creacion || props.ESTABLISHED_DATE || null;

      // Calcular área se não fornecida (em hectares)
      let areaHa = props.area_ha || props.area_hectareas || props.AREA_HA || null;
      if (!areaHa && props.area) {
        // Converter se estiver em outra unidade
        areaHa = Math.round(parseFloat(props.area));
      }

      // Converter geometria GeoJSON para WKT
      const geomJson = JSON.stringify(feature.geometry);

      await db.execute(sql`
        INSERT INTO snap_areas_uruguay (
          name, category, area_ha, department, municipality,
          legal_status, established_date, country, source, geometry
        ) VALUES (
          ${name},
          ${category},
          ${areaHa},
          ${department},
          ${municipality},
          ${legalStatus},
          ${establishedDate},
          'UY',
          'SNAP',
          ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326))
        )
        ON CONFLICT DO NOTHING
      `);
      inserted++;

      // Log progress every 5 records (small dataset)
      if ((i + 1) % 5 === 0 || (i + 1) === total) {
        logger.info('Progress', {
          inserted,
          failed,
          total,
          progress: `${Math.round(((i + 1) / total) * 100)}%`,
          currentArea: name
        });
      }
    } catch (err) {
      failed++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to insert SNAP area', {
        index: i,
        name: props.name || 'Unknown',
        error: errorMsg.split('\n')[0]
      });
    }
  }

  // Contar registros finais
  const finalCountResult = await db.execute(sql`SELECT COUNT(*) as count FROM snap_areas_uruguay`);
  const finalCount = parseInt(finalCountResult.rows[0].count);

  logger.info('Seeding completed', {
    inserted,
    failed,
    total,
    finalCount,
    successRate: `${Math.round((inserted / total) * 100)}%`
  });

  // Verificar spatial index
  logger.info('Verifying spatial index...');
  const indexResult = await db.execute(sql`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'snap_areas_uruguay' AND indexname LIKE '%geom%'
  `);

  if (indexResult.rows.length > 0) {
    logger.info('✓ Spatial index exists:', { indexes: indexResult.rows.map(r => r.indexname) });
  } else {
    logger.warn('⚠ No spatial index found - run migration 0017 to create it');
  }

  logger.info('✓ SNAP areas ready for checks!');
}

// Parse args
const args = process.argv.slice(2);
const clean = args.includes('--clean');
const filepath = args.find(arg => !arg.startsWith('--'));

// Executar
seedSnapAreas(filepath, clean).catch((err) => {
  logger.error('Failed to seed SNAP areas', {
    error: err.message,
    stack: err.stack
  });
  process.exit(1);
});
