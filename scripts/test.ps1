# Quality gate on Windows: backend lint + types + tests, frontend typecheck + lint + tests + build.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location "$Root\backend"
& .\.venv\Scripts\python.exe -m ruff check .; if ($LASTEXITCODE) { exit 1 }
& .\.venv\Scripts\python.exe -m mypy; if ($LASTEXITCODE) { exit 1 }
& .\.venv\Scripts\python.exe -m pytest; if ($LASTEXITCODE) { exit 1 }
Set-Location "$Root\frontend"
npm run typecheck; if ($LASTEXITCODE) { exit 1 }
npm run lint; if ($LASTEXITCODE) { exit 1 }
npm test; if ($LASTEXITCODE) { exit 1 }
npm run build; if ($LASTEXITCODE) { exit 1 }
Write-Host "All checks passed."
