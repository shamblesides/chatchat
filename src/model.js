import { MAP_TILES, MAP_NAMES } from './map.js';

export const RIGHT = 3;
export const DOWN = 1;
export const LEFT = 2;
export const UP = 0;

const DX = {
  [RIGHT]: 1,
  [LEFT]: -1,
  [UP]: 0,
  [DOWN]: 0
};

const DY = {
  [DOWN]: 1,
  [UP]: -1,
  [RIGHT]: 0,
  [LEFT]: 0,
}

export function isWall(tile, isDog) {
  if (tile >= 180 && tile < 200) {
    const actioncollide = tile - 179;
    return true;
  }
  if (tile >= 11 && tile < 80) return true;
  if (tile >= 134 && tile < 140) return true;
  if (isDog && tile >= 127 && tile < 134) return true;
  return false;
}

function playerCollides(me, x, y, others) {
  for (const o of others) {
    if (o !== me && o.x === x && o.y === y) return o;
  }
  return null;
}

export class Player {
  constructor(id=0, x=50, y=32) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.color = this.id % 10;
    this.facing = LEFT;
    this.isNapping = false;
    this.isDog = false;
    this.socket = null;
  }
  toInt32() {
    return (this.id << 24)
         + (this.x << 16)
         + (this.y << 8)
         + (this.color << 4)
         + (this.isDog << 3)
         + (this.isNapping << 2)
         + (this.facing << 0)
  }
  toDeletedInt32() {
    return (this.id << 24);
  }
  copy() {
    return deserializePlayer(this.toInt32());
  }
  move(direction, otherPlayers, faceOnly=false) {
    const nextX = this.x + DX[direction];
    const nextY = this.y + DY[direction];
    const tile = MAP_TILES[nextY][nextX];
    const target = playerCollides(this, nextX, nextY, otherPlayers);
    const collided = isWall(tile, this.isDog) || (target != null)
    const moved = !collided && !faceOnly;
    if (moved) {
      this.x = nextX;
      this.y = nextY;
    }
    const updated = moved || (this.facing !== direction) || this.isNapping;
    this.facing = direction;
    this.isNapping = false;
    return { updated, moved, collided, target }
  }
  isAtDoorstep() {
    const {x,y} = this;
    return x >= 48 && y >= 30 && x <= 51 && y <= 31;
  }
  isAtDogAltar() {
    const {x,y} = this;
    return (x == 73 && y == 6) || (x == 74 && y == 6);
  }
  applyChatMessage(str) {
    if (str === '/nap') {
      this.isNapping = true;
      return true
    }
    return false;
  }
  xroom() {
    return Math.floor(this.x / 20)
  }
  yroom() {
    return Math.floor(this.y / 12)
  }
  sameRoomAs(other) {
    return this.xroom() === other.xroom() && this.yroom() === other.yroom();
  }
  roomName() {
    return MAP_NAMES[this.yroom()][this.xroom()]
  }
}

export function deserializePlayer(i32) {
  const id = (i32 >>> 24) & 0xFF;
  const x = (i32 >>> 16) & 0xFF;
  const y = (i32 >>> 8) & 0xFF;
  const p = new Player(id, x, y);
  p.color = (i32 >>> 4) & 0x0F;
  p.isDog = !!((i32 >>> 3) & 0x01);
  p.isNapping = !!((i32 >>> 2) & 0x01);
  p.facing = (i32 >>> 0) & 0x03;
  return p;
}
