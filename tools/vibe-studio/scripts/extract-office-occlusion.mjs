// Pilot occlusion layer cut from the exact office PNG; no second AI render.
// Polygons are absolute source-image coordinates. Only the first coding chair is
// authored so far; calibrate against the final seated sprite before doing the rest.
import {readFile,writeFile} from 'node:fs/promises';
import {decode,encode} from './png-rgba.mjs';

const source='public/assets/environment/office_original.png';
const output='public/assets/environment/coding_desk_01_foreground.png';
const image=decode(await readFile(source));
if(image.width!==1495||image.height!==1052)throw Error('Office source dimensions changed; recalibrate occlusion polygons first');
const pixels=Buffer.alloc(image.width*image.height*4);

// The camera sits behind the chair, so these chair parts are in front of the
// seated character's lower body. Monitors stay behind the sprite and are excluded.
const polygons=[
  [[518,461],[553,461],[556,481],[520,482]], // backrest
  [[505,470],[518,469],[520,490],[506,491]], // left armrest
  [[552,470],[567,471],[566,491],[551,490]], // right armrest
  [[512,483],[557,483],[561,500],[510,500]], // seat front
];
function contains(x,y,points){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const [xi,yi]=points[i],[xj,yj]=points[j];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}
for(const polygon of polygons){
  const x0=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p[0]))));
  const x1=Math.min(image.width,Math.ceil(Math.max(...polygon.map(p=>p[0]))));
  const y0=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p[1]))));
  const y1=Math.min(image.height,Math.ceil(Math.max(...polygon.map(p=>p[1]))));
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
    if(contains(x+.5,y+.5,polygon)){
      const offset=(y*image.width+x)*4;
      image.pixels.copy(pixels,offset,offset,offset+4);
    }
  }
}
await writeFile(output,encode({width:image.width,height:image.height,pixels}));
console.log(`Wrote pilot foreground ${output} (${image.width}x${image.height}), aligned to ${source}`);
