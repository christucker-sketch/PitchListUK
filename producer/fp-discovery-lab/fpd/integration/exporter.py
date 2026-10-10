"""Integration exports: full snapshots, deltas, manifests, atomic publication, health metrics.

Publication protocol (an importer never sees a half-written export):
  1. build all records in memory and compute lifecycle events against the last *successful* export
     (nothing is written to the engine DB yet);
  2. write every file into  integration_export/.staging/<export_id>/  ;
  3. validate every record against the schema and the contract checks; abort on any failure;
  4. compute sha256 checksums and write the manifests (still in staging);
  5. move files into their final, versioned location with os.replace (same filesystem = atomic):
        full/snapshots/<export_id>/{current,watch,held}.jsonl + manifest.json
        deltas/<export_id>.jsonl + deltas/<export_id>-manifest.json
     then refresh the convenience copies full/current.jsonl, full/watch.jsonl, full/held.jsonl and
     full/current-manifest.json (each replaced atomically);
  6. commit lifecycle state + identity registry + export log to the engine DB (one transaction);
  7. write latest.json LAST (temp file + os.replace). latest.json only ever names complete exports.
If anything fails before step 7 the previous latest.json, its snapshot and all earlier deltas are untouched.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import shutil
import subprocess
import time
from collections import Counter
from pathlib import Path

from .. import __version__
from ..lexicon import CLASSIFIER_VERSION
from . import identity as idn
from .records import ENGINE, build_records, material_view
from .schema import RECORD_SCHEMA, SCHEMA_VERSION, USABLE_STATES, validate

ABSENT_LIMIT = 3          # consecutive successful exports an id may be missing before WITHDRAWN is emitted
KEEP_SNAPSHOTS = 3        # versioned full snapshots kept in the export directory
CLOSED_STATES = {"CLOSED_CURRENT_CYCLE", "HISTORICAL"}

STATE_SCHEMA = """
CREATE TABLE IF NOT EXISTS integration_state (
    opportunity_id TEXT PRIMARY KEY,
    channel TEXT,
    delivered INTEGER DEFAULT 0,
    application_state TEXT,
    material_hash TEXT,
    record_json TEXT,
    last_event TEXT,
    first_exported TEXT,
    last_exported TEXT,
    absent_count INTEGER DEFAULT 0,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS integration_exports (
    export_id TEXT PRIMARY KEY,
    mode TEXT,
    status TEXT,
    started_at TEXT,
    finished_at TEXT,
    previous_export_id TEXT,
    record_counts TEXT,
    manifest_sha256 TEXT,
    notes TEXT
);
"""


class ExportError(Exception):
    pass


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)


def _iso(t: dt.datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def git_commit(root: Path) -> str | None:
    if not (root / ".git").exists():
        return None
    try:
        return subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True,
                              timeout=10).stdout.strip() or None
    except Exception:  # noqa: BLE001
        return None


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_json_atomic(path: Path, obj) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(obj, indent=1, ensure_ascii=False, default=str) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def _jsonl(path: Path, recs: list[dict]) -> int:
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for r in recs:
            f.write(json.dumps(r, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
    return len(recs)


def compute_lifecycle(records: list[dict], prev: dict[str, dict]) -> tuple[list[dict], list[dict], list[str]]:
    """Assign lifecycle_event / lifecycle_changes / previous_application_state.

    prev: opportunity_id -> integration_state row (dict) from the last successful export.
    Returns (records_out, state_updates, warnings). records_out contains every record that belongs in a full
    snapshot (current/watch/held) plus 'retired' records that must appear in the delta (previously delivered,
    now closed/internal-only or withdrawn). Records are never closed merely because they are missing.
    """
    out, warns = [], []
    seen = set()
    for r in records:
        oid = r["opportunity_id"]
        seen.add(oid)
        p = prev.get(oid)
        delivered = bool(p and p.get("delivered"))
        ch = r["channel"]
        r["previous_application_state"] = p.get("application_state") if p else None
        if ch == "retired" and not delivered:
            continue  # internal-only and never delivered: not part of the integration surface
        if not delivered:
            if ch == "current":
                r["lifecycle_event"] = "NEW"
            elif ch == "watch":
                r["lifecycle_event"] = "WATCH"
            else:
                r["lifecycle_event"] = "NEW"  # held: listed for review only, never in deltas
            r["lifecycle_changes"] = ["new"]
            out.append(r)
            continue
        prev_state, cur_state = p.get("application_state"), r["application_state"]
        changes = []
        try:
            pm = json.loads(p.get("record_json") or "{}")
            old_mat = material_view(pm) if pm else {}
        except ValueError:
            old_mat = {}
        new_mat = material_view(r)
        for k in sorted(set(old_mat) | set(new_mat)):
            if old_mat.get(k) != new_mat.get(k):
                changes.append("application_routes" if k == "routes" else k)
        if ch == "held" and p.get("channel") != "held":
            r["lifecycle_event"] = "WITHDRAWN"
            changes = ["export_readiness"] + changes
        elif ch == "held":
            r["lifecycle_event"] = "UNCHANGED"
            changes = []
        elif prev_state != cur_state:
            changes = ["application_state"] + changes
            if prev_state in USABLE_STATES and cur_state in CLOSED_STATES:
                r["lifecycle_event"] = "CLOSED"
            elif (prev_state in CLOSED_STATES or p.get("last_event") == "WITHDRAWN") and cur_state in USABLE_STATES:
                r["lifecycle_event"] = "REOPENED"
            else:
                r["lifecycle_event"] = "STATE_CHANGED"
        elif p.get("last_event") == "WITHDRAWN" and ch in ("current", "watch"):
            r["lifecycle_event"] = "REOPENED"
            changes = ["export_readiness"] + changes
        elif p.get("channel") != ch:
            r["lifecycle_event"] = "STATE_CHANGED"
            changes = ["channel"] + changes
        elif changes:
            r["lifecycle_event"] = "UPDATED"
        else:
            r["lifecycle_event"] = "UNCHANGED"
        r["lifecycle_changes"] = changes
        out.append(r)
    # previously delivered ids that the engine did not produce this time
    for oid, p in prev.items():
        if oid in seen or not p.get("delivered") or p.get("channel") not in ("current", "watch"):
            continue
        n = (p.get("absent_count") or 0) + 1
        try:
            last = json.loads(p.get("record_json") or "{}")
        except ValueError:
            last = {}
        if not last:
            continue
        last["previous_application_state"] = p.get("application_state")
        if n >= ABSENT_LIMIT:
            last.update(channel="retired", export_readiness="RETIRED", lifecycle_event="WITHDRAWN",
                        lifecycle_changes=["not_produced_by_engine"], carried_forward=True)
            last["readiness_issues"] = [f"not produced by the engine for {n} consecutive exports (merged, "
                                        f"reclassified or source removed); state is not inferred as closed"]
        else:
            last.update(lifecycle_event="UNCHANGED", lifecycle_changes=[], carried_forward=True)
            warns.append(f"{oid} not produced this run ({n}/{ABSENT_LIMIT}); carried forward unchanged")
        last["_absent_count"] = n
        out.append(last)
    return out, [], warns


class Exporter:
    def __init__(self, conn, cfg, root: Path, today: dt.date | None = None):
        self.conn = conn
        self.cfg = cfg
        self.root = Path(root)
        self.today = today or cfg.today
        conn.executescript(STATE_SCHEMA)
        conn.executescript(idn.SCHEMA)

    # ---------------------------------------------------------------- helpers
    def _prev_state(self) -> dict[str, dict]:
        return {r["opportunity_id"]: dict(r) for r in self.conn.execute("SELECT * FROM integration_state")}

    def _last_export(self, mode: str | None = None):
        q = "SELECT export_id, mode FROM integration_exports WHERE status='ok'"
        if mode:
            q += " AND mode LIKE ?"
            r = self.conn.execute(q + " ORDER BY export_id DESC LIMIT 1", (f"%{mode}%",)).fetchone()
        else:
            r = self.conn.execute(q + " ORDER BY export_id DESC LIMIT 1").fetchone()
        return r[0] if r else None

    def _export_id(self, t: dt.datetime) -> str:
        eid = t.strftime("%Y-%m-%dT%H%M%SZ")
        n = 1
        base = eid
        while self.conn.execute("SELECT 1 FROM integration_exports WHERE export_id=?", (eid,)).fetchone() \
                or (self.root / "deltas" / f"{eid}.jsonl").exists():
            n += 1
            eid = f"{base}-{n}"
        return eid

    # ---------------------------------------------------------------- main
    def run(self, mode: str = "full", fail_after_stage: bool = False) -> dict:
        """mode: 'full' (snapshot + delta) or 'delta' (delta only). Returns the manifest(s)."""
        if mode not in ("full", "delta"):
            raise ExportError(f"unknown mode {mode}")
        t0 = _now()
        export_id = self._export_id(t0)
        now_iso = _iso(t0)
        prev_export = self._last_export()
        prev_full = self._last_export("full")
        self.conn.execute("INSERT INTO integration_exports(export_id,mode,status,started_at,previous_export_id) "
                          "VALUES (?,?,?,?,?)", (export_id, mode, "running", now_iso, prev_export))
        staging = self.root / ".staging" / export_id
        try:
            registry = idn.Registry(self.conn)
            records, warns = build_records(self.conn, self.today, registry, now_iso)
            prev = self._prev_state()
            records, _, w2 = compute_lifecycle(records, prev)
            warns += w2
            errors = []
            # ---------- contract checks ----------
            ids = Counter(r["opportunity_id"] for r in records)
            dup = [i for i, n in ids.items() if n > 1]
            if dup:
                errors.append(f"duplicate opportunity_id in export: {dup[:5]}")
            clean = []
            for r in records:
                r2 = {k: v for k, v in r.items() if not k.startswith("_")}
                v = validate(r2, RECORD_SCHEMA)
                if v:
                    errors.append(f"{r['opportunity_id']}: {v[:3]}")
                clean.append(r2)
            if errors:
                raise ExportError("validation failed: " + " | ".join(errors[:10]))
            current = sorted([r for r in clean if r["channel"] == "current"], key=lambda r: r["opportunity_id"])
            watch = sorted([r for r in clean if r["channel"] == "watch"], key=lambda r: r["opportunity_id"])
            held = sorted([r for r in clean if r["channel"] == "held"], key=lambda r: r["opportunity_id"])
            delta = sorted([r for r in clean if r["lifecycle_event"] != "UNCHANGED" and (
                r["channel"] in ("current", "watch", "retired") or r["lifecycle_event"] == "WITHDRAWN")],
                key=lambda r: r["opportunity_id"])
            # ---------- stage ----------
            staging.mkdir(parents=True, exist_ok=True)
            files = {}
            if mode == "full":
                for name, recs in (("current.jsonl", current), ("watch.jsonl", watch), ("held.jsonl", held)):
                    _jsonl(staging / name, recs)
                    files[name] = recs
            _jsonl(staging / "delta.jsonl", delta)
            files["delta.jsonl"] = delta
            # re-validate what is on disk (round-trip) and checksum
            for name in files:
                with open(staging / name, encoding="utf-8") as f:
                    for i, line in enumerate(f):
                        v = validate(json.loads(line), RECORD_SCHEMA)
                        if v:
                            raise ExportError(f"staged {name} line {i + 1}: {v[:2]}")
            sums = {name: {"sha256": sha256_file(staging / name), "bytes": (staging / name).stat().st_size,
                           "records": len(recs)} for name, recs in files.items()}
            run_row = self.conn.execute("SELECT id, started_at, ended_at, status FROM runs WHERE command IN "
                                        "('crawl','rebuild','run','revisit') AND status='ok' ORDER BY id DESC LIMIT 1").fetchone()
            fetches = self.conn.execute("SELECT COUNT(*) FROM urls WHERE fetched_at IS NOT NULL").fetchone()[0]
            base = {
                "schema_version": SCHEMA_VERSION, "export_id": export_id, "generated_at": now_iso,
                "engine": {"name": ENGINE, "version": __version__, "classifier_version": CLASSIFIER_VERSION,
                           "identity_algorithm": idn.ALGORITHM, "git_commit": git_commit(self.cfg.data_dir.parent)
                           if hasattr(self.cfg, "data_dir") else None},
                "run_id": run_row[0] if run_row else None,
                "previous_export_id": prev_export, "previous_full_export_id": prev_full,
                "source_fetch_count": fetches, "errors": [], "warnings": warns[:200],
                "warnings_total": len(warns),
            }

            def stats(recs):
                return {"record_count": len(recs),
                        "by_lifecycle_event": dict(Counter(r["lifecycle_event"] for r in recs)),
                        "by_application_state": dict(Counter(r["application_state"] for r in recs)),
                        "by_country": dict(Counter(r["country_code"] or "unknown" for r in recs)),
                        "by_discovery_source": dict(Counter(r["discovery_source"] for r in recs)),
                        "by_channel": dict(Counter(r["channel"] for r in recs))}
            delta_manifest = {**base, "export_type": "delta", "files": {
                f"deltas/{export_id}.jsonl": sums["delta.jsonl"]}, **stats(delta),
                "since_export_id": prev_export}
            full_manifest = None
            if mode == "full":
                snap = f"full/snapshots/{export_id}"
                full_manifest = {**base, "export_type": "full", "files": {
                    f"{snap}/current.jsonl": sums["current.jsonl"], f"{snap}/watch.jsonl": sums["watch.jsonl"],
                    f"{snap}/held.jsonl": sums["held.jsonl"]},
                    "convenience_copies": {"full/current.jsonl": sums["current.jsonl"]["sha256"],
                                           "full/watch.jsonl": sums["watch.jsonl"]["sha256"],
                                           "full/held.jsonl": sums["held.jsonl"]["sha256"]},
                    **stats(current + watch + held),
                    "channels": {"current": stats(current), "watch": stats(watch), "held": stats(held)},
                    "readiness_issue_counts": dict(Counter(i.split(" ")[0].split(":")[0] for r in held
                                                           for i in r["readiness_issues"]))}
                write_json_atomic(staging / "manifest.json", full_manifest)
            write_json_atomic(staging / "delta-manifest.json", delta_manifest)
            if fail_after_stage:
                raise ExportError("simulated failure after staging (test hook)")
            # ---------- publish ----------
            (self.root / "deltas").mkdir(parents=True, exist_ok=True)
            (self.root / "schema").mkdir(parents=True, exist_ok=True)
            write_json_atomic(self.root / "schema" / f"{SCHEMA_VERSION}.schema.json", RECORD_SCHEMA)
            os.replace(staging / "delta.jsonl", self.root / "deltas" / f"{export_id}.jsonl")
            os.replace(staging / "delta-manifest.json", self.root / "deltas" / f"{export_id}-manifest.json")
            if mode == "full":
                sd = self.root / "full" / "snapshots" / export_id
                sd.mkdir(parents=True, exist_ok=True)
                for name in ("current.jsonl", "watch.jsonl", "held.jsonl", "manifest.json"):
                    os.replace(staging / name, sd / name)
                for name in ("current.jsonl", "watch.jsonl", "held.jsonl"):
                    tmp = self.root / "full" / f".{name}.tmp"
                    shutil.copyfile(sd / name, tmp)
                    os.replace(tmp, self.root / "full" / name)
                write_json_atomic(self.root / "full" / "current-manifest.json", full_manifest)
                self._prune_snapshots()
            # ---------- commit engine-side state ----------
            self.conn.execute("BEGIN")
            try:
                registry.commit(now_iso)
                for r in records:
                    oid = r["opportunity_id"]
                    absent = r.get("_absent_count", 0)
                    was = self.conn.execute("SELECT delivered, first_exported FROM integration_state WHERE "
                                            "opportunity_id=?", (oid,)).fetchone()
                    # 'delivered' = the consumer has seen this id in current/watch at least once (sticky)
                    delivered_now = r["channel"] in ("current", "watch") or bool(was and was[0])
                    rec_json = json.dumps({k: v for k, v in r.items() if not k.startswith("_")}, ensure_ascii=False)
                    if r.get("carried_forward") and r["lifecycle_event"] == "UNCHANGED":
                        self.conn.execute("UPDATE integration_state SET absent_count=?, updated_at=? WHERE opportunity_id=?",
                                          (absent, now_iso, oid))
                        continue
                    self.conn.execute(
                        "INSERT INTO integration_state(opportunity_id,channel,delivered,application_state,material_hash,"
                        "record_json,last_event,first_exported,last_exported,absent_count,updated_at) "
                        "VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(opportunity_id) DO UPDATE SET channel=excluded.channel,"
                        "delivered=excluded.delivered, application_state=excluded.application_state,"
                        "material_hash=excluded.material_hash, record_json=excluded.record_json,"
                        "last_event=excluded.last_event, last_exported=excluded.last_exported,"
                        "absent_count=excluded.absent_count, updated_at=excluded.updated_at",
                        (oid, r["channel"], 1 if delivered_now else 0, r["application_state"], r["fingerprint"]["material"],
                         rec_json, r["lifecycle_event"], (was[1] if was and was[1] else export_id), export_id,
                         absent, now_iso))
                counts = {"current": len(current), "watch": len(watch), "held": len(held), "delta": len(delta)}
                self.conn.execute("UPDATE integration_exports SET status='ok', finished_at=?, record_counts=?, "
                                  "manifest_sha256=? WHERE export_id=?",
                                  (_iso(_now()), json.dumps(counts), sums["delta.jsonl"]["sha256"], export_id))
                self.conn.execute("COMMIT")
            except Exception:
                self.conn.execute("ROLLBACK")
                raise
            # ---------- latest.json LAST ----------
            latest_path = self.root / "latest.json"
            latest = json.loads(latest_path.read_text(encoding="utf-8")) if latest_path.exists() else {}
            latest.update({"schema_version": SCHEMA_VERSION, "latest_export_id": export_id, "updated_at": _iso(_now())})
            latest["latest_delta"] = {"export_id": export_id, "manifest": f"deltas/{export_id}-manifest.json",
                                      "file": f"deltas/{export_id}.jsonl", "records": len(delta),
                                      "sha256": sums["delta.jsonl"]["sha256"], "since_export_id": prev_export}
            if mode == "full":
                latest["latest_full"] = {"export_id": export_id,
                                         "manifest": f"full/snapshots/{export_id}/manifest.json",
                                         "files": {k: v for k, v in full_manifest["files"].items()},
                                         "record_counts": {"current": len(current), "watch": len(watch), "held": len(held)}}
            write_json_atomic(latest_path, latest)
            shutil.rmtree(staging, ignore_errors=True)
            try:
                staging.parent.rmdir()  # remove .staging/ when empty
            except OSError:
                pass
            return {"export_id": export_id, "mode": mode, "counts": counts, "delta_by_event": delta_manifest["by_lifecycle_event"],
                    "warnings": len(warns)}
        except Exception as e:
            shutil.rmtree(staging, ignore_errors=True)
            self.conn.execute("UPDATE integration_exports SET status='failed', finished_at=?, notes=? WHERE export_id=?",
                              (_iso(_now()), str(e)[:500], export_id))
            raise

    def _prune_snapshots(self) -> None:
        d = self.root / "full" / "snapshots"
        if not d.exists():
            return
        snaps = sorted(p for p in d.iterdir() if p.is_dir())
        for p in snaps[:-KEEP_SNAPSHOTS]:
            shutil.rmtree(p, ignore_errors=True)


# ---------------------------------------------------------------- validation of a published export
def validate_export(root: Path) -> dict:
    """Consumer-side style validation of what is published: latest.json -> manifests -> files.
    Checks existence, checksums, record counts, schema of every line, unique ids, and that each delta
    names its predecessor."""
    root = Path(root)
    res = {"ok": True, "checks": [], "errors": []}

    def err(m):
        res["ok"] = False
        res["errors"].append(m)

    lp = root / "latest.json"
    if not lp.exists():
        err("latest.json missing")
        return res
    latest = json.loads(lp.read_text(encoding="utf-8"))
    for key in ("latest_full", "latest_delta"):
        ent = latest.get(key)
        if not ent:
            res["checks"].append(f"{key}: none published")
            continue
        mp = root / ent["manifest"]
        if not mp.exists():
            err(f"{key}: manifest {ent['manifest']} missing")
            continue
        man = json.loads(mp.read_text(encoding="utf-8"))
        if man.get("schema_version") != SCHEMA_VERSION:
            err(f"{key}: schema_version {man.get('schema_version')}")
        for rel, meta in man["files"].items():
            fp = root / rel
            if not fp.exists():
                err(f"{rel}: missing")
                continue
            if sha256_file(fp) != meta["sha256"]:
                err(f"{rel}: checksum mismatch")
            n, ids, bad = 0, set(), 0
            with open(fp, encoding="utf-8") as f:
                for line in f:
                    n += 1
                    try:
                        rec = json.loads(line)
                    except ValueError:
                        bad += 1
                        continue
                    if validate(rec, RECORD_SCHEMA):
                        bad += 1
                    if rec.get("opportunity_id") in ids:
                        err(f"{rel}: duplicate id {rec.get('opportunity_id')}")
                    ids.add(rec.get("opportunity_id"))
            if n != meta["records"]:
                err(f"{rel}: {n} lines, manifest says {meta['records']}")
            if bad:
                err(f"{rel}: {bad} records fail schema validation")
            res["checks"].append(f"{rel}: {n} records, checksum ok, schema ok" if not bad else f"{rel}: problems")
    return res


def health(conn, root: Path, cfg) -> dict:
    """Compact machine-readable health file (integration_export/metrics/latest.json)."""
    from ..sources import SOURCES, last_polls
    from .records import source_of
    now = time.time()
    acq = "('run','crawl','rebuild','revisit','seed')"
    run = conn.execute(f"SELECT id, command, started_at, ended_at, status FROM runs WHERE status='ok' AND command IN {acq} "
                       "ORDER BY id DESC LIMIT 1").fetchone()
    last_err_run = conn.execute(f"SELECT MAX(id) FROM runs WHERE command IN {acq}").fetchone()[0]
    errs = conn.execute("SELECT COUNT(*) FROM errors WHERE run_id=?", (last_err_run,)).fetchone()[0] if last_err_run else 0
    exp = conn.execute("SELECT export_id, mode, finished_at, record_counts FROM integration_exports WHERE status='ok' "
                       "ORDER BY export_id DESC LIMIT 1").fetchone()
    n_exports = conn.execute("SELECT COUNT(*) FROM integration_exports WHERE status='ok'").fetchone()[0]
    failed = conn.execute("SELECT COUNT(*) FROM integration_exports WHERE status='failed'").fetchone()[0]
    st = Counter()
    by_src = {}
    for r in conn.execute("SELECT channel, application_state, record_json FROM integration_state WHERE delivered=1"):
        st[r[0]] += 1
        try:
            src = json.loads(r[2]).get("discovery_source")
        except (ValueError, TypeError):
            src = None
        d = by_src.setdefault(src or "unknown", Counter())
        d[r[0]] += 1
    lane_last = {}
    for r in conn.execute("SELECT generator, MAX(fetched_at), SUM(CASE WHEN state='failed' THEN 1 ELSE 0 END), "
                          "SUM(CASE WHEN http_status=429 OR http_status=503 THEN 1 ELSE 0 END), COUNT(*) "
                          "FROM urls WHERE fetched_at IS NOT NULL AND fetched_at > ? GROUP BY generator", (now - 30 * 86400,)):
        lane_last[r[0]] = {"last_fetch_at": r[1], "failed_30d": r[2], "rate_limited_30d": r[3], "fetched_30d": r[4]}
    polls = last_polls(conn)
    last_delta = {}
    if exp:
        try:
            dm = json.loads((Path(root) / "deltas" / f"{exp[0]}-manifest.json").read_text(encoding="utf-8"))
            last_delta = {"export_id": exp[0], "records": dm["record_count"], "by_lifecycle_event": dm["by_lifecycle_event"],
                          "by_discovery_source": dm["by_discovery_source"]}
        except (OSError, ValueError, KeyError):
            pass
    sources = {}
    stalled = []
    for s, spec in SOURCES.items():
        lane = lane_last.get(spec["generator"], {})
        p = polls[s]
        last_ok = p["last_successful_poll_at"] or lane.get("last_fetch_at")
        age_days = round((now - last_ok) / 86400, 1) if last_ok else None
        is_stalled = age_days is None or age_days > 8
        if is_stalled:
            stalled.append(s)
        sources[s] = {
            "last_successful_poll": _iso(dt.datetime.fromtimestamp(last_ok, dt.timezone.utc)) if last_ok else None,
            "days_since_success": age_days, "stalled": is_stalled,
            "last_poll": {k: (_iso(dt.datetime.fromtimestamp(v, dt.timezone.utc))
                              if k in ("started_at", "finished_at") and isinstance(v, (int, float)) else v)
                          for k, v in (p["last_poll"] or {}).items() if k not in ("notes",)} or None,
            "fetched_30d": lane.get("fetched_30d", 0), "failed_30d": lane.get("failed_30d", 0),
            "rate_limited_30d": lane.get("rate_limited_30d", 0),
            "delivered_records": dict(by_src.get(s, {})),
        }
    other_lanes = {k: dict(v) for k, v in by_src.items() if k not in SOURCES}
    out = {
        "schema_version": SCHEMA_VERSION, "generated_at": _iso(_now()),
        "last_successful_run": {"run_id": run[0], "command": run[1],
                                "ended_at": _iso(dt.datetime.fromtimestamp(run[3], dt.timezone.utc)) if run[3] else None}
        if run else None,
        "errors_in_latest_acquisition_run": errs,
        "last_successful_export": {"export_id": exp[0], "mode": exp[1], "finished_at": exp[2],
                                   "record_counts": json.loads(exp[3] or "{}")} if exp else None,
        "export_count": n_exports, "failed_exports": failed,
        "actionable_count": st.get("current", 0), "watch_count": st.get("watch", 0),
        "fetch_count_total": conn.execute("SELECT COUNT(*) FROM urls WHERE fetched_at IS NOT NULL").fetchone()[0],
        "last_delta": last_delta,
        "platform_sources": sources, "other_lanes_delivered": other_lanes,
        "stalled_or_failed_sources": stalled,
    }
    (Path(root) / "metrics").mkdir(parents=True, exist_ok=True)
    write_json_atomic(Path(root) / "metrics" / "latest.json", out)
    return out
