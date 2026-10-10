"""Stable, deterministic opportunity identities for the integration export (algorithm `fdx1`).

An exported `opportunity_id` must survive re-runs, re-crawls, internal database rebuilds (which renumber
internal rows) and changes of corroborating source URL, while keeping genuinely different opportunities
apart (annual editions, separately bookable dates of a recurring market, unrelated events).

Two layers:

1. NATURAL KEY (pure function of the record):

       <country>|<programme key>|<edition key>

   programme key, in order of preference
     eventeny:event:<event id>          parent event id from the vendor page ('/events/<slug>-<id>/')
     eventeny:vendor:<lowest vendor id> only when the event id is not visible
     localstalls:<cc/event/town/slug>   the listing path (one standing listing per market)
     cluemart:<application slug>
     ukcraftfairs:<listing id>          each UKCraftFairs listing is one dated fair
     site:<registrable domain>:<normalised event name>   organiser sites (years, ordinals and filler such
                                        as 'vendor application' removed; see fpd.resolve.name_key)
   edition key
     Eventeny            YYYY-MM of the event start (an Eventeny event id is normally one edition; the
                         month separates the rare event accounts that host several dated events)
     LocalStalls/ClueMart 'standing'  (a standing application for a recurring market)
     UKCraftFairs        ''  (the listing id is already one dated fair)
     organiser sites     'standing' for rolling/regular markets, else the event year, else 'undated'

   opportunity_id = 'fdx1_' + first 20 hex chars of sha256(natural key)

2. ANCHOR REGISTRY (persistence of identity). Every exported id is stored with its anchors: canonical
   source and application URLs (tracking parameters removed, generic URLs excluded) and platform
   native ids. On later runs an opportunity is first resolved through its anchors to an existing id,
   provided the edition is compatible (same 'standing'/undated programme, or event starts within
   45 days for platform listings / 120 days for organiser sites). Only if no anchor resolves is a new id
   minted from the natural key. New anchors are added to the id they resolved to, so swapping one
   corroborating URL for another does not change identity, and a reschedule (date moves) keeps its id.

Determinism: the natural key is a pure function and records are processed in natural-key order, so a run
against an empty registry produces the same ids for the same data; with the registry, ids are stable
even when names, dates or source URLs drift.
"""
from __future__ import annotations

import hashlib
import re
from urllib.parse import urlsplit

from ..resolve import name_key
from ..urlutil import canonicalize, reg_domain

ALGORITHM = "fdx1"
PREFIX = "fdx1_"

SCHEMA = """
CREATE TABLE IF NOT EXISTS integration_identity (
    opportunity_id TEXT PRIMARY KEY,
    natural_key TEXT NOT NULL,
    edition_key TEXT,
    event_start TEXT,
    platform TEXT,
    country TEXT,
    minted_at TEXT,
    last_resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS integration_anchor (
    anchor TEXT NOT NULL,
    opportunity_id TEXT NOT NULL,
    added_at TEXT,
    PRIMARY KEY (anchor, opportunity_id)
);
CREATE INDEX IF NOT EXISTS ix_anchor_opp ON integration_anchor(opportunity_id);
"""

# Hosts where a bare root or generic path identifies nothing.
SHARED_HOSTS = {
    "eventeny.com", "jotform.com", "google.com", "forms.gle", "facebook.com", "fb.com", "instagram.com",
    "vendorsmap.com", "eventbrite.com", "eventbrite.co.uk", "marketspread.com", "localstalls.com", "cluemart.co.nz",
    "ukcraftfairs.com", "zapplication.org", "entrythingy.com", "wufoo.com", "typeform.com", "cognitoforms.com",
    "formstack.com", "airtable.com", "microsoft.com", "office.com", "linktr.ee", "squarespace.com", "wixsite.com",
}
GENERIC_PATH = re.compile(r"^/(?:|index\.\w+|home|contact(?:-us)?|forms?|events?|vendors?|apply|application)/?$", re.I)

EVENTENY_VENDOR = re.compile(r"eventeny\.com/events/vendor/\?id=(\d+)")
LOCALSTALLS = re.compile(r"localstalls\.com/((?:au|nz|uk|us)/event/[^/?#]+/[^/?#]+)")
CLUEMART = re.compile(r"cluemart\.co\.nz/application/([a-z0-9\-]+)")
UKCF = re.compile(r"ukcraftfairs\.com/craft-events/(\d+)")
MARKETSPREAD = re.compile(r"marketspread\.com/market/(\d+)/")


def canonical_anchor_url(u: str | None) -> str | None:
    """Canonical URL usable as an identity anchor, or None for URLs that identify nothing specific."""
    if not u or not isinstance(u, str) or u.startswith("mailto:"):
        return None
    c = canonicalize(u.strip())
    if not c:
        return None
    sp = urlsplit(c)
    rd = reg_domain(c)
    if not sp.query and GENERIC_PATH.match(sp.path or "/") and (rd in SHARED_HOSTS or (sp.path or "/") in ("", "/")):
        return None
    if rd in ("google.com",) and "/forms/" in sp.path and sp.path.rstrip("/").endswith("/forms"):
        return None
    return c


def platform_ids(urls: list[str], extracted_ids: list[dict] | None = None) -> dict:
    """Platform native identifiers found in the record's URLs and in adapter-extracted page data."""
    ids: dict[str, set] = {}
    for u in urls:
        for key, rx, conv in (("eventeny_vendor", EVENTENY_VENDOR, int), ("localstalls_event", LOCALSTALLS, str),
                              ("cluemart_application", CLUEMART, str), ("ukcraftfairs_event", UKCF, int),
                              ("marketspread_market", MARKETSPREAD, int)):
            m = rx.search(u or "")
            if m:
                ids.setdefault(key, set()).add(conv(m.group(1)))
    numeric = {"eventeny_vendor", "eventeny_event", "ukcraftfairs_event", "marketspread_market"}
    for d in extracted_ids or []:
        for k, v in (d or {}).items():
            try:
                v = int(v) if k in numeric else str(v)
            except (TypeError, ValueError):
                continue
            ids.setdefault(k, set()).add(v)
    return {k: sorted(v) for k, v in ids.items()}


def natural_key(country: str | None, pids: dict, primary_url: str | None, name: str | None,
                event_start: str | None, standing: bool) -> tuple[str, str, str]:
    """Return (natural_key, platform, edition_key). Pure and deterministic."""
    cc = (country or "XX").upper()
    if pids.get("eventeny_event"):
        prog, plat, ed = f"eventeny:event:{min(pids['eventeny_event'])}", "eventeny", (event_start or "")[:7] or "undated"
    elif pids.get("eventeny_vendor"):
        prog, plat, ed = f"eventeny:vendor:{min(pids['eventeny_vendor'])}", "eventeny", ""
    elif pids.get("localstalls_event"):
        prog, plat, ed = f"localstalls:{min(pids['localstalls_event'])}", "localstalls", "standing"
    elif pids.get("cluemart_application"):
        prog, plat, ed = f"cluemart:{min(pids['cluemart_application'])}", "cluemart", "standing"
    elif pids.get("ukcraftfairs_event"):
        prog, plat, ed = f"ukcraftfairs:{min(pids['ukcraftfairs_event'])}", "ukcraftfairs", ""
    elif pids.get("marketspread_market"):
        prog, plat = f"marketspread:{min(pids['marketspread_market'])}", "marketspread"
        ed = "standing" if standing else ((event_start or "")[:4] or "undated")
    else:
        dom = reg_domain(primary_url) if primary_url else "unknown"
        nk = name_key(name) or "unnamed"
        plat = None
        prog = f"site:{dom}:{nk}"
        ed = "standing" if standing else ((event_start or "")[:4] or "undated")
    return f"{cc}|{prog}|{ed}", plat or "organiser_site", ed


def mint(nkey: str) -> str:
    return PREFIX + hashlib.sha256(nkey.encode("utf-8")).hexdigest()[:20]


# Programme-level platform ids (one Eventeny event can host several dated instances) are part of the natural
# key but are not instance anchors.
PROGRAMME_LEVEL_IDS = {"eventeny_event"}


def anchors_for(pids: dict, urls: list[str]) -> list[str]:
    out = set()
    for k, vals in pids.items():
        if k in PROGRAMME_LEVEL_IDS:
            continue
        for v in vals:
            out.add(f"pid:{k}:{v}")
    for u in urls:
        a = canonical_anchor_url(u)
        if a:
            out.add(f"url:{a}")
    return sorted(out)


def _days(a: str | None, b: str | None):
    import datetime as dt
    try:
        return abs((dt.date.fromisoformat(a[:10]) - dt.date.fromisoformat(b[:10])).days)
    except (TypeError, ValueError):
        return None


def edition_compatible(reg_edition: str | None, reg_start: str | None, edition: str, start: str | None,
                       platform: str) -> bool:
    if reg_edition in (None, "", "standing", "undated") or edition in ("", "standing", "undated"):
        return True
    d = _days(reg_start, start)
    if d is None:
        return reg_edition == edition
    return d <= (45 if platform == "eventeny" else 120)


class Registry:
    """Anchor registry over the engine DB (tables integration_identity / integration_anchor)."""

    def __init__(self, conn):
        self.conn = conn
        conn.executescript(SCHEMA)
        self.by_anchor: dict[str, set] = {}
        for a, oid in conn.execute("SELECT anchor, opportunity_id FROM integration_anchor"):
            self.by_anchor.setdefault(a, set()).add(oid)
        self.meta = {r[0]: {"natural_key": r[1], "edition_key": r[2], "event_start": r[3], "platform": r[4],
                            "minted_at": r[5]}
                     for r in conn.execute("SELECT opportunity_id, natural_key, edition_key, event_start, platform, "
                                           "minted_at FROM integration_identity")}
        self.pending_ids: dict[str, dict] = {}
        self.pending_anchors: set[tuple[str, str]] = set()

    def resolve(self, nkey: str, platform: str, edition: str, start: str | None, anchors: list[str],
                now: str) -> tuple[str, str]:
        """Return (opportunity_id, how) where how is 'anchor' | 'natural_key' | 'minted'."""
        exact = mint(nkey)
        if exact in self.meta or exact in self.pending_ids:
            # The exact natural key is already registered: that identity wins over anchor similarity.
            for a in anchors:
                if exact not in self.by_anchor.get(a, set()):
                    self.by_anchor.setdefault(a, set()).add(exact)
                    self.pending_anchors.add((a, exact))
            return exact, "natural_key"
        votes: dict[str, int] = {}
        strong: dict[str, bool] = {}
        prog = nkey.split("|")[1] if "|" in nkey else nkey
        for a in anchors:
            for oid in self.by_anchor.get(a, ()):
                m = self.meta.get(oid) or self.pending_ids.get(oid)
                if m and edition_compatible(m.get("edition_key"), m.get("event_start"), edition, start, platform):
                    votes[oid] = votes.get(oid, 0) + 1
                    same_prog = (m.get("natural_key") or "").split("|")[1:2] == [prog]
                    strong[oid] = strong.get(oid, False) or a.startswith("pid:") or same_prog
        # A single shared organiser URL is not enough on its own when the programme differs (one page can
        # describe several events): require a platform id, the same programme, or two shared anchors.
        votes = {o: v for o, v in votes.items() if strong.get(o) or v >= 2}
        if votes:
            oid = sorted(votes, key=lambda o: (-votes[o], (self.meta.get(o) or self.pending_ids.get(o) or {}).get(
                "minted_at") or "", o))[0]
            how = "anchor"
        else:
            oid = mint(nkey)
            how = "natural_key" if (oid in self.meta or oid in self.pending_ids) else "minted"
            if how == "minted":
                self.pending_ids[oid] = {"natural_key": nkey, "edition_key": edition, "event_start": start,
                                         "platform": platform, "minted_at": now}
        for a in anchors:
            if oid not in self.by_anchor.get(a, set()):
                self.by_anchor.setdefault(a, set()).add(oid)
                self.pending_anchors.add((a, oid))
        return oid, how

    def commit(self, now: str) -> None:
        for oid, m in self.pending_ids.items():
            self.conn.execute(
                "INSERT OR IGNORE INTO integration_identity(opportunity_id,natural_key,edition_key,event_start,platform,"
                "country,minted_at,last_resolved_at) VALUES (?,?,?,?,?,?,?,?)",
                (oid, m["natural_key"], m["edition_key"], m["event_start"], m["platform"], m["natural_key"][:2],
                 m["minted_at"], now))
        self.conn.executemany("INSERT OR IGNORE INTO integration_anchor(anchor,opportunity_id,added_at) VALUES (?,?,?)",
                              [(a, o, now) for a, o in sorted(self.pending_anchors)])
        self.meta.update(self.pending_ids)
        self.pending_ids, self.pending_anchors = {}, set()


def route_id(url: str | None, category: str | None) -> str | None:
    a = canonicalize(url) if url else None
    if not a:
        return None
    return "rt_" + hashlib.sha256(f"{a}|{category or ''}".encode()).hexdigest()[:16]
