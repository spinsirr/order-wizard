import * as oauth from 'oauth4webapi';

// OAuth configuration from environment
const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
const issuer = new URL(import.meta.env.VITE_COGNITO_AUTHORITY);

export const authorizationServer: oauth.AuthorizationServer = {
  issuer: issuer.href,
  authorization_endpoint: `${cognitoDomain}/oauth2/authorize`,
  token_endpoint: `${cognitoDomain}/oauth2/token`,
  end_session_endpoint: `${cognitoDomain}/logout`,
};

export const oauthClient: oauth.Client = {
  client_id: clientId,
  token_endpoint_auth_method: 'none',
};

export function buildAuthorizationUrl(codeChallenge: string): URL {
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl = new URL(authorizationServer.authorization_endpoint as string);

  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'openid email');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('prompt', 'login');

  return authUrl;
}

export function buildLogoutUrl(): string {
  const redirectUri = chrome.identity.getRedirectURL();
  return `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(redirectUri)}`;
}
