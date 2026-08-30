"""SQLite: vừa làm cache OHLCV, vừa lưu trạng thái cảnh báo đã gửi."""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import pandas as pd

SCHEMA = """
CREATE TABLE IF NOT EXISTS ohlcv (
    symbol   TEXT NOT NULL,
    interval TEXT NOT NULL,
    time     TEXT NOT NULL,
    open     REAL, high REAL, low REAL, close REAL, volume REAL,
    PRIMARY KEY (symbol, interval, time)
);
CREATE INDEX IF NOT EXISTS idx_ohlcv_lookup ON ohlcv(symbol, interval, time);

CREATE TABLE IF NOT EXISTS state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alert_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        TEXT NOT NULL DEFAULT (datetime('now')),
    channel   TEXT NOT NULL,
    symbol    TEXT NOT NULL,
    kind      TEXT NOT NULL,
    payload   TEXT
);
"""


class Store:
    def __init__(self, path: str):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with self.conn() as c:
            c.executescript(SCHEMA)

    @contextmanager
    def conn(self):
        con = sqlite3.connect(self.path, timeout=30)
        con.row_factory = sqlite3.Row
        try:
            yield con
            con.commit()
        finally:
            con.close()

    # ---------- OHLCV cache ----------
    def upsert_ohlcv(self, symbol: str, interval: str, df: pd.DataFrame) -> None:
        if df is None or df.empty:
            return
        rows = [
            (symbol, interval, str(r.time), r.open, r.high, r.low, r.close, r.volume)
            for r in df.itertuples()
        ]
        with self.conn() as c:
            c.executemany(
                "INSERT OR REPLACE INTO ohlcv "
                "(symbol,interval,time,open,high,low,close,volume) "
                "VALUES (?,?,?,?,?,?,?,?)",
                rows,
            )

    def get_ohlcv(self, symbol: str, interval: str, limit: int | None = None) -> pd.DataFrame:
        q = ("SELECT time,open,high,low,close,volume FROM ohlcv "
             "WHERE symbol=? AND interval=? ORDER BY time")
        with self.conn() as c:
            df = pd.read_sql_query(q, c, params=(symbol, interval))
        if df.empty:
            return df
        df["time"] = pd.to_datetime(df["time"])
        return df.tail(limit) if limit else df

    def last_bar_time(self, symbol: str, interval: str) -> str | None:
        with self.conn() as c:
            row = c.execute(
                "SELECT MAX(time) AS t FROM ohlcv WHERE symbol=? AND interval=?",
                (symbol, interval),
            ).fetchone()
        return row["t"] if row and row["t"] else None

    # ---------- Key-value state ----------
    def get(self, key: str, default: Any = None) -> Any:
        with self.conn() as c:
            row = c.execute("SELECT value FROM state WHERE key=?", (key,)).fetchone()
        return json.loads(row["value"]) if row else default

    def set(self, key: str, value: Any) -> None:
        with self.conn() as c:
            c.execute(
                "INSERT INTO state(key,value,updated_at) VALUES(?,?,datetime('now')) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                (key, json.dumps(value, ensure_ascii=False)),
            )

    def log_alert(self, channel: str, symbol: str, kind: str, payload: dict) -> None:
        with self.conn() as c:
            c.execute(
                "INSERT INTO alert_log(channel,symbol,kind,payload) VALUES(?,?,?,?)",
                (channel, symbol, kind, json.dumps(payload, ensure_ascii=False)),
            )
