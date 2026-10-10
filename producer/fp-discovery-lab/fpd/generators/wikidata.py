"""Entity-first seeding from Wikidata.

Idea: the population of *recurring public events* that accept traders (shows, fairs, festivals,
markets) is largely enumerable as entities with an official website. Wikidata gives us that
entity list per country for free, with no search engine in the loop.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request

from ..countries import COUNTRIES
from ..db import kv_get, kv_set

ENDPOINT = "https://query.wikidata.org/sparql"

# Root classes; subclasses are included through wdt:P279*.
ROOT_CLASSES = {
    # QIDs verified against Wikidata labels on 2026-10-04
    "festival": "Q132241",
    "fair": "Q288514",
    "agricultural_show": "Q3918368",
    "state_fair": "Q2333621",
    "marketplace": "Q330284",
    "farmers_market": "Q1522620",
    "christmas_market": "Q57607",
    "flea_market": "Q385870",
    "night_market": "Q1962840",
    "street_fair": "Q7623004",
    "street_festival": "Q2258086",
    "trade_fair": "Q57305",
    "food_festival": "Q1435951",
    "music_festival": "Q868557",
}

# Step 1 (once): expand root classes to all their subclasses.
SUBCLASS_QUERY = """
SELECT DISTINCT ?cls WHERE {{ VALUES ?root {{ {roots} }} ?cls wdt:P279* ?root . }}
"""

# Step 2 (per country): direct P31 membership against the expanded class list (fast, no path query).
QUERY = """
SELECT DISTINCT ?item ?itemLabel ?website ?locLabel WHERE {{
  VALUES ?cls {{ {classes} }}
  ?item wdt:P31 ?cls ;
        wdt:P17 wd:{country} ;
        wdt:P856 ?website .
  FILTER NOT EXISTS {{ ?item wdt:P576 ?dissolved }}
  FILTER NOT EXISTS {{ ?item wdt:P582 ?ended }}
  OPTIONAL {{ ?item wdt:P131 ?loc }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}} LIMIT 20000
"""


def run(conn, frontier, tel, cfg, countries=None, classes=None, max_seconds: float = 150) -> int:
    stop_at = time.monotonic() + max_seconds
    countries = countries or cfg.countries
    classes = classes or list(ROOT_CLASSES)
    done = set(kv_get(conn, "wikidata.done", []))
    added = 0
    # Note: Wikimedia rejects some HTTP-client fingerprints without contact info in the UA;
    # the stdlib client with our descriptive UA is accepted.
    import os
    headers = {"User-Agent": f"FPDiscoveryLab-entities/0.2 ({os.environ.get('FPD_CONTACT') or 'research prototype'})",
               "Accept": "application/sparql-results+json"}
    if True:
        for cc in countries:
            prof = COUNTRIES[cc]
            # One query per country covering all classes (the public endpoint rate-limits hard).
            for cls in ["all"]:
                key = f"{cc}:all"
                if key in done:
                    continue
                subclasses = kv_get(conn, "wikidata.subclasses")
                if not subclasses:
                    q = SUBCLASS_QUERY.format(roots=" ".join(f"wd:{ROOT_CLASSES[c]}" for c in classes))
                    t0 = time.monotonic()
                    try:
                        req = urllib.request.Request(ENDPOINT + "?" + urllib.parse.urlencode({"query": q, "format": "json"}),
                                                     headers=headers)
                        with urllib.request.urlopen(req, timeout=120) as r:
                            rows = json.loads(r.read().decode("utf-8"))["results"]["bindings"]
                        subclasses = sorted({b["cls"]["value"].rsplit("/", 1)[-1] for b in rows})
                        kv_set(conn, "wikidata.subclasses", subclasses)
                        tel.api("wikidata", "subclasses", 200, len(subclasses), int((time.monotonic() - t0) * 1000))
                    except Exception as e:  # noqa: BLE001
                        tel.api("wikidata", "subclasses", getattr(e, "code", None), 0,
                                int((time.monotonic() - t0) * 1000), str(e)[:200])
                        tel.flush()
                        return added
                    tel.flush()
                    return added  # one request per pass (endpoint rate limit)
                q = QUERY.format(classes=" ".join(f"wd:{c}" for c in subclasses), country=prof.wikidata_qid)
                t0 = time.monotonic()
                status, n, err = None, 0, None
                try:
                    # POST: the expanded class list makes the query too long for a GET URL.
                    req = urllib.request.Request(ENDPOINT, data=urllib.parse.urlencode({"query": q, "format": "json"}).encode(),
                                                 headers={**headers, "Content-Type": "application/x-www-form-urlencoded"})
                    with urllib.request.urlopen(req, timeout=120) as r:
                        status = r.status
                        rows = json.loads(r.read().decode("utf-8"))["results"]["bindings"]
                    n = len(rows)
                    for b in rows:
                        site = b["website"]["value"]
                        name = b.get("itemLabel", {}).get("value")
                        loc = b.get("locLabel", {}).get("value")
                        qid = b["item"]["value"].rsplit("/", 1)[-1]
                        if frontier.add(site, "site_home", "wikidata", priority=0.6, depth=0,
                                        anchor=f"wikidata:{qid}",
                                        meta={"country": cc, "entity_name": name, "locality": loc, "wikidata": qid}):
                            added += 1
                    done.add(key)
                    kv_set(conn, "wikidata.done", sorted(done))
                except Exception as e:  # noqa: BLE001
                    err = f"{type(e).__name__}: {str(e)[:200]}"
                    tel.error("wikidata", key, err)
                    status = getattr(e, "code", None)
                tel.api("wikidata", key, status, n, int((time.monotonic() - t0) * 1000), err)
                tel.inc("seed.wikidata.rows", n)
                if status == 429 or (err and "refused" in err):
                    # Back off and stop this pass; the generator is resumable.
                    tel.flush()
                    return added
                if time.monotonic() > stop_at:
                    tel.flush()
                    return added
                time.sleep(65.0)
    tel.inc("seed.wikidata.enqueued", added)
    tel.flush()
    return added


# ---------------------------------------------------------------------------------------------
# Organiser-class seeding: local authorities. Councils run markets, Christmas markets, fêtes and
# civic festivals and publish "become a market trader" / "events stall" pages. Wikidata lists them
# (with official websites) as instances of a handful of country-specific classes.
COUNCIL_CLASSES = {
    "GB": ["Q349084", "Q21561328", "Q211690", "Q1002812", "Q1187580", "Q15060255"],
    "AU": ["Q1867183"],
    "NZ": ["Q941036"],
}

COUNCIL_QUERY = """
SELECT DISTINCT ?item ?itemLabel ?website WHERE {{
  VALUES ?cls {{ {classes} }}
  ?item wdt:P31/wdt:P279* ?cls ; wdt:P856 ?website .
  FILTER NOT EXISTS {{ ?item wdt:P576 ?dissolved }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}} LIMIT 5000
"""


def run_councils(conn, frontier, tel, cfg) -> int:
    import os
    headers = {"User-Agent": f"FPDiscoveryLab-entities/0.2 ({os.environ.get('FPD_CONTACT') or 'research prototype'})",
               "Accept": "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded"}
    done = set(kv_get(conn, "wikidata_councils.done", []))
    if kv_get(conn, "wikidata_councils.version") != 2:
        done.discard("AU")  # v1 used direct P31 only, which misses state-specific LGA subclasses
        kv_set(conn, "wikidata_councils.version", 2)
    added = 0
    for cc, classes in COUNCIL_CLASSES.items():
        if cc in done:
            continue
        q = COUNCIL_QUERY.format(classes=" ".join(f"wd:{c}" for c in classes))
        t0 = time.monotonic()
        try:
            req = urllib.request.Request(ENDPOINT, data=urllib.parse.urlencode({"query": q, "format": "json"}).encode(),
                                         headers=headers)
            with urllib.request.urlopen(req, timeout=120) as r:
                rows = json.loads(r.read().decode("utf-8"))["results"]["bindings"]
            for b in rows:
                if frontier.add(b["website"]["value"], "site_home", "wikidata_councils", priority=0.55, depth=0,
                                anchor=f"wikidata:{b['item']['value'].rsplit('/', 1)[-1]}",
                                meta={"country": cc, "organiser_kind": "council",
                                      "organiser": b.get("itemLabel", {}).get("value")}):
                    added += 1
            done.add(cc)
            kv_set(conn, "wikidata_councils.done", sorted(done))
            tel.api("wikidata", f"councils:{cc}", 200, len(rows), int((time.monotonic() - t0) * 1000))
        except Exception as e:  # noqa: BLE001
            tel.api("wikidata", f"councils:{cc}", getattr(e, "code", None), 0, int((time.monotonic() - t0) * 1000),
                    str(e)[:200])
        break  # one request per pass (endpoint rate limit)
    tel.inc("seed.wikidata_councils.enqueued", added)
    tel.flush()
    return added
