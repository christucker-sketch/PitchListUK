"""Build contract records from the engine's internal database and apply the export-readiness gate.

The consumer never sees internal row ids, table layouts or crawler state: everything it needs is in the
record (see schema.py and integration_export/README.md).
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
from collections import defaultdict
from urllib.parse import urlsplit

from .. import __version__
from ..countries import AU_STATES, CA_PROVINCES, COUNTRIES, US_STATES
from ..lexicon import CLASSIFIER_VERSION
from ..urlutil import reg_domain
from . import identity as idn
from .schema import SCHEMA_VERSION, USABLE_STATES

SUPPORTED = {"GB", "US", "CA", "AU", "NZ", "IE"}
WATCH_STATES = {"UPCOMING_NOT_OPEN", "CLOSED_CURRENT_CYCLE", "UNKNOWN", "HISTORICAL"}
ENGINE = "fp-discovery-lab"

# Audited precision of each acquisition lane's actionable output (RESULTS_R2.md, comparison/COMPARISON_RESULTS.md).
LANE_PRECISION = {"eventeny": 0.96, "localstalls": 1.0, "cluemart": 1.0, "ukcraftfairs": 1.0}
ORGANISER_PRECISION = 0.84

_REV = {
    "US": {v.lower(): k for k, v in US_STATES.items()},
    "CA": {v.lower(): k for k, v in CA_PROVINCES.items()},
    "AU": {v.lower(): k for k, v in AU_STATES.items()},
}

JUNK_NAME = re.compile(
    r"^(?:google\s+(?:docs|forms?)|untitled(?:\s+form)?|home(?:page)?|welcome|vendors?|vendor\s+(?:application|info\w*)|"
    r"apply(?:\s+now)?|application\s+form|events?|markets?|participate|get\s+involved|form|forms|what'?s\s+on|"
    r"[\w.-]+\.(?:com|org|net|co\.uk|org\.uk|ca|com\.au|co\.nz|ie)|"
    r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d.*)$", re.I)
COUNCIL_ONLY = re.compile(r"^(?:[\w'’\- ]+ )?(?:city|county|district|borough|town|shire|regional|metropolitan)?\s*"
                          r"(?:council|shire|municipality)$", re.I)
# "City of Kingston", "Shire of Kondinin", "Town of X", "Borough of Y": an authority's name, not an event.
AUTHORITY_ONLY = re.compile(r"^(?i:the\s+)?(?i:city|shire|town|borough|county|district|municipality|village|township)\s+of\s+"
                            r"[A-Z][\w'’.\-]*(?:\s+[A-Z][\w'’.\-]*){0,3}$")
_EVENTISH = re.compile(r"\b(?:festival|fest|markets?|fair|fayre|show|parade|hunt|trees|christmas|carnival|expo|events?|"
                       r"bazaar|celebration|night|day|week|database|vendors?)\b", re.I)
# Platform names are not organisers (UKCraftFairs/ClueMart listings name the platform where the organiser is hidden).
PLATFORM_ORGANISERS = {"ukcraftfairs.com", "ukcraftfairs", "cluemart", "localstalls", "eventeny", "marketspread",
                       "entrythingy", "entry thingy"}
# Listing-frequency labels that platforms print right after the organiser name ("Le Makete One-off / Irregular").
ORG_SUFFIX = re.compile(r"\s+(?:one-off(?:\s*/\s*irregular)?|irregular|weekly|fortnightly|monthly|bi-?monthly|annually|"
                        r"quarterly|seasonal)\b.*$", re.I)
# Lanes switched off after the 9 Oct 2026 audit (closed, past or out-of-market art calls presented as open).
SUSPENDED_LANES = {"entrythingy": "art calls: 0/2 correct in the 9 Oct 2026 audit"}


def clean_organiser(org):
    if not isinstance(org, str):
        return org
    o = re.sub(r"\s+", " ", org).strip()
    if o.lower() in PLATFORM_ORGANISERS:
        return None
    o = ORG_SUFFIX.sub("", o).strip()
    o = re.sub(r"\s+Open$", "", o).strip()
    return o or None


def iso_ts(x) -> str | None:
    if x is None:
        return None
    try:
        return dt.datetime.fromtimestamp(float(x), dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError, OSError):
        return None


def iso_date(x) -> str | None:
    if not x or not isinstance(x, str):
        return None
    return x[:10] if re.match(r"^\d{4}-\d{2}-\d{2}", x) else None


def source_of(lane: str | None, url: str | None) -> tuple[str, str | None, str]:
    """(discovery_source, detail, discovery_strategy) from the internal acquisition lane."""
    lane = lane or ""
    if lane.startswith("platform:"):
        p = lane.split(":", 1)[1]
        if p.startswith("marketspread"):
            return "marketspread", p, "platform_enumeration"
        if p in ("eventeny", "localstalls", "cluemart", "entrythingy"):
            return p, None, "platform_enumeration"
        if p == "ukcraftfairs":
            return "ukcraftfairs", None, "platform_id_window"
        return "other", p, "platform_enumeration"
    if lane.startswith("directory:"):
        return "directory", lane.split(":", 1)[1], "directory_follow"
    if lane == "wikidata":
        return "wikidata_seed", None, "entity_seed_crawl"
    if lane == "wikidata_councils":
        return "council", None, "council_seed_crawl"
    if lane.startswith("search"):
        return "search", lane, "search_api"
    if lane.startswith("osm"):
        return "osm", lane, "map_data"
    return "other", lane or None, "other"


PLATFORM_HOSTS = {"eventeny.com": "eventeny", "localstalls.com": "localstalls", "cluemart.co.nz": "cluemart",
                  "ukcraftfairs.com": "ukcraftfairs", "marketspread.com": "marketspread",
                  "entrythingy.com": "entrythingy", "zapplication.org": "zapp"}
FORM_HOSTS = {"google.com", "forms.gle", "jotform.com", "wufoo.com", "typeform.com", "cognitoforms.com",
              "formstack.com", "airtable.com", "microsoft.com", "office.com", "123formbuilder.com", "paperform.co",
              "smartsheet.com", "snapforms.com.au", "openforms.com"}
AGG_HOSTS = {"vendorsmap.com", "allevents.in", "fairsandfestivals.net", "festivalnet.com"}


def source_type(url: str) -> tuple[str, str | None]:
    rd = reg_domain(url)
    if rd in PLATFORM_HOSTS:
        return "platform_listing", PLATFORM_HOSTS[rd]
    if rd in FORM_HOSTS:
        return "form", None
    if rd in AGG_HOSTS:
        return "aggregator", None
    host = (urlsplit(url).hostname or "")
    if re.search(r"\.gov\.uk$|\.gov\.au$|\.govt\.nz$|\.gov$|\.gc\.ca$|council|\.gov\.ie$", host):
        return "council_site", None
    return "organiser_site", None


def region_code(cc: str | None, region: str | None) -> str | None:
    if not cc or not region or cc not in _REV:
        return None
    r = region.strip()
    abbrevs = {"US": US_STATES, "CA": CA_PROVINCES, "AU": AU_STATES}[cc]
    if r.upper() in abbrevs:
        return f"{cc}-{r.upper()}"
    code = _REV[cc].get(r.lower())
    return f"{cc}-{code}" if code else None


def clean_url(u):
    """Percent-encode characters that are not valid in a URL (e.g. spaces in file paths); None if not http(s)."""
    from urllib.parse import quote
    if not u or not isinstance(u, str) or not re.match(r"^https?://", u.strip()):
        return None
    return quote(u.strip(), safe=":/?#[]@!$&'()*+,;=%~")


def _clip(s, n=300):
    if not s:
        return None
    s = re.sub(r"\s+", " ", str(s)).strip()
    return s[:n]


def _sha(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()


MATERIAL_FIELDS = ["event_name", "organiser", "country_code", "region", "locality", "venue", "opportunity_type",
                   "recurring", "event_start", "event_end", "application_deadline", "applications_open_on",
                   "source_url", "application_url", "vendor_categories"]


def material_view(rec: dict) -> dict:
    m = {k: rec.get(k) for k in MATERIAL_FIELDS}
    m["routes"] = sorted((r["url"], r.get("category") or "") for r in rec.get("application_routes") or [])
    return m


def load_suppressions(conn) -> dict:
    """Known false positives from human audits, keyed by canonical URL."""
    out = {}
    for sql, why in (("SELECT url FROM audit_r2 WHERE label='not_relevant'", "audit_r2:not_relevant"),
                     ("SELECT o.primary_url FROM cmp_audit a JOIN opportunities o ON o.id=a.claude_id "
                      "WHERE a.kind='claude_only' AND a.label='false_positive'", "comparison_audit:false_positive")):
        try:
            for (u,) in conn.execute(sql):
                a = idn.canonical_anchor_url(u)
                if a:
                    out[a] = why
        except Exception:  # noqa: BLE001  (audit tables are optional)
            pass
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS integration_suppressions(url TEXT PRIMARY KEY, reason TEXT, added_at TEXT)")
        for u, why in conn.execute("SELECT url, reason FROM integration_suppressions"):
            a = idn.canonical_anchor_url(u)
            if a:
                out[a] = why
    except Exception:  # noqa: BLE001
        pass
    return out


def build_records(conn, today: dt.date, registry: idn.Registry, now_iso: str) -> tuple[list[dict], list[str]]:
    """Return (records, warnings) for every relevant opportunity, each with channel/readiness decided.
    Records are resolved to stable ids; records sharing an id are merged."""
    conn.row_factory = __import__("sqlite3").Row
    warnings: list[str] = []
    srcs = defaultdict(list)
    for r in conn.execute(
            "SELECT s.opportunity_id oid, s.role, u.url, u.generator, u.created_at, u.fetched_at, u.http_status, "
            "u.content_hash, u.state ustate, a.classifier_version, a.extracted, a.evidence, a.score "
            "FROM opportunity_sources s JOIN urls u ON u.id=s.url_id LEFT JOIN assessments a ON a.id=s.assessment_id"):
        srcs[r["oid"]].append(dict(r))
    routes = defaultdict(list)
    for r in conn.execute("SELECT opportunity_id, url, route_type, platform, category, anchor FROM routes"):
        routes[r[0]].append({"url": r[1], "route_type": r[2], "platform": r[3], "category": r[4], "label": r[5]})
    suppress = load_suppressions(conn)
    opps = [dict(o) for o in conn.execute("SELECT * FROM opportunities WHERE relevance='relevant'")]
    prepared = []
    for o in opps:
        ss = srcs.get(o["id"], [])
        exs = [json.loads(s["extracted"]) if s.get("extracted") else {} for s in ss]
        urls = [s["url"] for s in ss] + [r["url"] for r in routes.get(o["id"], [])] + \
               [u for u in (o["primary_url"], o["apply_url"]) if u]
        pids = idn.platform_ids(urls, [e.get("platform_ids") for e in exs if e.get("platform_ids")])
        standing = o["state"] == "ROLLING" or "regular:" in (o["recurrence_evidence"] or "")
        nkey, platform, edition = idn.natural_key(o["country"], pids, o["primary_url"], o["name"], o["start_date"],
                                                  standing)
        prepared.append((nkey, o, ss, exs, urls, pids, platform, edition))
    prepared.sort(key=lambda x: (x[0], x[1]["primary_url"] or ""))
    by_id: dict[str, dict] = {}
    for nkey, o, ss, exs, urls, pids, platform, edition in prepared:
        anchors = idn.anchors_for(pids, urls)
        oid, how = registry.resolve(nkey, platform, edition, o["start_date"], anchors, now_iso)
        rec = _record(o, ss, exs, routes.get(o["id"], []), pids, nkey, oid, how, anchors, today, suppress)
        if oid in by_id:
            warnings.append(f"merged duplicate identity {oid}: '{by_id[oid]['event_name']}' + '{rec['event_name']}'")
            by_id[oid] = _merge(by_id[oid], rec)
        else:
            by_id[oid] = rec
    return list(by_id.values()), warnings


STATE_RANK = {"OPEN_NOW": 7, "ROLLING": 6, "ENQUIRY_AVAILABLE": 5, "UPCOMING_NOT_OPEN": 4, "CLOSED_CURRENT_CYCLE": 3,
              "UNKNOWN": 2, "HISTORICAL": 1, "NOT_RELEVANT": 0}


def _merge(a: dict, b: dict) -> dict:
    keep, other = (a, b) if STATE_RANK[a["application_state"]] >= STATE_RANK[b["application_state"]] else (b, a)
    seen = {r["route_id"] for r in keep["application_routes"]}
    keep["application_routes"] += [r for r in other["application_routes"] if r["route_id"] not in seen]
    keep["application_routes"].sort(key=lambda r: r["route_id"])
    su = {s["url"] for s in keep["provenance"]["sources"]}
    keep["provenance"]["sources"] += [s for s in other["provenance"]["sources"] if s["url"] not in su]
    keep["provenance"]["sources"] = keep["provenance"]["sources"][:12]
    keep["identity"]["anchors"] = sorted(set(keep["identity"]["anchors"]) | set(other["identity"]["anchors"]))[:40]
    keep["vendor_categories"] = sorted(set(keep["vendor_categories"]) | set(other["vendor_categories"]))
    keep["first_seen"] = min(x for x in (a["first_seen"], b["first_seen"]) if x) if (a["first_seen"] or b["first_seen"]) else None
    keep["fingerprint"]["material"] = _sha(material_view(keep))
    return keep


def _record(o, ss, exs, routes, pids, nkey, oid, how, anchors, today, suppress) -> dict:
    cc = o["country"] if o["country"] in SUPPORTED else None
    lane = o["lane"]
    dsrc, ddetail, strat = source_of(lane, o["primary_url"])
    primary = o["primary_url"] or (ss[0]["url"] if ss else None)
    stype, plat = source_type(primary) if primary else ("other", None)
    prim = next((s for s in ss if s["url"] == o["state_source_url"]), None) or \
        next((s for s in ss if s.get("role") == "primary"), None) or (ss[0] if ss else {})
    pex = json.loads(prim["extracted"]) if prim.get("extracted") else {}
    pev = json.loads(prim["evidence"]) if prim.get("evidence") else []
    rel_q = [_clip(e["text"]) for e in pev if e.get("kind") == "vendor_language"][:2]
    date_q = [_clip(e["text"]) for e in pev if e.get("kind") in ("date", "deadline")][:2]
    state_q = _clip(o["state_evidence"], 400)
    # geography basis: any source with evidence-based geography for the chosen country
    basis, hint_only, conflicts = set(), True, []
    for e in exs:
        if e.get("country") and e.get("country") != o["country"]:
            continue
        b = e.get("geo_basis")
        if b:
            basis.update(b if isinstance(b, list) else [b])
            hint_only = False
        elif e.get("geo_why") and o["country"] in (e.get("geo_why") or {}):
            reasons = [r for r in e["geo_why"][o["country"]] if r not in ("generator_hint", "directory_hint")]
            if reasons:
                basis.update(reasons)
                hint_only = False
        conflicts += [c for c in (e.get("geo_conflicts") or [])]
    if dsrc in ("localstalls", "ukcraftfairs", "cluemart") and (pids.get("localstalls_event") or
                                                                pids.get("ukcraftfairs_event") or pids.get("cluemart_application")):
        basis.add(f"platform_country:{dsrc}")  # country-scoped platform (path /au|nz|uk|us/, UK-only, NZ-only site)
        hint_only = False
    try:
        types = json.loads(o["event_types"] or "[]")
    except ValueError:
        types = []
    try:
        cats = sorted(set(json.loads(o["route_categories"] or "[]")))
    except ValueError:
        cats = []
    rts = []
    seen = set()
    for r in sorted(routes, key=lambda r: (r["url"] or "", r["category"] or "")):
        if not r["url"] or not re.match(r"^https?://", r["url"]):
            continue
        rid = idn.route_id(r["url"], r["category"])
        if not rid or rid in seen:
            continue
        seen.add(rid)
        rts.append({"route_id": rid, "url": clean_url(r["url"]), "route_type": r["route_type"] or "unknown",
                    "platform": r["platform"], "category": r["category"], "label": _clip(r["label"], 120)})
    apply_url = clean_url(o["apply_url"])
    region = o["region"] if isinstance(o["region"], str) else None
    loc_parts = [x for x in (o["venue"], o["locality"], region) if x]
    recurring = True if (o["recurrence_evidence"] or o["recurrence"]) else None
    fetched = [s for s in ss if s.get("fetched_at")]
    first_seen = iso_ts(min((s["created_at"] for s in ss if s.get("created_at")), default=o["first_seen"]))
    last_checked = iso_ts(max((s["fetched_at"] for s in fetched), default=o["last_checked"]))
    last_seen = iso_ts(max((s["fetched_at"] for s in fetched if (s.get("http_status") or 0) < 400
                            and s.get("ustate") == "done"), default=None))
    prec = LANE_PRECISION.get(dsrc, ORGANISER_PRECISION)
    if dsrc in LANE_PRECISION and (o["open_strength"] == "explicit" or o["state"] == "ENQUIRY_AVAILABLE"
                                   or dsrc in ("localstalls", "ukcraftfairs")):
        level = "HIGH"
    elif o["open_strength"] == "explicit" or dsrc in LANE_PRECISION:
        level = "MEDIUM"
    else:
        level = "LOW"
    date_basis = pex.get("date_source") or None
    rec = {
        "schema_version": SCHEMA_VERSION,
        "opportunity_id": oid,
        "channel": "held",
        "lifecycle_event": "UNCHANGED",
        "lifecycle_changes": [],
        "previous_application_state": None,
        "export_readiness": "NOT_READY",
        "readiness_issues": [],
        "country": COUNTRIES[cc].name if cc else None,
        "country_code": cc,
        "region": region,
        "region_code": region_code(cc, region),
        "locality": o["locality"],
        "location": ", ".join(loc_parts) if loc_parts else None,
        "venue": o["venue"],
        "geography_basis": sorted(basis),
        "event_name": (o["name"] or "").strip() or "(unnamed)",
        "organiser": o["organiser"],
        "opportunity_type": types[0] if types else None,
        "event_types": types,
        "vendor_categories": cats,
        "application_state": o["state"] if o["state"] else "UNKNOWN",
        "application_state_evidence": state_q,
        "open_strength": o["open_strength"] if o["open_strength"] in ("explicit", "implicit") else None,
        "recurring": recurring,
        "recurrence_evidence": _clip(o["recurrence_evidence"]),
        "event_start": iso_date(o["start_date"]),
        "event_end": iso_date(o["end_date"]),
        "event_date_basis": date_basis,
        "application_deadline": iso_date(o["deadline"]),
        "applications_open_on": iso_date(o["opens_on"]),
        "source_url": clean_url(primary),
        "application_url": apply_url,
        "application_routes": rts,
        "discovery_source": dsrc,
        "discovery_source_detail": ddetail,
        "discovery_strategy": strat,
        "source_type": stype,
        "platform": plat,
        "first_seen": first_seen,
        "last_seen": last_seen,
        "last_checked": last_checked,
        "evidence": {"relevance": [q for q in rel_q if q], "state": state_q, "dates": [q for q in date_q if q]},
        "confidence": {"level": level, "classifier_score": round(o["confidence"], 3) if o["confidence"] is not None else None,
                       "lane_audited_precision": prec,
                       "basis": f"{dsrc} lane audited precision {prec:.0%}; open evidence {o['open_strength'] or 'n/a'}"},
        "provenance": {
            "engine": ENGINE, "engine_version": __version__, "classifier_version": CLASSIFIER_VERSION,
            "sources": [{"url": clean_url(s["url"]), "role": s.get("role"), "discovery_source": source_of(s["generator"], s["url"])[0],
                         "fetched_at": iso_ts(s.get("fetched_at")), "http_status": s.get("http_status"),
                         "content_sha256": s.get("content_hash"), "classifier_version": s.get("classifier_version")}
                        for s in sorted(ss, key=lambda s: (s.get("role") != "primary", s["url"]))[:12]
                        if s["url"] and re.match(r"^https?://", s["url"])],
            "raw_evidence_refs": sorted({f"sha256:{s['content_hash']}" for s in ss if s.get("content_hash")})[:12],
        },
        "fingerprint": {"content": hashlib.sha256("|".join(sorted(s.get("content_hash") or "" for s in ss)).encode()).hexdigest(),
                        "material": ""},
        "identity": {"algorithm": idn.ALGORITHM, "natural_key": nkey, "resolved_by": how, "anchors": anchors[:40]},
        "watch": None,
    }
    for k in ("event_name", "organiser", "locality", "region", "venue", "location"):
        if isinstance(rec.get(k), str):
            rec[k] = re.sub(r"\s+", " ", rec[k]).strip() or None
    rec["event_name"] = rec["event_name"] or "(unnamed)"
    rec["organiser"] = clean_organiser(rec["organiser"])
    rec["fingerprint"]["material"] = _sha(material_view(rec))
    # Only conflicts that remain unresolved for the exported geography block export: a region that belongs
    # to another country. (A discovery hint that disagreed with page evidence is resolved by the evidence.)
    from ..geo import region_country
    gate_conflicts = []
    rc = region_country(region)
    if cc and rc and cc not in rc:
        gate_conflicts.append(f"region '{region}' belongs to {sorted(rc)} not {cc}")
    _gate(rec, o, today, hint_only, gate_conflicts, suppress, pex)
    return rec


def _gate(rec: dict, o: dict, today: dt.date, hint_only: bool, conflicts: list, suppress: dict, pex: dict) -> None:
    """Export-readiness gate. Sets channel, export_readiness, readiness_issues and (watch) plan."""
    issues = []
    st = rec["application_state"]
    # Dates published by the source move a record out of the usable states as time passes, even before the page
    # is re-fetched. This is an observed fact (the source's own date has passed), not an inference from absence.
    t = today.isoformat()
    end = rec["event_end"] or rec["event_start"]
    if st == "ROLLING" and ((rec["application_deadline"] and rec["application_deadline"] < t)
                            or (rec["event_end"] and rec["event_end"] < t)):
        # a rolling route whose own deadline or season end has passed is closed for this cycle
        what = (f"Application deadline {rec['application_deadline']}" if rec["application_deadline"] and
                rec["application_deadline"] < t else f"Season end {rec['event_end']}")
        rec["application_state"] = st = "CLOSED_CURRENT_CYCLE"
        rec["application_state_evidence"] = _clip(f"{what} has passed (source date); previously: "
                                                  f"{rec['application_state_evidence']}", 400)
    if st in USABLE_STATES and st != "ROLLING":
        if end and end < t:
            rec["application_state"] = st = "HISTORICAL"
            rec["application_state_evidence"] = _clip(f"Event date {end} has passed (source date); previously: "
                                                      f"{rec['application_state_evidence']}", 400)
        elif rec["application_deadline"] and rec["application_deadline"] < t:
            rec["application_state"] = st = "CLOSED_CURRENT_CYCLE"
            rec["application_state_evidence"] = _clip(f"Application deadline {rec['application_deadline']} has passed "
                                                      f"(source date); previously: {rec['application_state_evidence']}", 400)
    if rec["country_code"] not in SUPPORTED:
        issues.append("unsupported_or_unknown_country")
    if hint_only:
        issues.append("geography_unverified (only the discovery query/seed suggested the country)")
    if conflicts:
        issues.append("geography_conflict: " + "; ".join(sorted(set(conflicts)))[:200])
    name = rec["event_name"]
    if len(name) < 3 or JUNK_NAME.match(name.strip()) or name == "(unnamed)":
        issues.append("event_name_not_usable")
    elif COUNCIL_ONLY.match(name.strip()) or (AUTHORITY_ONLY.match(name.strip()) and not _EVENTISH.search(name)):
        issues.append("event_name_is_organiser_only")
    if rec["discovery_source"] in SUSPENDED_LANES:
        issues.append(f"lane_suspended ({SUSPENDED_LANES[rec['discovery_source']]})")
    if not rec["source_url"] or not re.match(r"^https?://[^\s/]+\.[^\s/]+", rec["source_url"]):
        issues.append("invalid_source_url")
    # V3 ingest refuses plain-http URLs as unsafe; never publish them as ready.
    if (rec["source_url"] or "").lower().startswith("http://"):
        issues.append("insecure_source_url (http, not https)")
    if (rec["application_url"] or "").lower().startswith("http://"):
        issues.append("insecure_application_url (http, not https)")
    for u in [rec["source_url"], rec["application_url"]] + [s["url"] for s in rec["provenance"]["sources"]]:
        a = idn.canonical_anchor_url(u) if u else None
        if a and a in suppress:
            issues.append(f"known_false_positive ({suppress[a]})")
            break
    if not rec["application_state_evidence"]:
        issues.append("no_state_evidence")
    if not rec["evidence"]["relevance"] and not rec["application_state_evidence"]:
        issues.append("no_relevance_evidence")
    if st in USABLE_STATES:
        if end and end < today.isoformat() and st != "ROLLING":
            issues.append("stale_contradiction: event date has passed")
        if rec["application_deadline"] and rec["application_deadline"] < today.isoformat() and st != "ROLLING":
            issues.append("stale_contradiction: deadline has passed")
    if st in USABLE_STATES:
        channel = "current"
    elif st in WATCH_STATES and (st != "HISTORICAL" or rec["recurrence_evidence"]):
        channel = "watch"
    else:
        channel = None  # internal only (historical without recurrence evidence, not relevant)
    rec["readiness_issues"] = issues
    if channel is None:
        rec["channel"], rec["export_readiness"] = "retired", "RETIRED"
    elif issues:
        rec["channel"], rec["export_readiness"] = "held", "NOT_READY"
    else:
        rec["channel"] = channel
        rec["export_readiness"] = "READY" if channel == "current" else "WATCH"
    if channel == "watch" or (rec["channel"] == "held" and st in WATCH_STATES):
        basis = o.get("next_check_basis") or ""
        try:
            missing = json.loads(o.get("missing_evidence") or "[]")
        except ValueError:
            missing = []
        rec["watch"] = {
            "reason": o.get("watch_reason"), "priority": o.get("watch_priority"), "missing_evidence": missing,
            "revisit_url": clean_url(o.get("revisit_url")),
            "suggested_revisit_date": iso_date(o.get("next_check")),
            "revisit_date_basis": ("SOURCE_PROVIDED" if basis.startswith("source:") else "INTERNAL") if basis else None,
            "revisit_basis_detail": basis or None,
        }
