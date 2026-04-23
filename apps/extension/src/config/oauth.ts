import type * as oauth from 'oauth4webapi';
import { cognitoAuthority, cognitoClientId, cognitoDomain } from './env';

// Tolerate missing env at module load so the side panel still boots without OAuth
// configured. Real sign-in paths call assertOAuthConfigured() and surface a clear error.
function assertOAuthConfigured(): void {
  if (!cognitoAuthority || !cognitoClientId || !cognitoDomain) {
    throw new Error(
      'OAuth is not configured. Set VITE_COGNITO_AUTHORITY, VITE_COGNITO_CLIENT_ID, and VITE_COGNITO_DOMAIN in apps/extension/.env.',
    );
  }
}

export const authorizationServer: oauth.AuthorizationServer = {
  issuer: cognitoAuthority ?? '',
  authorization_endpoint: cognitoDomain ? `${cognitoDomain}/oauth2/authorize` : '',
  token_endpoint: cognitoDomain ? `${cognitoDomain}/oauth2/token` : '',
  end_session_endpoint: cognitoDomain ? `${cognitoDomain}/logout` : '',
};

export const oauthClient: oauth.Client = {
  client_id: cognitoClientId ?? '',
  token_endpoint_auth_method: 'none',
};

export function buildAuthorizationUrl(codeChallenge: string): URL {
  assertOAuthConfigured();
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl = new URL(authorizationServer.authorization_endpoint as string);

  authUrl.searchParams.set('client_id', cognitoClientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'openid email');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('prompt', 'login');

  return authUrl;
}

export function buildLogoutUrl(): string {
  assertOAuthConfigured();
  const redirectUri = chrome.identity.getRedirectURL();
  return `${cognitoDomain}/logout?client_id=${cognitoClientId}&logout_uri=${encodeURIComponent(redirectUri)}`;
}
