# Runs on the producer's Windows host. It reads exports; never changes producer code/data.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$TokenFile,
  [string]$ExportDirectory = 'C:\Users\ChrisT\OneDrive - Managed Technology Corporation Ltd\Documents\fp-discovery-lab\integration_export',
  [string]$FilePattern = '*.json*',
  [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'FindPitchesV3\producer-delivery'),
  [string]$NodePath = (Get-Command node -ErrorAction Stop).Source,
  [string]$IngestUrl = 'https://findpitches-v3-ingest-shadow.ctucker.workers.dev'
)
$ErrorActionPreference = 'Stop'
$nodeVersion = (& $NodePath --version).TrimStart('v')
if ([version]$nodeVersion -lt [version]'22.13.0') { throw 'Node 22.13 or newer is required' }
if (-not (Test-Path -LiteralPath $ExportDirectory -PathType Container)) { throw 'Export directory not found' }
if ($FilePattern -notmatch '^[a-zA-Z0-9_.\-*]+$') { throw 'Invalid export file pattern' }
$runner = Join-Path $RepositoryRoot 'operations\findpitches-v3\producer-runner.mjs'
if (-not (Test-Path -LiteralPath $runner)) { throw 'V3 producer runner not found' }
$secret = Get-Content -LiteralPath $TokenFile -Raw
if ($secret -notmatch '(?m)^\s*V3_INGEST_TOKEN\s*=\s*[^\r\n]{24,}\s*$') { throw 'An ingest-only V3 token file is required' }
if ($secret -match 'CLOUDFLARE_|V3_OPERATOR_TOKEN|SERPER_API_KEY') { throw 'Do not provide operator or provider credentials to the producer' }
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls $StateRoot /inheritance:r /grant:r "${identity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect producer delivery state' }
$secureToken = Join-Path $StateRoot 'ingest.env'
if (([IO.Path]::GetFullPath($TokenFile)) -ne ([IO.Path]::GetFullPath($secureToken))) { Copy-Item -LiteralPath $TokenFile -Destination $secureToken -Force }
$config = Join-Path $StateRoot 'runner.json'
$configuration = @{
  input_directory = $ExportDirectory; file_pattern = $FilePattern
  ingest_url = $IngestUrl; token_file = $secureToken
  state_dir = (Join-Path $StateRoot 'state'); environment = 'shadow'; interval_seconds = 900
}
[IO.File]::WriteAllText($config, ($configuration | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$arguments = '"{0}" --config "{1}"' -f $runner, $config
$action = New-ScheduledTaskAction -Execute $NodePath -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'FindPitches-V3-Structured-Delivery' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Output 'V3 shadow delivery scheduled every 15 minutes while this user is signed in. Check state/status.json for delivery and freshness.'
