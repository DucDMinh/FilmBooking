// Remove the light, unsaturated halo a baked-checkerboard removal leaves around sprite outlines:
// an opaque pixel touching transparency that is light grey/white is cleared; repeated `passes` times.
// Usage: node scripts/clean-fringe.mjs [passes=2] <file.png> ...
import {readFile,writeFile} from 'node:fs/promises';
import {decode,encode} from './png-rgba.mjs';

const args=process.argv.slice(2);
const passes=/^\d+$/.test(args[0])?Number(args.shift()):2;
for(const file of args){
  const {width,height,pixels}=decode(await readFile(file));
  let cleared=0;
  for(let pass=0;pass<passes;pass++){
    const kill=[];
    for(let p=0;p<width*height;p++){
      if(pixels[p*4+3]<=8)continue;
      const x=p%width,y=(p-x)/width;
      const edge=[x>0?p-1:-1,x<width-1?p+1:-1,y>0?p-width:-1,y<height-1?p+width:-1].some(q=>q<0||pixels[q*4+3]<=8);
      if(!edge)continue;
      const r=pixels[p*4],g=pixels[p*4+1],b=pixels[p*4+2];
      if(Math.min(r,g,b)>=150&&Math.max(r,g,b)-Math.min(r,g,b)<=28)kill.push(p);
    }
    for(const p of kill)pixels[p*4+3]=0;
    cleared+=kill.length;
  }
  await writeFile(file,encode({width,height,pixels}));
  console.log(`${file}: cleared ${cleared} fringe pixels`);
}
