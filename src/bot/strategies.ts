import {
  calculateBollinger,
  calculateRsi,
  calculateSma,
  isCrossedAbove,
} from './indicators';
import { loadOhlcv, resample4H, STOCK_NAMES } from './marketData';
import { Alert } from './notifier';
import { BotStore } from './store';
import { BankTechnicalStatus, StockRsiStatus } from '../types';

function formatRsiValue(val: number | null): string {
  return val === null || val === undefined || Number.isNaN(val)
    ? 'n/a'
    : val.toFixed(1);
}

function rsiContextLine(r1D: number | null, r4H: number | null, r1H: number | null): string {
  return `RSI ngày ${formatRsiValue(r1D)} | 4H ${formatRsiValue(r4H)} | 1H ${formatRsiValue(r1H)}`;
}

export interface ScanRsiOptions {
  period?: number;
  oversoldThreshold?: number;
  bounceExpiryDays?: number;
  dryRun?: boolean;
}

/**
 * Strategy 1: RSI Multi-Timeframe Scan (VN100)
 */
export async function scanRsiStrategy(
  store: BotStore,
  symbols: string[],
  options: ScanRsiOptions = {}
): Promise<{ alerts: Alert[]; statuses: StockRsiStatus[] }> {
  const period = options.period ?? 14;
  const oversold = options.oversoldThreshold ?? 30.0;
  const bounceExpiryDays = options.bounceExpiryDays ?? 5;
  const dryRun = options.dryRun ?? false;

  const alerts: Alert[] = [];
  const statuses: StockRsiStatus[] = [];
  const now = new Date();

  for (const sym of symbols) {
    try {
      const d1Bars = await loadOhlcv(store, sym, '1D');
      const h1Bars = await loadOhlcv(store, sym, '1H');

      if (d1Bars.length < period + 2 || h1Bars.length < period + 2) {
        continue;
      }

      const h4Bars = resample4H(h1Bars);
      const close1D = d1Bars.map((b) => b.close);
      const close1H = h1Bars.map((b) => b.close);
      const close4H = h4Bars.map((b) => b.close);

      const r1DSeries = calculateRsi(close1D, period);
      const r1HSeries = calculateRsi(close1H, period);
      const r4HSeries = close4H.length > period ? calculateRsi(close4H, period) : [];

      const last1D = r1DSeries[r1DSeries.length - 1];
      const last1H = r1HSeries[r1HSeries.length - 1];
      const last4H = r4HSeries.length > 0 ? r4HSeries[r4HSeries.length - 1] : null;

      const currentClose = close1D[close1D.length - 1];
      const prevClose = close1D.length > 1 ? close1D[close1D.length - 2] : currentClose;
      const changePercent = Number((((currentClose - prevClose) / prevClose) * 100).toFixed(2));

      const stateKey = `rsi:${sym}`;
      const state = store.get(stateKey, { armed: true, awaiting: null });
      const newState = { ...state };

      let uiStatus: StockRsiStatus['status'] = 'normal';
      if (last4H !== null && last4H < oversold) {
        uiStatus = 'oversold';
      } else if (newState.awaiting) {
        uiStatus = 'bounce_awaiting';
      } else if (last4H !== null && last4H > 70) {
        uiStatus = 'overbought';
      }

      // 1. Condition 1: 4H RSI falls below oversold (30)
      if (last4H !== null) {
        if (last4H >= oversold) {
          newState.armed = true;
        } else if (state.armed) {
          alerts.push({
            channel: 'rsi',
            symbol: sym,
            kind: 'rsi4h_oversold',
            title: `RSI 4H xuống dưới ${oversold}`,
            lines: [rsiContextLine(last1D, last4H, last1H)],
          });
          newState.armed = false;
          newState.awaiting = now.toISOString();
          uiStatus = 'oversold';
        }
      }

      // 2. Condition 2: 1H RSI crosses above 30 while awaiting bounce
      if (newState.awaiting) {
        const awaitingDate = new Date(newState.awaiting);
        const daysDiff = (now.getTime() - awaitingDate.getTime()) / (1000 * 3600 * 24);

        if (daysDiff > bounceExpiryDays) {
          newState.awaiting = null; // Expired
        } else if (isCrossedAbove(r1HSeries, oversold)) {
          alerts.push({
            channel: 'rsi',
            symbol: sym,
            kind: 'rsi1h_bounce',
            title: `tín hiệu hồi ngắn hạn (RSI 1H cắt lên ${oversold})`,
            lines: [rsiContextLine(last1D, last4H, last1H)],
          });
          newState.awaiting = null;
          uiStatus = 'bounce_fired';
        }
      }

      if (!dryRun) {
        store.set(stateKey, newState);
      }

      statuses.push({
        symbol: sym,
        name: STOCK_NAMES[sym] || sym,
        close: currentClose,
        changePercent,
        rsi1D: last1D !== null ? Number(last1D.toFixed(1)) : null,
        rsi4H: last4H !== null ? Number(last4H.toFixed(1)) : null,
        rsi1H: last1H !== null ? Number(last1H.toFixed(1)) : null,
        status: uiStatus,
        armed: newState.armed,
        awaitingSince: newState.awaiting,
        lastUpdated: now.toISOString(),
      });
    } catch (err) {
      console.error(`Error scanning RSI for ${sym}:`, err);
    }
  }

  return { alerts, statuses };
}

/**
 * Strategy 2A: Bank Monthly Bollinger Bands BB(20, 2)
 */
export async function scanBankBollingerStrategy(
  store: BotStore,
  banks: string[],
  options: { bbPeriod?: number; bbStd?: number; dryRun?: boolean } = {}
): Promise<Alert[]> {
  const period = options.bbPeriod ?? 20;
  const numStd = options.bbStd ?? 2.0;
  const dryRun = options.dryRun ?? false;

  const alerts: Alert[] = [];
  const now = new Date();
  const monthTag = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  for (const sym of banks) {
    try {
      const m1Bars = await loadOhlcv(store, sym, '1M');
      if (m1Bars.length < period + 1) continue;

      const closeMonthly = m1Bars.map((b) => b.close);
      const { upper, lower } = calculateBollinger(closeMonthly, period, numStd);

      const up = upper[upper.length - 1];
      const lo = lower[lower.length - 1];
      const lastBar = m1Bars[m1Bars.length - 1];

      if (up === null || lo === null) continue;

      const stateKey = `bb:${sym}:${monthTag}`;
      const firedList: string[] = store.get(stateKey, []);
      const newFiredList = [...firedList];

      const hits: { tag: string; label: string; level: number }[] = [];
      if (lastBar.high >= up && !firedList.includes('upper')) {
        hits.push({ tag: 'upper', label: 'dải trên', level: up });
      }
      if (lastBar.low <= lo && !firedList.includes('lower')) {
        hits.push({ tag: 'lower', label: 'dải dưới', level: lo });
      }

      if (hits.length > 0) {
        const d1Bars = await loadOhlcv(store, sym, '1D');
        const h1Bars = await loadOhlcv(store, sym, '1H');
        const h4Bars = resample4H(h1Bars);

        const r1D = calculateRsi(d1Bars.map((b) => b.close), 14);
        const r1H = calculateRsi(h1Bars.map((b) => b.close), 14);
        const r4H = h4Bars.length > 14 ? calculateRsi(h4Bars.map((b) => b.close), 14) : [];

        const lastD = r1D[r1D.length - 1];
        const last1H = r1H[r1H.length - 1];
        const last4H = r4H.length > 0 ? r4H[r4H.length - 1] : null;

        for (const hit of hits) {
          alerts.push({
            channel: 'bank',
            symbol: sym,
            kind: `bb_month_${hit.tag}`,
            title: `chạm ${hit.label} Bollinger tháng`,
            lines: [
              `BB(${period},${numStd}) tháng = ${hit.level.toFixed(2)} | giá ${lastBar.close.toFixed(2)} — nến tháng chưa đóng`,
              rsiContextLine(lastD, last4H, last1H),
            ],
          });
          newFiredList.push(hit.tag);
        }

        if (!dryRun) {
          store.set(stateKey, newFiredList);
        }
      }
    } catch (err) {
      console.error(`Error scanning Bollinger for ${sym}:`, err);
    }
  }

  return alerts;
}

/**
 * Strategy 2B: Bank Daily MA50 Crossovers
 */
export async function scanBankMa50Strategy(
  store: BotStore,
  banks: string[],
  options: { maPeriod?: number; dryRun?: boolean } = {}
): Promise<Alert[]> {
  const period = options.maPeriod ?? 50;
  const dryRun = options.dryRun ?? false;

  const alerts: Alert[] = [];

  for (const sym of banks) {
    try {
      const d1Bars = await loadOhlcv(store, sym, '1D');
      if (d1Bars.length < period + 2) continue;

      const closeDaily = d1Bars.map((b) => b.close);
      const maSeries = calculateSma(closeDaily, period);

      const maCur = maSeries[maSeries.length - 1];
      const maPrev = maSeries[maSeries.length - 2];
      const closeCur = closeDaily[closeDaily.length - 1];
      const closePrev = closeDaily[closeDaily.length - 2];

      if (maCur === null || maPrev === null) continue;

      const prevSide = closePrev > maPrev ? 'above' : 'below';
      const curSide = closeCur > maCur ? 'above' : 'below';

      const stateKey = `ma50:${sym}`;
      const state = store.get(stateKey);

      // First run: just initialize position
      if (!state) {
        if (!dryRun) {
          store.set(stateKey, { side: curSide });
        }
        continue;
      }

      if (curSide !== prevSide && curSide !== state.side) {
        const direction = curSide === 'above' ? 'cắt LÊN' : 'cắt XUỐNG';
        const lastDate = new Date(d1Bars[d1Bars.length - 1].time).toLocaleDateString('vi-VN');

        alerts.push({
          channel: 'bank',
          symbol: sym,
          kind: `ma50_${curSide}`,
          title: `giá đóng cửa ${direction} MA${period} ngày`,
          lines: [
            `Đóng cửa ${closeCur.toFixed(2)} | MA${period} = ${maCur.toFixed(2)} (${lastDate})`,
          ],
        });
      }

      if (!dryRun && curSide !== state.side) {
        store.set(stateKey, { side: curSide });
      }
    } catch (err) {
      console.error(`Error scanning MA50 for ${sym}:`, err);
    }
  }

  return alerts;
}

/**
 * Get aggregated Bank technical status for the UI dashboard
 */
export async function getBankTechnicalsOverview(
  store: BotStore,
  banks: string[],
  bbPeriod: number = 20,
  bbStd: number = 2.0,
  maPeriod: number = 50
): Promise<BankTechnicalStatus[]> {
  const result: BankTechnicalStatus[] = [];

  for (const sym of banks) {
    try {
      const [d1Bars, m1Bars, h1Bars] = await Promise.all([
        loadOhlcv(store, sym, '1D'),
        loadOhlcv(store, sym, '1M'),
        loadOhlcv(store, sym, '1H'),
      ]);

      const h4Bars = resample4H(h1Bars);
      const close1D = d1Bars.map((b) => b.close);
      const closeMonthly = m1Bars.map((b) => b.close);

      const r1D = calculateRsi(close1D, 14);
      const r1H = calculateRsi(h1Bars.map((b) => b.close), 14);
      const r4H = h4Bars.length > 14 ? calculateRsi(h4Bars.map((b) => b.close), 14) : [];

      const currentClose = close1D[close1D.length - 1] || 0;
      const prevClose = close1D.length > 1 ? close1D[close1D.length - 2] : currentClose;
      const changePercent = Number((((currentClose - prevClose) / prevClose) * 100).toFixed(2));

      // Bollinger
      let monthUpper: number | null = null;
      let monthLower: number | null = null;
      let monthMid: number | null = null;
      let bbStatus: BankTechnicalStatus['monthBBStatus'] = 'normal';

      if (closeMonthly.length >= bbPeriod) {
        const { upper, lower, middle } = calculateBollinger(closeMonthly, bbPeriod, bbStd);
        monthUpper = upper[upper.length - 1];
        monthLower = lower[lower.length - 1];
        monthMid = middle[middle.length - 1];

        if (monthUpper && monthLower) {
          const lastM = m1Bars[m1Bars.length - 1];
          if (lastM.high >= monthUpper) bbStatus = 'hit_upper';
          else if (lastM.low <= monthLower) bbStatus = 'hit_lower';
          else if (currentClose >= monthUpper * 0.98) bbStatus = 'near_upper';
          else if (currentClose <= monthLower * 1.02) bbStatus = 'near_lower';
        }
      }

      // MA50
      let ma50Val: number | null = null;
      let ma50Dist: number | null = null;
      let maSide: BankTechnicalStatus['ma50Side'] = 'above';

      if (closeDaily.length >= maPeriod) {
        const maSeries = calculateSma(close1D, maPeriod);
        ma50Val = maSeries[maSeries.length - 1];
        if (ma50Val !== null) {
          ma50Dist = Number((((currentClose - ma50Val) / ma50Val) * 100).toFixed(2));
          maSide = currentClose >= ma50Val ? 'above' : 'below';
        }
      }

      result.push({
        symbol: sym,
        close: currentClose,
        changePercent,
        monthUpperBB: monthUpper ? Number(monthUpper.toFixed(2)) : null,
        monthLowerBB: monthLower ? Number(monthLower.toFixed(2)) : null,
        monthMidBB: monthMid ? Number(monthMid.toFixed(2)) : null,
        monthBBStatus: bbStatus,
        dailyMA50: ma50Val ? Number(ma50Val.toFixed(2)) : null,
        dailyMA50DistancePct: ma50Dist,
        ma50Side: maSide,
        rsi1D: r1D[r1D.length - 1] ? Number(r1D[r1D.length - 1]!.toFixed(1)) : null,
        rsi4H: r4H.length > 0 && r4H[r4H.length - 1] ? Number(r4H[r4H.length - 1]!.toFixed(1)) : null,
        rsi1H: r1H[r1H.length - 1] ? Number(r1H[r1H.length - 1]!.toFixed(1)) : null,
        lastUpdated: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`Error calculating Bank Technicals for ${sym}:`, err);
    }
  }

  return result;
}
