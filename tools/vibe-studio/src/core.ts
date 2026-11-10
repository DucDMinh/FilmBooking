export type AgentData={agent:string;role:string;phase?:string;task?:string|null;title?:string|null;sinceSec?:number;stale?:boolean};
export type Task={id:string;title:string;status?:string;guessed?:boolean;stale?:boolean};
export type State={ok:boolean;mode:string;projectName:string;currentLayer:number;totalLayers:number;phase:string;counts:Record<string,number>;columns:Record<string,Task[]>;agents:AgentData[];benchAgents:AgentData[];merger?:{name?:string;active?:boolean;state?:string};fallback?:boolean;warnings?:string[];lastUpdated?:string};
export const roster:Record<string,string>={Nova:'builder',Orion:'builder',Vega:'builder',Atlas:'builder',Comet:'builder',Lyra:'builder',Sage:'reviewer',Iris:'reviewer',Juno:'reviewer',Echo:'reviewer',Pixel:'design',Captain:'dispatcher',Eve:'merger',Oracle:'spec-validator',Sherlock:'error-analyzer',Herald:'spec-publisher',Scout:'spec-init',Muse:'brainstorm',Cartographer:'graph'};
export const names=Object.keys(roster);
export const grid={w:18,h:13};
export type Point={x:number;y:number};
export const pos=(x:number,y:number):Point=>({x,y});
export function iso(x:number,y:number,z=0):Point{return {x:590+(x-y)*31,y:95+(x+y)*16-z}}
export function inBounds(x:number,y:number){return x>=0&&y>=0&&x<grid.w&&y<grid.h}
export const blocked=new Set<string>();
// Walkable cell grid: furnishings occupy cells; destinations sit on the accessible side.
for(const [x,y] of [[2,2],[3,3],[3,5],[2,9],[4,9],[6,9],[7,4],[9,4],[11,4],[7,7],[9,7],[11,7],[14,4],[15,4],[11,2],[12,2],[11,10],[12,10],[13,10]])blocked.add(`${x},${y}`);
export function route(start:Point,end:Point,occupied=blocked):Point[]{
  const s={x:Math.round(start.x),y:Math.round(start.y)},e={x:Math.round(end.x),y:Math.round(end.y)};
  const key=(p:Point)=>`${p.x},${p.y}`;
  if(!inBounds(s.x,s.y)||!inBounds(e.x,e.y)||occupied.has(key(e)))return [];
  const open=[s],came=new Map<string,string>(),score=new Map([[key(s),0]]),closed=new Set<string>();
  while(open.length){
    open.sort((a,b)=>(score.get(key(a))??Infinity)+Math.abs(a.x-e.x)+Math.abs(a.y-e.y)-(score.get(key(b))??Infinity)-Math.abs(b.x-e.x)-Math.abs(b.y-e.y));
    const p=open.shift()!,k=key(p);
    if(closed.has(k))continue;
    if(k===key(e)){
      const path:Point[]=[];let cur=k;
      while(came.has(cur)){const [x,y]=cur.split(',').map(Number);path.unshift({x,y});cur=came.get(cur)!}
      return path;
    }
    closed.add(k);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const n={x:p.x+dx,y:p.y+dy},nk=key(n);
      if(!inBounds(n.x,n.y)||occupied.has(nk)||closed.has(nk))continue;
      const g=(score.get(k)??0)+1;
      if(g<(score.get(nk)??Infinity)){score.set(nk,g);came.set(nk,k);open.push(n)}
    }
  }
  return [];
}
export function normalize(s:State):AgentData[]{if(!s||s.ok!==true||!Array.isArray(s.agents)||!Array.isArray(s.benchAgents))throw Error('Invalid /api/state payload');const m=new Map<string,AgentData>();for(const a of s.benchAgents)if(a?.agent)m.set(a.agent,{...a,phase:'idle'});for(const a of s.agents)if(a?.agent)m.set(a.agent,a);if(s.merger?.active&&!m.has('Eve'))m.set('Eve',{agent:'Eve',role:'merger',phase:'merging',task:null,title:'Merging'});return [...m.values()]}
export const deskSeats=[pos(7,5),pos(9,5),pos(11,5),pos(7,8),pos(9,8),pos(11,8)];
export const reviewSeats=[pos(2,10),pos(4,10),pos(6,10),pos(5,9)];
export const idleSeats=[pos(1,3),pos(1,5),pos(5,4),pos(10,11),pos(14,11),pos(9,12),pos(4,11),pos(2,6)];
export const mergeSeat=pos(14,5),dispatchSeat=pos(12,3);
export function destination(a:AgentData,index:number):Point{if(a.phase==='idle'||a.stale)return idleSeats[index%idleSeats.length];if(a.role==='builder')return deskSeats[index%deskSeats.length];if(a.role==='reviewer')return reviewSeats[index%reviewSeats.length];if(a.role==='merger')return mergeSeat;if(a.role==='dispatcher')return dispatchSeat;return reviewSeats[index%reviewSeats.length]}
export function demo():State{return {ok:true,mode:'demo',projectName:'acme-crm',currentLayer:2,totalLayers:4,phase:'building',counts:{building:1,review:2,done:9,blocked:0,todo:1,running:1,waiting:1,total:13},columns:{todo:[{id:'layer-2/task-03',title:'Auth middleware'}],review:[{id:'layer-2/task-02',title:'Unit tests'},{id:'layer-2/task-04',title:'UI polish'}],done:[{id:'layer-1/task-01',title:'Project setup'},{id:'layer-1/task-02',title:'DB schema'}]},agents:[{agent:'Nova',role:'builder',phase:'building',task:'layer-2/task-01',title:'REST API /users',sinceSec:29},{agent:'Sage',role:'reviewer',phase:'review',task:'layer-2/task-02',title:'Unit tests',sinceSec:84},{agent:'Eve',role:'merger',phase:'merging',task:'layer-2/task-05',title:'Merge branches',sinceSec:12},{agent:'Captain',role:'dispatcher',phase:'orchestrating',title:'Task scheduling',sinceSec:48}],benchAgents:[],merger:{name:'Eve',active:true,state:'merging'},fallback:false,warnings:[],lastUpdated:new Date().toISOString()}}
export function advance(step:number):State{const s=demo(),cycles=[['building','review','merging','orchestrating'],['idle','review','merging','orchestrating'],['building','idle','idle','orchestrating'],['building','review','merging','idle'],['idle','idle','merging','orchestrating']];const phases=cycles[step%cycles.length],original=s.agents;s.agents=[];s.benchAgents=[];original.forEach((a,i)=>{a.phase=phases[i];(a.phase==='idle'?s.benchAgents:s.agents).push(a)});s.merger!.active=phases[2]==='merging';s.counts.done=Math.min(13,9+Math.floor(step/2)%5);s.counts.running=s.agents.length;s.phase=phases[0];return s}
