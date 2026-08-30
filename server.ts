import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import { globalStore } from './src/bot/store';
import { NotifierService } from './src/bot/notifier';
import { StrategyRunner } from './src/bot/strategies';
import { BANK_SYMBOLS, VN100_SYMBOLS, generateRealisticOhlcv } from './src/bot/marketData';
import { calculateBollinger, calculateRsi, calculateSma } from './src/bot/indicators';
import { BotConfigState } from './src/types';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

function checkIsMarketOpen(testWeekend: boolean = false): boolean {
  if (testWeekend) return true;
  const now = new Date();
  // ICT is UTC+7
  const ictHours = (now.getUTCHours() + 7) % 24;
  const ictMinutes = now.getUTCMinutes();
  const day = now.getUTCDay();

  // Weekend check (0 is Sun, 6 is Sat)
  if (day === 0 || day === 6) return false;

  const currentMinutes = ictHours * 60 + ictMinutes;
  const morningOpen = 9 * 60;
  const morningClose = 11 * 60 + 30;
  const afternoonOpen = 13 * 60;
  const afternoonClose = 15 * 60;

  return (
    (currentMinutes >= morningOpen && currentMinutes <= morningClose) ||
    (currentMinutes >= afternoonOpen && currentMinutes <= afternoonClose)
  );
}

const initialTestWeekend = process.env.TEST_WEEKEND === '1' || process.env.TEST_WEEKEND === 'true';

// In-memory runtime config initialized from env variables
let botConfig: BotConfigState = {
  notifier: (process.env.NOTIFIER as any) || 'slack',
  dryRun: process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true',
  rsiPeriod: Number(process.env.RSI_PERIOD) || 14,
  rsiOversold: Number(process.env.RSI_OVERSOLD) || 30,
  bbPeriod: Number(process.env.BB_PERIOD) || 20,
  bbStd: Number(process.env.BB_STD) || 2.0,
  maPeriod: Number(process.env.MA_PERIOD) || 50,
  bounceExpiryDays: Number(process.env.BOUNCE_EXPIRY_DAYS) || 5,
  maxRequestsPerMin: Number(process.env.MAX_REQUESTS_PER_MIN) || 20,
  intradayScanMinutes: Number(process.env.INTRADAY_SCAN_MINUTES) || 30,
  testWeekend: initialTestWeekend,
  hasApiKey: Boolean(process.env.SSI_CONSUMER_ID || process.env.TCBS_TOKEN),
  hasTelegramConfig: Boolean(process.env.TELEGRAM_BOT_TOKEN && (process.env.TELEGRAM_RSI_CHAT_ID || process.env.TELEGRAM_BANK_CHAT_ID)),
  hasSlackConfig: Boolean(process.env.SLACK_RSI_WEBHOOK || process.env.SLACK_BANK_WEBHOOK),
  isMarketOpen: checkIsMarketOpen(initialTestWeekend),
  lastScanTime: null,
};

let slackRsiWebhook = process.env.SLACK_RSI_WEBHOOK || '';
let slackBankWebhook = process.env.SLACK_BANK_WEBHOOK || '';

const notifierService = new NotifierService(
  {
    notifier: botConfig.notifier,
    telegramToken: process.env.TELEGRAM_BOT_TOKEN,
    rsiChatId: process.env.TELEGRAM_RSI_CHAT_ID,
    bankChatId: process.env.TELEGRAM_BANK_CHAT_ID,
    slackRsiWebhook,
    slackBankWebhook,
    dryRun: botConfig.dryRun,
  },
  globalStore
);

const strategyRunner = new StrategyRunner(globalStore, notifierService, botConfig);

// ==========================================
// API ROUTES
// ==========================================

// 1. Bot Config & Status
app.get('/api/config', (req, res) => {
  botConfig.isMarketOpen = checkIsMarketOpen(botConfig.testWeekend);
  botConfig.hasSlackConfig = Boolean(slackRsiWebhook || slackBankWebhook);
  botConfig.hasTelegramConfig = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  res.json(botConfig);
});

app.post('/api/config', (req, res) => {
  const updates = req.body || {};
  if (updates.slackRsiWebhook !== undefined) slackRsiWebhook = updates.slackRsiWebhook;
  if (updates.slackBankWebhook !== undefined) slackBankWebhook = updates.slackBankWebhook;

  botConfig = {
    ...botConfig,
    ...updates,
    hasSlackConfig: Boolean(slackRsiWebhook || slackBankWebhook),
  };

  notifierService.updateConfig({
    notifier: botConfig.notifier,
    dryRun: botConfig.dryRun,
    slackRsiWebhook,
    slackBankWebhook,
  });

  strategyRunner.updateConfig(botConfig);
  res.json({ success: true, config: botConfig });
});

// 2. Stock Universe Data
app.get('/api/universe/rsi', async (req, res) => {
  try {
    const { statuses } = await strategyRunner.scanRsi(VN100_SYMBOLS);
    res.json(statuses);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to get RSI data' });
  }
});

app.get('/api/universe/banks', async (req, res) => {
  try {
    const { statuses } = await strategyRunner.scanBanks();
    res.json(statuses);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to get Bank data' });
  }
});

// 3. Scan Triggers
app.post('/api/scan/:type', async (req, res) => {
  const { type } = req.params;
  const start = Date.now();
  botConfig.lastScanTime = new Date().toISOString();

  let allAlerts: any[] = [];
  let symbolsScanned = 0;

  try {
    if (type === 'rsi' || type === 'all') {
      const rsiResult = await strategyRunner.scanRsi(VN100_SYMBOLS);
      allAlerts = allAlerts.concat(rsiResult.alerts);
      symbolsScanned += VN100_SYMBOLS.length;
    }

    if (type === 'bank' || type === 'all') {
      const bankResult = await strategyRunner.scanBanks();
      allAlerts = allAlerts.concat(bankResult.alerts);
      symbolsScanned += BANK_SYMBOLS.length;
    }

    // Dispatch alerts
    const logged = await notifierService.dispatchAlerts(allAlerts);

    res.json({
      timestamp: botConfig.lastScanTime,
      scanType: type,
      alertsGenerated: logged,
      symbolsScanned,
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    console.error('Scan error:', err);
    res.status(500).json({ error: err?.message || 'Scan execution failed' });
  }
});

// 4. Alert History
app.get('/api/alerts', (req, res) => {
  const channel = req.query.channel as 'rsi' | 'bank' | undefined;
  const logs = globalStore.getAlertLogs(channel);
  res.json(logs);
});

app.delete('/api/alerts', (req, res) => {
  globalStore.clearLogs();
  res.json({ success: true });
});

// 5. Chart series data
app.get('/api/chart/:symbol', (req, res) => {
  const { symbol } = req.params;
  const interval = (req.query.interval as '1D' | '1H' | '1M') || '1D';

  let bars = globalStore.getOhlcv(symbol, interval);
  if (bars.length === 0) {
    // Generate if not cached
    bars = generateRealisticOhlcv(symbol, interval, interval === '1M' ? 36 : 60);
    globalStore.setOhlcv(symbol, interval, bars);
  }

  const closes = bars.map((b: any) => b.close);
  const rsi = calculateRsi(closes, 14);
  const bb = calculateBollinger(closes, 20, 2.0);
  const ma50 = calculateSma(closes, 50);

  const series = bars.map((b: any, i: number) => ({
    time: b.time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    rsi: rsi[i],
    bbUpper: bb.upper[i],
    bbMiddle: bb.middle[i],
    bbLower: bb.lower[i],
    ma50: ma50[i],
  }));

  res.json({ symbol, interval, data: series });
});

// 6. Test Notifications
app.post('/api/test/slack', async (req, res) => {
  try {
    const testAlert = {
      channel: 'rsi' as const,
      symbol: 'SSI',
      kind: 'test_signal',
      title: 'Tín hiệu Thử Nghiệm Kết Nối Slack (Test Alert)',
      lines: [
        'Kênh: SLACK_RSI_WEBHOOK & SLACK_BANK_WEBHOOK',
        'Giá khớp mẫu: 36,500 VND (+2.8%)',
        'Trạng thái: Kết nối Slack Webhook hoạt động hoàn hảo!',
        `Thời gian gửi: ${new Date().toLocaleTimeString('vi-VN')} ICT`,
      ],
    };

    const result = await notifierService.sendSlackBatch('rsi', [testAlert]);
    if (result.success) {
      globalStore.logAlert('rsi', testAlert.symbol, testAlert.kind, testAlert.title, testAlert.lines);
      res.json({ success: true, message: 'Đã gửi test message tới Slack Webhook thành công' });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Lỗi gửi Slack test' });
  }
});

app.post('/api/test/telegram', async (req, res) => {
  try {
    const testAlert = {
      channel: 'rsi' as const,
      symbol: 'TCB',
      kind: 'test_signal',
      title: 'Tín hiệu Thử Nghiệm Kết Nối Telegram',
      lines: [
        'Giá khớp mẫu: 24,800 VND (+1.5%)',
        'Trạng thái: Kết nối Telegram Bot hoạt động bình thường',
        `Thời gian: ${new Date().toLocaleTimeString('vi-VN')}`,
      ],
    };

    await notifierService.dispatchAlerts([testAlert]);
    res.json({ success: true, message: 'Đã gửi test message tới Telegram' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// ==========================================
// VITE SPA MIDDLEWARE & PRODUCTION SERVING
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[VN100 Bot Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
