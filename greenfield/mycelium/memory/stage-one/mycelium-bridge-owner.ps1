# Mycelium Stage One: OWNER steps for the persistent bridge login, on Chris's Windows PC (PROPOSAL; only within Chris's
# approval of the exact Stage One scope). Setup-time only: nothing here is in the operational path of a run.
#   powershell -ExecutionPolicy Bypass -File <checkout>\greenfield\mycelium\memory\stage-one\mycelium-bridge-owner.ps1 -Mode before -Commit <sha>
#   ... -Mode create -Commit <sha> -ValidUntil 2026-12-31T23:59:59Z   create mycelium_bridge_fpd under a new grant id, verify, wipe the copy
#   ... -Mode rotate -Commit <sha> -ValidUntil <time>                 new password (after `credential` on fpd-prod), verify, wipe the copy
#   ... -Mode close  -Commit <sha>                                    disable this PC's recorded grant (NOLOGIN + expire + revoke), verify
# Every database change is bound to one grant id, kept in an exclusively created receipt on this PC and written as the
# role's comment in the creating transaction. A pre-existing or foreign role of that name is reported, never changed.
# Neon accepts only plain-text passwords in CREATE/ALTER ROLE, so create/rotate read the one-time copy scp'd from fpd-prod,
# send it over TLS, then overwrite and delete it in every outcome. Uses the existing migration-owner .env.local; never
# prints a connection string or password. The migration owner never leaves this PC.
param([Parameter(Mandatory)][ValidateSet('before','create','rotate','close')][string]$Mode,
      [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$Commit,
      [ValidatePattern('^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')][string]$ValidUntil = '')
$ErrorActionPreference = 'Continue'
Set-PSDebug -Off
$repo = 'C:\Users\ChrisT\PitchListUK'
$pwfile = 'C:\Users\ChrisT\mycelium-bridge.pw'
$receipt = 'C:\Users\ChrisT\mycelium-bridge-grant.txt'
$log = 'C:\Users\ChrisT\mycelium-bridge-owner.log'
if ($env:MYC_OWNER_TEST_ROOT) {   # offline test harness only (pwsh with fake git/node); never set on the real PC
  $t = $env:MYC_OWNER_TEST_ROOT
  $repo = "$t/repo"; $pwfile = "$t/mycelium-bridge.pw"; $receipt = "$t/mycelium-bridge-grant.txt"; $log = "$t/owner.log"
}
function Log { param([Parameter(ValueFromPipeline)]$l) process { $s = "$l"; Write-Host $s; Add-Content -Path $log -Value $s -Encoding UTF8 } }
function Stop-Pre($m) { "STOP: $m" | Log; exit 1 }
function Provision {
  $out = @(node --env-file=.env.local .\scripts\bridge-provision.mjs @args 2>&1 | ForEach-Object { "$_" })
  $code = $LASTEXITCODE
  $out | Log
  return @{ code = $code; text = ($out -join "`n") }
}
function Write-Mode([scriptblock]$body) {
  $env:MYCELIUM_REMOTE_WRITES_APPROVED = 'yes'
  try { return (& $body) } finally {
    Remove-Item Env:\MYCELIUM_REMOTE_WRITES_APPROVED -ErrorAction SilentlyContinue
    "write flag removed: $(-not (Test-Path Env:\MYCELIUM_REMOTE_WRITES_APPROVED))" | Log
  }
}
function Wipe-Copy {
  if (Test-Path -LiteralPath $pwfile -PathType Leaf) {
    try { $n = (Get-Item -LiteralPath $pwfile).Length; [System.IO.File]::WriteAllBytes($pwfile, (New-Object byte[] ([Math]::Max($n, 64)))) } catch { }
    Remove-Item -LiteralPath $pwfile -Force -ErrorAction SilentlyContinue
  }
  "password copy overwritten and deleted from the PC: $(-not (Test-Path -LiteralPath $pwfile))" | Log
}
function Read-Grant {
  if (-not (Test-Path -LiteralPath $receipt -PathType Leaf)) { return $null }
  $line = (Get-Content -LiteralPath $receipt | Where-Object { $_ -match '^grant=[0-9a-f-]{36}$' } | Select-Object -First 1)
  if (-not $line) { Stop-Pre "the receipt $receipt is malformed; nothing changed" }
  return $line.Substring(6)
}
function Close-Grant($grant) {
  $r = Write-Mode { Provision 'disable-login' $grant }
  if ($r.code -ne 0) { "close for grant $grant failed or was refused (a foreign role is never changed)" | Log; return $false }
  return ((Provision 'verify-closed' $grant).code -eq 0)
}
"== bridge owner $Mode $(Get-Date -Format o) on $env:COMPUTERNAME" | Log
if (($Mode -eq 'create' -or $Mode -eq 'rotate') -and -not $ValidUntil) { Stop-Pre '-ValidUntil is required (at most the approved ceiling)' }

Set-Location $repo
if ((git branch --show-current) -ne 'findpitches-v3/greenfield') { Stop-Pre 'wrong branch' }
git pull --ff-only origin findpitches-v3/greenfield 2>&1 | Log
if ($LASTEXITCODE -ne 0) { Stop-Pre 'update failed; local work preserved' }
git cat-file -e "$Commit^{commit}" 2>$null
if ($LASTEXITCODE -ne 0) { Stop-Pre "approved commit $Commit not found" }
git diff --quiet $Commit HEAD -- greenfield/mycelium/memory
if ($LASTEXITCODE -ne 0) { Stop-Pre "memory package differs from approved $Commit; the approval does not cover it" }
"memory package identical to approved $Commit" | Log
Set-Location (Join-Path (Join-Path (Join-Path $repo 'greenfield') 'mycelium') 'memory')
if (-not (Test-Path .\.env.local)) { Stop-Pre '.env.local missing; not recreated' }

if ($Mode -eq 'before') {
  if (Test-Path -LiteralPath $receipt) { Stop-Pre "a grant receipt already exists ($receipt)" }
  if ((Provision 'verify-absent').code -ne 0) { Stop-Pre 'the bridge login name already exists (or the read failed): it will not be used or changed' }
  "BEFORE OK: the bridge login name is free (read-only)" | Log; exit 0
}

if ($Mode -eq 'create') {
  if (Test-Path -LiteralPath $receipt) { Stop-Pre "a grant receipt already exists ($receipt); create is one-time (use rotate)" }
  if (-not (Test-Path -LiteralPath $pwfile -PathType Leaf)) { Stop-Pre "no password copy at $pwfile (scp it from fpd-prod first)" }
  try {
    if ((Get-Content -LiteralPath $pwfile -TotalCount 1) -notmatch '^[A-Za-z0-9_-]{40}$') { Stop-Pre 'password copy malformed (not printed)' }
    if ((Provision 'verify-absent').code -ne 0) { Stop-Pre 'the bridge login name already exists (or the read failed): nothing created' }
    $grant = [guid]::NewGuid().ToString().ToLower()
    try { New-Item -ItemType File -Path $receipt -Value "grant=$grant`ncommit=$Commit`nvalid_until=$ValidUntil`nat=$(Get-Date -Format o)`n" -ErrorAction Stop | Out-Null }
    catch { Stop-Pre "could not create the grant receipt exclusively; nothing created" }
    "grant $grant recorded in $receipt" | Log
    $c = Write-Mode { Provision 'create-login' $pwfile $grant $ValidUntil }
  } finally { Wipe-Copy }
  if ($c.code -eq 0 -and (Provision 'verify-login' $grant).code -eq 0) {
    "CREATE OK: bridge login for grant $grant verified least-privilege, valid until $ValidUntil. Next: 'whoami' on fpd-prod" | Log; exit 0
  }
  $o = Provision 'owned' $grant
  if ($o.text -match 'OWNERSHIP: absent') { Rename-Item -LiteralPath $receipt -NewName "$(Split-Path -Leaf $receipt).nothing-created-$(Get-Date -Format yyyyMMddTHHmmss)"; Stop-Pre 'create failed (nothing created)' }
  if ($o.text -match 'OWNERSHIP: foreign') { Stop-Pre 'a role of that name exists but is NOT this grant''s: left unchanged; inspect' }
  if ($o.text -match 'OWNERSHIP: ours') {
    if (Close-Grant $grant) { Rename-Item -LiteralPath $receipt -NewName "$(Split-Path -Leaf $receipt).closed-$(Get-Date -Format yyyyMMddTHHmmss)"; Stop-Pre 'create did not reach the approved state; the login was closed instead (verified)' }
    Stop-Pre "the login may still be active and closing it failed: rerun -Mode close"
  }
  Stop-Pre "outcome uncertain (database unreachable?): do NOT assume anything. Rerun -Mode close when reachable; the receipt keeps grant $grant"
}

if ($Mode -eq 'rotate') {
  $grant = Read-Grant; if (-not $grant) { Stop-Pre "no grant receipt on this PC; nothing to rotate" }
  if (-not (Test-Path -LiteralPath $pwfile -PathType Leaf)) { Stop-Pre "no password copy at $pwfile (run 'credential' on fpd-prod and scp it first)" }
  try {
    if ((Get-Content -LiteralPath $pwfile -TotalCount 1) -notmatch '^[A-Za-z0-9_-]{40}$') { Stop-Pre 'password copy malformed (not printed)' }
    $r = Write-Mode { Provision 'rotate-login' $pwfile $grant $ValidUntil }
  } finally { Wipe-Copy }
  if ($r.code -eq 0 -and (Provision 'verify-login' $grant).code -eq 0) { Add-Content -LiteralPath $receipt -Value "rotated=$(Get-Date -Format o) valid_until=$ValidUntil"; "ROTATE OK: grant $grant, valid until $ValidUntil" | Log; exit 0 }
  Stop-Pre "rotation not verified: the previous password may still be the valid one. Inspect; or -Mode close"
}

# close
$grant = Read-Grant
if (-not $grant) { "CLOSE: no grant receipt on this PC; nothing was created here, nothing changed" | Log; exit 0 }
if (Close-Grant $grant) {
  Rename-Item -LiteralPath $receipt -NewName "$(Split-Path -Leaf $receipt).closed-$(Get-Date -Format yyyyMMddTHHmmss)"
  "CLOSE OK: grant $grant is NOLOGIN, expired, with no membership, or was never created (verified read-only)" | Log; exit 0
}
Stop-Pre "grant ${grant}: closure NOT verified. Do not assume closed: rerun close, or disable mycelium_bridge_fpd in the Neon Console. A foreign role is never changed"
