#!/bin/bash
set -e
B="http://100.79.18.62:3099"
echo "============================================"
echo "  Avatar AI 手机 Agent 自动安装"
echo "  服务器: $B"
echo "============================================"

mkdir -p ~/avatar-ai-video/phone-agent ~/avatar-ai-video/shared

echo "[1/6] 下载 agent.js..."
curl -sLo ~/avatar-ai-video/phone-agent/agent.js "$B/phone-files/agent.js"

echo "[2/6] 下载 action-engine.js..."
curl -sLo ~/avatar-ai-video/phone-agent/action-engine.js "$B/phone-files/action-engine.js"

echo "[3/6] 下载 adb-bridge.js..."
curl -sLo ~/avatar-ai-video/phone-agent/adb-bridge.js "$B/phone-files/adb-bridge.js"

echo "[4/6] 下载 file-downloader.js..."
curl -sLo ~/avatar-ai-video/phone-agent/file-downloader.js "$B/phone-files/file-downloader.js"

echo "[5/6] 下载 shared 模块..."
curl -sLo ~/avatar-ai-video/shared/mqtt-protocol.js "$B/phone-files/shared/mqtt-protocol.js"

echo "[6/6] 初始化..."
echo '{"name":"phone-agent","version":"1.0.0","private":true,"type":"module","dependencies":{"mqtt":"^5.10.0"}}' > ~/avatar-ai-video/phone-agent/package.json
cd ~/avatar-ai-video/phone-agent && npm install

echo ""
echo "============================================"
echo "  启动 Agent..."
echo "============================================"
MQTT_BROKER="mqtt://100.79.18.62:1883" PHONE_ID="phone_01" PLATFORMS="douyin,kuaishou,xiaohongshu" node agent.js
