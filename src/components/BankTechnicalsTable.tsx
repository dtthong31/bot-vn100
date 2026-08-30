import React from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
} from 'lucide-react';
import { BankTechnicalStatus } from '../types';
import { STOCK_NAMES } from '../bot/marketData';

interface BankTechnicalsTableProps {
  data: BankTechnicalStatus[];
  onSelectStock: (symbol: string) => void;
}

export const BankTechnicalsTable: React.FC<BankTechnicalsTableProps> = ({
  data,
  onSelectStock,
}) => {
  return (
    <div id="bank-technicals-container" className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      {/* Table Header */}
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            Luồng 2: Kỹ Thuật 18 Mã Ngân Hàng VN100 (BB Tháng + MA50 Ngày)
          </h2>
          <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
            18 Ngân Hàng
          </span>
        </div>
        <div className="text-xs text-slate-400">
          Bollinger(20,2) nến <strong className="text-slate-200">Tháng</strong> • MA50 nến <strong className="text-slate-200">Ngày</strong>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[500px]">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-950/80 sticky top-0 z-10 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-3.5">Mã Ngân Hàng</th>
              <th className="py-2.5 px-3">Giá Hiện Tại</th>
              <th className="py-2.5 px-3 text-center">BB Tháng (Dưới / Giữa / Trên)</th>
              <th className="py-2.5 px-3">Tín hiệu BB Tháng</th>
              <th className="py-2.5 px-3 text-center">MA50 Ngày</th>
              <th className="py-2.5 px-3 text-center">Độ lệch MA50</th>
              <th className="py-2.5 px-3 text-right">Biểu đồ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {data.map((item) => {
              const isHitUpper = item.monthBBStatus === 'hit_upper';
              const isHitLower = item.monthBBStatus === 'hit_lower';
              const isAboveMa50 = item.ma50Side === 'above' || item.ma50Side === 'crossover_up';

              return (
                <tr
                  key={item.symbol}
                  className={`hover:bg-slate-800/40 transition ${
                    isHitUpper || isHitLower ? 'bg-amber-950/20' : ''
                  }`}
                >
                  {/* Symbol */}
                  <td className="py-2.5 px-3.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white font-mono text-sm tracking-wide">
                        {item.symbol}
                      </span>
                      <span className="text-[11px] text-slate-400 truncate max-w-[130px]">
                        {STOCK_NAMES[item.symbol] || item.symbol}
                      </span>
                    </div>
                  </td>

                  {/* Close Price */}
                  <td className="py-2.5 px-3 font-mono font-medium text-slate-200">
                    {(item.close * 1000).toLocaleString('vi-VN')}
                    {item.changePercent !== undefined && (
                      <span
                        className={`ml-1.5 text-[10px] ${
                          item.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {item.changePercent >= 0 ? `+${item.changePercent}%` : `${item.changePercent}%`}
                      </span>
                    )}
                  </td>

                  {/* BB Levels */}
                  <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-400">
                    <span className="text-emerald-400">{item.monthLowerBB?.toFixed(1) || '-'}</span>
                    <span className="mx-1 text-slate-600">/</span>
                    <span className="text-slate-300">{item.monthMidBB?.toFixed(1) || '-'}</span>
                    <span className="mx-1 text-slate-600">/</span>
                    <span className="text-rose-400">{item.monthUpperBB?.toFixed(1) || '-'}</span>
                  </td>

                  {/* BB Status */}
                  <td className="py-2.5 px-3">
                    {isHitUpper ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        <AlertTriangle className="w-3 h-3" />
                        Chạm dải trên BB
                      </span>
                    ) : isHitLower ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <AlertTriangle className="w-3 h-3" />
                        Chạm dải dưới BB
                      </span>
                    ) : item.monthBBStatus === 'near_upper' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-300">
                        Tiến sát dải trên
                      </span>
                    ) : item.monthBBStatus === 'near_lower' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-300">
                        Tiến sát dải dưới
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500">Trong dải</span>
                    )}
                  </td>

                  {/* MA50 Value */}
                  <td className="py-2.5 px-3 text-center font-mono font-medium text-slate-300">
                    {item.dailyMA50 !== null ? (item.dailyMA50 * 1000).toLocaleString('vi-VN') : '-'}
                  </td>

                  {/* Distance % */}
                  <td className="py-2.5 px-3 text-center font-mono">
                    {item.dailyMA50DistancePct !== null ? (
                      <span
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-semibold ${
                          isAboveMa50
                            ? 'text-emerald-400 bg-emerald-500/10'
                            : 'text-rose-400 bg-rose-500/10'
                        }`}
                      >
                        {isAboveMa50 ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {item.dailyMA50DistancePct > 0
                          ? `+${item.dailyMA50DistancePct}%`
                          : `${item.dailyMA50DistancePct}%`}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => onSelectStock(item.symbol)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition text-[11px] cursor-pointer"
                    >
                      <BarChart2 className="w-3 h-3 text-amber-400" />
                      Biểu đồ
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
