import { AlertLogItem } from '../types';
import { BotStore } from './store';

export interface Alert {
  channel: 'rsi' | 'bank';
  symbol: string;
  kind: string;
  title: string;
  lines: string[];
}

export interface NotifierConfig {
  notifier: 'console' | 'telegram' | 'slack';
  telegramToken?: string;
  rsiChatId?: string;
  bankChatId?: string;
  slackRsiWebhook?: string;
  slackBankWebhook?: string;
  dryRun?: boolean;
}

export class NotifierService {
  private cfg: NotifierConfig;
  private store: BotStore;

  constructor(cfg: NotifierConfig, store: BotStore) {
    this.cfg = cfg;
    this.store = store;
  }

  public updateConfig(newCfg: Partial<NotifierConfig>): void {
    this.cfg = { ...this.cfg, ...newCfg };
  }

  public async dispatchAlerts(alerts: Alert[]): Promise<AlertLogItem[]> {
    const loggedAlerts: AlertLogItem[] = [];

    // Group by channel ('rsi' & 'bank')
    for (const channel of ['rsi', 'bank'] as const) {
      const group = alerts.filter((a) => a.channel === channel);
      if (group.length === 0) continue;

      // Always log to in-memory store for dashboard visibility
      for (const a of group) {
        const item = this.store.logAlert(a.channel, a.symbol, a.kind, a.title, a.lines);
        loggedAlerts.push(item);
      }

      // If dry-run is on, we skip external webhook dispatch unless it's test mode
      if (this.cfg.dryRun) {
        console.log(`[DRY_RUN] Skipped sending ${group.length} alerts to ${this.cfg.notifier}`);
        continue;
      }

      // External notification dispatch
      if (this.cfg.notifier === 'slack') {
        await this.sendSlackBatch(channel, group);
      } else if (this.cfg.notifier === 'telegram') {
        await this.sendTelegramBatch(channel, group);
      } else {
        // Console mode
        console.log(`\n============================================================`);
        console.log(`[${channel.toUpperCase()}] ${group.length} tín hiệu cảnh báo`);
        console.log(`============================================================`);
        for (const a of group) {
          console.log(`${a.symbol} — ${a.title}`);
          for (const line of a.lines) {
            console.log(`   ${line}`);
          }
        }
      }
    }

    return loggedAlerts;
  }

  public async sendSlackBatch(channel: 'rsi' | 'bank', alerts: Alert[]): Promise<{ success: boolean; error?: string }> {
    const webhookUrl = channel === 'rsi' ? this.cfg.slackRsiWebhook : this.cfg.slackBankWebhook;
    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      const warnMsg = `[Slack] Chưa cấu hình URL Webhook hợp lệ cho kênh ${channel.toUpperCase()} (SLACK_${channel.toUpperCase()}_WEBHOOK)`;
      console.warn(warnMsg);
      return { success: false, error: warnMsg };
    }

    const header =
      channel === 'rsi'
        ? '🚨 Cảnh báo RSI — VN100'
        : '🏦 Cảnh báo kỹ thuật — Ngân hàng VN100';

    const maxBlocks = 45;
    for (let i = 0; i < alerts.length; i += maxBlocks) {
      const slice = alerts.slice(i, i + maxBlocks);
      const blocks: any[] = [
        {
          type: 'header',
          text: { type: 'plain_text', text: header, emoji: true },
        },
        { type: 'divider' },
      ];

      for (const a of slice) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${a.symbol}* — ${a.title}\n${a.lines.map((l) => `> ${l}`).join('\n')}`,
          },
        });
      }

      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `${header}: ${slice.length} tín hiệu`,
            blocks,
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          const err = `Slack Webhook returned HTTP ${response.status}: ${errBody}`;
          console.error(err);
          return { success: false, error: err };
        }
      } catch (err: any) {
        console.error('Failed to send Slack webhook:', err);
        return { success: false, error: err?.message || 'Network error sending to Slack' };
      }
    }

    return { success: true };
  }

  private async sendTelegramBatch(channel: 'rsi' | 'bank', alerts: Alert[]): Promise<void> {
    if (!this.cfg.telegramToken) {
      console.warn('[Telegram] Missing TELEGRAM_BOT_TOKEN');
      return;
    }
    const chatId = channel === 'rsi' ? this.cfg.rsiChatId : this.cfg.bankChatId;
    if (!chatId) {
      console.warn(`[Telegram] Missing Chat ID for channel ${channel}`);
      return;
    }

    const header =
      channel === 'rsi'
        ? 'Cảnh báo RSI — VN100'
        : 'Cảnh báo kỹ thuật — Ngân hàng VN100';

    const maxLen = 3900;
    let chunk: Alert[] = [];

    const formatDigest = (items: Alert[]) => {
      const parts = [`<b>${this.escapeHtml(header)}</b>`, ''];
      for (const a of items) {
        parts.push(`<b>${this.escapeHtml(a.symbol)}</b> — ${this.escapeHtml(a.title)}`);
        for (const line of a.lines) {
          parts.push(`  ${this.escapeHtml(line)}`);
        }
        parts.push('');
      }
      return parts.join('\n').trim();
    };

    for (const a of alerts) {
      const candidate = [...chunk, a];
      if (formatDigest(candidate).length > maxLen && chunk.length > 0) {
        await this.postTelegramMessage(chatId, formatDigest(chunk));
        chunk = [a];
      } else {
        chunk = candidate;
      }
    }

    if (chunk.length > 0) {
      await this.postTelegramMessage(chatId, formatDigest(chunk));
    }
  }

  private async postTelegramMessage(chatId: string, text: string): Promise<void> {
    try {
      const url = `https://api.telegram.org/bot${this.cfg.telegramToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`Telegram API error: ${res.status} ${errText}`);
      }
    } catch (err) {
      console.error('Failed to send Telegram message:', err);
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
