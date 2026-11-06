# Start the API (http://localhost:8000/api/docs) and the web app (http://localhost:5173) in two windows.
$Root = Split-Path -Parent $PSScriptRoot
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\frontend'; npm run dev"
Write-Host "Backend: http://localhost:8000/api/docs   Frontend: http://localhost:5173"
