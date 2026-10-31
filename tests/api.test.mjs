import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';

function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});s.on('error',reject);});}

test('API, auth, seeded content, persistence, and static web assets',async t=>{
 const port=await freePort();
 const proc=spawn(process.execPath,['server.mjs'],{cwd:new URL('../',import.meta.url).pathname,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 let stderr='';proc.stderr.on('data',d=>stderr+=d);
 t.after(async()=>{proc.kill('SIGTERM');await new Promise(resolve=>proc.once('close',resolve));});
 const origin=`http://127.0.0.1:${port}`;
 let ready=false;
 for(let i=0;i<200;i++){try{const resp=await fetch(origin+'/health');if(resp.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,50));}
 assert.ok(ready,`Server did not start: ${stderr}`);
 const call=async(path,method='GET',body,token)=>{const r=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,json:await r.json(),headers:r.headers};};
 const catalog=await call('/api/catalog');assert.equal(catalog.status,200);assert.equal(catalog.json.exercises.length,12);assert.equal(catalog.json.plans.length,3);assert.ok(catalog.json.plans.every(x=>x.meals.length===4));assert.equal(catalog.json.exercises[0].steps.length,4);
 const config=await call('/api/config');assert.equal(config.status,200);assert.equal(config.json.googleClientId,null);assert.equal(config.json.chatEnabled,false);
 const user={name:'Test Athlete',email:'test@example.com',password:'long-enough-pass123',age:27,goal:'strength',level:'intermediate',diet_pref:'vegetarian'};
 const register=await call('/api/register','POST',user);assert.equal(register.status,201);assert.ok(register.json.token);assert.equal(register.json.user.level,'intermediate');assert.ok(!('password_hash' in register.json.user));
 const token=register.json.token;
 assert.equal((await call('/api/me')).status,401);
 assert.equal((await call('/api/me','GET',null,token)).json.user.name,'Test Athlete');
 assert.equal((await call('/api/stats?today=2026-10-27','GET',null,token)).json.current_streak,0);
 assert.equal((await call('/api/stats')).status,401);
 assert.equal((await call('/api/auth/google','POST',{credential:'test'})).status,503);
 assert.equal((await call('/api/chat','POST',{message:'Hello'},token)).status,503);
 const duplicate=await call('/api/register','POST',user);assert.equal(duplicate.status,409);
 const badLogin=await call('/api/login','POST',{email:user.email,password:'bad-password'});assert.equal(badLogin.status,401);
 const login=await call('/api/login','POST',{email:user.email,password:user.password});assert.equal(login.status,200);
 const invalidAge=await call('/api/me','PATCH',{age:9},token);assert.equal(invalidAge.status,400);
 const edit=await call('/api/me','PATCH',{level:'advanced',diet_pref:'high-protein',name:'Alex Example'},token);assert.equal(edit.status,200);assert.equal(edit.json.user.diet_pref,'high-protein');
 const date='2026-10-27';let result=await call('/api/logs','POST',{exerciseId:'wall-pushup',date},token);assert.equal(result.status,200);assert.equal(result.json.logs.length,1);
 await call('/api/logs','POST',{exerciseId:'wall-pushup',date:'2026-10-26'},token);
 const streak=await call('/api/stats?today='+date,'GET',null,token);assert.equal(streak.json.current_streak,2);assert.equal(streak.json.longest_streak,2);assert.equal(streak.json.active_days,2);
 result=await call('/api/logs','POST',{exerciseId:'wall-pushup',date},token);assert.equal(result.json.logs.length,1);
 assert.equal((await call('/api/logs?date='+date,'GET',null,token)).json.logs.length,1);
 assert.equal((await call('/api/logs/wall-pushup?date='+date,'DELETE',null,token)).status,200);
 assert.equal((await call('/api/logs?date='+date,'GET',null,token)).json.logs.length,0);
 const html=await fetch(origin+'/');assert.equal(html.status,200);assert.match(await html.text(),/FitPath/);assert.match(html.headers.get('content-security-policy'),/style-src 'self' 'unsafe-inline' https:\/\/accounts\.google\.com/);
 for(const path of ['/privacy.html','/terms.html','/disclaimer.html']){const page=await fetch(origin+path);const body=await page.text();assert.equal(page.status,200);assert.match(body,/Last updated: October 31, 2026/);assert.match(body,/privacy@example\.test/);}
 const manifest=await fetch(origin+'/manifest.webmanifest');assert.equal(manifest.status,200);assert.equal((await manifest.json()).display,'standalone');
 const sw=await fetch(origin+'/service-worker.js');assert.equal(sw.status,200);
 const icon=await fetch(origin+'/icons/icon-512.png');assert.equal(icon.status,200);assert.equal(icon.headers.get('content-type'),'image/png');
 const stop=await call('/api/logout','POST',null,token);assert.equal(stop.status,200);assert.equal((await call('/api/me','GET',null,token)).status,401);
});
