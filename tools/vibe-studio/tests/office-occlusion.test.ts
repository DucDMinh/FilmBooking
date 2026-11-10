import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';

describe('pilot office foreground',()=>{
  it('matches the original image dimensions and leaves the rest transparent',()=>{
    const source=readFileSync('public/assets/environment/office_original.png');
    const foreground=readFileSync('public/assets/environment/coding_desk_01_foreground.png');
    const width=source.readUInt32BE(16),height=source.readUInt32BE(20);
    expect([width,height]).toEqual([1496,1051]);
    expect([foreground.readUInt32BE(16),foreground.readUInt32BE(20)]).toEqual([width,height]);
    expect(foreground[25]).toBe(6);
    let offset=8;
    const chunks:Buffer[]=[];
    while(offset<foreground.length){
      const length=foreground.readUInt32BE(offset);
      if(foreground.toString('ascii',offset+4,offset+8)==='IDAT')chunks.push(foreground.subarray(offset+8,offset+8+length));
      offset+=length+12;
    }
    const raw=inflateSync(Buffer.concat(chunks)),stride=width*4+1;
    expect(raw.length).toBe(height*stride);
    expect(raw[4]).toBe(0);
    expect(raw[470*stride+1+515*4+3]).toBe(255);
    expect(raw[400*stride+1+500*4+3]).toBe(0); // monitor is behind Nova
    expect(raw[800*stride+1+500*4+3]).toBe(0);
    const map=JSON.parse(readFileSync('public/assets/environment/seat-map.preview.json','utf8'));
    expect(map.dimensions).toEqual([width,height]);
  });
});
