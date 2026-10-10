#!/usr/bin/env bash
# FindPitches discovery engine + V3 delivery: Raspberry Pi installer.
#
#   sudo ./install.sh --disk /dev/sda --import ~/pi-migration
#
# Idempotent: re-running upgrades code/config and never reformats a disk already labelled FPDDATA.
# Does NOT handle the V3 token (use: sudo fpd-set-token) and does NOT start V3 delivery (use: sudo fpd-go-live).
set -Eeuo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_VERSION="22.23.3"
declare -A NODE_SHA=(
  [arm64]="a44aeb94849a299b22df10b9e622ec2f605c2183501bc40590705131de7c740f"
  [x64]="df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de"
)
SRV=/srv/fpd
LABEL=FPDDATA
DISK=""; IMPORT=""; ASSUME_YES=0; REFORMAT=0; NO_SYSTEMD=0

log()  { printf '\n\033[1m[fpd] %s\033[0m\n' "$*"; }
warn() { printf '\033[33m[fpd] WARNING: %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31m[fpd] ERROR: %s\033[0m\n' "$*" >&2; exit 1; }
trap 'die "failed at line $LINENO: $BASH_COMMAND"' ERR

usage() { sed -n '2,8p' "$0"; exit "${1:-0}"; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --disk) DISK="$2"; shift 2 ;;
    --import) IMPORT="$2"; shift 2 ;;
    --yes) ASSUME_YES=1; shift ;;
    --reformat) REFORMAT=1; shift ;;
    --no-systemd) NO_SYSTEMD=1; shift ;;   # test environments only
    -h|--help) usage 0 ;;
    *) die "unknown option $1" ;;
  esac
done
[[ $EUID -eq 0 ]] || die "run with sudo"

# ---------------------------------------------------------------- preflight
log "Preflight"
ARCH=$(uname -m)
case "$ARCH" in
  aarch64) NODE_ARCH=arm64 ;;
  x86_64)  NODE_ARCH=x64; [[ "${FPD_ALLOW_NON_PI:-0}" == 1 ]] || die "not a 64-bit Pi (uname -m = $ARCH). Flash Raspberry Pi OS Lite (64-bit)." ;;
  armv7l|armv6l) die "32-bit OS detected. Re-flash with Raspberry Pi OS Lite (64-bit)." ;;
  *) die "unsupported architecture $ARCH" ;;
esac
MODEL=$(tr -d '\0' 2>/dev/null </proc/device-tree/model || echo "unknown")
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
. /etc/os-release
echo "model: $MODEL | arch: $ARCH | RAM: ${MEM_MB} MB | OS: $PRETTY_NAME"
command -v python3 >/dev/null || die "python3 missing"
PYV=$(python3 -c 'import sys;print("%d.%d"%sys.version_info[:2])')
python3 -c 'import sys;sys.exit(0 if sys.version_info>=(3,10) else 1)' || die "Python $PYV too old (need 3.10+)"
[[ -f "$KIT/fpd-app.tgz" ]] || die "fpd-app.tgz missing from kit"
if command -v vcgencmd >/dev/null; then
  T=$(vcgencmd get_throttled | cut -d= -f2)
  [[ "$T" == "0x0" ]] || warn "vcgencmd get_throttled=$T: under-voltage/throttling seen since boot. Check the Pi power supply (5V 2.5A) if this keeps recurring."
fi

# ---------------------------------------------------------------- packages
log "Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends python3-venv python3-pip ca-certificates curl xz-utils zstd \
  sqlite3 parted rsync jq unattended-upgrades >/dev/null
[[ $NO_SYSTEMD -eq 1 ]] || systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

# ---------------------------------------------------------------- data disk
if [[ $NO_SYSTEMD -eq 0 ]]; then
  log "Data disk"
  EXISTING=$(blkid -L "$LABEL" 2>/dev/null || true)
  if [[ -n "$EXISTING" && $REFORMAT -eq 0 ]]; then
    echo "found existing $LABEL filesystem on $EXISTING (not reformatting)"
  else
    [[ -n "$DISK" ]] || die "no $LABEL filesystem yet: pass --disk /dev/sdX (see: lsblk -o NAME,SIZE,TRAN,MODEL)"
    [[ -b "$DISK" ]] || die "$DISK is not a block device"
    [[ "$(lsblk -dno TYPE "$DISK")" == "disk" ]] || die "$DISK is not a whole disk (give /dev/sda, not /dev/sda1)"
    ROOTDEV=$(lsblk -no PKNAME "$(findmnt -no SOURCE /)" 2>/dev/null || true)
    [[ "/dev/$ROOTDEV" != "$DISK" ]] || die "$DISK holds the running OS"
    TRAN=$(lsblk -dno TRAN "$DISK" || true)
    [[ "$TRAN" == "usb" ]] || warn "$DISK transport is '$TRAN' (expected usb)"
    lsblk -o NAME,SIZE,TRAN,MODEL,FSTYPE,LABEL,MOUNTPOINTS "$DISK"
    if [[ $ASSUME_YES -eq 0 ]]; then
      read -r -p "ERASE ALL DATA on $DISK ($(lsblk -dno SIZE,MODEL "$DISK" | xargs))? Type FORMAT to continue: " ans
      [[ "$ans" == "FORMAT" ]] || die "aborted"
    fi
    for p in $(lsblk -lnpo NAME "$DISK" | tail -n +2); do umount "$p" 2>/dev/null || true; done
    wipefs -a "$DISK"
    parted -s "$DISK" mklabel gpt mkpart fpddata ext4 1MiB 100%
    partprobe "$DISK"; udevadm settle; sleep 2
    PART=$(lsblk -lnpo NAME "$DISK" | sed -n 2p)
    mkfs.ext4 -F -q -L "$LABEL" -m 1 "$PART"
    udevadm settle
  fi
  UUID=$(blkid -s UUID -o value "$(blkid -L "$LABEL")")
  mkdir -p "$SRV"
  if ! grep -q "UUID=$UUID" /etc/fstab; then
    sed -i "\#[[:space:]]${SRV}[[:space:]]#d" /etc/fstab
    echo "UUID=$UUID $SRV ext4 defaults,noatime,nofail,x-systemd.device-timeout=30 0 2" >> /etc/fstab
    systemctl daemon-reload
  fi
  mountpoint -q "$SRV" || mount "$SRV"
  mountpoint -q "$SRV" || die "$SRV did not mount"
  df -h "$SRV" | tail -1
else
  warn "--no-systemd: skipping disk, swap, journald and unit installation"
  mkdir -p "$SRV"
fi

# ---------------------------------------------------------------- swap + journald (protect the SD card)
if [[ $NO_SYSTEMD -eq 0 ]]; then
  log "Swap and logging"
  if swapon --show=NAME --noheadings | grep -q zram; then
    echo "zram swap already active"
  elif [[ -f /etc/dphys-swapfile ]]; then
    if ! grep -q "^CONF_SWAPFILE=$SRV/swap/swapfile" /etc/dphys-swapfile; then
      dphys-swapfile swapoff || true          # release the old SD-card swap file before moving it
      mkdir -p "$SRV/swap"
      sed -i -E "s|^#?CONF_SWAPFILE=.*|CONF_SWAPFILE=$SRV/swap/swapfile|; s|^#?CONF_SWAPSIZE=.*|CONF_SWAPSIZE=1024|" /etc/dphys-swapfile
      dphys-swapfile setup >/dev/null && dphys-swapfile swapon || warn "could not enable swap on the SSD"
      rm -f /var/swap
    fi
    swapon --show=NAME,SIZE --noheadings | sed 's/^/  swap: /'
  else
    warn "no swap manager found; continuing without swap changes"
  fi
  mkdir -p /etc/systemd/journald.conf.d
  install -m 0644 "$KIT/config/journald-fpd.conf" /etc/systemd/journald.conf.d/fpd.conf
  systemctl restart systemd-journald
fi

# ---------------------------------------------------------------- users and directories
log "Users and directories"
id fpd   >/dev/null 2>&1 || useradd --system --home-dir "$SRV/data" --no-create-home --shell /usr/sbin/nologin fpd
id fpdv3 >/dev/null 2>&1 || useradd --system --home-dir "$SRV/delivery" --no-create-home --shell /usr/sbin/nologin fpdv3
install -d -m 0755 -o root -g root /opt/fpd /opt/fpd/bin /opt/fpd/delivery /etc/fpd
install -d -m 0755 -o root -g root "$SRV"
install -d -m 0750 -o fpd -g fpd "$SRV/data" "$SRV/backups"
install -d -m 0755 -o fpd -g fpd "$SRV/export"          # non-secret feed, readable by the delivery user
install -d -m 0700 -o fpdv3 -g fpdv3 "$SRV/delivery" "$SRV/delivery/state"

# ---------------------------------------------------------------- Node 22 (delivery runner)
log "Node $NODE_VERSION"
NODE_DIR="/opt/node-v$NODE_VERSION-linux-$NODE_ARCH"
if [[ ! -x "$NODE_DIR/bin/node" ]]; then
  TMP=$(mktemp -d)
  curl -fsSL -o "$TMP/node.tar.xz" "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$NODE_ARCH.tar.xz"
  echo "${NODE_SHA[$NODE_ARCH]}  $TMP/node.tar.xz" | sha256sum -c --quiet || die "Node download checksum mismatch"
  tar -xJf "$TMP/node.tar.xz" -C /opt
  rm -rf "$TMP"
fi
ln -sfn "$NODE_DIR" /opt/node22
/opt/node22/bin/node --version

# ---------------------------------------------------------------- application
log "Discovery engine"
STAGE=$(mktemp -d)
tar -xzf "$KIT/fpd-app.tgz" -C "$STAGE"
rsync -a --delete "$STAGE/app/" /opt/fpd/app/
rm -rf "$STAGE"
chown -R root:root /opt/fpd/app; chmod -R go-w /opt/fpd/app
if [[ ! -x /opt/fpd/venv/bin/python ]] || ! /opt/fpd/venv/bin/python -c 'import sys' 2>/dev/null; then
  python3 -m venv /opt/fpd/venv
fi
/opt/fpd/venv/bin/pip install -q --upgrade pip
/opt/fpd/venv/bin/pip install -q --only-binary=:all: -r /opt/fpd/app/requirements.txt -c "$KIT/config/constraints.txt"
/opt/fpd/venv/bin/python -m compileall -q /opt/fpd/app/fpd >/dev/null
install -m 0644 "$KIT"/delivery/*.mjs /opt/fpd/delivery/
for f in "$KIT"/bin/*; do install -m 0755 "$f" "/opt/fpd/bin/$(basename "$f")"; ln -sfn "/opt/fpd/bin/$(basename "$f")" "/usr/local/bin/$(basename "$f")"; done

# ---------------------------------------------------------------- configuration (never overwrite local edits)
log "Configuration"
[[ -f /etc/fpd/fpd.env ]] || install -m 0644 "$KIT/config/fpd.env" /etc/fpd/fpd.env
install -m 0644 "$KIT/config/v3-runner.json" /etc/fpd/v3-runner.json
if [[ -f /etc/fpd/v3-feed.enabled ]]; then   # keep the delivery source chosen with fpd-v3-feed
  jq '.input_directory="/srv/fpd/export/v3" | .file_pattern="feed.jsonl"' /etc/fpd/v3-runner.json > /etc/fpd/.v3-runner.tmp
  chmod 0644 /etc/fpd/.v3-runner.tmp; mv -f /etc/fpd/.v3-runner.tmp /etc/fpd/v3-runner.json
  echo "V3 delivery source: export/v3/feed.jsonl (fpd-v3-feed enabled)"
fi
# A copy of this kit stays on the Pi so the off-site backup carries everything needed to rebuild it.
install -d -m 0755 /opt/fpd/kit
rsync -a --delete --exclude '*.log' "$KIT/" /opt/fpd/kit/
if [[ -f /etc/fpd/v3-ingest.env ]]; then chown fpdv3:fpdv3 /etc/fpd/v3-ingest.env; chmod 0600 /etc/fpd/v3-ingest.env; fi

# ---------------------------------------------------------------- import data from the PC
if [[ -n "$IMPORT" ]]; then
  log "Importing data from $IMPORT"
  [[ -f "$IMPORT/MANIFEST.sha256" ]] || die "$IMPORT/MANIFEST.sha256 missing"
  (cd "$IMPORT" && sha256sum -c --quiet MANIFEST.sha256) || die "migration files failed checksum"
  if [[ -f "$SRV/data/fpd.sqlite" && "${FPD_FORCE_IMPORT:-0}" != 1 ]]; then
    die "$SRV/data/fpd.sqlite already exists. Refusing to overwrite (set FPD_FORCE_IMPORT=1 to replace it)."
  fi
  zstd -dq -f "$IMPORT/fpd.sqlite.zst" -o "$SRV/data/fpd.sqlite.importing"
  [[ "$(sqlite3 "$SRV/data/fpd.sqlite.importing" 'PRAGMA integrity_check;')" == "ok" ]] || die "imported database failed integrity_check"
  mv -f "$SRV/data/fpd.sqlite.importing" "$SRV/data/fpd.sqlite"
  if [[ -f "$IMPORT/cache.tar.zst" ]]; then zstd -dqc "$IMPORT/cache.tar.zst" | tar -x -C "$SRV/data"; fi
  if [[ -f "$IMPORT/export.tar.zst" ]]; then zstd -dqc "$IMPORT/export.tar.zst" | tar -x -C "$SRV/export"; rm -rf "$SRV/export/.staging"; fi
  chown -R fpd:fpd "$SRV/data" "$SRV/export"
fi

# ---------------------------------------------------------------- permissions (export must be readable by the delivery user)
chown -R fpd:fpd "$SRV/data" "$SRV/export" "$SRV/backups"
find "$SRV/data" -type d -exec chmod 0750 {} + ; find "$SRV/data" -type f -exec chmod 0640 {} +
find "$SRV/export" -type d -exec chmod 0755 {} + ; find "$SRV/export" -type f -exec chmod 0644 {} +
chown -R fpdv3:fpdv3 "$SRV/delivery"

# ---------------------------------------------------------------- verification as the service user
log "Verification"
RUN_FPD=(runuser -u fpd -- env -i PATH=/usr/bin:/bin HOME="$SRV/data" PYTHONDONTWRITEBYTECODE=1)
while IFS= read -r line; do [[ "$line" =~ ^[A-Z_]+= ]] && RUN_FPD+=("$line"); done < /etc/fpd/fpd.env
(cd /opt/fpd/app && "${RUN_FPD[@]}" /opt/fpd/venv/bin/python -m pytest -q -p no:cacheprovider tests 2>&1 | tail -2)
if [[ -f "$SRV/data/fpd.sqlite" ]]; then
  (cd /opt/fpd/app && "${RUN_FPD[@]}" /opt/fpd/venv/bin/python -m fpd status | head -20)
  [[ -f "$SRV/export/latest.json" ]] && (cd /opt/fpd/app && "${RUN_FPD[@]}" /opt/fpd/venv/bin/python -m fpd export-validate | jq -c '{ok, errors}')
fi
(cd /opt/fpd/app && "${RUN_FPD[@]}" /opt/fpd/venv/bin/python /opt/fpd/bin/fpd-netcheck) || warn "network check reported problems"

# ---------------------------------------------------------------- systemd units (timers enabled, delivery NOT started)
if [[ $NO_SYSTEMD -eq 0 ]]; then
  log "Services"
  install -m 0644 "$KIT"/systemd/* /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now fpd-backup.timer fpd-v3-prune.timer fpd-offsite-backup.timer >/dev/null
  if [[ -f "$SRV/data/fpd.sqlite" ]]; then systemctl enable --now fpd-acquire.timer >/dev/null; else warn "no database yet: fpd-acquire.timer not enabled"; fi
  systemctl list-timers 'fpd-*' --no-pager
fi

log "Done"
cat <<EOF
Next (skip what is already done):
  1. Edit /etc/fpd/fpd.env and set FPD_CONTACT (an email or URL for the crawler User-Agent).
  2. Store the V3 ingest token:   sudo fpd-set-token
  3. Verify and start delivery:   sudo fpd-go-live
  4. Off-site backup (once):      sudo fpd-offsite-setup
  Status at any time:             sudo fpd-status
EOF
