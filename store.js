const fs   = require('fs');
const path = require('path');

const DEFAULTS = {
  active: false,
  endTime: 0,
  sites: [],
  apps: [],
  durationMin: 25,
  todayKey: '',
  completedToday: 0,
  totalFocusMin: 0,
  savedSites: null,
  savedApps: null,
  dailyStats: {},
  schedule: null,
  recurringSchedule: null,
};

let _path  = null;
let _state = null;

function getPath() {
  if (!_path) {
    const { app } = require('electron');
    _path = path.join(app.getPath('userData'), 'state.json');
  }
  return _path;
}

function get() {
  if (!_state) {
    try {
      const raw = fs.readFileSync(getPath(), 'utf8');
      _state = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      _state = { ...DEFAULTS };
    }
  }
  return _state;
}

function set(next) {
  _state = next;
  try { fs.writeFileSync(getPath(), JSON.stringify(next, null, 2), 'utf8'); } catch {}
}

module.exports = { get, set };
