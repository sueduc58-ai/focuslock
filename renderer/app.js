const DEFAULT_SITES = [
  'youtube.com',
  'instagram.com',
  'tiktok.com',
  'netflix.com',
  'twitch.tv',
];

// ── DOM 참조 ──────────────────────────────────────────────
const adminWarn       = document.getElementById('adminWarn');
const statusDot       = document.getElementById('statusDot');
const statusText      = document.getElementById('statusText');
const setupView       = document.getElementById('setupView');
const activeView      = document.getElementById('activeView');
const hourInput       = document.getElementById('hourInput');
const minInput        = document.getElementById('minInput');
const timeTotalEl     = document.getElementById('timeTotal');
const siteList        = document.getElementById('siteList');
const siteInput       = document.getElementById('siteInput');
const siteAddBtn      = document.getElementById('siteAddBtn');
const appList         = document.getElementById('appList');
const appInput        = document.getElementById('appInput');
const appAddBtn       = document.getElementById('appAddBtn');
const appPickBtn      = document.getElementById('appPickBtn');
const launchBtn       = document.getElementById('launchBtn');
const countdownText   = document.getElementById('countdownText');
const progressFill    = document.getElementById('progressFill');
const activeSiteChips = document.getElementById('activeSiteChips');
const activeAppChips  = document.getElementById('activeAppChips');
const completedCountEl= document.getElementById('completedCount');
const totalFocusEl    = document.getElementById('totalFocus');
const todayFocusEl    = document.getElementById('todayFocus');
const weekChart       = document.getElementById('weekChart');
const tbMin           = document.getElementById('tbMin');
const tbClose         = document.getElementById('tbClose');
const pickerOverlay   = document.getElementById('pickerOverlay');
const pickerClose     = document.getElementById('pickerClose');
const pickerSearch    = document.getElementById('pickerSearch');
const pickerList      = document.getElementById('pickerList');

let currentSites    = [];
let currentApps     = [];
let localEndTime    = 0;
let localDurMin     = 0;
let uiTick          = null;
let runningAppsCache= [];

// ── 타이틀바 ──────────────────────────────────────────────
tbMin.addEventListener('click',   () => window.api.windowMinimize());
tbClose.addEventListener('click', () => window.api.windowClose());

// ── 시간 선택 ─────────────────────────────────────────────
function getTotalMinutes() {
  const h = Math.max(0, Math.min(23, parseInt(hourInput.value) || 0));
  const m = Math.max(0, Math.min(59, parseInt(minInput.value) || 0));
  return h * 60 + m;
}

function updateTimeTotal() {
  const total = getTotalMinutes();
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (total === 0) {
    timeTotalEl.textContent = '최소 1분 이상 설정하세요';
    timeTotalEl.style.color = 'var(--danger)';
  } else {
    timeTotalEl.textContent = h > 0 ? `총 ${h}시간 ${m > 0 ? m + '분' : ''}` : `총 ${m}분`;
    timeTotalEl.style.color = 'var(--muted)';
  }
}

function clampInputs() {
  let h = parseInt(hourInput.value) || 0;
  let m = parseInt(minInput.value)  || 0;
  if (h < 0) h = 0; if (h > 23) h = 23;
  if (m < 0) m = 0; if (m > 59) m = 59;
  hourInput.value = h;
  minInput.value  = m;
  updateTimeTotal();
}

hourInput.addEventListener('input', clampInputs);
minInput.addEventListener('input',  clampInputs);

// 위아래 화살표 버튼
document.querySelectorAll('.time-arrow').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    const dir    = parseInt(btn.dataset.dir); // -1 = up, 1 = down
    const input  = target === 'hour' ? hourInput : minInput;
    const max    = target === 'hour' ? 23 : 59;
    let val = parseInt(input.value) || 0;
    val -= dir; // ▲ = dir -1 → val +1
    if (val < 0) val = max;
    if (val > max) val = 0;
    input.value = val;
    updateTimeTotal();
  });
});

// 프리셋 칩
document.querySelectorAll('.preset-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    hourInput.value = chip.dataset.h;
    minInput.value  = chip.dataset.m;
    document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    updateTimeTotal();
  });
});

// ── 유틸 ──────────────────────────────────────────────────
function fmt(ms) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function normalizeDomain(raw) {
  return raw.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
}

// ── 사이트 목록 ───────────────────────────────────────────
function renderSiteList() {
  siteList.innerHTML = '';
  currentSites.forEach((site, i) => {
    const row = document.createElement('div');
    row.className = 'site-item';
    row.innerHTML = `<span>${site}</span><button class="site-remove" data-i="${i}" title="제거">×</button>`;
    siteList.appendChild(row);
  });
}

siteList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.site-remove');
  if (!btn) return;
  currentSites.splice(Number(btn.dataset.i), 1);
  await window.api.saveSites(currentSites);
  renderSiteList();
});

async function addSite() {
  const domain = normalizeDomain(siteInput.value);
  if (!domain || currentSites.includes(domain)) { siteInput.value = ''; siteInput.focus(); return; }
  currentSites.push(domain);
  await window.api.saveSites(currentSites);
  renderSiteList();
  siteInput.value = '';
  siteInput.focus();
}
siteAddBtn.addEventListener('click', addSite);
siteInput.addEventListener('keydown', e => { if (e.key === 'Enter') addSite(); });

// ── 앱 목록 ───────────────────────────────────────────────
function renderAppList() {
  appList.innerHTML = '';
  currentApps.forEach((exe, i) => {
    const row = document.createElement('div');
    row.className = 'site-item';
    row.innerHTML = `<span>${exe}</span><button class="site-remove" data-i="${i}" title="제거">×</button>`;
    appList.appendChild(row);
  });
}

appList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.site-remove');
  if (!btn) return;
  currentApps.splice(Number(btn.dataset.i), 1);
  await window.api.saveApps(currentApps);
  renderAppList();
});

async function addApp(rawName) {
  const exe = rawName.trim().toLowerCase();
  if (!exe) { appInput.focus(); return; }
  const name = exe.endsWith('.exe') ? exe : exe + '.exe';
  if (currentApps.includes(name)) { appInput.value = ''; appInput.focus(); return; }
  currentApps.push(name);
  await window.api.saveApps(currentApps);
  renderAppList();
  appInput.value = '';
  appInput.focus();
}
appAddBtn.addEventListener('click', () => addApp(appInput.value));
appInput.addEventListener('keydown', e => { if (e.key === 'Enter') addApp(appInput.value); });

// ── 실행 중인 앱 모달 ──────────────────────────────────────
function renderPickerList(filter) {
  pickerList.innerHTML = '';
  const lower = filter.toLowerCase();
  const items = runningAppsCache.filter(a =>
    !filter || a.exe.includes(lower) || a.label.toLowerCase().includes(lower)
  );
  if (!items.length) {
    pickerList.innerHTML = '<div class="picker-loading">표시할 앱이 없습니다.</div>';
    return;
  }
  items.forEach(a => {
    const el = document.createElement('div');
    el.className = 'picker-item' + (currentApps.includes(a.exe) ? ' selected' : '');
    const [exePart, titlePart] = a.label.includes('  —  ')
      ? a.label.split('  —  ') : [a.exe, ''];
    el.innerHTML = `<span class="picker-item-exe">${exePart}</span>`
      + (titlePart ? `<span class="picker-item-title">${titlePart}</span>` : '');
    el.addEventListener('click', async () => {
      if (currentApps.includes(a.exe)) {
        currentApps = currentApps.filter(x => x !== a.exe);
      } else {
        currentApps.push(a.exe);
      }
      await window.api.saveApps(currentApps);
      renderAppList();
      renderPickerList(pickerSearch.value);
    });
    pickerList.appendChild(el);
  });
}

appPickBtn.addEventListener('click', async () => {
  pickerOverlay.classList.remove('hidden');
  pickerSearch.value = '';
  pickerList.innerHTML = '<div class="picker-loading">실행 중인 앱 목록을 불러오는 중...</div>';
  runningAppsCache = await window.api.getRunningApps();
  renderPickerList('');
  pickerSearch.focus();
});

pickerSearch.addEventListener('input', () => renderPickerList(pickerSearch.value));
pickerClose.addEventListener('click', () => pickerOverlay.classList.add('hidden'));
pickerOverlay.addEventListener('click', (e) => {
  if (e.target === pickerOverlay) pickerOverlay.classList.add('hidden');
});

// ── 주간 통계 차트 ─────────────────────────────────────────
async function renderWeeklyStats() {
  const data = await window.api.getWeeklyStats();
  const state = await window.api.getState();

  totalFocusEl.textContent = formatFocusMin(state.totalFocusMin || 0);

  const todayData = data.find(d => d.isToday) || { focusMin: 0, sessions: 0 };
  completedCountEl.textContent = state.completedToday ?? 0;
  todayFocusEl.textContent = formatFocusMin(todayData.focusMin || 0);

  const maxMin = Math.max(...data.map(d => d.focusMin), 1);

  weekChart.innerHTML = '';
  data.forEach(day => {
    const pct = Math.round((day.focusMin / maxMin) * 100);
    const col = document.createElement('div');
    col.className = 'chart-col' + (day.isToday ? ' chart-col-today' : '');
    col.innerHTML = `
      <span class="chart-val">${day.focusMin > 0 ? formatFocusMin(day.focusMin) : ''}</span>
      <div class="chart-bar-wrap">
        <div class="chart-bar" style="height:${Math.max(pct, day.focusMin > 0 ? 4 : 0)}%"></div>
      </div>
      <span class="chart-day">${day.dayName}</span>
      <span class="chart-date">${day.dateLabel}</span>
    `;
    weekChart.appendChild(col);
  });
}

function formatFocusMin(min) {
  if (min === 0) return '0분';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

// ── 세션 시작 ─────────────────────────────────────────────
launchBtn.addEventListener('click', async () => {
  const totalMin = getTotalMinutes();
  if (totalMin < 1) { minInput.focus(); return; }
  if (!currentSites.length && !currentApps.length) { siteInput.focus(); return; }
  launchBtn.disabled = true;

  const res = await window.api.startSession(currentSites, currentApps, totalMin);
  if (!res.ok) {
    if (res.reason === 'noadmin') adminWarn.classList.remove('hidden');
    launchBtn.disabled = false;
    return;
  }
  init();
});

// ── 렌더 ──────────────────────────────────────────────────
function startUITick() {
  if (uiTick) clearInterval(uiTick);
  uiTick = setInterval(() => {
    const remain = localEndTime - Date.now();
    countdownText.textContent = fmt(remain);
    const pct = Math.min(100, Math.max(0, (1 - remain / (localDurMin * 60000)) * 100));
    progressFill.style.width = `${pct}%`;
    if (remain <= 0) { clearInterval(uiTick); init(); }
  }, 1000);
}

function renderActive(state) {
  setupView.classList.add('hidden');
  activeView.classList.remove('hidden');
  statusDot.classList.add('live');
  statusText.textContent = '미션 진행 중';

  localEndTime = state.endTime;
  localDurMin  = state.durationMin;

  activeSiteChips.innerHTML = '';
  (state.sites || []).forEach(site => {
    const el = document.createElement('span');
    el.className = 'site-chip';
    el.textContent = site;
    activeSiteChips.appendChild(el);
  });
  document.getElementById('activeSitesField').style.display =
    (state.sites || []).length ? '' : 'none';

  activeAppChips.innerHTML = '';
  (state.apps || []).forEach(exe => {
    const el = document.createElement('span');
    el.className = 'site-chip';
    el.textContent = exe;
    activeAppChips.appendChild(el);
  });
  document.getElementById('activeAppsField').style.display =
    (state.apps || []).length ? '' : 'none';

  const remain = localEndTime - Date.now();
  countdownText.textContent = fmt(remain);
  progressFill.style.width = `${Math.min(100, (1 - remain / (localDurMin * 60000)) * 100)}%`;
  startUITick();
}

function renderSetup() {
  setupView.classList.remove('hidden');
  activeView.classList.add('hidden');
  statusDot.classList.remove('live');
  statusText.textContent = '대기 중';
  launchBtn.disabled = false;
  if (uiTick) { clearInterval(uiTick); uiTick = null; }
}

// ── 통합 예약 ─────────────────────────────────────────────
let scheduleCountdownInterval = null;
let selectedHour = 9; // 24h

const scheduleToggle    = document.getElementById('scheduleToggle');
const scheduleArrow     = document.getElementById('scheduleArrow');
const scheduleBody      = document.getElementById('scheduleBody');
const schedStatusBadge  = document.getElementById('schedStatusBadge');
const schedSetup        = document.getElementById('schedSetup');
const repeatToggle      = document.getElementById('repeatToggle');
const scheduleBtn       = document.getElementById('scheduleBtn');
const scheduleActive    = document.getElementById('scheduleActive');
const schedActiveLabel  = document.getElementById('schedActiveLabel');
const scheduleInfoTime  = document.getElementById('scheduleInfoTime');
const scheduleCountdown = document.getElementById('scheduleCountdown');
const scheduleCancelBtn = document.getElementById('scheduleCancelBtn');

scheduleToggle.addEventListener('click', () => {
  const open = !scheduleBody.classList.contains('hidden');
  scheduleBody.classList.toggle('hidden', open);
  scheduleArrow.textContent = open ? '▸' : '▾';
});

// AM 12,1~11 → 24h: 0,1~11
// PM 12,1~11 → 24h: 12,13~23
const AM_H24 = [0,1,2,3,4,5,6,7,8,9,10,11];
const PM_H24 = [12,13,14,15,16,17,18,19,20,21,22,23];

let schedStartH = null;
let schedEndH   = null;

const schedSummary  = document.getElementById('schedSummary');

function hourLabel(h24) {
  if (h24 === 0)  return '오전 12시';
  if (h24 < 12)   return `오전 ${h24}시`;
  if (h24 === 12) return '오후 12시';
  return `오후 ${h24 - 12}시`;
}

function calcDurationMin(startH, endH) {
  let diff = endH - startH;
  if (diff <= 0) diff += 24; // 자정 넘기는 경우
  return diff * 60;
}

function updateChipStyles() {
  document.querySelectorAll('.hour-chip').forEach(btn => {
    const h = parseInt(btn.dataset.h24);
    btn.classList.remove('chip-start', 'chip-end');
    if (h === schedStartH) btn.classList.add('chip-start');
    if (h === schedEndH)   btn.classList.add('chip-end');
  });
}

function updateSchedSummary() {
  if (schedStartH === null) {
    schedSummary.classList.add('hidden');
    scheduleBtn.disabled = true;
    scheduleBtn.textContent = '시간을 선택하세요';
    return;
  }
  if (schedEndH === null) {
    schedSummary.classList.remove('hidden');
    schedSummary.textContent = `${hourLabel(schedStartH)} 시작 → 종료 시간을 선택하세요`;
    scheduleBtn.disabled = true;
    scheduleBtn.textContent = '종료 시간을 선택하세요';
    return;
  }
  const durMin = calcDurationMin(schedStartH, schedEndH);
  const overnight = schedEndH <= schedStartH;
  schedSummary.classList.remove('hidden');
  schedSummary.textContent =
    `${hourLabel(schedStartH)} → ${hourLabel(schedEndH)}  ·  ${formatFocusMin(durMin)}` +
    (overnight ? '  (자정 넘김)' : '');
  scheduleBtn.disabled = false;
  scheduleBtn.textContent = '예약하기';
}

function onHourChipClick(h24) {
  if (schedStartH === null) {
    schedStartH = h24;
  } else if (schedEndH === null) {
    if (h24 === schedStartH) { schedStartH = null; } // 같은 거 다시 누르면 해제
    else { schedEndH = h24; }
  } else {
    // 이미 둘 다 선택 → 리셋 후 새 시작
    schedStartH = h24; schedEndH = null;
  }
  updateChipStyles();
  updateSchedSummary();
}

function buildHourChips() {
  const amEl = document.getElementById('amChips');
  const pmEl = document.getElementById('pmChips');

  AM_H24.forEach(h24 => {
    const btn = document.createElement('button');
    btn.className = 'hour-chip';
    btn.dataset.h24 = h24;
    btn.textContent = h24 === 0 ? '12' : h24; // 0→12, 1~11→1~11
    btn.addEventListener('click', () => onHourChipClick(h24));
    amEl.appendChild(btn);
  });

  PM_H24.forEach(h24 => {
    const btn = document.createElement('button');
    btn.className = 'hour-chip';
    btn.dataset.h24 = h24;
    btn.textContent = h24 === 12 ? '12' : h24 - 12; // 12→12, 13~23→1~11
    btn.addEventListener('click', () => onHourChipClick(h24));
    pmEl.appendChild(btn);
  });
}

function getScheduleStartAt(h24) {
  const d = new Date();
  d.setHours(h24, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function fmtCountdown(ms) {
  if (ms <= 0) return '곧 시작';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}시간 ${m}분 후`;
  if (m > 0) return `${m}분 ${sec}초 후`;
  return `${sec}초 후`;
}

function startScheduleCountdown(startAt) {
  if (scheduleCountdownInterval) clearInterval(scheduleCountdownInterval);
  const update = () => {
    const remain = startAt - Date.now();
    if (remain <= 0) { clearInterval(scheduleCountdownInterval); init(); return; }
    scheduleCountdown.textContent = fmtCountdown(remain);
  };
  update();
  scheduleCountdownInterval = setInterval(update, 1000);
}

function showScheduleActive({ label, timeStr, startAt, recurring }) {
  schedSetup.classList.add('hidden');
  scheduleActive.classList.remove('hidden');
  schedStatusBadge.classList.remove('hidden');
  schedStatusBadge.textContent = recurring ? '매일' : '예약됨';
  schedActiveLabel.textContent = label;
  scheduleInfoTime.textContent = timeStr;
  scheduleBody.classList.remove('hidden');
  scheduleArrow.textContent = '▾';
  if (!recurring) startScheduleCountdown(startAt);
  else scheduleCountdown.textContent = '앱이 꺼져 있어도 자동 실행';
}

function resetScheduleUI() {
  schedSetup.classList.remove('hidden');
  scheduleActive.classList.add('hidden');
  schedStatusBadge.classList.add('hidden');
  schedStartH = null; schedEndH = null;
  updateChipStyles();
  updateSchedSummary();
  if (scheduleCountdownInterval) { clearInterval(scheduleCountdownInterval); scheduleCountdownInterval = null; }
}

scheduleBtn.addEventListener('click', async () => {
  if (schedStartH === null || schedEndH === null) return;
  if (!currentSites.length && !currentApps.length) { siteInput.focus(); return; }

  const durMin    = calcDurationMin(schedStartH, schedEndH);
  const timeStr24 = `${String(schedStartH).padStart(2,'0')}:00`;
  const isRecurring = repeatToggle.checked;
  const summaryStr = `${hourLabel(schedStartH)} → ${hourLabel(schedEndH)}  ·  ${formatFocusMin(durMin)}`;

  // 현재 시간이 오늘 예약 윈도우 안에 있는지 확인
  const nowMs = Date.now();
  const todayWindowStart = (() => { const d = new Date(); d.setHours(schedStartH, 0, 0, 0); return d.getTime(); })();
  const todayWindowEnd   = todayWindowStart + durMin * 60000;
  const inWindowNow      = todayWindowStart <= nowMs && nowMs < todayWindowEnd;
  // 윈도우 안에 있으면 남은 시간만큼만 실행
  const effectiveDurMin  = inWindowNow ? Math.max(1, Math.round((todayWindowEnd - nowMs) / 60000)) : durMin;

  if (isRecurring) {
    const res = await window.api.setRecurring({
      time: timeStr24, durationMin: durMin, sites: currentSites, apps: currentApps,
    });
    if (!res.ok) {
      if (res.reason === 'noadmin') adminWarn.classList.remove('hidden');
      else alert('등록 실패: ' + (res.error || '알 수 없는 오류'));
      return;
    }
    if (inWindowNow) {
      // 현재 시간이 윈도우 안 — 즉시 세션 시작
      const sr = await window.api.startSession(currentSites, currentApps, effectiveDurMin);
      if (sr.ok) { renderActive(await window.api.getState()); return; }
    } else if (todayWindowStart > nowMs) {
      // 오늘 시작 시간이 아직 안 지남 — schtasks 외에 앱 내 타이머도 걸어둠 (오늘 첫 실행 보장)
      await window.api.setSchedule({
        startAt: todayWindowStart, sites: currentSites, apps: currentApps, durationMin: durMin,
      });
    }
    showScheduleActive({ label: '매일 자동 시작', timeStr: summaryStr, recurring: true });
  } else {
    const startAt = inWindowNow ? nowMs + 1500 : getScheduleStartAt(schedStartH);
    const res = await window.api.setSchedule({
      startAt, sites: currentSites, apps: currentApps,
      durationMin: inWindowNow ? effectiveDurMin : durMin,
    });
    if (!res.ok) {
      if (res.reason === 'noadmin') adminWarn.classList.remove('hidden');
      return;
    }
    const d = new Date(startAt);
    const dayLabel = d.getDate() === new Date().getDate() ? '오늘' : '내일';
    showScheduleActive({ label: `${dayLabel} 예약됨`, timeStr: summaryStr, startAt, recurring: false });
  }
});

scheduleCancelBtn.addEventListener('click', async () => {
  await window.api.cancelSchedule();
  await window.api.disableRecurring();
  resetScheduleUI();
});

// ── main → renderer 이벤트 ─────────────────────────────────
window.api.offAll('tick');
window.api.offAll('session-ended');
window.api.offAll('schedule-started');
window.api.offAll('schedule-cancelled');

window.api.onTick(({ endTime }) => { localEndTime = endTime; });

window.api.onSessionEnded(() => {
  resetScheduleUI();
  renderSetup();
  init();
});

window.api.onScheduleStarted(() => {
  resetScheduleUI();
  init();
});

window.api.onScheduleCancelled(() => {
  resetScheduleUI();
});

// ── 초기화 ────────────────────────────────────────────────
async function init() {
  const admin = await window.api.isAdmin();
  adminWarn.classList.toggle('hidden', admin);

  const saved = await window.api.getSites();
  currentSites = saved || [...DEFAULT_SITES];
  renderSiteList();

  const savedApps = await window.api.getApps();
  currentApps = savedApps || [];
  renderAppList();

  const state = await window.api.getState();
  await renderWeeklyStats();

  if (state.active && state.endTime > Date.now()) {
    renderActive(state);
    resetScheduleUI();
    return;
  }

  renderSetup();

  // 예약 상태 복원 (반복 우선)
  const rec = await window.api.getRecurring();
  if (rec && rec.enabled) {
    const [startH] = rec.time.split(':').map(Number);
    const endH = (startH + Math.floor(rec.durationMin / 60)) % 24;
    showScheduleActive({
      label: '매일 자동 시작',
      timeStr: `${hourLabel(startH)} → ${hourLabel(endH)}  ·  ${formatFocusMin(rec.durationMin)}`,
      recurring: true,
    });
  } else {
    const sched = await window.api.getSchedule();
    if (sched && sched.startAt > Date.now()) {
      const d = new Date(sched.startAt);
      const dayLabel = d.getDate() === new Date().getDate() ? '오늘' : '내일';
      const endH = (d.getHours() + Math.floor(sched.durationMin / 60)) % 24;
      showScheduleActive({
        label: `${dayLabel} 예약됨`,
        timeStr: `${hourLabel(d.getHours())} → ${hourLabel(endH)}  ·  ${formatFocusMin(sched.durationMin)}`,
        startAt: sched.startAt,
        recurring: false,
      });
    } else {
      resetScheduleUI();
    }
  }
}

updateTimeTotal();
buildHourChips();
init();
