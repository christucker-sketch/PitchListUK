"""Read-only evidence for the V3 hand-over: recheck lifecycle, UK/country breakdown, delivery receipts, dedupe
candidates. Run by fpd-evidence as root. Opens the engine DB read-only. Never reads the V3 token file."""
import collections, datetime as dt, glob, json, os, sqlite3, sys

E = os.environ.get("FPD_EV_EXPORT", "/srv/fpd/export")
S = os.environ.get("FPD_EV_STATE", "/srv/fpd/delivery/state")
DB = os.environ.get("FPD_EV_DB", "/srv/fpd/data/fpd.sqlite")
OUT = sys.argv[1]
sys.path.insert(0, os.environ.get("FPD_EV_APP", "/opt/fpd/app"))
try:
    from fpd.resolve import name_key
except Exception:  # noqa: BLE001
    def name_key(s):
        return " ".join(sorted(set((s or "").lower().split())))


def jl(p):
    out = []
    try:
        with open(p, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    out.append(json.loads(line))
    except OSError:
        pass
    return out


def js(p, default=None):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def ts(s):
    try:
        return dt.datetime.fromisoformat(str(s).replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return None


C = collections.Counter
cur, watch, held = (jl(f"{E}/full/{n}.jsonl") for n in ("current", "watch", "held"))
feed = jl(f"{E}/v3/feed.jsonl")
cur_by = {r["opportunity_id"]: r for r in cur}
status = js(f"{S}/status.json", {})
rq = js(f"{S}/rechecks.json", {}) or {}
reqs = rq.get("requests") or []
con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=60)
con.row_factory = sqlite3.Row
state = {r["opportunity_id"]: r for r in con.execute(
    "SELECT opportunity_id, channel, delivered, application_state, last_event, absent_count, record_json, "
    "first_exported, last_exported FROM integration_state")}

# ---------------------------------------------------------------- delivery receipts
cps = []
for p in sorted(glob.glob(f"{S}/checkpoints/*.json"), key=os.path.getmtime):
    c = js(p, {})
    errs = C()
    for res in c.get("results", []):
        for e in res.get("errors") or []:
            errs[json.dumps(e, sort_keys=True)[:160] if not isinstance(e, str) else e[:160]] += 1
    cps.append({"file": os.path.basename(p), "mtime": dt.datetime.fromtimestamp(os.path.getmtime(p), dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                **{k: c.get(k) for k in ("environment", "total_records", "total_batches", "next_batch", "accepted",
                                         "rejected", "inserted", "duplicates", "complete", "updated_at")},
                "batch_ms_max": max((r.get("duration_ms") or 0 for r in c.get("results", [])), default=None),
                "errors": dict(errs.most_common(10))})
last = js(sorted(glob.glob(f"{S}/checkpoints/*.json"), key=os.path.getmtime)[-1], {}) if cps else {}
delivered_ok, delivered_lc = set(), {}
for res in last.get("results", []):
    for pid in res.get("producer_record_ids", []):
        if res.get("rejected") == 0:
            delivered_ok.add(pid)
        lc = (res.get("last_checked_by_producer") or {}).get(pid)
        if lc:
            delivered_lc[pid] = lc

# ---------------------------------------------------------------- recheck lifecycle
now = dt.datetime.now(dt.timezone.utc).timestamp()
detail, buckets = [], C()
for q in reqs:
    pid, rat = q.get("producer_record_id"), ts(q.get("requested_at"))
    st, rec = state.get(pid), cur_by.get(pid)
    srec = json.loads(st["record_json"]) if st and st["record_json"] else {}
    if rec:
        lc = ts(rec.get("last_checked"))
        if rec.get("carried_forward"):
            b = "in_current_but_carried_forward (engine no longer produces it; cannot be acked until retired)"
        elif lc and rat and lc >= rat:
            b = ("in_current_rechecked_and_delivered (eligible for ack; if still pending, check V3 ack handling)"
                 if pid in delivered_ok else "in_current_rechecked_not_yet_delivered_ok")
        else:
            b = "in_current_awaiting_refetch"
    elif st:
        b = f"left_current -> {st['channel']} / {st['application_state']} (not in current.jsonl; only reaches V3 via the v3 feed)"
    else:
        b = "unknown_to_producer"
    buckets[b] += 1
    targets = []
    for u in ((srec.get("watch") or {}).get("revisit_url"), srec.get("source_url")):
        if u and u not in [t["url"] for t in targets]:
            row = con.execute("SELECT state, fetched_at, http_status, attempts, last_error FROM urls WHERE url=?", (u,)).fetchone()
            targets.append({"url": u, **({k: row[k] for k in row.keys()} if row else {"state": "not_in_frontier"})})
    detail.append({"producer_record_id": pid, "entity_id": q.get("entity_id"), "requested_at": q.get("requested_at"),
                   "reason": q.get("reason"), "bucket": b, "country": (rec or srec).get("country_code"),
                   "source": (rec or srec).get("discovery_source"), "current_last_checked": (rec or {}).get("last_checked"),
                   "engine_channel": st["channel"] if st else None, "engine_state": st["application_state"] if st else None,
                   "targets": targets})
req_ages = [round((now - ts(q.get("requested_at"))) / 3600, 1) for q in reqs if ts(q.get("requested_at"))]
rechecks = {"polled_at": rq.get("requested_at"), "pending_returned_by_v3": len(reqs),
            "distinct_ids": len({q.get("producer_record_id") for q in reqs}),
            "reasons": dict(C(q.get("reason") for q in reqs)), "buckets": dict(buckets),
            "age_hours": {"min": min(req_ages, default=None), "max": max(req_ages, default=None)},
            "request_keys": sorted({k for q in reqs for k in q}), "status_json": status}

# ---------------------------------------------------------------- country / UK breakdown


def complete(r):
    return {"has_application_url": bool(r.get("application_url")) or bool(r.get("application_routes")),
            "has_event_start": bool(r.get("event_start")), "has_region": bool(r.get("region") or r.get("region_code")),
            "has_locality": bool(r.get("locality") or r.get("location")), "has_organiser": bool(r.get("organiser"))}


countries = {}
for cc in ("GB", "US", "CA", "AU", "NZ", "IE"):
    c_ = [r for r in cur if r.get("country_code") == cc]
    w_ = [r for r in watch if r.get("country_code") == cc]
    h_ = [r for r in held if r.get("country_code") == cc]
    ret = [s for s in state.values() if s["channel"] == "retired" and json.loads(s["record_json"] or "{}").get("country_code") == cc]
    comp = C()
    for r in c_:
        for k, v in complete(r).items():
            comp[k] += 1 if v else 0
    countries[cc] = {
        "current": len(c_), "current_by_state": dict(C(r["application_state"] for r in c_)),
        "current_by_source": dict(C(r["discovery_source"] for r in c_)),
        "current_by_confidence": dict(C((r.get("confidence") or {}).get("level") for r in c_)),
        "current_carried_forward": sum(1 for r in c_ if r.get("carried_forward")),
        "current_completeness": dict(comp),
        "current_open_or_rolling_with_application_url": sum(1 for r in c_ if r["application_state"] in ("OPEN_NOW", "ROLLING")
                                                            and complete(r)["has_application_url"]),
        "current_in_last_delivery_ok": sum(1 for r in c_ if r["opportunity_id"] in delivered_ok),
        "current_distinct_series": len({(name_key(r.get("event_name")), (r.get("locality") or "").lower()) for r in c_}),
        "current_by_state_x_appurl": dict(C(f"{r['application_state']}|{'app_url' if complete(r)['has_application_url'] else 'no_app_url'}" for r in c_)),
        "current_by_source_x_state": dict(C(f"{r['discovery_source']}|{r['application_state']}" for r in c_)),
        "watch": len(w_), "watch_by_state": dict(C(r["application_state"] for r in w_)),
        "held": len(h_), "held_issues": dict(C(i.split(" ")[0] for r in h_ for i in (r.get("readiness_issues") or []))),
        "retired_in_engine_state": len(ret),
    }
eng = {}
for r in con.execute("SELECT country, relevance, state, COUNT(*) n FROM opportunities GROUP BY 1,2,3"):
    eng.setdefault(r["country"] or "??", {})[f"{r['relevance']}|{r['state']}"] = r["n"]

# ---------------------------------------------------------------- dedupe candidates (current only)
groups = collections.defaultdict(list)
for r in cur:
    k = (r.get("country_code"), name_key(r.get("event_name")), (r.get("event_start") or "")[:7])
    groups[k].append(r)
dups = [[{"id": r["opportunity_id"], "name": r["event_name"], "source": r["discovery_source"], "start": r.get("event_start"),
          "locality": r.get("locality"), "url": r["source_url"]} for r in g]
        for k, g in groups.items() if len(g) > 1 and k[1]]
cross = [g for g in dups if len({x["source"] for x in g}) > 1]

summary = {"generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "export": {"latest": js(f"{E}/latest.json", {}), "current": len(cur), "watch": len(watch), "held": len(held),
                      "v3_feed": {"records": len(feed), "manifest": js(f"{E}/v3/feed-manifest.json")}},
           "delivery": {"status": status, "checkpoints": cps[-12:], "checkpoint_count": len(cps),
                        "last_checkpoint_ids_ok": len(delivered_ok)},
           "rechecks": rechecks, "countries": countries, "engine_opportunities_by_country": eng,
           "integration_state": {"by_channel": dict(C(s["channel"] for s in state.values())),
                                 "delivered": sum(1 for s in state.values() if s["delivered"])},
           "dedupe": {"same_name_month_groups": len(dups), "cross_source_groups": len(cross), "examples": dups[:40]}}
json.dump(summary, open(f"{OUT}/summary.json", "w"), indent=1, default=str)
with open(f"{OUT}/rechecks_detail.jsonl", "w") as f:
    for d in detail:
        f.write(json.dumps(d, default=str) + "\n")
print(json.dumps({"rechecks": rechecks["buckets"], "GB": {k: countries["GB"][k] for k in ("current", "watch", "held")},
                  "dedupe_cross_source": len(cross)}, indent=1))
