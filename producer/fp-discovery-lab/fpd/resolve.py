"""Entity resolution: many pages/URLs → one real-world opportunity.

Matching cascade (first hit wins), always within the same country (or unknown):
  1. same_page   – this URL is already attached to an opportunity
  2. apply_url   – both point at the same specific application URL (form / platform page)
  3. name_exact  – identical normalised name key (+ compatible edition dates)
  4. name_fuzzy  – token-set similarity ≥ 90 with a corroborating attribute
                   (same organiser domain, overlapping dates, or same locality),
                   or ≥ 80 when on the same registrable domain
Edition guard: two records whose known start dates are >120 days apart are different editions
(e.g. 2026 vs 2027) unless one of them is a recurring market.
Merges never delete: every page is kept in opportunity_sources with its match method + score.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import time
import unicodedata

from rapidfuzz import fuzz

from .urlutil import reg_domain

STOP = {
    "the", "a", "an", "of", "and", "&", "at", "in", "on", "for", "annual", "yearly", "official", "presents",
    "vendor", "vendors", "application", "applications", "apply", "form", "stallholder", "stallholders",
    "trader", "traders", "exhibitor", "exhibitors", "registration", "info", "information", "booking",
    "bookings", "trade", "stand", "stands", "stall", "stalls", "pitch", "pitches", "retail", "food",
    "craft", "artisan", "artist", "artists", "commercial", "nonprofit", "non", "profit", "booth", "booths",
    "eventeny", "marketspread", "zapp", "home", "welcome", "to", "inc", "ltd", "llc", "page", "event",
    "events", "season", "opportunities", "opportunity", "call", "become", "wanted",
}
ORDINAL = re.compile(r"\b\d+(?:st|nd|rd|th)\b", re.I)
YEAR = re.compile(r"\b(?:19|20)\d{2}(?:[/-]\d{2,4})?\b")
GENERIC_APPLY = re.compile(r"^(?:mailto:)|/contact|/forms?/?$|docs\.google\.com/forms/?$", re.I)


def name_key(name: str | None) -> str:
    if not name:
        return ""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = YEAR.sub(" ", s)
    s = ORDINAL.sub(" ", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    toks = [t for t in s.split() if t not in STOP and len(t) > 1]
    return " ".join(toks)


def _d(s):
    try:
        return dt.date.fromisoformat(s) if s else None
    except ValueError:
        return None


def _is_recurring(x: dict) -> bool:
    et = x.get("event_types")
    if isinstance(et, str):
        try:
            et = json.loads(et)
        except ValueError:
            et = []
    return bool(x.get("recurrence")) or bool(set(et or []) & {"farmers_market", "market"})


def _same_edition(a: dict, b: dict) -> bool:
    da, db = _d(a.get("start_date")), _d(b.get("start_date"))
    if _is_recurring(a) or _is_recurring(b):
        # A recurring market is one standing opportunity, but dated instances published as separate
        # applications (e.g. "September market" vs "December market") are distinct opportunities.
        return not (da and db and abs((da - db).days) > 45)
    if da and db:
        return abs((da - db).days) <= 120
    return True


def _dates_close(a: dict, b: dict) -> bool:
    da, db = _d(a.get("start_date")), _d(b.get("start_date"))
    return bool(da and db and abs((da - db).days) <= 4)


def _is_platform(rd: str) -> bool:
    from .frontier import PLATFORM_DOMAINS
    return rd in PLATFORM_DOMAINS


STATUS_RANK = {"actionable": 3, "enquiry": 2.5, "watch": 2, "uncertain": 2, "not_relevant": 1, "rejected": 1}

GENERIC_TOKENS = {"christmas", "xmas", "holiday", "market", "markets", "farmers", "farmer", "craft", "crafts", "fair",
                  "fayre", "festival", "fest", "night", "food", "artisan", "artisans", "makers", "maker", "summer",
                  "winter", "spring", "autumn", "fall", "community", "vintage", "flea", "street", "twilight",
                  "sunday", "saturday", "monthly", "weekly", "show", "expo", "local", "outdoor", "indoor", "pop",
                  "up", "trunk", "treat", "halloween", "easter", "makers", "handmade", "gift", "village", "town",
                  "pride", "folk", "music", "arts", "art", "annual", "the", "and", "of", "at", "in", "on", "a",
                  "day", "days", "weekend", "carnival", "bazaar", "boutique", "fun", "family", "park", "beach",
                  "jazz", "blues", "wine", "beer", "brews", "car", "comic", "con", "anime", "renaissance", "faire"}
_NONDISTINCT = re.compile(r"^(?:\d+|\d+(?:st|nd|rd|th)|20\d\d)$")


def distinctive(key: str) -> set:
    return {t for t in key.split() if t not in GENERIC_TOKENS and not _NONDISTINCT.match(t)}


def is_generic(key: str) -> bool:
    toks = key.split()
    return len([t for t in toks if t not in GENERIC_TOKENS]) == 0


class Resolver:
    def __init__(self, conn, run_id: int):
        self.conn = conn
        self.run_id = run_id
        self.by_country: dict[str | None, list[dict]] = {}
        self.by_apply: dict[str, int] = {}
        self.by_url: dict[int, int] = {}
        self._load()

    def _load(self):
        rows = self.conn.execute("SELECT * FROM opportunities").fetchall()
        for r in rows:
            o = dict(r)
            o["domains"] = set()
            self.by_country.setdefault(o["country"], []).append(o)
            if o["apply_url"] and not GENERIC_APPLY.search(o["apply_url"]):
                self.by_apply[o["apply_url"]] = o["id"]
        idx = {o["id"]: o for lst in self.by_country.values() for o in lst}
        for r in self.conn.execute(
            "SELECT s.opportunity_id oid, s.url_id, u.reg_domain FROM opportunity_sources s JOIN urls u ON u.id=s.url_id"
        ):
            self.by_url[r["url_id"]] = r["oid"]
            if r["oid"] in idx:
                idx[r["oid"]]["domains"].add(r["reg_domain"])
        self.idx = idx

    def _match(self, url_id: int, url: str, ex: dict) -> tuple[int | None, str, float]:
        if url_id in self.by_url:
            return self.by_url[url_id], "same_page", 100.0
        au = ex.get("apply_url")
        if au and not GENERIC_APPLY.search(au) and au in self.by_apply:
            oid = self.by_apply[au]
            if _same_edition(self.idx[oid], ex):
                return oid, "apply_url", 100.0
        key = name_key(ex.get("name"))
        if not key:
            return None, "new", 0.0
        rd = reg_domain(url)
        pools = [self.by_country.get(ex.get("country"), [])]
        if ex.get("country") is None:
            pools = list(self.by_country.values())
        else:
            pools.append(self.by_country.get(None, []))
        best = (None, "new", 0.0)
        for pool in pools:
            for o in pool:
                ok = o["name_key"] or ""
                if not ok:
                    continue
                # Dated instances published separately (e.g. a monthly market's October and November application
                # pages on a platform) are distinct opportunities even when the names are identical.
                da_, db_ = _d(o.get("start_date")), _d(ex.get("start_date"))
                both_dated = bool(da_ and db_)
                if both_dated and abs((da_ - db_).days) > 3 and (_is_platform(rd) or any(_is_platform(d) for d in o["domains"])):
                    continue
                if ok == key:
                    if not _same_edition(o, ex):
                        continue
                    if is_generic(key):
                        # "Christmas Market" in two towns is two opportunities: require corroboration.
                        same_dom = rd in o["domains"]
                        loc_a, loc_b = (ex.get("locality") or "").lower(), (o.get("locality") or "").lower()
                        if not (same_dom or (loc_a and loc_a == loc_b) or _dates_close(o, ex)):
                            continue
                    return o["id"], "name_exact", 100.0
                if len(key.split()) < 2 and len(ok.split()) < 2:
                    continue
                s = fuzz.token_set_ratio(key, ok)
                if s < 80:
                    continue
                # "Dural Village Markets" vs "Haig Park Village Markets": the only shared words are generic.
                da, db = distinctive(key), distinctive(ok)
                if da and db and not (da & db):
                    continue
                same_dom = rd in o["domains"] and not _is_platform(rd)
                if both_dated and not _dates_close(o, ex):
                    continue  # similar names, different dates: different events or editions
                corrob = same_dom or _dates_close(o, ex) or (
                    ex.get("locality") and o.get("locality") and ex["locality"].lower() == o["locality"].lower())
                if ((s >= 90 and corrob) or (s >= 80 and same_dom)) and _same_edition(o, ex) and s > best[2]:
                    best = (o["id"], "name_fuzzy", float(s))
        # Same organiser site, same event date (or no date on one side): one opportunity, several pages.
        if best[0] is None and not _is_platform(rd):
            for o in self.by_country.get(ex.get("country"), []):
                if rd in o["domains"] and (_dates_close(o, ex) or not o.get("start_date") or not ex.get("start_date")):
                    s = fuzz.token_set_ratio(key, o["name_key"] or "")
                    if s >= 80 and s > best[2]:
                        best = (o["id"], "same_site", float(s))
        return best

    def upsert(self, url_id: int, url: str, assessment_id: int, a: dict) -> tuple[int | None, str]:
        """Attach an actionable/uncertain assessment to an opportunity. Returns (opp_id, match_method)."""
        if a["label"] not in ("actionable", "uncertain") or a["extracted"].get("relevance") == "not_relevant":
            return None, "skip"
        ex = a["extracted"]
        now = time.time()
        oid, method, mscore = self._match(url_id, url, ex)
        rd = reg_domain(url)
        if oid is None:
            cur = self.conn.execute(
                "INSERT INTO opportunities(name, name_key, organiser, country, region, locality, venue, start_date, "
                "end_date, recurrence, deadline, application_status, event_types, trader_types, fees, apply_url, "
                "primary_url, status, confidence, reasons, n_sources, n_domains, first_seen, last_checked, first_run) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,?,?,?)",
                (ex.get("name"), name_key(ex.get("name")), ex.get("organiser"), ex.get("country"), _s(ex.get("region")),
                 _s(ex.get("locality")), _s(ex.get("venue")), ex.get("start_date"), ex.get("end_date"),
                 ex.get("recurrence"), ex.get("deadline"), ex.get("application_status"),
                 json.dumps(ex.get("event_types") or []), json.dumps(ex.get("trader_types") or []), ex.get("fees"),
                 ex.get("apply_url"), url, a["label"], a["score"], json.dumps(a["reasons"]), now, now, self.run_id),
            )
            oid = cur.lastrowid
            o = dict(self.conn.execute("SELECT * FROM opportunities WHERE id=?", (oid,)).fetchone())
            o["domains"] = {rd}
            self.by_country.setdefault(o["country"], []).append(o)
            self.idx[oid] = o
            role = "primary"
            method = "new"
        else:
            o = self.idx[oid]
            o["domains"].add(rd)
            role = "corroborating" if method != "same_page" else "primary"
            upd = {}
            better = STATUS_RANK[a["label"]] > STATUS_RANK.get(o["status"], 0) or (
                a["label"] == o["status"] and a["score"] > (o["confidence"] or 0))
            for f in ("organiser", "region", "locality", "venue", "start_date", "end_date", "recurrence",
                      "deadline", "fees", "apply_url", "name"):
                v = ex.get(f)
                if v and (not o.get(f) or (better and f in ("start_date", "end_date", "deadline", "apply_url"))):
                    upd[f] = _s(v)
            if ex.get("country") and not o.get("country"):
                upd["country"] = ex["country"]
            if better:
                upd.update(status=a["label"], confidence=a["score"], reasons=json.dumps(a["reasons"]),
                           application_status=ex.get("application_status"), primary_url=url)
            if "name" in upd:
                upd["name_key"] = name_key(upd["name"])
            upd["last_checked"] = now
            sets = ", ".join(f"{k}=?" for k in upd)
            self.conn.execute(f"UPDATE opportunities SET {sets} WHERE id=?", (*upd.values(), oid))
            o.update(upd)
        self.conn.execute(
            "INSERT INTO opportunity_sources(opportunity_id, url_id, assessment_id, role, match_method, match_score, added_at) "
            "VALUES (?,?,?,?,?,?,?) ON CONFLICT(opportunity_id, url_id) DO UPDATE SET assessment_id=excluded.assessment_id",
            (oid, url_id, assessment_id, role, method, mscore, now),
        )
        self.by_url[url_id] = oid
        au = ex.get("apply_url")
        if au and not GENERIC_APPLY.search(au):
            self.by_apply.setdefault(au, oid)
        n = self.conn.execute(
            "SELECT COUNT(*), COUNT(DISTINCT u.reg_domain) FROM opportunity_sources s JOIN urls u ON u.id=s.url_id "
            "WHERE s.opportunity_id=?", (oid,)).fetchone()
        self.conn.execute("UPDATE opportunities SET n_sources=?, n_domains=? WHERE id=?", (n[0], n[1], oid))
        self.conn.execute("UPDATE assessments SET opportunity_id=? WHERE id=?", (oid, assessment_id))
        return oid, method


def _s(v):
    if v is None:
        return None
    if isinstance(v, (dict, list)):
        return json.dumps(v)
    return str(v)
