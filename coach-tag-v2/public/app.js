/* ═══════════════════════════════════════════════
   CoachTag v3 — app.js
   ═══════════════════════════════════════════════ */

// ─── State ────────────────────────────────────────────────────────
let currentGameId = null;   // ID do jogo activo
let actionsCache  = [];     // acções carregadas do servidor

// ─── DOM refs ─────────────────────────────────────────────────────
const video          = document.getElementById('video');
const videoSrc       = document.getElementById('videoSrc');
const videoContainer = document.getElementById('videoContainer');
const uploadZone     = document.getElementById('uploadZone');
const playerSelect   = document.getElementById('playerSelect');
const eventList      = document.getElementById('eventList');
const eventCount     = document.getElementById('eventCount');
const eventButtons   = document.getElementById('eventButtons');

// ─── Toast ────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = 'toast hidden'; }, 2800);
}

// ─── Format MM:SS ─────────────────────────────────────────────────
function fmt(s) {
  return `${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
}

// ─── Format date ──────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '';
  const [y,m,day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// ═══════════════════════════════════════════════════════════════════
//  TABS
// ═══════════════════════════════════════════════════════════════════

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => { c.classList.add('hidden'); c.classList.remove('active'); });
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  const el = document.getElementById(`tab-${tab}`);
  el.classList.remove('hidden'); el.classList.add('active');
  if (tab === 'clips') loadClips();
  if (tab === 'stats') loadStats();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    switchTab(btn.dataset.tab);
  });
});

// ─── Enable tabs after game selected ─────────────────────────────
function enableGameTabs() {
  ['taggerTab','clipsTab','statsTab'].forEach(id => {
    document.getElementById(id).disabled = false;
  });
}

// ═══════════════════════════════════════════════════════════════════
//  MODALS
// ═══════════════════════════════════════════════════════════════════

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  if (id === 'modalGame') {
    document.getElementById('newGameName').value = '';
    document.getElementById('newGameDate').value = new Date().toISOString().split('T')[0];
    setTimeout(() => document.getElementById('newGameName').focus(), 50);
  }
  if (id === 'modalPlayer') {
    document.getElementById('newPlayerName').value = '';
    setTimeout(() => document.getElementById('newPlayerName').focus(), 50);
  }
  if (id === 'modalAction') {
    document.getElementById('newActionLabel').value = '';
    document.getElementById('newActionEmoji').value = '';
    renderCustomActionsList();
    setTimeout(() => document.getElementById('newActionEmoji').focus(), 50);
  }
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') ['modalGame','modalPlayer','modalAction'].forEach(id => closeModal(id));
});

// ═══════════════════════════════════════════════════════════════════
//  GAMES
// ═══════════════════════════════════════════════════════════════════

async function loadGames() {
  const grid = document.getElementById('gamesList');
  try {
    const games = await fetch('/games').then(r => r.json());
    grid.innerHTML = '';
    if (!games.length) {
      grid.innerHTML = '<p class="empty-state">Nenhum jogo ainda. Cria o primeiro!</p>';
      return;
    }
    games.sort((a,b) => b.date.localeCompare(a.date));
    games.forEach(g => {
      const card = document.createElement('div');
      card.className = 'game-card' + (g.id === currentGameId ? ' active' : '');
      card.innerHTML = `
        <div class="game-card-main" onclick="selectGame('${g.id}', '${g.name.replace(/'/g,"\\'")}')">
          <div class="game-card-name">${g.name}</div>
          <div class="game-card-meta">
            <span>📅 ${fmtDate(g.date)}</span>
            <span>🏷️ ${g.eventCount} eventos</span>
            <span class="game-has-video ${g.hasVideo ? 'yes' : ''}">${g.hasVideo ? '🎥 Vídeo' : '⬜ Sem vídeo'}</span>
          </div>
        </div>
        <div class="game-card-actions">
          <button class="btn-icon-sm" onclick="openEditGame(event,'${g.id}','${g.name.replace(/'/g,"\\'")}','${g.date}')" title="Editar">✏</button>
          <button class="btn-icon-sm danger" onclick="deleteGame(event,'${g.id}')" title="Apagar">✕</button>
        </div>
      `;
      grid.appendChild(card);
    });

    // Populate stats filter
    const sel = document.getElementById('statsGameFilter');
    const prev = sel.value;
    sel.innerHTML = '<option value="">Todos os jogos</option>';
    games.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id; opt.textContent = `${g.name} (${fmtDate(g.date)})`;
      sel.appendChild(opt);
    });
    sel.value = prev;
  } catch { grid.innerHTML = '<p class="empty-state">Erro ao carregar jogos.</p>'; }
}

async function createGame() {
  const name = document.getElementById('newGameName').value.trim();
  const date = document.getElementById('newGameDate').value;
  if (!name) { showToast('Escreve um nome', 'error'); return; }
  try {
    const res = await fetch('/games', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, date })
    });
    if (!res.ok) throw new Error();
    const game = await res.json();
    closeModal('modalGame');
    await loadGames();
    selectGame(game.id, game.name);
    showToast(`"${name}" criado ✓`);
  } catch { showToast('Erro ao criar jogo', 'error'); }
}

async function selectGame(id, name) {
  currentGameId = id;
  // Update badge
  const badge = document.getElementById('activeGameBadge');
  badge.textContent = name; badge.classList.remove('hidden');
  // Mark card active
  document.querySelectorAll('.game-card').forEach(c => c.classList.remove('active'));
  const card = document.querySelector(`.game-card[data-id]`);
  // Enable tabs
  enableGameTabs();
  // Switch to tagger
  switchTab('tagger');
  // Load game data
  await checkExistingVideo();
  await loadPlayers();
  await loadActions();
  await loadEvents();
  // Refresh games list to show active
  loadGames();
}

function openEditGame(ev, id, name, date) {
  ev.stopPropagation();
  const newName = prompt('Nome do jogo:', name);
  if (newName === null) return;
  const newDate = prompt('Data (AAAA-MM-DD):', date);
  if (newDate === null) return;
  fetch(`/games/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName, date: newDate })
  }).then(() => { loadGames(); showToast('Jogo actualizado ✓'); })
    .catch(() => showToast('Erro ao actualizar', 'error'));
}

async function deleteGame(ev, id) {
  ev.stopPropagation();
  if (!confirm('Apagar este jogo e todos os seus dados?')) return;
  try {
    await fetch(`/games/${id}`, { method: 'DELETE' });
    if (currentGameId === id) {
      currentGameId = null;
      document.getElementById('activeGameBadge').classList.add('hidden');
      ['taggerTab','clipsTab','statsTab'].forEach(tid => { document.getElementById(tid).disabled = true; });
      switchTab('games');
    }
    await loadGames();
    showToast('Jogo apagado');
  } catch { showToast('Erro ao apagar', 'error'); }
}

// ═══════════════════════════════════════════════════════════════════
//  VIDEO
// ═══════════════════════════════════════════════════════════════════

// ─── Drag & drop + file input ─────────────────────────────────────
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) handleVideoFile(e.dataTransfer.files[0]);
});
uploadZone.addEventListener('click', e => {
  if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
  document.getElementById('videoFileInput').click();
});
document.getElementById('videoFileInput').addEventListener('change', e => {
  if (e.target.files[0]) handleVideoFile(e.target.files[0]);
});

function changeVideo() {
  videoContainer.classList.add('hidden');
  uploadZone.classList.remove('hidden');
  video.src = '';
}

async function handleVideoFile(file) {
  if (!currentGameId) { showToast('Selecciona um jogo primeiro', 'error'); return; }

  const progressWrap = document.getElementById('uploadProgress');
  const progressBar  = document.getElementById('progressBar');
  const progressText = document.getElementById('uploadProgressText');
  const percentLabel = document.getElementById('uploadPercent');
  const speedLabel   = document.getElementById('uploadSpeed');

  progressWrap.classList.remove('hidden');
  progressBar.style.width = '0%';
  progressText.textContent = 'A carregar...';
  percentLabel.textContent = '0%';

  const formData = new FormData();
  formData.append('video', file);

  let startTime = Date.now(), lastLoaded = 0;

  try {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/games/${currentGameId}/video`);

      xhr.upload.onprogress = e => {
        if (!e.lengthComputable) return;
        const pct      = Math.round((e.loaded / e.total) * 100);
        const elapsed  = (Date.now() - startTime) / 1000;
        const speed    = e.loaded / elapsed; // bytes/s
        const remaining = (e.total - e.loaded) / speed;

        progressBar.style.width = pct + '%';
        percentLabel.textContent = pct + '%';

        if (pct === 100) {
          progressText.textContent = 'A processar no servidor...';
          speedLabel.textContent = '';
        } else {
          progressText.textContent = `${formatBytes(e.loaded)} / ${formatBytes(e.total)}`;
          speedLabel.textContent   = `${formatBytes(speed)}/s · ${formatTime(remaining)} restantes`;
        }
        lastLoaded = e.loaded;
      };

      xhr.onload  = () => xhr.status < 300 ? resolve() : reject(new Error('Erro no servidor'));
      xhr.onerror = () => reject(new Error('Erro de rede'));
      xhr.send(formData);
    });

    videoSrc.src = `/games/${currentGameId}/video/stream`;
    video.load();
    uploadZone.classList.add('hidden');
    videoContainer.classList.remove('hidden');
    progressWrap.classList.add('hidden');
    showToast('Vídeo carregado ✓');
    loadGames();
  } catch (err) {
    progressWrap.classList.add('hidden');
    showToast('Erro ao carregar vídeo', 'error');
  }
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
  if (b < 1024*1024*1024) return (b/1024/1024).toFixed(1) + ' MB';
  return (b/1024/1024/1024).toFixed(2) + ' GB';
}

function formatTime(s) {
  if (!isFinite(s) || s < 0) return '...';
  if (s < 60) return Math.ceil(s) + 's';
  return Math.floor(s/60) + 'm ' + Math.ceil(s%60) + 's';
}

async function checkExistingVideo() {
  if (!currentGameId) return;
  try {
    const meta = await fetch(`/games/${currentGameId}/video/meta`).then(r => r.json());
    if (meta && meta.filename) {
      videoSrc.src = `/games/${currentGameId}/video/stream`;
      video.load(); uploadZone.classList.add('hidden'); videoContainer.classList.remove('hidden');
    } else {
      videoContainer.classList.add('hidden'); uploadZone.classList.remove('hidden');
    }
  } catch { videoContainer.classList.add('hidden'); uploadZone.classList.remove('hidden'); }
}

// ═══════════════════════════════════════════════════════════════════
//  PLAYERS
// ═══════════════════════════════════════════════════════════════════

async function loadPlayers() {
  try {
    const players = await fetch('/players').then(r => r.json());
    playerSelect.innerHTML = '';
    if (!players.length) {
      const opt = document.createElement('option'); opt.textContent = 'Sem jogadores'; opt.disabled = true; playerSelect.appendChild(opt); return;
    }
    players.forEach(p => { const opt = document.createElement('option'); opt.value = p.name; opt.textContent = p.name; playerSelect.appendChild(opt); });
  } catch { showToast('Erro ao carregar jogadores', 'error'); }
}

async function addPlayer() {
  const name = document.getElementById('newPlayerName').value.trim();
  if (!name) return;
  try {
    const res = await fetch('/players', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (res.status === 409) { showToast('Jogador já existe', 'error'); return; }
    if (!res.ok) throw new Error();
    closeModal('modalPlayer'); await loadPlayers();
    for (const opt of playerSelect.options) { if (opt.value === name) { opt.selected = true; break; } }
    showToast(`${name} adicionado ✓`);
  } catch { showToast('Erro ao adicionar jogador', 'error'); }
}

// ═══════════════════════════════════════════════════════════════════
//  ACTIONS
// ═══════════════════════════════════════════════════════════════════

async function loadActions() {
  try {
    actionsCache = await fetch('/actions').then(r => r.json());
    renderActionButtons();
  } catch { showToast('Erro ao carregar acções', 'error'); }
}

function darken(hex, amt) {
  let c = hex.replace('#','');
  if (c.length === 3) c = c.split('').map(x=>x+x).join('');
  const n = parseInt(c,16);
  const r = Math.max(0,(n>>16)-amt), g = Math.max(0,((n>>8)&0xff)-amt), b = Math.max(0,(n&0xff)-amt);
  return `#${[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('')}`;
}

function renderActionButtons() {
  eventButtons.innerHTML = '';
  actionsCache.forEach(action => {
    const btn = document.createElement('button');
    btn.className = 'tag-btn'; btn.dataset.actionId = action.id;
    btn.style.background = `linear-gradient(140deg, ${darken(action.color,20)}, ${action.color})`;
    btn.style.color = '#fff'; btn.style.boxShadow = `0 3px 12px ${action.color}33`;
    btn.innerHTML = `${action.emoji} ${action.label}`;
    btn.addEventListener('click', () => tagEvent(action.label, btn));
    eventButtons.appendChild(btn);
  });
}

async function addAction() {
  const label = document.getElementById('newActionLabel').value.trim();
  const emoji = document.getElementById('newActionEmoji').value.trim();
  if (!label) { showToast('Escreve um nome', 'error'); return; }
  try {
    const res = await fetch('/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, emoji: emoji || '🏷️' }) });
    if (res.status === 409) { showToast('Acção já existe', 'error'); return; }
    if (!res.ok) throw new Error();
    document.getElementById('newActionLabel').value = ''; document.getElementById('newActionEmoji').value = '';
    await loadActions(); renderCustomActionsList(); showToast(`"${label}" adicionada ✓`);
  } catch { showToast('Erro ao adicionar acção', 'error'); }
}

function renderCustomActionsList() {
  const list = document.getElementById('customActionsList'); list.innerHTML = '';
  actionsCache.filter(a => !a.builtin).forEach(a => {
    const row = document.createElement('div'); row.className = 'custom-action-row';
    row.innerHTML = `<span class="ca-emoji">${a.emoji}</span><span class="ca-label">${a.label}</span><button class="ca-del" onclick="deleteAction('${a.id}','${a.label}')">✕</button>`;
    list.appendChild(row);
  });
}

async function deleteAction(id, label) {
  if (!confirm(`Apagar "${label}"?`)) return;
  try {
    await fetch(`/actions/${id}`, { method: 'DELETE' });
    await loadActions(); renderCustomActionsList(); showToast(`"${label}" removida`);
  } catch { showToast('Erro ao apagar', 'error'); }
}

// ═══════════════════════════════════════════════════════════════════
//  EVENTS
// ═══════════════════════════════════════════════════════════════════

async function tagEvent(type, btn) {
  if (!currentGameId) { showToast('Selecciona um jogo', 'error'); return; }
  if (!playerSelect.value) { showToast('Seleciona um jogador', 'error'); return; }
  if (btn) { btn.classList.add('pressed'); setTimeout(() => btn.classList.remove('pressed'), 300); }
  try {
    const res = await fetch(`/games/${currentGameId}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, player: playerSelect.value, time: video.currentTime })
    });
    if (!res.ok) throw new Error();
    showToast(`${type} @ ${fmt(video.currentTime)}`); await loadEvents();
  } catch { showToast('Erro ao guardar evento', 'error'); }
}

async function loadEvents() {
  if (!currentGameId) return;
  try {
    const events = await fetch(`/games/${currentGameId}/events`).then(r => r.json());
    events.sort((a,b) => a.time - b.time);
    eventCount.textContent = events.length; eventList.innerHTML = '';
    if (!events.length) { eventList.innerHTML = '<p class="empty-state">Ainda sem eventos marcados.</p>'; return; }
    events.forEach(e => {
      const item = document.createElement('div');
      item.className = 'event-item'; item.dataset.id = e.id;
      const action = actionsCache.find(a => a.label === e.type);
      const dotColor = action ? action.color : '#6b7280';
      item.innerHTML = `
        <span class="type-dot" style="background:${dotColor}"></span>
        <span class="event-time">${fmt(e.time)}</span>
        <div class="event-info">
          <div class="event-type">${e.type}</div>
          <div class="event-player">${e.player}</div>
        </div>
        <div class="event-actions">
          <button class="clip-btn" title="Exportar clip" onclick="openClipModal(event,${e.id},${e.time})">✂</button>
          <button title="Editar" onclick="editEvent(event,${e.id})">✏</button>
          <button class="del" title="Apagar" onclick="deleteEvent(event,${e.id})">✕</button>
        </div>`;
      item.addEventListener('click', ev => { if (ev.target.tagName === 'BUTTON') return; video.currentTime = e.time; video.play(); });
      eventList.appendChild(item);
    });
  } catch { showToast('Erro ao carregar eventos', 'error'); }
}

async function deleteEvent(ev, id) {
  ev.stopPropagation();
  await fetch(`/games/${currentGameId}/events/${id}`, { method: 'DELETE' });
  await loadEvents(); showToast('Evento removido');
}

async function editEvent(ev, id) {
  ev.stopPropagation();
  const tipos = actionsCache.map(a => a.label);
  const t = prompt(`Novo tipo:\n${tipos.map((l,i)=>`${i+1}. ${l}`).join('\n')}\n\nEscreve o nome:`);
  if (!t || !tipos.includes(t.trim())) { if (t !== null) showToast('Tipo inválido', 'error'); return; }
  await fetch(`/games/${currentGameId}/events/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: t.trim() }) });
  await loadEvents(); showToast('Evento actualizado ✓');
}

async function clearAllEvents() {
  if (!confirm('Apagar todos os eventos deste jogo?')) return;
  const events = await fetch(`/games/${currentGameId}/events`).then(r => r.json());
  await Promise.all(events.map(e => fetch(`/games/${currentGameId}/events/${e.id}`, { method: 'DELETE' })));
  await loadEvents(); showToast('Eventos limpos');
}

function exportCSV() { window.location.href = `/games/${currentGameId}/events/export`; }

// ═══════════════════════════════════════════════════════════════════
//  CLIPS
// ═══════════════════════════════════════════════════════════════════

// ─── Clip settings modal ─────────────────────────────────────────
function openClipModal(ev, eventId, eventTime) {
  ev.stopPropagation();
  const old = document.getElementById('clipModal'); if (old) old.remove();

  const modal = document.createElement('div');
  modal.id = 'clipModal'; modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-box clip-modal-box">
      <h3>✂ Definir intervalo do clip</h3>
      <p class="clip-modal-hint">Evento marcado em <strong>${fmt(eventTime)}</strong></p>
      <div class="clip-interval-row">
        <div class="modal-field">
          <label>Início (segundos)</label>
          <input id="clipStart" type="number" min="0" step="0.5" value="${Math.max(0, (eventTime - 5).toFixed(1))}" placeholder="0">
        </div>
        <div class="clip-interval-arrow">→</div>
        <div class="modal-field">
          <label>Fim (segundos)</label>
          <input id="clipEnd" type="number" min="0" step="0.5" value="${(eventTime + 10).toFixed(1)}" placeholder="60">
        </div>
      </div>
      <div class="clip-duration-hint" id="clipDurationHint"></div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="document.getElementById('clipModal').remove()">Cancelar</button>
        <button class="btn-primary" onclick="doExportClip(${eventId})">Exportar MP4</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Live duration hint
  function updateHint() {
    const s = parseFloat(document.getElementById('clipStart').value) || 0;
    const e = parseFloat(document.getElementById('clipEnd').value) || 0;
    const dur = e - s;
    const hint = document.getElementById('clipDurationHint');
    if (dur <= 0) { hint.textContent = '⚠ O fim deve ser depois do início'; hint.style.color = 'var(--red)'; }
    else { hint.textContent = `Duração: ${dur.toFixed(1)}s`; hint.style.color = 'var(--muted)'; }
  }
  document.getElementById('clipStart').addEventListener('input', updateHint);
  document.getElementById('clipEnd').addEventListener('input', updateHint);
  updateHint();
}

async function doExportClip(eventId) {
  const startVal = parseFloat(document.getElementById('clipStart').value);
  const endVal   = parseFloat(document.getElementById('clipEnd').value);
  if (isNaN(startVal) || isNaN(endVal) || endVal <= startVal) {
    showToast('Intervalo inválido', 'error'); return;
  }
  document.getElementById('clipModal').remove();

  const row     = document.querySelector(`.event-item[data-id="${eventId}"]`);
  const clipBtn = row?.querySelector('.clip-btn');
  if (row)     row.classList.add('exporting');
  if (clipBtn) clipBtn.innerHTML = '<span class="spin">⟳</span>';
  showToast('A exportar clip...');
  try {
    const res = await fetch(`/games/${currentGameId}/clips/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, startTime: startVal, endTime: endVal })
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const { url, filename } = await res.json();
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    showToast('Clip exportado ✓');
    loadClips();
  } catch (e) { showToast(e.message || 'Erro ao exportar', 'error'); }
  finally { if (row) row.classList.remove('exporting'); if (clipBtn) clipBtn.innerHTML = '✂'; }
}

async function exportAllClips() {
  const events = await fetch(`/games/${currentGameId}/events`).then(r => r.json());
  if (!events.length) { showToast('Sem eventos', 'error'); return; }
  if (!confirm(`Exportar ${events.length} clips?`)) return;
  const overlay = document.getElementById('batchOverlay'), batchBar = document.getElementById('batchBar');
  const batchProg = document.getElementById('batchProgress'), batchCurr = document.getElementById('batchCurrent');
  overlay.classList.remove('hidden'); batchBar.style.width = '0%'; batchProg.textContent = `0 / ${events.length}`;
  try {
    const response = await fetch(`/games/${currentGameId}/clips/export-all`, { method: 'POST' });
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = JSON.parse(line.slice(6));
        if (data.done) { overlay.classList.add('hidden'); showToast(`${data.results.filter(r=>r.ok).length}/${events.length} clips ✓`); switchTab('clips'); break; }
        const pct = Math.round(((data.progress+1)/data.total)*100);
        batchBar.style.width = pct+'%'; batchProg.textContent = `${data.progress+1} / ${data.total}`;
        if (data.event) batchCurr.textContent = `${data.event.type} — ${data.event.player} @ ${fmt(data.event.time)}`;
      }
    }
  } catch { overlay.classList.add('hidden'); showToast('Erro na exportação', 'error'); }
}

async function loadClips() {
  const grid = document.getElementById('clipsList');
  grid.innerHTML = '<p class="empty-state">A carregar...</p>';
  try {
    const clips = await fetch('/clips').then(r => r.json());
    grid.innerHTML = '';
    if (!clips.length) { grid.innerHTML = '<p class="empty-state">Nenhum clip exportado ainda.<br>Vai ao Tagger e clica ✂ num evento.</p>'; return; }
    clips.forEach(c => {
      const card = document.createElement('div'); card.className = 'clip-card';
      const label = c.filename.replace('.mp4','').replace(/^clip_g_\d+_/,'').replace(/_/g,' ').replace(/\d+s \d+$/, '').trim();
      card.innerHTML = `
        <div class="clip-thumb" onclick="openLightbox('${c.url}')">
          <video src="${c.url}" muted preload="metadata"></video>
          <div class="clip-play-btn">▶</div>
        </div>
        <div class="clip-card-info">
          <div class="clip-card-name">${label || c.filename}</div>
          <div class="clip-card-actions">
            <button class="btn-secondary" style="font-size:0.8rem;padding:6px 12px;" onclick="openLightbox('${c.url}')">▶ Ver</button>
            <a href="${c.url}" download="${c.filename}" class="btn-primary" style="text-decoration:none;font-size:0.8rem;padding:6px 14px;">↓ Download</a>
            <button class="btn-danger-sm" onclick="deleteClip('${c.filename}')">✕</button>
          </div>
        </div>`;
      grid.appendChild(card);
    });
  } catch { grid.innerHTML = '<p class="empty-state">Erro ao carregar clips.</p>'; }
}

async function deleteClip(filename) {
  if (!confirm('Apagar clip?')) return;
  await fetch(`/clips/${encodeURIComponent(filename)}`, { method: 'DELETE' });
  showToast('Clip apagado'); await loadClips();
}

function openLightbox(url) {
  const old = document.getElementById('lightbox'); if (old) old.remove();
  const lb = document.createElement('div'); lb.id = 'lightbox'; lb.className = 'lightbox';
  lb.innerHTML = `
    <div class="lightbox-backdrop" onclick="closeLightbox()"></div>
    <div class="lightbox-content">
      <!-- top bar: close + export -->
      <div class="lightbox-topbar">
        <div class="lb-hint">Pausa o vídeo para desenhar</div>
        <div class="lb-topbar-actions">
          <button class="lb-btn-export" onclick="exportLightboxFrame()" title="Guardar frame com desenho">📷 Guardar imagem</button>
          <button class="lightbox-close" onclick="closeLightbox()">✕</button>
        </div>
      </div>
      <!-- video wrapper with canvas on top -->
      <div class="lb-video-wrap">
        <video id="lbVideo" src="${url}" controls autoplay></video>
        <canvas id="lbCanvas" class="lb-canvas hidden"></canvas>
        <!-- drawing toolbar — same design as main tagger -->
        <div id="lbToolbar" class="draw-toolbar lb-draw-toolbar hidden">
          <div class="draw-tools">
            <button class="draw-tool lb-tool active" data-tool="arrow" title="Seta">➜</button>
            <button class="draw-tool lb-tool" data-tool="circle" title="Círculo">◯</button>
            <button class="draw-tool lb-tool" data-tool="rect" title="Rectângulo">▭</button>
            <button class="draw-tool lb-tool" data-tool="freehand" title="Livre">✏</button>
            <button class="draw-tool lb-tool" data-tool="text" title="Texto">T</button>
          </div>
          <div class="draw-colors">
            <button class="draw-color lb-color active" data-color="#ff3d3d" style="background:#ff3d3d"></button>
            <button class="draw-color lb-color" data-color="#00e676" style="background:#00e676"></button>
            <button class="draw-color lb-color" data-color="#ffeb3b" style="background:#ffeb3b"></button>
            <button class="draw-color lb-color" data-color="#ffffff" style="background:#ffffff"></button>
            <button class="draw-color lb-color" data-color="#2979ff" style="background:#2979ff"></button>
          </div>
          <div class="draw-actions">
            <button class="draw-action" onclick="lbUndo()" title="Desfazer">↩</button>
            <button class="draw-action" onclick="lbClear()" title="Limpar">🗑</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(lb);
  requestAnimationFrame(() => lb.classList.add('open'));
  initLightboxDrawing();
}

function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (!lb) return;
  // stop video
  const v = document.getElementById('lbVideo');
  if (v) { v.pause(); v.src = ''; }
  lb.classList.remove('open');
  setTimeout(() => lb.remove(), 200);
}

// ─── Lightbox drawing ─────────────────────────────────────────────
let lbTool = 'arrow', lbColor = '#ff3d3d';
let lbDrawing = false, lbStartX = 0, lbStartY = 0;
let lbHistory = [], lbCurrentSnap = null;

function initLightboxDrawing() {
  const lbVideo   = document.getElementById('lbVideo');
  const lbCanvas  = document.getElementById('lbCanvas');
  const lbToolbar = document.getElementById('lbToolbar');
  if (!lbVideo || !lbCanvas) return;

  const lbCtx = lbCanvas.getContext('2d');

  // Show/hide canvas on pause/play
  lbVideo.addEventListener('pause', () => {
    syncLbCanvas();
    lbCanvas.classList.remove('hidden');
    lbToolbar.classList.remove('hidden');
  });
  lbVideo.addEventListener('play', () => {
    lbClear();
    lbCanvas.classList.add('hidden');
    lbToolbar.classList.add('hidden');
  });
  lbVideo.addEventListener('ended', () => {
    lbCanvas.classList.add('hidden');
    lbToolbar.classList.add('hidden');
  });

  function syncLbCanvas() {
    const rect = lbVideo.getBoundingClientRect();
    const wrapRect = lbVideo.parentElement.getBoundingClientRect();
    lbCanvas.style.top    = (rect.top - wrapRect.top) + 'px';
    lbCanvas.style.left   = (rect.left - wrapRect.left) + 'px';
    lbCanvas.style.width  = rect.width + 'px';
    lbCanvas.style.height = rect.height + 'px';
    lbCanvas.width  = rect.width;
    lbCanvas.height = rect.height;
  }

  // Tool & colour selection
  document.querySelectorAll('.lb-tool').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lb-tool').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      lbTool = btn.dataset.tool;
      lbCanvas.style.cursor = lbTool === 'text' ? 'text' : 'crosshair';
    });
  });
  document.querySelectorAll('.lb-color').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lb-color').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      lbColor = btn.dataset.color;
    });
  });

  function setLbStyle() {
    lbCtx.strokeStyle = lbColor; lbCtx.fillStyle = lbColor;
    lbCtx.lineWidth = 3; lbCtx.lineCap = 'round'; lbCtx.lineJoin = 'round';
    lbCtx.shadowColor = 'rgba(0,0,0,0.6)'; lbCtx.shadowBlur = 3;
  }

  function lbSaveSnap() { lbCurrentSnap = lbCtx.getImageData(0, 0, lbCanvas.width, lbCanvas.height); }

  window.lbUndo = () => { if (!lbHistory.length) return; lbCtx.putImageData(lbHistory.pop(), 0, 0); };
  window.lbClear = () => { lbCtx.clearRect(0, 0, lbCanvas.width, lbCanvas.height); lbHistory = []; };

  function lbDrawArrow(x1, y1, x2, y2) {
    const h = 18, a = Math.atan2(y2-y1, x2-x1);
    lbCtx.beginPath(); lbCtx.moveTo(x1,y1); lbCtx.lineTo(x2,y2); lbCtx.stroke();
    lbCtx.beginPath();
    lbCtx.moveTo(x2,y2);
    lbCtx.lineTo(x2 - h*Math.cos(a-Math.PI/7), y2 - h*Math.sin(a-Math.PI/7));
    lbCtx.lineTo(x2 - h*Math.cos(a+Math.PI/7), y2 - h*Math.sin(a+Math.PI/7));
    lbCtx.closePath(); lbCtx.fill();
  }

  function lbPreview(x, y) {
    if (!lbCurrentSnap) return;
    lbCtx.putImageData(lbCurrentSnap, 0, 0); setLbStyle();
    const w = x-lbStartX, h = y-lbStartY;
    if (lbTool==='arrow') lbDrawArrow(lbStartX,lbStartY,x,y);
    else if (lbTool==='circle') { lbCtx.beginPath(); lbCtx.ellipse(lbStartX+w/2,lbStartY+h/2,Math.abs(w/2),Math.abs(h/2),0,0,Math.PI*2); lbCtx.stroke(); }
    else if (lbTool==='rect') { lbCtx.beginPath(); lbCtx.strokeRect(lbStartX,lbStartY,w,h); }
  }

  function lbGetPos(e) {
    const rect = lbCanvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx-rect.left, y: cy-rect.top };
  }

  lbCanvas.addEventListener('mousedown', e => {
    if (lbTool==='text') {
      const pos = lbGetPos(e), label = prompt('Texto:'); if (!label) return;
      lbSaveSnap(); lbHistory.push(lbCtx.getImageData(0,0,lbCanvas.width,lbCanvas.height));
      setLbStyle(); lbCtx.font='bold 20px DM Sans,sans-serif';
      lbCtx.strokeStyle='rgba(0,0,0,0.8)'; lbCtx.lineWidth=3;
      lbCtx.strokeText(label,pos.x,pos.y); lbCtx.fillText(label,pos.x,pos.y); return;
    }
    lbDrawing=true; const pos=lbGetPos(e); lbStartX=pos.x; lbStartY=pos.y; lbSaveSnap();
    if (lbTool==='freehand') { lbHistory.push(lbCtx.getImageData(0,0,lbCanvas.width,lbCanvas.height)); setLbStyle(); lbCtx.beginPath(); lbCtx.moveTo(lbStartX,lbStartY); }
  });
  lbCanvas.addEventListener('mousemove', e => {
    if (!lbDrawing) return; const pos=lbGetPos(e);
    if (lbTool==='freehand') { lbCtx.lineTo(pos.x,pos.y); lbCtx.stroke(); }
    else lbPreview(pos.x,pos.y);
  });
  lbCanvas.addEventListener('mouseup', e => {
    if (!lbDrawing) return; lbDrawing=false; const pos=lbGetPos(e);
    if (lbTool!=='freehand') {
      lbHistory.push(lbCtx.getImageData(0,0,lbCanvas.width,lbCanvas.height)); setLbStyle();
      const w=pos.x-lbStartX, h=pos.y-lbStartY;
      if (lbTool==='arrow') lbDrawArrow(lbStartX,lbStartY,pos.x,pos.y);
      else if (lbTool==='circle') { lbCtx.beginPath(); lbCtx.ellipse(lbStartX+w/2,lbStartY+h/2,Math.abs(w/2),Math.abs(h/2),0,0,Math.PI*2); lbCtx.stroke(); }
      else if (lbTool==='rect') { lbCtx.beginPath(); lbCtx.strokeRect(lbStartX,lbStartY,w,h); }
    }
    lbCtx.beginPath();
  });
  lbCanvas.addEventListener('mouseleave', e => { if (lbDrawing) { lbDrawing=false; lbCtx.beginPath(); } });
  lbCanvas.addEventListener('touchstart', e => { e.preventDefault(); lbCanvas.dispatchEvent(new MouseEvent('mousedown', { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY })); }, {passive:false});
  lbCanvas.addEventListener('touchmove',  e => { e.preventDefault(); lbCanvas.dispatchEvent(new MouseEvent('mousemove', { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY })); }, {passive:false});
  lbCanvas.addEventListener('touchend',   e => { e.preventDefault(); lbCanvas.dispatchEvent(new MouseEvent('mouseup',   {})); }, {passive:false});
}

// ─── Export frame + drawing as image ─────────────────────────────
function exportLightboxFrame() {
  const lbVideo  = document.getElementById('lbVideo');
  const lbCanvas = document.getElementById('lbCanvas');
  if (!lbVideo) return;

  // Draw video frame + canvas annotations onto a temp canvas
  const temp = document.createElement('canvas');
  temp.width  = lbVideo.videoWidth  || lbCanvas.width;
  temp.height = lbVideo.videoHeight || lbCanvas.height;
  const tCtx  = temp.getContext('2d');

  // Draw the current video frame
  tCtx.drawImage(lbVideo, 0, 0, temp.width, temp.height);

  // Draw canvas annotations scaled to video resolution
  if (!lbCanvas.classList.contains('hidden') && lbCanvas.width > 0) {
    tCtx.drawImage(lbCanvas, 0, 0, temp.width, temp.height);
  }

  // Download as PNG
  const ts   = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const link = document.createElement('a');
  link.download = `coachtag-frame-${ts}.png`;
  link.href = temp.toDataURL('image/png');
  link.click();
  showToast('Imagem guardada ✓');
}

// ═══════════════════════════════════════════════════════════════════
//  STATS
// ═══════════════════════════════════════════════════════════════════

async function loadStats() {
  const content = document.getElementById('statsContent');
  const gameId  = document.getElementById('statsGameFilter').value;
  content.innerHTML = '<p class="empty-state">A carregar...</p>';

  try {
    const url   = '/stats' + (gameId ? `?gameId=${gameId}` : '');
    const stats = await fetch(url).then(r => r.json());

    if (stats.total === 0) {
      content.innerHTML = '<p class="empty-state">Ainda sem eventos registados.</p>';
      return;
    }

    // ─── By player ───────────────────────────────────────────────
    const players    = Object.entries(stats.byPlayer).sort((a,b) => b[1].total - a[1].total);
    const maxTotal   = players[0]?.[1].total || 1;

    // ─── By type ─────────────────────────────────────────────────
    const types      = Object.entries(stats.byType).sort((a,b) => b[1] - a[1]);
    const maxType    = types[0]?.[1] || 1;

    content.innerHTML = `
      <div class="stats-grid">

        <!-- Summary cards -->
        <div class="stats-summary">
          <div class="stat-card">
            <div class="stat-number">${stats.total}</div>
            <div class="stat-label">Total de eventos</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${players.length}</div>
            <div class="stat-label">Jogadores</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${types.length}</div>
            <div class="stat-label">Tipos de acção</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${Object.keys(stats.byGame).length}</div>
            <div class="stat-label">Jogos</div>
          </div>
        </div>

        <!-- By player -->
        <div class="stats-section">
          <h3>Por Jogador</h3>
          <div class="bar-chart">
            ${players.map(([name, data]) => `
              <div class="bar-row">
                <div class="bar-label">${name}</div>
                <div class="bar-track">
                  <div class="bar-fill" style="width:${Math.round((data.total/maxTotal)*100)}%">
                    <span class="bar-value">${data.total}</span>
                  </div>
                </div>
                <div class="bar-breakdown">
                  ${Object.entries(data.byType).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([type,n]) => {
                    const ac = actionsCache.find(a => a.label === type);
                    const col = ac ? ac.color : '#6b7280';
                    return `<span class="breakdown-tag" style="border-color:${col};color:${col}">${type}: ${n}</span>`;
                  }).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- By type -->
        <div class="stats-section">
          <h3>Por Tipo de Acção</h3>
          <div class="bar-chart">
            ${types.map(([type, n]) => {
              const ac  = actionsCache.find(a => a.label === type);
              const col = ac ? ac.color : '#6b7280';
              return `
                <div class="bar-row">
                  <div class="bar-label">${ac?.emoji || ''} ${type}</div>
                  <div class="bar-track">
                    <div class="bar-fill" style="width:${Math.round((n/maxType)*100)}%;background:${col}">
                      <span class="bar-value">${n}</span>
                    </div>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>

        <!-- By game (only when showing all) -->
        ${!gameId && Object.keys(stats.byGame).length > 1 ? `
        <div class="stats-section">
          <h3>Por Jogo</h3>
          <div class="games-table">
            ${Object.entries(stats.byGame).sort((a,b)=>b[1].total-a[1].total).map(([,g]) => `
              <div class="games-table-row">
                <div class="games-table-name">${g.name}</div>
                <div class="games-table-date">${fmtDate(g.date)}</div>
                <div class="games-table-count">${g.total} eventos</div>
              </div>
            `).join('')}
          </div>
        </div>` : ''}

      </div>
    `;
  } catch { content.innerHTML = '<p class="empty-state">Erro ao carregar estatísticas.</p>'; }
}

// ═══════════════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════════════

document.addEventListener('keydown', e => {
  if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
  const map = { p:'Passe', e:'Perda', f:'Finalização', t:'Falta', g:'Golo' };
  if (e.key === ' ') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
  else if (map[e.key.toLowerCase()]) {
    const action = actionsCache.find(a => a.label === map[e.key.toLowerCase()]);
    tagEvent(map[e.key.toLowerCase()], action ? document.querySelector(`[data-action-id="${action.id}"]`) : null);
  }
});

document.getElementById('newPlayerName').addEventListener('keydown', e => { if (e.key === 'Enter') addPlayer(); });
document.getElementById('newActionLabel').addEventListener('keydown', e => { if (e.key === 'Enter') addAction(); });
document.getElementById('newGameName').addEventListener('keydown', e => { if (e.key === 'Enter') createGame(); });

// ═══════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════

(async () => {
  await loadGames();
  await loadPlayers();
  await loadActions();
})();

// ═══════════════════════════════════════════════════════════════════
//  DRAWING ON VIDEO
// ═══════════════════════════════════════════════════════════════════

const drawCanvas  = document.getElementById('drawCanvas');
const drawToolbar = document.getElementById('drawToolbar');
const ctx         = drawCanvas.getContext('2d');

let drawTool    = 'arrow';   // active tool
let drawColor   = '#ff3d3d'; // active colour
let isDrawing   = false;
let startX      = 0, startY = 0;
let drawHistory = [];        // for undo — array of ImageData snapshots
let currentSnap = null;      // snapshot before current stroke

// ─── Show/hide canvas on play/pause ──────────────────────────────
video.addEventListener('pause', () => {
  if (!videoContainer.classList.contains('hidden')) {
    syncCanvasSize();
    drawCanvas.classList.remove('hidden');
    drawToolbar.classList.remove('hidden');
  }
});

video.addEventListener('play', () => {
  clearDrawing();
  drawCanvas.classList.add('hidden');
  drawToolbar.classList.add('hidden');
});

// Also hide if video ends
video.addEventListener('ended', () => {
  drawCanvas.classList.add('hidden');
  drawToolbar.classList.add('hidden');
});

// ─── Sync canvas size to video element ───────────────────────────
function syncCanvasSize() {
  const rect = video.getBoundingClientRect();
  const containerRect = videoContainer.getBoundingClientRect();
  // Position canvas exactly over the video element
  drawCanvas.style.top    = (rect.top - containerRect.top) + 'px';
  drawCanvas.style.left   = (rect.left - containerRect.left) + 'px';
  drawCanvas.style.width  = rect.width + 'px';
  drawCanvas.style.height = rect.height + 'px';
  drawCanvas.width  = rect.width;
  drawCanvas.height = rect.height;
}

window.addEventListener('resize', () => {
  if (!drawCanvas.classList.contains('hidden')) {
    // Preserve drawing through resize
    const snap = ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
    syncCanvasSize();
    ctx.putImageData(snap, 0, 0);
  }
});

// ─── Tool selection ───────────────────────────────────────────────
document.querySelectorAll('.draw-tool').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.draw-tool').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    drawTool = btn.dataset.tool;
    drawCanvas.style.cursor = drawTool === 'text' ? 'text' : 'crosshair';
  });
});

document.querySelectorAll('.draw-color').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.draw-color').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    drawColor = btn.dataset.color;
  });
});

// ─── Canvas style helpers ─────────────────────────────────────────
function setCtxStyle() {
  ctx.strokeStyle = drawColor;
  ctx.fillStyle   = drawColor;
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur  = 3;
}

// ─── Undo ─────────────────────────────────────────────────────────
function saveSnapshot() {
  currentSnap = ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
}

function undoDrawing() {
  if (!drawHistory.length) return;
  const prev = drawHistory.pop();
  ctx.putImageData(prev, 0, 0);
}

function clearDrawing() {
  ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  drawHistory = [];
}

// ─── Mouse / touch position ───────────────────────────────────────
function getPos(e) {
  const rect = drawCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: clientX - rect.left, y: clientY - rect.top };
}

// ─── Draw arrow ───────────────────────────────────────────────────
function drawArrow(x1, y1, x2, y2) {
  const headLen = 18;
  const angle   = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI/7), y2 - headLen * Math.sin(angle - Math.PI/7));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI/7), y2 - headLen * Math.sin(angle + Math.PI/7));
  ctx.closePath();
  ctx.fill();
}

// ─── Draw shape preview (while dragging) ─────────────────────────
function drawPreview(x, y) {
  if (!currentSnap) return;
  ctx.putImageData(currentSnap, 0, 0);
  setCtxStyle();
  const w = x - startX, h = y - startY;

  if (drawTool === 'arrow') {
    drawArrow(startX, startY, x, y);
  } else if (drawTool === 'circle') {
    ctx.beginPath();
    ctx.ellipse(startX + w/2, startY + h/2, Math.abs(w/2), Math.abs(h/2), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (drawTool === 'rect') {
    ctx.beginPath();
    ctx.strokeRect(startX, startY, w, h);
  }
}

// ─── Pointer events ───────────────────────────────────────────────
drawCanvas.addEventListener('mousedown', onPointerDown);
drawCanvas.addEventListener('mousemove', onPointerMove);
drawCanvas.addEventListener('mouseup',   onPointerUp);
drawCanvas.addEventListener('mouseleave', onPointerUp);
drawCanvas.addEventListener('touchstart', e => { e.preventDefault(); onPointerDown(e); }, { passive: false });
drawCanvas.addEventListener('touchmove',  e => { e.preventDefault(); onPointerMove(e); }, { passive: false });
drawCanvas.addEventListener('touchend',   e => { e.preventDefault(); onPointerUp(e); },   { passive: false });

function onPointerDown(e) {
  if (drawTool === 'text') {
    const pos   = getPos(e);
    const label = prompt('Texto:');
    if (!label) return;
    saveSnapshot();
    drawHistory.push(ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
    setCtxStyle();
    ctx.shadowBlur = 4;
    ctx.font = 'bold 20px DM Sans, sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 3;
    ctx.strokeText(label, pos.x, pos.y);
    ctx.fillText(label, pos.x, pos.y);
    return;
  }
  isDrawing = true;
  const pos = getPos(e);
  startX = pos.x; startY = pos.y;
  saveSnapshot();
  if (drawTool === 'freehand') {
    drawHistory.push(ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
    setCtxStyle();
    ctx.beginPath();
    ctx.moveTo(startX, startY);
  }
}

function onPointerMove(e) {
  if (!isDrawing) return;
  const pos = getPos(e);
  if (drawTool === 'freehand') {
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  } else {
    drawPreview(pos.x, pos.y);
  }
}

function onPointerUp(e) {
  if (!isDrawing) return;
  isDrawing = false;
  const pos = getPos(e);
  if (drawTool !== 'freehand') {
    drawHistory.push(ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
    setCtxStyle();
    const w = pos.x - startX, h = pos.y - startY;
    if (drawTool === 'arrow') {
      drawArrow(startX, startY, pos.x, pos.y);
    } else if (drawTool === 'circle') {
      ctx.beginPath();
      ctx.ellipse(startX + w/2, startY + h/2, Math.abs(w/2), Math.abs(h/2), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (drawTool === 'rect') {
      ctx.beginPath();
      ctx.strokeRect(startX, startY, w, h);
    }
  }
  ctx.beginPath(); // reset path for freehand
}

// ═══════════════════════════════════════════════════════════════════
//  PDF EXPORT
// ═══════════════════════════════════════════════════════════════════

// Export PDF for the current game (called from Tagger tab)
async function exportPDFCurrentGame() {
  if (!currentGameId) { showToast('Selecciona um jogo primeiro', 'error'); return; }
  const gameFilter = document.getElementById('statsGameFilter');
  const prevVal    = gameFilter.value;
  gameFilter.value = currentGameId;
  await exportPDF();
  gameFilter.value = prevVal;
}

// Main PDF export — uses whatever game is selected in statsGameFilter
async function exportPDF() {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) { showToast('Erro: jsPDF não carregou', 'error'); return; }

  showToast('A gerar PDF...');

  const gameId  = document.getElementById('statsGameFilter').value;
  const games   = await fetch('/games').then(r => r.json());
  const game    = games.find(g => g.id === gameId) || null;
  const url     = '/stats' + (gameId ? `?gameId=${gameId}` : '');
  const stats   = await fetch(url).then(r => r.json());

  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W      = 210, H = 297;
  const margin = 16;
  const colW   = W - margin * 2;
  let   y      = 0;

  // ── Helpers ────────────────────────────────────────────────────
  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return [r, g, b];
  }

  function checkPage(needed = 10) {
    if (y + needed > H - 16) { doc.addPage(); y = margin; }
  }

  function sectionTitle(text) {
    checkPage(14);
    doc.setFillColor(26, 32, 48);
    doc.roundedRect(margin, y, colW, 9, 2, 2, 'F');
    doc.setTextColor(0, 230, 118);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(text.toUpperCase(), margin + 4, y + 6);
    doc.setTextColor(40, 40, 40);
    y += 13;
  }

  // ── Cover ──────────────────────────────────────────────────────
  // Dark header band
  doc.setFillColor(11, 14, 19);
  doc.rect(0, 0, W, 58, 'F');

  // Green accent line
  doc.setFillColor(0, 230, 118);
  doc.rect(0, 58, W, 2, 'F');

  // Logo text
  doc.setTextColor(0, 230, 118);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text('⚽ CoachTag', margin, 24);

  // Game name
  const title = game ? game.name : 'Todos os Jogos';
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, margin, 38);

  // Date + event count
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(160, 170, 190);
  const dateStr = game ? fmtDate(game.date) : 'Todos os jogos';
  doc.text(`${dateStr}  ·  ${stats.total} eventos`, margin, 50);

  // Generated date
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-PT')}`, W - margin, 50, { align: 'right' });

  y = 72;

  // ── Summary cards ──────────────────────────────────────────────
  const cards = [
    { label: 'Total Eventos', value: stats.total },
    { label: 'Jogadores', value: Object.keys(stats.byPlayer).length },
    { label: 'Tipos de Acção', value: Object.keys(stats.byType).length },
    { label: 'Jogos', value: Object.keys(stats.byGame).length },
  ];
  const cardW = (colW - 9) / 4;
  cards.forEach((c, i) => {
    const x = margin + i * (cardW + 3);
    doc.setFillColor(240, 244, 250);
    doc.roundedRect(x, y, cardW, 18, 2, 2, 'F');
    doc.setTextColor(0, 230, 118);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(String(c.value), x + cardW/2, y + 11, { align: 'center' });
    doc.setTextColor(100, 110, 130);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(c.label.toUpperCase(), x + cardW/2, y + 16, { align: 'center' });
  });
  y += 26;

  // ── By Player ──────────────────────────────────────────────────
  sectionTitle('Estatísticas por Jogador');
  const players = Object.entries(stats.byPlayer).sort((a,b) => b[1].total - a[1].total);
  const maxP    = players[0]?.[1].total || 1;

  players.forEach(([name, data]) => {
    checkPage(20);
    // Player name + total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text(name, margin, y + 4);
    doc.setTextColor(0, 150, 80);
    doc.text(String(data.total), W - margin, y + 4, { align: 'right' });

    // Bar track
    const barY   = y + 6;
    const barH   = 5;
    const barMax = colW * 0.7;
    const barW   = Math.max(4, (data.total / maxP) * barMax);
    doc.setFillColor(230, 235, 245);
    doc.roundedRect(margin, barY, barMax, barH, 1, 1, 'F');
    doc.setFillColor(0, 200, 100);
    doc.roundedRect(margin, barY, barW, barH, 1, 1, 'F');

    // Type breakdown tags
    let tagX = margin;
    const tagY = barY + barH + 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    Object.entries(data.byType).sort((a,b)=>b[1]-a[1]).slice(0,6).forEach(([type, n]) => {
      const ac  = actionsCache.find(a => a.label === type);
      const col = ac ? hexToRgb(ac.color) : [100,100,100];
      const tag = `${type}: ${n}`;
      const tw  = doc.getTextWidth(tag) + 5;
      if (tagX + tw > W - margin) return;
      doc.setDrawColor(...col); doc.setTextColor(...col);
      doc.roundedRect(tagX, tagY - 3.5, tw, 5, 1, 1, 'S');
      doc.text(tag, tagX + 2.5, tagY);
      tagX += tw + 3;
    });

    y += 22;
  });

  y += 4;

  // ── By Type ────────────────────────────────────────────────────
  sectionTitle('Eventos por Tipo de Acção');
  const types  = Object.entries(stats.byType).sort((a,b) => b[1]-a[1]);
  const maxT   = types[0]?.[1] || 1;
  const barMax = colW * 0.65;

  types.forEach(([type, n]) => {
    checkPage(10);
    const ac  = actionsCache.find(a => a.label === type);
    const col = ac ? hexToRgb(ac.color) : [100,100,100];
    const barW = Math.max(4, (n / maxT) * barMax);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    doc.text(`${ac?.emoji || ''} ${type}`, margin, y + 4);

    const bx = margin + 52;
    doc.setFillColor(230, 235, 245);
    doc.roundedRect(bx, y, barMax, 6, 1, 1, 'F');
    doc.setFillColor(...col);
    doc.roundedRect(bx, y, barW, 6, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...col);
    doc.text(String(n), W - margin, y + 5, { align: 'right' });

    y += 10;
  });

  y += 6;

  // ── Events list ────────────────────────────────────────────────
  sectionTitle('Lista Completa de Eventos');

  // Table header
  doc.setFillColor(220, 228, 240);
  doc.rect(margin, y, colW, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(60, 70, 90);
  doc.text('TEMPO',   margin + 2,      y + 5);
  doc.text('JOGADOR', margin + 22,     y + 5);
  doc.text('ACÇÃO',   margin + 72,     y + 5);
  y += 9;

  // Get events for selected game(s)
  let allEvents = [];
  if (gameId) {
    allEvents = await fetch(`/games/${gameId}/events`).then(r => r.json());
    allEvents.sort((a,b) => a.time - b.time);
  } else {
    for (const g of games) {
      const evs = await fetch(`/games/${g.id}/events`).then(r => r.json());
      evs.forEach(e => allEvents.push({ ...e, gameName: g.name }));
    }
    allEvents.sort((a,b) => a.time - b.time);
  }

  allEvents.forEach((e, i) => {
    checkPage(7);
    const bg = i % 2 === 0 ? [250,252,255] : [240,244,252];
    doc.setFillColor(...bg);
    doc.rect(margin, y, colW, 6, 'F');

    const ac  = actionsCache.find(a => a.label === e.type);
    const col = ac ? hexToRgb(ac.color) : [80,80,80];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 180, 90);
    doc.text(fmt(e.time), margin + 2, y + 4.2);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text(e.player, margin + 22, y + 4.2);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...col);
    doc.text(e.type, margin + 72, y + 4.2);

    if (!gameId && e.gameName) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(140, 150, 170);
      doc.text(e.gameName, margin + 120, y + 4.2);
    }

    y += 6.5;
  });

  // ── Footer on each page ────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFillColor(240, 244, 250);
    doc.rect(0, H - 10, W, 10, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(140, 150, 170);
    doc.text('CoachTag — Análise de Desempenho', margin, H - 4);
    doc.text(`Página ${p} / ${pageCount}`, W - margin, H - 4, { align: 'right' });
  }

  // ── Save ───────────────────────────────────────────────────────
  const filename = game
    ? `CoachTag_${game.name.replace(/\s+/g,'_')}_${game.date}.pdf`
    : `CoachTag_Relatorio_${new Date().toISOString().split('T')[0]}.pdf`;

  doc.save(filename);
  showToast('PDF exportado ✓');
}
