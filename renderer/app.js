const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const toastEl = $('#toast');
let lastSnapshot = '', toolsState = null, installing = false;

function toast(msg, bad = false) {
  toastEl.textContent = msg; toastEl.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove('show'), 3200);
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); return d === 1 ? 'yesterday' : `${d} days ago`;
}
const ic = (id) => `<svg><use href="#${id}"/></svg>`;
function stateText(d) {
  switch (d.state) {
    case 'device': return d.mirroring ? 'Mirroring' : 'Ready';
    case 'unauthorized': return 'Waiting for approval — tap “Allow USB debugging” on the phone';
    case 'offline': return 'Offline — unplug and replug, or restart adb';
    default: return `${d.state} — check USB drivers / permissions`;
  }
}
function stateClass(s) { return ['device', 'unauthorized', 'offline'].includes(s) ? s : 'other'; }
function displayName(d) { return [d.brand, d.model].filter(Boolean).join(' ') || d.serial; }

// ---------- navigation ----------
function showPage(name) {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === name));
  $$('.page').forEach(p => p.classList.toggle('active', p.dataset.page === name));
  if (name === 'settings') fillSettings();
}
$$('.nav-item').forEach(b => b.addEventListener('click', () => showPage(b.dataset.page)));
$('#btn-settings').addEventListener('click', () => showPage('settings'));
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.toggle('active', x === t));
  $$('.tab-body').forEach(b => b.classList.toggle('active', b.dataset.tab === t.dataset.tab));
}));
document.body.addEventListener('click', (e) => {
  const ext = e.target.closest('[data-ext]'); if (ext) { e.preventDefault(); window.api.openExternal(ext.dataset.ext); }
});

// ---------- rendering ----------
function deviceCard(d) {
  const sc = stateClass(d.state);
  const bat = d.battery != null ? `<span class="battery ${d.battery < 20 ? 'low' : ''}"><i style="--lvl:${d.battery}%"></i>${d.battery}%</span>` : '';
  let actions = '';
  if (d.state === 'device') {
    actions += d.mirroring
      ? `<button class="danger" data-act="stop" data-serial="${esc(d.serial)}">${ic('i-stop')}Stop mirroring</button>`
      : `<button class="primary" data-act="start" data-serial="${esc(d.serial)}" data-name="${esc(displayName(d))}">${ic('i-play')}Mirror screen</button>`;
    actions += d.transport === 'usb'
      ? `<button class="ghost" data-act="wifi" data-serial="${esc(d.serial)}">${ic('i-wifi')}Switch to Wi-Fi</button>`
      : `<button class="ghost" data-act="disconnect" data-serial="${esc(d.serial)}">Disconnect</button>`;
  } else if (d.state === 'offline') {
    actions += `<button class="ghost" data-act="restart">${ic('i-refresh')}Restart adb</button>`;
  }
  return `<div class="card ${d.mirroring ? 'mirroring' : ''}">
    <div class="avatar">${ic('i-phone')}<span class="status ${sc}"></span></div>
    <div>
      <div class="name">${esc(displayName(d))}</div>
      <div class="meta">${ic(d.transport === 'wifi' ? 'i-wifi' : 'i-usb')}${esc(d.serial)}</div>
      <div class="meta">${d.android ? `Android ${esc(d.android)}` : ''} ${bat}</div>
      <div class="state ${sc}">${esc(stateText(d))}</div>
      <div class="actions">${actions}</div>
    </div></div>`;
}
function prevCard(h) {
  return `<div class="card">
    <div class="avatar">${ic('i-phone')}</div>
    <div>
      <div class="name">${esc([h.brand, h.model].filter(Boolean).join(' ') || h.serial)}</div>
      <div class="meta">${ic(h.transport === 'wifi' ? 'i-wifi' : 'i-usb')}${esc(h.serial)}</div>
      <div class="meta">${h.android ? `Android ${esc(h.android)} • ` : ''}Last seen ${ago(h.lastSeen)}</div>
      <div class="actions">
        ${h.transport === 'wifi' ? `<button class="primary" data-act="connect" data-serial="${esc(h.serial)}">${ic('i-refresh')}Reconnect</button>` : ''}
        <button class="ghost" data-act="forget" data-serial="${esc(h.serial)}">${ic('i-trash')}Forget</button>
      </div></div></div>`;
}
function emptyNow(data) {
  if (!data.adbOk) return `<div class="empty error">${ic('i-phone')}<h3>adb not found</h3>
    <p>scrcpy Desktop can download scrcpy + adb for you (about 25 MB), or set a path in Settings.</p>
    ${toolsState?.canInstall ? `<div class="actions"><button class="primary" data-act="install">${ic('i-download')}Install adb + scrcpy</button></div>` : ''}
    <div class="progress" id="install-progress" hidden><div class="bar"><i></i></div><span></span></div>
    <pre>${esc(data.adbError.trim().slice(0, 300))}</pre></div>`;
  return `<div class="empty">${ic('i-phone')}<h3>No device connected</h3><p>Connect your Android device<br>to get started</p></div>`;
}
const emptyPrev = `<div class="empty">${ic('i-clock')}<h3>Nothing yet</h3><p>Devices you connect are remembered here, so Wi-Fi ones reconnect in one click.</p></div>`;

function render(data) {
  const now = data.devices.length ? data.devices.map(deviceCard).join('') : emptyNow(data);
  const prev = data.previous.length ? data.previous.map(prevCard).join('') : emptyPrev;
  $('#devices-home').innerHTML = now; $('#devices-page').innerHTML = now;
  $('#previous-home').innerHTML = prev; $('#previous-page').innerHTML = prev;
  const n = data.devices.length, p = data.previous.length;
  $('#count-now').textContent = n; $('#count-now-2').textContent = n;
  $('#count-prev').textContent = p; $('#count-prev-2').textContent = p;
  const nb = $('#nav-count'); nb.hidden = !n; nb.textContent = n;
  // prefill wifi address from most recent wifi device
  const lastWifi = [...data.devices, ...data.previous].find(x => x.transport === 'wifi');
  if (lastWifi && !$('#addr').value && document.activeElement !== $('#addr')) $('#addr').value = lastWifi.serial;
}

async function refresh() {
  const data = await window.api.poll();
  const snap = JSON.stringify(data);
  if (snap !== lastSnapshot) { lastSnapshot = snap; render(data); }
  $('#poll').classList.add('active'); setTimeout(() => $('#poll').classList.remove('active'), 300);
}

// ---------- actions ----------
document.body.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]'); if (!btn) return;
  const { act, serial, name } = btn.dataset;
  btn.disabled = true;
  try {
    if (act === 'start') { const r = await window.api.startMirror(serial, { title: name }); r.ok ? toast(`Mirroring ${name}`) : toast(r.err, true); }
    if (act === 'stop') { await window.api.stopMirror(serial); toast('Stopped'); }
    if (act === 'connect') { const r = await window.api.connect(serial); toast(r.out.trim() || r.err, !/connected/.test(r.out)); }
    if (act === 'disconnect') { await window.api.disconnect(serial); toast(`Disconnected ${serial}`); }
    if (act === 'wifi') { toast('Switching to Wi-Fi…'); const r = await window.api.toWifi(serial); if (r.ok) { toast(`Connected over Wi-Fi at ${r.addr} — you can unplug the cable`); $('#addr').value = r.addr; } else toast(r.err || r.out, true); }
    if (act === 'forget') { await window.api.forget(serial); toast('Forgotten'); }
    if (act === 'restart') { toast('Restarting adb…'); await window.api.restartAdb(); toast('adb restarted'); }
    if (act === 'install') { await installTools(); }
  } finally { lastSnapshot = ''; refresh(); }
});

$('#btn-connect').addEventListener('click', async () => {
  const addr = $('#addr').value.trim(); if (!addr) { toast('Enter the phone IP address first', true); return; }
  const r = await window.api.connect(addr.includes(':') ? addr : addr + ':5555');
  toast(r.out.trim() || r.err, !/connected/.test(r.out)); lastSnapshot = ''; refresh();
});
$('#addr').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-connect').click(); });
$('#addr-clear').addEventListener('click', () => { $('#addr').value = ''; $('#addr').focus(); });
$('#btn-restart').addEventListener('click', async () => { toast('Restarting adb…'); await window.api.restartAdb(); toast('adb restarted'); checkTools(); lastSnapshot = ''; refresh(); });

window.api.onMirrorExit(({ serial, code, err }) => {
  if (code) toast(`scrcpy exited (${serial}): ${err.split('\n').filter(Boolean).pop() || 'code ' + code}`, true);
  lastSnapshot = ''; refresh();
});

// ---------- settings ----------
async function fillSettings() {
  const s = await window.api.getSettings();
  $('#s-adb').value = s.adb; $('#s-scrcpy').value = s.scrcpy; $('#s-max').value = s.maxSize;
  $('#s-screenoff').checked = s.turnScreenOff; $('#s-noaudio').checked = s.noAudio; $('#s-record').checked = s.record;
}
$('#s-save').addEventListener('click', async () => {
  await window.api.setSettings({
    adb: $('#s-adb').value.trim(), scrcpy: $('#s-scrcpy').value.trim(),
    maxSize: Number($('#s-max').value) || 0,
    turnScreenOff: $('#s-screenoff').checked, noAudio: $('#s-noaudio').checked, record: $('#s-record').checked,
  });
  toast('Settings saved'); checkTools(); lastSnapshot = ''; refresh();
});
$$('[data-browse]').forEach(b => b.addEventListener('click', async () => {
  const s = await window.api.browse(b.dataset.browse); if (s) fillSettings();
}));

// ---------- tools ----------
async function checkTools() {
  const t = toolsState = await window.api.checkTools();
  for (const k of ['adb', 'scrcpy']) {
    const el = $(`#tool-${k}`); el.className = 'tool ' + (t[k].ok ? 'ok' : 'bad');
    el.lastChild.textContent = t[k].ok ? `${k} ${t[k].version}` : `${k} not found`;
    el.title = t[k].ok ? `${t[k].source} — ${t[k].path}` : 'Click “Install adb + scrcpy” or set the path in Settings';
  }
  $('#btn-install').hidden = !(t.canInstall && !(t.adb.ok && t.scrcpy.ok));
  if (t.scrcpy.ok) $('#about-scrcpy').textContent = `scrcpy ${t.scrcpy.version} (${t.scrcpy.source})`;
}
async function installTools() {
  if (installing) return; installing = true;
  $('#btn-install').disabled = true;
  const r = await window.api.installTools();
  installing = false; $('#btn-install').disabled = false;
  r.ok ? toast(`Installed scrcpy ${r.tag} + adb`) : toast(r.err, true);
  await checkTools(); lastSnapshot = ''; refresh();
}
$('#btn-install').addEventListener('click', installTools);
window.api.onInstallProgress(({ msg, pct }) => {
  $$('#install-progress').forEach(box => { box.hidden = false; box.querySelector('i').style.width = Math.round(pct * 100) + '%'; box.querySelector('span').textContent = msg; });
  $('#btn-install').lastChild.textContent = pct < 1 && installing ? msg : 'Install adb + scrcpy';
});

window.api.getVersion().then(v => { $('#app-version').textContent = 'v' + v; $('#about-version').textContent = 'v' + v; });
checkTools(); refresh(); setInterval(refresh, 2000);
