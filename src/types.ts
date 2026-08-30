export interface OHLCV {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AlertLogItem {
  id: number;
  ts: string;
  channel: 'rsi' | 'bank';
  symbol: string;
  kind: string;
  title: string;
  lines: string[];
}

export interface StockRsiStatus {
  symbol: string;
  name?: string;
  close: number;
  changePercent?: number;
  rsi1D: number | null;
  rsi4H: number | null;
  rsi1H: number | null;
  status: 'oversold' | 'bounce_awaiting' | 'bounce_fired' | 'normal' | 'overbought';
  armed: boolean;
  awaitingSince: string | null;
  lastUpdated: string;
}

export interface BankTechnicalStatus {
  symbol: string;
  close: number;
  changePercent?: number;
  monthUpperBB: number | null;
  monthLowerBB: number | null;
  monthMidBB: number | null;
  monthBBStatus: 'near_upper' | 'near_lower' | 'hit_upper' | 'hit_lower' | 'normal';
  dailyMA50: number | null;
  dailyMA50DistancePct: number | null;
  ma50Side: 'above' | 'below' | 'crossover_up' | 'crossover_down';
  rsi1D: number | null;
  rsi4H: number | null;
  rsi1H: number | null;
  lastUpdated: string;
}

export interface BotConfigState {
  notifier: 'console' | 'telegram' | 'slack';
  dryRun: boolean;
  rsiPeriod: number;
  rsiOversold: number;
  bbPeriod: number;
  bbStd: number;
  maPeriod: number;
  bounceExpiryDays: number;
  maxRequestsPerMin: number;
  intradayScanMinutes: number;
  testWeekend: boolean;
  hasApiKey: boolean;
  hasTelegramConfig: boolean;
  hasSlackConfig: boolean;
  isMarketOpen: boolean;
  lastScanTime: string | null;
}

export interface ScanResult {
  timestamp: string;
  scanType: 'rsi' | 'bank' | 'all';
  alertsGenerated: AlertLogItem[];
  symbolsScanned: number;
  durationMs: number;
}
