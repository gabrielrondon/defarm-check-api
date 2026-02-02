#!/usr/bin/env tsx
/**
 * Test CAR x PRODES intersection query performance
 */

import { db } from '../src/db/client.js';
import { sql } from 'drizzle-orm';
import 'dotenv/config';

async function testCarProdesQuery() {
  console.log('Testing CAR x PRODES intersection query...\n');

  try {
    // Step 1: Find a CAR property to test with
    console.log('1. Finding sample CAR properties...');
    const carSample = await db.execute(sql`
      SELECT car_number, state, municipality, area_ha
      FROM car_registrations
      LIMIT 5
    `);

    if (carSample.rows.length === 0) {
      console.log('❌ No CAR data found in database');
      process.exit(1);
    }

    console.log(`✅ Found ${carSample.rows.length} CAR properties`);
    carSample.rows.forEach((row: any) => {
      console.log(`   - ${row.car_number} (${row.state}/${row.municipality}, ${row.area_ha}ha)`);
    });

    // Use first CAR for testing
    const testCar = carSample.rows[0] as any;
    const carNumber = testCar.car_number;

    console.log(`\n2. Testing intersection query with: ${carNumber}`);
    console.log('   Running EXPLAIN ANALYZE...\n');

    // Test query with EXPLAIN ANALYZE
    const explainResult = await db.execute(sql`
      EXPLAIN ANALYZE
      SELECT
        p.year,
        p.area_ha,
        ROUND(ST_Area(ST_Intersection(c.geometry, p.geometry)::geography) / 10000) AS intersection_ha,
        p.state,
        p.municipality,
        p.path_row
      FROM car_registrations c
      CROSS JOIN prodes_deforestation p
      WHERE c.car_number = ${carNumber}
        AND p.year >= 2015
        AND ST_Intersects(c.geometry, p.geometry)
      ORDER BY p.year DESC, intersection_ha DESC
      LIMIT 50
    `);

    console.log('Query Plan:');
    explainResult.rows.forEach((row: any) => {
      console.log(`   ${row['QUERY PLAN']}`);
    });

    // Run actual query
    console.log('\n3. Running actual query...');
    const startTime = Date.now();
    const result = await db.execute(sql`
      SELECT
        p.year,
        p.area_ha,
        ROUND(ST_Area(ST_Intersection(c.geometry, p.geometry)::geography) / 10000) AS intersection_ha,
        p.state,
        p.municipality,
        p.path_row
      FROM car_registrations c
      CROSS JOIN prodes_deforestation p
      WHERE c.car_number = ${carNumber}
        AND p.year >= 2015
        AND ST_Intersects(c.geometry, p.geometry)
      ORDER BY p.year DESC, intersection_ha DESC
      LIMIT 50
    `);
    const executionTime = Date.now() - startTime;

    console.log(`✅ Query completed in ${executionTime}ms`);
    console.log(`   Found ${result.rows.length} intersections`);

    if (result.rows.length > 0) {
      console.log('\n   Sample intersections:');
      result.rows.slice(0, 5).forEach((row: any) => {
        console.log(`   - ${row.year}: ${row.intersection_ha}ha (${row.municipality}/${row.state})`);
      });
    } else {
      console.log('   ℹ️  No deforestation found in this property (PASS)');
    }

    // Performance check
    if (executionTime < 2000) {
      console.log('\n✅ Performance: Excellent (<2s)');
    } else if (executionTime < 10000) {
      console.log('\n✅ Performance: Good (<10s)');
    } else {
      console.log('\n⚠️  Performance: Slow (>10s) - consider optimization');
    }

  } catch (err) {
    console.error('❌ Error:', (err as Error).message);
    process.exit(1);
  }

  process.exit(0);
}

testCarProdesQuery();
