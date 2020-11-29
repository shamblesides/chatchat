import { settings, SCALE_MODES, Application, Sprite, Container, Ticker } from './pixi.js';
import { ready, spriteTextures, tileTextures } from './textures.js';
import { MAP_TILES } from './map.js';
const SCRW = 16 * 10;
const SCRH = 16 * 6;

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

  const me = { x: 20, y: 20 };
  const sprite = new Sprite(spriteTextures[0]);
  world.addChild(sprite)

  function updatePlayerAndCamera() {
    const cameraX = Math.max(5, Math.min(20-5-1, me.x % 20)) + Math.floor(me.x/20)*20;
    const cameraY = Math.max(3, Math.min(12-3-1, me.y % 12)) + Math.floor(me.y/12)*12;
    sprite.x = me.x * 16;
    sprite.y = me.y * 16;
    world.x = -(cameraX * 16) + SCRW/2 - 8;
    world.y = -(cameraY * 16) + SCRH/2 - 8;
  }
  updatePlayerAndCamera();

  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.key === 'ArrowUp') me.y -= 1;
    if (e.key === 'ArrowDown') me.y += 1;
    if (e.key === 'ArrowLeft') me.x -= 1;
    if (e.key === 'ArrowRight') me.x += 1;
    updatePlayerAndCamera();
  })
})