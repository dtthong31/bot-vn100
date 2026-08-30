import { AlertLogItem, OHLCV } from '../types';

export class BotStore {
  private ohlcvCache: Map<string, OHLCV[]> = new Map();
  private state: Map<string, any> = new Map();
  private alertLogs: AlertLogItem[] = [];
  private lastFetchTime: Map<string, string> = new Map();
  private alertIdCounter: number = 1;

  constructor() {
    // Initialize default states if needed
  }

  // --- OHLCV cache ---
  public getOhlcv(symbol: string, interval: string): OHLCV[] {
    const key = `${symbol}:${interval}`;
    return this.ohlcvCache.get(key) || [];
  }

  public setOhlcv(symbol: string, interval: string, data: OHLCV[]): void {
    const key = `${symbol}:${interval}`;
    this.ohlcvCache.set(key, data);
  }

  public upsertOhlcv(symbol: string, interval: string, fresh: OHLCV[]): void {
    const key = `${symbol}:${interval}`;
    const existing = this.ohlcvCache.get(key) || [];
    const timeMap = new Map<string, OHLCV>();

    for (const bar of existing) {
      timeMap.set(bar.time, bar);
    }
    for (const bar of fresh) {
      timeMap.set(bar.time, bar);
    }

    const merged = Array.from(timeMap.values()).sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    this.ohlcvCache.set(key, merged);
  }

  // --- State management ---
  public get<T = any>(key: string, defaultValue?: T): T {
    return this.state.has(key) ? this.state.get(key) : defaultValue;
  }

  public set(key: string, value: any): void {
    this.state.set(key, value);
  }

  public getFetchTime(key: string): string | null {
    return this.lastFetchTime.get(key) || null;
  }

  public setFetchTime(key: string, isoString: string): void {
    this.lastFetchTime.set(key, isoString);
  }

  // --- Alert logging ---
  public logAlert(channel: 'rsi' | 'bank', symbol: string, kind: string, title: string, lines: string[]): AlertLogItem {
    const alert: AlertLogItem = {
      id: this.alertIdCounter++,
      ts: new Date().toISOString(),
      channel,
      symbol,
      kind,
      title,
      lines,
    };
    this.alertLogs.unshift(alert); // newest first
    if (this.alertLogs.length > 500) {
      this.alertLogs.pop();
    }
    return alert;
  }

  public getAlertLogs(channel?: 'rsi' | 'bank', limit: number = 100): AlertLogItem[] {
    let list = this.alertLogs;
    if (channel) {
      list = list.filter((a) => a.channel === channel);
    }
    return list.slice(0, limit);
  }

  public clearLogs(): void {
    this.alertLogs = [];
  }
}

export const globalStore = new BotStore();
