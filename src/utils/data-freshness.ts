import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { logger } from './logger.js';

/**
 * Update the lastUpdated timestamp for a data source in checker_sources table
 * Should be called by workers after successfully updating data
 */
export async function updateDataSourceFreshness(
  sourceName: string,
  additionalConfig?: Record<string, any>
): Promise<void> {
  try {
    const updateData: any = {
      last_updated: new Date(),
      updated_at: new Date()
    };

    // If additional config provided, merge it with existing config
    if (additionalConfig) {
      await db.execute(sql`
        UPDATE checker_sources
        SET
          last_updated = ${updateData.last_updated},
          updated_at = ${updateData.updated_at},
          config = config || ${JSON.stringify(additionalConfig)}::jsonb
        WHERE name = ${sourceName}
      `);
    } else {
      await db.execute(sql`
        UPDATE checker_sources
        SET
          last_updated = ${updateData.last_updated},
          updated_at = ${updateData.updated_at}
        WHERE name = ${sourceName}
      `);
    }

    logger.info({ sourceName, additionalConfig }, 'Data source freshness updated');
  } catch (err) {
    logger.error({ err, sourceName }, 'Failed to update data source freshness');
  }
}
