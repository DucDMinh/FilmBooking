// Composite the empty low-back review chair at the 4 review seats of the new
// background (22/10). Anchor = centre of the bottom wheel, nearest-neighbour.
// node scripts/preview-review-seats.mjs [height=70] [dx=-37] [dy=71] [out=review-seats-pilot]
import {readFile,writeFile} from 'node:fs/promises';
import {decode,encode} from './png-rgba.mjs';

const [heightArg,dxArg,dyArg,outName]=process.argv.slice(2);
const targetHeight=Number(heightArg??70),dx=Number(dxArg??-37),dy=Number(dyArg??71);
// keyboard centres on the review desk; seat = keyboard + (dx, dy)
const keyboards=[[150,637],[239,697],[327,757],[422,820]];
const seats=keyboards.map(([x,y])=>[x+dx,y+dy]);

const chair=decode(await readFile('public/assets/furniture/chair_review.png'));
const cw=chair.width,cp=chair.pixels;
let left=cw,right=-1,top=chair.height,bottom=-1;
for(let y=0;y<chair.height;y++)for(let x=0;x<cw;x++)
  if(cp[(y*cw+x)*4+3]>20){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
let sum=0,count=0;
for(let y=bottom-30;y<=bottom;y++)for(let x=left;x<=right;x++)if(cp[(y*cw+x)*4+3]>20){sum+=x;count++;}
const anchorX=sum/count,scale=targetHeight/(bottom-top+1);
const drawW=Math.round((right-left+1)*scale);

const office=decode(await readFile('public/assets/environment/office_original.png'));
const oc=office.pixels.length/(office.width*office.height);
const out=Buffer.alloc(office.width*office.height*4);
for(let i=0,j=0;i<office.pixels.length;i+=oc,j+=4){out[j]=office.pixels[i];out[j+1]=office.pixels[i+1];out[j+2]=office.pixels[i+2];out[j+3]=255;}
for(const [sx,sy] of seats){
  const ox=Math.round(sx-(anchorX-left)*scale),oy=Math.round(sy-targetHeight);
  for(let y=0;y<targetHeight;y++)for(let x=0;x<drawW;x++){
    const i=((top+Math.floor(y/scale))*cw+left+Math.floor(x/scale))*4,a=cp[i+3]/255;
    if(!a)continue;
    const px=ox+x,py=oy+y;
    if(px<0||py<0||px>=office.width||py>=office.height)continue;
    const j=(py*office.width+px)*4;
    for(let k=0;k<3;k++)out[j+k]=Math.round(cp[i+k]*a+out[j+k]*(1-a));
  }
}
const file=`public/assets/environment/${outName??'review-seats-pilot'}.png`;
await writeFile(file,encode({width:office.width,height:office.height,pixels:out}));
console.log(`${file}: chair ${drawW}x${targetHeight} scale=${scale.toFixed(4)} anchorX=${Math.round(anchorX)} seats=${JSON.stringify(seats)}`);
