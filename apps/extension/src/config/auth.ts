import {
  type INavigator,
  type IWindow,
  type NavigateParams,
  type NavigateResponse,
  UserManager,
  type UserManagerSettings,
  WebStorageStateStore,
} from 'oidc-client-ts';
import type { AuthProviderProps } from 'react-oidc-context';

// Only 2 required env vars for auth
const authority = import.meta.env.VITE_COGNITO_AUTHORITY ?? '';
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID ?? '';

// Derive Cognito domain from authority (e.g., us-west-1_ABC123 -> us-west-1abc123.auth.us-west-1.amazoncognito.com)
function deriveCognitoDomain(authority: string): string {
  const match = authority.match(/cognito-idp\.([^.]+)\.amazonaws\.com\/([^/]+)/);
  if (!match) return '';
  const [, region, poolId] = match;
  const domainPrefix = poolId.toLowerCase().replace('_', '');
  return `https://${domainPrefix}.auth.${region}.amazoncognito.com`;
}

const cognitoDomain = deriveCognitoDomain(authority);

const isChromeExtension =
  typeof chrome !== 'undefined' &&
  !!chrome.identity?.getRedirectURL &&
  !!chrome.identity.launchWebAuthFlow;

// Derive redirect URI from current origin or Chrome extension
const extensionRedirectUri = isChromeExtension
  ? chrome.identity.getRedirectURL('oidc-callback')
  : null;
const effectiveRedirectUri = extensionRedirectUri ?? window.location.origin;

const baseAuthSettings: UserManagerSettings = {
  authority,
  client_id: clientId,
  redirect_uri: effectiveRedirectUri,
  response_type: 'code',
  scope: 'openid email',
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  automaticSilentRenew: true,
  silent_redirect_uri: effectiveRedirectUri,
};

class ChromeExtensionRedirectWindow implements IWindow {
  async navigate(params: NavigateParams): Promise<NavigateResponse> {
    const responseUrl = await new Promise<string>((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: params.url, interactive: true }, (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!redirectUrl) {
          reject(new Error('Authentication failed: empty redirect URL'));
          return;
        }
        resolve(redirectUrl);
      });
    });

    return { url: responseUrl };
  }

  close(): void {
    // chrome.identity handles window lifecycle; nothing to close manually.
  }
}

class ChromeExtensionRedirectNavigator implements INavigator {
  async prepare(_params?: unknown): Promise<IWindow> {
    return new ChromeExtensionRedirectWindow();
  }

  async callback(_url: string): Promise<void> {
    // launchWebAuthFlow resolves with the final redirect URL, so no callback work is required.
  }
}

const extensionUserManager =
  isChromeExtension && extensionRedirectUri
    ? new UserManager(
        {
          ...baseAuthSettings,
          redirect_uri: extensionRedirectUri,
        },
        new ChromeExtensionRedirectNavigator(),
      )
    : null;

export const cognitoAuthProviderProps: AuthProviderProps =
  extensionUserManager !== null
    ? {
        ...baseAuthSettings,
        userManager: extensionUserManager,
      }
    : baseAuthSettings;

export const cognitoLogoutConfig = {
  domain: cognitoDomain,
  clientId,
  logoutUri: effectiveRedirectUri,
};

export function buildCognitoLogoutUrl(): string | null {
  const { domain, clientId, logoutUri: target } = cognitoLogoutConfig;
  if (!domain || !clientId || !target) {
    return null;
  }
  const url = new URL(`${domain}/logout`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('logout_uri', target);
  return url.toString();
}
