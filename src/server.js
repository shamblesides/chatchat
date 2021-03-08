import http from 'http';
import WebSocket from 'ws';
import { Player } from './model.js'
import { MAP_TILES } from './map.js';

const MAX_PLAYERS = 256;

const PAD_MESSAGES = {
  100: isDog => isDog ? 'Woof Woof Woof!' : "I'm in the mush room!",
  101: isDog => isDog ? 'Woof Woof Woof!' : "I'm by the fountain!",
  102: isDog => isDog ? 'Woof Woof Woof!' : "I found treasure!",
  103: isDog => isDog ? 'Woof Woof Woof!' : "Meet me in the alley!",
  104: isDog => isDog ? 'Woof! Woof Woof Woof!' : "Meow Meow Meow!",
}

class Room {
  constructor (name) {
    this.name = name;
    this.availableIDs = Array(MAX_PLAYERS).fill().map((_,i) => i);
    this.players = new Set();
    this.hasMouse = {};
    this.scores = {};
    this.names = {};
    this.mousex = 54;
    this.mousey = 41;
  }
}

const rooms = [new Room("Default room")]

const hserv = http.createServer(function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')

  if (req.method === 'OPTIONS') {
    res.end()
  } else if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(rooms.map(r => ({ name: r.name, cats: r.players.size }))))
  } else if (req.method === 'POST') {
    res.end();
  }
})

const wss = new WebSocket.Server({ noServer: true })
hserv.on('upgrade', function (request, sock, head) {
  const room = rooms[0];
  wss.handleUpgrade(request, sock, head, (ws) => {
    wss.emit('connection', ws, request)
    const params = new URL(request.url, 'https://example.org').searchParams;
    const name = params.get('name');
    room.accept(ws, name)
  });
})


Room.prototype.broadcast = function broadcast(packet) {
  if (typeof packet === 'string') {
    console.log(packet)
  }
  for (const player of this.players) {
    player.socket.send(packet)
  }
}

Room.prototype.broadcastRoom = function broadcastRoom(sender, packet) {
  if (typeof packet === 'string') {
    console.log(packet)
  }
  for (const other of this.players) {
    if (sender.sameRoomAs(other)) {
      other.socket.send(packet)
    }
  }
}

Room.prototype.accept = function accept (ws, name) {
  if (!name) {
    ws.close(4400, 'missing name');
    return;
  }
  if (!name.match(/^\w{1,16}$/g)) {
    ws.close(4400, 'invalid name');
    return;
  }
  for (const other of this.players) {
    if (this.names[other.id] === name) {
      ws.close(4400, 'That name is already taken');
      return;
    }
  }
  if (this.players.size === MAX_PLAYERS) {
    ws.close(4509, "Too many players online")
    return;
  }

  const player = new Player(this.availableIDs.pop());
  player.socket = ws;
  this.players.add(player);
  this.hasMouse[player.id] = false;
  this.scores[player.id] = 0;
  this.names[player.id] = name;

  const broadcastSelfToAllPlayers = () => {
    const buffer = Buffer.alloc(4);
    buffer.writeInt32BE(player.toInt32())
    this.broadcast(buffer);
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
        const oldState = player.copy();
        const moved = player.move(data[2], this.players)
        if (!moved) {
          ws.send('invalid invalid')
          return;
        } else if (!player.sameRoomAs(oldState)) {
          this.broadcastRoom(oldState, `move-message [ ${this.names[player.id]} left ${oldState.roomName()} ]`)
          this.broadcastRoom(player, `move-message [ ${this.names[player.id]} entered ${player.roomName()} ]`)
        }
        const tileAt = MAP_TILES[player.y][player.x];
        if (player.x === this.mousex && player.y === this.mousey && !this.hasMouse[player.id]) {
          do {
            this.mousex = 20 + Math.random() * 60 | 0;
            this.mousey = 12 + Math.random() * 36 | 0;
          } while (MAP_TILES[this.mousey][this.mousex] !== 0)
          this.broadcast(`mouse [${this.mousex},${this.mousey}]`)
          this.hasMouse[player.id] = true;
          ws.send('hasmouse true')
        } else if (player.isAtDoorstep() && this.hasMouse[player.id]) {
          this.hasMouse[player.id] = false;
          this.scores[player.id]++;
          ws.send('hasmouse false')
          this.broadcast(`score {"id":${player.id},"score":${this.scores[player.id]},"cat":true}`)
        } else if (PAD_MESSAGES[tileAt]) {
          const msg = `-= Broadcast from ${this.names[player.id]}: ${PAD_MESSAGES[tileAt](player.isDog)} =-`
          this.broadcast(`pad-message ${msg}`)
        }
        broadcastSelfToAllPlayers();
      } catch (err) {
        console.trace(err)
        ws.close(4400, err.message)
      }
    } else {
      if (data.length > 50) {
        return;
      }
      this.broadcastRoom(player, `${player.id} ${data}`);
      player.applyChatMessage(data);
    }
  })

  ws.once('close', () => {
    this.players.delete(player);
    this.availableIDs.push(player.id)
    const buffer = Buffer.alloc(4);
    buffer.writeInt32BE(player.toDeletedInt32())
    this.broadcast(buffer)
    this.broadcast(`join-message [ ${this.names[player.id]} left the game ]`)
  });

  const firstPayload = Buffer.alloc(this.players.size * 4)
  for (let i = 0, playerIterator = this.players.values(); i < this.players.size; ++i) {
    firstPayload.writeInt32BE(playerIterator.next().value.toInt32(), i * 4);
  }
  ws.send(`id ${player.id}`)
  ws.send(`names ${JSON.stringify(this.names)}`);
  ws.send(firstPayload)
  ws.send(`mouse [${this.mousex},${this.mousey}]`)
  this.broadcast(`join-message [ ${this.names[player.id]} entered the game ]`)
  this.broadcast(`names ${JSON.stringify({ [player.id]: name })}`);

  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(player.toInt32())
  for (const other of this.players) {
    if (player !== other) other.socket.send(buffer)
  }
};

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

const listener = hserv.listen(process.env.PORT || 12000, () => {
  const addr = listener.address();
  console.log(`chatchat: listening on port ${addr.port}`);
})
