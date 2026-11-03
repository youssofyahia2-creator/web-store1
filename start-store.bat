@echo off
setlocal
cd /d "%~dp0"

if not exist ".env.local" (
  copy ".env.example" ".env.local" >nul
  echo Created .env.local from .env.example
  echo Configure ADMIN_PASSWORD in .env.local before first launch.
)

echo [1/4] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install Node.js LTS from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

echo [2/4] Checking npm...
where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not available. Please reinstall Node.js.
  pause
  exit /b 1
)

echo [3/4] Installing dependencies...
call npm install
if errorlevel 1 (
  echo npm install failed. Check your internet connection and try again.
  pause
  exit /b 1
)

echo [4/4] Starting VANTAGE at http://localhost:3000
start "" "http://localhost:3000"
call npm start

echo Server stopped.
pause