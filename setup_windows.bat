@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>&1 || (echo Install Python 3.11+ first.& pause & exit /b 1)
where node >nul 2>&1 || (echo Install Node.js 20+ first.& pause & exit /b 1)
python -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r backend\requirements.txt
cd frontend
npm install
cd ..
if not exist .env copy .env.example .env
echo.
echo Setup ready. Edit .env with a long random JWT_SECRET and DEVELOPER_PASSWORD.
echo Then run start_all.bat.
pause
