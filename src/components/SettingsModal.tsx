import React, { useState } from 'react';
import { AlertCircle, Check, Info, Save, Settings, X } from 'lucide-react';
import { BotConfigState } from '../types';

interface SettingsModalProps {
  config: BotConfigState | null;
  onClose: () => void;
  onSave: (updates: Partial<BotConfigState>) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  config,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState({
    notifier: config?.notifier || 'console',
    dryRun: config?.dryRun || false,
    rsiOversold: config?.rsiOversold || 30,
    bbPeriod: config?.bbPeriod || 20,
    bbStd: config?.bbStd || 2.0,
    maPeriod: config?.maPeriod || 50,
    testWeekend: config?.testWeekend || false,
  });
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

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
              <h3 className="text-base font-bold text-white">Cài Đặt Tham Số Bot</h3>
              <p className="text-xs text-slate-400">Điều chỉnh ngưỡng chỉ báo kỹ thuật và phương thức thông báo</p>
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
          {/* Notifier Mode */}
          <div>
            <label className="block font-semibold text-slate-300 mb-1.5">Kênh Thông Báo (NOTIFIER)</label>
            <div className="grid grid-cols-3 gap-2">
              {(['console', 'telegram', 'slack'] as const).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  onClick={() => setFormData({ ...formData, notifier: mode })}
                  className={`p-2.5 rounded-xl border text-center font-medium capitalize transition cursor-pointer ${
                    formData.notifier === mode
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Dry Run Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <div className="font-semibold text-slate-200">Chế độ Dry Run (DRY_RUN)</div>
              <div className="text-slate-400 text-[11px]">
                Quét và tính toán nhưng KHÔNG ghi state (chạy lại vẫn ra cùng kết quả)
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
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Ngưỡng Quá Bán RSI (RSI_OVERSOLD)</label>
              <input
                type="number"
                value={formData.rsiOversold}
                onChange={(e) => setFormData({ ...formData, rsiOversold: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Chu kỳ MA Ngày (MA_PERIOD)</label>
              <input
                type="number"
                value={formData.maPeriod}
                onChange={(e) => setFormData({ ...formData, maPeriod: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Chu kỳ BB Tháng (BB_PERIOD)</label>
              <input
                type="number"
                value={formData.bbPeriod}
                onChange={(e) => setFormData({ ...formData, bbPeriod: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Độ lệch chuẩn BB (BB_STD)</label>
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
              <div className="font-semibold text-slate-200">Quét Cuối Tuần (TEST_WEEKEND)</div>
              <div className="text-slate-400 text-[11px]">
                Coi thứ 7 như ngày giao dịch để kiểm tra bot ngoài phiên
              </div>
            </div>
            <input
              type="checkbox"
              checked={formData.testWeekend}
              onChange={(e) => setFormData({ ...formData, testWeekend: e.target.checked })}
              className="w-4 h-4 rounded text-blue-600 bg-slate-800 border-slate-700 focus:ring-blue-500"
            />
          </div>

          {/* Info note */}
          <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-800/40 text-blue-300 flex items-start space-x-2 text-[11px]">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              Telegram Bot Token, Chat IDs và Webhook URLs được nạp trực tiếp qua biến môi trường trong file{' '}
              <code className="bg-slate-900 px-1 py-0.5 rounded font-mono">.env</code> hoặc Settings của AI Studio.
            </div>
          </div>

          {/* Footer Submit */}
          <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
            >
              Hủy
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
