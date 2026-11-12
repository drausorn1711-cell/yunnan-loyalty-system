@echo off
chcp 65001 > nul
title PointX Pro - Loyalty Reward System
color 0F

echo ======================================================
echo    PointX Pro - ระบบบริหารจัดการแต้มสะสม & บัตรสมาชิก
echo ======================================================
echo.
echo กำลังเริ่มต้นระบบ...
echo.

cd /d "%~dp0"
node server.js

pause
