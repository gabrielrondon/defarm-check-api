#!/usr/bin/env tsx
/**
 * Script para popular TODOS os dados no banco de produção
 *
 * ATENÇÃO: Este script irá TRUNCAR as tabelas existentes e popular novamente!
 *
 * Uso:
 *   DATABASE_URL=<production_url> npm run seed:all-production
 */

// @ts-ignore - execSync é seguro aqui pois executamos apenas comandos internos sem input do usuário
import { execSync } from 'child_process';
import { logger } from '../src/utils/logger.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve));
}

interface SeedStep {
  name: string;
  command: string;
  description: string;
  required: boolean;
}

const SEED_STEPS: SeedStep[] = [
  {
    name: 'Checker Sources',
    command: 'tsx scripts/seed-sources.ts',
    description: 'Popula tabela de fontes de checkers',
    required: true
  },
  {
    name: 'Lista Suja',
    command: 'tsx scripts/seed-lista-suja-simple.ts',
    description: 'Popula Lista Suja do Trabalho Escravo (678 registros)',
    required: true
  },
  {
    name: 'IBAMA Embargoes',
    command: 'tsx scripts/seed-ibama-simple.ts',
    description: 'Popula embargos do IBAMA (65,953 documentos)',
    required: true
  },
  {
    name: 'PRODES Sample',
    command: 'tsx scripts/seed-prodes-sample.ts',
    description: 'Popula amostras do PRODES (5 registros)',
    required: true
  },
  {
    name: 'Terras Indígenas',
    command: 'tsx scripts/seed-terras-indigenas.ts data/terras_indigenas.json',
    description: 'Popula Terras Indígenas da FUNAI',
    required: true
  }
];

async function main() {
  console.log('\n🚨 SEED DE PRODUÇÃO - ATENÇÃO 🚨\n');

  // Verificar DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    logger.error('DATABASE_URL não está definida!');
    process.exit(1);
  }

  // Mostrar info do banco
  const isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
  const dbHost = dbUrl.match(/@([^:/]+)/)?.[1] || 'unknown';

  console.log(`📊 Banco de dados: ${dbHost}`);
  console.log(`🔗 URL: ${dbUrl.replace(/:[^:@]+@/, ':***@')}\n`);

  if (isLocalhost) {
    console.log('⚠️  Você está rodando em LOCALHOST\n');
  } else {
    console.log('🌍 Você está rodando em PRODUÇÃO!\n');
  }

  // Listar o que será feito
  console.log('📋 Seeds que serão executados:\n');
  SEED_STEPS.forEach((step, i) => {
    console.log(`  ${i + 1}. ${step.name}`);
    console.log(`     ${step.description}\n`);
  });

  console.log('⚠️  ATENÇÃO: As tabelas serão TRUNCADAS antes do seed!\n');

  // Pedir confirmação
  const confirm = await question('Deseja continuar? (digite "sim" para confirmar): ');

  if (confirm.toLowerCase() !== 'sim') {
    console.log('\n❌ Operação cancelada pelo usuário.');
    rl.close();
    process.exit(0);
  }

  console.log('\n🚀 Iniciando seed de produção...\n');
  rl.close();

  // Executar cada seed
  const startTime = Date.now();
  let successCount = 0;
  let failedCount = 0;

  for (const [index, step] of SEED_STEPS.entries()) {
    console.log(`\n[${index + 1}/${SEED_STEPS.length}] 🔄 ${step.name}...`);
    console.log(`    Comando: ${step.command}`);

    try {
      const stepStart = Date.now();
      // Comandos internos sem input do usuário - seguro usar execSync
      execSync(step.command, {
        stdio: 'inherit',
        env: { ...process.env }
      });
      const duration = ((Date.now() - stepStart) / 1000).toFixed(2);
      console.log(`    ✅ ${step.name} concluído em ${duration}s`);
      successCount++;
    } catch (error) {
      console.error(`    ❌ ${step.name} falhou!`);
      if (step.required) {
        console.error(`\n❌ Seed falhou na etapa obrigatória: ${step.name}`);
        console.error('Abortando operação...');
        failedCount++;
        process.exit(1);
      }
      failedCount++;
    }
  }

  // Resumo final
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO DO SEED');
  console.log('='.repeat(60));
  console.log(`✅ Sucesso: ${successCount}`);
  console.log(`❌ Falhas: ${failedCount}`);
  console.log(`⏱️  Tempo total: ${totalDuration}s`);
  console.log('='.repeat(60));

  if (failedCount === 0) {
    console.log('\n🎉 Todos os seeds foram executados com sucesso!');
    console.log('\n💡 Próximos passos:');
    console.log('   1. Verificar os dados via API: /sources');
    console.log('   2. Testar um check: POST /check');
    console.log('   3. Verificar logs da aplicação\n');
  } else {
    console.log('\n⚠️  Alguns seeds falharam. Verifique os logs acima.\n');
  }
}

main().catch(err => {
  logger.error({ err }, 'Erro fatal no seed de produção');
  process.exit(1);
});
