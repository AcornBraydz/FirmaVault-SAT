@echo off
chcp 65001 >nul
title FirmaVault SAT
cd /d "%~dp0"

:: Verificar si node_modules existe; si no, ejecutar instalador automáticamente
if not exist "node_modules" (
    echo ============================================================
    echo   Detectada primera ejecución. Instalando dependencias...
    echo ============================================================
    call instalar_todo.bat
)

:: Verificar si .env existe
if not exist ".env" (
    if exist ".env.example" copy ".env.example" ".env" >nul
)

node scripts/start.js

echo.
echo Presiona cualquier tecla para cerrar esta ventana (o se cerrará sola en 5 segundos)...
timeout /t 5 >nul
