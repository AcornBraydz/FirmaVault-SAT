@echo off
chcp 65001 >nul
title Instalador - FirmaVault SAT
cd /d "%~dp0"

echo ============================================================
echo   🔒 INSTALADOR AUTOMÁTICO DE FIRMAVAULT SAT
echo ============================================================
echo.
echo Preparando el entorno para que puedas usar el sistema sin problemas...
echo.

:: 1. Verificar si Node.js está instalado
echo [1/6] Verificando Node.js...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Node.js no está instalado o no se encuentra en el PATH.
    echo Intentando instalar Node.js automáticamente con winget...
    winget install OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo No se pudo instalar automáticamente. Abriendo página de descarga oficial...
        start https://nodejs.org/en/download/
        echo Por favor instala Node.js LTS, reinicia este instalador y continúa.
        pause
        exit /b 1
    )
    echo ✔ Node.js instalado. Continuando...
) else (
    for /f "tokens=*" %%v in ('node -v') do echo   ✔ Node.js detectado (%%v)
)

:: 2. Configurar archivo .env
echo.
echo [2/6] Configurando variables de entorno (.env)...
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo   ✔ Archivo .env creado a partir de .env.example
    ) else (
        (
            echo PORT=3001
            echo DATABASE_URL="file:./dev.db"
            echo JWT_SECRET="firmavault-sat-secret-token-key-2024-local-development"
            echo JWT_EXPIRES_IN="8h"
            echo MASTER_PASSWORD="FirmaVault2024!"
            echo ADMIN_PASSWORD="AdminSAT2024!"
            echo ENCRYPTION_KEY="a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
            echo CORS_ORIGINS="http://localhost:5173,http://localhost:3001"
            echo NODE_ENV="development"
        ) > .env
        echo   ✔ Archivo .env generado exitosamente.
    )
) else (
    echo   ✔ Archivo .env ya existe.
)

:: 3. Instalar dependencias de Node.js
echo.
echo [3/6] Instalando dependencias de Node.js...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Ocurrió un error al ejecutar 'npm install'.
    pause
    exit /b 1
)
echo   ✔ Dependencias de Node.js instaladas correctamente.

:: 4. Sincronizar Base de Datos con Prisma
echo.
echo [4/6] Sincronizando cliente de base de datos (Prisma)...
call npx prisma generate
if not exist "prisma\dev.db" (
    call npx prisma db push
)
echo   ✔ Base de datos y cliente Prisma listos.

:: 5. Verificar e Instalar Dependencias de Python
echo.
echo [5/6] Verificando entorno de Python para herramientas SAT...
set PYTHON_CMD=
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PYTHON_CMD=python
) else (
    where py >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        set PYTHON_CMD=py
    )
)

if "%PYTHON_CMD%"=="" (
    echo.
    echo ℹ Python no está instalado en el sistema.
    echo Intentando instalar Python automáticamente con winget...
    winget install Python.Python.3.11 -e --accept-source-agreements --accept-package-agreements
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo No se pudo instalar automáticamente. Abriendo página de descarga oficial...
        start https://www.python.org/downloads/
        echo IMPORTANTE: Al instalar Python, marca la casilla "Add python.exe to PATH".
    ) else (
        set PYTHON_CMD=python
    )
)

if not "%PYTHON_CMD%"=="" (
    for /f "tokens=*" %%v in ('%PYTHON_CMD% --version') do echo   ✔ Python detectado: %%v
    if exist "requirements.txt" (
        echo   Instalando librerías de Python (Selenium, satcfdi, pandas, etc.)...
        %PYTHON_CMD% -m pip install --upgrade pip >nul 2>&1
        %PYTHON_CMD% -m pip install -r requirements.txt
        if %ERRORLEVEL% EQU 0 (
            echo   ✔ Librerías de Python instaladas con éxito.
        ) else (
            echo   ⚠ Hubo advertencias al instalar algunas librerías de Python, continuando...
        )
    )
)

:: 6. Compilar aplicación web
echo.
echo [6/6] Compilando aplicación web (Vite build)...
call npm run build
echo   ✔ Aplicación compilada correctamente.

echo.
echo ============================================================
echo   ✅ ¡INSTALACIÓN COMPLETADA CON ÉXITO!
echo ============================================================
echo.
echo Ya está todo listo para que uses FirmaVault SAT.
echo.
echo 👉 Para abrir el sistema: Haz doble clic en "iniciar_servidor.bat"
echo 👉 Para apagar el sistema: Haz doble clic en "detener_servidor.bat"
echo.
echo Contraseñas de acceso:
echo   - Contraseña Maestra:       FirmaVault2024!
echo   - Contraseña Administrador: AdminSAT2024!
echo ============================================================
echo.
pause
