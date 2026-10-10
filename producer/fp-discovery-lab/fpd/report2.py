"""Round-2 reporting: relevance vs availability, per-lane economics, watch pipeline, audit results.

Everything is computed from the DB so the report can be regenerated at any time
(`python -m fpd report`). Output: output/report.html (practical, filterable), output/report.md,
output/metrics.json, output/opportunities.csv, output/watchlist.csv.
"""
from __future__ import annotations

import csv
import datetime as dt
import html
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

LATEST = "(SELECT MAX(id) FROM assessments GROUP BY url_id)"
STATE_ORDER = ["OPEN_NOW", "ROLLING", "ENQUIRY_AVAILABLE", "UPCOMING_NOT_OPEN", "CLOSED_CURRENT_CYCLE",
               "UNKNOWN", "HISTORICAL"]
ACTIONABLE = ("OPEN_NOW", "ROLLING")
WATCH = ("UPCOMING_NOT_OPEN", "CLOSED_CURRENT_CYCLE", "UNKNOWN", "HISTORICAL")


def q(conn, sql, *a):
    return conn.execute(sql, a).fetchall()


def one(conn, sql, *a):
    r = conn.execute(sql, a).fetchone()
    return r[0] if r else None


def wilson(k: int, n: int, z: float = 1.96):
    if not n:
        return (None, None, None)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (round(p, 3), round(max(0, c - h), 3), round(min(1, c + h), 3))


def lane_family(g: str) -> str:
    if g.startswith("directory:"):
        return "directories (all)"
    return g


def compute(conn) -> dict:
    m: dict = {"generated_at": dt.datetime.now().isoformat(timespec="seconds")}
    rel = "relevance='relevant'"
    m["relevant"] = one(conn, f"SELECT COUNT(*) FROM opportunities WHERE {rel}")
    m["by_state"] = {r[0]: r[1] for r in q(conn, f"SELECT state, COUNT(*) FROM opportunities WHERE {rel} GROUP BY 1")}
    m["actionable"] = sum(m["by_state"].get(s, 0) for s in ACTIONABLE)
    m["enquiry"] = m["by_state"].get("ENQUIRY_AVAILABLE", 0)
    m["watch"] = sum(m["by_state"].get(s, 0) for s in WATCH)
    m["closed"] = m["by_state"].get("CLOSED_CURRENT_CYCLE", 0)
    m["pages_rejected"] = one(conn, f"SELECT COUNT(*) FROM assessments WHERE id IN {LATEST} AND label='rejected'")
    m["pages_hub"] = one(conn, f"SELECT COUNT(*) FROM assessments WHERE id IN {LATEST} AND label='hub'")
    m["pages_assessed"] = one(conn, f"SELECT COUNT(*) FROM assessments WHERE id IN {LATEST}")
    m["duplicate_sightings"] = one(conn, "SELECT COUNT(*) FROM opportunity_sources WHERE match_method NOT IN ('new','same_page')")
    m["match_methods"] = {r[0]: r[1] for r in q(conn, "SELECT match_method, COUNT(*) FROM opportunity_sources GROUP BY 1")}
    m["routes_total"] = one(conn, "SELECT COUNT(*) FROM routes")
    m["multi_category"] = one(conn, f"SELECT COUNT(*) FROM opportunities WHERE {rel} AND json_array_length(route_categories)>1")
    m["fetches"] = one(conn, "SELECT COUNT(*) FROM urls WHERE fetched_at IS NOT NULL")
    m["fetch_ok"] = one(conn, "SELECT COUNT(*) FROM urls WHERE state='done'")
    m["robots_blocked"] = one(conn, "SELECT COUNT(*) FROM urls WHERE last_error='robots'")
    m["api_calls"] = {r[0]: {"calls": r[1], "errors": r[2]} for r in q(
        conn, "SELECT api, COUNT(*), SUM(error IS NOT NULL) FROM api_calls GROUP BY 1")}

    # country × state
    cs = defaultdict(Counter)
    for c, s, n in q(conn, f"SELECT COALESCE(country,'??'), state, COUNT(*) FROM opportunities WHERE {rel} GROUP BY 1,2"):
        cs[c][s] = n
    m["country_state"] = {c: dict(v) for c, v in sorted(cs.items(), key=lambda kv: -sum(kv[1].values()))}

    # event types
    et = defaultdict(Counter)
    for types, s in q(conn, f"SELECT event_types, state FROM opportunities WHERE {rel}"):
        for t in (json.loads(types or "[]") or ["unspecified"])[:1]:
            et[t][s] += 1
    m["type_state"] = {k: dict(v) for k, v in sorted(et.items(), key=lambda kv: -sum(kv[1].values()))}

    # platform of the route used for actionable records
    plat = Counter()
    for (p,) in q(conn, "SELECT r.platform FROM routes r JOIN opportunities o ON o.id=r.opportunity_id "
                        "WHERE o.state IN ('OPEN_NOW','ROLLING') GROUP BY r.opportunity_id"):
        plat[p or "organiser site/document/email"] += 1
    m["actionable_route_platforms"] = dict(plat.most_common(20))

    # ---- lanes ----
    lanes: dict[str, dict] = {}
    for g, n, ok, doms in q(conn, "SELECT generator, COUNT(*), SUM(state='done'), COUNT(DISTINCT reg_domain) FROM urls "
                                  "WHERE fetched_at IS NOT NULL GROUP BY 1"):
        lanes[g] = {"fetches": n, "ok": ok, "domains_reached": doms}
    for g, cand, rej in q(conn, f"SELECT u.generator, SUM(json_extract(a.features,'$.vendor_signal')!='none'), "
                                f"SUM(a.label='rejected') FROM urls u JOIN assessments a ON a.url_id=u.id "
                                f"WHERE a.id IN {LATEST} GROUP BY 1"):
        lanes.setdefault(g, {}).update(candidates=cand or 0, rejected_pages=rej or 0)
    for g, s, n, orgs, ccs in q(conn, f"SELECT lane, state, COUNT(*), COUNT(DISTINCT primary_url), GROUP_CONCAT(DISTINCT country) "
                                      f"FROM opportunities WHERE {rel} GROUP BY 1,2"):
        L = lanes.setdefault(g, {})
        L.setdefault("states", {})[s] = n
        L["countries"] = sorted(set((L.get("countries") or []) + [c for c in (ccs or "").split(",") if c]))
    for g, n in q(conn, "SELECT u.generator, COUNT(*) FROM opportunity_sources s JOIN urls u ON u.id=s.url_id "
                        "WHERE s.match_method NOT IN ('new','same_page') GROUP BY 1"):
        lanes.setdefault(g, {})["duplicate_sightings"] = n
    for g, n in q(conn, f"SELECT lane, COUNT(DISTINCT u.reg_domain) FROM opportunities o JOIN opportunity_sources s "
                        f"ON s.opportunity_id=o.id AND s.role='primary' JOIN urls u ON u.id=s.url_id WHERE {rel} GROUP BY 1"):
        lanes.setdefault(g, {})["organiser_domains"] = n
    for g, L in lanes.items():
        st = L.get("states", {})
        L["unique_opportunities"] = sum(st.values())
        L["actionable"] = sum(st.get(s, 0) for s in ACTIONABLE)
        L["enquiry"] = st.get("ENQUIRY_AVAILABLE", 0)
        L["watch"] = sum(st.get(s, 0) for s in WATCH)
        f = L.get("fetches") or 0
        L["opps_per_100"] = round(100 * L["unique_opportunities"] / f, 2) if f else None
        L["actionable_per_100"] = round(100 * L["actionable"] / f, 2) if f else None
        L["fetches_per_actionable"] = round(f / L["actionable"], 1) if L["actionable"] else None
    m["lanes"] = dict(sorted(lanes.items(), key=lambda kv: -(kv[1].get("actionable") or 0)))
    fam: dict[str, Counter] = defaultdict(Counter)
    for g, L in lanes.items():
        F = fam[lane_family(g)]
        for k in ("fetches", "unique_opportunities", "actionable", "enquiry", "watch", "candidates", "duplicate_sightings"):
            F[k] += L.get(k) or 0
    for F in fam.values():
        F["actionable_per_100"] = round(100 * F["actionable"] / F["fetches"], 2) if F["fetches"] else 0
    m["lane_families"] = {k: dict(v) for k, v in sorted(fam.items(), key=lambda kv: -kv[1]["actionable"])}
    act = m["actionable"]
    m["overall"] = {"actionable_per_100_fetches": round(100 * act / m["fetches"], 2) if m["fetches"] else None,
                    "relevant_per_100_fetches": round(100 * m["relevant"] / m["fetches"], 2) if m["fetches"] else None,
                    "fetches_per_actionable": round(m["fetches"] / act, 1) if act else None}

    # ---- watch pipeline ----
    m["watch_by_priority"] = {r[0] or "-": r[1] for r in q(
        conn, f"SELECT watch_priority, COUNT(*) FROM opportunities WHERE {rel} AND status='watch' GROUP BY 1")}
    m["watch_by_month"] = {r[0]: r[1] for r in q(
        conn, f"SELECT substr(next_check,1,7), COUNT(*) FROM opportunities WHERE {rel} AND next_check IS NOT NULL "
              f"GROUP BY 1 ORDER BY 1")}
    m["watch_basis"] = {r[0]: r[1] for r in q(
        conn, f"SELECT next_check_basis, COUNT(*) FROM opportunities WHERE {rel} AND next_check IS NOT NULL GROUP BY 1")}

    # ---- audit (round 2: table audit_r2, labels per record) ----
    # labels: correct | wrong_state (relevant, wrong availability) | not_relevant | left_bucket (state changed by a
    # later fix; excluded) | correct_reject | missed (false negative in a rejected/unknown sample)
    aud = {}
    try:
        for b, lab, n in q(conn, "SELECT bucket, label, COUNT(*) FROM audit_r2 GROUP BY 1,2"):
            aud.setdefault(b, Counter())[lab] = n
    except Exception:  # noqa: BLE001
        pass
    out = {}
    for b, c in aud.items():
        n = sum(v for k, v in c.items() if k != "left_bucket")
        ok = c.get("correct", 0) + c.get("correct_reject", 0)
        rel_ok = ok + c.get("wrong_state", 0)
        out[b] = {"n": n, "strict": ok, "relevant": rel_ok, "wrong_state": c.get("wrong_state", 0),
                  "not_relevant": c.get("not_relevant", 0), "missed": c.get("missed", 0),
                  "left_bucket": c.get("left_bucket", 0),
                  "strict_ci": wilson(ok, n), "relevance_ci": wilson(rel_ok, n)}
    # population-weighted actionable precision (OPEN_NOW + ROLLING), weights = current bucket sizes
    pops = {"open_eventeny": "lane='platform:eventeny'", "open_localstalls": "lane='platform:localstalls'",
            "open_cluemart": "lane='platform:cluemart'",
            "open_organiser": "lane NOT IN ('platform:eventeny','platform:localstalls','platform:cluemart')"}
    W = tot = 0.0
    Wr = 0.0
    for b, cond in pops.items():
        if b in out and out[b]["n"]:
            npop = one(conn, f"SELECT COUNT(*) FROM opportunities WHERE {rel} AND state IN ('OPEN_NOW','ROLLING') AND {cond}") or 0
            out[b]["population"] = npop
            tot += npop
            W += npop * out[b]["strict"] / out[b]["n"]
            Wr += npop * out[b]["relevant"] / out[b]["n"]
    for b, st in (("enquiry", "ENQUIRY_AVAILABLE"), ("upcoming", "UPCOMING_NOT_OPEN"), ("closed", "CLOSED_CURRENT_CYCLE"),
                  ("historical", "HISTORICAL"), ("unknown", "UNKNOWN")):
        if b in out:
            out[b]["population"] = one(conn, f"SELECT COUNT(*) FROM opportunities WHERE {rel} AND state=?", st)
    if "rejected_hard_negatives" in out:
        out["rejected_hard_negatives"]["population"] = one(
            conn, "SELECT COUNT(*) FROM urls u JOIN assessments a ON a.id=(SELECT MAX(id) FROM assessments WHERE url_id=u.id) "
                  "WHERE (a.label='rejected' AND json_extract(a.features,'$.vendor_signal')='strong') OR "
                  "(a.label IN ('actionable','uncertain') AND json_extract(a.extracted,'$.relevance')='not_relevant')")
    if tot:
        out["_weighted_actionable"] = {"population": int(tot), "strict": round(W / tot, 3), "relevance": round(Wr / tot, 3)}
    m["audit"] = out
    return m


def export(conn, out: Path) -> dict:
    cols = ["id", "state", "name", "organiser", "country", "region", "locality", "start_date", "end_date", "deadline",
            "opens_on", "recurrence_evidence", "apply_url", "primary_url", "state_evidence", "lane", "n_sources",
            "n_routes", "route_categories", "event_types", "first_seen"]
    rows = q(conn, "SELECT * FROM opportunities WHERE relevance='relevant' ORDER BY "
                   "CASE state WHEN 'OPEN_NOW' THEN 0 WHEN 'ROLLING' THEN 1 WHEN 'ENQUIRY_AVAILABLE' THEN 2 ELSE 3 END, country, start_date")
    with open(out / "opportunities.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in rows:
            w.writerow([dt.datetime.fromtimestamp(r[c]).date().isoformat() if c == "first_seen" and r[c] else r[c] for c in cols])
    wcols = ["id", "next_check", "next_check_basis", "watch_priority", "state", "name", "country", "watch_reason",
             "missing_evidence", "recurrence_evidence", "revisit_url", "state_evidence"]
    wrows = q(conn, "SELECT * FROM opportunities WHERE relevance='relevant' AND status IN ('watch','enquiry') ORDER BY next_check")
    with open(out / "watchlist.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(wcols)
        for r in wrows:
            w.writerow([r[c] for c in wcols])
    return {"opportunities": len(rows), "watchlist": len(wrows)}


def _t(rows, head, cls=""):
    e = html.escape
    th = "".join(f"<th>{e(str(h))}</th>" for h in head)
    tb = "".join("<tr>" + "".join(f"<td>{c if isinstance(c, str) and c.startswith('<') else e('' if c is None else str(c))}</td>" for c in r) + "</tr>" for r in rows)
    return f'<div class="wrap"><table class="{cls}"><thead><tr>{th}</tr></thead><tbody>{tb}</tbody></table></div>'


def _a(url, text=None):
    if not url:
        return ""
    return f'<a href="{html.escape(url)}" target="_blank" rel="noopener">{html.escape(text or "link")}</a>'


def render_html(conn, m: dict) -> str:
    e = html.escape
    S = STATE_ORDER
    tiles = [("Relevant opportunities", m["relevant"]), ("Open / actionable now", m["actionable"]),
             ("Enquiry available", m["enquiry"]), ("Watch (upcoming/closed/unknown/historical)", m["watch"]),
             ("…of which closed this cycle", m["closed"]), ("Pages rejected", m["pages_rejected"]),
             ("Duplicate sightings merged", m["duplicate_sightings"]), ("Fetches per actionable", m["overall"]["fetches_per_actionable"])]
    tiles_h = "".join(f'<div class="tile"><div class="v">{e(str(v))}</div><div class="k">{e(k)}</div></div>' for k, v in tiles)
    country = _t([[c] + [v.get(s, 0) for s in S] + [sum(v.values())] for c, v in m["country_state"].items()], ["Country"] + S + ["Total"])
    types = _t([[t] + [v.get(s, 0) for s in S] + [sum(v.values())] for t, v in m["type_state"].items()], ["Primary type"] + S + ["Total"])
    lane_rows = []
    for g, L in m["lanes"].items():
        if not L.get("fetches") and not L.get("unique_opportunities"):
            continue
        lane_rows.append([g, L.get("fetches"), L.get("candidates"), L.get("unique_opportunities"), L.get("actionable"),
                          L.get("enquiry"), L.get("watch"), L.get("rejected_pages"), L.get("duplicate_sightings", 0),
                          L.get("opps_per_100"), L.get("actionable_per_100"), L.get("domains_reached"),
                          L.get("organiser_domains"), ",".join(L.get("countries") or [])])
    lanes = _t(lane_rows, ["Lane", "Fetches", "Candidates", "Unique opps", "Actionable", "Enquiry", "Watch", "Rejected pages",
                           "Duplicates", "Opps/100", "Actionable/100", "Domains reached", "Organiser domains", "Countries"])
    fam = _t([[k, v["fetches"], v["unique_opportunities"], v["actionable"], v["enquiry"], v["watch"], v["actionable_per_100"]]
              for k, v in m["lane_families"].items()], ["Lane family", "Fetches", "Unique opps", "Actionable", "Enquiry", "Watch", "Actionable/100"])
    ranked = [(g, L) for g, L in m["lanes"].items() if (L.get("fetches") or 0) >= 50]
    best = sorted(ranked, key=lambda kv: -(kv[1].get("actionable_per_100") or 0))[:6]
    worst = sorted(ranked, key=lambda kv: (kv[1].get("actionable_per_100") or 0, -(kv[1].get("fetches") or 0)))[:8]
    bw = _t([[g, L["fetches"], L["actionable"], L["actionable_per_100"]] for g, L in best], ["Best lanes (≥50 fetches)", "Fetches", "Actionable", "Actionable/100"]) + \
        _t([[g, L["fetches"], L["actionable"], L["actionable_per_100"]] for g, L in worst], ["Worst lanes (≥50 fetches)", "Fetches", "Actionable", "Actionable/100"])
    A = {k: v for k, v in m["audit"].items() if not k.startswith("_")}
    aud = _t([[b, v.get("population", ""), v["n"], v["strict"], v["strict_ci"][0], f"{v['strict_ci'][1]}–{v['strict_ci'][2]}",
               v["relevance_ci"][0], f"{v['relevance_ci'][1]}–{v['relevance_ci'][2]}", v["wrong_state"], v["not_relevant"],
               v["missed"]] for b, v in sorted(A.items())],
             ["Audit bucket", "Population", "n", "Correct", "Strict precision", "95% CI", "Relevance precision", "95% CI",
              "Wrong state", "Not relevant", "Missed (FN)"]) if A else "<p>No audit labels recorded.</p>"
    wa = m["audit"].get("_weighted_actionable")
    if wa:
        aud += (f"<p>Population-weighted precision of the actionable set (OPEN_NOW+ROLLING, {wa['population']} records): "
                f"strict <b>{wa['strict']:.1%}</b>, relevance <b>{wa['relevance']:.1%}</b>.</p>")
    recent = q(conn, "SELECT * FROM opportunities WHERE relevance='relevant' AND state IN ('OPEN_NOW','ROLLING','ENQUIRY_AVAILABLE') "
                     "ORDER BY first_seen DESC LIMIT 30")
    rec = _t([[r["state"], r["name"], r["country"], r["start_date"] or "", r["lane"], _a(r["apply_url"] or r["primary_url"], "open")]
              for r in recent], ["State", "Name", "Country", "Date", "Lane", "Route"])
    samples = []
    for s in S:
        for r in q(conn, "SELECT * FROM opportunities WHERE relevance='relevant' AND state=? ORDER BY random() LIMIT 2", s):
            samples.append([s, r["name"], r["country"], (r["state_evidence"] or "")[:260], _a(r["state_source_url"], "source")])
    smp = _t(samples, ["State", "Name", "Cc", "Evidence (quoted/derived)", "Source"])
    wl = q(conn, "SELECT * FROM opportunities WHERE relevance='relevant' AND status='watch' ORDER BY "
                 "CASE watch_priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, next_check LIMIT 60")
    watch = _t([[r["next_check"], r["watch_priority"], r["state"], r["name"], r["country"], r["watch_reason"],
                 (r["next_check_basis"] or "")[:70], _a(r["revisit_url"], "revisit")] for r in wl],
               ["Next check", "Priority", "State", "Name", "Cc", "Why watch", "Basis", "Revisit"])
    wsum = _t([[k, v] for k, v in m["watch_by_month"].items()], ["Next-check month", "Records"])
    # filterable full table (relevant only)
    allr = q(conn, "SELECT * FROM opportunities WHERE relevance='relevant' ORDER BY "
                   "CASE state WHEN 'OPEN_NOW' THEN 0 WHEN 'ROLLING' THEN 1 WHEN 'ENQUIRY_AVAILABLE' THEN 2 "
                   "WHEN 'UPCOMING_NOT_OPEN' THEN 3 WHEN 'CLOSED_CURRENT_CYCLE' THEN 4 WHEN 'UNKNOWN' THEN 5 ELSE 6 END, country, start_date LIMIT 6000")
    trs = "".join(
        f'<tr data-s="{e(r["state"] or "")}" data-c="{e(r["country"] or "")}"><td>{r["id"]}</td><td>{e(r["state"] or "")}</td>'
        f'<td>{e(r["name"] or "")}</td><td>{e(r["country"] or "")}</td><td>{e(r["region"] or r["locality"] or "")}</td>'
        f'<td>{e(r["start_date"] or "")}</td><td>{e(r["deadline"] or r["opens_on"] or "")}</td><td>{e(r["lane"] or "")}</td>'
        f'<td>{_a(r["apply_url"] or r["primary_url"], "route")} · {_a(r["primary_url"], "source")}</td>'
        f'<td class="r">{e((r["state_evidence"] or "")[:180])}</td></tr>' for r in allr)
    opts_s = "".join(f"<option>{s}</option>" for s in S)
    opts_c = "".join(f"<option>{c}</option>" for c in m["country_state"])
    plat = _t([[k, v] for k, v in m["actionable_route_platforms"].items()], ["Route platform (actionable)", "Records"])
    methods = _t([[k, v] for k, v in m["match_methods"].items()], ["Dedup match method", "Source links"])
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Discovery lab report</title><style>
:root{{--bg:#fbfbfa;--fg:#1d1d1b;--mut:#6b6b66;--line:#e4e3df;--tile:#f1f0ec;--acc:#1f6f4a}}
@media (prefers-color-scheme:dark){{:root{{--bg:#161615;--fg:#ecebe7;--mut:#a3a29c;--line:#2e2d2b;--tile:#222120;--acc:#5ccf95}}}}
body{{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:0 auto;padding:16px;max-width:1500px}}
h1{{font-size:22px}} h2{{font-size:17px;margin-top:28px;border-bottom:1px solid var(--line);padding-bottom:4px}}
.tiles{{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}}
.tile{{background:var(--tile);border-radius:8px;padding:10px}} .tile .v{{font-size:22px;font-weight:600;color:var(--acc)}} .tile .k{{color:var(--mut);font-size:12px}}
table{{border-collapse:collapse;width:100%;margin:6px 0 14px}} td,th{{border-bottom:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}}
th{{font-weight:600;font-size:12px;color:var(--mut)}} .wrap{{overflow-x:auto}} .r{{color:var(--mut);font-size:12px}} a{{color:inherit}}
.cols{{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}} input,select{{padding:4px;margin:4px 6px 8px 0}}
p.note{{color:var(--mut);font-size:13px}}
</style></head><body>
<h1>FindPitches discovery lab — round 2 report</h1>
<p class="note">Generated {e(m['generated_at'])}. Relevance (is it a trading opportunity?) is reported separately from availability (can a trader act today?).
Actionable = OPEN_NOW + ROLLING. Revisit dates marked “internal” are scheduling decisions, not source facts.</p>
<div class="tiles">{tiles_h}</div>
<h2>Application state by country</h2>{country}
<h2>Acquisition lanes</h2><p class="note">Fetches include sitemaps/listing pages the lane needed. Candidates = pages with any vendor signal. Duplicates = sightings merged into an existing record.</p>
{fam}{lanes}
<h2>Best and worst lanes</h2><div class="cols">{bw}</div>
<h2>Opportunity type × state</h2>{types}
<div class="cols"><div><h2>Routes used by actionable records</h2>{plat}</div><div><h2>Duplicate handling</h2>{methods}
<p class="note">{m['routes_total']} application routes stored; {m['multi_category']} opportunities have routes for more than one trader category (e.g. food and craft) — kept as routes of one opportunity, not as separate records.</p></div></div>
<h2>Audit results (manual review)</h2>{aud}
<h2>Watch pipeline</h2><div class="cols"><div>{wsum}</div><div>{_t([[k, v] for k, v in m['watch_by_priority'].items()], ['Priority', 'Records'])}</div></div>{watch}
<h2>Recently discovered (actionable / enquiry)</h2>{rec}
<h2>Sample evidence by state</h2>{smp}
<h2>All relevant opportunities</h2>
<div><input id="f" placeholder="filter text"> <select id="s"><option value="">all states</option>{opts_s}</select>
<select id="c"><option value="">all countries</option>{opts_c}</select></div>
<div class="wrap"><table><thead><tr><th>id</th><th>state</th><th>name</th><th>cc</th><th>region</th><th>date</th><th>deadline/opens</th><th>lane</th><th>links</th><th>evidence</th></tr></thead><tbody id="t">{trs}</tbody></table></div>
<script>const f=document.getElementById('f'),s=document.getElementById('s'),c=document.getElementById('c');
function go(){{const v=f.value.toLowerCase();for(const tr of document.querySelectorAll('#t tr')){{tr.style.display=((!s.value||tr.dataset.s===s.value)&&(!c.value||tr.dataset.c===c.value)&&tr.textContent.toLowerCase().includes(v))?'':'none'}}}}
f.oninput=go;s.onchange=go;c.onchange=go;</script></body></html>"""


def render_md(m: dict) -> str:
    L = ["# Discovery lab — round 2 metrics", "",
         f"- Relevant opportunities: **{m['relevant']}**",
         f"- Actionable now (OPEN_NOW+ROLLING): **{m['actionable']}**; enquiry available: {m['enquiry']}; watch: {m['watch']} "
         f"(closed this cycle {m['closed']})",
         f"- Fetches: {m['fetches']}; actionable per 100 fetches: {m['overall']['actionable_per_100_fetches']}; "
         f"fetches per actionable: {m['overall']['fetches_per_actionable']}",
         f"- Duplicate sightings merged: {m['duplicate_sightings']}; routes stored: {m['routes_total']}", "",
         "## States", "", str(m["by_state"]), "", "## Country × state", ""]
    for c, v in m["country_state"].items():
        L.append(f"- {c}: {v}")
    L += ["", "## Lane families", ""]
    for k, v in m["lane_families"].items():
        L.append(f"- {k}: {v}")
    L += ["", "## Audit", "", "| bucket | pop | n | strict | 95% CI | relevance | 95% CI | wrong state | not relevant | missed |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for b, v in sorted((k, v) for k, v in m["audit"].items() if not k.startswith("_")):
        L.append(f"| {b} | {v.get('population', '')} | {v['n']} | {v['strict']} | {v['strict_ci'][0]} ({v['strict_ci'][1]}–{v['strict_ci'][2]}) "
                 f"| {v['relevant']} | {v['relevance_ci'][0]} ({v['relevance_ci'][1]}–{v['relevance_ci'][2]}) | {v['wrong_state']} "
                 f"| {v['not_relevant']} | {v['missed']} |")
    if m["audit"].get("_weighted_actionable"):
        L.append(f"\nPopulation-weighted actionable precision: {m['audit']['_weighted_actionable']}")
    return "\n".join(L)
