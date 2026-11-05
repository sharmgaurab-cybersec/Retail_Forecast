import { cookies } from 'next/headers';
import { authReply,authRequest,SESSION_COOKIE } from '../../../../lib/email-auth';
export async function POST(request:Request){
 if(request.headers.get('Origin')!==new URL(request.url).origin)return authReply({error:'Request origin rejected.'},403);
 const token=(await cookies()).get(SESSION_COOKIE)?.value;
 if(token)try{await authRequest('/logout',{},token);}catch{}
 const response=authReply({ok:true});response.headers.append('Set-Cookie',`${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);return response;
}
