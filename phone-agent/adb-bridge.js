import { execSync } from 'child_process';

const A11Y_BASE = process.env.A11Y_HTTP || 'http://127.0.0.1:9999';

function adb(args) {
  try {
    return execSync(`adb ${args}`, { encoding: 'utf8', timeout: 10000 }).trim();
  } catch (e) {
    return null;
  }
}

export function tap(x, y) {
  const result = adb(`shell input tap ${x} ${y}`);
  if (result !== null) return true;
  return fetch(`${A11Y_BASE}/tap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y }),
  }).then(r => r.ok).catch(() => false);
}

export function swipe(x1, y1, x2, y2, duration = 300) {
  const result = adb(`shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`);
  if (result !== null) return true;
  return fetch(`${A11Y_BASE}/swipe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x1, y1, x2, y2, duration }),
  }).then(r => r.ok).catch(() => false);
}

export function inputText(text) {
  const escaped = text.replace(/"/g, '\\"').replace(/ /g, '%s');
  const result = adb(`shell input text "${escaped}"`);
  if (result !== null) return true;
  return fetch(`${A11Y_BASE}/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).then(r => r.ok).catch(() => false);
}

export function launchApp(packageName) {
  const result = adb(`shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
  if (result !== null) return true;
  return fetch(`${A11Y_BASE}/launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ package: packageName }),
  }).then(r => r.ok).catch(() => false);
}

export function screenshot(filename) {
  const devicePath = `/sdcard/screenshots/${filename}.png`;
  const result = adb(`shell screencap -p ${devicePath}`);
  return result !== null ? devicePath : null;
}

export function keyEvent(key) {
  const codes = { back: 4, home: 3 };
  const code = codes[key] || key;
  const result = adb(`shell input keyevent ${code}`);
  return result !== null;
}

export function getDeviceInfo() {
  const model = adb('shell getprop ro.product.model') || 'unknown';
  const sdk = adb('shell getprop ro.build.version.sdk') || '0';
  const batteryStr = adb('shell dumpsys battery | grep level') || '';
  const battery = parseInt((batteryStr.match(/\d+/) || [0])[0], 10);
  return { model, sdk: parseInt(sdk, 10), battery };
}
