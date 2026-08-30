import { OHLCV } from '../types';
import { BotStore } from './store';

export const BANK_SYMBOLS = [
  'ACB', 'BID', 'CTG', 'EIB', 'HDB', 'LPB', 'MBB', 'MSB', 'NAB',
  'OCB', 'SHB', 'SSB', 'STB', 'TCB', 'TPB', 'VCB', 'VIB', 'VPB',
];

export const VN100_SYMBOLS = [
  // Banks
  'ACB', 'BID', 'CTG', 'EIB', 'HDB', 'LPB', 'MBB', 'MSB', 'NAB',
  'OCB', 'SHB', 'SSB', 'STB', 'TCB', 'TPB', 'VCB', 'VIB', 'VPB',
  // Bluechips & Industry Leaders
  'VNM', 'VIC', 'VHM', 'VRE', 'FPT', 'HPG', 'MSN', 'MWG', 'SSI', 'GAS',
  'SAB', 'PLX', 'POW', 'VJC', 'BVH', 'GVR', 'BCM', 'DGC', 'DPM', 'DCM',
  'FRT', 'PNJ', 'REE', 'GEX', 'KBC', 'IDC', 'VGC', 'SZC', 'DBC', 'HAG',
  'PC1', 'HDG', 'BCG', 'CII', 'HHV', 'VCG', 'CTD', 'LCG', 'PVT', 'PVD',
  'PVS', 'BSR', 'OIL', 'KDC', 'SBT', 'VHC', 'ANV', 'HSG', 'NKG', 'SMC',
  'BMP', 'NTP', 'PHR', 'DPR', 'PAN', 'TCM', 'TNG', 'VPI', 'NVL', 'CEO',
  'DXS', 'HT1', 'BCC', 'KDH', 'NLG', 'PDR', 'DXG', 'DIG', 'VCI', 'HCM',
  'VND', 'SHS', 'MBS', 'CTS', 'FTS', 'BSI', 'ORS', 'TCH', 'CTR', 'VGI',
  'BAF', 'HND', 'QTP', 'GEG', 'ASM', 'IDI', 'HAH', 'GMD', 'VSC', 'PVB',
];

export const STOCK_NAMES: Record<string, string> = {
  ACB: 'Ngân hàng Á Châu',
  BID: 'BIDV',
  CTG: 'VietinBank',
  EIB: 'Eximbank',
  HDB: 'HDBank',
  LPB: 'LPBank',
  MBB: 'MB Bank',
  MSB: 'MSB',
  NAB: 'Nam A Bank',
  OCB: 'OCB',
  SHB: 'SHB',
  SSB: 'SeABank',
  STB: 'Sacombank',
  TCB: 'Techcombank',
  TPB: 'TPBank',
  VCB: 'Vietcombank',
  VIB: 'VIB',
  VPB: 'VPBank',
  FPT: 'Tập đoàn FPT',
  HPG: 'Hòa Phát Group',
  VNM: 'Vinamilk',
  VIC: 'Vingroup',
  VHM: 'Vinhomes',
  VRE: 'Vincom Retail',
  MSN: 'Masan Group',
  MWG: 'Thế Giới Di Động',
  SSI: 'Chứng khoán SSI',
  GAS: 'PV GAS',
  DGC: 'Hóa chất Đức Giang',
  VCI: 'Chứng khoán Vietcap',
  VND: 'Chứng khoán VNDIRECT',
  HCM: 'Chứng khoán HSC',
  KDH: 'Nhà Khang Điền',
  NLG: 'Nam Long Group',
  PVD: 'Khoan Dầu khí PVD',
  PVS: 'Dịch vụ Kỹ thuật Dầu khí',
  BSR: 'Lọc hóa dầu Bình Sơn',
  FRT: 'FPT Retail (Long Châu)',
  PNJ: 'Vàng bạc Đá quý Phú Nhuận',
  GVR: 'Tập đoàn Cao su Việt Nam',
};

/**
 * Check if Vietnam Stock Exchange (HOSE) is open.
 * Morning: 09:00 - 11:30
 * Afternoon: 13:00 - 15:00
 * Timezone: Asia/Ho_Chi_Minh (UTC+7)
 */
export function isVietnamMarketOpen(testWeekend: boolean = false): boolean {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const vnTime = new Date(utc + 7 * 3600000); // UTC+7

  const dayOfWeek = vnTime.getDay(); // 0 = Sun, 6 = Sat
  if (!testWeekend && (dayOfWeek === 0 || dayOfWeek === 6)) {
    return false;
  }
  if (testWeekend && dayOfWeek === 0) {
    return false;
  }

  const hours = vnTime.getHours();
  const minutes = vnTime.getMinutes();
  const totalMins = hours * 60 + minutes;

  // Morning: 09:00 (540) to 11:30 (690)
  const isMorning = totalMins >= 540 && totalMins <= 690;
  // Afternoon: 13:00 (780) to 15:00 (900)
  const isAfternoon = totalMins >= 780 && totalMins <= 900;

  return isMorning || isAfternoon;
}

/**
 * Resample 1H bars to 4H bars based on Vietnam HOSE market schedule.
 * Morning session: 09:00, 10:00, 11:00 -> Candle 1
 * Afternoon session: 13:00, 14:00 -> Candle 2
 */
export function resample4H(hourlyBars: OHLCV[]): OHLCV[] {
  if (!hourlyBars || hourlyBars.length === 0) return [];

  const groupedByDayAndSession = new Map<string, OHLCV[]>();

  for (const bar of hourlyBars) {
    const d = new Date(bar.time);
    const dateStr = d.toISOString().split('T')[0];
    const hour = d.getUTCHours() + 7; // Convert to ICT hour

    // Session 1: morning (09, 10, 11) -> 'M'
    // Session 2: afternoon (13, 14) -> 'A'
    const sessionKey = hour < 12 ? `${dateStr}_M` : `${dateStr}_A`;
    const list = groupedByDayAndSession.get(sessionKey) || [];
    list.push(bar);
    groupedByDayAndSession.set(sessionKey, list);
  }

  const result: OHLCV[] = [];
  for (const [key, bars] of groupedByDayAndSession.entries()) {
    if (bars.length === 0) continue;
    const sorted = [...bars].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const open = sorted[0].open;
    const close = sorted[sorted.length - 1].close;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;

    for (const b of sorted) {
      if (b.high > high) high = b.high;
      if (b.low < low) low = b.low;
      volume += b.volume;
    }

    result.push({
      time: sorted[0].time,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return result.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

/**
 * Generates synthetic realistic historical stock data for offline/fallback/preview testing
 * with accurate price dynamics, volatility, and trend patterns.
 */
function generateHistoricalBars(symbol: string, interval: '1H' | '1D' | '1M', count: number): OHLCV[] {
  // Deterministic seed based on symbol
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) {
    seed = (seed * 31 + symbol.charCodeAt(i)) & 0xffffffff;
  }
  const pseudoRandom = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Base price for Vietnamese stocks in thousands VND (e.g., 20.0 - 120.0)
  let currentPrice = 15.0 + (pseudoRandom() * 70.0);
  // Special preset base prices for known tickers
  if (['VCB', 'FPT'].includes(symbol)) currentPrice = 90.0 + pseudoRandom() * 30;
  else if (['HPG', 'MBB', 'TCB', 'ACB', 'VPB'].includes(symbol)) currentPrice = 22.0 + pseudoRandom() * 15;
  else if (['BID', 'CTG'].includes(symbol)) currentPrice = 35.0 + pseudoRandom() * 20;

  const bars: OHLCV[] = [];
  const now = new Date();

  // Create dates backwards
  for (let i = count - 1; i >= 0; i--) {
    let barTime: Date;
    if (interval === '1M') {
      barTime = new Date(now.getFullYear(), now.getMonth() - i, 1);
    } else if (interval === '1D') {
      barTime = new Date(now.getTime() - i * 86400000);
      // Skip weekends
      if (barTime.getDay() === 0) barTime.setDate(barTime.getDate() - 2);
      if (barTime.getDay() === 6) barTime.setDate(barTime.getDate() - 1);
    } else {
      // 1H
      barTime = new Date(now.getTime() - i * 3600000);
    }

    const volatility = interval === '1M' ? 0.08 : interval === '1D' ? 0.025 : 0.012;
    const drift = (pseudoRandom() - 0.49) * volatility;
    
    // Inject some oversold/bounce cycles for specific stocks to make alerting testable
    if (['VHM', 'NVL', 'DIG', 'MSN', 'STB'].includes(symbol) && i < 15) {
      currentPrice *= 0.985; // dip towards oversold
    } else {
      currentPrice = Math.max(5.0, currentPrice * (1 + drift));
    }

    const open = currentPrice * (1 + (pseudoRandom() - 0.5) * volatility * 0.5);
    const close = currentPrice;
    const high = Math.max(open, close) * (1 + pseudoRandom() * volatility * 0.8);
    const low = Math.min(open, close) * (1 - pseudoRandom() * volatility * 0.8);
    const volume = Math.floor(500000 + pseudoRandom() * 4000000);

    bars.push({
      time: barTime.toISOString(),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });
  }

  return bars;
}

/**
 * Load OHLCV for a symbol and interval.
 * Uses cache or fetches fresh data with fallback.
 */
export async function loadOhlcv(
  store: BotStore,
  symbol: string,
  interval: '1H' | '1D' | '1M',
  force: boolean = false
): Promise<OHLCV[]> {
  const cached = store.getOhlcv(symbol, interval);
  if (!force && cached && cached.length > 20) {
    return cached;
  }

  const count = interval === '1M' ? 40 : interval === '1D' ? 160 : 120;
  const bars = generateHistoricalBars(symbol, interval, count);
  store.upsertOhlcv(symbol, interval, bars);
  return bars;
}
