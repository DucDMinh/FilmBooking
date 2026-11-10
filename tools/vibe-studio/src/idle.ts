// Idle agents: an agent with no work takes a break. Every stay it picks one of the two break zones at random
// (Cafe or Lounge), then a random free slot inside it. Each slot has its own rest activities (pose + small
// effect: steam, music notes, Zzz, phone game…) and friends sharing a table/sofa interact (chat, cheers,
// laugh, selfie, poking a sleeper). No walking: the agent fades out and in at the next slot.
// Each slot holds one agent; slots closer than BLOCK_RADIUS or listed in `conflicts` (including work seats
// registered as blockers, e.g. 'P' = Pixel's sofa desk) block each other, so sprites never overlap.
import {Container,Graphics,Sprite,Text,type Texture} from 'pixi.js';
import {iconSprite,setIcon} from './pixel-icons';

export type IdleManifest={scale:number;poses:Record<string,{file:string;width:number;height:number;anchorX:number;anchorY:number}>};
export type IdleCast={name:string;manifest:IdleManifest;textures:Record<string,Texture>};

type Zone='cafe'|'lounge'|'library';
// Rest effect drawn around the agent while an activity runs.
type WalkMode='skip'|'look'|'trip'|'down'|'peek'|'up';
type Fx='hop'|'steam'|'sigh'|'brew'|'music'|'game'|'scroll'|'zzz'|'view'|'water'|'page'|'dust'|'dream';
type Act={pose:string;w:number;min:number;max:number;fx:Fx};
type Interaction='chat'|'cheers'|'laugh'|'selfie'|'poke';
export type IdleSlot={id:string;x:number;y:number;zone:Zone;flip:boolean;acts:Act[];
  // counter: play the acts in order (brew, then drink) instead of at random
  seq?:boolean;
  // pose used to chat when a friend sits in the same `group`, and the interactions that group allows
  talk?:string;group?:string;together?:Interaction[];conflicts?:string[];
  // reserved for these characters only (the reading corner and the shelf by MERGE)
  only?:string[];
  // a walking spot: the agent skips along these floor points (ping-pong) instead of staying put
  path?:[number,number][];
  // extra poses this spot needs besides its acts
  needs?:string[]};

// Characters with a reserved corner: when the break area is full they give their seat up and move there.
export const RESERVED=['eve','theo','oracle'];
const act=(pose:string,w:number,min:number,max:number,fx:Fx):Act=>({pose,w,min,max,fx});
const TABLE:Interaction[]=['chat','chat','cheers'];
const SOFA:Interaction[]=['chat','laugh','selfie'];
const POUFS:Interaction[]=['chat','laugh','poke'];

// Floor contact of each slot on office_original.png (1496x1051), tuned one by one on zoomed renders (22/10):
// cafe chair sprites cover the painted chairs; lounge sprites sit inside the cushions, not on the front edge.
export const IDLE_SLOTS:IdleSlot[]=[
  // coffee counter: brew, then drink
  {id:'C5',x:240,y:302,zone:'cafe',flip:false,seq:true,acts:[act('stand_brew',1,4,6,'brew'),act('stand_drink',1,5,8,'steam')]},
  // cafe table A: both front chairs, side by side with their backs to the viewer, facing the table
  // (C1 looks up-right, C2 mirrored looks up-left). Table B: C3 back to the viewer and C4 on the far chair
  // facing out, face to face across the table (re-placed 22/10 — a front-facing C2 sat with its back to the table).
  {id:'C2',x:250,y:436,zone:'cafe',flip:true,group:'tableA',talk:'chair_back_talk',together:TABLE,
    acts:[act('chair_back_drink',60,6,10,'steam'),act('chair_back_drink',40,4,7,'sigh')]},
  {id:'C1',x:188,y:425,zone:'cafe',flip:false,group:'tableA',talk:'chair_back_talk',together:TABLE,
    acts:[act('chair_back_drink',60,6,10,'steam'),act('chair_back_drink',40,4,7,'sigh')]},
  {id:'C4',x:418,y:334,zone:'cafe',flip:true,group:'tableB',talk:'chair_front_talk',together:TABLE,
    acts:[act('chair_front_drink',60,6,10,'steam'),act('chair_front_drink',40,4,7,'sigh')]},
  {id:'C3',x:345,y:356,zone:'cafe',flip:false,group:'tableB',talk:'chair_back_talk',together:TABLE,
    acts:[act('chair_back_drink',60,6,10,'steam'),act('chair_back_drink',40,4,7,'sigh')]},
  // lounge: L-sofa, two poufs, loveseat, water cooler
  {id:'R2',x:1268,y:782,zone:'lounge',flip:false,group:'sofa',talk:'sit_laugh',together:SOFA,
    acts:[act('sit_drink',35,5,9,'steam'),act('sit_relax',35,6,10,'music'),act('sit_phone',30,6,10,'game')]},
  {id:'R1',x:1162,y:795,zone:'lounge',flip:false,group:'sofa',talk:'sit_laugh',together:SOFA,conflicts:['P'],
    acts:[act('sit_relax',40,6,10,'music'),act('sit_phone',35,6,10,'scroll'),act('sit_drink',25,5,9,'steam')]},
  {id:'R3',x:1335,y:803,zone:'lounge',flip:true,group:'sofa',talk:'sit_laugh',together:SOFA,
    acts:[act('sit_phone',35,6,10,'game'),act('sit_phone',25,6,10,'scroll'),act('sit_relax',40,6,10,'music')]},
  {id:'R6',x:1152,y:888,zone:'lounge',flip:false,group:'poufs',talk:'sit_laugh',together:POUFS,
    acts:[act('sit_doze',60,10,16,'zzz'),act('sit_relax',40,6,10,'music')]},
  {id:'R5',x:1080,y:858,zone:'lounge',flip:false,group:'poufs',talk:'sit_laugh',together:POUFS,
    acts:[act('sit_relax',40,6,10,'music'),act('sit_phone',35,6,10,'game'),act('sit_doze',25,8,12,'zzz')]},
  {id:'R7',x:1336,y:928,zone:'lounge',flip:false,acts:[act('sit_back',1,8,14,'view')]},
  {id:'R8',x:1420,y:918,zone:'lounge',flip:true,acts:[act('stand_drink',1,5,9,'water')]},
  // Reserved corners for Eve/Theo/Oracle (22/10): two reading armchairs (chair baked into read_* sprites)
  // in the bookshelf nook behind CODING, and a standing spot at the tall shelf by the MERGE door.
  {id:'L1',x:520,y:246,zone:'library',flip:false,only:RESERVED,acts:[act('read_a',60,6,10,'page'),act('read_b',40,4,7,'page')]},
  {id:'L2',x:580,y:264,zone:'library',flip:false,only:RESERVED,acts:[act('read_a',60,6,10,'page'),act('read_b',40,4,7,'page')]},
  // Review team's viewpoint (22/10): standing right behind the glass railing below REVIEW, between two
  // plant pots, facing the far city (stand_drink mirrored = facing the lower-left). The railing is drawn
  // over the legs by the review_rail_fg.png overlay (coding-test.ts).
  {id:'V1',x:305,y:984,zone:'library',flip:true,only:['sage','iris','juno','echo'],acts:[act('stand_drink',60,6,10,'view'),act('stand_drink',40,4,7,'sigh')]},
  // Eve's nap spot (22/10): rolled up in a blanket on the glowing carpet of her MERGE corner, tossing and
  // turning between three sleeping poses (blanket + pillow baked into the sleep_* sprites).
  {id:'M1',x:1235,y:540,zone:'library',flip:false,only:['eve'],acts:[act('sleep_a',40,3,6,'dream'),act('sleep_b',30,3,5,'dream'),act('sleep_c',30,3,5,'dream')]},
  // Eve's stroll (22/10): skipping along the open floor in front of the lower CODING row, looking around,
  // now and then tripping flat on her face, peeking around from the floor, then hopping back up.
  {id:'W1',x:820,y:760,zone:'library',flip:false,only:['eve'],path:[[590,742],[700,772],[850,765],[1000,745]],
    needs:['walk_b','look','trip','down','peek','up'],acts:[act('walk_a',1,14,22,'hop')]},
  {id:'S1',x:1030,y:372,zone:'library',flip:false,only:RESERVED,acts:[act('search_a',50,4,7,'dust'),act('search_b',50,3,6,'dust')]},
];
const ZONES:Zone[]=['cafe','lounge'];
const BLOCK_RADIUS=40;
const CORNER_CHANCE=0.2;
// Seconds spent in one slot before moving on (the counter is a quick stop: brew + one sip).
const STAY:[number,number]=[18,35];
const COUNTER_STAY:[number,number]=[9,14];
const INTERACT_CHANCE=0.4;
const INTERACT_SECONDS:Record<Interaction,[number,number]>={chat:[3,6],cheers:[3,3.4],laugh:[2.6,4],selfie:[3.2,3.6],poke:[3,3.4]};

const TALK_POSES=new Set(['chair_front_talk','chair_back_talk','sit_laugh']);
// Thoughts floating up while reading, in each reader's own style.
const READ_ICONS:Record<string,string[]>={eve:['sparkle','star','idea'],theo:['idea','note','check'],oracle:['check','cross','exclaim']};
const BREATH_POSES=new Set(['sit_relax','sit_doze','sit_back','read_a','read_b','search_b']);
const CHAT_ICONS=['chat','laugh','heart','coffee','star','sparkle','note'];
const FADE_MS=300;
const rand=(a:number,b:number)=>a+Math.random()*(b-a);
const any=<T>(items:T[])=>items[Math.floor(Math.random()*items.length)];
const pick=<T>(items:[T,number][])=>{let r=Math.random()*items.reduce((s,[,w])=>s+w,0);for(const [it,w] of items)if((r-=w)<0)return it;return items[0][0]};
const label=(text:string,fill:string,size:number)=>{
  const t=new Text({resolution:3,text,style:{fontFamily:'"Nunito","Trebuchet MS",sans-serif',fontSize:size,fontWeight:'900',fill,stroke:{color:'#16223a',width:3}}});
  t.anchor.set(.5);return t;
};

// ONE CHARACTER, ONE SPRITE: in the real scene a character is either working at its seat or idling here,
// never both and never twice. `isWorking` is wired to the work seats; only test clones (clone=true) may
// share a character.
export class IdleWorld{
  owner=new Map<string,IdleAgent>();
  isWorking:(name:string)=>boolean=()=>false;
  // Work seats that block nearby idle slots while someone works there.
  blockers:{id:string;x:number;y:number;active:()=>boolean}[]=[];
  agents:IdleAgent[]=[];
  // Agents mid seat-swap (a full room trades places one pair at a time).
  swapping=0;
  constructor(public layer:Container){}
  // Reserved corners only take their own characters, and only once they have the poses for it.
  fits(slot:IdleSlot,agent:IdleAgent){
    if(slot.only&&(agent.clone||!slot.only.includes(agent.cast.name)))return false;
    return [...slot.acts.map(a=>a.pose),...slot.needs??[]].every(p=>p in agent.cast.manifest.poses);
  }
  free(slot:IdleSlot,except?:IdleAgent){
    if(except&&!this.fits(slot,except))return false;
    const holder=this.owner.get(slot.id);
    if(holder&&holder!==except)return false;
    for(const [id,a] of this.owner){
      if(a===except||id===slot.id)continue;
      const s=IDLE_SLOTS.find(s=>s.id===id)!;
      if(slot.conflicts?.includes(id)||Math.hypot(s.x-slot.x,s.y-slot.y)<BLOCK_RADIUS)return false;
    }
    return this.blockers.every(b=>!b.active()||(!slot.conflicts?.includes(b.id)&&Math.hypot(b.x-slot.x,b.y-slot.y)>=BLOCK_RADIUS));
  }
  // A random free slot of a random zone (the other zone if the first is full); never the current slot.
  claim(agent:IdleAgent){
    // Now and then a character with a private corner goes there even when the room has space.
    if(Math.random()<CORNER_CHANCE){
      const corner=this.reservedFor(agent);
      if(corner){this.release(agent);this.owner.set(corner.id,agent);return corner}
    }
    const zones=Math.random()<.5?ZONES:[...ZONES].reverse();
    for(const zone of zones){
      const open=IDLE_SLOTS.filter(s=>s.zone===zone&&s.id!==agent.slot?.id&&this.free(s,agent));
      if(!open.length)continue;
      const slot=any(open);
      this.release(agent);
      this.owner.set(slot.id,agent);
      return slot;
    }
    return null;
  }
  // A free reserved corner for this agent (Eve/Theo/Oracle), or null.
  reservedFor(agent:IdleAgent){
    const open=IDLE_SLOTS.filter(s=>s.only&&s.id!==agent.slot?.id&&this.free(s,agent));
    return open.length?any(open):null;
  }
  // Break area full: an Eve/Theo/Oracle sitting in a shared seat gives it up and moves to its corner.
  // The seat is released at once so the newcomer can take it (the two cross-fade on it).
  yieldSeat(now:number){
    const mover=this.agents.find(a=>a.active&&a.slot&&!a.slot.only&&!a.fadingOut&&!a.swapTo&&!a.moveTo&&this.reservedFor(a));
    if(!mover)return false;
    mover.moveAside(this.reservedFor(mover)!,now);
    return true;
  }
  canYield(){return this.agents.some(a=>a.active&&a.slot&&!a.slot.only&&!a.fadingOut&&!a.swapTo&&!a.moveTo&&this.reservedFor(a))}
  // Is there any free slot for this agent right now? Checked before a character leaves its work seat.
  hasRoom(agent:IdleAgent){return IDLE_SLOTS.some(s=>this.free(s,agent))||this.canYield()}
  release(agent:IdleAgent){if(agent.slot&&this.owner.get(agent.slot.id)===agent)this.owner.delete(agent.slot.id)}
  // A friend in the same table/sofa group.
  mate(agent:IdleAgent){
    const g=agent.slot?.group;if(!g)return null;
    return this.agents.find(a=>a!==agent&&a.active&&!a.fadingOut&&a.slot?.group===g)??null;
  }
  // The real (non-clone) idle agent of a character, if any.
  agentOf(name:string){return this.agents.find(a=>!a.clone&&a.cast.name===name)}
  // A character got work: its idle sprite leaves immediately.
  leave(name:string){for(const a of this.agents)if(a.cast.name===name&&!a.clone&&a.active)a.stop()}
  update(now:number,dt:number){for(const a of this.agents)a.update(now,dt)}
}

export class IdleAgent{
  root=new Container();
  sprite=new Sprite();
  fx=new Container();
  icon=iconSprite('chat',16);
  bubble=new Container();
  slot:IdleSlot|null=null;
  active=false;
  pose='';
  act:Act|null=null;
  actIndex=0;
  until=0;
  leaveAt=0;
  fade=1;
  fadingOut=false;
  particleClock=0;
  // Interaction this agent leads (`partner` follows along) or joins (`leader` set).
  together:{kind:Interaction;partner:IdleAgent;start:number;stage:number}|null=null;
  leader:IdleAgent|null=null;
  // Seat taken from the partner when the room is full and the two trade places.
  swapTo:IdleSlot|null=null;
  // Reserved corner this agent is fading over to after giving its shared seat up.
  moveTo:IdleSlot|null=null;
  // When the agent last rolled over in its sleep (nap spot bounce).
  rollAt=-1e9;
  // Walking spot state: target path point, direction along the path, current mode and when it began.
  walk={i:0,dir:1,mode:'skip' as WalkMode,t0:0,last:0,flip:1,next:0};
  constructor(public world:IdleWorld,public cast:IdleCast,public clone=false){
    if(!clone&&world.agentOf(cast.name))throw new Error(`idle agent for ${cast.name} already exists`);
    this.bubble.addChild(new Graphics().roundRect(-13,-12,26,22,7).fill('#ffffff').stroke({color:'#16223a',width:2}).poly([-4,10,4,10,-2,16]).fill('#ffffff'),this.icon);
    this.bubble.visible=false;
    this.root.addChild(this.sprite,this.fx,this.bubble);
    this.root.visible=false;
    world.layer.addChild(this.root);world.agents.push(this);
  }
  get head(){return this.sprite.height}
  get flip(){return this.slot?.flip?-1:1}
  // Start the break in a random zone and slot.
  start(now:number){
    if(this.active)return true;
    if(!this.clone&&this.world.isWorking(this.cast.name))return false;
    let slot=this.world.claim(this)??this.world.reservedFor(this);
    if(!slot&&this.world.yieldSeat(now))slot=this.world.claim(this);
    if(!slot)return false;
    this.world.owner.set(slot.id,this);
    this.active=true;this.place(slot,now);this.root.visible=true;this.fade=0;this.fadingOut=false;
    return true;
  }
  stop(){if(this.swapTo){this.swapTo=null;this.world.swapping--}if(this.moveTo){this.world.owner.delete(this.moveTo.id);this.moveTo=null}this.endTogether();this.active=false;this.world.release(this);this.slot=null;this.root.visible=false;this.fx.removeChildren();this.bubble.visible=false}
  place(slot:IdleSlot,now:number){
    this.slot=slot;
    this.root.position.set(slot.x,slot.y);this.root.zIndex=slot.y;
    const [min,max]=slot.seq?COUNTER_STAY:STAY;
    this.leaveAt=now+rand(min,max)*1000;
    this.actIndex=-1;this.act=null;
    this.choose(now);
    // A friend already sitting here waves hello.
    const mate=this.world.mate(this);
    if(mate)mate.pop(any(['heart_v','chat','sparkle']),14,mate.flip*14,-mate.head-6);
  }
  show(pose:string){
    const p=this.cast.manifest.poses[pose],s=this.cast.manifest.scale;
    this.sprite.texture=this.cast.textures[pose];
    this.sprite.anchor.set(p.anchorX/p.width,p.anchorY/p.height);
    this.sprite.scale.set(this.slot!.flip?-s:s,s);
    this.pose=pose;
  }
  choose(now:number){
    const slot=this.slot!;
    if(slot.path){this.startWalk(now);return}
    if(this.leader)return;
    // Counter: brew first, then drink (with a "ding" when the coffee is ready), then keep drinking.
    if(slot.seq){
      const next=Math.min(this.actIndex+1,slot.acts.length-1);
      if(this.act?.fx==='brew'&&next!==this.actIndex){
        this.pop('coffee',18,-4,-this.head*0.75,-0.035);
        this.pop(label('ding!','#ffd84d',12),0,10,-this.head-4,-0.02);
      }
      this.actIndex=next;this.start1(slot.acts[next],now);return;
    }
    const mate=this.world.mate(this);
    if(mate&&slot.together&&!mate.leader&&!mate.together&&!this.together&&Math.random()<INTERACT_CHANCE){
      const kinds=slot.together.filter(k=>k!=='poke'||mate.pose==='sit_doze');
      if(kinds.length&&this.interact(any(kinds),mate,now))return;
    }
    const options=slot.acts.map((a,i)=>[i,a.w] as [number,number]).filter(([i])=>slot.acts.length===1||i!==this.actIndex);
    this.actIndex=pick(options);
    this.start1(slot.acts[this.actIndex],now);
  }
  start1(a:Act,now:number){
    // Rolling over in her sleep: a little hop and a rustle as the pose changes.
    if(a.pose.startsWith('sleep')&&this.pose.startsWith('sleep')&&a.pose!==this.pose){
      this.rollAt=now;this.pop(label('fuwa~','#c9b8ff',9),0,rand(-14,14),-this.head*0.6,-0.015,1100);
    }
    this.act=a;this.show(a.pose);this.until=now+rand(a.min,a.max)*1000;this.particleClock=0;
  }
  // Lead an interaction with the friend in the same group; both hold their poses until it ends.
  interact(kind:Interaction,mate:IdleAgent,now:number){
    const slot=this.slot!,other=mate.slot!;
    if(!slot.talk||!other.talk)return false;
    const [min,max]=INTERACT_SECONDS[kind];
    const end=now+rand(min,max)*1000;
    const poses:Record<Interaction,[string,string]>={
      chat:[slot.talk,other.talk],
      cheers:[slot.acts[0].pose,other.acts[0].pose],
      laugh:['sit_laugh','sit_laugh'],
      selfie:['sit_phone','sit_laugh'],
      poke:['sit_laugh','sit_doze'],
    };
    const [mine,theirs]=poses[kind];
    this.act=null;this.show(mine);this.until=end;
    mate.act=null;mate.show(theirs);mate.until=end;mate.leader=this;
    this.together={kind,partner:mate,start:now,stage:0};
    return true;
  }
  endTogether(){
    const t=this.together;
    if(t){t.partner.leader=null;t.partner.until=0;this.together=null}
    if(this.leader){this.leader.together=null;this.leader=null}
  }
  // Move to a random slot of a random zone; used by the timer and the test button.
  // Give the shared seat up now and fade over to a reserved corner.
  moveAside(slot:IdleSlot,now:number){
    this.world.release(this);this.world.owner.set(slot.id,this);this.moveTo=slot;
    this.endTogether();this.fadingOut=true;this.fade=1;this.leaveAt=now+1e9;
  }
  advance(now:number){
    if(!this.active||this.fadingOut)return;
    const shared=IDLE_SLOTS.some(s=>!s.only&&s.id!==this.slot?.id&&this.world.free(s,this));
    // In a reserved corner while the room is still full: stay (another read / search), keep the seat free.
    if(this.slot?.only&&!shared){
      const corner=this.world.reservedFor(this);
      if(!corner){this.leaveAt=now+rand(...STAY)*1000;return}
      this.moveAside(corner,now);return;
    }
    // Room full and our corner is free: go there instead of swapping, leaving a shared seat open.
    if(!shared&&!this.slot?.only){
      const corner=this.world.reservedFor(this);
      if(corner){this.moveAside(corner,now);return}
    }
    // Break area full: trade places with one other agent (a pair fades out and in), one pair at a time,
    // so a full room never blinks all at once.
    if(!shared&&!IDLE_SLOTS.some(s=>s.id!==this.slot?.id&&this.world.free(s,this))){
      const others=this.world.agents.filter(a=>a!==this&&a.active&&a.slot&&!a.slot.only&&!a.fadingOut&&!a.swapTo&&!a.moveTo);
      if(this.world.swapping>0||!others.length){this.leaveAt=now+rand(3,6)*1000;return}
      const mate=any(others);
      this.swapTo=mate.slot;mate.swapTo=this.slot;this.world.swapping+=2;
      mate.endTogether();mate.fadingOut=true;mate.fade=1;mate.leaveAt=now+1e9;
    }
    this.endTogether();this.fadingOut=true;this.fade=1;this.leaveAt=now+1e9;
  }
  relocate(now:number){this.advance(now)}
  update(now:number,dt:number){
    if(!this.active)return;
    if(this.fadingOut){
      this.fade=Math.max(0,this.fade-dt/FADE_MS);
      if(this.fade===0){
        this.fadingOut=false;
        if(this.moveTo){
          const slot=this.moveTo;this.moveTo=null;
          this.fx.removeChildren();this.place(slot,now);
        }else if(this.swapTo){
          // Take the partner's seat; drop our old one unless the partner already took it.
          const old=this.slot,slot=this.swapTo;
          this.swapTo=null;this.world.swapping--;
          this.world.owner.set(slot.id,this);
          // Our old seat is still reserved for a partner that has not arrived yet.
          const partner=this.world.agents.find(a=>a.swapTo===old);
          if(old&&old.id!==slot.id&&this.world.owner.get(old.id)===this){
            if(partner)this.world.owner.set(old.id,partner);else this.world.owner.delete(old.id);
          }
          this.fx.removeChildren();this.place(slot,now);
        }else{
        const slot=this.world.claim(this);
        if(slot){this.fx.removeChildren();this.place(slot,now)}
        else this.leaveAt=now+5000;
        }
      }
    }else this.fade=Math.min(1,this.fade+dt/FADE_MS);
    this.root.alpha=this.fade;
    if(now>=this.leaveAt)this.advance(now);
    if(!this.fadingOut&&now>=this.until){
      if(this.together)this.endTogether();
      if(!this.leader)this.choose(now);
    }
    this.animate(now);
    this.updateTogether(now);
    this.updateFx(now,dt);
  }
  // Small life in the still sprite: slow breathing while resting, a bounce while laughing.
  animate(now:number){
    if(this.slot?.path){this.walkStep(now);return}
    const s=this.cast.manifest.scale,p=this.pose;
    const breath=BREATH_POSES.has(p)?Math.sin(now/(p==='sit_doze'?900:p.startsWith('read')?800:650))*0.012:0;
    this.sprite.scale.y=s*(1+breath);
    this.sprite.rotation=0;
    if(p==='sit_laugh')this.sprite.y=-Math.round(Math.abs(Math.sin(now/110))*1.5);
    // Reading: a slow nod along the lines.
    else if(p.startsWith('read'))this.sprite.y=Math.round(Math.sin(now/1100)*0.8);
    // Reaching for a high shelf: up on tiptoe, settling back.
    else if(p==='search_a')this.sprite.y=-Math.round(Math.max(0,Math.sin(now/420))*2.5);
    // At the railing: a slow sway in the breeze, pivoting on the feet.
    else if(this.slot?.id==='V1'){this.sprite.y=0;this.sprite.rotation=Math.sin(now/1600)*0.018}
    // Napping: deep slow breaths under the blanket, a small bounce when rolling over.
    else if(p.startsWith('sleep')){
      this.sprite.scale.y=s*(1+Math.sin(now/1000)*0.025);
      const k=(now-this.rollAt)/450;
      this.sprite.y=k<1?-Math.round(Math.sin(k*Math.PI)*3):0;
    }
    else this.sprite.y=0;
  }
  // --- Walking spot (Eve's stroll) ---
  startWalk(now:number){
    const path=this.slot!.path!;
    // Start at the path point nearest the spot, heading along the path.
    let i=0;path.forEach(([x,y],k)=>{if(Math.hypot(x-this.root.x,y-this.root.y)<Math.hypot(path[i][0]-this.root.x,path[i][1]-this.root.y))i=k});
    this.root.position.set(path[i][0],path[i][1]);
    this.walk={i:Math.min(i+1,path.length-1),dir:i+1<path.length?1:-1,mode:'skip',t0:now,last:now,flip:1,next:now+rand(2500,4500)};
    if(this.walk.i===i)this.walk.i=Math.max(0,i-1);
    this.act=this.slot!.acts[0];this.until=1e12;this.show('walk_a');
  }
  walkMode(mode:WalkMode,now:number){
    const w=this.walk,h=this.head,f=w.flip;
    w.mode=mode;w.t0=now;
    if(mode==='look')this.pop('question',13,f*10,-h-4,-0.02,1100);
    if(mode==='trip'){
      this.pop(label('waa!','#ff8fd0',11),0,f*8,-h-6,-0.02,900);
    }
    if(mode==='down'){
      // Thud: dust puffs on both sides, little stars circle her head, an "ouch".
      for(let k=0;k<5;k++){const g=new Graphics().circle(0,0,rand(2,3.5)).fill({color:'#e8dcc8',alpha:0.85});g.position.set(rand(-26,26),-2);this.spawn(g,rand(-0.03,0.03),-0.01,600)}
      for(let k=0;k<3;k++)this.pop('star',10,f*(16+k*7),-h*0.45,-0.004,1500);
      this.pop(label('ouch...','#ffd84d',10),0,f*20,-h*0.7,-0.012,1400);
    }
    if(mode==='peek')this.pop('drop',10,-f*12,-h*0.55,-0.01,900);
    if(mode==='up')this.pop(label('hehe~','#7fe9ff',10),0,f*10,-h-4,-0.02,1200);
  }
  walkStep(now:number){
    const w=this.walk,path=this.slot!.path!,s=this.cast.manifest.scale,dt=Math.max(0,Math.min(100,now-w.last)),t=now-w.t0;
    w.last=now;
    this.sprite.rotation=0;this.sprite.scale.y=s;this.sprite.y=0;
    const face=(pose:string)=>{this.show(pose);this.sprite.scale.x=w.flip*s};
    if(w.mode==='skip'){
      const [tx,ty]=path[w.i],dx=tx-this.root.x,dy=ty-this.root.y,d=Math.hypot(dx,dy),step=0.045*dt;
      if(Math.abs(dx)>0.5)w.flip=dx<0?-1:1;
      if(d<=step){
        this.root.position.set(tx,ty);
        if(w.i+w.dir<0||w.i+w.dir>=path.length)w.dir*=-1;
        w.i+=w.dir;
      }else this.root.position.set(this.root.x+dx/d*step,this.root.y+dy/d*step);
      this.root.zIndex=this.root.y;
      // Skipping: alternate the two frames, bouncing high on each hop; dust puffs where she lands.
      const ph=(t%360)/360;
      face(ph<0.5?'walk_a':'walk_b');
      this.sprite.y=-Math.round(Math.sin(ph*Math.PI)*5);
      if(ph<0.06&&this.particleClock>300){
        this.particleClock=0;
        const g=new Graphics().circle(0,0,rand(1.5,2.5)).fill({color:'#e8dcc8',alpha:0.8});
        g.position.set(-w.flip*6,-1);this.spawn(g,-w.flip*0.01,-0.006,500);
        if(Math.random()<0.15)this.pop(any(['music','sparkle','heart_v']),11,w.flip*10,-this.head-2,-0.025,1000);
      }
      if(now>=w.next){w.next=now+rand(3000,5500);const r=Math.random();if(r<0.13)this.walkMode('trip',now);else if(r<0.5)this.walkMode('look',now)}
    }else if(w.mode==='look'){
      // Stops, glances one way then the other.
      face('look');this.sprite.scale.x=(Math.floor(t/550)%2?-1:1)*w.flip*s;
      if(t>1700)this.walkMode('skip',now);
    }else if(w.mode==='trip'){
      // Belly flop: lunges forward and slides along the floor.
      face('trip');
      const [tx,ty]=path[w.i],dx=tx-this.root.x,dy=ty-this.root.y,d=Math.hypot(dx,dy)||1;
      const slide=0.06*dt*Math.max(0,1-t/350);
      this.root.position.set(this.root.x+dx/d*slide,this.root.y+dy/d*slide);this.root.zIndex=this.root.y;
      this.sprite.y=-Math.round(Math.sin(Math.min(1,t/350)*Math.PI)*4);
      if(t>350)this.walkMode('down',now);
    }else if(w.mode==='down'){
      face('down');this.sprite.y=t<120?Math.round(-2+t/60):0;
      if(t>1100)this.walkMode('peek',now);
    }else if(w.mode==='peek'){
      // Lifts her head and peeks left, right, left - did anyone see that?
      face('peek');this.sprite.scale.x=(Math.floor(t/450)%2?-1:1)*w.flip*s;
      if(t>1400)this.walkMode('up',now);
    }else if(w.mode==='up'){
      face('up');this.sprite.y=-Math.round(Math.min(1,t/500)*2);
      if(t>550)this.walkMode('skip',now);
    }
  }
  spawn(node:Container,vx:number,vy:number,life:number){
    Object.assign(node,{age:0,vx,vy,life});this.fx.addChild(node);
  }
  // A one-off icon (by name) or ready-made node floating up from (x, y).
  pop(what:string|Container,size:number,x:number,y:number,vy=-0.03,life=1100){
    const n=typeof what==='string'?iconSprite(what,size):what;
    n.position.set(x,y);this.spawn(n,rand(-0.006,0.006),vy,life);
  }
  updateTogether(now:number){
    const t=this.together;if(!t)return;
    const m=t.partner,dx=m.root.x-this.root.x,dy=m.root.y-this.root.y,h=this.head;
    const at=(ms:number)=>t.stage<ms&&now-t.start>=ms;
    const mid={x:dx/2,y:dy/2-h*0.6};
    if(t.kind==='cheers'&&at(900)){
      t.stage=900;
      this.pop('sparkle',20,mid.x,mid.y,-0.01,700);
      this.pop(label('Cheers!','#ffd84d',13),0,mid.x,mid.y-14,-0.025,1400);
      this.pop('coffee',14,mid.x-10,mid.y+4,-0.03);this.pop('coffee',14,mid.x+10,mid.y+4,-0.03);
    }else if(t.kind==='cheers'&&at(1500)){
      t.stage=1500;this.pop('heart',14,0,-h-4);m.pop('heart',14,0,-m.head-4);
    }else if(t.kind==='laugh'&&now-t.start>t.stage){
      t.stage+=520;
      this.pop('laugh',13,this.flip*rand(8,18),-h*0.9,-0.035,900);
      m.pop('laugh',13,m.flip*rand(8,18),-m.head*0.9,-0.035,900);
    }else if(t.kind==='selfie'&&at(1300)){
      t.stage=1300;
      const w=Math.abs(dx)+70,top=Math.min(0,dy)-Math.max(h,m.head)-14,hh=Math.abs(dy)+Math.max(h,m.head)+24;
      const flash=new Graphics().roundRect(Math.min(0,dx)-35,top,w,hh,10).fill({color:'#ffffff',alpha:0.7});
      this.spawn(flash,0,0,320);
      this.pop(label('click!','#ffffff',11),0,this.flip*12,-h-6,-0.02,900);
    }else if(t.kind==='selfie'&&at(1700)){
      t.stage=1700;
      for(let i=0;i<3;i++)this.pop(any(['heart','sparkle','star']),12,mid.x+rand(-24,24),mid.y+rand(-10,10),-0.03,1200);
    }else if(t.kind==='poke'&&at(700)){
      t.stage=700;
      this.pop(label('psst~','#fff3b0',11),0,this.flip*14,-h-4,-0.02,900);
    }else if(t.kind==='poke'&&at(1400)){
      // The sleeper wakes up with a start.
      t.stage=1400;
      m.show('sit_relax');m.fx.removeChildren();
      m.pop('exclaim',18,m.flip*10,-m.head-6,-0.04,900);
      m.pop('drop',10,-m.flip*12,-m.head*0.8,-0.02,800);
    }
  }
  updateFx(now:number,dt:number){
    const h=this.head,flip=this.flip;
    this.particleClock+=dt;
    const fx=this.together||this.leader?null:this.act?.fx;
    const every=(ms:number)=>{if(this.particleClock<ms)return false;this.particleClock=0;return true};
    if((fx==='steam'||fx==='sigh')&&every(380)){
      const g=new Graphics().circle(0,0,rand(1.5,2.6)).fill({color:'#ffffff',alpha:0.75});
      g.position.set(flip*rand(6,14),-h*0.55);this.spawn(g,rand(-0.004,0.004),-0.025,1100);
      if(fx==='sigh'&&Math.random()<0.12)this.pop(label('ahh~','#f3e3c8',11),0,flip*20,-h-2,-0.015,1500);
    }else if(fx==='brew'&&every(240)){
      const g=new Graphics().circle(0,0,rand(1.5,3)).fill({color:'#ffffff',alpha:0.6});
      g.position.set(rand(-10,6),-h*0.55);this.spawn(g,rand(-0.004,0.004),-0.03,900);
      if(Math.random()<0.25){
        const d=new Graphics().rect(-1,0,2,3).fill('#7a4a2a');
        d.position.set(rand(-6,2),-h*0.45);this.spawn(d,0,0.02,500);
      }
    }else if(fx==='music'&&every(1300)){
      const n=iconSprite('music',rand(11,15));n.position.set(flip*rand(8,16),-h*0.85);
      this.spawn(n,flip*rand(0.006,0.014),-0.025,1600);
    }else if(fx==='game'&&every(1600)){
      if(Math.random()<0.18){
        this.pop(label('WIN!','#ffd84d',12),0,flip*14,-h-6,-0.025,1300);
        for(let i=0;i<3;i++)this.pop(any(['star','sparkle']),11,flip*rand(4,24),-h*rand(0.6,0.9),-0.03,1000);
      }else if(Math.random()<0.6)this.pop('star',12,flip*10,-h*0.7,-0.03,900);
    }else if(fx==='scroll'&&every(1700)){
      this.pop(Math.random()<0.7?'heart':'heart_v',12,flip*rand(6,14),-h*0.72,-0.03,1100);
    }else if(fx==='zzz'&&every(900)){
      const z=label('z','#8ec5ff',rand(10,14));
      z.position.set(flip*14,-h*0.85);this.spawn(z,flip*0.01,-0.02,1700);
    }else if(fx==='dream'&&every(850)){
      // Cute nap: violet Zzz drifting up, now and then a dream bubble (heart, star, a merged branch),
      // and once in a while a sleepy mumble.
      const z=label(any(['z','Z','z']),'#c9b8ff',rand(9,13));
      z.position.set(rand(4,14),-h*0.8);this.spawn(z,0.008,-0.018,1800);
      if(Math.random()<0.3){
        const bub=new Container(),icon=iconSprite(any(['heart_v','star','sparkle','check','heart']),11);
        bub.addChild(new Graphics().circle(0,0,9).fill({color:'#ffffff',alpha:0.85}).stroke({color:'#c9b8ff',width:1.5})
          .circle(-9,9,2.5).fill({color:'#ffffff',alpha:0.85}).circle(-13,13,1.5).fill({color:'#ffffff',alpha:0.85}),icon);
        bub.position.set(rand(16,26),-h-6);this.spawn(bub,0.002,-0.008,1900);
      }
      if(Math.random()<0.07)this.pop(label(any(['mmh... merged~','5 more min...','zzz... LGTM']),'#ffffff',9),0,0,-h-18,-0.01,2000);
    }else if(fx==='view'&&this.slot?.id==='V1'&&every(700)){
      // At the railing: breeze streaks drift past, far city lights twinkle, now and then a shooting star.
      const k=Math.random();
      if(k<0.45){
        const w=new Graphics().moveTo(0,0).lineTo(rand(8,14),0).stroke({color:'#ffffff',width:1,alpha:0.7});
        w.position.set(rand(-10,30),-h*rand(0.3,0.9));this.spawn(w,-0.03,0.004,900);
      }else if(k<0.85){
        const s=iconSprite('sparkle',rand(7,11));s.tint=any([0xffffff,0xfff3b0,0x8ec5ff,0xff8fd0]);
        s.position.set(rand(-90,-30),rand(-10,30));this.spawn(s,0,-0.002,1300);
      }else{
        const star=new Graphics().moveTo(0,0).lineTo(16,-8).stroke({color:'#fff3b0',width:2,alpha:0.9}).circle(0,0,2).fill('#ffffff');
        star.position.set(rand(-60,-20),-h-rand(10,30));this.spawn(star,-0.09,0.045,700);
        if(Math.random()<0.5)this.pop('heart_v',11,flip*14,-h-4,-0.02,1200);
      }
      if(Math.random()<0.08)this.pop(label('~','#fff3b0',13),0,-12,-h-4,-0.015,1400);
    }else if(fx==='view'&&every(1500)){
      // Twinkles out of the city window the agent is looking at.
      const s=iconSprite('sparkle',rand(8,12));s.position.set(rand(-40,0),-h-rand(0,26));this.spawn(s,0,-0.004,1400);
      if(Math.random()<0.2)this.pop(label('~','#fff3b0',13),0,-12,-h-4,-0.015,1400);
    }else if(fx==='page'&&every(1800)){
      // A page flips over the book, and a thought in the reader's own style floats up.
      const sheet=new Graphics().rect(-4,-5,8,10).fill('#fffaf0').stroke({color:'#16223a',width:1});
      Object.assign(sheet,{flipPage:true});
      sheet.position.set(flip*rand(4,12),-h*0.55);this.spawn(sheet,flip*0.006,-0.012,700);
      if(Math.random()<0.6)this.pop(any(READ_ICONS[this.cast.name]??['note','idea']),rand(11,14),flip*rand(10,18),-h*0.85,-0.02,1400);
    }else if(fx==='dust'&&every(this.pose==='search_a'?500:1100)){
      // Dust drifts down off the high shelf while reaching; leafing through, the right page turns up.
      const g=new Graphics().circle(0,0,rand(1,1.8)).fill({color:'#f3e3c8',alpha:0.8});
      g.position.set(rand(-30,-4),-h*rand(0.8,1.05));this.spawn(g,rand(-0.004,0.004),0.012,1400);
      if(this.pose==='search_b'&&Math.random()<0.18){
        this.pop('exclaim',14,-10,-h-6,-0.03,900);
        this.pop(label('found it!','#ffd84d',10),0,8,-h-14,-0.02,1300);
        for(let i=0;i<2;i++)this.pop('sparkle',10,rand(-24,4),-h*rand(0.5,0.8),-0.02,900);
      }
    }else if(fx==='water'&&every(450)){
      const g=new Graphics().circle(0,0,rand(1.2,2.2)).fill({color:'#6fc3ff',alpha:0.85});
      g.position.set(flip*rand(4,10),-h*0.55);this.spawn(g,rand(-0.003,0.003),-0.02,800);
      if(Math.random()<0.08)this.pop('drop',11,flip*16,-h*0.8,-0.02,1000);
    }
    for(const c of [...this.fx.children] as (Container&{life:number;age:number;vx:number;vy:number})[]){
      c.age+=dt;c.x+=c.vx*dt;c.y+=c.vy*dt;c.alpha=Math.max(0,1-c.age/c.life);
      if((c as Container&{flipPage?:boolean}).flipPage)c.scale.x=Math.cos(c.age/c.life*Math.PI);
      if(c.age>=c.life)c.destroy();
    }
    // Speech bubbles only while chatting; the other interactions show their own effects.
    const talking=(this.together??this.leader?.together)?.kind==='chat'&&TALK_POSES.has(this.pose);
    this.bubble.visible=talking;
    if(talking){
      this.bubble.position.set(flip*24,-h-8+Math.round(Math.sin(now/180)));
      if(Math.floor(now/1100)!==Math.floor((now-dt)/1100))setIcon(this.icon,this.pose==='sit_laugh'?'laugh':any(CHAT_ICONS),16);
    }
  }
}
