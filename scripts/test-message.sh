#!/bin/bash
SID=$(curl -s -X POST http://localhost:3099/api/sessions | python3 -c "import sys,json; print(json.load(sys.stdin)['sessionId'])")
echo "Session: $SID"
echo "===STREAMING==="
curl -s --max-time 20 -X POST "http://localhost:3099/api/sessions/$SID/messages" -H 'Content-Type: application/json' -d '{"content":"hi what can you help me with?","attachments":[]}' -o /tmp/stream.txt
echo "===RAW_OUTPUT==="
cat /tmp/stream.txt | head -c 2000
