"""Geography inference from weak, independent signals (vote-based, explainable)."""
from __future__ import annotations

import re
from collections import defaultdict

from .countries import COUNTRIES, OUT_OF_SCOPE_TLDS, tld_country
from .urlutil import suffix

AMBIGUOUS_REGIONS = {
    "Victoria", "Washington", "Georgia", "Down", "Clare", "Highland", "Borders", "Durham", "Wellington",
    "Canterbury", "Hamilton", "Nelson", "Hastings", "Northland", "Southland", "West Coast", "Kent",
    "Cork", "Armagh", "London", "Manchester", "Birmingham", "Perth", "Richmond", "Cambridge",
    "Indiana", "Delaware", "Maine", "Tasman", "Auckland", "Waterford", "Kerry", "Meath", "Louth",
    "Lancashire", "Yorkshire", "Devon", "Dorset", "Essex", "Surrey", "Norfolk", "Suffolk",
    "Westmeath", "Sligo",
}

_region_res: dict[str, list[tuple[str, re.Pattern]]] = {}
for code, prof in COUNTRIES.items():
    _region_res[code] = [(r, re.compile(rf"\b{re.escape(r)}\b")) for r in prof.regions]

US_CITY_ST = re.compile(r"\b([A-Z][a-z][a-zA-Z.'-]*(?:\s[A-Z][a-z][a-zA-Z.'-]*){0,3}),\s+(" + "|".join(COUNTRIES["US"].region_abbrevs) + r")\b(?!\s*\d{4}\b)")
CA_CITY_PR = re.compile(r"\b([A-Z][a-zA-Z.'-]+(?:\s[A-Z][a-zA-Z.'-]+){0,3}),\s+(" + "|".join(COUNTRIES["CA"].region_abbrevs) + r")\b")
AU_TOWN_ST = re.compile(r"\b([A-Z][a-zA-Z.'-]+(?:\s[A-Z][a-zA-Z.'-]+){0,3}),?\s+(NSW|VIC|QLD|SA|TAS|ACT|NT|WA)\s+(\d{4})\b")

COUNTRY_NAMES = {
    "GB": [r"\bUnited Kingdom\b", r"\bU\.?K\.?\b", r"\bEngland\b", r"\bScotland\b", r"\bWales\b", r"\bGreat Britain\b"],
    "US": [r"\bUnited States\b", r"\bU\.S\.A?\.?\b", r"\bUSA\b"],
    "CA": [r"\bCanada\b"],
    "AU": [r"\bAustralia\b"],
    "NZ": [r"\bNew Zealand\b", r"\bAotearoa\b"],
    "IE": [r"\bIreland\b", r"\bÉire\b", r"\bRepublic of Ireland\b"],
}
COUNTRY_NAMES_RE = {k: [re.compile(p) for p in v] for k, v in COUNTRY_NAMES.items()}

ISO_ALIASES = {"UK": "GB", "GBR": "GB", "UNITED KINGDOM": "GB", "USA": "US", "UNITED STATES": "US",
               "CAN": "CA", "CANADA": "CA", "AUS": "AU", "AUSTRALIA": "AU", "NZL": "NZ",
               "NEW ZEALAND": "NZ", "IRL": "IE", "IRELAND": "IE", "ENGLAND": "GB", "SCOTLAND": "GB",
               "WALES": "GB"}


def _norm_country(v) -> str | None:
    if isinstance(v, dict):
        v = v.get("name") or v.get("@id")
    if not isinstance(v, str):
        return None
    v = v.strip().upper()
    if v in COUNTRIES:
        return v
    return ISO_ALIASES.get(v, v if len(v) == 2 else None)


# Phrases that name a country without saying anything about where an event is.
NON_LOCATION_PHRASES = re.compile(
    r"\((?:US|U\.S\.)\s*&\s*Canada\)|\bTime\s*\((?:US|U\.S\.)\s*(?:&|and)\s*Canada\)|"
    r"\b(?:ships?|shipping|deliver(?:y|ing)?)\s+(?:to|across|throughout)\s+(?:the\s+)?(?:US|USA|UK|Canada|Australia)\b",
    re.I)
HINT_REASONS = {"generator_hint", "directory_hint"}


def region_country(region: str | None) -> set:
    """Countries whose region list contains this exact region name/abbreviation (for conflict checks)."""
    if not region or not isinstance(region, str):
        return set()
    r = region.strip()
    out = set()
    for code, prof in COUNTRIES.items():
        if r in prof.regions or r.upper() in (prof.region_abbrevs or {}):
            out.add(code)
    return out


def infer_geo(url: str, text: str, jsonld_events: list[dict], hint: dict | None = None) -> dict:
    text = NON_LOCATION_PHRASES.sub(" ", text or "")
    votes: dict[str, float] = defaultdict(float)
    why: dict[str, list[str]] = defaultdict(list)
    region = locality = venue = None

    def vote(c, w, reason):
        votes[c] += w
        why[c].append(reason)

    hint = hint or {}
    region_by_country: dict[str, str] = {}
    # The discovery lane's country (seed query, directory) is a weak prior and a tie-breaker only: it is never
    # treated as proof of where the event is (see 'basis'/'hint_only' below).
    if hint.get("country"):
        vote(hint["country"], 1.5, "generator_hint")
    elif hint.get("country_weak"):
        vote(hint["country_weak"], 1.0, "directory_hint")
    if hint.get("region"):
        region = hint["region"]
    if hint.get("locality"):
        locality = hint["locality"]

    # Structured data
    for ev in jsonld_events[:3]:
        loc = ev.get("location")
        locs = loc if isinstance(loc, list) else [loc]
        for l in locs:
            if not isinstance(l, dict):
                continue
            venue = venue or (l.get("name") if isinstance(l.get("name"), str) else None)
            addr = l.get("address")
            if isinstance(addr, dict):
                c = _norm_country(addr.get("addressCountry"))
                if c:
                    vote(c, 5, "jsonld_country")
                region = region or addr.get("addressRegion")
                locality = locality or addr.get("addressLocality")
            elif isinstance(addr, str):
                text = addr + "\n" + text

    sfx = suffix(url)
    tc = tld_country(sfx)
    if tc:
        vote(tc, 3, f"tld:{sfx}")
    last = sfx.split(".")[-1] if sfx else ""
    if last in OUT_OF_SCOPE_TLDS:
        vote("XX", 3, f"tld:{sfx}")

    sample = text[:60_000]
    for code, prof in COUNTRIES.items():
        n = len(re.findall(prof.postcode_re, sample))
        if n:
            vote(code, min(3, 1.5 * n), f"postcode x{n}")
        for p in prof.phone_prefixes:
            if p != "+1" and p in sample:
                vote(code, 1.5, f"phone {p}")
        for cur in prof.currency_markers:
            if cur in sample:
                vote(code, 1.0 if cur in ("€", "£") else 1.5, f"currency {cur}")
        hits = set()
        for r, rx in _region_res[code]:
            if r in AMBIGUOUS_REGIONS:
                continue
            if rx.search(sample):
                hits.add(r)
        if hits:
            vote(code, min(2.5, 0.8 * len(hits)), f"regions {sorted(hits)[:3]}")
            if len(hits) == 1:
                region_by_country[code] = next(iter(hits))
        for rx in COUNTRY_NAMES_RE[code]:
            if rx.search(sample):
                vote(code, 1.0, f"name {rx.pattern}")
                break

    m = US_CITY_ST.findall(sample)
    if m:
        vote("US", min(3, 1.0 * len(m)), "city, ST")
        if not locality:
            locality, st = m[0]
            region = region or COUNTRIES["US"].region_abbrevs.get(st)
    m = CA_CITY_PR.findall(sample)
    if m:
        vote("CA", min(3, 1.0 * len(m)), "city, PR")
        if not locality and votes["CA"] >= votes.get("US", 0):
            locality, pr = m[0]
            region = region or COUNTRIES["CA"].region_abbrevs.get(pr)
    m = AU_TOWN_ST.findall(sample)
    if m:
        vote("AU", min(3, 1.5 * len(m)), "town STATE pcode")
        if not locality:
            locality, st, _ = m[0]
            region = region or COUNTRIES["AU"].region_abbrevs.get(st)

    if not votes:
        return {"country": None, "confidence": 0.0, "region": region, "locality": locality, "venue": venue, "why": {}}
    ranked = sorted(votes.items(), key=lambda kv: -kv[1])
    best, score = ranked[0]
    if not region:
        region = region_by_country.get(best)
    second = ranked[1][1] if len(ranked) > 1 else 0.0
    conf = min(1.0, (score - second) / 5 + (0.3 if score >= 3 else 0))
    if best not in COUNTRIES and best != "XX":
        best = "XX"  # out of scope country from JSON-LD
    if isinstance(region, dict):
        region = region.get("name")
    if isinstance(locality, dict):
        locality = locality.get("name")
    # Basis: which evidence (other than the discovery hint) supports the chosen country.
    basis = [r for r in why.get(best, []) if r not in HINT_REASONS]
    conflicts = []
    rc = region_country(region)
    if rc and best in COUNTRIES and best not in rc:
        conflicts.append(f"region '{region}' belongs to {sorted(rc)} not {best}")
    hint_c = hint.get("country") or hint.get("country_weak")
    if hint_c and best not in (hint_c, "XX") and votes.get(best, 0) > 0:
        conflicts.append(f"discovery hint {hint_c} disagrees with evidence {best}")
    return {"country": best, "confidence": round(conf, 2), "region": region, "locality": locality,
            "venue": venue, "why": {k: v for k, v in why.items()}, "votes": dict(votes),
            "basis": basis, "hint_only": not basis, "conflicts": conflicts}
