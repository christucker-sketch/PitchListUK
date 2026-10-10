"""Optional: query a web search API (Brave Search) with trader-vocabulary × geography templates.

Off unless BRAVE_API_KEY is set. Kept as one generator among several so its yield/cost can be
compared directly against the free structural strategies.
"""
from __future__ import annotations

import time

import httpx

from ..countries import COUNTRIES
from ..db import kv_get, kv_set

ENDPOINT = "https://api.search.brave.com/res/v1/web/search"
BRAVE_COUNTRY = {"GB": "GB", "US": "US", "CA": "CA", "AU": "AU", "NZ": "NZ", "IE": "IE"}


def queries_for(cc: str, year: int) -> list[str]:
    prof = COUNTRIES[cc]
    qs = []
    for term in prof.trader_terms:
        qs.append(f'"{term}" {year}')
    for region in prof.regions[:60]:
        qs.append(f'{prof.trader_terms[0]} {region} {year}')
    return qs


def run(conn, frontier, tel, cfg, max_queries: int = 200) -> int:
    if not cfg.brave_api_key:
        tel.inc("seed.search.skipped_no_key")
        return 0
    done = set(kv_get(conn, "search.done", []))
    added, used = 0, 0
    year = cfg.today.year if cfg.today.month < 9 else cfg.today.year + 1
    with httpx.Client(timeout=30, headers={"X-Subscription-Token": cfg.brave_api_key, "Accept": "application/json"}) as client:
        for cc in cfg.countries:
            for q in queries_for(cc, year):
                key = f"{cc}|{q}"
                if key in done or used >= max_queries:
                    continue
                used += 1
                t0 = time.monotonic()
                status, n, err = None, 0, None
                try:
                    r = client.get(ENDPOINT, params={"q": q, "country": BRAVE_COUNTRY[cc], "count": 20})
                    status = r.status_code
                    r.raise_for_status()
                    results = r.json().get("web", {}).get("results", [])
                    n = len(results)
                    for i, res in enumerate(results):
                        if frontier.add(res["url"], "candidate", "search:brave", priority=0.7 - i * 0.01, depth=1,
                                        anchor=res.get("title"), meta={"country": cc, "query": q}):
                            added += 1
                    done.add(key)
                except Exception as e:  # noqa: BLE001
                    err = f"{type(e).__name__}: {str(e)[:200]}"
                    tel.error("search", q, err)
                tel.api("brave", key, status, n, int((time.monotonic() - t0) * 1000), err)
                time.sleep(1.1)
    kv_set(conn, "search.done", sorted(done))
    tel.inc("seed.search.enqueued", added)
    tel.flush()
    return added
