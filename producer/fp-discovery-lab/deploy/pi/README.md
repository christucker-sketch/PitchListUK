# Raspberry Pi host: discovery engine + V3 delivery

This kit moves the whole producer off the PC onto a Raspberry Pi 3 Model B (or newer) with a USB SSD:

```
fpd-acquire.timer (every 3 h) ─> fpd-cycle: V3 rechecks first, poll platforms, revisit, crawl, FULL export ─> /srv/fpd/export
fpd-v3-delivery.service (every 15 min) ─> reads /srv/fpd/export/full/current.jsonl ─> V3 shadow ingest
fpd-backup.timer (nightly) ─> /srv/fpd/backups (7 kept)      fpd-v3-prune.timer (daily) ─> trims delivery copies
```

* Two service users: `fpd` runs discovery and can never read the token. `fpdv3` runs delivery, can read the
  export but not the database, and is the only user that can read the token.
* **UK coverage.**
  * UKCraftFairs is enumerated from its per-day calendar pages for the year ahead: a full sweep, then the next
    3 weeks daily and later days every 4 days. Earlier versions only probed a narrow window of the newest ids.
  * Directory and association hub pages are re-read weekly (`fpd revisit-hubs`) so newly listed members are found.
* **Marketspread** (mainly US) is a full platform source. Its ~12,700 market pages are enumerated from the
  sitemap, newest first. The ~5–8% that take vendor applications on the platform become opportunities;
  listing-only markets are skipped.
* **V3 recheck requests.** The delivery runner polls V3 for recheck requests every 15 minutes. Before each discovery
  cycle, root hands over only the producer ids, timestamps and reasons to the discovery side
  (`fpd-rechecks-handoff`). `fpd rechecks` then re-queues those records' pages at top priority. The refreshed
  `last_checked` goes out in the next delivery, and the runner acknowledges the request.
* Everything that is written often lives on the SSD (`/srv/fpd`). The SD card only holds the OS, and swap is
  moved to the SSD.
* The V3 token never goes through OneDrive or a file: you paste it once into `sudo fpd-set-token`.

## What you need

* Raspberry Pi 3 Model B (64-bit capable), a 5 V 2.5 A power supply and an Ethernet cable if possible.
* A microSD card of 8 GB or more, plus the Crucial BX500 in a USB-SATA adapter. **The SSD is erased.**

## 1. Flash the SD card (on the PC)

In Raspberry Pi Imager, choose:

* Device: Raspberry Pi 3
* OS: Raspberry Pi OS (other) → **Raspberry Pi OS Lite (64-bit)**
* In the customisation settings:
  * hostname `fpd-pi`
  * a username and password
  * **Enable SSH** (password authentication)
  * time zone Europe/London
  * Wi-Fi only if you can't use Ethernet

## 2. First boot

Plug in the SSD, then power on. Wait about 2 minutes, then from PowerShell on the PC:

```powershell
ssh <user>@fpd-pi.local
lsblk -o NAME,SIZE,TRAN,MODEL      # the BX500 shows as e.g. sda ... usb CT240BX500SSD1
exit
```

## 3. Copy the kit and your data to the Pi (PowerShell on the PC)

```powershell
$P = "$env:USERPROFILE\OneDrive - Managed Technology Corporation Ltd\Documents\fp-discovery-lab"
scp -r "$P\deploy\pi" "$P\data\pi-migration" <user>@fpd-pi.local:~/
```

`pi-migration` holds the current database, page cache and export (about 230 MB, checksummed).

## 4. Install (on the Pi)

```bash
ssh <user>@fpd-pi.local
cd ~/pi && sha256sum -c --quiet SHA256SUMS && echo kit-ok
sudo bash ./install.sh --disk /dev/sda --import ~/pi-migration
```

Use the disk name from step 2. The installer asks you to type `FORMAT` before it erases the SSD. Then it:

* mounts the SSD at `/srv/fpd`;
* installs Python packages and Node 22 (checksum-verified);
* imports and integrity-checks the database;
* runs the test suite as the `fpd` user;
* validates the export;
* checks it can reach the platforms and the V3 endpoint;
* enables the discovery, backup and prune timers.

It does **not** start V3 delivery.

Set a contact for the crawler's User-Agent (an email or URL):

```bash
sudo nano /etc/fpd/fpd.env        # FPD_CONTACT=...
```

## 5. Token, verification and go-live

Rotate the V3 ingest token first; the old one sat on the PC and in OneDrive. Then:

```bash
sudo fpd-set-token                 # paste the NEW ingest-only token; input is hidden
sudo fpd-go-live
```

`fpd-go-live` checks these things before it enables `fpd-v3-delivery.service`:

* an authenticated delivery cycle, including the recheck poll;
* a second cycle on the unchanged export, which must make no import calls;
* that the canonical ids are distinct (no duplicates).

## 6. Retire the PC host

On the PC, in PowerShell:

```powershell
cd "$env:USERPROFILE\OneDrive - Managed Technology Corporation Ltd\Documents\FindPitches V3 Handover"
powershell -NoProfile -ExecutionPolicy Bypass -File .\Remove-FindPitchesV3Delivery-PC.ps1
```

This removes the scheduled task, `%LOCALAPPDATA%\FindPitchesV3` and the OneDrive token copy. After that the Pi
is the only delivery host and its database is the master. Don't run exports from the old PC copy.

## Day to day

| Command | What it does |
|---|---|
| `sudo fpd-status` | timers, last runs, export health, V3 delivery status, disk, RAM, power/throttling |
| `sudo systemctl start fpd-acquire` | run a discovery cycle now (otherwise every 3 h) |
| `journalctl -u fpd-acquire -n 40` | last discovery cycle log |
| `journalctl -u fpd-v3-delivery -f` | follow delivery |
| `sudo fpd-netcheck` | can the Pi reach the platforms and V3? |
| `sudo fpd coverage eventeny --band 5000` | Eventeny crawl progress (any engine command works: `sudo fpd status`, `sudo fpd health`) |

**Cadence.**
* Discovery runs every 3 hours: 35 minutes of platform polling plus 10 minutes of crawling.
* Change it in `/etc/fpd/fpd.env` (`FPD_RUN_MINUTES`, `FPD_CRAWL_MINUTES`) or with `sudo systemctl edit fpd-acquire.timer`.
* Delivery checks every 15 minutes. It only sends requests when the export has changed (25 records per request).
* Unchanged records come back as duplicates. They are not new entities.

**Updating the code.** On the PC:

1. Run `deploy/pi/build-kit.sh`.
2. `scp -r` the `pi` folder again.
3. On the Pi, run `sudo bash ./install.sh` with no `--import`.

Configuration and data are kept. If delivery is live, the installer restarts `fpd-v3-delivery` so the new runner code takes effect.

**Recheck requests.** The runner reads every page of V3's recheck requests (`next_cursor`), not just the first
100. It acknowledges a request with its `producer_record_id`, `entity_id` and original `requested_at`, and only after a
0-rejection batch delivered that record with `last_checked` at or after the request. Each discovery cycle
examines every request and re-queues at most 300 pages (`fpd rechecks --max`); the rest are reported as `deferred`
and handled in later cycles, oldest first. Tests: `node --test deploy/pi/delivery/producer-delivery.test.mjs`.

**What V3 receives.** By default the runner delivers `export/full/current.jsonl` (open opportunities only). Each
cycle also writes `export/v3/feed.jsonl`: the same records plus the latest record of every id that has left
`current` in the last 45 days (closed, withdrawn, moved to watch or held), so V3 can stop showing it and recheck
requests for it can be acknowledged. Same v1 record contract; only `channel == "current"` is customer-visible.
Switch delivery to it only once V3 confirms it handles non-current records:

```bash
sudo fpd-v3-feed status      # which file is delivered, feed counts
sudo fpd-v3-feed enable      # deliver export/v3/feed.jsonl
sudo fpd-v3-feed disable     # back to full/current.jsonl
```

**Evidence pack** (read-only, no token): `sudo fpd-evidence` writes `~/fpd-evidence-<stamp>.tgz` with recheck
lifecycle, per-country breakdown, delivery receipts, dedupe candidates, the current export files and service
state. `--with-db` also copies the newest nightly DB backup to your home directory.

**Off-site backup.** Nightly backups stay on the SSD. `sudo fpd-offsite-setup` (once) configures an rclone
remote named `fpdoffsite` (Backblaze B2 free tier, a personal Google Drive/OneDrive or SFTP; wrap it in an
rclone `crypt` remote and keep its passwords in your password manager). Then `fpd-offsite-backup.timer` copies,
every day, the newest DB backup in `--import` format, this kit and the non-secret config to
`fpdoffsite:fpd/latest` and `fpdoffsite:fpd/daily/<stamp>` (14 days kept). `RESTORE.txt` in the backup has the
rebuild steps. The V3 token is never backed up: on a rebuild, ask V3 for a new one.

**Restoring a backup.**

```bash
sudo systemctl stop fpd-acquire.timer fpd-v3-delivery
sudo -u fpd sh -c 'zstd -d /srv/fpd/backups/fpd-<stamp>.sqlite.zst -o /srv/fpd/data/fpd.sqlite.restore'
sudo -u fpd mv /srv/fpd/data/fpd.sqlite.restore /srv/fpd/data/fpd.sqlite
sudo systemctl start fpd-acquire.timer fpd-v3-delivery
```

**Power.** If `fpd-status` shows `throttled` other than `0x0`, the supply is too weak for the Pi plus SSD.
Replace it before the SSD starts dropping out.

## Files

* `install.sh`: idempotent installer.
* `build-kit.sh`: rebuilds `fpd-app.tgz` from the project.
* `SHA256SUMS`: checksums for the kit.
* `bin/`:
  * `fpd` (runs engine commands as the service user)
  * `fpd-cycle`
  * `fpd-rechecks-handoff`
  * `fpd-backup`
  * `fpd-v3-prune`
  * `fpd-netcheck`
  * `fpd-set-token`
  * `fpd-go-live`
  * `fpd-status`
  * `fpd-v3-feed`, `fpd-evidence`, `fpd-offsite-setup`, `fpd-offsite-backup`
* `lib/evidence.py`: the evidence collector used by `fpd-evidence`
* `systemd/`:
  * `fpd-acquire.service` and `.timer`
  * `fpd-v3-delivery.service`
  * `fpd-backup.service` and `.timer`
  * `fpd-v3-prune.service` and `.timer`
  * `fpd-offsite-backup.service` and `.timer` (does nothing until `fpd-offsite-setup` has run)
* `delivery/`: the V3 producer runner, locally patched. The changes from the supplied bundle are:
  * 25-record batches;
  * a 180 s request timeout;
  * per-batch timing;
  * recovery from stale lock files;
  * an `error_detail` code in failed status.
* `config/`:
  * `fpd.env`
  * `v3-runner.json` (source `/srv/fpd/export/full/current.jsonl`, environment `shadow`)
  * pinned Python package versions
  * journald limits
