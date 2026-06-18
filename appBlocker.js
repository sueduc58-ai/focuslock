const { execSync, exec } = require('child_process');
const { Notification } = require('electron');
const path = require('path');

const IS_MAC = process.platform === 'darwin';

let _interval = null;
let _apps = [];

// ─── Windows 시스템 프로세스 ──────────────────────────────
const WIN_SYSTEM_PROCS = new Set([
  'system', 'system idle process', 'registry', 'smss.exe', 'csrss.exe',
  'wininit.exe', 'services.exe', 'lsass.exe', 'svchost.exe', 'dwm.exe',
  'winlogon.exe', 'fontdrvhost.exe', 'sihost.exe', 'taskhostw.exe',
  'explorer.exe', 'ctfmon.exe', 'runtimebroker.exe', 'searchhost.exe',
  'startmenuexperiencehost.exe', 'securityhealthsystray.exe',
  'securityhealthservice.exe', 'spoolsv.exe', 'msdtc.exe',
  'audiodg.exe', 'conhost.exe', 'dllhost.exe', 'wuauclt.exe',
  'msiexec.exe', 'tasklist.exe', 'taskkill.exe', 'cmd.exe',
  'powershell.exe', 'electron.exe', 'site blocker.exe', 'focuslock.exe',
]);

// ─── macOS 시스템 프로세스 ────────────────────────────────
const MAC_SYSTEM_PROCS = new Set([
  'kernel_task', 'launchd', 'logd', 'notifyd', 'configd', 'diskarbitrationd',
  'coreaudiod', 'windowserver', 'loginwindow', 'coreservicesd', 'mds',
  'mdworker', 'spotlight', 'cfprefsd', 'distnoted', 'usernoted',
  'airportd', 'bluetoothd', 'sharingd', 'screensharingd',
  'focuslock', 'electron',
]);

// ─── macOS 구현 ───────────────────────────────────────────

function getRunningAppsMac() {
  return new Promise((resolve) => {
    exec('ps -ax -o comm=', { encoding: 'utf8', timeout: 8000 }, (err, stdout) => {
      if (err) { resolve([]); return; }

      const seen = new Set();
      const apps = [];

      stdout.split('\n').forEach(line => {
        const full = line.trim();
        if (!full) return;
        const name = path.basename(full);
        const nameLower = name.toLowerCase();
        if (MAC_SYSTEM_PROCS.has(nameLower)) return;
        if (!name || seen.has(name)) return;
        seen.add(name);
        apps.push({ exe: name, label: name });
      });

      apps.sort((a, b) => a.exe.localeCompare(b.exe));
      resolve(apps);
    });
  });
}

function findRunningTargetsMac() {
  const running = [];
  for (const exe of _apps) {
    try {
      const name = exe.replace(/\.exe$/i, '');
      execSync(`pgrep -x "${name}"`, { stdio: 'pipe', timeout: 3000 });
      running.push(name);
    } catch {}
  }
  return running;
}

function checkAndKillMac() {
  const targets = findRunningTargetsMac();
  for (const name of targets) {
    try {
      execSync(`pkill -x "${name}"`, { stdio: 'pipe', timeout: 3000 });
      showBlockNotification(name);
    } catch {}
  }
}

// ─── Windows 구현 ─────────────────────────────────────────

function getRunningAppsWin() {
  return new Promise((resolve) => {
    exec('tasklist /FO CSV /NH /V', { encoding: 'utf8', timeout: 8000 }, (err, stdout) => {
      if (err) { resolve([]); return; }

      const seen = new Set();
      const apps = [];

      stdout.split('\n').forEach(line => {
        const parts = line.match(/"([^"]*)"/g);
        if (!parts || parts.length < 9) return;

        const exe   = parts[0].replace(/"/g, '').toLowerCase();
        const title = parts[8].replace(/"/g, '').trim();

        if (WIN_SYSTEM_PROCS.has(exe)) return;
        if (exe === 'n/a' || !exe.endsWith('.exe')) return;
        if (seen.has(exe)) return;

        seen.add(exe);
        apps.push({
          exe,
          label: title && title !== 'N/A' ? `${exe}  —  ${title}` : exe,
        });
      });

      apps.sort((a, b) => a.exe.localeCompare(b.exe));
      resolve(apps);
    });
  });
}

function findRunningTargetsWin() {
  if (!_apps.length) return [];
  const running = [];
  for (const exe of _apps) {
    try {
      const out = execSync(
        `tasklist /FI "IMAGENAME eq ${exe}" /FO CSV /NH`,
        { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'] }
      );
      if (out.toLowerCase().includes(exe)) running.push(exe);
    } catch {}
  }
  return running;
}

function checkAndKillWin() {
  const targets = findRunningTargetsWin();
  for (const exe of targets) {
    try {
      execSync(`taskkill /F /IM "${exe}"`, { timeout: 3000, shell: true, stdio: 'pipe' });
      showBlockNotification(exe);
    } catch {}
  }
}

// ─── 공통 ─────────────────────────────────────────────────

function showBlockNotification(exe) {
  try {
    const appName = exe.replace(/\.exe$/i, '');
    new Notification({
      title: '🔒 앱 차단됨',
      body: `${appName} — 집중 모드가 끝날 때까지 사용할 수 없습니다`,
      silent: false,
    }).show();
  } catch {}
}

function start(apps) {
  _apps = (apps || []).map(a => a.toLowerCase());
  if (!_apps.length) return;
  checkAndKill();
  if (_interval) clearInterval(_interval);
  _interval = setInterval(checkAndKill, 3000);
}

function stop() {
  if (_interval) { clearInterval(_interval); _interval = null; }
  _apps = [];
}

const checkAndKill    = IS_MAC ? checkAndKillMac    : checkAndKillWin;
const getRunningApps  = IS_MAC ? getRunningAppsMac  : getRunningAppsWin;

module.exports = { start, stop, getRunningApps };
