@echo off
chcp 65001 >nul
title Battery Service - IT8511A+
cd /d "%~dp0"

echo ================================
echo   Battery Test Service
echo   http://localhost:8765
echo ================================
echo.

if not exist "venv" (
    echo Cai dat lan dau...
    python -m venv venv
    call venv\Scripts\activate
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate
)

echo Dang khoi dong service...
uvicorn battery_service:app --host 0.0.0.0 --port 8765 --reload

pause
