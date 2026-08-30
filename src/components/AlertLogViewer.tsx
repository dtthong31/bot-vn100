import React, { useState } from 'react';
import {
  Bell,
  Check,
  Copy,
  Flame,
  Layers,
  ShieldAlert,
  Trash2,
  Zap,
} from 'lucide-react';
import { AlertLogItem } from '../types';

interface AlertLogViewerProps {
  alerts: AlertLogItem[];
  onClearLogs: () => void;
}

export const AlertLogViewer: React.FC<AlertLogViewerProps> = ({
  alerts,
  onClearLogs,
}) => {
  const [filter, setFilter] = useState<'all' | 'rsi' | 'bank'>('all');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const filteredAlerts = alerts.filter((a) => {
    if (filter === 'all') return true;
    return a.channel === filter;
  });

  const handleCopy = (alert: AlertLogItem) => {
    const text = `[${alert.channel.toUpperCase()}] ${alert.symbol} — ${alert.title}\n${alert.lines.join('\n')}`;
    navigator.clipboard.writeText(text);
    setCopiedId(alert.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getKindIcon = (kind: string) => {
    if (kind.includes('oversold')) return <Flame className="w-4 h-4 text-rose-400" />;
    if (kind.includes('bounce')) return <Zap className="w-4 h-4 text-emerald-400" />;
    if (kind.includes('bb')) return <ShieldAlert className="w-4 h-4 text-amber-400" />;
    return <Layers className="w-4 h-4 text-sky-400" />;
  };

  return (
    <div id="alert-log-container" className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <Bell className="w-4 h-4 text-blue-400" />
          <h2 className="text-base font-bold text-white">Nhật Ký Tín Hiệu (Alert Log)</h2>
          <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
            {filteredAlerts.length} tín hiệu
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-xs">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                filter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setFilter('rsi')}
              className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                filter === 'rsi' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              RSI
            </button>
            <button
              onClick={() => setFilter('bank')}
              className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                filter === 'bank' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ngân hàng
            </button>
          </div>

          <button
            onClick={onClearLogs}
            className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition cursor-pointer"
            title="Xóa nhật ký"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Alert Feed */}
      <div className="p-4 space-y-3 overflow-y-auto max-h-[480px] flex-1">
        {filteredAlerts.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            Chưa có cảnh báo nào được kích hoạt. Hãy bấm "Quét Tất Cả" để chạy kiểm tra.
          </div>
        ) : (
          filteredAlerts.map((item) => {
            const timeStr = new Date(item.ts).toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            return (
              <div
                key={item.id}
                className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-lg hover:border-slate-700 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start space-x-2.5">
                    <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 mt-0.5">
                      {getKindIcon(item.kind)}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-white text-sm">{item.symbol}</span>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.2 rounded uppercase ${
                            item.channel === 'rsi'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}
                        >
                          {item.channel}
                        </span>
                        <span className="text-xs text-slate-300 font-medium">{item.title}</span>
                      </div>

                      <div className="mt-1.5 space-y-0.5">
                        {item.lines.map((line, idx) => (
                          <p key={idx} className="text-xs text-slate-400 font-mono">
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end space-y-1">
                    <span className="text-[11px] font-mono text-slate-500">{timeStr}</span>
                    <button
                      onClick={() => handleCopy(item)}
                      className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition cursor-pointer"
                      title="Copy nội dung tin nhắn"
                    >
                      {copiedId === item.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
