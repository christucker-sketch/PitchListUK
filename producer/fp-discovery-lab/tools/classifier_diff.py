"""Read-only classifier regression check: run two engine code trees over the same stored pages and compare.

Used before installing a kit that changes classification rules (e.g. a language pack): every page linked to an
opportunity, plus a sample of other stored pages, is re-classified by the INSTALLED engine and by the NEW engine.
Nothing is written to the database (it is opened read-only); only counts and a short list of changed pages print.

    sudo -u fpd /opt/fpd/venv/bin/python classifier_diff.py --old /opt/fpd/app --new ~/kit-v3011l/app \
        --db /srv/fpd/data/fpd.sqlite --data-dir /srv/fpd/data --sample 2500
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import subprocess
import sys

WORKER = r'''
import datetime as dt, json, sqlite3, sys
from fpd.parse import parse_html
from fpd.classify import classify
from fpd import adapters, storage
from fpd.config import Config
db, data_dir, ids_file = sys.argv[1], sys.argv[2], sys.argv[3]
today = Config.from_env().today
conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True); conn.row_factory = sqlite3.Row
for line in open(ids_file):
    uid = int(line)
    r = conn.execute("SELECT * FROM urls WHERE id=?", (uid,)).fetchone()
    if not r or not r["cache_path"]:
        continue
    body = storage.read_raw(data_dir, r["cache_path"])
    if not body:
        continue
    text = body.decode("utf-8", "replace")
    if "<urlset" in text[:3000].lower() or "<sitemapindex" in text[:3000].lower():
        continue
    meta = json.loads(r["meta"]) if r["meta"] else {}
    site = conn.execute("SELECT role, country_hint, entity_name, next_date FROM sites WHERE reg_domain=?", (r["reg_domain"],)).fetchone()
    hint = dict(meta)
    role = site["role"] if site else "organiser"
    if site and site["country_hint"] and not hint.get("country"):
        hint["country"] = site["country_hint"]
    if role == "organiser" and site and site["entity_name"] and not hint.get("entity_name"):
        hint["entity_name"] = site["entity_name"]
    if role == "organiser" and site and site["next_date"] and not hint.get("site_next_date"):
        hint["site_next_date"] = site["next_date"]
    hint["site_role"] = role
    url = r["final_url"] or r["url"]
    try:
        page = parse_html(text, url)
        a = classify(page, today, hint=hint)
        a = adapters.apply(page, a, today, r["reg_domain"])
        x = a["extracted"]
        out = {"id": uid, "label": a["label"], "state": x.get("state"), "country": x.get("country"),
               "start": x.get("start_date"), "routes": sorted({rt["type"] for rt in x.get("routes") or []}),
               "reasons": a["reasons"][:3], "ev": (x.get("state_evidence") or "")[:170],
               "end": x.get("end_date"), "deadline": x.get("deadline"), "open": x.get("open_strength"),
               "name": (x.get("name") or "")[:90], "organiser": (x.get("organiser") or "")[:60],
               "region": x.get("region") if isinstance(x.get("region"), str) else None, "locality": x.get("locality")}
    except Exception as e:  # noqa: BLE001
        out = {"id": uid, "error": repr(e)[:200]}
    print(json.dumps(out), flush=True)
'''


FIELDS = ("end", "deadline", "open", "name", "organiser", "region", "locality")


def run_tree(app: str, db: str, data_dir: str, ids_file: str) -> dict:
    env = dict(os.environ, PYTHONPATH=app)
    p = subprocess.run([sys.executable, "-c", WORKER, db, data_dir, ids_file], env=env, capture_output=True,
                       text=True, cwd=app, timeout=3600)
    if p.returncode != 0:
        raise SystemExit(f"worker failed in {app}: {p.stderr[-800:]}")
    return {d["id"]: d for d in map(json.loads, p.stdout.splitlines())}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--old", required=True)
    ap.add_argument("--new", required=True)
    ap.add_argument("--db", default="/srv/fpd/data/fpd.sqlite")
    ap.add_argument("--data-dir", default="/srv/fpd/data")
    ap.add_argument("--linked", type=int, default=3000, help="opportunity-linked pages to compare (spread sample)")
    ap.add_argument("--sample", type=int, default=1500, help="other stored pages to compare (spread sample)")
    ap.add_argument("--ids-out", default=os.path.expanduser("~/classifier-diff-ids.txt"))
    ap.add_argument("--ids", help="compare exactly these url ids (comma-separated) instead of a sample")
    ap.add_argument("--generator", help="compare the opportunity-backing pages of one lane (e.g. datatourisme:fr)")
    a = ap.parse_args()
    import sqlite3
    conn = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)
    if a.ids:
        linked, other = [int(x) for x in a.ids.split(",") if x.strip()], []
    elif a.generator:
        # the lane's pages that back an opportunity (the precision-critical set)
        linked = [r[0] for r in conn.execute("SELECT id FROM urls WHERE generator=? AND state='done' AND cache_path IS NOT NULL "
                                             "AND purpose!='sitemap' AND id IN (SELECT url_id FROM opportunity_sources) ORDER BY id",
                                             (a.generator,))]
        other = []
    else:
        linked, other = _sample(conn, a)
    ids = linked + other
    with open(a.ids_out, "w") as f:
        f.write("\n".join(map(str, ids)))
    _compare(conn, a, ids, linked)


def _sample(conn, a):
    linked = [r[0] for r in conn.execute("SELECT DISTINCT url_id FROM opportunity_sources ORDER BY (url_id * 2654435761) % 1000003 "
                                         "LIMIT ?", (a.linked,))]
    other = [r[0] for r in conn.execute(
        "SELECT id FROM urls WHERE state='done' AND cache_path IS NOT NULL AND purpose!='sitemap' "
        "AND id NOT IN (SELECT url_id FROM opportunity_sources) ORDER BY (id * 2654435761) % 1000003 LIMIT ?", (a.sample,))]
    return linked, other


def _compare(conn, a, ids, linked):
    old = run_tree(a.old, a.db, a.data_dir, a.ids_out)
    new = run_tree(a.new, a.db, a.data_dir, a.ids_out)
    c = collections.Counter()
    trans = collections.Counter()
    examples, field_ex = [], []
    for uid, o in old.items():
        n = new.get(uid)
        if not n:
            c["missing_in_new"] += 1
            continue
        if "error" in n:
            c["errors_in_new"] += 1
            continue
        c["compared"] += 1
        changed = [k for k in ("label", "state", "country", "start", "routes") + FIELDS if k in o and o.get(k) != n.get(k)]
        if not changed:
            c["identical"] += 1
            continue
        for k in changed:
            c[f"changed_{k}"] += 1
        trans[f"{o.get('label')}/{o.get('state')} -> {n.get('label')}/{n.get('state')}"] += 1
        fch = [k for k in ("start",) + FIELDS if k in changed]
        if fch and len(field_ex) < (120 if a.generator else 60):
            url = conn.execute("SELECT url FROM urls WHERE id=?", (uid,)).fetchone()[0]
            field_ex.append(f"{uid:>7} {url[:80]}\n" + "\n".join(f"          {k}: {o.get(k)!r} -> {n.get(k)!r}" for k in fch))
        if len(examples) < (80 if a.generator else 30) and ("label" in changed or "state" in changed or "country" in changed):
            url = conn.execute("SELECT url FROM urls WHERE id=?", (uid,)).fetchone()[0]
            examples.append(f"{uid:>7} {o.get('label')}/{o.get('state')}/{o.get('country')}/{o.get('start')} -> "
                            f"{n.get('label')}/{n.get('state')}/{n.get('country')}/{n.get('start')}  {n.get('reasons')}  {url[:90]}"
                            f"\n          old: {o.get('ev')}\n          new: {n.get('ev')}")
    print(json.dumps({"pages": len(ids), "opportunity_linked": len(linked), **c}, indent=1))
    print("== transitions (old label/state -> new label/state)")
    for t, k in trans.most_common(25):
        print(f"  {k:5d}  {t}")
    print("== examples")
    for e in examples:
        print("  " + e)
    print("== field changes (name/organiser/region/locality/dates/deadline/open strength)")
    for e in field_ex:
        print("  " + e)


if __name__ == "__main__":
    main()
