import { OHLCV } from '../types';

export const VN100_SYMBOLS = [
  'AAA', 'ACB', 'ANV', 'ASM', 'BAF', 'BCM', 'BFC', 'BID', 'BMP', 'BSI',
  'BVH', 'BWE', 'CII', 'CMG', 'CTD', 'CTG', 'CTR', 'CTS', 'DBC', 'DCM',
  'DGC', 'DGW', 'DIG', 'DPM', 'DXG', 'DXS', 'EIB', 'EVF', 'FPT', 'FRT',
  'FTS', 'GAS', 'GEG', 'GEX', 'GMD', 'HAH', 'HCM', 'HDB', 'HDC', 'HDG',
  'HHV', 'HPG', 'HSG', 'KBC', 'KDC', 'KDH', 'LPB', 'MBB', 'MSB', 'MSN',
  'MWG', 'NAB', 'NKG', 'NLG', 'NT2', 'OCB', 'PAN', 'PC1', 'PDR', 'PHR',
  'PLX', 'PNJ', 'POW', 'PTB', 'PVD', 'PVS', 'PVT', 'REE', 'SAB', 'SAM',
  'SBT', 'SHB', 'SSB', 'SSI', 'STB', 'SZC', 'TCB', 'TCH', 'TMS', 'TPB',
  'VCB', 'VCG', 'VCI', 'VGC', 'VHC', 'VHM', 'VIB', 'VIC', 'VIX', 'VJC',
  'VND', 'VNM', 'VPB', 'VPI', 'VRE', 'VSC', 'VSH', 'VTP', 'BSR', 'PVI'
];

export const BANK_SYMBOLS = [
  'ACB', 'BID', 'CTG', 'EIB', 'HDB', 'LPB', 'MBB', 'MSB', 'NAB', 'OCB',
  'SHB', 'SSB', 'STB', 'TCB', 'TPB', 'VCB', 'VIB', 'VPB'
];

export const STOCK_NAMES: Record<string, string> = {
  ACB: 'Ngân hàng Á Châu',
  BID: 'BIDV',
  CTG: 'VietinBank',
  EIB: 'Eximbank',
  HDB: 'HDBank',
  LPB: 'LPBank',
  MBB: 'MB Bank',
  MSB: 'MSB Bank',
  NAB: 'Nam A Bank',
  OCB: 'OCB Bank',
  SHB: 'SHB Bank',
  SSB: 'SeABank',
  STB: 'Sacombank',
  TCB: 'Techcombank',
  TPB: 'TPBank',
  VCB: 'Vietcombank',
  VIB: 'VIB Bank',
  VPB: 'VPBank',
  HPG: 'Tập đoàn Hòa Phát',
  FPT: 'Tập đoàn FPT',
  MWG: 'Thế Giới Di Động',
  VHM: 'Vinhomes',
  VIC: 'Vingroup',
  VNM: 'Vinamilk',
  MSN: 'Tập đoàn Masan',
  SSI: 'Chứng khoán SSI',
  VND: 'Chứng khoán VNDirect',
  VCI: 'Chứng khoán Vietcap',
  DGC: 'Hóa chất Đức Giang',
  GAS: 'PV Gas',
  PVD: 'Khoan Dầu khí',
  PVS: 'Dịch vụ Dầu khí',
};

// Generates synthetic price action when live API is unavailable
export function generateRealisticOhlcv(
  symbol: string,
  interval: '1D' | '1H' | '1M',
  count: number = 80
): OHLCV[] {
  const bars: OHLCV[] = [];
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) {
    seed += symbol.charCodeAt(i);
  }

  // Base price for stock
  let basePrice = 15 + (seed % 75);
  if (BANK_SYMBOLS.includes(symbol)) {
    basePrice = 18 + (seed % 35);
  }

  const now = new Date();
  let stepMs = 24 * 60 * 60 * 1000;
  if (interval === '1H') stepMs = 60 * 60 * 1000;
  if (interval === '1M') stepMs = 30 * 24 * 60 * 60 * 1000;

  let currentPrice = basePrice;
  const startTime = now.getTime() - count * stepMs;

  for (let i = 0; i < count; i++) {
    const timeObj = new Date(startTime + i * stepMs);
    const pseudoRandom = Math.sin(seed * 999 + i * 0.7) * 0.025;
    const trend = Math.cos(i * 0.1) * 0.01;
    const delta = (pseudoRandom + trend) * currentPrice;

    const open = Math.round((currentPrice + (Math.sin(i) * 0.005 * currentPrice)) * 100) / 100;
    const close = Math.max(1, Math.round((open + delta) * 100) / 100);
    const high = Math.round((Math.max(open, close) + Math.abs(delta) * 0.7) * 100) / 100;
    const low = Math.round((Math.min(open, close) - Math.abs(delta) * 0.7) * 100) / 100;
    const volume = Math.floor(500000 + Math.abs(Math.sin(i * 2)) * 3000000);

    bars.push({
      time: timeObj.toISOString().slice(0, interval === '1M' ? 7 : 10),
      open,
      high,
      low,
      close,
      volume,
    });

    currentPrice = close;
  }

  return bars;
}
