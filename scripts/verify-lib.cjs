/**
 * verify-lib.cjs — 验证工具库（双模式）
 *
 * 本地：优先加载 ~/.trae-cn/scripts/verify-lib.cjs（全局更新）
 * CI：  使用内置实现（自包含，零外部依赖）
 */

const fs = require('fs');
const path = require('path');

const GLOBAL_LIB = path.join(process.env.USERPROFILE || process.env.HOME, '.trae-cn', 'scripts', 'verify-lib.cjs');

if (!process.env.CI && !process.env.GITHUB_ACTIONS && fs.existsSync(GLOBAL_LIB)) {
  try {
    const globalStat = fs.statSync(GLOBAL_LIB);
    const localStat = fs.statSync(__filename);
    if (globalStat.mtimeMs >= localStat.mtimeMs) {
      module.exports = require(GLOBAL_LIB);
      return;
    }
  } catch {}
}

// ── 内置实现（CI 环境或全局不可用时使用）────────────────

const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SKIP_DIRS = ['node_modules', '.git', 'dist', '.next', 'logs', '.trae', '.husky', 'build', 'out', '__pycache__', '.venv', 'venv', 'coverage', '.nyc_output'];

function color(code, text) {
  const c = { red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, white: 37, gray: 90 };
  if (!process.stdout.isTTY) return text;
  return `\x1b[${c[code] || 0}m${text}\x1b[0m`;
}

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

function run(cmd, opts = {}) {
  const { cwd = ROOT, timeout = 120_000 } = opts;
  try {
    const stdout = execSync(cmd, { cwd, timeout, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: 'pipe' });
    return { ok: true, stdout: stdout.trimEnd(), stderr: '', code: 0 };
  } catch (e) {
    return { ok: false, stdout: (e.stdout || '').trimEnd(), stderr: (e.stderr || '').trimEnd(), code: e.status || 1, error: e.message.substring(0, 200) };
  }
}

function collectFiles(rootDir, extensions, skipDirs = DEFAULT_SKIP_DIRS, skipFiles = []) {
  const results = [];
  if (!fs.existsSync(rootDir)) return results;
  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const basename = entry.name;
      if (entry.isDirectory()) { if (!skipDirs.includes(basename)) walk(full); }
      else if (entry.isFile()) { if (!skipFiles.includes(basename) && extensions.includes(path.extname(basename))) results.push({ full, rel: path.relative(rootDir, full) }); }
    }
  }
  walk(rootDir);
  return results;
}

function grepInFiles(rootDir, pattern, extensions, skipDirs) {
  const files = collectFiles(rootDir, extensions, skipDirs);
  const hits = [];
  for (const { full, rel } of files) {
    try {
      const content = fs.readFileSync(full, 'utf8');
      content.split('\n').forEach((line, idx) => { if (line.includes(pattern)) hits.push({ file: rel, line: idx + 1, content: line.trim().substring(0, 120) }); });
    } catch {}
  }
  return hits;
}

function loadConfig(rootDir) {
  const p = path.join(rootDir, 'verify-gate.config.json');
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  return null;
}

class GateRunner {
  constructor(label, rootDir) { this.label = label; this.rootDir = rootDir; this.phases = []; this.startTime = Date.now(); }
  addPhase(name, fn) { this.phases.push({ name, fn, result: null }); return this; }
  async runAll({ stopOnFail = true } = {}) {
    let passed = 0, failed = 0;
    for (const phase of this.phases) {
      process.stdout.write(color('cyan', `\n[${phase.name}] `));
      try {
        phase.result = await phase.fn();
        if (phase.result.ok) { process.stdout.write(color('green', 'PASS')); if (phase.result.detail) process.stdout.write(' — ' + phase.result.detail.substring(0, 120)); passed++; }
        else {
          process.stdout.write(color('red', 'FAIL'));
          if (phase.result.detail) process.stdout.write('\n  ' + color('red', '\u2717') + ' ' + phase.result.detail.substring(0, 300));
          failed++;
          if (stopOnFail) { for (const p of this.phases) { if (p.result === null) p.result = { ok: false, detail: 'SKIPPED', skipped: true }; } break; }
        }
      } catch (e) { phase.result = { ok: false, detail: 'Exception: ' + e.message }; process.stdout.write(color('red', 'FAIL — ' + e.message.substring(0, 100))); failed++; if (stopOnFail) { for (const p of this.phases) { if (p.result === null) p.result = { ok: false, detail: 'SKIPPED', skipped: true }; } break; } }
    }
    const skipped = this.phases.filter(p => p.result && p.result.skipped).length;
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const allOk = failed === 0;
    process.stdout.write('\n\n' + '═'.repeat(60) + '\n');
    if (allOk) process.stdout.write(color('green', `✓ ALL ${passed} PHASES PASSED`) + ` (${elapsed}s)\n`);
    else { const parts = [`✗ ${failed} FAILED`, `${passed} PASSED`]; if (skipped) parts.push(`${skipped} SKIPPED`); process.stdout.write(color('red', parts.join(', ')) + ` (${elapsed}s)\n`); }
    process.stdout.write('═'.repeat(60) + '\n');
    const logDir = path.join(this.rootDir, 'logs'), reportFile = path.join(logDir, 'verify-report.json');
    const report = { timestamp: new Date().toISOString(), gate: this.label, overall: allOk ? 'PASS' : 'FAIL', summary: { total: passed + failed + skipped, passed, failed, skipped, elapsed_seconds: parseFloat(elapsed) }, phases: this.phases.map(p => ({ name: p.name, status: p.result?.skipped ? 'SKIPPED' : (p.result?.ok ? 'PASS' : 'FAIL'), detail: p.result?.detail || '', stdout: (p.result?.stdout || '').substring(0, 500), stderr: (p.result?.stderr || '').substring(0, 500), code: p.result?.code })) };
    ensureDir(logDir); fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
    if (allOk) process.stdout.write(color('gray', `Report: ${reportFile}\n`));
    if (!allOk) process.exitCode = 1;
    return report;
  }
}

function syntaxCheck(rootDir, config) {
  const dirs = (config && config.jsSyntaxDirs) || ['.'];
  const skipDirs = (config && config.skipDirs) || DEFAULT_SKIP_DIRS;
  const skipFiles = (config && config.skipFiles) || [];
  const extensions = ['.js', '.cjs', '.mjs'];
  const allFiles = [];
  for (const dir of dirs) {
    const d = path.resolve(rootDir, dir);
    if (!fs.existsSync(d)) continue;
    for (const { full, rel } of collectFiles(d, extensions, skipDirs, skipFiles)) allFiles.push({ full, rel });
  }
  if (allFiles.length === 0) return { ok: true, detail: 'No JS files', code: 0 };
  const failures = [];
  for (const { full, rel } of allFiles) {
    const r = run(`node --check "${full}"`, { cwd: rootDir, timeout: 30_000 });
    if (!r.ok) failures.push(`${rel}: ${r.stderr.substring(0, 150)}`);
  }
  return failures.length ? { ok: false, detail: `${failures.length}/${allFiles.length} failed`, stdout: failures.join('\n'), code: 1 } : { ok: true, detail: `${allFiles.length} files OK`, code: 0 };
}

function typeCheckPhase(rootDir, config) {
  const dirs = (config && config.tsPackageDirs) || [];
  if (!dirs.length) return { ok: true, detail: 'No TS packages', code: 0 };
  for (const dir of dirs) {
    const cwd = path.resolve(rootDir, dir);
    if (!fs.existsSync(path.join(cwd, 'tsconfig.json'))) continue;
    const r = run('npx tsc --noEmit', { cwd, timeout: 120_000 });
    if (!r.ok) return { ok: false, detail: `${dir}: type check failed`, stdout: r.stdout.substring(0, 500), stderr: r.stderr.substring(0, 500), code: r.code };
  }
  return { ok: true, detail: `TS OK (${dirs.length} pkg)`, code: 0 };
}

function buildPhase(rootDir, config) {
  const dirs = (config && config.buildDirs) || [];
  if (!dirs.length) return { ok: true, detail: 'No build targets', code: 0 };
  for (const dir of dirs) {
    const cwd = path.resolve(rootDir, dir);
    if (!fs.existsSync(path.join(cwd, 'package.json'))) continue;
    const r = run('npm run build', { cwd, timeout: 180_000 });
    if (!r.ok) return { ok: false, detail: `${dir}: build failed (exit ${r.code})`, stdout: r.stdout.substring(0, 500), stderr: r.stderr.substring(0, 500), code: r.code };
  }
  return { ok: true, detail: `Build OK (${dirs.length})`, code: 0 };
}

function securityPhase(rootDir, config) {
  const skipDirs = (config && config.skipDirs) || DEFAULT_SKIP_DIRS;
  const extensions = ['.js', '.ts', '.tsx', '.cjs', '.mjs'];
  const patterns = ['sk-', 'api_key', 'API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY'];
  let secretHits = [];
  for (const pat of patterns) secretHits = secretHits.concat(grepInFiles(rootDir, pat, extensions, skipDirs));
  secretHits = secretHits.filter(h => {
    const line = h.content;
    if (h.file.includes('verify-lib.cjs') || h.file.includes('verify-gate.cjs')) return false;
    if (h.file.includes('cfg-') || h.file.includes('package-lock.json') || h.file.includes('yarn.lock')) return false;
    if (h.file.endsWith('.json') && !h.file.includes('package.json')) return false;
    if (h.file.includes('test') && line.includes('mock')) return false;
    if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('#')) return false;
    if (line.trim().startsWith('import ') || line.trim().startsWith('export ') || line.includes('require(')) return false;
    if (line.includes('process.env')) return false;
    if (!line.includes('"') && !line.includes("'") && !line.includes('`')) return false;
    if (/[a-zA-Z]sk-/.test(line) && !/[^a-zA-Z]sk-[a-zA-Z0-9]/.test(line)) return false;
    if (/[a-zA-Z_]API_KEY/i.test(line)) { const a = line.replace(/^.*?API_KEY/i, '').trim(); if (!a.startsWith('=') && !a.startsWith(':')) return false; const b = a.substring(1).trim(); if (!b.startsWith('"') && !b.startsWith("'") && !b.startsWith('`')) return false; }
    return true;
  });
  if (secretHits.length) { const d = secretHits.map(h => `  ${h.file}:${h.line} — ${h.content}`).join('\n'); return { ok: false, detail: `${secretHits.length} secret(s)`, stdout: d, code: 1 }; }
  const logScanDirs = (config && config.consoleLogScanDirs) || ['.'];
  let logHits = [];
  for (const dir of logScanDirs) { const d = path.resolve(rootDir, dir); if (fs.existsSync(d)) logHits = logHits.concat(grepInFiles(d, 'console.log', extensions, skipDirs)); }
  const logFiltered = logHits.filter(h => { if (h.file.includes('test') || h.file.includes('smoke') || h.file.includes('deep-dive') || h.file.includes('analyze')) return false; if (h.file.startsWith('scripts' + path.sep)) return false; if (h.content.includes('debugLog') || h.content.includes('const debugLog')) return false; return true; });
  if (logFiltered.length) { const d = logFiltered.map(h => `  ${h.file}:${h.line}`).join('\n'); return { ok: false, detail: `${logFiltered.length} console.log(s)`, stdout: d, code: 1 }; }
  return { ok: true, detail: 'Security clean', code: 0 };
}

function testsPhase(rootDir, config) {
  const scripts = (config && config.testScripts) || [];
  if (!scripts.length) return { ok: true, detail: 'No test scripts', code: 0 };
  for (const s of scripts) { const fp = path.resolve(rootDir, s); if (!fs.existsSync(fp)) return { ok: false, detail: `Not found: ${s}`, code: 1 }; const r = run(`node "${fp}"`, { cwd: rootDir, timeout: 60_000 }); if (!r.ok) return { ok: false, detail: `${s}: failed (exit ${r.code})`, stdout: r.stdout.substring(0, 500), stderr: r.stderr.substring(0, 500), code: r.code }; }
  return { ok: true, detail: `Tests OK (${scripts.length})`, code: 0 };
}

module.exports = { color, run, collectFiles, grepInFiles, ensureDir, loadConfig, GateRunner, syntaxCheck, typeCheckPhase, buildPhase, securityPhase, testsPhase, ROOT, DEFAULT_SKIP_DIRS };
