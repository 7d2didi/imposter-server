const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const wss = new WebSocket.Server({ port: 8080 }, () => {
  console.log('✅ WebSocket server running on ws://localhost:8080');
});

const rooms = {};

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const msg = JSON.parse(message);

    // Spieler betritt Raum
    if (msg.type === 'join') {
      const room = msg.room.toUpperCase();
      if (!rooms[room]) {
        rooms[room] = {
          players: [],
          gameStarted: false,
          imposter: null,
          word: '',
          turnIndex: 0,
          turns: [],
          votes: {},
          phase: 'lobby',
          order: []
        };
      }

      const player = {
        id: uuidv4(),
        name: msg.name,
        ws: ws,
        word: '',
        isImposter: false
      };

      rooms[room].players.push(player);
      ws.playerId = player.id;
      ws.room = room;

      sendLobbyUpdate(room);
    }

    // Spiel starten
    if (msg.type === 'start') {
      const room = rooms[ws.room];
      if (!room || room.gameStarted) return;

      room.gameStarted = true;
      room.word = getRandomWord();
      room.phase = 'turns';
      room.turnIndex = 0;
      room.turns = [];
      room.votes = {};
      room.order = shuffleArray(room.players.map(p => p.id));

      const imposterId = room.order[Math.floor(Math.random() * room.order.length)];
      room.imposter = imposterId;

      for (const p of room.players) {
        p.isImposter = p.id === imposterId;
        const word = p.isImposter ? '???' : room.word;
        p.ws.send(JSON.stringify({
          type: 'gameStart',
          word: word,
          yourId: p.id,
          order: room.order.map(id => getPlayerName(room, id)),
          currentTurn: getPlayerName(room, room.order[0])
        }));
      }
    }

    // Spieler gibt ein Wort ab
    if (msg.type === 'submitWord') {
      const room = rooms[ws.room];
      const player = getPlayerById(room, msg.playerId);
      if (!room || !player || room.order[room.turnIndex] !== msg.playerId) return;

      room.turns.push({ name: player.name, word: msg.word });
      room.turnIndex++;

      if (room.turnIndex >= room.order.length) {
        // Runde vorbei
        room.phase = 'decision';
        broadcast(room, {
          type: 'turnUpdate',
          turns: room.turns,
          allowVoting: true
        });
      } else {
        // Nächster Spieler ist dran
        broadcast(room, {
          type: 'turnUpdate',
          turns: room.turns,
          currentTurn: getPlayerName(room, room.order[room.turnIndex])
        });
      }
    }

    // Spieler stimmt ab
    if (msg.type === 'vote') {
      const room = rooms[ws.room];
      if (!room || !room.gameStarted || room.phase !== 'decision') return;
      room.votes[msg.targetName] = (room.votes[msg.targetName] || 0) + 1;

      const votesReceived = Object.keys(room.votes).length;
      if (votesReceived >= room.players.length) {
        const votedOut = Object.entries(room.votes).sort((a, b) => b[1] - a[1])[0][0];
        const imposterName = getPlayerName(room, room.imposter);
        const imposterCaught = votedOut === imposterName;

        broadcast(room, {
          type: 'gameOver',
          imposter: imposterCaught,
          realImposter: imposterName
        });

        room.phase = 'done';
      }
    }

    // Spieler wählt "nächste Runde spielen"
    if (msg.type === 'nextRound') {
      const room = rooms[ws.room];
      if (!room || room.phase !== 'decision') return;

      room.phase = 'turns';
      room.turnIndex = 0;
      room.turns = [];
      broadcast(room, {
        type: 'turnUpdate',
        turns: [],
        currentTurn: getPlayerName(room, room.order[0])
      });
    }
  });
});

// 📦 Hilfsfunktionen

function sendLobbyUpdate(roomCode) {
  const room = rooms[roomCode];
  const names = room.players.map(p => p.name);
  room.players.forEach(p => {
    p.ws.send(JSON.stringify({ type: 'lobbyUpdate', players: names }));
  });
}

function broadcast(room, message) {
  const json = JSON.stringify(message);
  room.players.forEach(p => p.ws.send(json));
}

function getPlayerById(room, id) {
  return room.players.find(p => p.id === id);
}

function getPlayerName(room, id) {
  const player = getPlayerById(room, id);
  return player ? player.name : 'Unbekannt';
}

function getRandomWord() {
  const words = ['Kaktus', 'Flugzeug', 'Banane', 'Buch', 'Spinne', 'Trompete', 'Schneemann'];
  return words[Math.floor(Math.random() * words.length)];
}

function shuffleArray(array) {
  return array.sort(() => Math.random() - 0.5);
}
