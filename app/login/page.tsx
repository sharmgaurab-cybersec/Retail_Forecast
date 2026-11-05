import { authConfig } from '../../lib/email-auth';
import LoginForm from './login-form';
export const dynamic='force-dynamic';
export default function Login(){return <LoginForm enabled={!!authConfig()}/>;}
