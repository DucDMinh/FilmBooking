import {describe,it,expect} from 'vitest';
import {LiveMapper} from '../src/live-state';

const file=(...agents:[string,string,string?][])=>({agents:agents.map(([agent,role,phase])=>({agent,role,phase:phase??'building'}))});
const who=(m:Map<string,{agents:{agent:string}[]}>)=>Object.fromEntries([...m].map(([c,v])=>[c,v.agents.map(a=>a.agent)]));

const seq=(...xs:number[])=>{let i=0;return ()=>xs[i++%xs.length]};

describe('LiveMapper',()=>{
  it('maps agent-live roles to characters (pool picks are random among free ones)',()=>{
    const m=new LiveMapper(seq(0)).map(file(['builder-1','builder'],['builder-2','builder'],['reviewer-1','reviewer','review'],
      ['merger','merger','merging'],['dispatcher','dispatcher','orchestrating'],['spec-validator','spec-validator'],
      ['design','design'],['error-analyzer','error-analyzer'],['graph','graph']));
    expect(who(m)).toEqual({nova:['builder-1'],orion:['builder-2'],sage:['reviewer-1'],eve:['merger'],
      theo:['dispatcher','graph'],oracle:['spec-validator'],pixel:['design'],sherlock:['error-analyzer']});
  });
  it('idle phase and unknown agents: idle is not work, unknown role goes to Theo',()=>{
    const m=new LiveMapper().map(file(['builder-1','builder','idle'],['qa-bot','tester']));
    expect(who(m)).toEqual({theo:['qa-bot']});
  });
  it('random pick only among free characters, and an agent keeps its character while it lives',()=>{
    const mapper=new LiveMapper(seq(0.99));
    const a=mapper.map(file(['builder-1','builder'],['builder-2','builder']));
    expect(who(a)).toEqual({comet:['builder-1'],atlas:['builder-2']});
    const b=mapper.map(file(['builder-2','builder'],['builder-3','builder']));
    expect(who(b)).toEqual({atlas:['builder-2'],comet:['builder-3']});
  });
  it('never two agents on one character while free ones remain',()=>{
    for(let k=0;k<50;k++){
      const m=new LiveMapper().map(file(...Array.from({length:6},(_,i)=>[`builder-${i+1}`,'builder'] as [string,string])));
      expect([...m.keys()].sort()).toEqual(['atlas','comet','lyra','nova','orion','vega']);
    }
  });
  it('old engine names map straight, merged roles show one character',()=>{
    const m=new LiveMapper().map(file(['Captain','dispatcher'],['Muse','brainstorm'],['Scout','spec-init'],['Lyra','builder']));
    expect(who(m)).toEqual({theo:['Captain','Muse'],oracle:['Scout'],lyra:['Lyra']});
  });
  it('more agents than characters never adds an extra sprite',()=>{
    const m=new LiveMapper().map(file(...Array.from({length:6},(_,i)=>[`reviewer-${i+1}`,'reviewer','review'] as [string,string,string])));
    expect([...m.keys()].sort()).toEqual(['echo','iris','juno','sage']);
  });
});

describe('LiveMapper memory',()=>{
  it('an agent coming back soon gets its old character again',()=>{
    const mapper=new LiveMapper();
    const first=mapper.map(file(['builder-1','builder'],['builder-2','builder']),0);
    const mine=[...first].find(([,v])=>v.agents[0].agent==='builder-2')![0];
    mapper.map(file(['reviewer-2','reviewer','review']),1000);           // both builders left
    const m=mapper.map(file(['builder-2','builder']),2000);
    expect(who(m)[mine]).toEqual(['builder-2']);
  });
});
