@echo off
chcp 65001 >nul
echo ========================================
echo   HR-360 外网演示 - 一键启动隧道
echo ========================================
echo.
echo 将打开3个窗口，分别是：
echo   [1] 后端 API  → cloudflared 3000
echo   [2] 管理端    → cloudflared 5173
echo   [3] H5端      → cloudflared 5174
echo.
echo 启动后每个窗口会显示 trycloudflare.com 地址
echo 复制对应的地址即可访问
echo.
echo 按任意键继续...
pause >nul

start "HR360-后端API" cmd /k "cloudflared tunnel --url http://localhost:3000"
start "HR360-管理端" cmd /k "cloudflared tunnel --url http://localhost:5173"
start "HR360-H5端" cmd /k "cloudflared tunnel --url http://localhost:5174"
