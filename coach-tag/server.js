const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static('public'));

// Caminhos seguros (IMPORTANTE para o Render)
const EVENTS_FILE = path.join(__dirname, 'data/events.json');
const PLAYERS_FILE = path.join(__dirname, 'data/players.json');

// ===== FUNÇÕES =====
function readJSON(file) {
    try {
        const data = fs.readFileSync(file);
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ===== ROUTES =====

// Players
app.get('/players', (req, res) => {
    res.json(readJSON(PLAYERS_FILE));
});

// Events
app.get('/events', (req, res) => {
    res.json(readJSON(EVENTS_FILE));
});

app.post('/events', (req, res) => {
    const events = readJSON(EVENTS_FILE);

    const newEvent = {
        id: Date.now(),
        ...req.body
    };

    events.push(newEvent);
    writeJSON(EVENTS_FILE, events);

    res.json(newEvent);
});

app.put('/events/:id', (req, res) => {
    const events = readJSON(EVENTS_FILE);
    const id = parseInt(req.params.id);

    const updated = events.map(e =>
        e.id === id ? { ...e, ...req.body } : e
    );

    writeJSON(EVENTS_FILE, updated);

    res.json({ message: 'Evento atualizado' });
});

app.delete('/events/:id', (req, res) => {
    const events = readJSON(EVENTS_FILE);
    const id = parseInt(req.params.id);

    const filtered = events.filter(e => e.id !== id);

    writeJSON(EVENTS_FILE, filtered);

    res.json({ message: 'Evento removido' });
});

// ===== PORTA CORRETA (CRÍTICO PARA RENDER) =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor a correr na porta ${PORT}`);
});
