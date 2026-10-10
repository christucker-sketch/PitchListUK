"""Producer-supplied source documents for V3 (V3-002 option B). PREPARED, NOT ENABLED.

V3 cannot fetch some hosts itself. For example, ukcraftfairs.com sends RFC-invalid response header lines, so
Cloudflare's edge answers 520. For hosts on an explicit allowlist, this module publishes the exact response body
the producer fetched. V3 can then run *its own* verifier on that document.

* Nothing here decides readiness. The producer only supplies bytes plus custody facts: the URL, final URL, fetch
  time, HTTP status, content type and sha256 of the body as fetched.
* Every document is the body behind a `provenance.sources[]` entry of a record already delivered to V3. The
  record's `content_sha256` and `fetched_at` therefore match the document exactly; the bytes are re-hashed before
  publishing and any mismatch is skipped.
* The discovery user writes the documents into the export tree (`export/v3/docs/`). The delivery user can then
  upload them without database access; the existing privilege split is unchanged.
"""
from __future__ import annotations

import datetime as dt
import glob
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from .. import storage

SCHEMA = "findpitches-source-document-v1"
MAX_BYTES = 2_000_000


def _host_matches(url: str, hosts: set[str]) -> bool:
    h = (urlparse(url or "").hostname or "").lower()
    return any(h == x or h.endswith("." + x) for x in hosts)


def _atomic_write(path: Path, data: bytes) -> None:
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def _body_for(conn, data_dir: Path, sha: str) -> tuple[bytes | None, dict]:
    row = conn.execute("SELECT url, final_url, content_type, http_status, cache_path FROM urls WHERE content_hash=? "
                       "AND cache_path IS NOT NULL ORDER BY fetched_at DESC LIMIT 1", (sha,)).fetchone()
    meta = dict(row) if row else {}
    paths = [meta["cache_path"]] if meta.get("cache_path") else []
    # content-addressed cache: the same body may also exist under its hash after compaction
    paths += [os.path.relpath(p, data_dir) for p in glob.glob(str(data_dir / "cache" / sha[:2] / f"{sha}.*"))]
    for rel in paths:
        body = storage.read_raw(data_dir, rel)
        if body is not None:
            return body, meta
    return None, meta


def build_v3_documents(conn, data_dir, root, hosts, records=None, now: dt.datetime | None = None) -> dict:
    """Write <root>/v3/docs/<sha256>.bin plus <root>/v3/docs-manifest.json for allowlisted hosts.

    `records` defaults to <root>/v3/feed.jsonl. Only `channel == current` records are covered, because V3 verifies
    those for readiness. Documents that are no longer referenced are removed. Returns counts."""
    data_dir, root = Path(data_dir), Path(root)
    hosts = {h.lower().lstrip(".") for h in hosts if h}
    if not hosts:
        return {"ok": False, "error": "no_hosts"}
    if records is None:
        feed = root / "v3" / "feed.jsonl"
        if not feed.exists():
            return {"ok": False, "error": "feed_missing"}
        records = [json.loads(l) for l in feed.read_text(encoding="utf-8").splitlines() if l.strip()]
    wanted: dict[str, dict] = {}
    for r in records:
        if r.get("channel") != "current":
            continue
        for s in (r.get("provenance") or {}).get("sources") or []:
            sha, url = s.get("content_sha256"), s.get("url")
            if not sha or not _host_matches(url, hosts):
                continue
            d = wanted.setdefault(sha, {"url": url, "fetched_at": s.get("fetched_at"),
                                        "http_status": s.get("http_status"), "producer_record_ids": set()})
            d["producer_record_ids"].add(r.get("opportunity_id"))
    out_dir = root / "v3" / "docs"
    out_dir.mkdir(parents=True, exist_ok=True)
    counts = {"referenced": len(wanted), "written": 0, "kept": 0, "missing_body": 0, "hash_mismatch": 0,
              "too_large": 0, "removed": 0}
    docs = []
    for sha in sorted(wanted):
        d = wanted[sha]
        target = out_dir / f"{sha}.bin"
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == sha:
            body, meta = None, dict(conn.execute("SELECT final_url, content_type FROM urls WHERE content_hash=? "
                                                 "ORDER BY fetched_at DESC LIMIT 1", (sha,)).fetchone() or {})
            size = target.stat().st_size
            counts["kept"] += 1
        else:
            body, meta = _body_for(conn, data_dir, sha)
            if body is None:
                counts["missing_body"] += 1
                continue
            if hashlib.sha256(body).hexdigest() != sha:
                counts["hash_mismatch"] += 1
                continue
            if len(body) > MAX_BYTES:
                counts["too_large"] += 1
                continue
            _atomic_write(target, body)
            size = len(body)
            counts["written"] += 1
        docs.append({"schema": SCHEMA, "content_sha256": sha, "url": d["url"],
                     "final_url": meta.get("final_url") or d["url"], "fetched_at": d["fetched_at"],
                     "http_status": d["http_status"], "content_type": meta.get("content_type"), "bytes": size,
                     "producer_record_ids": sorted(x for x in d["producer_record_ids"] if x),
                     "file": f"docs/{sha}.bin"})
    keep = {f"{x['content_sha256']}.bin" for x in docs}
    for p in out_dir.glob("*.bin"):
        if p.name not in keep:
            p.unlink()
            counts["removed"] += 1
    now = now or dt.datetime.now(dt.timezone.utc)
    manifest = {"schema": "findpitches-source-documents-manifest-v1",
                "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "hosts": sorted(hosts),
                "documents": docs, "counts": counts}
    _atomic_write(root / "v3" / "docs-manifest.json", (json.dumps(manifest, indent=1) + "\n").encode())
    return {"ok": True, "documents": len(docs), **counts}
