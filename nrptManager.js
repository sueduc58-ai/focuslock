const { execSync } = require('child_process');
const fs = require('fs');

const IS_MAC = process.platform === 'darwin';
const FL_TAG = '# focuslock';

// ─── macOS: /etc/hosts ────────────────────────────────────

function addRulesMac(sites) {
  const entries = sites.flatMap(s => [
    `127.0.0.1 ${s} ${FL_TAG}`,
    `127.0.0.1 www.${s} ${FL_TAG}`,
  ]);
  // /tmp에 먼저 써두고 osascript에서 읽음 (특수문자 이스케이프 불필요)
  fs.writeFileSync('/tmp/fl_add.txt', entries.join('\n') + '\n', 'utf8');
  runAsAdmin([
    'grep -v "# focuslock" /etc/hosts > /tmp/fl_hosts',
    'cat /tmp/fl_add.txt >> /tmp/fl_hosts',
    'cp /tmp/fl_hosts /etc/hosts',
    'dscacheutil -flushcache',
    'killall -HUP mDNSResponder 2>/dev/null || true',
  ].join(' && '));
}

function removeRulesMac() {
  runAsAdmin([
    'grep -v "# focuslock" /etc/hosts > /tmp/fl_hosts',
    'cp /tmp/fl_hosts /etc/hosts',
    'dscacheutil -flushcache',
    'killall -HUP mDNSResponder 2>/dev/null || true',
  ].join(' && '));
}

function runAsAdmin(cmd) {
  const escaped = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  execSync(`osascript -e 'do shell script "${escaped}" with administrator privileges'`, {
    timeout: 30000, stdio: 'pipe',
  });
}

function isAdminMac() {
  // osascript가 실행 시점에 권한 요청 → 항상 true 반환
  return true;
}

// ─── Windows: NRPT ────────────────────────────────────────

function addRulesWin(sites) {
  for (const site of sites) {
    try {
      execSync(
        `powershell -Command "Add-DnsClientNrptRule -Namespace '.${site}' -NameServers '127.0.0.1' -Comment 'mission-control'"`,
        { stdio: 'ignore' }
      );
    } catch {}
  }
}

function removeRulesWin() {
  try {
    execSync(
      `powershell -Command "Get-DnsClientNrptRule | Where-Object { $_.Comment -eq 'mission-control' } | Remove-DnsClientNrptRule -Force"`,
      { stdio: 'ignore' }
    );
  } catch {}
}

function isAdminWin() {
  try { execSync('net session', { stdio: 'ignore' }); return true; } catch { return false; }
}

module.exports = IS_MAC ? {
  addRules: addRulesMac,
  removeRules: removeRulesMac,
  isAdmin: isAdminMac,
} : {
  addRules: addRulesWin,
  removeRules: removeRulesWin,
  isAdmin: isAdminWin,
};
