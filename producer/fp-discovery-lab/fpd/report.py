"""Measurement: compute experiment metrics from the DB and render report.md / report.html / CSV."""
from __future__ import annotations

import csv
import html
import json
import math
from collections import Counter
from pathlib import Path

LATEST = "(SELECT MAX(id) FROM assessments GROUP BY url_id)"


def q(conn, sql, *a):
    return conn.execute(sql, a).fetchall()


def one(conn, sql, *a):
    r = conn.execute(sql, a).fetchone()
    return r[0] if r else None


def compute(conn) -> dict:
    m: dict = {}
    m["runs"] = [dict(r) for r in q(conn, "SELECT id, command, started_at, ended_at, status FROM runs ORDER BY id")]
    m["crawl_seconds"] = round(sum((r["ended_at"] or r["started_at"]) - r["started_at"] for r in m["runs"]
                                   if r["command"] == "crawl"))
    m["urls_known"] = one(conn, "SELECT COUNT(*) FROM urls")
    m["urls_pending"] = one(conn, "SELECT COUNT(*) FROM urls WHERE state='pending'")
    m["fetch_attempts"] = one(conn, "SELECT COUNT(*) FROM urls WHERE fetched_at IS NOT NULL")
    m["fetch_ok"] = one(conn, "SELECT COUNT(*) FROM urls WHERE state='done'")
    m["fetch_failed"] = one(conn, "SELECT COUNT(*) FROM urls WHERE state='failed'")
    m["robots_blocked"] = one(conn, "SELECT COUNT(*) FROM urls WHERE state='skipped' AND last_error='robots'")
    m["bytes"] = one(conn, "SELECT COALESCE(SUM(bytes),0) FROM urls")
    m["sites_known"] = one(conn, "SELECT COUNT(*) FROM sites")
    m["sites_fetched"] = one(conn, "SELECT COUNT(*) FROM sites WHERE pages_fetched>0")
    m["errors_by_type"] = dict(Counter(
        (r["last_error"] or "").split(":")[0][:40] for r in q(conn, "SELECT last_error FROM urls WHERE state='failed'")
    ).most_common(12))
    m["api_calls"] = {r["api"]: {"calls": r["n"], "results": r["res"], "errors": r["err"]} for r in q(
        conn, "SELECT api, COUNT(*) n, SUM(results) res, SUM(error IS NOT NULL) err FROM api_calls GROUP BY api")}
    m["pages_assessed"] = one(conn, f"SELECT COUNT(*) FROM assessments WHERE id IN {LATEST}")
    m["page_labels"] = {r["label"]: r["n"] for r in q(
        conn, f"SELECT label, COUNT(*) n FROM assessments WHERE id IN {LATEST} GROUP BY label")}
    m["candidates"] = one(conn, f"SELECT COUNT(*) FROM assessments WHERE id IN {LATEST} "
                                f"AND json_extract(features,'$.vendor_signal')!='none'")
    m["opps_by_status"] = {r["status"]: r["n"] for r in q(conn, "SELECT status, COUNT(*) n FROM opportunities GROUP BY status")}
    m["opps_by_country"] = {}
    for r in q(conn, "SELECT COALESCE(country,'??') c, status, COUNT(*) n FROM opportunities GROUP BY c, status"):
        m["opps_by_country"].setdefault(r["c"], {})[r["status"]] = r["n"]
    m["actionable_by_region"] = [dict(r) for r in q(
        conn, "SELECT country, COALESCE(region,'?') region, COUNT(*) n FROM opportunities WHERE status='actionable' "
              "GROUP BY country, region ORDER BY n DESC LIMIT 25")]
    et = Counter()
    for r in q(conn, "SELECT event_types FROM opportunities WHERE status='actionable'"):
        for t in json.loads(r[0] or "[]")[:2]:
            et[t] += 1
    m["actionable_event_types"] = dict(et.most_common())
    n_src = one(conn, "SELECT COUNT(*) FROM opportunity_sources")
    n_opp = one(conn, "SELECT COUNT(*) FROM opportunities") or 0
    m["sightings"] = n_src
    m["duplicate_sightings_merged"] = (n_src or 0) - n_opp
    m["match_methods"] = {r["match_method"]: r["n"] for r in q(
        conn, "SELECT match_method, COUNT(*) n FROM opportunity_sources GROUP BY match_method")}
    m["multi_source_opps"] = one(conn, "SELECT COUNT(*) FROM opportunities WHERE n_sources>1")
    m["multi_domain_opps"] = one(conn, "SELECT COUNT(*) FROM opportunities WHERE n_domains>1")

    # Attribution: which generator first found each opportunity (generator of its primary source URL).
    gen_rows = q(conn, """
        SELECT u.generator g,
               COUNT(*) fetched,
               SUM(u.state='done') ok
        FROM urls u WHERE u.fetched_at IS NOT NULL GROUP BY u.generator""")
    gens = {r["g"]: {"fetched": r["fetched"], "ok": r["ok"], "actionable": 0, "uncertain": 0} for r in gen_rows}
    for r in q(conn, """
        SELECT u.generator g, o.status s, COUNT(DISTINCT o.id) n FROM opportunities o
        JOIN opportunity_sources os ON os.opportunity_id=o.id AND os.role='primary'
        JOIN urls u ON u.id=os.url_id GROUP BY g, s"""):
        gens.setdefault(r["g"], {"fetched": 0, "ok": 0, "actionable": 0, "uncertain": 0})
        if r["s"] in ("actionable", "uncertain"):
            gens[r["g"]][r["s"]] += r["n"]
    for g, v in gens.items():
        v["actionable_per_100_fetches"] = round(100 * v["actionable"] / v["fetched"], 2) if v["fetched"] else None
    m["generators"] = dict(sorted(gens.items(), key=lambda kv: -kv[1]["actionable"]))

    act = m["opps_by_status"].get("actionable", 0)
    m["yield_actionable_per_100_fetches"] = round(100 * act / m["fetch_attempts"], 2) if m["fetch_attempts"] else 0
    m["fetches_per_actionable"] = round(m["fetch_attempts"] / act, 1) if act else None
    m["actionable_per_hour"] = round(act / (m["crawl_seconds"] / 3600), 1) if m["crawl_seconds"] else None

    # Diversity
    doms = Counter(r[0] for r in q(conn, """SELECT u.reg_domain FROM opportunities o
        JOIN opportunity_sources s ON s.opportunity_id=o.id AND s.role='primary'
        JOIN urls u ON u.id=s.url_id WHERE o.status='actionable'"""))
    m["actionable_distinct_primary_domains"] = len(doms)
    tot = sum(doms.values()) or 1
    m["top_primary_domains"] = dict(doms.most_common(8))
    m["primary_domain_hhi"] = round(sum((c / tot) ** 2 for c in doms.values()), 3)
    plat = Counter()
    for r in q(conn, "SELECT apply_url FROM opportunities WHERE status='actionable'"):
        from .lexicon import platform_of
        plat[platform_of(r[0] or "") or ("email" if (r[0] or "").startswith("mailto:") else "organiser site")] += 1
    m["actionable_route_platforms"] = dict(plat.most_common(12))
    m["review"] = {r["review_label"]: r["n"] for r in q(
        conn, "SELECT review_label, COUNT(*) n FROM opportunities WHERE review_label IS NOT NULL GROUP BY review_label")}
    m["review_by_status"] = {}
    for r in q(conn, "SELECT status, review_label, COUNT(*) n FROM opportunities WHERE review_label IS NOT NULL GROUP BY 1,2"):
        m["review_by_status"].setdefault(r["status"], {})[r["review_label"]] = r["n"]
    m["errors_logged"] = {f"{r['stage']}:{r['error_type']}": r["n"] for r in q(
        conn, "SELECT stage, error_type, COUNT(*) n FROM errors GROUP BY 1,2 ORDER BY n DESC LIMIT 12")}
    return m


EXPORT_COLS = ["id", "status", "confidence", "name", "organiser", "country", "region", "locality", "venue",
               "start_date", "end_date", "recurrence", "deadline", "application_status", "event_types",
               "trader_types", "fees", "apply_url", "primary_url", "n_sources", "n_domains", "reasons",
               "first_seen", "last_checked", "review_label"]


def export_csv(conn, path: Path, statuses=("actionable", "uncertain")) -> int:
    rows = q(conn, f"SELECT * FROM opportunities WHERE status IN ({','.join('?' * len(statuses))}) "
                   "ORDER BY status, country, start_date", *statuses)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(EXPORT_COLS + ["evidence"])
        for r in rows:
            ev = q(conn, """SELECT a.evidence FROM assessments a JOIN opportunity_sources s ON s.assessment_id=a.id
                            WHERE s.opportunity_id=? ORDER BY a.score DESC LIMIT 1""", r["id"])
            evs = json.loads(ev[0][0]) if ev else []
            evtxt = " || ".join(f"[{e['kind']}] {e['text']}" for e in evs[:4])
            out = []
            for c in EXPORT_COLS:
                v = r[c]
                if c in ("first_seen", "last_checked") and v:
                    import datetime as dt
                    v = dt.datetime.fromtimestamp(v).isoformat(timespec="seconds")
                out.append(v)
            w.writerow(out + [evtxt])
    return len(rows)


def audit(conn, opp_id: int) -> str:
    o = conn.execute("SELECT * FROM opportunities WHERE id=?", (opp_id,)).fetchone()
    if not o:
        return f"no opportunity {opp_id}"
    lines = [f"# Opportunity {opp_id}: {o['name']}  [{o['status']} conf={o['confidence']}]"]
    for k in EXPORT_COLS[3:]:
        if o[k] not in (None, "", "[]"):
            lines.append(f"  {k:18} {o[k]}")
    lines.append("\nSources:")
    for s in q(conn, """SELECT s.role, s.match_method, s.match_score, u.url, u.generator, u.fetched_at, a.label, a.reasons,
                        a.evidence, a.classifier_version, u.content_hash FROM opportunity_sources s
                        JOIN urls u ON u.id=s.url_id LEFT JOIN assessments a ON a.id=s.assessment_id
                        WHERE s.opportunity_id=?""", opp_id):
        lines.append(f"- [{s['role']}/{s['match_method']} {s['match_score']}] {s['url']}")
        lines.append(f"    via {s['generator']}; page label={s['label']} {s['reasons']} ({s['classifier_version']}, sha256 {str(s['content_hash'])[:12]})")
        for e in json.loads(s["evidence"] or "[]")[:6]:
            lines.append(f"    · {e['kind']}: {e['text'][:260]}")
    return "\n".join(lines)


def render_markdown(m: dict) -> str:
    L = ["# FindPitches discovery lab — experiment report", ""]
    st = m["opps_by_status"]
    L += ["## Headline", "",
          f"- **Actionable opportunities:** {st.get('actionable', 0)}",
          f"- **Uncertain (needs review):** {st.get('uncertain', 0)}",
          f"- Pages fetched: {m['fetch_attempts']} ({m['fetch_ok']} ok, {m['fetch_failed']} failed, {m['robots_blocked']} robots-blocked) "
          f"across {m['sites_fetched']} sites; {m['bytes'] / 1e6:.1f} MB",
          f"- Yield: **{m['yield_actionable_per_100_fetches']} actionable per 100 fetches** "
          f"(≈{m['fetches_per_actionable']} fetches per actionable opportunity); crawl time {m['crawl_seconds'] / 3600:.2f} h"
          + (f", {m['actionable_per_hour']} actionable/hour" if m['actionable_per_hour'] else ""),
          f"- Duplicates: {m['duplicate_sightings_merged']} sightings merged into existing opportunities; "
          f"{m['multi_source_opps']} opportunities have >1 source, {m['multi_domain_opps']} corroborated on >1 domain",
          f"- Source diversity: {m['actionable_distinct_primary_domains']} distinct primary domains for actionable records "
          f"(HHI {m['primary_domain_hhi']})", ""]
    if m["review"]:
        L += ["## Audit (manual review sample)", "", f"- Labels: {m['review']}", f"- By status: {m['review_by_status']}", ""]
    L += ["## Opportunities by country", "", "| Country | Actionable | Uncertain |", "|---|---|---|"]
    for c, v in sorted(m["opps_by_country"].items(), key=lambda kv: -kv[1].get("actionable", 0)):
        L.append(f"| {c} | {v.get('actionable', 0)} | {v.get('uncertain', 0)} |")
    L += ["", "## Discovery strategies (attribution = generator that produced the primary source)", "",
          "| Generator | Fetches | Actionable | Uncertain | Actionable / 100 fetches |", "|---|---|---|---|---|"]
    for g, v in m["generators"].items():
        L.append(f"| {g} | {v['fetched']} | {v['actionable']} | {v['uncertain']} | {v['actionable_per_100_fetches']} |")
    L += ["", "## Page-level classification", "", f"- Pages assessed: {m['pages_assessed']}; with any vendor signal (candidates): {m['candidates']}",
          f"- Labels: {m['page_labels']}", "", "## Dedup match methods", "", f"{m['match_methods']}", "",
          "## Application routes of actionable records", "", f"{m['actionable_route_platforms']}", "",
          "## Event types (actionable)", "", f"{m['actionable_event_types']}", "",
          "## External API calls", "", f"{m['api_calls']}", "", "## Failures", "",
          f"- Fetch failures by type: {m['errors_by_type']}", f"- Logged errors: {m['errors_logged']}", ""]
    return "\n".join(L)


def render_html(conn, m: dict, limit: int = 3000) -> str:
    rows = q(conn, "SELECT * FROM opportunities WHERE status IN ('actionable','uncertain') ORDER BY status, country, "
                   "COALESCE(start_date,'9999') LIMIT ?", limit)
    esc = html.escape
    trs = []
    for r in rows:
        link = f'<a href="{esc(r["primary_url"] or "")}" target="_blank" rel="noopener">source</a>'
        ap = f'<a href="{esc(r["apply_url"])}" target="_blank" rel="noopener">apply</a>' if r["apply_url"] and not r["apply_url"].startswith("mailto") else esc(r["apply_url"] or "")
        trs.append(
            f'<tr data-status="{r["status"]}" data-country="{esc(r["country"] or "")}"><td>{r["id"]}</td><td><span class="b {r["status"]}">{r["status"]}</span></td>'
            f'<td>{esc(r["name"] or "")}</td><td>{esc(r["country"] or "")}</td><td>{esc(r["region"] or r["locality"] or "")}</td>'
            f'<td>{esc(r["start_date"] or r["recurrence"] or "")}</td><td>{esc(r["deadline"] or "")}</td>'
            f'<td>{esc(", ".join(json.loads(r["event_types"] or "[]")[:2]))}</td><td>{r["n_sources"]}</td>'
            f'<td>{link} · {ap}</td><td class="r">{esc(", ".join(json.loads(r["reasons"] or "[]")))}</td></tr>')
    md = render_markdown(m)
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Discovery lab results</title><style>
:root{{--bg:#fbfbfa;--fg:#1d1d1b;--mut:#6b6b66;--line:#e4e3df;--act:#1f7a4d;--unc:#a66a00}}
@media (prefers-color-scheme:dark){{:root{{--bg:#161615;--fg:#ecebe7;--mut:#a3a29c;--line:#2e2d2b;--act:#4cc38a;--unc:#e0a43a}}}}
body{{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:0;padding:16px;max-width:1400px}}
pre{{white-space:pre-wrap;font-size:13px}} table{{border-collapse:collapse;width:100%}} td,th{{border-bottom:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}}
.b{{font-size:11px;padding:1px 6px;border-radius:8px;border:1px solid}} .actionable{{color:var(--act)}} .uncertain{{color:var(--unc)}} .r{{color:var(--mut);font-size:12px}}
a{{color:inherit}} input,select{{padding:4px;margin:4px 6px 8px 0}} .wrap{{overflow-x:auto}}
</style></head><body><pre>{esc(md)}</pre>
<div><input id="f" placeholder="filter text"> <select id="s"><option value="">all statuses</option><option>actionable</option><option>uncertain</option></select></div>
<div class="wrap"><table><thead><tr><th>id</th><th>status</th><th>name</th><th>cc</th><th>region</th><th>date</th><th>deadline</th><th>type</th><th>src</th><th>links</th><th>why</th></tr></thead>
<tbody id="t">{''.join(trs)}</tbody></table></div>
<script>const f=document.getElementById('f'),s=document.getElementById('s');function go(){{const v=f.value.toLowerCase(),st=s.value;for(const tr of document.querySelectorAll('#t tr')){{tr.style.display=((!st||tr.dataset.status===st)&&tr.textContent.toLowerCase().includes(v))?'':'none'}}}}f.oninput=go;s.onchange=go;</script>
</body></html>"""
