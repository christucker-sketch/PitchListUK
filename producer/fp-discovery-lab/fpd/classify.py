"""Page → assessment (label + features + quoted evidence + extracted fields).

The classifier is deliberately rule-based and transparent: every decision is explained by
reason codes and by verbatim snippets from the page. It answers four questions:

  1. Is this page about *trading at an event*?          (vendor signal)
  2. Is there a concrete route to participate?           (application route)
  3. Is it current?                                      (dates / recurrence / open-closed)
  4. Is it in a target geography?                        (geo votes)

actionable = strong vendor signal + route + current + not closed + in-scope geography
uncertain  = vendor signal present but one of the other conditions is missing/unclear
rejected   = no vendor signal, wrong domain of meaning (procurement, jobs...), out of scope, or stale
hub        = a listing/directory page linking out to many events (not an opportunity itself,
             but a valuable discovery source)
"""
from __future__ import annotations

import datetime as dt
import html as html_lib
import re
from collections import Counter
from urllib.parse import urlsplit

from . import lexicon as L
from .dates import extract_dates, parse_iso, year_counts
from .geo import infer_geo
from .parse import Page, jsonld_events
from .state import derive_state, route_category
from .urlutil import is_social, reg_domain

SEPARATORS = re.compile(r"\s+[|–—:•»·]\s+|\s+-\s+")
NAME_JUNK = re.compile(
    r"^(?:home|homepage|welcome|vendors?|vendor\s+application.*|.*application\s*form|traders?|stall\s*holders?|"
    r"stallholders?.*|exhibitors?.*|trade\s+stands?.*|apply.*|booking.*|eventeny|marketspread|zapp.*|"
    r"jotform|google\s+forms?|facebook|instagram|.*\bvendor\s+application|.*\bvendors?\s+info.*|"
    r"food\s+(?:vendors?|traders?).*|get\s+involved|take\s+part|.*\bapplications?$|contact(?:\s+us)?|"
    r"about(?:\s+us)?|faqs?|information|info)$",
    re.I,
)
ORGANISER_RE = re.compile(
    r"\b(?:organi[sz]ed|hosted|presented|run|produced|managed|brought\s+to\s+you)\s+by\s+(?:the\s+)?"
    r"([A-Z][\w&'.]*(?:\s+(?:of|and|&|the|for|[A-Z][\w&'.-]*)){0,7})"
)
FEE_RE = re.compile(
    r"(?:[£$€]\s?\d[\d,]*(?:\.\d{2})?(?:\s*(?:\+\s*VAT|per\s+(?:day|pitch|stall|booth|event|market|space)))?)",
    re.I,
)


def _snip(text: str, start: int, end: int, pad: int = 110) -> str:
    a = max(0, start - pad)
    b = min(len(text), end + pad)
    s = text[a:b].replace("\n", " ")
    return ("…" if a > 0 else "") + s.strip() + ("…" if b < len(text) else "")


def _body_text(page: Page) -> str:
    """Page text minus repeated navigation labels (so 'Traders' in a menu isn't a signal)."""
    nav = {l.text.strip().lower() for l in page.links if l.in_nav and l.text}
    lines = [ln for ln in page.text.split("\n") if ln.strip().lower() not in nav]
    return "\n".join(lines)


SECTION_WORDS = re.compile(
    r"\b(?:vendors?|exhibitors?|traders?|stall\s*holders?|concessions?|applications?|apply|info(?:rmation)?|contract|"
    r"handbook|become|our|copy\s+of|welcome|home|page|site|website|merchants?|booths?|stalls?|pitch(?:es)?|"
    r"waitlist|registration|register|faqs?|terms|rules|guidelines|get\s+involved|opportunit(?:y|ies)|"
    r"tips|blog|news|contact|about|sponsors?|tickets?|charts?|form|portal)\b", re.I)
GENERIC_ANCHOR = re.compile(r"^(?:website|web\s*site|visit(?:\s+(?:website|site))?|site|link|click\s+here|more(?:\s+info)?|"
                            r"read\s+more|details|info|fair\s+site|official\s+site|home(?:page)?|www\..*|https?://.*)$", re.I)


def clean_name(s: str | None) -> str | None:
    if not s or not isinstance(s, str):
        return None
    s = html_lib.unescape(html_lib.unescape(s))
    s = re.sub(r"\s+", " ", s).strip(" -|:•▼▲»")
    return s or None


def derive_name(page: Page, evs: list[dict], hint_name: str | None = None) -> str | None:
    """Pick the most plausible event/organiser name. Prefers structured data, then title segments
    that look like an event name, then the site-level name learned from the homepage/seed."""
    for ev in evs:
        n = clean_name(ev.get("name"))
        if n and 3 < len(n) < 150 and not NAME_JUNK.match(n):
            return n
    hint_name = clean_name(hint_name)
    if hint_name and GENERIC_ANCHOR.match(hint_name):
        hint_name = None
    cands = []
    for src in (page.og.get("title"), page.title, page.h1, page.og.get("site_name")):
        src = clean_name(src)
        if src:
            for seg in [src] + SEPARATORS.split(src):
                seg = clean_name(seg)
                if seg and 3 <= len(seg) <= 120 and not NAME_JUNK.match(seg):
                    cands.append(seg)
    if not cands:
        return hint_name

    def score(s):
        sc = 0.0
        if any(rx.search(s) for rx in L.EVENT_TYPES_RE.values()):
            sc += 2
        if SECTION_WORDS.search(s):
            sc -= 2.5
        if re.fullmatch(r"[\d\s,/.-]+|.*\b\d{1,2}\s+\w+\s+20\d\d$", s) or GENERIC_ANCHOR.match(s):
            sc -= 4
        if len(s.split()) == 1 and s.isupper():
            sc -= 1.5  # acronyms like 'NGSF'
        if hint_name and (s.lower() in hint_name.lower() or hint_name.lower() in s.lower()):
            sc += 1.5
        sc -= abs(len(s) - 32) / 60
        if s.lower() in {"eventeny", "marketspread", "jotform", "google docs"}:
            sc -= 5
        return sc

    best = max(cands, key=score)
    if hint_name and score(best) < 0.5:
        return hint_name
    return best


def classify(page: Page, today: dt.date, hint: dict | None = None, html_len: int = 0) -> dict:
    hint = hint or {}
    url = page.url
    path = urlsplit(url).path.lower()
    host_rd = reg_domain(url)
    body = _body_text(page)
    title_blob = " | ".join(x for x in [page.title, page.h1, page.og.get("title", "")] if x)
    heads_blob = " | ".join(page.headings)
    evidence: list[dict] = []
    reasons: list[str] = []
    feats: dict = {}

    # ---------- 1. vendor signal ----------
    strong_hits = []
    for rx in L.STRONG_RE:
        for m in rx.finditer(body):
            strong_hits.append((m.start(), m.end(), m.group(0)))
            if len(strong_hits) > 40:
                break
    strong_hits.sort()
    distinct_strong = {h[2].lower() for h in strong_hits}
    distinct_apply = {m.group(0).lower() for rx in L.STRONG_APPLY_RE for m in rx.finditer(body)}
    distinct_topic = distinct_strong - distinct_apply
    weak = sum(len(rx.findall(body[:50_000])) for rx in L.WEAK_RE)
    focus_title = any(rx.search(title_blob) for rx in L.STRONG_RE) or bool(
        re.search(r"\b(vendor|stall[\s-]?holder|trader|exhibitor|trade[\s-]?stand|concession)s?\b", title_blob, re.I))
    focus_heads = any(rx.search(heads_blob) for rx in L.STRONG_APPLY_RE)
    focus_url = bool(L.LINK_STRONG.search(path))
    platform_here = L.platform_of(url)
    if not platform_here or platform_here in L.TICKETING_ONLY:
        on_platform_vendor_page = False
    elif platform_here in L.FORM_PROVIDERS:
        on_platform_vendor_page = focus_title or len(distinct_strong) >= 1
    elif platform_here in L.PLATFORM_APP_PATH and re.search(L.PLATFORM_APP_PATH[platform_here],
                                                             urlsplit(url).path + "?" + urlsplit(url).query, re.I):
        on_platform_vendor_page = True
    else:
        # Profile/marketing pages on a platform only count with explicit application language.
        on_platform_vendor_page = focus_title and len(distinct_strong) >= 2
    feats.update(strong=len(strong_hits), strong_distinct=len(distinct_strong), weak=weak,
                 focus_title=focus_title, focus_heads=focus_heads, focus_url=focus_url,
                 platform=platform_here)
    last_end = -10_000
    n_ev = 0
    for s, e, _ in strong_hits:
        if s - last_end < 220:
            continue
        evidence.append({"kind": "vendor_language", "text": _snip(body, s, e)})
        last_end, n_ev = e, n_ev + 1
        if n_ev >= 3:
            break

    focus = focus_title or focus_heads or focus_url
    feats.update(apply_distinct=len(distinct_apply), topic_distinct=len(distinct_topic))
    if on_platform_vendor_page or (focus and len(distinct_apply) >= 1) or len(distinct_apply) >= 2 or (
            len(distinct_apply) >= 1 and len(distinct_topic) >= 2):
        vendor = "strong"
    elif len(distinct_strong) >= 1 or (focus and weak >= 3):
        vendor = "moderate"
    else:
        vendor = "none"
    feats["vendor_signal"] = vendor

    # ---------- negatives ----------
    negs = {}
    for k, rx in L.NEGATIVE_RE.items():
        n = len(rx.findall(body[:60_000]))
        if n:
            negs[k] = n
    feats["negatives"] = negs
    neg_in_title = any(rx.search(title_blob) for rx in L.NEGATIVE_RE.values())

    # ---------- 2. application route ----------
    routes: list[dict] = []
    if on_platform_vendor_page:
        routes.append({"type": "platform_page", "url": url, "platform": platform_here})
    for f in page.forms:
        ft = (f.field_text or "").lower()
        if f.n_inputs >= 4 and not re.search(r"\bsearch\b", ft) and (
                re.search(L.ROLE, ft, re.I) or re.search(r"(business|company|products?|stall|pitch|booth|insurance|gazebo|menu)", ft)
                or (focus and f.n_inputs >= 6)):
            routes.append({"type": "onpage_form", "url": f.action or url, "inputs": f.n_inputs})
    for fr in page.iframes:
        p = L.platform_of(fr)
        if p and p not in L.TICKETING_ONLY:
            routes.append({"type": "embedded_form", "url": fr, "platform": p})
    role_rx = re.compile(L.ROLE, re.I)
    for ln in page.links:
        u = ln.url
        if u.startswith("mailto:"):
            if role_rx.search(ln.context) or re.search(r"\b(book|stall|pitch|trade|appl)", ln.context, re.I):
                routes.append({"type": "email", "url": u, "context": ln.context[:160]})
            continue
        if is_social(u) or L.NON_ROUTE_HOSTS.search(u):
            continue
        p = L.platform_of(u)
        if p and reg_domain(u) == host_rd:
            continue  # navigation within the platform itself is not a route for this page
        anchor = (ln.text or "") + " " + u
        vendorish_anchor = bool(role_rx.search(anchor) or L.LINK_STRONG.search(anchor))
        if p and p not in L.TICKETING_ONLY:
            if L.NON_VENDOR_ANCHOR.search(ln.text or "") and not role_rx.search(ln.text or ""):
                continue  # e.g. a Google Form for the parade or volunteers
            routes.append({"type": "platform_link", "url": u, "platform": p, "anchor": ln.text[:120]})
        elif p and vendorish_anchor:
            routes.append({"type": "platform_link", "url": u, "platform": p, "anchor": ln.text[:120]})
        elif L.FORM_DOC.search(u) and (L.FORM_DOC_NAME.search(anchor)):
            routes.append({"type": "form_document", "url": u, "anchor": ln.text[:120]})
        elif L.APPLY_ANCHOR.search(ln.text or "") and not ln.in_nav and (
                vendorish_anchor or role_rx.search(ln.context or "") or focus):
            if not L.LINK_NEGATIVE.search(u) and not (L.NON_VENDOR_ANCHOR.search(ln.text or "") and not role_rx.search(ln.text or "")):
                routes.append({"type": "apply_link", "url": u, "anchor": ln.text[:120]})
    # Phone/email instructions in text ("email us to book a stall")
    if not routes:
        m = re.search(r"(?:e-?mail|contact|call|phone|ring)\s+(?:us\s+)?(?:at\s+|on\s+)?[^\n]{0,60}?\s+to\s+"
                      r"(?:book|apply|enquire|reserve|register)[^\n]{0,40}(?:stall|pitch|space|booth|stand)", body, re.I)
        if m:
            routes.append({"type": "contact_instruction", "url": None, "text": m.group(0)[:200]})
    prio = {"platform_page": 0, "platform_link": 1, "embedded_form": 1, "onpage_form": 2, "form_document": 3,
            "apply_link": 4, "email": 5, "contact_instruction": 6}
    def _vend(r):
        a = (r.get("anchor") or "") + " " + (r.get("url") or "")
        return 0 if (role_rx.search(a) or L.LINK_STRONG.search(a)) else 1
    routes.sort(key=lambda r: (prio.get(r["type"], 9) if r["type"] == "platform_page" else 1, _vend(r), prio.get(r["type"], 9)))
    feats["routes"] = [r["type"] for r in routes][:12]
    for r in routes[:3]:
        evidence.append({"kind": "application_route", "text": f"{r['type']}: {r.get('anchor') or r.get('text') or ''} -> {r.get('url')}"})
    apply_url = next((r["url"] for r in routes if r.get("url")), None)

    # ---------- 3. currency ----------
    evs = jsonld_events(page)
    dates = extract_dates(body[:80_000], today, day_first=True)
    deadlines, event_dates = [], []
    for d in dates:
        before = body[max(0, d.pos - 110): d.pos]
        if L.DEADLINE_CUE.search(before):
            deadlines.append(d)
        else:
            event_dates.append(d)
    ld_start = ld_end = None
    for ev in evs:
        ld_start = ld_start or parse_iso(ev.get("startDate"))
        ld_end = ld_end or parse_iso(ev.get("endDate"))
    upcoming = sorted([d for d in event_dates if (d.end or d.start) >= today], key=lambda d: d.start)
    past = sorted([d for d in event_dates if (d.end or d.start) < today], key=lambda d: d.start)
    if ld_start and (ld_end or ld_start) >= today:
        start, end, date_src = ld_start, ld_end, "jsonld"
    elif upcoming:
        start, end, date_src = upcoming[0].start, upcoming[0].end, "text"
        evidence.append({"kind": "date", "text": _snip(body, upcoming[0].pos, upcoming[0].endpos, 60)})
    elif ld_start:
        start, end, date_src = ld_start, ld_end, "jsonld_past"
    elif past:
        start, end, date_src = past[-1].start, past[-1].end, "text_past"
    else:
        start = end = None
        date_src = None
    deadline = None
    up_dead = sorted([d.start for d in deadlines if d.start >= today])
    if up_dead:
        deadline = up_dead[0]
    elif deadlines:
        deadline = max(d.start for d in deadlines)
    for d in deadlines[:1]:
        evidence.append({"kind": "deadline", "text": _snip(body, d.pos, d.endpos, 80)})
    recurrence = None
    for rx in L.RECURRENCE_RE:
        m = rx.search(body)
        if m:
            recurrence = m.group(0)
            evidence.append({"kind": "recurrence", "text": _snip(body, m.start(), m.end(), 60)})
            break
    yc = year_counts(body[:80_000] + " " + title_blob)
    cur_years = sum(v for y, v in yc.items() if y >= today.year)
    old_years = sum(v for y, v in yc.items() if y < today.year)

    if (start and (end or start) >= today) or (deadline and deadline >= today):
        currency = "future"
    elif recurrence:
        currency = "recurring"
    elif start and (end or start) < today:
        # Past edition. If the page also talks about a future year, it's probably rolling over.
        currency = "past_edition" if not any(y > today.year for y in yc) else "rolling"
    elif cur_years and cur_years >= old_years and (today.month <= 9 or any(y > today.year for y in yc)):
        currency = "current_year_mentioned"
    elif cur_years and cur_years >= old_years:
        currency = "current_year_late"  # only this year's edition mentioned, no dates, and the year is nearly over
    elif old_years >= 2:
        currency = "stale_years"
    else:
        currency = "undated"
    # Trader pages are often evergreen; the event's dates live on the homepage. Borrow them.
    site_date = parse_iso(hint.get("site_next_date"))
    if currency in ("undated", "current_year_mentioned") and site_date and site_date > today:
        currency = "future_site"
        if not start:
            start, date_src = site_date, "site_homepage"
            evidence.append({"kind": "date", "text": f"(event date {site_date.isoformat()} taken from the organiser's homepage)"})
    feats.update(currency=currency, n_dates=len(dates), years=dict(sorted(yc.items())[-4:]))

    # open / closed
    closed = [m for rx in L.CLOSED_RE for m in [rx.search(body)] if m]
    if re.search(r"/closedform\b", url):
        closed.append(re.search(r"closedform", url))
    opened = [m for rx in L.OPEN_RE for m in [rx.search(body)] if m]
    # "not accepting new applications for jewellery, pottery or baked goods" / "some categories are full"
    # closes only some categories; it is not a closure of the opportunity.
    def _partial(m):
        after = body[m.end(): m.end() + 60]
        before = body[max(0, m.start() - 80): m.start()]
        return bool(re.match(r"\s*(?:at\s+this\s+time\s+)?for\s+(?!(?:the\s+)?20\d\d|this|next|our|the\s+(?:20\d\d|current|upcoming))[a-z]", after, re.I)) or \
            bool(re.search(r"\b(?:some|certain|the\s+following|several)\s+(?:vendor\s+)?(?:categories|categor)", before + m.group(0), re.I))
    if closed:
        part = [m for m in closed if _partial(m)]
        if part:
            feats["partial_category_closure"] = _snip(body, part[0].start(), part[0].end(), 50)
            closed = [m for m in closed if not _partial(m)]
    # Per-category 'SOLD OUT' (e.g. one ticket type on a platform page) is not a closure while other
    # priced categories are still on sale.
    if closed:
        priced = len(re.findall(r"[$£€]\s?\d[\d,]*(?:\.\d\d)?\s+(?:non-?)?refundable", body, re.I))
        sold = len(re.findall(r"\bsold\s+out\b", body, re.I))
        if priced > 0:
            kept = [m for m in closed if not re.search(r"sold\s+out|fully\s+booked", m.group(0), re.I)
                    or re.search(r"all\s+available", m.group(0), re.I)]
            if len(kept) < len(closed):
                feats["partial_sold_out"] = {"sold_out": sold, "priced_available": priced}
            closed = kept
    not_yet = [m for rx in L.NOT_YET_OPEN_RE for m in [rx.search(body)] if m]
    if not_yet and not opened:
        app_status = "not_yet_open"
    elif closed and not opened:
        app_status = "closed"
    elif opened and not closed:
        app_status = "open"
    elif closed and opened:
        app_status = "mixed"
    else:
        app_status = "unknown"
    if deadline and deadline < today and not up_dead:
        app_status = "closed"  # the only application deadline we can see has passed
    for m in (closed[:1] + opened[:1]):
        evidence.append({"kind": "status", "text": _snip(body, m.start(), m.end(), 60)})
    feats["app_status"] = app_status

    # ---------- 4. geography ----------
    geo = infer_geo(url, body, evs, hint)
    feats["geo"] = {k: geo[k] for k in ("country", "confidence")}

    # ---------- hub detection ----------
    ext_domains = Counter()
    for ln in page.links:
        if ln.url.startswith("mailto:") or is_social(ln.url):
            continue
        rd = reg_domain(ln.url)
        if rd == host_rd:
            continue
        if any(rx.search(ln.text or "") for k, rx in L.EVENT_TYPES_RE.items()) or re.search(r"\b20\d\d\b", ln.text or ""):
            ext_domains[rd] += 1
    feats["external_event_domains"] = len(ext_domains)
    is_hub = len(ext_domains) >= 8

    # ---------- types ----------
    blob = title_blob + "\n" + heads_blob + "\n" + body[:20_000]
    ev_types = [k for k, rx in L.EVENT_TYPES_RE.items() if rx.search(blob)]
    tr_types = [k for k, rx in L.TRADER_TYPES_RE.items() if rx.search(body[:30_000])]
    fees = None
    for m in re.finditer(r"(?:pitch|stall|booth|vendor|space|site|stand|table|application|jury)\s+fees?[^\n]{0,80}", body, re.I):
        fm = FEE_RE.search(m.group(0))
        if fm:
            fees = m.group(0)[:120]
            break

    # ---------- decision ----------
    in_scope = geo["country"] not in (None, "XX")
    route = bool(routes)
    strong_route = any(r["type"] in ("platform_page", "platform_link", "embedded_form", "onpage_form", "form_document", "apply_link") for r in routes)
    # A season-specific application ("2026 Vendor Application") seen in Q4 with no future date is stale.
    if currency in ("future_site", "undated", "current_year_mentioned", "recurring") and today.month >= 10 and \
            re.search(rf"\b{today.year}\b", title_blob) and not re.search(rf"\b{today.year + 1}\b", title_blob + " " + body[:20000]) \
            and not (start and start >= today and date_src in ("jsonld", "text")):
        currency = "current_year_late"
    current_ok = currency in ("future", "future_site", "recurring", "current_year_mentioned")

    ev_types_title = [k for k, rx in L.EVENT_TYPES_RE.items() if rx.search(title_blob)]
    procurement = negs.get("procurement", 0)
    online = any("Online" in str(ev.get("eventAttendanceMode", "")) for ev in evs) or bool(
        re.search(r"\b(?:virtual|online)\s+(?:event|market|vendor\s+fair|craft\s+fair)\b", title_blob, re.I))
    interest_list = bool(re.search(r"\b(?:wait\s?list|interest\s+list|vendor\s+database)\b", title_blob, re.I) or re.search(
        r"\b(?:not\s+an\s+application\s+for\s+a\s+specific\s+event|vendor\s+interest\s+list|join\s+our\s+vendor\s+(?:list|database)|"
        r"(?:added\s+to|join)\s+the\s+wait\s?list\s+for\s+vendor)\b",
        body[:8000], re.I))
    # Agricultural 'exhibitors' are often livestock/competition entrants, not traders.
    livestock = len(re.findall(r"\b(?:livestock|cattle|sheep|swine|goats?|poultry|rabbits?|4-?h|ffa|premium\s+book|"
                               r"stalling|bedding|weigh[\s-]?in|show\s+ring|judging|entry\s+tags?|showmanship|"
                               r"exhibit\s+entries|entries\s+close)\b", body[:60_000], re.I))
    commercial = len(re.findall(r"\b(?:vendor|concession|commercial|booth|trade\s+stand|stallholder|food\s+truck|"
                                r"merchandise|retail|craft\s+vendor|food\s+vendor|trader)s?\b", body[:60_000], re.I))
    article = page.og.get("type", "").lower() == "article" and not any(
        r["type"] in ("platform_page", "onpage_form", "form_document", "embedded_form") for r in routes)
    from urllib.parse import urlsplit as _us
    _path = _us(url).path.lower()
    permit_page = not on_platform_vendor_page and (bool(re.search(r"\b(?:licen[cs]es?\b|permits?\b|street\s+trading|trading\s+in\s+public\s+places|"
                                  r"food\s+business\s+registration|mobile\s+food\s+business|food\s+premises|"
                                  r"temporary\s+food|food\s+(?:stall|truck)s?\s+(?:licen[cs]es?|permits?)\b|"
                                  r"food\s+businesses\s+and\s+stalls|trading\s+permit)", title_blob, re.I))
                   or bool(re.search(r"food[-_]?licen[cs]es?|food[-_]business|food[-_]premises|temporary[-_]food|"
                                     r"food[-_]stall[-_]applications|street[-_]trading|trading[-_]permits?|properties[-_]and[-_]land|business[-_]and[-_]licensing|"
                                     r"/(?:licen[cs]es?|licensing|permits?)(?:/|$)", _path))) and not any(
        k in ev_types_title for k in ("festival", "market", "farmers_market", "christmas_market", "craft_fair",
                                      "agricultural_show", "food_festival", "fair_fete", "street_festival"))
    feats.update(livestock_terms=livestock, commercial_terms=commercial, article=article, permit_page=permit_page)
    feats.update(online=online, interest_list=interest_list)
    site_role = hint.get("site_role", "organiser")
    if site_role == "hub":
        label, reasons = "hub", ["aggregator_site"]
    elif re.search(r"(?:^|\.)eventeny\.com$", _us(url).hostname or "") and not _path.startswith("/events/"):
        label, reasons = "rejected", ["platform_marketing_page"]
    elif platform_here and not on_platform_vendor_page and re.search(
            r"(?:^|\.)(?:eventeny\.com|marketspread\.com|localstalls\.com|cluemart\.co\.nz|zapplication\.org|entrythingy\.com)$",
            _us(url).hostname or "") and not re.search(r"/(?:apply|application|book|forms?)/", _path):
        label, reasons = "rejected", ["platform_non_application_page"]
    elif site_role == "platform" and platform_here and not on_platform_vendor_page:
        label, reasons = "rejected", ["platform_non_application_page"]
    elif vendor == "none":
        label = "hub" if is_hub else "rejected"
        reasons.append("no_vendor_signal")
    elif procurement >= 2 and not (
            len(distinct_apply) >= 2 and re.search(r"\b(festival|fair|market|show|expo)s?\b", title_blob + " " + heads_blob, re.I)):
        label, reasons = "rejected", ["procurement_context"]
    elif (negs.get("sports_pitch", 0) >= 2 and commercial <= 2) or re.search(
            r"school[-_]lets|pitch[-_]charges|pitch[-_]hire|pitch[-_]bookings?|sports?[-_](?:facilities|pitches)", _path):
        label, reasons = "rejected", ["sports_pitch_context"]
    elif negs.get("fixed_concession", 0) >= 1 and not re.search(
            r"\b(?:festival|fair|market|show|expo|carnival)s?\b", title_blob, re.I):
        label, reasons = "rejected", ["fixed_site_concession_not_event"]
    elif negs.get("traveller_site", 0) >= 1 and commercial <= 2:
        label, reasons = "rejected", ["traveller_site_context"]
    elif negs.get("rates_concession", 0) >= 1 and commercial <= 1:
        label, reasons = "rejected", ["non_event_context"]
    elif (negs.get("jobs", 0) >= 2 or negs.get("real_estate", 0) >= 2) and vendor != "strong":
        label, reasons = "rejected", ["non_event_context"]
    elif online:
        label, reasons = "rejected", ["online_event"]
    elif on_platform_vendor_page and L.NON_VENDOR_ANCHOR.search(page.h1 or "") and not re.search(
            r"(vendor|exhibit|booth|stall|trader|concession|market|merchant|artisan|craft|food|artist|maker|retail|seller)",
            page.h1 or "", re.I):
        label, reasons = "rejected", ["non_vendor_application_type"]
    elif re.search(r"\b(?:payment|pay\s+online|invoice)\b", title_blob, re.I) and not re.search(r"applica", title_blob, re.I):
        label, reasons = "rejected", ["payment_form"]
    elif re.search(r"\bsponsor", title_blob, re.I) and not re.search(
            r"\b(?:vendor|exhibit|booth|stall|trader|concession|market|merchant|artisan|craft)", title_blob, re.I):
        label, reasons = "rejected", ["sponsorship_only"]
    elif livestock >= 4 and commercial <= 1:
        label, reasons = "rejected", ["competition_exhibitor_context"]
    elif article and not focus_url:
        label, reasons = "rejected", ["news_or_article"]
    elif vendor == "moderate" and not route and not focus:
        label, reasons = "rejected", ["insufficient_vendor_signal"]
    elif geo["country"] == "XX" and geo["confidence"] >= 0.3:
        label, reasons = "rejected", ["out_of_scope_geography"]
    elif is_hub and not on_platform_vendor_page and not any(
            r["type"] in ("onpage_form", "form_document", "embedded_form") for r in routes):
        label, reasons = "hub", ["listing_page"]
    elif vendor == "moderate" and not distinct_apply:
        label, reasons = "rejected", ["topical_mention_only"]
    elif currency in ("stale_years",) or (currency == "past_edition" and not recurrence):
        label = "uncertain" if vendor == "strong" else "rejected"
        reasons.append("stale_or_past_edition")
    else:
        missing = []
        if vendor != "strong":
            missing.append("weak_vendor_signal")
        if not route:
            missing.append("no_application_route")
        if not current_ok:
            missing.append(f"currency_{currency}")
        if app_status in ("closed",):
            missing.append("applications_closed")
        if app_status == "not_yet_open":
            missing.append("applications_not_yet_open")
        if not in_scope:
            missing.append("geography_unknown")
        if interest_list:
            missing.append("general_interest_list")
        if permit_page:
            missing.append("trading_permit_not_event")
        if re.search(r"\b(?:resource\s+cent(?:er|re)|exhibitor\s+(?:manual|services|kit|portal\s+login)|service\s+manual)\b",
                     title_blob, re.I):
            missing.append("exhibitor_services_page")
        if missing:
            label, reasons = "uncertain", missing
        else:
            label, reasons = "actionable", ["vendor+route+current+geo"]

    score = 0.0
    score += {"strong": 0.45, "moderate": 0.2, "none": 0.0}[vendor]
    score += 0.2 if strong_route else (0.1 if route else 0)
    score += {"future": 0.2, "future_site": 0.15, "recurring": 0.15, "current_year_mentioned": 0.1,
              "rolling": 0.05}.get(currency, 0)
    score += 0.1 * min(1.0, geo["confidence"] + (0.5 if in_scope else 0))
    score += 0.05 if app_status == "open" else (-0.15 if app_status == "closed" else 0)
    score -= 0.1 * min(3, sum(negs.values()))
    score = round(max(0.0, min(1.0, score)), 3)

    name = derive_name(page, evs, hint.get("entity_name"))
    organiser = None
    for ev in evs:
        org = ev.get("organizer")
        if isinstance(org, list):
            org = org[0] if org else None
        if isinstance(org, dict) and isinstance(org.get("name"), str):
            organiser = clean_name(org["name"])
            break
    if not organiser:
        m = ORGANISER_RE.search(body[:30_000])
        if m:
            organiser = m.group(1).strip()[:120]
    if not organiser and hint.get("organiser"):
        organiser = hint["organiser"]
    if not organiser:
        site = page.og.get("site_name")
        if site and name and site.strip().lower() != name.strip().lower() and not NAME_JUNK.match(site):
            organiser = site

    st = derive_state(label=label, vendor=("strong" if (vendor == "strong" or on_platform_vendor_page) else vendor),
                      body=body, title_blob=title_blob, today=today, start=start, end=end, date_src=date_src,
                      deadline=deadline, up_deadline=bool(up_dead), routes=routes, recurrence=recurrence,
                      currency=currency, closed_ms=[m for m in closed if m], opened_ms=opened, not_yet_ms=not_yet,
                      on_platform=on_platform_vendor_page, permit_page=permit_page, url=url)
    if st["state_evidence"]:
        evidence.insert(0, {"kind": "state", "text": f"{st['state']}: {st['state_evidence']}"[:400]})
    app_name = (page.h1 if on_platform_vendor_page else "") or ""
    for r in routes:
        r["category"] = route_category(f"{app_name} {r.get('anchor') or ''} {r.get('url') or ''}")
    extracted = {
        "relevance": st["relevance"],
        "state": st["state"],
        "state_evidence": st["state_evidence"],
        "open_strength": st["open_strength"],
        "opens_on": st["opens_on"],
        "recurrence_evidence": st["recurrence_evidence"],
        "missing": st["missing"],
        "application_name": app_name[:150] or None,
        "name": name,
        "organiser": organiser,
        "country": geo["country"] if in_scope else None,
        "region": geo.get("region"),
        "locality": geo.get("locality"),
        "venue": geo.get("venue"),
        "start_date": start.isoformat() if start else None,
        "end_date": end.isoformat() if end else None,
        "date_source": date_src,
        "deadline": deadline.isoformat() if deadline else None,
        "recurrence": recurrence,
        "application_status": app_status,
        "apply_url": apply_url,
        "routes": routes[:8],
        "event_types": ev_types[:5],
        "trader_types": tr_types,
        "fees": fees,
        "geo_why": geo.get("why"),
        "geo_basis": geo.get("basis"),
        "geo_hint_only": geo.get("hint_only"),
        "geo_conflicts": geo.get("conflicts") or [],
    }
    return {
        "label": label,
        "reasons": reasons,
        "score": score,
        "features": feats,
        "evidence": evidence[:10],
        "extracted": extracted,
        "is_hub": is_hub,
        "classifier_version": L.CLASSIFIER_VERSION,
    }
