const video = document.getElementById('video');
const eventList = document.getElementById('eventList');
const playerSelect = document.getElementById('playerSelect');

async function loadPlayers() {
    const res = await fetch('/players');
    const players = await res.json();

    playerSelect.innerHTML = '';

    players.forEach(p => {
        const option = document.createElement('option');
        option.value = p.name;
        option.textContent = p.name;
        playerSelect.appendChild(option);
    });
}

async function tagEvent(type) {
    const event = {
        type: type,
        player: playerSelect.value,
        time: video.currentTime
    };

    await fetch('/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
    });

    loadEvents();
}

async function loadEvents() {
    const res = await fetch('/events');
    const events = await res.json();

    eventList.innerHTML = '';

    events.forEach(e => {
        const li = document.createElement('li');

        li.innerHTML = `
            ${e.player} - ${e.type} - ${e.time.toFixed(2)}s
            <button onclick="deleteEvent(${e.id})">❌</button>
            <button onclick="editEvent(${e.id})">✏️</button>
        `;

        eventList.appendChild(li);
    });
}

async function deleteEvent(id) {
    await fetch(`/events/${id}`, {
        method: 'DELETE'
    });

    loadEvents();
}

async function editEvent(id) {
    const newType = prompt('Novo tipo:');
    if (!newType) return;

    await fetch(`/events/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newType })
    });

    loadEvents();
}

loadPlayers();
loadEvents();
