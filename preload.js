const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState:       ()                  => ipcRenderer.invoke('get-state'),
  startSession:   (sites, apps, min)  => ipcRenderer.invoke('start-session', { sites, apps, durationMin: min }),
  getSites:       ()                  => ipcRenderer.invoke('get-sites'),
  saveSites:      (sites)             => ipcRenderer.invoke('save-sites', sites),
  getApps:        ()                  => ipcRenderer.invoke('get-apps'),
  saveApps:       (apps)              => ipcRenderer.invoke('save-apps', apps),
  getRunningApps:  ()                  => ipcRenderer.invoke('get-running-apps'),
  getWeeklyStats:  ()                  => ipcRenderer.invoke('get-weekly-stats'),
  getSchedule:      ()   => ipcRenderer.invoke('get-schedule'),
  setSchedule:      (p)  => ipcRenderer.invoke('set-schedule', p),
  cancelSchedule:   ()   => ipcRenderer.invoke('cancel-schedule'),
  getRecurring:     ()   => ipcRenderer.invoke('get-recurring'),
  setRecurring:     (p)  => ipcRenderer.invoke('set-recurring', p),
  disableRecurring: ()   => ipcRenderer.invoke('disable-recurring'),
  isAdmin:        ()                  => ipcRenderer.invoke('is-admin'),
  windowMinimize: ()                  => ipcRenderer.invoke('window-minimize'),
  windowClose:    ()                  => ipcRenderer.invoke('window-close'),

  onTick:            (cb) => ipcRenderer.on('tick',             (_, d) => cb(d)),
  onSessionEnded:    (cb) => ipcRenderer.on('session-ended',    (_, d) => cb(d)),
  onScheduleStarted: (cb) => ipcRenderer.on('schedule-started', ()    => cb()),
  onScheduleCancelled:(cb)=> ipcRenderer.on('schedule-cancelled',()   => cb()),
  offAll:            (ch) => ipcRenderer.removeAllListeners(ch),
});
