const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');

const DISMISS_SCRIPT = path.join(__dirname, 'dismiss-ahnlab.ps1');

function autoDismissAhnLab() {
  exec(`powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File "${DISMISS_SCRIPT}"`, () => {});
}

const HOSTS_PATH = process.platform === 'win32'
  ? path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
  : '/etc/hosts';

const BLOCK_START = '# >>> mission-control-start <<<';
const BLOCK_END   = '# >>> mission-control-end <<<';

function isAdmin() {
  if (process.platform === 'win32') {
    try { execSync('net session', { stdio: 'ignore' }); return true; } catch { return false; }
  }
  return process.getuid?.() === 0;
}

function readHosts() {
  return fs.readFileSync(HOSTS_PATH, 'utf8');
}

function writeHosts(content) {
  if (process.platform === 'win32') {
    try { execSync(`attrib -R "${HOSTS_PATH}"`, { stdio: 'ignore' }); } catch {}
  }
  fs.writeFileSync(HOSTS_PATH, content, 'utf8');
  // AhnLab은 재시작하지 않음 - 재시작하면 hosts 변경 감지 팝업이 뜨기 때문
  // AhnLab은 PC 재부팅 시 자동으로 복구됨
}

function stripBlocks(content) {
  const s = content.indexOf(BLOCK_START);
  const e = content.indexOf(BLOCK_END);
  if (s === -1 || e === -1) return content;
  const before = content.slice(0, s).trimEnd();
  const after  = content.slice(e + BLOCK_END.length).replace(/^\n+/, '');
  return before + (after ? '\n' + after : '\n');
}

// AhnLab Safe Transaction이 hosts 변경을 감지하지 못하도록 서비스 일시 중단
const AHNLAB_SERVICES = ['SafeTransactionSVC', 'ASTService', 'AhnLab Safe Transaction'];

function stopAhnLab() {
  for (const svc of AHNLAB_SERVICES) {
    try {
      execSync(`net stop "${svc}"`, { stdio: 'ignore' });
      // 서비스가 완전히 멈출 때까지 최대 3초 대기
      for (let i = 0; i < 15; i++) {
        try {
          const status = execSync(`sc query "${svc}"`, { encoding: 'utf8' });
          if (status.includes('STOPPED')) break;
        } catch {}
        execSync('ping 127.0.0.1 -n 1 -w 200 >nul', { stdio: 'ignore', shell: true });
      }
      return;
    } catch {}
  }
}


function addBlocks(sites) {
  autoDismissAhnLab(); // 팝업이 뜨기 전에 미리 감시 시작
  stopAhnLab();
  let content = readHosts();
  content = stripBlocks(content);

  // 각 도메인과 www. 서브도메인을 모두 차단
  const lines = sites.flatMap(site => [
    `127.0.0.1 ${site}`,
    `127.0.0.1 www.${site}`,
  ]);

  content = content.trimEnd()
    + '\n\n' + BLOCK_START + '\n'
    + lines.join('\n') + '\n'
    + BLOCK_END + '\n';

  writeHosts(content);

  // hosts 파일을 읽기 전용으로 설정 (세션 중 수동 수정 방지)
  if (process.platform === 'win32') {
    try { execSync(`attrib +R "${HOSTS_PATH}"`, { stdio: 'ignore' }); } catch {}
  } else {
    try { fs.chmodSync(HOSTS_PATH, 0o444); } catch {}
  }
}

function removeBlocks() {
  autoDismissAhnLab(); // 팝업이 뜨기 전에 미리 감시 시작
  stopAhnLab();
  let content = readHosts();
  content = stripBlocks(content);
  writeHosts(content);

  // 읽기 전용 해제
  if (process.platform === 'win32') {
    try { execSync(`attrib -R "${HOSTS_PATH}"`, { stdio: 'ignore' }); } catch {}
  } else {
    try { fs.chmodSync(HOSTS_PATH, 0o644); } catch {}
  }
}

module.exports = { addBlocks, removeBlocks, isAdmin, HOSTS_PATH };
