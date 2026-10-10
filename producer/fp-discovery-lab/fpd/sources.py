"""Ongoing operation of the platform acquisition lanes (Eventeny, LocalStalls, ClueMart, UKCraftFairs).

Each platform source is operated as: INDEX -> PLAN -> CRAWL -> RECORD.

INDEX   Enumerate the platform's item list without fetching item pages: sitemap(s) for Eventeny,
        LocalStalls and ClueMart; an ID window probe for UKCraftFairs. Items are upserted into
        `platform_index` with their native id and the platform's `lastmod`, so the full population is
        known and progress through it is measurable.
PLAN    Choose a bounded set of item pages to fetch this run:
          * changed  - previously fetched items whose sitemap lastmod is newer than our fetch;
          * new      - never-fetched items, newest native id first (most likely to be current);
          * revisit  - items behind usable/watch records whose next check is due.
        Old, unchanged, already-fetched listings are never refetched just because they exist.
CRAWL   The normal crawler, restricted to this source's lane (politeness, robots.txt, leases,
        resume-after-kill all apply unchanged).
RECORD  A `source_polls` row per run: indexed, enqueued (new/changed/revisit), fetched, ok, errors,
        rate-limited responses, and the usable-yield of the newly fetched items.

Enumeration is resumable because both the index and the frontier live in SQLite: an interrupted run
leaves leased rows that return to pending, and the next PLAN continues below the lowest id already
enqueued.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import re
import time

from .urlutil import canonicalize

SOURCES = {
    "eventeny": {
        "kind": "sitemap", "generator": "platform:eventeny",
        "sitemaps": ["https://www.eventeny.com/sitemap.xml"], "child_pattern": r"event_elements",
        "item_pattern": r"eventeny\.com/events/vendor/\?id=(\d+)", "country": None,
        "default_max_new": 600,
    },
    "localstalls": {
        "kind": "sitemap", "generator": "platform:localstalls",
        "sitemaps": ["https://localstalls.com/sitemap.xml"], "child_pattern": r"events-(?:au|nz|uk|us)-",
        "item_pattern": r"localstalls\.com/((?:au|nz|uk|us)/event/[^/]+/[^/?#]+)$",
        "country_from_path": {"/au/event/": "AU", "/nz/event/": "NZ", "/uk/event/": "GB", "/us/event/": "US"},
        "default_max_new": 400,
    },
    "cluemart": {
        "kind": "sitemap", "generator": "platform:cluemart",
        "sitemaps": ["https://cluemart.co.nz/sitemap.xml"], "child_pattern": r".",
        "item_pattern": r"cluemart\.co\.nz/application/([a-z0-9\-]+)", "country": "NZ",
        "default_max_new": 200,
    },
    "marketspread": {
        "kind": "sitemap", "generator": "platform:marketspread",
        "sitemaps": ["https://marketspread.com/sitemap.xml"], "child_pattern": r"sitemap-markets",
        "item_pattern": r"marketspread\.com/market/(\d+)/[^/?#]+/?$", "country": None,
        "max_children": 140, "default_max_new": 300,
        # Only ~5% of listed markets take applications on the platform and that is unrelated to id age,
        # so every market page is visited once (newest first) instead of sampling below a yield floor.
        "yield_floor": False, "refetch_pre_adapter": True,
    },
    "ukcraftfairs": {
        "kind": "idwindow", "generator": "platform:ukcraftfairs",
        "template": "https://www.ukcraftfairs.com/craft-events/{id}/x",
        "item_pattern": r"ukcraftfairs\.com/craft-events/(\d+)", "country": "GB",
        "probe_ahead": 150, "default_max_new": 300,
        # Live fairs are scattered across thousands of ids (organisers list months ahead; expired ids are gone),
        # so the full live population comes from the per-day calendar pages, not from the id window alone.
        "calendar": "https://www.ukcraftfairs.com/calendar/{day}-{month}-{year}", "calendar_days": 365,
        "calendar_per_run": 365, "calendar_near_days": 21,
        "yield_floor": False,  # calendar-listed ids are known to be live; never probe-sample them
    },
}
SOURCE_IDS = sorted(SOURCES)

SCHEMA = """
CREATE TABLE IF NOT EXISTS platform_index (
    platform TEXT NOT NULL,
    item_url TEXT NOT NULL,
    native_id TEXT,
    num_id INTEGER,
    lastmod TEXT,
    first_listed REAL,
    last_listed REAL,
    PRIMARY KEY (platform, item_url)
);
CREATE INDEX IF NOT EXISTS ix_pidx_num ON platform_index(platform, num_id DESC);
CREATE TABLE IF NOT EXISTS source_polls (
    id INTEGER PRIMARY KEY,
    source TEXT NOT NULL,
    run_id INTEGER,
    started_at REAL,
    finished_at REAL,
    status TEXT,
    indexed INTEGER DEFAULT 0,
    enqueued_new INTEGER DEFAULT 0,
    enqueued_changed INTEGER DEFAULT 0,
    enqueued_revisit INTEGER DEFAULT 0,
    fetched INTEGER DEFAULT 0,
    fetched_ok INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    rate_limited INTEGER DEFAULT 0,
    new_items_usable INTEGER DEFAULT 0,
    notes TEXT
);
"""

LOC = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>")
URLBLOCK = re.compile(r"<url>(.*?)</url>", re.S)
LASTMOD = re.compile(r"<lastmod>\s*([^<\s]+)")


def migrate(conn) -> None:
    conn.executescript(SCHEMA)


def parse_sitemap(xml: str, item_rx: re.Pattern, child_rx: re.Pattern | None):
    """Return (items[(url, native_id, lastmod)], child_sitemaps[url])."""
    items, children = [], []
    if "<sitemapindex" in xml[:3000].lower():
        for u in LOC.findall(xml):
            u = u.replace("&amp;", "&")
            if child_rx is None or child_rx.search(u):
                children.append(u)
        return items, children
    for block in URLBLOCK.findall(xml):
        lm = LOC.search(block)
        if not lm:
            continue
        u = lm.group(1).replace("&amp;", "&")
        m = item_rx.search(u)
        if not m:
            continue
        mod = LASTMOD.search(block)
        items.append((u, m.group(1), mod.group(1)[:19] if mod else None))
    return items, children


def _num(native: str):
    return int(native) if native and native.isdigit() else None


async def _fetch_all(cfg, urls):
    from .fetch import Fetcher
    f = Fetcher(cfg)
    out = {}
    try:
        for u in urls:
            out[u] = await f.get(u, max_bytes=60_000_000)
    finally:
        await f.close()
    return out


def index_source(conn, cfg, source: str, max_children: int = 50) -> dict:
    """Refresh `platform_index` for a sitemap source (bounded: at most `max_children` child sitemaps)."""
    spec = SOURCES[source]
    migrate(conn)
    if spec["kind"] == "idwindow":
        res = index_idwindow(conn, source)
        if spec.get("calendar"):
            res["calendar"] = index_calendar(conn, cfg, source)
            res["index_total"] = conn.execute("SELECT COUNT(*) FROM platform_index WHERE platform=?",
                                              (source,)).fetchone()[0]
        return res
    item_rx = re.compile(spec["item_pattern"])
    child_rx = re.compile(spec["child_pattern"]) if spec.get("child_pattern") else None
    queue, seen, n_items, errors = list(spec["sitemaps"]), set(), 0, []
    now = time.time()
    max_children = spec.get("max_children", max_children)
    while queue and len(seen) < max_children + len(spec["sitemaps"]):
        batch = [u for u in queue if u not in seen][:5]
        queue = [u for u in queue if u not in batch]
        if not batch:
            break
        res = asyncio.run(_fetch_all(cfg, batch))
        for u, r in res.items():
            seen.add(u)
            if not r.ok:
                errors.append(f"{u}: {r.error or r.status}")
                continue
            items, children = parse_sitemap(r.text(), item_rx, child_rx)
            queue.extend(c for c in children if c not in seen)
            for iu, native, lm in items:
                cu = canonicalize(iu) or iu
                conn.execute(
                    "INSERT INTO platform_index(platform,item_url,native_id,num_id,lastmod,first_listed,last_listed) "
                    "VALUES (?,?,?,?,?,?,?) ON CONFLICT(platform,item_url) DO UPDATE SET lastmod=excluded.lastmod, "
                    "last_listed=excluded.last_listed", (source, cu, native, _num(native), lm, now, now))
                n_items += 1
    conn.commit()
    total = conn.execute("SELECT COUNT(*) FROM platform_index WHERE platform=?", (source,)).fetchone()[0]
    return {"source": source, "sitemaps_read": len(seen), "items_listed_this_run": n_items, "index_total": total,
            "errors": errors}


def index_idwindow(conn, source: str) -> dict:
    """UKCraftFairs-style sequential ids: extend the index `probe_ahead` ids past the highest live id."""
    spec = SOURCES[source]
    rx = re.compile(spec["item_pattern"])
    best = 0
    # 'live' = the page parsed as a real listing (the platform adapter recognised it). Unassigned ids return
    # HTTP 200 with a generic search page, so status codes alone cannot be trusted.
    for (u,) in conn.execute(
            "SELECT u.url FROM urls u JOIN assessments a ON a.id=(SELECT MAX(id) FROM assessments WHERE url_id=u.id) "
            "WHERE u.generator=? AND u.state='done' AND json_extract(a.features,'$.adapter') IS NOT NULL",
            (spec["generator"],)):
        m = rx.search(u)
        if m:
            best = max(best, int(m.group(1)))
    if not best:
        return {"source": source, "index_total": 0, "errors": ["no live ids known yet; seed the id range first"]}
    now = time.time()
    retried = 0
    for i in range(best - 50, best + spec["probe_ahead"]):
        u = canonicalize(spec["template"].format(id=i)) or spec["template"].format(id=i)
        conn.execute("INSERT OR IGNORE INTO platform_index(platform,item_url,native_id,num_id,lastmod,first_listed,"
                     "last_listed) VALUES (?,?,?,?,?,?,?)", (source, u, str(i), i, None, now, now))
        if i > best:
            # ids above the newest live listing that were not yet assigned are re-probed at most daily
            retried += conn.execute(
                "UPDATE urls SET state='pending', attempts=0, priority=0.85 WHERE url=? AND state IN ('done','failed') "
                "AND fetched_at < ?", (u, now - 20 * 3600)).rowcount
    conn.commit()
    total = conn.execute("SELECT COUNT(*) FROM platform_index WHERE platform=?", (source,)).fetchone()[0]
    return {"source": source, "highest_live_id": best, "index_total": total, "reprobed_unassigned_ids": retried,
            "errors": []}


MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
          "november", "december"]


def index_calendar(conn, cfg, source: str, fetch_all=None) -> dict:
    """Enumerate live listings from a platform's per-day calendar pages (UKCraftFairs).

    Rolling and bounded: each call reads at most `calendar_per_run` day pages. The next `calendar_near_days`
    days are re-read when older than 20 h, later days when older than 4 days, so the full year ahead is swept
    every few days while the coming weeks stay fresh. Every listed id is upserted into `platform_index` with
    lastmod='calendar' (a marker, not a date) so planning can tell calendar-listed live ids from id-window probes."""
    from . import db as dbm
    spec = SOURCES[source]
    fetch_all = fetch_all or _fetch_all
    rx = re.compile(r"/craft-events/(\d+)/")
    today = getattr(cfg, "today", None) or dt.date.today()
    now = time.time()
    key = f"calendar.{source}"
    seen = {k: v for k, v in (dbm.kv_get(conn, key, {}) or {}).items() if k >= today.isoformat()}
    due = []
    for i in range(spec.get("calendar_days", 365)):
        d = today + dt.timedelta(days=i)
        near = i < spec.get("calendar_near_days", 21)
        if now - seen.get(d.isoformat(), 0) > (20 * 3600 if near else 4 * 86400):
            due.append((not near, seen.get(d.isoformat(), 0), d))
    due.sort(key=lambda t: (t[0], t[1], t[2]))
    days = [d for _, _, d in due[:spec.get("calendar_per_run", 150)]]
    urls = {spec["calendar"].format(day=d.day, month=MONTHS[d.month - 1], year=d.year): d for d in days}
    res = asyncio.run(fetch_all(cfg, list(urls))) if urls else {}
    listed, new_ids, errors = set(), 0, []
    for u, r in res.items():
        if not r.ok:
            errors.append(f"{u}: {r.error or r.status}")
            continue
        for native in set(rx.findall(r.text())):
            listed.add(native)
            item = canonicalize(spec["template"].format(id=native)) or spec["template"].format(id=native)
            if conn.execute("SELECT 1 FROM platform_index WHERE platform=? AND item_url=?", (source, item)).fetchone():
                conn.execute("UPDATE platform_index SET last_listed=?, lastmod='calendar' WHERE platform=? AND item_url=?",
                             (now, source, item))
            else:
                conn.execute("INSERT INTO platform_index(platform,item_url,native_id,num_id,lastmod,first_listed,"
                             "last_listed) VALUES (?,?,?,?,?,?,?)", (source, item, native, int(native), "calendar", now, now))
                new_ids += 1
        seen[urls[u].isoformat()] = now
    dbm.kv_set(conn, key, seen)
    conn.commit()
    return {"days_read": len(res), "days_failed": len(errors), "listed_ids": len(listed), "new_ids": new_ids,
            "errors": errors[:5]}


def yield_floor(conn, source: str, min_yield: float = 5.0, band: int = 1000, min_sample: int = 100):
    """Lowest native-id band worth enumerating exhaustively. Bands are measured as they are fetched (newest
    first); once the oldest well-sampled band yields fewer than `min_yield` usable records per 100 pages, older
    ids are only probe-sampled. Returns (floor_id or None, band stats)."""
    rows = conn.execute(
        "SELECT p.num_id, (SELECT o.state FROM opportunity_sources s JOIN opportunities o ON o.id=s.opportunity_id "
        "WHERE s.url_id=u.id LIMIT 1) FROM platform_index p JOIN urls u ON u.url=p.item_url "
        "WHERE p.platform=? AND p.num_id IS NOT NULL AND u.state IN ('done','failed')", (source,)).fetchall()
    stats: dict[int, list] = {}
    for num, st in rows:
        b = (num // band) * band
        d = stats.setdefault(b, [0, 0])
        d[0] += 1
        d[1] += 1 if st in ("OPEN_NOW", "ROLLING", "ENQUIRY_AVAILABLE") else 0
    sampled = sorted(b for b, (n, _) in stats.items() if n >= min_sample)
    if not sampled:
        return None, stats
    low = sampled[0]
    n, u = stats[low]
    return (low if 100.0 * u / n < min_yield else None), stats


def plan_source(conn, source: str, frontier, max_new: int | None = None, max_changed: int = 400,
                today: dt.date | None = None, refresh_days: int = 14, max_refresh: int = 300,
                min_yield: float = 5.0, probe_every: int = 50) -> dict:
    """Enqueue a bounded, deduplicated set of item pages for this source (see module docstring)."""
    spec = SOURCES[source]
    migrate(conn)
    max_new = spec["default_max_new"] if max_new is None else max_new
    gen = spec["generator"]
    cfp = spec.get("country_from_path") or {}
    # changed: platform lastmod newer than our last fetch of that page
    changed = 0
    for r in conn.execute(
            "SELECT u.id, p.lastmod, u.fetched_at FROM platform_index p JOIN urls u ON u.url=p.item_url "
            "WHERE p.platform=? AND p.lastmod IS NOT NULL AND u.state IN ('done','failed') AND u.fetched_at IS NOT NULL",
            (source,)).fetchall():
        try:
            lm = dt.datetime.fromisoformat(r[1].replace("Z", "+00:00")[:19]).timestamp()
        except ValueError:
            continue
        if lm > r[2] + 3600 and changed < max_changed:
            conn.execute("UPDATE urls SET state='pending', attempts=0, priority=0.92 WHERE id=?", (r[0],))
            changed += 1
    # new: never-fetched items, newest native id first, above the measured yield floor (probe-sample below it)
    new = 0
    floor = yield_floor(conn, source, min_yield)[0] if spec.get("yield_floor", True) else None
    if floor is None:
        rows = conn.execute(
            "SELECT p.item_url, p.native_id, p.num_id FROM platform_index p LEFT JOIN urls u ON u.url=p.item_url "
            "WHERE p.platform=? AND u.id IS NULL ORDER BY (p.lastmod='calendar') DESC, p.num_id DESC, p.item_url LIMIT ?",
            (source, max_new)).fetchall()
    else:
        rows = conn.execute(
            "SELECT p.item_url, p.native_id, p.num_id FROM platform_index p LEFT JOIN urls u ON u.url=p.item_url "
            "WHERE p.platform=? AND u.id IS NULL AND (p.num_id >= ? OR p.num_id % ? = 0) "
            "ORDER BY p.num_id DESC, p.item_url LIMIT ?", (source, floor, probe_every, max_new)).fetchall()
    for item_url, native, num in rows:
        country = spec.get("country") or next((c for k, c in cfp.items() if k in item_url), None)
        if frontier.add(item_url, "platform", gen, 0.9, 1, None, f"{source} index",
                        {"platform": source, "country": country}, budgeted=False):
            new += 1
    # adapter sources: pages fetched before the platform adapter existed (stored only as compact extracts, so they
    # cannot be re-assessed offline) are fetched once more so the adapter can read them
    if spec.get("refetch_pre_adapter") and new < max_new:
        for (uid,) in conn.execute(
                "SELECT u.id FROM platform_index p JOIN urls u ON u.url=p.item_url "
                "LEFT JOIN assessments a ON a.id=(SELECT MAX(id) FROM assessments WHERE url_id=u.id) "
                "WHERE p.platform=? AND u.state='done' AND (a.id IS NULL OR json_extract(a.features,'$.adapter') IS NULL) "
                "ORDER BY p.num_id DESC LIMIT ?", (source, max_new - new)).fetchall():
            conn.execute("UPDATE urls SET state='pending', attempts=0, priority=0.85 WHERE id=?", (uid,))
            new += 1
    # calendar sources: an id the platform currently lists is live, so revive pages that an earlier strategy
    # pruned without fetching, or whose last fetch failed more than a day ago (transient host errors)
    if spec.get("calendar") and new < max_new:
        recent = time.time() - 5 * 86400
        for (uid,) in conn.execute(
                "SELECT u.id FROM platform_index p JOIN urls u ON u.url=p.item_url WHERE p.platform=? "
                "AND p.lastmod='calendar' AND p.last_listed > ? AND ((u.state='skipped' AND u.last_error LIKE 'strategy_pruned%') "
                "OR (u.state='failed' AND u.fetched_at < ?)) ORDER BY p.num_id DESC LIMIT ?",
                (source, recent, time.time() - 86400, max_new - new)).fetchall():
            conn.execute("UPDATE urls SET state='pending', attempts=0, priority=0.9, last_error=NULL WHERE id=?", (uid,))
            new += 1
    # revisit: usable/watch records of this source whose next check is due (state is re-derived on fetch)
    due = (today or dt.date.today()).isoformat()
    rev = conn.execute(
        "UPDATE urls SET state='pending', attempts=0, priority=0.88 WHERE state IN ('done','failed') AND url IN ("
        " SELECT o.revisit_url FROM opportunities o WHERE o.lane=? AND o.status IN ('watch','enquiry') "
        " AND o.next_check<=? AND o.revisit_url IS NOT NULL)", (gen, due)).rowcount
    # refresh: usable records whose page is older than `refresh_days`, or whose deadline/event date has passed
    # since we last looked (so closures are observed, never inferred from absence)
    cutoff = time.time() - refresh_days * 86400
    ref_ids = [r[0] for r in conn.execute(
        "SELECT DISTINCT u.id FROM opportunities o JOIN opportunity_sources s ON s.opportunity_id=o.id "
        "JOIN urls u ON u.id=s.url_id WHERE o.lane=? AND o.state IN ('OPEN_NOW','ROLLING','ENQUIRY_AVAILABLE') "
        "AND u.state='done' AND u.generator=? AND (u.fetched_at < ? OR (COALESCE(o.deadline, o.end_date, o.start_date) < ? "
        "AND date(u.fetched_at,'unixepoch') <= COALESCE(o.deadline, o.end_date, o.start_date))) "
        "ORDER BY u.fetched_at LIMIT ?", (gen, gen, cutoff, due, max_refresh)).fetchall()]
    for i in ref_ids:
        conn.execute("UPDATE urls SET state='pending', attempts=0, priority=0.89 WHERE id=?", (i,))
    conn.commit()
    return {"source": source, "enqueued_new": new, "enqueued_changed": changed, "enqueued_revisit": rev,
            "enqueued_refresh": len(ref_ids), "yield_floor_id": floor}


def record_poll(conn, source: str, run_id: int, started: float, plan: dict, index: dict | None, status: str,
                notes: str | None = None) -> dict:
    gen = SOURCES[source]["generator"]
    q = conn.execute(
        "SELECT COUNT(*), SUM(CASE WHEN state='done' THEN 1 ELSE 0 END), "
        "SUM(CASE WHEN state='failed' THEN 1 ELSE 0 END), "
        "SUM(CASE WHEN http_status=429 OR last_error LIKE 'http_429%' OR http_status=503 THEN 1 ELSE 0 END) "
        "FROM urls WHERE generator=? AND fetched_at>=?", (gen, started)).fetchone()
    usable_new = conn.execute(
        "SELECT COUNT(DISTINCT o.id) FROM opportunities o JOIN opportunity_sources s ON s.opportunity_id=o.id "
        "JOIN urls u ON u.id=s.url_id WHERE u.generator=? AND u.fetched_at>=? AND o.state IN "
        "('OPEN_NOW','ROLLING','ENQUIRY_AVAILABLE')", (gen, started)).fetchone()[0]
    row = {"source": source, "run_id": run_id, "started_at": started, "finished_at": time.time(), "status": status,
           "indexed": (index or {}).get("index_total") or conn.execute(
               "SELECT COUNT(*) FROM platform_index WHERE platform=?", (source,)).fetchone()[0], "enqueued_new": plan.get("enqueued_new", 0),
           "enqueued_changed": plan.get("enqueued_changed", 0), "enqueued_revisit": plan.get("enqueued_revisit", 0),
           "fetched": q[0] or 0, "fetched_ok": q[1] or 0, "errors": q[2] or 0, "rate_limited": q[3] or 0,
           "new_items_usable": usable_new,
           "notes": notes or json.dumps({"enqueued_refresh": plan.get("enqueued_refresh", 0),
                                          "yield_floor_id": plan.get("yield_floor_id")})}
    conn.execute("INSERT INTO source_polls(source,run_id,started_at,finished_at,status,indexed,enqueued_new,"
                 "enqueued_changed,enqueued_revisit,fetched,fetched_ok,errors,rate_limited,new_items_usable,notes) "
                 "VALUES (:source,:run_id,:started_at,:finished_at,:status,:indexed,:enqueued_new,:enqueued_changed,"
                 ":enqueued_revisit,:fetched,:fetched_ok,:errors,:rate_limited,:new_items_usable,:notes)", row)
    conn.commit()
    return row


def coverage(conn, source: str, band: int = 1000) -> dict:
    """Progress through the platform population and usable yield by native-id band (Eventeny/UKCraftFairs)."""
    migrate(conn)
    gen = SOURCES[source]["generator"]
    tot = conn.execute("SELECT COUNT(*) FROM platform_index WHERE platform=?", (source,)).fetchone()[0]
    fetched = conn.execute("SELECT COUNT(*) FROM platform_index p JOIN urls u ON u.url=p.item_url "
                           "WHERE p.platform=? AND u.state IN ('done','failed')", (source,)).fetchone()[0]
    bands = {}
    rows = conn.execute(
        "SELECT p.num_id, u.state, (SELECT o.state FROM opportunity_sources s JOIN opportunities o ON "
        "o.id=s.opportunity_id WHERE s.url_id=u.id LIMIT 1) ost FROM platform_index p JOIN urls u ON "
        "u.url=p.item_url WHERE p.platform=? AND p.num_id IS NOT NULL AND u.state IN ('done','failed')",
        (source,)).fetchall()
    for num, st, ost in rows:
        b = (num // band) * band
        d = bands.setdefault(b, {"fetched": 0, "usable": 0, "watch_or_closed": 0})
        d["fetched"] += 1
        if ost in ("OPEN_NOW", "ROLLING", "ENQUIRY_AVAILABLE"):
            d["usable"] += 1
        elif ost:
            d["watch_or_closed"] += 1
    for d in bands.values():
        d["usable_per_100"] = round(100 * d["usable"] / d["fetched"], 1) if d["fetched"] else None
    return {"source": source, "generator": gen, "index_total": tot, "fetched_from_index": fetched,
            "coverage_pct": round(100 * fetched / tot, 1) if tot else None,
            "by_id_band": dict(sorted(bands.items(), reverse=True))}


def last_polls(conn) -> dict:
    migrate(conn)
    out = {}
    for s in SOURCE_IDS:
        r = conn.execute("SELECT * FROM source_polls WHERE source=? ORDER BY id DESC LIMIT 1", (s,)).fetchone()
        ok = conn.execute("SELECT MAX(finished_at) FROM source_polls WHERE source=? AND status='ok'", (s,)).fetchone()[0]
        out[s] = {"last_poll": dict(r) if r else None, "last_successful_poll_at": ok}
    return out


def dumps(o) -> str:
    return json.dumps(o, indent=1, default=str)
