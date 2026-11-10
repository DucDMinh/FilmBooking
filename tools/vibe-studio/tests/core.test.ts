import {describe,it,expect} from 'vitest';
import {demo,normalize,route,destination} from '../src/core';
describe('state and navigation',()=>{it('normalizes agent lists',()=>expect(normalize(demo())).toHaveLength(4));it('avoids duplicate Eve',()=>{const s=demo();s.agents=s.agents.filter(a=>a.agent!=='Eve');expect(normalize(s).filter(a=>a.agent==='Eve')).toHaveLength(1)});it('routes around occupied furniture',()=>{const path=route({x:1,y:1},{x:8,y:5});expect(path.length).toBeGreaterThan(0);expect(path.at(-1)).toEqual({x:8,y:5})});it('assigns builder seat',()=>expect(destination({agent:'Nova',role:'builder',phase:'building'},0)).toEqual({x:7,y:5}))});
describe('routing edge cases',()=>{
  it('does not walk through blocked cells',()=>{
    const obstacles=new Set(['1,0','1,1','1,2']);
    const path=route({x:0,y:1},{x:2,y:1},obstacles);
    expect(path.length).toBeGreaterThan(0);
    expect(path.every(p=>!obstacles.has(`${p.x},${p.y}`))).toBe(true);
    expect(path.at(-1)).toEqual({x:2,y:1});
  });
  it('rejects blocked and out-of-bounds destinations',()=>{
    expect(route({x:1,y:1},{x:2,y:2})).toEqual([]);
    expect(route({x:1,y:1},{x:18,y:1})).toEqual([]);
    expect(route({x:-1,y:1},{x:1,y:1})).toEqual([]);
  });
  it('returns no steps when already at the destination',()=>expect(route({x:1,y:1},{x:1,y:1})).toEqual([]));
});
