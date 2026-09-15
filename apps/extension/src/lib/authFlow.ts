import * as oauth from 'oauth4webapi';
import { authorizationServer, buildAuthorizationUrl, oauthClient } from '@/config/oauth';
import { AUTH_STORAGE_KEY } from '@/constants';
import { commitAuth } from '@/lib/authStorage';
import type { AuthUser } from '@/types';

/** Resolve only after the browser callback and token exchange have both completed. */
export async function requestSignIn(): Promise<AuthUser> {
  const redirectUri = chrome.identity.getRedirectURL();
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const challenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
  const state = oauth.generateRandomState();
  const url = buildAuthorizationUrl(challenge, state);
  const responseUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: url.href, interactive: true }, (responseUrl) => {
      if (chrome.runtime.lastError || !responseUrl) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'Sign in cancelled'));
      } else {
        resolve(responseUrl);
      }
    });
  });
  const params = oauth.validateAuthResponse(
    authorizationServer,
    oauthClient,
    new URL(responseUrl),
    state,
  );
  const response = await oauth.authorizationCodeGrantRequest(
    authorizationServer,
    oauthClient,
    oauth.None(),
    params,
    redirectUri,
    codeVerifier,
  );
  const result = await oauth.processAuthorizationCodeResponse(
    authorizationServer,
    oauthClient,
    response,
  );
  const claims = oauth.getValidatedIdTokenClaims(result);
  if (!claims || !result.id_token) {
    throw new Error('Missing ID token claims');
  }
  return {
    sub: claims.sub,
    ...(typeof claims['email'] === 'string' ? { email: claims['email'] } : {}),
    access_token: result.access_token,
    id_token: result.id_token,
    ...(result.refresh_token ? { refresh_token: result.refresh_token } : {}),
    expires_at: Date.now() + (result.expires_in ?? 3600) * 1000,
  };
}

/** Serialize refresh-token rotation across panels, and reject stale commits after sign-out. */
export async function refreshStoredSession(
  user: AuthUser,
  signal: AbortSignal,
): Promise<AuthUser | null> {
  return navigator.locks.request('ordercue-token-refresh', { signal }, async () => {
    const stored = await chrome.storage.local.get<{ auth_user?: AuthUser }>(AUTH_STORAGE_KEY);
    if (stored.auth_user?.access_token !== user.access_token || !user.refresh_token) {
      return null;
    }
    const response = await oauth.refreshTokenGrantRequest(
      authorizationServer,
      oauthClient,
      oauth.None(),
      user.refresh_token,
      { signal },
    );
    const result = await oauth.processRefreshTokenResponse(
      authorizationServer,
      oauthClient,
      response,
    );
    signal.throwIfAborted();
    const nextUser: AuthUser = {
      ...user,
      access_token: result.access_token,
      id_token: result.id_token ?? user.id_token,
      refresh_token: result.refresh_token ?? user.refresh_token,
      expires_at: Date.now() + (result.expires_in ?? 3600) * 1000,
    };
    return (await commitAuth(nextUser, { accessToken: user.access_token })) ? nextUser : null;
  });
}
