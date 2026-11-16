@echo off
setlocal
cd /d "%~dp0frontend"
if not exist node_modules (
  echo Install frontend dependencies first with: npm install
  pause
  exit /b 1
)
npm run dev -- --host 0.0.0.0
