// Studio dashboard (studio.html): header stats, task board, working/idle agent lists and the character roster
// around the scene. Polls /state.json (agents-live) + /progress.json (template progress) and reads each
// character's live status from the scene through window.__studio (set by coding-test.ts).
import {PROFILES,type CharacterInfo} from './info-panel';
import {BUILDERS,REVIEWERS,type LiveFile} from './live-state';

type Task={task:string;title?:string};
type Progress={missing?:boolean;projectName?:string;currentLayer?:number;totalLayers?:number;tasks?:Task[];
  completedTasks?:{task:string;review?:string;round?:number}[];blockedTasks?:{task:string;reason?:string}[]};
type Cast={character:string;agents:{agent:string;role?:string;task?:string|null;title?:string|null;since?:string}[]};
type Studio={readInfo:(n:string)=>CharacterInfo|null;open:(n:string)=>void;names:string[];liveCasts:()=>Map<string,Cast>};

const SUPPORT=['eve','theo','oracle','pixel','sherlock'];
const ALL=[...BUILDERS,...REVIEWERS,...SUPPORT];
const $=(id:string)=>document.getElementById(id)!;
const esc=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
const clock=(ms:number)=>{const s=Math.max(0,Math.floor(ms/1000)),p=(n:number)=>String(n).padStart(2,'0');return `${p(Math.floor(s/3600))}:${p(Math.floor(s%3600/60))}:${p(s%60)}`};
const avatar=(c:string)=>`background-image:url(/assets/${c}/idle/stand_drink.png)`;

let state:LiveFile&{missing?:boolean}={agents:[]},progress:Progress={},online=false,pollMs=1000;
const titles=new Map<string,string>();

async function poll(){
  try{
    const [s,p]=await Promise.all([fetch('/state.json',{cache:'no-store'}),fetch('/progress.json',{cache:'no-store'})]);
    state=await s.json();progress=await p.json();online=!state.missing;
    if((state as {pollMs?:number}).pollMs)pollMs=(state as {pollMs?:number}).pollMs!;
  }catch{online=false}
  setTimeout(poll,pollMs);
}

function phaseOf(roles:Set<string>){
  if(roles.has('merger'))return 'Merging';
  if([...roles].some(r=>r.startsWith('builder')))return 'Building';
  if(roles.has('reviewer'))return 'Review';
  if(['spec-init','spec-validator','spec-publisher'].some(r=>roles.has(r)))return 'Spec';
  if(['dispatcher','graph','brainstorm','loop','change-request'].some(r=>roles.has(r)))return 'Planning';
  if(roles.has('design'))return 'Design';
  if(['error-analyzer','bug-check'].some(r=>roles.has(r)))return 'Debugging';
  if(['devops','rollback'].some(r=>roles.has(r)))return 'Deploy';
  return roles.size?'Working':'Idle';
}

function card(t:Task,cls:string,tag=''){
  const title=t.title??titles.get(t.task)??'';
  return `<div class="card ${cls}" title="${esc(t.task)}"><div class="id">${esc(t.task)}</div>${title?`<div class="tt">${esc(title)}</div>`:''}${tag?`<span class="tag">${esc(tag)}</span>`:''}</div>`;
}

function renderBoard(){
  const active=(state.agents??[]).filter(a=>a.phase!=='idle');
  for(const t of progress.tasks??[])if(t.title)titles.set(t.task,t.title);
  for(const a of active)if(a.task&&a.title)titles.set(a.task,a.title);
  const done=new Set((progress.completedTasks??[]).map(c=>c.task));
  const blocked=new Map((progress.blockedTasks??[]).map(b=>[b.task,b.reason??'blocked']));
  const building=new Set<string>(),reviewing=new Set<string>();
  for(const a of active)if(a.task&&!done.has(a.task)){
    if(a.role==='reviewer')reviewing.add(a.task);else if(a.role?.startsWith('builder'))building.add(a.task);
  }
  for(const t of reviewing)building.delete(t);
  const all=new Map<string,Task>();
  for(const t of progress.tasks??[])all.set(t.task,t);
  for(const t of [...building,...reviewing,...done,...blocked.keys()])if(!all.has(t))all.set(t,{task:t});
  const todo=[...all.values()].filter(t=>!done.has(t.task)&&!reviewing.has(t.task));
  // running first, then blocked, then waiting
  const rank=(t:Task)=>building.has(t.task)?0:blocked.has(t.task)?1:2;
  todo.sort((a,b)=>rank(a)-rank(b));
  const rev=[...all.values()].filter(t=>reviewing.has(t.task));
  const fin=(progress.completedTasks??[]).slice().reverse().map(c=>all.get(c.task)??{task:c.task});

  $('l-todo').innerHTML=todo.map(t=>building.has(t.task)?card(t,'run','● đang build'):blocked.has(t.task)?card(t,'block',`⛔ ${blocked.get(t.task)}`):card(t,'')).join('')||'<div class="empty">—</div>';
  $('l-rev').innerHTML=rev.map(t=>card(t,'rev')).join('')||'<div class="empty">—</div>';
  $('l-done').innerHTML=fin.slice(0,12).map(t=>card(t,'done')).join('')+(fin.length>12?`<div class="more">+${fin.length-12} task nữa</div>`:'')||'<div class="empty">—</div>';
  $('c-todo').textContent=`TODO (${todo.length})`;$('c-rev').textContent=`REVIEW (${rev.length})`;$('c-done').textContent=`DONE (${fin.length})`;

  $('s-proj').textContent=progress.projectName??(progress.missing?'(chưa có progress.json)':'—');
  const L=progress.currentLayer??0,T=progress.totalLayers??0;
  $('s-layer').textContent=T?`${Math.min(L+(L<T?1:0),T)} / ${T}`:'—';
  ($('s-layerbar') as HTMLElement).style.width=T?`${Math.round(Math.min(L,T)/T*100)}%`:'0';
  $('phase').textContent=phaseOf(new Set(active.map(a=>a.role??'')));
  $('s-total').textContent=String(all.size);
  $('s-todo').textContent=String(todo.length-building.size);
  $('s-run').textContent=String(building.size);
  $('s-rev').textContent=String(rev.length);
  $('s-done').textContent=String(fin.length);
}

function renderAgents(st:Studio){
  const casts=st.liveCasts(),now=Date.now();
  const working:string[]=[],idle:string[]=[];
  const infos=new Map<string,CharacterInfo|null>();
  for(const n of ALL){const i=st.readInfo(n);infos.set(n,i);(i?.working?working:idle).push(n)}
  const row=(n:string,what:string,tm:string,cls:string)=>{const p=PROFILES[n];
    return `<div class="row ${cls}" data-c="${n}"><span class="dot"></span><span class="av" style="${avatar(n)}"></span>
      <span class="nm">${p.display}</span><span class="role" style="background:${p.color}">${esc(p.role.split(' · ')[0])}</span>
      <span class="what" title="${esc(what)}">${esc(what)}</span><span class="tm">${tm}</span></div>`};
  $('a-rows').innerHTML=working.map(n=>{
    const ag=casts.get(n)?.agents??[],a=ag[0];
    const what=ag.length?ag.map(x=>x.task?`${x.task}`:x.title??x.agent).join(', '):infos.get(n)?.activity??'';
    const since=a?.since?now-Date.parse(a.since):infos.get(n)?.sinceMs??0;
    return row(n,what,clock(since),'');
  }).join('')||'<div class="empty">Không có agent nào đang làm — cả team đang nghỉ ☕</div>';
  $('a-count').textContent=`(WORKING ${working.length} / ${ALL.length})`;
  $('i-rows').innerHTML=idle.map(n=>row(n,infos.get(n)?.activity??'Đang nghỉ',infos.get(n)?clock(infos.get(n)!.sinceMs):'','idle')).join('')||'<div class="empty">Cả team đang làm việc 🔥</div>';
  $('i-count').textContent=`(${idle.length})`;
  for(const n of ALL)document.querySelector(`#roster .ch[data-c="${n}"]`)?.classList.toggle('work',!!infos.get(n)?.working);
}

function buildRoster(){
  const grp=(cls:string,title:string,names:string[])=>`<div class="grp ${cls}"><h4>${title} (${names.length})</h4><div class="chars">${
    names.map(n=>`<div class="ch" data-c="${n}" style="--cc:${PROFILES[n].color}" title="${esc(PROFILES[n].role)}"><div class="pic" style="${avatar(n)}"><i></i></div><div class="n">${PROFILES[n].display}</div></div>`).join('')}</div></div>`;
  $('roster').innerHTML=grp('b','BUILDERS',BUILDERS)+grp('r','REVIEWERS',REVIEWERS)+grp('s','SUPPORT',SUPPORT);
}

function tickClock(){
  $('clock').textContent=new Date().toLocaleTimeString('vi-VN',{hour12:false});
  $('live').classList.toggle('off',!online);
  $('live-t').textContent=online?'LIVE':'NO FILE';
}

buildRoster();
document.addEventListener('click',e=>{
  const el=(e.target as HTMLElement).closest<HTMLElement>('[data-c]');
  const st=(window as unknown as {__studio?:Studio}).__studio;
  if(el&&st)st.open(el.dataset.c!);
});
void poll();
setInterval(()=>{
  tickClock();renderBoard();
  const st=(window as unknown as {__studio?:Studio}).__studio;
  if(st)renderAgents(st);
},500);

// Fullscreen for the scene area (button or F key); the info card lives inside #world so it stays visible.
// Real browser fullscreen when allowed, otherwise (embedded views) the stage just covers the whole window.
const stage=$('stage');
const isFs=()=>!!document.fullscreenElement||stage.classList.contains('max');
function syncFs(){
  const on=isFs();
  $('fs-t').textContent=on?'THOÁT':'FULLSCREEN';
  $('fs-ico').setAttribute('d',on?'M5 1v4H1M15 5h-4V1M11 15v-4h4M1 11h4v4':'M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4');
  dispatchEvent(new Event('resize'));
}
function toggleFs(){
  if(isFs()){stage.classList.remove('max');if(document.fullscreenElement)void document.exitFullscreen();syncFs();return}
  // cover the window at once; real fullscreen on top when the browser allows it (may hang or be refused when embedded)
  stage.classList.add('max');syncFs();
  stage.requestFullscreen?.().catch(()=>{});
}
$('fs').addEventListener('click',e=>{e.stopPropagation();toggleFs()});
addEventListener('keydown',e=>{
  if((e.key==='f'||e.key==='F')&&!(e.target as HTMLElement).closest('input,textarea'))toggleFs();
  if(e.key==='Escape'&&stage.classList.contains('max')){stage.classList.remove('max');syncFs()}
});
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)stage.classList.remove('max');syncFs()});
