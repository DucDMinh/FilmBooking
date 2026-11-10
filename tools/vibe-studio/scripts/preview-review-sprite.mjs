// Composite a seated reviewer sprite (chair baked) on the review seats, empty
// review chairs on the others, to tune scale/anchor. A comma list of sprites
// is dealt to the occupied seats in order; `file.png@0.31` overrides the scale for that sprite. Anchor = centre of the
// bottom wheel (mean x of the last 30 rows), bottom of bbox. Nearest-neighbour.
// node scripts/preview-review-sprite.mjs [sprite=public/assets/characters/violet.png | a.png,b.png,...]
//   [spriteScale=0.110] [occupied=0,2] [dx=-37] [dy=71] [out=review-sprite-pilot]
import {readFile,writeFile} from 'node:fs/promises';
import {decode,encode} from './png-rgba.mjs';

const [spriteArg,scaleArg,occArg,dxArg,dyArg,outName]=process.argv.slice(2);
const spritePaths=(spriteArg??'public/assets/characters/violet.png').split(',');
const spriteScale=Number(scaleArg??0.110),dx=Number(dxArg??-37),dy=Number(dyArg??71);
const occupied=new Set((occArg??'0,2').split(',').filter(Boolean).map(Number));
const CHAIR_HEIGHT=70;
const keyboards=[[150,637],[239,697],[327,757],[422,820]];
const seats=keyboards.map(([x,y])=>[x+dx,y+dy]);

function measure(img){
  const {width:w,height:h,pixels:p}=img;
  let left=w,right=-1,top=h,bottom=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(p[(y*w+x)*4+3]>20){
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  let sum=0,count=0;
  for(let y=bottom-30;y<=bottom;y++)for(let x=left;x<=right;x++)if(p[(y*w+x)*4+3]>20){sum+=x;count++;}
  return {left,right,top,bottom,anchorX:sum/count};
}
function draw(out,ow,oh,img,m,scale,seatX,seatY){
  const w=img.width,p=img.pixels;
  const drawW=Math.round((m.right-m.left+1)*scale),drawH=Math.round((m.bottom-m.top+1)*scale);
  const ox=Math.round(seatX-(m.anchorX-m.left)*scale),oy=Math.round(seatY-drawH);
  for(let y=0;y<drawH;y++)for(let x=0;x<drawW;x++){
    const i=((m.top+Math.floor(y/scale))*w+m.left+Math.floor(x/scale))*4,a=p[i+3]/255;
    if(!a)continue;
    const px=ox+x,py=oy+y;
    if(px<0||py<0||px>=ow||py>=oh)continue;
    const j=(py*ow+px)*4;
    for(let k=0;k<3;k++)out[j+k]=Math.round(p[i+k]*a+out[j+k]*(1-a));
  }
  return [drawW,drawH];
}

const sprites=await Promise.all(spritePaths.map(async entry=>{
  const [f,s]=entry.split('@');const img=decode(await readFile(f));
  return {img,m:measure(img),scale:s?Number(s):spriteScale};
}));
const chair=decode(await readFile('public/assets/furniture/chair_review.png')),cm=measure(chair);
const chairScale=CHAIR_HEIGHT/(cm.bottom-cm.top+1);
const office=decode(await readFile('public/assets/environment/office_original.png'));
const oc=office.pixels.length/(office.width*office.height);
const out=Buffer.alloc(office.width*office.height*4);
for(let i=0,j=0;i<office.pixels.length;i+=oc,j+=4){out[j]=office.pixels[i];out[j+1]=office.pixels[i+1];out[j+2]=office.pixels[i+2];out[j+3]=255;}
let size,dealt=0;
seats.forEach(([x,y],n)=>{
  if(occupied.has(n)){const s=sprites[dealt++%sprites.length];size=draw(out,office.width,office.height,s.img,s.m,s.scale,x,y);}
  else draw(out,office.width,office.height,chair,cm,chairScale,x,y);
});
const file=`public/assets/environment/${outName??'review-sprite-pilot'}.png`;
await writeFile(file,encode({width:office.width,height:office.height,pixels:out}));
console.log(`${file}: sprite ${size?.join('x')} scale=${spriteScale} anchorX=${sprites.map(s=>Math.round(s.m.anchorX)).join('/')} seats=${JSON.stringify(seats)}`);
