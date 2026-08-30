"""Cấu hình tập trung. Mọi thứ đọc từ biến môi trường, không hardcode secret."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def _env(key: str, default: str | None = None, required: bool = False) -> str:
    val = os.getenv(key, default)
    if required and not val:
        raise RuntimeError(f"Thiếu biến môi trường bắt buộc: {key}")
    return val or ""


def _env_float(key: str, default: float) -> float:
    try:
        return float(os.getenv(key, str(default)))
    except ValueError:
        return default


def _env_int(key: str, default: int) -> int:
    try:
        return int(os.getenv(key, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class Config:
    # --- Telegram ---
    telegram_token: str = field(default_factory=lambda: _env("TELEGRAM_BOT_TOKEN"))
    rsi_chat_id: str = field(default_factory=lambda: _env("RSI_CHAT_ID"))
    bank_chat_id: str = field(default_factory=lambda: _env("BANK_TECH_CHAT_ID"))

    # --- Slack (chỉ dùng khi NOTIFIER=slack) ---
    slack_rsi_webhook: str = field(default_factory=lambda: _env("SLACK_RSI_WEBHOOK"))
    slack_bank_webhook: str = field(default_factory=lambda: _env("SLACK_BANK_WEBHOOK"))

    # --- Chế độ chạy ---
    # console  = chỉ in ra màn hình (dùng để test)
    # telegram = gửi qua Telegram
    # slack    = gửi qua Slack incoming webhook
    notifier: str = field(default_factory=lambda: _env("NOTIFIER", "console"))
    # dry_run: quét và tính toán nhưng KHÔNG ghi state -> chạy lại vẫn ra cùng kết quả
    dry_run: bool = field(default_factory=lambda: _env("DRY_RUN", "0") == "1")

    # --- Ngưỡng chỉ báo ---
    rsi_period: int = field(default_factory=lambda: _env_int("RSI_PERIOD", 14))
    rsi_oversold: float = field(default_factory=lambda: _env_float("RSI_OVERSOLD", 30.0))
    bb_period: int = field(default_factory=lambda: _env_int("BB_PERIOD", 20))
    bb_std: float = field(default_factory=lambda: _env_float("BB_STD", 2.0))
    ma_period: int = field(default_factory=lambda: _env_int("MA_PERIOD", 50))

    # Sau bao nhiêu ngày thì huỷ trạng thái "chờ tín hiệu hồi 1H"
    bounce_expiry_days: int = field(default_factory=lambda: _env_int("BOUNCE_EXPIRY_DAYS", 5))

    # --- Nguồn dữ liệu ---
    source: str = field(default_factory=lambda: _env("VNSTOCK_SOURCE", "VCI"))
    # QUAN TRỌNG: vnstock Guest (không đăng ký) = 20 req/phút và nó GIẾT
    # LUÔN tiến trình khi chạm trần, không chỉ báo lỗi. Phải đặt thấp hơn trần.
    #   Guest (mặc định)        -> 18
    #   Đã đăng ký free         -> 55
    #   Gói tài trợ (Sponsor)   -> 150+
    max_requests_per_min: int = field(default_factory=lambda: _env_int("MAX_RPM", 18))

    # --- Lưu trữ ---
    db_path: str = field(default_factory=lambda: _env("DB_PATH", "data/bot.sqlite"))

    # --- Lịch quét (phút) ---
    intraday_scan_minutes: int = field(default_factory=lambda: _env_int("INTRADAY_SCAN_MINUTES", 30))
    # Bật để test cuối tuần: thứ 7 coi như ngày giao dịch, quét ngay khi serve khởi động
    test_weekend: bool = field(default_factory=lambda: _env("TEST_WEEKEND", "0") == "1")

    @property
    def has_api_key(self) -> bool:
        return bool(os.getenv("VNSTOCK_API_KEY", "").strip())

    def check_quota_config(self) -> list[str]:
        """Cảnh báo nếu MAX_RPM không khớp với gói thật sự đang dùng.

        MAX_RPM chỉ là bộ hãm phía bot. Đặt nó cao hơn trần thật của gói
        KHÔNG làm bot chạy nhanh hơn - nó chỉ khiến bot đâm thẳng vào rate
        limit, và vnstock phản ứng bằng cách gọi sys.exit().
        """
        warnings: list[str] = []
        ceiling = 60 if self.has_api_key else 20
        tier = "Cộng đồng (đã có API key)" if self.has_api_key else "Guest (chưa có API key)"

        if self.max_requests_per_min >= ceiling:
            warnings.append(
                f"MAX_RPM={self.max_requests_per_min} nhưng gói {tier} chỉ cho "
                f"{ceiling} req/phút. Bot sẽ bị chặn và có thể bị giết tiến trình. "
                f"Hạ MAX_RPM xuống {ceiling - 5}"
                + ("" if self.has_api_key else ", hoặc đăng ký key free tại https://vnstocks.com/login")
                + "."
            )
        elif self.has_api_key and self.max_requests_per_min <= 20:
            warnings.append(
                f"Bạn đã có API key (trần 60/phút) nhưng MAX_RPM chỉ {self.max_requests_per_min}. "
                "Nâng lên 55 để quét nhanh gấp 3."
            )
        return warnings

    def validate(self) -> None:
        required = {
            "telegram": [
                ("TELEGRAM_BOT_TOKEN", self.telegram_token),
                ("RSI_CHAT_ID", self.rsi_chat_id),
                ("BANK_TECH_CHAT_ID", self.bank_chat_id),
            ],
            "slack": [
                ("SLACK_RSI_WEBHOOK", self.slack_rsi_webhook),
                ("SLACK_BANK_WEBHOOK", self.slack_bank_webhook),
            ],
        }.get(self.notifier, [])
        for k, v in required:
            if not v:
                raise RuntimeError(f"NOTIFIER={self.notifier} nhưng thiếu {k}")


CFG = Config()

# --- Giờ giao dịch HOSE (giờ Việt Nam) ---
MORNING = (9, 0, 11, 30)     # 09:00 - 11:30
AFTERNOON = (13, 0, 15, 0)   # 13:00 - 15:00


def is_trading_day(dt) -> bool:
    """Thứ 2-6. TEST_WEEKEND=1 thì thêm thứ 7. Chưa loại trừ ngày lễ."""
    if CFG.test_weekend and dt.weekday() == 5:
        return True
    return dt.weekday() < 5


def is_market_open(dt) -> bool:
    if CFG.test_weekend and dt.weekday() == 5:
        return True
    if not is_trading_day(dt):
        return False
    minutes = dt.hour * 60 + dt.minute
    for h1, m1, h2, m2 in (MORNING, AFTERNOON):
        if h1 * 60 + m1 <= minutes <= h2 * 60 + m2:
            return True
    return False
