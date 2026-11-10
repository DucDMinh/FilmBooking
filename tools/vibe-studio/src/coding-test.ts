// Standalone test page for the coding-zone work animations (coding-test.html).
// Poses come from public/assets/<character>/coding/manifest.json (scripts/build-coding-manifest.mjs).
import {Application,Assets,Container,Graphics,Sprite,Text,Texture} from 'pixi.js';
import {buildIcons,iconSprite,isIcon,setIcon} from './pixel-icons';
import {IdleAgent,IdleWorld} from './idle';
import {LiveMapper,type LiveFile,type Cast as LiveCast} from './live-state';
import {InfoPanel,PROFILES,type CharacterInfo} from './info-panel';
const PROFILE_COLORS=Object.fromEntries(Object.entries(PROFILES).map(([k,v])=>[k,v.color]));

type PoseInfo={file:string;width:number;height:number;bbox:number[];anchorX:number;anchorY:number};
type Manifest={scale:number;poses:Record<string,PoseInfo>};
type Lean='straight'|'lean_left'|'lean_right';
type Action='type'|'type_fast'|'type_super'|'talk_left'|'talk_right'|'swivel_left'|'swivel_right';

// Builders with a coding pose set; seats alternate between them, clicking a seat cycles empty -> each.
const CHARACTERS=['nova','orion','lyra','vega','atlas','comet'];
// Per-character tuning on top of the shared behaviour: sitting-lean weights and an action weight multiplier.
// Lyra's lean poses have the chair turned diagonally, so she sits straight more and swivels less.
type Tuning={lean?:Partial<Record<'straight'|'lean_left'|'lean_right',number>>;weight?:Partial<Record<string,number>>};
const TUNING:Record<string,Tuning>={
  lyra:{lean:{straight:70,lean_left:15,lean_right:15},weight:{swivel_left:0.3,swivel_right:0.3}},
};
// Seat floor contacts (VIBE_CODE_STUDIO_CONTEXT mục 4) + shared X offset.
const SEATS=[[553,530],[746,530],[945,530],[566,695],[763,695],[962,695]].map(([x,y])=>({x:x-20,y}));
// Screen direction -> pose file.
const TALK_POSE={talk_left:'talk_left',talk_right:'talk_right'} as const;
// Typing frame rate per speed.
const FPS={type:4,type_fast:10,type_super:18};
// Pick weight × duration (seconds) sets the share of time: typing ≈ 82% (normal ≈ 62%), talk ≈ 13.5%,
// swivel ≈ 4.5%, super ≈ 2.5%. A new action every ~7 s on average.
const WEIGHTS:[Action,number][]=[['type',50],['type_fast',18],['type_super',5],['talk_left',12],['talk_right',12],['swivel_left',8],['swivel_right',7]];
const DURATION:Record<Action,[number,number]>={type:[6,14],type_fast:[5,10],type_super:[3,5],talk_left:[3,6],talk_right:[3,6],swivel_left:[2,3],swivel_right:[2,3]};
// Speech-bubble icons; a new one every ICON_MS while talking.
// Speech-bubble icons are code-drawn pixel art (src/pixel-icons.ts), crisp at any OS.
const TALK_ICONS=['idea','bug','coffee','check','question','fire','star','laugh','heart','note','sparkle','chat'];
const ICON_MS=[900,1500];
const FADE_MS=120;
// Fire aura size: fire_aura.png was drawn on Nova's 1024x1536 canvas (scale 0.1071), enlarged 1.2x.
const FIRE_SCALE=0.1071*1.2;
// Test control: force every seat into one action, or null for random.
let forced:Action|null=null;
// Called when a seat gets a character: its idle sprite (if any) must leave. Wired once the idle world exists.
let onSeated:(name:string)=>void=()=>{};
// Clicking a working character that has an idle sheet sends it on a break (true = handled). Wired below.
let goIdle:(seat:{setOccupied:(v:boolean)=>void;cast:{name:string}})=>boolean=()=>false;
// Click on a character (at work or on a break) → its info card. Wired once the panel exists.
let onCharacterTap:(name:string)=>void=()=>{};
// Is this character already shown somewhere other than `except` (work seats + real idle agents)?
// Filled once all seats and the idle world exist (they are created further down).
let stageSeats:{occupied:boolean;cast:{name:string}}[]=[];
let idleWorldRef:IdleWorld|undefined;
const onStage=(name:string,except?:unknown)=>
  stageSeats.some(s=>s!==except&&s.occupied&&s.cast.name===name)||!!idleWorldRef?.agentOf(name)?.active;

// Review zone (prompt mục 16c): reviewers sit with their back to the camera, facing the desk at the
// upper-right. Poses from public/assets/<character>/review/manifest.json; gentle, feminine actions only.
type ReviewAction='type'|'read'|'bug_hunt'|'merge_rush'|'idea_storm'|'color_burst'|'roast'|'root_cause'|'note'|'approve'|'talk_left'|'talk_right'|'sip_tea'|'hair_tuck';
// The sheets are drawn with the same chair size, so every reviewer shares scale ≈ 0.339 (Sage's
// type_a = 139 px); never normalise by hair height.
const REVIEWERS=['sage','iris','juno','echo'];
// Floor contact = review keyboard + (-37, +71), seats R1 (upper-left) .. R4 (lower-right).
const REVIEW_SEATS=[[113,708],[202,768],[290,828],[385,891]].map(([x,y])=>({x,y}));
// Two-frame actions alternate slowly: light fingertip typing, idle reading.
const REVIEW_FRAMES:Partial<Record<ReviewAction,[string[],number]>>={type:[['type_a','type_b'],2.5],read:[['read_a','read_b'],0.6],bug_hunt:[['read_a','read_b'],1.5],merge_rush:[['note','type_a','note','type_b'],3],
  idea_storm:[['hair_tuck','hair_tuck','note','read_b','note','type_a','note','type_b'],2],
  color_burst:[['think','swatch','sketch_a','sketch_b','sketch_a','sketch_b','swatch','sketch_a'],2],
  roast:[['glare_a','glare_b','scold','scold','scold','scold','sigh','check_a'],2],
  root_cause:[['inspect','inspect','ponder_a','ponder_b','ponder_a','ponder_b','eureka','eureka'],2]};
// Typing ≈ 35%, reading ≈ 38%, note ≈ 8%, talk ≈ 11% (with neighbours), tea ≈ 5%, approve/hair ≈ 3%,
// bug hunt ≈ 2.5% (the review zone's "super typing" moment).
const REVIEW_WEIGHTS:[ReviewAction,number][]=[['type',30],['read',28],['bug_hunt',3],['merge_rush',4],['idea_storm',4],['color_burst',4],['roast',4],['root_cause',4],['note',10],['approve',6],['talk_left',9],['talk_right',9],['sip_tea',7],['hair_tuck',6]];
const REVIEW_DURATION:Record<ReviewAction,[number,number]>={type:[5,10],read:[6,12],bug_hunt:[3.5,4.5],merge_rush:[3.5,4.5],idea_storm:[4.2,4.8],color_burst:[3.8,4.4],roast:[3.8,4.2],root_cause:[4.2,4.6],note:[3,6],approve:[2,3],talk_left:[3,6],talk_right:[3,6],sip_tea:[3,5],hair_tuck:[1.5,2.5]};
const REVIEW_ICONS=['check','sparkle','heart_v','note','bug','coffee','star','heart','question','chat','laugh'];
let forcedReview:ReviewAction|null=null;
// Review FX, drawn in code (no sprites). Each reviewer tints glyphs and sparkles with her own accent.
const REVIEW_COLORS:Record<string,string>={sage:'#b98cff',iris:'#ff8fb3',juno:'#8ec5ee',echo:'#5fe3b8',eve:'#7fe9ff',theo:'#ffb35c',pixel:'#ff8fd0',oracle:'#ff5a6e',sherlock:'#ff8a3d'};
const REVIEW_GLYPHS=['✓','?','//','✗','…','✓','+1'];
// Monitor centre relative to the reviewer seat floor contact (keyboard = seat + (37, -71)).
// Bug hunt timeline (seconds): lens sweeps, the bug is found, then squashed into sparkles.
const BUG_FOUND_AT=1.6,BUG_SQUASH_AT=2.5;
// Approval wave: neighbours clap one after another, WAVE_STEP_MS per seat of distance.
const WAVE_STEP_MS=350,WAVE_CLAP_MS=1100;
// Merge Rush (Eve only, ≈ the merge zone's "super typing"): glowing branches run from every busy monitor
// to the hologram globe, commit packets travel along them, the globe pulses; it ends in an approve.
const GLOBE={x:1320,y:378};
const RUSH_PACKET_MS=110,RUSH_TRAVEL_MS=700,RUSH_RING_MS=380,RUSH_RING_LIFE=760;
// Idea Storm (Theo only, the plan zone's peak): a 💡 pops over his head, then sticky notes fly one by one
// onto the board and line up into a roadmap; an arrow links them and the board glows. Ends in an approve.
const PEAK_BOOST=6;
const STORM_NOTES=6,STORM_BULB_AT=0.15,STORM_FIRST_NOTE=0.9,STORM_NOTE_GAP=0.38,STORM_FLIGHT=0.45;
const STORM_COLORS=['#ffd84d','#ff8fb3','#8ec5ee','#9be38a','#ffb35c','#c7a6ff'];

const app=new Application();
await app.init({width:1496,height:1051,background:'#0d1526',antialias:false,resolution:1});
document.getElementById('world')!.appendChild(app.canvas);
buildIcons(app.renderer);

// Loading screen (coding-test.html #loading): every texture counts toward the progress bar; manifests add
// their pose count to the total as they arrive.
let loadTotal=4,loadDone=0;
const loadingBar=document.getElementById('loading-bar'),loadingText=document.getElementById('loading-text');
const tick=<T>(p:Promise<T>)=>p.then(v=>{
  loadDone++;
  const pct=Math.round(100*loadDone/loadTotal);
  if(loadingBar)loadingBar.style.width=pct+'%';
  if(loadingText)loadingText.textContent=`${pct}%`;
  return v;
});
const load=async(url:string)=>{const t:Texture=await tick(Assets.load(url));t.source.scaleMode='nearest';return t};
// Reviewer sprites are drawn ~3x larger than shown: nearest sampling drops 8 of 9 pixels and breaks thin
// details (braids, lace), so they are minified through linear mipmaps instead.
const loadSmooth=(url:string):Promise<Texture>=>tick(Assets.load({src:url,data:{autoGenerateMipmaps:true,scaleMode:'linear',mipmapFilter:'linear'}}));
type Cast={name:string;manifest:Manifest;textures:Record<string,Texture>};
const loadCast=async(name:string,area:string):Promise<Cast>=>{
  const root=`/assets/${name}/${area}/`;
  const manifest:Manifest=await (await fetch(root+'manifest.json')).json();
  loadTotal+=Object.keys(manifest.poses).length;
  const textures:Record<string,Texture>={};
  const loader=area==='coding'?load:loadSmooth;
  await Promise.all(Object.entries(manifest.poses).map(async([pose,p])=>{textures[pose]=await loader(root+p.file)}));
  return {name,manifest,textures};
};
const casts:Cast[]=await Promise.all(CHARACTERS.map(name=>loadCast(name,'coding')));
const reviewCasts:Cast[]=await Promise.all(REVIEWERS.map(name=>loadCast(name,'review')));
const eveCast=await loadCast('eve','merge');
const theoCast=await loadCast('theo','plan');
const pixelCast=await loadCast('pixel','relax');
// Characters that already have an idle sheet (prompt mục 24 / 24a); one at a time, Nova first among the rest.
const IDLERS=['pixel','nova','orion','lyra','vega','atlas','comet','sage','iris','juno','echo','eve','theo','oracle','sherlock'];
const idleCasts=await Promise.all(IDLERS.map(name=>loadCast(name,'idle')));
const oracleCast=await loadCast('oracle','plan');
const sherlockCast=await loadCast('sherlock','review');
const office=await load('/assets/environment/office_original.png');
const chairTexture=await load('/assets/furniture/chair_coding.png');
const reviewChairTexture=await load('/assets/furniture/chair_review.png');
const fireTexture=await load('/assets/fx/fire_aura.png');

app.stage.addChild(new Sprite(office));
const layer=new Container();layer.sortableChildren=true;app.stage.addChild(layer);
// World-space FX drawn above every character (Merge Rush branches).
const topFx=new Container();app.stage.addChild(topFx);

const rand=(min:number,max:number)=>min+Math.random()*(max-min);
const pick=<T>(items:[T,number][])=>{let r=Math.random()*items.reduce((s,[,w])=>s+w,0);for(const [item,w] of items)if((r-=w)<0)return item;return items[0][0]};

function placePose(sprite:Sprite,cast:Cast,pose:string){
  const p=cast.manifest.poses[pose];
  sprite.texture=cast.textures[pose];
  sprite.anchor.set(p.anchorX/p.width,p.anchorY/p.height);
  sprite.scale.set(cast.manifest.scale);
}

class Seat{
  root=new Container();
  chair=new Sprite(chairTexture);
  fire=new Sprite(fireTexture);
  back=new Sprite();
  front=new Sprite();
  glyphs=new Container();
  bubble=new Container();
  icon=iconSprite('chat',18);
  iconName='';
  iconUntil=0;
  occupied=false;
  cast=casts[0];
  lean:Lean='straight';
  action:Action='type';
  pose='';
  until=0;
  frame=0;
  frameClock=0;
  fade=1;
  glyphClock=0;
  // Oracle's Roast: the builder jumps (shake + 💦), then fixes it (green ✓) when it ends.
  startleUntil=0;
  sweat=new Container();
  constructor(public index:number){
    const {x,y}=SEATS[index];
    this.root.position.set(x,y);this.root.zIndex=y;
    // Empty chair: 0.08 scale, centre wheel (x 628) at the floor contact (bbox bottom 1156).
    this.chair.anchor.set(628/chairTexture.width,1156/chairTexture.height);this.chair.scale.set(0.08);
    this.fire.anchor.set(513/fireTexture.width,1501/fireTexture.height);this.fire.visible=false;
    this.bubble.addChild(new Graphics().roundRect(-14,-13,28,24,7).fill('#ffffff').stroke({color:'#16223a',width:2}).poly([-4,11,4,11,-2,17]).fill('#ffffff'));
    this.bubble.addChild(this.icon);
    this.bubble.visible=false;
    const drop=iconSprite('drop',18),bang=iconSprite('exclaim',22);drop.position.set(-8,3);bang.position.set(9,-3);
    this.sweat.addChild(drop,bang);this.sweat.position.set(22,-138);this.sweat.visible=false;
    this.root.addChild(this.chair,this.fire,this.back,this.front,this.glyphs,this.bubble,this.sweat);
    this.root.eventMode='static';this.root.cursor='pointer';
    this.root.hitArea={contains:(px:number,py:number)=>px>-45&&px<45&&py>-150&&py<5};
    this.root.on('pointertap',()=>{
      if(this.occupied){onCharacterTap(this.cast.name);return}
      // empty chair: cycle each builder not already on stage elsewhere -> empty
      let next=this.occupied?casts.indexOf(this.cast)+1:0;
      while(next<casts.length&&onStage(casts[next].name,this))next++;
      this.setOccupied(next<casts.length,casts[next]);
    });
    layer.addChild(this.root);
    this.setOccupied(false);
  }
  setOccupied(value:boolean,cast=this.cast){
    this.occupied=value;this.cast=cast;
    if(value)onSeated(cast.name);
    this.chair.visible=!value;
    for(const s of [this.back,this.front,this.glyphs,this.bubble,this.fire])s.visible=false;
    if(value){this.front.visible=true;this.pose='';this.lean=this.randomLean();this.next(performance.now())}
  }
  randomLean():Lean{
    const lean=TUNING[this.cast.name]?.lean??{};
    const options:[Lean,number][]=[['lean_left',lean.lean_left??40],['straight',lean.straight??30],['lean_right',lean.lean_right??30]];
    return pick(options.filter(([l])=>this.typingFrames(l).length>0));
  }
  has(pose:string){return pose in this.cast.manifest.poses}
  typingFrames(lean:Lean){return [`${lean}_type_a`,`${lean}_type_b`].filter(p=>this.has(p))}
  neighbour(direction:-1|1){
    const j=this.index+direction;
    return Math.floor(j/3)===Math.floor(this.index/3)&&seats[j]?.occupied;
  }
  allowed(action:Action){
    if(action==='talk_left')return this.neighbour(-1)&&this.has(TALK_POSE.talk_left);
    if(action==='talk_right')return this.neighbour(1)&&this.has(TALK_POSE.talk_right);
    if(action==='swivel_left'||action==='swivel_right')return this.has(action);
    return true;
  }
  next(now:number){
    if(Math.random()<0.15)this.lean=this.randomLean();
    const forcedAction=forced&&this.allowed(forced)?forced:null;
    const weight=TUNING[this.cast.name]?.weight??{};
    this.action=forcedAction??pick(WEIGHTS.filter(([a])=>this.allowed(a)).map(([a,w])=>[a,w*(weight[a]??1)] as [Action,number]));
    const [min,max]=DURATION[this.action];
    this.until=now+rand(min,max)*1000;
    this.frame=0;this.frameClock=0;
  }
  show(pose:string){
    if(pose===this.pose)return;
    const typingFlip=this.pose.replace(/_type_[ab]$/,'')===pose.replace(/_type_[ab]$/,'')&&pose.includes('_type_');
    if(this.pose&&!typingFlip){placePose(this.back,this.cast,this.pose);this.back.visible=true;this.fade=0}
    placePose(this.front,this.cast,pose);this.pose=pose;
  }
  update(now:number,dt:number){
    if(!this.occupied)return;
    if(now>=this.until)this.next(now);
    const typing=this.action==='type'||this.action==='type_fast'||this.action==='type_super';
    let dx=0,dy=0;
    if(typing){
      const frames=this.typingFrames(this.lean);
      this.frameClock+=dt;
      const period=1000/FPS[this.action as keyof typeof FPS];
      if(this.frameClock>=period){this.frameClock%=period;this.frame++}
      this.show(frames[this.frame%frames.length]);
      // Single-frame poses fake the key press with a 1 px shoulder bob.
      if(frames.length===1)dy=this.frame%2;
      if(this.action==='type_super'){dx=Math.round(rand(-1,1));dy+=Math.round(rand(-1,1))}
    }else if(this.action==='talk_left'||this.action==='talk_right'){
      this.show(TALK_POSE[this.action]);
      dy=Math.round(Math.sin(now/110)*0.8);
    }else this.show(this.action);
    const startled=now<this.startleUntil;
    if(startled){dx+=Math.round(rand(-1.5,1.5));dy-=1+Math.round(Math.abs(Math.sin(now/45)))}
    else if(this.sweat.visible)this.spawnFix();
    this.sweat.visible=startled;
    if(startled)this.sweat.y=-138+Math.round(Math.sin(now/90)*2);
    this.front.position.set(dx,dy);this.back.position.set(dx,dy);

    if(this.fade<1){
      this.fade=Math.min(1,this.fade+dt/FADE_MS);
      this.front.alpha=this.fade;this.back.alpha=1-this.fade;
      if(this.fade>=1)this.back.visible=false;
    }else this.front.alpha=1;

    const onFire=this.action==='type_super';
    this.fire.visible=onFire;
    if(onFire){
      this.fire.alpha=0.75+Math.sin(now/55)*0.12+rand(-0.08,0.08);
      this.fire.scale.set(FIRE_SCALE*(1+Math.sin(now/90)*0.025),FIRE_SCALE*(1+Math.sin(now/70)*0.04));
    }

    const talking=this.action==='talk_left'||this.action==='talk_right';
    this.bubble.visible=talking;
    if(talking){
      this.bubble.position.set(this.action==='talk_left'?-34:34,-152+Math.round(Math.sin(now/180)));
      if(now>=this.iconUntil){
        const choices=TALK_ICONS.filter(i=>i!==this.iconName);
        this.iconName=choices[Math.floor(Math.random()*choices.length)];setIcon(this.icon,this.iconName,18);
        this.iconUntil=now+rand(ICON_MS[0],ICON_MS[1]);
      }
    }else this.iconUntil=0;

    // Code glyphs float up from the monitors while typing fast or super fast.
    this.glyphs.visible=true;
    if(this.action==='type_fast'||onFire){
      this.glyphClock+=dt;
      const every=onFire?70:160;
      while(this.glyphClock>=every){this.glyphClock-=every;this.spawnGlyph(onFire)}
    }
    for(const g of [...this.glyphs.children]){
      g.y-=dt*0.03;g.alpha-=dt/900;
      if(g.alpha<=0)g.destroy();
    }
  }
  spawnFix(){
    const g=iconSprite('check',18);
    g.position.set(rand(-8,8),-150);this.glyphs.addChild(g);
  }
  spawnGlyph(hot:boolean){
    const chars=['{','}',';','<>','01','=>','()','#'];
    const g=new Text({resolution:3,text:chars[Math.floor(Math.random()*chars.length)],style:{fontFamily:'monospace',fontSize:10,fontWeight:'bold',fill:hot?'#ffb347':'#7fe4ff'}});
    g.anchor.set(.5);g.position.set(rand(-30,30),rand(-165,-140));
    this.glyphs.addChild(g);
  }
}

const speechBubble=(icon:Sprite)=>{
  const bubble=new Container();
  bubble.addChild(new Graphics().roundRect(-14,-13,28,24,7).fill('#ffffff').stroke({color:'#16223a',width:2}).poly([-4,11,4,11,-2,17]).fill('#ffffff'));
  bubble.addChild(icon);bubble.visible=false;
  return bubble;
};

// Pixel-art light bulb (11x14 px grid, 2 px per pixel), bottom-centre at (0, 0): dark outline, yellow glass
// with a white shine, grey screw base. Drawn in code so it matches the game's crisp outlines.
const BULB_MAP=[
  '...KKKKK...',
  '..KYYYYYK..',
  '.KYWWYYYYK.',
  'KYWWYYYYYYK',
  'KYWYYYYYYYK',
  'KYYYYYYYYOK',
  'KYYYYYYYYOK',
  '.KYYYYYYOK.',
  '..KYYYYOK..',
  '...KYYOK...',
  '...KGGGK...',
  '...KDDDK...',
  '...KGGGK...',
  '....KKK....'];
const BULB_COLORS:Record<string,string>={K:'#2b1a0e',Y:'#ffd84d',W:'#fffbe0',O:'#f2a51e',G:'#b9bfc9',D:'#7a808c'};
const pixelBulb=()=>{
  const g=new Graphics(),px=2,w=BULB_MAP[0].length;
  BULB_MAP.forEach((row,y)=>[...row].forEach((c,x)=>{
    if(c!=='.')g.rect((x-w/2)*px,(y-BULB_MAP.length)*px,px,px).fill(BULB_COLORS[c]);
  }));
  return g;
};
type Particle={t:Container;vx:number;vy:number;gravity:number;life:number;age:number;stamp?:Sprite};
// One seated/standing work spot driven by the review action set. Reviewers sit on chairs at R1–R4.
// `solo` stations (Eve, Theo) stand alone: no chair, may always talk, never bug-hunt. Eve is the `lead`:
// Merge Rush, and her approve stamps MERGED and makes the whole review team clap.
type Station={x:number;y:number;pool:Cast[];chair:boolean;monitor:{x:number;y:number};head:number;stamp:string;
  solo:boolean;lead:boolean;glyphs?:string[];stampColor?:string;
  // Board spot (relative to the station) where Idea Storm notes stick; first note, then step per note.
  board?:{x:number;y:number;dx:number;dy:number};
  // Shared action pose name -> this character's file (Pixel's sheet has its own pose names).
  alias?:Record<string,string>;burst?:boolean;roast?:boolean;rootCause?:boolean};
const reviewStation=(i:number):Station=>({...REVIEW_SEATS[i],pool:reviewCasts,chair:true,monitor:{x:50,y:-100},head:150,stamp:'APPROVED',solo:false,lead:false});
// Eve stands on the blue mat in front of the main merge keyboard (~ (1285, 425)).
const MERGE_STATION:Station={x:1265,y:505,pool:[eveCast],chair:false,monitor:{x:45,y:-118},head:162,stamp:'MERGED',solo:true,lead:true};
// Theo (planner) stands on the rug in front of the wooden PLAN table; glyphs rise from the papers.
const PLAN_STATION:Station={x:770,y:332,pool:[theoCast],chair:false,monitor:{x:32,y:-60},head:146,stamp:'PLANNED',stampColor:'#ffb35c',solo:true,lead:false,board:{x:62,y:-118,dx:17,dy:-8},
  glyphs:['☐','☑','→','1.','2.','3.','✓']};
// Pixel (designer) works alone on the left section of the Relax sofa, facing the camera; the sprite has no
// sofa, its anchor (between the feet) stands on the floor in front of the seat.
// Oracle (QA) stands in front of the PLAN table, right of Theo, FACING the viewer: she watches the coders below.
const ORACLE_STATION:Station={x:868,y:372,pool:[oracleCast],chair:false,monitor:{x:-4,y:-70},head:138,stamp:'VALIDATED',stampColor:'#ff5a6e',
  solo:true,lead:false,roast:true,glyphs:['☐','☑','✗','!','?','✓'],
  alias:{type_a:'check_a',type_b:'check_b',read_a:'glare_a',read_b:'glare_b',note:'scold',talk_left:'talk',talk_right:'talk'}};
// Code Review Roast (Oracle's peak): she glares, then shouts "FIX IT!" — red "!" marks fly to every busy coder,
// who jumps with a sweat drop, then fixes it (green ✓). Ends in an approve (VALIDATED).
const ROAST_SHOUT_AT=1.0,ROAST_FLIGHT=0.55,ROAST_STARTLE_MS=2200;
// Sherlock (bug detective) stands in the V corner of the wall below the review team, FACING the viewer.
// approve/talk temporarily use clean poses: GPT leaked Oracle's long ponytail into those two frames.
const SHERLOCK_STATION:Station={x:440,y:1012,pool:[sherlockCast],chair:false,monitor:{x:-4,y:-72},head:138,stamp:'SOLVED',stampColor:'#ff8a3d',
  solo:true,lead:false,rootCause:true,glyphs:['bug','?','#','!','…','✓'],
  alias:{type_a:'log_a',type_b:'log_b',read_a:'ponder_a',read_b:'ponder_b',note:'inspect',approve:'eureka',talk_left:'log_b',talk_right:'log_b'}};
// Root Cause (Sherlock's peak): red bugs rise from every busy review screen, red investigation threads tie them
// to a pin above his head, they are pulled in, "AHA!" and they turn into ✓. Ends in an approve (SOLVED).
const RC_PULL_AT=1.6,RC_AHA_AT=3.0;
const RELAX_STATION:Station={x:1205,y:813,pool:[pixelCast],chair:false,monitor:{x:12,y:-62},head:112,stamp:'DESIGNED',stampColor:'#ff8fd0',
  solo:true,lead:false,burst:true,glyphs:['✦','◆','●','✎','#','px','◐'],
  alias:{type_a:'sketch_a',type_b:'sketch_b',read_a:'laptop_a',read_b:'laptop_b',note:'swatch',hair_tuck:'stretch',talk_left:'talk',talk_right:'talk'}};
// Color Burst (Pixel's peak): paint splashes fly out of her tablet in every colour, a rainbow arc grows over
// her head and swatch cards fan out around her. Ends in an approve (DESIGNED).
const BURST_COLORS=['#ff5a6e','#ffb35c','#ffe066','#5fe3b8','#7fe4ff','#b98cff','#ff8fd0'];

class ReviewSeat{
  root=new Container();
  chair=new Sprite(reviewChairTexture);
  back=new Sprite();
  front=new Sprite();
  icon=iconSprite('chat',18);
  iconName='';
  bubble=speechBubble(this.icon);
  iconUntil=0;
  occupied=false;
  cast=reviewCasts[0];
  action:ReviewAction='read';
  pose='';
  started=0;
  until=0;
  frame=0;
  frameClock=0;
  fade=1;
  // FX layer: monitor alarm glow, magnifying lens, bug, "FOUND!", APPROVED stamp, particles.
  fx=new Container();
  rush=new Graphics();
  storm=new Graphics();
  paint=new Graphics();
  roastFx=new Container();
  cardClock=0;
  threads=new Graphics();
  clues:Container[]=[];
  clueIcons:Sprite[]=[];
  shout=new Text({resolution:3,text:'FIX IT!',style:{fontFamily:'monospace',fontSize:17,fontWeight:'bold',fill:'#ff5a6e',stroke:{color:'#ffffff',width:4}}});
  marks:Text[]=[];
  startled=false;
  splashes:{x:number;y:number;vx:number;vy:number;c:string;age:number;r:number}[]=[];
  splashClock=0;
  bulb=pixelBulb();
  // Aura behind the body during the zone's peak action (like the coders' fire): electric cyan for Eve's
  // Merge Rush, a soft focus glow in her own colour for a reviewer's Bug Hunt.
  aura=new Graphics();
  arcSeed=1;
  arcUntil=0;
  rushLines:{x:number;y:number;color:string}[]=[];
  packets:{line:number;u:number}[]=[];
  rings:number[]=[];
  rushClock=0;
  ringClock=0;
  alarm=new Graphics().roundRect(-17,-12,34,24,4).fill('#ff3b5c');
  lens=new Graphics().circle(0,0,7).fill({color:'#cfefff',alpha:0.35}).stroke({color:'#ffffff',width:2})
    .moveTo(5,5).lineTo(11,11).stroke({color:'#ffffff',width:3});
  bug=new Container();
  found=new Text({resolution:3,text:'FOUND!',style:{fontFamily:'monospace',fontSize:11,fontWeight:'bold',fill:'#ff5a6e',stroke:{color:'#16223a',width:3}}});
  stamp=new Container();
  particles:Particle[]=[];
  glyphClock=0;
  squashed=false;
  stamped=false;
  reactUntil=0;
  clapAt=0;
  constructor(public index:number,public st:Station){
    const {x,y,monitor}=st;
    this.cast=st.pool[0];
    this.root.position.set(x,y);this.root.zIndex=y;
    // Empty review chair: 70 px tall (bbox 85-1150), bottom wheel (x 648) at the floor contact.
    this.chair.anchor.set(648/reviewChairTexture.width,1150/reviewChairTexture.height);this.chair.scale.set(0.0657);
    this.alarm.position.set(monitor.x,monitor.y);this.alarm.blendMode='add';
    {const b=iconSprite('bug',18);b.y=-9;this.bug.addChild(b)}this.found.anchor.set(.5);
    const label=new Text({resolution:3,text:st.stamp,style:{fontFamily:'monospace',fontSize:10,fontWeight:'bold',fill:st.stampColor??'#5fe3b8'}});
    label.anchor.set(.5);
    this.stamp.addChild(new Graphics().roundRect(-35,-10,70,20,3).fill({color:'#0d1526',alpha:0.85}).stroke({color:st.stampColor??'#5fe3b8',width:2}),label);
    this.stamp.position.set(4,-st.head-10);this.stamp.rotation=-0.2;
    this.fx.addChild(this.alarm,this.lens,this.bug,this.found,this.stamp);
    if(st.lead)topFx.addChild(this.rush);
    this.bulb.visible=false;
    if(st.board)this.fx.addChild(this.storm,this.bulb);
    if(st.burst)this.fx.addChild(this.paint);
    if(st.rootCause){
      topFx.addChild(this.threads);
      for(let i=0;i<REVIEW_SEATS.length;i++){const c=new Container(),s=iconSprite('bug',20);c.addChild(s);c.visible=false;this.clues.push(c);this.clueIcons.push(s);topFx.addChild(c)}
    }
    if(st.roast||st.rootCause){this.shout.anchor.set(.5);this.shout.visible=false;this.fx.addChild(this.shout)}
    if(st.roast){
      topFx.addChild(this.roastFx);
      for(let i=0;i<SEATS.length;i++){const m=new Text({resolution:3,text:'!',style:{fontFamily:'monospace',fontSize:24,fontWeight:'bold',fill:'#ff5a6e',stroke:{color:'#ffffff',width:3}}});m.anchor.set(.5);m.visible=false;this.marks.push(m);this.roastFx.addChild(m)}
    }
    this.hideFx();
    this.root.addChild(this.chair,this.aura,this.back,this.front,this.fx,this.bubble);
    this.root.eventMode='static';this.root.cursor='pointer';
    this.root.hitArea={contains:(px:number,py:number)=>px>-45&&px<45&&py>-st.head&&py<5};
    this.root.on('pointertap',()=>{
      if(this.occupied){onCharacterTap(this.cast.name);return}
      let next=this.occupied?st.pool.indexOf(this.cast)+1:0;
      while(next<st.pool.length&&onStage(st.pool[next].name,this))next++;
      this.setOccupied(next<st.pool.length,st.pool[next]);
    });
    layer.addChild(this.root);
    this.setOccupied(false);
  }
  setOccupied(value:boolean,cast=this.cast){
    this.occupied=value;this.cast=cast;
    if(value)onSeated(cast.name);
    this.chair.visible=!value&&this.st.chair;
    for(const s of [this.back,this.front,this.bubble])s.visible=false;
    this.hideFx();this.reactUntil=0;this.clapAt=0;
    if(value){this.front.visible=true;this.pose='';this.next(performance.now())}
  }
  hideFx(){for(const s of [this.alarm,this.lens,this.bug,this.found,this.stamp])s.visible=false}
  // Short clap when a neighbour approves; it never starts a wave of its own.
  clap(now:number){
    this.reactUntil=now+WAVE_CLAP_MS;this.until=Math.max(this.until,this.reactUntil);
    this.burst(4,['heart_v','sparkle','heart'],0,-this.st.head);
  }
  spawnCard(monitor:{x:number;y:number},color:string){
    const card=new Container();
    const g=new Graphics().roundRect(-10,-8,20,16,3).fill('#ffffff').stroke({color,width:2});
    const lines=[['#5fe3b8',12],['#ff7a8a',9],['#5fe3b8',14],['#c9d2e3',8]] as const;
    lines.forEach(([c,w],i)=>g.rect(-7,-5+i*3,w,2).fill(c));
    card.addChild(g);
    const ok=Math.random()<0.75,stamp=iconSprite(ok?'check':'cross',13);
    stamp.position.set(8,-6);stamp.visible=false;card.addChild(stamp);
    card.position.set(monitor.x+rand(-6,6),monitor.y);card.rotation=rand(-0.15,0.15);card.scale.set(1.35);
    this.fx.addChild(card);
    this.particles.push({t:card,vx:rand(-0.006,0.006),vy:-0.028,gravity:0,life:1500,age:0,stamp});
  }
  spawn(text:string,x:number,y:number,vx:number,vy:number,life:number,gravity:number,color?:string){
    let t:Container;
    if(isIcon(text))t=iconSprite(text,18);
    else{const tx=new Text({resolution:3,text,style:{fontFamily:'"Nunito","Trebuchet MS",sans-serif',fontSize:12,fontWeight:'900',fill:color??'#ffffff',stroke:{color:'#16223a',width:3}}});tx.anchor.set(.5);t=tx}
    t.position.set(x,y);
    this.fx.addChild(t);this.particles.push({t,vx,vy,gravity,life,age:0});
  }
  burst(count:number,texts:string[],x:number,y:number){
    for(let i=0;i<count;i++){
      const angle=rand(-Math.PI*0.95,-Math.PI*0.05),speed=rand(0.04,0.08);
      this.spawn(texts[i%texts.length],x,y,Math.cos(angle)*speed,Math.sin(angle)*speed,rand(650,950),0.00012);
    }
  }
  // R1..R4 run along the desk: her left is the upper-left neighbour (index - 1).
  allowed(action:ReviewAction){
    if(this.st.solo&&action==='bug_hunt')return false;
    if(action==='merge_rush'&&!this.st.lead)return false;
    if(action==='idea_storm'&&!this.st.board)return false;
    if(action==='color_burst'&&!this.st.burst)return false;
    if(action==='roast'&&!this.st.roast)return false;
    if(action==='root_cause'&&!this.st.rootCause)return false;
    if(this.st.solo&&(action==='talk_left'||action==='talk_right'))return true;
    if(action==='talk_left')return !!reviewSeats[this.index-1]?.occupied;
    if(action==='talk_right')return !!reviewSeats[this.index+1]?.occupied;
    return (REVIEW_FRAMES[action]?.[0]??[action]).every(p=>this.file(p) in this.cast.manifest.poses);
  }
  next(now:number){
    const forcedAction=forcedReview&&this.allowed(forcedReview)?forcedReview:null;
    // Do not repeat a one-shot gesture back to back.
    // Eve's Merge Rush and Theo's Idea Storm are their signature moments: ×PEAK_BOOST so they show up
    // often (~20% of picks, ≈ every 30 s), each followed by its approve stamp.
    const options=REVIEW_WEIGHTS.filter(([a])=>this.allowed(a)&&(REVIEW_FRAMES[a]||a!==this.action))
      .map(([a,w])=>[a,a==='bug_hunt'||a==='merge_rush'||a==='idea_storm'||a==='color_burst'||a==='roast'||a==='root_cause'?w*PEAK_BOOST:w] as [ReviewAction,number]);
    const wasRush=this.action==='merge_rush'||this.action==='idea_storm'||this.action==='color_burst'||this.action==='roast'||this.action==='root_cause';
    this.action=forcedAction??pick(options);
    // A Merge Rush always lands in an approve (MERGED stamp + team clap).
    if(wasRush&&!forcedAction)this.action='approve';
    if(this.action==='merge_rush')this.rushLines=this.rushSources();
    const [min,max]=REVIEW_DURATION[this.action];
    this.started=now;this.until=now+rand(min,max)*1000;
    this.frame=0;this.frameClock=0;this.squashed=false;this.stamped=false;
    // Approval wave: the others clap one after another, nearest first.
    if(this.action==='approve'&&(this.st.lead||!this.st.solo))for(const s of reviewSeats)
      if(s!==this&&s.occupied)s.clapAt=now+150+(this.st.lead?s.index+1:Math.abs(s.index-this.index))*WAVE_STEP_MS;
  }
  show(pose:string){
    if(pose===this.pose)return;
    // Frame flips inside one action swap instantly; a new action crossfades.
    const sameAction=REVIEW_FRAMES[this.action]?.[0].includes(this.pose);
    if(this.pose&&!sameAction){placePose(this.back,this.cast,this.file(this.pose));this.back.visible=true;this.fade=0}
    placePose(this.front,this.cast,this.file(pose));this.pose=pose;
  }
  file(pose:string){return this.st.alias?.[pose]??pose}
  update(now:number,dt:number){
    if(!this.occupied)return;
    if(now>=this.until)this.next(now);
    if(this.clapAt&&now>=this.clapAt){
      this.clapAt=0;
      if(this.action!=='approve'&&this.action!=='bug_hunt')this.clap(now);
    }
    const reacting=now<this.reactUntil;
    const frames=REVIEW_FRAMES[this.action];
    let dy=0;
    if(reacting){
      this.show('approve');dy=Math.round(Math.sin(now/110)*0.8);
    }else if(frames){
      const [poses,fps]=frames;
      this.frameClock+=dt;
      if(this.frameClock>=1000/fps){this.frameClock%=1000/fps;this.frame++}
      this.show(poses[this.frame%poses.length]);
      if(this.action==='bug_hunt'||this.action==='merge_rush'||this.action==='idea_storm'||this.action==='color_burst'||this.action==='roast'||this.action==='root_cause')dy=Math.round(rand(-0.6,0.6));
    }else{
      this.show(this.action);
      if(this.action==='talk_left'||this.action==='talk_right'||this.action==='approve')dy=Math.round(Math.sin(now/140)*0.8);
    }
    this.front.position.set(0,dy);this.back.position.set(0,dy);

    if(this.fade<1){
      this.fade=Math.min(1,this.fade+dt/FADE_MS);
      this.front.alpha=this.fade;this.back.alpha=1-this.fade;
      if(this.fade>=1)this.back.visible=false;
    }else this.front.alpha=1;

    const talking=!reacting&&(this.action==='talk_left'||this.action==='talk_right');
    this.bubble.visible=talking;
    if(talking){
      this.bubble.position.set(this.action==='talk_left'?-34:34,-this.st.head+Math.round(Math.sin(now/180)));
      if(now>=this.iconUntil){
        const choices=REVIEW_ICONS.filter(i=>i!==this.iconName);
        this.iconName=choices[Math.floor(Math.random()*choices.length)];setIcon(this.icon,this.iconName,18);
        this.iconUntil=now+rand(ICON_MS[0],ICON_MS[1]);
      }
    }else this.iconUntil=0;
    this.updateFx(now,dt,reacting);
  }
  // Every busy monitor in the office feeds the merge: coding desks and occupied review seats.
  rushSources(){
    const lines:{x:number;y:number;color:string}[]=[];
    for(const s of seats)if(s.occupied)lines.push({x:SEATS[s.index].x+10,y:SEATS[s.index].y-125,color:'#7fe4ff'});
    for(const r of reviewSeats)if(r.occupied)lines.push({x:r.st.x+r.st.monitor.x,y:r.st.y+r.st.monitor.y,color:REVIEW_COLORS[r.cast.name]??'#ffffff'});
    return lines;
  }
  updateRush(now:number,dt:number,t:number){
    const g=this.rush;g.clear();
    if(this.action!=='merge_rush'||now<this.reactUntil){this.packets.length=0;this.rings.length=0;return}
    const fadeIn=Math.min(1,t/0.4),{x:gx,y:gy}=GLOBE;
    const curve=(l:{x:number;y:number})=>({cx:(l.x+gx)/2,cy:Math.min(l.y,gy)-90});
    this.rushLines.forEach((l,i)=>{
      const {cx,cy}=curve(l);
      const glow=fadeIn*(0.75+0.25*Math.sin(now/120+i));
      g.moveTo(l.x,l.y).quadraticCurveTo(cx,cy,gx,gy).stroke({color:l.color,width:6,alpha:0.12*glow});
      g.moveTo(l.x,l.y).quadraticCurveTo(cx,cy,gx,gy).stroke({color:l.color,width:2,alpha:0.7*glow});
    });
    this.rushClock+=dt;
    while(this.rushClock>=RUSH_PACKET_MS){
      this.rushClock-=RUSH_PACKET_MS;
      if(this.rushLines.length)this.packets.push({line:Math.floor(Math.random()*this.rushLines.length),u:0});
    }
    for(const p of this.packets)p.u+=dt/RUSH_TRAVEL_MS;
    this.packets=this.packets.filter(p=>p.u<1);
    for(const p of this.packets){
      const l=this.rushLines[p.line],{cx,cy}=curve(l),q=1-p.u;
      const px=q*q*l.x+2*q*p.u*cx+p.u*p.u*gx,py=q*q*l.y+2*q*p.u*cy+p.u*p.u*gy;
      g.circle(px,py,4).fill({color:l.color,alpha:0.3*fadeIn});
      g.circle(px,py,2).fill({color:'#ffffff',alpha:fadeIn});
    }
    this.ringClock+=dt;
    while(this.ringClock>=RUSH_RING_MS){this.ringClock-=RUSH_RING_MS;this.rings.push(0)}
    this.rings=this.rings.map(a=>a+dt).filter(a=>a<RUSH_RING_LIFE);
    for(const a of this.rings)g.circle(gx,gy,6+a*0.05).stroke({color:'#7fe9ff',width:2,alpha:0.8*(1-a/RUSH_RING_LIFE)});
  }
  updateRootCause(now:number,t:number,reacting:boolean){
    const g=this.threads;g.clear();
    const active=!reacting&&this.action==='root_cause';
    if(!active){for(const c of this.clues)c.visible=false;this.shout.visible=false;return}
    const pin={x:this.st.x,y:this.st.y-this.st.head-26};
    reviewSeats.forEach((s,i)=>{
      const c=this.clues[i];c.visible=s.occupied;if(!s.occupied)return;
      const sx=s.st.x+s.st.monitor.x,sy=s.st.y+s.st.monitor.y;
      // rise above the screen, hover, then get pulled to the pin
      const rise=Math.min(1,t/0.6),hover={x:sx,y:sy-30*rise+Math.sin(now/200+i)*2};
      const k=Math.min(1,Math.max(0,(t-RC_PULL_AT)/(RC_AHA_AT-RC_PULL_AT))),e=k*k;
      const x=hover.x+(pin.x+(i-1.5)*14-hover.x)*e,y=hover.y+(pin.y-hover.y)*e;
      c.position.set(x,y);c.alpha=Math.min(1,t/0.3);
      setIcon(this.clueIcons[i],t>=RC_AHA_AT?'check':'bug',20);
      c.scale.set(t>=RC_AHA_AT?1+0.15*Math.sin(now/80):1);
      if(t>=0.5&&t<RC_AHA_AT+0.3)g.moveTo(x,y).lineTo(pin.x,pin.y).stroke({color:'#e0242f',width:1.5,alpha:0.85});
    });
    if(t>=0.5&&t<RC_AHA_AT+0.3){g.circle(pin.x,pin.y,4).fill('#e0242f').stroke({color:'#ffffff',width:1})}
    // "AHA!" in his shout text
    this.shout.text='AHA!';
    this.shout.visible=t>=RC_AHA_AT&&t<RC_AHA_AT+1.2;
    if(this.shout.visible){const k=Math.min(1,(t-RC_AHA_AT)/0.15);this.shout.scale.set(k<1?k*1.6:1+0.05*Math.sin(now/50));this.shout.position.set(0,-this.st.head-14)}
  }
  updateRoast(now:number,t:number,reacting:boolean){
    const active=!reacting&&this.action==='roast';
    if(!active){this.shout.visible=false;for(const m of this.marks)m.visible=false;this.startled=false;return}
    this.shout.text='FIX IT!';
    const h=this.st.head;
    // "FIX IT!" pops with a shake while she shouts.
    this.shout.visible=t>=ROAST_SHOUT_AT&&t<ROAST_SHOUT_AT+2.2;
    if(this.shout.visible){
      const k=Math.min(1,(t-ROAST_SHOUT_AT)/0.15);
      this.shout.scale.set(k<1?k*1.5:1+0.06*Math.sin(now/40));
      this.shout.position.set(Math.round(rand(-1,1)),-h-14);
    }
    // Red "!" marks fly from her to every busy coder; when they land the coder jumps.
    seats.forEach((s,i)=>{
      const m=this.marks[i],u=(t-ROAST_SHOUT_AT-i*0.06)/ROAST_FLIGHT;
      m.visible=s.occupied&&u>=0&&u<1;
      if(!m.visible)return;
      const x0=this.st.x,y0=this.st.y-h,x1=SEATS[i].x,y1=SEATS[i].y-150;
      m.position.set(x0+(x1-x0)*u,y0+(y1-y0)*u-Math.sin(Math.PI*u)*40);
      m.rotation=u*8;
    });
    if(!this.startled&&t>=ROAST_SHOUT_AT+ROAST_FLIGHT){
      this.startled=true;
      seats.forEach((s,i)=>{if(s.occupied)s.startleUntil=now+ROAST_STARTLE_MS+i*60});
    }
  }
  updateBurst(now:number,dt:number,t:number,reacting:boolean){
    const g=this.paint;g.clear();
    if(reacting||this.action!=='color_burst'){this.splashes.length=0;return}
    const h=this.st.head,m=this.st.monitor,fade=Math.min(1,t/0.3);
    // Paint splashes shoot out of the tablet and fall back with gravity.
    this.splashClock+=dt;
    while(this.splashClock>=70){
      this.splashClock-=70;
      const a=rand(-Math.PI*0.95,-Math.PI*0.05),v=rand(0.06,0.12);
      this.splashes.push({x:m.x,y:m.y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,c:BURST_COLORS[Math.floor(Math.random()*BURST_COLORS.length)],age:0,r:rand(2.5,4.5)});
    }
    for(const s of this.splashes){s.age+=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vy+=0.00022*dt}
    this.splashes=this.splashes.filter(s=>s.age<900);
    for(const s of this.splashes)g.circle(s.x,s.y,s.r).fill({color:s.c,alpha:1-s.age/900});
    // Rainbow arc growing over her head.
    const k=Math.min(1,t/1.2);
    BURST_COLORS.forEach((c,i)=>{
      const r=34+i*3.2;
      g.moveTo(-r,-h*0.62).arc(0,-h*0.62,r,Math.PI,Math.PI+Math.PI*k).stroke({color:c,width:3,alpha:0.75*fade});
    });
    // Swatch cards fanning out around her.
    for(let i=0;i<5;i++){
      const a=-Math.PI*0.85+i*0.35+Math.sin(now/400)*0.08,r=48*k;
      const x=Math.cos(a)*r,y=-h*0.45+Math.sin(a)*r*0.7;
      g.roundRect(x-4,y-6,8,12,1.5).fill({color:BURST_COLORS[(i*2)%BURST_COLORS.length],alpha:fade}).stroke({color:'#3a2a1a',width:1,alpha:fade});
    }
  }
  updateStorm(now:number,t:number,reacting:boolean){
    const g=this.storm;g.clear();
    this.bulb.visible=false;
    const b=this.st.board;
    if(!b||reacting||this.action!=='idea_storm')return;
    const h=this.st.head;
    // 💡 pops in with an overshoot and keeps glowing above his head.
    if(t>=STORM_BULB_AT){
      const k=Math.min(1,(t-STORM_BULB_AT)/0.25);
      this.bulb.visible=true;
      this.bulb.position.set(-2,-h+6+Math.round(Math.sin(now/160)*1.5));
      this.bulb.scale.set(k<1?k*1.4:1+0.08*Math.sin(now/110));
      for(let r=0;r<4;r++)g.circle(-2,-h-8,7+r*5).fill({color:'#ffc93c',alpha:0.16*Math.min(1,k)});
      // short light rays
      for(let r=0;r<6;r++){const a=r*Math.PI/3+now/600;g.moveTo(-2+Math.cos(a)*15,-h-8+Math.sin(a)*15).lineTo(-2+Math.cos(a)*21,-h-8+Math.sin(a)*21).stroke({color:'#ffb000',width:2,alpha:0.8*Math.min(1,k)})}
    }
    // Sticky notes fly from his head in an arc and stick to the board in a row.
    const start={x:2,y:-h+20},spots:{x:number;y:number}[]=[];
    for(let i=0;i<STORM_NOTES;i++){
      const launch=STORM_FIRST_NOTE+i*STORM_NOTE_GAP,u=(t-launch)/STORM_FLIGHT;
      if(u<0)continue;
      const end={x:b.x+i*b.dx,y:b.y+i*b.dy},color=STORM_COLORS[i%STORM_COLORS.length];
      let x=end.x,y=end.y,rot=-0.12;
      if(u<1){
        const e=1-(1-u)*(1-u);
        x=start.x+(end.x-start.x)*e;y=start.y+(end.y-start.y)*e-Math.sin(Math.PI*u)*28;rot=u*6;
      }else spots.push(end);
      const c=Math.cos(rot),s=Math.sin(rot),pt=(px:number,py:number)=>[x+px*c-py*s,y+px*s+py*c];
      g.poly([...pt(-5,-5),...pt(5,-5),...pt(5,5),...pt(-5,5)]).fill({color}).stroke({color:'#5a3a1a',width:1});
      if(u>=1&&u<1.25)g.circle(end.x,end.y,6+(u-1)*24).stroke({color:'#ffffff',width:1.5,alpha:1-(u-1)*4});
    }
    // Once every note is up, an arrow links them into a roadmap and the board glows.
    if(spots.length===STORM_NOTES){
      const k=Math.min(1,(t-(STORM_FIRST_NOTE+(STORM_NOTES-1)*STORM_NOTE_GAP+STORM_FLIGHT))/0.4);
      const a=spots[0],z=spots[STORM_NOTES-1];
      g.moveTo(a.x,a.y+7).lineTo(a.x+(z.x-a.x)*k,a.y+7+(z.y-a.y)*k).stroke({color:'#ffb35c',width:2,alpha:0.95});
      if(k>=1){
        g.poly([z.x+6,z.y+4,z.x+1,z.y+3,z.x+3,z.y+9]).fill({color:'#ffb35c'});
        for(let r=0;r<4;r++)g.ellipse((a.x+z.x)/2,(a.y+z.y)/2,60+r*8,20+r*5).fill({color:'#ffe58a',alpha:0.05+0.03*Math.sin(now/120)});
      }
    }
  }
  updateAura(now:number,t:number,reacting:boolean){
    const g=this.aura;g.clear();
    const rush=this.action==='merge_rush',storm=this.action==='idea_storm',burst=this.action==='color_burst';
    if(reacting||(!rush&&!storm&&!burst&&this.action!=='bug_hunt'))return;
    const color=rush?'#7fe9ff':REVIEW_COLORS[this.cast.name]??'#ffffff';
    const h=this.st.head,cy=-h*0.48,fade=Math.min(1,t/0.3),pulse=0.5+0.5*Math.sin(now/90);
    // Soft glow: stacked translucent ellipses fade out toward the edge (no hard rim, no additive white-out).
    for(let k=0;k<8;k++){
      const f=1-k/8;
      g.ellipse(0,cy,(28+pulse*3)*f+4,h*0.46*f+4).fill({color,alpha:(rush?0.038:0.04)*fade});
    }
    // Orbiting diamonds (Eve) / tiny stars (reviewers) on two tilted rings.
    const n=rush?8:6;
    for(let i=0;i<n;i++){
      const a=now/(rush?300:450)+i*2*Math.PI/n,x=Math.cos(a)*(rush?36:32),y=cy+Math.sin(a)*9+(i%2?-h*0.22:h*0.18);
      if(rush)g.poly([x,y-3,x+2,y,x,y+3,x-2,y]).fill({color:'#ffffff',alpha:0.85*fade});
      // Theo: tiny sticky notes orbiting, gently tilting.
      else if(burst)g.circle(x,y,2.5).fill({color:BURST_COLORS[i%BURST_COLORS.length],alpha:0.95*fade});
      else if(storm)g.rect(x-2.5,y-2.5,5,5).fill({color:STORM_COLORS[i%STORM_COLORS.length],alpha:0.9*fade});
      else g.star(x,y,4,2.6,1.1).fill({color:'#ffffff',alpha:0.75*fade});
    }
    if(!rush)return;
    // Crackling lightning: a few jagged arcs re-rolled every 70 ms.
    if(now>=this.arcUntil){this.arcSeed=Math.floor(Math.random()*1e6);this.arcUntil=now+70}
    let seed=this.arcSeed;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
    for(let k=0;k<3;k++){
      const a=rnd()*Math.PI*2,r0=24,steps=4;
      let x=Math.cos(a)*r0,y=cy+Math.sin(a)*h*0.42;
      g.moveTo(x,y);
      for(let s=0;s<steps;s++){x+=Math.cos(a)*6+(rnd()-0.5)*8;y+=Math.sin(a)*6+(rnd()-0.5)*8;g.lineTo(x,y)}
      g.stroke({color:'#e6fdff',width:1.5,alpha:0.9*fade});
    }
  }
  updateFx(now:number,dt:number,reacting:boolean){
    const t=(now-this.started)/1000,color=REVIEW_COLORS[this.cast.name]??'#ffffff',monitor=this.st.monitor;
    const hunting=!reacting&&this.action==='bug_hunt';
    if(this.st.lead)this.updateRush(now,dt,t);
    if(this.st.board)this.updateStorm(now,t,reacting);
    if(this.st.burst)this.updateBurst(now,dt,t,reacting);
    if(this.st.roast)this.updateRoast(now,t,reacting);
    if(this.st.rootCause)this.updateRootCause(now,t,reacting);
    this.updateAura(now,t,reacting);

    // Reviewers reading: a little code-diff card pops out of the screen, floats up and gets stamped ✓ or ✗.
    if(!reacting&&!this.st.solo&&this.action==='read'){
      this.cardClock+=dt;
      if(this.cardClock>=1300){this.cardClock=0;this.spawnCard(monitor,color)}
    }
    // Review glyphs float up from the monitor while reading/typing, fast during a bug hunt.
    const rushing=!reacting&&(this.action==='merge_rush'||this.action==='idea_storm'||this.action==='color_burst');
    if(!reacting&&(this.action==='read'||this.action==='type'||hunting||rushing)){
      this.glyphClock+=dt;
      const every=hunting||rushing?220:this.action==='type'?650:900;
      while(this.glyphClock>=every){
        this.glyphClock-=every;
        const set=this.st.glyphs??REVIEW_GLYPHS,glyph=hunting&&Math.random()<0.4?'✗':set[Math.floor(Math.random()*set.length)];
        this.spawn(glyph,monitor.x+rand(-14,14),monitor.y+rand(-6,6),rand(-0.005,0.005),-0.03,1100,0,hunting&&glyph==='✗'?'#ff5a6e':color);
      }
    }

    // Bug hunt: the lens sweeps the screen, the monitor flashes red, the bug pops out and is squashed.
    this.lens.visible=hunting&&t<BUG_SQUASH_AT;
    if(this.lens.visible)this.lens.position.set(monitor.x+Math.sin(t*5)*12,monitor.y+Math.cos(t*3.3)*4);
    this.alarm.visible=hunting&&t>=BUG_FOUND_AT-0.4&&t<BUG_SQUASH_AT+0.4;
    if(this.alarm.visible)this.alarm.alpha=0.25+0.2*Math.sin(now/60);
    this.bug.visible=hunting&&t>=BUG_FOUND_AT&&t<BUG_SQUASH_AT+0.25;
    if(this.bug.visible){
      const k=t-BUG_FOUND_AT;
      this.bug.position.set(monitor.x,monitor.y-4-Math.min(k,0.25)*40);
      if(t>=BUG_SQUASH_AT)this.bug.scale.set(1.3,Math.max(0.15,1-(t-BUG_SQUASH_AT)*4));
      else this.bug.scale.set(1+Math.max(0,0.3-k));
    }
    if(hunting&&!this.squashed&&t>=BUG_SQUASH_AT){
      this.squashed=true;
      this.burst(10,['sparkle','star','check'],monitor.x,monitor.y-10);
    }
    this.found.visible=hunting&&t>=BUG_FOUND_AT&&t<BUG_SQUASH_AT+0.8;
    if(this.found.visible)this.found.position.set(0,-this.st.head-10+Math.round(Math.sin(now/90)*1.5));

    // LGTM: an APPROVED stamp slams down above her head, then sparkles.
    const approving=!reacting&&this.action==='approve';
    this.stamp.visible=approving;
    if(approving){
      const slam=Math.min(1,t/0.15);
      this.stamp.scale.set(2-slam);
      this.stamp.alpha=Math.min(slam,(this.until-now)/300);
      if(!this.stamped&&slam>=1){this.stamped=true;this.burst(12,['heart_v','sparkle','heart','star'],4,-this.st.head-10)}
    }

    for(const p of [...this.particles]){
      p.age+=dt;
      p.t.x+=p.vx*dt;p.t.y+=p.vy*dt;p.vy+=p.gravity*dt;
      p.t.alpha=Math.max(0,1-Math.max(0,p.age-p.life*0.6)/(p.life*0.4));
      // the ✓/✗ stamp slams in (big → normal over 120 ms)
      if(p.stamp&&p.age>650){p.stamp.visible=true;const k=Math.min(1,(p.age-650)/120);p.stamp.alpha=k;p.stamp.scale.set(13/p.stamp.texture.height*(1.8-0.8*k))}
      if(p.age>=p.life){p.t.destroy();this.particles.splice(this.particles.indexOf(p),1)}
    }
  }
}

const seats:Seat[]=SEATS.map((_,i)=>new Seat(i));
seats.forEach((s,i)=>s.setOccupied(true,casts[i%casts.length]));
const reviewSeats:ReviewSeat[]=REVIEW_SEATS.map((_,i)=>new ReviewSeat(i,reviewStation(i)));
reviewSeats.forEach((s,i)=>s.setOccupied(true,reviewCasts[i%reviewCasts.length]));
const eveSeat=new ReviewSeat(0,MERGE_STATION);
eveSeat.setOccupied(true,eveCast);
const theoSeat=new ReviewSeat(0,PLAN_STATION);
theoSeat.setOccupied(true,theoCast);
const pixelSeat=new ReviewSeat(0,RELAX_STATION);
pixelSeat.setOccupied(true,pixelCast);
const oracleSeat=new ReviewSeat(0,ORACLE_STATION);
oracleSeat.setOccupied(true,oracleCast);
const sherlockSeat=new ReviewSeat(0,SHERLOCK_STATION);
sherlockSeat.setOccupied(true,sherlockCast);
const reviewZone=[...reviewSeats,eveSeat,theoSeat,pixelSeat,oracleSeat,sherlockSeat];
// Idle test: every character in IDLERS. Click one at work → it takes a break in the Cafe/Lounge; click it
// while idling → back to the seat it left. Pixel's sofa desk blocks the nearby sofa slot while she works.
const idleWorld=new IdleWorld(layer);
idleWorld.blockers.push({id:'P',x:RELAX_STATION.x,y:RELAX_STATION.y,active:()=>pixelSeat.occupied});
// One character, one sprite: a name counts as on stage when it occupies any work seat or idles for real.
idleWorld.isWorking=name=>[...seats,...reviewZone].some(s=>s.occupied&&s.cast.name===name);
onSeated=name=>idleWorld.leave(name);
idleWorldRef=idleWorld;
stageSeats=[...seats,...reviewZone];
type HomeSeat={occupied:boolean;cast:Cast;setOccupied:(v:boolean,cast?:Cast)=>void};
const idlers=new Map<string,{agent:IdleAgent;home:HomeSeat|null;cast:Cast|null}>();
for(const cast of idleCasts){
  const entry={agent:new IdleAgent(idleWorld,cast),home:null as HomeSeat|null,cast:null as Cast|null};
  idlers.set(cast.name,entry);
  entry.agent.root.eventMode='static';entry.agent.root.cursor='pointer';
  entry.agent.root.on('pointertap',()=>onCharacterTap(cast.name));
}
goIdle=seat=>{
  const entry=idlers.get(seat.cast.name);
  if(!entry)return false;
  // Break area full: the character stays at work (never leave the seat without a slot to go to).
  if(!idleWorld.hasRoom(entry.agent)){showFull(seat as HomeSeat);return true}
  const cast=(seat as HomeSeat).cast;
  entry.home=seat as HomeSeat;entry.cast=cast;
  seat.setOccupied(false);
  if(!entry.agent.start(performance.now()))(seat as HomeSeat).setOccupied(true,cast);
  return true;
};
// Short "full" note over a seat whose character could not go on a break.
function showFull(seat:HomeSeat){
  const root=(seat as unknown as {root:Container}).root;
  const t=new Text({resolution:3,text:'hết chỗ nghỉ',style:{fontFamily:'"Nunito","Trebuchet MS",sans-serif',fontSize:11,fontWeight:'900',fill:'#ffd84d',stroke:{color:'#16223a',width:3}}});
  t.anchor.set(.5);t.position.set(root.x,root.y-150);t.zIndex=1e6;layer.addChild(t);
  const t0=performance.now();
  const tick=()=>{const k=(performance.now()-t0)/1400;if(k>=1){t.destroy();app.ticker.remove(tick);return}t.y=root.y-150-k*14;t.alpha=1-k*k};
  app.ticker.add(tick);
}
// Back to the seat it left; if someone took that seat meanwhile, it keeps idling.
function backToWork(name:string){
  const entry=idlers.get(name);
  if(!entry?.home||entry.home.occupied)return;
  entry.agent.stop();entry.home.setOccupied(true,entry.cast!);
}
// The glass railing below REVIEW stands in front of the V1 viewpoint: a cut of it (opaque bar/posts/
// plants, see-through glass) is layered just above whoever stands there.
const railFg=new Sprite(await load('/assets/environment/review_rail_fg.png'));
railFg.position.set(240,890);railFg.zIndex=984.5;layer.addChild(railFg);
const pixelIdle=idlers.get('pixel')!.agent;
idlers.get('pixel')!.home=pixelSeat;idlers.get('pixel')!.cast=pixelCast;
function togglePixel(){
  if(pixelSeat.occupied)goIdle(pixelSeat);
  else backToWork('pixel');
}
// Debug hook for driving the test page from devtools (step frames while the tab is hidden).
// Everything is loaded and placed: fade the loading screen out.
const loadingScreen=document.getElementById('loading');
if(loadingScreen){loadingScreen.classList.add('done');setTimeout(()=>loadingScreen.remove(),600)}
Object.assign(window,{__test:{idleWorld,idlers,pixelIdle,app,seats,reviewSeats,eveSeat,theoSeat,pixelSeat,oracleSeat,sherlockSeat}});

const forceBar=document.getElementById('force')!;
const buttons:[string,Action|null][]=[['Random',null],['Gõ thường','type'],['Gõ nhanh','type_fast'],['Siêu tốc 🔥','type_super'],['Nói trái','talk_left'],['Nói phải','talk_right'],['Xoay trái','swivel_left'],['Xoay phải','swivel_right']];
for(const [label,action] of buttons){
  const b=document.createElement('button');b.textContent=label;b.className=action===forced?'on':'';
  b.onclick=()=>{forced=action;forceBar.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));const now=performance.now();seats.forEach(s=>s.occupied&&s.next(now))};
  forceBar.appendChild(b);
}

const reviewBar=document.getElementById('force-review')!;
const reviewButtons:[string,ReviewAction|null][]=[['Random',null],['Gõ khẽ','type'],['Đọc','read'],['Bug Hunt 🔍','bug_hunt'],['Merge Rush ⚡','merge_rush'],['Idea Storm 💡','idea_storm'],['Color Burst 🎨','color_burst'],['Roast 📢','roast'],['Root Cause 🧵','root_cause'],['Note','note'],['Approve','approve'],['Nói trái','talk_left'],['Nói phải','talk_right'],['Uống trà','sip_tea'],['Vén tóc','hair_tuck']];
for(const [label,action] of reviewButtons){
  const b=document.createElement('button');b.textContent=label;b.className=action===forcedReview?'on':'';
  b.onclick=()=>{forcedReview=action;reviewBar.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));const now=performance.now();reviewZone.forEach(s=>s.occupied&&s.next(now))};
  reviewBar.appendChild(b);
}

const idleBar=document.getElementById('force-idle')!;
const idleButtons:[string,()=>void][]=[
  ['Pixel ↔',togglePixel],
  // one toggle per builder / reviewer that has an idle sheet
  ...IDLERS.filter(name=>name!=='pixel').map(name=>[`${name[0].toUpperCase()+name.slice(1)} ↔`,()=>{
    const s=[...seats,...reviewZone].find(s=>s.occupied&&s.cast.name===name);if(s)goIdle(s);else backToWork(name);
  }] as [string,()=>void]),
  ['Đổi chỗ ngẫu nhiên',()=>{for(const {agent} of idlers.values())agent.advance(performance.now())}],
];
for(const [label,fn] of idleButtons){const b=document.createElement('button');b.textContent=label;b.onclick=fn;idleBar.appendChild(b)}

// Auto shift: every character alternates a random stretch of work and a random break (test page stand-in
// for /api/state). A full break area keeps the character at work and it tries again a little later.
const WORK_SECONDS:[number,number]=[40,100],BREAK_SECONDS:[number,number]=[25,60];
const shiftAt=new Map<string,number>();
let autoShift=true;
const randMs=([a,b]:[number,number])=>(a+Math.random()*(b-a))*1000;
const workSeatOf=(name:string)=>[...seats,...reviewZone].find(s=>s.occupied&&s.cast.name===name);
function updateShifts(now:number){
  if(!autoShift)return;
  for(const [name,entry] of idlers){
    // Stagger the first switch so the whole office does not leave at once.
    if(!shiftAt.has(name)){shiftAt.set(name,now+randMs(WORK_SECONDS)*Math.random());continue}
    if(now<shiftAt.get(name)!)continue;
    const seat=workSeatOf(name);
    if(seat){
      goIdle(seat);
      shiftAt.set(name,now+(entry.agent.active?randMs(BREAK_SECONDS):rand(5,10)*1000));
    }else if(entry.agent.active){
      backToWork(name);
      shiftAt.set(name,now+(entry.agent.active?rand(5,10)*1000:randMs(WORK_SECONDS)));
    }else shiftAt.set(name,now+randMs(WORK_SECONDS));
  }
}
const shiftButton=document.createElement('button');
const paintShift=()=>{shiftButton.textContent=autoShift?'Tự động làm ↔ nghỉ: BẬT':'Tự động làm ↔ nghỉ: TẮT';shiftButton.classList.toggle('on',autoShift)};
shiftButton.onclick=()=>{autoShift=!autoShift;shiftAt.clear();paintShift();if(autoShift&&live){live=false;paintLive()}};
paintShift();idleBar.appendChild(shiftButton);
Object.assign((window as unknown as {__test:object}).__test,{updateShifts});

// LIVE: poll /state.json (the agents-live JSON written by the other system, path in studio.config.json) and
// put each mapped character at work or on a break. Turning it on stops the random auto shift.
const liveMapper=new LiveMapper();
let live=false,liveCasts=new Map<string,LiveCast>(),liveInfo='';
const liveTry=new Map<string,number>();
async function pollLive(){
  if(!live)return;
  let pollMs=1000;
  try{
    const file:LiveFile&{pollMs?:number;file?:string}=await (await fetch('/state.json',{cache:'no-store'})).json();
    pollMs=file.pollMs??pollMs;
    if(file.missing){liveInfo=`chưa có file: ${file.file}`;liveCasts=new Map()}
    else{liveCasts=liveMapper.map(file);liveInfo=`${(file.agents??[]).length} agent · ${file.updatedAt??''}`}
  }catch{liveInfo='JSON lỗi/đang ghi — giữ trạng thái cũ'}
  applyLive(performance.now());
  setTimeout(pollLive,pollMs);
}
function applyLive(now:number){
  for(const name of idlers.keys()){
    const want=liveCasts.has(name),seat=workSeatOf(name);
    if(want&&!seat)backToWork(name);
    else if(!want&&seat&&now-(liveTry.get(name)??0)>5000){liveTry.set(name,now);goIdle(seat)}
  }
}
const liveButton=document.createElement('button');
const paintLive=()=>{liveButton.textContent=live?'LIVE (đọc file JSON): BẬT':'LIVE (đọc file JSON): TẮT';liveButton.classList.toggle('on',live)};
liveButton.onclick=()=>{
  live=!live;paintLive();
  if(live){autoShift=false;shiftAt.clear();paintShift();liveTry.clear();pollLive()}
};
paintLive();idleBar.appendChild(liveButton);
if(new URLSearchParams(location.search).has('live')||document.body.dataset.studio!==undefined)liveButton.click();

// ── Character info card ────────────────────────────────────────────────────────────────────────────
const WORK_TEXT:Record<string,string>={
  type:'Đang gõ code',type_fast:'Gõ code thật nhanh',type_super:'Gõ siêu tốc 🔥',talk_left:'Trao đổi với đồng nghiệp',
  talk_right:'Trao đổi với đồng nghiệp',swivel_left:'Xoay ghế nghĩ cách giải',swivel_right:'Xoay ghế nghĩ cách giải',
  read:'Đọc code / tài liệu',bug_hunt:'Săn bug 🔍',merge_rush:'Merge Rush — gom code cả đội ⚡',idea_storm:'Idea Storm — lên roadmap 💡',
  color_burst:'Color Burst — chốt bản thiết kế 🎨',roast:'Mắng dev vì sai spec 📢',root_cause:'Truy tìm root cause 🧵',
  note:'Ghi chú',approve:'Duyệt xong ✓',sip_tea:'Nhâm nhi đồ uống',hair_tuck:'Nghỉ tay một chút',
};
const BREAK_TEXT:[RegExp,string][]=[[/brew/,'Pha cà phê ☕'],[/stand_drink/,'Uống cà phê'],[/chair_.*drink/,'Uống cà phê bên bàn'],
  [/talk/,'Tán gẫu với đồng nghiệp'],[/sit_relax/,'Thư giãn trên sofa'],[/sit_drink/,'Uống cacao nóng'],[/phone/,'Lướt điện thoại'],
  [/laugh/,'Cười đùa'],[/doze/,'Ngủ gật 💤'],[/sit_back/,'Ngắm cảnh'],[/read/,'Đọc sách'],[/search/,'Tìm sách trên kệ'],
  [/sleep/,'Ngủ trưa 💤'],[/walk|look|peek|down|up/,'Đi dạo']];
const ZONE_TEXT:Record<string,string>={cafe:'Cafe',lounge:'Lounge',library:'Góc riêng'};
const stateSince=new Map<string,{key:string;at:number}>();
function readInfo(name:string):CharacterInfo|null{
  const seat=workSeatOf(name) as (Seat|ReviewSeat|undefined),entry=idlers.get(name);
  const agents=liveCasts.get(name)?.agents??[];
  let info:CharacterInfo|null=null;
  if(seat){
    const head=seat instanceof ReviewSeat?seat.st.head:150;
    info={name,working:true,activity:WORK_TEXT[seat.action]??'Đang làm việc',place:'Chỗ làm việc',sinceMs:0,agents,live,x:seat.root.x,y:seat.root.y,head};
  }else if(entry?.agent.active){
    const a=entry.agent,pose=a.pose;
    info={name,working:false,activity:BREAK_TEXT.find(([r])=>r.test(pose))?.[1]??'Đang nghỉ',place:ZONE_TEXT[a.slot?.zone??'']??'Khu nghỉ',
      sinceMs:0,agents,live,x:a.root.x,y:a.root.y,head:Math.max(60,a.head)};
  }
  if(!info)return null;
  const key=info.working?'work':'break',prev=stateSince.get(name);
  if(!prev||prev.key!==key)stateSince.set(name,{key,at:performance.now()});
  info.sinceMs=performance.now()-stateSince.get(name)!.at;
  return info;
}
const panel=new InfoPanel(document.getElementById('world')!,app.canvas,readInfo);
panel.onToggle=name=>{const s=workSeatOf(name);if(s)goIdle(s);else backToWork(name);setTimeout(()=>panel.render(),350)};
// Selection ring under the chosen character's feet.
const ring=new Graphics();ring.visible=false;layer.addChild(ring);
onCharacterTap=name=>{if(panel.current===name)panel.close();else panel.open(name)};
// Name tags over every character (studio page): name on a dark pill with the role colour.
const tagLayer=new Container();tagLayer.zIndex=1e7;layer.addChild(tagLayer);
const tags=new Map<string,Container>();
let showTags=document.body.dataset.studio!==undefined;
for(const name of idlers.keys()){
  const c=new Container(),color=PROFILE_COLORS[name]??'#5fd0ff';
  const label=new Text({resolution:3,text:name[0].toUpperCase()+name.slice(1),style:{fontFamily:'ui-monospace,Menlo,Consolas,monospace',fontSize:11,fontWeight:'800',fill:'#ffffff'}});
  label.anchor.set(.5);
  const w=label.width+12;
  c.addChild(new Graphics().roundRect(-w/2,-9,w,18,3).fill({color:'#0b1322',alpha:0.88}).stroke({color,width:1.5}),label);
  c.eventMode='static';c.cursor='pointer';c.on('pointertap',()=>onCharacterTap(name));
  tags.set(name,c);tagLayer.addChild(c);
}
function updateTags(){
  tagLayer.visible=showTags;if(!showTags)return;
  for(const [name,c] of tags){
    const info=readInfo(name);c.visible=!!info&&(info.working||(idlers.get(name)?.agent.root.alpha??0)>0.6);
    if(info)c.position.set(Math.round(info.x),Math.round(info.y-info.head-12));
  }
}
// API for the studio dashboard (src/dashboard.ts).
Object.assign(window,{__studio:{
  readInfo,open:(name:string)=>onCharacterTap(name),names:[...idlers.keys()],
  liveCasts:()=>liveCasts,setTags:(v:boolean)=>{showTags=v},
}});
let panelClock=0;
app.ticker.add(ticker=>{
  updateTags();
  for(const name of idlers.keys())readInfo(name);       // keep "since" timers ticking for every character
  ring.visible=!!panel.current;
  if(!panel.current)return;
  const info=readInfo(panel.current);if(!info){panel.close();return}
  const color=Number.parseInt((PROFILE_COLORS[panel.current]??'#5fd0ff').slice(1),16),pulse=0.55+0.25*Math.sin(performance.now()/220);
  ring.clear().ellipse(info.x,info.y-2,34,11).stroke({color,width:3,alpha:pulse}).ellipse(info.x,info.y-2,26,8).fill({color,alpha:0.18});
  ring.zIndex=info.y-0.5;
  if((panelClock+=ticker.deltaMS)>400){panelClock=0;panel.render()}
});

const log=document.getElementById('log')!;
let logClock=0;
app.ticker.add(ticker=>{
  const now=performance.now(),dt=ticker.deltaMS;
  for(const s of seats)s.update(now,dt);
  for(const s of reviewZone)s.update(now,dt);
  idleWorld.update(now,dt);
  updateShifts(now);
  if((logClock+=dt)>250){
    logClock=0;
    log.innerHTML=seats.map(s=>`<div>Ghế ${s.index+1} ${s.occupied?`${s.cast.name} · <b>${s.action}</b><br><small>${s.lean} · ${s.pose}</small>`:'<small>trống</small>'}</div>`).join('')
      +reviewSeats.map(s=>`<div>Review R${s.index+1} ${s.occupied?`${s.cast.name} · <b>${s.action}</b><br><small>${s.pose}</small>`:'<small>trống</small>'}</div>`).join('')
      +(live?`<div><b>LIVE</b> ${liveInfo}<br><small>${[...liveCasts.values()].map(c=>`${c.character}: ${c.agents.map(a=>`${a.agent}${a.task?` (${a.task})`:''}`).join(', ')}`).join(' · ')||'mọi người đang nghỉ'}</small></div>`:'')
      +[['Merge',eveSeat],['Plan',theoSeat],['QA',oracleSeat],['Bug',sherlockSeat],['Relax',pixelSeat]].map(([zone,s])=>{const seat=s as ReviewSeat;return `<div>${zone} ${seat.occupied?`${seat.cast.name} · <b>${seat.action}</b><br><small>${seat.pose}</small>`:'<small>trống</small>'}</div>`}).join('');
  }
});
