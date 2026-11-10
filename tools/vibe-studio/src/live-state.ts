// Live state → characters. Reads the agents-live JSON written by opencode-project-template
// (tools/task-dashboard/agent-live.mjs): {updatedAt, agents:[{agent, role, phase, task, title, worktree, since}]}.
// Agent ids are generic ("builder-1", "reviewer-2", "merger"), so each one is mapped to one of our 15
// characters by role. Only two states exist: a character WORKS when at least one agent mapped to it is in
// the file with phase ≠ "idle"; otherwise it is IDLE.

export type LiveAgent={agent:string;role?:string;phase?:string;task?:string|null;title?:string|null;since?:string};
export type LiveFile={updatedAt?:string;agents?:LiveAgent[];missing?:boolean};

export const BUILDERS=['nova','orion','lyra','vega','atlas','comet'];
export const REVIEWERS=['sage','iris','juno','echo'];
export const ALL_CHARACTERS=[...BUILDERS,...REVIEWERS,'eve','theo','oracle','pixel','sherlock'];

// role → fixed character (pools handled separately). agent-live.mjs now accepts the full ROLES set
// (builder|builder-strong|reviewer|merger|dispatcher|change-request|spec-validator|spec-publisher|design|graph|general-purpose|claude-code-guide);
// each non-pool role maps to a character here. Claude Code built-in subagents (general-purpose,
// claude-code-guide) show as Eve.
const ROLE_CHARACTER:Record<string,string>={
  // Eve: merge thật + chat + subagent built-in của Claude Code. chat và merger cùng là Eve nhưng
  // phase khác nhau (chat→building, merger→merging) nên dashboard phân biệt được Eve đang chat hay merge.
  merger:'eve',chat:'eve','general-purpose':'eve','claude-code-guide':'eve',
  dispatcher:'theo',loop:'theo',brainstorm:'theo',graph:'theo','change-request':'theo',devops:'theo',rollback:'theo',
  'context-manager':'theo',
  'spec-init':'oracle','spec-validator':'oracle','spec-publisher':'oracle',
  design:'pixel',
  'error-analyzer':'sherlock','bug-check':'sherlock',
};
// Old engine names (19-character roster) still map straight to a character.
const NAME_CHARACTER:Record<string,string>={
  captain:'theo',muse:'theo',cartographer:'theo',scout:'oracle',herald:'oracle',
  ...Object.fromEntries(ALL_CHARACTERS.map(c=>[c,c])),
};
const poolOf=(role:string)=>role==='builder'||role==='builder-strong'?BUILDERS:role==='reviewer'?REVIEWERS:null;

export type Cast={character:string;agents:LiveAgent[]};

// Keeps agent → character assignments stable across polls (an agent keeps its character while it lives). An
// agent that comes back within REMEMBER_MS (e.g. builder-2 fixing a review FAIL in round 2) gets its old
// character again when that one is free.
const REMEMBER_MS=120000;
export class LiveMapper{
  sticky=new Map<string,string>();
  recent=new Map<string,{character:string;at:number}>();
  constructor(public random:()=>number=Math.random){}
  map(file:LiveFile,now=Date.now()):Map<string,Cast>{
    const out=new Map<string,Cast>();
    const agents=(file.agents??[]).filter(a=>a&&typeof a.agent==='string'&&a.agent&&a.phase!=='idle');
    const live=new Set(agents.map(a=>a.agent));
    for(const [id,character] of [...this.sticky])if(!live.has(id)){this.sticky.delete(id);this.recent.set(id,{character,at:now})}
    for(const [id,r] of [...this.recent])if(now-r.at>REMEMBER_MS)this.recent.delete(id);
    const add=(character:string,a:LiveAgent)=>{
      const c=out.get(character)??{character,agents:[]};c.agents.push(a);out.set(character,c);
    };
    const pending:LiveAgent[]=[];
    for(const a of agents){
      const byName=NAME_CHARACTER[a.agent.toLowerCase()];
      if(byName){add(byName,a);continue}
      const role=(a.role??'').toLowerCase();
      const fixed=ROLE_CHARACTER[role];
      if(fixed){add(fixed,a);continue}
      if(poolOf(role))pending.push(a);
      else add('theo',a);
    }
    // Pool roles (builder, reviewer): a new agent gets a RANDOM character among the free ones of its pool
    // (anh chốt 23/10) and keeps it while it lives; coming back within REMEMBER_MS it gets the old one if free.
    // More agents than characters: it shares a random busy character (never an extra sprite).
    pending.sort((a,b)=>a.agent.localeCompare(b.agent,undefined,{numeric:true}));
    for(const a of pending){
      const pool=poolOf((a.role??'').toLowerCase())!;
      let character=this.sticky.get(a.agent);
      const taken=new Set([...this.sticky.entries()].filter(([id])=>id!==a.agent&&live.has(id)).map(([,c])=>c));
      const free=(c:string)=>pool.includes(c)&&!taken.has(c)&&!out.has(c);
      if(!character||!pool.includes(character)){
        const back=this.recent.get(a.agent)?.character,options=pool.filter(free);
        character=back&&free(back)?back:options.length?options[Math.floor(this.random()*options.length)]:pool[Math.floor(this.random()*pool.length)];
      }
      this.sticky.set(a.agent,character);
      add(character,a);
    }
    return out;
  }
}
