"""Application-state model (round 2).

Two questions are kept separate:

  relevance  – is this genuinely a trader/vendor/exhibitor opportunity at an event?   (relevant / not_relevant)
  state      – what can a trader do about it *today*?

States
  OPEN_NOW              explicit evidence that applications/bookings are being accepted now
                        (open phrase, future deadline, live application page for a future event)
  ROLLING               recurring market with a standing application route and no closure signal
  ENQUIRY_AVAILABLE     a real contact route (email / enquiry instruction) but no application mechanism
  UPCOMING_NOT_OPEN     the source says applications will open later (with or without a published date)
  CLOSED_CURRENT_CYCLE  applications closed / deadline passed, but the edition itself has not happened yet
  HISTORICAL            the edition the page describes is over (or only past-dated material exists)
  UNKNOWN               relevant, but availability cannot be determined from the evidence
  NOT_RELEVANT          not a trading opportunity

Every decision carries a one-line, human-readable `state_evidence` built from text quoted from the
page plus the dates the engine extracted. Nothing is inferred about future editions here: recurrence
is only *recorded* when the source states it (e.g. "12th annual", "every Saturday").
"""
from __future__ import annotations

import datetime as dt
import re

from .dates import extract_dates

STATES = ["OPEN_NOW", "ROLLING", "ENQUIRY_AVAILABLE", "UPCOMING_NOT_OPEN", "CLOSED_CURRENT_CYCLE",
          "HISTORICAL", "UNKNOWN", "NOT_RELEVANT"]
# Rank used when several pages describe the same opportunity (higher = more available).
STATE_RANK = {"OPEN_NOW": 7, "ROLLING": 6, "ENQUIRY_AVAILABLE": 5, "UPCOMING_NOT_OPEN": 4,
              "CLOSED_CURRENT_CYCLE": 3, "UNKNOWN": 2, "HISTORICAL": 1, "NOT_RELEVANT": 0}
ACTIONABLE_STATES = {"OPEN_NOW", "ROLLING"}

OPENS_ON_RE = re.compile(
    r"(?:applications?|bookings?|registrations?|expressions?\s+of\s+interest|(?:the\s+)?(?:form|portal))\s+"
    r"(?:for\s+20\d\d\s+|for\s+the\s+20\d\d\s+\w+\s+)?(?:will\s+)?(?:be\s+)?(?:open|opening|re-?open|available|live)s?\s+"
    r"(?:on|from|in|by)?\s*([^.\n]{0,40})", re.I)
ANNUAL_RE = re.compile(
    r"\b(?:\d{1,3}(?:st|nd|rd|th)\s+annual|annual(?:ly)?|every\s+year|each\s+year|yearly|returns\s+(?:in|for|on)\s+20\d\d|"
    r"held\s+annually|once\s+a\s+year)\b", re.I)
RECUR_MARKET_RE = re.compile(
    r"\b(?:every|each)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|week|fortnight|month)\b|"
    r"\b(?:every|each)\s+(?:first|second|third|fourth|last|1st|2nd|3rd|4th)\s+(?:monday|tuesday|wednesday|thursday|"
    r"friday|saturday|sunday)\b|\b(?:weekly|fortnightly|monthly)\b|\bmonthly\s*·", re.I)


MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
SEASON_END_RE = re.compile(
    r"\b(?:until|till|to|through|thru|into)\s+(?:the\s+)?(?:early\s+|mid[\s-]?|late\s+|end\s+of\s+)?"
    r"(january|february|march|april|may|june|july|august|september|october|november|december)\b(?!\s+\d)", re.I)


def _snip(text: str, m, pad: int = 70) -> str:
    a, b = max(0, m.start() - pad), min(len(text), m.end() + pad)
    return re.sub(r"\s+", " ", text[a:b]).strip()


def derive_state(*, label: str, vendor: str, body: str, title_blob: str, today: dt.date, start, end, date_src,
                 deadline, up_deadline: bool, routes: list, recurrence: str | None, currency: str,
                 closed_ms: list, opened_ms: list, not_yet_ms: list, on_platform: bool,
                 permit_page: bool = False, url: str = "") -> dict:
    """Return dict(relevance, state, state_evidence, open_strength, opens_on, recurrence_evidence, missing)."""
    out = {"relevance": "not_relevant", "state": "NOT_RELEVANT", "state_evidence": None, "open_strength": None,
           "opens_on": None, "recurrence_evidence": None, "missing": []}
    if label not in ("actionable", "uncertain") or vendor != "strong":
        out["state_evidence"] = "Not a trader opportunity (classifier label: %s)" % label
        return out
    if permit_page:
        out["state_evidence"] = "Council licence/permit page for trading, not an event opportunity"
        return out
    out["relevance"] = "relevant"

    # ---- recurrence evidence (recorded, never assumed) ----
    m = ANNUAL_RE.search(title_blob + "\n" + body[:30000])
    if m:
        out["recurrence_evidence"] = "annual: “%s”" % _snip(title_blob + "\n" + body[:30000], m, 40)
    rm = RECUR_MARKET_RE.search(body[:30000])
    weekly = None
    if rm:
        weekly = _snip(body[:30000], rm, 40)
        out["recurrence_evidence"] = (out["recurrence_evidence"] + " | " if out["recurrence_evidence"] else "") + \
            "regular: “%s”" % weekly

    # ---- published opening date ----
    opens_on = None
    for om in OPENS_ON_RE.finditer(body[:60000]):
        ds = extract_dates(om.group(0) + " " + str(today.year), today)
        fut = [d.start for d in ds if d.start > today]
        if fut:
            opens_on = fut[0]
            out["opens_on"] = opens_on.isoformat()
            open_snip = _snip(body, om, 40)
            break

    ev_end = (end or start)
    ev_future = bool(ev_end and ev_end >= today)
    ev_past = bool(ev_end and ev_end < today and not ev_future)
    underway = bool(start and end and start < today <= end)

    # A 'not yet open' phrase only counts if it is not contradicted: drop matches whose own snippet
    # carries an explicit year and only past dates (e.g. "applications will open on May 11, 2026").
    def _live(m):
        sn = _snip(m.string, m, 60)
        if not re.search(r"\b20\d\d\b", sn):
            return True
        ds = extract_dates(sn, today)
        return not ds or any(d.start >= today for d in ds)
    not_yet_ms = [m for m in not_yet_ms if _live(m)]
    route_types = {r["type"] for r in routes}
    app_routes = route_types & {"platform_page", "platform_link", "embedded_form", "onpage_form", "apply_link"}
    doc_routes = route_types & {"form_document"}
    contact_routes = route_types & {"email", "contact_instruction"}
    date_txt = f"event {start.isoformat()}" + (f"–{end.isoformat()}" if end and end != start else "") if start else "no event date found"
    dl_txt = f"; deadline {deadline.isoformat()}" if deadline else ""

    def q(ms):
        return "“%s”" % _snip(ms[0].string, ms[0], 50) if ms else ""

    # ---- 1. not yet open ----
    # A closure statement beats a vague "check back later"; only a published future opening date
    # turns a closed page into UPCOMING. A past edition with no future opening date is not 'upcoming'.
    upcoming_vague = bool(not_yet_ms and not opened_ms and not closed_ms and not (ev_past and not weekly))
    if upcoming_vague or (opens_on and opens_on > today and not opened_ms):
        out["state"] = "UPCOMING_NOT_OPEN"
        out["state_evidence"] = (f"Opening date published: {opens_on.isoformat()} — “{open_snip}”" if opens_on
                                 else f"Not yet open: {q(not_yet_ms)} ({date_txt})")
        out["missing"] = ["open_application"] + ([] if opens_on else ["opening_date"])
        return out
    # ---- 2. explicitly closed or deadline passed ----
    deadline_passed = bool(deadline and deadline < today and not up_deadline)
    if (closed_ms and not opened_ms) or deadline_passed:
        why = q(closed_ms) if closed_ms else f"deadline {deadline.isoformat()} has passed"
        if ev_past or currency in ("past_edition", "stale_years"):
            out["state"] = "HISTORICAL"
            out["state_evidence"] = f"Closed and edition over: {why} ({date_txt})"
            out["missing"] = ["next_edition_dates", "next_application_route"]
        else:
            out["state"] = "CLOSED_CURRENT_CYCLE"
            out["state_evidence"] = f"Applications closed for current cycle: {why} ({date_txt})"
            out["missing"] = ["next_cycle_application"]
        return out
    # ---- 2b. edition under way / season about to end ----
    explicit_dl = bool(deadline and deadline >= today)
    if underway and not weekly and not explicit_dl and (not opened_ms or (end - today).days <= 14):
        out["state"] = "CLOSED_CURRENT_CYCLE"
        out["state_evidence"] = f"Edition already under way ({date_txt}); too late to apply for this cycle"
        out["missing"] = ["next_cycle_application"]
        return out
    if weekly and end and today <= end and (end - today).days <= 14 and start and start < today:
        out["state"] = "CLOSED_CURRENT_CYCLE"
        out["state_evidence"] = f"Market season ends {end.isoformat()} (within 14 days): “{weekly}”"
        out["missing"] = ["next_season_application"]
        return out
    if weekly and not (ev_end and (ev_end - today).days > 14):
        win = body[max(0, rm.start() - 200): rm.end() + 200]
        sm = SEASON_END_RE.search(win)
        if sm:
            mon = MONTHS[sm.group(1)[:3].lower()]
            if mon == today.month or mon == (today.month - 2) % 12 + 1:
                out["state"] = "CLOSED_CURRENT_CYCLE"
                out["state_evidence"] = f"Market season ends in {sm.group(1).title()}: “{_snip(win, sm, 50)}”"
                out["missing"] = ["next_season_application"]
                return out
    if weekly and ev_end and ev_end < today - dt.timedelta(days=21) and not explicit_dl:
        out["state"] = "HISTORICAL"
        out["state_evidence"] = f"Recurring market whose only published season date ({ev_end.isoformat()}) has passed: “{weekly}”"
        out["missing"] = ["current_season_dates"]
        return out
    if weekly and ev_end and ev_end.year < today.year:
        out["state"] = "HISTORICAL"
        out["state_evidence"] = f"Recurring market, but the only season dates published are for {ev_end.year}: “{weekly}”"
        out["missing"] = ["current_season_dates"]
        return out
    # ---- 3. edition over / only stale material ----
    if (ev_past and not weekly and not (deadline and deadline >= today)) or \
            currency in ("past_edition", "stale_years", "current_year_late", "rolling"):
        out["state"] = "HISTORICAL"
        out["state_evidence"] = f"Edition appears to be over ({date_txt}; currency={currency})"
        out["missing"] = ["next_edition_dates"]
        return out
    current = ev_future or (deadline and deadline >= today) or currency in ("future", "future_site", "recurring",
                                                                              "current_year_mentioned")
    # ---- 4. rolling markets ----
    if weekly and (app_routes or doc_routes or on_platform) and currency != "undated" or (
            weekly and (app_routes or on_platform) and not ev_past):
        out["state"] = "ROLLING"
        out["open_strength"] = "explicit" if opened_ms else "implicit"
        out["state_evidence"] = f"Recurring market with application route: “{weekly}”" + (f"; {q(opened_ms)}" if opened_ms else "")
        return out
    # An exhibitor-enquiry form is an enquiry route, not an open application.
    enquiry_page = bool(re.search(r"enquir(?:y|ies)|inquir(?:y|ies)|register[-_\s]+interest", url or "", re.I)) and \
        bool(re.search(r"\b(?:exhibit|stand|stall|vendor|trader|booth)", title_blob + " " + body[:3000], re.I))
    if enquiry_page and not opened_ms and not (deadline and deadline >= today) and app_routes <= {"onpage_form", "embedded_form"} \
            and (current or weekly):
        out["state"] = "ENQUIRY_AVAILABLE"
        out["state_evidence"] = f"Exhibitor/trader enquiry form ({date_txt})"
        out["missing"] = ["application_mechanism"]
        return out
    # ---- 5. open now ----
    explicit_open = bool(opened_ms) or bool(deadline and deadline >= today)
    # An implicit 'open' (a route exists, nothing says it is open) is not credible for an edition that starts
    # within 10 days: most organisers have finished allocating by then.
    imminent = bool(start and today <= start <= today + dt.timedelta(days=10))
    if imminent and not explicit_open and not weekly and not on_platform and (app_routes or doc_routes):
        out["state"] = "UNKNOWN"
        out["state_evidence"] = f"Application route exists but the edition starts within 10 days and nothing says applications are still open ({date_txt})"
        out["missing"] = ["open_status"]
        return out
    if (app_routes or on_platform) and current:
        out["state"] = "OPEN_NOW"
        out["open_strength"] = "explicit" if explicit_open else "implicit"
        ev = q(opened_ms) if opened_ms else (f"deadline {deadline.isoformat()} still ahead" if deadline and deadline >= today
                                             else "live application route for an upcoming edition")
        out["state_evidence"] = f"Open: {ev} ({date_txt}{dl_txt})"
        return out
    if doc_routes and current:
        # A downloadable form is only 'open' if it is not clearly for an earlier edition.
        doc_years = [int(y) for r in routes if r["type"] == "form_document"
                     for y in re.findall(r"20(\d\d)", (r.get("url") or "") + " " + (r.get("anchor") or ""))]
        doc_years = [2000 + y for y in doc_years]
        ev_year = start.year if start else today.year
        if doc_years and max(doc_years) < ev_year:
            out["state"] = "UNKNOWN"
            out["state_evidence"] = f"Application document appears to be for an earlier edition ({max(doc_years)}) ({date_txt})"
            out["missing"] = ["current_application_form"]
            return out
        out["state"] = "OPEN_NOW"
        out["open_strength"] = "explicit" if explicit_open else "implicit"
        out["state_evidence"] = f"Open: downloadable application form for upcoming edition ({date_txt}{dl_txt})" + \
            (f"; {q(opened_ms)}" if opened_ms else "")
        return out
    # ---- 6. enquiry only ----
    if (contact_routes or enquiry_page) and (current or weekly):
        out["state"] = "ENQUIRY_AVAILABLE"
        out["state_evidence"] = (f"Enquiry route only (email/contact) ({date_txt})" if contact_routes
                                 else f"Exhibitor/trader enquiry form page ({date_txt})")
        out["missing"] = ["application_mechanism"]
        return out
    # ---- 7. unknown ----
    out["state"] = "UNKNOWN"
    missing = []
    if not routes:
        missing.append("application_route")
    if not current:
        missing.append("current_dates")
    out["missing"] = missing or ["open_status"]
    out["state_evidence"] = f"Relevant but availability unclear ({date_txt}; currency={currency}; routes={sorted(route_types) or 'none'})"
    return out


ROUTE_CATEGORIES = [
    ("food", r"\b(?:food|catering|caterer|beverage|drinks?|bar|coffee|truck|street\s+food|hot\s+food)\b"),
    ("craft", r"\b(?:craft|crafter|handmade|artisan|maker)s?\b"),
    ("art", r"\b(?:art|artist|juried|fine\s+art|photograph)\w*\b"),
    ("exhibitor", r"\b(?:exhibitor|trade\s+stand|tradestand|commercial|booth\s+space|stand)s?\b"),
    ("nonprofit", r"\b(?:non[\s-]?profit|charity|community\s+(?:group|stall|booth))\b"),
    ("produce", r"\b(?:farmer|produce|grower)s?\b"),
    ("retail", r"\b(?:retail|merchant|marketplace|general|vendor|stallholder|trader|market)s?\b"),
]
_RC = [(k, re.compile(v, re.I)) for k, v in ROUTE_CATEGORIES]


def route_category(text: str) -> str:
    for k, rx in _RC:
        if rx.search(text or ""):
            return k
    return "general"
