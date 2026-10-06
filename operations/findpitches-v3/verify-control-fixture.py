"""Verify/reconstruct the exact V3 control against immutable Git reference data.

This offline reference utility does not open a live V2 database or feed the V3 runtime.
The fixture's retained ID list is the sample manifest; it is not the missing historical pilot.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
fixture = json.loads((root / 'tests/findpitches-v3/fixtures/structured-control-100.json').read_text())
meta = fixture['metadata']

def reference(file):
    return subprocess.check_output(['git', '-C', str(root), 'show', f"{meta['source_ref']}:{file}"])

artifact = reference(meta['artifact'])
assert hashlib.sha256(artifact).hexdigest() == meta['artifact_sha256'], 'Pinned artifact checksum differs'
db = sqlite3.connect(':memory:')
db.row_factory = sqlite3.Row
db.executescript(reference('operations/findpitches-v2/migrations/0009_structured_feed_staging.sql').decode())
db.executescript(artifact.decode())
records = []
for expected in fixture['records']:
    row = db.execute('SELECT * FROM structured_feed_records WHERE producer_id=?', [expected['opportunity_id']]).fetchone()
    assert row is not None, 'Sample ID absent from pinned artifact'
    record = {}
    for key in expected:
        if key == 'schema_version':
            record[key] = 'findpitches-discovery-export-v1'
        elif key == 'opportunity_id':
            record[key] = row['producer_id']
        elif key == 'country_code':
            record[key] = row['market']
        elif key in ('evidence', 'provenance'):
            record[key] = json.loads(row[key + '_json'] or '[]')
        else:
            record[key] = row[key]
    assert record == expected, f"Source field mismatch for {expected['opportunity_id']}"
    records.append(record)
assert len(records) == len({r['opportunity_id'] for r in records}) == 100
assert any('id=52126' in (r['application_url'] or '') for r in records)
if args.output:
    args.output.write_text(json.dumps({'metadata': meta, 'records': records}, ensure_ascii=False, indent=2) + '\n')
print('Verified 100 exact source records against pinned artifact; historical pilot subset remains unavailable')
