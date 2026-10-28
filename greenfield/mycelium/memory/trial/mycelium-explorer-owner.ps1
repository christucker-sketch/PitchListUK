# Mycelium L1 explorer trial: OWNER steps on Chris's Windows PC (PROPOSAL; only after Chris approves the exact plan).
#   powershell -ExecutionPolicy Bypass -File <checkout>\greenfield\mycelium\memory\trial\mycelium-explorer-owner.ps1 -Mode before -Commit <sha>
#   ... -Mode create -Commit <sha>    create the explorer login from the SCRAM verifier, verify it, delete the verifier
#   ... -Mode close  -Commit <sha>    ALWAYS after the trial (or after any failure): NOLOGIN + revoke, then verify closed
# Uses the existing migration-owner .env.local; never prints a connection string, password or verifier.
param([Parameter(Mandatory)][ValidateSet('before','create','close')][string]$Mode,
      [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$Commit)
$ErrorActionPreference = 'Continue'
Set-PSDebug -Off
$repo = 'C:\Users\ChrisT\PitchListUK'
$verifier = 'C:\Users\ChrisT\mycelium-explorer.scram'
$log = 'C:\Users\ChrisT\mycelium-explorer-owner.log'
function Log { param([Parameter(ValueFromPipeline)]$l) process { $s = "$l"; Write-Host $s; Add-Content -Path $log -Value $s -Encoding UTF8 } }
function Stop-Pre($m) { "STOP: $m" | Log; exit 1 }
function Provision($what) {   # runs one explorer-provision.mjs mode; returns its exit code
  node --env-file=.env.local .\scripts\explorer-provision.mjs $what 2>&1 | Log
  return $LASTEXITCODE
}
$defensive = $false
"== owner $Mode $(Get-Date -Format o) on $env:COMPUTERNAME" | Log

Set-Location $repo
if ((git branch --show-current) -ne 'findpitches-v3/greenfield') { Stop-Pre 'wrong branch' }
git pull --ff-only origin findpitches-v3/greenfield 2>&1 | Log
if ($LASTEXITCODE -ne 0) { Stop-Pre 'update failed; local work preserved' }
git cat-file -e "$Commit^{commit}" 2>$null
if ($LASTEXITCODE -ne 0) { Stop-Pre "approved commit $Commit not found" }
git diff --quiet $Commit HEAD -- greenfield/mycelium/memory
if ($LASTEXITCODE -ne 0) { Stop-Pre "memory package differs from approved $Commit; the approval does not cover it" }
"memory package identical to approved $Commit" | Log
Set-Location '.\greenfield\mycelium\memory'
if (-not (Test-Path .\.env.local)) { Stop-Pre '.env.local missing; not recreated' }

if ($Mode -eq 'before') {
  if ((Provision 'memberships') -ne 0) { Stop-Pre 'read-only membership inspection failed' }
  "BEFORE OK: actual Neon role/membership options recorded above (read-only)" | Log
  exit 0
}

if ($Mode -eq 'create') {
  if (-not (Test-Path $verifier)) { Stop-Pre "no verifier at $verifier (copy it from fpd-prod with scp first)" }
  if ((Get-Content $verifier -TotalCount 1) -notmatch '^SCRAM-SHA-256\$4096:') { Remove-Item $verifier -Force; Stop-Pre 'verifier malformed; deleted' }
  $created = $false
  $env:MYCELIUM_REMOTE_WRITES_APPROVED = 'yes'
  try {
    node --env-file=.env.local .\scripts\explorer-provision.mjs create-login $verifier 2>&1 | Log
    $created = ($LASTEXITCODE -eq 0)
  } finally {
    Remove-Item Env:\MYCELIUM_REMOTE_WRITES_APPROVED -ErrorAction SilentlyContinue
    Remove-Item $verifier -Force -ErrorAction SilentlyContinue
    "verifier deleted from the PC: $(-not (Test-Path $verifier)); write flag removed: $(-not (Test-Path Env:\MYCELIUM_REMOTE_WRITES_APPROVED))" | Log
  }
  if (-not $created) { "create-login failed or uncertain; closing defensively" | Log; $defensive = $true }
  elseif ((Provision 'verify-login') -ne 0) { "login not in the approved state; closing defensively" | Log; $defensive = $true }
  else { "CREATE OK: explorer login verified least-privilege. Next: run 'run' on fpd-prod, then close on both" | Log; exit 0 }
}

# close (explicit, or defensive after a failed create)
$env:MYCELIUM_REMOTE_WRITES_APPROVED = 'yes'
try { node --env-file=.env.local .\scripts\explorer-provision.mjs disable-login 2>&1 | Log; $closed = ($LASTEXITCODE -eq 0) }
finally { Remove-Item Env:\MYCELIUM_REMOTE_WRITES_APPROVED -ErrorAction SilentlyContinue }
if (-not $closed) { Stop-Pre 'disable-login failed or uncertain: do NOT assume closed. Rerun close; if it still fails, disable the role in the Neon Console' }
if ((Provision 'verify-closed') -ne 0) { Stop-Pre 'login still appears active: do NOT assume closed. Rerun close or disable it in the Neon Console' }
"CLOSE OK: explorer login is NOLOGIN with no membership (verified read-only)" | Log
if ($defensive) { "STOP: create did not reach the approved state; the login was closed instead" | Log; exit 1 }
exit 0
