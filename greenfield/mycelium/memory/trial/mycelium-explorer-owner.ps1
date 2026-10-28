# Mycelium L1 explorer trial: OWNER steps on Chris's Windows PC (PROPOSAL; only after Chris approves the exact plan).
#   powershell -ExecutionPolicy Bypass -File <checkout>\greenfield\mycelium\memory\trial\mycelium-explorer-owner.ps1 -Mode before -Commit <sha>
#   ... -Mode create -Commit <sha>    create the explorer login bound to a new attempt id, verify it, delete the verifier
#   ... -Mode close  -Commit <sha>    ALWAYS after the trial: close ONLY this PC's recorded attempt (NOLOGIN + revoke), verify
# Every database change is bound to one attempt id, kept in an exclusively created receipt on this PC and written as the
# role's comment in the creating transaction. A pre-existing or foreign role of the same name is reported, never changed.
# Uses the existing migration-owner .env.local; never prints a connection string, password or verifier.
param([Parameter(Mandatory)][ValidateSet('before','create','close')][string]$Mode,
      [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$Commit)
$ErrorActionPreference = 'Continue'
Set-PSDebug -Off
$repo = 'C:\Users\ChrisT\PitchListUK'
$verifier = 'C:\Users\ChrisT\mycelium-explorer.scram'
$receipt = 'C:\Users\ChrisT\mycelium-explorer-attempt.txt'
$log = 'C:\Users\ChrisT\mycelium-explorer-owner.log'
if ($env:MYC_OWNER_TEST_ROOT) {   # offline test harness only (pwsh with fake git/node); never set on the real PC
  $t = $env:MYC_OWNER_TEST_ROOT
  $repo = "$t/repo"; $verifier = "$t/mycelium-explorer.scram"; $receipt = "$t/mycelium-explorer-attempt.txt"; $log = "$t/owner.log"
}
function Log { param([Parameter(ValueFromPipeline)]$l) process { $s = "$l"; Write-Host $s; Add-Content -Path $log -Value $s -Encoding UTF8 } }
function Stop-Pre($m) { "STOP: $m" | Log; exit 1 }
function Provision {   # runs explorer-provision.mjs with the given arguments; logs output; returns @{ code; text }
  $out = @(node --env-file=.env.local .\scripts\explorer-provision.mjs @args 2>&1 | ForEach-Object { "$_" })
  $code = $LASTEXITCODE
  $out | Log
  return @{ code = $code; text = ($out -join "`n") }
}
function Write-Mode([scriptblock]$body) {   # the write flag exists only inside this block
  $env:MYCELIUM_REMOTE_WRITES_APPROVED = 'yes'
  try { return (& $body) } finally {
    Remove-Item Env:\MYCELIUM_REMOTE_WRITES_APPROVED -ErrorAction SilentlyContinue
    "write flag removed: $(-not (Test-Path Env:\MYCELIUM_REMOTE_WRITES_APPROVED))" | Log
  }
}
function Close-Attempt($attempt) {   # closes ONLY this attempt's role; returns $true when verified closed or absent
  $r = Write-Mode { Provision 'disable-login' $attempt }
  if ($r.code -ne 0) { "close for attempt $attempt failed or was refused (a foreign role is never changed)" | Log; return $false }
  $v = Provision 'verify-closed' $attempt
  return ($v.code -eq 0)
}
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
Set-Location (Join-Path (Join-Path (Join-Path $repo 'greenfield') 'mycelium') 'memory')
if (-not (Test-Path .\.env.local)) { Stop-Pre '.env.local missing; not recreated' }

if ($Mode -eq 'before') {
  if (Test-Path -LiteralPath $receipt) { Stop-Pre "an earlier attempt receipt exists ($receipt); run close for it first" }
  $r = Provision 'verify-absent'
  if ($r.code -ne 0) { Stop-Pre 'mycelium_explorer_fpd already exists (or the read failed): the trial will not use or change it' }
  "BEFORE OK: actual Neon role/membership options recorded above; the explorer login name is free (read-only)" | Log
  exit 0
}

if ($Mode -eq 'create') {
  if (Test-Path -LiteralPath $receipt) { Stop-Pre "an attempt receipt already exists ($receipt); run close for it first" }
  if (-not (Test-Path -LiteralPath $verifier -PathType Leaf)) { Stop-Pre "no verifier at $verifier (copy it from fpd-prod with scp first)" }
  try {
    if ((Get-Content -LiteralPath $verifier -TotalCount 1) -notmatch '^SCRAM-SHA-256\$4096:') { Stop-Pre 'verifier malformed' }
    if ((Provision 'verify-absent').code -ne 0) { Stop-Pre 'mycelium_explorer_fpd already exists (or the read failed): nothing created, nothing changed' }
    $attempt = [guid]::NewGuid().ToString().ToLower()
    try { New-Item -ItemType File -Path $receipt -Value "attempt=$attempt`ncommit=$Commit`nat=$(Get-Date -Format o)`n" -ErrorAction Stop | Out-Null }
    catch { Stop-Pre "could not create the attempt receipt exclusively; nothing created" }
    "attempt $attempt recorded in $receipt" | Log
    $c = Write-Mode { Provision 'create-login' $verifier $attempt }
  } finally {
    Remove-Item -LiteralPath $verifier -Force -ErrorAction SilentlyContinue
    "verifier deleted from the PC: $(-not (Test-Path -LiteralPath $verifier))" | Log
  }
  if ($c.code -eq 0 -and (Provision 'verify-login' $attempt).code -eq 0) {
    "CREATE OK: login for attempt $attempt verified least-privilege. Next: run 'run' on fpd-prod, then close on both" | Log; exit 0
  }
  # failed or uncertain: reconcile read-only, then act only on what this attempt provably created
  $o = Provision 'owned' $attempt
  if ($o.text -match 'OWNERSHIP: absent') { "create did not take effect: nothing was created; nothing to close" | Log; Rename-Item -LiteralPath $receipt -NewName "$(Split-Path -Leaf $receipt).nothing-created-$(Get-Date -Format yyyyMMddTHHmmss)"; Stop-Pre 'create failed (nothing created)' }
  if ($o.text -match 'OWNERSHIP: foreign') { Stop-Pre 'a role of that name exists but is NOT this attempt''s: left unchanged; inspect before anything else' }
  if ($o.text -match 'OWNERSHIP: ours') {
    if (Close-Attempt $attempt) { Rename-Item -LiteralPath $receipt -NewName "$(Split-Path -Leaf $receipt).closed-$(Get-Date -Format yyyyMMddTHHmmss)"; Stop-Pre 'create did not reach the approved state; this attempt''s login was closed instead (verified)' }
    Stop-Pre "this attempt's login may still be active and closing it failed: rerun -Mode close, or disable mycelium_explorer_fpd in the Neon Console"
  }
  Stop-Pre "outcome uncertain (database unreachable?): do NOT assume anything. Rerun -Mode close when reachable; the receipt keeps attempt $attempt"
}

# close: only the attempt recorded on this PC
if (-not (Test-Path -LiteralPath $receipt -PathType Leaf)) { "CLOSE: no attempt receipt on this PC; nothing was created by this trial here, nothing changed" | Log; exit 0 }
$line = (Get-Content -LiteralPath $receipt | Where-Object { $_ -match '^attempt=[0-9a-f-]{36}$' } | Select-Object -First 1)
if (-not $line) { Stop-Pre "the receipt $receipt is malformed; nothing changed" }
$attempt = $line.Substring(8)
if (Close-Attempt $attempt) {
  Rename-Item -LiteralPath $receipt -NewName "$(Split-Path -Leaf $receipt).closed-$(Get-Date -Format yyyyMMddTHHmmss)"
  "CLOSE OK: attempt $attempt is NOLOGIN with no membership, or was never created (verified read-only)" | Log; exit 0
}
Stop-Pre "attempt ${attempt}: closure NOT verified. Do not assume closed: rerun close, or disable mycelium_explorer_fpd in the Neon Console. A foreign role is never changed"
