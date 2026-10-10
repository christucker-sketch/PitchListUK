# Independent producer: source custody (V3-003)

`fp-discovery-lab/` is the full source of the independent FindPitches discovery producer:

| Part | Path |
| --- | --- |
| Discovery engine | `fpd/` |
| Tests | `tests/` |
| Export contract `findpitches-discovery-export-v1` | `integration_export/README.md` |
| Raspberry Pi host kit (`fpd-pi`) | `deploy/pi/` |

The Pi host kit contains the systemd units, install script, ingest-only V3 delivery runner, lifecycle feed switch, evidence pack and off-site backup tooling.

Committed by Claude on 2026-10-10 with Chris's approval. Claude wrote and maintains this producer.

**It is a separate package.** Nothing in V3's Workers, D1 or customer site imports it. The only interface is the export contract, delivered over HTTPS to the V3 ingest API with an ingest-only token. It has no V1/V2 runtime dependency. Its outbound hosts are:
- the crawled source sites;
- Wikidata and OSM;
- the V3 ingest URL.

## What is and isn't here

**Included:** 81 source, config, test and documentation files. `SOURCE_SHA256SUMS` in this folder lists the hash of every one.

**Deliberately excluded:**

| Excluded | Why |
| --- | --- |
| Databases, raw-page cache, exports and snapshots, delivery state, logs | Data, not source |
| `comparison/` | A one-off evaluation against old FindPitches snapshots; not part of the producer |
| The importer dry-run outputs | Not producer source |
| Built kit archives (`fpd-app.tgz`, `.deploy/*.tgz`) | Build artifacts, rebuilt by `deploy/pi/build-kit.sh` |
| Any token or credential | Secrets |

**No secrets are present:**
- The V3 ingest token is pasted on the Pi into `sudo fpd-set-token` and lives only in `/etc/fpd/v3-ingest.env`, readable only by the `fpdv3` user.
- `config/fpd.env` holds no secrets, and `FPD_CONTACT` is left blank.
- The producer holds no Cloudflare, D1, Serper or Stripe credential.

## Custody evidence

1. **Matches the copy on Chris's PC.** All 81 files match the working copy that the Pi kit was built and installed from (`sha256sum -c` on the PC returned 0), checked 2026-10-10.
2. **Matches the installed engine.** The engine inside the installed kit archive (`deploy/pi/fpd-app.tgz`, sha256 `dc06305d1c3c929a…`) was extracted and compared with `fpd/`, `tests/` and the contract README. They are identical. The only difference is an empty `tests/fixtures/` directory, which Git cannot store.
3. **Matches the kit's own checksum list.** `deploy/pi/SHA256SUMS` (sha256 `d7639f7b12fc4a60…`) lists every kit file, including that archive. All the kit files committed here match it.
4. **Tests pass.** `python -m pytest -q tests` gives 88 passed in the cloud workspace. On the Pi, after the 10 Oct install: 87 passed and 1 skipped.

**Check the running Pi against this commit** (read-only, prints no secrets):

```sh
sha256sum /opt/fpd/kit/SHA256SUMS          # expect d7639f7b12fc4a60…
cd /opt/fpd/kit && sudo sha256sum -c --quiet SHA256SUMS && echo "installed kit matches"
```

## Rebuild and run

**Engine on any machine** (Python 3.11 or later):

```sh
cd producer/fp-discovery-lab
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python -m pytest -q tests
python -m fpd --help
```

**Pi host:**
1. Run `deploy/pi/build-kit.sh`. It packages the engine into `fpd-app.tgz` and rewrites `SHA256SUMS`.
2. Copy `deploy/pi/` to the Pi and follow `deploy/pi/README.md`: run `install.sh` (with `--import <backup>` to restore), then `sudo fpd-set-token`.
3. Lifecycle delivery stays off until someone runs `sudo fpd-v3-feed enable`.
4. Restore from the off-site backup is described in `RESTORE.txt`, which `fpd-offsite-backup` writes.

The rebuilt archive has the same content but is not byte-identical, because tar and gzip record timestamps. Compare its extracted content, not its hash.

## Changes from here

The producer is maintained in this folder from now on. Change it on the feature branch with tests, rebuild the kit, install it on the Pi, then record the new `SHA256SUMS` hash in `team/HANDOVERS.md`.

This package adds no workflow: the repository's CI does not build or deploy `producer/`.
