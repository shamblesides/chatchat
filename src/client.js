import { settings, SCALE_MODES, Application, Sprite, Container, AnimatedSprite, Graphics, Text } from './pixi.js';
import { ready as texturesReady, spriteTextures, tileTextures } from './textures.js';
import { LEFT, DOWN, UP, RIGHT, Player, deserializePlayer, isWall } from './model.js'
import { MAP_TILES } from './map.js';
import { Graph, astar } from './astar.js';

const SCRW = 16 * 10 * 2;
const SCRH = 16 * 6 * 2;

const keyMap = {
  ArrowRight: RIGHT,
  ArrowDown: DOWN,
  ArrowLeft: LEFT,
  ArrowUp: UP,
};

const myGraph = new Graph(MAP_TILES.map(row => row.map(tile => isWall(tile) ? 0 : 1)))

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

const playerColors = [
  `rgb(143, 180, 42)`,
  `rgb(215, 120, 53)`,
  `rgb(54, 139, 230)`,
  `rgb(215, 120, 53)`,
  `rgb(135, 135, 135)`,
  `rgb(159, 38, 52)`,
  `rgb(165, 206, 230)`,
  `rgb(196, 98, 118)`,
  `rgb(137, 91, 33)`,
  `rgb(54, 139, 230)`,
];

const API_HOST = location.protocol === 'https:' ? 'https://chatchatgame.herokuapp.com' : 'http://localhost:12000';
const WS_HOST = API_HOST.replace(/^http/, 'ws');

function logMessage(text, fn) {
  const p = document.createElement('p');
  p.innerText = text;
  fn(p);
  document.querySelector('#inner').appendChild(p);
  setTimeout(() => document.querySelector('#inner').scrollBy(0, p.clientHeight))
}

document.querySelector('#title button').innerText = 'Click to start'
document.getElementById('title').onclick = function(evt) {
  evt.currentTarget.querySelector('button').click();
}
document.querySelector('#title button').onclick = function(evt) {
  evt.stopPropagation();
  document.getElementById('title').style.display = 'none'
  document.getElementById('name-entry').style.display = ''
  document.querySelector('#name-entry input').focus();
}
document.querySelector('[name=username]').value = `Kitty${Math.random()*10|0}${Math.random()*10|0}`;
document.querySelector('#name-entry form').onsubmit = function(evt) {
  evt.preventDefault();
  const username = evt.target.elements.username.value;
  document.querySelector('#name-entry').style.display = 'none';
  enterLobby(username);
}

function enterLobby(myUsername) {
  document.querySelector('#connecting').style.display = '';
  document.querySelector('#refresh-rooms-button').onclick = () => enterLobby(myUsername);

  fetch(API_HOST)
  .then(res => {
    if (!res.ok) throw new Error('Game server is sick :(')
    else return res.json()
  })
  .then(data => {
    document.querySelector('#connecting').style.display = 'none';
    document.querySelector('#room-entry').style.display = '';
    const tbody = document.querySelector('#room-entry table tbody')
    tbody.innerHTML = '';
    for (const { id, name, cats, hasPassword } of data) {
      const tr = document.createElement('tr');
      tbody.appendChild(tr);
      const td1 = document.createElement('td');
      tr.appendChild(td1);
      const button = document.createElement('button');
      td1.appendChild(button);
      button.innerText = name;
      const td2 = document.createElement('td');
      tr.appendChild(td2);
      td2.innerText = cats;
      button.onclick = () => {
        let pass = hasPassword ? prompt('Please enter the password for this room.') : '';
        if (pass != null) {
          enterRoom(id, name, pass)
        }
      }
    }
    document.querySelector('#create-room-button').onclick = function(evt) {
      const roomName = prompt("Name of this room?", `${myUsername}_room`)
      if (roomName == null) {
        return;
      }
      if (roomName === '') {
        alert('Room name cannot be blank')
        return;
      }
      const pass = prompt("Add a password for this room? (Leave blank for no password)")
      if (pass == null) {
        return;
      }

      document.querySelector('#room-entry').style.display = 'none';
      document.querySelector('#connecting').style.display = '';
      document.querySelector('#connecting p').innerText = 'Creating room...'
      fetch(API_HOST, {method:'POST', headers: {'x-room-name': roomName, 'x-room-pass': pass}})
      .then(res => {
        if (!res.ok) throw new Error('Game server is sick :(')
        else return res.json()
      })
      .then(data => {
        enterRoom(data.id, roomName, pass)
      })
    }
    function enterRoom (roomID, roomName, roomPass) {
      document.querySelector('#room-entry').style.display = 'none';
      document.querySelector('#connecting').style.display = '';
      document.querySelector('#connecting p').innerText = 'Loading textures...'
      texturesReady.then(() => {
        document.querySelector('#connecting p').innerText = `Now connecting to ${roomName}...`
        enterGame(roomID, roomPass, myUsername)
      });;
    }
  })
}

function enterGame(roomID, roomPass, myUsername) {
  const ws = new WebSocket(`${WS_HOST}/?roomid=${roomID}&name=${myUsername}&pass=${encodeURIComponent(roomPass)}`);
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
      spr.x = x * 16 * 2;
      spr.y = y * 16 * 2;
      spr.scale.set(2, 2)
      tilemap.addChild(spr);
    });
  });

  const mouse = new AnimatedSprite([180, 200, 181, 201].map(n => tileTextures[n]));
  mouse.scale.set(2,2)
  mouse.animationSpeed = 1/32;
  mouse.play();
  world.addChild(mouse);
  function placeMouse(x, y) {
    mouse.x = x * 16 * 2;
    mouse.y = y * 16 * 2;
  }

  const hasMouseSprite = new Container();
  hasMouseSprite.x = 10;
  hasMouseSprite.y = 170;
  hasMouseSprite.addChild(new Graphics()
    .beginFill(0xffffff).drawRect(0,0,90,20).endFill()
    .beginFill(0x000000).drawRect(1,1,88,18).endFill()
    .beginFill(0xffffff).drawRect(2,2,86,16).endFill()
  )
  hasMouseSprite.addChild(Object.assign(new Sprite(spriteTextures[401]), { x: 2, y: 2 }))
  hasMouseSprite.addChild(Object.assign(new Text('has mouse!', { fontFamily:'ChatChat', fontSize: 8 }), { x: 24, y: 6 }));
  hasMouseSprite.visible = false
  application.stage.addChild(hasMouseSprite);

  const iAmFrozenSprite = new Container();
  iAmFrozenSprite.x = (SCRW - 160) / 2;
  iAmFrozenSprite.y = (SCRH - 32) / 2;
  iAmFrozenSprite.addChild(new Graphics()
    .beginFill(0xffffff).drawRect(0,0,160,32).endFill()
    .beginFill(0x000000).drawRect(1,1,158,30).endFill()
    .beginFill(0xffffff).drawRect(2,2,156,28).endFill()
  )
  iAmFrozenSprite.addChild(Object.assign(new Text(' No backsies!\nFrozen for 5 seconds', { fontFamily:'ChatChat', fontSize: 8, align: 'center' }), { x: 27, y: 8 }));
  iAmFrozenSprite.visible = false
  application.stage.addChild(iAmFrozenSprite);

  const deadMouseHouse = new Sprite(spriteTextures[402])
  deadMouseHouse.x = 16 * 49.5 * 2;
  deadMouseHouse.y = 16 * 30.25 * 2;
  deadMouseHouse.scale.set(2,2)
  deadMouseHouse.visible = false;
  world.addChild(deadMouseHouse);
  const deadMouseAltar = new Sprite(spriteTextures[402])
  deadMouseAltar.x = 16 * 73.5 * 2;
  deadMouseAltar.y = 16 * 5.75 * 2;
  deadMouseAltar.scale.set(2,2)
  deadMouseAltar.visible = false;
  world.addChild(deadMouseAltar);

  const me = new Player(999);

  const catStates = new Map();
  const catSprites = new Map();
  const names = { 999: myUsername };

  function updateSprite(player) {
    catStates.set(player.id, player);
    let sprite;
    if (catSprites.get(player.id)) {
      sprite = catSprites.get(player.id)
    } else {
      const container = new Container();
      sprite = new AnimatedSprite([spriteTextures[0], spriteTextures[1]]);
      sprite.scale.set(2,2)
      sprite.animationSpeed = 1/32;
      sprite.play();
      container.addChild(sprite);
      catSprites.set(player.id, sprite)

      const text = new Text(names[player.id], { fontFamily:'ChatChat', fontSize: 8, fill: 'white' })
      text.x = 16 - text.width / 2;
      text.y = 32;
      container.addChild(text);

      world.addChild(container)
    }
    const newX = player.x * 16 * 2;
    const newY = player.y * 16 * 2;
    if (sprite.parent.x !== newX || sprite.parent.y !== newY) {
      sprite.parent.x = newX
      sprite.parent.y = newY
      if (player.sameRoomAs(me)) {
        const pianoKey = MAP_TILES[player.y][player.x] - 83;
        if (SOUNDS_PIANO[pianoKey]) SOUNDS_PIANO[pianoKey].play();
      }
    }
    const spriteOffset = player.color * 20 + player.isDog * 200 + (player.isNapping ? 12 : (player.facing * 2))
    sprite.textures[0] = spriteTextures[spriteOffset]
    sprite.textures[1] = spriteTextures[spriteOffset + 1]
    sprite.gotoAndPlay(1-sprite.currentFrame)
    clearTimeout(emoteTimers[player.id])
  }

  const EMOTES = new Map([
    ['/meow', { offset: 8, timer: 3000, cat: true, catSounds: SOUNDS_CAT_MEOW, does: 'meows' }],
    ['/purr', { offset: 10, timer: 3000, cat: true, catSounds: [SOUND_CAT_PURR], does: 'purrs'  }],
    ['/screech', { offset: 14, timer: 3000, cat: true, catSounds: [SOUND_CAT_SCREECH], does: 'screeches' }],
    ['/bark', { offset: 8, timer: 3000, dog: true, dogSounds: SOUNDS_DOG_BARK, does: 'barks' }],
    ['/woof', { offset: 8, timer: 3000, dog: true, dogSounds: SOUNDS_DOG_BARK, does: 'barks' }],
    ['/pant', { offset: 10, timer: 3000, dog: true, dogSounds: [SOUND_DOG_PANT], does: 'pants' }],
    ['/howl', { offset: 14, timer: 3000, dog: true, dogSounds: [SOUND_DOG_HOWL], does: 'howls' }],
    ['/nap', { offset: 12, catSounds: [SOUND_CAT_NAP], dogSounds: [SOUND_DOG_NAP], does: 'takes a nap' }],
  ]);

  const emoteTimers = {};
  function applyMessageToSprite(id, message) {
    const emote = EMOTES.get(message)
    if (!emote) return;

    const player = catStates.get(id);
    if (emote.dog && !player.isDog) return;
    if (emote.cat && player.isDog) return;

    const spriteOffset = player.color * 20 + player.isDog * 200 + emote.offset;
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
    world.x = -((cameraX + .5) * 16 * 2) + SCRW/2;
    world.y = -((cameraY + .5) * 16 * 2) + SCRH/2;
  }
  updateSprite(me);
  updateCamera();

  const HELP_MESSAGES = {
    110: isDog => `You can type "${isDog?'/woof':'/meow'}" to cry for attention!`,
    111: isDog => `Tired? Try taking a "/nap"!`,
    112: isDog => `Also try ${isDog?'"/pant"':'"/purr"'} and ${isDog?'"/howl"':'"/screech"'}!`,
    113: isDog => `Type "/me does thing" to do a thing!`,
    114: isDog => `This is a peaceful place. No dogs allowed!`,
  }

  const lastConfirmedPosition = { x: me.x, y: me.y };
  const unconfirmedMovements = [];

  function doMove(direction) {
    const fromX = me.x;
    const fromY = me.y;
    const { updated, moved, target } = me.move(direction, catStates.values());
    const packet = new Uint8Array([fromX, fromY, direction, moved?0:1]);
    if (updated || target) {
      unconfirmedMovements.push({ x: me.x, y: me.y });
      ws.send(packet);
      updateSprite(me);
    }
    if (moved) {
      const myTile = MAP_TILES[me.y][me.x]
      if (myTile in HELP_MESSAGES) {
        SOUND_HELP.play();
        const text = `-= Help: ${HELP_MESSAGES[myTile](me.isDog)} =-`;
        logMessage(text, p => p.classList.add('help-message'));
      }
      updateCamera();
    }
  }

  ws.onmessage = function(ev) {
    if (ev.data instanceof ArrayBuffer) {
      const arr = new DataView(ev.data);
      for (let offset = 0; offset < arr.byteLength; offset += 4) {
        const parsed = deserializePlayer(arr.getInt32(offset, false));
        if (parsed.id === me.id) {
          lastConfirmedPosition.x = parsed.x;
          lastConfirmedPosition.y = parsed.y;
          let updated = false;
          if (me.color !== parsed.color) {
            me.color = parsed.color;
            updated = true;
          }
          if (me.isDog !== parsed.isDog) {
            me.isDog = parsed.isDog;
            updated = true;

            const overlay = new Graphics().beginFill(0xFFFFFF).drawRect(0, 0, SCRW, SCRH).endFill();
            application.stage.addChild(overlay);
            setTimeout(() => {
              application.stage.removeChild(overlay);

              const shakeFreq = 4;
              let shake = 10 * shakeFreq;
              const handle = setInterval(() => {
                shake--;
                if (shake === 0) {
                  application.stage.x = 0;
                  application.stage.y = 0;
                  clearInterval(handle);
                } else if (shake % shakeFreq === 0) {
                  application.stage.x = Math.random() * 5 - 3 | 0;
                  application.stage.y = Math.random() * 5 - 3 | 0;
                }
              })
            }, 100)

            const yowl = me.isDog ? SOUND_DOG_HOWL : SOUND_CAT_SCREECH;
            yowl.play();
          }
          const expected = unconfirmedMovements.shift();
          if (expected == null || parsed.x !== expected.x || parsed.y !== expected.y) {
            me.x = parsed.x;
            me.y = parsed.y;
            unconfirmedMovements.splice(0, Infinity);
            updated = true;
          }
          if (updated) {
            updateSprite(me)
          }
        } else if (!parsed.x && !parsed.y) {
          const sprite = catSprites.get(parsed.id);
          world.removeChild(sprite.parent)
          sprite.destroy();
          catSprites.delete(parsed.id);
        } else {
          updateSprite(parsed);
        }
      }
    } else {
      const split = ev.data.indexOf(' ');
      const msg = ev.data.slice(split + 1);
      const type = ev.data.slice(0, split);
      if (type === 'id') {
        const state = catStates.get(me.id);
        const sprite = catSprites.get(me.id);
        catStates.delete(me.id)
        catSprites.delete(me.id)
        me.id = +msg;
        catStates.set(me.id, state)
        catSprites.set(me.id, sprite)
      } else if (type === 'names') {
        const newNames = JSON.parse(msg);
        Object.assign(names, newNames);
      } else if (type === 'mouse') {
        const [x,y] = JSON.parse(msg);
        placeMouse(x,y);
      } else if (type === 'hasmouse') {
        const hasmouse = msg === 'true';
        if (hasmouse) SOUND_MOUSE.play();
        hasMouseSprite.visible = hasmouse;
      } else if (type === 'dropoff') {
        const { isDog, transformed } = JSON.parse(msg);
        const sfxList = transformed ? [isDog ? SOUND_DOG_HOWL : SOUND_CAT_SCREECH] : (isDog ? SOUNDS_DOG_BARK : SOUNDS_CAT_MEOW);
        sfxList[Math.random() * sfxList.length | 0].play();
        const whichMouse = isDog ? deadMouseAltar : deadMouseHouse;
        whichMouse.visible = true;
        setTimeout(() => whichMouse.visible = false, 5000)
      } else if (type === 'invalid') {
        console.log('oops, rewind')
        unconfirmedMovements.splice(0, Infinity);
        me.x = lastConfirmedPosition.x;
        me.y = lastConfirmedPosition.y;
        updateSprite(me);
        updateCamera();
      } else if (type === 'frozen') {
        iAmFrozenSprite.visible = true;
        setTimeout(() => iAmFrozenSprite.visible = false, 5000);
      } else if (type.endsWith('-message')) {
        logMessage(msg, p => p.classList.add(type));
        if (type === 'pad-message') {
          SOUND_BROADCAST.play();
        }
      } else { // message from player
        const id = parseInt(type);
        const color = playerColors[catStates.get(id).color];
        if (msg.startsWith('/me ')) {
          const text = names[id] + msg.slice(3)
          logMessage(text, p => p.style.color = color);
        } else {
          let emote = null
          for (const [cmd, e] of EMOTES.entries()) {
            if (msg === cmd) emote = e;
          }
          if (emote && ((me.isDog && !emote.cat) || (!me.isDog && !emote.dog))) {
            const words = `${names[id]} ${emote.does}`;
            logMessage(words, p => p.style.color = color)
            applyMessageToSprite(id, msg)
          } else {
            const nameEl = document.createElement('span');
            nameEl.innerText = names[id] + ':';
            nameEl.style.color = color;
            const text = me.isDog
              ? 'woof '.repeat([2,3,3,4][Math.random()*4|0]).trim()
              : msg
            logMessage(text, p => {
              p.prepend(nameEl, ' ')
              if (id === me.id) {
                p.classList.add('my-message')
              }
            });
          }
        }
      }
    }
  }
  ws.onclose = function(ev) {
    document.querySelector('#game').style.display = 'none';
    document.querySelector('#chat').style.display = 'none';
    document.querySelector('#connecting').style.display = '';
    document.querySelector('#connecting p').innerText = ev.reason || 'Lost connection! Please refresh.';
  }

  wsOpen.then(() => {
    document.querySelector('#connecting').style.display = 'none';
    document.querySelector('#game').style.display = '';
    document.querySelector('#chat').style.display = '';

    let currentHandle = null;
    let currentDirections = [];
    window.addEventListener('keydown', e => {
      const direction = keyMap[e.key];
      if (direction == undefined) {
        document.querySelector('#chat input').focus();
        return;
      }
      if (e.repeat) return;
      event.preventDefault();
      if (currentDirections.includes(direction)) return;
      doMove(direction);
      currentDirections.unshift(direction);
      clearInterval(currentHandle);
      currentHandle = setInterval(() => doMove(currentDirections[0]), 135);
    })
    window.addEventListener('keyup', e => {
      const direction = keyMap[e.key];
      if (direction == undefined) return;
      const idx = currentDirections.indexOf(direction);
      if (idx !== -1) {
        currentDirections.splice(idx, 1);
        if (currentDirections.length === 0) {
          clearInterval(currentHandle);
        }
      }
    })

    const canvas = document.querySelector('canvas')
    canvas.addEventListener('click', ev => handleTap(ev));
    canvas.addEventListener('touchstart', ev => handleTap(ev.changedTouches[0]));
    function handleTap(ev) {
      clearInterval(currentHandle);
      const x = ((ev.clientX - canvas.offsetLeft) * canvas.width / canvas.clientWidth - world.x) / (16 * 2) | 0
      const y = ((ev.clientY - canvas.offsetTop) * canvas.height / canvas.clientHeight - world.y) / (16 * 2) | 0
      const start = myGraph.grid[me.y][me.x];
      const end = myGraph.grid[y][x];
      const path = astar.search(myGraph, start, end)
      if (path.length > 0) {
        // the pathfinding implementation seems to have x and y mixed up but oh well,
        // this code will just be kind of confusing
        let prev = {y: me.x, x: me.y}
        const directions = [];
        for (const next of path) {
          const dx = next.x - prev.x
          const dy = next.y - prev.y
          console.log(dx, dy)
          if (Math.abs(dx) + Math.abs(dy) !== 1) throw new Error('pathfind error; invalid direction')
          else if (dx === -1) directions.push(UP)
          else if (dx === 1) directions.push(DOWN)
          else if (dy === -1) directions.push(LEFT)
          else if (dy === 1) directions.push(RIGHT)
          prev = next
          if (prev.y % 20 === 19 && directions[directions.length-1] === RIGHT) directions.push(RIGHT)
          if (prev.x % 12 === 11 && directions[directions.length-1] === DOWN) directions.push(DOWN)
          if (prev.y % 20 === 0 && directions[directions.length-1] === LEFT) directions.push(LEFT)
          if (prev.x % 12 === 0 && directions[directions.length-1] === UP) directions.push(UP)
        }
        doMove(directions.shift())
        if (directions.length > 0) {
          currentHandle = setInterval(() => {
            doMove(directions.shift())
            if (directions.length === 0) clearInterval(currentHandle)
          }, 135)
        }
      }
    }

    const input = document.querySelector('#chat input')
    input.onkeypress = e => {
      if (e.key === 'Enter' && input.value) {
        applyMessageToSprite(me.id, input.value)
        ws.send(input.value);
        input.value = '';
      }
    }
  });
}