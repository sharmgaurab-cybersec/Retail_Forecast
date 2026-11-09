import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import worker from '../cloudflare/worker.mjs';

const sql = new DatabaseSync(':memory:');
for (const file of ['0000_wakeful_calypso','0001_tired_mentor','0002_dear_living_tribunal']) sql.exec(await readFile(`drizzle/${file}.sql`,'utf8'));
const DB = { prepare(query) { const stmt=sql.prepare(query); let args=[]; const api={bind(...v){args=v;return api},async run(){const r=stmt.run(...args);return {meta:{changes:Number(r.changes)}}}};return api } };
const env={DB,SUPABASE_URL:'https://testproject.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',ASSETS:{async fetch(){return new Response('not found',{status:404})}}};
const userId='11111111-1111-4111-8111-111111111111';
const oldFetch=globalThis.fetch; let savedPayload, savedHeaders;
globalThis.fetch=async(url,init)=>{
  const parsed=new URL(url);
  if(parsed.pathname.endsWith('/token')) {
    const payload=JSON.parse(init.body);
    if(payload.email==='reborngamming1@gmail.com' && payload.password==='test-password') return Response.json({access_token:'verified-token',expires_in:3600});
    return Response.json({error:'invalid_grant'},{status:400});
  }
  if(parsed.pathname.endsWith('/user')) {
    if(init.headers.Authorization==='Bearer verified-token') return Response.json({id:userId,email:'reborngamming1@gmail.com',email_confirmed_at:'2026-10-01'});
    if(init.headers.Authorization==='Bearer other-user-token') return Response.json({id:userId,email:'other@example.com',email_confirmed_at:'2026-10-01'});
    return Response.json({error:'invalid'},{status:401});
  }
  if(parsed.pathname==='/rest/v1/forecast_runs'){savedPayload=JSON.parse(init.body);savedHeaders=init.headers;return new Response(null,{status:201});}
  return Response.json({});
};
function request(path,method='GET',data,token,origin='https://coles.test') {return new Request('https://coles.test'+path,{method,headers:{Origin:origin,...(data?{'Content-Type':'application/json'}:{}),...(token?{Cookie:'__Host-coles-forecast-session='+token}:{})},...(data?{body:JSON.stringify(data)}:{})});}
try {
  let r=await worker.fetch(request('/api/session'),env);assert.deepEqual(await r.json(),{enabled:true,signedIn:false});
  r=await worker.fetch(request('/api/session','GET',undefined,'verified-token'),env);assert.deepEqual(await r.json(),{enabled:true,signedIn:true,email:'reborngamming1@gmail.com'});
  r=await worker.fetch(request('/api/session','GET',undefined,'other-user-token'),env);assert.deepEqual(await r.json(),{enabled:true,signedIn:false});
  const row={suburb:'Parramatta',drink_type:'Soft drinks',product:'Coca-Cola Original Taste',horizon_days:1,visitors_days:30,source:'csv',order_recommendation:120,daily:[{date:'2026-11-07',sales:90,visitors:3400,weather:{max:29,rain:0},holiday:null}]};
  r=await worker.fetch(request('/api/forecast-runs','POST',row),env);assert.equal(r.status,401);
  r=await worker.fetch(request('/api/auth/sign-in','POST',{email:'other@example.com',password:'test-password'}),env);assert.equal(r.status,403);
  r=await worker.fetch(request('/api/auth/sign-in','POST',{email:'reborngamming1@gmail.com',password:'wrong'}),env);assert.equal(r.status,401);
  r=await worker.fetch(request('/api/auth/sign-in','POST',{email:'reborngamming1@gmail.com',password:'test-password'}),env);assert.equal(r.status,200);assert.match(r.headers.get('Set-Cookie'),/HttpOnly/);
  r=await worker.fetch(request('/api/auth/request-code','POST',{email:'reborngamming1@gmail.com'}),env);assert.equal(r.status,404);
  r=await worker.fetch(request('/api/forecast-runs','POST',row,'verified-token'),env);assert.equal(r.status,200);assert.deepEqual(await r.json(),{saved:true});
  assert.equal(savedPayload.suburb,'Parramatta');assert.equal(savedPayload.visitors_days,30);assert.equal(savedPayload.daily_forecast[0].estimated_visitors,3400);assert.equal(savedPayload.order_recommendation,120);assert.equal(savedHeaders.Authorization,'Bearer verified-token');
  r=await worker.fetch(request('/api/forecast-runs','POST',{...row,horizon_days:31},'verified-token'),env);assert.equal(r.status,400);
  r=await worker.fetch(request('/api/forecast-runs','POST',row,'verified-token','https://evil.test'),env);assert.equal(r.status,403);
  r=await worker.fetch(request('/api/forecast-runs','POST',{...row,daily:[{...row.daily[0],visitors:-1}]},'verified-token'),env);assert.equal(r.status,400);
  console.log('PASS: Supabase password sign-in and session verification, forecast save payload, visitor totals, recommendation amount, origin check and input validation.');
} finally { globalThis.fetch=oldFetch;sql.close(); }
