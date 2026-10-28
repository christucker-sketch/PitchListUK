# Codex — Node 22.23.4 prerequisite review/approval, 28 October2026

Reviewed `b61d77da2377eeb069e451ff9f05365a600a2ab9` and stopped-precheck evidence `cd29a9f9`. **PASS for the proposed pinned installer; Chris already approves it.** Explicit user response: **“check hub approved: install Node 22.23.4 on fpd-prod”**. Do not request the same installation approval again.

## Independent verification

- Installer source reviewed; Bash syntax and **15/15 offline tests PASS** with fake tarballs/temp filesystem/no root or network. Installer SHA256 matches `aec1dd4dbf7f84c46d069ed64a3d238caec61a65547045916827f0eca39ec87f`.
- Hash/version checks, collision refusal including dangling links, exclusive link creation and recorded rollback paths are covered. Existing Mycelium commands and apt/services/users are outside installation scope.
- Official tarball source is pinned to nodejs.org/v22.23.4/linux-x64 and SHA256 `1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce`. Claude reports release-signature verification and actual tarball test/rollback; Codex did not independently repeat the public download/signature verification or install on fpd-prod. The real install must enforce that hash and report actual version.
- The installer lives outside the memory package; original approved trial commit `c76fd723f76ebbc2f9564eb927db7b23774f8286` remains unchanged.

## Approved bounded action

Claude coordinates Chris's established host-command/log route using exactly [proposal option A](FPD_PROD_NODE_PROPOSAL_2026-10-28.md): official pinned Node22.23.4 to /opt/node-v22.23.4-linux-x64, node/npm/npx links at /usr/local/bin, root-only /var/lib/mycelium-node receipt. No replacement of existing files, apt/repository change, automatic updater, new user/service/timer, existing credential or other infrastructure change. Any collision/download/hash/version failure stops; use only reviewed receipt-scoped rollback/reconciliation, report any leftover partial artifact instead of deleting an unrecorded path blindly.

Exact installer source commit: `b61d77da2377eeb069e451ff9f05365a600a2ab9`.

```bash
sudo runuser -u hubsync -- git -C /var/lib/hubsync/repo show b61d77da2377eeb069e451ff9f05365a600a2ab9:greenfield/mycelium/hostprep/install-node.sh > ~/install-node.sh
sha256sum ~/install-node.sh
# Must equal aec1dd4dbf7f84c46d069ed64a3d238caec61a65547045916827f0eca39ec87f before sudo execution.
sudo bash ~/install-node.sh check
# Only after CHECK OK:
sudo bash ~/install-node.sh install
/usr/local/bin/node --version
```

After verified install, continue the already-approved database-only trial from fresh PC-before/host-precheck, unchanged at c76fd723, under the prior exact limits: one isolated mycmem user/temporary least-privilege login, six DB-only processes, <=90s each/300s total, exactly6nodes+6edges+2assessments, mandatory scoped closure; zero model calls. The first attempt stopped before any trial resource, role or row was created. This prerequisite approval resolves that stop; it is not an extra call/row grant. No repeat prerequisite approval or setup replay needed.

Report actual installer hash/download pin/version/receipt and untouched existing command paths, followed by trial results/verified closures or any further STOP. Do not silently expand or retry a later failed/uncertain trial.

The prior precheck also reports actual Neon creator memberships: neondb_owner admin=true, inherit=false, set=false, grantor cloud_admin on both templates. This resolves the previously documented unqueried membership-option observation on the reported remote evidence.

No installation or trial has been executed by Codex. Next actor Claude; await actual host receipts, not another abstract plan.
