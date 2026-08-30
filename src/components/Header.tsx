import React from 'react';
import {
  Activity,
  Bell,
  Clock,
  Play,
  RotateCw,
  Send,
  Settings,
  ShieldAlert,
} from 'lucide-react';
import { BotConfigState } from '../types';

interface HeaderProps {
  config: BotConfigState | null;
  scanning: boolean;
  onScan: (type: 'rsi' | 'bank' | 'all') => void;
  onTestTelegram: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  config,
  scanning,
  onScan,
  onTestTelegram,
  onOpenSettings,
}) => {
  const isMarketOpen = config?.isMarketOpen ?? false;

  return (
    <header id="app-header" className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Market Status */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                VN100 Alert Bot
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  RSI & Bank Tech
                </span>
              </h1>
            </div>
            <div className="flex items-center space-x-3 text-xs text-slate-400 mt-0.5">
              <span className="flex items-center gap-1">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isMarketOpen ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                  }`}
                />
                {isMarketOpen ? (
                  <span className="text-emerald-400 font-medium">HOSE Đang mở</span>
                ) : (
                  <span>HOSE Đóng cửa</span>
                )}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 font-mono text-[11px]">
                <Clock className="w-3 h-3 text-slate-500" />
                09:00-11:30 & 13:00-15:00 ICT
              </span>
              <span>•</span>
              <span className="capitalize px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-medium">
                {config?.notifier || 'Console'} Mode
              </span>
            </div>
          </div>
        </div>

        {/* Scan Actions & Tools */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            id="btn-scan-rsi"
            onClick={() => onScan('rsi')}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition disabled:opacity-50 cursor-pointer"
            title="Quét RSI 4H/1H cho toàn bộ 100 mã VN100"
          >
            {scanning ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-blue-400" />}
            Quét RSI
          </button>

          <button
            id="btn-scan-bank"
            onClick={() => onScan('bank')}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition disabled:opacity-50 cursor-pointer"
            title="Quét Bollinger Bands tháng và MA50 ngày nhóm ngân hàng"
          >
            {scanning ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />}
            Quét Ngân Hàng
          </button>

          <button
            id="btn-scan-all"
            onClick={() => onScan('all')}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-500/20 transition disabled:opacity-50 cursor-pointer"
          >
            {scanning ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
            Quét Tất Cả
          </button>

          <button
            id="btn-test-telegram"
            onClick={onTestTelegram}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 transition cursor-pointer"
            title="Bắn tin thử nghiệm vào Telegram / Slack"
          >
            <Send className="w-3.5 h-3.5 text-sky-400" />
            Test Gửi Tin
          </button>

          <button
            id="btn-settings"
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition cursor-pointer"
            title="Cài đặt tham số bot"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
