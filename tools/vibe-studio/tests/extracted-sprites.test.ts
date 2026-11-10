import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {roster} from '../src/core';

const poses={idle:5,walk_down:4,walk_up:1,walk_left:2,walk_right:2,work:1,sit:1};
describe.skipIf(!existsSync('public/assets/characters-extracted/nova/manifest.json'))('extracted source artwork',()=>{
  it('excludes Inspector from the canonical roster',()=>{
    expect(existsSync('public/assets/characters-extracted/inspector')).toBe(false);
  });
  for(const name of Object.keys(roster))it(`${name}: transparent pose sheets with common anchors`,()=>{
    const folder=`public/assets/characters-extracted/${name.toLowerCase()}`;
    const manifest=JSON.parse(readFileSync(`${folder}/manifest.json`,'utf8'));
    expect(manifest.id).toBe(name);
    expect(manifest.anchor).toEqual([.5,1]);
    for(const [pose,count] of Object.entries(poses)){
      const data=readFileSync(`${folder}/${pose}.png`);
      expect(data.readUInt32BE(16)).toBe(64*count);
      expect(data.readUInt32BE(20)).toBe(96);
      expect(data[25]).toBe(6);
      expect(manifest.animations[pose].frames).toBe(count);
      let offset=8;
      const compressed:Buffer[]=[];
      while(offset<data.length){
        const length=data.readUInt32BE(offset);
        if(data.toString('ascii',offset+4,offset+8)==='IDAT')compressed.push(data.subarray(offset+8,offset+8+length));
        offset+=length+12;
      }
      const raw=inflateSync(Buffer.concat(compressed));
      expect(raw[4]).toBe(0); // transparent corner, not a painted checkerboard
      expect(raw.length).toBe(96*(64*count*4+1));
    }
    const stand=readFileSync(`${folder}/stand.png`);
    expect(stand.readUInt32BE(16)).toBe(64);
    expect(stand.readUInt32BE(20)).toBe(96);
  });
});
