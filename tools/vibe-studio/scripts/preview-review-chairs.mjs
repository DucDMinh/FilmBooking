// Rotate the supplied review chair to the bench diagonal and composite it.
// Nearest-neighbour only: no blur is introduced into the pixel art.
import {readFile,writeFile} from 'node:fs/promises';
import {decode,encode} from './png-rgba.mjs';

const [angleArg,mirrorArg,seatArg,outName,heightArg]=process.argv.slice(2);
const angle=Number(angleArg??0),mirror=mirrorArg==='mirror';
const targetHeight=Number(heightArg??94);
const seats=[[152,696],[232,742],[312,788],[392,826]];
const only=seatArg==='one'?[seats[0]]:seats;

const source=decode(await readFile('public/assets/furniture/chair_review.png'));
let image=source;
if(mirror){
  const flip=Buffer.alloc(image.pixels.length);
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)
    image.pixels.copy(flip,(y*image.width+(image.width-1-x))*4,(y*image.width+x)*4,(y*image.width+x+1)*4);
  image={width:image.width,height:image.height,pixels:flip};
}
if(angle!==0){
  const rad=angle*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad);
  const width=Math.ceil(Math.abs(image.width*cos)+Math.abs(image.height*sin));
  const height=Math.ceil(Math.abs(image.width*sin)+Math.abs(image.height*cos));
  const pixels=Buffer.alloc(width*height*4);
  const cx=image.width/2,cy=image.height/2,nx=width/2,ny=height/2;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const dx=x-nx,dy=y-ny;
    const sx=Math.round(cx+dx*cos+dy*sin),sy=Math.round(cy-dx*sin+dy*cos);
    if(sx<0||sy<0||sx>=image.width||sy>=image.height)continue;
    image.pixels.copy(pixels,(y*width+x)*4,(sy*image.width+sx)*4,(sy*image.width+sx+1)*4);
  }
  image={width,height,pixels};
}

let left=image.width,right=-1,top=image.height,bottom=-1;
for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)
  if(image.pixels[(y*image.width+x)*4+3]>8){
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
const scale=targetHeight/(bottom-top+1);
const drawWidth=Math.round((right-left+1)*scale),drawHeight=targetHeight;

const office=decode(await readFile('public/assets/environment/office_original.png'));
const output=Buffer.from(office.pixels);
for(const [seatX,seatY] of only){
  const originX=Math.round(seatX-(left+right)/2*scale),originY=Math.round(seatY-bottom*scale);
  for(let y=0;y<drawHeight;y++)for(let x=0;x<drawWidth;x++){
    const sx=Math.floor(x/scale)+left,sy=Math.floor(y/scale)+top;
    const i=(sy*image.width+sx)*4,alpha=image.pixels[i+3];
    if(!alpha)continue;
    const px=originX+x,py=originY+y;
    if(px<0||py<0||px>=office.width||py>=office.height)continue;
    const j=(py*office.width+px)*4,a=alpha/255;
    for(let k=0;k<3;k++)output[j+k]=Math.round(image.pixels[i+k]*a+output[j+k]*(1-a));
  }
}
const file=`public/assets/environment/${outName??'review-chairs-pilot'}.png`;
await writeFile(file,encode({width:office.width,height:office.height,pixels:output}));
console.log(`${file}: angle=${angle} mirror=${mirror} chair=${drawWidth}x${drawHeight}`);
