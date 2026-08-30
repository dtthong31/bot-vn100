#!/usr/bin/env bash
# Cài bot chạy nền trên macOS bằng launchd.
# Chạy: bash macos/setup-macos.sh
set -euo pipefail

PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_NAME="com.vn100bot"
TARGET="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"

echo "==> Thư mục project: $PROJECT"

# --- 1. Kiểm tra điều kiện ---
[[ -f "$PROJECT/.env" ]] || { echo "LỖI: chưa có .env. Chạy: cp .env.example .env"; exit 1; }
[[ -x "$PROJECT/.venv/bin/python" ]] || {
  echo "==> Chưa có venv, đang tạo..."
  python3 -m venv "$PROJECT/.venv"
  "$PROJECT/.venv/bin/pip" install -q -r "$PROJECT/requirements.txt"
}
mkdir -p "$PROJECT/data"

# --- 2. Không cho máy ngủ khi cắm điện ---
echo "==> Cấu hình nguồn điện (cần mật khẩu sudo)"
sudo pmset -c sleep 0            # cắm điện: không bao giờ ngủ
sudo pmset -c disksleep 0        # không cho ổ đĩa ngủ
sudo pmset -a autorestart 1      # tự bật lại sau khi mất điện
sudo pmset -c womp 1             # cho phép đánh thức qua mạng

# --- 3. Cài LaunchAgent ---
mkdir -p "$HOME/Library/LaunchAgents"
sed "s|__PROJECT__|$PROJECT|g" "$PROJECT/macos/${PLIST_NAME}.plist" > "$TARGET"

launchctl bootout "gui/$(id -u)/${PLIST_NAME}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$TARGET"
launchctl enable "gui/$(id -u)/${PLIST_NAME}"

echo
echo "==> Xong. Kiểm tra bằng:"
echo "    launchctl print gui/$(id -u)/${PLIST_NAME} | head -20"
echo "    tail -f $PROJECT/data/bot.log"
echo
echo "==> Gỡ bỏ khi cần:"
echo "    launchctl bootout gui/$(id -u)/${PLIST_NAME}"
