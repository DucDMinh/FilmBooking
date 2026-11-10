// Non-runtime QA composite. Never edits the supplied Nova or office originals.
import {readFile,writeFile} from 'node:fs/promises';
import {decode,encode} from './png-rgba.mjs';

const folder='public/assets/environment';
const [office,nova,foreground,map]=await Promise.all([
  readFile(`${folder}/office_original.png`).then(decode),
  readFile('public/assets/characters/nova.png').then(decode),
  readFile(`${folder}/coding_desk_01_foreground.png`).then(decode),
  readFile(`${folder}/seat-map.preview.json`).then(JSON.parse),
]);
if(office.width!==foreground.width||office.height!==foreground.height)throw Error('Occlusion and office dimensions differ');
const scale=Number(process.argv[2]??0.085),seatX=Number(process.argv[3]??map.coding_desk_01.seatAnchor[0]),seatY=Number(process.argv[4]??map.coding_desk_01.seatAnchor[1]);
const output=Buffer.from(office.pixels),drawWidth=Math.round(nova.width*scale),drawHeight=Math.round(nova.height*scale);
// Anchor the bounds of painted pixels instead of transparent export padding.
let left=nova.width,right=0,bottom=0;
for(let y=0;y<nova.height;y++)for(let x=0;x<nova.width;x++)if(nova.pixels[(y*nova.width+x)*4+3]>8){left=Math.min(left,x);right=Math.max(right,x);bottom=Math.max(bottom,y)}
const originX=Math.round(seatX-(left+right)*scale/2),originY=Math.round(seatY-bottom*scale);
for(let y=0;y<drawHeight;y++)for(let x=0;x<drawWidth;x++){
  const startX=Math.floor(x/scale),endX=Math.min(nova.width,Math.ceil((x+1)/scale));
  const startY=Math.floor(y/scale),endY=Math.min(nova.height,Math.ceil((y+1)/scale));
  let coverage=0,a=0,r=0,g=0,b=0;
  for(let sy=startY;sy<endY;sy++)for(let sx=startX;sx<endX;sx++){
    const i=(sy*nova.width+sx)*4,alpha=nova.pixels[i+3]/255;
    coverage++;a+=alpha;r+=nova.pixels[i]*alpha;g+=nova.pixels[i+1]*alpha;b+=nova.pixels[i+2]*alpha;
  }
  if(!a)continue;
  const px=originX+x,py=originY+y;if(px<0||py<0||px>=office.width||py>=office.height)continue;
  const i=(py*office.width+px)*4,opacity=a/coverage;
  output[i]=Math.round(r/coverage+output[i]*(1-opacity));
  output[i+1]=Math.round(g/coverage+output[i+1]*(1-opacity));
  output[i+2]=Math.round(b/coverage+output[i+2]*(1-opacity));
}
const maskMode=process.argv[5]??'chair';
if(maskMode==='chair')for(let i=0;i<foreground.pixels.length;i+=4)if(foreground.pixels[i+3])foreground.pixels.copy(output,i,i,i+4);
const file=`${folder}/nova-seat-pilot.png`;
await writeFile(file,encode({width:office.width,height:office.height,pixels:output}));
console.log(`Wrote ${file}; scale=${scale}, seat=(${seatX},${seatY}), sprite origin=(${originX},${originY})`);
