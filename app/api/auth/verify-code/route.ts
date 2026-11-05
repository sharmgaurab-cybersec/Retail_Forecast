import { authBody,authConfig,authReply,authRequest,allowAuth,verifySession,SESSION_COOKIE } from '../../../../lib/email-auth';
export async function POST(request:Request){
 const b=await authBody(request);if('error' in b)return authReply({error:b.error},b.status);
 if(typeof b.token!=='string'||!/^\d{6}$/.test(b.token))return authReply({error:'Enter the six-digit code.'},400);
 if(!authConfig())return authReply({error:'Email sign-in is awaiting setup.'},503);
 try{
 if(!await allowAuth('verify:'+b.email,5,10*60000)||!await allowAuth('ip-verify:'+(request.headers.get('CF-Connecting-IP')||'unknown'),20,10*60000))return authReply({error:'Too many attempts. Wait ten minutes and request a new code.'},429);
 const r=await authRequest('/verify',{email:b.email,token:b.token,type:'email'});
 if(!r.ok)return authReply({error:'Code is invalid or expired. Request a new code.'},401);
 const session=await r.json() as {access_token?:string;expires_in?:number};
 if(!session.access_token)return authReply({error:'Verification could not be completed.'},502);
 const user=await verifySession(session.access_token);
 if(!user||user.email.toLowerCase()!==b.email)return authReply({error:'Verification could not be completed.'},401);
 const response=authReply({ok:true});
 const age=Math.max(1,Math.min(3600,Number(session.expires_in)||3600));
 response.headers.append('Set-Cookie',`${SESSION_COOKIE}=${encodeURIComponent(session.access_token)}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`);
 return response;
 }catch{return authReply({error:'Email verification is temporarily unavailable.'},503);}
}
