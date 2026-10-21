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


# Frequency labels LocalStalls prints right after the organiser line ("By <b>X</b>" then a facts row).
_LS_FREQ = re.compile(r"\s+(?:One-off(?: / Irregular)?|Irregular|Weekly|Fortnightly|Monthly|Annually|Yearly|Seasonal|"
                      r"Twice a (?:year|month)(?: \([A-Za-z]+\))?|Quarterly|Biannual(?:ly)?|Bi-?monthly)\b.*$", re.I)


def _ls_organiser(page: Page, t: str) -> str | None:
    """Organiser as the source states it: Event JSON-LD `organizer.name` first, then the 'By <b>…</b>' line.
    The facts row after it (frequency, place) is never part of the name (V3-011 L2: contaminated organiser)."""
    for d in page.jsonld:
        if str(d.get("@type", "")).lower().endswith("event"):
            o = d.get("organizer")
            o = o[0] if isinstance(o, list) and o else o
            name = (o.get("name") if isinstance(o, dict) else o) if o else None
            if isinstance(name, str) and name.strip():
                return name.strip()
    m = re.search(r"\bBy ([A-Z][^·\n]{2,80}?) (?:[A-Z][a-z]+, (?:VIC|NSW|QLD|WA|SA|TAS|ACT|NT|England|Scotland|Wales)|"
                  r"Monthly|Weekly|Fortnightly|One-off|Annually|Twice a|Get directions)", t)
    if not m:
        return None
    name = _LS_FREQ.sub("", m.group(1)).strip()
    return name or None


def localstalls(page: Page, a: dict, today: dt.date, fetched_on: dt.date | None = None) -> dict | None:
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
    # 21 Oct (V3 conversion report, 19 LocalStalls start-date disagreements): the yearless 'Coming dates' were upcoming
    # when the page was FETCHED, so they resolve against the fetch date, then anything already past is dropped. (Resolving
    # a weeks-old page against today turned a passed 'Sat 10 Oct' into 10 Oct next year.)
    ref = fetched_on or today
    coming = []
    if cd:
        for d, mon in re.findall(r"\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b", cd.group(1)):
            nd = _next_occurrence(int(d), _MON[mon.lower()], ref)
            if nd and nd >= today:
                coming.append(nd)
    # Event JSON-LD carries explicit-year dates, but for a recurring listing it is the SERIES span (Coleraine: 26 Apr -
    # 15 Nov) -- a series running today is not an event today. Only a JSON-LD start still ahead is an event date, and
    # the platform's own coming-dates list wins when it has entries.
    ld_dates, ld_end = [], None
    for d in page.jsonld:
        if str(d.get("@type", "")).lower().endswith("event"):
            try:
                sd = dt.date.fromisoformat(str(d.get("startDate", ""))[:10])
            except ValueError:
                continue
            try:
                ed = dt.date.fromisoformat(str(d.get("endDate", ""))[:10])
            except ValueError:
                ed = None
            if sd >= today:
                ld_dates.append(sd)
                if ed and ed > sd and ld_end is None:
                    ld_end = ed
    dates = coming or ld_dates
    ld_used = not coming and bool(ld_dates)
    dates = sorted(set(dates))
    org = _ls_organiser(page, t)
    open_m = re.search(r"Stallholder applications open", t) or re.search(r"Submit Application", t)
    closed_m = re.search(r"applications (?:are )?closed|not (?:currently )?accepting", t, re.I)
    contact_m = re.search(r"Contact event manager|Email organiser", t)
    regular = re.search(r"\b(Weekly|Fortnightly|Monthly)\b[^.]{0,40}|\bEvery (?:Saturday|Sunday|Friday|week)\b", t)
    ex.update(name=name, country=cc, start_date=dates[0].isoformat() if dates else None,
              end_date=(ld_end.isoformat() if ld_end and dates and ld_end >= dates[0] and len(dates) == 1 else None),
              date_source=(("platform_event_jsonld" if ld_used else "platform_coming_dates") if dates else None), organiser=(org or ex.get("organiser")),
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
        return marketspread_apply(page, a, today)
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


def marketspread_apply(page: Page, a: dict, today: dt.date) -> dict | None:
    """Marketspread application pages (/market/<id>/<slug>/apply/<n>/[login|closed|intro]/) show the event's date range
    as a year-less header ('Oct\\n17\\nDec\\n05\\nExit'); the generic date reader took '17 Dec' from it (15 Oct:
    three markets exported with 2026-12-17). Read the range properly; closure wording is left to the classifier."""
    if not re.search(r"marketspread\.com/market/\d+/[^/]+/apply/", page.url):
        return None
    ex = a["extracted"]
    hm = re.search(r"\n(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\n(\d{1,2})\n"
                   r"(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\n(\d{1,2})\n)?Exit\b", "\n" + page.text)
    if not hm:
        return None
    try:
        s = dt.date(today.year, _MON[hm.group(1).lower()], int(hm.group(2)))
        if s < today - dt.timedelta(days=60):
            s = s.replace(year=s.year + 1)
        e = None
        if hm.group(3):
            e = dt.date(s.year, _MON[hm.group(3).lower()], int(hm.group(4)))
            if e < s:
                e = e.replace(year=e.year + 1)
    except ValueError:
        return None
    ex.update(start_date=s.isoformat(), end_date=e.isoformat() if e and e != s else None, date_source="platform_header")
    if isinstance(ex.get("state_evidence"), str):
        ex["state_evidence"] = re.sub(r"\(event [0-9-]+(?:–[0-9-]+)?\)", f"(event {s.isoformat()}" + (f"–{e.isoformat()}" if e and e != s else "") + ")",
                                      ex["state_evidence"])
    return a


_NI_COUNTIES = {"antrim", "armagh", "down", "fermanagh", "londonderry", "derry", "tyrone"}


def marketsireland(page: Page, a: dict, today: dt.date) -> dict | None:
    """MarketsIreland.ie market listings (IE + Northern Ireland). The site lists markets and connects vendors with
    organisers; it does not host applications. Each listing states its own vendor status:
      'Applications are open for this market'      -> open (contact organiser via the listing / organiser site)
      'Applications are closed or not managed here' -> unknown (closed OR handled elsewhere: not a closure claim)
      (no status)                                   -> standing market listing, no application claim.
    Dates come from the listing's 'Event Details Date <Weekday> <Dth> <Month> <YYYY>' or 'Event Dates <Dow> <D> <Mon> <YYYY>'."""
    m = re.search(r"marketsireland\.ie/market/([a-z0-9\-]+)/?$", page.url)
    if not m:
        return None
    t = re.sub(r"\s+", " ", page.text)
    ex = a["extracted"]
    name = re.sub(r"\s*[-|]\s*marketsireland\.ie\s*$", "", page.title, flags=re.I).strip() or ex.get("name")
    ds = []
    dm = re.search(r"Event Details Date (?:\w+day )?(\d{1,2})(?:st|nd|rd|th)? (\w+) (20\d\d)", t) or \
        re.search(r"Event Dates \w{3} (\d{1,2}) (\w{3}) (20\d\d)", t)
    if dm:
        ds = extract_dates(f"{dm.group(1)} {dm.group(2)} {dm.group(3)}", today)
    start = ds[0].start if ds else None
    county = re.search(r"\bCounty ([A-Z][a-z]+) Market type\b", t) or \
        re.search(r"Location [^|]{0,120}?\b(?:County|Co\.) ([A-Z][a-z]+)\b", t)
    loc = re.search(r"Location (.{3,120}?) County [A-Z][a-z]+", t)
    cname = county.group(1) if county else None
    cc = "GB" if (cname and cname.lower() in _NI_COUNTIES) or re.search(r"\bBT\d{1,2} ?\d[A-Z]{2}\b", t) else "IE"
    fee = re.search(r"Stall fee (EUR|€|£|GBP) ?(\d+(?:\.\d\d)?)(?: ([Pp]er \w+))?", t)
    status = re.search(r"For vendors (Applications are open for this market|Applications are closed or not managed here)", t)
    org_links = [ln.url for ln in page.links if not re.search(
        r"marketsireland\.ie|google\.|maps\.|facebook\.com/sharer|wa\.me|whatsapp|twitter\.com|x\.com/intent|gmpg\.org|"
        r"wordpress|gravatar|elementor", ln.url) and ln.url.startswith("http")]
    org_site = next((u for u in org_links if not re.search(r"facebook\.com|instagram\.com", u)), None)
    contact = bool(re.search(r"\bCall\b|\bEmail\b", t))
    ex["geo_basis"] = (["platform_county_field"] if cname else []) + (["uk_postcode_BT"] if cc == "GB" and not cname else [])
    ex.update(name=name, country=cc, region=(f"County {cname}" if cname else ex.get("region")),
              venue=(loc.group(1).split(",")[0].strip() if loc else ex.get("venue")),
              start_date=start.isoformat() if start else None, end_date=None,
              date_source="platform_listing" if start else None, relevance="relevant",
              fees=(f"{fee.group(1)} {fee.group(2)}" + (f" {fee.group(3)}" if fee.group(3) else "")) if fee else ex.get("fees"))
    routes = []
    if org_site:
        routes.append({"type": "platform_link", "url": org_site, "platform": None, "anchor": "Organiser website",
                       "category": "craft"})
    if start and start < today:
        ex.update(state="HISTORICAL", open_strength=None, missing=["next_edition_dates"],
                  state_evidence=f"MarketsIreland listing date {start.isoformat()} has passed")
    elif status and status.group(1).startswith("Applications are open"):
        routes.insert(0, {"type": "platform_enquiry", "url": page.url, "platform": "MarketsIreland",
                          "anchor": "Applications open - contact organiser" + (" (email/phone on listing)" if contact else ""),
                          "category": "craft"})
        ex.update(state="OPEN_NOW" if start else "UNKNOWN", open_strength="explicit" if start else None,
                  apply_url=(org_site or page.url), missing=[] if start else ["current_dates"],
                  state_evidence=f"MarketsIreland: “{status.group(1)}” ({'event ' + start.isoformat() if start else 'no date listed'}"
                                 f"; organiser contact {'site ' + org_site if org_site else 'by email/phone on listing'})")
    else:
        why = (f"“{status.group(1)}” (closed or handled by the organiser elsewhere; not treated as closed)" if status
               else "standing market listing with no vendor-application status")
        ex.update(state="UNKNOWN", open_strength=None, missing=["open_application"],
                  state_evidence=f"MarketsIreland: {why}" + (f"; organiser site {org_site}" if org_site else ""))
    ex["routes"] = routes
    a["label"] = "actionable" if ex["state"] == "OPEN_NOW" else "uncertain"
    a["reasons"] = ["platform_adapter:marketsireland"]
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


_cm_ids = _platform_ids_only(r"cluemart\.co\.nz/application/([a-z0-9\-]+)", "cluemart_application")


def _cluemart(page: Page, a: dict, today: dt.date) -> dict | None:
    """ClueMart (NZ) application pages. Their static HTML shows a 'Market dates:' list with stall types and
    'N spaces available' only while the organiser has upcoming dates published; otherwise the page is bare
    ('View this market application on ClueMart'). Open is claimed only from listed future dates WITH available
    spaces; a bare page is UNKNOWN (no dates published), never OPEN_NOW. Demo/test listings are not relevant."""
    m = re.search(r"cluemart\.co\.nz/application/([a-z0-9\-]+)", page.url)
    if not m:
        return None
    t = re.sub(r"\s+", " ", page.text)
    ex = a["extracted"]
    name = re.sub(r"\s*\|\s*ClueMart\s*$", "", page.title).strip() or ex.get("name")
    if re.match(r"demo\b|test\b", m.group(1)) or re.match(r"(?i)(demo|test)\b", name or ""):
        ex.update(name=name, relevance="not_relevant", state="NOT_RELEVANT",
                  state_evidence="ClueMart demo/test listing")
        a["label"], a["reasons"] = "rejected", ["platform_demo_listing"]
        return a
    region = re.search(r"\b([A-Z][A-Za-z' &]+?) , New Zealand\b", t)
    md = re.search(r"Market dates: (.{0,1500}?)(?:⏰|Application deadline|Product Discover|$)", t)
    dates = []
    if md:
        for d in extract_dates(md.group(1), today):
            if d.start and d.start >= today:
                dates.append(d.start)
    dates = sorted(set(dates))
    spaces = [int(n) for n in re.findall(r"\((\d+) spaces? available\)", md.group(1) if md else "")]
    ex.update(name=name, country="NZ", region=(region.group(1).strip() if region else ex.get("region")),
              relevance="relevant", start_date=dates[0].isoformat() if dates else None, end_date=None,
              date_source="platform_market_dates" if dates else None)
    ex["geo_basis"] = ["platform_country:cluemart"]
    route = {"type": "platform_page", "url": page.url, "platform": "ClueMart", "anchor": "Apply on ClueMart",
             "category": "market"}
    if dates and any(n > 0 for n in spaces):
        ex.update(state="OPEN_NOW", open_strength="explicit", routes=[route], apply_url=page.url, missing=[],
                  recurrence=(f"{len(dates)} upcoming market dates listed" if len(dates) >= 3 else None),
                  state_evidence=f"ClueMart: {len(dates)} upcoming market date(s) from {dates[0].isoformat()} with "
                                 f"{sum(spaces)} stall space(s) available")
    elif dates:
        ex.update(state="UNKNOWN", open_strength=None, routes=[route], apply_url=page.url, missing=["open_application"],
                  state_evidence=f"ClueMart: market dates listed from {dates[0].isoformat()} but no stall spaces shown as available")
    else:
        ex.update(state="UNKNOWN", open_strength=None, routes=[route], apply_url=page.url, missing=["current_dates"],
                  state_evidence="ClueMart application page with no market dates currently published")
    a["label"] = "actionable" if ex["state"] == "OPEN_NOW" else "uncertain"
    a["reasons"] = ["platform_adapter:cluemart"]
    a["evidence"].insert(0, {"kind": "state", "text": f"{ex['state']}: {ex['state_evidence']}"})
    return a

_ls_ids = _platform_ids_only(r"localstalls\.com/((?:au|nz|uk|us)/event/[^/?#]+/[^/?#]+)", "localstalls_event")
_uk_ids = _platform_ids_only(r"ukcraftfairs\.com/craft-events/(\d+)", "ukcraftfairs_event")
_mi_ids = _platform_ids_only(r"marketsireland\.ie/market/([a-z0-9\-]+)", "marketsireland_market")


def _chain(*fns):
    def fn(page, a, today):
        out = None
        for f in fns:
            r = f(page, out or a, today)
            out = r if r is not None else out
        return out
    fn.__name__ = fns[0].__name__
    return fn


cluemart = _chain(_cluemart, _cm_ids)
cluemart.__name__ = "cluemart"

_DHT_RANGE = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:&|and|-|–|—|to)\s*(\d{1,2})(?:st|nd|rd|th)?\s+"
                        r"(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d\d)\b", re.I)
_DHT_ONE = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|"
                      r"november|december)\s+(20\d\d)\b", re.I)


def dundeeheritage(page: Page, a: dict, today: dt.date) -> dict | None:
    """Dundee Heritage Trust event pages (D-017): the event's own dates are the first date line under the H1
    ('28 & 29 November 2026'). Other events are mentioned further down the page and in related-event cards, so the
    generic extractor can take the wrong ones; only the header line is used. State and routes are left to the classifier."""
    if "/event/" not in page.url or not page.h1:
        return None
    # The H1 text also appears in the <title>; use the first occurrence that is directly followed by a date line.
    m = None
    for occ in re.finditer(re.escape(page.h1), page.text):
        head = page.text[occ.end(): occ.end() + 160]
        m = _DHT_RANGE.search(head) or _DHT_ONE.search(head)
        if m:
            break
    if not m:
        return None
    if m.re is _DHT_RANGE:
        d1, d2, mon, yr = int(m.group(1)), int(m.group(2)), _MON[m.group(3)[:3].lower()], int(m.group(4))
        start, end = dt.date(yr, mon, d1), dt.date(yr, mon, d2)
    else:
        start = end = dt.date(int(m.group(3)), _MON[m.group(2)[:3].lower()], int(m.group(1)))
    ex = a["extracted"]
    ex.update(start_date=start.isoformat(), end_date=end.isoformat() if end != start else None,
              date_source="organiser_event_header")
    if isinstance(ex.get("state_evidence"), str):
        ex["state_evidence"] = re.sub(r"\(event [0-9–-]+\)", f"(event {start.isoformat()}"
                                      f"{'–' + end.isoformat() if end != start else ''})", ex["state_evidence"])
    a["evidence"].insert(0, {"kind": "dates", "text": f"Event header: “{m.group(0)}”"})
    # The venue tag printed directly above the event title (e.g. 'Verdant Works Museum'): source text, not inference.
    before = page.text[:occ.start()].rstrip().rsplit("\n", 1)[-1].strip()
    if re.fullmatch(r"(?:Verdant Works Museum|Discovery Point|RRS Discovery)", before):
        ex["venue"] = before
    # The stallholder application is the on-page form ('please fill in this form'), posting back to the event page.
    if re.search(r"stallholder", page.text, re.I) and re.search(r"fill in this form", page.text, re.I):
        own = [f for f in page.forms if (f.action or page.url).rstrip("/") == page.url.rstrip("/") and f.n_inputs >= 4]
        call = re.search(r"[^.\n]*\bstallholder\b[^.\n]*fill in this form[^.\n]*\.(?:\s*Please note[^.\n]*\.)?", page.text, re.I)
        if own and call and start >= today:
            route = {"type": "onpage_form", "url": page.url, "inputs": own[0].n_inputs, "category": "general"}
            ex["routes"] = [route] + [r for r in ex.get("routes") or [] if r.get("type") != "onpage_form"]
            ex["apply_url"] = page.url
            dates = start.isoformat() + ("–" + end.isoformat() if end != start else "")
            ex.update(relevance="relevant", state="OPEN_NOW", open_strength="explicit", missing=[],
                      state_evidence=f"Open: “{re.sub(chr(10), ' ', call.group(0)).strip()[:420]}” (event {dates})")
            a["label"], a["reasons"] = "actionable", ["organiser_adapter:dundeeheritage"]
            a["evidence"].insert(0, {"kind": "state", "text": f"OPEN_NOW: {ex['state_evidence']}"})
    return a


ADAPTERS = {"ukcraftfairs.com": _chain(ukcraftfairs, _uk_ids), "dundeeheritagetrust.co.uk": dundeeheritage, "localstalls.com": _chain(localstalls, _ls_ids),
            "eventeny.com": eventeny, "cluemart.co.nz": cluemart, "marketspread.com": marketspread,
            "marketsireland.ie": _chain(marketsireland, _mi_ids)}


def apply(page: Page, a: dict, today: dt.date, reg_domain: str, fetched_on: dt.date | None = None) -> dict:
    """fetched_on: when the stored page was fetched (re-assessment of an older page); adapters that resolve yearless
    platform dates use it as their reference date."""
    fn = ADAPTERS.get(reg_domain)
    if fn:
        out = fn(page, a, today, fetched_on) if fn is localstalls else fn(page, a, today)
        if out is not None:
            out.setdefault("features", {})["adapter"] = fn.__name__
            return out
    return a
