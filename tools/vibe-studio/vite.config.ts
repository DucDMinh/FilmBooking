import {defineConfig,type Plugin} from 'vite';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

// Live state: the page polls /state.json (agents-live JSON written by opencode-project-template's agent-live.mjs)
// and /progress.json (its .context/progress.json: layers, completed/blocked tasks). Paths from studio.config.json
// → "stateFile" / "progressFile" (relative to this project or absolute); env STATE_FILE / PROGRESS_FILE override.
// Read fresh on every request, never cached.
function liveState():Plugin{
  const config=()=>{
    try{return JSON.parse(readFileSync(resolve(__dirname,'studio.config.json'),'utf8'))}catch{return {}}
  };
  const handler=(req:{url?:string},res:{setHeader:(k:string,v:string)=>void;statusCode:number;end:(b:string)=>void},next:()=>void)=>{
    const route=req.url?.split('?')[0];
    if(route!=='/state.json'&&route!=='/progress.json')return next();
    const cfg=config(),file=route==='/state.json'
      ?resolve(__dirname,process.env.STATE_FILE||cfg.stateFile||'.context/agents-live.json')
      :resolve(__dirname,process.env.PROGRESS_FILE||cfg.progressFile||'.context/progress.json');
    res.setHeader('Content-Type','application/json');
    res.setHeader('Cache-Control','no-store');
    // pollMs rides along so the page polls at the configured rate; a half-written file is passed through as is
    // (the page fails to parse it and keeps its last state)
    try{
      const raw=readFileSync(file,'utf8');res.statusCode=200;
      try{res.end(JSON.stringify({...JSON.parse(raw),pollMs:cfg.pollMs}))}catch{res.end(raw)}
    }
    catch{res.statusCode=200;res.end(JSON.stringify({missing:true,file,pollMs:cfg.pollMs}))}
  };
  return {
    name:'live-state',
    configureServer(server){server.middlewares.use(handler)},
    configurePreviewServer(server){server.middlewares.use(handler)},
  };
}

export default defineConfig({
  plugins:[liveState()],
  server: {proxy: {'/api': {target: 'http://localhost:7788', changeOrigin: true}}},
  preview: {proxy: {'/api': {target: 'http://localhost:7788', changeOrigin: true}}},
});
