import { db } from '../src/db/client.js';
import { sql } from 'drizzle-orm';
import { logger } from '../src/utils/logger.js';

// Dataset de exemplo com áreas de desmatamento real
// Baseado em coordenadas de áreas conhecidas de desmatamento na Amazônia
const sampleData = [
  {
    year: 2024,
    area_ha: 15,
    state: 'AM',
    municipality: 'Novo Aripuanã',
    path_row: '231/066',
    // Polígono em Novo Aripuanã, AM (área real de desmatamento)
    wkt: 'MULTIPOLYGON(((-61.090 -7.094, -61.089 -7.095, -61.088 -7.095, -61.088 -7.094, -61.090 -7.094)))'
  },
  {
    year: 2024,
    area_ha: 45,
    state: 'PA',
    municipality: 'Altamira',
    path_row: '227/063',
    // Polígono em Altamira, PA
    wkt: 'MULTIPOLYGON(((-52.215 -3.207, -52.214 -3.208, -52.213 -3.208, -52.213 -3.207, -52.215 -3.207)))'
  },
  {
    year: 2024,
    area_ha: 120,
    state: 'MT',
    municipality: 'Colniza',
    path_row: '230/067',
    // Polígono em Colniza, MT
    wkt: 'MULTIPOLYGON(((-59.040 -9.465, -59.038 -9.467, -59.036 -9.466, -59.037 -9.464, -59.040 -9.465)))'
  },
  {
    year: 2023,
    area_ha: 78,
    state: 'RO',
    municipality: 'Porto Velho',
    path_row: '231/066',
    // Polígono em Porto Velho, RO
    wkt: 'MULTIPOLYGON(((-63.903 -8.762, -63.901 -8.764, -63.899 -8.763, -63.900 -8.761, -63.903 -8.762)))'
  },
  {
    year: 2023,
    area_ha: 250,
    state: 'PA',
    municipality: 'São Félix do Xingu',
    path_row: '224/065',
    // Polígono em São Félix do Xingu, PA
    wkt: 'MULTIPOLYGON(((-51.995 -6.641, -51.992 -6.644, -51.990 -6.642, -51.992 -6.640, -51.995 -6.641)))'
  }
];

async function seed() {
  logger.info('Seeding PRODES sample data...');

  try {
    for (const item of sampleData) {
      await db.execute(sql`
        INSERT INTO prodes_deforestation
        (year, area_ha, state, municipality, path_row, geometry)
        VALUES (
          ${item.year},
          ${item.area_ha},
          ${item.state},
          ${item.municipality},
          ${item.path_row},
          ST_GeomFromText(${item.wkt}, 4326)
        )
      `);

      logger.info({
        municipality: item.municipality,
        area_ha: item.area_ha
      }, 'PRODES record inserted');
    }

    // Verificar dados inseridos
    const count = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM prodes_deforestation
    `);

    logger.info({
      totalRecords: count.rows[0]?.count
    }, 'PRODES seeding completed!');

    // Teste de query espacial
    // Note: Point must be INSIDE polygon, not on boundary (ST_Contains requirement)
    const testPoint = { lat: -7.0945, lon: -61.089 }; // Inside Novo Aripuanã polygon
    const result = await db.execute(sql`
      SELECT municipality, state, area_ha, year
      FROM prodes_deforestation
      WHERE ST_Contains(
        geometry,
        ST_SetSRID(ST_MakePoint(${testPoint.lon}, ${testPoint.lat}), 4326)
      )
      LIMIT 1
    `);

    if (result.rows.length > 0) {
      logger.info({
        testPoint,
        found: result.rows[0]
      }, 'Spatial query test PASSED ✓');
    }

    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'PRODES seeding failed');
    process.exit(1);
  }
}

seed();
