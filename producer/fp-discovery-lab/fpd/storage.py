"""Raw-evidence storage: reading, and selective compaction.

Policy (round 2):
  * Pages that matter for audit or re-classification keep their full raw HTML:
      - any page linked to an opportunity (evidence),
      - hub/listing pages,
      - any page whose last assessment showed a vendor signal.
    These are re-compressed with zstd level 19 using a dictionary trained on the corpus
    (≈27% smaller than gzip on this corpus; boilerplate-heavy platform pages compress very well).
  * Every other page (no vendor signal, rejected) is reduced to a structured extract — title, h1,
    first 2,000 characters of visible text, content hash, final URL, label and reasons — stored in
    `page_extracts`. The decision that rejected it remains fully explained by its `assessments` row.
Content addressing (sha256) already de-duplicates identical pages.
"""
from __future__ import annotations

import gzip
import json
import os
import time
from pathlib import Path

EXTRACTS_SCHEMA = """
CREATE TABLE IF NOT EXISTS page_extracts (
    url_id INTEGER PRIMARY KEY,
    content_hash TEXT,
    title TEXT,
    h1 TEXT,
    text_head TEXT,
    bytes_original INTEGER,
    compacted_at REAL
);
"""

_DICTS: dict[str, object] = {}


def read_raw(data_dir: str | os.PathLike, cache_path: str) -> bytes | None:
    p = Path(data_dir) / cache_path
    if not p.exists():
        return None
    if p.suffix == ".gz":
        with gzip.open(p, "rb") as f:
            return f.read()
    if p.suffix == ".zst":
        import zstandard as zstd
        raw = p.read_bytes()
        dict_id = cache_path.split(".")[-2]  # <hash>.<dictid>.zst
        d = _DICTS.get(dict_id)
        if d is None:
            d = zstd.ZstdCompressionDict((Path(data_dir) / "cache" / f"dict-{dict_id}.zdict").read_bytes())
            _DICTS[dict_id] = d
        return zstd.ZstdDecompressor(dict_data=d).decompress(raw)
    return p.read_bytes()


def compact(conn, data_dir, max_seconds: float = 140, dry_run: bool = False) -> dict:
    import zstandard as zstd
    from .parse import parse_html
    data_dir = Path(data_dir)
    conn.executescript(EXTRACTS_SCHEMA)
    t_end = time.monotonic() + max_seconds
    keep_sql = """SELECT u.id, u.cache_path, u.final_url, u.url,
        (SELECT COUNT(*) FROM opportunity_sources s WHERE s.url_id=u.id) linked, a.label,
        json_extract(a.features,'$.vendor_signal') v
        FROM urls u LEFT JOIN assessments a ON a.id=(SELECT MAX(id) FROM assessments WHERE url_id=u.id)
        WHERE u.cache_path LIKE '%.gz'"""
    rows = conn.execute(keep_sql).fetchall()
    keep = [r for r in rows if r["linked"] or r["label"] == "hub" or (r["v"] and r["v"] != "none")]
    drop = [r for r in rows if not (r["linked"] or r["label"] == "hub" or (r["v"] and r["v"] != "none"))]
    stats = {"remaining_keep": len(keep), "remaining_drop": len(drop)}
    if dry_run:
        stats["keep_bytes"] = sum(os.path.getsize(data_dir / r["cache_path"]) for r in keep if (data_dir / r["cache_path"]).exists())
        stats["drop_bytes"] = sum(os.path.getsize(data_dir / r["cache_path"]) for r in drop if (data_dir / r["cache_path"]).exists())
        return stats
    # dictionary (trained once, reused)
    dict_id = (conn.execute("SELECT value FROM kv WHERE key='storage.dict_id'").fetchone() or [None])[0]
    dict_id = json.loads(dict_id) if dict_id else None
    if not dict_id:
        samples = []
        for r in keep[:: max(1, len(keep) // 1500)][:1500]:
            b = read_raw(data_dir, r["cache_path"])
            if b:
                samples.append(b[:200_000])
        d = zstd.train_dictionary(112_640, samples)
        dict_id = str(d.dict_id())
        (data_dir / "cache" / f"dict-{dict_id}.zdict").write_bytes(d.as_bytes())
        conn.execute("INSERT OR REPLACE INTO kv(key,value,updated_at) VALUES ('storage.dict_id',?,?)",
                     (json.dumps(dict_id), time.time()))
    zd = zstd.ZstdCompressionDict((data_dir / "cache" / f"dict-{dict_id}.zdict").read_bytes())
    cz = zstd.ZstdCompressor(level=19, dict_data=zd)
    done_k = done_d = saved = 0
    for r in keep:
        if time.monotonic() > t_end:
            break
        src = data_dir / r["cache_path"]
        b = read_raw(data_dir, r["cache_path"])
        if b is None:
            continue
        new_rel = r["cache_path"][:-3] + f".{dict_id}.zst"
        dst = data_dir / new_rel
        if not dst.exists():
            dst.write_bytes(cz.compress(b))
        saved += src.stat().st_size - dst.stat().st_size
        conn.execute("UPDATE urls SET cache_path=? WHERE cache_path=?", (new_rel, r["cache_path"]))
        src.unlink(missing_ok=True)
        done_k += 1
    for r in drop:
        if time.monotonic() > t_end:
            break
        src = data_dir / r["cache_path"]
        b = read_raw(data_dir, r["cache_path"])
        if b is not None:
            try:
                pg = parse_html(b.decode("utf-8", errors="replace"), r["final_url"] or r["url"])
                conn.execute("INSERT OR REPLACE INTO page_extracts VALUES (?,?,?,?,?,?,?)",
                             (r["id"], src.name.split(".")[0], pg.title[:300], pg.h1[:300], pg.text[:2000], len(b), time.time()))
            except Exception:  # noqa: BLE001
                conn.execute("INSERT OR REPLACE INTO page_extracts VALUES (?,?,?,?,?,?,?)",
                             (r["id"], src.name.split(".")[0], None, None, None, len(b), time.time()))
            saved += src.stat().st_size
        # several URLs can share one content hash: only delete when no kept row references the file
        still = conn.execute("SELECT COUNT(*) FROM urls WHERE cache_path=? AND id!=?", (r["cache_path"], r["id"])).fetchone()[0]
        conn.execute("UPDATE urls SET cache_path=NULL WHERE id=?", (r["id"],))
        if not still:
            src.unlink(missing_ok=True)
        done_d += 1
    stats.update(recompressed=done_k, extracted_and_dropped=done_d, bytes_saved_this_pass=saved)
    return stats
