#!/bin/bash
# phone-agent 自重启包装
# 运行一次，永久在线。退出时自动重启。
SERVER="http://100.79.18.62:3099"
BROKER="mqtt://100.79.18.62:1883"
ID="phone_01"
PLATFORMS="douyin,kuaishou,xiaohongshu"

cd ~/avatar-ai-video/phone-agent

while true; do
  echo "[WRAPPER] $(date) starting agent..."
  MQTT_BROKER="$BROKER" PHONE_ID="$ID" PLATFORMS="$PLATFORMS" node agent.js
  EXIT=$?
  echo "[WRAPPER] agent exited (code=$EXIT), restarting in 2s..."
  sleep 2
done
