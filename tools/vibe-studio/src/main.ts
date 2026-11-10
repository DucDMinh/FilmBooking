import {Application,Assets,Container,Graphics,Rectangle,Sprite,Text,TextStyle,Texture} from 'pixi.js';
import {State,AgentData,Point,iso,grid,roster,names,normalize,route,destination,demo,advance} from './core';
import './style.css';
const $=(id:string)=>document.getElementById(id)!;
const app=new Application();await app.init({width:1180,height:770,background:'#101d32',antialias:false,resolution:1,autoDensity:false});$('world').appendChild(app.canvas);app.stage.eventMode='static';
const world=new Container();app.stage.addChild(world);const base=new Container(),objects=new Container(),people=new Container(),labels=new Container();world.addChild(base,objects,people,labels);
const drawPoly=(g:Graphics,pts:Point[],color:string,stroke='#00000000')=>{g.poly(pts.flatMap(p=>[p.x,p.y])).fill(color);if(stroke!=='#00000000')g.stroke({color:stroke,width:1})};
function tile(x:number,y:number,color:string){const g=new Graphics();drawPoly(g,[iso(x,y),iso(x+1,y),iso(x+1,y+1),iso(x,y+1)],color,'#8e8d80');base.addChild(g)}
function cube(x:number,y:number,w:number,d:number,h:number,top:string,front:string,side:string){const g=new Graphics(),a=iso(x,y),b=iso(x+w,y),c=iso(x+w,y+d),e=iso(x,y+d),aa=iso(x,y,h),bb=iso(x+w,y,h),cc=iso(x+w,y+d,h),ee=iso(x,y+d,h);drawPoly(g,[e,c,cc,ee],front);drawPoly(g,[b,c,cc,bb],side);drawPoly(g,[aa,bb,cc,ee],top);objects.addChild(g);return g}
function label(t:string,x:number,y:number,color='#c8eaff',size=13){const txt=new Text({text:t,style:new TextStyle({fontFamily:'monospace',fontSize:size,fontWeight:'bold',fill:color,stroke:{color:'#101c35',width:4}})});txt.anchor.set(.5);txt.position.set(x,y);labels.addChild(txt);return txt}
// Scene background: low-detail city silhouettes and pixelated isometric floor.
const sky=new Graphics();sky.rect(0,0,1180,770).fill('#172744');for(let i=0;i<22;i++){const x=50+i*52,h=40+(i*47)%130;sky.rect(x,30+h/3,43,155-h/2).fill(i%2?'#243b63':'#1e3355');for(let j=0;j<5;j++)sky.rect(x+8+(j%2)*16,54+(j*17)%100,5,8).fill(j%3?'#42688a':'#d6aa69')}base.addChild(sky);
for(let y=0;y<grid.h;y++)for(let x=0;x<grid.w;x++){let c=(x+y)%2?'#aa9e8c':'#b5aa96';if(x<5&&y<7)c=(x+y)%2?'#a69387':'#b8a396';if(x<7&&y>8)c=(x+y)%2?'#998fa7':'#a99eb8';if(x>9&&y>9)c=(x+y)%2?'#aa968f':'#b8a398';tile(x,y,c)}
// Asset-driven decor layer. The generated atlas is split into independent transparent PNGs.
const decor=new Container();objects.addChild(decor);
const decorSpecs:[string,number,number,number][]=[
 ['plant',1,1,1.2],['plant',5,3,.9],['plant',16,2,1.0],['plant',4,11,1.0],
 ['bookshelf',4,1,1.2],['bookshelf',16,6,1.1],['coffee',2,4,1.15],
 ['sofa',12,10,1.3],['server',16,9,1.1]
];
for(const [asset,x,y,scale] of decorSpecs){try{const tex=await Assets.load(`/assets/decor/${asset}.png`);const spr=new Sprite(tex);spr.anchor.set(.5,1);spr.scale.set(scale);const pt=iso(x,y,5);spr.position.set(pt.x,pt.y);decor.addChild(spr)}catch(e){console.warn('Optional decor unavailable',asset,e)}}
// Rear partitions and furniture are separate render objects, not painted into the background.
for(const [x,y] of [[2,2],[3,5]]){cube(x,y,1.35,1,20,'#e2ad77','#8e5f49','#a77555');cube(x+.3,y+.3,.25,.25,22,'#f2d6ac','#d7af7c','#c89a6b')}
for(const [x,y] of [[2,9],[4,9],[6,9]]){cube(x,y,1.2,.9,26,'#a98bc2','#68547d','#80679d');cube(x+.3,y+.2,.65,.2,46,'#293b5f','#202c49','#273650')}
for(let r=0;r<2;r++)for(let c=0;c<3;c++){const x=7+c*2,y=4+r*3;cube(x,y,1.65,1.2,32,'#8096a6','#526477','#647b8e');cube(x+.45,y+.22,.75,.16,60,'#2b6da0','#14283f','#183b59');cube(x+.75,y+.35,.25,.25,34,'#d9d6d1','#aaa9a7','#9b9a95')}
cube(14,4,2,1.5,37,'#7465ac','#494171','#605289');cube(14.35,4.25,1.1,.18,72,'#527fc9','#1d325d','#283e7a');cube(11,2,1.9,1.2,28,'#c6a26b','#8d6945','#ad8557');cube(11.4,2.2,.8,.2,52,'#527caa','#203957','#315274');cube(11,10,2.7,1.1,22,'#bc876d','#87564f','#a96d58');cube(11,10,2.7,.35,40,'#c5927d','#945f57','#ae7567');
for(const [x,y] of [[0,2],[0,8],[5,1],[15,1],[17,8],[7,11]]){cube(x,y,.7,.7,26,'#a87358','#7c5146','#946049');const p=iso(x+.35,y+.35,39);const g=new Graphics();g.circle(p.x,p.y,17).fill('#427b54');g.circle(p.x-7,p.y-7,12).fill('#6aab6c');g.circle(p.x+8,p.y-3,10).fill('#4b965d');objects.addChild(g)}
for(const [text,x,y,c] of [['CAFE',2,1,'#ffd294'],['CODING',9,2,'#90dbff'],['REVIEW',3,8,'#deb4ff'],['MERGE',15,3,'#c3b2ff'],['RELAX',12,10,'#ffca9e'] ] as [string,number,number,string][]) {const p=iso(x,y,98);label(text,p.x,p.y,c,16)}
const allPoses=['stand','walk0','walk1','work0','work1','sit'];const textures=new Map<string,Texture>();await Promise.all(names.flatMap(name=>allPoses.map(async pose=>{const path=`/assets/chars/${name}-${pose}.png`;textures.set(`${name}:${pose}`,await Assets.load(path))})));
// Actual character sprites cropped and alpha-masked from the newly generated artwork.
// Each character uses its own generated image; procedural animation is applied to the
// container so the illustrated identity stays consistent across work/idle/walk states.
const generatedTextures=new Map<string,Texture>();
await Promise.all(names.map(async name=>{
  generatedTextures.set(name,await Assets.load(`/assets/chars-generated/${name}.png`));
}));
// The hand-coded sheets are an optional prototype only. The illustrated character
// pack is the visual default until a hand-polished animation set is available.
const prototypeArt=new URLSearchParams(location.search).get('art')==='prototype';
const animations={idle:4,walk_down:4,walk_up:4,walk_left:4,walk_right:4,work:6,sit:4,talk:4} as const;
type Animation=keyof typeof animations;
const animatedTextures=new Map<string,Texture[]>();
if(prototypeArt)await Promise.all(names.flatMap(name=>(Object.keys(animations) as Animation[]).map(async animation=>{
  try{
    const atlas=await Assets.load<Texture>(`/assets/characters/${name.toLowerCase()}/${animation}.png`);
    animatedTextures.set(`${name}:${animation}`,Array.from({length:animations[animation]},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i*64,0,64,96)})));
  }catch(e){console.warn('Optional animation unavailable',name,animation,e)}
})));
const extractedAnimations={idle:5,walk_down:4,walk_up:1,walk_left:2,walk_right:2,work:1,sit:1} as const;
const extractedTextures=new Map<string,Texture[]>();
if(!prototypeArt)await Promise.all(names.flatMap(name=>(Object.keys(extractedAnimations) as (keyof typeof extractedAnimations)[]).map(async animation=>{
  try{
    const atlas=await Assets.load<Texture>(`/assets/characters-extracted/${name.toLowerCase()}/${animation}.png`);
    extractedTextures.set(`${name}:${animation}`,Array.from({length:extractedAnimations[animation]},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i*64,0,64,96)})));
  }catch(e){console.warn('Extracted artwork unavailable',name,animation,e)}
})));
interface Actor {id:string;data:AgentData;x:number;y:number;goal:Point;path:Point[];state:string;container:Container;sprite:Sprite;caption:Text;alpha:number;remove:boolean;clock:number;index:number}
const actors=new Map<string,Actor>();let selected='Nova',snapshot:State=demo(),live=false,connected=true,step=0;
const endpoint=new URLSearchParams(location.search).get('api')||'/api/state';
let pendingPoll:AbortController|null=null,pollGeneration=0;
function textureName(a:Actor,animation:Animation,pose:string){const name=textures.has(`${a.id}:${pose}`)?a.id:({builder:'Nova',reviewer:'Sage',merger:'Eve',dispatcher:'Captain',design:'Pixel','spec-validator':'Oracle','error-analyzer':'Sherlock','spec-publisher':'Herald','spec-init':'Scout',brainstorm:'Muse',graph:'Cartographer'} as Record<string,string>)[a.data.role]||'Nova';const frames=extractedTextures.get(`${name}:${animation}`)??extractedTextures.get(`${name}:idle`)??animatedTextures.get(`${name}:${animation}`);if(frames?.length){const fps=animation.startsWith('walk')?8:animation==='work'?5:3;return frames[Math.floor(a.clock*fps)%frames.length]}return generatedTextures.get(name) ?? textures.get(`${name}:${pose}`)!}
function createActor(a:AgentData,index:number):Actor{const container=new Container(),sprite=new Sprite(textures.get('Nova:stand'));sprite.anchor.set(.5,1);sprite.scale.set(prototypeArt?1.25:1.55);container.addChild(sprite);const caption=new Text({text:a.agent,style:new TextStyle({fontFamily:'monospace',fontSize:13,fontWeight:'bold',fill:'#ffffff',stroke:{color:'#09172d',width:5}})});caption.anchor.set(.5,1);caption.y=prototypeArt?-126:-139;container.addChild(caption);container.eventMode='static';container.cursor='pointer';container.on('pointertap',()=>{selected=a.agent;inspect()});people.addChild(container);const p={x:1+index%5,y:7+Math.floor(index/5)};return{id:a.agent,data:a,x:p.x,y:p.y,goal:p,path:[],state:'stand',container,sprite,caption,alpha:0,remove:false,clock:0,index}}
function reconcile(s:State){const data=normalize(s),seen=new Set<string>();snapshot=s;const occupied=new Set<string>();for(const a of data){seen.add(a.agent);let actor=actors.get(a.agent);if(!actor){actor=createActor(a,actors.size);actors.set(a.agent,actor)}actor.remove=false;actor.data=a;actor.caption.text=a.agent;const rolePeers=data.filter(v=>v.role===a.role);const rank=rolePeers.findIndex(v=>v.agent===a.agent);let goal=destination(a,rank);let k=`${goal.x},${goal.y}`;if(occupied.has(k)){const alternates=[{x:5,y:11},{x:8,y:11},{x:15,y:10},{x:1,y:8},{x:16,y:8},{x:8,y:2}];goal=alternates.find(v=>!occupied.has(`${v.x},${v.y}`))||goal;k=`${goal.x},${goal.y}`}occupied.add(k);if(goal.x!==actor.goal.x||goal.y!==actor.goal.y){actor.goal=goal;actor.path=route({x:actor.x,y:actor.y},goal)}}for(const [id,a] of actors)if(!seen.has(id))a.remove=true;hud()}
function update(dt:number){for(const [id,a] of actors){a.clock+=dt;if(a.remove){a.alpha=Math.max(0,a.alpha-dt*2);if(a.alpha===0){people.removeChild(a.container);a.container.destroy({children:true});actors.delete(id)}continue}a.alpha=Math.min(1,a.alpha+dt*2);const next=a.path[0];let direction:Animation='walk_down';if(next){const dx=next.x-a.x,dy=next.y-a.y,d=Math.hypot(dx,dy);if(d<.055){a.x=next.x;a.y=next.y;a.path.shift()}else{direction=Math.abs(dx-dy)>Math.abs(dx+dy)*.55?(dx-dy>0?'walk_right':'walk_left'):(dx+dy>0?'walk_down':'walk_up');const v=Math.min(d,dt*2.3);a.x+=dx/d*v;a.y+=dy/d*v}}const walking=a.path.length>0;const idle=a.data.phase==='idle'||a.data.stale;const animation:Animation=walking?direction:idle?'sit':a.data.phase==='orchestrating'?'talk':'work';const pose=walking?`walk${Math.floor(a.clock*6)%2}`:idle?'sit':`work${Math.floor(a.clock*3)%2}`;const texture=textureName(a,animation,pose);if(a.sprite.texture!==texture)a.sprite.texture=texture;const p=iso(a.x+.45,a.y+.5);a.container.position.set(Math.round(p.x),Math.round(p.y+(prototypeArt?0:walking?Math.sin(a.clock*15)*3:idle?Math.sin(a.clock*2):Math.sin(a.clock*6)*1.5)));a.sprite.scale.x=(prototypeArt?1:walking&&Math.sin(a.clock*10)<0?-1:1)*(prototypeArt?1.25:1.55);a.sprite.scale.y=prototypeArt?1.25:1.55+(idle?Math.sin(a.clock*2)*.012:Math.sin(a.clock*6)*.02);a.container.alpha=a.alpha;a.container.zIndex=Math.round((a.x+a.y)*100);a.caption.style.fill=id===selected?'#fff4ad':'#ffffff'}people.sortableChildren=true}
app.ticker.add(t=>update(Math.min(.05,t.deltaMS/1000)));
const escapeHtml=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function inspect(){const a=actors.get(selected);$('inspect').innerHTML=a?`<b>${escapeHtml(a.id)}</b> · ${escapeHtml(a.data.role)}<br>Phase: <b>${escapeHtml(a.data.phase||'idle')}</b><br>Task: ${escapeHtml(a.data.task||'None')}<br>${escapeHtml(a.data.title||'')}<br>Since: ${Math.floor(a.data.sinceSec||0)}s`:'Click an agent in the studio.'}
function hud(){const s=snapshot,c=s.counts||{},total=c.total||1,pct=Math.round((c.done||0)/total*100);$('project').textContent=s.projectName||'Untitled';$('layer').textContent=`${s.currentLayer||0} / ${s.totalLayers||0}`;$('phase').textContent=s.phase||'Unknown';$('percent').textContent=pct+'%';$('fill').style.width=pct+'%';for(const key of ['todo','running','review','done'])$(key).textContent=String(c[key]||0);$('total').textContent=total+' TASKS';$('count').textContent=actors.size+' AGENTS';$('mode').textContent=live?'LIVE':'DEMO';$('source').textContent=live?'API':'DEMO';$('status').textContent=live?(connected?'● LIVE CONNECTED':'● DISCONNECTED · LAST STATE RETAINED'):'● DEMO ENGINE ONLINE';$('tasks').innerHTML=['todo','review','done'].map(k=>`<div class="task-col"><h4>${k.toUpperCase()} · ${(s.columns?.[k]||[]).length}</h4>${(s.columns?.[k]||[]).slice(0,4).map(t=>`<div class="task ${k}">${escapeHtml(t.title||t.id)}<small>${escapeHtml(t.id)} ${t.guessed?'⚠ estimated':''}</small></div>`).join('')||'<div class="task">No tasks</div>'}</div>`).join('');$('roster').innerHTML=[...actors.values()].filter(a=>!a.remove).map(a=>`<div class="agent-row" data-id="${escapeHtml(a.id)}"><span class="avatar"><img src="${prototypeArt?`/assets/characters/${names.includes(a.id)?a.id.toLowerCase():'nova'}/stand.png`:`/assets/characters-extracted/${names.includes(a.id)?a.id.toLowerCase():'nova'}/stand.png`}" alt="" /></span><span class="details"><b>${escapeHtml(a.id)}</b><small>${escapeHtml(a.data.title||a.data.task||'Available')}</small></span><span class="tag">${escapeHtml(a.data.phase||'idle')}</span></div>`).join('');document.querySelectorAll<HTMLElement>('[data-id]').forEach(el=>el.onclick=()=>{selected=el.dataset.id!;inspect()});inspect()}
async function poll(){
  if(!live||pendingPoll)return;
  const abort=new AbortController(),generation=pollGeneration;
  pendingPoll=abort;
  const timeout=setTimeout(()=>abort.abort(),2600);
  try{
    const r=await fetch(endpoint,{signal:abort.signal,cache:'no-store'});
    if(!r.ok)throw Error('HTTP '+r.status);
    const data=await r.json() as State;
    if(!live||generation!==pollGeneration)return;
    if(data.mode==='error')throw Error('API error state');
    normalize(data); // Reject malformed snapshots before updating the connection indicator.
    connected=true;reconcile(data);
  }catch(e){
    if(live&&generation===pollGeneration){connected=false;hud();console.warn('State polling:',e)}
  }finally{clearTimeout(timeout);if(pendingPoll===abort)pendingPoll=null}
}
function demoMode(){
  live=false;pollGeneration++;pendingPoll?.abort();pendingPoll=null;connected=true;
  $('demo').classList.add('active');$('live').classList.remove('active');reconcile(demo());
}
$('demo').onclick=demoMode;
$('live').onclick=()=>{live=true;pollGeneration++;pendingPoll?.abort();pendingPoll=null;connected=false;$('live').classList.add('active');$('demo').classList.remove('active');hud();void poll()};
$('step').onclick=()=>{if(live)demoMode();reconcile(advance(++step))};
setInterval(()=>{if(live)void poll()},3000);reconcile(demo());


// One renderer only: the real-time PixiJS scene is always active.
