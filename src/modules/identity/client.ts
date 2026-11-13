import 'server-only';
import { SpursAuth } from '@spurs/auth';
import { env } from '@/env';

export function authClient() {
  return new SpursAuth({
    issuer: env.ACCOUNTS_ISSUER,
    clientId: env.ACCOUNTS_CLIENT_ID,
    clientSecret: env.ACCOUNTS_CLIENT_SECRET,
    redirectUri: new URL('/auth/callback', env.APP_URL).toString(),
    postLogoutRedirectUri: new URL('/signed-out', env.APP_URL).toString(),
    scope: 'openid profile email offline_access',
    storage: 'memory',
  });
}
