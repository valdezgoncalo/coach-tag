/* ═══════════════════════════════════════════════
   CoachTag v2 — app.js
   ═══════════════════════════════════════════════ */

const video          = document.getElementById('video');
const videoSrc       = document.getElementById('videoSrc');
const videoContainer = document.getElementById('videoContainer');
const uploadZone     = document.getElementById('uploadZone');
const playerSelect   = document.getElementById('playerSelect');
const eventList      = document.getElementById('eventList');
const eventCount     = document.getElementById('eventCount');
const eventButtons   = document.getElementById('eventButtons');

// Cache de acções carregadas (para dots de cor nos eventos)
let actionsCache = [];

// ─── Toast ────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = 'toast hidden'; }, 2800);
}

// ─── Helpers ──────────────────────────────────────────────────────
function fmt(s) {
  const m   = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

// ─── Tabs ─────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => {
      c.classList.add('hidden'); c.classList.remove('active');
    });
    btn.classList.add('active');
    const el = document.getElementById(`tab-${tab}`);
    el.classList.remove('hidden'); el.classList.add('active');
    if (tab === 'clips') loadClips();
  });
});

// ─── Modals ───────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
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
  if (e.key === 'Escape') {
    ['modalPlayer','modalAction'].forEach(id => closeModal(id));
  }
});

// ═══════════════════════════════════════════════════════════════════
//  ACTIONS — carregar e renderizar botões
// ═══════════════════════════════════════════════════════════════════

async function loadActions() {
  try {
    actionsCache = await fetch('/actions').then(r => r.json());
    renderActionButtons();
  } catch {
    showToast('Erro ao carregar acções', 'error');
  }
}

function renderActionButtons() {
  eventButtons.innerHTML = '';
  actionsCache.forEach(action => {
    const btn = document.createElement('button');
    btn.className = 'tag-btn';
    btn.dataset.actionId = action.id;
    btn.style.background = `linear-gradient(140deg, ${darken(action.color, 20)}, ${action.color})`;
    btn.style.color = '#fff';
    btn.style.boxShadow = `0 3px 12px ${action.color}33`;
    btn.innerHTML = `${action.emoji} ${action.label}`;
    btn.addEventListener('click', () => tagEvent(action.label, btn));
    eventButtons.appendChild(btn);
  });
}

// Escurece uma cor hex em N pontos (simples, para o gradiente)
function darken(hex, amount) {
  let c = hex.replace('#','');
  if (c.length === 3) c = c.split('').map(x => x+x).join('');
  const num = parseInt(c, 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return `#${[r,g,b].map(v => v.toString(16).padStart(2,'0')).join('')}`;
}

// ─── Adicionar acção ──────────────────────────────────────────────
async function addAction() {
  const label = document.getElementById('newActionLabel').value.trim();
  const emoji = document.getElementById('newActionEmoji').value.trim();
  if (!label) { showToast('Escreve um nome para a acção', 'error'); return; }

  try {
    const res = await fetch('/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, emoji: emoji || '🏷️' })
    });
    if (res.status === 409) { showToast('Acção já existe', 'error'); return; }
    if (!res.ok) throw new Error();

    document.getElementById('newActionLabel').value = '';
    document.getElementById('newActionEmoji').value = '';
    await loadActions();           // re-render botões
    renderCustomActionsList();     // actualiza lista dentro do modal
    showToast(`"${label}" adicionada ✓`);
  } catch { showToast('Erro ao adicionar acção', 'error'); }
}

// ─── Lista de acções custom dentro do modal ───────────────────────
function renderCustomActionsList() {
  const list = document.getElementById('customActionsList');
  list.innerHTML = '';
  const custom = actionsCache.filter(a => !a.builtin);
  if (!custom.length) return; // o :empty::before CSS trata do estado vazio

  custom.forEach(action => {
    const row = document.createElement('div');
    row.className = 'custom-action-row';
    row.innerHTML = `
      <span class="ca-emoji">${action.emoji}</span>
      <span class="ca-label">${action.label}</span>
      <button class="ca-del" onclick="deleteAction('${action.id}', '${action.label}')" title="Apagar">✕</button>
    `;
    list.appendChild(row);
  });
}

// ─── Apagar acção custom ──────────────────────────────────────────
async function deleteAction(id, label) {
  if (!confirm(`Apagar a acção "${label}"?`)) return;
  try {
    const res = await fetch(`/actions/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    await loadActions();
    renderCustomActionsList();
    showToast(`"${label}" removida`);
  } catch { showToast('Erro ao apagar acção', 'error'); }
}

// ═══════════════════════════════════════════════════════════════════
//  VIDEO UPLOAD
// ═══════════════════════════════════════════════════════════════════

uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleVideoFile(file);
});
uploadZone.addEventListener('click', e => {
  if (e.target.tagName === 'BUTTON') return;
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
  const allowed = ['video/mp4','video/quicktime','video/x-msvideo','video/x-matroska','video/webm'];
  if (!allowed.includes(file.type) && !file.name.match(/\.(mp4|mov|avi|mkv|webm)$/i)) {
    showToast('Formato não suportado', 'error'); return;
  }

  const progressWrap  = document.getElementById('uploadProgress');
  const progressBar   = document.getElementById('progressBar');
  const progressText  = document.getElementById('uploadProgressText');
  const percentLabel  = document.getElementById('uploadPercent');
  progressWrap.classList.remove('hidden');
  progressBar.style.width = '0%';
  progressText.textContent = 'A carregar...';

  const formData = new FormData();
  formData.append('video', file);

  try {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/video/upload');
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          progressBar.style.width = pct + '%';
          percentLabel.textContent = pct + '%';
          if (pct === 100) progressText.textContent = 'A processar...';
        }
      };
      xhr.onload  = () => xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText));
      xhr.onerror = () => reject(new Error('Erro de rede'));
      xhr.send(formData);
    });

    videoSrc.src = '/video/stream';
    video.load();
    uploadZone.classList.add('hidden');
    videoContainer.classList.remove('hidden');
    progressWrap.classList.add('hidden');
    showToast('Vídeo carregado ✓');
    await loadEvents();
  } catch (err) {
    progressWrap.classList.add('hidden');
    showToast('Erro ao carregar vídeo', 'error');
    console.error(err);
  }
}

async function checkExistingVideo() {
  try {
    const meta = await fetch('/video/meta').then(r => r.json());
    if (meta && meta.filename) {
      videoSrc.src = '/video/stream';
      video.load();
      uploadZone.classList.add('hidden');
      videoContainer.classList.remove('hidden');
    }
  } catch { /* sem vídeo ainda */ }
}

// ═══════════════════════════════════════════════════════════════════
//  PLAYERS
// ═══════════════════════════════════════════════════════════════════

async function loadPlayers() {
  try {
    const players = await fetch('/players').then(r => r.json());
    playerSelect.innerHTML = '';
    if (!players.length) {
      const opt = document.createElement('option');
      opt.textContent = 'Sem jogadores'; opt.disabled = true;
      playerSelect.appendChild(opt); return;
    }
    players.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name; opt.dataset.id = p.id; opt.textContent = p.name;
      playerSelect.appendChild(opt);
    });
  } catch { showToast('Erro ao carregar jogadores', 'error'); }
}

async function addPlayer() {
  const name = document.getElementById('newPlayerName').value.trim();
  if (!name) return;
  try {
    const res = await fetch('/players', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (res.status === 409) { showToast('Jogador já existe', 'error'); return; }
    if (!res.ok) throw new Error();
    closeModal('modalPlayer');
    await loadPlayers();
    for (const opt of playerSelect.options) {
      if (opt.value === name) { opt.selected = true; break; }
    }
    showToast(`${name} adicionado ✓`);
  } catch { showToast('Erro ao adicionar jogador', 'error'); }
}

// ═══════════════════════════════════════════════════════════════════
//  EVENTS — TAG
// ═══════════════════════════════════════════════════════════════════

async function tagEvent(type, btn) {
  if (!playerSelect.value) { showToast('Seleciona um jogador', 'error'); return; }

  if (btn) { btn.classList.add('pressed'); setTimeout(() => btn.classList.remove('pressed'), 300); }

  try {
    const res = await fetch('/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, player: playerSelect.value, time: video.currentTime })
    });
    if (!res.ok) throw new Error();
    showToast(`${type} @ ${fmt(video.currentTime)}`);
    await loadEvents();
  } catch { showToast('Erro ao guardar evento', 'error'); }
}

// ═══════════════════════════════════════════════════════════════════
//  EVENTS — LOAD & RENDER
// ═══════════════════════════════════════════════════════════════════

async function loadEvents() {
  try {
    const events = await fetch('/events').then(r => r.json());
    events.sort((a, b) => a.time - b.time);
    eventCount.textContent = events.length;
    eventList.innerHTML = '';

    if (!events.length) {
      eventList.innerHTML = '<p class="empty-state">Ainda sem eventos marcados.</p>';
      return;
    }

    events.forEach(e => {
      const item = document.createElement('div');
      item.className = 'event-item';
      item.dataset.id = e.id;
      item.title = 'Clica para saltar para este momento';

      // Cor do dot baseada na acção (do cache)
      const action   = actionsCache.find(a => a.label === e.type);
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
        </div>
      `;

      item.addEventListener('click', ev => {
        if (ev.target.tagName === 'BUTTON') return;
        video.currentTime = e.time;
        video.play();
      });

      eventList.appendChild(item);
    });
  } catch { showToast('Erro ao carregar eventos', 'error'); }
}

// ═══════════════════════════════════════════════════════════════════
//  EVENTS — CRUD
// ═══════════════════════════════════════════════════════════════════

async function deleteEvent(ev, id) {
  ev.stopPropagation();
  try {
    await fetch(`/events/${id}`, { method: 'DELETE' });
    await loadEvents();
    showToast('Evento removido');
  } catch { showToast('Erro ao remover', 'error'); }
}

async function editEvent(ev, id) {
  ev.stopPropagation();
  const tipos   = actionsCache.map(a => a.label);
  const newType = prompt(`Novo tipo:\n${tipos.map((t,i) => `${i+1}. ${t}`).join('\n')}\n\nEscreve o nome:`);
  if (!newType || !tipos.includes(newType.trim())) {
    if (newType !== null) showToast('Tipo inválido', 'error');
    return;
  }
  try {
    await fetch(`/events/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: newType.trim() })
    });
    await loadEvents();
    showToast('Evento atualizado ✓');
  } catch { showToast('Erro ao atualizar', 'error'); }
}

async function clearAllEvents() {
  if (!confirm('Apagar todos os eventos?')) return;
  const events = await fetch('/events').then(r => r.json());
  await Promise.all(events.map(e => fetch(`/events/${e.id}`, { method: 'DELETE' })));
  await loadEvents();
  showToast('Eventos limpos');
}

function exportCSV() { window.location.href = '/events/export'; }

// ═══════════════════════════════════════════════════════════════════
//  CLIP EXPORT — single
// ═══════════════════════════════════════════════════════════════════

async function exportClip(ev, eventId) {
  ev.stopPropagation();
  const meta = await fetch('/video/meta').then(r => r.json());
  if (!meta) { showToast('Carrega um vídeo primeiro', 'error'); return; }

  const row     = document.querySelector(`.event-item[data-id="${eventId}"]`);
  const clipBtn = row?.querySelector('.clip-btn');
  if (row)     row.classList.add('exporting');
  if (clipBtn) clipBtn.innerHTML = '<span class="spin">⟳</span>';

  showToast('A exportar clip...');

  try {
    const res = await fetch('/clips/export', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    const { url, filename } = await res.json();
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    showToast('Clip exportado ✓');
  } catch (err) {
    showToast(err.message || 'Erro ao exportar clip', 'error');
  } finally {
    if (row)     row.classList.remove('exporting');
    if (clipBtn) clipBtn.innerHTML = '✂';
  }
}

// ═══════════════════════════════════════════════════════════════════
//  CLIP EXPORT — batch
// ═══════════════════════════════════════════════════════════════════

async function exportAllClips() {
  const meta   = await fetch('/video/meta').then(r => r.json());
  if (!meta)   { showToast('Carrega um vídeo primeiro', 'error'); return; }
  const events = await fetch('/events').then(r => r.json());
  if (!events.length) { showToast('Sem eventos para exportar', 'error'); return; }
  if (!confirm(`Exportar ${events.length} clips?`)) return;

  const overlay   = document.getElementById('batchOverlay');
  const batchBar  = document.getElementById('batchBar');
  const batchProg = document.getElementById('batchProgress');
  const batchCurr = document.getElementById('batchCurrent');
  overlay.classList.remove('hidden');
  batchBar.style.width = '0%';
  batchProg.textContent = `0 / ${events.length}`;

  try {
    const response = await fetch('/clips/export-all', { method: 'POST' });
    const reader   = response.body.getReader();
    const decoder  = new TextDecoder();
    let buffer     = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = JSON.parse(line.slice(6));
        if (data.done) {
          overlay.classList.add('hidden');
          showToast(`${data.results.filter(r => r.ok).length}/${events.length} clips exportados ✓`);
          document.querySelector('[data-tab="clips"]').click();
          break;
        }
        const pct = Math.round(((data.progress + 1) / data.total) * 100);
        batchBar.style.width = pct + '%';
        batchProg.textContent = `${data.progress + 1} / ${data.total}`;
        if (data.event) batchCurr.textContent = `${data.event.type} — ${data.event.player} @ ${fmt(data.event.time)}`;
      }
    }
  } catch (err) {
    overlay.classList.add('hidden');
    showToast('Erro na exportação em lote', 'error');
    console.error(err);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  CLIPS TAB
// ═══════════════════════════════════════════════════════════════════

async function loadClips() {
  const grid = document.getElementById('clipsList');
  grid.innerHTML = '<p class="empty-state">A carregar...</p>';
  try {
    const clips = await fetch('/clips').then(r => r.json());
    grid.innerHTML = '';
    if (!clips.length) {
      grid.innerHTML = '<p class="empty-state">Nenhum clip exportado ainda.<br>Vai ao Tagger e clica ✂ num evento.</p>';
      return;
    }
    clips.forEach(c => {
      const card = document.createElement('div');
      card.className = 'clip-card';
      const label = c.filename.replace('.mp4','').replace(/^clip_/,'').replace(/_/g,' ').replace(/\d+s \d+$/, '').trim();
      card.innerHTML = `
        <video src="${c.url}" controls muted preload="metadata"></video>
        <div class="clip-card-info">
          <div class="clip-card-name">${label || c.filename}</div>
          <div class="clip-card-actions">
            <a href="${c.url}" download="${c.filename}" class="btn-primary" style="text-decoration:none;font-size:0.8rem;padding:6px 14px;">↓ Download</a>
            <button class="btn-danger-sm" onclick="deleteClip('${c.filename}')">✕ Apagar</button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch {
    grid.innerHTML = '<p class="empty-state">Erro ao carregar clips.</p>';
  }
}

async function deleteClip(filename) {
  if (!confirm(`Apagar clip?`)) return;
  try {
    await fetch(`/clips/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    showToast('Clip apagado');
    await loadClips();
  } catch { showToast('Erro ao apagar clip', 'error'); }
}

// ═══════════════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════════════

document.addEventListener('keydown', e => {
  if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
  const map = { p:'Passe', e:'Perda', f:'Finalização', t:'Falta', g:'Golo' };
  if (e.key === ' ') {
    e.preventDefault();
    video.paused ? video.play() : video.pause();
  } else if (map[e.key.toLowerCase()]) {
    const action = actionsCache.find(a => a.label === map[e.key.toLowerCase()]);
    const btn    = action && document.querySelector(`[data-action-id="${action.id}"]`);
    tagEvent(map[e.key.toLowerCase()], btn || null);
  }
});

document.getElementById('newPlayerName').addEventListener('keydown', e => {
  if (e.key === 'Enter') addPlayer();
});
document.getElementById('newActionLabel').addEventListener('keydown', e => {
  if (e.key === 'Enter') addAction();
});

// ═══════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════

(async () => {
  await checkExistingVideo();
  await loadPlayers();
  await loadActions();   // carrega acções E renderiza botões
  await loadEvents();
})();
