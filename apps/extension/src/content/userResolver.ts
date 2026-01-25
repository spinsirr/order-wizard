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
    return new Promise((resolve) => {
      chrome.storage.local.get([CURRENT_USER_STORAGE_KEY], (result) => {
        if (chrome.runtime?.lastError) {
          console.error(
            'Failed to read current user from chrome.storage:',
            chrome.runtime.lastError,
          );
          resolve(null);
          return;
        }
        resolve((result[CURRENT_USER_STORAGE_KEY] as StoredUser | undefined) ?? null);
      });
    });
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

    if (CURRENT_USER_STORAGE_KEY in changes) {
      const change = changes[CURRENT_USER_STORAGE_KEY];
      cachedUser = (change?.newValue as StoredUser | undefined) ?? null;
    }
  });
}

// Initialize cache on load
void getCurrentUser();
