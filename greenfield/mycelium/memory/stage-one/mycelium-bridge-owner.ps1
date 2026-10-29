# Mycelium Stage One: OWNER steps for the persistent bridge login, on Chris's Windows PC (PROPOSAL; only within Chris's
# approval of the exact Stage One scope). Setup-time only: nothing here is in the operational path of a run.
#   powershell -ExecutionPolicy Bypass -File <checkout>\greenfield\mycelium\memory\stage-one\mycelium-bridge-owner.ps1 -Mode before -Commit <sha>
#       BEFORE the password copy is transferred: refuses an existing copy or link at the destination, checks the role
#       (absent for create; ours and open for rotate), then records that exactly one copy is now expected
#   (scp the copy from fpd-prod to C:\Users\ChrisT\mycelium-bridge.pw)
#   ... -Mode create -Commit <sha> -ValidUntil 2026-12-31T23:59:59Z   create mycelium_bridge_fpd under a new grant id
#   ... -Mode rotate -Commit <sha> -ValidUntil <time>                 new password (after `credential` on fpd-prod)
#   ... -Mode close  -Commit <sha>                                    disable this PC's recorded grant (NOLOGIN + expire + revoke)
# The expected copy is cleaned up in EVERY outcome of a create/rotate that PowerShell starts (prechecks included). If
# PowerShell rejects the command line itself (a mistyped -Mode or -Commit), the script never starts: rerun it correctly,
# or delete the copy by hand (BEFORE OK says where). Success is reported only
# when the copy is verifiably absent AND the login is verified; a copy that cannot be removed is a STOP. A copy that
# `before` did not expect is never touched. The code that runs must be the approved commit's: tracked files must match it
# and no untracked file may sit in the package. `close` needs no network to GitHub when the commit is already present.
# Neon accepts only plain-text passwords in CREATE/ALTER ROLE, so the copy is read once and sent over TLS. Uses the
# existing migration-owner .env.local; never prints a connection string or password. The owner never leaves this PC.
param([Parameter(Mandatory)][ValidateSet('before','create','rotate','close')][string]$Mode,
      [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$Commit,
      [string]$ValidUntil = '')   # validated INSIDE the cleanup block, so a missing or mistyped expiry still removes the copy
$ErrorActionPreference = 'Continue'
Set-PSDebug -Off
$repo = 'C:\Users\ChrisT\PitchListUK'
$pwfile = 'C:\Users\ChrisT\mycelium-bridge.pw'
$expect = 'C:\Users\ChrisT\mycelium-bridge.pw.expected'
$receipt = 'C:\Users\ChrisT\mycelium-bridge-grant.txt'
$log = 'C:\Users\ChrisT\mycelium-bridge-owner.log'
if ($env:MYC_OWNER_TEST_ROOT) {   # offline test harness only (pwsh with fake git/node); never set on the real PC
  $t = $env:MYC_OWNER_TEST_ROOT
  $repo = "$t/repo"; $pwfile = "$t/pw/mycelium-bridge.pw"; $expect = "$t/mycelium-bridge.pw.expected"; $receipt = "$t/mycelium-bridge-grant.txt"; $log = "$t/owner.log"
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
function Present($p) { return [bool](Get-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue) }   # files, folders, links (even dangling)
function Is-PlainFile($p) {
  $i = Get-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue
  return ($i -and -not $i.PSIsContainer -and -not ($i.Attributes -band [IO.FileAttributes]::ReparsePoint))
}
function Remove-Copy {   # overwrite then delete the expected copy; returns $true only if it is verifiably gone
  if (Is-PlainFile $pwfile) {
    try { $n = (Get-Item -LiteralPath $pwfile -Force).Length; [System.IO.File]::WriteAllBytes($pwfile, (New-Object byte[] ([Math]::Max($n, 64)))) } catch { "overwrite failed: $($_.Exception.GetType().Name)" | Log }
    try { Remove-Item -LiteralPath $pwfile -Force -ErrorAction Stop } catch { "delete failed: $($_.Exception.GetType().Name)" | Log }
  }
  $gone = -not (Present $pwfile)
  "password copy absent from the PC: $gone" | Log
  if ($gone) { Remove-Item -LiteralPath $expect -Force -ErrorAction SilentlyContinue }
  return $gone
}
function Verify-Source {   # the approved commit, and the files that will run are exactly that commit's
  Set-Location $repo
  if ((git branch --show-current) -ne 'findpitches-v3/greenfield') { throw 'wrong branch' }
  git cat-file -e "$Commit^{commit}" 2>$null
  if ($LASTEXITCODE -ne 0) {
    git pull --ff-only origin findpitches-v3/greenfield 2>&1 | Log
    git cat-file -e "$Commit^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) { throw "approved commit $Commit not found" }
  }
  git diff --quiet $Commit -- greenfield/mycelium/memory
  if ($LASTEXITCODE -ne 0) { throw "the memory package on disk differs from approved $Commit (tracked changes); the approval does not cover it" }
  $extra = @(git ls-files --others --exclude-standard -- greenfield/mycelium/memory)
  if ($extra.Count -gt 0) { throw "untracked files in the memory package ($($extra.Count)); the approval does not cover them" }
  "memory package on disk identical to approved $Commit" | Log
  Set-Location (Join-Path (Join-Path (Join-Path $repo 'greenfield') 'mycelium') 'memory')
  if (-not (Test-Path .\.env.local)) { throw '.env.local missing; not recreated' }
}
function Read-Grant {
  if (-not (Test-Path -LiteralPath $receipt -PathType Leaf)) { return $null }
  $line = (Get-Content -LiteralPath $receipt | Where-Object { $_ -match '^grant=[0-9a-f-]{36}$' } | Select-Object -First 1)
  if (-not $line) { throw "the receipt $receipt is malformed; nothing changed" }
  return $line.Substring(6)
}
function Close-Grant($grant) {
  $r = Write-Mode { Provision 'disable-login' $grant }
  if ($r.code -ne 0) { "close for grant $grant failed or was refused (a foreign role is never changed)" | Log; return $false }
  return ((Provision 'verify-closed' $grant).code -eq 0)
}
"== bridge owner $Mode $(Get-Date -Format o) on $env:COMPUTERNAME" | Log

if ($Mode -eq 'before') {
  if (Present $pwfile) { Stop-Pre "$pwfile already exists (or is a link): an unexpected copy is never used or touched; remove it yourself, then rerun" }
  if (Present $expect) { Stop-Pre "a copy is already expected ($expect); finish that create/rotate first" }
  try { Verify-Source; $grant = Read-Grant } catch { Stop-Pre "$($_.Exception.Message)" }
  if ($grant) {
    if ((Provision 'verify-login' $grant).code -ne 0) { Stop-Pre "grant $grant is not an open, exact bridge login: rotation is not possible (close it instead)" }
    $purpose = "rotate grant=$grant"
  } else {
    if ((Provision 'verify-absent').code -ne 0) { Stop-Pre 'the bridge login name already exists (or the read failed): it will not be used or changed' }
    $purpose = 'create'
  }
  try { New-Item -ItemType File -Path $expect -Value "$purpose`ncommit=$Commit`nat=$(Get-Date -Format o)`n" -ErrorAction Stop | Out-Null } catch { Stop-Pre 'could not record the expected copy exclusively' }
  "BEFORE OK ($purpose): now copy the password file from fpd-prod to $pwfile, then run -Mode $(($purpose -split ' ')[0]). If that command line is ever rejected before the script starts, delete $pwfile by hand" | Log; exit 0
}

if ($Mode -eq 'create' -or $Mode -eq 'rotate') {
  if (-not (Is-PlainFile $expect)) { Stop-Pre "no expected copy recorded: run -Mode before first. A copy that was not expected is never touched" }
  if (-not (Present $pwfile)) { Stop-Pre "no password copy at $pwfile yet (copy it from fpd-prod first); nothing changed" }
  # from here on the copy is the expected one: it is removed in every outcome
  $fail = $null; $c = $null; $grant = $null
  try {
    if ($ValidUntil -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$') { throw '-ValidUntil is required, as an ISO UTC time like 2026-12-31T23:59:59Z (at most the approved ceiling)' }
    $want = (Get-Content -LiteralPath $expect -TotalCount 1)
    $grant = Read-Grant
    if ($Mode -eq 'create' -and ($want -ne 'create' -or $grant)) { throw "the expected copy was for '$want', not create (or a grant receipt already exists)" }
    if ($Mode -eq 'rotate' -and $want -ne "rotate grant=$grant") { throw "the expected copy was for '$want', not rotate of this PC's grant" }
    if (-not (Is-PlainFile $pwfile)) { throw "$pwfile is not a plain file" }
    Verify-Source
    if ((Get-Content -LiteralPath $pwfile -TotalCount 1) -notmatch '^[A-Za-z0-9_-]{40}$') { throw 'password copy malformed (not printed)' }
    if ($Mode -eq 'create') {
      if ((Provision 'verify-absent').code -ne 0) { throw 'the bridge login name already exists (or the read failed): nothing created' }
      $grant = [guid]::NewGuid().ToString().ToLower()
      try { New-Item -ItemType File -Path $receipt -Value "grant=$grant`ncommit=$Commit`nvalid_until=$ValidUntil`nat=$(Get-Date -Format o)`n" -ErrorAction Stop | Out-Null }
      catch { throw 'could not create the grant receipt exclusively; nothing created' }
      "grant $grant recorded in $receipt" | Log
      $c = Write-Mode { Provision 'create-login' $pwfile $grant $ValidUntil }
    } else {
      $c = Write-Mode { Provision 'rotate-login' $pwfile $grant $ValidUntil }
    }
  } catch { $fail = "$($_.Exception.Message)" }
  finally { $gone = Remove-Copy }
  $verified = ($null -eq $fail) -and $c -and $c.code -eq 0 -and ((Provision 'verify-login' $grant).code -eq 0)
  if (-not $gone) { Stop-Pre "THE PASSWORD COPY COULD NOT BE REMOVED: delete $pwfile by hand now. Login state: $(if ($verified) { 'verified' } else { 'NOT verified' })$(if ($fail) { "; $fail" })" }
  if ($verified) {
    if ($Mode -eq 'rotate') { Add-Content -LiteralPath $receipt -Value "rotated=$(Get-Date -Format o) valid_until=$ValidUntil"; "ROTATE OK: grant $grant, valid until $ValidUntil; copy verifiably removed" | Log; exit 0 }
    "CREATE OK: bridge login for grant $grant verified least-privilege, valid until $ValidUntil; copy verifiably removed. Next: 'whoami' on fpd-prod" | Log; exit 0
  }
  if ($fail -and -not $c) { Stop-Pre "$fail (the copy was removed; nothing was sent to the database)" }
  if ($Mode -eq 'rotate') { Stop-Pre "rotation not verified: the previous password may still be the valid one. Inspect; or -Mode close" }
  $o = Provision 'owned' $grant
  if ($o.text -match 'OWNERSHIP: absent') { Rename-Item -LiteralPath $receipt -NewName "$(Split-Path -Leaf $receipt).nothing-created-$(Get-Date -Format yyyyMMddTHHmmss)"; Stop-Pre 'create failed (nothing created)' }
  if ($o.text -match 'OWNERSHIP: foreign') { Stop-Pre 'a role of that name exists but is NOT this grant''s: left unchanged; inspect' }
  if ($o.text -match 'OWNERSHIP: ours') {
    if (Close-Grant $grant) { Rename-Item -LiteralPath $receipt -NewName "$(Split-Path -Leaf $receipt).closed-$(Get-Date -Format yyyyMMddTHHmmss)"; Stop-Pre 'create did not reach the approved state; the login was closed instead (verified)' }
    Stop-Pre "the login may still be active and closing it failed: rerun -Mode close"
  }
  Stop-Pre "outcome uncertain (database unreachable?): do NOT assume anything. Rerun -Mode close when reachable; the receipt keeps grant $grant"
}

# close: works from the verified local checkout; GitHub is contacted only if the commit is missing locally
try { Verify-Source; $grant = Read-Grant } catch { Stop-Pre "$($_.Exception.Message)" }
if (-not $grant) { "CLOSE: no grant receipt on this PC; nothing was created here, nothing changed" | Log; exit 0 }
if (Close-Grant $grant) {
  Rename-Item -LiteralPath $receipt -NewName "$(Split-Path -Leaf $receipt).closed-$(Get-Date -Format yyyyMMddTHHmmss)"
  "CLOSE OK: grant $grant is NOLOGIN, expired, with no membership, or was never created (verified read-only)" | Log; exit 0
}
Stop-Pre "grant ${grant}: closure NOT verified. Do not assume closed: rerun close, or disable mycelium_bridge_fpd in the Neon Console. A foreign role is never changed"
