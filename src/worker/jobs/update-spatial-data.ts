/**
 * Job: Atualização de Dados Espaciais (TIs + UCs)
 *
 * Frequência: MENSAL (1º dia, 04:00)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

export async function updateSpatialData(): Promise<void> {
  const results = {
    terrasIndigenas: false,
    unidadesConservacao: false
  };

  // Terras Indígenas
  try {
    logger.info('Updating Terras Indígenas');
    await execAsync('npm run data:funai-terras-indigenas');
    await execAsync('npm run seed:terras-indigenas data/terras_indigenas.json');
    results.terrasIndigenas = true;
    logger.info('Terras Indígenas updated successfully');
  } catch (error) {
    logger.error({ err: error }, 'Terras Indígenas update failed');
  }

  // Unidades de Conservação
  try {
    logger.info('Updating Unidades de Conservação');
    await execAsync('npm run data:icmbio-unidades-conservacao');
    await execAsync('npm run seed:unidades-conservacao data/unidades_conservacao.json');
    results.unidadesConservacao = true;
    logger.info('Unidades de Conservação updated successfully');
  } catch (error) {
    logger.error({ err: error }, 'Unidades de Conservação update failed');
  }

  // Falhar se algum não funcionou
  if (!results.terrasIndigenas || !results.unidadesConservacao) {
    throw new Error(`Spatial data update partially failed: ${JSON.stringify(results)}`);
  }

  logger.info({ results }, 'Spatial data update completed');
}
