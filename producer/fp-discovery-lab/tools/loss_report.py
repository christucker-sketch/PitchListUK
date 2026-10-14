"""Producer loss-reason report (alignment report 14 Oct, action 6). Read-only; no crawling; counts only.

Answers "where do candidate opportunities fall out of the producer funnel, and why?" using what the producer has
already stored: the frontier (urls), the latest page assessment per URL, the merged opportunities, and the last
export (full/current|watch|held.jsonl). It prints counts and reason buckets only -- no URLs, names or contacts.

Run on the Pi (stdlib only; opens the database read-only):
    sudo -u fpd /opt/fpd/venv/bin/python loss_report.py --db /srv/fpd/data/fpd.sqlite --export /srv/fpd/export
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import sqlite3
from pathlib import Path

# The eleven buckets named in the alignment report, plus the non-loss outcomes needed to make the funnel add up.
BUCKETS = ["no_current_date", "no_trader_relevance", "no_usable_route", "generic_route", "identity_ambiguity",
           "geography_missing", "duplicate", "stale_or_closed", "parser_failure", "blocked_source", "freshness_conflict"]

PAGE_REASON = {
    # classifier "rejected" reasons
    **{r: "no_trader_relevance" for r in (
        "no_vendor_signal", "insufficient_vendor_signal", "weak_vendor_signal", "topical_mention_only",
        "non_event_context", "news_or_article", "procurement_context", "sports_pitch_context",
        "fixed_site_concession_not_event", "traveller_site_context", "online_event", "non_vendor_application_type",
        "payment_form", "sponsorship_only", "competition_exhibitor_context", "trading_permit_not_event",
        "platform_marketing_page", "platform_non_application_page")},
    "stale_or_past_edition": "stale_or_closed", "applications_closed": "stale_or_closed",
    "applications_not_yet_open": "not_yet_open",
    "no_application_route": "no_usable_route",
    "general_interest_list": "generic_route", "exhibitor_services_page": "generic_route",
    "geography_unknown": "geography_missing", "out_of_scope_geography": "out_of_scope_country",
    "aggregator_site": "hub_or_listing (discovery page, not a loss)", "listing_page": "hub_or_listing (discovery page, not a loss)",
    "vendor+route+current+geo": "passed_page_gate",
}

WATCH_MISSING = {
    "current_season_dates": "no_current_date", "next_edition_dates": "no_current_date",
    "next_cycle_application": "stale_or_closed", "next_season_application": "stale_or_closed",
    "next_application_route": "no_usable_route", "application_mechanism": "no_usable_route",
    "open_application": "not_yet_open", "opening_date": "not_yet_open",
}


def page_bucket(reasons: list[str]) -> str:
    for r in reasons:
        if r.startswith("currency_"):
            return "no_current_date"
    for r in reasons:
        if r in PAGE_REASON:
            return PAGE_REASON[r]
    return "other:" + (reasons[0] if reasons else "none")


def held_bucket(issues: list[str]) -> str:
    for i in issues:
        if i.startswith(("unsupported_or_unknown_country", "geography_unverified")):
            return "geography_missing"
        if i.startswith("geography_conflict"):
            return "geography_conflict"
        if i.startswith(("event_name_not_usable", "event_name_is_organiser_only")):
            return "identity_ambiguity"
        if i.startswith(("stale_contradiction", "event_name_date_conflict")):
            return "freshness_conflict"
        if i.startswith(("insecure_source_url", "insecure_application_url", "invalid_source_url")):
            return "unsafe_or_invalid_url"
        if i.startswith("lane_suspended"):
            return "lane_suspended"
        if i.startswith("known_false_positive"):
            return "known_false_positive"
        if i.startswith(("no_state_evidence", "no_relevance_evidence")):
            return "no_trader_relevance"
    return "other:" + (issues[0][:40] if issues else "none")


def watch_bucket(rec: dict, today: str) -> str:
    st = rec.get("application_state")
    routes = rec.get("application_routes") or []
    if st in ("HISTORICAL", "CLOSED_CURRENT_CYCLE"):
        return "stale_or_closed"
    if st == "UPCOMING_NOT_OPEN":
        return "not_yet_open"
    if st == "UNKNOWN":
        end = rec.get("event_end") or rec.get("event_start")
        if end and end < today:
            return "stale_or_closed"
        if routes:
            if all((r.get("category") or "general") == "general" for r in routes):
                return "generic_route"
            return "route_candidate_awaiting_review (D-018)"
        missing = (rec.get("watch") or {}).get("missing_evidence") or []
        for m in missing:
            if m in WATCH_MISSING:
                return WATCH_MISSING[m]
        return "no_usable_route"
    return "other:" + str(st)


def _jsonl(p: Path):
    if not p.exists():
        return
    with p.open() as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


def report(db: Path, export: Path, today: dt.date | None = None) -> dict:
    today_s = (today or dt.date.today()).isoformat()
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    out: dict = {"schema": "fpd-loss-report-v1", "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                 "as_of_date": today_s, "buckets_defined": BUCKETS}

    # Stage 1: fetch outcomes over the frontier.
    fetch = collections.Counter()
    for r in conn.execute("SELECT state, http_status, last_error FROM urls"):
        st, code, err = r["state"], r["http_status"], (r["last_error"] or "")
        if st == "skipped" and err == "robots":
            fetch["blocked_source (robots)"] += 1
        elif st == "failed" and (code in (401, 403, 429, 451) or "challenge" in err.lower()):
            fetch["blocked_source (http %s)" % (code or "challenge")] += 1
        elif st == "failed" and err.startswith("process:"):
            fetch["parser_failure"] += 1
        elif st == "failed":
            fetch["fetch_failure (%s)" % (code or "network")] += 1
        else:
            fetch[st] += 1
    out["stage1_fetch"] = dict(fetch.most_common())

    # Stage 2: latest assessment per URL -> page gate outcome.
    page = collections.Counter()
    raw = collections.Counter()
    for r in conn.execute("SELECT a.label, a.reasons FROM assessments a JOIN (SELECT url_id, MAX(id) mid FROM assessments "
                          "GROUP BY url_id) l ON l.mid = a.id"):
        try:
            reasons = json.loads(r["reasons"] or "[]")
        except ValueError:
            reasons = []
        b = "passed_page_gate" if r["label"] == "actionable" else page_bucket(reasons)
        page[(r["label"], b)] += 1
        for x in reasons:
            raw[x if not x.startswith("currency_") else x] += 1
    out["stage2_page_gate"] = {f"{lab}:{b}": n for (lab, b), n in page.most_common()}
    out["stage2_raw_reason_codes_top25"] = dict(raw.most_common(25))

    # Stage 3: identity / duplicates (how sources attached to opportunities).
    m = collections.Counter(r[0] or "unknown" for r in conn.execute("SELECT match_method FROM opportunity_sources"))
    out["stage3_identity"] = {
        "sources_attached": sum(m.values()),
        "new_opportunity": m.get("new", 0),
        "duplicate (merged by apply_url / name_exact / same_page)": m.get("apply_url", 0) + m.get("name_exact", 0) + m.get("same_page", 0),
        "identity_ambiguity (fuzzy name merge)": m.get("name_fuzzy", 0),
        "by_method": dict(m.most_common()),
        "opportunities_in_engine": conn.execute("SELECT COUNT(*) FROM opportunities").fetchone()[0],
    }

    # Stage 4: export gate (last export), by country.
    exp = {"current": collections.Counter(), "watch": collections.Counter(), "held": collections.Counter()}
    n = collections.Counter()
    for ch in exp:
        for rec in _jsonl(export / "full" / f"{ch}.jsonl"):
            cc = rec.get("country_code") or "??"
            n[ch] += 1
            if ch == "current":
                b = "delivered (" + str(rec.get("application_state")) + ")"
            elif ch == "watch":
                b = watch_bucket(rec, today_s)
            else:
                b = held_bucket(rec.get("readiness_issues") or [])
            exp[ch][(cc, b)] += 1
    out["stage4_export_totals"] = dict(n)
    out["stage4_retired_or_internal"] = max(0, out["stage3_identity"]["opportunities_in_engine"] - sum(n.values()))
    for ch, c in exp.items():
        by: dict = {}
        for (cc, b), k in c.items():
            by.setdefault(b, {"total": 0})
            by[b]["total"] += k
            by[b][cc] = by[b].get(cc, 0) + k
        out[f"stage4_{ch}"] = dict(sorted(by.items(), key=lambda kv: -kv[1]["total"]))

    # Roll-up into the alignment-report buckets (post-fetch losses only; each record/page counted once, at the stage
    # where it stopped).
    roll = collections.Counter()
    for k, v in fetch.items():
        if k.startswith("blocked_source"):
            roll["blocked_source"] += v
        elif k == "parser_failure":
            roll["parser_failure"] += v
    for (lab, b), v in page.items():
        # uncertain pages still become (watch) opportunities and are counted at stage 4, so only rejections stop here
        if lab == "rejected" and not b.startswith("hub_or_listing"):
            roll[b] += v
    roll["duplicate"] += out["stage3_identity"]["duplicate (merged by apply_url / name_exact / same_page)"]
    roll["identity_ambiguity"] += out["stage3_identity"]["identity_ambiguity (fuzzy name merge)"]
    for ch in ("watch", "held"):
        for (cc, b), v in exp[ch].items():
            roll[b] += v
    out["rollup"] = {b: roll.get(b, 0) for b in BUCKETS} | {k: v for k, v in roll.most_common() if k not in BUCKETS}
    conn.close()
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", type=Path, default=Path("/srv/fpd/data/fpd.sqlite"))
    ap.add_argument("--export", type=Path, default=Path("/srv/fpd/export"))
    a = ap.parse_args()
    print(json.dumps(report(a.db, a.export), indent=1))


if __name__ == "__main__":
    main()
