import { settings, SCALE_MODES, Application, Sprite, Container, Ticker, AnimatedSprite } from './pixi.js';
import { ready as texturesReady, spriteTextures, tileTextures } from './textures.js';
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

const SOUNDS_CAT_MEOW = Array(5).fill().map((_,i) => new Audio(`sounds/meow${i+1}.mp3`));
const SOUNDS_DOG_BARK = Array(5).fill().map((_,i) => new Audio(`sounds/dogbark${i+1}.mp3`));
const SOUNDS_PIANO = ['c', 'd', 'e', 'f', 'g', 'a', 'b', 'hc'].map(note => new Audio(`sounds/piano${note}.mp3`));
const SOUND_BROADCAST = new Audio('sounds/broadcast.mp3')
const SOUND_CAT_NAP = new Audio('sounds/catnap.mp3')
const SOUND_CAT_PURR = new Audio('sounds/catpurr.mp3')
const SOUND_CAT_SCREECH = new Audio('sounds/catscreech.mp3')
const SOUND_DOG_HOWL = new Audio('sounds/doghowl.mp3')
const SOUND_DOG_NAP = new Audio('sounds/dognap.mp3')
const SOUND_DOG_PANT = new Audio('sounds/dogpant.mp3')
const SOUND_HELP = new Audio('sounds/help.mp3')
const SOUND_MOUSE = new Audio('sounds/mouse.mp3')

texturesReady.then(() => {
  document.querySelector('#loader').innerText = 'Connecting...'

  const wsURL = location.protocol === 'https:' ? 'wss://chatchatgame.herokuapp.com' : 'ws://localhost:12000'
  const ws = new WebSocket(wsURL);
  ws.binaryType = 'arraybuffer';

  const wsOpen = new Promise(done => {
    ws.onopen = done;
  })

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

  const mouse = new AnimatedSprite([180, 200, 181, 201].map(n => tileTextures[n]));
  mouse.animationSpeed = 1/32;
  mouse.play();
  world.addChild(mouse);
  function placeMouse(x, y) {
    mouse.x = x * 16;
    mouse.y = y * 16;
  }

  const me = new Player(999);

  const catStates = new Map();
  const catSprites = new Map();

  function updateSprite(player) {
    catStates.set(player.id, player);
    let sprite;
    if (catSprites.get(player.id)) {
      sprite = catSprites.get(player.id)
    } else {
      sprite = new AnimatedSprite([spriteTextures[0], spriteTextures[1]]);
      sprite.animationSpeed = 1/32;
      sprite.play();
      world.addChild(sprite)
      catSprites.set(player.id, sprite)
    }
    sprite.x = player.x * 16;
    sprite.y = player.y * 16;
    const spriteOffset = player.color * 20 + (player.isNapping ? 12 : (player.facing * 2))
    sprite.textures[0] = spriteTextures[spriteOffset]
    sprite.textures[1] = spriteTextures[spriteOffset + 1]
    sprite.gotoAndPlay(1-sprite.currentFrame)
    clearTimeout(emoteTimers[player.id])
  }

  const EMOTES = new Map([
    ['/meow', { offset: 8, timer: 3000, cat: true, catSounds: SOUNDS_CAT_MEOW }],
    ['/purr', { offset: 10, timer: 3000, cat: true, catSounds: [SOUND_CAT_PURR] }],
    ['/screech', { offset: 14, timer: 3000, cat: true, catSounds: [SOUND_CAT_SCREECH] }],
    ['/bark', { offset: 8, timer: 3000, dog: true, dogSounds: SOUNDS_DOG_BARK }],
    ['/pant', { offset: 10, timer: 3000, dog: true, dogSounds: [SOUND_DOG_PANT] }],
    ['/howl', { offset: 14, timer: 3000, dog: true, dogSounds: [SOUND_DOG_HOWL] }],
    ['/nap', { offset: 12, catSounds: [SOUND_CAT_NAP], dogSounds: [SOUND_DOG_NAP] }],
  ]);

  const emoteTimers = {};
  function applyMessageToSprite(id, message) {
    console.log(id, message)
    const emote = EMOTES.get(message)
    if (!emote) return;

    const player = catStates.get(id);
    if (emote.dog && !player.isDog) return;
    if (emote.cat && player.isDog) return;

    const spriteOffset = player.color * 20 + emote.offset;
    const sprite = catSprites.get(id);
    sprite.textures[0] = spriteTextures[spriteOffset]
    sprite.textures[1] = spriteTextures[spriteOffset + 1]
    sprite.gotoAndPlay(1-sprite.currentFrame);

    if (emote.timer) {
      clearTimeout(emoteTimers[id]);
      emoteTimers[id] = setTimeout(() => {
        updateSprite(catStates.get(id));
        sprite.gotoAndPlay(1-sprite.currentFrame);
      }, emote.timer)
    }

    const sounds = player.isDog ? emote.dogSounds : emote.catSounds;
    const sound = sounds[Math.random() * sounds.length | 0];
    sound.play();
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
      const type = ev.data.slice(0, split);
      if (type === 'mouse') {
        const [x,y] = JSON.parse(msg);
        placeMouse(x,y);
      } else {
        const id = parseInt(type);
        console.log(id, msg);
        applyMessageToSprite(id, msg)
      }
    }
  }
  ws.onclose = function(ev) {
    console.error('Lost connection')
  }

  wsOpen.then(() => {
    document.querySelector('#loader').remove();
    document.querySelector('#game').style.display = '';

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
  });
})