#!/usr/bin/env python3
"""Điểm khởi chạy bot cảnh báo kỹ thuật VN100.

Cách dùng:
    python run.py scan-rsi     # quét RSI một lần
    python run.py scan-bank    # quét Bollinger tháng + MA50 một lần
    python run.py scan-all     # quét tất cả một lần
    python run.py serve        # chạy liên tục theo lịch (dùng khi deploy)
    python run.py test-telegram# gửi tin thử để kiểm tra token/chat_id
"""
from __future__ import annotations

import logging
import sys
from datetime import datetime

from dotenv import load_dotenv

load_dotenv()

from bot.config import CFG, TZ, is_market_open  # noqa: E402
from bot.notifier import BANK_CHANNEL, RSI_CHANNEL, Alert, build_notifier  # noqa: E402
from bot.store import Store  # noqa: E402
from bot.strategies import scan_bank_bollinger, scan_bank_ma50, scan_rsi  # noqa: E402
from bot.universe import get_universe  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("run")


def _dispatch(notifier, store, alerts: list[Alert]) -> None:
    for channel in (RSI_CHANNEL, BANK_CHANNEL):
        group = [a for a in alerts if a.channel == channel]
        if not group:
            continue
        notifier.send_batch(channel, group)
        if not CFG.dry_run:
            for a in group:
                store.log_alert(channel, a.symbol, a.kind, {"title": a.title})
        log.info("Đã gửi %d tín hiệu vào kênh %s", len(group), channel)


def job_rsi(store, notifier) -> None:
    vn100, _ = get_universe(store)
    log.info("Quét RSI cho %d mã...", len(vn100))
    _dispatch(notifier, store, scan_rsi(store, vn100))


def job_bank_bb(store, notifier) -> None:
    _, banks = get_universe(store)
    log.info("Quét Bollinger tháng cho %d mã ngân hàng...", len(banks))
    _dispatch(notifier, store, scan_bank_bollinger(store, banks))


def job_bank_ma(store, notifier) -> None:
    _, banks = get_universe(store)
    log.info("Quét MA50 ngày cho %d mã ngân hàng...", len(banks))
    _dispatch(notifier, store, scan_bank_ma50(store, banks))


def serve(store, notifier) -> None:
    """Chạy liên tục. Quét trong giờ giao dịch, MA50 sau khi thị trường đóng."""
    from apscheduler.schedulers.blocking import BlockingScheduler
    from apscheduler.triggers.cron import CronTrigger

    sched = BlockingScheduler(timezone=TZ)

    def guarded(fn):
        def wrapper():
            if not is_market_open(datetime.now(TZ)):
                return
            try:
                fn(store, notifier)
            except Exception:  # noqa: BLE001
                log.exception("Job thất bại")
        return wrapper

    def safe(fn):
        def wrapper():
            try:
                fn(store, notifier)
            except Exception:  # noqa: BLE001
                log.exception("Job thất bại")
        return wrapper

    m = CFG.intraday_scan_minutes
    days = "mon-sat" if CFG.test_weekend else "mon-fri"
    hours = "0-23" if CFG.test_weekend else "9-11,13-14"
    if CFG.test_weekend:
        log.warning(
            "TEST_WEEKEND bật: thứ 7 được quét, giờ nới rộng %s. Tắt khi lên production.",
            hours,
        )
    # Quét RSI trong giờ giao dịch
    sched.add_job(guarded(job_rsi), CronTrigger(
        day_of_week=days, hour=hours, minute=f"*/{m}"), id="rsi")
    # Bollinger tháng: quét trong phiên vì cảnh báo khi giá chạm dải
    sched.add_job(guarded(job_bank_bb), CronTrigger(
        day_of_week=days, hour=hours, minute="5,35"), id="bb")
    # MA50: chỉ sau khi nến ngày đã đóng
    sched.add_job(safe(job_bank_ma), CronTrigger(
        day_of_week=days, hour=15 if not CFG.test_weekend else "0-23", minute=30), id="ma50")

    log.info("Bot đang chạy. Chế độ gửi: %s. Ctrl+C để dừng.", CFG.notifier)
    if CFG.test_weekend:
        log.info("TEST_WEEKEND: quét thử ngay khi khởi động...")
        job_rsi(store, notifier)
        job_bank_bb(store, notifier)
        job_bank_ma(store, notifier)
    sched.start()


def test_telegram(notifier) -> None:
    for ch in (RSI_CHANNEL, BANK_CHANNEL):
        notifier.send_batch(ch, [Alert(
            channel=ch, symbol="TEST", kind="test",
            title="kiểm tra kết nối",
            lines=["Nếu bạn thấy tin này, cấu hình đã đúng.",
                   f"Thời gian: {datetime.now(TZ):%d/%m/%Y %H:%M}"],
        )])
    print("Đã gửi tin thử vào cả hai kênh.")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "scan-all"
    CFG.validate()
    store = Store(CFG.db_path)
    notifier = build_notifier(CFG)

    tier = "Cộng đồng (60 req/phút)" if CFG.has_api_key else "Guest (20 req/phút)"
    log.info("Gói vnstock: %s | MAX_RPM=%d", tier, CFG.max_requests_per_min)
    for w in CFG.check_quota_config():
        log.warning("%s", w)

    if CFG.dry_run:
        log.warning("DRY_RUN bật: sẽ KHÔNG ghi trạng thái, chạy lại cho kết quả giống hệt.")

    match cmd:
        case "scan-rsi":
            job_rsi(store, notifier)
        case "scan-bank":
            job_bank_bb(store, notifier)
            job_bank_ma(store, notifier)
        case "scan-all":
            job_rsi(store, notifier)
            job_bank_bb(store, notifier)
            job_bank_ma(store, notifier)
        case "serve":
            serve(store, notifier)
        case "test-telegram":
            test_telegram(notifier)
        case _:
            print(__doc__)
            sys.exit(1)


if __name__ == "__main__":
    main()
