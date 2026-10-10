"""Entity-first seeding from OpenStreetMap: physical marketplaces that publish a website.

Recurring markets are the single most numerous kind of trading opportunity and are mapped as
amenity=marketplace. Many publish 'become a trader' info on their site.
"""
from __future__ import annotations

import time

import httpx

from ..db import kv_get, kv_set

# Endpoint availability varies a lot; order reflects what responded during development.
ENDPOINTS = ["https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass-api.de/api/interpreter"]

QUERY = """
[out:json][timeout:120];
area["ISO3166-1"="{iso}"][admin_level=2]->.a;
(
  nwr["amenity"="marketplace"]["website"](area.a);
  nwr["amenity"="marketplace"]["contact:website"](area.a);
);
out tags;
"""


def run(conn, frontier, tel, cfg, countries=None, max_seconds: float = 150) -> int:
    stop_at = time.monotonic() + max_seconds
    countries = countries or cfg.countries
    done = set(kv_get(conn, "osm.done", []))
    added = 0
    with httpx.Client(timeout=130, headers={"User-Agent": cfg.user_agent}) as client:
        for cc in countries:
            if cc in done:
                continue
            q = QUERY.format(iso=cc)
            for ep in ENDPOINTS:
                t0 = time.monotonic()
                status, n, err = None, 0, None
                try:
                    r = client.post(ep, data={"data": q})
                    status = r.status_code
                    r.raise_for_status()
                    els = r.json().get("elements", [])
                    n = len(els)
                    for el in els:
                        t = el.get("tags", {})
                        site = t.get("website") or t.get("contact:website")
                        if not site:
                            continue
                        if not site.startswith("http"):
                            site = "https://" + site
                        name = t.get("name")
                        meta = {"country": cc, "entity_name": name, "locality": t.get("addr:city"),
                                "osm": f"{el.get('type')}/{el.get('id')}", "opening_hours": t.get("opening_hours")}
                        if frontier.add(site, "site_home", "osm_marketplace", priority=0.55, depth=0,
                                        anchor=f"osm:{name}", meta=meta):
                            added += 1
                    done.add(cc)
                    kv_set(conn, "osm.done", sorted(done))
                    tel.api("overpass", f"{cc}@{ep}", status, n, int((time.monotonic() - t0) * 1000))
                    break
                except Exception as e:  # noqa: BLE001
                    err = f"{type(e).__name__}: {str(e)[:200]}"
                    tel.api("overpass", f"{cc}@{ep}", status, n, int((time.monotonic() - t0) * 1000), err)
                    tel.error("osm", cc, err)
            if time.monotonic() > stop_at:
                break
            time.sleep(5)
    tel.inc("seed.osm.enqueued", added)
    tel.flush()
    return added
