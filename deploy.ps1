# ─────────────────────────────────────────────────────────────
#  deploy.ps1 — git pull + пересборка Docker-контейнера
#  Запуск:  powershell -ExecutionPolicy Bypass -File C:\app\deploy.ps1
# ─────────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "==> git pull" -ForegroundColor Cyan
git pull --ff-only

Write-Host "==> docker compose build" -ForegroundColor Cyan
docker compose build

Write-Host "==> docker compose up -d" -ForegroundColor Cyan
docker compose up -d

Write-Host "==> docker image prune" -ForegroundColor Cyan
docker image prune -f | Out-Null

Write-Host "Done." -ForegroundColor Green
docker compose ps