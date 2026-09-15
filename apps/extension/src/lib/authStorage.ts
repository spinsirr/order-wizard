import { AUTH_STORAGE_KEY, CURRENT_USER_STORAGE_KEY } from '@/constants';
import type { AuthUser } from '@/types';

export const LAST_ORDER_USER_KEY = 'last_order_user';
const AUTH_REVISION_KEY = 'auth_revision';
async function locked<T>(action: () => Promise<T>): Promise<T> {
  return await navigator.locks.request('ordercue-auth-storage', action);
}

export function beginSignIn(): Promise<string> {
  return locked(async () => {
    const revision = crypto.randomUUID();
    await chrome.storage.local.set({ [AUTH_REVISION_KEY]: revision });
    return revision;
  });
}

export function commitAuth(
  user: AuthUser,
  expected: { revision?: string; accessToken?: string },
): Promise<boolean> {
  return locked(async () => {
    const current = await chrome.storage.local.get<{
      auth_user?: AuthUser;
      auth_revision?: string;
    }>([AUTH_STORAGE_KEY, AUTH_REVISION_KEY]);
    if (expected.revision !== undefined && current[AUTH_REVISION_KEY] !== expected.revision) {
      return false;
    }
    if (
      expected.accessToken !== undefined &&
      current[AUTH_STORAGE_KEY]?.access_token !== expected.accessToken
    ) {
      return false;
    }
    await chrome.storage.local.set({
      [AUTH_STORAGE_KEY]: user,
      [CURRENT_USER_STORAGE_KEY]: { id: user.sub, email: user.email },
      [LAST_ORDER_USER_KEY]: user.sub,
    });
    return true;
  });
}

export function clearAuthStorage(expectedAccessToken?: string): Promise<boolean> {
  return locked(async () => {
    if (expectedAccessToken !== undefined) {
      const current = await chrome.storage.local.get<{ auth_user?: AuthUser }>(AUTH_STORAGE_KEY);
      if (current[AUTH_STORAGE_KEY]?.access_token !== expectedAccessToken) {
        return false;
      }
    }
    await chrome.storage.local.set({ [AUTH_REVISION_KEY]: crypto.randomUUID() });
    await chrome.storage.local.remove([AUTH_STORAGE_KEY, CURRENT_USER_STORAGE_KEY]);
    return true;
  });
}
