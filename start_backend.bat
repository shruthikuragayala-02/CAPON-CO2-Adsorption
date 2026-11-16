@echo off
setlocal
cd /d "%~dp0backend"
if not exist ..\.env (
  echo Missing .env. Copy .env.example to .env and set JWT_SECRET and DEVELOPER_PASSWORD.
  pause
  exit /b 1
)
if exist ..\.venv\Scripts\activate.bat call ..\.venv\Scripts\activate.bat
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --env-file ..\.env
