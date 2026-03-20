const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');

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
const DATA_DIR    = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const CLIPS_DIR   = path.join(__dirname, 'public', 'clips');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const VIDEO_META  = path.join(DATA_DIR, 'video.json');

// ─── Bootstrap dirs & files ────────────────────────────────────────
function ensureDirs() {
    [DATA_DIR, UPLOADS_DIR, CLIPS_DIR].forEach(d => {
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });
    if (!fs.existsSync(EVENTS_FILE))  fs.writeFileSync(EVENTS_FILE, '[]');
    if (!fs.existsSync(VIDEO_META))   fs.writeFileSync(VIDEO_META, 'null');
    if (!fs.existsSync(PLAYERS_FILE)) {
        fs.writeFileSync(PLAYERS_FILE, JSON.stringify([
            { id: 1, name: 'João' },
            { id: 2, name: 'Miguel' },
            { id: 3, name: 'Rita' }
        ], null, 2));
    }
}

// ─── JSON helpers ──────────────────────────────────────────────────
function readJSON(file)       { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; } }
function writeJSON(file, data){ fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// ─── Multer — video upload ─────────────────────────────────────────
const videoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename:    (req, file, cb) => {
        // Always save as game.<ext> so we always know where it is
        const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
        cb(null, `game${ext}`);
    }
});

const upload = multer({
    storage: videoStorage,
    limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4 GB
    fileFilter: (req, file, cb) => {
        const allowed = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error('Formato não suportado. Usa MP4, MOV, AVI, MKV ou WebM.'));
    }
});

// ─── Video ─────────────────────────────────────────────────────────

// Upload video
app.post('/video/upload', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro enviado.' });

    const meta = {
        originalName: req.file.originalname,
        filename:     req.file.filename,
        size:         req.file.size,
        uploadedAt:   new Date().toISOString()
    };
    writeJSON(VIDEO_META, meta);

    // Clear existing events when new video is uploaded
    writeJSON(EVENTS_FILE, []);

    res.json({ ...meta, url: `/video/stream` });
});

// Stream the uploaded video
app.get('/video/stream', (req, res) => {
    const meta = readJSON(VIDEO_META);
    if (!meta || !meta.filename) return res.status(404).json({ error: 'Nenhum vídeo carregado.' });

    const filePath = path.join(UPLOADS_DIR, meta.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Ficheiro não encontrado.' });

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end   = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        res.writeHead(206, {
            'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges':  'bytes',
            'Content-Length': chunkSize,
            'Content-Type':   'video/mp4'
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type':   'video/mp4'
        });
        fs.createReadStream(filePath).pipe(res);
    }
});

// Get video metadata
app.get('/video/meta', (req, res) => {
    const meta = readJSON(VIDEO_META);
    res.json(meta || null);
});

// ─── Players ───────────────────────────────────────────────────────
app.get('/players', (req, res) => res.json(readJSON(PLAYERS_FILE)));

app.post('/players', (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome inválido.' });

    const players = readJSON(PLAYERS_FILE);
    if (players.some(p => p.name.toLowerCase() === name.trim().toLowerCase()))
        return res.status(409).json({ error: 'Jogador já existe.' });

    const player = { id: Date.now(), name: name.trim() };
    players.push(player);
    writeJSON(PLAYERS_FILE, players);
    res.status(201).json(player);
});

app.delete('/players/:id', (req, res) => {
    const players = readJSON(PLAYERS_FILE);
    const filtered = players.filter(p => p.id !== parseInt(req.params.id));
    if (filtered.length === players.length) return res.status(404).json({ error: 'Não encontrado.' });
    writeJSON(PLAYERS_FILE, filtered);
    res.json({ message: 'Removido.' });
});

// ─── Events ────────────────────────────────────────────────────────
app.get('/events', (req, res) => res.json(readJSON(EVENTS_FILE)));

app.post('/events', (req, res) => {
    const { type, player, time } = req.body;
    if (!type || !player || typeof time !== 'number')
        return res.status(400).json({ error: 'Dados inválidos.' });

    const events = readJSON(EVENTS_FILE);
    const ev = { id: Date.now(), type, player, time };
    events.push(ev);
    writeJSON(EVENTS_FILE, events);
    res.status(201).json(ev);
});

app.put('/events/:id', (req, res) => {
    const events = readJSON(EVENTS_FILE);
    const idx = events.findIndex(e => e.id === parseInt(req.params.id));
    if (idx === -1) return res.status(404).json({ error: 'Não encontrado.' });

    const { type, player } = req.body;
    if (type)   events[idx].type = type;
    if (player) events[idx].player = player;
    writeJSON(EVENTS_FILE, events);
    res.json(events[idx]);
});

app.delete('/events/:id', (req, res) => {
    const events = readJSON(EVENTS_FILE);
    const filtered = events.filter(e => e.id !== parseInt(req.params.id));
    if (filtered.length === events.length) return res.status(404).json({ error: 'Não encontrado.' });
    writeJSON(EVENTS_FILE, filtered);
    res.json({ message: 'Removido.' });
});

// Export all events as CSV
app.get('/events/export', (req, res) => {
    const events = readJSON(EVENTS_FILE);
    const csv = 'id,jogador,tipo,tempo_segundos\n' +
        events.map(e => `${e.id},"${e.player}","${e.type}",${e.time.toFixed(2)}`).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="eventos.csv"');
    res.send(csv);
});

// ─── Clip Export ───────────────────────────────────────────────────
// Clip duration config: X seconds before and after the event timestamp
const CLIP_BEFORE = 5;  // seconds before event
const CLIP_AFTER  = 10; // seconds after event

app.post('/clips/export', async (req, res) => {
    const { eventId } = req.body;

    // Find event
    const events = readJSON(EVENTS_FILE);
    const ev = events.find(e => e.id === eventId);
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado.' });

    // Find video
    const meta = readJSON(VIDEO_META);
    if (!meta?.filename) return res.status(400).json({ error: 'Nenhum vídeo carregado.' });
    const videoPath = path.join(UPLOADS_DIR, meta.filename);
    if (!fs.existsSync(videoPath)) return res.status(404).json({ error: 'Vídeo não encontrado.' });

    const start    = Math.max(0, ev.time - CLIP_BEFORE);
    const duration = CLIP_BEFORE + CLIP_AFTER;
    const safeName = `clip_${ev.player.replace(/\s+/g, '_')}_${ev.type}_${Math.floor(ev.time)}s_${Date.now()}.mp4`;
    const outPath  = path.join(CLIPS_DIR, safeName);

    try {
        await new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .setStartTime(start)
                .setDuration(duration)
                .outputOptions([
                    '-c:v libx264',
                    '-preset fast',
                    '-crf 23',
                    '-c:a aac',
                    '-movflags +faststart'
                ])
                .save(outPath)
                .on('end', resolve)
                .on('error', reject);
        });

        res.json({ url: `/clips/${safeName}`, filename: safeName });
    } catch (err) {
        console.error('FFmpeg error:', err.message);
        res.status(500).json({ error: 'Erro ao exportar clip.' });
    }
});

// Export ALL events as individual clips (batch)
app.post('/clips/export-all', async (req, res) => {
    const events = readJSON(EVENTS_FILE);
    const meta   = readJSON(VIDEO_META);

    if (!meta?.filename) return res.status(400).json({ error: 'Nenhum vídeo carregado.' });
    const videoPath = path.join(UPLOADS_DIR, meta.filename);
    if (!fs.existsSync(videoPath)) return res.status(404).json({ error: 'Vídeo não encontrado.' });
    if (events.length === 0) return res.status(400).json({ error: 'Sem eventos para exportar.' });

    // Stream progress back via SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const results = [];

    for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const start    = Math.max(0, ev.time - CLIP_BEFORE);
        const duration = CLIP_BEFORE + CLIP_AFTER;
        const safeName = `clip_${ev.player.replace(/\s+/g, '_')}_${ev.type}_${Math.floor(ev.time)}s_${Date.now()}.mp4`;
        const outPath  = path.join(CLIPS_DIR, safeName);

        res.write(`data: ${JSON.stringify({ progress: i, total: events.length, event: ev })}\n\n`);

        try {
            await new Promise((resolve, reject) => {
                ffmpeg(videoPath)
                    .setStartTime(start)
                    .setDuration(duration)
                    .outputOptions(['-c:v libx264', '-preset fast', '-crf 23', '-c:a aac', '-movflags +faststart'])
                    .save(outPath)
                    .on('end', resolve)
                    .on('error', reject);
            });
            results.push({ event: ev, url: `/clips/${safeName}`, filename: safeName, ok: true });
        } catch (err) {
            results.push({ event: ev, ok: false, error: err.message });
        }
    }

    res.write(`data: ${JSON.stringify({ done: true, results })}\n\n`);
    res.end();
});

// List existing clips
app.get('/clips', (req, res) => {
    if (!fs.existsSync(CLIPS_DIR)) return res.json([]);
    const files = fs.readdirSync(CLIPS_DIR).filter(f => f.endsWith('.mp4'));
    res.json(files.map(f => ({ filename: f, url: `/clips/${f}` })));
});

// Delete a clip
app.delete('/clips/:filename', (req, res) => {
    const filePath = path.join(CLIPS_DIR, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Clip não encontrado.' });
    fs.unlinkSync(filePath);
    res.json({ message: 'Clip apagado.' });
});

// ─── Start ─────────────────────────────────────────────────────────
ensureDirs();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ CoachTag v2 → http://localhost:${PORT}`));
