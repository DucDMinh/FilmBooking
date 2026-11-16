const api='http://localhost:3001';
const movies=await (await fetch(api+'/movies?status=now_showing')).json().catch(()=>[]);
const list=Array.isArray(movies)?movies:(movies.items??[]);
const m=list.find(x=>x.availability==='now_showing')??list[0];
console.log('movie',m?.slug,m?.availability,'total',list.length);
const vn=d=>new Date(d.getTime()+7*3600e3).toISOString().slice(0,10);
const now=new Date();
const noDate=await (await fetch(`${api}/movies/${m.slug}`)).json();
const cnt=s=>s.reduce((n,g)=>n+g.showtimes.length,0);
console.log('API không ?date: showtimes =',cnt(noDate.schedule),'ngày:',[...new Set(noDate.schedule.flatMap(g=>g.showtimes.map(s=>vn(new Date(s.startsAt)))))]);
for(let i=0;i<7;i++){const d=vn(new Date(now.getTime()+i*864e5));const r=await (await fetch(`${api}/movies/${m.slug}?date=${d}`)).json();console.log(d,'API theo ngày =',cnt(r.schedule),'| UI (lọc client trên dữ liệu không ?date) =',noDate.schedule.reduce((n,g)=>n+g.showtimes.filter(s=>vn(new Date(s.startsAt))===d).length,0));}
