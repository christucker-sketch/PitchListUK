# Mycelium — BRIX CLI collaboration preflight (23 October 2026)

## Instruction for Claude
Prepare **safe, copy/paste-ready, read-only commands** to execute over SSH on **each of the two existing Linux BRIX computers**, J3455 (preferred initial Claude Code + Codex CLI test host) and J1900 (existing secondary worker). Both have been powered on. The machines already have allocated Mycelium discovery/worker roles. **Do not reinstall, reimage, repurpose, reconfigure, or disrupt either worker.**

## Phase A: inventory only, on both hosts
Generate a short, copy/paste-ready sequence to collect:
- `hostnamectl`, `uname -m`, `cat /etc/os-release` (OS and CPU architecture);
- `free -h`, `df -h` (RAM and available storage);
- `command -v node && node --version`, `command -v npm && npm --version`, `command -v codex && codex --version`, `command -v claude && claude --version` (missing commands must not abort collection);
- `id` and `echo "$HOME"` to identify current execution context;
- inventory of existing relevant worker services using non-invasive read-only commands (`systemctl --type=service --state=running --no-pager`, selectively filtered if desired); no service restarts.
Prefer commands that do not need sudo and do not expose credentials, environment variables, tokens, or secrets. Ensure output is clearly labelled per host. Ask Chris to return **sanitised** output before proposing installations.

## Phase B: conditional installation plan only (not yet authorised)
After reviewing outputs, propose a minimal, reversible, unprivileged installation of Codex CLI and Claude Code CLI on the **J3455 only**, isolated from existing worker folders, identities and system services. Verify current Linux architecture, libc/runtime and supported Node versions; check official installation instructions. Include subscription-based interactive sign-in methods; explicitly guard against accidentally using metered OpenAI/Anthropic API keys. No credential sharing in GitHub or logs. Note subscription automation/terms and account/session limitations must be verified. Do not assume that subscription login authorises permanent background automation.

## Acceptance test
Once separately approved: (1) both CLI tools execute individually; (2) orchestrator invokes them with a harmless, fixed, bounded prompt and passes one result to the other without human copy/paste; (3) captures outputs, errors, timing and model usage without secrets; (4) does not mutate repositories/worker services; (5) aborts on first error, with explicit call/time caps and manual kill option.

## Project constraints
- **£0 additional experimental spend**; no paid API calls, hosting, infrastructure, purchases, or fallback to billable API without Chris's explicit approval.
- Cloud-first coordinator/state remains independent of home BRIX computers, which can be offline; this preflight proves local CLI orchestration only.
- Preserve existing BRIX roles and stability.
- Start with commands and report findings before any modification.

## Deliverable
Claude should provide the exact Phase A commands for each host and collect the results, then recommend next steps. Do not install anything yet.

## Claude response (23 October 2026): Phase A commands issued; nothing installed

**Phase A script:** [`preflight/brix-inventory.sh`](preflight/brix-inventory.sh). It is read-only and needs no sudo:
- **System:** OS, architecture, libc, CPU, RAM, disk, load and temperatures.
- **Tools:** whether node/npm/npx/codex/claude/git/curl are present, with versions; missing tools do not abort the run.
- **Identity:** `id` and `$HOME`.
- **AI credentials:** the *names* of any `ANTHROPIC_`/`OPENAI_`/`CLAUDE_CODE_`/`CODEX_` variables, never their values, plus whether `~/.claude`, `~/.codex` and `~/.config/anthropic` exist.
- **Services:** running services, failed units, and any fpd/Mycelium/worker units. Nothing is restarted.
- **Filtered out:** machine and boot IDs.

Chris runs it on both hosts from his PC, with per-host labelled output and nothing written to the hosts:

```powershell
foreach ($h in 'fpd-prod.Home','fpd-standby.Home') { Get-Content C:\Users\ChrisT\brix-inventory.sh | ssh ct_admin@$h "tr -d '\r' | bash -s" }
```

**Correction to the premise above:** neither BRIX runs a Mycelium discovery/worker role or service today. Both are *allocated* to Mycelium (22 Oct) but idle. They have:
- Debian 13 with base hardening (`brix-office.sh`: updates, unattended security upgrades, time zone, mDNS, sensors, hardware watchdog);
- since 23 Oct, home-LAN-only SSH and key-only logins.

No fpd or Mycelium software has been installed. So "do not disrupt existing workers" currently means "do not disturb the hardened base install". The inventory will evidence that.

**Host mapping:** J3455 = `fpd-prod` (the preferred CLI test host); J1900 = `fpd-standby`.

**Next:** once Chris returns the sanitised output, I will propose the Phase B plan for the J3455 only:
- unprivileged, reversible, isolated user/folder;
- subscription sign-in through each tool's own flow;
- refuse to run if any API-key variable is present, per [§18](../../../docs/mycelium/CLAUDE_DISCOVERY_DESIGN.md).

It stays a plan until Chris approves it. No install, sign-in, model call or service change happens before then.

## Phase A results (host evidence, Chris, 23 Oct 12:41 London; sanitised, run as `ct_admin`, no sudo)

| | `fpd-prod` (J3455) | `fpd-standby` (J1900) |
| --- | --- | --- |
| Hardware / firmware | GB-BPCE-3455, F13 | GB-BXBT-1900, F8 |
| OS / kernel / libc | Debian 13, 6.12.113 amd64, glibc 2.41 | same |
| CPU / RAM / swap | 4-core J3455; 7.6 GiB (7.2 available); 5.8 GiB | 4-core J1900; 7.7 GiB (7.3 available); 5.7 GiB |
| Disk | 103 GB root, 97 GB free | 104 GB root, 98 GB free |
| node / npm / codex / claude / git | all missing | all missing |
| curl | 8.14.1 | 8.14.1 |
| AI credential variables | none | none |
| `~/.claude`, `~/.codex`, `~/.config/anthropic` | absent | absent |
| Running services | base OS only (ssh, avahi, cron, smartmontools, timesyncd, unattended-upgrades …) | the same, plus `espeakup` (installer speech synthesiser; harmless, could be disabled later) |
| Failed units / fpd·Mycelium·worker units | none / none | none / none |
| Load, temperature | 0.00; 33–35 °C | 0.07; 35–36 °C |

**Confirmed:** there is no existing worker, AI tool or AI credential on either host. Both meet Claude Code's stated requirements: Debian 10+, x64, 4 GB+ RAM ([setup docs](https://code.claude.com/docs/en/setup)).

## Phase B — proposed installation plan, J3455 (`fpd-prod`) only. NOT AUTHORISED until Chris approves.

**Preconditions:**
- Chris confirms that Claude **usage credits are off** (Pro plan).
- Chris confirms which ChatGPT plan Codex will use, and that any Codex extra-usage/credit purchase is off.
- Codex confirms its install and sign-in route from OpenAI's current docs (below).

1. **Isolation (the only sudo step):** create a dedicated user `myc`, with no sudo rights and no SSH login. It is reached only with `sudo -iu myc` from `ct_admin`. Nothing goes in `ct_admin`'s home or in system paths. To reverse: `sudo deluser --remove-home myc` removes everything.
2. **Claude Code, unprivileged, as `myc`:**
   - Install with the official native installer on the stable channel, `curl -fsSL https://claude.ai/install.sh | bash -s stable`, into `~/.local/bin` and `~/.local/share/claude`. No Node is needed.
   - Pin the version for the test with `DISABLE_AUTOUPDATER=1` in `~/.claude/settings.json`.
   - Check with `claude --version` and `claude doctor`.
   - On Linux the binary is not code-signed, so verify the installed binary against the GPG-signed release manifest (fingerprint `31DD DE24 DDFA B679 F42D 7BD2 BAA9 29FF 1A7E CACE`), as documented.
3. **Codex CLI, unprivileged, as `myc` (Codex to specify):** a user-level install of the official Codex CLI, without `sudo npm`. Prefer an official standalone binary in `~/.local/bin`. Node would need either an apt install (sudo, system-wide) or a user-level Node, so avoid it unless OpenAI requires it.
   - Headless sign-in must use ChatGPT, via the device-code flow or OpenAI's documented remote method. Public issue reports say device-code sign-in can be blocked by workspace settings or require phone verification, so check that first.
   - `codex login status` must report ChatGPT, not an API key.
4. **Sign-in (Chris, interactively, once; no credential ever leaves `myc`'s home):**
   - **Claude:** run `claude` and sign in through Anthropic's own flow. Over SSH it uses the paste-the-code variant. `/status` must show the claude.ai login as the active credential.
   - Credential files stay mode 0600 under `/home/myc`. They never go into Git, chat, logs or a copy to another machine.
5. **Billing guard (fail closed):** a small wrapper starts each CLI with a cleared environment (`env -i HOME=… PATH=… LANG=…`). Beforehand it refuses to run if any of these are set:
   - `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_PROFILE`;
   - `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_FOUNDRY`;
   - `OPENAI_API_KEY`, `CODEX_API_KEY`;
   - an `apiKeyHelper` in Claude settings.

   No `--bare`, because it ignores the subscription login. Hitting a usage limit is a stop, never a fallback.
6. **Acceptance test harness (written only after approval):**
   - A fixed, harmless prompt, run in an empty working folder, with tools disabled or read-only.
   - Codex → Claude → Codex: at most 3 calls, 180 s per call, 15 min in total; aborts on the first error.
   - It logs prompt, output, stderr, exit code, duration and any usage the tools report, under `/home/myc/preflight/run-<time>/`, with no secrets.
   - Manual kill switch: `sudo pkill -u myc`.
   - No repository, worker or service is touched, and no git is installed.
7. **Rollback:** `sudo deluser --remove-home myc`, plus revoking the Claude and Codex sessions from the account settings pages.

`fpd-standby` (J1900) is left exactly as it is.

## Chris's decision (23 Oct): Phase B APPROVED

- **Phase B is approved** as proposed above.
- **Claude usage credits are confirmed off** (Pro plan).
- **Codex runs on ChatGPT Plus** (personal plan, not a workspace).

**Part 1, Claude side:** [`preflight/myc-setup.sh`](preflight/myc-setup.sh), run by Chris on `fpd-prod` only. It:
- creates `myc`;
- installs stable-channel Claude Code with auto-update off;
- verifies the binary against the GPG-signed manifest, installing `gnupg` only if missing;
- installs the cleared-environment `myc-run` guard and self-tests that it refuses a set API key.

No sign-in, model call or Codex install happens in part 1.

**Part 2 (pending Codex):** the Codex CLI install and ChatGPT headless sign-in route. **Codex: please specify it for a personal ChatGPT Plus account** on Debian 13 x86-64, as user `myc` without sudo. Also say whether device-code sign-in needs enabling in ChatGPT settings first.

**Part 3:** Chris signs in to both CLIs through their own flows. **Part 4:** the capped three-call harness.

