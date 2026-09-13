// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../contexts/AuthContext';

vi.mock('@/config', () => ({ apiRepository: null }));

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

function SignInHarness() {
  const { error, isLoading, signIn } = useAuth();

  if (isLoading) {
    return <span>Loading</span>;
  }

  return (
    <>
      <button type="button" onClick={signIn}>
        Sign in
      </button>
      {error ? <div role="alert">{error.message}</div> : null}
    </>
  );
}

describe('AuthProvider sign in', () => {
  const launchWebAuthFlow = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
          remove: vi.fn(async () => undefined),
        },
      },
      identity: {
        getRedirectURL: vi.fn(() => 'https://extension.example/callback'),
        launchWebAuthFlow,
      },
      runtime: { lastError: undefined },
    });
  });

  afterEach(() => {
    cleanup();
    launchWebAuthFlow.mockReset();
    vi.unstubAllGlobals();
  });

  it('surfaces OAuth startup failures instead of silently rejecting the click', async () => {
    render(
      <AuthProvider>
        <SignInHarness />
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect((await screen.findByRole('alert')).textContent).toContain('OAuth is not configured');
    expect(launchWebAuthFlow).not.toHaveBeenCalled();
  });
});
