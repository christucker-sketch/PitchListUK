"""Crawl loop: lease → fetch → parse → classify → resolve → plan next → persist. Time-boxed + resumable."""
from __future__ import annotations

import asyncio
import datetime as dt
import gzip
import json
import re
import time
from pathlib import Path
from urllib.parse import urlsplit

from . import adapters, storage
from . import db as dbm
from .classify import classify
from .config import Config
from .explore import plan_next, sitemap_candidates, SITEMAP_LOC
from .fetch import Fetcher
from .frontier import Frontier
from .parse import parse_html
from .resolve import Resolver
from .urlutil import reg_domain

TRANSIENT = re.compile(r"^(timeout|http_5\d\d|http_429|ConnectError|ReadError|RemoteProtocolError)")
LASTMOD = re.compile(r"<url>(.*?)</url>", re.S | re.I)


class Engine:
    def _migrate_roles(self) -> None:
        from .frontier import PLATFORM_DOMAINS
        q = ",".join("?" * len(PLATFORM_DOMAINS))
        self.conn.execute(f"UPDATE sites SET role='platform', next_date=NULL WHERE reg_domain IN ({q}) AND role='organiser'",
                          tuple(PLATFORM_DOMAINS))

    def __init__(self, cfg: Config, conn, run_id: int):
        self.cfg = cfg
        self.conn = conn
        self.run_id = run_id
        self.tel = dbm.Telemetry(conn, run_id)
        self.frontier = Frontier(conn, run_id, cfg.site_page_budget, cfg.max_depth)
        self.resolver = Resolver(conn, run_id)
        self.fetcher: Fetcher | None = None
        self.fetches = 0
        self._migrate_roles()

    # ---------------- per-URL processing ----------------
    async def process(self, row: dict) -> None:
        url, gen = row["url"], row["generator"]
        meta = json.loads(row["meta"]) if row.get("meta") else {}
        try:
            res = await self.fetcher.get(url, max_bytes=40_000_000 if row["purpose"] == "sitemap" else None)
        except Exception as e:  # noqa: BLE001
            self.tel.error("fetch", url, e)
            self.conn.execute("UPDATE urls SET state='failed', last_error=? WHERE id=?", (str(e)[:300], row["id"]))
            return
        finally:
            self.frontier.release_host(row["host"])
        self.fetches += 1
        self.tel.inc("fetch.attempts", generator=gen)
        self.tel.inc("fetch.attempts")
        if res.robots_blocked:
            self.tel.inc("fetch.robots_blocked", generator=gen)
            self.conn.execute("UPDATE urls SET state='skipped', last_error='robots', fetched_at=?, fetch_run=? WHERE id=?",
                              (time.time(), self.run_id, row["id"]))
            return
        if not res.ok:
            err = res.error or f"http_{res.status}"
            self.tel.inc("fetch.errors", generator=gen)
            self.tel.inc(f"fetch.err.{err.split(':')[0][:40]}")
            retry = TRANSIENT.match(err) and row.get("attempts", 0) < 2
            self.conn.execute(
                "UPDATE urls SET state=?, last_error=?, http_status=?, fetched_at=?, fetch_run=?, elapsed_ms=?, "
                "priority=priority*0.8 WHERE id=?",
                ("pending" if retry else "failed", err[:300], res.status, time.time(), self.run_id, res.elapsed_ms, row["id"]))
            return
        self.tel.inc("fetch.ok", generator=gen)
        self.tel.inc("fetch.bytes", len(res.body))
        h, cpath = self.fetcher.cache_put(res.body)
        final = res.final_url or url
        self.conn.execute("BEGIN")
        try:
            self.conn.execute(
                "UPDATE urls SET state='done', http_status=?, final_url=?, content_type=?, bytes=?, content_hash=?, "
                "cache_path=?, fetched_at=?, fetch_run=?, elapsed_ms=? WHERE id=?",
                (res.status, final, res.content_type[:100], len(res.body), h, cpath, time.time(), self.run_id,
                 res.elapsed_ms, row["id"]))
            self.conn.execute("UPDATE sites SET pages_fetched=pages_fetched+1 WHERE reg_domain=?", (row["reg_domain"],))
            text = res.text()
            if row["purpose"] == "sitemap" or (("xml" in res.content_type.lower()) and "<urlset" in text[:3000].lower()) \
                    or "<sitemapindex" in text[:3000].lower():
                self._handle_sitemap(row, meta, text)
            elif "html" in res.content_type.lower() or text.lstrip()[:15].lower().startswith(("<!doctype", "<html")):
                self._handle_html(row, meta, final, text)
            else:
                self.tel.inc("fetch.non_html", generator=gen)
            self.conn.execute("COMMIT")
        except Exception as e:  # noqa: BLE001
            self.conn.execute("ROLLBACK")
            self.tel.error("process", url, e)
            self.conn.execute("UPDATE urls SET state='failed', last_error=? WHERE id=?", (f"process:{e}"[:300], row["id"]))

    def _child_meta(self, meta: dict, same_site: bool, from_hub: bool = False) -> dict | None:
        keep = {k: meta[k] for k in ("country", "country_weak", "organiser_kind", "organiser") if meta.get(k)}
        if from_hub and keep.get("country"):
            # A directory's country is only a weak prior for the sites it links to (they may be abroad).
            keep["country_weak"] = keep.pop("country")
        if same_site:
            for k in ("entity_name", "locality", "wikidata", "osm"):
                if meta.get(k):
                    keep[k] = meta[k]
        return keep or None

    def _handle_html(self, row: dict, meta: dict, final_url: str, html: str) -> None:
        gen = row["generator"]
        page = parse_html(html, final_url)
        site = self.conn.execute("SELECT role, country_hint, entity_name, next_date FROM sites WHERE reg_domain=?",
                                 (row["reg_domain"],)).fetchone()
        role = site["role"] if site else "organiser"
        hint = dict(meta)
        if site and site["country_hint"] and not hint.get("country"):
            hint["country"] = site["country_hint"]
        if row["purpose"] == "site_home" and role == "organiser":
            from .classify import derive_name, GENERIC_ANCHOR
            hn = hint.get("entity_name")
            nm = derive_name(page, [], hn if hn and not GENERIC_ANCHOR.match(hn) else None)
            if nm and (not site or not site["entity_name"]):
                self.conn.execute("UPDATE sites SET entity_name=? WHERE reg_domain=?", (nm, row["reg_domain"]))
        elif role == "organiser" and site and site["entity_name"] and not hint.get("entity_name"):
            hint["entity_name"] = site["entity_name"]
        if role == "organiser" and site and site["next_date"] and not hint.get("site_next_date"):
            hint["site_next_date"] = site["next_date"]
        hint["site_role"] = role
        a = classify(page, self.cfg.today, hint=hint)
        a = adapters.apply(page, a, self.cfg.today, row["reg_domain"])
        self._learn_site_date(row["reg_domain"], role, a)
        if row["purpose"] == "directory":
            # Aggregators are for discovery; verification happens on organiser/platform pages.
            a["label"], a["reasons"] = "hub", ["directory_page"] + a["reasons"]
        cur = self.conn.execute(
            "INSERT INTO assessments(url_id, run_id, assessed_at, classifier_version, label, reasons, score, features, "
            "evidence, extracted) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (row["id"], self.run_id, time.time(), a["classifier_version"], a["label"], json.dumps(a["reasons"]),
             a["score"], json.dumps(a["features"], default=str), json.dumps(a["evidence"]),
             json.dumps(a["extracted"], default=str)))
        aid = cur.lastrowid
        self.tel.inc(f"label.{a['label']}", generator=gen)
        self.tel.inc(f"label.{a['label']}")
        if a["label"] in ("actionable", "uncertain"):
            oid, method = self.resolver.upsert(row["id"], final_url, aid, a)
            if method == "new":
                self.tel.inc(f"opp.new.{a['label']}", generator=gen)
                self.tel.inc(f"opp.new.{a['label']}")
            elif method != "same_page":
                self.tel.inc("opp.duplicate_sightings", generator=gen)
                self.tel.inc(f"opp.match.{method}")
            self.conn.execute("UPDATE sites SET best_label=CASE WHEN best_label='actionable' THEN best_label ELSE ? END "
                              "WHERE reg_domain=?", (a["label"], row["reg_domain"]))
        if a["label"] == "hub" and role == "organiser":
            self.conn.execute("UPDATE sites SET role='hub' WHERE reg_domain=?", (row["reg_domain"],))
            role = "hub"
            self.tel.inc("hubs.discovered")

        nexts = plan_next(page, row, a, role)
        # Platform lanes can declare internal links worth following (e.g. Marketspread '/apply/' pages).
        if row["purpose"] == "platform" and meta.get("follow_internal"):
            fx = re.compile(meta["follow_internal"])
            for ln in page.links:
                if fx.search(ln.url) and reg_domain(ln.url) == row["reg_domain"]:
                    nexts.append(dict(url=ln.url, purpose="platform", priority=0.85, depth=row["depth"] + 1,
                                      anchor=ln.text, budgeted=False, meta={"platform": meta.get("platform")}))
        strong_internal = any(n["purpose"] == "candidate" and n["priority"] >= 0.85 for n in nexts)
        for n in nexts:
            same = reg_domain(n["url"]) == row["reg_domain"]
            m = n.get("meta") or {}
            m = {**(self._child_meta(meta, same, from_hub=(not same and (role == "hub" or row["purpose"] == "directory"))) or {}), **m}
            if same and n["purpose"] == "directory" and meta.get("follow"):
                m["follow"] = meta["follow"]
            if not same and n["purpose"] == "follow":
                # A form/platform page reached from an organiser page inherits that page's context.
                ex = a["extracted"]
                if ex.get("name"):
                    m["entity_name"] = ex["name"]
                if ex.get("country"):
                    m["country"] = ex["country"]
                if ex.get("start_date") and ex["start_date"] >= self.cfg.today.isoformat():
                    m["site_next_date"] = ex["start_date"]
            child_gen = gen if not gen.startswith("directory") or same else gen
            self.frontier.add(n["url"], n["purpose"], child_gen, n["priority"], n["depth"], row["id"], n.get("anchor"),
                              m or None, n.get("budgeted"))
            self.tel.inc("frontier.enqueued_attempts", generator=gen)
        # No obvious trader link on the homepage → try the sitemap once.
        council = meta.get("organiser_kind") == "council"
        if row["purpose"] == "site_home" and role == "organiser" and (council or not strong_internal) and a["label"] != "actionable":
            s = self.conn.execute("SELECT sitemap_checked FROM sites WHERE reg_domain=?", (row["reg_domain"],)).fetchone()
            if s and not s["sitemap_checked"]:
                self.conn.execute("UPDATE sites SET sitemap_checked=1 WHERE reg_domain=?", (row["reg_domain"],))
                sms = self.fetcher.sitemaps_from_robots(final_url) or [
                    f"{urlsplit(final_url).scheme}://{urlsplit(final_url).netloc}/sitemap.xml"]
                for sm in sms[:2]:
                    self.frontier.add(sm, "sitemap", gen, 0.5, row["depth"] + 1, row["id"], "sitemap",
                                      self._child_meta(meta, True), budgeted=False)

    def _learn_site_date(self, rd: str, role: str, a: dict) -> None:
        """Remember the next upcoming event date seen anywhere on an organiser site."""
        if role != "organiser":
            return
        ex = a["extracted"]
        d = ex.get("start_date")
        if d and ex.get("date_source") in ("jsonld", "text") and d >= self.cfg.today.isoformat():
            self.conn.execute("UPDATE sites SET next_date=? WHERE reg_domain=? AND (next_date IS NULL OR next_date<? OR next_date>?)",
                              (d, rd, self.cfg.today.isoformat(), d))

    def _handle_sitemap(self, row: dict, meta: dict, xml: str) -> None:
        gen = row["generator"]
        if meta.get("platform"):
            # Platform sitemap: harvest URLs matching the vendor-application pattern, newest first.
            pat = re.compile(meta["pattern"])
            max_age = meta.get("max_age_days", 400)
            cutoff = (self.cfg.today - dt.timedelta(days=max_age)).isoformat()
            entries = []
            children = []
            for block in LASTMOD.findall(xml) or []:
                loc = SITEMAP_LOC.search(block)
                if not loc:
                    continue
                u = loc.group(1).replace("&amp;", "&")
                lm = re.search(r"<lastmod>\s*([^<\s]+)", block)
                lm = lm.group(1)[:10] if lm else None
                if pat.search(u) and (lm is None or lm >= cutoff):
                    entries.append((lm or "", u))
            if "<sitemapindex" in xml[:3000].lower():
                cp = re.compile(meta.get("child_pattern") or ".")
                children = [u.replace("&amp;", "&") for u in SITEMAP_LOC.findall(xml)]
                children = [u for u in children if cp.search(u)]
            def _num(u):
                m = re.search(r"(\d{3,})", u)
                return int(m.group(1)) if m else 0
            entries.sort(key=lambda e: (e[0], _num(e[1])), reverse=True)
            n_add = 0
            key = f"platform.{meta['platform']}.added"
            already = dbm.kv_get(self.conn, key, 0)
            room = max(0, meta.get("max_urls", 3000) - already)
            cfp = meta.get("country_from_path") or {}
            for i, (lm, u) in enumerate(entries[:room]):
                pr = 0.75 - min(0.3, i / 10000)
                if self.frontier.add(u, "platform", gen, pr, 1, row["id"], f"sitemap lastmod {lm}",
                                     {"platform": meta["platform"], "follow_internal": meta.get("follow_internal"),
                                      "country": meta.get("country") or next((c for k, c in cfp.items() if k in u), None)},
                                     budgeted=False):
                    n_add += 1
            lane = re.search(r"[?&](lane=[\w-]+)", row["url"])
            for c in children:
                if lane:  # a re-purposed lane re-reads the platform's sitemaps under its own URLs
                    c = c + ("&" if "?" in c else "?") + lane.group(1)
                self.frontier.add(c, "sitemap", gen, 0.8, row["depth"] + 1, row["id"], "child sitemap", meta, budgeted=False)
            dbm.kv_set(self.conn, key, already + n_add)
            self.tel.inc("sitemap.platform_urls", n_add, generator=gen)
            return
        children, pages = sitemap_candidates(xml, row["reg_domain"], broad=meta.get("organiser_kind") == "council")
        for c in children:
            if row["depth"] < 2:
                self.frontier.add(c, "sitemap", gen, 0.45, row["depth"] + 1, row["id"], "child sitemap",
                                  self._child_meta(meta, True), budgeted=False)
        for u, sc in pages[:6 if meta.get("organiser_kind") == "council" else 4]:
            self.frontier.add(u, "candidate", gen, 0.85, row["depth"] + 1, row["id"], "sitemap match",
                              self._child_meta(meta, True))
        self.tel.inc("sitemap.organiser_matches", len(pages), generator=gen)

    # ---------------- loop ----------------
    async def crawl(self, seconds: float, max_fetches: int | None = None, snapshot_every: float = 600) -> dict:
        self.fetcher = Fetcher(self.cfg)
        recovered = self.frontier.recover_stale_leases()
        self.tel.inc("frontier.recovered_leases", recovered)
        deadline = time.monotonic() + seconds
        last_flush = last_snap = time.monotonic()
        tasks: dict[asyncio.Task, dict] = {}
        try:
            while time.monotonic() < deadline and (max_fetches is None or self.fetches < max_fetches):
                free = self.cfg.concurrency - len(tasks)
                if free > 0:
                    batch = self.frontier.next_batch(free, self.fetcher.host_ready_in)
                    for row in batch:
                        tasks[asyncio.create_task(self.process(row))] = row
                if not tasks:
                    if self.frontier.pending_count() == 0:
                        break
                    await asyncio.sleep(0.3)
                    continue
                done, _ = await asyncio.wait(list(tasks), timeout=0.5, return_when=asyncio.FIRST_COMPLETED)
                for t in done:
                    tasks.pop(t, None)
                    if t.exception():
                        self.tel.error("task", None, t.exception())
                now = time.monotonic()
                if now - last_flush > 10:
                    self.tel.flush()
                    last_flush = now
                if self.cfg.snapshot_path and now - last_snap > snapshot_every:
                    dbm.snapshot(self.conn, self.cfg.snapshot_path)
                    last_snap = now
            if tasks:
                done, pending = await asyncio.wait(list(tasks), timeout=8)
                for t in pending:
                    t.cancel()
                    r = tasks[t]
                    self.conn.execute("UPDATE urls SET state='pending' WHERE id=? AND state='leased'", (r["id"],))
                    self.frontier.release_host(r["host"])
        finally:
            await self.fetcher.close()
            self.tel.flush()
        return {"fetches": self.fetches, "pending": self.frontier.pending_count()}

    # ---------------- offline re-classification ----------------
    def rebuild(self, max_seconds: float = 150, restart: bool = False, only_signal: bool = False,
                only_generator: str | None = None) -> dict:
        """Re-run the current classifier + resolver over every cached page (no network).

        Time-boxed and resumable: progress is kept in kv('rebuild.cursor'). Run until it reports done."""
        t_end = time.monotonic() + max_seconds
        cursor = dbm.kv_get(self.conn, "rebuild.cursor")
        if only_generator:
            cursor = -1  # targeted pass: no reset, re-assess just this lane's pages
        elif cursor is None or restart:
            self.conn.execute("BEGIN")
            self.conn.execute("DELETE FROM opportunity_sources")
            self.conn.execute("DELETE FROM opportunities")
            self.conn.execute("UPDATE assessments SET opportunity_id=NULL")
            if not only_signal:
                self.conn.execute("UPDATE sites SET next_date=NULL")  # re-learned during the pass
            self.conn.execute("COMMIT")
            cursor = 0
            dbm.kv_set(self.conn, "rebuild.cursor", 0)
            self.resolver = Resolver(self.conn, self.run_id)
        extra = ""
        if only_signal:
            # Pages whose last verdict had no vendor signal at all cannot become opportunities under
            # rule changes that only *narrow* the signal; skip them to make iteration cheap.
            extra = (" AND id IN (SELECT url_id FROM assessments WHERE id IN (SELECT MAX(id) FROM assessments GROUP BY url_id)"
                     " AND (json_extract(features,'$.vendor_signal')!='none' OR label IN ('hub','actionable','uncertain')"
                     " OR json_extract(features,'$.adapter') IS NOT NULL))")
        if only_generator:
            extra += " AND generator=?"
        rows = self.conn.execute(
            "SELECT * FROM urls WHERE state='done' AND cache_path IS NOT NULL AND purpose!='sitemap' AND id>?" + extra +
            " ORDER BY id", (cursor,) + ((only_generator,) if only_generator else ())).fetchall()
        n = 0
        last = cursor
        for r in rows:
            if time.monotonic() > t_end:
                break
            row = dict(r)
            last = row["id"]
            body = storage.read_raw(self.cfg.data_dir, row["cache_path"])
            if body is None:
                continue
            text = body.decode("utf-8", errors="replace")
            if "<urlset" in text[:3000].lower() or "<sitemapindex" in text[:3000].lower():
                continue
            meta = json.loads(row["meta"]) if row.get("meta") else {}
            self.conn.execute("BEGIN")
            self._reassess(row, meta, row["final_url"] or row["url"], text)
            self.conn.execute("COMMIT")
            n += 1
            if n % 200 == 0:
                dbm.kv_set(self.conn, "rebuild.cursor", last)
        done = time.monotonic() <= t_end
        if only_generator:
            self.tel.flush()
            return {"reassessed": n, "done": done, "remaining": len(rows) - n}
        if done:
            self.conn.execute("DELETE FROM kv WHERE key='rebuild.cursor'")
        else:
            dbm.kv_set(self.conn, "rebuild.cursor", last)
        self.tel.flush()
        return {"reassessed": n, "done": done, "remaining": len(rows) - n if not done else 0}

    def _reassess(self, row, meta, final_url, html):
        if meta.get("country") and row.get("parent_id"):
            par = self.conn.execute("SELECT u.purpose, u.reg_domain, s.role FROM urls u LEFT JOIN sites s "
                                    "ON s.reg_domain=u.reg_domain WHERE u.id=?", (row["parent_id"],)).fetchone()
            if par and par["reg_domain"] != row["reg_domain"] and (par["purpose"] == "directory" or par["role"] == "hub"):
                meta = dict(meta)
                meta["country_weak"] = meta.pop("country")
        page = parse_html(html, final_url)
        site = self.conn.execute("SELECT role, country_hint, entity_name, next_date FROM sites WHERE reg_domain=?",
                                 (row["reg_domain"],)).fetchone()
        hint = dict(meta)
        if site and site["country_hint"] and not hint.get("country"):
            hint["country"] = site["country_hint"]
        if site and site["role"] == "organiser" and site["entity_name"] and not hint.get("entity_name") \
                and row["purpose"] != "site_home":
            hint["entity_name"] = site["entity_name"]
        if site and site["role"] == "organiser" and site["next_date"] and not hint.get("site_next_date"):
            hint["site_next_date"] = site["next_date"]
        hint["site_role"] = site["role"] if site else "organiser"
        a = classify(page, self.cfg.today, hint=hint)
        a = adapters.apply(page, a, self.cfg.today, row["reg_domain"])
        self._learn_site_date(row["reg_domain"], site["role"] if site else "organiser", a)
        if row["purpose"] == "directory":
            # Aggregators are for discovery; verification happens on organiser/platform pages.
            a["label"], a["reasons"] = "hub", ["directory_page"] + a["reasons"]
        cur = self.conn.execute(
            "INSERT INTO assessments(url_id, run_id, assessed_at, classifier_version, label, reasons, score, features, "
            "evidence, extracted) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (row["id"], self.run_id, time.time(), a["classifier_version"], a["label"], json.dumps(a["reasons"]),
             a["score"], json.dumps(a["features"], default=str), json.dumps(a["evidence"]),
             json.dumps(a["extracted"], default=str)))
        self.tel.inc(f"rebuild.label.{a['label']}")
        if a["label"] in ("actionable", "uncertain"):
            self.resolver.upsert(row["id"], final_url, cur.lastrowid, a)
