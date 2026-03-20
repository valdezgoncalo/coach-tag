const express = require('express');
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');
const ffmpeg  = require('fluent-ffmpeg');

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ─── Paths ─────────────────────────────────────────────────────────
const DATA_DIR     = path.join(__dirname, 'data');
const GAMES_DIR    = path.join(DATA_DIR, 'games');
const UPLOADS_DIR  = path.join(__dirname, 'uploads');
const CLIPS_DIR    = path.join(__dirname, 'public', 'clips');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const ACTIONS_FILE = path.join(DATA_DIR, 'actions.json');
const GAMES_FILE   = path.join(DATA_DIR, 'games.json');

const DEFAULT_ACTIONS = [
    { id: 'passe',  label: 'Passe',        emoji: '⚡', color: '#2979ff', builtin: true },
    { id: 'perda',  label: 'Perda',        emoji: '✗',  color: '#f44336', builtin: true },
    { id: 'fin',    label: 'Finalização',  emoji: '🎯', color: '#43a047', builtin: true },
    { id: 'falta',  label: 'Falta',        emoji: '🟨', color: '#fb8c00', builtin: true },
    { id: 'golo',   label: 'Golo',         emoji: '🥅', color: '#ab47bc', builtin: true },
    { id: 'defesa', label: 'Defesa',       emoji: '🧤', color: '#00acc1', builtin: true },
    { id: 'drible', label: 'Drible',       emoji: '💫', color: '#c6a000', builtin: true },
    { id: 'canto',  label: 'Canto',        emoji: '📐', color: '#607d8b', builtin: true },
    { id: 'livreD', label: 'Livre Direto', emoji: '🎯', color: '#e91e63', builtin: true },
    { id: 'fora',   label: 'Fora de Jogo', emoji: '🚩', color: '#ff5722', builtin: true },
];

// ─── Bootstrap ─────────────────────────────────────────────────────
function ensureDirs() {
    [DATA_DIR, GAMES_DIR, UPLOADS_DIR, CLIPS_DIR].forEach(d => {
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });
    if (!fs.existsSync(GAMES_FILE))   fs.writeFileSync(GAMES_FILE, '[]');
    if (!fs.existsSync(ACTIONS_FILE)) fs.writeFileSync(ACTIONS_FILE, '[]');
    if (!fs.existsSync(PLAYERS_FILE)) {
        fs.writeFileSync(PLAYERS_FILE, JSON.stringify([
            { id: 1, name: 'João' },
            { id: 2, name: 'Miguel' },
            { id: 3, name: 'Rita' }
        ], null, 2));
    }
}

// ─── Helpers ───────────────────────────────────────────────────────
function readJSON(file)        { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; } }
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function gameDir(id)           { return path.join(GAMES_DIR, id); }
function gameEventsFile(id)    { return path.join(gameDir(id), 'events.json'); }
function gameVideoMetaFile(id) { return path.join(gameDir(id), 'video.json'); }

function ensureGameDir(id) {
    const d = gameDir(id);
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    if (!fs.existsSync(gameEventsFile(id)))    fs.writeFileSync(gameEventsFile(id), '[]');
    if (!fs.existsSync(gameVideoMetaFile(id))) fs.writeFileSync(gameVideoMetaFile(id), 'null');
}

function getVideoPath(gameId) {
    const meta = readJSON(gameVideoMetaFile(gameId));
    if (!meta || !meta.filename) return null;
    const p = path.join(UPLOADS_DIR, meta.filename);
    return fs.existsSync(p) ? p : null;
}

// ─── Multer ────────────────────────────────────────────────────────
const videoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
        cb(null, `game_${req.params.gameId}${ext}`);
    }
});
const upload = multer({
    storage: videoStorage,
    limits: { fileSize: 4 * 1024 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok = ['.mp4','.mov','.avi','.mkv','.webm'];
        if (ok.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
        else cb(new Error('Formato não suportado.'));
    }
});

// ═══════════════════════════════════════════════════════════════════
//  GAMES
// ═══════════════════════════════════════════════════════════════════

app.get('/games', (req, res) => {
    const games = readJSON(GAMES_FILE);
    res.json(games.map(g => {
        const events  = fs.existsSync(gameEventsFile(g.id)) ? readJSON(gameEventsFile(g.id)) : [];
        const vidMeta = fs.existsSync(gameVideoMetaFile(g.id)) ? readJSON(gameVideoMetaFile(g.id)) : null;
        return { ...g, eventCount: events.length, hasVideo: !!(vidMeta && vidMeta.filename) };
    }));
});

app.post('/games', (req, res) => {
    const { name, date } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatório.' });
    const games = readJSON(GAMES_FILE);
    const game  = { id: `g_${Date.now()}`, name: name.trim(), date: date || new Date().toISOString().split('T')[0], createdAt: new Date().toISOString() };
    games.push(game);
    writeJSON(GAMES_FILE, games);
    ensureGameDir(game.id);
    res.status(201).json(game);
});

app.put('/games/:id', (req, res) => {
    const games = readJSON(GAMES_FILE);
    const idx   = games.findIndex(g => g.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Não encontrado.' });
    if (req.body.name) games[idx].name = req.body.name.trim();
    if (req.body.date) games[idx].date = req.body.date;
    writeJSON(GAMES_FILE, games);
    res.json(games[idx]);
});

app.delete('/games/:id', (req, res) => {
    const games = readJSON(GAMES_FILE);
    if (!games.find(g => g.id === req.params.id)) return res.status(404).json({ error: 'Não encontrado.' });
    const vp = getVideoPath(req.params.id);
    if (vp) fs.unlinkSync(vp);
    const d = gameDir(req.params.id);
    if (fs.existsSync(d)) fs.rmSync(d, { recursive: true });
    writeJSON(GAMES_FILE, games.filter(g => g.id !== req.params.id));
    res.json({ message: 'Apagado.' });
});

// ═══════════════════════════════════════════════════════════════════
//  VIDEO
// ═══════════════════════════════════════════════════════════════════

app.post('/games/:gameId/video', upload.single('video'), (req, res) => {
    const { gameId } = req.params;
    if (!readJSON(GAMES_FILE).find(g => g.id === gameId)) return res.status(404).json({ error: 'Jogo não encontrado.' });
    if (!req.file) return res.status(400).json({ error: 'Sem ficheiro.' });
    ensureGameDir(gameId);
    const meta = { originalName: req.file.originalname, filename: req.file.filename, size: req.file.size, uploadedAt: new Date().toISOString() };
    writeJSON(gameVideoMetaFile(gameId), meta);
    res.json({ ...meta, url: `/games/${gameId}/video/stream` });
});

app.get('/games/:gameId/video/stream', (req, res) => {
    const { gameId } = req.params;
    const meta = readJSON(gameVideoMetaFile(gameId));
    if (!meta?.filename) return res.status(404).json({ error: 'Sem vídeo.' });
    const fp = path.join(UPLOADS_DIR, meta.filename);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Ficheiro não encontrado.' });
    const stat = fs.statSync(fp), size = stat.size, range = req.headers.range;
    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10), end = parts[1] ? parseInt(parts[1], 10) : size - 1;
        res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': 'video/mp4' });
        fs.createReadStream(fp, { start, end }).pipe(res);
    } else {
        res.writeHead(200, { 'Content-Length': size, 'Content-Type': 'video/mp4' });
        fs.createReadStream(fp).pipe(res);
    }
});

app.get('/games/:gameId/video/meta', (req, res) => {
    const meta = readJSON(gameVideoMetaFile(req.params.gameId));
    res.json(meta || null);
});

// ═══════════════════════════════════════════════════════════════════
//  EVENTS
// ═══════════════════════════════════════════════════════════════════

app.get('/games/:gameId/events', (req, res) => {
    ensureGameDir(req.params.gameId);
    res.json(readJSON(gameEventsFile(req.params.gameId)));
});

app.post('/games/:gameId/events', (req, res) => {
    const { type, player, time } = req.body;
    if (!type || !player || typeof time !== 'number') return res.status(400).json({ error: 'Dados inválidos.' });
    ensureGameDir(req.params.gameId);
    const events = readJSON(gameEventsFile(req.params.gameId));
    const ev = { id: Date.now(), type, player, time };
    events.push(ev);
    writeJSON(gameEventsFile(req.params.gameId), events);
    res.status(201).json(ev);
});

app.put('/games/:gameId/events/:id', (req, res) => {
    const events = readJSON(gameEventsFile(req.params.gameId));
    const idx    = events.findIndex(e => e.id === parseInt(req.params.id));
    if (idx === -1) return res.status(404).json({ error: 'Não encontrado.' });
    if (req.body.type)   events[idx].type   = req.body.type;
    if (req.body.player) events[idx].player = req.body.player;
    writeJSON(gameEventsFile(req.params.gameId), events);
    res.json(events[idx]);
});

app.delete('/games/:gameId/events/:id', (req, res) => {
    const events   = readJSON(gameEventsFile(req.params.gameId));
    const filtered = events.filter(e => e.id !== parseInt(req.params.id));
    if (filtered.length === events.length) return res.status(404).json({ error: 'Não encontrado.' });
    writeJSON(gameEventsFile(req.params.gameId), filtered);
    res.json({ message: 'Removido.' });
});

app.get('/games/:gameId/events/export', (req, res) => {
    const game   = readJSON(GAMES_FILE).find(g => g.id === req.params.gameId) || { name: 'jogo' };
    const events = readJSON(gameEventsFile(req.params.gameId));
    const csv = 'id,jogador,tipo,tempo_segundos\n' + events.map(e => `${e.id},"${e.player}","${e.type}",${e.time.toFixed(2)}`).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${game.name}.csv"`);
    res.send(csv);
});

// ═══════════════════════════════════════════════════════════════════
//  STATISTICS
// ═══════════════════════════════════════════════════════════════════

app.get('/stats', (req, res) => {
    const { gameId } = req.query;
    const games = readJSON(GAMES_FILE);
    let allEvents = [];

    if (gameId) {
        allEvents = readJSON(gameEventsFile(gameId)).map(e => ({ ...e, gameId, gameName: (games.find(g => g.id === gameId) || {}).name }));
    } else {
        games.forEach(g => {
            const evs = fs.existsSync(gameEventsFile(g.id)) ? readJSON(gameEventsFile(g.id)) : [];
            allEvents.push(...evs.map(e => ({ ...e, gameId: g.id, gameName: g.name })));
        });
    }

    const byPlayer = {};
    allEvents.forEach(e => {
        if (!byPlayer[e.player]) byPlayer[e.player] = { total: 0, byType: {} };
        byPlayer[e.player].total++;
        byPlayer[e.player].byType[e.type] = (byPlayer[e.player].byType[e.type] || 0) + 1;
    });

    const byType = {};
    allEvents.forEach(e => { byType[e.type] = (byType[e.type] || 0) + 1; });

    const byGame = {};
    games.forEach(g => {
        const evs = fs.existsSync(gameEventsFile(g.id)) ? readJSON(gameEventsFile(g.id)) : [];
        byGame[g.id] = { name: g.name, date: g.date, total: evs.length };
    });

    res.json({ total: allEvents.length, byPlayer, byType, byGame, games: games.map(g => ({ id: g.id, name: g.name, date: g.date })) });
});

// ═══════════════════════════════════════════════════════════════════
//  PLAYERS & ACTIONS
// ═══════════════════════════════════════════════════════════════════

app.get('/players', (req, res) => res.json(readJSON(PLAYERS_FILE)));
app.post('/players', (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome inválido.' });
    const players = readJSON(PLAYERS_FILE);
    if (players.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) return res.status(409).json({ error: 'Já existe.' });
    const player = { id: Date.now(), name: name.trim() };
    players.push(player);
    writeJSON(PLAYERS_FILE, players);
    res.status(201).json(player);
});
app.delete('/players/:id', (req, res) => {
    const players  = readJSON(PLAYERS_FILE);
    const filtered = players.filter(p => p.id !== parseInt(req.params.id));
    if (filtered.length === players.length) return res.status(404).json({ error: 'Não encontrado.' });
    writeJSON(PLAYERS_FILE, filtered);
    res.json({ message: 'Removido.' });
});

app.get('/actions', (req, res) => res.json([...DEFAULT_ACTIONS, ...readJSON(ACTIONS_FILE)]));
app.post('/actions', (req, res) => {
    const { label, emoji } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: 'Label obrigatório.' });
    const custom = readJSON(ACTIONS_FILE);
    if ([...DEFAULT_ACTIONS, ...custom].some(a => a.label.toLowerCase() === label.trim().toLowerCase())) return res.status(409).json({ error: 'Já existe.' });
    const colors = ['#26a69a','#7e57c2','#ef5350','#29b6f6','#66bb6a','#ffa726','#ec407a','#8d6e63','#78909c','#d4e157'];
    const action = { id: `custom_${Date.now()}`, label: label.trim(), emoji: emoji?.trim() || '🏷️', color: colors[Math.floor(Math.random() * colors.length)], builtin: false };
    custom.push(action);
    writeJSON(ACTIONS_FILE, custom);
    res.status(201).json(action);
});
app.delete('/actions/:id', (req, res) => {
    const custom   = readJSON(ACTIONS_FILE);
    const filtered = custom.filter(a => a.id !== req.params.id);
    if (filtered.length === custom.length) return res.status(404).json({ error: 'Não encontrada.' });
    writeJSON(ACTIONS_FILE, filtered);
    res.json({ message: 'Removida.' });
});

// ═══════════════════════════════════════════════════════════════════
//  CLIPS
// ═══════════════════════════════════════════════════════════════════

const CLIP_BEFORE = 5, CLIP_AFTER = 10;

function ffmpegSafe(input, start, duration, outPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(input).setStartTime(start).setDuration(duration)
            .videoCodec('libx264').outputOptions(['-profile:v baseline','-level:v 3.0','-pix_fmt yuv420p','-preset fast','-crf 23'])
            .audioCodec('aac').outputOptions(['-b:a 128k','-movflags +faststart','-avoid_negative_ts make_zero'])
            .save(outPath).on('end', resolve).on('error', (e) => { console.error('FFmpeg:', e.message); reject(e); });
    });
}

app.post('/games/:gameId/clips/export', async (req, res) => {
    const { gameId } = req.params;
    const ev  = readJSON(gameEventsFile(gameId)).find(e => e.id === req.body.eventId);
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado.' });
    const vp  = getVideoPath(gameId);
    if (!vp)  return res.status(400).json({ error: 'Vídeo não encontrado.' });
    const name = `clip_${gameId}_${ev.player.replace(/\s+/g,'_')}_${ev.type.replace(/\s+/g,'_')}_${Math.floor(ev.time)}s_${Date.now()}.mp4`;
    const out  = path.join(CLIPS_DIR, name);
    try { await ffmpegSafe(vp, Math.max(0, ev.time - CLIP_BEFORE), CLIP_BEFORE + CLIP_AFTER, out); res.json({ url: `/clips/${name}`, filename: name }); }
    catch { res.status(500).json({ error: 'Erro FFmpeg.' }); }
});

app.post('/games/:gameId/clips/export-all', async (req, res) => {
    const { gameId } = req.params;
    const events = readJSON(gameEventsFile(gameId));
    const vp     = getVideoPath(gameId);
    if (!vp || !events.length) return res.status(400).json({ error: 'Sem vídeo ou eventos.' });
    res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive');
    const results = [];
    for (let i = 0; i < events.length; i++) {
        const ev   = events[i];
        const name = `clip_${gameId}_${ev.player.replace(/\s+/g,'_')}_${ev.type.replace(/\s+/g,'_')}_${Math.floor(ev.time)}s_${Date.now()}.mp4`;
        const out  = path.join(CLIPS_DIR, name);
        res.write(`data: ${JSON.stringify({ progress: i, total: events.length, event: ev })}\n\n`);
        try { await ffmpegSafe(vp, Math.max(0, ev.time - CLIP_BEFORE), CLIP_BEFORE + CLIP_AFTER, out); results.push({ event: ev, url: `/clips/${name}`, filename: name, ok: true }); }
        catch (e) { results.push({ event: ev, ok: false, error: e.message }); }
    }
    res.write(`data: ${JSON.stringify({ done: true, results })}\n\n`); res.end();
});

app.get('/clips', (req, res) => {
    if (!fs.existsSync(CLIPS_DIR)) return res.json([]);
    res.json(fs.readdirSync(CLIPS_DIR).filter(f => f.endsWith('.mp4')).map(f => ({ filename: f, url: `/clips/${f}` })));
});
app.delete('/clips/:filename', (req, res) => {
    const fp = path.join(CLIPS_DIR, req.params.filename);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Não encontrado.' });
    fs.unlinkSync(fp); res.json({ message: 'Apagado.' });
});

// ─── Start ─────────────────────────────────────────────────────────
ensureDirs();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ CoachTag v3 → http://localhost:${PORT}`));
