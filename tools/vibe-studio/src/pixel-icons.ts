// Cute pixel-art icons drawn in code (replaces OS emoji, which render blurry and differ per platform).
// Each map is a grid of palette letters; '.' is transparent. Textures are generated once at 1 px per cell
// with nearest sampling, then shown scaled up as crisp sprites.
import {Graphics,Sprite,Texture,type Renderer} from 'pixi.js';

const PALETTE:Record<string,string>={
  K:'#2b1a2e', // outline
  W:'#ffffff',
  P:'#ff7fb0', // pink
  V:'#b98cff', // violet
  Y:'#ffd84d', // yellow
  L:'#fff3b0', // light yellow
  O:'#ff8a3d', // orange
  R:'#ff5a6e', // coral red
  M:'#5fe3b8', // mint
  G:'#7ed957', // green
  D:'#3f9e3a', // dark green
  B:'#6fc3ff', // blue
  C:'#f3e3c8', // cream
  N:'#7a4a2a', // brown
  S:'#c9d2e3', // steam grey
  Q:'#7a86a8', // grey-blue
};

const MAPS:Record<string,string[]>={
  heart:[
    '..KKK.KKK..',
    '.KPPPKPPPK.',
    'KPWWPPPPPPK',
    'KPWPPPPPPPK',
    'KPPPPPPPPPK',
    '.KPPPPPPPK.',
    '..KPPPPPK..',
    '...KPPPK...',
    '....KPK....',
    '.....K.....'],
  heart_v:[
    '..KKK.KKK..',
    '.KVVVKVVVK.',
    'KVWWVVVVVVK',
    'KVWVVVVVVVK',
    'KVVVVVVVVVK',
    '.KVVVVVVVK.',
    '..KVVVVVK..',
    '...KVVVK...',
    '....KVK....',
    '.....K.....'],
  star:[
    '.....K.....',
    '....KYK....',
    '...KYYYK...',
    'KKKYYYYYKKK',
    'KYYWYYYYYYK',
    '.KYYYYYYYK.',
    '..KYYYYYK..',
    '..KYYKYYK..',
    '.KYYK.KYYK.',
    '.KKK...KKK.'],
  sparkle:[
    '....K....',
    '...KLK...',
    '...KLK...',
    '.KKLWLKK.',
    'KLLWWWLLK',
    '.KKLWLKK.',
    '...KLK...',
    '...KLK...',
    '....K....'],
  check:[
    '...KKKKK...',
    '.KKMMMMMKK.',
    '.KMMMMMMMK.',
    'KMMMMMMMWWK',
    'KMMMMMMWWMK',
    'KMWWMMWWMMK',
    'KMMWWWWMMMK',
    '.KMMWWMMMK.',
    '.KKMMMMMKK.',
    '...KKKKK...'],
  cross:[
    '...KKKKK...',
    '.KKRRRRRKK.',
    '.KRRRRRRRK.',
    'KRWWRRRWWRK',
    'KRRWWRWWRRK',
    'KRRRWWWRRRK',
    'KRRWWRWWRRK',
    '.KWWRRRWWK.',
    '.KKRRRRRKK.',
    '...KKKKK...'],
  bug:[
    '..K.....K..',
    '...K...K...',
    '..KKKKKKK..',
    '.KDDDDDDDK.',
    'KGGGGKGGGGK',
    'KGWGGKGGDGK',
    'KGGDGKGGGGK',
    'KGGGGKGDGGK',
    '.KGGGKGGGK.',
    '..KKKKKKK..'],
  coffee:[
    '..S..S..S..',
    '...S..S..S.',
    '..S..S..S..',
    '.KKKKKKKK..',
    '.KNNNNNNKKK',
    '.KWCCCCCK.K',
    '.KWCCCCCK.K',
    '.KCCCCCCKKK',
    '.KCCCCCCK..',
    '..KKKKKK...'],
  question:[
    '.KKKKKKKKK.',
    'KWWWWWWWWWK',
    'KWWWVVVWWWK',
    'KWWVWWWVWWK',
    'KWWWWWWVWWK',
    'KWWWWWVWWWK',
    'KWWWWVWWWWK',
    'KWWWWWWWWWK',
    'KWWWWVWWWWK',
    '.KKKKKKKKK.'],
  exclaim:[
    '...KKK...',
    '..KRRRK..',
    '..KRWRK..',
    '..KRRRK..',
    '...KRK...',
    '...KRK...',
    '....K....',
    '...KKK...',
    '..KRRRK..',
    '...KKK...'],
  fire:[
    '....K......',
    '...KOK.....',
    '...KOOK..K.',
    '..KOOOOKKOK',
    '.KOOYOOOOOK',
    '.KOYYYOOOK.',
    'KOOYWYYOOK.',
    'KOYYWWYYOK.',
    'KOYYWWWYOK.',
    '.KOYYYYOK..',
    '..KKKKKK...'],
  drop:[
    '...K...',
    '..KBK..',
    '..KBK..',
    '.KBBBK.',
    'KBWBBBK',
    'KBWBBBK',
    'KBBBBBK',
    '.KBBBK.',
    '..KKK..'],
  laugh:[
    '...KKKKK...',
    '.KKYYYYYKK.',
    '.KYWYYYYYK.',
    'KYYKYYYKYYK',
    'KYKYKYKYKYK',
    'KYYYYYYYYYK',
    'KPYKKKKKYPK',
    '.KYKRRRKYK.',
    '.KKYKKKYKK.',
    '...KKKKK...'],
  note:[
    'KKKKKKKKK',
    'KYYYYYYYK',
    'KYKKKKKYK',
    'KYYYYYYYK',
    'KYKKKKYYK',
    'KYYYYYYYK',
    'KYKKKYYYK',
    'KYYYYYYKK',
    'KKKKKKKK.'],
  chat:[
    '.KKKKKKKKK.',
    'KWWWWWWWWWK',
    'KWWWWWWWWWK',
    'KWQQWQQWQQK',
    'KWQQWQQWQQK',
    'KWWWWWWWWWK',
    '.KKKKKWKKK.',
    '.....KWK...',
    '......KK...'],
  music:[
    '....KK...',
    '....KVK..',
    '....KVVK.',
    '....KVKVK',
    '....KVK.K',
    '....KVK..',
    '..KKKVK..',
    '.KVVVVK..',
    'KVVWVVK..',
    'KVVVVK...',
    '.KKKK....'],
  idea:[
    '...KKKKK...',
    '..KYYYYYK..',
    '.KYWWYYYYK.',
    'KYWWYYYYYYK',
    'KYWYYYYYYYK',
    'KYYYYYYYYOK',
    '.KYYYYYYOK.',
    '..KYYYYOK..',
    '...KYYOK...',
    '...KQQQK...',
    '...KSSSK...',
    '....KKK....'],
};

export type IconName=keyof typeof MAPS;
export const ICON_NAMES=Object.keys(MAPS) as IconName[];
const textures:Partial<Record<string,Texture>>={};

export function buildIcons(renderer:Renderer){
  for(const [name,rows] of Object.entries(MAPS)){
    const g=new Graphics();
    rows.forEach((row,y)=>[...row].forEach((c,x)=>{if(c!=='.')g.rect(x,y,1,1).fill(PALETTE[c])}));
    const tex=renderer.generateTexture({target:g,resolution:1,antialias:false});
    tex.source.scaleMode='nearest';
    textures[name]=tex;
    g.destroy();
  }
}

export const isIcon=(name:string)=>name in MAPS;

// A crisp icon sprite, centred; `size` is the on-screen height in px.
export function iconSprite(name:string,size=18){
  const tex=textures[name]??Texture.EMPTY;
  const s=new Sprite(tex);s.anchor.set(.5);
  s.scale.set(size/(tex.height||1));
  return s;
}
export function setIcon(s:Sprite,name:string,size=18){
  const tex=textures[name]??Texture.EMPTY;
  s.texture=tex;s.scale.set(size/(tex.height||1));
}
