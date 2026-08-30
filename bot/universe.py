"""Danh sách VN100 và nhóm ngân hàng, đồng bộ định kỳ và cache 1 ngày."""
from __future__ import annotations

import logging
from datetime import datetime

from .config import CFG, TZ
from .store import Store

log = logging.getLogger(__name__)

FALLBACK_BANKS = [
    "ACB", "BID", "CTG", "EIB", "HDB", "LPB", "MBB", "MSB", "NAB",
    "OCB", "SHB", "SSB", "STB", "TCB", "TPB", "VCB", "VIB", "VPB",
]


def _fetch_universe() -> tuple[list[str], list[str]]:
    from vnstock import Listing

    listing = Listing(source=CFG.source)
    vn100 = sorted(set(listing.symbols_by_group("VN100")))

    try:
        ind = listing.symbols_by_industries()
        mask = ind["symbol"].isin(vn100) & ind["icb_name"].str.contains(
            "Ngân hàng", na=False
        )
        banks = sorted(set(ind.loc[mask, "symbol"]))
    except Exception as e:  # noqa: BLE001
        log.warning("Không lấy được phân ngành (%s), dùng danh sách ngân hàng dự phòng", e)
        banks = [b for b in FALLBACK_BANKS if b in vn100]

    if not banks:
        banks = [b for b in FALLBACK_BANKS if b in vn100]
    return vn100, banks


def get_universe(store: Store, force: bool = False) -> tuple[list[str], list[str]]:
    """Trả (vn100, banks). Chỉ gọi API tối đa 1 lần/ngày."""
    today = datetime.now(TZ).strftime("%Y-%m-%d")
    cached = store.get("universe")

    if not force and cached and cached.get("date") == today:
        return cached["vn100"], cached["banks"]

    try:
        vn100, banks = _fetch_universe()
        store.set("universe", {"date": today, "vn100": vn100, "banks": banks})
        log.info("Đồng bộ rổ: %d mã VN100, %d mã ngân hàng", len(vn100), len(banks))
        return vn100, banks
    except Exception as e:  # noqa: BLE001
        if cached:
            log.warning("Đồng bộ rổ thất bại (%s), dùng bản cache ngày %s",
                        e, cached.get("date"))
            return cached["vn100"], cached["banks"]
        raise
