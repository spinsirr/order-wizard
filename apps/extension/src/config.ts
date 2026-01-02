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
import type { Order } from './types';

// ============================================================================
// Environment Variables
// ============================================================================

const authority = import.meta.env.VITE_COGNITO_AUTHORITY ?? '';
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID ?? '';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

// ============================================================================
// Auth Configuration
// ============================================================================

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

  close(): void {}
}

class ChromeExtensionRedirectNavigator implements INavigator {
  async prepare(_params?: unknown): Promise<IWindow> {
    return new ChromeExtensionRedirectWindow();
  }

  async callback(_url: string): Promise<void> {}
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

// ============================================================================
// Repository Classes
// ============================================================================

export class LocalStorageRepository {
  private readonly STORAGE_KEY = 'orders';
  private currentUserId: string | null = null;

  setCurrentUserId(userId: string | null): void {
    this.currentUserId = userId;
  }

  private async getAllOrders(): Promise<Order[]> {
    const result = await chrome.storage.local.get(this.STORAGE_KEY);
    return (result[this.STORAGE_KEY] as Order[]) || [];
  }

  private async saveAllOrders(orders: Order[]): Promise<void> {
    await chrome.storage.local.set({ [this.STORAGE_KEY]: orders });
  }

  async save(order: Order): Promise<void> {
    const orders = await this.getAllOrders();
    orders.push(order);
    await this.saveAllOrders(orders);
  }

  async getAll(): Promise<Order[]> {
    const orders = await this.getAllOrders();
    if (!this.currentUserId) {
      return orders;
    }
    return orders.filter((order) => order.userId === this.currentUserId);
  }

  async update(id: string, updates: Partial<Order>): Promise<void> {
    const orders = await this.getAllOrders();
    const index = orders.findIndex((order) => order.id === id);

    if (index === -1) {
      throw new Error(`Order with id ${id} not found`);
    }

    orders[index] = { ...orders[index], ...updates };
    await this.saveAllOrders(orders);
  }

  async delete(id: string): Promise<void> {
    const orders = await this.getAllOrders();
    const filtered = orders.filter((order) => order.id !== id);
    await this.saveAllOrders(filtered);
  }

  async getById(id: string): Promise<Order | null> {
    const orders = await this.getAllOrders();
    return orders.find((order) => order.id === id) || null;
  }
}

export class ApiRepository {
  private readonly baseUrl: string;
  private accessToken: string | null = null;
  private tokenType: string = 'Bearer';

  constructor(baseUrl: string = 'https://api.example.com') {
    this.baseUrl = baseUrl;
  }

  setAccessToken(token: string | null, tokenType?: string): void {
    this.accessToken = token;
    this.tokenType = tokenType || 'Bearer';
  }

  private buildHeaders(additional: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...additional };

    if (this.accessToken) {
      headers.Authorization = `${this.tokenType} ${this.accessToken}`;
    }

    return headers;
  }

  async save(order: Order): Promise<void> {
    const headers = this.buildHeaders({ 'Content-Type': 'application/json' });

    const response = await fetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify(order),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to save order: ${response.statusText}`);
    }
  }

  async getAll(): Promise<Order[]> {
    const headers = this.buildHeaders();
    const response = await fetch(`${this.baseUrl}/orders`, {
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch orders: ${response.statusText}`);
    }

    return response.json();
  }

  async update(id: string, updates: Partial<Order>): Promise<void> {
    const headers = this.buildHeaders({ 'Content-Type': 'application/json' });

    const response = await fetch(`${this.baseUrl}/orders/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to update order: ${response.statusText}`);
    }
  }

  async delete(id: string): Promise<void> {
    const headers = this.buildHeaders();
    const response = await fetch(`${this.baseUrl}/orders/${id}`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete order: ${response.statusText}`);
    }
  }

  async getById(id: string): Promise<Order | null> {
    const headers = this.buildHeaders();
    const response = await fetch(`${this.baseUrl}/orders/${id}`, {
      headers,
      credentials: 'include',
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch order: ${response.statusText}`);
    }

    return response.json();
  }
}

// ============================================================================
// Repository Instance
// ============================================================================

export const orderRepository = apiBaseUrl
  ? new ApiRepository(apiBaseUrl)
  : new LocalStorageRepository();
