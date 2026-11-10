// QA composite of empty chairs on the chair-less office background.
// Same placement as the baked Nova sprite: seat + offsetX, anchored at the centre wheel's floor contact.
// Scale 0.08 makes chair_coding match the chair inside nova_chair_coding at 0.115 (~67x79 px).
// Usage: node scripts/preview-coding-chairs.mjs [scale=0.08] [anchorX=628] [offsetX=-20]
import {readFile,writeFile} from 'node:fs/promises';
import {decode,encode} from './png-rgba.mjs';

const seats=[
  [553,530],[746,530],[945,530],
  [566,695],[763,695],[962,695],
];
const scale=Number(process.argv[2]??0.08),anchorX=Number(process.argv[3]??628),offsetX=Number(process.argv[4]??-20);
const office=decode(await readFile('public/assets/environment/office_original.png'));
const chair=decode(await readFile('public/assets/furniture/chair_coding.png'));
const output=Buffer.from(office.pixels);

let left=chair.width,right=-1,top=chair.height,bottom=-1;
for(let y=0;y<chair.height;y++)for(let x=0;x<chair.width;x++)
  if(chair.pixels[(y*chair.width+x)*4+3]>8){
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
const width=Math.round((right-left+1)*scale),height=Math.round((bottom-top+1)*scale);

for(const [seatX,seatY] of seats){
  const originX=Math.round(seatX+offsetX-(anchorX-left)*scale),originY=Math.round(seatY-(bottom-top+1)*scale);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const sx=Math.floor(x/scale)+left,sy=Math.floor(y/scale)+top,i=(sy*chair.width+sx)*4,alpha=chair.pixels[i+3];
    if(!alpha)continue;
    const px=originX+x,py=originY+y;
    if(px<0||py<0||px>=office.width||py>=office.height)continue;
    const j=(py*office.width+px)*4,a=alpha/255;
    for(let k=0;k<3;k++)output[j+k]=Math.round(chair.pixels[i+k]*a+output[j+k]*(1-a));
  }
}
await writeFile('public/assets/environment/chairs-coding-pilot.png',encode({width:office.width,height:office.height,pixels:output}));
console.log(`Rendered ${seats.length} chairs at scale ${scale}: ${width}x${height}px each`);
