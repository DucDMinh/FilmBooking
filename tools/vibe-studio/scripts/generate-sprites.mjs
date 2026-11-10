// Deterministic pixel-art character sheets. No external rasterizer or AI atlas crop.
// Draw at 32x48, upscale to 64x96 with nearest-neighbor, encode true RGBA PNG.
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {deflateSync} from 'node:zlib';

const root='public/assets/characters';
const characters=[
  ['Nova','builder','#296bfa','#173888','#35d7fa','spike','headset'],
  ['Orion','builder','#263450','#162b50','#ffc166','sweep','headset'],
  ['Vega','builder','#a4d9fa','#698fcb','#49d6f8','layers','clip'],
  ['Atlas','builder','#17b8a8','#126c72','#79e8c4','messy','headset'],
  ['Comet','builder','#cebcf1','#7467a7','#f0ddff','messy','clip'],
  ['Lyra','builder','#2863c7','#193f83','#65d8ff','sweep','headset'],
  ['Sage','reviewer','#6730a0','#432b74','#c28aff','long','bow'],
  ['Iris','reviewer','#f079ae','#994372','#ffb0cb','tails','bow'],
  ['Juno','reviewer','#bba1ef','#705caa','#a8eaff','long','clip'],
  ['Echo','reviewer','#3f345d','#30254f','#9274d8','long','headset'],
  ['Pixel','design','#8dd9fa','#629aca','#e3faff','bob','tablet'],
  ['Captain','dispatcher','#292b39','#3d435a','#ffb35c','messy','visor'],
  ['Eve','merger','#b991f3','#6a45af','#62edfa','tails','halo'],
  ['Oracle','spec-validator','#34407d','#1c315c','#67e8f9','long','clip'],
  ['Sherlock','error-analyzer','#ef603c','#9d3445','#ffae6a','spike','visor'],
  ['Herald','spec-publisher','#7443af','#53346f','#e8b77d','sweep','tablet'],
  ['Scout','spec-init','#5bd4a9','#338879','#fff0a5','bob','cap'],
  ['Muse','brainstorm','#f38cc0','#96549f','#ffcae1','tails','bow'],
  ['Cartographer','graph','#19a997','#136a73','#b0ead2','long','tablet'],
];
const animations={idle:4,walk_down:4,walk_up:4,walk_left:4,walk_right:4,work:6,sit:4,talk:4};
const W=32,H=48,scale=2,outline='#101b38',skin='#efb899',skinLight='#ffe1bd',pants='#273551',shoe='#101a35';
const rgba=color=>{const hex=color.slice(1);return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)).concat(255)};
function painter(){
  const data=new Uint8Array(W*H*4);
  function dot(x,y,c){x=Math.floor(x);y=Math.floor(y);if(x<0||y<0||x>=W||y>=H)return;data.set(rgba(c),(y*W+x)*4)}
  function rect(x,y,w,h,c){for(let j=Math.max(0,y);j<Math.min(H,y+h);j++)for(let i=Math.max(0,x);i<Math.min(W,x+w);i++)dot(i,j,c)}
  function box(x,y,w,h,c){rect(x-1,y-1,w+2,h+2,outline);rect(x,y,w,h,c)}
  return {data,dot,rect,box};
}
function draw(cfg,animation,frame){
  const [name,,hair,coat,accent,style,item]=cfg;
  const p=painter(),{rect,box}=p;
  const walking=animation.startsWith('walk'),rear=animation==='walk_up'||animation==='work';
  const side=animation==='walk_left'||animation==='walk_right';
  const step=walking?[0,2,0,-2][frame%4]:0;
  const bounce=walking?[0,-1,0,-1][frame%4]:animation==='idle'&&frame===2?-1:0;
  const y=bounce;
  const seated=animation==='sit'||animation==='work';
  const blink=animation==='idle'&&frame===3;
  // Feet remain on the same baseline in every frame; transparent gutters protect the silhouette.
  box(11+(seated?0:step),38,4,seated?3:5,shoe);
  box(18-(seated?0:step),38,4,seated?3:5,shoe);
  if(!seated){box(11+step,34,4,5,pants);box(18-step,34,4,5,pants)}
  else {box(9,35,7,4,pants);box(17,35,7,4,pants)}
  box(9,25+y,15,12,coat);
  rect(10,27+y,2,7,accent);rect(21,27+y,2,7,accent);
  rect(15,26+y,3,9,rear?'#203450':'#e5d8db');
  if(rear){rect(14,29+y,5,2,accent);rect(16,32+y,2,2,accent)}
  // Arms are independently articulated during walk/work/talk, never just a bobbed whole sprite.
  const armSwing=walking?(frame%2?2:-2):animation==='talk'?(frame%2?-3:0):animation==='sit'?frame%2:0;
  if(animation==='work'){
    box(6+(frame%2),27+y,4,6,coat);box(23-(frame%2),26+y,4,6,coat);
    rect(7+(frame%2),31+y,3,2,skin);rect(24-(frame%2),30+y,3,2,skin);
  }else{
    box(6,27+y+armSwing,4,7,coat);box(23,27+y-armSwing,4,7,coat);
    rect(7,33+y+armSwing,3,2,skin);rect(24,33+y-armSwing,3,2,skin);
  }
  // Distinct hairstyles are drawn over a consistent chibi head and 3/4 silhouette.
  if(style==='long'||style==='tails'){
    box(6,12+y,5,19,hair);box(22,12+y,5,19,hair);
    rect(7,24+y,2,6,accent);rect(24,24+y,2,6,accent);
  }
  if(style==='bob'){box(6,12+y,5,15,hair);box(22,12+y,5,15,hair)}
  box(8,9+y,17,17,skin);
  rect(9,11+y,15,4,skinLight);
  if(rear){rect(9,15+y,15,11,hair);rect(11,23+y,11,3,coat)}
  else if(side){
    rect(9,18+y,3,2,'#503454');rect(11,18+y,2,2,'#ffffff');
    rect(19,21+y,2,2,'#dc8d85');rect(14,24+y,5,1,'#b77775');
  }else{
    rect(11,18+y,3,blink?1:3,'#24345e');rect(19,18+y,3,blink?1:3,'#24345e');
    if(!blink){rect(12,18+y,1,1,'#ffffff');rect(20,18+y,1,1,'#ffffff')}
    rect(15,23+y,3,1,animation==='talk'&&frame%2?'#613553':'#c98789');
  }
  box(8,8+y,17,8,hair);
  if(style==='spike'||style==='messy'){
    for(const [x,dy] of [[8,2],[12,4],[18,3],[23,2]]){box(x,6-dy+y,3,6,hair);rect(x+1,6-dy+y,1,2,accent)}
  }else if(style==='sweep'){
    box(7,8+y,19,5,hair);box(8,12+y,10,5,hair);rect(10,8+y,8,2,accent);
  }else if(style==='layers'){
    for(const x of [8,13,19,23])box(x,9+y,4,8,hair);
    rect(10,8+y,10,2,accent);
  }else{
    box(8,7+y,17,7,hair);box(9,12+y,5,5,hair);box(20,12+y,4,4,hair);
    rect(11,8+y,9,2,accent);
  }
  if(style==='tails'){
    box(4,11+y,5,7,hair);box(25,11+y,4,7,hair);
    rect(6,10+y,2,2,accent);rect(26,10+y,2,2,accent);
  }
  if(item==='headset'){
    rect(7,10+y,2,10,outline);rect(25,10+y,2,10,outline);
    rect(7,16+y,3,5,accent);rect(24,16+y,3,5,accent);
    if(!rear){rect(23,22+y,4,1,accent);rect(22,22+y,1,2,accent)}
  }else if(item==='cap'){
    box(7,6+y,19,5,'#f6e8b3');rect(10,7+y,13,2,'#41c69a');rect(4,11+y,11,2,'#f6e8b3');
  }else if(item==='bow'){
    rect(22,8+y,5,3,accent);rect(25,6+y,3,3,accent);rect(24,9+y,2,2,'#fff2e6');
  }else if(item==='visor'){
    box(8,12+y,18,3,accent);rect(10,13+y,12,1,'#ffe5ac');
  }else if(item==='halo'){
    rect(11,5+y,12,1,accent);rect(9,6+y,2,2,accent);rect(23,6+y,2,2,accent);
  }else if(item==='clip'){
    rect(21,10+y,4,2,accent);rect(23,8+y,2,5,'#ffffff');
  }else if(item==='tablet'&&!walking){
    box(25,29+y,5,6,'#273b62');rect(26,30+y,3,3,accent);
  }
  if(name==='Captain')rect(12,30+y,9,2,'#ffb35c');
  if(name==='Sherlock')rect(15,27+y,3,3,'#ff6b61');
  if(name==='Oracle')rect(16,29+y,2,3,'#67e8f9');
  if(animation==='walk_left'){
    const mirrored=new Uint8Array(p.data.length);
    for(let row=0;row<H;row++)for(let col=0;col<W;col++){
      mirrored.set(p.data.subarray((row*W+col)*4,(row*W+col+1)*4),(row*W+(W-1-col))*4);
    }
    return mirrored;
  }
  return p.data;
}
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
function chunk(type,bytes){const tag=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(bytes.length);let c=0xffffffff;for(const b of Buffer.concat([tag,bytes]))c=crcTable[(c^b)&255]^(c>>>8);crc.writeUInt32BE((c^0xffffffff)>>>0);return Buffer.concat([length,tag,bytes,crc])}
function png(frames){
  const width=W*scale*frames.length,height=H*scale,raw=Buffer.alloc(height*(width*4+1));
  for(let y=0;y<height;y++)for(let f=0;f<frames.length;f++)for(let x=0;x<W*scale;x++){
    const src=((Math.floor(y/scale)*W+Math.floor(x/scale))*4),dst=y*(width*4+1)+1+(f*W*scale+x)*4;
    raw.set(frames[f].subarray(src,src+4),dst);
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw, {level:9})),chunk('IEND',Buffer.alloc(0))]);
}
await mkdir(root,{recursive:true});
for(const cfg of characters){
  const [name,role]=cfg,base=join(root,name.toLowerCase());await mkdir(base,{recursive:true});
  for(const [animation,count] of Object.entries(animations)){
    const frames=Array.from({length:count},(_,i)=>draw(cfg,animation,i));
    await writeFile(join(base,`${animation}.png`),png(frames));
  }
  await writeFile(join(base,'stand.png'),png([draw(cfg,'idle',0)]));
  await writeFile(join(base,'manifest.json'),JSON.stringify({id:name,role,anchor:[0.5,1],frameWidth:64,frameHeight:96,animations:Object.fromEntries(Object.entries(animations).map(([key,count])=>[key,{file:`${key}.png`,frames:count,fps:key.startsWith('walk')?8:key==='work'?5:3}]))},null,2)+'\n');
}
console.log(`Generated ${characters.length} RGBA characters × ${Object.keys(animations).length} animation strips in ${root}`);
