"""Command-line entry point:  python -m fpd <command> ...

Typical session
  python -m fpd seed all            # put structural seeds into the frontier (idempotent, resumable)
  python -m fpd crawl --minutes 30  # time-boxed crawl; safe to kill and re-run
  python -m fpd report              # metrics + CSV + HTML into ./output
  python -m fpd show 123            # audit one opportunity: fields, sources, quoted evidence
"""
from __future__ import annotations

import argparse
import asyncio
import json
import random
import sys
import time
from pathlib import Path

from . import db as dbm
from .config import PROJECT_DIR, Config


def _open(cfg: Config, command: str, args) -> tuple:
    if cfg.snapshot_path:
        dbm.restore_if_missing(cfg.db_path, cfg.snapshot_path)
    conn = dbm.connect(cfg.db_path)
    cur = conn.execute("INSERT INTO runs(started_at, command, args) VALUES (?,?,?)",
                       (time.time(), command, json.dumps({k: v for k, v in vars(args).items() if k != "func"}, default=str)))
    return conn, cur.lastrowid


def _close(cfg, conn, run_id, status="ok", notes=None, force_snapshot=False):
    import os
    conn.execute("UPDATE runs SET ended_at=?, status=?, notes=? WHERE id=?", (time.time(), status, notes, run_id))
    if cfg.snapshot_path:
        every = float(os.environ.get("FPD_SNAPSHOT_EVERY", 0))
        last = dbm.kv_get(conn, "last_snapshot", 0)
        if force_snapshot or not every or time.time() - last > every:
            dbm.kv_set(conn, "last_snapshot", time.time())
            dbm.snapshot(conn, cfg.snapshot_path)
    conn.close()


def cmd_seed(cfg, args):
    from .frontier import Frontier
    from .generators import osm, search, seeds, wikidata
    conn, run_id = _open(cfg, "seed", args)
    tel = dbm.Telemetry(conn, run_id)
    fr = Frontier(conn, run_id, cfg.site_page_budget, cfg.max_depth)
    which = args.which
    countries = tuple(args.countries.split(",")) if args.countries else cfg.countries
    out = {}
    if which in ("curated", "all", "directories", "platforms"):
        out["curated"] = seeds.run(conn, fr, tel, cfg, only=None if which in ("curated", "all") else which)
    if which in ("wikidata", "all"):
        out["wikidata"] = wikidata.run(conn, fr, tel, cfg, countries=countries, max_seconds=args.max_seconds)
    if which in ("councils",):
        out["councils"] = wikidata.run_councils(conn, fr, tel, cfg)
    if which in ("osm", "all"):
        out["osm"] = osm.run(conn, fr, tel, cfg, countries=countries, max_seconds=args.max_seconds)
    if which in ("search", "all"):
        out["search"] = search.run(conn, fr, tel, cfg, max_queries=args.max_queries)
    tel.flush()
    print(json.dumps({"enqueued": out, "pending": fr.pending_count()}, indent=1))
    _close(cfg, conn, run_id)


def cmd_crawl(cfg, args):
    from .pipeline import Engine
    conn, run_id = _open(cfg, "crawl", args)
    eng = Engine(cfg, conn, run_id)
    status = "ok"
    try:
        res = asyncio.run(eng.crawl(args.minutes * 60, args.max_fetches))
    except KeyboardInterrupt:
        status, res = "interrupted", {"fetches": eng.fetches}
    print(json.dumps(res))
    from .watch import finalize
    finalize(conn, cfg.today)
    _close(cfg, conn, run_id, status)


def cmd_rebuild(cfg, args):
    from .pipeline import Engine
    conn, run_id = _open(cfg, "rebuild", args)
    eng = Engine(cfg, conn, run_id)
    res = eng.rebuild(max_seconds=args.max_seconds, restart=args.restart, only_signal=args.only_signal,
                      only_generator=args.only_generator)
    if res.get("done"):
        from .watch import finalize
        res["states"] = finalize(conn, cfg.today)
    print(json.dumps(res))
    _close(cfg, conn, run_id)


def cmd_report(cfg, args):
    from . import report2
    from .watch import migrate
    conn = dbm.connect(cfg.db_path) if not cfg.snapshot_path or cfg.db_path.exists() else dbm.connect(cfg.snapshot_path)
    migrate(conn)
    m = report2.compute(conn)
    out = Path(args.out or PROJECT_DIR / "output")
    out.mkdir(parents=True, exist_ok=True)
    (out / "metrics.json").write_text(json.dumps(m, indent=1, default=str), encoding="utf-8")
    (out / "report.md").write_text(report2.render_md(m), encoding="utf-8")
    (out / "report.html").write_text(report2.render_html(conn, m), encoding="utf-8")
    n = report2.export(conn, out)
    print(report2.render_md(m))
    print(f"\nWrote {out}/report.html, report.md, metrics.json, opportunities.csv, watchlist.csv {n}")


def cmd_show(cfg, args):
    from . import report
    conn = dbm.connect(cfg.db_path)
    print(report.audit(conn, args.id))


def cmd_sample(cfg, args):
    conn = dbm.connect(cfg.db_path)
    rows = conn.execute("SELECT id FROM opportunities WHERE status=? AND review_label IS NULL", (args.status,)).fetchall()
    ids = [r[0] for r in rows]
    random.Random(args.seed).shuffle(ids)
    from . import report
    for i in ids[: args.n]:
        print(report.audit(conn, i))
        print("-" * 100)


def cmd_label(cfg, args):
    conn = dbm.connect(cfg.db_path)
    conn.execute("UPDATE opportunities SET review_label=?, review_note=? WHERE id=?", (args.label, args.note, args.id))
    print("ok")


def cmd_recheck(cfg, args):
    """Re-queue sources of uncertain opportunities so dates/status are refreshed (applications open later)."""
    conn, run_id = _open(cfg, "recheck", args)
    cutoff = time.time() - args.older_than_days * 86400
    n = conn.execute(
        "UPDATE urls SET state='pending', priority=0.7 WHERE id IN (SELECT s.url_id FROM opportunity_sources s "
        "JOIN opportunities o ON o.id=s.opportunity_id WHERE o.status=? AND o.last_checked < ?)",
        (args.status, cutoff)).rowcount
    print(json.dumps({"requeued": n}))
    _close(cfg, conn, run_id)


def cmd_compact(cfg, args):
    from .storage import compact
    conn = dbm.connect(cfg.db_path)
    print(json.dumps(compact(conn, cfg.data_dir, max_seconds=args.max_seconds, dry_run=args.dry_run)))


def cmd_finalize(cfg, args):
    from .watch import finalize
    conn = dbm.connect(cfg.db_path)
    print(json.dumps(finalize(conn, cfg.today)))


def cmd_snapshot(cfg, args):
    conn = dbm.connect(cfg.db_path)
    cur = conn.execute("INSERT INTO runs(started_at, command, args) VALUES (?,?,?)", (time.time(), "snapshot", "{}"))
    _close(cfg, conn, cur.lastrowid, force_snapshot=True)
    print("snapshot written" if cfg.snapshot_path else "no FPD_SNAPSHOT configured")


def cmd_revisit(cfg, args):
    """Re-queue the revisit URL of every watch/enquiry record whose next_check is due."""
    conn, run_id = _open(cfg, "revisit", args)
    due = (cfg.today if not args.as_of else __import__("datetime").date.fromisoformat(args.as_of)).isoformat()
    rows = conn.execute("SELECT id, revisit_url FROM opportunities WHERE relevance='relevant' AND status IN ('watch','enquiry') "
                        "AND next_check <= ? AND revisit_url IS NOT NULL", (due,)).fetchall()
    n = 0
    for r in rows:
        n += conn.execute("UPDATE urls SET state='pending', priority=0.9, attempts=0 WHERE url=? AND state!='pending'",
                          (r["revisit_url"],)).rowcount
    print(json.dumps({"due_records": len(rows), "requeued_urls": n, "as_of": due}))
    _close(cfg, conn, run_id)


def queue_rechecks(conn, requests: list, max_requests: int = 300) -> dict:
    """Re-queue the pages behind V3 recheck requests (top priority) so the next crawl refreshes them first.

    A request is matched to the delivered record by its producer id (opportunity_id). The record's revisit URL and
    source URL are re-queued unless they have already been fetched since the request was made (then the next
    delivery carries the newer last_checked and V3 acknowledges the request). Stateless and safe to repeat.

    Every request is examined (the runner fetches all pages from V3). ``max_requests`` caps how many requests may
    re-queue pages in one cycle, so a large backlog cannot crowd out platform polling; the rest are reported as
    ``deferred`` and picked up next cycle (V3 serves oldest requests first)."""
    import datetime as _dt
    from collections import Counter
    from urllib.parse import unquote
    out: Counter = Counter()
    try:
        conn.execute("SELECT 1 FROM integration_state LIMIT 1")
        have_state = True
    except Exception:  # noqa: BLE001  (no export has run yet)
        have_state = False
    for q in requests:
        pid = (q or {}).get("producer_record_id")
        try:
            req_at = _dt.datetime.fromisoformat(str(q.get("requested_at")).replace("Z", "+00:00")).timestamp()
        except ValueError:
            out["bad_request"] += 1
            continue
        row = conn.execute("SELECT record_json FROM integration_state WHERE opportunity_id=?", (pid,)).fetchone() \
            if have_state and pid else None
        if not row:
            out["unknown_record"] += 1
            continue
        rec = json.loads(row[0])
        targets = []
        for u in ((rec.get("watch") or {}).get("revisit_url"), rec.get("source_url")):
            if u and u not in targets:
                targets.append(u)
        queued = done = found = False
        if out["queued"] >= max_requests:
            fresh = False
            for u in targets:
                r = conn.execute("SELECT fetched_at FROM urls WHERE url IN (?, ?)", (u, unquote(u))).fetchone()
                if r:
                    found = True
                    fresh = fresh or bool(r["fetched_at"] and r["fetched_at"] >= req_at)
            out["already_rechecked" if fresh else "deferred" if found else "no_known_url"] += 1
            continue
        for u in targets:
            r = conn.execute("SELECT id, state, fetched_at FROM urls WHERE url IN (?, ?)", (u, unquote(u))).fetchone()
            if not r:
                continue
            found = True
            if r["fetched_at"] and r["fetched_at"] >= req_at:
                done = True
            elif r["state"] == "pending":
                conn.execute("UPDATE urls SET priority=1.0 WHERE id=?", (r["id"],))
                queued = True
            else:
                conn.execute("UPDATE urls SET state='pending', priority=1.0, attempts=0 WHERE id=?", (r["id"],))
                queued = True
        out["queued" if queued else "already_rechecked" if done else "no_known_url" if not found else "skipped"] += 1
    out["requests"] = len(requests)
    return dict(out)


def cmd_rechecks(cfg, args):
    """Act on V3 recheck requests (file written by the delivery runner, handed over before each cycle)."""
    path = Path(args.file)
    if not path.exists():
        print(json.dumps({"requests": 0, "note": f"{path} not found"}))
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    conn, run_id = _open(cfg, "rechecks", args)
    res = queue_rechecks(conn, data.get("requests") or [], args.max)
    res["polled_at"] = data.get("requested_at")
    print(json.dumps(res))
    _close(cfg, conn, run_id)


def cmd_revisit_hubs(cfg, args):
    """Re-queue directory/association hub pages not read for a while, so newly listed members are discovered."""
    conn, run_id = _open(cfg, "revisit-hubs", args)
    cutoff = time.time() - args.older_than_days * 86400
    n = conn.execute(
        "UPDATE urls SET state='pending', attempts=0, priority=0.7 WHERE id IN ("
        " SELECT id FROM urls WHERE purpose='directory' AND generator LIKE 'directory:%' AND depth<=? "
        " AND state IN ('done','failed') AND fetched_at < ? ORDER BY fetched_at LIMIT ?)",
        (args.max_depth, cutoff, args.max)).rowcount
    print(json.dumps({"requeued_hub_pages": n, "older_than_days": args.older_than_days}))
    _close(cfg, conn, run_id)


def cmd_status(cfg, args):
    conn = dbm.connect(cfg.db_path)
    out = {
        "urls": dict(conn.execute("SELECT state, COUNT(*) FROM urls GROUP BY state").fetchall()),
        "pending_by_generator": dict(conn.execute(
            "SELECT generator, COUNT(*) FROM urls WHERE state='pending' GROUP BY generator ORDER BY 2 DESC").fetchall()),
        "opportunities": dict(conn.execute("SELECT status, COUNT(*) FROM opportunities GROUP BY status").fetchall()),
        "runs": conn.execute("SELECT COUNT(*) FROM runs").fetchone()[0],
    }
    print(json.dumps(out, indent=1))


def _export_root(cfg) -> Path:
    import os
    return Path(os.environ.get("FPD_EXPORT_DIR") or PROJECT_DIR / "integration_export")


def cmd_run(cfg, args):
    """Operate platform acquisition lanes: INDEX -> PLAN -> CRAWL (lane-restricted) -> RECORD per source."""
    from .pipeline import Engine
    from .sources import SOURCE_IDS, SOURCES, index_source, plan_source, record_poll
    from .watch import finalize
    srcs = SOURCE_IDS if args.source == "all" else [args.source]
    conn, run_id = _open(cfg, "run", args)
    status, out = "ok", {}
    per = max(0.5, args.minutes / len(srcs))
    try:
        for s in srcs:
            started = time.time()
            idx = None
            last_idx = dbm.kv_get(conn, f"index.{s}.at", 0)
            if args.reindex or time.time() - last_idx > 20 * 3600:
                idx = index_source(conn, cfg, s)
                dbm.kv_set(conn, f"index.{s}.at", time.time())
            eng = Engine(cfg, conn, run_id)
            plan = plan_source(conn, s, eng.frontier, max_new=args.max_new, today=cfg.today)
            eng.frontier.allowed = {SOURCES[s]["generator"]}
            res = asyncio.run(eng.crawl(per * 60, args.max_fetches))
            finalize(conn, cfg.today)
            out[s] = {"index": idx, "plan": plan, "crawl": res,
                      "poll": record_poll(conn, s, run_id, started, plan, idx, "ok")}
    except KeyboardInterrupt:
        status = "interrupted"
    print(json.dumps(out, indent=1, default=str))
    _close(cfg, conn, run_id, status)


def cmd_coverage(cfg, args):
    from .sources import coverage
    conn = dbm.connect(cfg.db_path)
    print(json.dumps(coverage(conn, args.source, args.band), indent=1, default=str))


def cmd_export(cfg, args):
    from .integration.exporter import Exporter, health
    conn, run_id = _open(cfg, "export", args)
    root = _export_root(cfg)
    try:
        res = Exporter(conn, cfg, root).run(args.mode)
        res["health"] = {k: v for k, v in health(conn, root, cfg).items() if k in ("actionable_count", "watch_count",
                                                                                   "stalled_or_failed_sources")}
        print(json.dumps(res, indent=1, default=str))
        _close(cfg, conn, run_id)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"export_failed": str(e)[:500]}))
        _close(cfg, conn, run_id, status="failed", notes=str(e)[:300])
        raise SystemExit(2)


def cmd_export_validate(cfg, args):
    from .integration.exporter import validate_export
    res = validate_export(_export_root(cfg))
    print(json.dumps(res, indent=1))
    if not res["ok"]:
        raise SystemExit(1)


def cmd_v3_feed(cfg, args):
    """Write <export>/v3/feed.jsonl: current records plus lifecycle records for ids that left current."""
    from .integration.v3feed import build_v3_feed
    conn = dbm.connect(cfg.db_path)
    res = build_v3_feed(conn, _export_root(cfg), window_days=args.window_days)
    print(json.dumps(res))
    if not res.get("ok"):
        raise SystemExit(1)


def cmd_v3_docs(cfg, args):
    """Write <export>/v3/docs/ + docs-manifest.json: fetched source documents for allowlisted hosts (V3-002 option B;
    prepared, not run by fpd-cycle until enabled)."""
    from .integration.v3docs import build_v3_documents
    conn = dbm.connect(cfg.db_path)
    res = build_v3_documents(conn, cfg.data_dir, _export_root(cfg), args.hosts.split(","))
    print(json.dumps(res))
    if not res.get("ok"):
        raise SystemExit(1)


def cmd_health(cfg, args):
    from .integration.exporter import health
    conn = dbm.connect(cfg.db_path)
    print(json.dumps(health(conn, _export_root(cfg), cfg), indent=1, default=str))


def main(argv=None):
    p = argparse.ArgumentParser(prog="fpd", description="FindPitches discovery lab engine")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("seed")
    s.add_argument("which", choices=["all", "curated", "directories", "platforms", "wikidata", "councils", "osm", "search"])
    s.add_argument("--countries")
    s.add_argument("--max-queries", type=int, default=200)
    s.add_argument("--max-seconds", type=float, default=150)
    s.set_defaults(func=cmd_seed)
    c = sub.add_parser("crawl")
    c.add_argument("--minutes", type=float, default=10)
    c.add_argument("--max-fetches", type=int)
    c.set_defaults(func=cmd_crawl)
    rb = sub.add_parser("rebuild")
    rb.add_argument("--max-seconds", type=float, default=150)
    rb.add_argument("--restart", action="store_true")
    rb.add_argument("--only-generator")
    rb.add_argument("--only-signal", action="store_true",
                    help="only re-assess pages that previously showed any vendor signal (fast iteration)")
    rb.set_defaults(func=cmd_rebuild)
    r = sub.add_parser("report")
    r.add_argument("--out")
    r.set_defaults(func=cmd_report)
    sh = sub.add_parser("show")
    sh.add_argument("id", type=int)
    sh.set_defaults(func=cmd_show)
    sa = sub.add_parser("sample")
    sa.add_argument("--n", type=int, default=20)
    sa.add_argument("--status", default="actionable")
    sa.add_argument("--seed", type=int, default=7)
    sa.set_defaults(func=cmd_sample)
    lb = sub.add_parser("label")
    lb.add_argument("id", type=int)
    lb.add_argument("label", choices=["correct", "wrong", "unsure"])
    lb.add_argument("--note")
    lb.set_defaults(func=cmd_label)
    rc = sub.add_parser("recheck")
    rc.add_argument("--older-than-days", type=float, default=14)
    rc.add_argument("--status", default="uncertain")
    rc.set_defaults(func=cmd_recheck)
    sub.add_parser("status").set_defaults(func=cmd_status)
    sub.add_parser("snapshot").set_defaults(func=cmd_snapshot)
    sub.add_parser("finalize").set_defaults(func=cmd_finalize)
    rk = sub.add_parser("rechecks", help="re-queue pages V3 asked to be rechecked (from the delivery runner's rechecks.json)")
    rk.add_argument("--file", required=True)
    rk.add_argument("--max", type=int, default=300)
    rk.set_defaults(func=cmd_rechecks)
    vf = sub.add_parser("v3-feed", help="write export/v3/feed.jsonl (current + lifecycle records for ids that left current)")
    vf.add_argument("--window-days", type=int, default=45)
    vf.set_defaults(func=cmd_v3_feed)
    vd = sub.add_parser("v3-docs", help="publish fetched source documents for hosts V3 cannot fetch (prepared, off)")
    vd.add_argument("--hosts", default="ukcraftfairs.com", help="comma-separated allowlist")
    vd.set_defaults(func=cmd_v3_docs)
    rh = sub.add_parser("revisit-hubs", help="re-read directory/association hub pages older than N days")
    rh.add_argument("--older-than-days", type=float, default=7)
    rh.add_argument("--max-depth", type=int, default=1)
    rh.add_argument("--max", type=int, default=300)
    rh.set_defaults(func=cmd_revisit_hubs)
    rv = sub.add_parser("revisit")
    rv.add_argument("--as-of", help="treat this ISO date as today when selecting due records")
    rv.set_defaults(func=cmd_revisit)
    cp = sub.add_parser("compact")
    cp.add_argument("--max-seconds", type=float, default=140)
    cp.add_argument("--dry-run", action="store_true")
    cp.set_defaults(func=cmd_compact)
    rn = sub.add_parser("run", help="operate platform acquisition sources (index, plan, crawl, record)")
    rn.add_argument("--source", default="all", choices=["all", "eventeny", "localstalls", "cluemart", "marketspread", "ukcraftfairs"])
    rn.add_argument("--minutes", type=float, default=10)
    rn.add_argument("--max-new", type=int, help="max never-fetched items to enqueue per source this run")
    rn.add_argument("--max-fetches", type=int)
    rn.add_argument("--reindex", action="store_true", help="re-read the platform index even if fresh")
    rn.set_defaults(func=cmd_run)
    cv = sub.add_parser("coverage", help="progress through a platform's population and yield by id band")
    cv.add_argument("source", choices=["eventeny", "localstalls", "cluemart", "marketspread", "ukcraftfairs"])
    cv.add_argument("--band", type=int, default=2000)
    cv.set_defaults(func=cmd_coverage)
    ex = sub.add_parser("export", help="publish an integration export (full snapshot + delta, or delta only)")
    ex.add_argument("mode", choices=["full", "delta"])
    ex.set_defaults(func=cmd_export)
    ev = sub.add_parser("export-validate", help="validate the published integration export")
    ev.set_defaults(func=cmd_export_validate)
    hl = sub.add_parser("health", help="write and print integration_export/metrics/latest.json")
    hl.set_defaults(func=cmd_health)
    args = p.parse_args(argv)
    cfg = Config.from_env()
    args.func(cfg, args)


if __name__ == "__main__":
    sys.exit(main())
