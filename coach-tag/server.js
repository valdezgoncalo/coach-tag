const express = require('express');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const EVENTS_FILE = './data/events.json';
const PLAYERS_FILE = './data/players.json';

function readJSON(file) {
    return JSON.parse(fs.readFileSync(file));
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

app.get('/players', (req, res) => {
    res.json(readJSON(PLAYERS_FILE));
});

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

    res.json({ message: 'Atualizado' });
});

app.delete('/events/:id', (req, res) => {
    const events = readJSON(EVENTS_FILE);
    const id = parseInt(req.params.id);

    const filtered = events.filter(e => e.id !== id);

    writeJSON(EVENTS_FILE, filtered);

    res.json({ message: 'Removido' });
});

app.listen(3000, () => {
    console.log('http://localhost:3000');
});
