import { settings, SCALE_MODES, Application, Sprite, Container, Ticker, AnimatedSprite } from './pixi.js';
import { ready, spriteTextures, tileTextures } from './textures.js';
import { MAP_TILES } from './map.js';
const SCRW = 16 * 10;
const SCRH = 16 * 6;

const RIGHT = 3;
const DOWN = 1;
const LEFT = 2;
const UP = 0;

const keyMap = {
  ArrowRight: RIGHT,
  ArrowDown: DOWN,
  ArrowLeft: LEFT,
  ArrowUp: UP,
};

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

settings.SCALE_MODE = SCALE_MODES.NEAREST;
settings.ROUND_PIXELS = true; // as in rounding sprite position to nearest integer

const isProbablyIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

ready.then(() => {
  const application = new Application({
    view: document.querySelector('#game'),
    width: SCRW, 
    height: SCRH,
    clearBeforeRender: false,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power',
    antialias: isProbablyIOS, // turning on antialias prevents the odd render bug on ios 11+. my iphone 4s w/ ios 9 is still affected...
  });

  document.querySelector('#loader').remove();
  document.querySelector('#game').style.display = '';

  const world = new Container();
  application.stage.addChild(world);

  const tilemap = new Container();
  tilemap.cacheAsBitmap = true;
  world.addChild(tilemap);

  MAP_TILES.forEach((row, y) => {
    row.forEach((tile, x) => {
      const spr = new Sprite(tileTextures[tile]);
      spr.x = x * 16;
      spr.y = y * 16;
      tilemap.addChild(spr);
    });
  });

  function collides(me) {
    const tile = MAP_TILES[me.y][me.x];
    if (tile >= 180 && tile < 200) {
      const actioncollide = tile - 179;
      console.log(actioncollide)
      return true;
    }
    if (tile >= 11 && tile < 80) return true;
    if (tile >= 134 && tile < 140) return true;
    if (me.dog && tile >= 127 && tile < 134) return true;
    return false;
  }

  const me = { x: 50, y: 32, facing: DOWN };
  const sprite = new AnimatedSprite([spriteTextures[0], spriteTextures[1]]);
  sprite.animationSpeed = 1/32;
  sprite.play();
  world.addChild(sprite)

  function updatePlayerAndCamera() {
    const cameraX = Math.max(5, Math.min(20-5-1, me.x % 20)) + Math.floor(me.x/20)*20;
    const cameraY = Math.max(3, Math.min(12-3-1, me.y % 12)) + Math.floor(me.y/12)*12;
    sprite.x = me.x * 16;
    sprite.y = me.y * 16;
    sprite.textures[0] = spriteTextures[me.facing * 2]
    sprite.textures[1] = spriteTextures[me.facing * 2 + 1]
    sprite.gotoAndPlay(1-sprite.currentFrame)
    world.x = -(cameraX * 16) + SCRW/2 - 8;
    world.y = -(cameraY * 16) + SCRH/2 - 8;
  }
  updatePlayerAndCamera();

  function doMove(direction) {
    me.facing = direction;
    me.x += DX[direction];
    me.y += DY[direction];
    if (collides(me)) {
      me.x -= DX[direction];
      me.y -= DY[direction];
    }
    updatePlayerAndCamera();
  }

  let currentHandle = null;
  window.addEventListener('keydown', e => {
    const direction = keyMap[e.key];
    if (direction == undefined) {
      document.querySelector('input').focus();
      return;
    }
    if (e.repeat) return;
    event.preventDefault();
    clearInterval(currentHandle);
    const handle = setInterval(doMove, 250, direction);
    currentHandle = handle
    window.addEventListener('keyup', e2 => {
      if (e2.key === e.key) clearInterval(handle);
    })
    doMove(direction);
  })
})