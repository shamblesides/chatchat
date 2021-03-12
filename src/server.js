import http from 'http';
import WebSocket from 'ws';
import { Player } from './model.js'
import { MAP_TILES } from './map.js';

const MAX_ROOMS = 256;
const MAX_PLAYERS = 64;

const PAD_MESSAGES = {
  100: isDog => isDog ? 'Woof Woof Woof!' : "I'm in the mush room!",
  101: isDog => isDog ? 'Woof Woof Woof!' : "I'm by the fountain!",
  102: isDog => isDog ? 'Woof Woof Woof!' : "I found treasure!",
  103: isDog => isDog ? 'Woof Woof Woof!' : "Meet me in the alley!",
  104: isDog => isDog ? 'Woof! Woof Woof Woof!' : "Meow Meow Meow!",
}

function whitelistDogChat(msg) {
  return (msg.startsWith('/me ') || ['/bark', '/woof', '/pant', '/howl', '/nap'].includes(msg))
}

const availableRoomIDs = Array(MAX_ROOMS).fill().map((_,i) => i).reverse();

class Room {
  constructor (name) {
    this.id = availableRoomIDs.pop();
    this.name = name;
    this.availableIDs = Array(MAX_PLAYERS).fill().map((_,i) => i).reverse();
    this.players = new Set();
    this.hasMouse = {};
    this.scores = {};
    this.names = {};
    this.frozens = {};
    this.mousex = 54;
    this.mousey = 41;
  }
}

const rooms = [new Room("default_room")]

const hserv = http.createServer(function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST')
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-room-name')

  if (req.method === 'OPTIONS') {
    res.end()
  } else if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(rooms.map(r => ({ id: r.id, name: r.name, cats: r.players.size }))))
  } else if (req.method === 'POST') {
    const roomName = req.headers['x-room-name'];
    if (!roomName.match(/^\w{1,20}$/g)) {
      res.statusCode = 400;
      res.end("Invalid room name")
      return;
    }
    if (rooms.length >= MAX_ROOMS) {
      res.statusCode = 500;
      res.end("Server overloaded - too many rooms")
      return;
    }
    const room = new Room(roomName);
    rooms.push(room);
    res.setHeader('Content-Type', 'application/json');
    res.end(`{"id":${room.id}}`);
  }
})

const wss = new WebSocket.Server({ noServer: true })
hserv.on('upgrade', function (request, sock, head) {
  wss.handleUpgrade(request, sock, head, (ws) => {
    wss.emit('connection', ws, request)
    const params = new URL(request.url, 'https://example.org').searchParams;
    const name = params.get('name');
    const roomid = parseInt(params.get('roomid'));
    const room = rooms.find(room => room.id === roomid);
    if (!room) {
      ws.close(4400, `Could not find room ${roomid}`)
      return;
    }
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

Room.prototype.broadcastPlayer = function broadcastPlayer (player) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(player.toInt32())
  this.broadcast(buffer);
}
  
Room.prototype.accept = function accept (ws, name) {
  if (!name) {
    ws.close(4400, 'missing name');
    return;
  }
  if (!name.match(/^\w{1,10}$/g)) {
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

  let spamScore = 0;
  const handle = setInterval(() => spamScore = Math.max(spamScore - 1, 0), 1000);
  ws.on('close', () => clearInterval(handle));

  let padSpamCooldown = 0;
  let foundMouseSpamCooldown = 0;

  ws.on('pong', () => ws.isAlive = true)

  ws.on('message', (data) => {
    if (data instanceof Buffer) {
      if (this.frozens[player.id]) {
        ws.send('invalid invalid')
        return;
      }
      try {
        if (data.length !== 4) {
          throw new Error('Buffer should be 4 bytes')
        }
        if (data[2] < 0 || data[2] > 3) {
          throw new Error('Invalid direction')
        }
        if (data[0] !== player.x || data[1] !== player.y) {
          ws.send('invalid invalid')
          return;
        }
        const faceOnly = !!data[3]
        const oldState = player.copy();
        const { updated, target } = player.move(data[2], this.players, faceOnly)
        if (!updated && !target) {
          ws.send('invalid invalid')
          return;
        }
        if (!player.sameRoomAs(oldState)) {
          this.broadcastRoom(oldState, `move-message [ ${this.names[player.id]} left ${oldState.roomName()} ]`)
          this.broadcastRoom(player, `move-message [ ${this.names[player.id]} entered ${player.roomName()} ]`)
        }
        const tileAt = MAP_TILES[player.y][player.x];
        if (target && player.isDog && !target.isDog) {
          player.isDog = false;
          target.isDog = true;
          // broadcast target here; but as for me, I will be broadcasted later in this func
          this.broadcastPlayer(target);
          this.broadcast(`join-message [ ${this.names[player.id]} caught ${this.names[target.id]}! ${this.names[target.id]} is a dog now ]`)
          target.socket.send('frozen true')
          this.frozens[target.id] = true;
          setTimeout(() => this.frozens[target.id] = false, 5000)
        } else if (player.x === this.mousex && player.y === this.mousey) {
          if(this.hasMouse[player.id]) {
            if (foundMouseSpamCooldown < Date.now() - 5000) {
              foundMouseSpamCooldown = Date.now();
              this.broadcast(`move-message [ ${this.names[player.id]} found a mouse - but already has one! ]`)
            }
          } else {
            do {
              this.mousex = 20 + Math.random() * 60 | 0;
              this.mousey = 12 + Math.random() * 36 | 0;
            } while (MAP_TILES[this.mousey][this.mousex] !== 0)
            this.broadcast(`move-message [ ${this.names[player.id]} found a mouse! ]`)
            this.broadcast(`mouse [${this.mousex},${this.mousey}]`)
            this.hasMouse[player.id] = true;
            ws.send('hasmouse true')
          }
        } else if (player.isAtDoorstep() && this.hasMouse[player.id]) {
          const transformed = player.isDog;
          player.isDog = false;
          this.hasMouse[player.id] = false;
          ws.send('hasmouse false')
          this.broadcastRoom(player, `dropoff {"isDog":${player.isDog},"transformed":${transformed}}`)
          if (transformed) {
            this.broadcast(`join-message [ ${this.names[player.id]} is a cat now ]`)
          } else {
            this.scores[player.id]++;
            this.broadcast(`join-message [ ${this.names[player.id]} left a present at the house! SCORE: ${this.scores[player.id]} ]`)
          }
        } else if (player.isAtDogAltar() && this.hasMouse[player.id]) {
          const transformed = !player.isDog;
          player.isDog = true;
          this.hasMouse[player.id] = false;
          ws.send('hasmouse false')
          this.broadcastRoom(player, `dropoff {"isDog":${player.isDog},"transformed":${transformed}}`)
          if (transformed) {
            this.broadcast(`join-message [ ${this.names[player.id]} is a dog now ]`)
          } else {
            this.scores[player.id]++;
            this.broadcast(`join-message [ ${this.names[player.id]} left a present at the altar! SCORE: ${this.scores[player.id]} ]`)
          }
        } else if (PAD_MESSAGES[tileAt]) {
          if (padSpamCooldown < Date.now() - 5000) {
            padSpamCooldown = Date.now();
            const msg = `-= Broadcast from ${this.names[player.id]}: ${PAD_MESSAGES[tileAt](player.isDog)} =-`
            this.broadcast(`pad-message ${msg}`)
          }
        }
        this.broadcastPlayer(player);
      } catch (err) {
        console.trace(err)
        ws.close(4400, err.message)
      }
    } else {
      if (data.length > 50) {
        return;
      }
      spamScore++;
      if (spamScore > 10) {
        ws.close(4400, "Too many messages!")
        return;
      }
      const words = (player.isDog && !whitelistDogChat(data)) ? 'woof '.repeat([2,3,3,4][Math.random()*4|0]).trim() : data;
      this.broadcastRoom(player, `${player.id} ${words}`);
      player.applyChatMessage(data);
    }
  })

  ws.once('close', () => {
    this.players.delete(player);
    if (this.players.size === 0) {
      if (this.id !== 0) {
        rooms.splice(rooms.indexOf(this), 1);
        availableRoomIDs.push(this.id);
      }
    } else {
      this.availableIDs.push(player.id)
      const buffer = Buffer.alloc(4);
      buffer.writeInt32BE(player.toDeletedInt32())
      this.broadcast(buffer)
      this.broadcast(`join-message [ ${this.names[player.id]} left the game ]`)
    }
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
