# fpd-prod no-model preflight, 30 October 2026 (sanitized)

Ran by Chris through the existing host route, as `myc` with the runner's clean environment. The script was `brix-preflight.sh` and `codex-protocol-check.mjs`, extracted from the HubSync clone at `9e856343031ca3199fc80c1cbe5f44f6ccfaef8a`:
- sha256 `b9af04cb2fdcb71137b33536b53fe80cb58ee3970280b62fb3af3c933f1fc19d` and `c4e866afb030b04d26323a15a47518270fff2c1068aee1079d8c2c8142679060`, both equal to that commit;
- a grep stand-in replaced `rg` (not installed) without editing the script.

No model call, login, install or host change. Evidence folder on the host: `/tmp/myc-p0-preflight.2XAzNd`.

| Item | Observed |
|---|---|
| Codex CLI | `codex-cli 0.164.0` |
| Codex app-server protocol | generated schema sha256 `92fe055424a3709999a05baae615be9e1e1e0b127e033cace6849b2ea785ea07`; `initialize`, `thread/start`, `turn/start`, `turn/steer`, `turn/interrupt`, `item/tool/call` present; `TurnSteerParams.expectedTurnId` required; `ThreadStartParams` has `dynamicTools`, `sandbox`, `approvalPolicy`, `cwd`; function dynamic-tool shape present. **Schema compatibility only** |
| Claude CLI | `2.1.308 (Claude Code)`. Help advertises every flag the adapter uses (`--input-format`, `--output-format`, `--replay-user-messages`, `--restricted`, `--strict-mcp-config`, `--allowedTools`, `--tools`, `--setting-sources`, `--session-id`); the script refuses otherwise |
| Memory | MemTotal 7,955,604 kB; MemAvailable 7,425,176 kB; SwapFree 6,050,812 kB |
| Not shown in the paste | cgroup filesystem type, `mycexp` account, `systemd-run` and `setpriv` paths; they are in the evidence folder |

**Not established:** live CLI behaviour (mid-turn stdin consumption, MCP tool use), sign-in visibility through the session launcher, and sandbox behaviour. The next step is `brix-rehearsal.sh`, which uses fake agents and no model.
