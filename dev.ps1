# Starts the Flask API and the Vite dev server in two PowerShell windows.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$root\backend'; ..\.venv\Scripts\python.exe -m flask --app run.py run --port 5001"
)

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$root\frontend'; npm run dev"
)

Write-Host "Backend:  http://127.0.0.1:5001"
Write-Host "Frontend: http://localhost:5173"
