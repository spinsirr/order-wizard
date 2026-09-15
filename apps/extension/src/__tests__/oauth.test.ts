import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAuthorizationUrl, createAuthorizationUrl, revokeRefreshToken } from '../config/oauth';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Cognito authorization URL', () => {
  it('uses the bundled production public-client configuration without a local .env file', () => {
    vi.stubGlobal('chrome', {
      identity: {
        getRedirectURL: vi.fn(() => 'https://kfohphllanmaojigofaoedibjbcdlhmj.chromiumapp.org/'),
      },
    });

    const url = buildAuthorizationUrl('challenge', 'state-123');

    expect(url.origin).toBe('https://us-west-1omca6h5mu.auth.us-west-1.amazoncognito.com');
    expect(url.searchParams.get('client_id')).toBe('2g61sgjultqdm7n9j2lusopfpd');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://kfohphllanmaojigofaoedibjbcdlhmj.chromiumapp.org/',
    );
  });

  it('binds the access token to the API and requests exact extension scopes', () => {
    const url = createAuthorizationUrl({
      authorizationEndpoint: 'https://auth.example.com/oauth2/authorize',
      clientId: 'extension-client',
      redirectUri: 'https://extension.example/callback',
      resourceUri: 'https://api.ordercue.example',
      codeChallenge: 'challenge',
      state: 'state-123',
    });

    expect(url.searchParams.get('resource')).toBe('https://api.ordercue.example');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('scope')).toBe(
      'openid email https://api.ordercue.example/orders.read ' +
        'https://api.ordercue.example/orders.sync ' +
        'https://api.ordercue.example/orders.status.write ' +
        'https://api.ordercue.example/orders.note.write',
    );
  });

  it('revokes the refresh token as a public client', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await revokeRefreshToken(
      'refresh-token',
      {
        issuer: 'https://issuer.example',
        revocation_endpoint: 'https://auth.example.com/oauth2/revoke',
      },
      { client_id: 'extension-client', token_endpoint_auth_method: 'none' },
    );

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.body).toBeInstanceOf(URLSearchParams);
    const body = new URLSearchParams(String(request?.body));
    expect(body.get('token')).toBe('refresh-token');
    expect(body.get('client_id')).toBe('extension-client');
  });
});
