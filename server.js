// server.js (Node.js WebSocket Server for Imposter Word Game)

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const wss = new WebSocket.Server({ port: 8080 });

const games = {}; // { roomCode: { players: [], word, imposterId, phase, turns, votes } }

function broadcast(room, data) {
  games[room].players.forEach(p => {
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify(data));
    }
  });
}

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'join') {
        const { name, room } = data;
        if (!games[room]) {
          games[room] = {
            players: [],
            word: '',
            imposterId: null,
            phase: 'lobby',
            turns: [],
            votes: {},
          };
        }
        const player = { id: uuidv4(), name, ws, isImposter: false };
        games[room].players.push(player);
        ws.playerId = player.id;
        ws.roomCode = room;
        broadcast(room, { type: 'lobbyUpdate', players: games[room].players.map(p => p.name) });

      } else if (data.type === 'start') {
        const room = ws.roomCode;
        const game = games[room];
        game.word = ['Apfel', 'Haus', 'Ball', 'Pferd'][Math.floor(Math.random() * 4)];
        const imposter = game.players[Math.floor(Math.random() * game.players.length)];
        game.imposterId = imposter.id;
        game.phase = 'playing';
        game.turns = [];
        game.votes = {};

        game.players.forEach(p => {
          const payload = {
            type: 'gameStart',
            word: p.id === game.imposterId ? '???' : game.word,
            yourId: p.id,
            order: game.players.map(pl => pl.id),
          };
          p.ws.send(JSON.stringify(payload));
        });

      } else if (data.type === 'submitWord') {
        const room = ws.roomCode;
        const game = games[room];
        game.turns.push({ playerId: data.playerId, word: data.word });
        broadcast(room, { type: 'turnUpdate', turns: game.turns });

      } else if (data.type === 'vote') {
        const room = ws.roomCode;
        const game = games[room];
        game.votes[data.targetId] = (game.votes[data.targetId] || 0) + 1;
        if (Object.keys(game.votes).length === game.players.length) {
          const sorted = Object.entries(game.votes).sort((a, b) => b[1] - a[1]);
          const [suspectId] = sorted[0];
          const imposter = suspectId === game.imposterId;
          broadcast(room, { type: 'gameOver', imposter, realImposter: game.players.find(p => p.id === game.imposterId).name });
        }
      }
    } catch (e) {
      console.error('Invalid message', e);
    }
  });
});

console.log('WebSocket server running on ws://localhost:8080');
