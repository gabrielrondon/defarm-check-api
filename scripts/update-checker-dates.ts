#!/usr/bin/env tsx

/**
 * Updates last_updated dates for checker sources
 *
 * Usage:
 *   npm run update:checker-dates
 *   npm run update:checker-dates -- --all (updates all sources)
 *   npm run update:checker-dates -- --source "PRODES Deforestation"
 */

import { db } from '../src/db/client.js';
import { checkerSources } from '../src/db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { logger } from '../src/utils/logger.js';

// Sources that should be updated to current date
const SOURCES_TO_UPDATE = [
  'PRODES Deforestation',
  'CAR Registry',
  'Terras Indígenas',
  'Unidades de Conservação',
  'MapBiomas Validated Deforestation',
  'INPE Fire Hotspots',
  'ANA Water Use Permits'
];

async function updateCheckerDates(sourceName?: string, updateAll: boolean = false) {
  try {
    logger.info('Starting checker dates update', { sourceName, updateAll });

    let sourcesToUpdate: string[];

    if (updateAll) {
      // Get all active sources
      const allSources = await db.select().from(checkerSources).where(eq(checkerSources.isActive, true));
      sourcesToUpdate = allSources.map(s => s.name);
      logger.info(`Updating all ${sourcesToUpdate.length} active sources`);
    } else if (sourceName) {
      sourcesToUpdate = [sourceName];
      logger.info(`Updating specific source: ${sourceName}`);
    } else {
      sourcesToUpdate = SOURCES_TO_UPDATE;
      logger.info(`Updating default sources: ${sourcesToUpdate.join(', ')}`);
    }

    const currentDate = new Date();
    let updated = 0;
    let failed = 0;

    for (const name of sourcesToUpdate) {
      try {
        const result = await db
          .update(checkerSources)
          .set({
            lastUpdated: currentDate,
            updatedAt: currentDate
          })
          .where(eq(checkerSources.name, name));

        logger.info(`Updated: ${name}`, { date: currentDate.toISOString() });
        updated++;
      } catch (err) {
        logger.error(`Failed to update: ${name}`, { error: err });
        failed++;
      }
    }

    logger.info('Update completed', {
      total: sourcesToUpdate.length,
      updated,
      failed,
      currentDate: currentDate.toISOString()
    });

    // Verify updates
    logger.info('\nVerifying updates...');
    const verifyResult = await db.execute(sql`
      SELECT name, last_updated,
             ROUND(EXTRACT(EPOCH FROM (NOW() - last_updated)) / 3600) as hours_since_update
      FROM checker_sources
      WHERE is_active = true
      ORDER BY last_updated DESC
    `);

    console.log('\n📊 Current Status:');
    console.log('─────────────────────────────────────────────────────────');
    verifyResult.rows.forEach((row: any) => {
      const hours = row.hours_since_update || 0;
      const status = hours < 48 ? '🟢' : hours < 168 ? '🟡' : '🔴';
      console.log(`${status} ${row.name.padEnd(40)} | ${row.last_updated?.substring(0, 10) || 'never'} (${hours}h ago)`);
    });
    console.log('─────────────────────────────────────────────────────────\n');

    process.exit(0);
  } catch (err) {
    logger.error('Update failed', { error: err });
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const updateAll = args.includes('--all');
const sourceIndex = args.indexOf('--source');
const sourceName = sourceIndex >= 0 ? args[sourceIndex + 1] : undefined;

updateCheckerDates(sourceName, updateAll);
