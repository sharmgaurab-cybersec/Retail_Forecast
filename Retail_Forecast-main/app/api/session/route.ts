import { authConfig, authReply, getUser } from '../../../lib/email-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getUser();
  return authReply({ enabled: !!authConfig(), signedIn: !!user, ...(user ? { email: user.email } : {}) });
}
