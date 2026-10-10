"""Persistent work frontier with per-site budgets and adaptive (bandit) source scheduling."""
from __future__ import annotations

import json
import random
import sqlite3
import time
from collections import defaultdict, deque

from .urlutil import canonicalize, host_of, reg_domain, should_skip
from .lexicon import APPLICATION_PLATFORMS

# Registrable domains of application/form platforms (their pages belong to many different organisers).
PLATFORM_DOMAINS = {reg_domain('https://' + k.split('/')[0].strip('.')) for k in APPLICATION_PLATFORMS} | {'google.com', 'forms.gle', 'ukcraftfairs.com', 'localstalls.com', 'cluemart.co.nz'}

# Purposes that consume an organiser site's exploration budget.
BUDGETED = {"site_home", "candidate", "follow"}


class Frontier:
    def __init__(self, conn: sqlite3.Connection, run_id: int, site_budget: int = 8, max_depth: int = 3):
        self.conn = conn
        self.run_id = run_id
        self.site_budget = site_budget
        self.max_depth = max_depth
        self.queues: dict[str, deque] = defaultdict(deque)
        self.stats_cache: dict[str, tuple[float, float]] = {}
        self.stats_at = 0.0
        self.in_flight_hosts: dict[str, int] = defaultdict(int)
        # When set, only these generators (acquisition lanes) are crawled: used to run one source.
        self.allowed: set[str] | None = None

    # ---------- enqueue ----------
    def ensure_site(self, rd: str, generator: str, role: str | None = None, country: str | None = None,
                    entity_name: str | None = None) -> None:
        if role is None and rd in PLATFORM_DOMAINS:
            role, country, entity_name = "platform", None, None
        self.conn.execute(
            "INSERT INTO sites(reg_domain, first_seen, origin_generator, role, country_hint, entity_name) "
            "VALUES (?,?,?,?,?,?) ON CONFLICT(reg_domain) DO NOTHING",
            (rd, time.time(), generator, role or "organiser", country, entity_name),
        )
        if role and role != "organiser":
            self.conn.execute("UPDATE sites SET role=? WHERE reg_domain=? AND role='organiser'", (role, rd))

    def add(self, url: str, purpose: str, generator: str, priority: float = 0.5, depth: int = 0,
            parent_id: int | None = None, anchor: str | None = None, meta: dict | None = None,
            budgeted: bool | None = None) -> int | None:
        c = canonicalize(url)
        if not c or should_skip(c):
            return None
        if depth > self.max_depth:
            return None
        rd = reg_domain(c)
        budgeted = (purpose in BUDGETED) if budgeted is None else budgeted
        site = self.conn.execute("SELECT role, pages_enqueued FROM sites WHERE reg_domain=?", (rd,)).fetchone()
        if site is None:
            self.ensure_site(rd, generator, country=(meta or {}).get("country"),
                             entity_name=(meta or {}).get("entity_name"))
            site = self.conn.execute("SELECT role, pages_enqueued FROM sites WHERE reg_domain=?", (rd,)).fetchone()
        if site["role"] == "blocked":
            return None
        if budgeted and site["role"] == "organiser" and site["pages_enqueued"] >= self.site_budget:
            return None
        try:
            cur = self.conn.execute(
                "INSERT INTO urls(url, host, reg_domain, purpose, generator, priority, depth, parent_id, anchor, meta, "
                "state, created_at, created_run) VALUES (?,?,?,?,?,?,?,?,?,?, 'pending', ?, ?)",
                (c, host_of(c), rd, purpose, generator, float(priority), depth, parent_id,
                 (anchor or "")[:300], json.dumps(meta) if meta else None, time.time(), self.run_id),
            )
        except sqlite3.IntegrityError:
            # Already known. Raise its priority if this route found it more promising.
            self.conn.execute("UPDATE urls SET priority=MAX(priority, ?) WHERE url=? AND state='pending'", (priority, c))
            return None
        if budgeted:
            self.conn.execute("UPDATE sites SET pages_enqueued = pages_enqueued + 1 WHERE reg_domain=?", (rd,))
        return cur.lastrowid

    # ---------- leasing ----------
    def recover_stale_leases(self) -> int:
        cur = self.conn.execute(
            "UPDATE urls SET state='pending' WHERE state='leased' AND (lease_until IS NULL OR lease_until < ?)",
            (time.time(),),
        )
        return cur.rowcount

    def _refill(self, generator: str | None = None, n: int = 300) -> None:
        if generator:
            gens = [generator]
        else:
            gens = [r[0] for r in self.conn.execute("SELECT DISTINCT generator FROM urls WHERE state='pending'")]
        if self.allowed is not None:
            gens = [g for g in gens if g in self.allowed]
        for g in gens:
            q = self.queues[g]
            if len(q) > 50:
                continue
            have = {r["id"] for r in q}
            rows = self.conn.execute(
                "SELECT id, url, host, reg_domain, purpose, generator, priority, depth, parent_id, anchor, meta, attempts "
                "FROM urls WHERE state='pending' AND generator=? ORDER BY priority DESC, id LIMIT ?", (g, n)
            ).fetchall()
            for r in rows:
                if r["id"] not in have:
                    q.append(dict(r))

    def _generator_stats(self) -> dict[str, tuple[float, float]]:
        """Per-generator (successes, trials) = new opportunity-yielding pages vs pages fetched."""
        if time.time() - self.stats_at < 20 and self.stats_cache:
            return self.stats_cache
        stats = {}
        rows = self.conn.execute(
            "SELECT u.generator g, COUNT(*) n, "
            "SUM(CASE WHEN a.label='actionable' THEN 1 ELSE 0 END) act, "
            "SUM(CASE WHEN a.label='uncertain' THEN 1 ELSE 0 END) unc "
            "FROM urls u LEFT JOIN assessments a ON a.url_id=u.id "
            "WHERE u.state IN ('done','failed') GROUP BY u.generator"
        ).fetchall()
        for r in rows:
            stats[r["g"]] = ((r["act"] or 0) + 0.3 * (r["unc"] or 0), r["n"] or 0)
        self.stats_cache, self.stats_at = stats, time.time()
        return stats

    def next_batch(self, k: int, host_ready, max_per_host: int = 1) -> list[dict]:
        """Thompson-sample a generator for each slot, then take its best ready URL.

        Generators that keep producing opportunities get more of the crawl budget; new/unknown
        generators are explored because their Beta prior is wide.
        """
        self._refill()
        stats = self._generator_stats()
        batch: list[dict] = []
        tries = 0
        active = [g for g, q in self.queues.items() if q and (self.allowed is None or g in self.allowed)]
        while len(batch) < k and active and tries < k * 6:
            tries += 1
            draws = {}
            for g in active:
                s, n = stats.get(g, (0, 0))
                # Pages that only exist to produce seeds (sitemaps, directories, APIs) shouldn't be
                # starved just because they don't themselves classify as opportunities.
                draws[g] = random.betavariate(1 + s, 1 + max(0.0, n - s) * 0.5)
            # 25% of slots explore uniformly so no strategy is starved before its yield is known.
            g = random.choice(active) if random.random() < 0.25 else max(draws, key=draws.get)
            q = self.queues[g]
            picked = None
            for _ in range(min(len(q), 40)):
                item = q.popleft()
                if self.in_flight_hosts[item["host"]] < max_per_host and host_ready(item["host"]) < 0.5:
                    picked = item
                    break
                q.append(item)
            if picked is None:
                active.remove(g) if g in active else None
                continue
            self.in_flight_hosts[picked["host"]] += 1
            batch.append(picked)
            if not q:
                self._refill(g)
                if not self.queues[g]:
                    active.remove(g)
        if batch:
            now = time.time()
            self.conn.executemany(
                "UPDATE urls SET state='leased', lease_until=?, attempts=attempts+1 WHERE id=?",
                [(now + 300, b["id"]) for b in batch],
            )
        return batch

    def release_host(self, host: str) -> None:
        self.in_flight_hosts[host] = max(0, self.in_flight_hosts[host] - 1)

    def pending_count(self) -> int:
        if self.allowed is not None:
            q = ",".join("?" * len(self.allowed)) or "''"
            return self.conn.execute(f"SELECT COUNT(*) FROM urls WHERE state='pending' AND generator IN ({q})",
                                     tuple(self.allowed)).fetchone()[0]
        return self.conn.execute("SELECT COUNT(*) FROM urls WHERE state='pending'").fetchone()[0]
