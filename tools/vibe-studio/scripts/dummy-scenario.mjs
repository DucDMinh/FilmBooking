#!/usr/bin/env node
// Dummy scenario — the FULL opencode-project-template flow ("How it works" + .agent/loop.md), written to the
// same display file the real loop writes: `.context/agents-live.json` (agent-live.mjs format)
//   {updatedAt, agents:[{agent, role, phase, task?, title?, since}]}   enter = upsert · leave = remove · clear
//
//  0  /start: spec-init → spec-validator FAIL → clarify → re-validate PASS ⏸
//     brainstorm ⏸ → design ⏸ → graph ⏸
//  L0 devops git init + CI · 2 builders → reviewers → merge → checkpoint
//  L1 wave 1 (3 builders) + wave 2 (1 dependent task): review FAIL → round 2, a task BLOCKED after
//     3 error-analyzer retries, merge conflict → error-analyzer on the integration branch, CI check
//  L2 6 builders in parallel (one hard task on builder-strong), reviewers, merge, phase validation
//  L3 final layer + devops deploy: staging health check FAILS → rollback → fix → deploy prod
//  maintenance: /bug-check (read-only sweep) → /bug (BUG: root cause first) → /feature (ADDITIVE)
//  then everyone idle (an agent left with phase "idle" counts as idle too) and the loop restarts.
// Roles beyond agent-live.mjs's four (builder|reviewer|merger|dispatcher) are written too; the studio maps them.
//
// Usage: node scripts/dummy-scenario.mjs [--speed 1] [--stretch 2.5] [--once] [--file <path>]
//   --stretch: multiplies every task/step duration (default 2.5 = each task ~2.5× longer than the base timeline)
//   file defaults to studio.config.json → stateFile (the same file the studio page reads).
import {writeFileSync,renameSync,mkdirSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),opt=k=>{const i=args.indexOf(`--${k}`);return i<0?undefined:args[i+1]??true};
let cfg={};try{cfg=JSON.parse(readFileSync(resolve(root,'studio.config.json'),'utf8'))}catch{}
const file=resolve(root,opt('file')??process.env.STATE_FILE??cfg.stateFile??'.context/agents-live.json');
// progress.json (layers + completed/blocked tasks) for the task board; same format as the template's
// progress-write.mjs, plus a `tasks` list of the planned tasks (extension so the board can show TODO).
const progressFile=resolve(root,opt('progress')??process.env.PROGRESS_FILE??cfg.progressFile??resolve(dirname(file),'progress.json'));
const speed=Number(opt('speed')??1),once=args.includes('--once');
// Every wait in the timeline is multiplied by STRETCH so each task lasts longer (anh: "lâu hơn chút", 23/10).
const STRETCH=Number(opt('stretch')??2.5);

// ── timeline builder ────────────────────────────────────────────────────────────────────────────────
// Each event: {t, op, agent?, role?, phase?, task?, title?, note?}; `t` accumulates the waits.
const T=[];let t=0;
const ev=(dt,e)=>{t+=dt*STRETCH;T.push({t,...e})};
const say=(dt,note)=>ev(dt,{op:'note',note});
const enter=(dt,agent,role,phase,task,title,note)=>ev(dt,{op:'enter',agent,role,phase,task,title,note});
const leave=(dt,agent,note)=>ev(dt,{op:'leave',agent,note});
const clear=(dt,note)=>ev(dt,{op:'clear',note});
const prog=(fn,note)=>ev(0,{op:'progress',fn,note});
const now=()=>new Date().toISOString();
const complete=(...ids)=>prog(p=>{for(const task of ids)if(!p.completedTasks.some(c=>c.task===task)&&!p.blockedTasks.some(b=>b.task===task))p.completedTasks.push({task,review:'STRICT PASS',round:1,completedAt:now()})});

// ── 0. /start: spec → brainstorm → design → graph ──────────────────────────────────────────────────
clear(0,'═══ /start — dự án acme-crm, chưa có spec ═══');
prog(p=>Object.assign(p,{projectName:'acme-crm',currentLayer:0,totalLayers:4,tasks:[],completedTasks:[],blockedTasks:[],inProgressTask:null}));
enter(3,'spec-init','spec-init','building',null,'Đọc code → SPECIFICATIONS.md + spec/','1a spec-init (read-only, 1 lần)');
leave(9,'spec-init');
enter(0,'spec-validator','spec-validator','review',null,'Validate spec vs code/docs','1b spec-validator');
say(6,'✗ validator FAIL: thiếu rule phân quyền → clarify');
leave(0,'spec-validator');
enter(2,'spec-init','spec-init','building',null,'Bổ sung RBAC vào spec','clarify spec');
leave(5,'spec-init');
enter(0,'spec-validator','spec-validator','review',null,'Re-validate spec (round 2)','1b re-validate');
leave(5,'spec-validator','⏸ validator PASS');
enter(3,'brainstorm','brainstorm','orchestrating',null,'Design doc + project-config','2 brainstorm');
leave(8,'brainstorm','⏸ approve design');
enter(3,'design','design','building',null,'Design tokens + screen specs','3 design');
leave(10,'design','⏸ confirm tokens');
enter(3,'graph','graph','orchestrating',null,'Layer plan: 4 layers, 14 tasks','4 graph');
leave(7,'graph','⏸ approve plan');
prog(p=>{p.tasks=[...L0,...L1,...L2,...L3].map(([task,title])=>({task,title}))},'progress.json ← 14 task (TODO)');

// ── loop helpers ────────────────────────────────────────────────────────────────────────────────────
const plan=(n)=>enter(3,'dispatcher','dispatcher','orchestrating',null,`plan --layer ${n} → parallel waves`,`═══ LOOP layer ${n}: dispatcher plan ═══`);
const build=(n,[task,title],role='builder',note)=>enter(1,`builder-${n}`,role,'building',task,title,note);
const review=(n,[task,title],note)=>{leave(0,`builder-${n}`);enter(0,`reviewer-${n}`,'reviewer','review',task,title,note)};
const merge=(n,extra)=>{
  enter(3,'merger','merger','merging',null,`merge --layer ${n} → layer-${n}-integration`,'5e merge (dispatcher)');
  extra?.();
  leave(8,'merger');
  prog(p=>{for(const [task] of [L0,L1,L2,L3][n])if(!p.completedTasks.some(c=>c.task===task)&&!p.blockedTasks.some(b=>b.task===task))p.completedTasks.push({task,review:'STRICT PASS',round:1,completedAt:now()})});
  prog(p=>{p.currentLayer=Math.min(n+1,p.totalLayers)},`progress.json ← layer ${n} done`);
};
const closeLayer=(n)=>{
  leave(0,'dispatcher');
  enter(2,'spec-validator','spec-validator','review',null,`Phase review layer ${n}`,'5g spec-validator');
  leave(6,'spec-validator');
  clear(0,`⏸ checkpoint layer ${n} — cleanup worktree, chờ anh approve`);
  t+=8*STRETCH;
};

// ── L0: git init + CI, foundation tasks ────────────────────────────────────────────────────────────
const L0=[['layer-0/task-01','Project setup + tooling'],['layer-0/task-02','DB schema + migrations']];
plan(0);
enter(2,'devops','devops','building',null,'git init + CI/CD workflows','6 devops (layer 0)');
L0.forEach((x,i)=>build(i+1,x,'builder',i?undefined:'5a 2 builder song song (worktree riêng)'));
leave(6,'devops');
L0.forEach((x,i)=>{t+=4*STRETCH;review(i+1,x,i?undefined:'5d reviewer (model khác)')});
leave(6,'reviewer-1');leave(2,'reviewer-2');
merge(0);
closeLayer(0);

// ── L1: waves, review FAIL, BLOCKED task, merge conflict ───────────────────────────────────────────
const L1=[['layer-1/task-01','REST API /users'],['layer-1/task-02','Auth middleware (JWT)'],['layer-1/task-03','Payment webhook'],['layer-1/task-04','Login page UI']];
plan(1);
say(1,'wave 1: task-01, 02, 03 · wave 2: task-04 (phụ thuộc task-02)');
L1.slice(0,3).forEach((x,i)=>build(i+1,x,'builder',i?undefined:'5a wave 1 — 3 builder song song'));
enter(8,'error-analyzer','error-analyzer','building',L1[2][0],'Root cause: webhook signature (retry 1/3)','5b test FAIL → 5c error-analyzer');
say(4,'retry 2/3 FAIL');
say(4,'retry 3/3 FAIL → task BLOCKED (chờ API key payment)');
prog(p=>p.blockedTasks.push({task:L1[2][0],reason:'Chờ API key của payment provider',since:now()}));
leave(0,'error-analyzer');
leave(0,'builder-3','builder-3 BLOCKED → task về TODO');
review(1,L1[0],'5d reviewer task-01');
t+=3*STRETCH;review(2,L1[1]);
say(6,'✗ review task-02 FAIL (STRICT): thiếu kiểm tra token hết hạn');
leave(0,'reviewer-2');
enter(0,'builder-2','builder','building',L1[1][0],`${L1[1][1]} — round 2`,'builder sửa theo review (round 2)');
leave(4,'reviewer-1','review task-01 PASS');
review(2,L1[1]);
leave(7,'reviewer-2','review task-02 PASS (round 2)');
build(1,L1[3],'builder','5a wave 2 — task-04');
t+=8*STRETCH;review(1,L1[3]);
leave(6,'reviewer-1');
merge(1,()=>{
  say(4,'✗ merge CONFLICT task-01 × task-04 → chạy lại tuần tự trên integration');
  enter(0,'error-analyzer','error-analyzer','building','layer-1-integration','Verify tổng thể FAIL: route trùng /login','verify integration → error-analyzer');
  leave(7,'error-analyzer','fix + commit, verify lại PASS');
});
enter(2,'devops','devops','review',null,'CI checks layer 1','devops CI check');
leave(5,'devops');
closeLayer(1);

// ── L2: wide parallel wave + builder-strong ────────────────────────────────────────────────────────
const L2=[['layer-2/task-01','Dashboard layout'],['layer-2/task-02','Customer list + filters'],['layer-2/task-03','Customer detail page'],['layer-2/task-04','Deals pipeline (kanban)'],['layer-2/task-05','Email notifications'],['layer-2/task-06','Multi-tenant RBAC (hard)']];
plan(2);
L2.forEach((x,i)=>build(i+1,x,i===5?'builder-strong':'builder',i?(i===5?'task khó → builder-strong (opt-in)':undefined):'5a 6 builder song song'));
[4,2,3,3,2,5].forEach((d,i)=>{t+=d*STRETCH;review(i+1,L2[i],i?undefined:'5d reviewer lần lượt nhận task')});
[3,2,2,3,2,4].forEach((d,i)=>leave(d,`reviewer-${i+1}`));
merge(2);
closeLayer(2);

// ── L3: final layer + deploy (staging fail → rollback → prod) ─────────────────────────────────────
const L3=[['layer-3/task-01','Reports + export'],['layer-3/task-02','Settings page']];
plan(3);
L3.forEach((x,i)=>build(i+1,x,'builder',i?undefined:'5a layer cuối'));
L3.forEach((x,i)=>{t+=6*STRETCH;review(i+1,x)});
leave(5,'reviewer-1');leave(2,'reviewer-2');
merge(3);
enter(2,'devops','devops','building',null,'Deploy staging','6 devops deploy staging');
say(6,'✗ health check staging FAIL');
enter(0,'rollback','rollback','orchestrating',null,'Revert về tag layer-3-done','7 rollback');
leave(5,'rollback');
enter(0,'error-analyzer','error-analyzer','building',null,'Root cause: thiếu env DATABASE_URL','5c error-analyzer');
leave(6,'error-analyzer');
say(0,'deploy staging lại → PASS');
say(4,'⏸ approve production deploy');
say(4,'deploy production ✓');
leave(0,'devops');
closeLayer(3);

// ── maintenance: /bug-check → /bug → /feature ──────────────────────────────────────────────────────
say(0,'═══ BẢO TRÌ (mode: maintenance) ═══');
enter(2,'bug-check','bug-check','review',null,'Sweep màn Customer list (read-only)','/bug-check — liệt kê defect, KHÔNG sửa');
leave(8,'bug-check','⏸ chờ anh chọn bug');
enter(3,'change-request','change-request','orchestrating','bug-filter-reset','BUG: filter reset khi đổi trang','/bug → change-request (BUG)');
prog(p=>p.tasks.push({task:'bug-phase-1-task-01',title:'BUG: filter reset khi đổi trang'}));
enter(2,'error-analyzer','error-analyzer','building','bug-filter-reset','Root cause trước (Iron Law)','root cause → repro');
leave(6,'error-analyzer');
enter(0,'builder-1','builder','building','bug-phase-1-task-01','Giữ filter trong URL state');
leave(8,'builder-1');
enter(0,'reviewer-1','reviewer','review','bug-phase-1-task-01','Giữ filter trong URL state');
leave(5,'reviewer-1');
leave(0,'change-request','bug done → commit');
complete('bug-phase-1-task-01');
enter(3,'change-request','change-request','orchestrating','feature-export-csv','ADDITIVE: export Excel/CSV','/feature → change-request (ADDITIVE)');
prog(p=>p.tasks.push({task:'feature-export-csv/phase-1-task-01',title:'Export API'},{task:'feature-export-csv/phase-1-task-02',title:'Nút Export trên UI'}));
enter(2,'spec-publisher','spec-publisher','building',null,'spec delta + bump spec_version + test-scope','spec-publisher');
leave(5,'spec-publisher');
enter(0,'spec-validator','spec-validator','review',null,'Validate spec delta','spec-validator');
leave(5,'spec-validator','⏸ approve phase plan');
enter(2,'builder-1','builder','building','feature-export-csv/phase-1-task-01','Export API');
enter(1,'builder-2','builder','building','feature-export-csv/phase-1-task-02','Nút Export trên UI');
t+=8*STRETCH;review(1,['feature-export-csv/phase-1-task-01','Export API']);
t+=3*STRETCH;review(2,['feature-export-csv/phase-1-task-02','Nút Export trên UI']);
leave(5,'reviewer-1');leave(2,'reviewer-2');
enter(0,'spec-validator','spec-validator','review',null,'Phase close feature','spec-validator phase close');
leave(5,'spec-validator');
leave(0,'change-request','feature done → archive change file');
complete('feature-export-csv/phase-1-task-01','feature-export-csv/phase-1-task-02');
enter(2,'builder-1','builder','idle',null,null,'agent còn trong file với phase "idle" → vẫn là nghỉ');
clear(6,'═══ xong — cả team nghỉ ═══');
const LENGTH=t+12*STRETCH;

// ── writer (atomic tmp + rename, like agent-live.mjs) ──────────────────────────────────────────────
let agents=[],progress={tasks:[],completedTasks:[],blockedTasks:[]},start=Date.now();
function writeProgress(){
  mkdirSync(dirname(progressFile),{recursive:true});
  const tmp=`${progressFile}.tmp-${process.pid}`;
  writeFileSync(tmp,`${JSON.stringify({...progress,lastUpdated:new Date().toISOString()},null,2)}\n`);
  renameSync(tmp,progressFile);
}
const elapsed=()=>(Date.now()-start)/1000*speed;
function write(){
  mkdirSync(dirname(file),{recursive:true});
  const tmp=`${file}.tmp-${process.pid}`;
  writeFileSync(tmp,`${JSON.stringify({updatedAt:new Date().toISOString(),agents},null,2)}\n`);
  renameSync(tmp,file);
}
function apply(e){
  if(e.op==='progress'){e.fn(progress);writeProgress();if(!e.note)return}
  if(e.op==='clear')agents=[];
  else if(e.op==='leave')agents=agents.filter(a=>a.agent!==e.agent);
  else if(e.op==='enter'){
    const prev=agents.find(a=>a.agent===e.agent);
    const a={agent:e.agent,role:e.role,phase:e.phase};
    if(e.task)a.task=e.task;if(e.title)a.title=e.title;
    a.since=prev&&prev.task===e.task&&prev.phase===e.phase?prev.since:new Date().toISOString();
    agents=[...agents.filter(x=>x.agent!==e.agent),a].sort((x,y)=>x.agent.localeCompare(y.agent,undefined,{numeric:true}));
  }
  if(e.op!=='note'&&e.op!=='progress')write();
  const act=agents.filter(a=>a.phase!=='idle').map(a=>a.agent).join(', ')||'— (cả team nghỉ)';
  const head=e.note?`▶ ${e.note}`:'';
  const what=e.op==='note'||e.op==='progress'?'':`${e.op} ${e.agent??''}`.trim();
  console.log(`${String(Math.round(elapsed())).padStart(4)}s  ${head}${head&&what?'  · ':''}${what}${e.op==='note'||e.op==='progress'?'':`   [đang làm: ${act}]`}`);
}
console.log(`dummy scenario → ${file}\nspeed ×${speed} · ${Math.round(LENGTH/speed)} s/vòng${once?'':' · lặp vô hạn — Ctrl+C để dừng'}\n`);
async function run(){
  for(;;){
    start=Date.now();
    for(const e of T){
      const wait=e.t/speed*1000-(Date.now()-start);
      if(wait>0)await new Promise(r=>setTimeout(r,wait));
      apply(e);
    }
    await new Promise(r=>setTimeout(r,(LENGTH-t)/speed*1000));
    if(once)break;
    console.log('\n— lặp lại từ đầu —\n');
  }
}
run();
