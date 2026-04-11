@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

:: ============================================================
::  Cau hinh may tram — Chi can sua 2 dong duoi day
:: ============================================================

::  Ten hien thi cua tram nay (bat ky ten gi, khong dau cung duoc)
set STATION_NAME=Tram 1 - Day chuyen A

::  Dia chi may chu Voniko (Win Server co IP co dinh)
set VONIKO_SERVER_URL=http://10.4.1.11:3001

:: ============================================================
::  (Khong can sua gi them phia duoi)
:: ============================================================

title Battery Service - %STATION_NAME%

echo.
echo  +===================================================+
echo  ^|       VONIKO — KHOI DONG TRAM KIEM TRA PIN       ^|
echo  ^|  Tram  : %STATION_NAME%
echo  ^|  Server: %VONIKO_SERVER_URL%
echo  ^|  Port  : 8765
echo  +===================================================+
echo.

:: -------------------------------------------------------
:: Buoc 1: Kiem tra Python
:: -------------------------------------------------------
python --version >nul 2>&1
if errorlevel 1 (
    echo [LOI] Khong tim thay Python. Vui long cai dat Python 3.9+.
    pause
    exit /b 1
)
echo [OK] Python da san sang.

:: -------------------------------------------------------
:: Buoc 2: Tao venv neu chua co
:: -------------------------------------------------------
if not exist "hardware-services\venv" (
    echo [INSTALL] Tao moi truong ao Python...
    python -m venv hardware-services\venv
    if errorlevel 1 (
        echo [LOI] Khong tao duoc venv.
        pause
        exit /b 1
    )
    echo [OK] Moi truong ao da tao.
)

:: -------------------------------------------------------
:: Buoc 3: Kich hoat venv va cai thu vien
:: -------------------------------------------------------
call hardware-services\venv\Scripts\activate.bat

echo [INSTALL] Kiem tra / cap nhat thu vien Python...
pip install -r hardware-services\requirements.txt --quiet
if errorlevel 1 (
    echo [LOI] Cai dat thu vien that bai.
    pause
    exit /b 1
)
echo [OK] Thu vien Python da san sang.

:: -------------------------------------------------------
:: Buoc 4: Mo Windows Firewall cho port 8765
:: -------------------------------------------------------
echo [FW] Kiem tra firewall port 8765...
netsh advfirewall firewall show rule name="Voniko Battery 8765" >nul 2>&1
if errorlevel 1 (
    echo [FW] Them quy tac firewall cho port 8765...
    netsh advfirewall firewall add rule ^
        name="Voniko Battery 8765" ^
        dir=in ^
        action=allow ^
        protocol=TCP ^
        localport=8765 >nul
    echo [OK] Firewall da mo port 8765.
) else (
    echo [OK] Firewall port 8765 da duoc mo truoc do.
)

:: -------------------------------------------------------
:: Buoc 5: Khoi dong Python service
:: -------------------------------------------------------
echo.
echo [START] Khoi dong Battery Service...
echo         Tram se tu dang ky len %VONIKO_SERVER_URL%
echo         De dung: nhan Ctrl+C
echo.

python -m uvicorn battery_service:app ^
    --host 0.0.0.0 ^
    --port 8765 ^
    --app-dir hardware-services

echo.
echo [STOP] Battery Service da dung.
call deactivate
pause
