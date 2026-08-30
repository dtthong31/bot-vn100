import React, { useEffect, useState } from 'react';
import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Flame, Layers, ShieldAlert, X } from 'lucide-react';
import { STOCK_NAMES } from '../bot/marketData';

interface ChartModalProps {
  symbol: string | null;
  onClose: () => void;
}

export const ChartModal: React.FC<ChartModalProps> = ({ symbol, onClose }) => {
  const [interval, setInterval] = useState<'1D' | '1H' | '1M'>('1D');
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    fetch(`/api/chart/${symbol}?interval=${interval}`)
      .then((res) => res.json())
      .then((res) => {
        setChartData(res.data || []);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [symbol, interval]);

  if (!symbol) return null;

  const stockName = STOCK_NAMES[symbol] || symbol;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div
        id="chart-modal-content"
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold font-mono text-base">
              {symbol.slice(0, 3)}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold text-white font-mono">{symbol}</h3>
                <span className="text-xs text-slate-400 font-sans">• {stockName}</span>
              </div>
              <p className="text-xs text-slate-500">
                Biểu đồ kỹ thuật: Bollinger Bands (20,2), MA50 & RSI(14) Wilder's RMA
              </p>
            </div>
          </div>

          {/* Timeframe selector & Close */}
          <div className="flex items-center space-x-3">
            <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-xs">
              {(['1H', '1D', '1M'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setInterval(tf)}
                  className={`px-3 py-1 rounded-md font-mono font-medium transition cursor-pointer ${
                    interval === tf ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="h-80 flex items-center justify-center text-slate-500 text-sm">
              Đang tải dữ liệu biểu đồ {symbol}...
            </div>
          ) : (
            <>
              {/* Main Price & Indicators Chart */}
              <div>
                <div className="flex items-center justify-between mb-2 text-xs text-slate-400">
                  <span className="font-semibold text-slate-300">Biểu đồ Giá & Bollinger Bands / MA50</span>
                  <div className="flex items-center space-x-3 font-mono text-[11px]">
                    <span className="text-blue-400">● Giá Đóng</span>
                    <span className="text-amber-400">● MA50</span>
                    <span className="text-rose-400">● BB Trên</span>
                    <span className="text-emerald-400">● BB Dưới</span>
                  </div>
                </div>

                <div className="h-64 bg-slate-950/60 rounded-xl p-2 border border-slate-800/60">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} />
                      <YAxis
                        stroke="#475569"
                        fontSize={10}
                        domain={['auto', 'auto']}
                        tickLine={false}
                        orientation="right"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          fontSize: '11px',
                        }}
                      />
                      {/* Bollinger Band Upper & Lower Area */}
                      <Line
                        type="monotone"
                        dataKey="bbUpper"
                        stroke="#f43f5e"
                        strokeDasharray="3 3"
                        dot={false}
                        name="BB Upper"
                      />
                      <Line
                        type="monotone"
                        dataKey="bbLower"
                        stroke="#10b981"
                        strokeDasharray="3 3"
                        dot={false}
                        name="BB Lower"
                      />
                      <Line
                        type="monotone"
                        dataKey="ma50"
                        stroke="#f59e0b"
                        strokeWidth={1.5}
                        dot={false}
                        name="MA50"
                      />
                      <Line
                        type="monotone"
                        dataKey="close"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                        name="Giá"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* RSI Oscillator Panel */}
              <div>
                <div className="flex items-center justify-between mb-2 text-xs text-slate-400">
                  <span className="font-semibold text-slate-300">
                    RSI(14) Oscillator ({interval})
                  </span>
                  <div className="flex items-center space-x-3 font-mono text-[11px]">
                    <span className="text-rose-400">-- Ngưỡng Quá bán (30)</span>
                    <span className="text-sky-400">-- Ngưỡng Quá mua (70)</span>
                  </div>
                </div>

                <div className="h-36 bg-slate-950/60 rounded-xl p-2 border border-slate-800/60">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} />
                      <YAxis
                        stroke="#475569"
                        fontSize={10}
                        domain={[0, 100]}
                        ticks={[30, 50, 70]}
                        tickLine={false}
                        orientation="right"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          fontSize: '11px',
                        }}
                      />
                      <ReferenceLine y={30} stroke="#f43f5e" strokeDasharray="3 3" />
                      <ReferenceLine y={70} stroke="#38bdf8" strokeDasharray="3 3" />
                      <ReferenceLine y={50} stroke="#64748b" strokeDasharray="2 2" />
                      <Line
                        type="monotone"
                        dataKey="rsi"
                        stroke="#a855f7"
                        strokeWidth={2}
                        dot={false}
                        name="RSI(14)"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
