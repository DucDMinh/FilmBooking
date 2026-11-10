// Extract actual character art from the supplied 20 individual RGBA pose boards.
// Layout: five columns, rows for standing / walking / seated / emotes.
// Inspector is intentionally excluded: it is not a canonical backend agent.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {decode,encode} from './png-rgba.mjs';

const names=['Nova','Orion','Vega','Atlas','Comet','Lyra','Sage','Iris','Juno','Echo','Pixel','Captain','Eve','Oracle','Sherlock','Herald','Scout','Muse','Cartographer'];
const destination='public/assets/characters-extracted';
const boundsY=[[8,94],[94,154],[154,215]];
const definitions={
  idle:[[0,0],[0,1],[0,2],[0,3],[0,4]],
  walk_down:[[1,0],[1,1],[1,0],[1,3]],
  walk_left:[[1,1],[1,2]],
  walk_right:[[1,3],[1,2]],
  walk_up:[[1,4]],
  work:[[2,4]], // Chair-free three-quarter pose; facing varies in the source art.
  sit:[[2,0]],
};
const frameWidth=64,frameHeight=96;
function crop(image,row,col){
  const x0=23+col*53,x1=col===4?image.width:Math.min(image.width,x0+53);
  const [y0,y1]=boundsY[row];
  // Oversized hair in the pose above can cross the grid row boundary. Keep
  // the largest connected silhouette in the target cell, not that spillover.
  const width=x1-x0,height=y1-y0,seen=new Uint8Array(width*height);
  let component=null;
  for(let index=0;index<seen.length;index++){
    if(seen[index]||!image.pixels[((y0+Math.floor(index/width))*image.width+x0+index%width)*4+3])continue;
    const queue=[index],pixels=[];seen[index]=1;
    for(let head=0;head<queue.length;head++){
      const point=queue[head],px=point%width,py=Math.floor(point/width);
      pixels.push(point);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=px+dx,ny=py+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;
        const next=ny*width+nx;
        if(!seen[next]&&image.pixels[((y0+ny)*image.width+x0+nx)*4+3]){seen[next]=1;queue.push(next)}
      }
    }
    if(!component||pixels.length>component.length)component=pixels;
  }
  if(!component)throw Error(`Empty cell row ${row} column ${col}`);
  const mask=new Uint8Array(width*height);
  for(const i of component)mask[i]=1;
  let left=x1,top=y1,right=x0-1,bottom=y0-1;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(mask[(y-y0)*width+x-x0]){
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  return {left,top,width:right-left+1,height:bottom-top+1,x0,y0,mask,cellWidth:width};
}
function render(image,cells){
  const output=Buffer.alloc(cells.length*frameWidth*frameHeight*4);
  cells.forEach(([row,col],frame)=>{
    const region=crop(image,row,col);
    // The walk row is drawn smaller than the standing row. Upsample only that
    // row by nearest-neighbor; no blur or generated pixels are introduced.
    const factor=row===1?1.24:1;
    const w=Math.min(60,Math.round(region.width*factor)),h=Math.min(84,Math.round(region.height*factor));
    const offsetX=frame*frameWidth+Math.floor((frameWidth-w)/2);
    const offsetY=89-h; // common ground/feet line across all poses
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const sx=region.left+Math.min(region.width-1,Math.floor(x*region.width/w));
      const sy=region.top+Math.min(region.height-1,Math.floor(y*region.height/h));
      if(region.mask[(sy-region.y0)*region.cellWidth+sx-region.x0])
        image.pixels.copy(output,((offsetY+y)*frameWidth*cells.length+offsetX+x)*4,(sy*image.width+sx)*4,(sy*image.width+sx+1)*4);
    }
  });
  return encode({width:frameWidth*cells.length,height:frameHeight,pixels:output});
}
await mkdir(destination,{recursive:true});
for(const name of names){
  const image=decode(await readFile(join('agent_sprites_TRUE_TRANSPARENT',`${name}.png`)));
  if(image.width<300||image.width>310||image.height!==256)throw Error(`Unexpected ${name} pose board size`);
  const folder=join(destination,name.toLowerCase());await mkdir(folder,{recursive:true});
  for(const [key,cells] of Object.entries(definitions))await writeFile(join(folder,`${key}.png`),render(image,cells));
  await writeFile(join(folder,'stand.png'),render(image,[[0,0]]));
  await writeFile(join(folder,'manifest.json'),JSON.stringify({id:name,source:`agent_sprites_TRUE_TRANSPARENT/${name}.png`,frameWidth,frameHeight,anchor:[.5,1],animations:Object.fromEntries(Object.entries(definitions).map(([key,cells])=>[key,{file:`${key}.png`,frames:cells.length}])),notes:'sit includes the source chair; work uses a chair-free three-quarter pose (not always rear); walk_up has one pose'},null,2)+'\n');
}
console.log(`Extracted real RGBA character art for ${names.length} canonical agents into ${destination}`);
