import datetime as dt
import json

from fpd import db as dbm
from fpd.classify import classify
from fpd.explore import plan_next, sitemap_candidates
from fpd.frontier import Frontier
from fpd.parse import parse_html
from fpd.resolve import Resolver, name_key

TODAY = dt.date(2026, 10, 4)

UK_SHOW = """<html lang="en"><head><title>Trade Stands | Lambfield County Show</title>
<meta property="og:site_name" content="Lambfield County Show"></head><body>
<nav><a href="/">Home</a><a href="/traders">Traders</a><a href="/tickets">Tickets</a></nav>
<h1>Trade Stand Applications 2027</h1>
<p>The Lambfield County Show returns on Saturday 12th &amp; Sunday 13th June 2027 at Lambfield Showground, Kent TN12 6PY.</p>
<p>We welcome trade stands, food traders and craft stallholders. Pitch fees from £120 + VAT per day.</p>
<p>Applications close 31st March 2027.</p>
<p><a href="/files/trade-stand-application-form-2027.pdf">Download the trade stand application form</a></p>
<p>Organised by Lambfield Agricultural Society. Tel +44 1622 000000</p>
</body></html>"""

EVENTENY = """<html><head><title>Retail Vendor Application - Kunstfest 2027 - Eventeny</title></head><body>
<h1>Retail Vendor Application</h1><h2>Kunstfest 2027</h2>
<p>Hosted by New Harmony Business Associates</p><p>New Harmony, IN</p>
<p>September 18-19, 2027 9:00 AM - 4:00 PM CDT</p>
<p>Application deadline: September 1, 2027</p>
<p>Booth fee $125.00 (10' x 10' space)</p></body></html>"""

PROCUREMENT = """<html><head><title>Vendor Registration | City of Springfield Purchasing</title></head><body>
<h1>Vendor Registration</h1><p>Register as a vendor to receive bid opportunities, RFP and RFQ notices.
Submit your W-9 to accounts payable. Procurement services, invitation to bid.</p>
<form><input name=a><input name=b><input name=c><input name=d><input name=e></form></body></html>"""

FEST_HOME = """<html><head><title>Riverside Food Festival 2027</title></head><body>
<nav><a href="/about">About</a><a href="/traders">Traders</a><a href="/tickets">Tickets</a></nav>
<h1>Riverside Food Festival</h1><p>Join us 7-8 August 2027 in Bristol for the best street food.</p>
<a href="/lineup">Line-up</a><a href="/get-involved">Get involved</a><a href="/privacy">Privacy</a>
</body></html>"""

CLOSED = """<html><head><title>Stallholder Applications - Harbour Christmas Market</title></head><body>
<h1>Stallholder applications</h1><p>Harbour Christmas Market, 5-6 December 2026, Wellington Waterfront, Wellington 6011.</p>
<p>Stallholder applications are now closed. Thank you for your interest.</p>
<p><a href="https://forms.gle/abc123">Stallholder application form</a></p></body></html>"""

HUB = "<html><head><title>Upcoming vendor events</title></head><body><h1>Events list</h1>" + "".join(
    f'<p><a href="https://springfest{i}.org/">Springtime Craft Festival {i} 2027</a></p>' for i in range(12)
) + "</body></html>"


def cl(html, url, hint=None):
    return classify(parse_html(html, url), TODAY, hint=hint)


def test_uk_show_actionable():
    a = cl(UK_SHOW, "https://www.lambfieldshow.co.uk/traders")
    assert a["label"] == "actionable", (a["reasons"], a["features"])
    ex = a["extracted"]
    assert ex["country"] == "GB"
    assert ex["start_date"] == "2027-06-12" and ex["end_date"] == "2027-06-13"
    assert ex["deadline"] == "2027-03-31"
    assert ex["apply_url"].endswith(".pdf")
    assert "Lambfield County Show" in ex["name"]
    assert any(e["kind"] == "vendor_language" for e in a["evidence"])


def test_platform_page_actionable():
    a = cl(EVENTENY, "https://www.eventeny.com/events/vendor/?id=99999")
    assert a["label"] == "actionable", (a["reasons"], a["features"])
    assert a["extracted"]["country"] == "US"
    assert a["extracted"]["name"] == "Kunstfest 2027"
    assert a["extracted"]["deadline"] == "2027-09-01"


def test_procurement_rejected():
    a = cl(PROCUREMENT, "https://www.springfield.gov/purchasing/vendor-registration")
    assert a["label"] == "rejected"
    assert "procurement_context" in a["reasons"]


def test_homepage_follows_trader_link():
    page = parse_html(FEST_HOME, "https://www.riversidefoodfest.co.uk/")
    a = classify(page, TODAY)
    assert a["label"] == "rejected"
    row = {"generator": "wikidata", "depth": 0, "purpose": "site_home"}
    nxt = plan_next(page, row, a, "organiser")
    urls = [n["url"] for n in nxt]
    assert "https://www.riversidefoodfest.co.uk/traders" in urls
    assert "https://www.riversidefoodfest.co.uk/privacy" not in urls


def test_closed_is_uncertain():
    a = cl(CLOSED, "https://harbourmarket.co.nz/stallholders")
    assert a["label"] == "uncertain"
    assert "applications_closed" in a["reasons"]
    assert a["extracted"]["country"] == "NZ"


def test_hub():
    a = cl(HUB, "https://hub.example.com/events")
    assert a["label"] == "hub"


def test_sitemap_candidates():
    xml = """<urlset><url><loc>https://x.co.uk/about</loc></url><url><loc>https://x.co.uk/traders/apply</loc></url>
    <url><loc>https://other.com/vendors</loc></url></urlset>"""
    ch, pages = sitemap_candidates(xml, "x.co.uk")
    assert [p[0] for p in pages] == ["https://x.co.uk/traders/apply"]


def test_name_key():
    assert name_key("The 2027 Kunstfest – Retail Vendor Application") == "kunstfest"
    assert name_key("Lambfield County Show 2026") == name_key("lambfield county show")


def test_resolution_merges_duplicates(tmp_path):
    conn = dbm.connect(tmp_path / "t.sqlite")
    fr = Frontier(conn, 1)
    r = Resolver(conn, 1)
    u1 = fr.add("https://www.lambfieldshow.co.uk/traders", "candidate", "test")
    u2 = fr.add("https://www.showsdirectory.co.uk/lambfield-county-show", "candidate", "test")
    a1 = cl(UK_SHOW, "https://www.lambfieldshow.co.uk/traders")
    a2 = json.loads(json.dumps(a1))
    a2["extracted"]["name"] = "Lambfield County Show 2027"
    a2["extracted"]["apply_url"] = None
    o1, m1 = r.upsert(u1, "https://www.lambfieldshow.co.uk/traders", 1, a1)
    o2, m2 = r.upsert(u2, "https://www.showsdirectory.co.uk/lambfield-county-show", 2, a2)
    assert m1 == "new" and o1 == o2 and m2 == "name_exact"
    row = conn.execute("SELECT n_sources, n_domains FROM opportunities WHERE id=?", (o1,)).fetchone()
    assert tuple(row) == (2, 2)


def test_edition_guard(tmp_path):
    conn = dbm.connect(tmp_path / "t.sqlite")
    fr = Frontier(conn, 1)
    r = Resolver(conn, 1)
    u1 = fr.add("https://a.co.uk/x", "candidate", "test")
    u2 = fr.add("https://b.co.uk/y", "candidate", "test")
    a1 = cl(UK_SHOW, "https://a.co.uk/x")
    a2 = json.loads(json.dumps(a1))
    a2["extracted"]["start_date"] = "2028-06-10"
    a2["extracted"]["apply_url"] = "https://b.co.uk/form"
    o1, _ = r.upsert(u1, "https://a.co.uk/x", 1, a1)
    o2, _ = r.upsert(u2, "https://b.co.uk/y", 2, a2)
    assert o1 != o2


def test_frontier_budget(tmp_path):
    conn = dbm.connect(tmp_path / "t.sqlite")
    fr = Frontier(conn, 1, site_budget=3)
    ids = [fr.add(f"https://site.org/p{i}", "candidate", "g") for i in range(6)]
    assert sum(1 for i in ids if i) == 3
    assert fr.add("https://site.org/p1", "candidate", "g") is None  # duplicate
    b = fr.next_batch(5, lambda h: 0.0)
    assert len(b) == 1  # one per host at a time


SPORTS = """<html><head><title>Book a pitch | Lavender Park</title></head><body><h1>Book a pitch</h1>
<p>3G football pitch hire. Floodlights included. Changing rooms available. 5-a-side and 11-a-side.</p>
<p><a href="https://forms.example.gov.uk/pitch">Book a pitch</a></p></body></html>"""

CONCESSION = """<html><head><title>Concessions and assistance | Shire Council</title></head><body>
<h1>Pensioner concession</h1><p>To apply, complete the Pensioner Concession Application Form with your concession card.</p>
<a href="/forms/pensioner-application-form.pdf">Pensioner Application Form</a></body></html>"""

CLOSEDFORM = """<html><head><title>Riverside Fair 2026 - Food Vendor Application</title></head><body>
<h1>Riverside Fair 2026 - Food Vendor Application</h1><p>This form is no longer accepting responses.</p></body></html>"""


def test_sports_pitch_rejected():
    a = cl(SPORTS, "https://www.merton.gov.uk/pitches/book")
    assert a["label"] == "rejected", (a["reasons"], a["features"])


def test_rates_concession_rejected():
    a = cl(CONCESSION, "https://www.shire.qld.gov.au/rates/concessions")
    assert a["label"] == "rejected", (a["reasons"], a["features"])


def test_closed_google_form_uncertain():
    a = cl(CLOSEDFORM, "https://docs.google.com/forms/d/e/abc/closedform", hint={"country": "US"})
    assert a["label"] == "uncertain" and "applications_closed" in a["reasons"], (a["reasons"], a["features"])


# ---------------- round 2: application state model ----------------
LOCALSTALLS_LIKE = """<html><head><title>Lovecalne Markets - LocalStalls</title></head><body>
<h1>Lovecalne Markets</h1><p>Stallholders wanted</p><p>Monthly · 2nd Saturday Calne, England</p>
<p>Coming dates Sat 10 Oct 2026, Sat 14 Nov 2026</p><p>Stallholder applications open</p>
<a href="https://localstalls.com/uk/event/calne/lovecalne-markets/apply">Submit Application</a></body></html>"""

UPCOMING = """<html><head><title>Traders | Winter Fayre 2026</title></head><body><h1>Trader applications</h1>
<p>The Winter Fayre returns on Saturday 5th December 2026 in Ludlow, Shropshire SY8 1AA.</p>
<p>Trader applications will open on 1 November 2026. Pitch fees £60.</p></body></html>"""

CLOSED_CYCLE = """<html><head><title>Stallholders - Harbour Christmas Market</title></head><body>
<h1>Stallholder applications</h1><p>Harbour Christmas Market, 5-6 December 2026, Wellington Waterfront, Wellington 6011.</p>
<p>Stallholder applications are now closed for 2026. Thank you.</p></body></html>"""

HISTORIC = """<html><head><title>Food traders | Riverside 2025</title></head><body><h1>Food trader applications</h1>
<p>The 12th annual Riverside Food Festival took place on 7-8 June 2025 in Bristol BS1 4DJ.</p>
<p>Food trader applications have now closed.</p></body></html>"""

ENQUIRY = """<html><head><title>Trade stands | Moor Show</title></head><body><h1>Trade stands</h1>
<p>The Moor Show is held on 14 August 2027 at Moor Park, Devon EX20 1AA. We welcome trade stands of all kinds.</p>
<p>For trade stand enquiries please <a href="mailto:trade@moorshow.co.uk">email our trade stand secretary</a> to book a stand.</p>
</body></html>"""


def test_state_open_localstalls():
    a = cl(LOCALSTALLS_LIKE, "https://localstalls.com/uk/event/calne/lovecalne-markets")
    assert a["extracted"]["state"] in ("OPEN_NOW", "ROLLING"), (a["extracted"]["state_evidence"], a["reasons"])
    assert a["extracted"]["relevance"] == "relevant"


def test_state_upcoming_with_date():
    a = cl(UPCOMING, "https://winterfayre.co.uk/traders")
    ex = a["extracted"]
    assert ex["state"] == "UPCOMING_NOT_OPEN", ex["state_evidence"]
    assert ex["opens_on"] == "2026-11-01"


def test_state_closed_current_cycle():
    a = cl(CLOSED_CYCLE, "https://harbourmarket.co.nz/stallholders")
    assert a["extracted"]["state"] == "CLOSED_CURRENT_CYCLE", a["extracted"]["state_evidence"]


def test_state_historical_with_recurrence():
    a = cl(HISTORIC, "https://riversidefood.co.uk/traders")
    ex = a["extracted"]
    assert ex["state"] == "HISTORICAL", ex["state_evidence"]
    assert ex["recurrence_evidence"] and "annual" in ex["recurrence_evidence"]


def test_state_enquiry():
    a = cl(ENQUIRY, "https://moorshow.co.uk/trade-stands")
    assert a["extracted"]["state"] == "ENQUIRY_AVAILABLE", (a["extracted"]["state_evidence"], a["extracted"]["routes"])


def test_generic_name_not_merged(tmp_path):
    conn = dbm.connect(tmp_path / "t.sqlite")
    fr = Frontier(conn, 1)
    r = Resolver(conn, 1)
    u1 = fr.add("https://a-town.co.uk/x", "candidate", "test")
    u2 = fr.add("https://b-town.co.uk/y", "candidate", "test")
    a1 = cl(UK_SHOW, "https://a-town.co.uk/x")
    a1["extracted"]["name"] = "Christmas Market"; a1["extracted"]["locality"] = "Ludlow"; a1["extracted"]["start_date"] = None
    a1["extracted"]["apply_url"] = None
    a2 = json.loads(json.dumps(a1)); a2["extracted"]["locality"] = "Bath"
    o1, _ = r.upsert(u1, "https://a-town.co.uk/x", 1, a1)
    o2, _ = r.upsert(u2, "https://b-town.co.uk/y", 2, a2)
    assert o1 != o2


# ---------------- round 2 audit regressions ----------------
CLOSED_CHECK_BACK = """<html><head><title>Vendors | Lakeside Country Fest</title></head><body><h1>Vendors</h1>
<p>Lakeside Country Fest, 7-9 August 2026, Lakeside Park, Ontario.</p>
<p>Vendor applications are now closed, please check back later.</p></body></html>"""

PAST_OPENING = """<html><head><title>Vendor applications | Jazz Festival 2026</title></head><body><h1>Vendor applications</h1>
<p>The Jazz Festival takes place on 23 August 2026 in Austin, TX 78701. Food truck vendors welcome.</p>
<p>Vendor applications will open on Monday, May 11, 2026 at 10:00 a.m.</p></body></html>"""

PARTIAL_SOLD_OUT = """<html><head><title>Night Market vendor applications</title></head><body><h1>Night Market</h1>
<p>Night Market on 6 November 2027 in Phoenix, AZ 85001. Vendor applications are open.</p>
<p>Beverage Vendor SOLD OUT Non-refundable</p><p>Commercial Space $500.00 Non-refundable</p>
<a href="https://www.eventeny.com/events/vendor/?id=1">Apply</a></body></html>"""

PERMIT = """<html><head><title>Food trucks | Ipswich City Council</title></head><body><h1>Food trucks</h1>
<p>Food truck vendors must hold a food business licence. Apply online for a mobile food business licence.</p>
<p>Stallholders at markets and events need a temporary food stall permit. Apply now.</p>
<form action="/apply"><input name="business"><input name="vendor"><button>Submit application</button></form></body></html>"""

UNDERWAY = """<html><head><title>Vendors | County Agricultural Fair</title></head><body><h1>Vendor applications</h1>
<p>The County Agricultural Fair runs 1-10 October 2026 at the Fairgrounds, Wooster, OH 44691.</p>
<p>Food vendors and commercial vendors: download the vendor application.</p>
<a href="/files/vendor-application.pdf">Vendor application form</a></body></html>"""


def test_closed_beats_check_back():
    ex = cl(CLOSED_CHECK_BACK, "https://lakesidefest.ca/vendors", hint={"country": "CA"})["extracted"]
    assert ex["state"] in ("HISTORICAL", "CLOSED_CURRENT_CYCLE") and ex["state"] != "UPCOMING_NOT_OPEN", ex["state_evidence"]


def test_past_opening_date_not_upcoming():
    ex = cl(PAST_OPENING, "https://jazzfest.example.com/vendors", hint={"country": "US"})["extracted"]
    assert ex["state"] != "UPCOMING_NOT_OPEN", ex["state_evidence"]


def test_partial_sold_out_not_closed():
    a = cl(PARTIAL_SOLD_OUT, "https://nightmarket.example.com/vendors", hint={"country": "US"})
    assert a["extracted"]["state"] not in ("CLOSED_CURRENT_CYCLE", "HISTORICAL"), a["extracted"]["state_evidence"]


def test_permit_page_not_relevant():
    ex = cl(PERMIT, "https://www.ipswich.qld.gov.au/Business/Food-Licences/Food-Trucks", hint={"country": "AU"})["extracted"]
    assert ex["relevance"] == "not_relevant", ex


def test_event_under_way_closed():
    ex = cl(UNDERWAY, "https://countyfair.example.com/vendors", hint={"country": "US"})["extracted"]
    if ex["relevance"] == "relevant":
        assert ex["state"] == "CLOSED_CURRENT_CYCLE", ex["state_evidence"]


SEASON_END = """<html><head><title>Vendors | Waterdown Farmers Market</title></head><body><h1>Vendor applications</h1>
<p>The market operates every Saturday from late May into mid October in Waterdown, Ontario L0R 2H0.</p>
<p>Prepared food vendors apply here.</p><a href="https://docs.google.com/forms/d/e/abc/viewform">Vendor application</a></body></html>"""

ANNUAL_OPEN_MONTH = """<html><head><title>Vendors | Cabbagetown Farmers Market</title></head><body><h1>Become a vendor</h1>
<p>Every Tuesday, June to October, Riverdale Park West, Toronto M4X 1P6. Applications open in January each year.</p>
<a href="https://docs.google.com/forms/d/e/abc/viewform">Vendor application</a></body></html>"""


def test_season_ending_this_month_closed():
    ex = cl(SEASON_END, "https://waterdownfarmersmarket.ca/vendors", hint={"country": "CA"})["extracted"]
    assert ex["state"] == "CLOSED_CURRENT_CYCLE", ex["state_evidence"]


def test_applications_open_in_month_not_open_now():
    ex = cl(ANNUAL_OPEN_MONTH, "https://cabbagetownmarket.ca/vendors", hint={"country": "CA"})["extracted"]
    assert ex["state"] not in ("OPEN_NOW", "ROLLING"), ex["state_evidence"]


def test_platform_marketing_page_rejected():
    html = "<html><head><title>Artist & Vendor Management - Eventeny</title></head><body><h1>Vendor management</h1>" \
           "<p>Cut out the manual work of collecting vendor applications. Weekly vendor newsletters. Apply now.</p></body></html>"
    a = cl(html, "https://www.eventeny.com/vendor-management/", hint={"country": "US"})
    assert a["extracted"]["relevance"] == "not_relevant" or a["label"] == "rejected", a["reasons"]


def test_food_truck_application_not_permit():
    html = """<html><head><title>Food Truck Application - Trick or Treat on West Broad Street 2026 - Eventeny</title></head><body>
    <h1>Food Truck Application</h1><p>Start Application. Deadline: Oct 16, 2026. Trick or Treat on West Broad Street, Oct 24, 2026,
    Columbus, Ohio. Food truck vendors welcome. Prices 10x10 Booth $50.00 Non-refundable</p></body></html>"""
    ex = cl(html, "https://www.eventeny.com/events/vendor/?id=55152", hint={"country": "US"})["extracted"]
    assert ex["relevance"] == "relevant", ex


def test_partial_category_closure_not_closed():
    html = """<html><head><title>Vendor application | Squamish Farmers Market</title></head><body><h1>Become a vendor</h1>
    <p>Every Saturday, April to December 2027, Squamish BC V8B 0A1. Some vendor categories are now full. At this time, we are not
    accepting new applications for jewellery, pottery, or baked goods. Apply now.</p>
    <a href="https://docs.google.com/forms/d/e/abc/viewform">Vendor application</a></body></html>"""
    ex = cl(html, "https://squamishfarmersmarket.com/vendors", hint={"country": "CA"})["extracted"]
    assert ex["state"] in ("OPEN_NOW", "ROLLING"), ex["state_evidence"]


def test_imminent_implicit_not_open():
    html = """<html><head><title>Vendors | Sauerkraut Festival</title></head><body><h1>Vendor information</h1>
    <p>Sauerkraut Festival - October 10th - 11th, 2026, Waynesville, Ohio 45068. Craft vendors and food vendors.</p>
    <a href="/files/2026-craft-vendor-application.pdf">2026 Craft Vendor Application</a></body></html>"""
    ex = cl(html, "https://sauerkraut.example.com/vendors", hint={"country": "US"})["extracted"]
    assert ex["state"] not in ("OPEN_NOW", "ROLLING"), ex["state_evidence"]


def test_fuzzy_needs_shared_distinctive_token(tmp_path):
    conn = dbm.connect(tmp_path / "t.sqlite")
    fr = Frontier(conn, 1)
    r = Resolver(conn, 1)
    u1 = fr.add("https://localstalls.com/au/event/dural/dural-village-markets", "candidate", "test")
    u2 = fr.add("https://localstalls.com/au/event/braddon/haig-park-village-markets", "candidate", "test")
    a1 = cl(UK_SHOW, "https://a-town.co.uk/x")
    a1["extracted"].update(name="Dural Village Markets", locality=None, start_date="2026-10-11", apply_url=None, country="AU")
    a2 = json.loads(json.dumps(a1)); a2["extracted"]["name"] = "Haig Park Village Markets"
    o1, _ = r.upsert(u1, "https://localstalls.com/au/event/dural/dural-village-markets", 1, a1)
    o2, _ = r.upsert(u2, "https://localstalls.com/au/event/braddon/haig-park-village-markets", 2, a2)
    assert o1 != o2


def test_dated_platform_instances_not_merged(tmp_path):
    conn = dbm.connect(tmp_path / "t.sqlite")
    fr = Frontier(conn, 1)
    r = Resolver(conn, 1)
    u1 = fr.add("https://www.eventeny.com/events/vendor/?id=1", "candidate", "test")
    u2 = fr.add("https://www.eventeny.com/events/vendor/?id=2", "candidate", "test")
    a1 = cl(UK_SHOW, "https://a-town.co.uk/x")
    a1["extracted"].update(name="Second Saturdays Parkway Food Hall", locality="Atlanta", start_date="2026-11-14",
                           apply_url=None, country="US")
    a2 = json.loads(json.dumps(a1)); a2["extracted"]["start_date"] = "2026-12-12"
    o1, _ = r.upsert(u1, "https://www.eventeny.com/events/vendor/?id=1", 1, a1)
    o2, _ = r.upsert(u2, "https://www.eventeny.com/events/vendor/?id=2", 2, a2)
    assert o1 != o2
