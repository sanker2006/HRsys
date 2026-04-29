@echo off
setlocal enabledelayedexpansion

set CPOLAR=D:\HR开发\cpolar\cpolar.exe
set BACKEND_DIR=D:\HR开发\hr-360\backend
set ADMIN_DIR=D:\HR开发\hr-360\admin
set H5_DIR=D:\HR开发\hr-360\h5
set LOG=D:\HR开发\cpolar-urls.log

echo ========================================= > %LOG%
echo HR-360 启动脚本 %date% %time% >> %LOG%
echo ========================================= >> %LOG%

REM ── 1. 杀掉旧的 cpolar 进程 ─────────────────────────────────
echo [1/5] 清理旧进程...
taskkill /F /IM cpolar.exe 2>nul
timeout /t 2 /nobreak >nul

REM ── 2. 杀掉旧的 frontend 进程 ─────────────────────────────────
echo [2/5] 清理旧前端服务...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173.*LISTENING"') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5174.*LISTENING"') do taskkill /F /PID %%a 2>nul
timeout /t 2 /nobreak >nul

REM ── 3. 杀掉旧的 backend tsx 进程 ─────────────────────────────
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000.*LISTENING"') do taskkill /F /PID %%a 2>nul
echo [3/5] 后端已清理

REM ── 4. 启动后端 ───────────────────────────────────────────────
echo [4/5] 启动后端 (localhost:3000)...
start /b cmd /c ""D:\HR开发\hr-360\backend\node_modules\.bin\tsx.cmd" watch src/main.ts" 2>nul
echo     后端已启动

REM ── 5. 启动 cpolar（同时穿透三个端口）并捕获 URL ─────────────
echo [5/5] 启动 cpolar 并捕获公网地址...

set BACKEND_URL=
set CPOLAR_READY=0

REM 启动 cpolar 指向 backend (3000)
start /b cmd /c "%CPOLAR% http 3000 >> D:\HR开发\cpolar_backend.log 2>&1"
REM 启动 cpolar 指向 admin (5173)
start /b cmd /c "%CPOLAR% http 5173 >> D:\HR开发\cpolar_admin.log 2>&1"
REM 启动 cpolar 指向 h5 (5174)
start /b cmd /c "%CPOLAR% http 5174 >> D:\HR开发\cpolar_h5.log 2>&1"

REM 轮询等待 cpolar 输出 backend URL（最多 30 秒）
for /f "tokens=2 delims==" %%v in ('wmic os get localdatetime /value 2^>nul') do set STARTTIME=%%v
set /a DEADLINE=%STARTTIME:~0,8% + 30

:wait_cpolar
    timeout /t 2 /nobreak >nul

    REM 从 backend 日志里抓 URL（cpolar 输出格式：Forwarding ... -> tcp://localhost:3000）
    for /f "usebackq tokens=*" %%l in (`type "D:\HR开发\cpolar_backend.log" 2^>nul ^| findstr /r "https://.*\.cpolar.*"`) do (
        echo %%l >> %LOG%
        for /f "tokens=1" %%u in ("%%l") do set BACKEND_URL=%%u
    )

    if not "%BACKEND_URL%"=="" (
        set CPOLAR_READY=1
        goto cpolar_done
    )

    REM 超时 30 秒
    for /f "tokens=2 delims==" %%v in ('wmic os get localdatetime /value 2^>nul') do set NOW=%%v
    if "%NOW:~0,8%" gtr "%DEADLINE%" (
        echo WARNING: cpolar URL 超时未捕获，backend 可能需要手动配置 >> %LOG%
        goto cpolar_done
    )
    goto wait_cpolar

:cpolar_done

if "%BACKEND_URL%"=="" (
    echo ERROR: 无法获取 cpolar URL，查看 D:\HR开发\cpolar_backend.log
    set BACKEND_URL=http://localhost:3000
) else (
    REM cpolar 返回格式类似 "https://abc123.r11.cpolar.top"，去掉末尾路径只保留 origin
    echo Backend 公网地址: %BACKEND_URL% >> %LOG%
    echo [OK] cpolar 隧道已就绪
)

REM ── 6. 更新前端 .env.local ────────────────────────────────────
echo 更新前端配置...

REM admin
(
    echo VITE_API_BASE_URL=%BACKEND_URL%/api/v1
) > "%ADMIN_DIR%\.env.local"

REM h5
(
    echo VITE_API_BASE_URL=%BACKEND_URL%/api/v1
) > "%H5_DIR%\.env.local"

echo   admin  .env.local = %BACKEND_URL%/api/v1
echo   h5     .env.local = %BACKEND_URL%/api/v1

REM ── 7. 启动前端服务 ───────────────────────────────────────────
echo 启动前端服务...
start /b cmd /c "cd /d "%ADMIN_DIR%" ^&^& node node_modules\vite\bin\vite.js --host 0.0.0.0 --port 5173"
start /b cmd /c "cd /d "%H5_DIR%" ^&^& node node_modules\vite\bin\vite.js --host 0.0.0.0 --port 5174"

REM ── 8. 等待前端启动 ───────────────────────────────────────────
timeout /t 8 /nobreak >nul

REM ── 9. 验证 ───────────────────────────────────────────────────
echo.
echo =========================================
echo  启动完成
echo =========================================
netstat -ano ^| findstr ":3000.*LISTENING" ^| findstr "TCP" && echo   Backend : OK || echo   Backend : FAILED
netstat -ano ^| findstr ":5173.*LISTENING" ^| findstr "TCP" && echo   Admin   : OK || echo   Admin   : FAILED
netstat -ano ^| findstr ":5174.*LISTENING" ^| findstr "TCP" && echo   H5      : OK || echo   H5      : FAILED
if not "%BACKEND_URL%"=="" (
    echo   公网   : %BACKEND_URL%
)
echo.
echo 日志文件: D:\HR开发\cpolar-urls.log
echo =========================================
endlocal
