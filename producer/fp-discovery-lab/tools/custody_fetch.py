"""Bounded source-custody fetch (D-017): fetch named official pages ONCE with the producer's polite fetcher and keep
the full raw response bodies plus an exact custody manifest, for verification by V3 (Codex) and adapter work (Claude).

Run on the Pi from the installed engine (reads nothing from and writes nothing to the producer database):

    cd /opt/fpd/app && set -a && . /etc/fpd/fpd.env && set +a && \
      PYTHONPATH=/opt/fpd/app /opt/fpd/venv/bin/python ~/uk-custody/custody_fetch.py \
        --seeds ~/uk-custody/seeds.json --out ~/uk-custody/run-$(date -u +%Y%m%dT%H%MZ)

Seeds file: {"max_fetches": 150, "seeds": [{"id": "...", "url": "...", "nation": "SCO|WAL|NI|ENG", "lane": "...",
  "follow": "<regex on link URL or text>", "depth": 0-2, "children": 0-5, "sitemap": false}]}
* depth 1 follows matching links from the seed (any host, e.g. hub -> organiser); depth 2 follows matching links from
  those children on the child's own host only (event -> application). At most `children` links per page.
* sitemap: true reads the site's robots.txt / sitemap(s) and treats matching URLs as depth-1 children.
* robots.txt is honoured (Fetcher), the producer User-Agent and per-host delay are used, every URL is fetched at most
  once, social/ticketing/login hosts are never fetched (discovery-only), and nothing is retried.
Outputs: <out>/docs/<sha256>.bin (exact bytes), <out>/manifest.jsonl (one custody row per request, including failures),
<out>/summary.json. No secrets are read or written.
"""
from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urldefrag, urlsplit

from fpd.config import Config
from fpd.fetch import Fetcher
from fpd.parse import parse_html

DISCOVERY_ONLY = re.compile(r"(^|\.)(facebook|fb|instagram|twitter|x|tiktok|youtube|linkedin|pinterest|eventbrite|"
                            r"ticketmaster|skiddle|seetickets|google|goo|bit|linktr)\.[a-z.]+$", re.I)
NEVER = re.compile(r"/(wp-admin|wp-login|login|signin|sign-in|account|cart|checkout|my-account)\b|\.(jpg|jpeg|png|gif|webp|"
                   r"svg|zip|mp4|mp3)(\?|$)", re.I)


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def host(u: str) -> str:
    return urlsplit(u).netloc.lower()


async def run(seeds_file: Path, out: Path) -> dict:
    spec = json.loads(seeds_file.read_text())
    cap = int(spec.get("max_fetches", 150))
    cfg = Config.from_env()
    cfg.concurrency = 2
    f = Fetcher(cfg)
    (out / "docs").mkdir(parents=True, exist_ok=True)
    manifest = (out / "manifest.jsonl").open("w")
    seen: set[str] = set()
    stats = {"requests": 0, "ok": 0, "http_errors": {}, "robots_blocked": 0, "skipped_discovery_only": 0, "skipped_cap": 0}

    async def fetch(url: str, seed: dict, depth: int, parent: str | None, via: str) -> tuple[dict, object | None]:
        url = urldefrag(url)[0]
        row = {"seed_id": seed["id"], "nation": seed.get("nation"), "lane": seed.get("lane"), "depth": depth,
               "parent_url": parent, "via": via, "requested_url": url}
        if url in seen:
            return row | {"skipped": "already_fetched"}, None
        if DISCOVERY_ONLY.search(host(url)) or NEVER.search(url):
            stats["skipped_discovery_only"] += 1
            row |= {"skipped": "discovery_only_or_excluded"}
            manifest.write(json.dumps(row) + "\n")
            return row, None
        if stats["requests"] >= cap:
            stats["skipped_cap"] += 1
            row |= {"skipped": "fetch_cap"}
            manifest.write(json.dumps(row) + "\n")
            return row, None
        seen.add(url)
        stats["requests"] += 1
        res = await f.get(url)
        row |= {"fetched_at": now(), "final_url": res.final_url, "http_status": res.status, "content_type": res.content_type,
                "error": res.error, "robots_blocked": res.robots_blocked, "elapsed_ms": res.elapsed_ms}
        page = None
        if res.robots_blocked:
            stats["robots_blocked"] += 1
        if res.body:
            sha = hashlib.sha256(res.body).hexdigest()
            (out / "docs" / f"{sha}.bin").write_bytes(res.body)
            row |= {"content_sha256": sha, "bytes": len(res.body), "file": f"docs/{sha}.bin"}
            if "html" in (res.content_type or "").lower() or res.body.lstrip()[:1] == b"<":
                page = parse_html(res.body, res.final_url or url)
                row |= {"title": (page.title or "")[:200], "h1": (page.h1 or "")[:200]}
        if res.ok:
            stats["ok"] += 1
        elif res.status:
            stats["http_errors"][str(res.status)] = stats["http_errors"].get(str(res.status), 0) + 1
        manifest.write(json.dumps(row) + "\n")
        manifest.flush()
        return row, (page if res.ok else None)

    def pick(page, rx: re.Pattern, limit: int, same_host: str | None) -> list[str]:
        out_links, got = [], set()
        for l in page.links:
            u = urldefrag(l.url or "")[0]
            if not u.startswith("http") or u in got or u == page.url:
                continue
            if same_host and host(u) != same_host:
                continue
            if rx.search(u) or rx.search(l.text or ""):
                got.add(u)
                out_links.append(u)
            if len(out_links) >= limit:
                break
        return out_links

    async def sitemap_children(seed: dict, rx: re.Pattern, limit: int) -> list[str]:
        base = f"{urlsplit(seed['url']).scheme}://{host(seed['url'])}"
        await f.allowed(seed["url"])  # loads robots.txt (and its Sitemap: lines)
        maps = f.sitemaps_from_robots(seed["url"]) or [base + "/sitemap.xml", base + "/wp-sitemap.xml", base + "/sitemap_index.xml"]
        urls: list[str] = []
        for sm in maps[:3]:
            row, _ = await fetch(sm, seed, 1, seed["url"], "sitemap")
            body = (out / row["file"]).read_bytes().decode("utf-8", "replace") if row.get("file") else ""
            locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", body)
            subs = [u for u in locs if u.endswith(".xml")]
            pages = [u for u in locs if not u.endswith(".xml")]
            for sub in [u for u in subs if re.search(r"(event|page|post|product|market|fair)", u, re.I)][:3]:
                r2, _ = await fetch(sub, seed, 1, sm, "sitemap")
                b2 = (out / r2["file"]).read_bytes().decode("utf-8", "replace") if r2.get("file") else ""
                pages += re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", b2)
            urls += [u for u in pages if rx.search(u)]
            if urls:
                break
        return list(dict.fromkeys(urls))[:limit]

    for seed in spec["seeds"]:
        rx = re.compile(seed.get("follow") or r"$^", re.I)
        depth, kids = min(int(seed.get("depth", 1)), 2), min(int(seed.get("children", 5)), 5)
        _, page = await fetch(seed["url"], seed, 0, None, "seed")
        level1 = []
        if depth >= 1:
            if seed.get("sitemap"):
                level1 = await sitemap_children(seed, rx, max(kids, int(seed.get("sitemap_children", kids))))
            if page is not None:
                level1 += [u for u in pick(page, rx, kids, None) if u not in level1]
        for u in level1:
            _, child = await fetch(u, seed, 1, seed["url"], "link")
            if depth >= 2 and child is not None:
                for v in pick(child, rx, kids, host(child.url)):
                    await fetch(v, seed, 2, child.url, "link")
    manifest.close()
    await f.close()
    summary = {"schema": "findpitches-custody-fetch-v1", "finished_at": now(), "user_agent": cfg.user_agent,
               "seeds": len(spec["seeds"]), "max_fetches": cap, **stats}
    (out / "summary.json").write_text(json.dumps(summary, indent=1))
    return summary


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args()
    if a.out.exists() and any(a.out.iterdir()):
        sys.exit(f"{a.out} is not empty")
    print(json.dumps(asyncio.run(run(a.seeds, a.out)), indent=1))


if __name__ == "__main__":
    main()
