/**
 * verify-gate.cjs — 统一验证门禁（双模式）
 *
 * 本地：优先全局 ~/.trae-cn/scripts/verify-gate.cjs（共享更新）
 * CI：  使用内置实现（自包含，零外部依赖）
 *
 * 用法：
 *   node scripts/verify-gate.cjs              # 全量
 *   node scripts/verify-gate.cjs --fast       # 跳过构建+测试
 *   node scripts/verify-gate.cjs --phase=syntax
 *
 * 返回值：exit 0 = PASS, exit 1 = FAIL
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ── 双模式入口：本地优先全局，CI 降级内置 ────────────

const GLOBAL_GATE = path.join(process.env.USERPROFILE || process.env.HOME, '.trae-cn', 'scripts', 'verify-gate.cjs');

if (!process.env.CI && !process.env.GITHUB_ACTIONS && fs.existsSync(GLOBAL_GATE)) {
  try {
    const { execSync } = require('child_process');
    const args = process.argv.slice(2).map(a => `"${a}"`).join(' ');
    execSync(`node "${GLOBAL_GATE}" ${args}`, { cwd: ROOT, stdio: 'inherit' });
    process.exit(0);
  } catch (e) {
    process.exit(e.status || 1);
  }
}

// ── 内置实现（CI 环境）─────────────────────────────

const { GateRunner, syntaxCheck, typeCheckPhase, buildPhase, securityPhase, testsPhase, loadConfig, color } = require('./verify-lib.cjs');

const args = process.argv.slice(2);
const fastMode = args.includes('--fast');
const phaseFilter = args.find(a => a.startsWith('--phase='));
const phaseOnly = phaseFilter ? phaseFilter.split('=')[1] : null;

async function main() {
  const config = loadConfig(ROOT) || {};
  const label = `${config.projectName || path.basename(ROOT)} Verification Gate`;

  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    console.log(color('gray', `CI mode — using built-in verification`));
  }

  const gate = new GateRunner(label, ROOT);
  const allPhases = [
    { name: 'SYNTAX', fn: () => syntaxCheck(ROOT, config) },
    { name: 'TYPES', fn: () => typeCheckPhase(ROOT, config) },
    { name: 'BUILD', fn: () => fastMode ? { ok: true, detail: 'Skipped (fast)' } : buildPhase(ROOT, config) },
    { name: 'SECURITY', fn: () => securityPhase(ROOT, config) },
    { name: 'TESTS', fn: () => fastMode ? { ok: true, detail: 'Skipped (fast)' } : testsPhase(ROOT, config) },
  ];

  for (const p of allPhases) {
    if (phaseOnly && p.name.toLowerCase() !== phaseOnly.toLowerCase()) continue;
    gate.addPhase(p.name, p.fn);
  }

  if (!gate.phases.length) {
    console.error(color('red', `Unknown phase: ${phaseOnly}`));
    process.exit(1);
  }

  const report = await gate.runAll({ stopOnFail: true });
  if (report.overall === 'FAIL') process.exit(1);
}

main().catch(e => { console.error(color('red', 'FATAL:'), e.message); process.exit(2); });
