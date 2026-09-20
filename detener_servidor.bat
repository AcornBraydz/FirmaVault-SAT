@echo off
chcp 65001 >nul
title Detener FirmaVault SAT
cd /d "%~dp0"

node scripts/stop.js

echo.
pause
