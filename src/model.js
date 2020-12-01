import { MAP_TILES } from './map.js';

export const RIGHT = 3;
export const DOWN = 1;
export const LEFT = 2;
export const UP = 0;

export const DX = {
  [RIGHT]: 1,
  [LEFT]: -1,
  [UP]: 0,
  [DOWN]: 0
};

export const DY = {
  [DOWN]: 1,
  [UP]: -1,
  [RIGHT]: 0,
  [LEFT]: 0,
}

export function isWall(x, y, isDog) {
  const tile = MAP_TILES[y][x];
  if (tile >= 180 && tile < 200) {
    const actioncollide = tile - 179;
    console.log(actioncollide)
    return true;
  }
  if (tile >= 11 && tile < 80) return true;
  if (tile >= 134 && tile < 140) return true;
  if (isDog && tile >= 127 && tile < 134) return true;
  return false;
}

export class Player {
  constructor(id=0, x=50, y=32) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.color = this.id % 10;
    this.facing = 2;
    this.isNapping = false;
    this.isDog = false;
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
  move(direction) {
    const nextX = this.x + DX[direction];
    const nextY = this.y + DY[direction];
    const collided = isWall(nextX, nextY, this.isDog)
    if (!collided) {
      this.x = nextX;
      this.y = nextY;
    }
    const updated = !collided || (this.facing !== direction) || this.isNapping;
    this.facing = direction;
    this.isNapping = false;
    return updated;
  }
  applyChatMessage(str) {
    if (str === '/nap') {
      this.isNapping = true;
      return true
    }
    return false;
  }
}

export function deserializePlayer(i32) {
  const id = (i32 >>> 24) & 0xFF;
  const x = (i32 >>> 16) & 0xFF;
  const y = (i32 >>> 8) & 0xFF;
  const p = new Player(id, x, y);
  p.color = (i32 >>> 4) & 0x0F;
  p.isDog = (i32 >>> 3) & 0x01;
  p.isNapping = (i32 >>> 2) & 0x01;
  p.facing = (i32 >>> 0) & 0x03;
  return p;
}
