// Character info card: click a character → a pixel-styled card next to it with name, role, area, what it is
// doing right now (work action or break activity), and the live agents/tasks mapped to it. Pure DOM over the
// canvas; the scene feeds it a snapshot through `CharacterInfo` and re-renders it while open.

export type InfoAgent={agent:string;role?:string;task?:string|null;title?:string|null;since?:string};
export type CharacterInfo={
  name:string;working:boolean;activity:string;place:string;sinceMs:number;
  agents:InfoAgent[];live:boolean;
  // world position of the character's feet (canvas pixels), used to anchor the card
  x:number;y:number;head:number;
};

type Profile={display:string;role:string;team:string;color:string;bio:string};
export const PROFILES:Record<string,Profile>={
  nova:{display:'Nova',role:'Builder',team:'Khu Coding',color:'#5fd0ff',bio:'Dev chủ lực, tóc cobalt, headset cyan.'},
  orion:{display:'Orion',role:'Builder',team:'Khu Coding',color:'#5fd0ff',bio:'Điềm tĩnh, gõ phím đều như máy.'},
  lyra:{display:'Lyra',role:'Builder',team:'Khu Coding',color:'#5fd0ff',bio:'Đuôi ngựa xanh royal, kẹp sao.'},
  vega:{display:'Vega',role:'Builder',team:'Khu Coding',color:'#5fd0ff',bio:'Trẻ, nhanh, tóc xanh băng.'},
  atlas:{display:'Atlas',role:'Builder',team:'Khu Coding',color:'#5fd0ff',bio:'Thân thiện, thực tế, tóc teal.'},
  comet:{display:'Comet',role:'Builder',team:'Khu Coding',color:'#5fd0ff',bio:'Nghệ sĩ streetwear, mũ len tím.'},
  sage:{display:'Sage',role:'Reviewer',team:'Khu Review',color:'#c28aff',bio:'Thanh lịch, khó tính, soi từng dòng.'},
  iris:{display:'Iris',role:'Reviewer',team:'Khu Review',color:'#ff8fb3',bio:'Vui vẻ, tạo không khí cho team.'},
  juno:{display:'Juno',role:'Reviewer',team:'Khu Review',color:'#8ec5ee',bio:'Dịu dàng, tỉ mỉ, mọt sách.'},
  echo:{display:'Echo',role:'Reviewer',team:'Khu Review',color:'#5fe3b8',bio:'Trầm lặng, săn bug im lặng.'},
  eve:{display:'Eve',role:'Merger · Trưởng nhóm',team:'Trạm Merge',color:'#7fe9ff',bio:'Gom code của cả đội và merge.'},
  theo:{display:'Theo',role:'Planner · Dispatcher',team:'Bàn Plan',color:'#ffb35c',bio:'Biến ý tưởng thành roadmap.'},
  oracle:{display:'Oracle',role:'Spec Validator · QA',team:'Bàn Plan',color:'#ff5a6e',bio:'Kiểm spec, mắng dev khi sai luật.'},
  pixel:{display:'Pixel',role:'Designer',team:'Khu Relax',color:'#ff8fd0',bio:'UI / art, luôn cầm bảng vẽ.'},
  sherlock:{display:'Sherlock',role:'Error Analyzer',team:'Góc Review',color:'#ff8a3d',bio:'Thám tử truy root cause.'},
};

const CSS=`
#char-card{position:absolute;z-index:20;width:280px;background:#101a2e;color:#d8e6ff;border:2px solid var(--cc);
  box-shadow:0 0 0 2px #060b16,0 10px 30px rgba(0,0,0,.55),0 0 18px color-mix(in srgb,var(--cc) 35%,transparent);
  font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;image-rendering:pixelated;pointer-events:auto}
#char-card.show{animation:card-pop .18s ease-out}
@keyframes card-pop{from{transform:translateY(6px) scale(.97)}to{transform:none}}
#char-card .hd{display:flex;gap:10px;padding:10px;background:linear-gradient(180deg,color-mix(in srgb,var(--cc) 22%,#101a2e),#101a2e)}
#char-card .av{width:64px;height:64px;flex:none;border:2px solid var(--cc);background:#0b1322 no-repeat 50% 14%/135% auto;
  box-shadow:inset 0 0 0 2px #060b16}
#char-card .nm{font-size:17px;font-weight:800;letter-spacing:.5px;color:#fff;text-shadow:2px 2px 0 #060b16}
#char-card .rl{display:inline-block;margin-top:3px;padding:1px 7px;background:var(--cc);color:#06121f;font-weight:800;font-size:11px}
#char-card .tm{color:#8ea3c7;font-size:11px;margin-top:3px}
#char-card .x{margin-left:auto;align-self:flex-start;background:none;border:1px solid #33496f;color:#8ea3c7;cursor:pointer;
  font:inherit;line-height:1;padding:2px 6px}
#char-card .x:hover{color:#fff;border-color:var(--cc)}
#char-card .bd{padding:8px 10px 10px;border-top:2px dashed #22324f}
#char-card .st{display:flex;align-items:center;gap:6px;font-weight:800}
#char-card .dot{width:9px;height:9px;background:#5fe3b8;box-shadow:0 0 6px #5fe3b8}
#char-card .dot.idle{background:#ffb35c;box-shadow:0 0 6px #ffb35c}
#char-card .act{margin:6px 0 2px;padding:6px 8px;background:#0b1322;border-left:3px solid var(--cc)}
#char-card .act b{color:#fff}
#char-card .meta{color:#8ea3c7;font-size:11px}
#char-card .ag{margin-top:8px}
#char-card .ag h4{margin:0 0 4px;font-size:11px;color:var(--cc);letter-spacing:1px}
#char-card .ag .it{padding:5px 7px;margin-bottom:4px;background:#16223a;border:1px solid #22324f}
#char-card .ag .id{color:#fff;font-weight:800}
#char-card .ag .tk{color:#ffd84d}
#char-card .ag .tt{color:#d8e6ff}
#char-card .bio{margin-top:8px;color:#8ea3c7;font-style:italic}
#char-card .ft{display:flex;gap:6px;margin-top:9px}
#char-card .ft button{flex:1;background:#22324f;color:#d8e6ff;border:1px solid #33496f;padding:5px;font:inherit;cursor:pointer}
#char-card .ft button:hover{border-color:var(--cc);color:#fff}
#char-card .tail{position:absolute;width:12px;height:12px;background:#101a2e;border:2px solid var(--cc);border-top:none;border-left:none}
`;

const esc=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
const ago=(ms:number)=>{const s=Math.max(0,Math.round(ms/1000));return s<60?`${s} giây`:s<3600?`${Math.floor(s/60)} phút ${s%60} giây`:`${Math.floor(s/3600)} giờ ${Math.floor(s%3600/60)} phút`};

export class InfoPanel{
  el=document.createElement('div');
  current:string|null=null;
  onToggle:((name:string)=>void)|null=null;
  constructor(public host:HTMLElement,public canvas:HTMLCanvasElement,public read:(name:string)=>CharacterInfo|null){
    const style=document.createElement('style');style.textContent=CSS;document.head.appendChild(style);
    this.el.id='char-card';this.el.style.display='none';
    host.style.position='relative';host.appendChild(this.el);
    this.el.addEventListener('click',e=>{
      const t=(e.target as HTMLElement).closest('button');if(!t)return;
      if(t.dataset.act==='close')this.close();
      if(t.dataset.act==='toggle'&&this.current)this.onToggle?.(this.current);
      e.stopPropagation();
    });
    addEventListener('keydown',e=>{if(e.key==='Escape')this.close()});
  }
  open(name:string){
    this.current=name;this.el.style.display='block';
    this.el.classList.remove('show');this.render();void this.el.offsetWidth;this.el.classList.add('show');
  }
  close(){this.current=null;this.el.classList.remove('show');this.el.style.display='none'}
  render(){
    if(!this.current)return;
    const info=this.read(this.current),p=PROFILES[this.current];
    if(!info||!p){this.close();return}
    this.el.style.setProperty('--cc',p.color);
    const agents=info.agents.map(a=>`<div class="it"><span class="id">${esc(a.agent)}</span>${a.role?` <span class="meta">· ${esc(a.role)}</span>`:''}
      ${a.task?`<div class="tk">▸ ${esc(a.task)}</div>`:''}${a.title?`<div class="tt">${esc(a.title)}</div>`:''}
      ${a.since?`<div class="meta">từ ${esc(ago(Date.now()-Date.parse(a.since)))} trước</div>`:''}</div>`).join('');
    this.el.innerHTML=`<div class="hd"><div class="av" style="background-image:url(/assets/${this.current}/idle/stand_drink.png)"></div>
      <div><div class="nm">${p.display}</div><div class="rl">${esc(p.role)}</div><div class="tm">📍 ${esc(p.team)}</div></div>
      <button class="x" data-act="close" title="Đóng (Esc)">✕</button></div>
      <div class="bd">
        <div class="st"><span class="dot ${info.working?'':'idle'}"></span>${info.working?'ĐANG LÀM VIỆC':'ĐANG NGHỈ'}</div>
        <div class="act"><b>${esc(info.activity)}</b><div class="meta">${esc(info.place)} · ${ago(info.sinceMs)}</div></div>
        ${info.live?`<div class="ag"><h4>AGENT TỪ FILE JSON</h4>${agents||`<div class="meta">${info.working?'Không còn agent nào — sắp đi nghỉ':'Không có agent nào → đang nghỉ'}</div>`}</div>`:''}
        <div class="bio">“${esc(p.bio)}”</div>
        ${info.live?'':`<div class="ft"><button data-act="toggle">${info.working?'☕ Cho nghỉ':'💻 Về làm việc'}</button></div>`}
      </div><div class="tail"></div>`;
    this.place(info);
  }
  // Anchor next to the character: to its right, or to its left near the right edge; clamped inside the canvas.
  place(info:CharacterInfo){
    const r=this.canvas.getBoundingClientRect(),h=this.host.getBoundingClientRect();
    const k=r.width/this.canvas.width,cx=r.left-h.left+info.x*k,cy=r.top-h.top+(info.y-info.head*0.6)*k;
    const w=this.el.offsetWidth,ht=this.el.offsetHeight,right=cx+50*k+w<r.right-h.left;
    const left=right?cx+42*k:cx-42*k-w,top=Math.min(Math.max(cy-ht/2,r.top-h.top+4),r.bottom-h.top-ht-4);
    this.el.style.left=`${Math.max(r.left-h.left+4,left)}px`;this.el.style.top=`${top}px`;
    const tail=this.el.querySelector<HTMLElement>('.tail')!;
    tail.style.top=`${Math.min(Math.max(cy-top-6,14),ht-26)}px`;
    if(right){tail.style.left='-8px';tail.style.right='';tail.style.transform='rotate(135deg)'}
    else{tail.style.right='-8px';tail.style.left='';tail.style.transform='rotate(-45deg)'}
  }
}
