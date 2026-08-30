import React, { useState, useMemo } from 'react';
import {
  ArrowUpDown,
  BarChart2,
  Check,
  Clock,
  Flame,
  Search,
  Zap,
} from 'lucide-react';
import { StockRsiStatus } from '../types';

interface RsiScannerTableProps {
  data: StockRsiStatus[];
  onSelectStock: (symbol: string) => void;
}

export const RsiScannerTable: React.FC<RsiScannerTableProps> = ({
  data,
  onSelectStock,
}) => {
  const [filter, setFilter] = useState<'all' | 'oversold' | 'awaiting' | 'overbought'>('all');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<'symbol' | 'rsi4H' | 'rsi1H' | 'close'>('rsi4H');
  const [sortAsc, setSortAsc] = useState(true);

  const filteredData = useMemo(() => {
    return data
      .filter((item) => {
        if (search) {
          const matchSym = item.symbol.toLowerCase().includes(search.toLowerCase());
          const matchName = (item.name || '').toLowerCase().includes(search.toLowerCase());
          if (!matchSym && !matchName) return false;
        }

        if (filter === 'oversold') {
          return item.rsi4H !== null && item.rsi4H < 30;
        }
        if (filter === 'awaiting') {
          return item.awaitingSince !== null || item.status === 'bounce_fired';
        }
        if (filter === 'overbought') {
          return item.rsi4H !== null && item.rsi4H > 70;
        }
        return true;
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (valA === null || valA === undefined) valA = sortAsc ? 999 : -999;
        if (valB === null || valB === undefined) valB = sortAsc ? 999 : -999;
        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });
  }, [data, filter, search, sortField, sortAsc]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const getRsiBadgeColor = (val: number | null) => {
    if (val === null) return 'text-slate-500 bg-slate-800/40';
    if (val <= 30) return 'text-rose-400 font-bold bg-rose-500/10 border border-rose-500/20';
    if (val <= 40) return 'text-amber-300 font-semibold bg-amber-500/10';
    if (val >= 70) return 'text-sky-400 font-bold bg-sky-500/10 border border-sky-500/20';
    return 'text-slate-300 bg-slate-800/60';
  };

  return (
    <div id="rsi-scanner-container" className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      {/* Table Control Header */}
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            Luồng 1: Bảng Quét RSI VN100 (1D / 4H / 1H)
          </h2>
          <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
            {filteredData.length} / {data.length} mã
          </span>
        </div>

        {/* Filter Pills & Search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Tìm mã cổ phiếu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 w-36 sm:w-44 font-mono"
            />
          </div>

          <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                filter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setFilter('oversold')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
                filter === 'oversold' ? 'bg-rose-600 text-white' : 'text-rose-400 hover:text-rose-300'
              }`}
            >
              <Flame className="w-3 h-3" />
              Quá bán (&lt;30)
            </button>
            <button
              onClick={() => setFilter('awaiting')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
                filter === 'awaiting' ? 'bg-emerald-600 text-white' : 'text-emerald-400 hover:text-emerald-300'
              }`}
            >
              <Zap className="w-3 h-3" />
              Chờ hồi 1H
            </button>
            <button
              onClick={() => setFilter('overbought')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                filter === 'overbought' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Quá mua (&gt;70)
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[500px]">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-950/80 sticky top-0 z-10 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
            <tr>
              <th
                className="py-2.5 px-3.5 cursor-pointer hover:text-white"
                onClick={() => handleSort('symbol')}
              >
                <div className="flex items-center gap-1">
                  Mã CP <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th
                className="py-2.5 px-3 cursor-pointer hover:text-white"
                onClick={() => handleSort('close')}
              >
                <div className="flex items-center gap-1">
                  Giá (VND) <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th className="py-2.5 px-3 text-center">RSI Ngày (1D)</th>
              <th
                className="py-2.5 px-3 text-center cursor-pointer hover:text-white"
                onClick={() => handleSort('rsi4H')}
              >
                <div className="flex items-center justify-center gap-1">
                  RSI 4H <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th
                className="py-2.5 px-3 text-center cursor-pointer hover:text-white"
                onClick={() => handleSort('rsi1H')}
              >
                <div className="flex items-center justify-center gap-1">
                  RSI 1H <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th className="py-2.5 px-3">Trạng thái Logic</th>
              <th className="py-2.5 px-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  Không tìm thấy mã nào phù hợp với bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              filteredData.map((item) => {
                const is4HOversold = item.rsi4H !== null && item.rsi4H < 30;
                const isBounceAwaiting = item.awaitingSince !== null;
                const isBounceFired = item.status === 'bounce_fired';

                return (
                  <tr
                    key={item.symbol}
                    className={`hover:bg-slate-800/40 transition ${
                      is4HOversold ? 'bg-rose-950/20' : isBounceAwaiting ? 'bg-emerald-950/20' : ''
                    }`}
                  >
                    {/* Symbol */}
                    <td className="py-2.5 px-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white font-mono text-sm tracking-wide">
                          {item.symbol}
                        </span>
                        <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
                          {item.name}
                        </span>
                      </div>
                    </td>

                    {/* Price */}
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

                    {/* 1D RSI */}
                    <td className="py-2.5 px-3 text-center font-mono">
                      <span className={`px-2 py-0.5 rounded text-xs ${getRsiBadgeColor(item.rsi1D)}`}>
                        {item.rsi1D !== null ? item.rsi1D.toFixed(1) : '-'}
                      </span>
                    </td>

                    {/* 4H RSI */}
                    <td className="py-2.5 px-3 text-center font-mono">
                      <span className={`px-2 py-0.5 rounded text-xs ${getRsiBadgeColor(item.rsi4H)}`}>
                        {item.rsi4H !== null ? item.rsi4H.toFixed(1) : '-'}
                      </span>
                    </td>

                    {/* 1H RSI */}
                    <td className="py-2.5 px-3 text-center font-mono">
                      <span className={`px-2 py-0.5 rounded text-xs ${getRsiBadgeColor(item.rsi1H)}`}>
                        {item.rsi1H !== null ? item.rsi1H.toFixed(1) : '-'}
                      </span>
                    </td>

                    {/* State / Status */}
                    <td className="py-2.5 px-3">
                      {is4HOversold ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          <Flame className="w-3 h-3" />
                          Quá bán 4H
                        </span>
                      ) : isBounceFired ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <Zap className="w-3 h-3" />
                          Hồi 1H đã kích hoạt
                        </span>
                      ) : isBounceAwaiting ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          <Clock className="w-3 h-3" />
                          Chờ hồi 1H (Đã nạp)
                        </span>
                      ) : item.armed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-300">
                          <Check className="w-3 h-3 text-emerald-400" />
                          Armed (RSI 4H &gt;= 30)
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">Bình thường</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => onSelectStock(item.symbol)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition text-[11px] cursor-pointer"
                        title="Xem biểu đồ kỹ thuật"
                      >
                        <BarChart2 className="w-3 h-3 text-blue-400" />
                        Biểu đồ
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
