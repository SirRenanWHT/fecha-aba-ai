@echo off
setlocal
cd /d "%~dp0"

set "DSH_NODE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

where node >nul 2>nul
if not errorlevel 1 (
  set "NODE_CMD=node"
) else (
  set "NODE_CMD=%DSH_NODE%"
  if not exist "%DSH_NODE%" (
    echo Node.js nao encontrado. Instale em https://nodejs.org e tente de novo.
    pause
    exit /b 1
  )
)

if not exist "node_modules\vite" (
  echo Dependencias ausentes. Rode: pnpm install
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri 'http://127.0.0.1:4173/' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  echo.
  echo O Caderno ja esta rodando em http://127.0.0.1:4173
  start "" http://127.0.0.1:4173
  exit /b 0
)

if not exist "dist\index.html" (
  echo Gerando o build do Caderno...
  "%NODE_CMD%" node_modules\vite\bin\vite.js build
  if errorlevel 1 (
    echo Nao foi possivel gerar o build.
    pause
    exit /b 1
  )
)

echo.
echo Caderno disponivel em http://127.0.0.1:4173
echo Feche esta janela para parar o servidor.
echo.

start "" http://127.0.0.1:4173
"%NODE_CMD%" scripts\serve.mjs
