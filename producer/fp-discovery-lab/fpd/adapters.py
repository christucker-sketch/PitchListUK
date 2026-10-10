"""Platform adapters: small, explicit overrides for platforms whose page structure is known.

The generic classifier works from language; an adapter uses the platform's fixed layout instead,
which is both more precise and cheaper to audit. Each adapter returns a modified assessment or None.
"""
from __future__ import annotations

import datetime as dt
import re

from .dates import extract_dates
from .parse import Page


def ukcraftfairs(page: Page, a: dict, today: dt.date) -> dict | None:
    """UKCraftFairs event listings: title = '<Name> - <Weekday, D Month YYYY>, <Town>, <County> | UKCraftFairs'.

    The listing is placed by the organiser; traders contact the organiser through the site
    ("Contact the organiser ... to check availability and table prices"), so the route is an
    enquiry, not an application form."""
    if "/craft-events/" not in page.url:
        return None
    m = re.match(r"(.+?) - (?:\w+day, )?(\d{1,2} \w+ 20\d\d)(?:, ([^|,]+))?(?:, ([^|]+))? \| UKCraftFairs", page.title)
    if not m:
        return None
    name, date_s, town, county = m.group(1).strip(), m.group(2), (m.group(3) or "").strip(), (m.group(4) or "").strip()
    ds = extract_dates(date_s, today)
    start = ds[0].start if ds else None
    end = None
    em = re.search(r"until \w+day, (\d{1,2} \w+ 20\d\d)", page.text)
    if em:
        e2 = extract_dates(em.group(1), today)
        end = e2[0].start if e2 else None
    enquiry = re.search(r"check availability and (?:table|stall|pitch) prices|contact the organiser", page.text, re.I)
    ex = a["extracted"]
    ex.update(name=name, country="GB", locality=town or None, region=county or None,
              start_date=start.isoformat() if start else None, end_date=end.isoformat() if end else None,
              date_source="platform_title", application_name=None)
    route = {"type": "platform_enquiry", "url": page.url, "platform": "UKCraftFairs",
             "anchor": "Contact the organiser (UKCraftFairs login)", "category": "craft"}
    ex["routes"] = [route]
    ex["apply_url"] = page.url
    last = end or start
    workshop = re.search(r"\b(?:workshops?|class(?:es)?|courses?|tutorials?|lessons?|taster\s+sessions?|"
                         r"repair\s+caf[eé]|knit(?:ting)?\s+group|sewing\s+bee|demonstrations?)\b", name, re.I) and not \
        re.search(r"\b(?:fair|market|fayre|show|festival|bazaar|makers)\b", name, re.I)
    if not enquiry or workshop:
        ex.update(relevance="not_relevant", state="NOT_RELEVANT",
                  state_evidence=("UKCraftFairs listing is a workshop/class, not a trading event" if workshop
                                  else "UKCraftFairs listing without an organiser-contact route"))
        a["label"], a["reasons"] = "rejected", ["platform_listing_without_route"]
        return a
    ex["relevance"] = "relevant"
    if last and last < today:
        ex.update(state="HISTORICAL", state_evidence=f"Listed craft fair on {last.isoformat()} has passed",
                  missing=["next_edition_dates"], open_strength=None)
    else:
        ex.update(state="ENQUIRY_AVAILABLE", open_strength=None, missing=["application_mechanism"],
                  state_evidence=f"Organiser-placed craft fair listing ({start.isoformat() if start else 'date?'}, "
                                 f"{town or '?'}); traders enquire about table availability/prices via UKCraftFairs "
                                 f"(site login required): “{enquiry.group(0)}”")
    a["label"], a["reasons"] = "uncertain", ["platform_listing_enquiry"]
    a["evidence"].insert(0, {"kind": "state", "text": f"{ex['state']}: {ex['state_evidence']}"})
    return a


_MON = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
_LS_CC = {"au": "AU", "nz": "NZ", "uk": "GB", "us": "US"}


def _next_occurrence(day: int, mon: int, today: dt.date) -> dt.date | None:
    for y in (today.year, today.year + 1):
        try:
            d = dt.date(y, mon, day)
        except ValueError:
            return None
        if d >= today:
            return d
    return None


def localstalls(page: Page, a: dict, today: dt.date) -> dict | None:
    """LocalStalls event pages show a fixed block: 'Stallholders wanted', 'Coming dates <Sat 10 Oct> ...',
    'Stallholder applications open / Submit Application' (or only 'Contact event manager').
    'Coming dates' carry no year: they are the platform's own upcoming list, so each is resolved to its
    next occurrence on/after today (documented inference, not a source-stated year)."""
    m = re.search(r"localstalls\.com/(au|nz|uk|us)/event/", page.url)
    if not m:
        return None
    t = re.sub(r"\s+", " ", page.text)
    ex = a["extracted"]
    cc = _LS_CC[m.group(1)]
    name = re.sub(r"\s*-\s*LocalStalls\s*$", "", page.title).strip() or ex.get("name")
    cd = re.search(r"Coming dates (.{0,300}?)(?:Where to find us|Contact event manager|$)", t)
    dates = []
    if cd:
        for d, mon in re.findall(r"\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b", cd.group(1)):
            nd = _next_occurrence(int(d), _MON[mon.lower()], today)
            if nd:
                dates.append(nd)
    dates = sorted(set(dates))
    org = re.search(r"\bBy ([A-Z][^·\n]{2,60}?) (?:[A-Z][a-z]+, (?:VIC|NSW|QLD|WA|SA|TAS|ACT|NT|England|Scotland|Wales)|Monthly|Weekly|Fortnightly)", t)
    open_m = re.search(r"Stallholder applications open", t) or re.search(r"Submit Application", t)
    closed_m = re.search(r"applications (?:are )?closed|not (?:currently )?accepting", t, re.I)
    contact_m = re.search(r"Contact event manager|Email organiser", t)
    regular = re.search(r"\b(Weekly|Fortnightly|Monthly)\b[^.]{0,40}|\bEvery (?:Saturday|Sunday|Friday|week)\b", t)
    ex.update(name=name, country=cc, start_date=dates[0].isoformat() if dates else None, end_date=None,
              date_source="platform_coming_dates" if dates else None, organiser=(org.group(1).strip() if org else ex.get("organiser")),
              relevance="relevant", recurrence=(regular.group(0) if regular else (f"{len(dates)} upcoming dates listed" if len(dates) >= 3 else None)))
    ex["recurrence_evidence"] = ("regular: “%s”" % regular.group(0)) if regular else (
        f"{len(dates)} upcoming dates listed on platform" if len(dates) >= 3 else None)
    route = {"type": "platform_page", "url": page.url, "platform": "LocalStalls", "anchor": "Submit Application",
             "category": "retail"}
    ev = f"next date {dates[0].isoformat()}" if dates else "no upcoming dates listed"
    if closed_m and not open_m:
        ex.update(state="CLOSED_CURRENT_CYCLE" if dates else "HISTORICAL", open_strength=None,
                  state_evidence=f"LocalStalls page says “{closed_m.group(0)}” ({ev})", missing=["open_application"])
    elif open_m and dates:
        st = "ROLLING" if ex["recurrence"] else "OPEN_NOW"
        ex.update(state=st, open_strength="explicit", routes=[route], apply_url=page.url,
                  state_evidence=f"LocalStalls: “{open_m.group(0)}” ({ev}; {len(dates)} upcoming date(s))", missing=[])
    elif open_m:
        ex.update(state="UNKNOWN", open_strength=None, routes=[route], apply_url=page.url, missing=["current_dates"],
                  state_evidence="LocalStalls application button present but no upcoming dates listed")
    elif contact_m and dates:
        route.update(type="platform_enquiry", anchor=contact_m.group(0))
        ex.update(state="ENQUIRY_AVAILABLE", open_strength=None, routes=[route], apply_url=page.url,
                  missing=["application_mechanism"],
                  state_evidence=f"LocalStalls listing without open applications; organiser contact only (“{contact_m.group(0)}”; {ev})")
    else:
        ex.update(state="HISTORICAL" if not dates else "UNKNOWN", open_strength=None, missing=["current_dates", "open_application"],
                  state_evidence=f"LocalStalls listing with no open application ({ev})")
    a["label"] = "actionable" if ex["state"] in ("OPEN_NOW", "ROLLING") else "uncertain"
    a["reasons"] = ["platform_adapter:localstalls"]
    a["evidence"].insert(0, {"kind": "state", "text": f"{ex['state']}: {ex['state_evidence']}"})
    return a


from .countries import AU_STATES, CA_PROVINCES, US_STATES  # noqa: E402

_US_NAMES = {v.lower(): k for k, v in US_STATES.items()}
_CA_NAMES = {v.lower(): k for k, v in CA_PROVINCES.items()}
_AU_NAMES = {v.lower(): k for k, v in AU_STATES.items()}
_GB_NAMES = {"england", "scotland", "wales", "northern ireland", "united kingdom", "uk"}
# Non-scope places seen on platform pages (US territories and Caribbean included: outside the six markets).
_OUT_OF_SCOPE = re.compile(r"(?:\bN\.\s?P\.?(?!\w)|\b(?:Bahamas|Puerto Rico|PR|Mexico|Jamaica|Bermuda|Cayman|"
                           r"Virgin Islands|Guam|Dominican Republic|Philippines|India|Nigeria|Germany|France|Spain|Italy|"
                           r"Japan)\b)", re.I)


def place_to_geo(place: str) -> dict | None:
    """Resolve an Eventeny-style 'City, Region' place line to (country, region, locality).
    Returns country 'XX' for places that are positively outside the supported markets, None if unknown."""
    if not place:
        return None
    parts = [p.strip() for p in place.split(",") if p.strip()]
    if not parts:
        return None
    loc = parts[0] if len(parts) > 1 else None
    reg = parts[-1]
    rl = reg.lower().rstrip(".")
    if reg.upper() in US_STATES or rl in _US_NAMES:
        return {"country": "US", "region": US_STATES.get(reg.upper(), reg), "locality": loc}
    if reg.upper() in CA_PROVINCES or rl in _CA_NAMES:
        return {"country": "CA", "region": CA_PROVINCES.get(reg.upper(), reg), "locality": loc}
    if reg.upper() in AU_STATES or rl in _AU_NAMES:
        return {"country": "AU", "region": AU_STATES.get(reg.upper(), reg), "locality": loc}
    if rl in _GB_NAMES:
        return {"country": "GB", "region": None, "locality": loc}
    if rl in ("ireland", "republic of ireland"):
        return {"country": "IE", "region": None, "locality": loc}
    if rl in ("new zealand", "aotearoa"):
        return {"country": "NZ", "region": None, "locality": loc}
    if _OUT_OF_SCOPE.search(place):
        return {"country": "XX", "region": reg, "locality": loc}
    return None


# Eventeny hosts every kind of event form. These are not places to sell (9 Oct 2026 audit: an equestrian parade entry).
_NON_TRADING = re.compile(r"\b(equestrian|floats?|entertain(?:er|ers|ment)|performers?|musicians?|judges?|stop registration|"
                          r"candy hand-out|trunk participant|trunk[- ]or[- ]treat (?:participant|vehicle)|team registration|"
                          r"team chili|rib team|chalk art(?:ist)?|parade (?:entry|application|participant)|volunteers?)\b", re.I)
_TRADING = re.compile(r"\b(vendors?|booths?|exhibitors?|merchants?|sellers?|stalls?|food|craft|market|retail|concessions?|"
                      r"businesses|sponsor)\b", re.I)


def eventeny(page: Page, a: dict, today: dt.date) -> dict | None:
    """Eventeny vendor-application pages: record the platform identifiers (vendor application id and the
    parent event id from the '/events/<slug>-<id>/' link) and take geography from the page's own
    'place' line instead of voting over free text (which contains '(US & Canada)' time-zone labels)."""
    m = re.search(r"eventeny\.com/events/vendor/\?id=(\d+)", page.url)
    if not m:
        return None
    ex = a["extracted"]
    ids = {"eventeny_vendor": int(m.group(1))}
    for link in page.links:
        em = re.search(r"eventeny\.com/events/[a-z0-9\-]+-(\d{3,7})/?$", getattr(link, "url", "") or "")
        if em:
            ids["eventeny_event"] = int(em.group(1))
            break
    ex["platform_ids"] = ids
    app = ex.get("application_name") or ""
    if _NON_TRADING.search(app) and not _TRADING.search(app):
        ex.update(relevance="not_relevant", state="NOT_RELEVANT",
                  state_evidence=f"Eventeny application is not a trading pitch: “{app[:120]}”")
        a["label"], a["reasons"] = "rejected", ["non_trading_application"]
        return a
    pm = re.search(r"(?:^|\n)\s*place\s*\n\s*([^\n]{2,90}?)\s*\n", page.text)
    geo = place_to_geo(pm.group(1).strip()) if pm else None
    if geo:
        ex["geo_basis"] = ["platform_place_line"]
        ex["geo_hint_only"] = False
        ex["geo_place_line"] = pm.group(1).strip()
        if geo["country"] == "XX":
            ex.update(country=None, relevance="not_relevant", state="NOT_RELEVANT",
                      state_evidence=f"Event location outside supported markets: “{pm.group(1).strip()}”")
            a["label"], a["reasons"] = "rejected", ["out_of_scope_geography"]
            return a
        prev = ex.get("country")
        ex["country"], ex["region"] = geo["country"], geo["region"] or ex.get("region")
        ex["locality"] = geo["locality"] or ex.get("locality")
        conflicts = [c for c in (ex.get("geo_conflicts") or []) if "region" not in c]
        if prev and prev != geo["country"]:
            conflicts.append(f"text voting said {prev}; platform place line says {geo['country']} (place line used)")
        ex["geo_conflicts"] = conflicts
    return a


_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def _dated(weekday: str, day: int, mon: int, today: dt.date) -> dt.date | None:
    """Resolve a year-less 'Saturday Oct 10' platform date: the first year (this or next) where the weekday matches,
    on or after today. Falls back to the next occurrence if no year matches the weekday."""
    for y in (today.year, today.year + 1):
        try:
            d = dt.date(y, mon, day)
        except ValueError:
            continue
        if d >= today and _DAYS[d.weekday()] == weekday.lower():
            return d
    return _next_occurrence(day, mon, today)


def marketspread(page: Page, a: dict, today: dt.date) -> dict | None:
    """Marketspread market pages: name, market type and street address (city, state ZIP, country) in a fixed header;
    an 'Apply here' link (/market/<id>/<slug>/apply/intro/) when the market takes vendor applications on the
    platform; the upcoming event dates ('Saturday / Oct / 10', year-less) and application seasons
    ('2026 Application- 3/1/2026 - 2/28/2027'). Markets without an application link are listings only."""
    m = re.search(r"marketspread\.com/market/(\d+)/([^/?#]+)/?$", page.url)
    if not m:
        return None
    mid = m.group(1)
    ex = a["extracted"]
    ex["platform_ids"] = {"marketspread_market": int(mid)}
    t = page.text
    raw = (page.h1 or re.sub(r"\s*-\s*Marketspread\s*$", "", page.title)).strip() or ex.get("name") or ""
    hdr = re.search(re.escape(raw) + r"\n([^\n]{3,40})\n([^\n]{5,160})\n", t) if raw else None
    name = re.sub(r"\s+", " ", raw).strip() or None
    if isinstance(ex.get("locality"), str) and "\n" in ex["locality"]:
        ex["locality"] = ex["locality"].strip().split("\n")[-1].strip() or None
    mtype, addr = (hdr.group(1).strip(), hdr.group(2).strip()) if hdr else (None, None)
    geo = None
    if addr:
        us = re.search(r"(?:^|,)\s*([^,]+),\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?,\s*USA$", addr)
        ca = re.search(r"(?:^|,)\s*([^,]+),\s*([A-Z]{2})\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d,\s*Canada$", addr)
        if us:
            geo = place_to_geo(f"{us.group(1)}, {us.group(2)}")
        elif ca:
            geo = place_to_geo(f"{ca.group(1)}, {ca.group(2)}")
        else:
            parts = [x.strip() for x in addr.split(",") if x.strip()]
            geo = place_to_geo(", ".join(parts[-2:])) if len(parts) >= 2 else None
    if geo and geo["country"] == "XX":
        ex.update(country=None, relevance="not_relevant", state="NOT_RELEVANT",
                  state_evidence=f"Market location outside supported markets: “{addr}”")
        a["label"], a["reasons"] = "rejected", ["out_of_scope_geography"]
        return a
    if geo:
        ex.update(country=geo["country"], region=geo["region"] or ex.get("region"), locality=geo["locality"] or ex.get("locality"),
                  geo_basis=["platform_address"], geo_hint_only=False, geo_place_line=addr)
        ex["geo_conflicts"] = [c for c in (ex.get("geo_conflicts") or []) if "region" not in c]
    apply_url = next((l.url for l in page.links if re.search(rf"marketspread\.com/market/{mid}/[^/]+/apply/", l.url or "")), None)
    blocks = list(re.finditer(
        r"\n(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\n(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\n(\d{1,2})\n", t))
    listed, cancelled = set(), set()
    for i, bm in enumerate(blocks):
        d = _dated(bm.group(1), int(bm.group(3)), _MON[bm.group(2).lower()], today)
        if not d:
            continue
        tail = t[bm.end(): blocks[i + 1].start() if i + 1 < len(blocks) else bm.end() + 300][:300]
        (cancelled if re.search(r"(?:^|\n)\s*cancell?ed\s*(?:\n|$)", tail, re.I) else listed).add(d)
    dates = sorted(listed)
    seasons = []
    for s1, s2 in re.findall(r"(\d{1,2}/\d{1,2}/\d{4})\s*-\s*(\d{1,2}/\d{1,2}/\d{4})", t):
        try:
            seasons.append((dt.datetime.strptime(s1, "%m/%d/%Y").date(), dt.datetime.strptime(s2, "%m/%d/%Y").date()))
        except ValueError:
            pass
    active = [x for x in seasons if x[0] <= today <= x[1]]
    future = [x for x in seasons if x[0] > today]
    if not apply_url:
        ex.update(relevance="not_relevant", state="NOT_RELEVANT",
                  state_evidence="Marketspread market listing without a vendor application on the platform")
        a["label"], a["reasons"] = "rejected", ["platform_no_application"]
        return a
    # a weekly/monthly market lists dates across months; a seasonal event (e.g. a Christmas market) a few weeks
    recurring = len(dates) >= 3 and (dates[-1] - dates[0]).days > 45
    ex.update(name=name, start_date=dates[0].isoformat() if dates else None,
              end_date=dates[-1].isoformat() if dates and not recurring and len(dates) > 1 else None, date_source="platform_event_list" if dates else ex.get("date_source"), relevance="relevant",
              recurrence=(f"{len(dates)} upcoming dates listed" if recurring else None),
              recurrence_evidence=(f"{len(dates)} upcoming dates listed on platform" if recurring else None))
    if mtype:
        ex["market_type"] = mtype
    route = {"type": "platform_page", "url": apply_url, "platform": "Marketspread", "anchor": "Apply here", "category": "retail"}
    season_txt = "; ".join(f"season {x[0].isoformat()}–{x[1].isoformat()}" for x in (active or future)[:1])
    nxt = f"next date {dates[0].isoformat()}, {len(dates)} upcoming" if dates else "no upcoming dates listed"
    if dates or active:
        ex.update(state="ROLLING" if recurring else "OPEN_NOW", open_strength="explicit", routes=[route], apply_url=apply_url,
                  missing=[] if dates else ["current_dates"],
                  state_evidence=f"Marketspread: “Apply here” ({nxt}{'; ' + season_txt if season_txt else ''})")
    elif future:
        ex.update(state="UPCOMING_NOT_OPEN", open_strength=None, routes=[route], apply_url=apply_url,
                  opens_on=future[0][0].isoformat(), missing=["open_application"],
                  state_evidence=f"Marketspread application season starts {future[0][0].isoformat()}")
    else:
        ex.update(state="UNKNOWN", open_strength=None, routes=[route], apply_url=apply_url, missing=["current_dates"],
                  state_evidence=(f"Marketspread: all {len(cancelled)} listed upcoming dates are marked Cancelled" if cancelled
                                  else "Marketspread application link present but no upcoming dates or current season listed"))
    a["label"] = "actionable" if ex["state"] in ("OPEN_NOW", "ROLLING") else "uncertain"
    a["reasons"] = ["platform_adapter:marketspread"]
    a["evidence"].insert(0, {"kind": "state", "text": f"{ex['state']}: {ex['state_evidence']}"})
    return a


def _platform_ids_only(rx: str, key: str):
    def fn(page: Page, a: dict, today: dt.date) -> dict | None:
        m = re.search(rx, page.url)
        if not m:
            return None
        a["extracted"].setdefault("platform_ids", {})[key] = m.group(1)
        return a
    fn.__name__ = key
    return fn


cluemart = _platform_ids_only(r"cluemart\.co\.nz/application/([a-z0-9\-]+)", "cluemart_application")
_ls_ids = _platform_ids_only(r"localstalls\.com/((?:au|nz|uk|us)/event/[^/?#]+/[^/?#]+)", "localstalls_event")
_uk_ids = _platform_ids_only(r"ukcraftfairs\.com/craft-events/(\d+)", "ukcraftfairs_event")


def _chain(*fns):
    def fn(page, a, today):
        out = None
        for f in fns:
            r = f(page, out or a, today)
            out = r if r is not None else out
        return out
    fn.__name__ = fns[0].__name__
    return fn


ADAPTERS = {"ukcraftfairs.com": _chain(ukcraftfairs, _uk_ids), "localstalls.com": _chain(localstalls, _ls_ids),
            "eventeny.com": eventeny, "cluemart.co.nz": cluemart, "marketspread.com": marketspread}


def apply(page: Page, a: dict, today: dt.date, reg_domain: str) -> dict:
    fn = ADAPTERS.get(reg_domain)
    if fn:
        out = fn(page, a, today)
        if out is not None:
            out.setdefault("features", {})["adapter"] = fn.__name__
            return out
    return a
