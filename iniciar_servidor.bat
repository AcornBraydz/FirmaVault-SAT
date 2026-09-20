@echo off
chcp 65001 >nul
title FirmaVault SAT
cd /d "%~dp0"

node scripts/start.js

echo.
echo Presiona cualquier tecla para cerrar esta ventana (o se cerrará sola en 5 segundos)...
timeout /t 5 >nul
