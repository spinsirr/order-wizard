// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { fakeBrowser } from '@webext-core/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { installBrowser } from './browser';

vi.mock('@/config/oauth', () => ({
  authorizationServer: { issuer: 'https://issuer.example' },
  oauthClient: { client_id: 'extension-client', token_endpoint_auth_method: 'none' },
  buildAuthorizationUrl: vi.fn(() => {
    throw new Error('OAuth is not configured');
  }),
  buildLogoutUrl: vi.fn(() => 'https://auth.example/logout'),
  revokeRefreshToken: vi.fn(),
}));

vi.mock('oauth4webapi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('oauth4webapi')>();
  return {
    ...actual,
    generateRandomCodeVerifier: vi.fn(() => 'verifier'),
    calculatePKCECodeChallenge: vi.fn(async () => 'challenge'),
    generateRandomState: vi.fn(() => 'state'),
  };
});

describe('AuthProvider sign in', () => {
  const launchWebAuthFlow = vi.fn();

  beforeEach(() => {
    const browser = installBrowser();
    vi.spyOn(browser.identity, 'getRedirectURL').mockReturnValue(
      'https://extension.example/callback',
    );
    vi.spyOn(browser.identity, 'launchWebAuthFlow').mockImplementation(launchWebAuthFlow);
  });

  afterEach(() => {
    cleanup();
    launchWebAuthFlow.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('records OAuth startup failures without starting authentication or saving credentials', async () => {
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.signIn();
    });
    expect(result.current.error?.message).toBe('OAuth is not configured');
    expect(result.current.isAuthenticated).toBe(false);
    expect((await chrome.storage.local.get('auth_user'))['auth_user']).toBeUndefined();
    expect(launchWebAuthFlow).not.toHaveBeenCalled();
  });
  it('finishes initialization after a sign-in failure during the initial storage read', async () => {
    const initialRead = Promise.withResolvers<Record<string, unknown>>();
    vi.spyOn(fakeBrowser.storage.local, 'get').mockReturnValueOnce(initialRead.promise);
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await act(async () => {
      await result.current.signIn();
    });
    await act(async () => {
      initialRead.resolve({});
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error?.message).toBe('OAuth is not configured');
  });
});
