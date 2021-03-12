import { Loader, Rectangle, Texture } from './vendor/pixi.js';

const loader = Loader.shared;

loader.add('bg', 'graphics/bg.png');
loader.add('sprites', 'graphics/sprites.png');
loader.add('tiles', 'graphics/tiles.png');

export const ready = new Promise(resolve => loader.load(resolve));

const resources = loader.resources;

function tex(name) {
  return resources[name].texture;
}

function split(name, w, h) {
  const base = tex(name).baseTexture
  const arr = [];
  for(let y = 0; y+h <= base.height; y+=h) {
    for (let x = 0; x+w <= base.width; x+=w) {
      const rect = new Rectangle(x, y, w, h);
      arr.push(new Texture(base, rect));
    }
  }
  return arr;
}

export let tileTextures = null;
ready.then(() => tileTextures = split('tiles', 16, 16))

export let spriteTextures = null;
ready.then(() => spriteTextures = split('sprites', 16, 16))

export let bgTexture = null;
ready.then(() => bgTexture = tex('bg'));
