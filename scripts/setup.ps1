# One-time setup for Windows (PowerShell 5.1+). Usage:  .\scripts\setup.ps1   or   .\scripts\setup.ps1 -Sqlite
#   -Sqlite  development-only fallback when PostgreSQL is not installed
# If scripts are blocked:  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
param([switch]$Sqlite)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Set-EnvLine([string]$Path, [string]$Pattern, [string]$Line) {
  $content = (Get-Content $Path) -replace $Pattern, $Line
  [System.IO.File]::WriteAllLines($Path, $content, $Utf8NoBom)
}

Set-Location "$Root\backend"
$py = "python"
if (Get-Command py -ErrorAction SilentlyContinue) { $py = "py" }
& $py -c "import sys; assert sys.version_info >= (3, 11), 'Python 3.11+ is required'"
if ($LASTEXITCODE) { throw "Python 3.11+ is required (https://www.python.org/downloads/)" }
if (-not (Test-Path ".venv")) { & $py -m venv .venv }
& .\.venv\Scripts\python.exe -m pip install --upgrade pip | Out-Null
& .\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
if ($LASTEXITCODE) { throw "pip install failed" }
$envPath = Join-Path (Get-Location) ".env"
if (-not (Test-Path $envPath)) {
  Copy-Item .env.example $envPath
  $secret = & .\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
  Set-EnvLine $envPath '^JWT_SECRET=.*' "JWT_SECRET=$secret"
  Write-Host "Created backend\.env with a generated JWT_SECRET"
}
if ($Sqlite) {
  Set-EnvLine $envPath '^DATABASE_URL=.*' 'DATABASE_URL=sqlite:///./wo_dev.db'
  Write-Host "Using the SQLite development fallback (backend\wo_dev.db)"
}
Write-Host "Applying migrations (schema + reference knowledge)..."
& .\.venv\Scripts\python.exe -m alembic upgrade head
if ($LASTEXITCODE) { throw "Migration failed - check DATABASE_URL in backend\.env (or rerun with -Sqlite)" }
Set-Location "$Root\frontend"
npm ci
if ($LASTEXITCODE) { throw "npm ci failed (Node.js 20+ required)" }
Write-Host ""
Write-Host "Setup complete. Start everything with: .\scripts\dev.ps1"
Write-Host "Optional super admin: cd backend; .\.venv\Scripts\python.exe -m app.scripts.create_superadmin --email admin@example.com"
