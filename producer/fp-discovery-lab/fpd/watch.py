"""Opportunity-level finalisation: aggregate page states, build application routes, and plan revisits.

Run after every crawl/rebuild (`python -m fpd finalize`). Idempotent.

Aggregation (several pages can describe one opportunity):
  * explicit open evidence (open phrase / future deadline) on any page wins;
  * otherwise an explicit closure beats an *implicit* open (a form that still loads is weaker evidence
    than the organiser saying applications are closed);
  * otherwise "will open later" beats implicit open;
  * otherwise the most available state wins.

Watch planning is conservative: a source-published opening date is used verbatim; every other revisit
date is an *internal scheduling decision* and is labelled as such in `next_check_basis`.
Recurrence is never assumed — when no recurrence evidence exists, the record is still watched but at
low priority, and the basis says so.
"""
from __future__ import annotations

import datetime as dt
import json

from .state import ACTIONABLE_STATES, STATE_RANK

NEW_COLUMNS = {
    "relevance": "TEXT", "state": "TEXT", "state_evidence": "TEXT", "state_source_url": "TEXT",
    "open_strength": "TEXT", "opens_on": "TEXT", "recurrence_evidence": "TEXT", "watch_reason": "TEXT",
    "watch_priority": "TEXT", "next_check": "TEXT", "next_check_basis": "TEXT", "missing_evidence": "TEXT",
    "revisit_url": "TEXT", "lane": "TEXT", "n_routes": "INTEGER", "route_categories": "TEXT",
}

ROUTES_SCHEMA = """
CREATE TABLE IF NOT EXISTS routes (
    opportunity_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    route_type TEXT,
    platform TEXT,
    category TEXT,
    anchor TEXT,
    source_url TEXT,
    source_state TEXT,
    PRIMARY KEY (opportunity_id, url)
);
"""


def migrate(conn) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(opportunities)")}
    for c, t in NEW_COLUMNS.items():
        if c not in cols:
            conn.execute(f"ALTER TABLE opportunities ADD COLUMN {c} {t}")
    conn.executescript(ROUTES_SCHEMA)


def _d(s):
    try:
        return dt.date.fromisoformat(s) if s else None
    except ValueError:
        return None


def _aggregate(srcs: list[dict]) -> dict:
    rel = [s for s in srcs if s["ex"].get("relevance") == "relevant"]
    if not rel:
        return {"state": "NOT_RELEVANT", "src": srcs[0] if srcs else None}
    exp_open = [s for s in rel if s["ex"].get("state") in ACTIONABLE_STATES and s["ex"].get("open_strength") == "explicit"]
    if exp_open:
        best = max(exp_open, key=lambda s: STATE_RANK[s["ex"]["state"]])
        return {"state": best["ex"]["state"], "src": best}
    closed = [s for s in rel if s["ex"].get("state") == "CLOSED_CURRENT_CYCLE"]
    if closed:
        return {"state": "CLOSED_CURRENT_CYCLE", "src": closed[0]}
    upcoming = [s for s in rel if s["ex"].get("state") == "UPCOMING_NOT_OPEN"]
    if upcoming:
        withdate = [s for s in upcoming if s["ex"].get("opens_on")]
        return {"state": "UPCOMING_NOT_OPEN", "src": (withdate or upcoming)[0]}
    best = max(rel, key=lambda s: STATE_RANK.get(s["ex"].get("state") or "UNKNOWN", 0))
    return {"state": best["ex"].get("state") or "UNKNOWN", "src": best}


def _plan(o: dict, state: str, src_ex: dict, today: dt.date) -> dict:
    """Watch fields for non-actionable but relevant records."""
    out = {"watch_reason": None, "watch_priority": None, "next_check": None, "next_check_basis": None}
    if state in ACTIONABLE_STATES or state == "NOT_RELEVANT":
        return out
    start, end = _d(o.get("start_date")), _d(o.get("end_date"))
    last = end or start
    rec = o.get("recurrence_evidence")
    opens_on = _d(src_ex.get("opens_on"))
    floor = today + dt.timedelta(days=14)
    if state == "ENQUIRY_AVAILABLE":
        out.update(watch_reason="Enquiry route exists but no application mechanism; check for an application form",
                   watch_priority="medium", next_check=(today + dt.timedelta(days=60)).isoformat(),
                   next_check_basis="internal: 60-day recheck of enquiry-only organiser")
    elif state == "UPCOMING_NOT_OPEN":
        if opens_on:
            out.update(watch_reason=f"Applications open {opens_on.isoformat()} (published by source)",
                       watch_priority="high", next_check=max(opens_on, today).isoformat(),
                       next_check_basis="source: published opening date")
        else:
            out.update(watch_reason="Source says applications will open later; no date published",
                       watch_priority="high", next_check=(today + dt.timedelta(days=30)).isoformat(),
                       next_check_basis="internal: monthly poll until an opening date or form appears")
    elif state == "CLOSED_CURRENT_CYCLE":
        nxt = max((last or today) + dt.timedelta(days=14), floor)
        out.update(watch_reason="Applications closed for the current edition" + (f" (event {last.isoformat()})" if last else "")
                   + ("; recurrence stated by source" if rec else "; recurrence not stated"),
                   watch_priority="high" if rec else "medium", next_check=nxt.isoformat(),
                   next_check_basis="internal: two weeks after the current edition, to catch the next cycle")
    elif state == "HISTORICAL":
        if rec and last:
            projected = last + dt.timedelta(days=365 - 180)  # ~6 months before a same-date next edition
            nxt = max(projected, floor)
            out.update(watch_reason=f"Past edition ({last.isoformat()}); source states recurrence — revisit for next cycle",
                       watch_priority="medium", next_check=nxt.isoformat(),
                       next_check_basis="internal: ~6 months before the anniversary of the last edition "
                                        "(only meaningful if the event recurs, which is not assumed)")
        else:
            out.update(watch_reason="Past or stale material; no recurrence stated" if not rec else
                       "Past edition, date unknown; source states recurrence",
                       watch_priority="low", next_check=(today + dt.timedelta(days=120)).isoformat(),
                       next_check_basis="internal: low-priority 4-month recheck")
    else:  # UNKNOWN
        out.update(watch_reason="Relevant organiser/vendor page but availability unclear: missing "
                   + ", ".join(src_ex.get("missing") or ["evidence"]),
                   watch_priority="medium", next_check=(today + dt.timedelta(days=45)).isoformat(),
                   next_check_basis="internal: 45-day recheck")
    return out


def finalize(conn, today: dt.date) -> dict:
    migrate(conn)
    from .lexicon import platform_of
    conn.execute("BEGIN")
    conn.execute("DELETE FROM routes")
    rows = conn.execute("""
        SELECT s.opportunity_id oid, s.role, u.url, u.generator, a.extracted, a.score
        FROM opportunity_sources s JOIN urls u ON u.id=s.url_id
        JOIN assessments a ON a.id = (SELECT MAX(id) FROM assessments WHERE url_id=s.url_id)
        ORDER BY s.opportunity_id""").fetchall()
    by_opp: dict[int, list] = {}
    for r in rows:
        by_opp.setdefault(r["oid"], []).append({"url": r["url"], "role": r["role"], "gen": r["generator"],
                                               "ex": json.loads(r["extracted"] or "{}"), "score": r["score"]})
    counts = {}
    for oid, srcs in by_opp.items():
        o = dict(conn.execute("SELECT * FROM opportunities WHERE id=?", (oid,)).fetchone())
        agg = _aggregate(srcs)
        state, src = agg["state"], agg["src"]
        ex = dict(src["ex"]) if src else {}
        # Opportunity-level date guard: a page that could not see a date may sit beside one that did.
        last = _d(o.get("end_date")) or _d(o.get("start_date"))
        regular = any("regular:" in (s["ex"].get("recurrence_evidence") or "") for s in srcs)
        if state == "UNKNOWN" and last and last < today and not regular:
            state = "HISTORICAL"
            ex["state_evidence"] = f"Edition date {last.isoformat()} has passed (date from another source page of this opportunity)"
        rel = "relevant" if state != "NOT_RELEVANT" else "not_relevant"
        rec = next((s["ex"].get("recurrence_evidence") for s in srcs if s["ex"].get("recurrence_evidence")), None)
        missing = sorted({m for s in srcs if s["ex"].get("relevance") == "relevant" for m in (s["ex"].get("missing") or [])}) \
            if state not in ACTIONABLE_STATES else []
        primary = next((s for s in srcs if s["role"] == "primary"), srcs[0])
        # routes (deduplicated by URL; categories preserved)
        cats = set()
        nroutes = 0
        for s in srcs:
            for rt in s["ex"].get("routes", []) or []:
                u = rt.get("url")
                if not u or rt.get("type") in ("contact_instruction",):
                    continue
                cats.add(rt.get("category") or "general")
                cur = conn.execute(
                    "INSERT OR IGNORE INTO routes(opportunity_id,url,route_type,platform,category,anchor,source_url,source_state)"
                    " VALUES (?,?,?,?,?,?,?,?)",
                    (oid, u, rt.get("type"), rt.get("platform") or platform_of(u), rt.get("category"),
                     (rt.get("anchor") or "")[:150], s["url"], s["ex"].get("state")))
                nroutes += cur.rowcount
        o_tmp = {**o, "recurrence_evidence": rec}
        plan = _plan(o_tmp, state, ex, today)
        status = ("actionable" if state in ACTIONABLE_STATES else "enquiry" if state == "ENQUIRY_AVAILABLE"
                  else "not_relevant" if state == "NOT_RELEVANT" else "watch")
        revisit = None
        if status in ("watch", "enquiry"):
            # Prefer the organiser's own vendor page over a third-party form (forms change every cycle).
            org_pages = [s for s in srcs if not platform_of(s["url"])]
            revisit = (org_pages or srcs)[0]["url"]
        conn.execute(
            "UPDATE opportunities SET relevance=?, state=?, state_evidence=?, state_source_url=?, open_strength=?, "
            "opens_on=?, recurrence_evidence=?, watch_reason=?, watch_priority=?, next_check=?, next_check_basis=?, "
            "missing_evidence=?, revisit_url=?, lane=?, n_routes=?, route_categories=?, status=? WHERE id=?",
            (rel, state, ex.get("state_evidence"), src["url"] if src else None, ex.get("open_strength"),
             ex.get("opens_on"), rec, plan["watch_reason"], plan["watch_priority"], plan["next_check"],
             plan["next_check_basis"], json.dumps(missing), revisit, primary["gen"], nroutes,
             json.dumps(sorted(cats)), status, oid))
        counts[state] = counts.get(state, 0) + 1
    conn.execute("COMMIT")
    return counts
