import WebSocket from 'ws';
import { decode } from 'querystring';
import { Player } from './model.js'
import { MAP_TILES } from './map.js';

const wss = new WebSocket.Server({ port: process.env.PORT || 12000 })

const MAX_PLAYERS = 256;
const availableIDs = Array(MAX_PLAYERS).fill().map((_,i) => i);

const players = new Set();
const hasMouse = {};
const scores = {};
const names = {};

let mousex = 54;
let mousey = 41;

function broadcast(packet) {
  for (const socket of wss.clients) {
    socket.send(packet)
  }
}

const padMessages = {
  100: isDog => isDog ? 'Woof Woof Woof!' : "I'm in the mush room!",
  101: isDog => isDog ? 'Woof Woof Woof!' : "I'm by the fountain!",
  102: isDog => isDog ? 'Woof Woof Woof!' : "I found treasure!",
  103: isDog => isDog ? 'Woof Woof Woof!' : "Meet me in the alley!",
  104: isDog => isDog ? 'Woof! Woof Woof Woof!' : "Meow Meow Meow!",
}

wss.on('connection', function connection(ws, request) {
  const name = new URL(request.url, 'https://example.org').searchParams.get('name');
  if (!name) {
    ws.close(4400, 'missing name');
    return;
  }
  if (!name.match(/^\w{1,16}$/g)) {
    ws.close(4400, 'invalid name');
    return;
  }
  if (players.size === MAX_PLAYERS) {
    ws.close(4509, "Too many players online")
    return;
  }

  const player = new Player(availableIDs.pop());
  players.add(player);
  hasMouse[player.id] = false;
  scores[player.id] = 0;
  names[player.id] = name;

  function broadcastSelfToAllPlayers() {
    const buffer = Buffer.alloc(4);
    buffer.writeInt32BE(player.toInt32())
    broadcast(buffer);
  }
  
  ws.on('pong', () => ws.isAlive = true)

  ws.on('message', (data) => {
    if (data instanceof Buffer) {
      try {
        if (data.length !== 3) {
          throw new Error('Buffer should be 3 bytes')
        }
        if (data[2] < 0 || data[2] > 3) {
          throw new Error('Invalid direction')
        }
        if (data[0] !== player.x || data[1] !== player.y) {
          ws.send('invalid invalid')
          return;
        }
        const moved = player.move(data[2], players)
        if (!moved) {
          ws.send('invalid invalid')
          return;
        }
        const tileAt = MAP_TILES[player.y][player.x];
        if (player.x === mousex && player.y === mousey && !hasMouse[player.id]) {
          do {
            mousex = 20 + Math.random() * 60 | 0;
            mousey = 12 + Math.random() * 36 | 0;
          } while (MAP_TILES[mousey][mousex] !== 0)
          console.log(`mouse moved to ${mousex}, ${mousey}`)
          broadcast(`mouse [${mousex},${mousey}]`)
          hasMouse[player.id] = true;
          ws.send('hasmouse true')
        } else if (player.isAtDoorstep() && hasMouse[player.id]) {
          hasMouse[player.id] = false;
          scores[player.id]++;
          ws.send('hasmouse false')
          broadcast(`score {"id":${player.id},"score":${scores[player.id]},"cat":true}`)
        } else if (padMessages[tileAt]) {
          const msg = `-= BROADCAST FROM ${names[player.id].toLocaleUpperCase()}: ${padMessages[tileAt](player.isDog)} =-`
          broadcast(`pad-message ${msg}`)
        }
        broadcastSelfToAllPlayers();
      } catch (err) {
        ws.close(4400, err.message)
      }
    } else {
      broadcast(`${player.id} ${data}`);
      player.applyChatMessage(data);
    }
  })

  ws.once('close', () => {
    players.delete(player);
    availableIDs.push(player.id)
    const buffer = Buffer.alloc(4);
    buffer.writeInt32BE(player.toDeletedInt32())
    broadcast(buffer)
    broadcast(`join-message [ ${names[player.id].toLocaleUpperCase()} LEFT THE GAME ]`)
  });

  const firstPayload = Buffer.alloc(players.size * 4)
  for (let i = 0, playerIterator = players.values(); i < players.size; ++i) {
    firstPayload.writeInt32BE(playerIterator.next().value.toInt32(), i * 4);
  }
  ws.send(`id ${player.id}`)
  ws.send(`names ${JSON.stringify(names)}`);
  ws.send(firstPayload)
  ws.send(`mouse [${mousex},${mousey}]`)
  broadcast(`join-message [ ${names[player.id].toLocaleUpperCase()} ENTERED THE GAME ]`)
  broadcast(`names ${JSON.stringify({ [player.id]: name })}`);

  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(player.toInt32())
  for (const socket of wss.clients) {
    if (socket !== ws) socket.send(buffer)
  }
});

setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      socket.terminate();
    } else {
      socket.isAlive = false;
      socket.ping()
    }
  }
}, 30 * 1000); // heroku kills connections after 55 seconds of inactivity
