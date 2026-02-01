#!/usr/bin/env tsx
/**
 * Backup automático do PostgreSQL
 *
 * Estratégia:
 * 1. pg_dump do banco completo (schema + data)
 * 2. Compactar com gzip
 * 3. Upload para GitHub (branch backups)
 * 4. Manter apenas últimos 7 backups (rotação)
 * 5. Notificação Telegram (sucesso/falha)
 *
 * Requisitos:
 * - pg_dump instalado (PostgreSQL client)
 * - Git configurado com credenciais
 * - GITHUB_TOKEN com permissão de push
 *
 * Uso:
 *   npm run backup:database
 *
 * Cron (semanal, domingos 01:00 UTC):
 *   0 1 * * 0 npm run backup:database
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createLogger, format, transports } from 'winston';
import { telegram } from '../src/services/telegram.js';

const execAsync = promisify(exec);

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

const DATABASE_URL = process.env.DATABASE_URL;
const BACKUP_DIR = path.join(process.cwd(), 'backups');
const MAX_BACKUPS = 7; // Manter últimos 7 backups

async function createBackup(): Promise<string> {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL not set');
  }

  logger.info('🗄️  Starting database backup');

  // Criar diretório de backups
  await fs.mkdir(BACKUP_DIR, { recursive: true });

  // Nome do arquivo com timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const filename = `defarm-check-backup-${timestamp}.sql`;
  const filepath = path.join(BACKUP_DIR, filename);
  const gzipPath = `${filepath}.gz`;

  try {
    // 1. pg_dump
    logger.info('Running pg_dump', { filepath });

    // Extrair componentes da DATABASE_URL
    const dbUrl = new URL(DATABASE_URL);
    const pgDumpCmd = `PGPASSWORD="${dbUrl.password}" pg_dump \
      -h ${dbUrl.hostname} \
      -p ${dbUrl.port || 5432} \
      -U ${dbUrl.username} \
      -d ${dbUrl.pathname.slice(1)} \
      -F p \
      --clean \
      --if-exists \
      --no-owner \
      --no-privileges \
      -f ${filepath}`;

    await execAsync(pgDumpCmd);

    const stats = await fs.stat(filepath);
    logger.info('Backup created', {
      size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
      filepath
    });

    // 2. Compactar com gzip
    logger.info('Compressing backup');
    await execAsync(`gzip -f ${filepath}`);

    const gzipStats = await fs.stat(gzipPath);
    const compressionRatio = ((1 - gzipStats.size / stats.size) * 100).toFixed(1);

    logger.info('Backup compressed', {
      originalSize: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
      compressedSize: `${(gzipStats.size / 1024 / 1024).toFixed(2)} MB`,
      compressionRatio: `${compressionRatio}%`,
      filepath: gzipPath
    });

    return gzipPath;

  } catch (err) {
    logger.error('Backup failed', { error: err });
    throw err;
  }
}

async function uploadToGitHub(backupPath: string): Promise<void> {
  const backupBranch = 'backups';
  const filename = path.basename(backupPath);

  logger.info('📤 Uploading backup to GitHub', { branch: backupBranch });

  try {
    // Verificar se branch existe, se não, criar
    try {
      await execAsync(`git rev-parse --verify ${backupBranch}`);
      logger.info('Backup branch exists, switching to it');
      await execAsync(`git checkout ${backupBranch}`);
    } catch {
      logger.info('Creating backup branch');
      await execAsync(`git checkout --orphan ${backupBranch}`);
      await execAsync('git rm -rf .');

      // Criar README
      const readme = `# Database Backups

Automated PostgreSQL backups for DeFarm Check API.

- **Frequency**: Weekly (Sundays 01:00 UTC)
- **Retention**: Last 7 backups
- **Format**: pg_dump SQL + gzip

## Restore

\`\`\`bash
# Download backup
wget https://github.com/gabrielrondon/defarm-check-api/raw/backups/backup-YYYY-MM-DD.sql.gz

# Decompress
gunzip backup-YYYY-MM-DD.sql.gz

# Restore
psql $DATABASE_URL < backup-YYYY-MM-DD.sql
\`\`\`
`;
      await fs.writeFile(path.join(BACKUP_DIR, 'README.md'), readme);
    }

    // Copiar backup para diretório raiz (para commit)
    const destPath = path.join(process.cwd(), filename);
    await execAsync(`cp ${backupPath} ${destPath}`);

    // Adicionar e commitar
    await execAsync(`git add ${filename}`);
    const commitMsg = `chore: automated database backup ${new Date().toISOString().split('T')[0]}`;
    await execAsync(`git commit -m "${commitMsg}"`);

    // Push
    await execAsync(`git push origin ${backupBranch}`);

    logger.info('✅ Backup uploaded to GitHub', {
      branch: backupBranch,
      file: filename
    });

    // Voltar para branch main
    await execAsync('git checkout main');

    // Limpar arquivo temporário
    await fs.unlink(destPath);

  } catch (err) {
    logger.error('GitHub upload failed', { error: err });
    // Voltar para main mesmo se falhar
    try {
      await execAsync('git checkout main');
    } catch {}
    throw err;
  }
}

async function rotateBackups(): Promise<void> {
  logger.info('🔄 Rotating old backups');

  try {
    // Listar backups
    const files = await fs.readdir(BACKUP_DIR);
    const backups = files
      .filter(f => f.startsWith('defarm-check-backup-') && f.endsWith('.sql.gz'))
      .sort()
      .reverse(); // Mais recentes primeiro

    logger.info('Found backups', { count: backups.length });

    // Manter apenas MAX_BACKUPS
    if (backups.length > MAX_BACKUPS) {
      const toDelete = backups.slice(MAX_BACKUPS);

      for (const file of toDelete) {
        const filepath = path.join(BACKUP_DIR, file);
        await fs.unlink(filepath);
        logger.info('Deleted old backup', { file });
      }

      logger.info('Rotation complete', {
        deleted: toDelete.length,
        remaining: MAX_BACKUPS
      });
    }

  } catch (err) {
    logger.error('Rotation failed', { error: err });
    // Não falhar se rotação der erro
  }
}

async function main() {
  const startTime = Date.now();

  try {
    // 1. Criar backup
    const backupPath = await createBackup();

    // 2. Upload para GitHub
    await uploadToGitHub(backupPath);

    // 3. Rotacionar backups antigos
    await rotateBackups();

    const elapsedMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    logger.info('✅ Backup completed successfully!', {
      elapsedMinutes: elapsedMin
    });

    // Notificação Telegram (sucesso)
    await telegram.sendMessage({
      text: '✅ <b>Database Backup Successful</b>\n\n' +
        `📅 Date: ${new Date().toISOString().split('T')[0]}\n` +
        `⏱️ Duration: ${elapsedMin} min\n` +
        `📦 Location: GitHub branch <code>backups</code>\n\n` +
        'Backup uploaded and old backups rotated.',
      parse_mode: 'HTML'
    });

    process.exit(0);

  } catch (error) {
    const elapsedMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    logger.error('❌ Backup failed', {
      error,
      elapsedMinutes: elapsedMin
    });

    // Notificação Telegram (falha)
    await telegram.sendMessage({
      text: '❌ <b>Database Backup FAILED</b>\n\n' +
        `📅 Date: ${new Date().toISOString().split('T')[0]}\n` +
        `⏱️ Duration: ${elapsedMin} min\n` +
        `❌ Error: ${error instanceof Error ? error.message : String(error)}\n\n` +
        'Please check logs and fix the issue.',
      parse_mode: 'HTML'
    });

    process.exit(1);
  }
}

main();
