/**
 * Telegram Bot Service - Notificações e Alertas
 *
 * Envia notificações de:
 * - Início/fim de cada cron job
 * - Novidades detectadas (novos na Lista Suja, alertas DETER, etc.)
 * - Falhas e erros
 * - Health checks e métricas
 * - Resumos diários/semanais
 */

import axios from 'axios';
import { logger } from '../utils/logger.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

interface TelegramMessage {
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_notification?: boolean;
}

class TelegramService {
  private botToken: string;
  private chatId: string;
  private baseUrl: string;

  constructor() {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      logger.warn('Telegram credentials not configured. Notifications will be skipped.');
      this.botToken = '';
      this.chatId = '';
      this.baseUrl = '';
      return;
    }

    this.botToken = TELEGRAM_BOT_TOKEN;
    this.chatId = TELEGRAM_CHAT_ID;
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  /**
   * Verifica se Telegram está configurado
   */
  isConfigured(): boolean {
    return !!this.botToken && !!this.chatId;
  }

  /**
   * Envia mensagem para o Telegram
   */
  async sendMessage(message: TelegramMessage): Promise<boolean> {
    if (!this.isConfigured()) {
      logger.debug('Telegram not configured, skipping notification');
      return false;
    }

    try {
      await axios.post(`${this.baseUrl}/sendMessage`, {
        chat_id: this.chatId,
        text: message.text,
        parse_mode: message.parse_mode || 'HTML',
        disable_notification: message.disable_notification || false
      });

      logger.debug('Telegram message sent successfully');
      return true;
    } catch (error) {
      logger.error({
        err: error,
        msg: 'Failed to send Telegram message'
      });
      return false;
    }
  }

  /**
   * Notifica INÍCIO de cron job
   */
  async notifyJobStart(jobName: string): Promise<void> {
    await this.sendMessage({
      text: `🤖 <b>${jobName}</b> iniciado\n⏰ ${new Date().toLocaleString('pt-BR')}`,
      disable_notification: true // Não faz barulho
    });
  }

  /**
   * Notifica SUCESSO de cron job
   */
  async notifyJobSuccess(jobName: string, duration: number, stats?: any): Promise<void> {
    let text = `✅ <b>${jobName}</b> completado com sucesso\n`;
    text += `⏱️ Duração: ${duration}s\n`;

    if (stats) {
      text += `\n📊 <b>Estatísticas:</b>\n`;
      Object.entries(stats).forEach(([key, value]) => {
        text += `  • ${key}: ${value}\n`;
      });
    }

    await this.sendMessage({ text });
  }

  /**
   * Notifica FALHA de cron job
   */
  async notifyJobFailure(jobName: string, error: string): Promise<void> {
    const text = `❌ <b>${jobName}</b> FALHOU\n\n` +
      `🔴 Erro: ${error}\n` +
      `⏰ ${new Date().toLocaleString('pt-BR')}\n\n` +
      `⚠️ <b>Ação necessária: verificar logs</b>`;

    await this.sendMessage({ text });
  }

  /**
   * Notifica NOVIDADES na Lista Suja
   */
  async notifyListaSujaChanges(added: number, removed: number, examples?: string[]): Promise<void> {
    if (added === 0 && removed === 0) {
      return; // Sem mudanças
    }

    let text = `📋 <b>Lista Suja - Atualização</b>\n\n`;

    if (added > 0) {
      text += `🔴 <b>${added} novos</b> empregadores adicionados\n`;

      if (examples && examples.length > 0) {
        text += `\nExemplos:\n`;
        examples.slice(0, 3).forEach(name => {
          text += `  • ${name}\n`;
        });
        if (examples.length > 3) {
          text += `  • ... e mais ${examples.length - 3}\n`;
        }
      }
    }

    if (removed > 0) {
      text += `\n✅ <b>${removed} removidos</b> da lista\n`;
    }

    await this.sendMessage({ text });
  }

  /**
   * Notifica alertas DETER CRÍTICOS
   */
  async notifyDeterCriticalAlerts(state: string, count: number, areaHa: number): Promise<void> {
    const text = `🚨 <b>DETER - Alertas CRÍTICOS</b>\n\n` +
      `📍 Estado: ${state}\n` +
      `🔥 Novos alertas: ${count}\n` +
      `📐 Área desmatada: ${areaHa.toLocaleString('pt-BR')} ha\n` +
      `⏰ Últimas 24h\n\n` +
      `⚠️ <b>Desmatamento ativo detectado!</b>`;

    await this.sendMessage({ text });
  }

  /**
   * Notifica mudanças CRÍTICAS no CAR
   */
  async notifyCARCriticalChanges(state: string, cancelados: number, suspensos: number, total: number): Promise<void> {
    const irregulares = cancelados + suspensos;
    const percentIrregular = ((irregulares / total) * 100).toFixed(1);

    const text = `⚠️ <b>CAR - Mudanças Críticas</b>\n\n` +
      `📍 Estado: ${state}\n` +
      `❌ Cancelados: ${cancelados}\n` +
      `⏸️ Suspensos: ${suspensos}\n` +
      `📊 Total irregular: ${irregulares} (${percentIrregular}%)\n\n` +
      `⚠️ <b>Mais de 5% de CAR irregulares!</b>`;

    await this.sendMessage({ text });
  }

  /**
   * Notifica dados OBSOLETOS (health check)
   */
  async notifyStaleData(source: string, ageInDays: number, slaMaxDays: number): Promise<void> {
    const emoji = ageInDays > slaMaxDays * 1.5 ? '🔴' : '⚠️';

    const text = `${emoji} <b>Dados Obsoletos Detectados</b>\n\n` +
      `📦 Fonte: ${source}\n` +
      `📅 Idade: ${ageInDays} dias\n` +
      `⏰ SLA máximo: ${slaMaxDays} dias\n\n` +
      `⚠️ <b>Atualização necessária!</b>`;

    await this.sendMessage({ text });
  }

  /**
   * Envia resumo DIÁRIO
   */
  async sendDailySummary(summary: {
    jobsExecuted: number;
    jobsSucceeded: number;
    jobsFailed: number;
    dataFreshness: string;
    newAlerts: number;
  }): Promise<void> {
    const text = `📊 <b>Resumo Diário</b>\n` +
      `🗓️ ${new Date().toLocaleDateString('pt-BR')}\n\n` +
      `🤖 Jobs executados: ${summary.jobsExecuted}\n` +
      `✅ Sucessos: ${summary.jobsSucceeded}\n` +
      `❌ Falhas: ${summary.jobsFailed}\n\n` +
      `📈 Freshness: ${summary.dataFreshness}\n` +
      `🔔 Novos alertas DETER: ${summary.newAlerts}\n`;

    await this.sendMessage({ text });
  }

  /**
   * Envia resumo SEMANAL
   */
  async sendWeeklySummary(summary: {
    totalJobs: number;
    successRate: number;
    topAlerts: Array<{ state: string; count: number }>;
    listaSujaChanges: { added: number; removed: number };
  }): Promise<void> {
    let text = `📊 <b>Resumo Semanal</b>\n`;
    text += `📅 ${new Date().toLocaleDateString('pt-BR')}\n\n`;
    text += `🤖 Total de jobs: ${summary.totalJobs}\n`;
    text += `✅ Taxa de sucesso: ${summary.successRate.toFixed(1)}%\n\n`;

    if (summary.topAlerts.length > 0) {
      text += `🔥 <b>Top Alertas DETER:</b>\n`;
      summary.topAlerts.forEach(({ state, count }) => {
        text += `  • ${state}: ${count} alertas\n`;
      });
      text += '\n';
    }

    if (summary.listaSujaChanges.added > 0 || summary.listaSujaChanges.removed > 0) {
      text += `📋 <b>Lista Suja:</b>\n`;
      text += `  • Novos: ${summary.listaSujaChanges.added}\n`;
      text += `  • Removidos: ${summary.listaSujaChanges.removed}\n`;
    }

    await this.sendMessage({ text });
  }

  /**
   * Teste de conectividade
   */
  async testConnection(): Promise<boolean> {
    if (!this.isConfigured()) {
      logger.warn('Telegram not configured');
      return false;
    }

    try {
      const response = await axios.get(`${this.baseUrl}/getMe`);
      logger.info({
        bot: response.data.result.username
      }, 'Telegram connection test successful');

      await this.sendMessage({
        text: '✅ <b>Telegram Bot Conectado!</b>\n\n' +
          'Bot de notificações da Check API está ativo.\n' +
          'Você receberá alertas sobre:\n' +
          '  • Execução de jobs\n' +
          '  • Novidades detectadas\n' +
          '  • Falhas e erros\n' +
          '  • Health checks\n' +
          '  • Resumos diários/semanais'
      });

      return true;
    } catch (error) {
      logger.error({
        err: error
      }, 'Telegram connection test failed');
      return false;
    }
  }
}

// Singleton
export const telegram = new TelegramService();
