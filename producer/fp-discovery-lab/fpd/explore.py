"""Exploration policy: given a processed page, decide which URLs are worth fetching next.

Principle: spend fetches where the *probability of reaching a trader page* is highest.
 - Organiser site: follow at most a few internal links whose anchor/URL looks like the trader
   section (budget-limited per site), plus sitemap URLs with vendor-ish paths.
 - Application routes on external platforms are followed (they confirm + enrich the record).
 - Hub/listing pages: every external event-looking link is a new organiser site to explore.
 - Rejected pages on sites with no vendor signal are dead ends: no further internal crawling
   beyond the homepage's best links.
"""
from __future__ import annotations

import re
from urllib.parse import urlsplit

from . import lexicon as L
from .parse import Page
from .classify import GENERIC_ANCHOR, SECTION_WORDS
from .urlutil import is_social, reg_domain

FOLLOW_PLATFORM_HOSTS = ("eventeny.com", "marketspread.com", "zapplication.org", "entrythingy.com",
                         "docs.google.com", "forms.gle", "jotform", "stallmanager.com.au", "localstalls.com",
                         "ozeemarkets.com.au", "sitetrak.com.au", "typeform.com", "cognitoforms.com",
                         "formstack.com", "wufoo.com", "123formbuilder.com", "managemymarket.com",
                         "marketwurks.com", "eventhub.net", "callforentry.org", "juriedartservices.com",
                         "showday.online", "showgroundsonline.com.au")


def link_score(text: str, url: str, context: str = "") -> float:
    path = urlsplit(url).path + "?" + (urlsplit(url).query or "")
    t = f"{text} {path}"
    if L.LINK_NEGATIVE.search(path) or L.LINK_NEGATIVE.search(text or ""):
        return 0.0
    s = 0.0
    if L.LINK_STRONG.search(t):
        s = 0.9
    elif L.LINK_MEDIUM.search(t):
        s = 0.45
    if re.search(r"\b(?:apply|application|book)\b", text or "", re.I) and re.search(L.ROLE, context or "", re.I):
        s = max(s, 0.85)
    return s


def plan_next(page: Page, row: dict, assessment: dict, site_role: str) -> list[dict]:
    """Return list of dicts for Frontier.add."""
    out: list[dict] = []
    gen = row["generator"]
    depth = row["depth"]
    here_rd = reg_domain(page.url)
    label = assessment["label"]
    feats = assessment["features"]
    vendor = feats.get("vendor_signal")

    # 1) Application routes → fetch them (corroboration + enrichment). Cheap and high-yield.
    for r in assessment["extracted"].get("routes", []):
        u = r.get("url")
        if not u or u.startswith("mailto:") or u == page.url:
            continue
        if r["type"] in ("platform_link", "embedded_form") and any(h in u for h in FOLLOW_PLATFORM_HOSTS):
            out.append(dict(url=u, purpose="follow", priority=0.95, depth=depth + 1, anchor=f"route:{r['type']}",
                            budgeted=False))
        elif r["type"] == "apply_link" and reg_domain(u) == here_rd:
            out.append(dict(url=u, purpose="follow", priority=0.9, depth=depth + 1, anchor=r.get("anchor")))

    # 2) Hubs → seed new organiser sites from outbound event links.
    if label == "hub" or row["purpose"] == "directory" or site_role in ("hub", "directory"):
        for ln in page.links:
            if ln.url.startswith("mailto:") or is_social(ln.url):
                continue
            rd = reg_domain(ln.url)
            if rd == here_rd:
                continue
            p = L.platform_of(ln.url)
            if p and p not in L.TICKETING_ONLY:
                out.append(dict(url=ln.url, purpose="follow", priority=0.9, depth=depth + 1, anchor=ln.text,
                                budgeted=False))
                continue
            home = f"{urlsplit(ln.url).scheme}://{urlsplit(ln.url).netloc}/"
            # Deep links on hubs often point straight at the trader page; keep both.
            sc = link_score(ln.text, ln.url, ln.context)
            if sc >= 0.45:
                out.append(dict(url=ln.url, purpose="candidate", priority=0.8, depth=0, anchor=ln.text))
            good_name = ln.text and not GENERIC_ANCHOR.match(ln.text.strip()) and not SECTION_WORDS.search(ln.text) \
                and 3 < len(ln.text) < 100
            out.append(dict(url=home, purpose="site_home", priority=0.55, depth=0, anchor=ln.text,
                            meta={"entity_name": ln.text.strip()[:120]} if good_name else None))
        # Directory pagination / detail pages (internal), limited depth.
        if row["purpose"] == "directory" and depth < 2:
            import json as _json
            follow = (_json.loads(row["meta"]) if row.get("meta") else {}).get("follow")
            for ln in page.links:
                if reg_domain(ln.url) != here_rd:
                    continue
                if follow and re.search(follow, ln.url):
                    out.append(dict(url=ln.url, purpose="directory", priority=0.62, depth=depth + 1, anchor=ln.text,
                                    budgeted=False))
                    continue
                if ln.in_nav:
                    continue
                if re.search(r"(?:page[=/]\d+|/p/\d+|\bnext\b|»)", f"{ln.url} {ln.text}", re.I) or \
                        urlsplit(ln.url).path.startswith(urlsplit(page.url).path.rstrip("/") + "/"):
                    out.append(dict(url=ln.url, purpose="directory", priority=0.6, depth=depth + 1, anchor=ln.text,
                                    budgeted=False))
        return out

    # 3) Organiser site exploration (internal links), only if promising.
    if row["purpose"] in ("site_home", "candidate", "follow") and depth < 3:
        if label == "actionable" and row["purpose"] != "site_home":
            return out  # found what we needed on this site; routes already queued
        scored = []
        for ln in page.links:
            if ln.url.startswith("mailto:") or reg_domain(ln.url) != here_rd:
                continue
            sc = link_score(ln.text, ln.url, ln.context)
            if sc <= 0:
                continue
            if row["purpose"] != "site_home" and sc < 0.85:
                continue  # beyond the homepage, only follow clearly trader-related links
            scored.append((sc, ln))
        scored.sort(key=lambda x: -x[0])
        limit = 4 if row["purpose"] == "site_home" else (2 if vendor != "none" else 1)
        for sc, ln in scored[:limit]:
            if sc < 0.45:
                break
            out.append(dict(url=ln.url, purpose="candidate", priority=round(0.5 + sc * 0.45, 3), depth=depth + 1,
                            anchor=ln.text))
    return out


SITEMAP_LOC = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>", re.I)


def sitemap_candidates(xml: str, base_rd: str, broad: bool = False) -> tuple[list[str], list[tuple[str, float]]]:
    """Return (child sitemaps, scored page URLs) from a sitemap/sitemap-index document."""
    locs = SITEMAP_LOC.findall(xml)
    children, pages = [], []
    is_index = "<sitemapindex" in xml[:2000].lower()
    for u in locs:
        u = u.replace("&amp;", "&")
        if reg_domain(u) != base_rd:
            continue
        if is_index or re.search(r"sitemap[^/]*\.xml", u, re.I):
            # Measured: sitemap descent had ~10x lower yield than homepage links, so only follow
            # sitemaps that list *pages* (not posts, products, events archives, media...).
            if (broad or re.search(r"(page|pages|main|general|static|sitemap-?0?1?\.xml$)", u, re.I)) and not re.search(
                    r"(image|video|product|author|tag|category|attachment|news|post|event|tribe|listing)", u, re.I):
                children.append(u)
            continue
        sc = link_score("", u)
        if sc >= 0.9:
            pages.append((u, sc))
    return children[:4 if broad else 2], pages[:12]
