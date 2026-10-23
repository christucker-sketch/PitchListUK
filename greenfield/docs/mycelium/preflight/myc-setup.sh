#!/usr/bin/env bash
# Mycelium BRIX CLI preflight, Phase B part 1 (approved by Chris 23 Oct). Run ONLY on fpd-prod (J3455):
#     sudo bash ~/myc-setup.sh
# 1. Creates an isolated user "myc": no sudo, no password, no SSH keys (so no SSH login); reach it with  sudo -iu myc
# 2. Installs Claude Code for myc only (official native installer, stable channel, ~/.local), auto-update OFF, and
#    verifies the binary against Anthropic's GPG-signed release manifest.
# 3. Installs a billing guard  ~myc/bin/myc-run : refuses to start if any API-key/provider setting is present and
#    starts the CLI with a cleared environment, so a stray key can never be used.
# Does NOT sign in, run a model, install Codex, or touch fpd-standby, ct_admin's files or system services.
# Undo everything:  sudo deluser --remove-home myc
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo:  sudo bash $0"; exit 1; }
[[ $(hostname) == fpd-prod ]] || { echo "STOP: this is $(hostname); Phase B is for fpd-prod (J3455) only"; exit 1; }
step() { echo; echo "== $*"; }

step "isolated user myc"
if id myc >/dev/null 2>&1; then echo "exists"; else adduser --disabled-password --gecos "" myc >/dev/null && echo "created"; fi
chmod 700 /home/myc
id myc | grep -qw sudo && { echo "STOP: myc is in the sudo group"; exit 1; }
echo "$(id myc)  (no sudo, no password, no SSH keys)"

step "tools needed for verification"
command -v gpg >/dev/null || { apt-get -qq update && apt-get -y -qq install gnupg >/dev/null; }
command -v jq >/dev/null || apt-get -y -qq install jq >/dev/null
echo "gpg $(gpg --version | head -1 | awk '{print $3}'), jq ok"

step "Claude Code (stable channel) for myc"
sudo -iu myc bash -s <<'EOF'
set -euo pipefail
mkdir -p ~/.claude ~/bin
[[ -f ~/.claude/settings.json ]] || echo '{ "env": { "DISABLE_AUTOUPDATER": "1" } }' > ~/.claude/settings.json
curl -fsSL https://claude.ai/install.sh | bash -s stable >/dev/null
~/.local/bin/claude --version
EOF

step "verify the installed binary against Anthropic's signed manifest"
sudo -iu myc bash -s <<'EOF'
set -euo pipefail
V=$(~/.local/bin/claude --version | awk '{print $1}')
BIN=$(readlink -f ~/.local/bin/claude)
T=$(mktemp -d); export GNUPGHOME=$T/gnupg; mkdir -m 700 "$GNUPGHOME"; cd "$T"
curl -fsSL https://downloads.claude.ai/keys/claude-code.asc | gpg -q --import 2>/dev/null
gpg --with-colons --fingerprint security@anthropic.com | grep -q '^fpr:::::::::31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE:' \
  || { echo "FAIL: signing key fingerprint does not match the documented one"; exit 1; }
curl -fsSLO "https://downloads.claude.ai/claude-code-releases/$V/manifest.json"
curl -fsSLO "https://downloads.claude.ai/claude-code-releases/$V/manifest.json.sig"
gpg -q --verify manifest.json.sig manifest.json 2>/dev/null || { echo "FAIL: manifest signature is not valid"; exit 1; }
H=$(sha256sum "$BIN" | cut -d' ' -f1)
grep -q "$H" manifest.json || { echo "FAIL: installed binary is not listed in the signed manifest"; exit 1; }
echo "OK: claude $V binary matches Anthropic's signed manifest (key 31DD DE24 ... 1A7E CACE)"
rm -rf "$T"
EOF

step "billing guard ~myc/bin/myc-run"
cat > /home/myc/bin/myc-run <<'EOF'
#!/usr/bin/env bash
# Starts claude or codex ONLY with a cleared environment and refuses if anything could switch it to paid API billing.
set -euo pipefail
case "${1:-}" in claude|codex) ;; *) echo "usage: myc-run claude|codex [args...]"; exit 2;; esac
for v in ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_PROFILE ANTHROPIC_BASE_URL ANTHROPIC_FEDERATION_RULE_ID \
         CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX CLAUDE_CODE_USE_FOUNDRY CLAUDE_CODE_OAUTH_TOKEN \
         OPENAI_API_KEY CODEX_API_KEY OPENAI_BASE_URL; do
  [[ -z ${!v:-} ]] || { echo "REFUSED: $v is set in this shell (could bill an API). Unset it."; exit 3; }
done
grep -qs apiKeyHelper ~/.claude/settings.json && { echo "REFUSED: apiKeyHelper is configured in ~/.claude/settings.json"; exit 3; }
[[ -e ~/.config/anthropic ]] && { echo "REFUSED: ~/.config/anthropic (API profile) exists"; exit 3; }
[[ "$*" == *--bare* ]] && { echo "REFUSED: --bare ignores the subscription login"; exit 3; }
U=$(id -un)
exec env -i HOME="$HOME" USER="$U" LOGNAME="$U" LANG=C.UTF-8 TERM="${TERM:-dumb}" \
  PATH="$HOME/.local/bin:$HOME/bin:/usr/local/bin:/usr/bin:/bin" "$@"
EOF
chmod 755 /home/myc/bin/myc-run; chown -R myc:myc /home/myc/bin /home/myc/.claude
sudo -iu myc env ANTHROPIC_API_KEY=test /home/myc/bin/myc-run claude --version >/dev/null 2>&1 \
  && { echo "FAIL: guard did not refuse a set API key"; exit 1; } || echo "guard refuses a set ANTHROPIC_API_KEY: ok"
sudo -iu myc /home/myc/bin/myc-run claude --version

echo; echo "DONE on $(hostname). Nothing is signed in yet. Paste this output to Claude."
