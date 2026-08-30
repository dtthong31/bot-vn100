import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

import { globalStore } from './src/bot/store';
import { NotifierService } from './src/bot/notifier';
import {
  BANK_SYMBOLS,
  VN100_SYMBOLS,
  isVietnamMarketOpen,
  loadOhlcv,
  resample4H,
} from './src/bot/marketData';
import {
  scanRsiStrategy,
  scanBankBollingerStrategy,
  scanBankMa50Strategy,
  getBankTechnicalsOverview,
} from './src/bot/strategies';
import {
  calculateBollinger,
  calculateRsi,
  calculateSma,
} from './src/bot/indicators';
import { BotConfigState } from './src/types';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// In-memory config state initialized from env
const currentConfig = {
  notifier: (process.env.NOTIFIER as 'console' | 'telegram' | 'slack') || 'console',
  dryRun: process.env.DRY_RUN === '1',
  rsiPeriod: Number(process.env.RSI_PERIOD) || 14,
  rsiOversold: Number(process.env.RSI_OVERSOLD) || 30.0,
  bbPeriod: Number(process.env.BB_PERIOD) || 20,
  bbStd: Number(process.env.BB_STD) || 2.0,
  maPeriod: Number(process.env.MA_PERIOD) || 50,
  bounceExpiryDays: Number(process.env.BOUNCE_EXPIRY_DAYS) || 5,
  maxRequestsPerMin: Number(process.env.MAX_RPM) || 18,
  intradayScanMinutes: Number(process.env.INTRADAY_SCAN_MINUTES) || 30,
  testWeekend: process.env.TEST_WEEKEND === '1',
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  rsiChatId: process.env.RSI_CHAT_ID || '',
  bankChatId: process.env.BANK_TECH_CHAT_ID || '',
  slackRsiWebhook: process.env.SLACK_RSI_WEBHOOK || '',
  slackBankWebhook: process.env.SLACK_BANK_WEBHOOK || '',
  vnstockApiKey: process.env.VNSTOCK_API_KEY || '',
  lastScanTime: null as string | null,
};

const notifierService = new NotifierService(
  {
    notifier: currentConfig.notifier,
    telegramToken: currentConfig.telegramToken,
    rsiChatId: currentConfig.rsiChatId,
    bankChatId: currentConfig.bankChatId,
    slackRsiWebhook: currentConfig.slackRsiWebhook,
    slackBankWebhook: currentConfig.slackBankWebhook,
    dryRun: currentConfig.dryRun,
  },
  globalStore
);

// Cache for scanned table views
let cachedRsiStatuses: any[] = [];
let cachedBankStatuses: any[] = [];

// Seed initial demo data / alerts on startup
async function initialScan() {
  try {
    const { statuses } = await scanRsiStrategy(globalStore, VN100_SYMBOLS, {
      period: currentConfig.rsiPeriod,
      oversoldThreshold: currentConfig.rsiOversold,
      bounceExpiryDays: currentConfig.bounceExpiryDays,
      dryRun: false,
    });
    cachedRsiStatuses = statuses;

    cachedBankStatuses = await getBankTechnicalsOverview(
      globalStore,
      BANK_SYMBOLS,
      currentConfig.bbPeriod,
      currentConfig.bbStd,
      currentConfig.maPeriod
    );

    // Initial alert log examples
    globalStore.logAlert(
      'rsi',
      'NVL',
      'rsi4h_oversold',
      'RSI 4H xuống dưới 30',
      ['RSI ngày 34.2 | 4H 28.4 | 1H 26.1']
    );
    globalStore.logAlert(
      'rsi',
      'DIG',
      'rsi1h_bounce',
      'tín hiệu hồi ngắn hạn (RSI 1H cắt lên 30)',
      ['RSI ngày 32.5 | 4H 29.8 | 1H 31.4']
    );
    globalStore.logAlert(
      'bank',
      'MBB',
      'bb_month_upper',
      'chạm dải trên Bollinger tháng',
      ['BB(20,2) tháng = 26.80 | giá 26.85 — nến tháng chưa đóng', 'RSI ngày 62.4 | 4H 65.1 | 1H 64.0']
    );
    globalStore.logAlert(
      'bank',
      'TCB',
      'ma50_above',
      'giá đóng cửa cắt LÊN MA50 ngày',
      ['Đóng cửa 24.50 | MA50 = 24.15 (Hôm nay)']
    );

    currentConfig.lastScanTime = new Date().toISOString();
  } catch (err) {
    console.error('Initial scan error:', err);
  }
}

// ----------------------------------------------------------------------------
// API ROUTES
// ----------------------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  const configState: BotConfigState = {
    notifier: currentConfig.notifier,
    dryRun: currentConfig.dryRun,
    rsiPeriod: currentConfig.rsiPeriod,
    rsiOversold: currentConfig.rsiOversold,
    bbPeriod: currentConfig.bbPeriod,
    bbStd: currentConfig.bbStd,
    maPeriod: currentConfig.maPeriod,
    bounceExpiryDays: currentConfig.bounceExpiryDays,
    maxRequestsPerMin: currentConfig.maxRequestsPerMin,
    intradayScanMinutes: currentConfig.intradayScanMinutes,
    testWeekend: currentConfig.testWeekend,
    hasApiKey: !!currentConfig.vnstockApiKey,
    hasTelegramConfig: !!(currentConfig.telegramToken && currentConfig.rsiChatId),
    hasSlackConfig: !!currentConfig.slackRsiWebhook,
    isMarketOpen: isVietnamMarketOpen(currentConfig.testWeekend),
    lastScanTime: currentConfig.lastScanTime,
  };
  res.json(configState);
});

app.post('/api/config', (req, res) => {
  const updates = req.body;
  if (updates.notifier !== undefined) currentConfig.notifier = updates.notifier;
  if (updates.dryRun !== undefined) currentConfig.dryRun = Boolean(updates.dryRun);
  if (updates.rsiOversold !== undefined) currentConfig.rsiOversold = Number(updates.rsiOversold);
  if (updates.bbPeriod !== undefined) currentConfig.bbPeriod = Number(updates.bbPeriod);
  if (updates.bbStd !== undefined) currentConfig.bbStd = Number(updates.bbStd);
  if (updates.maPeriod !== undefined) currentConfig.maPeriod = Number(updates.maPeriod);
  if (updates.testWeekend !== undefined) currentConfig.testWeekend = Boolean(updates.testWeekend);

  notifierService.updateConfig({
    notifier: currentConfig.notifier,
    dryRun: currentConfig.dryRun,
  });

  res.json({ success: true, config: currentConfig });
});

app.get('/api/alerts', (req, res) => {
  const channel = req.query.channel as 'rsi' | 'bank' | undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  const logs = globalStore.getAlertLogs(channel, limit);
  res.json(logs);
});

app.delete('/api/alerts', (req, res) => {
  globalStore.clearLogs();
  res.json({ success: true, message: 'Đã xóa toàn bộ nhật ký cảnh báo.' });
});

app.get('/api/universe/rsi', async (req, res) => {
  if (cachedRsiStatuses.length === 0) {
    const { statuses } = await scanRsiStrategy(globalStore, VN100_SYMBOLS, {
      period: currentConfig.rsiPeriod,
      oversoldThreshold: currentConfig.rsiOversold,
      bounceExpiryDays: currentConfig.bounceExpiryDays,
      dryRun: true,
    });
    cachedRsiStatuses = statuses;
  }
  res.json(cachedRsiStatuses);
});

app.get('/api/universe/banks', async (req, res) => {
  if (cachedBankStatuses.length === 0) {
    cachedBankStatuses = await getBankTechnicalsOverview(
      globalStore,
      BANK_SYMBOLS,
      currentConfig.bbPeriod,
      currentConfig.bbStd,
      currentConfig.maPeriod
    );
  }
  res.json(cachedBankStatuses);
});

app.post('/api/scan/rsi', async (req, res) => {
  const startTime = Date.now();
  const { alerts, statuses } = await scanRsiStrategy(globalStore, VN100_SYMBOLS, {
    period: currentConfig.rsiPeriod,
    oversoldThreshold: currentConfig.rsiOversold,
    bounceExpiryDays: currentConfig.bounceExpiryDays,
    dryRun: currentConfig.dryRun,
  });

  cachedRsiStatuses = statuses;
  const loggedAlerts = await notifierService.dispatchAlerts(alerts);
  currentConfig.lastScanTime = new Date().toISOString();

  res.json({
    timestamp: currentConfig.lastScanTime,
    scanType: 'rsi',
    alertsGenerated: loggedAlerts,
    symbolsScanned: VN100_SYMBOLS.length,
    durationMs: Date.now() - startTime,
  });
});

app.post('/api/scan/bank', async (req, res) => {
  const startTime = Date.now();
  const bbAlerts = await scanBankBollingerStrategy(globalStore, BANK_SYMBOLS, {
    bbPeriod: currentConfig.bbPeriod,
    bbStd: currentConfig.bbStd,
    dryRun: currentConfig.dryRun,
  });

  const maAlerts = await scanBankMa50Strategy(globalStore, BANK_SYMBOLS, {
    maPeriod: currentConfig.maPeriod,
    dryRun: currentConfig.dryRun,
  });

  const allAlerts = [...bbAlerts, ...maAlerts];
  const loggedAlerts = await notifierService.dispatchAlerts(allAlerts);

  cachedBankStatuses = await getBankTechnicalsOverview(
    globalStore,
    BANK_SYMBOLS,
    currentConfig.bbPeriod,
    currentConfig.bbStd,
    currentConfig.maPeriod
  );

  currentConfig.lastScanTime = new Date().toISOString();

  res.json({
    timestamp: currentConfig.lastScanTime,
    scanType: 'bank',
    alertsGenerated: loggedAlerts,
    symbolsScanned: BANK_SYMBOLS.length,
    durationMs: Date.now() - startTime,
  });
});

app.post('/api/scan/all', async (req, res) => {
  const startTime = Date.now();

  const { alerts: rsiAlerts, statuses } = await scanRsiStrategy(globalStore, VN100_SYMBOLS, {
    period: currentConfig.rsiPeriod,
    oversoldThreshold: currentConfig.rsiOversold,
    bounceExpiryDays: currentConfig.bounceExpiryDays,
    dryRun: currentConfig.dryRun,
  });
  cachedRsiStatuses = statuses;

  const bbAlerts = await scanBankBollingerStrategy(globalStore, BANK_SYMBOLS, {
    bbPeriod: currentConfig.bbPeriod,
    bbStd: currentConfig.bbStd,
    dryRun: currentConfig.dryRun,
  });

  const maAlerts = await scanBankMa50Strategy(globalStore, BANK_SYMBOLS, {
    maPeriod: currentConfig.maPeriod,
    dryRun: currentConfig.dryRun,
  });

  const allAlerts = [...rsiAlerts, ...bbAlerts, ...maAlerts];
  const loggedAlerts = await notifierService.dispatchAlerts(allAlerts);

  cachedBankStatuses = await getBankTechnicalsOverview(
    globalStore,
    BANK_SYMBOLS,
    currentConfig.bbPeriod,
    currentConfig.bbStd,
    currentConfig.maPeriod
  );

  currentConfig.lastScanTime = new Date().toISOString();

  res.json({
    timestamp: currentConfig.lastScanTime,
    scanType: 'all',
    alertsGenerated: loggedAlerts,
    symbolsScanned: VN100_SYMBOLS.length,
    durationMs: Date.now() - startTime,
  });
});

app.post('/api/test/telegram', async (req, res) => {
  const now = new Date().toLocaleString('vi-VN');
  const testAlerts = [
    {
      channel: 'rsi' as const,
      symbol: 'TEST',
      kind: 'test',
      title: 'kiểm tra kết nối Telegram (Kênh RSI)',
      lines: ['Nếu bạn thấy tin này, cấu hình Telegram đã đúng.', `Thời gian: ${now}`],
    },
    {
      channel: 'bank' as const,
      symbol: 'TEST',
      kind: 'test',
      title: 'kiểm tra kết nối Telegram (Kênh Ngân hàng)',
      lines: ['Nếu bạn thấy tin này, cấu hình Telegram đã đúng.', `Thời gian: ${now}`],
    },
  ];

  const logged = await notifierService.dispatchAlerts(testAlerts);
  res.json({ success: true, sent: logged });
});

app.get('/api/chart/:symbol', async (req, res) => {
  const symbol = (req.params.symbol || 'VCB').toUpperCase();
  const interval = ((req.query.interval as string) || '1D') as '1H' | '1D' | '1M';

  const bars = await loadOhlcv(globalStore, symbol, interval);
  const closes = bars.map((b) => b.close);

  const rsiValues = calculateRsi(closes, 14);
  const ma50Values = calculateSma(closes, 50);
  const { upper, lower, middle } = calculateBollinger(closes, 20, 2.0);

  const chartData = bars.map((bar, i) => ({
    time: bar.time.split('T')[0] || bar.time,
    fullTime: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    rsi: rsiValues[i],
    ma50: ma50Values[i],
    bbUpper: upper[i],
    bbLower: lower[i],
    bbMiddle: middle[i],
  }));

  res.json({
    symbol,
    interval,
    count: chartData.length,
    data: chartData,
  });
});

// ----------------------------------------------------------------------------
// SERVER LAUNCH & VITE INTEGRATION
// ----------------------------------------------------------------------------

async function startServer() {
  await initialScan();

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
    console.log(`🚀 VN100 Alert Bot Server running at http://localhost:${PORT}`);
  });
}

startServer();
