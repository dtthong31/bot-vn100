import { BankTechnicalStatus, BotConfigState, OHLCV, StockRsiStatus } from '../types';
import { calculateBollinger, calculateRsi, calculateSma, isCrossedAbove } from './indicators';
import { BANK_SYMBOLS, generateRealisticOhlcv, STOCK_NAMES, VN100_SYMBOLS } from './marketData';
import { Alert, NotifierService } from './notifier';
import { BotStore } from './store';

export class StrategyRunner {
  private store: BotStore;
  private notifier: NotifierService;
  private config: BotConfigState;

  constructor(store: BotStore, notifier: NotifierService, config: BotConfigState) {
    this.store = store;
    this.notifier = notifier;
    this.config = config;
  }

  public updateConfig(cfg: Partial<BotConfigState>): void {
    this.config = { ...this.config, ...cfg };
    this.notifier.updateConfig(cfg as any);
  }

  public async scanRsi(symbols: string[] = VN100_SYMBOLS): Promise<{ statuses: StockRsiStatus[]; alerts: Alert[] }> {
    const statuses: StockRsiStatus[] = [];
    const alerts: Alert[] = [];

    for (const sym of symbols) {
      let d1Bars = this.store.getOhlcv(sym, '1D');
      if (d1Bars.length === 0) {
        d1Bars = generateRealisticOhlcv(sym, '1D', 100);
        this.store.setOhlcv(sym, '1D', d1Bars);
      }

      let h1Bars = this.store.getOhlcv(sym, '1H');
      if (h1Bars.length === 0) {
        h1Bars = generateRealisticOhlcv(sym, '1H', 150);
        this.store.setOhlcv(sym, '1H', h1Bars);
      }

      // Compute 1D RSI
      const d1Closes = d1Bars.map((b) => b.close);
      const d1RsiSeries = calculateRsi(d1Closes, this.config.rsiPeriod || 14);
      const rsi1D = d1RsiSeries.length ? d1RsiSeries[d1RsiSeries.length - 1] : null;

      // Resample 1H to 4H
      const h4Closes = this.resample4HCloses(h1Bars);
      const h4RsiSeries = calculateRsi(h4Closes, this.config.rsiPeriod || 14);
      const rsi4H = h4RsiSeries.length ? h4RsiSeries[h4RsiSeries.length - 1] : null;

      // 1H RSI
      const h1Closes = h1Bars.map((b) => b.close);
      const h1RsiSeries = calculateRsi(h1Closes, this.config.rsiPeriod || 14);
      const rsi1H = h1RsiSeries.length ? h1RsiSeries[h1RsiSeries.length - 1] : null;

      const lastClose = d1Closes[d1Closes.length - 1] || 0;
      const prevClose = d1Closes[d1Closes.length - 2] || lastClose;
      const changePercent = prevClose ? Math.round(((lastClose - prevClose) / prevClose) * 1000) / 10 : 0;

      // Logic state tracking for Armed & Bounce
      const stateKey = `rsi_state:${sym}`;
      const savedState = this.store.get(stateKey, {
        armed: false,
        awaitingSince: null as string | null,
        lastAlertFired: null as string | null,
      });

      let status: StockRsiStatus['status'] = 'normal';
      const oversoldThresh = this.config.rsiOversold || 30;

      if (rsi4H !== null && rsi4H < oversoldThresh) {
        status = 'oversold';
        savedState.armed = true;
        if (!savedState.awaitingSince) {
          savedState.awaitingSince = new Date().toISOString();
          alerts.push({
            channel: 'rsi',
            symbol: sym,
            kind: 'rsi_4h_oversold',
            title: `RSI 4H chạm ngưỡng Quá Bán (< ${oversoldThresh})`,
            lines: [
              `Giá hiện tại: ${(lastClose * 1000).toLocaleString('vi-VN')} VND (${changePercent >= 0 ? '+' : ''}${changePercent}%)`,
              `RSI 4H: ${rsi4H.toFixed(2)} (Ngưỡng ${oversoldThresh})`,
              `RSI 1H: ${rsi1H !== null ? rsi1H.toFixed(2) : '-'} | RSI 1D: ${rsi1D !== null ? rsi1D.toFixed(2) : '-'}`,
              `Trạng thái: Đã nạp (Armed), đang theo dõi tín hiệu bật tăng RSI 1H cắt lên 30`,
            ],
          });
        }
      } else if (savedState.armed && savedState.awaitingSince) {
        status = 'bounce_awaiting';
        // Check 1H Bounce condition: crossed above 30
        const crossedBounce = isCrossedAbove(h1RsiSeries, 30);
        if (crossedBounce) {
          status = 'bounce_fired';
          savedState.armed = false;
          savedState.awaitingSince = null;
          savedState.lastAlertFired = new Date().toISOString();

          alerts.push({
            channel: 'rsi',
            symbol: sym,
            kind: 'rsi_1h_bounce',
            title: `Tín hiệu HỒI PHỤC NGẮN HẠN: RSI 1H cắt lên 30`,
            lines: [
              `Giá khớp: ${(lastClose * 1000).toLocaleString('vi-VN')} VND`,
              `RSI 1H vừa đảo chiều vượt 30 (Hiện tại: ${rsi1H ? rsi1H.toFixed(2) : '-'})`,
              `RSI 4H: ${rsi4H ? rsi4H.toFixed(2) : '-'}`,
              `Gợi ý: Theo dõi lực cầu giải ngân theo khung giờ`,
            ],
          });
        }
      } else if (rsi4H !== null && rsi4H > 70) {
        status = 'overbought';
      }

      this.store.set(stateKey, savedState);

      statuses.push({
        symbol: sym,
        name: STOCK_NAMES[sym] || sym,
        close: lastClose,
        changePercent,
        rsi1D: rsi1D !== null ? Math.round(rsi1D * 10) / 10 : null,
        rsi4H: rsi4H !== null ? Math.round(rsi4H * 10) / 10 : null,
        rsi1H: rsi1H !== null ? Math.round(rsi1H * 10) / 10 : null,
        status,
        armed: savedState.armed,
        awaitingSince: savedState.awaitingSince,
        lastUpdated: new Date().toISOString(),
      });
    }

    return { statuses, alerts };
  }

  public async scanBanks(): Promise<{ statuses: BankTechnicalStatus[]; alerts: Alert[] }> {
    const statuses: BankTechnicalStatus[] = [];
    const alerts: Alert[] = [];

    for (const sym of BANK_SYMBOLS) {
      let m1Bars = this.store.getOhlcv(sym, '1M');
      if (m1Bars.length === 0) {
        m1Bars = generateRealisticOhlcv(sym, '1M', 60);
        this.store.setOhlcv(sym, '1M', m1Bars);
      }

      let d1Bars = this.store.getOhlcv(sym, '1D');
      if (d1Bars.length === 0) {
        d1Bars = generateRealisticOhlcv(sym, '1D', 100);
        this.store.setOhlcv(sym, '1D', d1Bars);
      }

      const m1Closes = m1Bars.map((b) => b.close);
      const bb = calculateBollinger(m1Closes, this.config.bbPeriod || 20, this.config.bbStd || 2.0);
      const upperBB = bb.upper[bb.upper.length - 1];
      const lowerBB = bb.lower[bb.lower.length - 1];
      const midBB = bb.middle[bb.middle.length - 1];

      const d1Closes = d1Bars.map((b) => b.close);
      const ma50Series = calculateSma(d1Closes, this.config.maPeriod || 50);
      const currentMA50 = ma50Series[ma50Series.length - 1];
      const prevMA50 = ma50Series[ma50Series.length - 2];

      const lastClose = d1Closes[d1Closes.length - 1] || 0;
      const prevClose = d1Closes[d1Closes.length - 2] || lastClose;
      const changePercent = prevClose ? Math.round(((lastClose - prevClose) / prevClose) * 1000) / 10 : 0;

      let monthBBStatus: BankTechnicalStatus['monthBBStatus'] = 'normal';
      if (upperBB !== null && lastClose >= upperBB * 0.995) {
        monthBBStatus = lastClose >= upperBB ? 'hit_upper' : 'near_upper';
      } else if (lowerBB !== null && lastClose <= lowerBB * 1.005) {
        monthBBStatus = lastClose <= lowerBB ? 'hit_lower' : 'near_lower';
      }

      let distPct: number | null = null;
      let ma50Side: BankTechnicalStatus['ma50Side'] = 'below';
      if (currentMA50 !== null) {
        distPct = Math.round(((lastClose - currentMA50) / currentMA50) * 1000) / 10;
        ma50Side = lastClose >= currentMA50 ? 'above' : 'below';

        // Check Crossover
        if (prevClose < (prevMA50 || 0) && lastClose >= currentMA50) {
          ma50Side = 'crossover_up';
        } else if (prevClose > (prevMA50 || 0) && lastClose <= currentMA50) {
          ma50Side = 'crossover_down';
        }
      }

      // Check alerts
      if (monthBBStatus === 'hit_upper') {
        alerts.push({
          channel: 'bank',
          symbol: sym,
          kind: 'bank_bb_month_upper',
          title: `Chạm Dải Trên Bollinger Bands Tháng (BB 20,2)`,
          lines: [
            `Giá hiện tại: ${(lastClose * 1000).toLocaleString('vi-VN')} VND`,
            `Dải BB Tháng: Dưới ${lowerBB?.toFixed(1)} / Giữa ${midBB?.toFixed(1)} / Trên ${upperBB?.toFixed(1)}`,
            `Khuyến nghị: Chú ý áp lực chốt lời vùng kháng cự dài hạn`,
          ],
        });
      } else if (monthBBStatus === 'hit_lower') {
        alerts.push({
          channel: 'bank',
          symbol: sym,
          kind: 'bank_bb_month_lower',
          title: `Chạm Dải Dưới Bollinger Bands Tháng (Vùng Hỗ Trợ Mạnh)`,
          lines: [
            `Giá hiện tại: ${(lastClose * 1000).toLocaleString('vi-VN')} VND`,
            `Dải BB Tháng: Dưới ${lowerBB?.toFixed(1)} / Giữa ${midBB?.toFixed(1)} / Trên ${upperBB?.toFixed(1)}`,
            `Khuyến nghị: Khả năng phản ứng kỹ thuật tạo đáy dài hạn`,
          ],
        });
      }

      if (ma50Side === 'crossover_up') {
        alerts.push({
          channel: 'bank',
          symbol: sym,
          kind: 'bank_ma50_crossover_up',
          title: `Giá đóng cửa CẮT LÊN đường MA50 Ngày`,
          lines: [
            `Giá hiện tại: ${(lastClose * 1000).toLocaleString('vi-VN')} VND`,
            `MA50 Ngày: ${(currentMA50! * 1000).toLocaleString('vi-VN')} VND (+${distPct}%)`,
            `Tín hiệu: Xác nhận lấy lại xu hướng trung hạn`,
          ],
        });
      }

      statuses.push({
        symbol: sym,
        close: lastClose,
        changePercent,
        monthUpperBB: upperBB !== null ? Math.round(upperBB * 10) / 10 : null,
        monthLowerBB: lowerBB !== null ? Math.round(lowerBB * 10) / 10 : null,
        monthMidBB: midBB !== null ? Math.round(midBB * 10) / 10 : null,
        monthBBStatus,
        dailyMA50: currentMA50 !== null ? Math.round(currentMA50 * 10) / 10 : null,
        dailyMA50DistancePct: distPct,
        ma50Side,
        rsi1D: null,
        rsi4H: null,
        rsi1H: null,
        lastUpdated: new Date().toISOString(),
      });
    }

    return { statuses, alerts };
  }

  private resample4HCloses(h1Bars: OHLCV[]): number[] {
    if (h1Bars.length === 0) return [];
    const closes: number[] = [];
    for (let i = 3; i < h1Bars.length; i += 4) {
      closes.push(h1Bars[i].close);
    }
    if (h1Bars.length % 4 !== 0) {
      closes.push(h1Bars[h1Bars.length - 1].close);
    }
    return closes;
  }
}
