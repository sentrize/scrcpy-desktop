const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let win;
const running = new Map();          // serial -> ChildProcess (scrcpy)
const infoCache = new Map();        // serial -> { android, battery }
let settings = { adb: '', scrcpy: '', maxSize: 1280, turnScreenOff: false, noAudio: false, record: false };
const EXE = process.platform === 'win32' ? '.exe' : '';

// Where bundled / downloaded scrcpy lives
function bundledDir() { return path.join(process.resourcesPath, 'scrcpy-win64'); }
function downloadedDir() { return path.join(app.getPath('userData'), 'scrcpy'); }

// Resolve a tool: explicit setting > downloaded copy > bundled copy > PATH
function tool(name) {
  if (settings[name]) return settings[name];
  for (const dir of [downloadedDir(), bundledDir()]) {
    const p = path.join(dir, name + EXE);
    if (fs.existsSync(p)) return p;
  }
  return name;
}
function toolSource(name) {
  if (settings[name]) return 'custom';
  if (fs.existsSync(path.join(downloadedDir(), name + EXE))) return 'downloaded';
  if (fs.existsSync(path.join(bundledDir(), name + EXE))) return 'bundled';
  return 'path';
}

const dataDir = () => app.getPath('userData');
const historyFile = () => path.join(dataDir(), 'devices.json');
const settingsFile = () => path.join(dataDir(), 'settings.json');

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ---------- adb helpers ----------
function run(cmd, args, timeout = 8000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: (stdout || '').toString(), err: (stderr || err?.message || '').toString() });
    });
  });
}

function parseDevices(out) {
  // Lines after "List of devices attached":  <serial>  <state>  key:value ...
  return out.split(/\r?\n/).slice(1)
    .map(l => l.trim()).filter(Boolean)
    .map(l => {
      const parts = l.split(/\s+/);
      const serial = parts[0];
      const state = parts[1];
      const meta = {};
      parts.slice(2).forEach(p => { const [k, v] = p.split(':'); if (k && v) meta[k] = v; });
      return {
        serial, state,
        model: (meta.model || '').replace(/_/g, ' '),
        product: meta.product || '',
        transport: /:\d+$/.test(serial) ? 'wifi' : 'usb',
      };
    });
}

async function enrich(dev) {
  if (dev.state !== 'device') return dev;
  if (!infoCache.has(dev.serial)) {
    const [ver, bat, brand] = await Promise.all([
      run(tool('adb'), ['-s', dev.serial, 'shell', 'getprop', 'ro.build.version.release']),
      run(tool('adb'), ['-s', dev.serial, 'shell', 'dumpsys', 'battery']),
      run(tool('adb'), ['-s', dev.serial, 'shell', 'getprop', 'ro.product.brand']),
    ]);
    const level = (bat.out.match(/level:\s*(\d+)/) || [])[1];
    infoCache.set(dev.serial, {
      android: ver.out.trim() || '?',
      battery: level ? Number(level) : null,
      brand: brand.out.trim(),
    });
  }
  return { ...dev, ...infoCache.get(dev.serial) };
}

async function poll() {
  const res = await run(tool('adb'), ['devices', '-l']);
  const adbOk = res.ok;
  let devices = adbOk ? parseDevices(res.out) : [];
  devices = await Promise.all(devices.map(enrich));
  devices.forEach(d => { d.mirroring = running.has(d.serial); });

  // update history
  const history = loadJson(historyFile(), {});
  const now = Date.now();
  for (const d of devices) {
    const prev = history[d.serial] || { firstSeen: now };
    history[d.serial] = {
      ...prev,
      serial: d.serial,
      model: d.model || prev.model || '',
      brand: d.brand || prev.brand || '',
      android: d.android || prev.android || '',
      transport: d.transport,
      lastSeen: now,
    };
  }
  saveJson(historyFile(), history);

  const connectedSerials = new Set(devices.map(d => d.serial));
  const previous = Object.values(history)
    .filter(h => !connectedSerials.has(h.serial))
    .sort((a, b) => b.lastSeen - a.lastSeen);

  return { adbOk, adbError: adbOk ? '' : res.err, devices, previous };
}

// ---------- scrcpy ----------
function buildArgs(serial, opts) {
  const args = ['-s', serial, '--window-title', `${opts.title || serial} — scrcpy`];
  if (settings.maxSize) args.push('--max-size', String(settings.maxSize));
  if (settings.turnScreenOff) args.push('--turn-screen-off');
  if (settings.noAudio) args.push('--no-audio');
  if (settings.record) {
    const file = path.join(app.getPath('videos'), `scrcpy-${serial.replace(/[:.]/g, '_')}-${Date.now()}.mp4`);
    args.push('--record', file);
  }
  return args;
}

function startMirror(serial, opts = {}) {
  if (running.has(serial)) return { ok: false, err: 'Already mirroring' };
  try {
    const child = spawn(tool('scrcpy'), buildArgs(serial, opts), { windowsHide: true });
    running.set(serial, child);
    let errBuf = '';
    child.stderr.on('data', d => { errBuf += d.toString(); });
    child.on('exit', (code) => {
      running.delete(serial);
      win?.webContents.send('mirror-exit', { serial, code, err: code ? errBuf.slice(-800) : '' });
    });
    child.on('error', (e) => {
      running.delete(serial);
      win?.webContents.send('mirror-exit', { serial, code: -1, err: e.message });
    });
    return { ok: true };
  } catch (e) { return { ok: false, err: e.message }; }
}

function stopMirror(serial) {
  const p = running.get(serial);
  if (!p) return { ok: false };
  p.kill();
  return { ok: true };
}

// ---------- ipc ----------
ipcMain.handle('poll', poll);
ipcMain.handle('mirror:start', (_e, serial, opts) => startMirror(serial, opts));
ipcMain.handle('mirror:stop', (_e, serial) => stopMirror(serial));
ipcMain.handle('adb:connect', (_e, addr) => run(tool('adb'), ['connect', addr]));
ipcMain.handle('adb:disconnect', (_e, addr) => run(tool('adb'), ['disconnect', addr]));
ipcMain.handle('adb:tcpip', async (_e, serial) => {
  // switch a USB device to wifi debugging: get its ip, then adb tcpip 5555 + connect
  const ipRes = await run(tool('adb'), ['-s', serial, 'shell', 'ip', 'route']);
  const ip = (ipRes.out.match(/src (\d+\.\d+\.\d+\.\d+)/) || [])[1];
  if (!ip) return { ok: false, err: 'Could not read device IP (is Wi-Fi on?)' };
  await run(tool('adb'), ['-s', serial, 'tcpip', '5555']);
  await new Promise(r => setTimeout(r, 1500));
  const c = await run(tool('adb'), ['connect', `${ip}:5555`]);
  return { ok: /connected/.test(c.out), out: c.out, addr: `${ip}:5555` };
});
ipcMain.handle('adb:restart', async () => {
  await run(tool('adb'), ['kill-server']);
  infoCache.clear();
  return run(tool('adb'), ['start-server']);
});
ipcMain.handle('history:forget', (_e, serial) => {
  const h = loadJson(historyFile(), {}); delete h[serial]; saveJson(historyFile(), h); return { ok: true };
});
ipcMain.handle('tools:check', async () => {
  const a = await run(tool('adb'), ['version']);
  const s = await run(tool('scrcpy'), ['--version']);
  return {
    adb: { ok: a.ok, version: (a.out.match(/version ([\d.]+)/) || [])[1] || '', source: toolSource('adb'), path: tool('adb') },
    scrcpy: { ok: s.ok, version: (s.out.match(/scrcpy ([\d.]+)/) || [])[1] || '', source: toolSource('scrcpy'), path: tool('scrcpy') },
    canInstall: process.platform === 'win32',
  };
});

// ---------- in-app install (Windows): download scrcpy win64 release (includes adb) ----------
const { net } = require('electron');
function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, redirect: 'follow' });
    let buf = '';
    req.on('response', r => { r.on('data', d => buf += d); r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body: buf })); });
    req.on('error', reject); req.end();
  });
}
function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, redirect: 'follow' });
    req.on('response', r => {
      if (r.statusCode !== 200) return reject(new Error('HTTP ' + r.statusCode));
      const total = Number(r.headers['content-length'] || 0); let got = 0;
      const out = fs.createWriteStream(dest);
      r.on('data', d => { got += d.length; out.write(d); onProgress(total ? got / total : 0, got); });
      r.on('end', () => out.end(resolve)); r.on('error', reject);
    });
    req.on('error', reject); req.end();
  });
}
async function latestTag() {
  // Follow the /releases/latest redirect; no API rate limits
  const r = await fetchText('https://github.com/Genymobile/scrcpy/releases/latest');
  const mt = (r.body || '').match(/\/releases\/tag\/(v[\d.]+)/);
  if (mt) return mt[1];
  throw new Error('Could not detect latest scrcpy version');
}
ipcMain.handle('tools:install', async (e) => {
  if (process.platform !== 'win32') return { ok: false, err: 'Auto-install is Windows only. Use: brew install scrcpy / apt install scrcpy adb' };
  const send = (msg, pct) => e.sender.send('install-progress', { msg, pct });
  try {
    send('Finding latest scrcpy release…', 0);
    const tag = await latestTag();
    const url = `https://github.com/Genymobile/scrcpy/releases/download/${tag}/scrcpy-win64-${tag}.zip`;
    const tmp = path.join(app.getPath('temp'), `scrcpy-${tag}.zip`);
    send(`Downloading scrcpy ${tag} (includes adb)…`, 0);
    await downloadFile(url, tmp, (p, got) => send(`Downloading scrcpy ${tag}… ${(got / 1048576).toFixed(1)} MB`, p));
    send('Extracting…', 1);
    const extractTo = path.join(app.getPath('temp'), `scrcpy-extract-${Date.now()}`);
    await new Promise((res, rej) => execFile('powershell.exe', ['-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${tmp}' -DestinationPath '${extractTo}' -Force`], { windowsHide: true }, (err, so, se) => err ? rej(new Error(se || err.message)) : res()));
    const inner = fs.readdirSync(extractTo).find(n => n.startsWith('scrcpy-win64'));
    const src = inner ? path.join(extractTo, inner) : extractTo;
    fs.rmSync(downloadedDir(), { recursive: true, force: true });
    fs.cpSync(src, downloadedDir(), { recursive: true });
    fs.rmSync(extractTo, { recursive: true, force: true }); fs.rmSync(tmp, { force: true });
    settings.adb = ''; settings.scrcpy = ''; saveJson(settingsFile(), settings); infoCache.clear();
    send(`Installed scrcpy ${tag} + adb`, 1);
    return { ok: true, tag };
  } catch (err) {
    send('Install failed: ' + err.message, 0);
    return { ok: false, err: err.message };
  }
});
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('open-external', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:set', (_e, patch) => { settings = { ...settings, ...patch }; saveJson(settingsFile(), settings); infoCache.clear(); return settings; });
ipcMain.handle('settings:browse', async (_e, which) => {
  const r = await dialog.showOpenDialog(win, { title: `Locate ${which}`, properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  settings[which] = r.filePaths[0]; saveJson(settingsFile(), settings); return settings;
});

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 860, minWidth: 1000, minHeight: 640,
    backgroundColor: '#090E1A',
    title: 'scrcpy Desktop',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  settings = { ...settings, ...loadJson(settingsFile(), {}) };
  createWindow();
});
app.on('window-all-closed', () => {
  for (const p of running.values()) p.kill();
  app.quit();
});
