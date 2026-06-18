const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, dialog } = require('electron');
const path = require('path');
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const dns        = require('./dnsBlocker');
const nrpt       = require('./nrptManager');
const store      = require('./store');
const certMgr    = require('./certManager');
const appBlocker   = require('./appBlocker');
const taskSched    = require('./taskScheduler');
const isAutoSession = process.argv.includes('--auto-session');

// 두 번째 실행 시 첫 번째 창을 앞으로 가져옴
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.exit(0); }
app.on('second-instance', () => {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); }
});

let win  = null;
let tray = null;
let sessionTimer  = null;
let tickInterval  = null;
let scheduleTimer = null;
let blockServerHttp  = null;
let blockServerHttps = null;

// ── 차단 페이지 서버 ──────────────────────────────────────────
function getBlockPageHtml(host) {
  const state   = store.get();
  const remain  = Math.max(0, (state.endTime || 0) - Date.now());
  const min     = Math.floor(remain / 60000);
  const sec     = Math.floor((remain % 60000) / 1000);
  const timeStr = `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  let html = fs.readFileSync(path.join(__dirname, 'renderer', 'blockpage.html'), 'utf8');
  html = html.replace(/\{\{REMAIN_MS\}\}/g, remain);
  html = html.replace(/\{\{REMAIN_STR\}\}/g, timeStr);
  html = html.replace(/\{\{HOST\}\}/g, host || '이 사이트');
  return html;
}

function startBlockServer(sites) {
  const handler = (req, res) => {
    const html = getBlockPageHtml(req.headers.host);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  };

  if (!blockServerHttp) {
    blockServerHttp = http.createServer(handler);
    blockServerHttp.listen(80, '127.0.0.1').on('error', () => {});
  }

  if (!blockServerHttps) {
    try {
      const { key, cert } = certMgr.generateAndInstall(sites);
      blockServerHttps = https.createServer({ key, cert }, handler);
      blockServerHttps.listen(443, '127.0.0.1').on('error', () => {});
    } catch (e) {
      console.error('HTTPS 서버 시작 실패:', e.message);
    }
  }
}

function stopBlockServer() {
  blockServerHttp?.close();  blockServerHttp  = null;
  blockServerHttps?.close(); blockServerHttps = null;
  certMgr.uninstall();
}

// ── 트레이 ──────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon128.png');
  const img = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('FocusLock');
  tray.on('click', () => {
    if (win && !win.isDestroyed()) { win.show(); win.focus(); }
  });
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '열기', click: () => { if (win && !win.isDestroyed()) { win.show(); win.focus(); } } },
    { label: '종료', click: () => {
        const state = store.get();
        const sessionActive  = state.active && state.endTime > Date.now();
        const scheduleActive = state.schedule && state.schedule.startAt > Date.now();
        if (!sessionActive && !scheduleActive) app.exit(0);
      }
    },
  ]));
}

// ── 창 생성 ──────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 560,
    height: 860,
    resizable: false,
    frame: false,
    backgroundColor: '#0B0E14',
    icon: path.join(__dirname, 'assets', 'icon128.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.on('close', (e) => {
    const state = store.get();
    const sessionActive  = state.active && state.endTime > Date.now();
    const scheduleActive = state.schedule && state.schedule.startAt > Date.now();
    if (sessionActive || scheduleActive) {
      e.preventDefault();
      win.hide();
    }
  });
}

// ── 날짜 키 (KST 기준) ───────────────────────────────────
function todayKey() {
  // UTC+9 한국 시간 기준
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${kst.getUTCMonth() + 1}-${kst.getUTCDate()}`;
}

// ── 세션 종료 ─────────────────────────────────────────────
function endSession(completed) {
  if (sessionTimer) { clearTimeout(sessionTimer);  sessionTimer = null; }
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }

  const state = store.get();
  let totalFocusMin  = state.totalFocusMin || 0;
  let completedToday = state.completedToday || 0;
  const key = todayKey();
  const dailyStats = { ...(state.dailyStats || {}) };
  const dayData = { ...(dailyStats[key] || { focusMin: 0, sessions: 0 }) };

  if (completed) {
    const dur = state.durationMin || 0;
    totalFocusMin += dur;
    completedToday = (state.todayKey === key ? completedToday : 0) + 1;
    dayData.focusMin += dur;
    dayData.sessions += 1;
  } else {
    const startTime = (state.endTime || 0) - (state.durationMin || 0) * 60000;
    const elapsed   = Math.max(0, Math.round((Date.now() - startTime) / 60000));
    totalFocusMin  += elapsed;
    dayData.focusMin += elapsed;
  }
  dailyStats[key] = dayData;

  try { nrpt.removeRules(); } catch {}
  try { dns.stop(); } catch {}
  try { appBlocker.stop(); } catch {}
  stopBlockServer();

  store.set({ ...state, active: false, endTime: 0, totalFocusMin, completedToday, todayKey: key, dailyStats });

  // 세션 종료 알림
  const dur = state.durationMin || 0;
  const h = Math.floor(dur / 60), m = dur % 60;
  const durStr = h > 0 ? `${h}시간 ${m > 0 ? m + '분' : ''}` : `${m}분`;
  new Notification({
    title: completed ? '✅ 집중 완료!' : '⏹ 세션 종료',
    body: completed
      ? `${durStr} 집중 완료. 수고했어요!`
      : `세션이 종료되었습니다.`,
    urgency: 'normal',
  }).show();

  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    win.webContents.send('session-ended', { completed });
  }
}

// ── 세션 시작 ─────────────────────────────────────────────
function startSession(sites, apps, durationMin) {
  if (!nrpt.isAdmin()) return { ok: false, reason: 'noadmin' };

  const endTime = Date.now() + durationMin * 60000;
  const state   = store.get();
  const key     = todayKey();

  store.set({
    ...state,
    active: true,
    endTime,
    sites,
    apps: apps || [],
    durationMin,
    todayKey: key,
    completedToday: state.todayKey === key ? (state.completedToday || 0) : 0,
  });

  if (sites.length) {
    nrpt.addRules(sites);
    if (process.platform !== 'darwin') {
      // macOS는 /etc/hosts 방식으로 차단 — DNS 서버·차단 페이지 서버 불필요
      dns.start();
      startBlockServer(sites);
    }
  }
  if (apps && apps.length) appBlocker.start(apps);

  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => endSession(true), Math.max(0, endTime - Date.now()));

  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(() => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('tick', { endTime });
    }
  }, 1000);

  return { ok: true };
}

// ── 예약 ─────────────────────────────────────────────────
function applySchedule(sched) {
  if (!sched || !sched.startAt) return;
  const delay = sched.startAt - Date.now();
  if (delay <= 0) {
    store.set({ ...store.get(), schedule: null });
    return;
  }
  if (scheduleTimer) clearTimeout(scheduleTimer);
  scheduleTimer = setTimeout(() => {
    store.set({ ...store.get(), schedule: null });
    if (win && !win.isDestroyed()) win.webContents.send('schedule-cancelled');
    new Notification({ title: '🚀 예약 세션 시작!', body: `${sched.durationMin}분 집중 세션을 시작합니다.` }).show();
    startSession(sched.sites || [], sched.apps || [], sched.durationMin);
    if (win && !win.isDestroyed()) {
      win.show(); win.focus();
      win.webContents.send('schedule-started');
    }
  }, delay);
}

// ── 앱 시작 ──────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();

  const state = store.get();

  // 자동 세션 모드 (Task Scheduler가 실행한 경우)
  if (isAutoSession) {
    const rec = state.recurringSchedule;
    if (rec && rec.enabled) {
      win.hide();
      new Notification({
        title: '🔒 자동 집중 시작',
        body: `매일 ${rec.time} 자동 집중 — ${rec.durationMin}분 시작됩니다.`,
      }).show();
      startSession(rec.sites || [], rec.apps || [], rec.durationMin);
    }
    return;
  }

  if (state.schedule) applySchedule(state.schedule);
  if (state.active) {
    if (state.endTime > Date.now()) {
      if ((state.sites || []).length) {
        nrpt.addRules(state.sites || []);
        if (process.platform !== 'darwin') {
          dns.start();
          startBlockServer(state.sites || []);
        }
      }
      if ((state.apps || []).length) appBlocker.start(state.apps || []);

      if (sessionTimer) clearTimeout(sessionTimer);
      sessionTimer = setTimeout(() => endSession(true), state.endTime - Date.now());
      if (tickInterval) clearInterval(tickInterval);
      tickInterval = setInterval(() => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('tick', { endTime: state.endTime });
        }
      }, 1000);
    } else {
      endSession(true);
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (e) => {
  const state = store.get();
  const sessionActive  = state.active && state.endTime > Date.now();
  const scheduleActive = state.schedule && state.schedule.startAt > Date.now();
  if (sessionActive || scheduleActive) {
    e.preventDefault();
    if (win && !win.isDestroyed()) win.hide();
  }
});

// ── IPC ──────────────────────────────────────────────────
ipcMain.handle('get-state', () => {
  const state = store.get();
  const key   = todayKey();
  return {
    ...state,
    completedToday: state.todayKey === key ? (state.completedToday || 0) : 0,
  };
});

ipcMain.handle('start-session', (_, { sites, apps, durationMin }) => {
  return startSession(sites, apps || [], durationMin);
});

ipcMain.handle('get-sites', () => {
  return store.get().savedSites || null;
});

ipcMain.handle('save-sites', (_, sites) => {
  store.set({ ...store.get(), savedSites: sites });
  return { ok: true };
});

ipcMain.handle('get-apps', () => {
  return store.get().savedApps || null;
});

ipcMain.handle('save-apps', (_, apps) => {
  store.set({ ...store.get(), savedApps: apps });
  return { ok: true };
});

ipcMain.handle('get-running-apps', async () => {
  return appBlocker.getRunningApps();
});

ipcMain.handle('get-weekly-stats', () => {
  const state = store.get();
  const stats = state.dailyStats || {};
  const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000 - i * 24 * 60 * 60 * 1000);
    const key = `${kst.getUTCFullYear()}-${kst.getUTCMonth() + 1}-${kst.getUTCDate()}`;
    const dayName = DAY_NAMES[kst.getUTCDay()];
    const dateLabel = `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`;
    result.push({
      key,
      dayName,
      dateLabel,
      isToday: i === 0,
      ...(stats[key] || { focusMin: 0, sessions: 0 }),
    });
  }
  return result;
});

ipcMain.handle('get-schedule', () => store.get().schedule || null);

ipcMain.handle('set-schedule', (_, { startAt, sites, apps, durationMin }) => {
  if (!nrpt.isAdmin()) return { ok: false, reason: 'noadmin' };
  const delay = startAt - Date.now();
  if (delay <= 0) return { ok: false, reason: 'past' };
  const sched = { startAt, sites, apps, durationMin };
  store.set({ ...store.get(), schedule: sched });
  applySchedule(sched);
  return { ok: true };
});

ipcMain.handle('get-recurring', () => store.get().recurringSchedule || null);

ipcMain.handle('set-recurring', (_, { time, durationMin, sites, apps }) => {
  if (!nrpt.isAdmin()) return { ok: false, reason: 'noadmin' };
  const rec = { enabled: true, time, durationMin, sites, apps };
  store.set({ ...store.get(), recurringSchedule: rec });
  const result = taskSched.register(time);
  return result;
});

ipcMain.handle('disable-recurring', () => {
  const state = store.get();
  if (state.recurringSchedule) {
    store.set({ ...store.get(), recurringSchedule: { ...state.recurringSchedule, enabled: false } });
  }
  taskSched.remove();
  return { ok: true };
});

ipcMain.handle('cancel-schedule', () => {
  if (scheduleTimer) { clearTimeout(scheduleTimer); scheduleTimer = null; }
  store.set({ ...store.get(), schedule: null });
  return { ok: true };
});

ipcMain.handle('is-admin', () => nrpt.isAdmin());

ipcMain.handle('window-minimize', () => win?.minimize());

ipcMain.handle('window-close', () => {
  const state = store.get();
  const sessionActive  = state.active && state.endTime > Date.now();
  const scheduleActive = state.schedule && state.schedule.startAt > Date.now();
  if (sessionActive || scheduleActive) {
    if (win && !win.isDestroyed()) win.hide();
  } else {
    app.exit(0);
  }
});
