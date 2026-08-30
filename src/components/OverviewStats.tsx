import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Flame,
  Layers,
  Zap,
} from 'lucide-react';
import { BankTechnicalStatus, BotConfigState, StockRsiStatus } from '../types';

interface OverviewStatsProps {
  rsiList: StockRsiStatus[];
  bankList: BankTechnicalStatus[];
  config: BotConfigState | null;
}

export const OverviewStats: React.FC<OverviewStatsProps> = ({
  rsiList,
  bankList,
  config,
}) => {
  const oversoldCount = rsiList.filter((s) => s.rsi4H !== null && s.rsi4H < 30).length;
  const bounceAwaitingCount = rsiList.filter((s) => s.awaitingSince !== null).length;
  const bounceFiredCount = rsiList.filter((s) => s.status === 'bounce_fired').length;

  const bankBbHitCount = bankList.filter(
    (b) => b.monthBBStatus === 'hit_upper' || b.monthBBStatus === 'hit_lower'
  ).length;

  const bankMa50AboveCount = bankList.filter((b) => b.ma50Side === 'above').length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
      {/* 1. RSI 4H Oversold */}
      <div
        id="stat-card-oversold"
        className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            RSI 4H Quá Bán (&lt; 30)
          </span>
          <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
            <Flame className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-2xl font-extrabold text-white font-mono">{oversoldCount}</span>
          <span className="text-xs text-rose-400 font-medium">/ {rsiList.length} VN100</span>
        </div>
        <div className="mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
          Chờ tín hiệu hồi 1H: <strong className="text-slate-200">{bounceAwaitingCount} mã</strong>
        </div>
      </div>

      {/* 2. RSI 1H Bounce Signal */}
      <div
        id="stat-card-bounce"
        className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Tín Hiệu Hồi Ngắn Hạn
          </span>
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Zap className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-2xl font-extrabold text-emerald-400 font-mono">
            {bounceFiredCount > 0 ? bounceFiredCount : bounceAwaitingCount}
          </span>
          <span className="text-xs text-emerald-400/80 font-medium">RSI 1H cắt lên 30</span>
        </div>
        <div className="mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
          Thời hạn chờ: <strong className="text-slate-200">{config?.bounceExpiryDays || 5} ngày</strong>
        </div>
      </div>

      {/* 3. Bank Monthly Bollinger Bands */}
      <div
        id="stat-card-bb"
        className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Chạm BB Tháng Ngân Hàng
          </span>
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-2xl font-extrabold text-amber-400 font-mono">{bankBbHitCount}</span>
          <span className="text-xs text-slate-400">/ 18 Ngân hàng</span>
        </div>
        <div className="mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
          Tham số: <strong className="text-slate-200">BB({config?.bbPeriod || 20}, {config?.bbStd || 2}) Tháng</strong>
        </div>
      </div>

      {/* 4. Bank Daily MA50 */}
      <div
        id="stat-card-ma50"
        className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Vị Thế MA50 Ngày
          </span>
          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400">
            <Layers className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-2xl font-extrabold text-sky-400 font-mono">
            {bankMa50AboveCount}
            <span className="text-sm font-normal text-slate-400 font-sans ml-1">trên MA50</span>
          </span>
          <span className="text-xs text-rose-400 font-medium font-mono">
            {bankList.length - bankMa50AboveCount} dưới
          </span>
        </div>
        <div className="mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
          Chỉ tính giá đóng cửa, lọc râu nến
        </div>
      </div>
    </div>
  );
};
