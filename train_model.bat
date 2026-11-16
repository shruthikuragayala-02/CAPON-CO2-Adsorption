@echo off
setlocal
cd /d "%~dp0backend"
if exist ..\.venv\Scripts\activate.bat call ..\.venv\Scripts\activate.bat
python -m ml.train --data ..\..\data\mgo_database_source_normalized.csv --out .. --quick --seed 42 --alpha 0.10
pause
