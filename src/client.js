import { settings, SCALE_MODES, Application, Sprite, Container, Ticker, AnimatedSprite } from './pixi.js';
import { ready, spriteTextures, tileTextures } from './textures.js';
import { LEFT, DOWN, UP, RIGHT, DX, DY, Player, deserializePlayer } from './model.js'
import { MAP_TILES } from './map.js';

const SCRW = 16 * 10;
const SCRH = 16 * 6;

const keyMap = {
  ArrowRight: RIGHT,
  ArrowDown: DOWN,
  ArrowLeft: LEFT,
  ArrowUp: UP,
};

settings.SCALE_MODE = SCALE_MODES.NEAREST;
settings.ROUND_PIXELS = true; // as in rounding sprite position to nearest integer

ready.then(() => {
  const isProbablyIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

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

  const me = new Player(999);

  const catSprites = new Map();

  function updateSprite(parsed) {
    let sprite;
    if (catSprites.get(parsed.id)) {
      sprite = catSprites.get(parsed.id)
    } else {
      sprite = new AnimatedSprite([spriteTextures[0], spriteTextures[1]]);
      sprite.animationSpeed = 1/32;
      sprite.play();
      world.addChild(sprite)
      catSprites.set(parsed.id, sprite)
    }
    sprite.x = parsed.x * 16;
    sprite.y = parsed.y * 16;
    const spriteOffset = parsed.color * 20 + (parsed.isNapping ? 12 : (parsed.facing * 2))
    sprite.textures[0] = spriteTextures[spriteOffset]
    sprite.textures[1] = spriteTextures[spriteOffset + 1]
    sprite.gotoAndPlay(1-sprite.currentFrame)
  }

  function applyMessageToSprite(id, message) {
    if (message === '/nap') {
      const sprite = catSprites.get(id);
      const oldTextures = [...sprite.textures];
      sprite.textures[0] = spriteTextures[12]
      sprite.textures[1] = spriteTextures[13]
      sprite.gotoAndPlay(0);
    }
  }

  function updateCamera() {
    const cameraX = Math.max(5, Math.min(20-5-1, me.x % 20)) + Math.floor(me.x/20)*20;
    const cameraY = Math.max(3, Math.min(12-3-1, me.y % 12)) + Math.floor(me.y/12)*12;
    world.x = -(cameraX * 16) + SCRW/2 - 8;
    world.y = -(cameraY * 16) + SCRH/2 - 8;
  }
  updateSprite(me);
  updateCamera();

  function doMove(direction) {
    const packet = new Uint8Array([me.x, me.y, direction]);
    const updated = me.move(direction);
    if (updated) {
      ws.send(packet);
      updateSprite(me);
      updateCamera();
    }
  }

  let myID = null;

  const wsURL = location.protocol === 'https:' ? 'wss://chatchatgame.herokuapp.com' : 'ws://localhost:12000'
  const ws = new WebSocket(wsURL);
  ws.binaryType = 'arraybuffer';

  ws.onopen = function() {
    console.log('open')
    ws.send('hi');
  }
  ws.onmessage = function(ev) {
    if (ev.data instanceof ArrayBuffer) {
      const arr = new DataView(ev.data);
      if (arr.byteLength === 1) {
        myID = arr.getUint8(0);
      } else {
        for (let offset = 0; offset < arr.byteLength; offset += 4) {
          const parsed = deserializePlayer(arr.getInt32(0, false));
          console.log(parsed.id, parsed.x, parsed.y)
          if (parsed.id === myID) continue;
          if (!parsed.x && !parsed.y) {
            const sprite = catSprites.get(parsed.id);
            world.removeChild(sprite)
            sprite.destroy();
            catSprites.delete(parsed.id);
          } else {
            updateSprite(parsed);
          }
        }
      }
    } else {
      const split = ev.data.indexOf(' ');
      const msg = ev.data.slice(split + 1);
      const id = parseInt(ev.data) // ok because it goes up to the ' '
      console.log(id, msg);
      applyMessageToSprite(id, msg)
    }
  }
  ws.onclose = function(ev) {
    console.error('Lost connection')
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

  const input = document.querySelector('input')
  input.onkeypress = e => {
    if (e.key === 'Enter') {
      applyMessageToSprite(me.id, input.value)
      ws.send(input.value);
      input.value = '';
    }
  }
})