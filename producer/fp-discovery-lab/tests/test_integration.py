"""Tests for the producer side of the integration contract (findpitches-discovery-export-v1)."""
import datetime as dt
import json
import time
from pathlib import Path

import pytest

from fpd import db as dbm
from fpd.adapters import eventeny as eventeny_adapter, place_to_geo
from fpd.geo import infer_geo
from fpd.integration import identity as idn
from fpd.integration.exporter import ABSENT_LIMIT, Exporter, compute_lifecycle, validate_export
from fpd.integration.records import material_view
from fpd.integration.schema import RECORD_SCHEMA, validate
from fpd.parse import parse_html
from fpd.urlutil import canonicalize

TODAY = dt.date(2026, 10, 5)


# ---------------------------------------------------------------- identity
def nk(country="US", pids=None, url="https://fest.example.com/vendors", name="Riverside Food Festival",
       start="2026-07-04", standing=False):
    return idn.natural_key(country, pids or {}, url, name, start, standing)


def test_id_is_deterministic_and_well_formed():
    k1, _, _ = nk()
    k2, _, _ = nk()
    assert k1 == k2 and idn.mint(k1) == idn.mint(k2)
    assert idn.mint(k1).startswith("fdx1_") and len(idn.mint(k1)) == 25


def test_irrelevant_name_noise_does_not_change_id():
    a, _, _ = nk(name="Riverside Food Festival 2026 - Vendor Application")
    b, _, _ = nk(name="12th Annual Riverside Food Festival")
    assert idn.mint(a) == idn.mint(b)


def test_annual_editions_distinct():
    a, _, _ = nk(start="2026-07-04")
    b, _, _ = nk(start="2027-07-03")
    assert idn.mint(a) != idn.mint(b)


def test_annual_editions_not_merged_through_shared_vendor_page(tmp_path):
    conn = dbm.connect(tmp_path / "t.sqlite")
    reg = idn.Registry(conn)
    anchors = idn.anchors_for({}, ["https://fest.example.com/vendors"])
    k26, p, e26 = nk(start="2026-07-04")
    k27, _, e27 = nk(start="2027-07-03")
    id26, _ = reg.resolve(k26, p, e26, "2026-07-04", anchors, "2026-01-01T00:00:00Z")
    reg.commit("2026-01-01T00:00:00Z")
    id27, how = reg.resolve(k27, p, e27, "2027-07-03", anchors, "2027-01-01T00:00:00Z")
    assert id26 != id27 and how == "minted"


def test_recurring_market_dates_distinct_on_platform():
    a, _, _ = idn.natural_key("GB", {"ukcraftfairs_event": [26768]}, None, "The Sunday Market", "2026-10-11", True)
    b, _, _ = idn.natural_key("GB", {"ukcraftfairs_event": [26769]}, None, "The Sunday Market", "2026-11-15", True)
    assert idn.mint(a) != idn.mint(b)


def test_eventeny_event_months_distinct_but_same_event_same_id():
    a, _, _ = idn.natural_key("US", {"eventeny_event": [28287], "eventeny_vendor": [1]}, None, "Shakedown", "2026-09-12", False)
    b, _, _ = idn.natural_key("US", {"eventeny_event": [28287], "eventeny_vendor": [2]}, None, "Shakedown", "2026-10-10", False)
    c, _, _ = idn.natural_key("US", {"eventeny_event": [28287], "eventeny_vendor": [3]}, None, "Other title", "2026-09-19", False)
    assert idn.mint(a) != idn.mint(b) and idn.mint(a) == idn.mint(c)


def test_standing_market_id_ignores_next_date():
    a, _, _ = idn.natural_key("AU", {"localstalls_event": ["au/event/oxley/night-market"]}, None, "x", "2026-10-09", True)
    b, _, _ = idn.natural_key("AU", {"localstalls_event": ["au/event/oxley/night-market"]}, None, "x", "2026-11-06", True)
    assert idn.mint(a) == idn.mint(b)


def test_tracking_parameters_do_not_change_anchor():
    a = idn.canonical_anchor_url("https://www.eventeny.com/events/vendor/?id=54237&srsltid=AfmBOor")
    b = idn.canonical_anchor_url("https://www.eventeny.com/events/vendor/?id=54237&utm_source=x&fbclid=y")
    c = canonicalize("https://fest.example.com/vendors/?utm_campaign=z&gclid=1")
    assert a == b == "https://www.eventeny.com/events/vendor/?id=54237"
    assert c == "https://fest.example.com/vendors"


def test_generic_urls_are_not_anchors():
    assert idn.canonical_anchor_url("https://www.facebook.com/") is None
    assert idn.canonical_anchor_url("https://www.eventeny.com/events/") is None
    assert idn.canonical_anchor_url("mailto:a@b.com") is None
    assert idn.canonical_anchor_url("https://fest.example.com/vendors") is not None


def test_source_url_switch_keeps_identity(tmp_path):
    conn = dbm.connect(tmp_path / "t.sqlite")
    reg = idn.Registry(conn)
    k, p, e = nk()
    i1, _ = reg.resolve(k, p, e, "2026-07-04", idn.anchors_for({}, ["https://fest.example.com/vendors",
                                                                  "https://forms.gle/abc123"]), "t")
    reg.commit("t")
    # organiser renamed the event slightly and moved the vendor page; the form link is shared
    k2, p2, e2 = nk(name="Riverside Food & Drink Festival")
    i2, how = reg.resolve(k2, p2, e2, "2026-07-04", idn.anchors_for({}, ["https://forms.gle/abc123",
                                                                       "https://fest.example.com/traders"]), "t2")
    # one shared URL + different programme is NOT enough on its own...
    assert i2 != i1
    reg.commit("t2")
    # ...but the same programme through a changed page is
    i3, how3 = reg.resolve(k, p, e, "2026-07-04", idn.anchors_for({}, ["https://fest.example.com/traders-2026"]), "t3")
    assert i3 == i1 and how3 == "natural_key"


def test_reschedule_keeps_identity_via_platform_anchor(tmp_path):
    conn = dbm.connect(tmp_path / "t.sqlite")
    reg = idn.Registry(conn)
    pids = {"eventeny_event": [30946], "eventeny_vendor": [55000]}
    k, p, e = idn.natural_key("US", pids, None, "Dog Days", "2026-10-28", False)
    i1, _ = reg.resolve(k, p, e, "2026-10-28", idn.anchors_for(pids, []), "t")
    reg.commit("t")
    k2, p2, e2 = idn.natural_key("US", pids, None, "Dog Days", "2026-11-07", False)  # moved into next month
    i2, how = reg.resolve(k2, p2, e2, "2026-11-07", idn.anchors_for(pids, []), "t2")
    assert i2 == i1 and how == "anchor"


def test_registry_rebuilt_from_scratch_gives_same_ids(tmp_path):
    ids = []
    for n in range(2):
        conn = dbm.connect(tmp_path / f"t{n}.sqlite")
        reg = idn.Registry(conn)
        out = []
        for name, start in (("Riverside Food Festival", "2026-07-04"), ("Harbour Christmas Market", "2026-12-05")):
            k, p, e = nk(name=name, start=start, url=f"https://{name.split()[0].lower()}.example.com/x")
            out.append(reg.resolve(k, p, e, start, [], "t")[0])
        ids.append(out)
    assert ids[0] == ids[1]


def test_same_opportunity_twice_in_one_run_gets_one_id(tmp_path):
    conn = dbm.connect(tmp_path / "t.sqlite")
    reg = idn.Registry(conn)
    k, p, e = nk()
    a, _ = reg.resolve(k, p, e, "2026-07-04", [], "t")
    b, how = reg.resolve(k, p, e, "2026-07-04", [], "t")
    assert a == b and how == "natural_key"


def test_route_ids_distinct_per_category():
    u = "https://www.eventeny.com/events/vendor/?id=1"
    assert idn.route_id(u, "food") != idn.route_id(u, "craft")
    assert idn.route_id(u + "&utm_source=x", "food") == idn.route_id(u, "food")


# ---------------------------------------------------------------- geography
NASSAU = """<html><head><title>Food Vendors - THE GEEK OUT - Eventeny</title></head><body><h1>Food Vendors</h1>
<a href="https://www.eventeny.com/events/the-geek-out-34000/">event</a>
<p>Deadline: Oct 27, 2026 11:59 pm (GMT-04:00) Eastern Time (US &amp; Canada)</p>
<div>place</div><div>Nassau, N.P.</div><div>attach_money</div></body></html>"""
LAKEWORTH = NASSAU.replace("Nassau, N.P.", "Lake Worth Beach, Florida").replace("Eastern Time", "Pacific Time")


def _ev_assessment(html, url):
    from fpd.classify import classify
    page = parse_html(html, url)
    page.text = page.text.replace("place ", "place\n")  # parse_html joins blocks with newlines in real pages
    a = classify(page, TODAY, hint={})
    return page, a


def test_place_line_resolution():
    assert place_to_geo("Nassau, N.P.")["country"] == "XX"
    assert place_to_geo("Lake Worth Beach, Florida") == {"country": "US", "region": "Florida", "locality": "Lake Worth Beach"}
    assert place_to_geo("Calgary, AB")["country"] == "CA"
    assert place_to_geo("Galveston, TX")["region"] == "Texas"
    assert place_to_geo("Somewhere") is None


def test_timezone_label_is_not_country_evidence():
    g = infer_geo("https://www.eventeny.com/events/vendor/?id=1",
                  "Deadline: Feb 16, 2027 5:00 pm Pacific Time (US & Canada). Lake Worth Beach, Florida", [], {})
    assert g["country"] == "US"
    g2 = infer_geo("https://example.com/x", "Deadline 5pm Eastern Time (US & Canada)", [], {})
    assert g2["country"] != "CA"


def test_discovery_hint_alone_is_not_proven_geography():
    g = infer_geo("https://somefest.com/vendors", "Vendors wanted for our summer festival.", [], {"country": "CA"})
    assert g["country"] == "CA" and g["hint_only"] is True
    g2 = infer_geo("https://somefest.com/vendors", "Held in Tampa, FL 33602.", [], {"country": "CA"})
    assert g2["country"] == "US" and not g2["hint_only"] and g2["conflicts"]


def test_eventeny_adapter_rejects_bahamas_and_fixes_florida():
    import re
    for html, expect in ((NASSAU, None), (LAKEWORTH, "US")):
        page = parse_html(html, "https://www.eventeny.com/events/vendor/?id=55943")
        place = "Nassau, N.P." if expect is None else "Lake Worth Beach, Florida"
        # real Eventeny pages render one block per line: '...\nplace\n<City>, <Region>\nattach_money\n...'
        page.text = f"Deadline: Oct 27, 2026 (US & Canada)\nwidgets\nplace\n{place}\nattach_money\n$150.00"
        a = {"extracted": {"country": "CA", "region": None}, "label": "actionable", "reasons": [], "evidence": []}
        out = eventeny_adapter(page, a, TODAY)
        assert out["extracted"]["platform_ids"]["eventeny_event"] == 34000
        if expect is None:
            assert out["extracted"]["relevance"] == "not_relevant" and out["label"] == "rejected"
        else:
            assert out["extracted"]["country"] == "US" and out["extracted"]["region"] == "Florida"
            assert out["extracted"]["geo_basis"] == ["platform_place_line"]


# ---------------------------------------------------------------- schema
def good_record(**kw):
    r = {
        "schema_version": "findpitches-discovery-export-v1", "opportunity_id": "fdx1_" + "a" * 20, "channel": "current",
        "lifecycle_event": "NEW", "lifecycle_changes": ["new"], "previous_application_state": None,
        "export_readiness": "READY", "readiness_issues": [], "country": "United Kingdom", "country_code": "GB",
        "region": "Kent", "region_code": None, "locality": "Faversham", "location": "Faversham, Kent", "venue": None,
        "geography_basis": ["tld:co.uk"], "event_name": "Faversham Christmas Market", "organiser": None,
        "opportunity_type": "christmas_market", "event_types": ["christmas_market"], "vendor_categories": ["craft"],
        "application_state": "OPEN_NOW", "application_state_evidence": "Open: applications are now open",
        "open_strength": "explicit", "recurring": None, "recurrence_evidence": None, "event_start": "2026-12-05",
        "event_end": None, "event_date_basis": "text", "application_deadline": None, "applications_open_on": None,
        "source_url": "https://fav.example.co.uk/stalls", "application_url": None, "application_routes": [],
        "discovery_source": "organiser_site", "discovery_source_detail": None, "discovery_strategy": "directory_follow",
        "source_type": "organiser_site", "platform": None, "first_seen": "2026-10-04T10:00:00Z",
        "last_seen": "2026-10-04T10:00:00Z", "last_checked": "2026-10-04T10:00:00Z",
        "evidence": {"relevance": ["stallholder applications are open"], "state": "Open", "dates": []},
        "confidence": {"level": "MEDIUM", "classifier_score": 0.9, "lane_audited_precision": 0.84, "basis": "x"},
        "provenance": {"engine": "fp-discovery-lab", "engine_version": "0.2.0", "classifier_version": "v",
                       "sources": [{"url": "https://fav.example.co.uk/stalls", "role": "primary", "discovery_source": "directory",
                                    "fetched_at": "2026-10-04T10:00:00Z", "http_status": 200, "content_sha256": "ab",
                                    "classifier_version": "v"}], "raw_evidence_refs": ["sha256:ab"]},
        "fingerprint": {"content": "c", "material": "m"},
        "identity": {"algorithm": "fdx1", "natural_key": "GB|site:x:y|2026", "resolved_by": "minted", "anchors": []},
        "watch": None,
    }
    r.update(kw)
    return r


def test_valid_record_passes_schema():
    assert validate(good_record()) == []


@pytest.mark.parametrize("bad", [
    {"opportunity_id": "opp_123"}, {"application_state": "MAYBE"}, {"source_url": "not a url"},
    {"country_code": "FR"}, {"event_start": "05/12/2026"}, {"lifecycle_event": "DELETED"}, {"surprise_field": 1},
])
def test_malformed_records_rejected(bad):
    assert validate(good_record(**bad))


def test_missing_required_field_rejected():
    r = good_record()
    del r["evidence"]
    assert any("evidence" in e for e in validate(r))


def test_schema_is_valid_json_schema():
    jsonschema = pytest.importorskip("jsonschema")
    jsonschema.Draft202012Validator.check_schema(RECORD_SCHEMA)
    jsonschema.Draft202012Validator(RECORD_SCHEMA).validate(good_record())


# ---------------------------------------------------------------- lifecycle
def _prev(rec, **kw):
    d = {"channel": rec["channel"], "delivered": 1, "application_state": rec["application_state"],
         "record_json": json.dumps(rec), "last_event": "NEW", "absent_count": 0}
    d.update(kw)
    return d


def test_new_then_closed_then_reopened():
    r = good_record()
    out, _, _ = compute_lifecycle([dict(r)], {})
    assert out[0]["lifecycle_event"] == "NEW"
    closed = good_record(application_state="CLOSED_CURRENT_CYCLE", channel="watch", export_readiness="WATCH")
    out, _, _ = compute_lifecycle([closed], {r["opportunity_id"]: _prev(r)})
    assert out[0]["lifecycle_event"] == "CLOSED" and out[0]["previous_application_state"] == "OPEN_NOW"
    reopened = good_record()
    out, _, _ = compute_lifecycle([reopened], {r["opportunity_id"]: _prev(closed, last_event="CLOSED")})
    assert out[0]["lifecycle_event"] == "REOPENED"


def test_historical_closure_of_delivered_record_is_emitted_not_dropped():
    r = good_record()
    hist = good_record(application_state="HISTORICAL", channel="retired", export_readiness="RETIRED")
    out, _, _ = compute_lifecycle([hist], {r["opportunity_id"]: _prev(r)})
    assert out and out[0]["lifecycle_event"] == "CLOSED" and out[0]["channel"] == "retired"


def test_updated_and_unchanged():
    r = good_record()
    later = good_record(application_deadline="2026-11-30")
    out, _, _ = compute_lifecycle([later], {r["opportunity_id"]: _prev(r)})
    assert out[0]["lifecycle_event"] == "UPDATED" and "application_deadline" in out[0]["lifecycle_changes"]
    out, _, _ = compute_lifecycle([good_record(last_checked="2026-10-05T10:00:00Z")], {r["opportunity_id"]: _prev(r)})
    assert out[0]["lifecycle_event"] == "UNCHANGED"


def test_disappearance_is_not_closure():
    r = good_record()
    prev = {r["opportunity_id"]: _prev(r)}
    out, _, warns = compute_lifecycle([], prev)
    assert out[0]["lifecycle_event"] == "UNCHANGED" and out[0]["carried_forward"] and warns
    prev[r["opportunity_id"]]["absent_count"] = ABSENT_LIMIT - 1
    out, _, _ = compute_lifecycle([], prev)
    assert out[0]["lifecycle_event"] == "WITHDRAWN" and out[0]["application_state"] == "OPEN_NOW"


def test_watch_and_held_semantics():
    w = good_record(application_state="UPCOMING_NOT_OPEN", channel="watch", export_readiness="WATCH")
    out, _, _ = compute_lifecycle([w], {})
    assert out[0]["lifecycle_event"] == "WATCH"
    r = good_record()
    held = good_record(channel="held", export_readiness="NOT_READY", readiness_issues=["geography_conflict"])
    out, _, _ = compute_lifecycle([held], {r["opportunity_id"]: _prev(r)})
    assert out[0]["lifecycle_event"] == "WITHDRAWN"
    out, _, _ = compute_lifecycle([good_record()], {r["opportunity_id"]: _prev(held, last_event="WITHDRAWN")})
    assert out[0]["lifecycle_event"] == "REOPENED"


def test_material_view_ignores_volatile_fields():
    a = material_view(good_record())
    b = material_view(good_record(last_checked="2027-01-01T00:00:00Z", confidence={"level": "LOW"}))
    assert a == b


# ---------------------------------------------------------------- exporter (synthetic engine DB)
class Cfg:
    def __init__(self, d):
        self.data_dir = d
        self.today = TODAY


def _seed(conn, n_open=3):
    now = time.time()
    for i in range(n_open):
        url = f"https://fest{i}.example.co.uk/traders"
        conn.execute("INSERT INTO urls(url,host,reg_domain,purpose,generator,created_at,fetched_at,http_status,state,"
                     "content_hash) VALUES (?,?,?,?,?,?,?,?,?,?)",
                     (url, f"fest{i}.example.co.uk", f"fest{i}.example.co.uk", "candidate", "directory:test", now, now,
                      200, "done", f"h{i}"))
        uid = conn.execute("SELECT id FROM urls WHERE url=?", (url,)).fetchone()[0]
        ex = {"country": "GB", "geo_basis": ["tld:co.uk"], "date_source": "text"}
        ev = [{"kind": "vendor_language", "text": "Trader applications are open"}]
        conn.execute("INSERT INTO assessments(url_id,assessed_at,classifier_version,label,extracted,evidence,score) "
                     "VALUES (?,?,?,?,?,?,?)", (uid, now, "v", "actionable", json.dumps(ex), json.dumps(ev), 0.9))
        aid = conn.execute("SELECT MAX(id) FROM assessments").fetchone()[0]
        conn.execute("INSERT INTO opportunities(name,country,region,locality,start_date,primary_url,status,confidence,"
                     "first_seen,last_checked,relevance,state,state_evidence,open_strength,lane,event_types,route_categories,"
                     "state_source_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                     (f"Village Fete Number{i}", "GB", "Kent", f"Town{i}", "2026-12-05", url, "actionable", 0.9, now, now,
                      "relevant", "OPEN_NOW", "Open: trader applications are open", "explicit", "directory:test",
                      '["fair_fete"]', '["craft"]', url))
        oid = conn.execute("SELECT MAX(id) FROM opportunities").fetchone()[0]
        conn.execute("INSERT INTO opportunity_sources(opportunity_id,url_id,assessment_id,role) VALUES (?,?,?,?)",
                     (oid, uid, aid, "primary"))
        conn.execute("INSERT INTO routes(opportunity_id,url,route_type,platform,category,anchor,source_url,source_state) "
                     "VALUES (?,?,?,?,?,?,?,?)", (oid, url + "/apply", "onpage_form", None, "craft", "Apply", url, "OPEN_NOW"))


def _read(p):
    return [json.loads(line) for line in open(p, encoding="utf-8")]


def test_full_then_delta_export_and_validation(tmp_path):
    conn = dbm.connect(tmp_path / "e.sqlite")
    _seed(conn)
    root = tmp_path / "integration_export"
    ex = Exporter(conn, Cfg(tmp_path), root, TODAY)
    r1 = ex.run("full")
    cur = _read(root / "full" / "current.jsonl")
    assert len(cur) == 3 and all(r["lifecycle_event"] == "NEW" for r in cur)
    assert validate_export(root)["ok"]
    ids1 = sorted(r["opportunity_id"] for r in cur)
    # nothing changed -> empty delta, same ids
    r2 = Exporter(conn, Cfg(tmp_path), root, TODAY).run("full")
    assert r2["counts"]["delta"] == 0
    assert sorted(r["opportunity_id"] for r in _read(root / "full" / "current.jsonl")) == ids1
    # one closes, one changes deadline
    conn.execute("UPDATE opportunities SET state='CLOSED_CURRENT_CYCLE', state_evidence='Applications are now closed' "
                 "WHERE name='Village Fete Number0'")
    conn.execute("UPDATE opportunities SET deadline='2026-11-20' WHERE name='Village Fete Number1'")
    r3 = Exporter(conn, Cfg(tmp_path), root, TODAY).run("delta")
    delta = _read(root / "deltas" / f"{r3['export_id']}.jsonl")
    ev = {r["event_name"]: r["lifecycle_event"] for r in delta}
    assert ev == {"Village Fete Number0": "CLOSED", "Village Fete Number1": "UPDATED"}
    latest = json.loads((root / "latest.json").read_text())
    assert latest["latest_delta"]["export_id"] == r3["export_id"]
    assert latest["latest_full"]["export_id"] == r2["export_id"]
    assert validate_export(root)["ok"]
    m = json.loads((root / "deltas" / f"{r3['export_id']}-manifest.json").read_text())
    assert m["previous_export_id"] == r2["export_id"] and m["by_lifecycle_event"] == {"CLOSED": 1, "UPDATED": 1}


def test_failed_export_leaves_previous_export_intact(tmp_path):
    conn = dbm.connect(tmp_path / "e.sqlite")
    _seed(conn)
    root = tmp_path / "integration_export"
    r1 = Exporter(conn, Cfg(tmp_path), root, TODAY).run("full")
    before = (root / "latest.json").read_text()
    snap_before = (root / "full" / "current.jsonl").read_bytes()
    conn.execute("UPDATE opportunities SET deadline='2026-11-01'")
    with pytest.raises(Exception):
        Exporter(conn, Cfg(tmp_path), root, TODAY).run("full", fail_after_stage=True)
    assert (root / "latest.json").read_text() == before
    assert (root / "full" / "current.jsonl").read_bytes() == snap_before
    assert len(list((root / "deltas").glob("*.jsonl"))) == 1
    assert not any((root / ".staging").glob("*")) if (root / ".staging").exists() else True
    assert validate_export(root)["ok"]
    # state was not advanced: the next successful run still reports the change
    r3 = Exporter(conn, Cfg(tmp_path), root, TODAY).run("delta")
    assert r3["counts"]["delta"] == 3


def test_corrupted_export_detected(tmp_path):
    conn = dbm.connect(tmp_path / "e.sqlite")
    _seed(conn)
    root = tmp_path / "integration_export"
    r = Exporter(conn, Cfg(tmp_path), root, TODAY).run("full")
    p = root / "full" / "snapshots" / r["export_id"] / "current.jsonl"
    p.write_text(p.read_text()[:-40], encoding="utf-8")
    res = validate_export(root)
    assert not res["ok"] and any("checksum" in e for e in res["errors"])


def test_gate_holds_hint_only_geography_and_junk_names(tmp_path):
    conn = dbm.connect(tmp_path / "e.sqlite")
    _seed(conn, 2)
    conn.execute("UPDATE assessments SET extracted=? WHERE id=1",
                 (json.dumps({"country": "GB", "geo_why": {"GB": ["generator_hint"]}}),))
    conn.execute("UPDATE opportunities SET name='Google Docs' WHERE name='Village Fete Number1'")
    root = tmp_path / "integration_export"
    Exporter(conn, Cfg(tmp_path), root, TODAY).run("full")
    held = _read(root / "full" / "held.jsonl")
    issues = sorted(i.split(" ")[0] for r in held for i in r["readiness_issues"])
    assert issues == ["event_name_not_usable", "geography_unverified"]
    assert _read(root / "full" / "current.jsonl") == []
    # held records never appear in deltas unless they were previously delivered
    d = _read(next((root / "deltas").glob("*.jsonl")))
    assert d == []


def test_gate_holds_plain_http_urls(tmp_path):
    """V3 ingest rejects http:// source/application URLs as unsafe: they must never be exported as ready."""
    conn = dbm.connect(tmp_path / "e.sqlite")
    _seed(conn, 3)
    conn.execute("UPDATE opportunities SET apply_url='http://fest1.example.co.uk/apply' WHERE id=2")
    root = tmp_path / "integration_export"
    Exporter(conn, Cfg(tmp_path), root, TODAY).run("full")
    cur, held = _read(root / "full" / "current.jsonl"), _read(root / "full" / "held.jsonl")
    assert len(cur) == 2 and all(not (r["application_url"] or "").startswith("http://") for r in cur)
    assert len(held) == 1 and held[0]["readiness_issues"][0].startswith("insecure_application_url")


def test_v3_recheck_requests_requeue_pages_until_refetched(tmp_path):
    from fpd.cli import queue_rechecks
    conn = dbm.connect(tmp_path / "e.sqlite")
    _seed(conn, 2)
    root = tmp_path / "integration_export"
    Exporter(conn, Cfg(tmp_path), root, TODAY).run("full")
    cur = _read(root / "full" / "current.jsonl")
    pid, url = cur[0]["opportunity_id"], cur[0]["source_url"]
    conn.execute("UPDATE urls SET fetched_at=1000, state='done', priority=0.3")  # fetched long before the request
    reqs = [{"producer_record_id": pid, "requested_at": "2026-10-06T10:00:00Z", "reason": "watch_recheck_due"},
            {"producer_record_id": "fdx1_00000000000000000000", "requested_at": "2026-10-06T10:00:00Z"}]
    r = queue_rechecks(conn, reqs)
    assert r["queued"] == 1 and r["unknown_record"] == 1
    row = conn.execute("SELECT state, priority FROM urls WHERE url=?", (url,)).fetchone()
    assert row["state"] == "pending" and row["priority"] == 1.0
    others = conn.execute("SELECT COUNT(*) FROM urls WHERE state='pending' AND url!=?", (url,)).fetchone()[0]
    assert others == 0                      # only the requested record's page is touched
    assert queue_rechecks(conn, reqs)["queued"] == 1   # still pending: idempotent, nothing duplicated
    # once the page has been fetched after the request, it is left alone (V3 acks on the next delivery)
    conn.execute("UPDATE urls SET state='done', fetched_at=? WHERE url=?", (time.time(), url))
    assert queue_rechecks(conn, reqs)["already_rechecked"] == 1
    # ...and the next export carries the newer last_checked that V3 acknowledges against
    Exporter(conn, Cfg(tmp_path), root, TODAY).run("full")
    rec = next(r for r in _read(root / "full" / "current.jsonl") if r["opportunity_id"] == pid)
    assert rec["last_checked"] > "2026-10-06T10:00:00Z"


def test_ukcraftfairs_calendar_enumerates_live_ids_and_bypasses_yield_floor(tmp_path):
    import datetime as dt
    from fpd.fetch import FetchResult
    from fpd.frontier import Frontier
    from fpd.sources import index_calendar, migrate, plan_source
    conn = dbm.connect(tmp_path / "c.sqlite")
    migrate(conn)
    calls = []

    async def fake_fetch(cfg, urls):
        calls.extend(urls)
        out = {}
        for u in urls:
            day = int(u.rsplit("/", 1)[1].split("-")[0])
            body = f'<a href="/craft-events/{26000 + day}/fair-{day}">x</a><a href="/craft-events/26134/faversham">y</a>'
            out[u] = FetchResult(url=u, status=200, content_type="text/html", body=body.encode())
        return out

    class C:  # minimal cfg
        today = dt.date(2026, 10, 9)
    from fpd.sources import SOURCES
    SOURCES["ukcraftfairs"]["calendar_per_run"], keep = 150, SOURCES["ukcraftfairs"]["calendar_per_run"]
    r = index_calendar(conn, C(), "ukcraftfairs", fetch_all=fake_fetch)
    assert r["days_read"] == 150 and r["days_failed"] == 0
    assert calls[0].endswith("/calendar/9-october-2026")          # nearest days first
    ids = {n for (n,) in conn.execute("SELECT native_id FROM platform_index WHERE platform='ukcraftfairs'")}
    assert "26134" in ids and len(ids) == 32                        # 31 distinct day ids + the shared one
    again = index_calendar(conn, C(), "ukcraftfairs", fetch_all=fake_fetch)
    assert again["days_read"] == 150 and calls[150].endswith("/8-march-2027")   # rolls on to unread days
    SOURCES["ukcraftfairs"]["calendar_per_run"] = keep
    # a dead id band must not stop calendar ids from being planned (no yield-floor sampling for this source)
    for i in range(25900, 26100):
        conn.execute("INSERT OR IGNORE INTO urls(url,host,reg_domain,purpose,generator,created_at,state,fetched_at) "
                     "VALUES (?,?,?,?,?,?,?,?)", (f"https://www.ukcraftfairs.com/craft-events/{i}/dead", "www.ukcraftfairs.com",
                                                  "ukcraftfairs.com", "platform", "platform:ukcraftfairs", 1, "done", 1))
    # an id an earlier strategy pruned without fetching is revived once the calendar lists it
    conn.execute("INSERT INTO urls(url,host,reg_domain,purpose,generator,created_at,state,last_error,fetched_at) "
                 "VALUES (?,?,?,?,?,?,?,?,?)", ("https://www.ukcraftfairs.com/craft-events/26134/x", "www.ukcraftfairs.com",
                                                "ukcraftfairs.com", "platform", "platform:ukcraftfairs", 1, "skipped",
                                                "strategy_pruned:old_id_window", 1))
    fr = Frontier(conn, 1)
    plan = plan_source(conn, "ukcraftfairs", fr, today=C.today)
    assert plan["yield_floor_id"] is None and plan["enqueued_new"] == len(ids)
    st = conn.execute("SELECT state FROM urls WHERE url='https://www.ukcraftfairs.com/craft-events/26134/x'").fetchone()[0]
    assert st == "pending"


def test_revisit_hubs_requeues_only_stale_directory_pages(tmp_path):
    import argparse
    from fpd.cli import cmd_revisit_hubs
    conn = dbm.connect(tmp_path / "fpd.sqlite")
    old, now = 1000.0, time.time()
    rows = [("https://hub.example/list", "directory", "directory:x", 0, old),
            ("https://hub.example/list?page=2", "directory", "directory:x", 1, old),
            ("https://hub.example/fresh", "directory", "directory:x", 0, now),
            ("https://org.example/traders", "candidate", "directory:x", 1, old)]
    for u, purpose, gen, depth, f in rows:
        conn.execute("INSERT INTO urls(url,host,reg_domain,purpose,generator,depth,created_at,state,fetched_at) "
                     "VALUES (?,?,?,?,?,?,?,?,?)", (u, u.split("/")[2], u.split("/")[2], purpose, gen, depth, 1, "done", f))
    conn.close()

    class Cfg2:
        db_path = tmp_path / "fpd.sqlite"
        snapshot_path = None
    cmd_revisit_hubs(Cfg2(), argparse.Namespace(older_than_days=7, max_depth=1, max=300, func=None))
    conn = dbm.connect(tmp_path / "fpd.sqlite")
    pending = sorted(u for (u,) in conn.execute("SELECT url FROM urls WHERE state='pending'"))
    assert pending == ["https://hub.example/list", "https://hub.example/list?page=2"]


MS_HTML = """<html><head><title>{name} - Marketspread</title></head><body><div>Learning Center</div>
<h1>{name}</h1><div>{mtype}</div><div>{addr}</div><a href="https://www.example-market.org/">Visit Website</a>
{apply}<div>Events</div><div>({n})</div>{events}</body></html>"""


def _ms_page(name, mtype, addr, apply, dates, mid=22030):
    from fpd.parse import parse_html
    ev = "".join(f"<div>{w}</div><div>{m}</div><div>{d}</div><div>10 a.m.</div><div>Go to event</div>" for w, m, d in dates)
    ap = f'<a href="/market/{mid}/slug-x/apply/intro/">Apply here</a>' if apply else ""
    url = f"https://marketspread.com/market/{mid}/slug-x/"
    return parse_html(MS_HTML.format(name=name, mtype=mtype, addr=addr, apply=ap, n=len(dates), events=ev), url)


def test_marketspread_adapter_states_geography_and_identity():
    import datetime as dt
    from fpd import adapters
    from fpd.classify import classify
    from fpd.integration.identity import natural_key, platform_ids
    today = dt.date(2026, 10, 9)

    def run(page):
        return adapters.apply(page, classify(page, today, hint={"site_role": "platform"}), today, "marketspread.com")
    weekly = [("Sunday", "Oct", "11"), ("Sunday", "Nov", "08"), ("Sunday", "Dec", "13"), ("Sunday", "Jan", "10")]
    a = run(_ms_page("Krugerville Farmers Market", "Farmers Market", "5200 US-377, Krugerville, TX 76227, USA", True, weekly))
    ex = a["extracted"]
    assert a["label"] == "actionable" and ex["state"] == "ROLLING" and ex["start_date"] == "2026-10-11"
    assert (ex["country"], ex["region"], ex["locality"]) == ("US", "Texas", "Krugerville")
    assert ex["apply_url"].endswith("/market/22030/slug-x/apply/intro/") and ex["platform_ids"] == {"marketspread_market": 22030}
    assert ex["start_date"] and _ms_dates_ok(ex)
    # seasonal event: a few weeks of dates -> OPEN_NOW with an end date, not a rolling market
    xmas = [("Thursday", "Nov", "19"), ("Saturday", "Nov", "28"), ("Saturday", "Dec", "12")]
    ex2 = run(_ms_page("Christkindlmarket", "Artisan/Craft Market", "Hubbard St, Green Bay, WI 54303, USA", True, xmas))["extracted"]
    assert ex2["state"] == "OPEN_NOW" and ex2["end_date"] == "2026-12-12"
    # Canada address
    ex3 = run(_ms_page("Squamish Market", "Farmers Market", "1 Main St, Squamish, BC V8B 0A1, Canada", True, weekly))["extracted"]
    assert ex3["country"] == "CA"
    # listing without an application link is not an opportunity
    a4 = run(_ms_page("16th Ave Farmers Market", "Farmers Market", "NE Weidler St, Portland, OR 97220, USA", False, weekly))
    assert a4["label"] == "rejected" and a4["reasons"] == ["platform_no_application"]
    # application link but nothing upcoming -> watch (UNKNOWN), never ready
    ex5 = run(_ms_page("Quiet Market", "Farmers Market", "1 A St, Bend, OR 97701, USA", True, []))["extracted"]
    assert ex5["state"] == "UNKNOWN"
    # identity: one programme per market, standing edition for a rolling market
    pids = platform_ids([ex["apply_url"]], [ex["platform_ids"]])
    assert natural_key("US", pids, ex["apply_url"], ex["name"], ex["start_date"], True)[0] == "US|marketspread:22030|standing"


def test_marketspread_pages_fetched_before_the_adapter_are_fetched_again(tmp_path):
    from fpd.frontier import Frontier
    from fpd.sources import migrate, plan_source
    conn = dbm.connect(tmp_path / "m.sqlite")
    migrate(conn)
    for mid, adapter in ((100, None), (101, "marketspread")):
        u = f"https://marketspread.com/market/{mid}/m{mid}"
        conn.execute("INSERT INTO platform_index(platform,item_url,native_id,num_id) VALUES ('marketspread',?,?,?)", (u, str(mid), mid))
        conn.execute("INSERT INTO urls(url,host,reg_domain,purpose,generator,created_at,state,fetched_at) VALUES "
                     "(?,?,?,?,?,?,?,?)", (u, "marketspread.com", "marketspread.com", "platform", "platform:marketspread", 1, "done", 1))
        uid = conn.execute("SELECT id FROM urls WHERE url=?", (u,)).fetchone()[0]
        conn.execute("INSERT INTO assessments(url_id,assessed_at,classifier_version,label,features) VALUES (?,?,?,?,?)",
                     (uid, 1, "v", "rejected", json.dumps({"adapter": adapter} if adapter else {})))
    plan = plan_source(conn, "marketspread", Frontier(conn, 1))
    pending = [u for (u,) in conn.execute("SELECT url FROM urls WHERE state='pending'")]
    assert plan["enqueued_new"] == 1 and pending == ["https://marketspread.com/market/100/m100"]


def _ms_dates_ok(ex):
    return ex["start_date"] >= "2026-10-09"


# ---------------------------------------------------------------- platform sources
def test_sitemap_parse_and_bounded_resumable_plan(tmp_path):
    import re
    from fpd.frontier import Frontier
    from fpd.sources import SOURCES, migrate, parse_sitemap, plan_source
    xml = "<urlset>" + "".join(
        f"<url><loc>https://www.eventeny.com/events/vendor/?id={i}</loc><lastmod>2026-09-0{1 + i % 9}</lastmod></url>"
        for i in range(100, 110)) + "<url><loc>https://www.eventeny.com/about</loc></url></urlset>"
    items, children = parse_sitemap(xml, re.compile(SOURCES["eventeny"]["item_pattern"]), None)
    assert len(items) == 10 and children == []
    idx, ch = parse_sitemap('<sitemapindex><sitemap><loc>https://x/sitemap/event_elements.xml</loc></sitemap>'
                            '<sitemap><loc>https://x/sitemap/blog.xml</loc></sitemap></sitemapindex>', re.compile("x"),
                           re.compile("event_elements"))
    assert ch == ["https://x/sitemap/event_elements.xml"]
    conn = dbm.connect(tmp_path / "s.sqlite")
    migrate(conn)
    for u, nid, lm in items:
        conn.execute("INSERT INTO platform_index(platform,item_url,native_id,num_id,lastmod) VALUES (?,?,?,?,?)",
                     ("eventeny", u, nid, int(nid), lm))
    fr = Frontier(conn, 1)
    p1 = plan_source(conn, "eventeny", fr, max_new=4, today=TODAY)
    got = [r[0] for r in conn.execute("SELECT url FROM urls ORDER BY url")]
    assert p1["enqueued_new"] == 4 and all(int(u.split("=")[1]) >= 106 for u in got)  # newest first, bounded
    p2 = plan_source(conn, "eventeny", fr, max_new=4, today=TODAY)
    assert p2["enqueued_new"] == 4  # resumes below what is already enqueued, no duplicates
    assert conn.execute("SELECT COUNT(*) FROM urls").fetchone()[0] == 8
    # an already-fetched item is only refetched when the platform's lastmod moves past our fetch
    conn.execute("UPDATE urls SET state='done', fetched_at=? WHERE url LIKE '%id=109'", (time.time(),))
    assert plan_source(conn, "eventeny", fr, max_new=0, today=TODAY)["enqueued_changed"] == 0
    conn.execute("UPDATE platform_index SET lastmod='2099-01-01' WHERE item_url LIKE '%id=109'")
    assert plan_source(conn, "eventeny", fr, max_new=0, today=TODAY)["enqueued_changed"] == 1


def test_frontier_restricted_to_one_lane(tmp_path):
    from fpd.frontier import Frontier
    conn = dbm.connect(tmp_path / "f.sqlite")
    fr = Frontier(conn, 1)
    fr.add("https://www.eventeny.com/events/vendor/?id=1", "platform", "platform:eventeny", 0.9, budgeted=False)
    fr.add("https://somefest.example.com/vendors", "candidate", "wikidata", 0.99)
    fr.allowed = {"platform:eventeny"}
    assert fr.pending_count() == 1
    batch = fr.next_batch(5, lambda h: 0.0)
    assert [b["generator"] for b in batch] == ["platform:eventeny"]


def test_enumeration_stops_descending_when_yield_collapses(tmp_path):
    from fpd.frontier import Frontier
    from fpd.sources import migrate, plan_source, yield_floor
    conn = dbm.connect(tmp_path / "y.sqlite")
    migrate(conn)
    now = time.time()
    for i in range(500, 1300):  # 1000-1299 fetched, all historical; 500-999 never fetched
        u = f"https://www.eventeny.com/events/vendor/?id={i}"
        conn.execute("INSERT INTO platform_index(platform,item_url,native_id,num_id) VALUES ('eventeny',?,?,?)", (u, str(i), i))
        if i >= 1000:
            conn.execute("INSERT INTO urls(url,host,reg_domain,purpose,generator,created_at,state,fetched_at) "
                         "VALUES (?,?,?,?,?,?,?,?)", (u, "www.eventeny.com", "eventeny.com", "platform", "platform:eventeny",
                                                       now, "done", now))
    floor, stats = yield_floor(conn, "eventeny", 5.0)
    assert floor == 1000
    p = plan_source(conn, "eventeny", Frontier(conn, 1), max_new=1000, today=TODAY)
    # below the floor only every 50th id is probed: 500, 550, ..., 950
    assert p["enqueued_new"] == 10 and p["yield_floor_id"] == 1000


def test_source_date_passing_closes_record_without_refetch(tmp_path):
    conn = dbm.connect(tmp_path / "e.sqlite")
    _seed(conn, 1)
    root = tmp_path / "integration_export"
    Exporter(conn, Cfg(tmp_path), root, TODAY).run("full")
    later = dt.date(2026, 12, 10)  # the seeded event (2026-12-05) is now over; nothing was re-crawled
    r = Exporter(conn, Cfg(tmp_path), root, later).run("delta")
    d = _read(root / "deltas" / f"{r['export_id']}.jsonl")
    assert len(d) == 1 and d[0]["lifecycle_event"] == "CLOSED" and d[0]["application_state"] == "HISTORICAL"
    assert d[0]["channel"] == "retired"


def test_platform_ids_normalised_across_url_and_page():
    p = idn.platform_ids(["https://www.ukcraftfairs.com/craft-events/26768/x"], [{"ukcraftfairs_event": "26768"},
                                                                              {"eventeny_event": "34000"}])
    assert p == {"ukcraftfairs_event": [26768], "eventeny_event": [34000]}


def test_monthly_instances_of_one_eventeny_event_stay_distinct(tmp_path):
    conn = dbm.connect(tmp_path / "t.sqlite")
    reg = idn.Registry(conn)
    out = []
    for vid, start in ((101, "2026-09-12"), (102, "2026-10-10")):
        pids = {"eventeny_event": [28287], "eventeny_vendor": [vid]}
        k, p, e = idn.natural_key("US", pids, None, "Downtown Shakedown", start, False)
        out.append(reg.resolve(k, p, e, start, idn.anchors_for(pids, []), "t")[0])
    assert out[0] != out[1]


def test_v3_feed_carries_closures_of_records_v3_already_has(tmp_path):
    from fpd.integration.v3feed import build_v3_feed
    conn = dbm.connect(tmp_path / "e.sqlite")
    _seed(conn, 3)
    root = tmp_path / "integration_export"
    Exporter(conn, Cfg(tmp_path), root, TODAY).run("full")
    r = build_v3_feed(conn, root, now=1_000_000)
    feed = _read(root / "v3" / "feed.jsonl")
    assert r["ok"] and r["current"] == 3 and r["lifecycle"] == 0 and len(feed) == 3
    assert all(x["channel"] == "current" for x in feed)
    # one event's date passes: the full export drops it from current.jsonl, the V3 feed carries the closure
    conn.execute("UPDATE opportunities SET start_date='2026-10-01' WHERE name='Village Fete Number1'")
    later = dt.date(2026, 10, 6)
    Exporter(conn, Cfg(tmp_path), root, later).run("full")
    r = build_v3_feed(conn, root, now=1_000_100)
    feed = _read(root / "v3" / "feed.jsonl")
    ids = [x["opportunity_id"] for x in feed]
    assert len(ids) == len(set(ids)) == 3                      # one file, no duplicate ids
    closed = [x for x in feed if x["channel"] != "current"]
    assert len(closed) == 1 and closed[0]["export_readiness"] == "RETIRED"
    assert closed[0]["application_state"] == "HISTORICAL" and closed[0]["lifecycle_event"] == "CLOSED"
    assert all(not validate(x, RECORD_SCHEMA) for x in feed)   # same v1 contract
    m = json.loads((root / "v3" / "feed-manifest.json").read_text())
    assert m["lifecycle"] == 1 and m["current"] == 2 and m["left_current_this_run"] == 1
    # it keeps being sent for the window, then drops out
    assert build_v3_feed(conn, root, now=1_000_100 + 44 * 86400)["lifecycle"] == 1
    assert build_v3_feed(conn, root, now=1_000_100 + 46 * 86400)["lifecycle"] == 0


def test_v3_feed_leaves_out_insecure_lifecycle_records_and_backfills_once(tmp_path):
    from fpd.integration.v3feed import build_v3_feed
    conn = dbm.connect(tmp_path / "e.sqlite")
    _seed(conn, 2)
    root = tmp_path / "integration_export"
    Exporter(conn, Cfg(tmp_path), root, TODAY).run("full")
    # first run on an existing install: ids already in exports on disk count as sent to V3
    assert build_v3_feed(conn, root, now=2_000_000)["backfilled_ids"] == 2
    assert build_v3_feed(conn, root, now=2_000_010)["backfilled_ids"] == 0
    conn.execute("UPDATE opportunities SET primary_url=replace(primary_url,'https://','http://'), "
                 "start_date='2026-10-01' WHERE name='Village Fete Number0'")
    conn.execute("UPDATE urls SET url=replace(url,'https://','http://') WHERE url LIKE '%fest0%'")
    Exporter(conn, Cfg(tmp_path), root, dt.date(2026, 10, 6)).run("full")
    r = build_v3_feed(conn, root, now=2_000_100)
    assert r["current"] == 1 and r["lifecycle"] == 0 and r["skipped"]["insecure_url"] == 1


def test_audit_corrections_organiser_authority_names_rolling_deadline_and_suspended_lane():
    from fpd.integration.records import _gate, clean_organiser
    assert clean_organiser("UKCraftFairs.com") is None and clean_organiser("ClueMart") is None
    assert clean_organiser("Le Makete One-off / Irregular") == "Le Makete"
    assert clean_organiser("Dogs in the Park Nsw Annually Castle") == "Dogs in the Park Nsw"
    assert clean_organiser("Pikes Peak Farmers Markets Open") == "Pikes Peak Farmers Markets"
    assert clean_organiser("Kent County Council") == "Kent County Council"
    today = dt.date(2026, 10, 9)
    r = good_record(event_name="City of Kingston")
    _gate(r, {}, today, False, [], {}, {})
    assert r["channel"] == "held" and "event_name_is_organiser_only" in r["readiness_issues"]
    r = good_record(application_state="ROLLING", application_deadline="2026-10-05", event_start="2026-07-28")
    _gate(r, {}, today, False, [], {}, {})
    assert r["application_state"] == "CLOSED_CURRENT_CYCLE" and r["channel"] == "watch"
    r = good_record(application_state="ROLLING", event_start="2026-05-02", event_end="2026-10-31")
    _gate(r, {}, today, False, [], {}, {})
    assert r["application_state"] == "ROLLING" and r["channel"] == "current"     # season still running
    r = good_record(discovery_source="entrythingy")
    _gate(r, {}, today, False, [], {}, {})
    assert r["channel"] == "held" and any(i.startswith("lane_suspended") for i in r["readiness_issues"])


def test_marketspread_cancelled_dates_are_not_upcoming_dates():
    from fpd import adapters
    from fpd.classify import classify
    from fpd.parse import parse_html
    today = dt.date(2026, 10, 9)
    ev = "".join(f"<div>Saturday</div><div>Oct</div><div>{d}</div><div>2 p.m.</div><div>Fall Fest</div><div>Cancelled</div>"
                 f"<div>Go to event</div>" for d in ("10", "17", "24", "31"))
    html = MS_HTML.format(name="Hearth and Harvest Fall Fest", mtype="Festival", addr="1 Main St, Goochland, VA 23063, USA",
                          apply='<a href="/market/39559/x/apply/intro/">Apply here</a>', n=4, events=ev)
    page = parse_html(html, "https://marketspread.com/market/39559/x/")
    a = adapters.apply(page, classify(page, today, hint={"site_role": "platform"}), today, "marketspread.com")
    assert a["label"] != "actionable" and a["extracted"]["state"] == "UNKNOWN"
    assert "Cancelled" in a["extracted"]["state_evidence"]


def test_eventeny_non_trading_application_forms_are_not_opportunities():
    from fpd import adapters

    class P:
        url, links, text = "https://www.eventeny.com/events/vendor/?id=52572", [], "place\nPearland, TX\n"
    for name, relevant in (("Equestrian Application", False), ("Entertainment Application for Holiday Light and Flight Fest", False),
                           ("Trunk-or-Treat Participant", False), ("Food Vendor Parade Participant", True),
                           ("Sponsor Vendor (Waived Fee)", True), ("2026 Exhibitor Application", True)):
        a = {"label": "actionable", "reasons": [], "evidence": [], "extracted": {"application_name": name, "state": "OPEN_NOW"}}
        out = adapters.eventeny(P(), a, dt.date(2026, 10, 9))
        assert (out["label"] != "rejected") == relevant, name
