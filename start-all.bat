@echo off
chcp 65001 >nul
echo ========================================
echo   HR-360 演示环境启动器
echo ========================================
echo.
echo 正在启动 cloudflared 隧道...
echo.

start "HR360-后端API:3000" cmd /k "cd /d C:\Users\Tom & cloudflared tunnel --url http://localhost:3000 --protocol http2"
timeout /t 3 /nobreak >nul

start "HR360-管理端:5173" cmd /k "cd /d C:\Users\Tom & cloudflared tunnel --url http://localhost:5173 --protocol http2"
timeout /t 3 /nobreak >nul

start "HR360-H5端:5174" cmd /k "cd /d C:\Users\Tom & cloudflared tunnel --url http://localhost:5174 --protocol http2"

echo.
echo ========================================
echo  已启动3个隧道窗口
echo  请等待每个窗口显示 trycloudflare.com 地址
echo  将对应的地址复制给员工即可访问
echo ========================================
echo.
pause
