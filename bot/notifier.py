"""Lớp trừu tượng gửi thông báo.

Toàn bộ logic chỉ báo KHÔNG biết Telegram là gì. Muốn chuyển sang Slack
chỉ cần viết thêm một class SlackNotifier ở dưới và đổi biến NOTIFIER.
"""
from __future__ import annotations

import html
import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass

import requests

log = logging.getLogger(__name__)

RSI_CHANNEL = "rsi"
BANK_CHANNEL = "bank"


@dataclass
class Alert:
    """Một tín hiệu. Notifier tự quyết định trình bày thế nào."""
    channel: str
    symbol: str
    kind: str        # mã loại tín hiệu, dùng để dedup và log
    title: str       # dòng tiêu đề ngắn
    lines: list[str] # các dòng chi tiết


class Notifier(ABC):
    @abstractmethod
    def send_batch(self, channel: str, alerts: list[Alert]) -> None:
        ...


def _format_digest(alerts: list[Alert], header: str) -> str:
    """Gộp nhiều tín hiệu thành MỘT tin nhắn.

    Đây là chi tiết then chốt: Telegram giới hạn 20 tin/phút/group. Một phiên
    bán tháo có thể có 40-60 mã cùng thủng RSI 30. Gửi 1 tin/mã sẽ bị chặn và
    mất tín hiệu - và cũng không ai đọc nổi 60 thông báo liên tiếp.
    """
    parts = [f"<b>{html.escape(header)}</b>", ""]
    for a in alerts:
        parts.append(f"<b>{html.escape(a.symbol)}</b> — {html.escape(a.title)}")
        parts.extend("  " + html.escape(ln) for ln in a.lines)
        parts.append("")
    return "\n".join(parts).strip()


class ConsoleNotifier(Notifier):
    """Dùng khi test / shadow mode. Không gửi đi đâu cả."""

    def send_batch(self, channel: str, alerts: list[Alert]) -> None:
        if not alerts:
            return
        print(f"\n{'=' * 60}\n[{channel.upper()}] {len(alerts)} tín hiệu\n{'=' * 60}")
        for a in alerts:
            print(f"{a.symbol} — {a.title}")
            for ln in a.lines:
                print(f"   {ln}")
        print()


class TelegramNotifier(Notifier):
    MAX_LEN = 4000  # giới hạn thật là 4096, chừa lề

    def __init__(self, token: str, chat_ids: dict[str, str]):
        self.base = f"https://api.telegram.org/bot{token}"
        self.chat_ids = chat_ids

    def _post(self, chat_id: str, text: str) -> None:
        for attempt in range(4):
            try:
                r = requests.post(
                    f"{self.base}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": text,
                        "parse_mode": "HTML",
                        "disable_web_page_preview": True,
                    },
                    timeout=20,
                )
                if r.status_code == 429:
                    wait = r.json().get("parameters", {}).get("retry_after", 5)
                    log.warning("Telegram 429, chờ %ss", wait)
                    time.sleep(wait + 1)
                    continue
                r.raise_for_status()
                return
            except Exception as e:  # noqa: BLE001
                log.warning("Gửi Telegram lỗi (lần %d): %s", attempt + 1, e)
                time.sleep(2 ** attempt)
        log.error("Bỏ tin nhắn sau nhiều lần thử")

    def send_batch(self, channel: str, alerts: list[Alert]) -> None:
        if not alerts:
            return
        chat_id = self.chat_ids[channel]
        header = {
            RSI_CHANNEL: "Cảnh báo RSI — VN100",
            BANK_CHANNEL: "Cảnh báo kỹ thuật — Ngân hàng VN100",
        }.get(channel, "Cảnh báo")

        # Chia nhỏ nếu digest vượt giới hạn độ dài tin nhắn
        chunk: list[Alert] = []
        for a in alerts:
            trial = chunk + [a]
            if len(_format_digest(trial, header)) > self.MAX_LEN and chunk:
                self._post(chat_id, _format_digest(chunk, header))
                time.sleep(3.5)   # tôn trọng 20 tin/phút
                chunk = [a]
            else:
                chunk = trial
        if chunk:
            self._post(chat_id, _format_digest(chunk, header))


class SlackNotifier(Notifier):
    """Sẵn sàng cho tương lai. Chỉ cần đặt webhook URL cho từng kênh.

    Chưa dùng - Slack gói Free xoá lịch sử sau 90 ngày, không hợp để soi lại
    tín hiệu cũ. Giữ class này để việc chuyển đổi sau này tốn khoảng 1 giờ.
    """

    def __init__(self, webhooks: dict[str, str]):
        self.webhooks = webhooks

    # Slack cho tối đa 50 block mỗi tin. Chừa 2 block cho header + divider.
    MAX_BLOCKS = 48

    @staticmethod
    def _header(channel: str) -> str:
        return {
            RSI_CHANNEL: "Cảnh báo RSI — VN100",
            BANK_CHANNEL: "Cảnh báo kỹ thuật — Ngân hàng VN100",
        }.get(channel, "Cảnh báo")

    @staticmethod
    def _block(a: Alert) -> dict:
        return {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*{a.symbol}* — {a.title}\n" + "\n".join(a.lines),
            },
        }

    def _post(self, url: str, payload: dict) -> None:
        for attempt in range(4):
            try:
                r = requests.post(url, json=payload, timeout=20)
                if r.status_code == 429:
                    wait = int(r.headers.get("Retry-After", 5))
                    log.warning("Slack 429, chờ %ss", wait)
                    time.sleep(wait + 1)
                    continue
                r.raise_for_status()
                return
            except Exception as e:  # noqa: BLE001
                log.warning("Gửi Slack lỗi (lần %d): %s", attempt + 1, e)
                time.sleep(2 ** attempt)
        log.error("Bỏ tin nhắn Slack sau nhiều lần thử")

    def send_batch(self, channel: str, alerts: list[Alert]) -> None:
        if not alerts:
            return
        url = self.webhooks[channel]
        header = self._header(channel)

        for i in range(0, len(alerts), self.MAX_BLOCKS):
            chunk = alerts[i:i + self.MAX_BLOCKS]
            blocks = [
                {"type": "header",
                 "text": {"type": "plain_text", "text": header, "emoji": False}},
                {"type": "divider"},
                *[self._block(a) for a in chunk],
            ]
            self._post(url, {
                # fallback text hiện trong push notification trên mobile
                "text": f"{header}: {len(chunk)} tín hiệu",
                "blocks": blocks,
            })
            if i + self.MAX_BLOCKS < len(alerts):
                time.sleep(1.2)  # webhook ~1 tin/giây/channel


def build_notifier(cfg) -> Notifier:
    if cfg.notifier == "telegram":
        return TelegramNotifier(
            cfg.telegram_token,
            {RSI_CHANNEL: cfg.rsi_chat_id, BANK_CHANNEL: cfg.bank_chat_id},
        )
    if cfg.notifier == "slack":
        return SlackNotifier(
            {RSI_CHANNEL: cfg.slack_rsi_webhook, BANK_CHANNEL: cfg.slack_bank_webhook}
        )
    return ConsoleNotifier()
