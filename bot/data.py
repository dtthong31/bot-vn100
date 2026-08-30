"""Tầng dữ liệu: gọi vnstock có giới hạn tốc độ, cache vào SQLite, resample 4H."""
from __future__ import annotations

import logging
import threading
import time
from collections import deque
from datetime import datetime, timedelta

import pandas as pd

from .config import CFG, TZ
from .store import Store

log = logging.getLogger(__name__)


class RateLimiter:
    """Token bucket đơn giản: tối đa N request trong 60 giây trượt."""

    def __init__(self, max_per_min: int):
        self.max = max_per_min
        self.calls: deque[float] = deque()
        self.lock = threading.Lock()

    def acquire(self) -> None:
        while True:
            with self.lock:
                now = time.monotonic()
                while self.calls and now - self.calls[0] > 60:
                    self.calls.popleft()
                if len(self.calls) < self.max:
                    self.calls.append(now)
                    return
                wait = 60 - (now - self.calls[0]) + 0.05
            log.debug("Chạm rate limit, nghỉ %.1fs", wait)
            time.sleep(max(wait, 0.1))


_limiter = RateLimiter(CFG.max_requests_per_min)


def _quote(symbol: str):
    from vnstock import Quote  # import trễ để log quảng cáo của vnstock không chen vào sớm

    return Quote(source=CFG.source, symbol=symbol)


def fetch_history(symbol: str, interval: str, start: str, end: str,
                  retries: int = 3) -> pd.DataFrame:
    """Gọi vnstock, có retry với backoff. Trả DataFrame rỗng nếu thất bại."""
    for attempt in range(retries):
        _limiter.acquire()
        try:
            df = _quote(symbol).history(
                symbol=symbol, start=start, end=end, interval=interval
            )
            if df is None or df.empty:
                return pd.DataFrame()
            df = df.dropna(subset=["close"]).copy()
            df["time"] = pd.to_datetime(df["time"])
            return df.sort_values("time").reset_index(drop=True)
        except SystemExit:
            # vnstock GỌI sys.exit() khi chạm trần rate limit thay vì raise
            # lỗi thường. Nếu không bắt ở đây, cả con bot chết giữa phiên.
            log.error("vnstock chạm trần rate limit khi lấy %s %s. "
                      "Nghỉ 65s. Cân nhắc giảm MAX_RPM hoặc đăng ký API key free.",
                      symbol, interval)
            time.sleep(65)
        except Exception as e:  # noqa: BLE001
            wait = 2 ** attempt
            log.warning("fetch %s %s lỗi (lần %d): %s -> nghỉ %ds",
                        symbol, interval, attempt + 1, e, wait)
            time.sleep(wait)
    log.error("Bỏ qua %s %s sau %d lần thử", symbol, interval, retries)
    return pd.DataFrame()


# Số ngày lịch sử nạp lần đầu. Giữ ở mức TỐI THIỂU đủ dùng:
# range càng dài, vnstock càng chia thành nhiều request nội bộ và càng dễ
# chạm trần 20 req/phút của gói Guest.
#   1H : RSI(14) trên 4H cần ~30 nến 4H = ~15 phiên -> 45 ngày là thừa
#   1D : MA50 cần 50 nến + đệm -> 150 ngày
#   1M : BB(20) cần 20 nến tháng + đệm -> 3 năm
LOOKBACK_DAYS = {"1H": 45, "1D": 150, "1M": 365 * 3}

# Cache còn "tươi" trong bao lâu thì KHÔNG gọi lại API.
# Đây là thứ quyết định bot có sống nổi với 20 request/phút hay không:
# nến ngày và nến tháng chỉ cần làm mới 1 lần/ngày, chỉ nến 1H mới cần
# refresh mỗi lượt quét. Nhờ vậy 1 lượt quét intraday = 100 request chứ
# không phải 300.
FRESH_MINUTES = {"1H": 20, "1D": 12 * 60, "1M": 12 * 60}


def load(store: Store, symbol: str, interval: str, force: bool = False) -> pd.DataFrame:
    """Lấy dữ liệu, chỉ gọi API khi cache đã cũ. Tải tăng dần (incremental)."""
    now = datetime.now(TZ)
    fetch_key = f"fetched:{symbol}:{interval}"

    if not force:
        last_fetch = store.get(fetch_key)
        if last_fetch:
            age = (now - datetime.fromisoformat(last_fetch)).total_seconds() / 60
            if age < FRESH_MINUTES[interval]:
                cached = store.get_ohlcv(symbol, interval)
                if not cached.empty:
                    return cached

    end = now.strftime("%Y-%m-%d")
    last = store.last_bar_time(symbol, interval)

    if last is None:
        start = (now - timedelta(days=LOOKBACK_DAYS[interval])).strftime("%Y-%m-%d")
    else:
        # Tải lại từ vài ngày trước nến cuối để bắt các nến bị sửa/đóng muộn
        overlap = 3 if interval in ("1H", "1D") else 40
        start = (pd.to_datetime(last) - timedelta(days=overlap)).strftime("%Y-%m-%d")

    fresh = fetch_history(symbol, interval, start, end)
    if not fresh.empty:
        store.upsert_ohlcv(symbol, interval, fresh)
        store.set(fetch_key, now.isoformat())

    return store.get_ohlcv(symbol, interval)


def resample_4h(df_1h: pd.DataFrame) -> pd.DataFrame:
    """Gộp nến 1H thành nến 4H theo phiên giao dịch Việt Nam.

    Phiên VN: 09:00-11:30 và 13:00-15:00 -> nến 1H rơi vào 9,10,11,13,14 giờ.
    Với origin 09:00 và chu kỳ 4 giờ, ta được 2 nến mỗi ngày:
        - Nến "sáng"  : gom các nến 09,10,11
        - Nến "chiều" : gom các nến 13,14
    Cách chia này ổn định và có ý nghĩa với thị trường VN. Nếu muốn khớp
    chính xác với TradingView, sửa hàm này là đủ - phần còn lại không đổi.
    """
    if df_1h.empty:
        return df_1h
    d = df_1h.set_index("time").sort_index()
    out = d.resample("4h", origin=d.index.normalize().min() + pd.Timedelta(hours=9)).agg(
        {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    )
    return out.dropna(subset=["close"]).reset_index()
