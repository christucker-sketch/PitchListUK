"""USDA farmers-market lane (15 Oct 2026): website discovery from the USDA directory, hop one only."""
from __future__ import annotations

import csv
import json

from fpd import db as dbm
from fpd.frontier import Frontier
from fpd.generators import usda_fm as U
from fpd.integration.records import source_of

FIELDS = ["listing_id", "name", "street", "city", "state", "zip", "lat", "lon", "updated", "org"]


def _csv(tmp_path, rows):
    p = tmp_path / "usda.csv"
    with p.open("w", newline="") as f:
        w = csv.DictWriter(f, FIELDS)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in FIELDS})
    return p


class FakeGet:
    """Stand-in for PoliteGet: serves fixed pages, counts requests, allows everything."""

    def __init__(self, pages):
        self.pages, self.requests = pages, 0

    def allowed(self, url):
        return "blocked" not in url

    def get(self, url, cap=U.PAGE_MAX):
        self.requests += 1
        if url not in self.pages:
            return 404, url, ""
        return 200, url, self.pages[url]


class Cfg:
    user_agent = "test"
    data_dir = "/nonexistent"


def test_names_and_candidate_domains():
    assert U.core_name("Cedar River Farmers' Market - Winter") == "Cedar River Farmers' Market"
    assert U.core_name("Hilltop Market (Saturdays)") == "Hilltop Market"
    assert U.candidates("Kingfield Farmers' Market") == ["kingfieldfarmersmarket.org", "kingfieldfarmersmarket.com",
                                                          "kingfieldmarket.org", "kingfieldmarket.com"]
    assert not U.distinctive("Downtown Farmers Market - Saturday")   # nothing to tell it apart: skipped
    assert U.distinctive("Waco Downtown Farmers Market")


def test_site_must_name_this_market_in_its_title_and_its_place():
    m = {"name": "Kingfield Farmers' Market", "city": "Minneapolis", "state": "MN", "zip": "55409"}
    own = "<title>Kingfield Farmers Market</title><body>Sundays, 4310 Nicollet Ave, Minneapolis</body>"
    directory = "<title>Twin Cities market directory</title><body>Kingfield Farmers Market, Minneapolis MN</body>"
    elsewhere = "<title>Kingfield Farmers Market</title><body>Kingfield, Maine</body>"
    parked = "<title>Kingfield Farmers Market</title><body>Minneapolis. This domain is for sale!</body>"
    assert U.is_this_market(own, m)
    assert not U.is_this_market(directory, m)      # a listing page is not the market's site
    assert not U.is_this_market(elsewhere, m)      # same name, different place
    assert not U.is_this_market(parked, m)


def test_run_enqueues_confirmed_sites_once_and_resumes(tmp_path):
    conn = dbm.connect(tmp_path / "fpd.sqlite")
    conn.execute("INSERT INTO opportunities(name, country, region, locality, status) "
                 "VALUES ('Oxford Farmers Market 2026', 'US', 'US-NC', 'Oxford', 'actionable')")
    fr = Frontier(conn, 1, 30, 3)
    tel = dbm.Telemetry(conn, 1)
    p = _csv(tmp_path, [
        {"listing_id": "1", "name": "Oxford Farmers Market", "city": "Oxford", "state": "NC", "updated": "2025-06-01"},
        {"listing_id": "2", "name": "Kingfield Farmers' Market", "city": "Minneapolis", "state": "MN", "updated": "2025-05-01"},
        {"listing_id": "3", "name": "Lake Harriet Farmers Market", "city": "Minneapolis", "state": "MN", "updated": "2024-05-01"},
        {"listing_id": "4", "name": "Nowhere Valley Market", "city": "Nowhere", "state": "KS", "updated": "2023-01-01"},
    ])
    g = FakeGet({
        "https://kingfieldfarmersmarket.org/": "<title>Kingfield Farmers Market</title><body>Minneapolis, MN</body>",
        "https://lakeharrietfarmersmarket.com/": "<title>Minneapolis markets</title><body>Lake Harriet Farmers Market</body>",
    })
    live = {"kingfieldfarmersmarket.org", "lakeharrietfarmersmarket.com"}
    r1 = U.run(conn, fr, tel, Cfg, max_markets=2, csv_path=str(p), getter=g, resolves=lambda h: h in live)
    # recently-updated first: Oxford (already known), then Kingfield (confirmed)
    assert r1["already_known"] == 1 and r1["confirmed"] == 1 and r1["enqueued"] == 1 and r1["cursor"]["pos"] == 2
    r2 = U.run(conn, fr, tel, Cfg, max_markets=5, csv_path=str(p), getter=g, resolves=lambda h: h in live)
    assert r2["not_this_market"] == 1 and r2["no_domain"] == 1 and r2["enqueued"] == 0   # Lake Harriet: directory only
    rows = conn.execute("SELECT url, purpose, generator, meta FROM urls").fetchall()
    assert [(r["url"], r["purpose"], r["generator"]) for r in rows] == [
        ("https://kingfieldfarmersmarket.org/", "site_home", "usda_fm:us")]
    meta = json.loads(rows[0]["meta"])
    assert meta["country"] == "US" and meta["usda_state"] == "MN"
    site = conn.execute("SELECT country_hint, entity_name FROM sites WHERE reg_domain='kingfieldfarmersmarket.org'").fetchone()
    assert tuple(site) == ("US", "Kingfield Farmers' Market")
    totals = dbm.kv_get(conn, "usda_fm.totals", {})
    assert totals["checked"] == 4 and totals["confirmed"] == 1


def test_run_without_the_list_does_nothing(tmp_path):
    conn = dbm.connect(tmp_path / "fpd.sqlite")
    r = U.run(conn, Frontier(conn, 1, 30, 3), dbm.Telemetry(conn, 1), Cfg, csv_path=str(tmp_path / "missing.csv"))
    assert "skipped" in r


def test_export_names_the_lane_as_organiser_site_from_usda():
    assert source_of("usda_fm:us", "https://kingfieldfarmersmarket.org/") == (
        "organiser_site", "usda_farmers_market", "entity_seed_crawl")


# ---------------------------------------------------------------- 16 Oct review of the first 17 records: fixes
import datetime as dt  # noqa: E402

from fpd import adapters  # noqa: E402
from fpd.classify import classify, derive_name  # noqa: E402
from fpd.integration.records import bare_platform_home  # noqa: E402
from fpd.parse import parse_html  # noqa: E402

D = dt.date(2026, 10, 16)


def _state(html, url):
    p = parse_html(html, url)
    a = adapters.apply(p, classify(p, D, hint={"country": "US"}), D, url.split("/")[2])
    return a["extracted"]


def test_no_longer_accepting_is_a_closure_not_an_open_signal():
    html = ("<title>Vendors | Monroe Street Farmers' Market</title><body><h1>Vendors</h1><p>Saturdays 8am-noon, Madison WI.</p>"
            "<p>At this time the market is full and we are no longer accepting applications for our 2026 season. Our 2027 "
            "Vendor Application will be released in February.</p><a href='/s/MSFM_Vendor-Application_2026.pdf'>2026 Vendor "
            "Application</a></body>")
    x = _state(html, "https://www.monroestreetfarmersmarket.org/vendors")
    # closed for 2026, but the 2027 application is announced: a not-yet-open opportunity traders can save (Chris, 16 Oct)
    assert x["state"] == "UPCOMING_NOT_OPEN" and "2027" in x["state_evidence"]


def test_marketspread_apply_page_closed_with_its_own_date_range():
    html = ("<title>Apply to 2026 Summer Season - TaSH Farmers Market | Vendors - Marketspread</title><body>"
            "<div>Apply</div><div>to</div><div>Event</div><div>TaSH Farmers Market | Vendors</div><div>Farmers Market</div>"
            "<div>Broadway</div><div>Broadway, Tarrytown, NY 10591, USA</div><div>Oct</div><div>17</div><div>Dec</div><div>05</div>"
            "<div>Exit</div><div>2026 Summer Season</div><div>Event Closed</div>"
            "<div>This event is closed and no longer accepting any more vendors.</div></body>")
    x = _state(html, "https://marketspread.com/market/12619/tash-farmers-market/apply/6447/closed/")
    assert x["state"] == "CLOSED_CURRENT_CYCLE"
    assert (x["start_date"], x["end_date"]) == ("2026-10-17", "2026-12-05")   # not "2026-12-17"


def test_junk_title_segment_is_not_part_of_the_name():
    p = parse_html("<title>Join Us | Meadows Farmers Market</title><body>x</body>", "https://docs.google.com/forms/d/e/x/viewform")
    assert derive_name(p, []) == "Meadows Farmers Market"


def test_platform_homepages_are_not_routes():
    assert bare_platform_home("https://www.marketspread.com/") and bare_platform_home("http://www.managemymarket.com/")
    assert not bare_platform_home("http://www.managemymarket.com/landing.aspx?orgID=858")
    assert not bare_platform_home("https://marketspread.com/market/24680/aggieland-farmers-market/apply/6320/")
    assert not bare_platform_home("https://blythewoodfm.mymarket.org/")


def test_redirect_to_a_city_site_is_a_starting_point_without_the_market_name(tmp_path):
    conn = dbm.connect(tmp_path / "fpd.sqlite")
    fr = Frontier(conn, 1, 30, 3)
    p = _csv(tmp_path, [{"listing_id": "9", "name": "Auburn Farmers Market", "city": "Auburn", "state": "WA", "updated": "2025-06-01"}])

    class Redirecting(FakeGet):
        def get(self, url, cap=U.PAGE_MAX):
            self.requests += 1
            return 200, "https://www.auburnwa.gov/farmers-market", "<title>Auburn Farmers Market</title><body>Auburn, WA</body>"

    r = U.run(conn, fr, dbm.Telemetry(conn, 1), Cfg, csv_path=str(p), getter=Redirecting({}),
              resolves=lambda h: h == "auburnfarmersmarket.org")
    assert r["confirmed"] == 1 and r["shared_site"] == 1
    row = conn.execute("SELECT purpose FROM urls").fetchone()
    assert row["purpose"] == "candidate"
    assert conn.execute("SELECT entity_name FROM sites WHERE reg_domain='auburnwa.gov'").fetchone()[0] is None


def test_not_accepting_applications_from_one_category_is_not_a_closure():
    html = ("<title>Infinity Con 2027 - Vendor Application</title><body><h1>Infinity Con 2027 vendor booths</h1>"
            "<p>July 10-11, 2027, Convention Center, Springfield, IL. Vendor application deadline July 1, 2027.</p>"
            "<p>Booth fees are not refundable. At this time Infinity Con is not accepting applications from bands, musical "
            "artists or any artists selling only prints.</p><a href='https://www.eventeny.com/events/vendor/apply/?id=1'>Apply</a>"
            "</body>")
    x = _state(html, "https://www.infinitycon.example/vendors")
    assert x["state"] not in ("CLOSED_CURRENT_CYCLE", "HISTORICAL")
