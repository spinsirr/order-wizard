import { CURRENT_USER_STORAGE_KEY } from '@/constants';

export interface StoredUser {
  id: string;
  email?: string;
  name?: string;
}

const DEFAULT_USER: StoredUser = {
  id: 'local',
};

let cachedUser: StoredUser | null = null;

async function readCurrentUserFromStorage(): Promise<StoredUser | null> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const result = await chrome.storage.local.get<{
      currentUser?: StoredUser;
      last_order_user?: string;
    }>([CURRENT_USER_STORAGE_KEY, 'last_order_user']);
    return result.currentUser ?? (result.last_order_user ? { id: result.last_order_user } : null);
  }

  const raw = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as StoredUser) : null;
}

export async function getCurrentUser(): Promise<StoredUser> {
  if (cachedUser) {
    return cachedUser;
  }

  const storedUser = await readCurrentUserFromStorage();
  cachedUser = storedUser ?? DEFAULT_USER;
  return cachedUser;
}

// Listen for user changes and invalidate cache
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    if (CURRENT_USER_STORAGE_KEY in changes || 'last_order_user' in changes) {
      cachedUser = null;
    }
  });
}

// Initialize cache on load
void getCurrentUser();
