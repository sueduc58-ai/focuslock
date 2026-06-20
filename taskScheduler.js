const { execSync } = require('child_process');
const { app } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const IS_MAC = process.platform === 'darwin';

// ─── macOS: launchd ───────────────────────────────────────

const PLIST_LABEL = 'com.focuslock.autosession';
const PLIST_PATH  = path.join(os.homedir(), 'Library', 'LaunchAgents', `${PLIST_LABEL}.plist`);

function registerMac(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>--auto-session</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${h}</integer>
    <key>Minute</key>
    <integer>${m}</integer>
  </dict>
</dict>
</plist>`;

  try {
    fs.mkdirSync(path.dirname(PLIST_PATH), { recursive: true });
    fs.writeFileSync(PLIST_PATH, plist, 'utf8');
    try { execSync(`launchctl unload "${PLIST_PATH}"`, { stdio: 'pipe' }); } catch {}
    execSync(`launchctl load "${PLIST_PATH}"`, { stdio: 'pipe', timeout: 10000 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function removeMac() {
  try { execSync(`launchctl unload "${PLIST_PATH}"`, { stdio: 'pipe' }); } catch {}
  try { fs.unlinkSync(PLIST_PATH); } catch {}
}

function existsMac() {
  return fs.existsSync(PLIST_PATH);
}

// ─── Windows: Task Scheduler ──────────────────────────────

const TASK_NAME = 'FocusLock_AutoBlock';

function getVbsDir() {
  const dir = path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'FocusLock');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeAutoSessionVbs() {
  const vbsPath = path.join(getVbsDir(), 'auto-session.vbs');
  let content;
  if (app.isPackaged) {
    const exePath = process.execPath.replace(/\\/g, '\\\\');
    content =
      'Set oShell = CreateObject("WScript.Shell")\r\n' +
      `oShell.Run Chr(34) & "${exePath}" & Chr(34) & " --auto-session", 0, False\r\n`;
  } else {
    const appDir = path.resolve(__dirname).replace(/\\/g, '\\\\');
    content =
      'Set oShell = CreateObject("WScript.Shell")\r\n' +
      `oShell.Run "cmd /c cd /d \\"${appDir}\\" && npx electron . --auto-session", 0, False\r\n`;
  }
  fs.writeFileSync(vbsPath, content, 'utf8');
  return vbsPath;
}

function registerWin(timeStr) {
  try {
    const [hh, mm] = timeStr.split(':');
    const xmlPath = path.join(getVbsDir(), 'task.xml');

    // 패키징된 경우 EXE 직접 실행 (VBS 경유 시 권한 상속 실패)
    // 개발 모드는 VBS 필요 (electron . 명령 실행)
    let command, args;
    if (app.isPackaged) {
      command = process.execPath;
      args = '--auto-session';
    } else {
      const vbsPath = writeAutoSessionVbs();
      command = 'wscript.exe';
      args = `"${vbsPath}"`;
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>2000-01-01T${hh}:${mm}:00</StartBoundary>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT72H</ExecutionTimeLimit>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
  </Settings>
  <Actions>
    <Exec>
      <Command>${command}</Command>
      <Arguments>${args}</Arguments>
    </Exec>
  </Actions>
</Task>`;
    fs.writeFileSync(xmlPath, xml, 'utf8');
    execSync(
      `schtasks /create /tn "${TASK_NAME}" /xml "${xmlPath}" /f`,
      { encoding: 'utf8', timeout: 10000, stdio: 'pipe' }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function removeWin() {
  try {
    execSync(`schtasks /delete /tn "${TASK_NAME}" /f`, { timeout: 5000, stdio: 'pipe' });
  } catch {}
}

function existsWin() {
  try {
    execSync(`schtasks /query /tn "${TASK_NAME}"`, { timeout: 5000, stdio: 'pipe' });
    return true;
  } catch { return false; }
}

// ─── export ───────────────────────────────────────────────

module.exports = IS_MAC ? {
  register: registerMac,
  remove:   removeMac,
  exists:   existsMac,
} : {
  register: registerWin,
  remove:   removeWin,
  exists:   existsWin,
};
