import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Bell,
  CheckCircle2,
  Flame,
  Layers,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { Header } from './components/Header';
import { OverviewStats } from './components/OverviewStats';
import { RsiScannerTable } from './components/RsiScannerTable';
import { BankTechnicalsTable } from './components/BankTechnicalsTable';
import { AlertLogViewer } from './components/AlertLogViewer';
import { ChartModal } from './components/ChartModal';
import { SettingsModal } from './components/SettingsModal';
import { AlertLogItem, BankTechnicalStatus, BotConfigState, StockRsiStatus } from './types';

export const App: React.FC = () => {
  const [config, setConfig] = useState<BotConfigState | null>(null);
  const [rsiData, setRsiData] = useState<StockRsiStatus[]>([]);
  const [bankData, setBankData] = useState<BankTechnicalStatus[]>([]);
  const [alerts, setAlerts] = useState<AlertLogItem[]>([]);
  const [activeTab, setActiveTab] = useState<'rsi' | 'banks' | 'alerts'>('rsi');

  const [scanning, setScanning] = useState(false);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch initial data
  const fetchData = async () => {
    try {
      const [cfgRes, rsiRes, bankRes, alertsRes] = await Promise.all([
        fetch('/api/config').then((r) => r.json()),
        fetch('/api/universe/rsi').then((r) => r.json()),
        fetch('/api/universe/banks').then((r) => r.json()),
        fetch('/api/alerts').then((r) => r.json()),
      ]);

      setConfig(cfgRes);
      setRsiData(rsiRes);
      setBankData(bankRes);
      setAlerts(alertsRes);
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // 30s polling
    return () => clearInterval(interval);
  }, []);

  const handleScan = async (type: 'rsi' | 'bank' | 'all') => {
    setScanning(true);
    showToast(`Đang thực hiện quét ${type === 'rsi' ? 'RSI VN100' : type === 'bank' ? 'Nhóm Ngân hàng' : 'toàn bộ'}...`, 'info');

    try {
      const url = `/api/scan/${type}`;
      const res = await fetch(url, { method: 'POST' }).then((r) => r.json());

      await fetchData();

      const count = res.alertsGenerated?.length || 0;
      if (count > 0) {
        showToast(`Quét hoàn tất: Phát hiện ${count} tín hiệu cảnh báo mới!`, 'success');
      } else {
        showToast(`Quét hoàn tất: Không có tín hiệu mới vi phạm ngưỡng.`, 'success');
      }
    } catch (err) {
      console.error('Scan error:', err);
      showToast('Lỗi khi thực hiện quét dữ liệu.', 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleTestTelegram = async () => {
    try {
      showToast('Đang gửi tin nhắn thử nghiệm...', 'info');
      const res = await fetch('/api/test/telegram', { method: 'POST' }).then((r) => r.json());
      if (res.success) {
        showToast('Đã gửi tin nhắn test thành công tới kênh thông báo!', 'success');
        fetchData();
      }
    } catch (err) {
      showToast('Gửi tin nhắn test thất bại.', 'error');
    }
  };

  const handleClearLogs = async () => {
    try {
      await fetch('/api/alerts', { method: 'DELETE' });
      setAlerts([]);
      showToast('Đã xóa toàn bộ nhật ký cảnh báo.', 'info');
    } catch (err) {
      showToast('Không thể xóa nhật ký cảnh báo.', 'error');
    }
  };

  const handleSaveSettings = async (updates: Partial<BotConfigState>) => {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).then((r) => r.json());

    if (res.success) {
      setConfig({ ...config, ...updates } as any);
      showToast('Cài đặt đã được cập nhật.', 'success');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* App Header */}
      <Header
        config={config}
        scanning={scanning}
        onScan={handleScan}
        onTestTelegram={handleTestTelegram}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {/* Overview Stats Bar */}
        <OverviewStats rsiList={rsiData} bankList={bankData} config={config} />

        {/* Tab Navigation */}
        <div className="flex items-center justify-between border-b border-slate-800 mb-6">
          <div className="flex space-x-1 sm:space-x-4">
            <button
              id="tab-rsi"
              onClick={() => setActiveTab('rsi')}
              className={`pb-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
                activeTab === 'rsi'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flame className="w-4 h-4 text-rose-400" />
              RSI VN100 (Đa Khung 1D/4H/1H)
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {rsiData.length}
              </span>
            </button>

            <button
              id="tab-banks"
              onClick={() => setActiveTab('banks')}
              className={`pb-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
                activeTab === 'banks'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              18 Ngân Hàng (BB Tháng & MA50 Ngày)
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {bankData.length}
              </span>
            </button>

            <button
              id="tab-alerts"
              onClick={() => setActiveTab('alerts')}
              className={`pb-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
                activeTab === 'alerts'
                  ? 'border-sky-500 text-sky-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Bell className="w-4 h-4 text-sky-400" />
              Nhật Ký Tín Hiệu
              {alerts.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-600/30 text-blue-300 font-mono font-bold">
                  {alerts.length}
                </span>
              )}
            </button>
          </div>

          <div className="hidden sm:flex items-center text-xs text-slate-500 font-mono">
            Tự động làm mới mỗi 30 giây
          </div>
        </div>

        {/* Tab Views */}
        {activeTab === 'rsi' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <RsiScannerTable data={rsiData} onSelectStock={setSelectedStock} />
            </div>
            <div className="lg:col-span-1">
              <AlertLogViewer alerts={alerts} onClearLogs={handleClearLogs} />
            </div>
          </div>
        )}

        {activeTab === 'banks' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <BankTechnicalsTable data={bankData} onSelectStock={setSelectedStock} />
            </div>
            <div className="lg:col-span-1">
              <AlertLogViewer alerts={alerts} onClearLogs={handleClearLogs} />
            </div>
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="max-w-4xl mx-auto">
            <AlertLogViewer alerts={alerts} onClearLogs={handleClearLogs} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/60 py-4 text-xs text-slate-500 text-center">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          <span>
            Bot cảnh báo kỹ thuật VN100 • RSI 4H/1H & BB Tháng / MA50 Ngân hàng • Khớp chuẩn TradingView
          </span>
          <span className="text-slate-400 font-mono text-[11px]">
            Node.js 22 Runtime • TypeScript • Vite • Tailwind
          </span>
        </div>
      </footer>

      {/* Modals */}
      <ChartModal symbol={selectedStock} onClose={() => setSelectedStock(null)} />
      {isSettingsOpen && (
        <SettingsModal
          config={config}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSaveSettings}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 animate-fade-in">
          <div
            className={`px-4 py-3 rounded-xl shadow-xl border flex items-center space-x-2.5 text-xs font-medium ${
              toastMessage.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
                : toastMessage.type === 'error'
                ? 'bg-rose-950/90 border-rose-800 text-rose-200'
                : 'bg-slate-900 border-slate-700 text-slate-200'
            }`}
          >
            {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {toastMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {toastMessage.type === 'info' && <Activity className="w-4 h-4 text-blue-400 shrink-0" />}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
