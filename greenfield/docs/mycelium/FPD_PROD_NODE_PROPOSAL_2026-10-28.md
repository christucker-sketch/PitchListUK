# fpd-prod: provide Node.js 22 LTS for the approved explorer trial (proposal, Claude, 28 Oct 2026)

**Why.** The approved shared-memory trial ([attempt 1](SHARED_MEMORY_ADAPTER_DELIVERY_2026-10-28.md#7-execution-attempt-1-approved-c76fd723-stopped-at-precheck-28-oct-2026-1636z-with-nothing-created)) stopped at precheck: fpd-prod has no Node. The approval treats installing it as a separate decision, so this proposes that decision. **Nothing has been installed.**

## What fpd-prod has (read-only inspection by Chris, 28 Oct)

- **OS:** Debian GNU/Linux 13 (trixie), x86_64.
- **Node:** none on PATH. `/usr/local/bin` holds only the Mycelium commands (`hubsync`, `myc-agent`, `myc-decide`, `myc-gate`, `mycnotify`, `myc-stageb`).
- **The `myc` user:** no node. `~/.local/bin` holds `claude` and `codex`, which are standalone binaries.
- **Debian's own package:** apt offers `nodejs` 20.19.2+dfsg-1+deb13u3, which is not installed.

## Options

| Option | For | Against |
|---|---|---|
| **A. Official Node v22.23.4 tarball, pinned (recommended)** | Exactly the version on Chris's PC and already tested. The official build is checksum-pinned, with a verified release signature. No apt source, package, service or user is added. Rollback removes exactly what was added | Manual updates: a later security release needs a new reviewed pin |
| B. NodeSource apt repository (`nodejs` 22.x) | Updates arrive through apt | Adds a persistent third-party apt source and signing key to a production host, and unattended upgrades could change Node under the trial |
| C. Debian `nodejs` 20.19 | Debian-maintained | Below the package floor (22.19), so the pinned trial script would refuse it unless reviewed again. Node 20 is past its upstream end of life (April 2026) |

## Option A, exactly

**The script.** [`greenfield/mycelium/hostprep/install-node.sh`](../../mycelium/hostprep/install-node.sh), sha256 `aec1dd4dbf7f84c46d069ed64a3d238caec61a65547045916827f0eca39ec87f`. It sits outside the approved memory package, so the trial's commit pin `c76fd723` is unaffected.

**What it installs:**
- **Source:** `https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.xz`, the current v22 LTS ("Jod"), a security release of 2026-10-20.
- **Pinned sha256:** `1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce`.
- **Provenance of the pin:** it was taken from `SHASUMS256.txt.asc`, and Claude verified that file's clearsign signature against the official `nodejs/release-keys` keyring: "Good signature from Antoine du Hamel". The same real tarball was downloaded and checked against the pin, then installed in test mode, where it ran `v22.23.4 x64`; rollback was also tested on it.

**Commands:**
- **`check`** (read-only) refuses if any of these exist: `/opt/node-v22.23.4-linux-x64`, `/usr/local/bin/node|npm|npx` (symlinks and dangling links included), its receipt `/var/lib/mycelium-node`, or any `node` already on PATH. It also confirms HTTPS reachability of `nodejs.org` and of `registry.npmjs.org`, which the trial's setup needs.
- **`install`:**
  1. Creates the root-only receipt exclusively.
  2. Downloads the tarball over HTTPS only (TLS ≥ 1.2, 300 s cap) into the receipt directory.
  3. **Refuses on any hash mismatch.**
  4. Extracts to a temporary sibling, then renames it into `/opt` (root-owned, not world-writable).
  5. Creates the three links with `ln -s`, without `-f`, so it never replaces anything.
  6. Records each item only after creating it.
  7. Verifies that `node --version` is `v22.23.4`.
- **`rollback`** removes only recorded items that are still exactly what install made. A link someone has replaced is left alone. With no recognised receipt it changes nothing.

**Offline tests:** [`test-install-node.sh`](../../mycelium/hostprep/test-install-node.sh) passes 15/15:
- every collision is refused, and rollback then changes nothing;
- a tampered download is refused with nothing installed;
- the exact receipt contents are checked;
- other `/usr/local/bin` commands are untouched;
- a second install is refused;
- rollback leaves a replaced link alone;
- a wrong version inside a correctly hashed archive is caught.

**What it means for the host:** `node`, `npm` and `npx` become available on every user's PATH. That includes `myc`, the CLI user, although the CLIs don't use them. It adds no new capability that matters: Codex's tool ban is already only a prompt instruction, and the host already has bash and python. No service, timer, apt state or existing file changes.

## Sequence (Chris, on fpd-prod; then the approved trial resumes from stage 1)

```bash
sudo runuser -u hubsync -- git -C /var/lib/hubsync/repo show <commit>:greenfield/mycelium/hostprep/install-node.sh > ~/install-node.sh && sha256sum ~/install-node.sh   # must be aec1dd4d…
sudo bash ~/install-node.sh check
sudo bash ~/install-node.sh install
/usr/local/bin/node --version      # v22.23.4
```

`<commit>` is the commit that publishes this proposal. Then the **already approved** trial reruns from stage 1 (PC `before`, fpd-prod `precheck`) at `c76fd723`, unchanged. A failed install stops; `sudo bash ~/install-node.sh rollback` undoes it.

**Not included:**
- no apt or repository change;
- no automatic updates;
- no change to `myc`, `hubsync`, `myc-gate`, timers or the notifier;
- no trial step; that is covered by the existing approval once Node is present.

**Approval phrase (Chris, after Codex's check):** "approved: install Node 22.23.4 on fpd-prod".
