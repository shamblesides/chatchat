import WebSocket from 'ws';
import { Player } from './stuff.js'

const wss = new WebSocket.Server({ port: 12000 })

const MAX_PLAYERS = 256;
const availableIDs = Array(MAX_PLAYERS).fill().map((_,i) => i);

const players = new Set();

wss.on('connection', function connection(ws, request) {
  if (players.size === MAX_PLAYERS) {
    ws.close(4509, "Too many players online")
    return;
  }

  const player = new Player(availableIDs.pop());
  players.add(player);

  function broadcast(packet) {
    for (const socket of wss.clients) {
      if (socket !== ws) socket.send(packet)
    }
  }

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
        if (data[0] !== player.x || data[1] !== player.y) {
          throw new Error('Player location was wrong')
        }
        if (data[2] < 0 || data[2] > 3) {
          throw new Error('Invalid direction')
        }
        const moved = player.move(data[2])
        if (!moved) {
          throw new Error('received move that would not make me move')
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
    for (const socket of wss.clients) {
      if (socket !== ws) socket.send(buffer)
    }
  });

  const firstPayload = Buffer.alloc(players.size * 4)
  for (let i = 0, playerIterator = players.values(); i < players.size; ++i) {
    firstPayload.writeInt32BE(playerIterator.next().value.toInt32(), i * 4);
  }
  ws.send(new Uint8Array([player.id]))
  ws.send(firstPayload)

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
