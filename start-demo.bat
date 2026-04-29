@echo off
chcp 65001 >nul
title HR360 一键启动（Cloudflare 隧道）

echo ========================================
echo   HR-360 演示环境启动器
echo   管理端:  built-parenting-nashville-verification.trycloudflare.com
echo   H5端:    referring-believe-recycling-jewel.trycloudflare.com
echo   后端API: copyrights-won-concord-mumbai.trycloudflare.com
echo ========================================
echo.

:: 1. 启动后端
echo [1/3] 启动后端 API (3000)...
tasklist /FI "IMAGENAME eq node.exe" /NH | findstr /I "tsx" >nul
if errorlevel 1 (
    Start-Process cmd /c "cd /d D:\HR开发\hr-360\backend ^&^& npx tsx watch src/main.ts"
)
echo [OK] 后端

:: 2. 启动管理端静态服务
echo [2/3] 启动管理端静态服务 (5173)...
:: 杀旧进程
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173.*LISTEN"') do taskkill /PID %%a /F >nul 2>&1
Start-Process python -m http.server -ArgumentList 5173 -WorkingDirectory "D:\HR开发\hr-360\admin\dist" -WindowStyle Hidden
echo [OK] 管理端

:: 3. 启动H5静态服务
echo [3/3] 启动H5静态服务 (5174)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5174.*LISTEN"') do taskkill /PID %%a /F >nul 2>&1
Start-Process python -m http.server -ArgumentList 5174 -WorkingDirectory "D:\HR开发\hr-360\h5\dist" -WindowStyle Hidden
echo [OK] H5

:: 4. 启动 cloudflared 隧道
echo.
echo 启动 Cloudflare 隧道（保持本窗口开启）...
echo.

Start-Process cmd /k "cloudflared tunnel --url http://localhost:3000"
Start-Process cmd /k "cloudflared tunnel --url http://localhost:5173 --protocol http2"
Start-Process cmd /k "cloudflared tunnel --url http://localhost:5174 --protocol http2"

echo ========================================
echo   启动完成！
echo   管理端:  built-parenting-nashville-verification.trycloudflare.com
echo   H5端:    referring-believe-recycling-jewel.trycloudflare.com
echo   后端API: copyrights-won-concord-mumbai.trycloudflare.com
echo ========================================
pause
