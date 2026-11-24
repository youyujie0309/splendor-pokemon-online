@echo off
chcp 65001 >nul
title 璀璨宝石：宝可梦 联机服务器
echo ==========================================
echo   璀璨宝石：宝可梦 联机服务器 启动器
echo ==========================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [错误] 未检测到 Node.js，请先前往 https://nodejs.org 下载安装 LTS 版本！
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [首次启动] 正在使用国内镜像安装依赖，请稍候...
  call npm install --registry=https://registry.npmmirror.com
  if %errorlevel% neq 0 (
    echo [错误] 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

echo.
echo [启动中] 端口: 3000 (本机访问: http://127.0.0.1:3000)
echo [提示] 保持此窗口开启，搭配 cpolar 穿透 3000 端口即可发给朋友联机！
echo.
node server/index.js
pause
