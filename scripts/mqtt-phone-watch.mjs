// 服务端 MQTT 手机监控脚本
// 用法: node scripts/mqtt-phone-watch.mjs
// 实时显示哪些手机在线、收到什么心跳

import mqtt from 'mqtt'

const BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883'

console.log(`\n📡 MQTT 手机监控 — ${BROKER}\n`)
console.log('等待手机上线... (Ctrl+C 退出)\n')

const client = mqtt.connect(BROKER, {
  clientId: 'watch-' + Date.now(),
  clean: true,
  connectTimeout: 10000,
})

const phones = {}

client.on('connect', () => {
  console.log('[连接成功] 订阅 phone/+/heartbeat + phone/+/status\n')
  client.subscribe('phone/+/heartbeat', { qos: 0 })
  client.subscribe('phone/+/status', { qos: 0 })
})

client.on('message', (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString())
    const match = topic.match(/^phone\/(.+)\/(.+)$/)
    if (!match) return

    const [, phoneId, type] = match
    if (!phones[phoneId]) {
      phones[phoneId] = { id: phoneId, seen: 0 }
    }
    phones[phoneId].seen++
    phones[phoneId].lastSeen = new Date().toLocaleTimeString()

    if (type === 'status') {
      const status = data.status || '?'
      const platforms = data.platforms || []
      const icon = status === 'online' ? '🟢' : status === 'success' ? '✅' : status === 'failed' ? '❌' : '🔄'
      console.log(`${icon} [${phoneId}] status=${status} platforms=${platforms.join(',')} task=${data.task_id || '-'}`)
    } else if (type === 'heartbeat') {
      if (phones[phoneId].seen <= 2 || phones[phoneId].seen % 6 === 0) {
        const platforms = data.platforms || []
        console.log(`💓 [${phoneId}] heartbeat #${phones[phoneId].seen} platforms=${platforms.join(',')}`)
      }
    }
  } catch {}
})

client.on('error', (e) => {
  console.error('MQTT 错误:', e.message)
})

process.on('SIGINT', () => {
  console.log('\n--- 手机列表 ---')
  for (const [id, info] of Object.entries(phones)) {
    console.log(`  ${id}: online=${info.lastSeen} heartbeats=${info.seen}`)
  }
  client.end()
  process.exit(0)
})

setInterval(() => {
  const now = new Date().toLocaleTimeString()
  if (Object.keys(phones).length === 0) {
    process.stdout.write(`\r[${now}] 暂无手机在线...`)
  }
}, 15000)
