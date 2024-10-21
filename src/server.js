#!/usr/bin/env node

import { timingSafeEqual, randomUUID } from 'node:crypto';
import * as http from 'node:http';
import { WebSocketServer } from 'ws';
import { DOWN, UP, LEFT, RIGHT, Player } from './model.js'
import { MAP_TILES } from './map.js';

const MAX_ROOMS = 256;
const MAX_PLAYERS = 64;
const DEFAULT_ROOM_ID = "default_room";

/**
 * @param {Room | null} room 
 * @param {string} logline 
 */
function log(room, logline) {
  console.log(`[${new Date().toISOString()}] ${room?.id ?? 'ChatChatSrvr'}: ${logline}`)
}

/**
 * @type {Record<number, (isDog: boolean) => string>}
 */
const PAD_MESSAGES = {
  100: isDog => isDog ? 'Woof Woof Woof!' : "I'm in the mush room!",
  101: isDog => isDog ? 'Woof Woof Woof!' : "I'm by the fountain!",
  102: isDog => isDog ? 'Woof Woof Woof!' : "I found treasure!",
  103: isDog => isDog ? 'Woof Woof Woof!' : "Meet me in the alley!",
  104: isDog => isDog ? 'Woof! Woof Woof Woof!' : "Meow Meow Meow!",
}

/**
 * @param {string} msg 
 */
function whitelistDogChat(msg) {
  return (msg.startsWith('/me ') || ['/bark', '/woof', '/pant', '/howl', '/nap'].includes(msg))
}

/**
 * @param {string} str 
 * @param {Buffer} buf2 
 */
function comparePasswords(str, buf2) {
  if (str.length > 100) return false;
  const buf1 = Buffer.from(str);
  let diff = buf1.length ^ buf2.length;
  const comp = diff ? buf1 : buf2;
  diff |= +!timingSafeEqual(buf1, comp);
  return diff === 0;
}

class Room {
  /**
   * @param {string} id 
   * @param {string} name 
   * @param {string} pass 
   */
  constructor (id, name, pass) {
    this.id = id;
    this.name = name;
    this.pass = pass ? Buffer.from(pass, 'utf8') : null;
    this.availableIDs = Array(MAX_PLAYERS).fill(null).map((_,i) => i).reverse();
    /** @type {Set<Player>} */
    this.players = new Set();
    /** @type {Record<number, boolean>} */
    this.hasMouse = {};
    /** @type {Record<number, number>} */
    this.scores = {};
    /** @type {Record<number, string>} */
    this.names = {};
    /** @type {Record<number, boolean>} */
    this.frozens = {};
    /** @type {WeakMap<Player, import('ws').WebSocket>} */
    this.sockets = new WeakMap();
    this.mousex = 54;
    this.mousey = 41;
  }
}

const rooms = new Map([[DEFAULT_ROOM_ID, new Room(DEFAULT_ROOM_ID, "default_room", "")]]);

const httpServer = http.createServer(function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const roomInfos = [...rooms.values()]
    .map(r => ({ id: r.id, name: r.name, cats: r.players.size, hasPassword: !!r.pass }));
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(roomInfos));
})

const wss = new WebSocketServer({ noServer: true })
httpServer.on('upgrade', function (request, sock, head) {
  wss.handleUpgrade(request, sock, head, (ws) => {
    wss.emit('connection', ws, request)
    if (!request.url) {
      ws.close(4400, `Malformed request`)
      return;
    }
    const params = new URL(request.url, 'https://example.org').searchParams;
    const catName = params.get('name');
    const roomid = params.get('roomid');
    const pass = params.get('pass') || '';
    if (!catName) {
      ws.close(4400, `Missing name`)
      return;
    }
    if (roomid == null) {
      // Creating a room
      const roomName = params.get('roomname');
      if (!roomName || (typeof roomName !== 'string') || !roomName.match(/^\w{1,20}$/g)) {
        ws.close(4400, `Missing room name`)
        return;
      }
      if (pass.length > 100) {
        ws.close(4400, "Password is too long")
        return;
      }
      if (rooms.size >= MAX_ROOMS) {
        ws.close(4400, "Server overloaded - too many rooms")
        return;
      }
      const newRoomid = randomUUID().slice(-12);
      if (rooms.has(newRoomid)) {
        ws.close(4400, `Temporary error - please try again`)
        return;
      }
      const room = new Room(newRoomid, roomName, pass);
      rooms.set(newRoomid, room);
      room.accept(ws, catName)
    } else {
      // Joining a room
      const room = rooms.get(roomid);
      if (!room) {
        ws.close(4400, `Room not found; try a different room!`)
        return;
      }
      if (room.pass && !comparePasswords(pass, room.pass)) {
        ws.close(4400, `Wrong password`)
        return;
      }
      room.accept(ws, catName)
    }
  });
})

/**
 * @param {Player} recipient 
 * @param {string | Buffer} packet
 */
Room.prototype.send = function send(recipient, packet) {
  this.sockets.get(recipient)?.send(packet)
}

/**
 * @param {string | Buffer} packet 
 */
Room.prototype.broadcast = function broadcast(packet) {
  if (typeof packet === 'string') {
    log(this, packet);
  }
  for (const recipient of this.players) {
    this.send(recipient, packet);
  }
}

/**
 * @param {Player} sender 
 * @param {string | Buffer} packet
 */
Room.prototype.broadcastRoom = function broadcastRoom(sender, packet) {
  if (typeof packet === 'string') {
    log(this, packet);
  }
  for (const other of this.players) {
    if (sender.sameRoomAs(other)) {
      this.send(other, packet);
    }
  }
}

/**
 * @param {Player} player 
 */
Room.prototype.broadcastPlayer = function broadcastPlayer (player) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(player.toInt32())
  this.broadcast(buffer);
}
  
/**
 * @param {import('ws').WebSocket} ws 
 * @param {string} name 
 */
Room.prototype.accept = function accept (ws, name) {
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
  this.players.add(player);
  this.hasMouse[player.id] = false;
  this.scores[player.id] = 0;
  this.names[player.id] = name;
  this.frozens[player.id] = false;
  this.sockets.set(player, ws);

  let spamScore = 0;
  const handle = setInterval(() => spamScore = Math.max(spamScore - 1, 0), 1000);
  ws.on('close', () => clearInterval(handle));

  let padSpamCooldown = 0;
  let foundMouseSpamCooldown = 0;

  ws.on('message', (rawData, isBinary) => {
    if (isBinary) {
      const data = rawData;
      try {
        if (!(data instanceof Buffer)) {
          throw new Error('unknown websocket data');
        }
        if (this.frozens[player.id]) {
          ws.send('invalid invalid')
          return;
        }
        if (data.length !== 4) {
          throw new Error('Buffer should be 4 bytes')
        }
        const dir = data[2];
        if (dir !== DOWN && dir !== UP && dir !== LEFT && dir !== RIGHT) {
          throw new Error('Invalid direction')
        }
        if (data[0] !== player.x || data[1] !== player.y) {
          ws.send('invalid invalid')
          return;
        }
        const faceOnly = !!data[3]
        const oldState = player.copy();
        const { updated, target } = player.move(dir, this.players, faceOnly)
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
          this.send(target, 'frozen true')
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
        const message = (err instanceof Error) ? err.message : err?.toString() ?? 'Unknown error';
        ws.close(4400, message)
      }
    } else {
      const data = rawData.toString();
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
      if (this.id !== DEFAULT_ROOM_ID) {
        rooms.delete(this.id);
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
  for (const [i, player] of [...this.players.values()].entries())  {
    firstPayload.writeInt32BE(player.toInt32(), i * 4);
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
    if (player !== other) this.send(other, buffer)
  }
};

/** @type {WeakSet<import('ws').WebSocket>} */
const inactiveConnections = new WeakSet();
setInterval(() => {
  for (const socket of wss.clients) {
    if (inactiveConnections.has(socket)) {
      inactiveConnections.delete(socket);
      socket.terminate();
    } else {
      inactiveConnections.add(socket);
      socket.ping()
      socket.once('pong', () => inactiveConnections.delete(socket));
    }
  }
}, 30 * 1000);

const listener = httpServer.listen(process.env.PORT || 12000, () => {
  const addr = listener.address();
  if (addr && typeof addr === 'object') {
    log(null, `listening on port ${addr.port}`);
  } else {
    log(null, `listening on ${addr}`);
  }
})
