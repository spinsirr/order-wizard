import * as oauth from 'oauth4webapi';
import { apiBaseUrl, cognitoAuthority, cognitoClientId, cognitoDomain } from './env';

// Tolerate missing env at module load so the side panel still boots without OAuth
// configured. Real sign-in paths call assertOAuthConfigured() and surface a clear error.
function assertOAuthConfigured(): void {
  if (!apiBaseUrl || !cognitoAuthority || !cognitoClientId || !cognitoDomain) {
    throw new Error(
      'OAuth is not configured. Set VITE_API_BASE_URL, VITE_COGNITO_AUTHORITY, VITE_COGNITO_CLIENT_ID, and VITE_COGNITO_DOMAIN in apps/extension/.env.',
    );
  }
}

export const authorizationServer: oauth.AuthorizationServer = {
  issuer: cognitoAuthority ?? '',
  authorization_endpoint: cognitoDomain ? `${cognitoDomain}/oauth2/authorize` : '',
  token_endpoint: cognitoDomain ? `${cognitoDomain}/oauth2/token` : '',
  revocation_endpoint: cognitoDomain ? `${cognitoDomain}/oauth2/revoke` : '',
  end_session_endpoint: cognitoDomain ? `${cognitoDomain}/logout` : '',
};

export const oauthClient: oauth.Client = {
  client_id: cognitoClientId ?? '',
  token_endpoint_auth_method: 'none',
};

interface AuthorizationUrlInput {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  resourceUri: string;
  codeChallenge: string;
  state: string;
}

export function createAuthorizationUrl(input: AuthorizationUrlInput): URL {
  const resourceUri = input.resourceUri.replace(/\/$/, '');
  const authUrl = new URL(input.authorizationEndpoint);

  authUrl.searchParams.set('client_id', input.clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', input.redirectUri);
  authUrl.searchParams.set(
    'scope',
    [
      'openid',
      'email',
      `${resourceUri}/orders.read`,
      `${resourceUri}/orders.sync`,
      `${resourceUri}/orders.status.write`,
      `${resourceUri}/orders.note.write`,
    ].join(' '),
  );
  authUrl.searchParams.set('resource', resourceUri);
  authUrl.searchParams.set('state', input.state);
  authUrl.searchParams.set('code_challenge', input.codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  return authUrl;
}

export function buildAuthorizationUrl(codeChallenge: string, state: string): URL {
  assertOAuthConfigured();
  return createAuthorizationUrl({
    authorizationEndpoint: authorizationServer.authorization_endpoint as string,
    clientId: cognitoClientId,
    redirectUri: chrome.identity.getRedirectURL(),
    resourceUri: apiBaseUrl,
    codeChallenge,
    state,
  });
}

export function buildLogoutUrl(): string {
  assertOAuthConfigured();
  const redirectUri = chrome.identity.getRedirectURL();
  return `${cognitoDomain}/logout?client_id=${cognitoClientId}&logout_uri=${encodeURIComponent(redirectUri)}`;
}

export async function revokeRefreshToken(
  refreshToken: string,
  server: oauth.AuthorizationServer = authorizationServer,
  client: oauth.Client = oauthClient,
): Promise<void> {
  const response = await oauth.revocationRequest(server, client, oauth.None(), refreshToken, {
    additionalParameters: { token_type_hint: 'refresh_token' },
  });
  await oauth.processRevocationResponse(response);
}
