// Measure every pose of one character in one area and write public/assets/<character>/<area>/manifest.json.
// Per pose: bbox + anchor = centre wheel's floor contact (mean x of opaque pixels in the lowest
// `footFraction` of the bbox height, y = bbox bottom). All poses of a character share one scale so
// relative sizes survive.
// Usage: node scripts/build-coding-manifest.mjs [character=nova] [displayHeight=139] [footFraction=0.023] [area=coding] [reference.png]
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {decode} from './png-rgba.mjs';

const character=process.argv[2]??'nova';
const area=process.argv[5]??'coding';
const dir=`public/assets/${character}/${area}`;
const displayHeight=Number(process.argv[3]??139),footFraction=Number(process.argv[4]??0.023);
// The reference pose sets the shared scale: its bbox height maps to displayHeight px on screen.
// Reference pose: per area, else type_a; characters with their own pose names (Oracle) fall back to check_a.
const reference=process.argv[6]??({coding:'straight_type_a.png',relax:'sketch_a.png'}[area]??'type_a.png');

const poses={},images=[];
for(const file of (await readdir(dir)).filter(f=>f.endsWith('.png')).sort()){
  const {width,height,pixels}=decode(await readFile(`${dir}/${file}`));
  // A near-identical pose under another name = the same image saved twice (re-encoding adds tiny noise).
  for(const other of images){
    if(other.width!==width||other.height!==height)continue;
    let changed=0,opaque=0;
    for(let i=0;i<pixels.length;i+=4){
      if(pixels[i+3]<=8&&other.pixels[i+3]<=8)continue;
      opaque++;
      if(Math.abs(pixels[i]-other.pixels[i])+Math.abs(pixels[i+1]-other.pixels[i+1])+Math.abs(pixels[i+2]-other.pixels[i+2])+Math.abs(pixels[i+3]-other.pixels[i+3])>30)changed++;
    }
    if(changed<opaque*0.005)console.warn(`WARNING: ${file} is almost identical to ${other.file} (${changed} of ${opaque} pixels differ)`);
  }
  images.push({file,width,height,pixels});
  let left=width,right=-1,top=height,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)
    if(pixels[(y*width+x)*4+3]>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}
  let sum=0,count=0;
  const footRows=Math.max(3,Math.round((bottom-top+1)*footFraction));
  for(let y=bottom-footRows+1;y<=bottom;y++)for(let x=left;x<=right;x++)
    if(pixels[(y*width+x)*4+3]>8){sum+=x;count++}
  poses[file.replace('.png','')]={file,width,height,bbox:[left,top,right,bottom],anchorX:Math.round(sum/count),anchorY:bottom};
}
const [,refTop,,refBottom]=poses[reference.replace('.png','')].bbox;
const scale=+(displayHeight/(refBottom-refTop+1)).toFixed(4);
await writeFile(`${dir}/manifest.json`,JSON.stringify({scale,poses},null,2)+'\n');
for(const [name,p] of Object.entries(poses))console.log(name.padEnd(20),`${p.width}x${p.height}`,'bbox',p.bbox.join(','),'anchor',p.anchorX,p.anchorY);
console.log('scale',scale);
