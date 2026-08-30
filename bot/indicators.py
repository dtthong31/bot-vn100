"""Chỉ báo kỹ thuật. Công thức khớp TradingView để số liệu đối chiếu được."""
from __future__ import annotations

import numpy as np
import pandas as pd


def rma(x: pd.Series, period: int) -> pd.Series:
    """Wilder's smoothing (hàm ta.rma của TradingView).

    Điểm quan trọng: giá trị đầu tiên được SEED bằng SMA của `period` phần tử
    đầu, sau đó mới làm mượt đệ quy. Nếu dùng thẳng
    `ewm(alpha=1/period, adjust=False)` thì kết quả lệch tới hơn 10 điểm RSI
    so với TradingView vì nó seed bằng phần tử đầu tiên.
    """
    v = x.to_numpy(dtype=float)
    out = np.full(len(v), np.nan)

    # Bỏ qua các NaN ở đầu chuỗi (ví dụ phần tử đầu của diff)
    valid = np.flatnonzero(~np.isnan(v))
    if len(valid) < period:
        return pd.Series(out, index=x.index)
    s = valid[0]

    acc = v[s:s + period].mean()
    out[s + period - 1] = acc
    for i in range(s + period, len(v)):
        acc = (acc * (period - 1) + v[i]) / period
        out[i] = acc
    return pd.Series(out, index=x.index)


def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """RSI(period) theo Wilder — khớp TradingView."""
    delta = close.astype(float).diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)

    avg_gain = rma(gain, period)
    avg_loss = rma(loss, period)

    out = np.full(len(close), np.nan)
    ag, al = avg_gain.to_numpy(), avg_loss.to_numpy()
    mask = ~np.isnan(ag) & ~np.isnan(al)
    # avg_loss = 0 nghĩa là không có nến giảm nào -> RSI = 100
    zero = mask & (al == 0)
    norm = mask & (al != 0)
    out[zero] = 100.0
    out[norm] = 100.0 - 100.0 / (1.0 + ag[norm] / al[norm])
    return pd.Series(out, index=close.index)


def bollinger(close: pd.Series, period: int = 20, num_std: float = 2.0):
    """Trả (middle, upper, lower). ddof=0 giống TradingView."""
    mid = close.rolling(period).mean()
    sd = close.rolling(period).std(ddof=0)
    return mid, mid + num_std * sd, mid - num_std * sd


def sma(close: pd.Series, period: int = 50) -> pd.Series:
    return close.rolling(period).mean()


def crossed_above(series: pd.Series, level: float) -> bool:
    """Nến trước < level và nến hiện tại > level."""
    if len(series) < 2:
        return False
    prev, cur = series.iloc[-2], series.iloc[-1]
    return bool(pd.notna(prev) and pd.notna(cur) and prev < level < cur)


def crossed_below(series: pd.Series, level: float) -> bool:
    if len(series) < 2:
        return False
    prev, cur = series.iloc[-2], series.iloc[-1]
    return bool(pd.notna(prev) and pd.notna(cur) and prev > level > cur)
