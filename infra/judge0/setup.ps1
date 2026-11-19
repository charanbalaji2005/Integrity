# Generates infra/judge0/judge0.conf with random secrets and writes
# JUDGE0_URL / JUDGE0_AUTH_TOKEN into backend/.env. Safe to re-run: an
# existing judge0.conf is kept (delete it to rotate secrets).
#   powershell -ExecutionPolicy Bypass -File infra/judge0/setup.ps1
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$conf = Join-Path $here "judge0.conf"
$envFile = Join-Path $here "..\..\backend\.env"

function New-Secret([int]$bytes = 32) {
  $b = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return ([Convert]::ToBase64String($b) -replace '[^A-Za-z0-9]', '')
}

if (-not (Test-Path $conf)) {
  $text = Get-Content (Join-Path $here "judge0.conf.example") -Raw
  $text = $text.Replace("CHANGE_ME_AUTHN_TOKEN", (New-Secret)).
               Replace("CHANGE_ME_AUTHZ_TOKEN", (New-Secret)).
               Replace("CHANGE_ME_REDIS_PASSWORD", (New-Secret)).
               Replace("CHANGE_ME_POSTGRES_PASSWORD", (New-Secret))
  [System.IO.File]::WriteAllText($conf, $text)
  Write-Host "Created $conf"
} else {
  Write-Host "Keeping existing $conf"
}

$token = (Select-String -Path $conf -Pattern '^AUTHN_TOKEN=(.+)$').Matches[0].Groups[1].Value
if (Test-Path $envFile) {
  $lines = Get-Content $envFile | Where-Object { $_ -notmatch '^JUDGE0_(URL|AUTH_TOKEN)=' }
  $lines += "JUDGE0_URL=http://localhost:2358"
  $lines += "JUDGE0_AUTH_TOKEN=$token"
  [System.IO.File]::WriteAllLines((Resolve-Path $envFile), $lines)
  Write-Host "Updated backend/.env with JUDGE0_URL and JUDGE0_AUTH_TOKEN"
} else {
  Write-Host "backend/.env not found. Add: JUDGE0_URL=http://localhost:2358 and JUDGE0_AUTH_TOKEN=$token"
}
