"""SQLite storage: schema, connection, small helpers.

Design notes
- One file DB, WAL mode where the filesystem supports it.
- Every unit of work (a URL to fetch) lives in `urls` with an explicit state machine, so a
  crash/kill at any point can be resumed: leased rows whose lease expired go back to pending.
- Every classification decision is an immutable row in `assessments` (with features + evidence),
  so any accepted/rejected record can be audited after the fact.
- `opportunities` are resolved real-world entities; `opportunity_sources` links each to every
  page that mentions it (corroboration) — duplicates are merged, never thrown away.
"""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import time
from pathlib import Path

SCHEMA = r"""
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY,
    started_at REAL NOT NULL,
    ended_at REAL,
    command TEXT,
    args TEXT,
    status TEXT DEFAULT 'running',
    notes TEXT
);

CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at REAL
);

-- Work frontier + fetch record. One row per canonical URL.
CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    host TEXT NOT NULL,
    reg_domain TEXT NOT NULL,
    purpose TEXT NOT NULL,           -- site_home | candidate | sitemap | platform | directory | api | follow
    generator TEXT NOT NULL,         -- which discovery strategy produced it (for yield accounting)
    priority REAL NOT NULL DEFAULT 0.5,
    depth INTEGER NOT NULL DEFAULT 0,
    parent_id INTEGER,
    anchor TEXT,                     -- anchor text / reason it was enqueued
    meta TEXT,                       -- JSON hints from the generator (e.g. country, entity name)
    state TEXT NOT NULL DEFAULT 'pending',   -- pending | leased | done | failed | skipped
    attempts INTEGER NOT NULL DEFAULT 0,
    lease_until REAL,
    created_at REAL NOT NULL,
    created_run INTEGER,
    fetched_at REAL,
    fetch_run INTEGER,
    http_status INTEGER,
    final_url TEXT,
    content_type TEXT,
    bytes INTEGER,
    content_hash TEXT,
    cache_path TEXT,
    elapsed_ms INTEGER,
    last_error TEXT
);
CREATE INDEX IF NOT EXISTS ix_urls_state_prio ON urls(state, priority DESC);
CREATE INDEX IF NOT EXISTS ix_urls_reg ON urls(reg_domain);
CREATE INDEX IF NOT EXISTS ix_urls_gen ON urls(generator, state);

-- Per registrable-domain state (politeness, exploration budget, role).
CREATE TABLE IF NOT EXISTS sites (
    reg_domain TEXT PRIMARY KEY,
    first_seen REAL,
    origin_generator TEXT,
    role TEXT DEFAULT 'organiser',   -- organiser | platform | hub | blocked
    pages_enqueued INTEGER DEFAULT 0,
    pages_fetched INTEGER DEFAULT 0,
    best_label TEXT,
    country_hint TEXT,
    entity_name TEXT,
    robots_txt TEXT,
    robots_fetched_at REAL,
    sitemap_checked INTEGER DEFAULT 0,
    notes TEXT
);

-- Immutable classification decisions about a fetched page.
CREATE TABLE IF NOT EXISTS assessments (
    id INTEGER PRIMARY KEY,
    url_id INTEGER NOT NULL,
    run_id INTEGER,
    assessed_at REAL NOT NULL,
    classifier_version TEXT NOT NULL,
    label TEXT NOT NULL,             -- actionable | uncertain | rejected | hub
    reasons TEXT,                    -- JSON list of short reason codes
    score REAL,
    features TEXT,                   -- JSON feature vector
    evidence TEXT,                   -- JSON list of {kind, text} snippets quoted from the page
    extracted TEXT,                  -- JSON of extracted fields
    opportunity_id INTEGER
);
CREATE INDEX IF NOT EXISTS ix_assess_url ON assessments(url_id);
CREATE INDEX IF NOT EXISTS ix_assess_label ON assessments(label);

-- Resolved real-world opportunities.
CREATE TABLE IF NOT EXISTS opportunities (
    id INTEGER PRIMARY KEY,
    name TEXT,
    name_key TEXT,                   -- normalised name for matching
    organiser TEXT,
    country TEXT,
    region TEXT,
    locality TEXT,
    venue TEXT,
    start_date TEXT,
    end_date TEXT,
    recurrence TEXT,
    deadline TEXT,
    application_status TEXT,         -- open | closed | unknown
    event_types TEXT,                -- JSON list
    trader_types TEXT,               -- JSON list
    fees TEXT,
    apply_url TEXT,
    primary_url TEXT,
    status TEXT NOT NULL,            -- actionable | uncertain | rejected
    confidence REAL,
    reasons TEXT,
    n_sources INTEGER DEFAULT 1,
    n_domains INTEGER DEFAULT 1,
    first_seen REAL,
    last_checked REAL,
    first_run INTEGER,
    review_label TEXT,               -- human/LLM audit label (correct | wrong | unsure)
    review_note TEXT
);
CREATE INDEX IF NOT EXISTS ix_opp_key ON opportunities(country, name_key);
CREATE INDEX IF NOT EXISTS ix_opp_status ON opportunities(status);

CREATE TABLE IF NOT EXISTS opportunity_sources (
    opportunity_id INTEGER NOT NULL,
    url_id INTEGER NOT NULL,
    assessment_id INTEGER,
    role TEXT,                       -- primary | corroborating | application
    match_method TEXT,               -- new | apply_url | name_exact | name_fuzzy | same_page
    match_score REAL,
    added_at REAL,
    PRIMARY KEY (opportunity_id, url_id)
);

-- Telemetry: append-only event counters, per run & generator.
CREATE TABLE IF NOT EXISTS metrics (
    run_id INTEGER,
    generator TEXT,
    key TEXT,
    value REAL,
    PRIMARY KEY (run_id, generator, key)
);

CREATE TABLE IF NOT EXISTS errors (
    id INTEGER PRIMARY KEY,
    run_id INTEGER,
    ts REAL,
    stage TEXT,
    url TEXT,
    error_type TEXT,
    message TEXT
);

-- External API calls (Wikidata, Overpass, CDX, search APIs) for cost accounting.
CREATE TABLE IF NOT EXISTS api_calls (
    id INTEGER PRIMARY KEY,
    run_id INTEGER,
    ts REAL,
    api TEXT,
    request TEXT,
    status INTEGER,
    results INTEGER,
    elapsed_ms INTEGER,
    error TEXT
);
"""


def connect(path: str | os.PathLike) -> sqlite3.Connection:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=60, isolation_level=None)
    conn.row_factory = sqlite3.Row
    try:
        mode = conn.execute("PRAGMA journal_mode=WAL").fetchone()[0]
    except sqlite3.OperationalError:
        mode = conn.execute("PRAGMA journal_mode=TRUNCATE").fetchone()[0]
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=OFF")
    conn.executescript(SCHEMA)
    # lightweight migrations
    cols = {r[1] for r in conn.execute("PRAGMA table_info(sites)")}
    if "next_date" not in cols:
        conn.execute("ALTER TABLE sites ADD COLUMN next_date TEXT")
    from .watch import migrate as _m
    _m(conn)
    return conn


def snapshot(conn: sqlite3.Connection, dest: str | os.PathLike) -> None:
    """Consistent copy of the live DB into `dest` (e.g. a synced user folder).

    Written as a plain rollback-journal file via VACUUM INTO on local disk, then copied
    byte-for-byte, so the destination filesystem never has to support WAL or locking."""
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    local_tmp = Path(str(conn.execute("PRAGMA database_list").fetchone()[2]) + ".snap")
    if local_tmp.exists():
        local_tmp.unlink()
    conn.execute("VACUUM INTO ?", (str(local_tmp),))
    t = sqlite3.connect(str(local_tmp))
    t.execute("PRAGMA journal_mode=DELETE")
    t.close()
    shutil.copyfile(local_tmp, dest)
    local_tmp.unlink()


def restore_if_missing(live: Path, snap: Path) -> bool:
    if not live.exists() and snap.exists():
        live.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(snap, live)
        return True
    return False


class Telemetry:
    """Buffered counters flushed to `metrics`. Keys are free-form; generator '' = global."""

    def __init__(self, conn: sqlite3.Connection, run_id: int):
        self.conn = conn
        self.run_id = run_id
        self.buf: dict[tuple[str, str], float] = {}

    def inc(self, key: str, n: float = 1, generator: str = "") -> None:
        k = (generator, key)
        self.buf[k] = self.buf.get(k, 0) + n

    def flush(self) -> None:
        if not self.buf:
            return
        rows = [(self.run_id, g, k, v) for (g, k), v in self.buf.items()]
        self.conn.executemany(
            "INSERT INTO metrics(run_id, generator, key, value) VALUES (?,?,?,?) "
            "ON CONFLICT(run_id, generator, key) DO UPDATE SET value = value + excluded.value",
            rows,
        )
        self.buf.clear()

    def error(self, stage: str, url: str | None, exc: BaseException | str) -> None:
        et = type(exc).__name__ if isinstance(exc, BaseException) else "Error"
        self.conn.execute(
            "INSERT INTO errors(run_id, ts, stage, url, error_type, message) VALUES (?,?,?,?,?,?)",
            (self.run_id, time.time(), stage, url, et, str(exc)[:500]),
        )
        self.inc(f"error.{stage}")

    def api(self, api: str, request: str, status: int | None, results: int, elapsed_ms: int,
            error: str | None = None) -> None:
        self.conn.execute(
            "INSERT INTO api_calls(run_id, ts, api, request, status, results, elapsed_ms, error) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (self.run_id, time.time(), api, request[:2000], status, results, elapsed_ms, error),
        )
        self.inc(f"api.{api}.calls")


def kv_get(conn, key, default=None):
    r = conn.execute("SELECT value FROM kv WHERE key=?", (key,)).fetchone()
    return json.loads(r[0]) if r else default


def kv_set(conn, key, value):
    conn.execute(
        "INSERT INTO kv(key, value, updated_at) VALUES (?,?,?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
        (key, json.dumps(value), time.time()),
    )
