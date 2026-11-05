import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { getChatGPTUser } from '../app/chatgpt-auth';
export const SESSION_COOKIE='__Host-coles-forecast-session';
export function authConfig(){
 try {const u=new URL(env.SUPABASE_URL||'');const key=env.SUPABASE_PUBLISHABLE_KEY;
 if(u.protocol!=='https:'||!/^([a-z0-9-]+)\.supabase\.co$/.test(u.hostname)||u.port||u.username||u.password||u.search||u.hash||u.pathname!=='/'||!key)return null;
 return {url:u.origin,key};}catch{return null;}
}
export async function authRequest(path:'/otp'|'/verify'|'/user'|'/logout',body?:unknown,token?:string){
 const c=authConfig();if(!c)throw Error('Email sign-in is awaiting setup.');
 return fetch(c.url+'/auth/v1'+path,{method:body===undefined?'GET':'POST',headers:{apikey:c.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(10000),cache:'no-store'});
}
export function verifiedIdentity(value:any){
 if(!value||typeof value.id!=='string'||!/^[0-9a-f-]{36}$/i.test(value.id)||typeof value.email!=='string'||!value.email_confirmed_at)return null;
 return {userId:'email:'+value.id,email:value.email,displayName:value.email,fullName:null};
}
export async function verifySession(token:string){
 if(!authConfig()||token.length>8192)return null;
 try{const r=await authRequest('/user',undefined,token);return r.ok?verifiedIdentity(await r.json()):null;}catch{return null;}
}
export async function getUser(){const token=(await cookies()).get(SESSION_COOKIE)?.value;
 if(token){const u=await verifySession(token);if(u)return u;}
 return getChatGPTUser();
}
export const authReply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function authBody(request:Request){
 if(request.headers.get('Origin')!==new URL(request.url).origin)return {error:'Request origin rejected.',status:403} as const;
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return {error:'JSON required.',status:415} as const;
 if(Number(request.headers.get('Content-Length')||0)>1024)return {error:'Request too large.',status:413} as const;
 const text=await request.text();if(text.length>1024)return {error:'Request too large.',status:413} as const;
 try{const b=JSON.parse(text);if(!b||typeof b.email!=='string'||b.email.length>254||!/^\S+@[^@\s]+\.[^@\s]+$/.test(b.email))throw Error();return {email:b.email.trim().toLowerCase(),token:b.token};}catch{return {error:'Enter a valid email address.',status:400} as const;}
}
export async function allowAuth(key:string,limit:number,windowMs:number){
 if(!env.DB)return false;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const window=Math.floor(Date.now()/windowMs);
 const r=await env.DB.prepare('INSERT INTO auth_rate_limits (key,window,count) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,count=CASE WHEN auth_rate_limits.window=excluded.window THEN auth_rate_limits.count+1 ELSE 1 END WHERE auth_rate_limits.window!=excluded.window OR auth_rate_limits.count < ?').bind(hash,window,limit).run();
 return !!r.meta.changes;
}
