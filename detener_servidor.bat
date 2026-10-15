@echo off
chcp 65001 >nul
title Detener FirmaVault SAT
cd /d "%~dp0"

node scripts/stop.js

echo.
echo Presiona cualquier tecla para cerrar esta ventana (o se cerrará sola en 3 segundos)...
timeout /t 3 >nul
