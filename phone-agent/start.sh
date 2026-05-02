#!/bin/bash
# ============================================================
# 手机端 phone-agent 一键启动脚本
# 在 Android Termux 中运行: bash start.sh
# ============================================================

# ---------- 配置 ----------
# MQTT Broker 地址 (Windows 宿主机的 Tailscale IP)
MQTT_BROKER="mqtt://100.79.18.62:1883"

# 手机唯一标识 (与服务器 task-dispatcher 匹配)
PHONE_ID="phone_01"

# 支持的平台 (逗号分隔)
PLATFORMS="douyin,kuaishou,xiaohongshu"

# ---------- 首次安装 ----------
if [ ! -d "node_modules" ]; then
    echo "[setup] 首次运行，安装依赖..."
    npm install
fi

# ---------- 启动 agent ----------
echo "============================================"
echo "  手机 Agent 启动"
echo "  Phone ID : $PHONE_ID"
echo "  MQTT     : $MQTT_BROKER"
echo "  平台     : $PLATFORMS"
echo "  Tailscale: $(tailscale ip -4 2>/dev/null || echo 'unknown')"
echo "============================================"

MQTT_BROKER="$MQTT_BROKER" \
PHONE_ID="$PHONE_ID" \
PLATFORMS="$PLATFORMS" \
node agent.js
