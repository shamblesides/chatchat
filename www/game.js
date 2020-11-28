import { settings, SCALE_MODES, Application, Sprite, Container, Ticker } from './pixi.js';
import { ready, spriteTextures, tileTextures } from './textures.js';
import { MAP_TILES } from './map.js';
const SCRW = 320/2; 
const SCRH = 192/2; // 3:5 aspect ratio for screen part

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
  world.x = -500;
  world.y = -200;
  application.stage.addChild(world);

  const tilemap = new Container();
  tilemap.cacheAsBitmap = true;
  world.addChild(tilemap);

  let scrollx = 0, scrolly = 0;

  Ticker.shared.add(() => {
    world.x += scrollx;
    world.y += scrolly;
  })

  window.addEventListener('keydown', e => {
    scrollx = 0;
    scrolly = 0;
    console.log(e.key)
    if (e.key === 'ArrowUp') scrolly = +1;
    if (e.key === 'ArrowDown') scrolly = -1;
    if (e.key === 'ArrowLeft') scrollx = +1;
    if (e.key === 'ArrowRight') scrollx = -1;
  })

  MAP_TILES.forEach((row, y) => {
    row.forEach((tile, x) => {
      const spr = new Sprite(tileTextures[tile]);
      spr.x = x * 16;
      spr.y = y * 16;
      tilemap.addChild(spr);
    });
  });

  const sprite = new Sprite(spriteTextures[0]);
  sprite.x = 10;
  sprite.y = 10;
  world.addChild(sprite)
})