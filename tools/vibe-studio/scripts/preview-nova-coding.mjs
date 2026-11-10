// QA composite of the coding zone: baked Nova+chair sprite on occupied seats, empty chair_coding on the rest;
// also writes a 2x crop of the zone. Both are anchored at the centre wheel's floor contact (not bbox centre —
// Nova's right foot sticks out) and share the same seat + offsetX, so swapping empty <-> occupied doesn't jump.
// Usage: node scripts/preview-nova-coding.mjs [occupied=0,1,2,3,4,5]
import {readFile,writeFile} from 'node:fs/promises';
import {decode,encode} from './png-rgba.mjs';

const seats=[
  [553,530],[746,530],[945,530],
  [566,695],[763,695],[962,695],
];
const offsetX=-20;
const occupied=new Set((process.argv[2]??'0,1,2,3,4,5').split(',').filter(Boolean).map(Number));
const office=decode(await readFile('public/assets/environment/office_original.png'));
const output=Buffer.from(office.pixels);

async function load(file,scale,anchorX){
  const image=decode(await readFile(file));
  let left=image.width,right=-1,top=image.height,bottom=-1;
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)
    if(image.pixels[(y*image.width+x)*4+3]>8){
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
  return {image,scale,anchorX,left,top,bottom,width:Math.round((right-left+1)*scale),height:Math.round((bottom-top+1)*scale)};
}
const nova=await load('public/assets/furniture/nova_chair_coding.png',0.115,555);
const chair=await load('public/assets/furniture/chair_coding.png',0.08,628);

function draw({image,scale,anchorX,left,top,bottom,width,height},seatX,seatY){
  const originX=Math.round(seatX+offsetX-(anchorX-left)*scale),originY=Math.round(seatY-(bottom-top+1)*scale);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const sx=Math.floor(x/scale)+left,sy=Math.floor(y/scale)+top,i=(sy*image.width+sx)*4,alpha=image.pixels[i+3];
    if(!alpha)continue;
    const px=originX+x,py=originY+y;
    if(px<0||py<0||px>=office.width||py>=office.height)continue;
    const j=(py*office.width+px)*4,a=alpha/255;
    for(let k=0;k<3;k++)output[j+k]=Math.round(image.pixels[i+k]*a+output[j+k]*(1-a));
  }
}
// Back row first so the front row overlaps it.
seats.forEach(([x,y],index)=>draw(occupied.has(index)?nova:chair,x,y));
await writeFile('public/assets/environment/nova-coding-pilot.png',encode({width:office.width,height:office.height,pixels:output}));

const [cropX,cropY,cropW,cropH,zoom]=[400,330,660,430,2],crop=Buffer.alloc(cropW*zoom*cropH*zoom*4);
for(let y=0;y<cropH*zoom;y++)for(let x=0;x<cropW*zoom;x++){
  const i=((cropY+Math.floor(y/zoom))*office.width+cropX+Math.floor(x/zoom))*4;
  output.copy(crop,(y*cropW*zoom+x)*4,i,i+4);
}
await writeFile('public/assets/environment/nova-coding-pilot-zoom.png',encode({width:cropW*zoom,height:cropH*zoom,pixels:crop}));
console.log(`Nova ${nova.width}x${nova.height}px on [${[...occupied]}], empty chair ${chair.width}x${chair.height}px elsewhere`);
