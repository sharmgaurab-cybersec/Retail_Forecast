import { authBody,authConfig,authReply,authRequest,allowAuth } from '../../../../lib/email-auth';
export async function POST(request:Request){
 const b=await authBody(request);if('error' in b)return authReply({error:b.error},b.status);
 if(!authConfig())return authReply({error:'Email sign-in is awaiting setup. You can use ChatGPT sign-in below.'},503);
 try{
 if(!await allowAuth('send:'+b.email,3,15*60000)||!await allowAuth('ip-send:'+(request.headers.get('CF-Connecting-IP')||'unknown'),10,15*60000))return authReply({error:'Please wait before requesting another code.'},429);
 const r=await authRequest('/otp',{email:b.email,create_user:true});
 if(!r.ok)return authReply({error:r.status===429?'Please wait before requesting another code.':'Could not send the code. Check the address or try later.'},r.status===429?429:502);
 return authReply({ok:true});
 }catch{return authReply({error:'Email sign-in is temporarily unavailable.'},503);}
}
