import urllib.request, json, re

BASE = "http://localhost:3099/api/sessions"

# Create session
req = urllib.request.Request(BASE, method="POST", data=b"{}", headers={"Content-Type": "application/json"})
sid = json.loads(urllib.request.urlopen(req).read())["sessionId"]
print(f"Session: {sid}")

# Send message
body = json.dumps({"content": "hi, what can you help me with?", "attachments": []}).encode()
req = urllib.request.Request(f"{BASE}/{sid}/messages", method="POST", data=body, headers={"Content-Type": "application/json"})
print("===STREAMING===")
resp = urllib.request.urlopen(req, timeout=20)
raw = resp.read().decode()
print(raw[:2000])
print(f"\n===TOTAL {len(raw)} BYTES===")
