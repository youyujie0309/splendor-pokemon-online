#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js，请先安装 Node.js 18+ (https://nodejs.org)"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "[首次启动] 正在使用国内镜像安装依赖..."
  npm install --registry=https://registry.npmmirror.com
fi

echo "🎮 本机访问: http://127.0.0.1:3000"
echo "💡 保持此终端开启，搭配 cpolar 穿透 3000 端口即可发给朋友联机！"
node server/index.js
