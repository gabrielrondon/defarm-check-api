#!/usr/bin/env tsx
/**
 * Script de teste: Telegram Bot
 *
 * Testa conectividade e envia mensagens de exemplo
 *
 * Uso:
 *   export TELEGRAM_BOT_TOKEN="seu_token"
 *   export TELEGRAM_CHAT_ID="seu_chat_id"
 *   npm run test:telegram
 */

import dotenv from 'dotenv';
import { telegram } from '../src/services/telegram.js';

dotenv.config();

async function main() {
  console.log('='.repeat(60));
  console.log('Telegram Bot - Test');
  console.log('='.repeat(60));
  console.log('');

  // Verificar configuração
  if (!telegram.isConfigured()) {
    console.error('❌ Telegram not configured!');
    console.error('');
    console.error('Please set environment variables:');
    console.error('  TELEGRAM_BOT_TOKEN=your_token');
    console.error('  TELEGRAM_CHAT_ID=your_chat_id');
    process.exit(1);
  }

  console.log('✅ Telegram configured');
  console.log('');

  // Teste de conectividade
  console.log('[1/6] Testing connection...');
  const connected = await telegram.testConnection();

  if (!connected) {
    console.error('❌ Connection test failed');
    process.exit(1);
  }

  console.log('✅ Connection successful');
  console.log('');

  // Aguardar 2s entre mensagens
  await sleep(2000);

  // Teste: Job Start
  console.log('[2/6] Testing job start notification...');
  await telegram.notifyJobStart('Test Job');
  console.log('✅ Job start sent');
  await sleep(2000);

  // Teste: Job Success
  console.log('[3/6] Testing job success notification...');
  await telegram.notifyJobSuccess('Test Job', 125, {
    recordsProcessed: 1000,
    recordsAdded: 50,
    recordsUpdated: 10
  });
  console.log('✅ Job success sent');
  await sleep(2000);

  // Teste: Lista Suja Changes
  console.log('[4/6] Testing Lista Suja changes notification...');
  await telegram.notifyListaSujaChanges(3, 1, [
    'Fazenda ABC Ltda',
    'Empresa XYZ SA',
    'João da Silva'
  ]);
  console.log('✅ Lista Suja changes sent');
  await sleep(2000);

  // Teste: DETER Critical
  console.log('[5/6] Testing DETER critical alert...');
  await telegram.notifyDeterCriticalAlerts('PA', 12, 1234);
  console.log('✅ DETER critical sent');
  await sleep(2000);

  // Teste: Stale Data
  console.log('[6/6] Testing stale data notification...');
  await telegram.notifyStaleData('IBAMA Embargoes', 15, 10);
  console.log('✅ Stale data sent');

  console.log('');
  console.log('='.repeat(60));
  console.log('✅ All tests passed!');
  console.log('='.repeat(60));
  console.log('');
  console.log('Check your Telegram to see all messages.');
  console.log('');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
