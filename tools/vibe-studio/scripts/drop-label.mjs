// Drop a pose label glued under the bottom wheel (slice-pose-sheet keeps it when there is no gap).
// From the bottom, find the lowest row that is just the front wheel (narrow span), then clear every row
// below it where the span widens again (label box + glow). When the label glow reaches up beside the wheel,
// fall back to the label's density: a solid block of rows with >= LABEL_PIXELS opaque pixels at the bottom.
// Small specks left above the cut are dropped. Poses without a label are left untouched.
// Usage: node scripts/drop-label.mjs <file.png> ...
import {readFile,writeFile} from 'node:fs/promises';
import {decode,encode} from './png-rgba.mjs';

const WHEEL_MAX=55,WHEEL_MIN_PIXELS=15,LABEL_PIXELS=100,GLOW_ROWS=18,margin=8;
for(const file of process.argv.slice(2)){
  const {width:w,height:h,pixels:p}=decode(await readFile(file));
  const row=y=>{let n=0,a=w,b=-1;for(let x=0;x<w;x++)if(p[(y*w+x)*4+3]>8){n++;a=Math.min(a,x);b=Math.max(b,x)}return {n,span:b<0?0:b-a+1}};
  let bottom=h-1;while(bottom>0&&!row(bottom).n)bottom--;
  // A pale glow under the chair can bridge the wheel and the label: clear pale, unsaturated pixels in the
  // GLOW_ROWS just above a dense label block (wheels are dark navy; shoes sit higher up).
  {
    let y=bottom;while(y>0&&row(y).n<LABEL_PIXELS)y--;
    const blockBottom=y;for(let dip=0;y>0&&dip<4;y--)dip=row(y).n>=LABEL_PIXELS?0:dip+1;
    const top=y+5;
    if(blockBottom-top>=20)for(let yy=Math.max(0,top-GLOW_ROWS);yy<top;yy++)for(let x=0;x<w;x++){
      const i=(yy*w+x)*4,r=p[i],g=p[i+1],bl=p[i+2];
      if(p[i+3]>8&&Math.min(r,g,bl)>=150&&Math.max(r,g,bl)-Math.min(r,g,bl)<=45)p[i+3]=0;
    }
  }
  // Lowest wheel-only row within the bottom quarter.
  let wheel=-1;
  for(let y=bottom;y>h*0.75;y--){const r=row(y);if(r.n>=WHEEL_MIN_PIXELS&&r.span<=WHEEL_MAX){wheel=y;break}}
  const below=wheel<0?[]:Array.from({length:bottom-wheel},(_,k)=>row(wheel+1+k));
  let cut=-1;
  if(wheel>=0&&below.some(r=>r.span>WHEEL_MAX+20)){cut=wheel+1;while(cut<=bottom&&row(cut).span<=WHEEL_MAX)cut++}
  else{
    // Density fallback: walk up through the label block (allow short dips inside it).
    let y=bottom;while(y>0&&row(y).n<LABEL_PIXELS)y--;
    const blockBottom=y;
    for(let dip=0;y>0&&dip<4;y--)dip=row(y).n>=LABEL_PIXELS?0:dip+1;
    if(blockBottom-y>=25)cut=y+5;
  }
  if(cut<0){console.log(`${file}: no label`);continue}
  for(let y=cut;y<h;y++)for(let x=0;x<w;x++)p[(y*w+x)*4+3]=0;
  // Drop leftover glow specks: opaque blobs under 40 px.
  const seen=new Uint8Array(w*h);
  for(let s=0;s<w*h;s++){
    if(seen[s]||p[s*4+3]<=8)continue;
    const blob=[s],queue=[s];seen[s]=1;
    while(queue.length){const q=queue.pop(),x=q%w,y=(q-x)/w;
      for(const r of [x>0?q-1:-1,x<w-1?q+1:-1,y>0?q-w:-1,y<h-1?q+w:-1])if(r>=0&&!seen[r]&&p[r*4+3]>8){seen[r]=1;queue.push(r);blob.push(r)}}
    if(blob.length<40)for(const q of blob)p[q*4+3]=0;
  }
  let x0=w,y0=h,x1=0,y1=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(p[(y*w+x)*4+3]>8){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}
  const X0=Math.max(0,x0-margin),Y0=Math.max(0,y0-margin),W=Math.min(w,x1+margin+1)-X0,H=Math.min(h,y1+margin+1)-Y0;
  const out=Buffer.alloc(W*H*4);
  for(let y=0;y<H;y++)p.copy(out,y*W*4,((Y0+y)*w+X0)*4,((Y0+y)*w+X0+W)*4);
  await writeFile(file,encode({width:W,height:H,pixels:out}));
  console.log(`${file}: label cut at row ${cut} (${bottom-cut+1} rows) -> ${W}x${H}`);
}
