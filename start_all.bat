@echo off
start "MgO Backend" cmd /k "cd /d %~dp0 && call start_backend.bat"
timeout /t 3 /nobreak >nul
start "MgO Frontend" cmd /k "cd /d %~dp0 && call start_frontend.bat"
