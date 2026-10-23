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
