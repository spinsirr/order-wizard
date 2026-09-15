// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { fakeBrowser } from '@webext-core/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { refreshStoredSession } from '@/lib/authFlow';
import { beginSignIn, clearAuthStorage, commitAuth } from '@/lib/authStorage';
import { installBrowser, makeSession } from './browser';

const oauthMock = vi.hoisted(() => ({
  refresh: vi.fn<() => Promise<Response>>(),
  process: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock('@/config/oauth', () => ({
  authorizationServer: {},
  oauthClient: {},
  revokeRefreshToken: oauthMock.revoke,
  buildLogoutUrl: () => 'https://example.com/logout',
}));
vi.mock('oauth4webapi', async (original) => ({
  ...(await original<typeof import('oauth4webapi')>()),
  refreshTokenGrantRequest: oauthMock.refresh,
  processRefreshTokenResponse: oauthMock.process,
}));

let auth: ReturnType<typeof useAuth>;
function Harness() {
  auth = useAuth();
  return null;
}
async function renderAuth() {
  await act(async () => {
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );
  });
}
beforeEach(async () => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  const browser = installBrowser();
  vi.spyOn(browser.identity, 'launchWebAuthFlow').mockResolvedValue('https://example.com/logout');
  await chrome.storage.local.set({
    auth_user: makeSession({ expires_at: Date.now() + 301_000 }),
    last_order_user: 'account-a',
  });
  oauthMock.process.mockResolvedValue({
    access_token: 'new-access',
    refresh_token: 'rotated',
    expires_in: 3600,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('session ownership', () => {
  it('completes initialization when another panel commits a session before the initial read', async () => {
    const initialRead = Promise.withResolvers<Record<string, unknown>>();
    vi.spyOn(fakeBrowser.storage.local, 'get').mockReturnValueOnce(initialRead.promise);
    await renderAuth();
    await act(async () => {
      await chrome.storage.local.set({
        auth_user: makeSession({ sub: 'account-b', access_token: 'access-b' }),
        last_order_user: 'account-b',
      });
    });
    await act(async () => {
      initialRead.resolve({});
    });
    expect(auth.user?.sub).toBe('account-b');
    expect(auth.workspaceUserId).toBe('account-b');
    expect(auth.isLoading).toBe(false);
  });
  it('does not restore credentials when refresh finishes after sign-out', async () => {
    const response = Promise.withResolvers<Response>();
    oauthMock.refresh.mockReturnValueOnce(response.promise);
    await renderAuth();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(oauthMock.refresh).toHaveBeenCalledOnce();
    await act(async () => {
      await auth.signOut();
    });
    await act(async () => {
      response.resolve(new Response());
    });
    expect((await chrome.storage.local.get('auth_user'))['auth_user']).toBeUndefined();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.workspaceUserId).toBe('account-a');
  });

  it('preserves credentials and retries after a temporary network failure', async () => {
    oauthMock.refresh
      .mockRejectedValueOnce(new TypeError('Offline'))
      .mockResolvedValue(new Response());
    await renderAuth();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(auth.error?.message).toBe('Offline');
    expect((await chrome.storage.local.get('auth_user'))['auth_user']).toBeDefined();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(oauthMock.refresh).toHaveBeenCalledTimes(2);
    expect(auth.user?.access_token).toBe('new-access');
  });

  it('rotates a shared refresh token only once across concurrent callers', async () => {
    oauthMock.refresh.mockResolvedValue(new Response());
    const session = makeSession();
    await chrome.storage.local.set({ auth_user: session });
    const results = await Promise.all([
      refreshStoredSession(session, new AbortController().signal),
      refreshStoredSession(session, new AbortController().signal),
    ]);
    expect(oauthMock.refresh).toHaveBeenCalledOnce();
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('rejects a login completed after sign-out or after a newer login attempt', async () => {
    const first = await beginSignIn();
    const second = await beginSignIn();
    expect(await commitAuth(makeSession(), { revision: first })).toBe(false);
    await clearAuthStorage();
    expect(await commitAuth(makeSession(), { revision: second })).toBe(false);
  });
});
