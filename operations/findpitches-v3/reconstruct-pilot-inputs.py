"""Recover the actual pilot IDs from a read-only capture and verify pinned source fields.

The reference migrations/payload are executed only in an ephemeral in-memory SQLite
database. Nothing in this utility writes to or runs the V2 application.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--capture', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
fixture = json.loads((root / 'tests/findpitches-v3/fixtures/structured-control-100.json').read_text())
meta = fixture['metadata']
capture = json.loads(args.capture.read_text())
assert capture['read_only'] and len(capture['records']) == 100

def reference(file):
    return subprocess.check_output(['git', '-C', str(root), 'show', f"{meta['source_ref']}:{file}"])

artifact = reference(meta['artifact'])
assert hashlib.sha256(artifact).hexdigest() == meta['artifact_sha256']
db = sqlite3.connect(':memory:')
db.row_factory = sqlite3.Row
db.executescript(reference('operations/findpitches-v2/migrations/0009_structured_feed_staging.sql').decode())
db.executescript(artifact.decode())
records = []
for pilot in capture['records']:
    row = db.execute('SELECT * FROM structured_feed_records WHERE producer_id=?', [pilot['producer_id']]).fetchone()
    assert row is not None, 'Pilot source ID absent from pinned artifact'
    assert row['content_hash'] == pilot['staged_content_hash'], 'Staged source revision differs from pinned artifact'
    for field in ['event_name','organiser','location','event_start','event_end','application_deadline','canonical_url','application_url','application_state']:
        assert row[field] == pilot['baseline_' + field], 'Pilot baseline differs from pinned source: ' + field
    for field in ['evidence','provenance']:
        assert json.loads(row[field + '_json'] or '[]') == json.loads(pilot['baseline_' + field + '_json'] or '[]'), 'Pilot source evidence differs'
    record = {}
    for key in fixture['records'][0]:
        if key == 'schema_version': record[key] = 'findpitches-discovery-export-v1'
        elif key == 'opportunity_id': record[key] = row['producer_id']
        elif key == 'country_code': record[key] = row['market']
        elif key in ('evidence','provenance'): record[key] = json.loads(row[key + '_json'] or '[]')
        else: record[key] = row[key]
    records.append(record)
assert len({r['opportunity_id'] for r in records}) == 100
args.out.parent.mkdir(parents=True, exist_ok=True)
with args.out.open('x') as stream:
    json.dump({'metadata': {**meta, 'actual_pilot_batch': capture['pilot_batch'], 'baseline_verified_against_ledger': True, 'audit_as_of': capture['as_of'], 'capture_hash': capture['records_hash']}, 'records': records}, stream, ensure_ascii=False, indent=2)
    stream.write('\n')
print('Verified the actual 100 pilot IDs, nine source fields, evidence/provenance and staged revision hashes against the pinned artifact')
