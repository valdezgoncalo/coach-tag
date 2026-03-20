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

uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => { e.preventDefault(); uploadZone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handleVideoFile(e.dataTransfer.files[0]); });
uploadZone.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') return; document.getElementById('videoFileInput').click(); });
document.getElementById('videoFileInput').addEventListener('change', e => { if (e.target.files[0]) handleVideoFile(e.target.files[0]); });

function changeVideo() { videoContainer.classList.add('hidden'); uploadZone.classList.remove('hidden'); video.src = ''; }

async function handleVideoFile(file) {
  if (!currentGameId) { showToast('Selecciona um jogo primeiro', 'error'); return; }
  const progressWrap = document.getElementById('uploadProgress');
  const progressBar  = document.getElementById('progressBar');
  const progressText = document.getElementById('uploadProgressText');
  const percentLabel = document.getElementById('uploadPercent');
  progressWrap.classList.remove('hidden'); progressBar.style.width = '0%';

  const formData = new FormData(); formData.append('video', file);
  try {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/games/${currentGameId}/video`);
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          progressBar.style.width = pct + '%'; percentLabel.textContent = pct + '%';
          if (pct === 100) progressText.textContent = 'A processar...';
        }
      };
      xhr.onload  = () => xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText));
      xhr.onerror = () => reject(new Error('Erro de rede'));
      xhr.send(formData);
    });
    videoSrc.src = `/games/${currentGameId}/video/stream`;
    video.load(); uploadZone.classList.add('hidden'); videoContainer.classList.remove('hidden');
    progressWrap.classList.add('hidden'); showToast('Vídeo carregado ✓');
    loadGames();
  } catch { progressWrap.classList.add('hidden'); showToast('Erro ao carregar vídeo', 'error'); }
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
          <button class="clip-btn" title="Exportar clip" onclick="exportClip(event,${e.id})">✂</button>
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

async function exportClip(ev, eventId) {
  ev.stopPropagation();
  const row = document.querySelector(`.event-item[data-id="${eventId}"]`);
  const clipBtn = row?.querySelector('.clip-btn');
  if (row) row.classList.add('exporting');
  if (clipBtn) clipBtn.innerHTML = '<span class="spin">⟳</span>';
  showToast('A exportar clip...');
  try {
    const res = await fetch(`/games/${currentGameId}/clips/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId }) });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const { url, filename } = await res.json();
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    showToast('Clip exportado ✓');
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
    if (!clips.length) { grid.innerHTML = '<p class="empty-state">Nenhum clip exportado ainda.</p>'; return; }
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
  lb.innerHTML = `<div class="lightbox-backdrop" onclick="closeLightbox()"></div><div class="lightbox-content"><button class="lightbox-close" onclick="closeLightbox()">✕</button><video src="${url}" controls autoplay style="width:100%;max-height:80vh;border-radius:10px;background:#000;"></video></div>`;
  document.body.appendChild(lb); requestAnimationFrame(() => lb.classList.add('open'));
}
function closeLightbox() { const lb = document.getElementById('lightbox'); if (!lb) return; lb.classList.remove('open'); setTimeout(() => lb.remove(), 200); }

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
