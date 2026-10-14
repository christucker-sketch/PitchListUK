"""DATAtourisme lane (France): national open tourism data -> organiser websites -> exhibitor pages.

DATAtourisme (api.datatourisme.fr, Licence Ouverte / Etalab) is entered by French tourist offices. It is used for
DISCOVERY ONLY (hop one): each current trading event (market, sale, fair, brocante) that names an organiser website
puts that website into the frontier. Everything a delivered record says — dates, place, trader route, open/closed —
is then proven from the organiser's own pages by the normal crawler and classifier (hop two), exactly like a
Wikidata or directory seed. Nothing from the DATAtourisme record is copied into an opportunity.

Operation
* The key comes from the environment (DATATOURISME_KEY, loaded by systemd from /etc/fpd/source-keys.env). Without
  it the lane does nothing.
* Requests are capped per call of `run` and per rolling hour (the API allows 1,000/hour; we use far less).
* A persistent cursor walks the full result set page by page and wraps; a restart resumes where it stopped.
* Each organiser site is enqueued once (its homepage or the event page the tourist office linked); social,
  ticketing and API hosts are never enqueued.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import time
import urllib.parse
import urllib.request

from ..db import kv_get, kv_set
from ..urlutil import reg_domain

API = "https://api.datatourisme.fr/v1/entertainmentAndEvent"
GENERATOR = "datatourisme:fr"
QUERY = ('marché OR foire OR salon OR brocante OR braderie OR créateurs OR artisans OR artisanal OR producteurs '
         'OR "marché de noël" OR "vide-grenier"')
TRADING_TYPES = {"SaleEvent", "Market", "FairOrShow", "BricABrac", "GarageSale"}
FIELDS = "uuid,label,type,takesPlaceAt,hasContact,isLocatedAt,hasBeenCreatedBy"
SKIP_HOSTS = re.compile(r"(facebook|instagram|twitter|x\.com|youtube|tiktok|linkedin|google\.|goo\.gl|bit\.ly|linktr|"
                        r"wa\.me|helloasso|billetweb|weezevent|eventbrite|ticketmaster|fnacspectacles|tripadvisor|"
                        r"booking\.com|datatourisme|apidae|tourinsoft)", re.I)
HOURLY_CAP = 300


def _txt(v) -> str:
    if isinstance(v, dict):
        return " ".join(_txt(x) for x in v.values())
    if isinstance(v, list):
        return " ".join(_txt(x) for x in v)
    return str(v or "")


def select(objs: list[dict], today: dt.date) -> list[dict]:
    """Current trading events that name an organiser website -> [{url, label, locality, postcode, uuid}]."""
    out = []
    t = today.isoformat()
    for o in objs:
        ends = [x for x in ((p.get("endDate") or p.get("startDate")) for p in (o.get("takesPlaceAt") or [])
                            if isinstance(p, dict)) if x]
        if not ends or max(ends) < t:
            continue
        if not set(o.get("type") or []) & TRADING_TYPES:
            continue
        label = _txt(o.get("label")).strip()
        if re.match(r"^\s*A\s+SUPP", label, re.I):  # tourist-office marker for a record to be deleted
            continue
        hp = [u for ct in (o.get("hasContact") or []) if isinstance(ct, dict)
              for u in (ct.get("homepage") or []) if isinstance(u, str)]
        hp = [u.strip() for u in hp if re.match(r"^https?://[^\s/]+\.[^\s/]+", u.strip()) and not SKIP_HOSTS.search(u)]
        if not hp:
            continue
        loc = (o.get("isLocatedAt") or [{}])[0] or {}
        addr = (loc.get("address") or [{}])[0] or {}
        out.append({"url": hp[0], "label": label[:150], "locality": addr.get("addressLocality"),
                    "postcode": addr.get("postalCode"), "uuid": o.get("uuid")})
    return out


def _calls_last_hour(conn) -> list[float]:
    now = time.time()
    return [t for t in kv_get(conn, "datatourisme.calls", []) if now - t < 3600]


def _api_page(conn, key: str, page: int, run_id: int | None) -> dict | None:
    params = {"page_size": 100, "page": page, "search": QUERY, "fields": FIELDS}
    url = API + "?" + urllib.parse.urlencode(params)
    t0 = time.time()
    status, data, err = None, None, None
    try:
        req = urllib.request.Request(url, headers={"X-API-Key": key, "Accept": "application/json",
                                                   "User-Agent": "FPDiscoveryLab/0.1 (+research prototype)"})
        with urllib.request.urlopen(req, timeout=90) as r:
            status, data = r.status, json.load(r)
    except urllib.error.HTTPError as e:
        status, err = e.code, str(e)[:200]
    except Exception as e:  # noqa: BLE001
        err = repr(e)[:200]
    calls = _calls_last_hour(conn) + [time.time()]
    kv_set(conn, "datatourisme.calls", calls)
    try:
        conn.execute("INSERT INTO api_calls(run_id, ts, api, request, status, results, elapsed_ms, error) VALUES (?,?,?,?,?,?,?,?)",
                     (run_id, time.time(), "datatourisme", f"page={page}", status,
                      len((data or {}).get("objects") or []), int((time.time() - t0) * 1000), err))
    except Exception:  # noqa: BLE001  (api_calls is accounting only)
        pass
    return data


def run(conn, frontier, tel, cfg, max_calls: int = 20, today: dt.date | None = None, fetch_page=None) -> dict:
    """Walk up to `max_calls` result pages from the persistent cursor; enqueue new organiser sites."""
    key = os.environ.get("DATATOURISME_KEY", "").strip()
    if not key and fetch_page is None:
        return {"skipped": "no DATATOURISME_KEY (sudo fpd-set-source-key datatourisme)"}
    today = today or cfg.today
    fetch_page = fetch_page or (lambda p: _api_page(conn, key, p, getattr(frontier, "run_id", None)))
    cur = kv_get(conn, "datatourisme.cursor", {"page": 1, "passes": 0, "pass_started": time.time()})
    out = {"pages": 0, "events": 0, "selected": 0, "enqueued": 0, "already_known": 0, "errors": 0}
    for _ in range(max_calls):
        if key and len(_calls_last_hour(conn)) >= HOURLY_CAP:
            out["stopped"] = "hourly cap"
            break
        data = fetch_page(cur["page"])
        if not data or "objects" not in data:
            out["errors"] += 1
            break
        out["pages"] += 1
        objs = data.get("objects") or []
        out["events"] += len(objs)
        for s in select(objs, today):
            out["selected"] += 1
            rd = reg_domain(s["url"])
            if not rd:
                continue
            frontier.ensure_site(rd, GENERATOR, country="FR")
            meta = {"country": "FR", "dt_event": s["label"], "dt_locality": s["locality"], "dt_postcode": s["postcode"]}
            # The tourist office linked either the organiser's homepage or the event's own page.
            path = urllib.parse.urlsplit(s["url"]).path.strip("/")
            purpose = "candidate" if path else "site_home"
            if frontier.add(s["url"], purpose, GENERATOR, priority=0.7, depth=0, anchor=f"DATAtourisme: {s['label']}"[:300],
                            meta=meta, budgeted=False):
                out["enqueued"] += 1
            else:
                out["already_known"] += 1
        total = (data.get("meta") or {}).get("total") or 0
        if cur["page"] * 100 >= total or not objs:
            cur = {"page": 1, "passes": cur.get("passes", 0) + 1, "pass_started": time.time(), "last_total": total}
        else:
            cur["page"] += 1
        kv_set(conn, "datatourisme.cursor", cur)
    out["cursor"] = cur
    tel.inc("seed.datatourisme.enqueued", out["enqueued"])
    tel.flush()
    return out
