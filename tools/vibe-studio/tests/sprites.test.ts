import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {roster} from '../src/core';

const animations={idle:4,walk_down:4,walk_up:4,walk_left:4,walk_right:4,work:6,sit:4,talk:4};

describe.skipIf(!existsSync('public/assets/characters/nova/manifest.json'))('generated character sheets',()=>{
  for(const name of Object.keys(roster)){
    it(`${name}: RGBA, fixed frame size and real transparent background`,()=>{
      const folder=`public/assets/characters/${name.toLowerCase()}`;
      const manifest=JSON.parse(readFileSync(`${folder}/manifest.json`,'utf8'));
      expect(manifest.id).toBe(name);
      expect(manifest.role).toBe(roster[name]);
      expect(manifest.anchor).toEqual([.5,1]);
      for(const [animation,frames] of Object.entries(animations)){
        const png=readFileSync(`${folder}/${animation}.png`);
        expect([...png.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
        expect(png.readUInt32BE(16)).toBe(64*frames);
        expect(png.readUInt32BE(20)).toBe(96);
        expect(png[25]).toBe(6); // RGBA (not RGB over a painted checkerboard)
        let offset=8;
        const idat:Buffer[]=[];
        while(offset<png.length){
          const size=png.readUInt32BE(offset),kind=png.toString('ascii',offset+4,offset+8);
          if(kind==='IDAT')idat.push(png.subarray(offset+8,offset+8+size));
          offset+=size+12;
        }
        const raw=inflateSync(Buffer.concat(idat)),stride=64*frames*4+1;
        expect(raw.length).toBe(96*stride);
        expect(raw[4]).toBe(0); // transparent top-left (unfiltered scanline)
        const fingerprints=new Set<string>();
        for(let frame=0;frame<frames;frame++){
          const pixels: number[]=[];
          for(let y=0;y<96;y++)for(let x=frame*64;x<(frame+1)*64;x++){
            const alpha=raw[y*stride+1+x*4+3];
            if(alpha) pixels.push(x-frame*64,y,alpha);
          }
          expect(pixels.length/3).toBeGreaterThan(200);
          expect(pixels.length/3).toBeLessThan(64*96);
          fingerprints.add(JSON.stringify(pixels));
        }
        expect(fingerprints.size).toBeGreaterThan(1);
      }
    });
  }
});
