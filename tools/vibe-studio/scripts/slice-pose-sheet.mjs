// Slice a transparent pose sheet (cols x rows grid, a filename label under each sprite) into one PNG per pose.
// Per grid cell: the largest opaque blob is the sprite; nearby small blobs (mic tips, loose hair) are kept,
// the label text below the sprite is dropped. Each sprite is cropped with a transparent margin.
// Usage: node scripts/slice-pose-sheet.mjs <sheet.png> <outDir> <cols> <rows> <name1> <name2> ...
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {decode,encode} from './png-rgba.mjs';

const [sheetPath,outDir,colsArg,rowsArg,...names]=process.argv.slice(2);
const cols=Number(colsArg),rows=Number(rowsArg),margin=8,near=15;
const {width,height,pixels}=decode(await readFile(sheetPath));
const opaque=i=>pixels[i*4+3]>8;

// Sheets with a baked (fake) checkerboard have no real alpha: flood-fill from the border through light,
// unsaturated pixels and clear them. Dark sprite outlines stop the fill, so white soles/headsets inside survive.
const magenta=p=>pixels[p*4]>=180&&pixels[p*4+1]<=90&&pixels[p*4+2]>=180;
const noAlpha=!pixels.some((v,i)=>i%4===3&&v<250);
// Flat magenta (#FF00FF) chroma-key background: clear every magenta pixel, and fade magenta-tinted fringes.
if(noAlpha&&magenta(0)&&magenta(width-1)){
  let cleared=0;
  for(let p=0;p<width*height;p++){
    const r=pixels[p*4],g=pixels[p*4+1],b=pixels[p*4+2];
    if(magenta(p)){pixels[p*4+3]=0;cleared++}
    else if(r-g>60&&b-g>60){pixels[p*4+3]=Math.round(255*Math.max(0,1-(Math.min(r,b)-g)/200))}
  }
  console.log(`magenta background: cleared ${cleared} pixels`);
}else if(noAlpha){
  const light=p=>{const r=pixels[p*4],g=pixels[p*4+1],b=pixels[p*4+2];return Math.min(r,g,b)>=190&&Math.max(r,g,b)-Math.min(r,g,b)<=14};
  const stack=[];
  for(let x=0;x<width;x++)stack.push(x,(height-1)*width+x);
  for(let y=0;y<height;y++)stack.push(y*width,y*width+width-1);
  let cleared=0;
  while(stack.length){
    const p=stack.pop();
    if(pixels[p*4+3]===0||!light(p))continue;
    pixels[p*4+3]=0;cleared++;
    const x=p%width,y=(p-x)/width;
    if(x>0)stack.push(p-1);if(x<width-1)stack.push(p+1);if(y>0)stack.push(p-width);if(y<height-1)stack.push(p+width);
  }
  // Checker pockets trapped between legs/armrests: enclosed light regions made of BOTH checker tones
  // (~215 and ~250). White soles and headsets are mostly one bright tone, so they are kept.
  const seen=new Uint8Array(width*height);
  for(let p=0;p<width*height;p++){
    if(seen[p]||!pixels[p*4+3]||!light(p))continue;
    const region=[p],queue=[p];seen[p]=1;
    while(queue.length){
      const q=queue.pop(),x=q%width,y=(q-x)/width;
      for(const r of [x>0?q-1:-1,x<width-1?q+1:-1,y>0?q-width:-1,y<height-1?q+width:-1])
        if(r>=0&&!seen[r]&&pixels[r*4+3]&&light(r)){seen[r]=1;queue.push(r);region.push(r)}
    }
    if(region.length<20)continue;
    let darkTone=0,lightTone=0;
    for(const q of region){const lum=pixels[q*4];if(lum<=232)darkTone++;else if(lum>=240)lightTone++}
    if(darkTone>=region.length*0.25&&lightTone>=region.length*0.25){for(const q of region)pixels[q*4+3]=0;cleared+=region.length}
  }
  // Soften the light anti-aliased fringe left around the outlines.
  for(let p=0;p<width*height;p++){
    if(!pixels[p*4+3])continue;
    const x=p%width,y=(p-x)/width;
    const edge=[x>0?p-1:-1,x<width-1?p+1:-1,y>0?p-width:-1,y<height-1?p+width:-1].some(q=>q>=0&&!pixels[q*4+3]);
    const lum=Math.min(pixels[p*4],pixels[p*4+1],pixels[p*4+2]);
    if(edge&&lum>130)pixels[p*4+3]=Math.max(0,Math.round(255*(230-lum)/100));
  }
  console.log(`baked background: cleared ${cleared} pixels`);
}

// Label every opaque blob (4-connected).
const label=new Int32Array(width*height).fill(-1),blobs=[];
for(let p=0;p<width*height;p++){
  if(!opaque(p)||label[p]>=0)continue;
  const blob={left:width,right:-1,top:height,bottom:-1,size:0,id:blobs.length},stack=[p];label[p]=blob.id;
  while(stack.length){
    const q=stack.pop(),x=q%width,y=(q-x)/width;
    blob.size++;blob.left=Math.min(blob.left,x);blob.right=Math.max(blob.right,x);blob.top=Math.min(blob.top,y);blob.bottom=Math.max(blob.bottom,y);
    for(const r of [x>0?q-1:-1,x<width-1?q+1:-1,y>0?q-width:-1,y<height-1?q+width:-1])
      if(r>=0&&label[r]<0&&opaque(r)){label[r]=blob.id;stack.push(r)}
  }
  blobs.push(blob);
}

await mkdir(outDir,{recursive:true});
const cellW=width/cols,cellH=height/rows;
for(let n=0;n<names.length;n++){
  const cx=n%cols,cy=Math.floor(n/cols);
  const inCell=blobs.filter(b=>{const mx=(b.left+b.right)/2,my=(b.top+b.bottom)/2;return mx>=cx*cellW&&mx<(cx+1)*cellW&&my>=cy*cellH&&my<(cy+1)*cellH});
  const main=inCell.reduce((a,b)=>b.size>a.size?b:a);
  const keep=new Set(inCell.filter(b=>b===main||(b.left<=main.right+near&&b.right>=main.left-near&&b.top<=main.bottom&&b.bottom>=main.top-near)).map(b=>b.id));
  let left=width,right=-1,top=height,bottom=-1;
  for(const b of inCell)if(keep.has(b.id)){left=Math.min(left,b.left);right=Math.max(right,b.right);top=Math.min(top,b.top);bottom=Math.max(bottom,b.bottom)}
  const w=right-left+1+margin*2,h=bottom-top+1+margin*2,out=Buffer.alloc(w*h*4);
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
    const p=y*width+x;
    if(keep.has(label[p]))pixels.copy(out,((y-top+margin)*w+x-left+margin)*4,p*4,p*4+4);
  }
  await writeFile(`${outDir}/${names[n]}.png`,encode({width:w,height:h,pixels:out}));
  console.log(`${names[n]}.png ${w}x${h} (${keep.size} blob${keep.size>1?'s':''}, dropped ${inCell.length-keep.size})`);
}
