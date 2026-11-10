// Build a slim static site for hosting (Vercel): vite build of coding-test.html + only the assets it loads.
// Usage: node scripts/build-deploy.mjs  → dist-deploy/ (deploy with: npx vercel deploy dist-deploy --prod)
import {execSync} from 'node:child_process';
import {cpSync,mkdirSync,readdirSync,writeFileSync,existsSync} from 'node:fs';

execSync('npx vite build --config vite.deploy.config.ts',{stdio:'inherit'});
const src='public/assets',dst='dist-deploy/assets';
const copy=p=>{mkdirSync(`${dst}/${p.split('/').slice(0,-1).join('/')}`,{recursive:true});cpSync(`${src}/${p}`,`${dst}/${p}`)};
for(const f of ['environment/office_original.png','environment/review_rail_fg.png','furniture/chair_coding.png','furniture/chair_review.png','fx/fire_aura.png'])copy(f);
// every character pose folder: <name>/<area>/ (coding, review, merge, plan, relax)
for(const name of readdirSync(src))for(const area of ['coding','review','merge','plan','relax','idle'])
  if(existsSync(`${src}/${name}/${area}/manifest.json`))
    for(const f of readdirSync(`${src}/${name}/${area}`))if(f.endsWith('.png')||f==='manifest.json')copy(`${name}/${area}/${f}`);
writeFileSync('dist-deploy/vercel.json',JSON.stringify({rewrites:[{source:'/',destination:'/coding-test.html'}]},null,2));
console.log('dist-deploy ready');
