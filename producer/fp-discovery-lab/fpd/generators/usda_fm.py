"""USDA farmers-market lane (US): the Local Food Portal directory -> each market's own website (hop one only).

The USDA Local Food Portal publishes its farmers-market directory as a bulk download (names, addresses, coordinates;
no websites or contacts). Its API, which does carry websites, refuses automated clients, and we do not disguise ours.
So this lane works from the downloaded list, kept on the Pi only (never in Git):

    /srv/fpd/data/seeds/usda-farmersmarkets.csv   (listing_id,name,street,city,state,zip,lat,lon,updated,org)

For each market not already known to the producer, it tries the obvious website names (oxfordfarmersmarket.org ...).
A site is accepted ONLY if its own title/heading names that market AND the page names its town, ZIP or state; a
directory page that merely lists the market is not accepted. Accepted homepages go into the frontier; everything a
delivered record says (dates, place, trader route, open/closed) is then proven from the market's own pages by the
normal crawler and classifier, exactly like the DATAtourisme and Wikidata seeds. Nothing from the USDA row is copied
into an opportunity.

Measured 15 Oct 2026 on 60 sampled new markets: 12 sites confirmed, 7 with an application route (one false positive
that the classifier must reject). Bounded per run (markets and seconds); about 1 request per second; robots.txt
respected; a persistent cursor walks recently-updated markets first, then the rest in a fixed shuffled order.
"""
from __future__ import annotations

import csv
import os
import random
import re
import socket
import time
from pathlib import Path
from urllib import robotparser
from urllib.parse import urlsplit

from ..db import kv_get, kv_set
from ..urlutil import reg_domain

GENERATOR = "usda_fm:us"
STOP = {"the", "of", "and", "at", "in", "on", "a"}
GENERIC = {"farmers", "farmer", "market", "markets", "farm", "community", "fresh", "downtown", "city", "county",
           "saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "weekly", "open", "air",
           "certified", "public", "local", "main", "street", "square", "park", "village", "town"}
PARKED = re.compile(r"domain (?:is )?for sale|buy this domain|parked free|this domain may be for sale|godaddy\.com/forsale|"
                    r"hugedomains|sedo\.com|dan\.com", re.I)
ROBOTS_MAX = 512_000
PAGE_MAX = 1_000_000


def norm(s: str) -> str:
    s = (s or "").lower().replace("’", "'").replace("'s", "s").replace("'", "")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(w for w in s.split() if w not in STOP)


def core_name(name: str) -> str:
    """'Cedar River Farmers' Market - Winter (Sat)' -> 'Cedar River Farmers' Market' (season/day suffixes dropped)."""
    return re.sub(r"\s*\(.*?\)|\s+[-–—@:|].*$", "", name or "").strip() or (name or "")


def distinctive(name: str) -> bool:
    return any(w not in GENERIC for w in norm(core_name(name)).split())


def candidates(name: str) -> list[str]:
    words = norm(core_name(name)).split()
    base = "".join(words)
    alt = "".join(w for w in words if w not in {"farmers", "farmer"}) if {"farmers", "farmer"} & set(words) else ""
    out = []
    for s in (base, alt):
        if s and 6 <= len(s) <= 50:
            out += [f"{s}.org", f"{s}.com"]
    return list(dict.fromkeys(out))[:4]


def title_text(html: str) -> str:
    parts = re.findall(r"(?is)<title[^>]*>(.*?)</title>", html)[:1] + re.findall(r"(?is)<h1[^>]*>(.*?)</h1>", html)[:3]
    parts += re.findall(r'(?is)<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']+)', html)[:1]
    return " ".join(re.sub(r"<[^>]+>", " ", p) for p in parts)


def page_text(html: str) -> str:
    html = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


def is_this_market(html: str, m: dict) -> bool:
    """The page's own title/heading names THIS market, and the page names its town, ZIP or state."""
    from rapidfuzz import fuzz
    if PARKED.search(html[:20000]):
        return False
    tt, cn = norm(title_text(html)), norm(core_name(m["name"]))
    dw = [w for w in cn.split() if w not in GENERIC]
    if not tt or not ((dw and all(w in tt.split() for w in dw)) or fuzz.partial_ratio(cn, tt) >= 92):
        return False
    t = page_text(html)[:30000]
    city, z, st = (m.get("city") or "").lower(), m.get("zip") or "", m.get("state") or ""
    return bool((city and city in t.lower()) or (z and z in t) or (st and re.search(rf"\b{st}\b", t)))


def load_markets(path: Path, seed: int = 20261015) -> list[dict]:
    rows = [r for r in csv.DictReader(path.open(newline="")) if r.get("state") and distinctive(r.get("name", ""))]
    recent = sorted([r for r in rows if (r.get("updated") or "") >= "2024"], key=lambda r: r["updated"], reverse=True)
    older = [r for r in rows if (r.get("updated") or "") < "2024"]
    random.Random(seed).shuffle(older)
    return recent + older


class Known:
    """Markets the producer already has (an opportunity in the same state, or a site with the same name)."""

    def __init__(self, conn):
        self.by_state: dict[str, list[tuple[str, str]]] = {}
        for n, loc, reg in conn.execute("SELECT name, locality, region FROM opportunities WHERE country='US' AND name IS NOT NULL"):
            m = re.search(r"([A-Z]{2})$", (reg or "").upper())
            self.by_state.setdefault(m.group(1) if m else "", []).append((norm(n), (loc or "").lower()))
        self.sites = [norm(e) for (e,) in conn.execute("SELECT entity_name FROM sites WHERE entity_name IS NOT NULL")]
        self.idx: dict[str, list[int]] = {}
        for i, sn in enumerate(self.sites):
            for w in set(sn.split()) - GENERIC:
                self.idx.setdefault(w, []).append(i)

    def has(self, m: dict) -> bool:
        from rapidfuzz import fuzz
        n, city = norm(m["name"]), (m.get("city") or "").lower()
        for on, oloc in self.by_state.get(m["state"], []):
            sc = fuzz.token_set_ratio(n, on)
            if sc >= 95 or (sc >= 88 and city and city in oloc):
                return True
        if len(n.split()) >= 3:
            cand = {i for w in set(n.split()) - GENERIC for i in self.idx.get(w, [])}
            return any(fuzz.token_set_ratio(n, self.sites[i]) >= 96 for i in cand)
        return False


class PoliteGet:
    """Sequential, about one request per second, capped reads, robots.txt honoured (unreachable robots = no rules)."""

    def __init__(self, user_agent: str, pause: float = 1.0, client=None):
        import httpx
        self.client = client or httpx.Client(headers={"User-Agent": user_agent}, timeout=12, follow_redirects=True)
        self.ua, self.pause, self.robots, self.requests = user_agent, pause, {}, 0

    def get(self, url: str, cap: int = PAGE_MAX) -> tuple[int, str, str]:
        self.requests += 1
        time.sleep(self.pause)
        with self.client.stream("GET", url) as r:
            buf = bytearray()
            for ch in r.iter_bytes():
                buf += ch
                if len(buf) >= cap:
                    break
            return r.status_code, str(r.url), bytes(buf[:cap]).decode("utf-8", "replace")

    def allowed(self, url: str) -> bool:
        sp = urlsplit(url)
        key = f"{sp.scheme}://{sp.netloc}"
        if key not in self.robots:
            rp = robotparser.RobotFileParser()
            try:
                st, _, txt = self.get(key + "/robots.txt", ROBOTS_MAX)
                if st in (401, 403):
                    rp.disallow_all = True
                elif st >= 400:
                    rp.allow_all = True
                else:
                    rp.parse(txt.splitlines())
            except MemoryError:
                raise
            except Exception:  # noqa: BLE001
                rp.allow_all = True
            self.robots[key] = rp
        return self.robots[key].can_fetch(self.ua, url)

    def close(self):
        self.client.close()


def _resolves(host: str) -> bool:
    try:
        socket.getaddrinfo(host, 443)
        return True
    except OSError:
        return False


def run(conn, frontier, tel, cfg, max_markets: int = 150, max_seconds: float = 300, csv_path: str | None = None,
        getter=None, resolves=_resolves) -> dict:
    path = Path(csv_path or os.environ.get("FPD_USDA_FM_CSV") or Path(cfg.data_dir) / "seeds" / "usda-farmersmarkets.csv")
    if not path.exists():
        return {"skipped": f"no market list at {path} (download it from the USDA Local Food Portal data-sharing page)"}
    markets = load_markets(path)
    cur = kv_get(conn, "usda_fm.cursor", {"pos": 0, "passes": 0})
    totals = kv_get(conn, "usda_fm.totals", {})
    out = {"checked": 0, "already_known": 0, "no_domain": 0, "robots_blocked": 0, "not_this_market": 0,
           "confirmed": 0, "enqueued": 0}
    known = Known(conn)
    g = getter or PoliteGet(cfg.user_agent)
    deadline = time.monotonic() + max_seconds
    try:
        while out["checked"] < max_markets and time.monotonic() < deadline:
            if cur["pos"] >= len(markets):
                cur = {"pos": 0, "passes": cur.get("passes", 0) + 1}
                break
            m = markets[cur["pos"]]
            cur["pos"] += 1
            out["checked"] += 1
            if known.has(m):
                out["already_known"] += 1
                continue
            hosts = [h for h in candidates(m["name"]) if resolves(h)]
            if not hosts:
                out["no_domain"] += 1
                continue
            hit = None
            for h in hosts:
                url = f"https://{h}/"
                try:
                    if not g.allowed(url):
                        out["robots_blocked"] += 1
                        continue
                    code, final, html = g.get(url)
                except MemoryError:
                    raise
                except Exception:  # noqa: BLE001
                    continue
                if code < 400 and is_this_market(html, m):
                    hit = final
                    break
            if not hit:
                out["not_this_market"] += 1
                continue
            out["confirmed"] += 1
            rd = reg_domain(hit)
            if not rd:
                continue
            frontier.ensure_site(rd, GENERATOR, country="US", entity_name=m["name"][:150])
            meta = {"country": "US", "usda_listing": m.get("listing_id"), "usda_market": m["name"][:150],
                    "usda_city": m.get("city"), "usda_state": m.get("state")}
            if frontier.add(hit, "site_home", GENERATOR, priority=0.7, depth=0, anchor=f"USDA farmers market: {m['name']}"[:300],
                            meta=meta, budgeted=False):
                out["enqueued"] += 1
            kv_set(conn, "usda_fm.cursor", cur)
    finally:
        if getter is None:
            g.close()
    kv_set(conn, "usda_fm.cursor", cur)
    for k, v in out.items():
        totals[k] = totals.get(k, 0) + v
    kv_set(conn, "usda_fm.totals", totals)
    out["cursor"] = {**cur, "of": len(markets)}
    out["http_requests"] = getattr(g, "requests", None)
    tel.inc("seed.usda_fm.enqueued", out["enqueued"])
    tel.flush()
    return out
