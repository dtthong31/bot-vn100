import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ExternalLink,
  Info,
  Save,
  Send,
  Settings,
  X,
} from 'lucide-react';
import { BotConfigState } from '../types';

interface SettingsModalProps {
  config: BotConfigState | null;
  onClose: () => void;
  onSave: (updates: Partial<BotConfigState> & { slackRsiWebhook?: string; slackBankWebhook?: string }) => Promise<void>;
  onTestSlack: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  config,
  onClose,
  onSave,
  onTestSlack,
}) => {
  const [formData, setFormData] = useState({
    notifier: config?.notifier || 'slack',
    dryRun: config?.dryRun || false,
    rsiOversold: config?.rsiOversold || 30,
    bbPeriod: config?.bbPeriod || 20,
    bbStd: config?.bbStd || 2.0,
    maPeriod: config?.maPeriod || 50,
    testWeekend: config?.testWeekend || false,
    slackRsiWebhook: '',
    slackBankWebhook: '',
  });
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleTestSlackClick = async () => {
    setTestingSlack(true);
    try {
      await onTestSlack();
    } finally {
      setTestingSlack(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div
        id="settings-modal-content"
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Cài Đặt Bot & Kênh Thông Báo</h3>
              <p className="text-xs text-slate-400">Cấu hình Webhook Slack, Telegram và tham số chỉ báo</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Notifier Selection */}
          <div>
            <label className="block font-semibold text-slate-300 mb-1.5">
              Kênh Bắn Tín Hiệu (NOTIFIER)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['slack', 'telegram', 'console'] as const).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  onClick={() => setFormData({ ...formData, notifier: mode })}
                  className={`p-2.5 rounded-xl border text-center font-medium capitalize transition cursor-pointer ${
                    formData.notifier === mode
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {mode === 'slack' ? '💬 Slack' : mode === 'telegram' ? '✈️ Telegram' : '💻 Console'}
                </button>
              ))}
            </div>
          </div>

          {/* Slack Webhook Status / Input */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-200 text-xs">Cấu hình Slack Incoming Webhooks</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                    config?.hasSlackConfig
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {config?.hasSlackConfig ? '✓ Đã nạp URL' : 'Chưa có Webhook'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleTestSlackClick}
                disabled={testingSlack}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-medium transition cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3 h-3" />
                {testingSlack ? 'Đang gửi...' : 'Test Slack Ngay'}
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  SLACK_RSI_WEBHOOK (Kênh nhận tín hiệu RSI VN100):
                </label>
                <input
                  type="text"
                  placeholder="https://hooks.slack.com/services/T.../B.../..."
                  value={formData.slackRsiWebhook}
                  onChange={(e) => setFormData({ ...formData, slackRsiWebhook: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 font-mono text-[11px] placeholder:text-slate-600"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  SLACK_BANK_WEBHOOK (Kênh nhận tín hiệu Ngân hàng):
                </label>
                <input
                  type="text"
                  placeholder="https://hooks.slack.com/services/T.../B.../..."
                  value={formData.slackBankWebhook}
                  onChange={(e) => setFormData({ ...formData, slackBankWebhook: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 font-mono text-[11px] placeholder:text-slate-600"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              * Mẹo: Bạn có thể nhập URL trực tiếp tại đây hoặc khai báo trong Settings / biến môi trường <code className="text-slate-300">SLACK_RSI_WEBHOOK</code>.
            </p>
          </div>

          {/* Dry Run Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <div className="font-semibold text-slate-200">Chế độ Dry Run (DRY_RUN)</div>
              <div className="text-slate-400 text-[11px]">
                Nếu BẬT: Bot tính toán nhưng KHÔNG bắn tin ra Slack/Telegram thật
              </div>
            </div>
            <input
              type="checkbox"
              checked={formData.dryRun}
              onChange={(e) => setFormData({ ...formData, dryRun: e.target.checked })}
              className="w-4 h-4 rounded text-blue-600 bg-slate-800 border-slate-700 focus:ring-blue-500"
            />
          </div>

          {/* Indicator Thresholds */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Ngưỡng Quá Bán RSI</label>
              <input
                type="number"
                value={formData.rsiOversold}
                onChange={(e) => setFormData({ ...formData, rsiOversold: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Chu kỳ MA Ngày</label>
              <input
                type="number"
                value={formData.maPeriod}
                onChange={(e) => setFormData({ ...formData, maPeriod: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Chu kỳ BB Tháng</label>
              <input
                type="number"
                value={formData.bbPeriod}
                onChange={(e) => setFormData({ ...formData, bbPeriod: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Độ lệch chuẩn BB</label>
              <input
                type="number"
                step="0.1"
                value={formData.bbStd}
                onChange={(e) => setFormData({ ...formData, bbStd: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono"
              />
            </div>
          </div>

          {/* Test Weekend */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <div className="font-semibold text-slate-200">Quét Ngoài Giờ / Cuối Tuần (TEST_WEEKEND)</div>
              <div className="text-slate-400 text-[11px]">
                Cho phép quét và phát tín hiệu khi thị trường đóng cửa
              </div>
            </div>
            <input
              type="checkbox"
              checked={formData.testWeekend}
              onChange={(e) => setFormData({ ...formData, testWeekend: e.target.checked })}
              className="w-4 h-4 rounded text-blue-600 bg-slate-800 border-slate-700 focus:ring-blue-500"
            />
          </div>

          {/* Footer Submit */}
          <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  Đã Lưu!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Lưu Cài Đặt
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
