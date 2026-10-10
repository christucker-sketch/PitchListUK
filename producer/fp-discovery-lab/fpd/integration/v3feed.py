"""V3 delivery feed: current records PLUS lifecycle records for ids that have left `current`.

Why: the V3 runner reads one file. Until now that was full/current.jsonl, so when a record V3 already had
closed, moved to watch, failed the gate or was withdrawn, it simply stopped arriving. V3 kept the last
(open) version, and recheck requests for it could never be acknowledged.

This module writes  <export>/v3/feed.jsonl  (one file, replaced atomically, so the runner never sees a
half-updated pair):

  * every record in full/current.jsonl, unchanged;
  * for every id that has been in current.jsonl before and is not now, its latest exported record from
    integration_state (channel watch / held / retired, export_readiness WATCH / NOT_READY / RETIRED,
    lifecycle_event CLOSED / WITHDRAWN / STATE_CHANGED / ...), for `window_days` after it left current.

Records are the same findpitches-discovery-export-v1 records: no schema change. A consumer must show only
channel == "current" (export_readiness == "READY") and treat everything else as "not customer-visible".
Lifecycle records with a non-https source or application URL are left out (V3 rejects them).

Delivery of this file is OFF until it is switched on (sudo fpd-v3-feed enable on the Pi), because V3 has
to confirm it handles non-current records first. Writing it is harmless.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path

from .schema import RECORD_SCHEMA, validate

STATE_SQL = """
CREATE TABLE IF NOT EXISTS v3_feed_state (
    opportunity_id TEXT PRIMARY KEY,
    first_current_at REAL,
    last_current_at REAL,
    left_current_at REAL
);
"""


def _iter_jsonl(p: Path):
    try:
        with open(p, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        yield json.loads(line)
                    except ValueError:
                        continue
    except OSError:
        return


def _https(u) -> bool:
    return u is None or str(u).lower().startswith("https://")


def _backfill(conn, root: Path, now: float) -> int:
    """First run only: ids that were in `current` in any export still on disk count as already sent."""
    seen: dict[str, float] = {}
    files = list((root / "full" / "snapshots").glob("*/current.jsonl")) + list((root / "deltas").glob("*.jsonl"))
    for p in files:
        try:
            ts = p.stat().st_mtime
        except OSError:
            continue
        for r in _iter_jsonl(p):
            if r.get("channel") == "current" and r.get("opportunity_id"):
                oid = r["opportunity_id"]
                seen[oid] = max(seen.get(oid, 0), ts)
    conn.executemany("INSERT OR IGNORE INTO v3_feed_state(opportunity_id, first_current_at, last_current_at) "
                     "VALUES (?,?,?)", [(o, t, t) for o, t in seen.items()])
    return len(seen)


def build_v3_feed(conn, root: Path, now: float | None = None, window_days: int = 45) -> dict:
    root = Path(root)
    now = time.time() if now is None else now
    conn.executescript(STATE_SQL)
    cur_path = root / "full" / "current.jsonl"
    if not cur_path.exists():
        return {"ok": False, "error": "full/current.jsonl missing (run a full export first)"}
    current = list(_iter_jsonl(cur_path))
    cur_ids = {r["opportunity_id"] for r in current}
    backfilled = 0
    if conn.execute("SELECT COUNT(*) FROM v3_feed_state").fetchone()[0] == 0:
        backfilled = _backfill(conn, root, now)
    conn.executemany(
        "INSERT INTO v3_feed_state(opportunity_id, first_current_at, last_current_at, left_current_at) VALUES (?,?,?,NULL) "
        "ON CONFLICT(opportunity_id) DO UPDATE SET last_current_at=excluded.last_current_at, left_current_at=NULL",
        [(o, now, now) for o in cur_ids])
    gone = [r[0] for r in conn.execute("SELECT opportunity_id FROM v3_feed_state WHERE left_current_at IS NULL")
            if r[0] not in cur_ids]
    conn.executemany("UPDATE v3_feed_state SET left_current_at=? WHERE opportunity_id=?", [(now, o) for o in gone])
    cutoff = now - window_days * 86400
    lifecycle, skipped = [], {"no_engine_state": 0, "still_current_in_state": 0, "insecure_url": 0, "schema": 0}
    rows = conn.execute("SELECT opportunity_id FROM v3_feed_state WHERE left_current_at IS NOT NULL AND left_current_at>=? "
                        "ORDER BY opportunity_id", (cutoff,)).fetchall()
    for (oid,) in rows:
        if oid in cur_ids:
            continue
        st = conn.execute("SELECT channel, record_json FROM integration_state WHERE opportunity_id=?", (oid,)).fetchone()
        if not st or not st[1]:
            skipped["no_engine_state"] += 1
            continue
        rec = json.loads(st[1])
        if rec.get("channel") == "current":   # carried-forward bookkeeping; it is not in current.jsonl, skip
            skipped["still_current_in_state"] += 1
            continue
        if not (_https(rec.get("source_url")) and _https(rec.get("application_url"))):
            skipped["insecure_url"] += 1
            continue
        if validate(rec, RECORD_SCHEMA):
            skipped["schema"] += 1
            continue
        lifecycle.append(rec)
    conn.commit()
    out_dir = root / "v3"
    out_dir.mkdir(parents=True, exist_ok=True)
    tmp = out_dir / f".feed.{os.getpid()}.tmp"
    lines = [json.dumps(r, ensure_ascii=False, sort_keys=True) for r in current + lifecycle]
    body = ("\n".join(lines) + "\n").encode("utf-8") if lines else b""
    with open(tmp, "wb") as f:
        f.write(body)
        f.flush()
        os.fsync(f.fileno())
    os.chmod(tmp, 0o644)
    os.replace(tmp, out_dir / "feed.jsonl")
    from collections import Counter
    manifest = {
        "schema_version": "findpitches-v3-feed-v1",
        "record_schema": "findpitches-discovery-export-v1",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
        "file": "feed.jsonl", "sha256": hashlib.sha256(body).hexdigest(), "records": len(lines),
        "current": len(current), "lifecycle": len(lifecycle), "window_days": window_days,
        "lifecycle_by_channel": dict(Counter(r["channel"] for r in lifecycle)),
        "lifecycle_by_event": dict(Counter(r["lifecycle_event"] for r in lifecycle)),
        "lifecycle_by_state": dict(Counter(r["application_state"] for r in lifecycle)),
        "skipped": skipped, "backfilled_ids": backfilled, "left_current_this_run": len(gone),
    }
    mtmp = out_dir / f".manifest.{os.getpid()}.tmp"
    mtmp.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    os.chmod(mtmp, 0o644)
    os.replace(mtmp, out_dir / "feed-manifest.json")
    return {"ok": True, **{k: manifest[k] for k in ("records", "current", "lifecycle", "lifecycle_by_channel",
                                                    "lifecycle_by_event", "skipped", "backfilled_ids",
                                                    "left_current_this_run")}}
