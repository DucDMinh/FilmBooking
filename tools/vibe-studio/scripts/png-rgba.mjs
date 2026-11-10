import {deflateSync,inflateSync} from 'node:zlib';

const signature=Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
function chunk(type,data){const tag=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);let c=0xffffffff;for(const b of Buffer.concat([tag,data]))c=crcTable[(c^b)&255]^(c>>>8);crc.writeUInt32BE((c^0xffffffff)>>>0);return Buffer.concat([length,tag,data,crc])}

export function decode(buffer){
  if(!buffer.subarray(0,8).equals(signature))throw Error('Not a PNG');
  let width=0,height=0,depth=0,color=0,interlace=0,offset=8;
  const chunks=[];
  while(offset<buffer.length){
    const size=buffer.readUInt32BE(offset),kind=buffer.toString('ascii',offset+4,offset+8);
    if(kind==='IHDR'){width=buffer.readUInt32BE(offset+8);height=buffer.readUInt32BE(offset+12);depth=buffer[offset+16];color=buffer[offset+17];interlace=buffer[offset+20]}
    if(kind==='IDAT')chunks.push(buffer.subarray(offset+8,offset+8+size));
    offset+=size+12;
  }
  if(depth!==8||(color!==6&&color!==2)||interlace!==0)throw Error('Expected non-interlaced 8-bit RGB/RGBA PNG');
  const raw=inflateSync(Buffer.concat(chunks)),channels=color===6?4:3,stride=width*channels,decoded=Buffer.alloc(stride*height);
  for(let y=0;y<height;y++){
    const filter=raw[y*(stride+1)],start=y*(stride+1)+1;
    for(let x=0;x<stride;x++){
      const left=x>=channels?decoded[y*stride+x-channels]:0,up=y?decoded[(y-1)*stride+x]:0,upLeft=y&&x>=channels?decoded[(y-1)*stride+x-channels]:0;
      let predictor=0;
      if(filter===1)predictor=left;
      else if(filter===2)predictor=up;
      else if(filter===3)predictor=Math.floor((left+up)/2);
      else if(filter===4){const p=left+up-upLeft,da=Math.abs(p-left),db=Math.abs(p-up),dc=Math.abs(p-upLeft);predictor=da<=db&&da<=dc?left:db<=dc?up:upLeft}
      else if(filter!==0)throw Error(`Unsupported PNG filter ${filter}`);
      decoded[y*stride+x]=(raw[start+x]+predictor)&255;
    }
  }
  if(channels===4)return {width,height,pixels:decoded};
  const pixels=Buffer.alloc(width*height*4);
  for(let i=0;i<width*height;i++){decoded.copy(pixels,i*4,i*3,i*3+3);pixels[i*4+3]=255}
  return {width,height,pixels};
}

export function encode({width,height,pixels}){
  const stride=width*4,raw=Buffer.alloc((stride+1)*height),ihdr=Buffer.alloc(13);
  for(let y=0;y<height;y++)pixels.copy(raw,y*(stride+1)+1,y*stride,(y+1)*stride);
  ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([signature,chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
