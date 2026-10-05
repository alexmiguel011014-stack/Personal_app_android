# Local test bench, one command (Windows / PowerShell): the Firebase emulators (Auth, Firestore,
# Storage, Functions) + fake accounts and data + the site pointed at them. Nothing real is touched:
# the project id is `demo-personal-tracker`, and nothing needs to be published to GitHub or Firebase.
#
#   npm run dev:local        then open http://localhost:3000/entrar/
#
# Accounts (password `senha123` for all): admin@teste.dev (ADM), treinador@teste.dev (personal),
# ana@teste.dev (student). Ctrl+C stops the site and the emulators. Re-running wipes and re-seeds.

$ErrorActionPreference = 'Stop'
$web = Split-Path -Parent $PSScriptRoot
Set-Location $web

# Firebase CLI 15 needs Java 21+; use the JDK Gradle already downloaded when the default one is older.
function Get-JavaMajor {
  try { $v = (& java -version 2>&1 | Select-Object -First 1).ToString(); if ($v -match '"(\d+)') { return [int]$Matches[1] } } catch {}
  return 0
}
if ((Get-JavaMajor) -lt 21) {
  $jdk = Get-ChildItem "$env:USERPROFILE\.gradle\jdks" -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'bin\java.exe') } | Select-Object -First 1
  if (-not $jdk) { throw 'Java 21 or newer is required for the Firebase emulators (see web/README.md).' }
  $env:JAVA_HOME = $jdk.FullName
  $env:PATH = "$($jdk.FullName)\bin;$env:PATH"
}

# The Functions emulator's default 10 s load timeout is too short on a cold start.
$env:FUNCTIONS_DISCOVERY_TIMEOUT = '60'
npm --prefix ../functions run build | Out-Null

$ports = 8081, 9099, 9199, 5001
foreach ($p in $ports) {
  if (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $p is already in use - another emulator is running. Stop it first."
  }
}

$emulators = Start-Process -PassThru -WindowStyle Minimized -FilePath 'powershell' -ArgumentList @(
  '-NoProfile', '-Command',
  "Set-Location '$web'; npx firebase emulators:start --config ../firebase.json --project demo-personal-tracker --only auth,firestore,storage,functions"
)

try {
  Write-Host 'Starting the emulators...'
  $deadline = (Get-Date).AddSeconds(150)
  foreach ($p in $ports) {
    while (-not (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)) {
      if ((Get-Date) -gt $deadline) { throw "Emulator on port $p did not start in time." }
      Start-Sleep -Seconds 2
    }
  }
  npm run seed:emulators
  $env:NEXT_PUBLIC_FIREBASE_EMULATORS = 'true'
  Write-Host "`nOpen http://localhost:3000/entrar/  (Ctrl+C stops everything)`n"
  npm run dev
}
finally {
  if ($emulators -and -not $emulators.HasExited) { taskkill /PID $emulators.Id /T /F | Out-Null }
}
