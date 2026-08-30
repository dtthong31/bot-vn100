"""Logic hai luồng cảnh báo, kèm máy trạng thái chống gửi lặp."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

import pandas as pd

from . import data as dl
from . import indicators as ta
from .config import CFG, TZ
from .notifier import BANK_CHANNEL, RSI_CHANNEL, Alert
from .store import Store

log = logging.getLogger(__name__)


def _fmt(x) -> str:
    return "n/a" if x is None or pd.isna(x) else f"{float(x):.1f}"


def _rsi_context(r_d, r_4h, r_1h) -> str:
    return f"RSI ngày {_fmt(r_d)} | 4H {_fmt(r_4h)} | 1H {_fmt(r_1h)}"


# ----------------------------------------------------------------------------
# LUỒNG 1 — RSI
# ----------------------------------------------------------------------------
def scan_rsi(store: Store, symbols: list[str]) -> list[Alert]:
    """Quét RSI cho toàn bộ VN100.

    Máy trạng thái mỗi mã:
      armed=True   -> RSI 4H đã hồi lên >= 30, đủ điều kiện bắn cảnh báo quá bán mới
      armed=False  -> đã bắn rồi, chờ RSI 4H về >= 30 mới nạp đạn lại
      awaiting     -> đang chờ RSI 1H cắt lên 30 để báo tín hiệu hồi
    """
    alerts: list[Alert] = []
    now = datetime.now(TZ)

    for sym in symbols:
        try:
            d1 = dl.load(store, sym, "1D")
            h1 = dl.load(store, sym, "1H")
            if len(d1) < CFG.rsi_period + 2 or len(h1) < CFG.rsi_period + 2:
                continue

            h4 = dl.resample_4h(h1)
            r_d = ta.rsi(d1["close"], CFG.rsi_period)
            r_1h = ta.rsi(h1["close"], CFG.rsi_period)
            r_4h = ta.rsi(h4["close"], CFG.rsi_period) if len(h4) > CFG.rsi_period else pd.Series(dtype=float)
            if r_4h.empty:
                continue

            last_d, last_4h, last_1h = r_d.iloc[-1], r_4h.iloc[-1], r_1h.iloc[-1]
            if pd.isna(last_4h) or pd.isna(last_1h):
                continue

            key = f"rsi:{sym}"
            st = store.get(key, {"armed": True, "awaiting": None})
            new_st = dict(st)

            # --- Điều kiện 1: RSI 4H vừa xuống dưới 30 ---
            if last_4h >= CFG.rsi_oversold:
                new_st["armed"] = True
            elif st.get("armed"):
                alerts.append(Alert(
                    channel=RSI_CHANNEL, symbol=sym, kind="rsi4h_oversold",
                    title="RSI 4H xuống dưới 30",
                    lines=[_rsi_context(last_d, last_4h, last_1h)],
                ))
                new_st["armed"] = False
                new_st["awaiting"] = now.isoformat()

            # --- Điều kiện 2: sau cảnh báo trên, RSI 1H cắt lên 30 ---
            if new_st.get("awaiting"):
                started = datetime.fromisoformat(new_st["awaiting"])
                if now - started > timedelta(days=CFG.bounce_expiry_days):
                    new_st["awaiting"] = None          # hết hạn chờ
                elif ta.crossed_above(r_1h, CFG.rsi_oversold):
                    alerts.append(Alert(
                        channel=RSI_CHANNEL, symbol=sym, kind="rsi1h_bounce",
                        title="tín hiệu hồi ngắn hạn (RSI 1H cắt lên 30)",
                        lines=[_rsi_context(last_d, last_4h, last_1h)],
                    ))
                    new_st["awaiting"] = None

            if not CFG.dry_run and new_st != st:
                store.set(key, new_st)

        except Exception as e:  # noqa: BLE001
            log.exception("Lỗi khi quét RSI cho %s: %s", sym, e)

    return alerts


# ----------------------------------------------------------------------------
# LUỒNG 2 — Ngân hàng: Bollinger tháng + MA50 ngày
# ----------------------------------------------------------------------------
def scan_bank_bollinger(store: Store, banks: list[str]) -> list[Alert]:
    """BB(20,2) trên nến THÁNG. Cảnh báo ngay trong tháng, tối đa 1 lần/dải/tháng."""
    alerts: list[Alert] = []
    month_tag = datetime.now(TZ).strftime("%Y-%m")

    for sym in banks:
        try:
            m1 = dl.load(store, sym, "1M")
            if len(m1) < CFG.bb_period + 1:
                continue

            mid, upper, lower = ta.bollinger(m1["close"], CFG.bb_period, CFG.bb_std)
            up, lo = upper.iloc[-1], lower.iloc[-1]
            bar = m1.iloc[-1]
            if pd.isna(up) or pd.isna(lo):
                continue

            key = f"bb:{sym}:{month_tag}"
            fired = store.get(key, [])
            new_fired = list(fired)

            # Dùng high/low của nến tháng đang chạy để bắt lúc giá chạm dải
            hits = []
            if bar["high"] >= up and "upper" not in fired:
                hits.append(("upper", "dải trên", up))
            if bar["low"] <= lo and "lower" not in fired:
                hits.append(("lower", "dải dưới", lo))

            for tag, label, level in hits:
                d1 = dl.load(store, sym, "1D")
                h1 = dl.load(store, sym, "1H")
                r_d = ta.rsi(d1["close"], CFG.rsi_period).iloc[-1] if len(d1) > CFG.rsi_period else None
                r_1h = ta.rsi(h1["close"], CFG.rsi_period).iloc[-1] if len(h1) > CFG.rsi_period else None
                h4 = dl.resample_4h(h1)
                r_4h = ta.rsi(h4["close"], CFG.rsi_period).iloc[-1] if len(h4) > CFG.rsi_period else None

                alerts.append(Alert(
                    channel=BANK_CHANNEL, symbol=sym, kind=f"bb_month_{tag}",
                    title=f"chạm {label} Bollinger tháng",
                    lines=[
                        f"BB({CFG.bb_period},{CFG.bb_std:g}) tháng = {level:.2f} "
                        f"| giá {bar['close']:.2f} — nến tháng chưa đóng",
                        _rsi_context(r_d, r_4h, r_1h),
                    ],
                ))
                new_fired.append(tag)

            if not CFG.dry_run and new_fired != fired:
                store.set(key, new_fired)

        except Exception as e:  # noqa: BLE001
            log.exception("Lỗi Bollinger cho %s: %s", sym, e)

    return alerts


def scan_bank_ma50(store: Store, banks: list[str]) -> list[Alert]:
    """MA50 ngày. CHỈ xét giá đóng cửa - râu nến chạm MA50 không tính."""
    alerts: list[Alert] = []

    for sym in banks:
        try:
            d1 = dl.load(store, sym, "1D")
            if len(d1) < CFG.ma_period + 2:
                continue

            ma = ta.sma(d1["close"], CFG.ma_period)
            if pd.isna(ma.iloc[-1]) or pd.isna(ma.iloc[-2]):
                continue

            prev_side = "above" if d1["close"].iloc[-2] > ma.iloc[-2] else "below"
            cur_side = "above" if d1["close"].iloc[-1] > ma.iloc[-1] else "below"

            key = f"ma50:{sym}"
            st = store.get(key)

            # Lần chạy đầu tiên: chỉ ghi nhận vị thế, không bắn cảnh báo lịch sử
            if st is None:
                if not CFG.dry_run:
                    store.set(key, {"side": cur_side})
                continue

            if cur_side != prev_side and cur_side != st.get("side"):
                direction = "cắt LÊN" if cur_side == "above" else "cắt XUỐNG"
                alerts.append(Alert(
                    channel=BANK_CHANNEL, symbol=sym, kind=f"ma50_{cur_side}",
                    title=f"giá đóng cửa {direction} MA50 ngày",
                    lines=[
                        f"Đóng cửa {d1['close'].iloc[-1]:.2f} | "
                        f"MA{CFG.ma_period} = {ma.iloc[-1]:.2f} "
                        f"({d1['time'].iloc[-1]:%d/%m/%Y})",
                    ],
                ))
            if not CFG.dry_run and cur_side != st.get("side"):
                store.set(key, {"side": cur_side})

        except Exception as e:  # noqa: BLE001
            log.exception("Lỗi MA50 cho %s: %s", sym, e)

    return alerts
