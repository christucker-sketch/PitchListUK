"""Curated structural seeds: association/directory listings and application-platform sitemaps.

These are not 'search results' — they are places where the *structure of the ecosystem*
concentrates many opportunities: membership directories of show/fair/market associations,
and public sitemaps of the SaaS platforms organisers use to take vendor applications.
Seeds live in seeds.json so they can be extended without code changes.
"""
from __future__ import annotations

import json
from pathlib import Path

from ..db import kv_get, kv_set
from ..urlutil import reg_domain

SEEDS_FILE = Path(__file__).resolve().parent.parent / "seeds.json"


def load_seeds() -> dict:
    return json.loads(SEEDS_FILE.read_text(encoding="utf-8"))


def run(conn, frontier, tel, cfg, only: str | None = None) -> int:
    seeds = load_seeds()
    done = set(kv_get(conn, "seeds.done", []))
    added = 0
    for d in seeds.get("directories", []):
        if only and only not in ("directories", d["name"]):
            continue
        key = f"dir:{d['name']}"
        if key in done:
            continue
        for url in d["urls"]:
            frontier.ensure_site(reg_domain(url), f"directory:{d['name']}", role="hub")
            if frontier.add(url, "directory", f"directory:{d['name']}", priority=0.75, depth=0,
                            anchor=d.get("note", ""), meta={"country": d.get("country"), "follow": d.get("follow")},
                            budgeted=False):
                added += 1
        done.add(key)
    for p in seeds.get("platform_sitemaps", []):
        if only and only not in ("platforms", p["name"]):
            continue
        key = f"plat:{p['name']}"
        if key in done:
            continue
        for url in p["sitemaps"]:
            frontier.ensure_site(reg_domain(url), f"platform:{p['name']}", role="platform")
            if frontier.add(url, "sitemap", f"platform:{p['name']}", priority=0.8, depth=0,
                            anchor=p.get("note", ""),
                            meta={"platform": p["name"], "pattern": p["pattern"], "child_pattern": p.get("child_pattern"),
                                  "follow_internal": p.get("follow_internal"), "country": p.get("country"),
                                  "country_from_path": p.get("country_from_path"), "max_age_days": p.get("max_age_days", 400),
                                  "max_urls": p.get("max_urls", 3000)},
                            budgeted=False):
                added += 1
        done.add(key)
    for p in seeds.get("platform_listings", []):
        if only and only not in ("platforms", p["name"]):
            continue
        key = f"list:{p['name']}"
        if key in done:
            continue
        for url in p["urls"]:
            frontier.ensure_site(reg_domain(url), f"platform:{p['name']}", role="platform")
            if frontier.add(url, "directory", f"platform:{p['name']}", priority=0.8, depth=0,
                            anchor=p.get("note", ""), meta={"country": p.get("country")}, budgeted=False):
                added += 1
        done.add(key)
    for p in seeds.get("platform_idranges", []):
        if only and only not in ("platforms", p["name"]):
            continue
        key = f"ids:{p['name']}"
        if key in done:
            continue
        frontier.ensure_site(reg_domain(p["template"].format(id=1)), f"platform:{p['name']}", role="platform")
        for i in range(p["start"], p["stop"], -1 if p["stop"] < p["start"] else 1):
            if frontier.add(p["template"].format(id=i), "platform", f"platform:{p['name']}",
                            priority=0.7 + (0.0001 * (i - min(p["start"], p["stop"])) / max(1, abs(p["start"] - p["stop"]))),
                            depth=0, anchor="id-range", meta={"platform": p["name"], "country": p.get("country")},
                            budgeted=False):
                added += 1
        done.add(key)
    kv_set(conn, "seeds.done", sorted(done))
    tel.inc("seed.curated.enqueued", added)
    tel.flush()
    return added
