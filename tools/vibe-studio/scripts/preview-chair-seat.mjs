// QA composite with a real chair asset: background -> chair -> character.
// Keeps the original office, chair and character files untouched.
import {readFile,writeFile} from 'node:fs/promises';
import {decode,encode} from './png-rgba.mjs';

const folder='public/assets/environment';
const [office,chair,nova,map]=await Promise.all([
  readFile(`${folder}/office_original.png`).then(decode),
  readFile('public/assets/furniture/chair_coding.png').then(decode),
  readFile('public/assets/characters/nova.png').then(decode),
  readFile(`${folder}/seat-map.preview.json`).then(JSON.parse),
]);
const [seatX,seatY]=map.coding_desk_01.seatAnchor;
const chairScale=Number(process.argv[2]??0.075);
const novaScale=Number(process.argv[3]??0.1);
const novaDX=Number(process.argv[4]??0),novaDY=Number(process.argv[5]??0);

function bounds(image,threshold=8){
  let left=image.width,top=image.height,right=-1,bottom=-1;
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)
    if(image.pixels[(y*image.width+x)*4+3]>threshold){
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
  return {left,top,right,bottom};
}
function draw(target,image,scale,anchorX,anchorBottomY){
  const b=bounds(image);
  const width=Math.round((b.right-b.left+1)*scale),height=Math.round((b.bottom-b.top+1)*scale);
  const originX=Math.round(anchorX-((b.left+b.right)/2)*scale);
  const originY=Math.round(anchorBottomY-b.bottom*scale);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const sx0=Math.floor(x/scale)+b.left,sx1=Math.min(image.width,Math.ceil((x+1)/scale)+b.left);
    const sy0=Math.floor(y/scale)+b.top,sy1=Math.min(image.height,Math.ceil((y+1)/scale)+b.top);
    let cover=0,alpha=0,r=0,g=0,bl=0;
    for(let sy=sy0;sy<sy1;sy++)for(let sx=sx0;sx<sx1;sx++){
      const i=(sy*image.width+sx)*4,a=image.pixels[i+3]/255;
      cover++;alpha+=a;r+=image.pixels[i]*a;g+=image.pixels[i+1]*a;bl+=image.pixels[i+2]*a;
    }
    if(!alpha)continue;
    const px=originX+x,py=originY+y;
    if(px<0||py<0||px>=target.width||py>=target.height)continue;
    const i=(py*target.width+px)*4,opacity=alpha/cover;
    const cr=r/cover,cg=g/cover,cb=bl/cover;
    target.pixels[i]=Math.round(cr+target.pixels[i]*(1-opacity));
    target.pixels[i+1]=Math.round(cg+target.pixels[i+1]*(1-opacity));
    target.pixels[i+2]=Math.round(cb+target.pixels[i+2]*(1-opacity));
  }
  return {width,height,originX,originY};
}
const empty=Buffer.from(office.pixels),occupied=Buffer.from(office.pixels);
const emptyTarget={width:office.width,height:office.height,pixels:empty};
const occupiedTarget={width:office.width,height:office.height,pixels:occupied};
draw(emptyTarget,chair,chairScale,seatX,seatY);
draw(occupiedTarget,chair,chairScale,seatX,seatY);
draw(occupiedTarget,nova,novaScale,seatX+novaDX,seatY+novaDY);
await writeFile(`${folder}/chair-seat-empty.png`,encode({width:office.width,height:office.height,pixels:empty}));
await writeFile(`${folder}/chair-seat-pilot.png`,encode({width:office.width,height:office.height,pixels:occupied}));
console.log(`chair scale ${chairScale}, nova scale ${novaScale}, seat (${seatX},${seatY})`);
