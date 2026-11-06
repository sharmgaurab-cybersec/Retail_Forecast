import { authConfig, authReply } from '../../../lib/email-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  return authReply({ enabled: !!authConfig() });
}
